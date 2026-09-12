import { expect } from 'chai';
import {
  computeCashWindow,
  filterRecordsByRange,
  parseAnalyticsRange,
} from '../src/analytics/range.js';

describe('Analytics date range and cash window', function () {
  it('includes both boundaries and carries prior cash into opening balance', function () {
    const range = parseAnalyticsRange(
      { dateFrom: '2026-09-01', dateTo: '2026-09-30' },
      '2026-09-30',
    );
    const transactions = [
      { Type: 'Income', BillDate: '2026-08-31', Amount: 100 },
      { Type: 'Income', BillDate: '2026-09-01', Amount: 500 },
      { Type: 'Expense', BillDate: '2026-09-30', Amount: 200 },
      { Type: 'Expense', BillDate: '2026-10-01', Amount: 999 },
    ];
    const externalTransactions = [
      { Type: 'OUT', FlowDate: '2026-08-15', Amount: 50 },
      { Type: 'OUT', FlowDate: '2026-09-10', Amount: 300 },
      { Type: 'IN', FlowDate: '2026-09-20', Amount: 100 },
    ];

    expect(filterRecordsByRange(transactions, (record) => record.BillDate, range))
      .to.deep.equal([transactions[1], transactions[2]]);
    expect(computeCashWindow({
      initialBalance: 1000,
      range,
      transactions,
      externalTransactions,
    })).to.deep.equal({
      openingCashBalance: 1050,
      closingCashBalance: 1150,
      operatingChange: 300,
      externalChange: -200,
    });
  });

  it('defaults dateTo to today and keeps an omitted dateFrom open-ended', function () {
    expect(parseAnalyticsRange({}, '2026-09-11')).to.deep.equal({
      dateFrom: null,
      dateTo: '2026-09-11',
    });
  });

  it('rejects invalid, future, and reversed ranges', function () {
    expect(() => parseAnalyticsRange({ dateFrom: '2026-02-30' }, '2026-09-11')).to.throw('dateFrom');
    expect(() => parseAnalyticsRange({ dateTo: '2026-09-12' }, '2026-09-11')).to.throw('future');
    expect(() => parseAnalyticsRange(
      { dateFrom: '2026-09-10', dateTo: '2026-09-01' },
      '2026-09-11',
    )).to.throw('dateFrom');
  });
});
