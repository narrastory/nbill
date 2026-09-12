import { getExFlowType, getExternalTransactions, markDirty } from '../store/engine.js';

/**
 * Repository for ExFlowType table.
 * Rules: can add new, can rename, CANNOT delete.
 * FlowType names must be unique.
 */

/**
 * Get all flow types.
 * @returns {Array<{Flowtype: string}>}
 */
export function getAll() {
  return [...getExFlowType()];
}

/**
 * Add a new flow type.
 * @param {object} data - { Flowtype: string }
 * @returns {object} Created flow type
 * @throws {Error} If duplicate or validation fails
 */
export function create(data) {
  const flowtype = data.Flowtype || data.flowtype;

  if (!flowtype || !flowtype.trim()) {
    throw new Error('Flowtype is required');
  }

  const flowTypes = getExFlowType();
  const duplicate = flowTypes.find(
    (f) => (f.Flowtype === flowtype || f.flowtype === flowtype),
  );
  if (duplicate) {
    throw new Error(`Flow type '${flowtype}' already exists`);
  }

  const newFlowType = { Flowtype: flowtype };
  flowTypes.push(newFlowType);
  markDirty();
  return newFlowType;
}

/**
 * Rename a flow type. Cascades to all ExternalTransactions.
 * @param {string} oldName - Current flow type name
 * @param {object} updates - { newFlowtype: string }
 * @returns {object} Updated flow type
 * @throws {Error} If not found
 */
export function update(oldName, updates) {
  const flowTypes = getExFlowType();
  const index = flowTypes.findIndex(
    (f) => (f.Flowtype === oldName || f.flowtype === oldName),
  );

  if (index === -1) {
    throw new Error(`Flow type '${oldName}' not found`);
  }

  const newName = updates.newFlowtype || updates.NewFlowtype || updates.Flowtype || updates.flowtype;

  if (!newName || !newName.trim()) {
    throw new Error('New flow type name is required');
  }

  // Check uniqueness
  if (newName !== oldName) {
    const duplicate = flowTypes.find(
      (f, i) => i !== index && (f.Flowtype === newName || f.flowtype === newName),
    );
    if (duplicate) {
      throw new Error(`Flow type '${newName}' already exists`);
    }
  }

  flowTypes[index].Flowtype = newName;

  // Cascade rename to external transactions
  const externalTxn = getExternalTransactions();
  for (const txn of externalTxn) {
    if ((txn.FlowType || txn.flowType) === oldName) {
      txn.FlowType = newName;
    }
  }

  markDirty();
  return flowTypes[index];
}

/**
 * Find a flow type by name.
 */
export function findByName(name) {
  const flowTypes = getExFlowType();
  return flowTypes.find((f) => (f.Flowtype === name || f.flowtype === name)) || null;
}

export default { getAll, create, update, findByName };
