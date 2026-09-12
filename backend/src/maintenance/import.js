import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { replaceFileSet } from '../storage/fileSet.js';
import { deriveKeyWithConfig, encryptJson, decryptJson } from './crypto.js';
import { acquireMaintenanceLock } from '../storage/processLock.js';
import { isValidDateString, parsePositiveAmount } from '../validation.js';

const TABLE_NAMES = [
  'transactions',
  'billCategories',
  'billTags',
  'externalTransactions',
  'exFlowType',
  'exRelatedParty',
];

export const CSV_FILE_NAMES = [
  'Transactions.csv',
  'BillCategories.csv',
  'BillTags.csv',
  'ExternalTransactions.csv',
  'ExFlowType.csv',
  'ExRelatedParty.csv',
];

export async function assertImportSourceFiles(tablesDir) {
  const missing = [];
  for (const name of CSV_FILE_NAMES) {
    try {
      const info = await stat(join(tablesDir, name));
      if (!info.isFile()) missing.push(name);
    } catch (err) {
      if (err.code === 'ENOENT') missing.push(name);
      else throw err;
    }
  }
  if (missing.length > 0) {
    throw new Error(`CSV import source is incomplete; missing: ${missing.join(', ')}`);
  }
}

export function parseStrictInteger(value, fieldName = 'ID') {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) throw new Error(`${fieldName} must be a positive integer`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${fieldName} must be a positive integer`);
  return number;
}

export function parseStrictPositiveNumber(value, fieldName = 'Amount') {
  const text = String(value ?? '').trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) throw new Error(`${fieldName} must be a positive number`);
  return parsePositiveAmount(Number(text), fieldName);
}

function requiredText(record, field, tableName, index) {
  if (typeof record?.[field] !== 'string' || record[field].trim() === '') {
    throw new Error(`${tableName}[${index}].${field} is required`);
  }
}

function validateIds(records, tableName) {
  const ids = new Set();
  records.forEach((record, index) => {
    const id = Number(record?.ID);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`${tableName}[${index}].ID must be a positive integer`);
    if (ids.has(id)) throw new Error(`${tableName} contains duplicate ID ${id}`);
    ids.add(id);
  });
}

export function validateImportedTables(tables) {
  for (const name of TABLE_NAMES) {
    if (!Array.isArray(tables?.[name])) throw new Error(`Missing imported table '${name}'`);
  }

  validateIds(tables.transactions, 'transactions');
  tables.transactions.forEach((record, index) => {
    if (!['Income', 'Expense'].includes(record.Type)) throw new Error(`transactions[${index}].Type is invalid`);
    if (!isValidDateString(record.BillDate)) throw new Error(`transactions[${index}].BillDate is invalid`);
    for (const field of ['Category', 'Subcategory', 'Description']) requiredText(record, field, 'transactions', index);
    parsePositiveAmount(record.Amount, `transactions[${index}].Amount`);
  });

  validateIds(tables.externalTransactions, 'externalTransactions');
  tables.externalTransactions.forEach((record, index) => {
    if (!['IN', 'OUT'].includes(record.Type)) throw new Error(`externalTransactions[${index}].Type is invalid`);
    if (!isValidDateString(record.FlowDate)) throw new Error(`externalTransactions[${index}].FlowDate is invalid`);
    for (const field of ['Description', 'FlowType', 'RelatedParty']) requiredText(record, field, 'externalTransactions', index);
    parsePositiveAmount(record.Amount, `externalTransactions[${index}].Amount`);
  });

  tables.billCategories.forEach((record, index) => {
    for (const field of ['Type', 'Category', 'Subcategory']) requiredText(record, field, 'billCategories', index);
  });
  tables.billTags.forEach((record, index) => requiredText(record, 'Tag', 'billTags', index));
  tables.exFlowType.forEach((record, index) => requiredText(record, 'Flowtype', 'exFlowType', index));
  tables.exRelatedParty.forEach((record, index) => requiredText(record, 'Relatedparty', 'exRelatedParty', index));

  const categories = new Set(tables.billCategories.map((record) => (
    `${record.Type}\0${record.Category}\0${record.Subcategory}`
  )));
  const tags = new Set(tables.billTags.map((record) => record.Tag));
  const flowTypes = new Set(tables.exFlowType.map((record) => record.Flowtype));
  const relatedParties = new Set(tables.exRelatedParty.map((record) => record.Relatedparty));
  const externalIds = new Set(tables.externalTransactions.map((record) => Number(record.ID)));

  tables.transactions.forEach((record, index) => {
    const categoryKey = `${record.Type}\0${record.Category}\0${record.Subcategory}`;
    if (!categories.has(categoryKey)) throw new Error(`transactions[${index}] has an invalid category reference`);
    const recordTags = String(record.Tag || '').split(',').map((tag) => tag.trim()).filter(Boolean);
    if (recordTags.some((tag) => !tags.has(tag))) throw new Error(`transactions[${index}] has an invalid tag reference`);
  });
  tables.externalTransactions.forEach((record, index) => {
    if (!flowTypes.has(record.FlowType)) throw new Error(`externalTransactions[${index}] has an invalid flow type reference`);
    if (!relatedParties.has(record.RelatedParty)) throw new Error(`externalTransactions[${index}] has an invalid related party reference`);
    const relatedIds = String(record.RelatedID || '').split(',').map((id) => id.trim()).filter(Boolean);
    for (const relatedId of relatedIds) {
      const id = parseStrictInteger(relatedId, `externalTransactions[${index}].RelatedID`);
      if (!externalIds.has(id)) throw new Error(`externalTransactions[${index}] has dangling RelatedID ${id}`);
    }
  });
}

function maxId(records) {
  return records.reduce((max, record) => {
    const id = Number(record.ID ?? record.id ?? 0);
    return Math.max(max, Number.isFinite(id) ? id : 0);
  }, 0);
}

export async function installImportedData({
  dataDir,
  backupsDir,
  maxBackups = 30,
  cryptoConfig,
  password,
  tables,
  bcryptRounds = 12,
}) {
  const releaseLock = acquireMaintenanceLock(dataDir);
  try {
    return await installImportedDataUnlocked({
      dataDir, backupsDir, maxBackups, cryptoConfig, password, tables, bcryptRounds,
    });
  } finally {
    releaseLock();
  }
}

async function installImportedDataUnlocked({
  dataDir,
  backupsDir,
  maxBackups,
  cryptoConfig,
  password,
  tables,
  bcryptRounds,
}) {
  validateImportedTables(tables);
  if (typeof password !== 'string' || password.length < 4) {
    throw new Error('Password must be at least 4 characters');
  }

  const salt = crypto.randomBytes(16);
  const key = deriveKeyWithConfig(password, salt, cryptoConfig);
  const counters = {
    transactions: maxId(tables.transactions),
    externalTransactions: maxId(tables.externalTransactions),
  };
  const files = {
    'bill_categories.json': JSON.stringify(tables.billCategories, null, 2),
    'bill_tags.json': JSON.stringify(tables.billTags, null, 2),
    'ex_flow_types.json': JSON.stringify(tables.exFlowType, null, 2),
    'transactions.enc': encryptJson(tables.transactions, key),
    'external_transactions.enc': encryptJson(tables.externalTransactions, key),
    'ex_related_parties.enc': encryptJson(tables.exRelatedParty, key),
    'idCounters.json': JSON.stringify(counters, null, 2),
    'master.salt': salt,
    'password.hash': await bcrypt.hash(password, bcryptRounds),
  };

  return replaceFileSet({
    dataDir,
    files,
    backupOptions: { backupsDir, maxBackups, reason: 'csv-import' },
    verify: async (stageDir) => {
      const stagedSalt = await readFile(join(stageDir, 'master.salt'));
      const stagedKey = deriveKeyWithConfig(password, stagedSalt, cryptoConfig);
      const mappings = [
        ['transactions.enc', tables.transactions],
        ['external_transactions.enc', tables.externalTransactions],
        ['ex_related_parties.enc', tables.exRelatedParty],
      ];
      for (const [name, expected] of mappings) {
        const actual = decryptJson(await readFile(join(stageDir, name)), stagedKey);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Staged verification failed for '${name}'`);
      }
      for (const name of ['bill_categories.json', 'bill_tags.json', 'ex_flow_types.json', 'idCounters.json']) {
        JSON.parse(await readFile(join(stageDir, name), 'utf8'));
      }
      const stagedHash = await readFile(join(stageDir, 'password.hash'), 'utf8');
      if (!(await bcrypt.compare(password, stagedHash))) throw new Error('Staged password hash verification failed');
    },
  });
}

export default {
  assertImportSourceFiles,
  installImportedData,
  parseStrictInteger,
  parseStrictPositiveNumber,
  validateImportedTables,
};
