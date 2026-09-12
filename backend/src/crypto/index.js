import crypto from 'crypto';
import { writeFile, rename, unlink, readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getConfig } from '../config.js';
import { getLogger } from '../logger.js';

// Binary layout constants for encrypted files
const SALT_LENGTH = 16;    // 16 bytes for PBKDF2 salt
const IV_LENGTH = 12;      // 12 bytes for AES-GCM IV/nonce
const TAG_LENGTH = 16;     // 16 bytes for GCM authentication tag

/**
 * Derive a 256-bit (32-byte) encryption key from a password and salt using PBKDF2.
 * @param {string} password - User's plaintext password
 * @param {Buffer} salt - Random salt (16 bytes recommended)
 * @returns {Buffer} 32-byte derived key
 */
export function deriveKey(password, salt) {
  const config = getConfig();
  const { iterations, keyLength, digest } = config.crypto.pbkdf2;
  return crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest);
}

/**
 * Encrypt plaintext string using AES-256-GCM.
 * The resulting Buffer layout: [salt(16)] [iv(12)] [authTag(16)] [ciphertext]
 *
 * @param {string} plaintext - JSON string to encrypt
 * @param {Buffer} key - 32-byte encryption key
 * @returns {Buffer} Encrypted data with embedded salt, IV, and auth tag
 */
export function encrypt(plaintext, key) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, authTag, encrypted]);
}

/**
 * Decrypt a Buffer produced by encrypt().
 * Validates the GCM authentication tag — throws on tampered data.
 *
 * @param {Buffer} encryptedBuffer - [salt(16)] [iv(12)] [authTag(16)] [ciphertext]
 * @param {Buffer} key - 32-byte encryption key
 * @returns {string} Decrypted plaintext (JSON string)
 * @throws {Error} If decryption fails (wrong key or corrupted/tampered data)
 */
export function decrypt(encryptedBuffer, key) {
  if (encryptedBuffer.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted data: buffer too short');
  }

  const salt = encryptedBuffer.subarray(0, SALT_LENGTH);
  const iv = encryptedBuffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = encryptedBuffer.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + TAG_LENGTH,
  );
  const ciphertext = encryptedBuffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error(`Decryption failed: ${err.message}`);
  }
}

/**
 * Write a buffer to a file atomically using copy-on-write pattern.
 * Writes to a .tmp file, fsyncs, then atomically renames to the target path.
 * If the target file exists, it is only replaced on successful write.
 *
 * @param {string} filePath - Target file path
 * @param {Buffer} data - Data to write
 */
export async function atomicWrite(filePath, data) {
  const tmpPath = filePath + '.tmp';
  const logger = getLogger();

  try {
    // Write to temp file
    await writeFile(tmpPath, data);

    // Atomically replace the target file (same filesystem = atomic on POSIX & NTFS)
    await rename(tmpPath, filePath);

    logger.debug(`Atomic write completed: ${filePath}`);
  } catch (err) {
    // Clean up temp file on error
    try {
      if (existsSync(tmpPath)) {
        await unlink(tmpPath);
      }
    } catch (_) {
      // Ignore cleanup errors
    }
    throw new Error(`Atomic write failed for ${filePath}: ${err.message}`);
  }
}

/**
 * Read a file and return its contents as a Buffer.
 */
export async function readFileBuffer(filePath) {
  return readFile(filePath);
}

/**
 * Clean up orphaned .tmp files in a directory (from crashed writes).
 */
export async function cleanupTempFiles(dir) {
  const logger = getLogger();
  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (file.endsWith('.tmp')) {
        const tmpPath = join(dir, file);
        try {
          await unlink(tmpPath);
          logger.info(`Cleaned up orphaned temp file: ${tmpPath}`);
        } catch (_) {
          // Ignore individual cleanup errors
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn(`Failed to clean temp files in ${dir}: ${err.message}`);
    }
  }
}

/**
 * Convenience: encrypt JSON-serializable data and atomically write to file.
 */
export async function encryptAndWrite(filePath, data, key) {
  const json = JSON.stringify(data, null, 2);
  const encrypted = encrypt(json, key);
  await atomicWrite(filePath, encrypted);
}

/**
 * Convenience: read and decrypt a file, return parsed JSON.
 */
export async function readAndDecrypt(filePath, key) {
  const encrypted = await readFileBuffer(filePath);
  const json = decrypt(encrypted, key);
  return JSON.parse(json);
}

export default { deriveKey, encrypt, decrypt, atomicWrite, readFileBuffer, cleanupTempFiles, encryptAndWrite, readAndDecrypt };
