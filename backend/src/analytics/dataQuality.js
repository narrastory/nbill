import { isValidDateString } from '../validation.js';

function normalizedId(record) {
  return Number(record?.ID ?? record?.id);
}

function positiveAmount(record) {
  const raw = record?.Amount ?? record?.amount;
  const amount = raw === '' || raw === null || raw === undefined ? NaN : Number(raw);
  return Number.isFinite(amount) && amount > 0;
}

function splitValues(value) {
  return String(value ?? '')
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function inspectDataQuality({
  transactions = [],
  externalTransactions = [],
  billCategories = [],
  billTags = [],
  exFlowType = [],
  exRelatedParty = [],
  counters = {},
  checkedAt = new Date().toISOString(),
} = {}) {
  const issues = [];
  const add = (severity, code, table, index, id, message) => {
    issues.push({ severity, code, table, index, id: id ?? null, message });
  };
  const categoryKeys = new Set(billCategories.map((item) => (
    `${item.Type ?? item.type}|${item.Category ?? item.category}|${item.Subcategory ?? item.subcategory}`
  )));
  const tags = new Set(billTags.map((item) => String(item.Tag ?? item.tag ?? '').trim()).filter(Boolean));
  const flowTypes = new Set(exFlowType.map((item) => String(item.Flowtype ?? item.flowType ?? '').trim()).filter(Boolean));
  const parties = new Set(exRelatedParty.map((item) => String(item.Relatedparty ?? item.relatedParty ?? '').trim()).filter(Boolean));

  function inspectIds(records, table) {
    const seen = new Set();
    records.forEach((record, index) => {
      const id = normalizedId(record);
      if (!Number.isInteger(id) || id <= 0) {
        add('error', 'INVALID_ID', table, index, record?.ID ?? record?.id, 'ID must be a positive integer');
        return;
      }
      if (seen.has(id)) add('error', 'DUPLICATE_ID', table, index, id, `ID ${id} is duplicated`);
      seen.add(id);
    });
    return seen;
  }

  const transactionIds = inspectIds(transactions, 'transactions');
  const externalIds = inspectIds(externalTransactions, 'externalTransactions');

  transactions.forEach((record, index) => {
    const id = normalizedId(record);
    const type = record.Type ?? record.type;
    const date = record.BillDate ?? record.billDate;
    if (!['Income', 'Expense'].includes(type)) {
      add('error', 'INVALID_TYPE', 'transactions', index, id, 'Type must be Income or Expense');
    }
    if (!isValidDateString(date)) {
      add('error', 'INVALID_DATE', 'transactions', index, id, 'BillDate must be a valid YYYY-MM-DD date');
    }
    if (!positiveAmount(record)) {
      add('error', 'INVALID_AMOUNT', 'transactions', index, id, 'Amount must be a positive number');
    }
    const categoryKey = `${type}|${record.Category ?? record.category}|${record.Subcategory ?? record.subcategory}`;
    if (!categoryKeys.has(categoryKey)) {
      add('error', 'UNKNOWN_CATEGORY', 'transactions', index, id, 'Category and subcategory do not exist for this type');
    }
    for (const tag of splitValues(record.Tag ?? record.tag)) {
      if (!tags.has(tag)) add('error', 'UNKNOWN_TAG', 'transactions', index, id, `Unknown tag: ${tag}`);
    }
  });

  externalTransactions.forEach((record, index) => {
    const id = normalizedId(record);
    const type = record.Type ?? record.type;
    const date = record.FlowDate ?? record.flowDate;
    if (!['IN', 'OUT'].includes(type)) {
      add('error', 'INVALID_TYPE', 'externalTransactions', index, id, 'Type must be IN or OUT');
    }
    if (!isValidDateString(date)) {
      add('error', 'INVALID_DATE', 'externalTransactions', index, id, 'FlowDate must be a valid YYYY-MM-DD date');
    }
    if (!positiveAmount(record)) {
      add('error', 'INVALID_AMOUNT', 'externalTransactions', index, id, 'Amount must be a positive number');
    }
    const flowType = String(record.FlowType ?? record.flowType ?? '').trim();
    if (!flowTypes.has(flowType)) {
      add('error', 'UNKNOWN_FLOW_TYPE', 'externalTransactions', index, id, `Unknown flow type: ${flowType}`);
    }
    const party = String(record.RelatedParty ?? record.relatedParty ?? '').trim();
    if (!parties.has(party)) {
      add('error', 'UNKNOWN_RELATED_PARTY', 'externalTransactions', index, id, `Unknown related party: ${party}`);
    }
    for (const relatedId of splitValues(record.RelatedID ?? record.relatedId)) {
      const numericId = Number(relatedId);
      if (!Number.isInteger(numericId) || numericId <= 0 || !externalIds.has(numericId)) {
        add('error', 'DANGLING_RELATED_ID', 'externalTransactions', index, id, `Related ID does not exist: ${relatedId}`);
      }
    }
  });

  for (const [table, ids] of [
    ['transactions', transactionIds],
    ['externalTransactions', externalIds],
  ]) {
    const maxId = ids.size > 0 ? Math.max(...ids) : 0;
    const counter = Number(counters[table] ?? 0);
    if (!Number.isInteger(counter) || counter < maxId) {
      add('warning', 'COUNTER_BEHIND', table, null, null, `Counter ${counter} is behind maximum ID ${maxId}`);
    }
  }

  const error = issues.filter((issue) => issue.severity === 'error').length;
  const warning = issues.filter((issue) => issue.severity === 'warning').length;
  return {
    healthy: error === 0,
    checkedAt,
    summary: { error, warning, total: issues.length },
    issues,
  };
}

export default { inspectDataQuality };
