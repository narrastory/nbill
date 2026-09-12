import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getAll, getGrouped, create, update } from '../repositories/billCategories.js';
import { getLogger } from '../logger.js';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/bill-categories
 * List all categories. Optional query: ?type=Expense
 */
router.get('/', async (req, res) => {
  const type = req.query.type;
  const data = getAll(type);

  // Also return grouped version for frontend convenience
  const grouped = getGrouped();
  return res.status(200).json({ data, grouped });
});

/**
 * POST /api/bill-categories
 * Add a new category.
 */
router.post('/', async (req, res) => {
  const logger = getLogger();

  try {
    const category = create(req.body || {});
    logger.info(`BillCategory created: ${category.Type}/${category.Category}/${category.Subcategory}`);
    return res.status(201).json({ data: category });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/bill-categories/:category/:subcategory
 * Rename or modify a category.
 * Note: Category and Subcategory values must be URL-encoded by frontend.
 */
router.put('/:category/:subcategory', async (req, res) => {
  const logger = getLogger();
  const category = decodeURIComponent(req.params.category);
  const subcategory = decodeURIComponent(req.params.subcategory);

  try {
    const updated = update(category, subcategory, req.body || {});
    logger.info(`BillCategory updated: ${category}/${subcategory}`);
    return res.status(200).json({ data: updated });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

export default router;
