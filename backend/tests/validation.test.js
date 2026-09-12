import { expect } from 'chai';
import {
  isValidDateString,
  validateTransactionDate,
  parsePositiveAmount,
} from '../src/validation.js';

function tomorrowString() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe('Shared validation', function () {
  it('accepts real calendar dates and rejects normalized invalid dates', function () {
    expect(isValidDateString('2024-02-29')).to.equal(true);
    expect(isValidDateString('2026-02-31')).to.equal(false);
    expect(isValidDateString('2026-13-01')).to.equal(false);
    expect(isValidDateString('2026-2-01')).to.equal(false);
  });

  it('rejects future transaction dates', function () {
    expect(() => validateTransactionDate(tomorrowString(), 'BillDate'))
      .to.throw('BillDate cannot be in the future');
  });

  it('parses complete positive numbers without accepting partial strings', function () {
    expect(parsePositiveAmount('12.50')).to.equal(12.5);
    expect(parsePositiveAmount(8)).to.equal(8);
    for (const invalid of ['12abc', '', 'Infinity', Infinity, 0, -1, null, undefined]) {
      expect(() => parsePositiveAmount(invalid)).to.throw('Amount must be a positive number');
    }
  });
});
