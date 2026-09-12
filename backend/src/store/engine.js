import { existsSync } from 'fs';
import { join } from 'path';
import { encryptAndWrite, readAndDecrypt, readFileBuffer, atomicWrite, cleanupTempFiles } from '../crypto/index.js';
import { getConfig } from '../config.js';
import { getLogger } from '../logger.js';
import { dateStringToLocalMidnight } from '../validation.js';
import {
  init as initCounters,
  loadCounters,
  saveCounters,
  getNextId,
  getCurrentId,
  recoverCounter,
  getCounters,
} from './idCounter.js';
import { createSaveCoordinator } from './saveCoordinator.js';

// ─── In-Memory State ─────────────────────────────────────────────
/** @type {Buffer|null} 32-byte encryption key derived from user password */
let encryptionKey = null;

/** @type {string} Path to data directory */
let dataDir = '';

/** @type {boolean} Whether data is loaded and decrypted into memory */
let isLoaded = false;

/** @type {string|null} ISO timestamp of last data modification */
let lastEditTime = null;

/**
 * In-memory data arrays for all 6 tables:
 */
const store = {
  transactions: [],
  billCategories: [],
  billTags: [],
  externalTransactions: [],
  exFlowType: [],
  exRelatedParty: [],
};

// ─── Auto-Save State ─────────────────────────────────────────────
let saveTimer = null;
let periodicTimer = null;

// Mapping of table names to file names
const ENCRYPTED_TABLES = {
  transactions: 'transactions.enc',
  externalTransactions: 'external_transactions.enc',
  exRelatedParty: 'ex_related_parties.enc',
};

const PLAIN_TABLES = {
  billCategories: 'bill_categories.json',
  billTags: 'bill_tags.json',
  exFlowType: 'ex_flow_types.json',
};

const saveCoordinator = createSaveCoordinator(async () => {
  if (!isLoaded || !encryptionKey) return;

  const snapshot = structuredClone(store);
  const counterSnapshot = getCounters();
  const allTables = [...Object.keys(ENCRYPTED_TABLES), ...Object.keys(PLAIN_TABLES)];
  for (const tableName of allTables) {
    await saveTable(tableName, snapshot[tableName]);
  }
  await saveCounters(counterSnapshot);
  lastEditTime = new Date().toISOString();
  getLogger().debug('All data saved successfully');
});

// ─── Initialization ──────────────────────────────────────────────

/**
 * Initialize the data store with the encryption key.
 * Does NOT load data — call loadAll() separately.
 *
 * @param {Buffer} key - 32-byte encryption key derived from user password
 */
export function init(key) {
  const config = getConfig();
  encryptionKey = key;
  dataDir = config.storage.dataDir;
  initCounters(dataDir);
  saveCoordinator.reset();
}

/**
 * Get the data directory path.
 */
export function getDataDir() {
  return dataDir;
}

// ─── Load All Data ───────────────────────────────────────────────

/**
 * Load all data from disk into memory.
 * Decrypts encrypted files, parses plain JSON files, loads ID counters.
 * Must be called after init().
 *
 * @throws {Error} If decryption fails (wrong password or corrupted data)
 */
export async function loadAll() {
  if (!encryptionKey) {
    throw new Error('Data store not initialized. Call init() first.');
  }

  const logger = getLogger();
  const loadedStore = {
    transactions: [],
    billCategories: [],
    billTags: [],
    externalTransactions: [],
    exFlowType: [],
    exRelatedParty: [],
  };

  isLoaded = false;
  stopPeriodicSave();

  try {
    await cleanupTempFiles(dataDir);
    const { mkdir } = await import('fs/promises');
    await mkdir(dataDir, { recursive: true });
    await loadCounters();

    for (const [tableName, fileName] of Object.entries(ENCRYPTED_TABLES)) {
      const filePath = join(dataDir, fileName);
      if (!existsSync(filePath)) {
        logger.info(`Encrypted table '${tableName}' not found, starting with empty array`);
        continue;
      }

      try {
        const data = await readAndDecrypt(filePath, encryptionKey);
        if (!Array.isArray(data)) throw new Error('table root must be an array');
        loadedStore[tableName] = data;
        logger.info(`Loaded encrypted table '${tableName}': ${data.length} records`);
      } catch (err) {
        logger.error(`Failed to decrypt '${fileName}': ${err.message}`);
        throw new Error(`Failed to decrypt data file '${fileName}'. The password may be incorrect or the file may be corrupted.`);
      }
    }

    for (const [tableName, fileName] of Object.entries(PLAIN_TABLES)) {
      const filePath = join(dataDir, fileName);
      if (!existsSync(filePath)) {
        logger.info(`Plain table '${tableName}' not found, starting with empty array`);
        continue;
      }

      try {
        const raw = await readFileBuffer(filePath);
        const data = JSON.parse(raw.toString('utf8'));
        if (!Array.isArray(data)) throw new Error('table root must be an array');
        loadedStore[tableName] = data;
        logger.info(`Loaded plain table '${tableName}': ${data.length} records`);
      } catch (err) {
        logger.error(`Failed to load '${fileName}': ${err.message}`);
        throw new Error(`Failed to load data file '${fileName}'. The file may be corrupted.`);
      }
    }

    recoverCounter('transactions', loadedStore.transactions);
    recoverCounter('externalTransactions', loadedStore.externalTransactions);

    for (const tableName of Object.keys(store)) {
      store[tableName] = loadedStore[tableName];
    }
    isLoaded = true;
    lastEditTime = new Date().toISOString();
    startPeriodicSave();
    logger.info('All data loaded into memory successfully');
  } catch (err) {
    purge();
    throw err;
  }
}

// ─── Save Operations ─────────────────────────────────────────────

/**
 * Save a single table to disk.
 * Encrypts or writes as plain JSON depending on the table type.
 *
 * @param {string} tableName - Internal table name
 */
export async function saveTable(tableName, tableData = store[tableName]) {
  const logger = getLogger();

  if (tableName in ENCRYPTED_TABLES) {
    const filePath = join(dataDir, ENCRYPTED_TABLES[tableName]);
    await encryptAndWrite(filePath, tableData, encryptionKey);
    logger.debug(`Saved encrypted table '${tableName}' (${tableData.length} records)`);
  } else if (tableName in PLAIN_TABLES) {
    const filePath = join(dataDir, PLAIN_TABLES[tableName]);
    const json = JSON.stringify(tableData, null, 2);
    await atomicWrite(filePath, Buffer.from(json, 'utf8'));
    logger.debug(`Saved plain table '${tableName}' (${tableData.length} records)`);
  }
}

/**
 * Save all tables and ID counters to disk.
 * Called on: auto-save timer, manual save, logout, shutdown.
 */
export async function saveAll() {
  if (!isLoaded || !encryptionKey) {
    return;
  }

  const logger = getLogger();

  try {
    await saveCoordinator.save();
  } catch (err) {
    logger.error(`Failed to save data: ${err.message}`);
    throw err;
  }
}

// ─── Dirty Flag & Auto-Save ──────────────────────────────────────

/**
 * Mark data as dirty and schedule a debounced auto-save.
 * Called by repositories after every mutation.
 */
export function markDirty() {
  saveCoordinator.markDirty();

  // Debounced save: reset the 2-second timer on each change
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(async () => {
    try {
      await saveAll();
    } catch (err) {
      getLogger().error(`Debounced auto-save failed: ${err.message}`);
    }
  }, 2000);
}

/**
 * Start periodic auto-save (safety net, every N minutes).
 */
function startPeriodicSave() {
  const config = getConfig();
  const intervalMs = config.storage.autoSaveIntervalMs || 300000;

  periodicTimer = setInterval(async () => {
    if (saveCoordinator.isDirty() && isLoaded) {
      try {
        await saveAll();
      } catch (err) {
        getLogger().error(`Periodic auto-save failed: ${err.message}`);
      }
    }
  }, intervalMs);
}

/**
 * Stop periodic auto-save timer.
 */
function stopPeriodicSave() {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

// ─── Purge / Clear ───────────────────────────────────────────────

/**
 * Clear all in-memory data and encryption key.
 * Called on logout.
 */
export function purge() {
  stopPeriodicSave();

  store.transactions = [];
  store.billCategories = [];
  store.billTags = [];
  store.externalTransactions = [];
  store.exFlowType = [];
  store.exRelatedParty = [];

  encryptionKey = null;
  isLoaded = false;
  saveCoordinator.reset();
  lastEditTime = null;

  getLogger().info('Data purged from memory');
}

// ─── Edit Window Check ───────────────────────────────────────────

/**
 * Check if a date is within the editable window.
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {boolean} True if the record can be edited/deleted
 */
export function isEditable(dateString) {
  const config = getConfig();
  const editWindowDays = config.business.editWindowDays;

  const recordDate = dateStringToLocalMidnight(dateString);
  if (!recordDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - recordDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDays <= editWindowDays;
}

// ─── Accessors ───────────────────────────────────────────────────

export function getTransactions() {
  return store.transactions;
}
export function getBillCategories() {
  return store.billCategories;
}
export function getBillTags() {
  return store.billTags;
}
export function getExternalTransactions() {
  return store.externalTransactions;
}
export function getExFlowType() {
  return store.exFlowType;
}
export function getExRelatedParty() {
  return store.exRelatedParty;
}

export function getIsLoaded() {
  return isLoaded;
}
export function getLastEditTime() {
  return lastEditTime;
}

export default {
  init,
  loadAll,
  saveAll,
  saveTable,
  markDirty,
  purge,
  isEditable,
  getTransactions,
  getBillCategories,
  getBillTags,
  getExternalTransactions,
  getExFlowType,
  getExRelatedParty,
  getIsLoaded,
  getLastEditTime,
  getDataDir,
};
