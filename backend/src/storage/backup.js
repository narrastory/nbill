import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'fs/promises';
import { join } from 'path';
import { createHash, randomUUID } from 'crypto';

export const DATA_FILE_NAMES = [
  'bill_categories.json',
  'bill_tags.json',
  'ex_flow_types.json',
  'ex_related_parties.enc',
  'external_transactions.enc',
  'idCounters.json',
  'master.salt',
  'password.hash',
  'transactions.enc',
];

function timestampForName(date) {
  return date.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .replace('Z', '')
    .replace('.', '-');
}

function safeReason(reason) {
  return String(reason || 'manual').replace(/[^a-z0-9_-]/gi, '-');
}

async function availableDataFiles(dataDir) {
  const files = [];
  for (const name of DATA_FILE_NAMES) {
    try {
      const info = await stat(join(dataDir, name));
      files.push({ name, size: info.size });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return files;
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

export async function validateBackup(backupDir) {
  const manifest = JSON.parse(await readFile(join(backupDir, 'manifest.json'), 'utf8'));
  if (!manifest || !Array.isArray(manifest.files)) throw new Error('Invalid backup manifest');
  const createdAt = new Date(manifest.createdAt);
  if (Number.isNaN(createdAt.getTime())) throw new Error('Invalid backup creation time');

  const seen = new Set();
  for (const file of manifest.files) {
    if (!file || !DATA_FILE_NAMES.includes(file.name) || seen.has(file.name)) {
      throw new Error(`Invalid backup file entry: ${file?.name ?? '(missing)'}`);
    }
    seen.add(file.name);
    const path = join(backupDir, file.name);
    const info = await stat(path);
    if (!info.isFile() || info.size !== file.size) throw new Error(`Backup file size mismatch: ${file.name}`);
    if (!/^[a-f0-9]{64}$/.test(file.sha256) || await sha256(path) !== file.sha256) {
      throw new Error(`Backup file checksum mismatch: ${file.name}`);
    }
  }
  return { manifest, createdAt };
}

async function completedBackups(backupsDir) {
  let entries;
  try {
    entries = await readdir(backupsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const backups = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('backup-')) continue;
    const directory = join(backupsDir, entry.name);
    try {
      const { createdAt } = await validateBackup(directory);
      backups.push({ directory, createdAt });
    } catch (_) {
      // An invalid directory is not considered a completed backup.
    }
  }
  return backups.sort((a, b) => a.createdAt - b.createdAt);
}

async function pruneBackups(backupsDir, maxBackups) {
  const backups = await completedBackups(backupsDir);
  const excess = backups.slice(0, Math.max(0, backups.length - Math.max(1, maxBackups)));
  for (const backup of excess) {
    await rm(backup.directory, { recursive: true, force: true });
  }
}

export async function createBackup({
  dataDir,
  backupsDir,
  maxBackups = 30,
  reason = 'manual',
  now = new Date(),
}) {
  const files = await availableDataFiles(dataDir);
  if (files.length === 0) return null;

  await mkdir(backupsDir, { recursive: true });
  const stamp = timestampForName(now);
  const tempDir = join(backupsDir, `.tmp-${stamp}-${randomUUID()}`);
  const finalDir = join(backupsDir, `backup-${stamp}-${safeReason(reason)}`);
  await mkdir(tempDir, { recursive: false });

  try {
    for (const file of files) {
      await copyFile(join(dataDir, file.name), join(tempDir, file.name));
    }
    const copiedFiles = [];
    for (const file of files) {
      const path = join(tempDir, file.name);
      const info = await stat(path);
      copiedFiles.push({ name: file.name, size: info.size, sha256: await sha256(path) });
    }
    const manifest = {
      createdAt: now.toISOString(),
      reason,
      files: copiedFiles,
    };
    await writeFile(join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    await rename(tempDir, finalDir);
    await pruneBackups(backupsDir, maxBackups);
    return finalDir;
  } catch (err) {
    await rm(tempDir, { recursive: true, force: true });
    throw err;
  }
}

export async function maybeCreateScheduledBackup({
  dataDir,
  backupsDir,
  maxBackups = 30,
  intervalHours = 24,
  now = new Date(),
}) {
  const backups = await completedBackups(backupsDir);
  const newest = backups.at(-1);
  const intervalMs = Math.max(0, intervalHours) * 60 * 60 * 1000;
  if (newest && now.getTime() - newest.createdAt.getTime() < intervalMs) {
    return null;
  }
  return createBackup({ dataDir, backupsDir, maxBackups, reason: 'startup', now });
}

export async function restoreBackup({ backupDir, dataDir }) {
  const { manifest } = await validateBackup(backupDir);
  await mkdir(dataDir, { recursive: true });
  const stageDir = join(dataDir, `.restore-stage-${randomUUID()}`);
  const rollbackDir = join(dataDir, `.restore-rollback-${randomUUID()}`);
  await mkdir(stageDir);
  await mkdir(rollbackDir);
  const existedBefore = new Map();
  const manifestNames = new Set(manifest.files.map((file) => file.name));
  let snapshotComplete = false;

  try {
    for (const file of manifest.files) {
      const stagedPath = join(stageDir, file.name);
      await copyFile(join(backupDir, file.name), stagedPath);
      if (await sha256(stagedPath) !== file.sha256) throw new Error(`Staged restore checksum mismatch: ${file.name}`);
    }

    // Snapshot every managed target, including files absent from an older
    // backup, so the restore can remove extras without losing rollback safety.
    for (const name of DATA_FILE_NAMES) {
      try {
        await copyFile(join(dataDir, name), join(rollbackDir, name));
        existedBefore.set(name, true);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        existedBefore.set(name, false);
      }
    }
    snapshotComplete = true;

    for (const file of manifest.files) {
      await rename(join(stageDir, file.name), join(dataDir, file.name));
    }
    for (const name of DATA_FILE_NAMES) {
      if (!manifestNames.has(name)) await rm(join(dataDir, name), { force: true });
    }
  } catch (err) {
    if (snapshotComplete) {
      for (const name of DATA_FILE_NAMES) {
        if (existedBefore.get(name)) await copyFile(join(rollbackDir, name), join(dataDir, name));
        else await rm(join(dataDir, name), { force: true });
      }
    }
    throw err;
  } finally {
    await rm(stageDir, { recursive: true, force: true });
    await rm(rollbackDir, { recursive: true, force: true });
  }
}

export default { createBackup, maybeCreateScheduledBackup, restoreBackup, validateBackup, DATA_FILE_NAMES };
