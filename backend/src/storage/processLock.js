import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { join, resolve } from 'path';

export const SERVER_LOCK_NAME = '.nbill-server.lock';

function lockPath(dataDir) {
  return join(resolve(dataDir), SERVER_LOCK_NAME);
}

function readOwner(path) {
  try {
    const owner = JSON.parse(readFileSync(path, 'utf8'));
    return Number.isInteger(owner?.pid) && owner.pid > 0 ? owner : null;
  } catch (_) {
    return null;
  }
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

export function assertNoActiveServer(dataDir) {
  const path = lockPath(dataDir);
  const owner = readOwner(path);
  if (owner && processIsAlive(owner.pid)) {
    const role = owner.role === 'maintenance' ? 'maintenance' : 'server';
    throw new Error(`NBill ${role} is running (PID ${owner.pid}); stop it before continuing`);
  }

  // A malformed lock or one owned by a dead process is stale.
  try {
    unlinkSync(path);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function acquireDataLock(dataDir, role) {
  const resolvedDataDir = resolve(dataDir);
  mkdirSync(resolvedDataDir, { recursive: true });
  const path = lockPath(resolvedDataDir);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = openSync(path, 'wx');
      try {
        writeFileSync(handle, JSON.stringify({ pid: process.pid, role, startedAt: new Date().toISOString() }));
      } finally {
        closeSync(handle);
      }

      let released = false;
      return () => {
        if (released) return;
        released = true;
        try {
          const owner = readOwner(path);
          if (owner?.pid === process.pid) unlinkSync(path);
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }
      };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      assertNoActiveServer(resolvedDataDir);
    }
  }

  throw new Error('Unable to acquire NBill server lock');
}

export function acquireServerLock(dataDir) {
  return acquireDataLock(dataDir, 'server');
}

export function acquireMaintenanceLock(dataDir) {
  return acquireDataLock(dataDir, 'maintenance');
}

export default { acquireMaintenanceLock, acquireServerLock, assertNoActiveServer, SERVER_LOCK_NAME };
