import { verifyToken } from '../auth/index.js';
import { getLogger } from '../logger.js';
import { getIsLoaded } from '../store/engine.js';

/**
 * Express 5 middleware: verify JWT from Authorization header.
 *
 * On success, attaches `req.user = { username }` for downstream handlers.
 * On failure, returns 401 with a JSON error.
 *
 * Express 5 automatically catches async errors, so this handler
 * doesn't need try/catch — throwing inside an async middleware
 * is caught by Express 5's error propagation.
 */
export async function authMiddleware(req, res, next) {
  const logger = getLogger();

  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn(`Auth failed: missing or invalid Authorization header from ${req.ip}`);
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid Authorization: Bearer <token> header',
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  // Verify JWT
  const payload = verifyToken(token);
  if (!payload) {
    logger.warn(`Auth failed: invalid or expired token from ${req.ip}`);
    return res.status(401).json({
      error: 'Invalid or expired token',
      message: 'Please login again to obtain a new token',
    });
  }

  if (!getIsLoaded()) {
    logger.warn(`Auth failed: session data is not loaded for ${req.ip}`);
    return res.status(401).json({
      error: 'Session is no longer active',
      message: 'Please login again to load your data',
    });
  }

  // Attach user info to request
  req.user = {
    username: payload.username,
  };

  next();
}

/**
 * Optional middleware: attaches user info if token is present, but doesn't reject.
 * Useful for routes that behave differently for authenticated users.
 */
export async function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload) {
      req.user = { username: payload.username };
    }
  }
  next();
}

export default { authMiddleware, optionalAuthMiddleware };
