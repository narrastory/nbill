import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { replaceFileSet } from '../storage/fileSet.js';
import { deriveKeyWithConfig, encryptJson, decryptJson } from './crypto.js';
import { acquireMaintenanceLock } from '../storage/processLock.js';

const ENCRYPTED_FILES = [
  'transactions.enc',
  'external_transactions.enc',
  'ex_related_parties.enc',
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

export async function changePassword({
  dataDir,
  backupsDir,
  maxBackups = 30,
  cryptoConfig,
  oldPassword,
  newPassword,
  bcryptRounds = 12,
}) {
  const releaseLock = acquireMaintenanceLock(dataDir);
  try {
    return await changePasswordUnlocked({
      dataDir, backupsDir, maxBackups, cryptoConfig,
      oldPassword, newPassword, bcryptRounds,
    });
  } finally {
    releaseLock();
  }
}

async function changePasswordUnlocked({
  dataDir,
  backupsDir,
  maxBackups,
  cryptoConfig,
  oldPassword,
  newPassword,
  bcryptRounds,
}) {
  if (typeof newPassword !== 'string' || newPassword.length < 4) {
    throw new Error('Password must be at least 4 characters');
  }

  const hashPath = join(dataDir, 'password.hash');
  const saltPath = join(dataDir, 'master.salt');
  const hasPassword = await exists(hashPath);
  const decrypted = {};

  if (hasPassword) {
    const storedHash = (await readFile(hashPath, 'utf8')).trim();
    if (!oldPassword || !(await bcrypt.compare(oldPassword, storedHash))) {
      throw new Error('Old password is incorrect');
    }
    if (!(await exists(saltPath))) throw new Error('master.salt is missing');
    const oldSalt = await readFile(saltPath);
    const oldKey = deriveKeyWithConfig(oldPassword, oldSalt, cryptoConfig);

    for (const name of ENCRYPTED_FILES) {
      const path = join(dataDir, name);
      decrypted[name] = await exists(path) ? decryptJson(await readFile(path), oldKey) : [];
    }
  } else {
    for (const name of ENCRYPTED_FILES) {
      if (await exists(join(dataDir, name))) {
        throw new Error(`Cannot initialize password while encrypted file '${name}' already exists`);
      }
      decrypted[name] = [];
    }
  }

  const newSalt = crypto.randomBytes(16);
  const newKey = deriveKeyWithConfig(newPassword, newSalt, cryptoConfig);
  const newHash = await bcrypt.hash(newPassword, bcryptRounds);
  const files = {
    'master.salt': newSalt,
    'password.hash': newHash,
  };
  for (const name of ENCRYPTED_FILES) files[name] = encryptJson(decrypted[name], newKey);

  return replaceFileSet({
    dataDir,
    files,
    backupOptions: { backupsDir, maxBackups, reason: 'password-change' },
    verify: async (stageDir) => {
      const stagedSalt = await readFile(join(stageDir, 'master.salt'));
      const stagedKey = deriveKeyWithConfig(newPassword, stagedSalt, cryptoConfig);
      const stagedHash = await readFile(join(stageDir, 'password.hash'), 'utf8');
      if (!(await bcrypt.compare(newPassword, stagedHash))) throw new Error('Staged password hash verification failed');
      for (const name of ENCRYPTED_FILES) {
        const verified = decryptJson(await readFile(join(stageDir, name)), stagedKey);
        if (JSON.stringify(verified) !== JSON.stringify(decrypted[name])) {
          throw new Error(`Staged verification failed for '${name}'`);
        }
      }
    },
  });
}

export default { changePassword };
