import { isValidDateString } from '../validation.js';

function localDateString(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function requireDate(value, fieldName) {
  if (!isValidDateString(value)) {
    throw new Error(`${fieldName} must be a valid date in YYYY-MM-DD format`);
  }
  return value;
}

export function parseAnalyticsRange(query = {}, today = localDateString()) {
  const currentDate = typeof today === 'string' ? requireDate(today, 'today') : localDateString(today);
  const dateFrom = query.dateFrom === undefined || query.dateFrom === ''
    ? null
    : requireDate(query.dateFrom, 'dateFrom');
  const dateTo = query.dateTo === undefined || query.dateTo === ''
    ? currentDate
    : requireDate(query.dateTo, 'dateTo');

  if (dateTo > currentDate) throw new Error('dateTo cannot be in the future');
  if (dateFrom && dateFrom > dateTo) throw new Error('dateFrom cannot be later than dateTo');
  return { dateFrom, dateTo };
}

export function filterRecordsByRange(records, getDate, range) {
  return records.filter((record) => {
    const date = getDate(record);
    return isValidDateString(date)
      && (!range.dateFrom || date >= range.dateFrom)
      && date <= range.dateTo;
  });
}

function amountCents(record) {
  const amount = Number(record.Amount ?? record.amount);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function ordinaryChangeCents(record) {
  const type = record.Type ?? record.type;
  if (type === 'Income') return amountCents(record);
  if (type === 'Expense') return -amountCents(record);
  return 0;
}

function externalChangeCents(record) {
  const type = record.Type ?? record.type;
  if (type === 'IN') return amountCents(record);
  if (type === 'OUT') return -amountCents(record);
  return 0;
}

function centsToAmount(cents) {
  return Math.round(cents) / 100;
}

export function computeCashWindow({
  transactions,
  externalTransactions,
  initialBalance,
  range,
}) {
  let openingCents = Math.round(Number(initialBalance) * 100);
  let operatingCents = 0;
  let externalCents = 0;

  for (const record of transactions) {
    const date = record.BillDate ?? record.billDate;
    if (!isValidDateString(date) || date > range.dateTo) continue;
    const change = ordinaryChangeCents(record);
    if (range.dateFrom && date < range.dateFrom) openingCents += change;
    else operatingCents += change;
  }

  for (const record of externalTransactions) {
    const date = record.FlowDate ?? record.flowDate;
    if (!isValidDateString(date) || date > range.dateTo) continue;
    const change = externalChangeCents(record);
    if (range.dateFrom && date < range.dateFrom) openingCents += change;
    else externalCents += change;
  }

  return {
    openingCashBalance: centsToAmount(openingCents),
    closingCashBalance: centsToAmount(openingCents + operatingCents + externalCents),
    operatingChange: centsToAmount(operatingCents),
    externalChange: centsToAmount(externalCents),
  };
}

export default { computeCashWindow, filterRecordsByRange, parseAnalyticsRange };
