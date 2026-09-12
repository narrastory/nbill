import { mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { createBackup, restoreBackup } from './backup.js';

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

export async function replaceFileSet({ dataDir, files, verify, backupOptions }) {
  const resolvedDataDir = resolve(dataDir);
  const parentDir = dirname(resolvedDataDir);
  const stageDir = join(parentDir, `.${basename(resolvedDataDir)}.stage-${randomUUID()}`);
  const fileEntries = Object.entries(files);
  if (fileEntries.length === 0) throw new Error('No files supplied for replacement');

  const existedBefore = new Map();
  for (const [name] of fileEntries) {
    existedBefore.set(name, await pathExists(join(resolvedDataDir, name)));
  }

  const backupDir = await createBackup({ dataDir: resolvedDataDir, ...backupOptions });
  await mkdir(stageDir, { recursive: false });
  const committed = [];

  try {
    for (const [name, contents] of fileEntries) {
      await writeFile(join(stageDir, name), contents);
    }
    await verify(stageDir);
    await mkdir(resolvedDataDir, { recursive: true });

    for (const [name] of fileEntries) {
      await rename(join(stageDir, name), join(resolvedDataDir, name));
      committed.push(name);
    }
    return { backupDir };
  } catch (err) {
    if (committed.length > 0) {
      if (backupDir) await restoreBackup({ backupDir, dataDir: resolvedDataDir });
      for (const name of committed) {
        if (!existedBefore.get(name)) await rm(join(resolvedDataDir, name), { force: true });
      }
    }
    throw err;
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}

export async function readStagedFile(stageDir, name) {
  return readFile(join(stageDir, name));
}

export default { replaceFileSet, readStagedFile };
