import winston from 'winston';
import 'winston-daily-rotate-file';
import { resolve } from 'path';
import { getConfig } from './config.js';

let logger;

const SENSITIVE_KEYS = ['password', 'newPassword', 'oldPassword', 'token', 'jwt'];

/**
 * Sanitize an object by redacting sensitive keys.
 */
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.includes(key)) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Sanitize a string message by replacing sensitive patterns.
 */
function sanitizeMessage(msg) {
  if (typeof msg !== 'string') return msg;
  let sanitized = msg;
  for (const key of SENSITIVE_KEYS) {
    const regex = new RegExp(`"${key}"\\s*:\\s*"[^"]*"`, 'gi');
    sanitized = sanitized.replace(regex, `"${key}":"***REDACTED***"`);
    const eqRegex = new RegExp(`${key}=[^&\\s]*`, 'gi');
    sanitized = sanitized.replace(eqRegex, `${key}=***REDACTED***`);
  }
  return sanitized;
}

/**
 * Initialize the Winston logger.
 * Must be called after initConfig().
 */
export function initLogger() {
  const config = getConfig();
  const logsDir = resolve(config.storage.logsDir);

  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  );

  const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(sanitize(meta)) : '';
      return `${timestamp} ${level}: ${sanitizeMessage(message)}${metaStr}`;
    }),
  );

  logger = winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    transports: [
      new winston.transports.DailyRotateFile({
        dirname: logsDir,
        filename: 'nbill-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: config.logging.maxFiles,
        maxSize: config.logging.maxSize,
      }),
      new winston.transports.Console({
        format: consoleFormat,
      }),
    ],
  });

  // Wrap log methods to sanitize metadata
  const originalLog = logger.log.bind(logger);
  logger.log = function (level, msg, meta = {}) {
    originalLog(level, sanitizeMessage(msg), sanitize(meta));
  };

  // Override convenience methods too
  ['error', 'warn', 'info', 'debug'].forEach((method) => {
    const original = logger[method].bind(logger);
    logger[method] = function (msg, meta = {}) {
      original(sanitizeMessage(msg), sanitize(meta));
    };
  });

  return logger;
}

/**
 * Get the logger instance.
 */
export function getLogger() {
  if (!logger) {
    // Return a simple console logger if not initialized yet (for early startup errors)
    return {
      error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta || ''),
      info: (msg, meta) => console.log(`[INFO] ${msg}`, meta || ''),
      debug: (msg, meta) => console.log(`[DEBUG] ${msg}`, meta || ''),
      log: () => {},
    };
  }
  return logger;
}

export default { initLogger, getLogger };
