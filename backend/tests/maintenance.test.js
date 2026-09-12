import { expect } from 'chai';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt } from '../src/crypto/index.js';
import { changePassword } from '../src/maintenance/password.js';
import {
  assertImportSourceFiles,
  installImportedData,
  parseStrictInteger,
  parseStrictPositiveNumber,
  validateImportedTables,
} from '../src/maintenance/import.js';
import { acquireMaintenanceLock, acquireServerLock } from '../src/storage/processLock.js';

const cryptoConfig = { pbkdf2: { iterations: 100000, keyLength: 32, digest: 'sha512' } };
const encryptedFiles = ['transactions.enc', 'external_transactions.enc', 'ex_related_parties.enc'];

function derive(password, salt) {
  const options = cryptoConfig.pbkdf2;
  return crypto.pbkdf2Sync(password, salt, options.iterations, options.keyLength, options.digest);
}

async function snapshotFiles(dataDir) {
  const snapshot = new Map();
  for (const name of await readdir(dataDir)) {
    snapshot.set(name, await readFile(join(dataDir, name)));
  }
  return snapshot;
}

function expectSameSnapshot(actual, expected) {
  expect([...actual.keys()].sort()).to.deep.equal([...expected.keys()].sort());
  for (const [name, contents] of expected) {
    expect(actual.get(name), name).to.deep.equal(contents);
  }
}

describe('Safe maintenance operations', function () {
  let root;
  let dataDir;
  let backupsDir;
  const oldPassword = 'old-password';

  beforeEach(async function () {
    root = await mkdtemp(join(tmpdir(), 'nbill-maintenance-'));
    dataDir = join(root, 'data');
    backupsDir = join(root, 'backups');
    await mkdir(dataDir, { recursive: true });

    const salt = crypto.randomBytes(16);
    const key = derive(oldPassword, salt);
    await writeFile(join(dataDir, 'master.salt'), salt);
    await writeFile(join(dataDir, 'password.hash'), await bcrypt.hash(oldPassword, 4));
    await writeFile(join(dataDir, 'transactions.enc'), encrypt(JSON.stringify([{ ID: 9, Amount: 3 }]), key));
    await writeFile(join(dataDir, 'external_transactions.enc'), encrypt(JSON.stringify([{ ID: 4, Amount: 8 }]), key));
    await writeFile(join(dataDir, 'ex_related_parties.enc'), encrypt(JSON.stringify([{ Relatedparty: 'A' }]), key));
    await writeFile(join(dataDir, 'bill_categories.json'), '[]');
    await writeFile(join(dataDir, 'bill_tags.json'), '[]');
    await writeFile(join(dataDir, 'ex_flow_types.json'), '[]');
    await writeFile(join(dataDir, 'idCounters.json'), '{"transactions":9,"externalTransactions":4}');
  });

  afterEach(async function () {
    await rm(root, { recursive: true, force: true });
  });

  it('does not modify formal files when any encrypted table cannot be decrypted', async function () {
    await writeFile(join(dataDir, 'external_transactions.enc'), Buffer.from('corrupted'));
    const before = await snapshotFiles(dataDir);

    let error;
    try {
      await changePassword({
        dataDir, backupsDir, maxBackups: 5, cryptoConfig,
        oldPassword, newPassword: 'new-password', bcryptRounds: 4,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).to.be.instanceOf(Error);
    expectSameSnapshot(await snapshotFiles(dataDir), before);
  });

  it('refuses maintenance while the local server owns the data directory', async function () {
    await writeFile(join(dataDir, '.nbill-server.lock'), JSON.stringify({ pid: process.pid }));
    const before = await snapshotFiles(dataDir);

    let error;
    try {
      await changePassword({
        dataDir, backupsDir, maxBackups: 5, cryptoConfig,
        oldPassword, newPassword: 'new-password', bcryptRounds: 4,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error?.message).to.include('server is running');
    expectSameSnapshot(await snapshotFiles(dataDir), before);
  });

  it('holds the data-directory lock for the complete maintenance operation', function () {
    const release = acquireMaintenanceLock(dataDir);
    try {
      expect(() => acquireServerLock(dataDir)).to.throw('maintenance is running');
    } finally {
      release();
    }
  });

  it('changes the password only after staged encrypted files verify successfully', async function () {
    await changePassword({
      dataDir, backupsDir, maxBackups: 5, cryptoConfig,
      oldPassword, newPassword: 'new-password', bcryptRounds: 4,
    });

    const newSalt = await readFile(join(dataDir, 'master.salt'));
    const newKey = derive('new-password', newSalt);
    const tables = [];
    for (const name of encryptedFiles) {
      tables.push(JSON.parse(decrypt(await readFile(join(dataDir, name)), newKey)));
    }
    expect(tables.map((table) => table.length)).to.deep.equal([1, 1, 1]);
    expect(await bcrypt.compare('new-password', await readFile(join(dataDir, 'password.hash'), 'utf8'))).to.equal(true);
    expect((await readdir(backupsDir)).some((name) => name.endsWith('-password-change'))).to.equal(true);
  });

  it('rejects invalid imported table sets without changing formal files', async function () {
    const before = await snapshotFiles(dataDir);

    let error;
    try {
      await installImportedData({
        dataDir, backupsDir, maxBackups: 5, cryptoConfig,
        password: 'import-password', tables: { transactions: [] }, bcryptRounds: 4,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error?.message).to.include('Missing imported table');
    expectSameSnapshot(await snapshotFiles(dataDir), before);
  });

  it('rejects a CSV source directory when any required table file is missing', async function () {
    const sourceDir = join(root, 'csv');
    await mkdir(sourceDir);
    for (const name of [
      'Transactions.csv', 'BillCategories.csv', 'BillTags.csv',
      'ExternalTransactions.csv', 'ExFlowType.csv',
    ]) {
      await writeFile(join(sourceDir, name), 'header\n');
    }

    let error;
    try {
      await assertImportSourceFiles(sourceDir);
    } catch (caught) {
      error = caught;
    }

    expect(error?.message).to.include('ExRelatedParty.csv');
  });

  it('rejects lossy numeric CSV values and dangling cross-table references', function () {
    expect(() => parseStrictInteger('12abc', 'ID')).to.throw('positive integer');
    expect(() => parseStrictInteger('1.9', 'ID')).to.throw('positive integer');
    expect(() => parseStrictPositiveNumber('10yuan', 'Amount')).to.throw('positive number');

    const tables = {
      transactions: [{
        ID: 1, Type: 'Expense', BillDate: '2021-01-01', Category: 'Missing',
        Subcategory: 'Missing', Description: 'Bad reference', Tag: '', Amount: 1,
      }],
      billCategories: [], billTags: [], externalTransactions: [],
      exFlowType: [], exRelatedParty: [],
    };
    expect(() => validateImportedTables(tables)).to.throw('category reference');
  });

  it('installs a complete imported table set with counters and a backup', async function () {
    const tables = {
      transactions: [{
        ID: 12, Type: 'Expense', BillDate: '2021-01-01', Category: 'A',
        Subcategory: 'B', Description: 'Imported', Tag: 'T', Amount: 5, Notes: '',
      }],
      billCategories: [{ Type: 'Expense', Category: 'A', Subcategory: 'B' }],
      billTags: [{ Tag: 'T' }],
      externalTransactions: [{
        ID: 7, RelatedID: '', Type: 'OUT', FlowDate: '2021-01-01',
        Description: 'Imported external', FlowType: '借款', RelatedParty: 'P', Amount: 6,
      }],
      exFlowType: [{ Flowtype: '借款' }],
      exRelatedParty: [{ Relatedparty: 'P' }],
    };

    await installImportedData({
      dataDir, backupsDir, maxBackups: 5, cryptoConfig,
      password: 'import-password', tables, bcryptRounds: 4,
    });

    const salt = await readFile(join(dataDir, 'master.salt'));
    const key = derive('import-password', salt);
    const restored = JSON.parse(decrypt(await readFile(join(dataDir, 'transactions.enc')), key));
    const counters = JSON.parse(await readFile(join(dataDir, 'idCounters.json'), 'utf8'));
    expect(restored).to.deep.equal(tables.transactions);
    expect(counters).to.deep.equal({ transactions: 12, externalTransactions: 7 });
    expect((await readdir(backupsDir)).some((name) => name.endsWith('-csv-import'))).to.equal(true);
  });
});
