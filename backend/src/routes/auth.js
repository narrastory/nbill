import { Router } from 'express';
import { login } from '../auth/index.js';
import { saveAll, purge, getLastEditTime } from '../store/engine.js';
import { getLogger } from '../logger.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate user and get JWT token.
 * This is the ONLY endpoint that does NOT require JWT auth.
 */
router.post('/login', async (req, res) => {
  const logger = getLogger();
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      error: 'Username and password are required',
    });
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  try {
    const result = await login(username, password, ip);
    return res.status(200).json(result);
  } catch (err) {
    logger.warn(`Login attempt failed: ${err.message}`);
    return res.status(401).json({
      error: 'Invalid username or password',
    });
  }
});

/**
 * POST /api/auth/logout
 * Force save data and purge memory. Requires JWT.
 */
router.post('/logout', authMiddleware, async (req, res) => {
  const logger = getLogger();

  await saveAll();
  purge();

  logger.info(`User '${req.user.username}' logged out`);
  return res.status(200).json({
    message: 'Logged out successfully',
  });
});

export default router;
