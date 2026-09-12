/**
 * NBill v3.0 — Personal Accounting System
 * Application Entry Point
 *
 * Loads configuration, initializes logger, creates Express server, starts listening.
 * Express 5 with native async error handling.
 */

import { initConfig } from './src/config.js';
import { initLogger, getLogger } from './src/logger.js';
import { createApp, startServer } from './src/server.js';
import { maybeCreateScheduledBackup } from './src/storage/backup.js';
import { acquireServerLock } from './src/storage/processLock.js';

// ── Bootstrap ──
let releaseStartupLock = null;
try {
  // 1. Load configuration
  const config = initConfig();

  // 2. Initialize logger
  initLogger();
  const logger = getLogger();

  logger.info('NBill v3.0 starting up...');
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Node.js version: ${process.version}`);

  // Own the data directory before backup or any other startup I/O.
  releaseStartupLock = acquireServerLock(config.storage.dataDir);

  try {
    const backupDir = await maybeCreateScheduledBackup({
      dataDir: config.storage.dataDir,
      backupsDir: config.storage.backupsDir,
      maxBackups: config.storage.maxBackups,
      intervalHours: config.storage.backupIntervalHours,
    });
    if (backupDir) logger.info(`Startup backup created: ${backupDir}`);
  } catch (err) {
    logger.error(`Startup backup failed: ${err.message}`);
  }

  // 3. Create Express application
  const app = createApp();

  // 4. Start server
  startServer(app, { releaseServerLock: releaseStartupLock });
  releaseStartupLock = null;
} catch (err) {
  if (releaseStartupLock) releaseStartupLock();
  console.error(`Failed to start NBill: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}
