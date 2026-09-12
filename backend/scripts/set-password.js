/**
 * Safely initialize or change the local NBill password.
 * All file replacement is staged and verified by the maintenance module.
 */
import readline from 'readline';
import { Writable } from 'stream';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { changePassword } from '../src/maintenance/password.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function loadConfig() {
  const configPath = join(projectRoot, 'config.json');
  if (!existsSync(configPath)) throw new Error('config.json not found');
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

function askHidden(prompt) {
  process.stdout.write(prompt);
  const sink = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const rl = readline.createInterface({ input: process.stdin, output: sink, terminal: true });
  return new Promise((resolveAnswer) => {
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolveAnswer(answer);
    });
  });
}

async function main() {
  const config = loadConfig();
  const dataDir = resolve(projectRoot, config.storage.dataDir);
  const backupsDir = resolve(projectRoot, config.storage.backupsDir);
  mkdirSync(dataDir, { recursive: true });

  console.log('=== NBill Password Setup ===');
  console.log(`Username: ${config.user.username}`);
  const hasPassword = existsSync(join(dataDir, 'password.hash'));
  const oldPassword = hasPassword ? await askHidden('Old password: ') : null;
  const newPassword = await askHidden('New password: ');
  const confirmation = await askHidden('Confirm new password: ');

  if (newPassword !== confirmation) throw new Error('Passwords do not match');

  const result = await changePassword({
    dataDir,
    backupsDir,
    maxBackups: config.storage.maxBackups,
    cryptoConfig: config.crypto,
    oldPassword,
    newPassword,
  });

  console.log('Password updated successfully.');
  if (result.backupDir) console.log(`Safety backup: ${result.backupDir}`);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exitCode = 1;
});
