import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getAll, create, update } from '../repositories/billTags.js';
import { getLogger } from '../logger.js';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/bill-tags
 * List all tags. Optional query: ?appliesTo=Expense
 */
router.get('/', async (req, res) => {
  const appliesTo = req.query.appliesTo;
  const data = getAll(appliesTo);
  return res.status(200).json({ data });
});

/**
 * POST /api/bill-tags
 * Add a new tag.
 */
router.post('/', async (req, res) => {
  const logger = getLogger();

  try {
    const tag = create(req.body || {});
    logger.info(`BillTag created: ${tag.Tag}`);
    return res.status(201).json({ data: tag });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/bill-tags/:tag
 * Rename or modify a tag.
 */
router.put('/:tag', async (req, res) => {
  const logger = getLogger();
  const tag = decodeURIComponent(req.params.tag);

  try {
    const updated = update(tag, req.body || {});
    logger.info(`BillTag updated: ${tag}`);
    return res.status(200).json({ data: updated });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

export default router;
