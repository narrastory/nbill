import { getConfig } from '../config.js';
import { saveAll } from '../store/engine.js';
import { createBackup } from '../storage/backup.js';
import { join } from 'path';

async function defaultBackup({ reason }) {
  const config = getConfig();
  const backupsDir = process.env.NBILL_DATA_DIR
    ? join(config.storage.dataDir, 'backups')
    : config.storage.backupsDir;
  return createBackup({
    dataDir: config.storage.dataDir,
    backupsDir,
    maxBackups: config.storage.maxBackups,
    reason,
  });
}

export async function prepareHistoricalEdit({
  reason,
  saveFn = saveAll,
  backupFn = defaultBackup,
} = {}) {
  if (!reason) throw new Error('Historical edit backup reason is required');
  await saveFn();
  const backupDir = await backupFn({ reason });
  if (!backupDir) throw new Error('Historical edit backup could not be created');
  return { backupDir };
}

export default { prepareHistoricalEdit };
