import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getAll, create, update } from '../repositories/exFlowType.js';
import { getLogger } from '../logger.js';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/ex-flow-types
 * List all flow types.
 */
router.get('/', async (req, res) => {
  const data = getAll();
  return res.status(200).json({ data });
});

/**
 * POST /api/ex-flow-types
 * Add a new flow type.
 */
router.post('/', async (req, res) => {
  const logger = getLogger();

  try {
    const flowType = create(req.body || {});
    logger.info(`ExFlowType created: ${flowType.Flowtype}`);
    return res.status(201).json({ data: flowType });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/ex-flow-types/:flowtype
 * Rename a flow type.
 */
router.put('/:flowtype', async (req, res) => {
  const logger = getLogger();
  const flowtype = decodeURIComponent(req.params.flowtype);

  try {
    const updated = update(flowtype, req.body || {});
    logger.info(`ExFlowType updated: ${flowtype} -> ${updated.Flowtype}`);
    return res.status(200).json({ data: updated });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

export default router;
