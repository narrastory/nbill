import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { saveAll, getLastEditTime, getIsLoaded } from '../store/engine.js';
import { getConfig } from '../config.js';
import { getLogger } from '../logger.js';
import {
  getTransactions,
  getExternalTransactions,
  getBillCategories,
  getBillTags,
  getExFlowType,
  getExRelatedParty,
} from '../store/engine.js';

const router = Router();

/**
 * GET /api/status
 * Check authentication status and return system info. Requires JWT.
 */
router.get('/status', authMiddleware, async (req, res) => {
  const config = getConfig();

  return res.status(200).json({
    authenticated: true,
    username: req.user.username,
    lastEditTime: getLastEditTime(),
    initialBalance: config.business.initialBalance,
    editWindowDays: config.business.editWindowDays,
    counts: {
      transactions: getTransactions().length,
      externalTransactions: getExternalTransactions().length,
      billCategories: getBillCategories().length,
      billTags: getBillTags().length,
      exFlowType: getExFlowType().length,
      exRelatedParty: getExRelatedParty().length,
    },
  });
});

/**
 * POST /api/save
 * Manual force save. Requires JWT.
 */
router.post('/save', authMiddleware, async (req, res) => {
  const logger = getLogger();

  if (!getIsLoaded()) {
    return res.status(400).json({ error: 'No data loaded. Please login first.' });
  }

  await saveAll();
  logger.info('Manual save completed');

  return res.status(200).json({
    message: 'Data saved successfully',
    lastEditTime: getLastEditTime(),
  });
});

export default router;
