import { expect } from 'chai';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createBackup,
  maybeCreateScheduledBackup,
  restoreBackup,
} from '../src/storage/backup.js';

describe('Data backups', function () {
  let root;
  let dataDir;
  let backupsDir;

  beforeEach(async function () {
    root = await mkdtemp(join(tmpdir(), 'nbill-backup-'));
    dataDir = join(root, 'data');
    backupsDir = join(root, 'backups');
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, 'transactions.enc'), Buffer.from([1, 2, 3]));
    await writeFile(join(dataDir, 'password.hash'), 'hash-value');
    await writeFile(join(dataDir, 'master.salt'), Buffer.from([4, 5, 6]));
  });

  afterEach(async function () {
    await rm(root, { recursive: true, force: true });
  });

  it('copies the complete available file set and writes a manifest', async function () {
    const backupDir = await createBackup({
      dataDir, backupsDir, maxBackups: 5, reason: 'password-change',
      now: new Date('2026-09-11T01:02:03.004Z'),
    });

    expect(await readFile(join(backupDir, 'transactions.enc'))).to.deep.equal(Buffer.from([1, 2, 3]));
    expect(await readFile(join(backupDir, 'password.hash'), 'utf8')).to.equal('hash-value');
    const manifest = JSON.parse(await readFile(join(backupDir, 'manifest.json'), 'utf8'));
    expect(manifest.reason).to.equal('password-change');
    expect(manifest.files.map((file) => file.name)).to.deep.equal([
      'master.salt', 'password.hash', 'transactions.enc',
    ]);
    expect(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).to.equal(true);
  });

  it('skips a scheduled backup while the newest backup is still recent', async function () {
    const now = new Date('2026-09-11T12:00:00.000Z');
    await createBackup({ dataDir, backupsDir, maxBackups: 5, reason: 'startup', now });

    const result = await maybeCreateScheduledBackup({
      dataDir, backupsDir, maxBackups: 5, intervalHours: 24,
      now: new Date('2026-09-11T13:00:00.000Z'),
    });

    expect(result).to.equal(null);
  });

  it('retains only the configured number of completed backups', async function () {
    for (const iso of [
      '2026-09-09T00:00:00.001Z',
      '2026-09-10T00:00:00.002Z',
      '2026-09-11T00:00:00.003Z',
    ]) {
      await createBackup({ dataDir, backupsDir, maxBackups: 2, reason: 'startup', now: new Date(iso) });
    }

    const entries = (await readdir(backupsDir)).filter((name) => name.startsWith('backup-'));
    expect(entries).to.have.length(2);
    expect(entries.some((name) => name.includes('20260909'))).to.equal(false);
  });

  it('cleans an incomplete backup when copying fails', async function () {
    await rm(join(dataDir, 'transactions.enc'));
    await mkdir(join(dataDir, 'transactions.enc'));

    let error;
    try {
      await createBackup({ dataDir, backupsDir, maxBackups: 5, reason: 'startup' });
    } catch (caught) {
      error = caught;
    }

    expect(error).to.be.instanceOf(Error);
    const entries = await readdir(backupsDir);
    expect(entries.filter((name) => name.startsWith('.tmp-'))).to.deep.equal([]);
    expect(entries.filter((name) => name.startsWith('backup-'))).to.deep.equal([]);
  });

  it('restores all files from a completed backup', async function () {
    const backupDir = await createBackup({ dataDir, backupsDir, maxBackups: 5, reason: 'csv-import' });
    await writeFile(join(dataDir, 'password.hash'), 'changed');

    await restoreBackup({ backupDir, dataDir });

    expect(await readFile(join(dataDir, 'password.hash'), 'utf8')).to.equal('hash-value');
  });

  it('does not let a corrupt backup suppress the next scheduled backup', async function () {
    const first = await createBackup({
      dataDir, backupsDir, maxBackups: 5, reason: 'startup',
      now: new Date('2026-09-11T12:00:00.000Z'),
    });
    await writeFile(join(first, 'password.hash'), 'tampered');

    const result = await maybeCreateScheduledBackup({
      dataDir, backupsDir, maxBackups: 5, intervalHours: 24,
      now: new Date('2026-09-11T13:00:00.000Z'),
    });

    expect(result).to.be.a('string');
  });

  it('preflights the whole backup before replacing any formal file', async function () {
    const backupDir = await createBackup({ dataDir, backupsDir, maxBackups: 5, reason: 'manual' });
    await rm(join(backupDir, 'transactions.enc'));
    await writeFile(join(dataDir, 'master.salt'), Buffer.from([9]));
    await writeFile(join(dataDir, 'password.hash'), 'current-hash');

    let error;
    try {
      await restoreBackup({ backupDir, dataDir });
    } catch (caught) {
      error = caught;
    }

    expect(error).to.be.instanceOf(Error);
    expect(await readFile(join(dataDir, 'master.salt'))).to.deep.equal(Buffer.from([9]));
    expect(await readFile(join(dataDir, 'password.hash'), 'utf8')).to.equal('current-hash');
  });

  it('removes formal data files that are absent from the restored backup', async function () {
    const backupDir = await createBackup({ dataDir, backupsDir, maxBackups: 5, reason: 'manual' });
    await writeFile(join(dataDir, 'external_transactions.enc'), Buffer.from([7, 8, 9]));

    await restoreBackup({ backupDir, dataDir });

    let missing = false;
    try {
      await readFile(join(dataDir, 'external_transactions.enc'));
    } catch (err) {
      missing = err.code === 'ENOENT';
    }
    expect(missing).to.equal(true);
  });
});
