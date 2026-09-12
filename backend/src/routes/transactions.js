import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getAll, getById, create, update, delete_ } from '../repositories/transactions.js';
import { getLogger } from '../logger.js';
import { isEditable } from '../store/engine.js';
import { prepareHistoricalEdit } from '../maintenance/historicalEdit.js';

const router = Router();

// All routes require JWT authentication
router.use(authMiddleware);

/**
 * GET /api/transactions
 * List/search transactions with optional filters.
 */
router.get('/', async (req, res) => {
  const filters = {
    type: req.query.type,
    category: req.query.category,
    subcategory: req.query.subcategory,
    tag: req.query.tag,
    description: req.query.description,
    amountMin: req.query.amountMin,
    amountMax: req.query.amountMax,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    page: req.query.page,
    limit: req.query.limit,
    sortBy: req.query.sortBy,
    sortOrder: req.query.sortOrder,
  };

  const result = getAll(filters);
  return res.status(200).json(result);
});

/**
 * GET /api/transactions/:id
 * Get a single transaction by ID.
 */
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const transaction = getById(id);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  return res.status(200).json({ data: transaction });
});

/**
 * POST /api/transactions
 * Create a new transaction.
 */
router.post('/', async (req, res) => {
  const logger = getLogger();

  try {
    const transaction = create(req.body || {});
    logger.info(`Transaction created: ID=${transaction.ID}, Type=${transaction.Type}, Amount=${transaction.Amount}`);
    return res.status(201).json({ data: transaction });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/transactions/:id
 * Update an existing transaction. Edit window enforced.
 */
router.put('/:id', async (req, res) => {
  const logger = getLogger();
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  try {
    const existing = getById(id);
    if (!existing) return res.status(404).json({ error: `Transaction with ID ${id} not found` });
    const historicalEdit = !isEditable(existing.BillDate ?? existing.billDate);
    if (historicalEdit && req.query.confirmHistoricalEdit !== 'true') {
      return res.status(403).json({ error: `Transaction dated ${existing.BillDate ?? existing.billDate} is outside the editable window` });
    }
    let backupDir = null;
    if (historicalEdit) {
      ({ backupDir } = await prepareHistoricalEdit({ reason: 'historical-transaction-edit' }));
    }
    const transaction = update(id, req.body || {}, { allowHistoricalEdit: historicalEdit });
    if (historicalEdit) logger.info(`Historical transaction updated: ID=${id}, backup=${backupDir}`);
    logger.info(`Transaction updated: ID=${id}`);
    return res.status(200).json(historicalEdit
      ? { data: transaction, historicalEdit: true, backupCreated: true }
      : { data: transaction });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes('outside the editable window')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/transactions/:id
 * Delete a transaction. Edit window enforced.
 */
router.delete('/:id', async (req, res) => {
  const logger = getLogger();
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  try {
    delete_(id);
    logger.info(`Transaction deleted: ID=${id}`);
    return res.status(200).json({ message: 'Transaction deleted' });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes('outside the editable window')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

export default router;
