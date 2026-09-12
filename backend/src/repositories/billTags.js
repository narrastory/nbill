import { getBillTags, getTransactions, markDirty } from '../store/engine.js';

/**
 * Repository for BillTags table.
 * Rules: can add new, can rename, CANNOT delete.
 * Tag names must be unique.
 */

/**
 * Get all bill tags, optionally filtered by AppliesTo.
 * @param {string} [appliesTo] - Optional: 'Expense', 'Income', or 'Both'
 * @returns {Array} Array of tag objects
 */
export function getAll(appliesTo) {
  const tags = getBillTags();
  if (appliesTo) {
    return tags.filter(
      (t) => (t.AppliesTo || t.appliesTo) === appliesTo,
    );
  }
  return [...tags];
}

/**
 * Add a new tag.
 * @param {object} data - { Tag, Description, AppliesTo }
 * @returns {object} Created tag
 * @throws {Error} If validation fails or duplicate
 */
export function create(data) {
  const tag = data.Tag || data.tag;
  const description = data.Description || data.description || '';
  const appliesTo = data.AppliesTo || data.appliesTo || 'Both';

  if (!tag || !tag.trim()) {
    throw new Error('Tag name is required');
  }
  if (!['Expense', 'Income', 'Both'].includes(appliesTo)) {
    throw new Error('AppliesTo must be "Expense", "Income", or "Both"');
  }

  const tags = getBillTags();
  const duplicate = tags.find(
    (t) => (t.Tag === tag || t.tag === tag),
  );
  if (duplicate) {
    throw new Error(`Tag '${tag}' already exists`);
  }

  const newTag = { Tag: tag, Description: description, AppliesTo: appliesTo };
  tags.push(newTag);
  markDirty();
  return newTag;
}

/**
 * Rename a tag. Cascades the rename to all Transactions that use this tag.
 * @param {string} oldTagName - Current tag name
 * @param {object} updates - { newTag?, newDescription?, newAppliesTo? }
 * @returns {object} Updated tag
 * @throws {Error} If not found
 */
export function update(oldTagName, updates) {
  const tags = getBillTags();
  const index = tags.findIndex(
    (t) => (t.Tag === oldTagName || t.tag === oldTagName),
  );

  if (index === -1) {
    throw new Error(`Tag '${oldTagName}' not found`);
  }

  const newTagName = updates.newTag || updates.NewTag || updates.Tag;
  const newDescription = updates.newDescription || updates.NewDescription || updates.Description;
  const newAppliesTo = updates.newAppliesTo || updates.NewAppliesTo || updates.AppliesTo;

  // Validate new tag name uniqueness if renaming
  if (newTagName && newTagName !== oldTagName) {
    const duplicate = tags.find(
      (t, i) => i !== index && (t.Tag === newTagName || t.tag === newTagName),
    );
    if (duplicate) {
      throw new Error(`Tag '${newTagName}' already exists`);
    }
  }

  if (newTagName) {
    tags[index].Tag = newTagName;
  }
  if (newDescription !== undefined) {
    tags[index].Description = newDescription;
  }
  if (newAppliesTo) {
    tags[index].AppliesTo = newAppliesTo;
  }

  // Cascade rename to transactions
  if (newTagName && newTagName !== oldTagName) {
    const transactions = getTransactions();
    for (const txn of transactions) {
      const txnTag = txn.Tag || txn.tag;
      if (txnTag) {
        const tagList = txnTag.split(',').map((t) => t.trim());
        const idx = tagList.indexOf(oldTagName);
        if (idx !== -1) {
          tagList[idx] = newTagName;
          txn.Tag = tagList.join(',');
        }
      }
    }
  }

  markDirty();
  return tags[index];
}

/**
 * Find a tag by name.
 */
export function findByName(tagName) {
  const tags = getBillTags();
  return tags.find((t) => (t.Tag === tagName || t.tag === tagName)) || null;
}

export default { getAll, create, update, findByName };
