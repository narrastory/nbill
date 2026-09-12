import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getConfig } from '../config.js';
import { getLogger } from '../logger.js';
import { deriveKey } from '../crypto/index.js';
import {
  init as initStore,
  loadAll,
  getIsLoaded,
  getLastEditTime,
} from '../store/engine.js';

// ─── Brute Force Protection ──────────────────────────────────────

/** @type {Map<string, {failures: number, lastAttempt: number}>} */
const bruteForceMap = new Map();
let storeLoadPromise = null;

/**
 * Clean up stale brute force entries (older than 30 minutes).
 */
function cleanupBruteForceEntries() {
  const now = Date.now();
  const MAX_AGE = 30 * 60 * 1000; // 30 minutes
  for (const [ip, entry] of bruteForceMap.entries()) {
    if (now - entry.lastAttempt > MAX_AGE) {
      bruteForceMap.delete(ip);
    }
  }
}

/**
 * Check and enforce brute force protection for an IP address.
 * Returns a promise that resolves after any required delay.
 *
 * @param {string} ip - Client IP address
 * @returns {Promise<void>}
 */
async function checkBruteForce(ip) {
  const config = getConfig();
  const { maxAttempts, lockoutDelayMs } = config.auth.bruteForce;

  cleanupBruteForceEntries();

  const entry = bruteForceMap.get(ip);
  if (entry && entry.failures >= maxAttempts) {
    const logger = getLogger();
    logger.warn(`Brute force delay triggered for IP: ${ip} (${entry.failures} failures)`);
    await new Promise((resolve) => setTimeout(resolve, lockoutDelayMs));
  }
}

/**
 * Record a failed login attempt for an IP address.
 */
function recordFailedAttempt(ip) {
  const entry = bruteForceMap.get(ip);
  if (entry) {
    entry.failures += 1;
    entry.lastAttempt = Date.now();
  } else {
    bruteForceMap.set(ip, { failures: 1, lastAttempt: Date.now() });
  }
}

/**
 * Clear brute force entries for an IP (on successful login).
 */
function clearBruteForce(ip) {
  bruteForceMap.delete(ip);
}

/**
 * Reset all brute force entries. Used in testing.
 */
export function resetBruteForce() {
  bruteForceMap.clear();
}

// ─── Password Hash Management ────────────────────────────────────

/**
 * Get the path to the password hash file.
 */
function getPasswordHashPath() {
  const config = getConfig();
  return join(config.storage.dataDir, 'password.hash');
}

/**
 * Read the stored bcrypt password hash.
 * @returns {Promise<string|null>} The hash or null if not set
 */
export async function readPasswordHash() {
  const hashPath = getPasswordHashPath();
  if (!existsSync(hashPath)) {
    return null;
  }
  const hash = await readFile(hashPath, 'utf-8');
  return hash.trim();
}

/**
 * Write a bcrypt password hash to disk.
 */
export async function writePasswordHash(hash) {
  const hashPath = getPasswordHashPath();
  await writeFile(hashPath, hash, 'utf-8');
}

/**
 * Hash a password with bcrypt.
 * @param {string} password - Plaintext password
 * @returns {Promise<string>} bcrypt hash
 */
export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

/**
 * Verify a password against a bcrypt hash.
 */
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// ─── JWT Token Management ────────────────────────────────────────

/**
 * Generate a JWT token for the authenticated user.
 */
export function generateToken(username) {
  const config = getConfig();
  const payload = {
    username,
    iat: Math.floor(Date.now() / 1000),
  };
  return jwt.sign(payload, config.auth.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.auth.jwtExpiry,
  });
}

/**
 * Verify and decode a JWT token.
 * @returns {object|null} Decoded payload or null if invalid
 */
export function verifyToken(token) {
  const config = getConfig();
  try {
    return jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] });
  } catch (_) {
    return null;
  }
}

// ─── Login Flow ──────────────────────────────────────────────────

/**
 * Authenticate a user and load data into memory.
 *
 * Flow:
 * 1. Verify username
 * 2. Verify password against stored bcrypt hash
 * 3. Derive encryption key from password
 * 4. Load and decrypt all data files (validates key)
 * 5. Generate JWT
 * 6. Return token, lastEditTime, and initialBalance
 *
 * @param {string} username - Login username
 * @param {string} password - Login password
 * @param {string} ip - Client IP address for brute force tracking
 * @returns {Promise<{token: string, lastEditTime: string|null, initialBalance: number}>}
 * @throws {Error} With message on authentication failure
 */
export async function login(username, password, ip) {
  const config = getConfig();
  const logger = getLogger();

  // 1. Check brute force
  await checkBruteForce(ip);

  // 2. Verify username (constant-time-ish: always do the full password check)
  if (username !== config.user.username) {
    recordFailedAttempt(ip);
    logger.warn(`Login failed: invalid username '${username}' from IP ${ip}`);
    throw new Error('Invalid username or password');
  }

  // 3. Verify password
  const storedHash = await readPasswordHash();
  if (!storedHash) {
    recordFailedAttempt(ip);
    logger.warn(`Login failed: no password set (IP: ${ip})`);
    throw new Error('Invalid username or password');
  }

  const passwordValid = await verifyPassword(password, storedHash);
  if (!passwordValid) {
    recordFailedAttempt(ip);
    logger.warn(`Login failed: invalid password for user '${username}' from IP ${ip}`);
    throw new Error('Invalid username or password');
  }

  // Only one request may initialize the process-level store. Requests arriving
  // during that load await the same promise and cannot start a later reload.
  if (!getIsLoaded()) {
    if (!storeLoadPromise) {
      storeLoadPromise = (async () => {
        if (getIsLoaded()) return;
        const masterSaltPath = join(config.storage.dataDir, 'master.salt');
        let masterSalt;
        if (existsSync(masterSaltPath)) {
          masterSalt = await readFile(masterSaltPath);
        } else {
          masterSalt = crypto.randomBytes(16);
          await mkdir(config.storage.dataDir, { recursive: true });
          await writeFile(masterSaltPath, masterSalt);
        }

        const encryptionKey = deriveKey(password, masterSalt);
        try {
          initStore(encryptionKey);
          await loadAll();
        } catch (err) {
          if (err.message.includes('Failed to decrypt data file')) {
            logger.error(`Data decryption failed during login: ${err.message}`);
            throw new Error('Invalid username or password');
          }
          throw err;
        }
      })().finally(() => {
        storeLoadPromise = null;
      });
    }
    await storeLoadPromise;
  }

  // 6. Clear brute force on success
  clearBruteForce(ip);

  // 7. Generate JWT
  const token = generateToken(username);

  // 8. Return auth info
  const result = {
    token,
    lastEditTime: getLastEditTime(),
    initialBalance: config.business.initialBalance,
  };

  logger.info(`User '${username}' logged in successfully from IP ${ip}`);
  return result;
}

export default {
  login,
  verifyToken,
  generateToken,
  readPasswordHash,
  writePasswordHash,
  hashPassword,
  verifyPassword,
};
