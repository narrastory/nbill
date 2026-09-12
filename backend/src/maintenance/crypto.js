import crypto from 'crypto';
import { encrypt, decrypt } from '../crypto/index.js';

export function deriveKeyWithConfig(password, salt, cryptoConfig) {
  const { iterations, keyLength, digest } = cryptoConfig.pbkdf2;
  return crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest);
}

export function encryptJson(data, key) {
  return encrypt(JSON.stringify(data, null, 2), key);
}

export function decryptJson(buffer, key) {
  const data = JSON.parse(decrypt(buffer, key));
  if (!Array.isArray(data)) throw new Error('Encrypted table root must be an array');
  return data;
}

export default { deriveKeyWithConfig, encryptJson, decryptJson };
