import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getAll, getById, create, update, delete_ } from '../repositories/externalTransactions.js';
import { getLogger } from '../logger.js';
import { isEditable } from '../store/engine.js';
import { prepareHistoricalEdit } from '../maintenance/historicalEdit.js';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/external-transactions
 * List/search external transactions.
 */
router.get('/', async (req, res) => {
  const filters = {
    type: req.query.type,
    flowType: req.query.flowType,
    relatedParty: req.query.relatedParty,
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
 * GET /api/external-transactions/:id
 * Get a single external transaction with resolved related transactions.
 */
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const transaction = getById(id);
  if (!transaction) {
    return res.status(404).json({ error: 'External transaction not found' });
  }

  return res.status(200).json({ data: transaction });
});

/**
 * POST /api/external-transactions
 * Create a new external transaction.
 */
router.post('/', async (req, res) => {
  const logger = getLogger();

  try {
    const transaction = create(req.body || {});
    logger.info(`ExternalTransaction created: ID=${transaction.ID}, Type=${transaction.Type}, Amount=${transaction.Amount}`);
    return res.status(201).json({ data: transaction });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/external-transactions/:id
 * Update an external transaction. Edit window enforced.
 */
router.put('/:id', async (req, res) => {
  const logger = getLogger();
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  try {
    const existing = getById(id);
    if (!existing) return res.status(404).json({ error: `External transaction with ID ${id} not found` });
    const historicalEdit = !isEditable(existing.FlowDate ?? existing.flowDate);
    if (historicalEdit && req.query.confirmHistoricalEdit !== 'true') {
      return res.status(403).json({ error: `External transaction dated ${existing.FlowDate ?? existing.flowDate} is outside the editable window` });
    }
    let backupDir = null;
    if (historicalEdit) {
      ({ backupDir } = await prepareHistoricalEdit({ reason: 'historical-external-edit' }));
    }
    const transaction = update(id, req.body || {}, { allowHistoricalEdit: historicalEdit });
    if (historicalEdit) logger.info(`Historical external transaction updated: ID=${id}, backup=${backupDir}`);
    logger.info(`ExternalTransaction updated: ID=${id}`);
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
 * DELETE /api/external-transactions/:id
 * Delete an external transaction. Edit window enforced.
 */
router.delete('/:id', async (req, res) => {
  const logger = getLogger();
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  try {
    delete_(id);
    logger.info(`ExternalTransaction deleted: ID=${id}`);
    return res.status(200).json({ message: 'External transaction deleted' });
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
