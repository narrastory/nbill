import { getTransactions, markDirty, isEditable } from '../store/engine.js';
import { getNextId } from '../store/idCounter.js';
import { findByCategoryAndSubcategory } from './billCategories.js';
import { findByName as findTag } from './billTags.js';
import { validateTransactionDate, parsePositiveAmount } from '../validation.js';

/**
 * Repository for Transactions table (encrypted).
 * CRUD operations with search, validation, and edit window enforcement.
 */

/**
 * Search and list transactions with filtering and pagination.
 *
 * @param {object} filters - Query filters (all optional):
 *   type, category, subcategory, tag, description,
 *   amountMin, amountMax, dateFrom, dateTo,
 *   page (default 1), limit (default 100),
 *   sortBy (default 'billDate'), sortOrder (default 'desc')
 * @returns {{ data: Array, total: number, page: number, limit: number }}
 */
export function getAll(filters = {}) {
  let transactions = [...getTransactions()];

  // ── Filters ──
  if (filters.type) {
    transactions = transactions.filter(
      (t) => (t.Type || t.type) === filters.type,
    );
  }
  if (filters.category) {
    transactions = transactions.filter(
      (t) => (t.Category || t.category) === filters.category,
    );
  }
  if (filters.subcategory) {
    transactions = transactions.filter(
      (t) => (t.Subcategory || t.subcategory) === filters.subcategory,
    );
  }
  if (filters.tag) {
    transactions = transactions.filter((t) => {
      const tagStr = t.Tag || t.tag || '';
      return tagStr.split(',').some((tag) => tag.trim() === filters.tag);
    });
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
      (t) => (t.BillDate || t.billDate) >= filters.dateFrom,
    );
  }
  if (filters.dateTo) {
    transactions = transactions.filter(
      (t) => (t.BillDate || t.billDate) <= filters.dateTo,
    );
  }

  // ── Sort ──
  const sortBy = filters.sortBy || 'BillDate';
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

  return { data, total, page, limit };
}

/**
 * Get a single transaction by ID.
 */
export function getById(id) {
  const transactions = getTransactions();
  return transactions.find((t) => (t.ID || t.id) === id) || null;
}

/**
 * Create a new transaction.
 *
 * @param {object} data - { Type, BillDate, Category, Subcategory, Description, Tag?, Amount, Notes? }
 * @returns {object} Created transaction
 * @throws {Error} If validation fails
 */
export function create(data) {
  const type = data.Type || data.type;
  const billDate = data.BillDate || data.billDate;
  const category = data.Category || data.category;
  const subcategory = data.Subcategory || data.subcategory;
  const description = data.Description || data.description;
  const tag = data.Tag || data.tag || '';
  const amount = parsePositiveAmount(data.Amount ?? data.amount);
  const notes = data.Notes || data.notes || '';

  // ── Validate required fields ──
  if (!type || !['Expense', 'Income'].includes(type)) {
    throw new Error('Type must be "Expense" or "Income"');
  }
  validateTransactionDate(billDate, 'BillDate');
  if (!category || !category.trim()) {
    throw new Error('Category is required');
  }
  if (!subcategory || !subcategory.trim()) {
    throw new Error('Subcategory is required');
  }
  if (!description || !description.trim()) {
    throw new Error('Description is required');
  }
  // ── Validate category exists ──
  const catExists = findByCategoryAndSubcategory(category, subcategory);
  if (!catExists) {
    throw new Error(`Category '${category}/${subcategory}' does not exist in BillCategories`);
  }

  // ── Validate tags exist ──
  if (tag) {
    const tagList = tag.split(',').map((t) => t.trim()).filter(Boolean);
    for (const t of tagList) {
      if (!findTag(t)) {
        throw new Error(`Tag '${t}' does not exist in BillTags`);
      }
    }
  }

  // ── Create record ──
  const id = getNextId('transactions');
  const newTransaction = {
    ID: id,
    Type: type,
    BillDate: billDate,
    Category: category,
    Subcategory: subcategory,
    Description: description,
    Tag: tag,
    Amount: amount,
    Notes: notes,
  };

  const transactions = getTransactions();
  transactions.push(newTransaction);
  markDirty();

  return newTransaction;
}

/**
 * Update an existing transaction.
 * Only allowed within the edit window (based on BillDate).
 * BillDate cannot be changed on update to prevent circumventing edit window.
 *
 * @param {number} id - Transaction ID
 * @param {object} data - Fields to update
 * @returns {object} Updated transaction
 * @throws {Error} If not found, outside edit window, or validation fails
 */
export function update(id, data, { allowHistoricalEdit = false } = {}) {
  const transactions = getTransactions();
  const index = transactions.findIndex((t) => (t.ID || t.id) === id);

  if (index === -1) {
    throw new Error(`Transaction with ID ${id} not found`);
  }

  const txn = transactions[index];
  const billDate = txn.BillDate || txn.billDate;

  // ── Edit window check ──
  if (!allowHistoricalEdit && !isEditable(billDate)) {
    throw new Error(`Transaction dated ${billDate} is outside the editable window`);
  }

  // Apply and validate changes on a copy so failed validation cannot
  // leave a partially-mutated live record in memory.
  const candidate = { ...txn };

  // ── Apply updates (but NOT BillDate) ──
  if (data.Type || data.type) {
    const newType = data.Type || data.type;
    if (!['Expense', 'Income'].includes(newType)) {
      throw new Error('Type must be "Expense" or "Income"');
    }
    candidate.Type = newType;
  }
  if (data.Category || data.category) {
    candidate.Category = data.Category || data.category;
  }
  if (data.Subcategory || data.subcategory) {
    candidate.Subcategory = data.Subcategory || data.subcategory;
  }
  if (data.Description || data.description) {
    candidate.Description = data.Description || data.description;
  }
  if (data.Tag !== undefined || data.tag !== undefined) {
    const newTag = data.Tag ?? data.tag ?? '';
    if (newTag) {
      const tagList = newTag.split(',').map((t) => t.trim()).filter(Boolean);
      for (const t of tagList) {
        if (!findTag(t)) {
          throw new Error(`Tag '${t}' does not exist in BillTags`);
        }
      }
    }
    candidate.Tag = newTag;
  }
  if (data.Amount !== undefined || data.amount !== undefined) {
    candidate.Amount = parsePositiveAmount(data.Amount ?? data.amount);
  }
  if (data.Notes !== undefined || data.notes !== undefined) {
    candidate.Notes = data.Notes ?? data.notes ?? '';
  }

  // Validate updated category/subcategory
  const checkCategory = candidate.Category || candidate.category;
  const checkSubcategory = candidate.Subcategory || candidate.subcategory;
  const catExists = findByCategoryAndSubcategory(checkCategory, checkSubcategory);
  if (!catExists) {
    throw new Error(`Category '${checkCategory}/${checkSubcategory}' does not exist in BillCategories`);
  }

  transactions[index] = candidate;
  markDirty();
  return candidate;
}

/**
 * Delete a transaction.
 * Only allowed within the edit window.
 *
 * @param {number} id - Transaction ID
 * @throws {Error} If not found or outside edit window
 */
export function delete_(id) {
  const transactions = getTransactions();
  const index = transactions.findIndex((t) => (t.ID || t.id) === id);

  if (index === -1) {
    throw new Error(`Transaction with ID ${id} not found`);
  }

  const txn = transactions[index];
  const billDate = txn.BillDate || txn.billDate;

  // ── Edit window check ──
  if (!isEditable(billDate)) {
    throw new Error(`Transaction dated ${billDate} is outside the editable window`);
  }

  transactions.splice(index, 1);
  markDirty();
}

export default { getAll, getById, create, update, delete_ };
