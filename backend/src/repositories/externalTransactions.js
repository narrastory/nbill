import { getExternalTransactions, markDirty, isEditable } from '../store/engine.js';
import { getNextId } from '../store/idCounter.js';
import { findByName as findFlowType } from './exFlowType.js';
import { findByName as findParty } from './exRelatedParty.js';
import { validateTransactionDate, parsePositiveAmount } from '../validation.js';

/**
 * Repository for ExternalTransactions table (encrypted).
 * CRUD operations with search, validation, edit window enforcement,
 * and RelatedID referential resolution.
 */

/**
 * Search and list external transactions with filtering and pagination.
 */
export function getAll(filters = {}) {
  let transactions = [...getExternalTransactions()];

  // ── Filters ──
  if (filters.type) {
    transactions = transactions.filter(
      (t) => (t.Type || t.type) === filters.type,
    );
  }
  if (filters.flowType) {
    transactions = transactions.filter(
      (t) => (t.FlowType || t.flowType) === filters.flowType,
    );
  }
  if (filters.relatedParty) {
    transactions = transactions.filter(
      (t) => (t.RelatedParty || t.relatedParty) === filters.relatedParty,
    );
  }
  if (filters.description) {
    const search = filters.description.toLowerCase();
    transactions = transactions.filter((t) => {
      const desc = (t.Description || t.description || '').toLowerCase();
      return desc.includes(search);
    });
  }
  if (filters.amountMin !== undefined) {
    const min = parseFloat(filters.amountMin);
    if (!isNaN(min)) {
      transactions = transactions.filter(
        (t) => (t.Amount || t.amount) >= min,
      );
    }
  }
  if (filters.amountMax !== undefined) {
    const max = parseFloat(filters.amountMax);
    if (!isNaN(max)) {
      transactions = transactions.filter(
        (t) => (t.Amount || t.amount) <= max,
      );
    }
  }
  if (filters.dateFrom) {
    transactions = transactions.filter(
      (t) => (t.FlowDate || t.flowDate) >= filters.dateFrom,
    );
  }
  if (filters.dateTo) {
    transactions = transactions.filter(
      (t) => (t.FlowDate || t.flowDate) <= filters.dateTo,
    );
  }

  // ── Sort ──
  const sortBy = filters.sortBy || 'FlowDate';
  const sortOrder = filters.sortOrder || 'desc';
  transactions.sort((a, b) => {
    const aVal = a[sortBy] || a[sortBy.toLowerCase()] || '';
    const bVal = b[sortBy] || b[sortBy.toLowerCase()] || '';
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const cmp = String(aVal).localeCompare(String(bVal));
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  // ── Pagination ──
  const total = transactions.length;
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(filters.limit) || 100));
  const offset = (page - 1) * limit;
  const data = transactions.slice(offset, offset + limit);

  // Do NOT resolve RelatedID for list (performance)
  return { data, total, page, limit };
}

/**
 * Get a single external transaction by ID with resolved related transactions.
 */
export function getById(id) {
  const transactions = getExternalTransactions();
  const txn = transactions.find((t) => (t.ID || t.id) === id);

  if (!txn) return null;

  // Resolve RelatedID
  const result = { ...txn };
  const relatedId = txn.RelatedID || txn.relatedId;
  if (relatedId) {
    const ids = String(relatedId).split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
    result.relatedTransactions = ids
      .map((rid) => {
        const related = transactions.find((t) => (t.ID || t.id) === rid);
        if (related) {
          return {
            ID: related.ID || related.id,
            Type: related.Type || related.type,
            Description: related.Description || related.description,
            Amount: related.Amount || related.amount,
            FlowDate: related.FlowDate || related.flowDate,
          };
        }
        return null;
      })
      .filter(Boolean);
  } else {
    result.relatedTransactions = [];
  }

  return result;
}

/**
 * Create a new external transaction.
 *
 * @param {object} data - { Type, FlowDate, Description, FlowType, RelatedParty, Amount, RelatedID? }
 * @returns {object} Created transaction
 * @throws {Error} If validation fails
 */
export function create(data) {
  const type = data.Type || data.type;
  const flowDate = data.FlowDate || data.flowDate;
  const description = data.Description || data.description;
  const flowType = data.FlowType || data.flowType;
  const relatedParty = data.RelatedParty || data.relatedParty;
  const amount = parsePositiveAmount(data.Amount ?? data.amount);
  const relatedId = data.RelatedID || data.relatedId || '';

  // ── Validate ──
  if (!type || !['IN', 'OUT'].includes(type)) {
    throw new Error('Type must be "IN" or "OUT"');
  }
  validateTransactionDate(flowDate, 'FlowDate');
  if (!description || !description.trim()) {
    throw new Error('Description is required');
  }
  if (!flowType || !flowType.trim()) {
    throw new Error('FlowType is required');
  }
  if (!relatedParty || !relatedParty.trim()) {
    throw new Error('RelatedParty is required');
  }
  // ── Validate FlowType exists ──
  if (!findFlowType(flowType)) {
    throw new Error(`FlowType '${flowType}' does not exist in ExFlowType`);
  }

  // ── Validate RelatedParty exists ──
  if (!findParty(relatedParty)) {
    throw new Error(`RelatedParty '${relatedParty}' does not exist in ExRelatedParty`);
  }

  // ── Validate RelatedID references ──
  const transactions = getExternalTransactions();
  if (relatedId) {
    const ids = String(relatedId).split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
    for (const rid of ids) {
      const exists = transactions.find((t) => (t.ID || t.id) === rid);
      if (!exists) {
        throw new Error(`RelatedID ${rid} does not reference an existing external transaction`);
      }
    }
  }
  // Also validate: can't reference itself (it hasn't been created yet, so this isn't an issue)

  // ── Create ──
  const id = getNextId('externalTransactions');
  const newTxn = {
    ID: id,
    RelatedID: relatedId,
    Type: type,
    FlowDate: flowDate,
    Description: description,
    FlowType: flowType,
    RelatedParty: relatedParty,
    Amount: amount,
  };

  transactions.push(newTxn);
  markDirty();

  return newTxn;
}

/**
 * Update an external transaction.
 * Edit window enforced based on FlowDate.
 * FlowDate cannot be changed.
 *
 * @param {number} id - Transaction ID
 * @param {object} data - Fields to update
 * @returns {object} Updated transaction
 * @throws {Error} If not found, outside edit window, or validation fails
 */
export function update(id, data, { allowHistoricalEdit = false } = {}) {
  const transactions = getExternalTransactions();
  const index = transactions.findIndex((t) => (t.ID || t.id) === id);

  if (index === -1) {
    throw new Error(`External transaction with ID ${id} not found`);
  }

  const txn = transactions[index];
  const flowDate = txn.FlowDate || txn.flowDate;

  // ── Edit window check ──
  if (!allowHistoricalEdit && !isEditable(flowDate)) {
    throw new Error(`External transaction dated ${flowDate} is outside the editable window`);
  }

  const candidate = { ...txn };

  // ── Apply updates (not FlowDate) ──
  if (data.Type || data.type) {
    const newType = data.Type || data.type;
    if (!['IN', 'OUT'].includes(newType)) {
      throw new Error('Type must be "IN" or "OUT"');
    }
    candidate.Type = newType;
  }
  if (data.Description || data.description) {
    candidate.Description = data.Description || data.description;
  }
  if (data.FlowType || data.flowType) {
    const newFlowType = data.FlowType || data.flowType;
    if (!findFlowType(newFlowType)) {
      throw new Error(`FlowType '${newFlowType}' does not exist in ExFlowType`);
    }
    candidate.FlowType = newFlowType;
  }
  if (data.RelatedParty || data.relatedParty) {
    const newParty = data.RelatedParty || data.relatedParty;
    if (!findParty(newParty)) {
      throw new Error(`RelatedParty '${newParty}' does not exist in ExRelatedParty`);
    }
    candidate.RelatedParty = newParty;
  }
  if (data.Amount !== undefined || data.amount !== undefined) {
    candidate.Amount = parsePositiveAmount(data.Amount ?? data.amount);
  }
  if (data.RelatedID !== undefined || data.relatedId !== undefined) {
    const newRelatedId = String(data.RelatedID ?? data.relatedId ?? '');
    if (newRelatedId) {
      const ids = newRelatedId.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
      for (const rid of ids) {
        const exists = transactions.find((t, i) => i !== index && (t.ID || t.id) === rid);
        if (!exists) {
          throw new Error(`RelatedID ${rid} does not reference an existing external transaction`);
        }
      }
    }
    candidate.RelatedID = newRelatedId;
  }

  transactions[index] = candidate;
  markDirty();
  return candidate;
}

/**
 * Delete an external transaction.
 * Edit window enforced based on FlowDate.
 *
 * @param {number} id - Transaction ID
 * @throws {Error} If not found or outside edit window
 */
export function delete_(id) {
  const transactions = getExternalTransactions();
  const index = transactions.findIndex((t) => (t.ID || t.id) === id);

  if (index === -1) {
    throw new Error(`External transaction with ID ${id} not found`);
  }

  const txn = transactions[index];
  const flowDate = txn.FlowDate || txn.flowDate;

  if (!isEditable(flowDate)) {
    throw new Error(`External transaction dated ${flowDate} is outside the editable window`);
  }

  transactions.splice(index, 1);
  markDirty();
}

export default { getAll, getById, create, update, delete_ };
