/**
 * Shared validation for persisted accounting values.
 */

export function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

export function validateTransactionDate(value, fieldName = 'Date') {
  if (!isValidDateString(value)) {
    throw new Error(`${fieldName} is required and must be a valid date in YYYY-MM-DD format`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const recordDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (recordDate.getTime() > today.getTime()) {
    throw new Error(`${fieldName} cannot be in the future`);
  }

  return value;
}

export function parsePositiveAmount(value, fieldName = 'Amount') {
  if (value === '' || value === null || value === undefined) {
    throw new Error(`${fieldName} must be a positive number`);
  }

  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }

  return amount;
}

export function dateStringToLocalMidnight(value) {
  if (!isValidDateString(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export default {
  isValidDateString,
  validateTransactionDate,
  parsePositiveAmount,
  dateStringToLocalMidnight,
};
