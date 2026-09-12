/**
 * Test helpers for NBill test suite.
 * Uses ESM imports (project is "type": "module").
 */

import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

export const TEST_USERNAME = 'test-user';
export const TEST_PASSWORD = '725436198';
export const TEST_DATA_DIR = resolve(projectRoot, 'data_test');
export const TEST_CONFIG_PATH = resolve(TEST_DATA_DIR, 'test-config.json');
process.env.NBILL_CONFIG_PATH = TEST_CONFIG_PATH;

export function dateOffsetString(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ─── Crypto for test seeding ───
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
}

function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const salt = crypto.randomBytes(SALT_LEN);
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

/**
 * Seed test data files in the test data directory.
 */
export async function seedTestData() {
  // Test files share the process-level singleton store. Reset an earlier suite
  // before replacing its on-disk fixture, just as a real logout would.
  const engine = await import('../src/store/engine.js');
  if (engine.getIsLoaded()) engine.purge();

  if (!existsSync(TEST_DATA_DIR)) {
    mkdirSync(TEST_DATA_DIR, { recursive: true });
  }

  const testConfig = {
    server: { port: 0, host: '127.0.0.1' },
    user: { username: TEST_USERNAME },
    auth: {
      jwtSecret: 'test-only-jwt-secret-that-is-not-used-in-production',
      jwtExpiry: '2h',
      bruteForce: { maxAttempts: 5, lockoutDelayMs: 10000 },
    },
    business: { initialBalance: 10000, editWindowDays: 30 },
    analytics: { monthInterval: 3, recentMonths: 12 },
    storage: {
      dataDir: TEST_DATA_DIR,
      logsDir: join(TEST_DATA_DIR, 'logs'),
      backupsDir: join(TEST_DATA_DIR, 'backups'),
      autoSaveIntervalMs: 300000,
      backupIntervalHours: 24,
      maxBackups: 30,
    },
    crypto: { pbkdf2: { iterations: 100000, keyLength: 32, digest: 'sha512' } },
    cors: {
      origin: 'http://localhost:5173',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    },
    logging: { level: 'error', dir: join(TEST_DATA_DIR, 'logs'), maxFiles: '1d', maxSize: '1m' },
  };
  writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));

  const masterSalt = crypto.randomBytes(SALT_LEN);
  writeFileSync(join(TEST_DATA_DIR, 'master.salt'), masterSalt);
  const key = deriveKey(TEST_PASSWORD, masterSalt);

  // Password hash
  const hash = await bcrypt.hash(TEST_PASSWORD, 12);
  writeFileSync(join(TEST_DATA_DIR, 'password.hash'), hash);

  // BillCategories
  const categories = [
    { Type: 'Expense', Category: '餐饮食品', Subcategory: '正餐', Description: '食堂、饭店、快餐' },
    { Type: 'Expense', Category: '餐饮食品', Subcategory: '外卖夜宵', Description: '外卖、夜宵' },
    { Type: 'Expense', Category: '交通出行', Subcategory: '公交地铁', Description: '地铁、公交' },
    { Type: 'Expense', Category: '娱乐休闲', Subcategory: '游戏', Description: '游戏本体' },
    { Type: 'Income', Category: '其它收入', Subcategory: '生活费', Description: '父母给的生活费' },
    { Type: 'Income', Category: '奖励补贴', Subcategory: '奖金', Description: '比赛奖金' },
  ];
  writeFileSync(join(TEST_DATA_DIR, 'bill_categories.json'), JSON.stringify(categories, null, 2));

  // BillTags
  const tags = [
    { Tag: '主动选择', Description: '自己主动决定', AppliesTo: 'Expense' },
    { Tag: '低效消费', Description: '后悔', AppliesTo: 'Expense' },
    { Tag: '家庭', Description: '与家人相关', AppliesTo: 'Both' },
  ];
  writeFileSync(join(TEST_DATA_DIR, 'bill_tags.json'), JSON.stringify(tags, null, 2));

  // ExFlowType
  const flowTypes = [
    { Flowtype: '借款' },
    { Flowtype: '还款' },
  ];
  writeFileSync(join(TEST_DATA_DIR, 'ex_flow_types.json'), JSON.stringify(flowTypes, null, 2));

  // ExRelatedParty (encrypted)
  const parties = [{ Relatedparty: '测试往来方甲' }, { Relatedparty: '测试往来方乙' }];
  writeFileSync(join(TEST_DATA_DIR, 'ex_related_parties.enc'), encrypt(JSON.stringify(parties), key));

  // Transactions (encrypted) - mix of recent and old dates
  const editWindowDays = testConfig.business.editWindowDays;
  const today = dateOffsetString(0);
  const recentDate = dateOffsetString(-2);
  const oldDate = dateOffsetString(-(editWindowDays + 1));

  const transactions = [
    { ID: 1, Type: 'Expense', BillDate: today, Category: '餐饮食品', Subcategory: '正餐', Description: '午餐', Tag: '主动选择', Amount: 35.5, Notes: '' },
    { ID: 2, Type: 'Income', BillDate: recentDate, Category: '其它收入', Subcategory: '生活费', Description: '生活费', Tag: '家庭', Amount: 2000, Notes: '' },
    { ID: 3, Type: 'Expense', BillDate: oldDate, Category: '餐饮食品', Subcategory: '外卖夜宵', Description: '宵夜', Tag: '低效消费', Amount: 25, Notes: '太晚' },
  ];
  writeFileSync(join(TEST_DATA_DIR, 'transactions.enc'), encrypt(JSON.stringify(transactions), key));

  // ExternalTransactions (encrypted)
  const extTxns = [
    { ID: 1, RelatedID: '', Type: 'OUT', FlowDate: today, Description: '借钱', FlowType: '借款', RelatedParty: '测试往来方甲', Amount: 500 },
    { ID: 2, RelatedID: '1', Type: 'IN', FlowDate: recentDate, Description: '还钱', FlowType: '还款', RelatedParty: '测试往来方甲', Amount: 500 },
    { ID: 3, RelatedID: '', Type: 'OUT', FlowDate: oldDate, Description: '旧借款', FlowType: '借款', RelatedParty: '测试往来方乙', Amount: 1000 },
  ];
  writeFileSync(join(TEST_DATA_DIR, 'external_transactions.enc'), encrypt(JSON.stringify(extTxns), key));

  // ID Counters
  writeFileSync(join(TEST_DATA_DIR, 'idCounters.json'), JSON.stringify({ transactions: 3, externalTransactions: 3 }));

}

/**
 * Reset brute force protection state (call between test suites).
 */
export function resetBruteForce() {
  // Dynamic import to avoid circular deps
  import('../src/auth/index.js').then((m) => m.resetBruteForce()).catch(() => {});
}
export function cleanup() {
  if (existsSync(TEST_DATA_DIR)) {
    try {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    } catch (_) { /* ignore */ }
  }
}

export default { TEST_USERNAME, TEST_PASSWORD, TEST_DATA_DIR, TEST_CONFIG_PATH, seedTestData, cleanup };
