import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  computeAnalytics,
  computeAnalyticsSummary,
  computeExternalOutstanding,
} from '../analytics/engine.js';
import { parseAnalyticsRange } from '../analytics/range.js';
import { inspectDataQuality } from '../analytics/dataQuality.js';
import {
  getBillCategories,
  getBillTags,
  getExFlowType,
  getExRelatedParty,
  getExternalTransactions,
  getTransactions,
} from '../store/engine.js';
import { getCounters } from '../store/idCounter.js';
import { getLogger } from '../logger.js';

const router = Router();
const OUTSTANDING_STATUSES = new Set(['open', 'settled', 'overpaid', 'unmatched-in']);

// All routes require JWT authentication
router.use(authMiddleware);

router.get('/data-quality', (req, res) => res.status(200).json(inspectDataQuality({
  transactions: getTransactions(),
  externalTransactions: getExternalTransactions(),
  billCategories: getBillCategories(),
  billTags: getBillTags(),
  exFlowType: getExFlowType(),
  exRelatedParty: getExRelatedParty(),
  counters: getCounters(),
})));

/**
 * GET /api/analytics
 *
 * Compute and return all financial analytics data.
 * Triggers fresh computation on each call.
 * Optional query parameters: dateFrom and dateTo (inclusive).
 *
 * Response: Full analytics JSON object (see docs/frontend-backend-manual/API_REFERENCE.md for structure).
 */
router.get('/summary', async (req, res) => {
  try {
    const range = parseAnalyticsRange(req.query);
    return res.status(200).json(computeAnalyticsSummary({ range }));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.get('/external-outstanding', async (req, res) => {
  try {
    const asOf = parseAnalyticsRange({ dateTo: req.query.asOf }).dateTo;
    const status = req.query.status || null;
    if (status && !OUTSTANDING_STATUSES.has(status)) {
      throw new Error('status must be open, settled, overpaid, or unmatched-in');
    }
    return res.status(200).json(computeExternalOutstanding({
      asOf,
      relatedParty: req.query.relatedParty || null,
      status,
    }));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  const logger = getLogger();
  try {
    const range = parseAnalyticsRange(req.query);
    logger.info('Analytics computation triggered via API');
    const result = computeAnalytics({ range });
    logger.info('Analytics computation completed and returned');
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
