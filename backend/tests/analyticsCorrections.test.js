import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
process.env.NBILL_DATA_DIR = join(projectRoot, 'data_test');

import supertest from 'supertest';
import { expect } from 'chai';
import { initConfig } from '../src/config.js';
import { initLogger } from '../src/logger.js';
import { createApp } from '../src/server.js';
import { computeAnalytics, computeAnalyticsSummary } from '../src/analytics/engine.js';
import {
  getExternalTransactions,
  getTransactions,
  purge,
} from '../src/store/engine.js';
import {
  cleanup,
  dateOffsetString,
  seedTestData,
  TEST_PASSWORD,
  TEST_USERNAME,
} from './helpers.js';

describe('Corrected analytics formulas', function () {
  let request;

  before(async function () {
    await seedTestData();
    initConfig();
    initLogger();
    request = supertest(createApp());
  });

  beforeEach(async function () {
    await seedTestData();
    const login = await request.post('/api/auth/login').send({
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    expect(login.status).to.equal(200);
  });

  afterEach(function () {
    purge();
    cleanup();
  });

  it('separates operating income, opening cash, and external cash flow', function () {
    const result = computeAnalytics();
    expect(result.basicStats.overview).to.deep.equal({
      totalIncome: 2000,
      totalExpense: 60.5,
      netIncome: 1939.5,
      netBalance: 1939.5,
      initialBalance: 10000,
      openingCashBalance: 10000,
      externalIn: 500,
      externalOut: 1500,
      externalNetCashFlow: -1000,
      closingCashBalance: 10939.5,
      currentCashBalance: 10939.5,
    });
    expect(result.basicStats).not.to.have.property('externalProfit');
  });

  it('uses expense count as the monthly average denominator', function () {
    const result = computeAnalytics();
    const currentMonth = dateOffsetString().slice(0, 7);
    const month = result.monthlySummary.find((item) => item.yearMonth === currentMonth);
    expect(month).to.include({ expenseCount: 1, incomeCount: 1, avgPerExpense: 35.5 });
    expect(month).not.to.have.property('avgPerTransaction');
  });

  it('counts only expenses in weekday spending analysis', function () {
    const result = computeAnalytics();
    expect(result.bonus.dayOfWeek.reduce((sum, day) => sum + day.expenseCount, 0)).to.equal(2);
    expect(result.bonus.dayOfWeek.reduce((sum, day) => sum + day.expenseAmount, 0)).to.equal(60.5);
    expect(result.bonus.dayOfWeek.every((day) => 'averageExpense' in day)).to.equal(true);
  });

  it('returns null savings rate for a year with expenses but no income', function () {
    getTransactions().splice(0, getTransactions().length, {
      ID: 1,
      Type: 'Expense',
      BillDate: '2025-06-01',
      Category: '餐饮食品',
      Subcategory: '正餐',
      Description: 'Only expense',
      Tag: '',
      Amount: 100,
      Notes: '',
    });
    getExternalTransactions().splice(0);

    const result = computeAnalytics();
    const year = result.bonus.savingsRate.find((item) => item.year === 2025);
    expect(year.savingsRate).to.equal(null);
  });

  it('identifies the initial balance as the historical maximum when cash only falls', function () {
    getTransactions().splice(0, getTransactions().length, {
      ID: 1,
      Type: 'Expense',
      BillDate: '2025-06-01',
      Category: '餐饮食品',
      Subcategory: '正餐',
      Description: 'Expense',
      Tag: '',
      Amount: 100,
      Notes: '',
    });
    getExternalTransactions().splice(0);

    expect(computeAnalytics().basicStats.maxHistoricalCash).to.deep.equal({
      amount: 10000,
      date: null,
      source: 'initialBalance',
    });
  });

  it('includes the expense that crosses the Pareto 80 percent boundary', function () {
    getTransactions().splice(0, getTransactions().length,
      { ID: 1, Type: 'Expense', BillDate: '2025-01-01', Category: 'A', Subcategory: '70', Amount: 70 },
      { ID: 2, Type: 'Expense', BillDate: '2025-01-02', Category: 'A', Subcategory: '20', Amount: 20 },
      { ID: 3, Type: 'Expense', BillDate: '2025-01-03', Category: 'A', Subcategory: '10', Amount: 10 },
    );
    getExternalTransactions().splice(0);

    const pareto = computeAnalytics().bonus.pareto;
    expect(pareto.map(({ subcategory, isCore }) => ({ subcategory, isCore }))).to.deep.equal([
      { subcategory: '70', isCore: true },
      { subcategory: '20', isCore: true },
      { subcategory: '10', isCore: false },
    ]);
  });

  it('anchors the recent-category window to a historical dateTo', function () {
    getTransactions().splice(0, getTransactions().length, {
      ID: 1,
      Type: 'Expense',
      BillDate: '2020-12-15',
      Category: '餐饮食品',
      Subcategory: '正餐',
      Amount: 88,
    });
    getExternalTransactions().splice(0);

    const result = computeAnalytics({ range: { dateFrom: null, dateTo: '2020-12-31' } });
    expect(result.categoryAnalysis.timeWindow.endDate).to.equal('2020-12-31');
    expect(result.categoryAnalysis.byCategory).to.deep.include({
      name: '餐饮食品', type: 'Expense', recordCount: 1, totalAmount: 88,
    });
  });

  it('uses the requested summary period for both category amounts and percentages', function () {
    getTransactions().splice(0, getTransactions().length,
      { ID: 1, Type: 'Expense', BillDate: '2024-01-01', Category: '历史支出', Subcategory: '旧项目', Amount: 900 },
      { ID: 2, Type: 'Expense', BillDate: '2026-09-01', Category: '近期支出', Subcategory: '新项目', Amount: 100 },
    );
    getExternalTransactions().splice(0);

    const result = computeAnalyticsSummary({
      range: { dateFrom: null, dateTo: '2026-09-11' },
      now: '2026-09-11',
    });

    expect(result.topExpenseCategories).to.deep.equal([
      { category: '历史支出', amount: 900, percent: 90 },
      { category: '近期支出', amount: 100, percent: 10 },
    ]);
  });

  it('computes historical maximum from end-of-day balances', function () {
    getTransactions().splice(0, getTransactions().length,
      { ID: 1, Type: 'Income', BillDate: '2026-09-01', Category: '收入', Subcategory: '收入', Amount: 500 },
      { ID: 2, Type: 'Expense', BillDate: '2026-09-01', Category: '支出', Subcategory: '支出', Amount: 400 },
    );
    getExternalTransactions().splice(0);

    expect(computeAnalytics({
      range: { dateFrom: null, dateTo: '2026-09-11' },
    }).basicStats.maxHistoricalCash).to.deep.equal({
      amount: 10100,
      date: '2026-09-01',
      source: 'transaction',
    });
  });

  it('uses exactly twelve calendar months in the configured category window', function () {
    const result = computeAnalytics({
      range: { dateFrom: null, dateTo: '2026-09-11' },
    });

    expect(result.categoryAnalysis.timeWindow).to.deep.equal({
      months: 12,
      startDate: '2025-10-01',
      endDate: '2026-09-11',
    });
  });

  it('keeps twelve-month windows stable across month-end overflow and leap day', function () {
    const marchEnd = computeAnalytics({
      range: { dateFrom: null, dateTo: '2026-03-31' },
    });
    const leapDay = computeAnalytics({
      range: { dateFrom: null, dateTo: '2024-02-29' },
    });

    expect(marchEnd.categoryAnalysis.timeWindow.startDate).to.equal('2025-04-01');
    expect(leapDay.categoryAnalysis.timeWindow.startDate).to.equal('2023-03-01');
  });

  it('does not compare an incomplete month with complete months', function () {
    getTransactions().splice(0, getTransactions().length,
      { ID: 1, Type: 'Income', BillDate: '2026-08-10', Category: '收入', Subcategory: '收入', Amount: 1000 },
      { ID: 2, Type: 'Expense', BillDate: '2026-08-10', Category: '支出', Subcategory: '支出', Amount: 200 },
      { ID: 3, Type: 'Income', BillDate: '2026-09-05', Category: '收入', Subcategory: '收入', Amount: 500 },
      { ID: 4, Type: 'Expense', BillDate: '2026-09-05', Category: '支出', Subcategory: '支出', Amount: 100 },
    );
    getExternalTransactions().splice(0);

    const trends = computeAnalytics({
      range: { dateFrom: '2026-08-01', dateTo: '2026-09-11' },
    }).bonus.monthlyTrends;

    expect(trends.at(-1)).to.deep.equal({
      yearMonth: '2026-09',
      expenseMoM: null,
      incomeMoM: null,
      expenseYoY: null,
      incomeYoY: null,
    });
  });

  it('does not compare a complete month against an incomplete baseline month', function () {
    getTransactions().splice(0, getTransactions().length,
      { ID: 1, Type: 'Expense', BillDate: '2025-09-20', Category: '支出', Subcategory: '支出', Amount: 100 },
      { ID: 2, Type: 'Expense', BillDate: '2026-08-20', Category: '支出', Subcategory: '支出', Amount: 100 },
      { ID: 3, Type: 'Expense', BillDate: '2026-09-20', Category: '支出', Subcategory: '支出', Amount: 200 },
    );
    getExternalTransactions().splice(0);

    const trends = computeAnalytics({
      range: { dateFrom: '2025-09-15', dateTo: '2026-09-30' },
    }).bonus.monthlyTrends;
    const september2026 = trends.find((item) => item.yearMonth === '2026-09');

    expect(september2026.expenseYoY).to.equal(null);
  });

  it('does not compare a full month with a partial immediately preceding month', function () {
    getTransactions().splice(0, getTransactions().length,
      { ID: 1, Type: 'Expense', BillDate: '2026-08-20', Category: '支出', Subcategory: '支出', Amount: 100 },
      { ID: 2, Type: 'Expense', BillDate: '2026-09-20', Category: '支出', Subcategory: '支出', Amount: 200 },
    );
    getExternalTransactions().splice(0);

    const trends = computeAnalytics({
      range: { dateFrom: '2026-08-15', dateTo: '2026-09-30' },
    }).bonus.monthlyTrends;

    expect(trends.at(-1).expenseMoM).to.equal(null);
  });

  it('uses cent precision when equal historical peaks are reached differently', function () {
    getTransactions().splice(0, getTransactions().length,
      { ID: 1, Type: 'Income', BillDate: '2026-01-01', Category: '收入', Subcategory: '收入', Amount: 0.3 },
      { ID: 2, Type: 'Expense', BillDate: '2026-01-02', Category: '支出', Subcategory: '支出', Amount: 0.3 },
      { ID: 3, Type: 'Income', BillDate: '2026-01-03', Category: '收入', Subcategory: '收入', Amount: 0.1 },
      { ID: 4, Type: 'Income', BillDate: '2026-01-03', Category: '收入', Subcategory: '收入', Amount: 0.2 },
    );
    getExternalTransactions().splice(0);

    expect(computeAnalytics({
      range: { dateFrom: null, dateTo: '2026-01-31' },
    }).basicStats.maxHistoricalCash).to.deep.equal({
      amount: 10000.3,
      date: '2026-01-01',
      source: 'transaction',
    });
  });

  it('keeps same-named subcategories separate across parent categories', function () {
    getTransactions().splice(0, getTransactions().length,
      { ID: 1, Type: 'Expense', BillDate: '2026-01-01', Category: '分类A', Subcategory: '其它', Amount: 100 },
      { ID: 2, Type: 'Expense', BillDate: '2026-01-02', Category: '分类B', Subcategory: '其它', Amount: 50 },
    );
    getExternalTransactions().splice(0);

    const result = computeAnalytics({
      range: { dateFrom: '2026-01-01', dateTo: '2026-01-31' },
    });

    expect(result.bonus.pareto.map(({ category, subcategory, amount }) => ({ category, subcategory, amount })))
      .to.deep.equal([
        { category: '分类A', subcategory: '其它', amount: 100 },
        { category: '分类B', subcategory: '其它', amount: 50 },
      ]);
    expect(result.bonus.frequencyAmount.map(({ category, subcategory, totalAmount }) => ({ category, subcategory, totalAmount })))
      .to.deep.equal([
        { category: '分类A', subcategory: '其它', totalAmount: 100 },
        { category: '分类B', subcategory: '其它', totalAmount: 50 },
      ]);
  });

  it('does not collide when category names contain the key separator', function () {
    getTransactions().splice(0, getTransactions().length,
      { ID: 1, Type: 'Expense', BillDate: '2026-01-01', Category: 'A|B', Subcategory: 'C', Amount: 100 },
      { ID: 2, Type: 'Expense', BillDate: '2026-01-02', Category: 'A', Subcategory: 'B|C', Amount: 50 },
    );
    getExternalTransactions().splice(0);

    const result = computeAnalytics({
      range: { dateFrom: '2026-01-01', dateTo: '2026-01-31' },
    });

    expect(result.bonus.pareto).to.have.length(2);
    expect(result.bonus.frequencyAmount).to.have.length(2);
  });
});
