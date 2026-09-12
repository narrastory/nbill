/**
 * export-csv.js — Decrypt data and export to CSV format.
 *
 * Usage:
 *   node scripts/export-csv.js <password> [output-dir]
 *
 * Reads encrypted data files, decrypts them using the provided password,
 * and writes the data as CSV files in the specified output directory.
 * Default output directory: ./exported_data
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// ─── Config ───
const configPath = join(projectRoot, 'config.json');
if (!existsSync(configPath)) {
  console.error('ERROR: config.json not found.');
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const dataDir = resolve(projectRoot, config.storage.dataDir);

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/export-csv.js <password> [output-dir]');
  process.exit(1);
}

const outputDir = resolve(process.argv[3] || join(projectRoot, 'exported_data'));

// ─── Crypto ───
const { iterations, keyLength, digest } = config.crypto.pbkdf2;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveKey(plaintext, salt) {
  return crypto.pbkdf2Sync(plaintext, salt, iterations, keyLength, digest);
}

function decrypt(buffer, key) {
  if (buffer.length < SALT_LEN + IV_LEN + TAG_LEN) {
    throw new Error('Buffer too short for decryption');
  }
  const iv = buffer.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const authTag = buffer.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ciphertext = buffer.subarray(SALT_LEN + IV_LEN + TAG_LEN);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

// ─── Derive key ───
const masterSaltPath = join(dataDir, 'master.salt');
if (!existsSync(masterSaltPath)) {
  console.error('ERROR: master.salt not found. Run set-password.js first.');
  process.exit(1);
}
const masterSalt = readFileSync(masterSaltPath);
const key = deriveKey(password, masterSalt);

// ─── CSV Writer ───
function toCSV(records) {
  if (records.length === 0) return '';

  const headers = Object.keys(records[0]);
  const lines = [headers.join(',')];

  for (const record of records) {
    const values = headers.map((h) => {
      const val = record[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Quote if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(','));
  }

  return lines.join('\n') + '\n';
}

// ─── Export Functions ───

function exportTable(name, isEncrypted) {
  const ext = isEncrypted ? '.enc' : '.json';
  const filePath = join(dataDir, name + ext);
  const csvPath = join(outputDir, name + '.csv');

  if (!existsSync(filePath)) {
    console.log(`  ${name}${ext}: file not found, skipping`);
    return;
  }

  let records;
  if (isEncrypted) {
    const encrypted = readFileSync(filePath);
    const json = decrypt(encrypted, key);
    records = JSON.parse(json);
  } else {
    const json = readFileSync(filePath, 'utf-8');
    records = JSON.parse(json);
  }

  if (!Array.isArray(records) || records.length === 0) {
    console.log(`  ${name}: empty, skipping`);
    return;
  }

  const csv = toCSV(records);
  writeFileSync(csvPath, csv, 'utf-8');
  console.log(`  ${name}.csv: ${records.length} records exported`);
}

// ─── Main ───
console.log('=== NBill Data Export ===\n');
console.log(`Source data directory: ${dataDir}`);
console.log(`Output directory: ${outputDir}\n`);

// Verify password by checking password.hash
import bcrypt from 'bcryptjs';
const hashPath = join(dataDir, 'password.hash');
if (existsSync(hashPath)) {
  const storedHash = readFileSync(hashPath, 'utf-8').trim();
  const valid = await bcrypt.compare(password, storedHash);
  if (!valid) {
    console.error('ERROR: Incorrect password.');
    process.exit(1);
  }
  console.log('Password verified.\n');
}

// Create output directory
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// Export all tables
console.log('Exporting data to CSV...\n');

exportTable('transactions', true);
exportTable('bill_categories', false);
exportTable('bill_tags', false);
exportTable('external_transactions', true);
exportTable('ex_flow_types', false);
exportTable('ex_related_parties', true);

console.log('\n=== Export Complete! ===');
console.log(`Files are in: ${outputDir}`);
