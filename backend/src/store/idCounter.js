import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { atomicWrite } from '../crypto/index.js';
import { getLogger } from '../logger.js';

/**
 * Auto-increment ID counter manager.
 * Persists counters to idCounters.json for crash recovery.
 */

let counters = {};
let dataDir = '';
const DEFAULT_COUNTERS = { transactions: 0, externalTransactions: 0 };

function normalizeCounters(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_COUNTERS };
  return Object.fromEntries(Object.entries(DEFAULT_COUNTERS).map(([name]) => {
    const counter = value[name];
    return [name, Number.isInteger(counter) && counter >= 0 ? counter : 0];
  }));
}

/**
 * Initialize the ID counter module.
 */
export function init(dir) {
  dataDir = dir;
  counters = {};
}

/**
 * Load counters from disk.
 */
export async function loadCounters() {
  const logger = getLogger();
  const counterPath = join(dataDir, 'idCounters.json');

  try {
    if (existsSync(counterPath)) {
      const raw = await readFile(counterPath, 'utf-8');
      counters = normalizeCounters(JSON.parse(raw));
      logger.info(`Loaded ID counters: ${JSON.stringify(counters)}`);
    } else {
      counters = { ...DEFAULT_COUNTERS };
      logger.info('No existing ID counters found, starting fresh');
    }
  } catch (err) {
    logger.error(`Failed to load ID counters: ${err.message}`);
    counters = { ...DEFAULT_COUNTERS };
  }

  return counters;
}

/**
 * Save counters to disk.
 */
export async function saveCounters(counterSnapshot = counters) {
  const logger = getLogger();
  const counterPath = join(dataDir, 'idCounters.json');

  try {
    const json = JSON.stringify(counterSnapshot, null, 2);
    await atomicWrite(counterPath, Buffer.from(json, 'utf-8'));
    logger.debug(`Saved ID counters: ${JSON.stringify(counterSnapshot)}`);
  } catch (err) {
    logger.error(`Failed to save ID counters: ${err.message}`);
    throw err;
  }
}

/**
 * Get the next available ID for a table and increment the counter.
 * @param {string} tableName - 'transactions' or 'externalTransactions'
 * @returns {number} Next ID
 */
export function getNextId(tableName) {
  if (!Number.isInteger(counters[tableName]) || counters[tableName] < 0) {
    counters[tableName] = 0;
  }
  counters[tableName] += 1;
  return counters[tableName];
}

/**
 * Get current counter value without incrementing.
 */
export function getCurrentId(tableName) {
  return counters[tableName] || 0;
}

/**
 * Set counter to specific value (used after data load to ensure > max existing id).
 */
export function setCounter(tableName, value) {
  counters[tableName] = value;
}

/**
 * Recover counters after loading data: ensure counter >= max existing ID.
 * @param {string} tableName
 * @param {Array} records - Array of records with 'id' field
 */
export function recoverCounter(tableName, records) {
  if (!records || records.length === 0) return;

  const maxId = records.reduce((max, record) => {
    const id = Number(record.ID ?? record.id ?? 0);
    return Math.max(max, Number.isFinite(id) ? id : 0);
  }, 0);
  const currentCounter = Number.isInteger(counters[tableName]) && counters[tableName] >= 0
    ? counters[tableName]
    : 0;

  if (maxId >= currentCounter) {
    counters[tableName] = maxId;
  }
}

/**
 * Get all counters (read-only).
 */
export function getCounters() {
  return { ...counters };
}

export default { init, loadCounters, saveCounters, getNextId, getCurrentId, setCounter, recoverCounter, getCounters };
