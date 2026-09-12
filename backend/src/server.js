import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { getConfig } from './config.js';
import { getLogger } from './logger.js';
import { saveAll, purge, getIsLoaded } from './store/engine.js';
import { acquireServerLock } from './storage/processLock.js';

// Import route modules
import authRoutes from './routes/auth.js';
import transactionRoutes from './routes/transactions.js';
import billCategoriesRoutes from './routes/billCategories.js';
import billTagsRoutes from './routes/billTags.js';
import externalTransactionsRoutes from './routes/externalTransactions.js';
import exFlowTypeRoutes from './routes/exFlowType.js';
import exRelatedPartyRoutes from './routes/exRelatedParty.js';
import systemRoutes from './routes/system.js';
import analyticsRoutes from './routes/analytics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create and configure the Express 5 application.
 */
export function createApp() {
  const config = getConfig();
  const logger = getLogger();
  const app = express();

  // ── Security Middleware ──
  app.use(helmet({
    contentSecurityPolicy: false, // Allow frontend to set its own CSP
  }));

  // ── CORS ──
  app.use(cors({
    origin: config.cors.origin,
    methods: config.cors.methods,
    allowedHeaders: config.cors.allowedHeaders,
    credentials: config.cors.credentials,
  }));

  // ── Compression ──
  app.use(compression());

  // ── Body Parsing ──
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ── Request Logging ──
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path.startsWith('/api')) {
        logger.debug(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      }
    });
    next();
  });

  // ── API Routes ──
  app.use('/api/auth', authRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/bill-categories', billCategoriesRoutes);
  app.use('/api/bill-tags', billTagsRoutes);
  app.use('/api/external-transactions', externalTransactionsRoutes);
  app.use('/api/ex-flow-types', exFlowTypeRoutes);
  app.use('/api/ex-related-parties', exRelatedPartyRoutes);
  app.use('/api', systemRoutes);
  app.use('/api/analytics', analyticsRoutes);

  // ── API 404 Handler (catch unmatched /api/* before SPA fallback) ──
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  // ── Static Files (Frontend Build) ──
  const publicDir = resolve(__dirname, '..', 'public');
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir));
    logger.info(`Serving static files from: ${publicDir}`);
  }

  // ── SPA Fallback (Express 5: wildcard must be named) ──
  app.get('/*splat', (req, res) => {
    const indexPath = resolve(__dirname, '..', 'public', 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(200).json({
        message: 'NBill v3.0 API Server',
        version: '3.0.0',
        docs: 'See docs/frontend-backend-manual/ in the repository',
      });
    }
  });

  // ── Global Error Handler (Express 5: catches async errors automatically) ──
  app.use((err, req, res, _next) => {
    logger.error(`Unhandled error: ${err.message}`, { stack: err.stack, path: req.path, method: req.method });

    // Don't leak error details in production-like scenarios
    const statusCode = err.status || err.statusCode || 500;
    const message = statusCode === 500 ? 'Internal server error' : err.message;

    res.status(statusCode).json({
      error: message,
    });
  });

  return app;
}

/**
 * Start the HTTP server with graceful shutdown handling.
 */
export function startServer(app, options = {}) {
  const config = getConfig();
  const logger = getLogger();
  const releaseServerLock = options.releaseServerLock || acquireServerLock(config.storage.dataDir);

  const server = app.listen(config.server.port, config.server.host, () => {
    logger.info(`NBill server started on http://${config.server.host}:${config.server.port}`);
    logger.info(`Data directory: ${resolve(config.storage.dataDir)}`);
  });
  server.once('error', releaseServerLock);
  server.once('close', releaseServerLock);

  // ── Graceful Shutdown ──
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    // Force save if data is loaded
    if (getIsLoaded()) {
      try {
        await saveAll();
        logger.info('Data saved on shutdown');
      } catch (err) {
        logger.error(`Failed to save data on shutdown: ${err.message}`);
      }
      purge();
    }

    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds if connections don't close
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

export default { createApp, startServer };
