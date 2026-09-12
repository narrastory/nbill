import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getAll, create, update } from '../repositories/exRelatedParty.js';
import { getLogger } from '../logger.js';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/ex-related-parties
 * List all related parties.
 */
router.get('/', async (req, res) => {
  const data = getAll();
  return res.status(200).json({ data });
});

/**
 * POST /api/ex-related-parties
 * Add a new related party.
 */
router.post('/', async (req, res) => {
  const logger = getLogger();

  try {
    const party = create(req.body || {});
    logger.info(`ExRelatedParty created: ${party.Relatedparty}`);
    return res.status(201).json({ data: party });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/ex-related-parties/:relatedparty
 * Rename a related party.
 */
router.put('/:relatedparty', async (req, res) => {
  const logger = getLogger();
  const relatedparty = decodeURIComponent(req.params.relatedparty);

  try {
    const updated = update(relatedparty, req.body || {});
    logger.info(`ExRelatedParty updated: ${relatedparty} -> ${updated.Relatedparty}`);
    return res.status(200).json({ data: updated });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

export default router;
