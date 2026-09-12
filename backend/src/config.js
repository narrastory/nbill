import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultConfigPath = resolve(__dirname, '..', 'config.json');

let config;

const DEFAULTS = {
  server: { port: 3000, host: '0.0.0.0' },
  user: { username: 'user' },
  auth: {
    jwtSecret: '',
    jwtExpiry: '2h',
    bruteForce: { maxAttempts: 5, lockoutDelayMs: 10000 },
  },
  business: { initialBalance: 0, editWindowDays: 30 },
  analytics: {
    monthInterval: 3,
    recentMonths: 12,
  },
  storage: {
    dataDir: './data',
    logsDir: './logs',
    backupsDir: './backups',
    autoSaveIntervalMs: 300000,
    backupIntervalHours: 24,
    maxBackups: 30,
  },
  crypto: {
    pbkdf2: { iterations: 100000, keyLength: 32, digest: 'sha512' },
  },
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  },
  logging: {
    level: 'info',
    dir: './logs',
    maxFiles: '14d',
    maxSize: '20m',
  },
};

function loadConfig() {
  const configPath = process.env.NBILL_CONFIG_PATH
    ? resolve(process.env.NBILL_CONFIG_PATH)
    : defaultConfigPath;

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(raw);

    // Deep merge user config into defaults
    config = deepMerge(DEFAULTS, userConfig);

    // Validate required fields
    if (!config.auth.jwtSecret || config.auth.jwtSecret === '') {
      throw new Error('auth.jwtSecret must be set in config.json');
    }
    if (!config.user.username) {
      throw new Error('user.username must be set in config.json');
    }

    // Environment variable overrides
    if (process.env.NBILL_DATA_DIR) {
      config.storage.dataDir = process.env.NBILL_DATA_DIR;
    }
    if (process.env.NBILL_PORT) {
      config.server.port = parseInt(process.env.NBILL_PORT, 10);
    }

    // Freeze to prevent modifications
    config = Object.freeze(config);
    return config;
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Config file not found at ${configPath}. Please create config.json.`);
    }
    throw err;
  }
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Get the loaded config. Throws if loadConfig() hasn't been called yet.
 */
export function getConfig() {
  if (!config) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return config;
}

/**
 * Load and return the configuration.
 */
export function initConfig() {
  config = loadConfig();
  return config;
}

export default { initConfig, getConfig };
