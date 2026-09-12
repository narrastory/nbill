import { getExRelatedParty, getExternalTransactions, markDirty } from '../store/engine.js';

/**
 * Repository for ExRelatedParty table (encrypted).
 * Rules: can add new, can rename, CANNOT delete.
 * RelatedParty names must be unique.
 */

/**
 * Get all related parties.
 * @returns {Array<{Relatedparty: string}>}
 */
export function getAll() {
  return [...getExRelatedParty()];
}

/**
 * Add a new related party.
 * @param {object} data - { Relatedparty: string }
 * @returns {object} Created related party
 * @throws {Error} If duplicate or validation fails
 */
export function create(data) {
  const relatedparty = data.Relatedparty || data.relatedparty;

  if (!relatedparty || !relatedparty.trim()) {
    throw new Error('Relatedparty is required');
  }

  const parties = getExRelatedParty();
  const duplicate = parties.find(
    (p) => (p.Relatedparty === relatedparty || p.relatedparty === relatedparty),
  );
  if (duplicate) {
    throw new Error(`Related party '${relatedparty}' already exists`);
  }

  const newParty = { Relatedparty: relatedparty };
  parties.push(newParty);
  markDirty();
  return newParty;
}

/**
 * Rename a related party. Cascades to all ExternalTransactions.
 * @param {string} oldName - Current related party name
 * @param {object} updates - { newRelatedparty: string }
 * @returns {object} Updated related party
 * @throws {Error} If not found
 */
export function update(oldName, updates) {
  const parties = getExRelatedParty();
  const index = parties.findIndex(
    (p) => (p.Relatedparty === oldName || p.relatedparty === oldName),
  );

  if (index === -1) {
    throw new Error(`Related party '${oldName}' not found`);
  }

  const newName = updates.newRelatedparty || updates.NewRelatedparty ||
                  updates.Relatedparty || updates.relatedparty;

  if (!newName || !newName.trim()) {
    throw new Error('New related party name is required');
  }

  // Check uniqueness
  if (newName !== oldName) {
    const duplicate = parties.find(
      (p, i) => i !== index && (p.Relatedparty === newName || p.relatedparty === newName),
    );
    if (duplicate) {
      throw new Error(`Related party '${newName}' already exists`);
    }
  }

  parties[index].Relatedparty = newName;

  // Cascade rename to external transactions
  const externalTxn = getExternalTransactions();
  for (const txn of externalTxn) {
    if ((txn.RelatedParty || txn.relatedParty) === oldName) {
      txn.RelatedParty = newName;
    }
  }

  markDirty();
  return parties[index];
}

/**
 * Find a related party by name.
 */
export function findByName(name) {
  const parties = getExRelatedParty();
  return parties.find((p) => (p.Relatedparty === name || p.relatedparty === name)) || null;
}

export default { getAll, create, update, findByName };
