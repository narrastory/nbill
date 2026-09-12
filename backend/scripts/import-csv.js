/**
 * import-csv.js — Import old CSV data into the new encrypted storage format.
 *
 * Usage:
 *   node scripts/import-csv.js <password>
 *
 * Reads CSV files from 表结构示例(测试)/ and converts them
 * to the new file format (encrypted .enc or plain .json).
 *
 * Date format conversion: YYYY/M/D → YYYY-MM-DD
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { Writable } from 'stream';
import {
  assertImportSourceFiles,
  installImportedData,
  parseStrictInteger,
  parseStrictPositiveNumber,
} from '../src/maintenance/import.js';

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
const tablesDir = join(projectRoot, '表结构示例(测试)');

function askHidden(prompt) {
  process.stdout.write(prompt);
  const sink = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const rl = readline.createInterface({ input: process.stdin, output: sink, terminal: true });
  return new Promise((resolveAnswer) => {
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolveAnswer(answer);
    });
  });
}

let password = process.argv[2];
if (password) {
  console.warn('WARNING: A command-line password may be visible in shell history. Omit it for hidden input.');
} else {
  password = await askHidden('Import password: ');
}
if (!password || password.length < 4) throw new Error('Password must be at least 4 characters');

// Ensure data directory exists
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// ─── CSV Parser ───
function parseCSV(content) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const record = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] !== undefined ? values[idx] : '';
    });
    records.push(record);
  }

  return records;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

// ─── Date Format Converter ───
function convertDate(dateStr) {
  if (!dateStr) return '';
  // Convert YYYY/M/D or YYYY/MM/DD to YYYY-MM-DD
  const match = dateStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (match) {
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

// ─── Import Functions ───

function importTransactions() {
  const filePath = join(tablesDir, 'Transactions.csv');
  if (!existsSync(filePath)) {
    console.log('  Transactions.csv not found, skipping');
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const records = parseCSV(content);

  const converted = records.map((r) => ({
    ID: parseStrictInteger(r.ID, 'Transactions.ID'),
    Type: r.Type || '',
    BillDate: convertDate(r.BillDate),
    Category: r.Category || '',
    Subcategory: r.Subcategory || '',
    Description: r.Description || '',
    Tag: r.Tag || '',
    Amount: parseStrictPositiveNumber(r.Amount, 'Transactions.Amount'),
    Notes: r.Notes || '',
  }));

  console.log(`  Transactions: ${converted.length} records imported`);
  return converted;
}

function importBillCategories() {
  const filePath = join(tablesDir, 'BillCategories.csv');
  if (!existsSync(filePath)) {
    console.log('  BillCategories.csv not found, skipping');
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const records = parseCSV(content);

  const converted = records.map((r) => ({
    Type: r.Type || '',
    Category: r.Category || '',
    Subcategory: r.Subcategory || '',
    Description: r.Description || '',
  }));

  console.log(`  BillCategories: ${converted.length} records imported`);
  return converted;
}

function importBillTags() {
  const filePath = join(tablesDir, 'BillTags.csv');
  if (!existsSync(filePath)) {
    console.log('  BillTags.csv not found, skipping');
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const records = parseCSV(content);

  const converted = records.map((r) => ({
    Tag: r.Tag || '',
    Description: r.Description || '',
    AppliesTo: r.AppliesTo || 'Both',
  }));

  console.log(`  BillTags: ${converted.length} records imported`);
  return converted;
}

function importExternalTransactions() {
  const filePath = join(tablesDir, 'ExternalTransactions.csv');
  if (!existsSync(filePath)) {
    console.log('  ExternalTransactions.csv not found, skipping');
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const records = parseCSV(content);

  const converted = records.map((r) => ({
    ID: parseStrictInteger(r.ID, 'ExternalTransactions.ID'),
    RelatedID: r.RelatedID || '',
    Type: r.Type || '',
    FlowDate: convertDate(r.FlowDate),
    Description: r.Description || '',
    FlowType: r.FlowType || r.FlowType || '',
    RelatedParty: r.RelatedParty || '',
    Amount: parseStrictPositiveNumber(r.Amount, 'ExternalTransactions.Amount'),
  }));

  console.log(`  ExternalTransactions: ${converted.length} records imported`);
  return converted;
}

function importExFlowType() {
  const filePath = join(tablesDir, 'ExFlowType.csv');
  if (!existsSync(filePath)) {
    console.log('  ExFlowType.csv not found, skipping');
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const records = parseCSV(content);

  const converted = records.map((r) => ({
    Flowtype: r.Flowtype || r.FlowType || '',
  })).filter((r) => r.Flowtype);

  console.log(`  ExFlowType: ${converted.length} records imported`);
  return converted;
}

function importExRelatedParty() {
  const filePath = join(tablesDir, 'ExRelatedParty.csv');
  if (!existsSync(filePath)) {
    console.log('  ExRelatedParty.csv not found, skipping');
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const records = parseCSV(content);

  const converted = records.map((r) => ({
    Relatedparty: r.Relatedparty || r.RelatedParty || '',
  })).filter((r) => r.Relatedparty);

  console.log(`  ExRelatedParty: ${converted.length} records imported`);
  return converted;
}

// ─── Main ───

console.log('=== NBill CSV Data Import ===\n');
console.log(`Source: ${tablesDir}`);
console.log(`Target: ${dataDir}\n`);

await assertImportSourceFiles(tablesDir);

// Import all tables
console.log('Reading CSV files...');
const transactions = importTransactions();
const billCategories = importBillCategories();
const billTags = importBillTags();
const externalTransactions = importExternalTransactions();
const exFlowType = importExFlowType();
const exRelatedParty = importExRelatedParty();

console.log('\nValidating and staging data files...');
const result = await installImportedData({
  dataDir,
  backupsDir: resolve(projectRoot, config.storage.backupsDir),
  maxBackups: config.storage.maxBackups,
  cryptoConfig: config.crypto,
  password,
  tables: {
    transactions,
    billCategories,
    billTags,
    externalTransactions,
    exFlowType,
    exRelatedParty,
  },
});

console.log(`  transactions.enc: ${transactions.length} records (encrypted)`);
console.log(`  external_transactions.enc: ${externalTransactions.length} records (encrypted)`);
console.log(`  ex_related_parties.enc: ${exRelatedParty.length} records (encrypted)`);
console.log(`  bill_categories.json: ${billCategories.length} records`);
console.log(`  bill_tags.json: ${billTags.length} records`);
console.log(`  ex_flow_types.json: ${exFlowType.length} records`);
if (result.backupDir) console.log(`  Safety backup: ${result.backupDir}`);

console.log('\n=== Import Complete! ===');
console.log(`\nYou can now start the server with: npm start`);
console.log(`Login with username "${config.user.username}" and the password you provided.`);
