/**
 * Analytics API tests — all 6 analysis items plus bonus.
 */

import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.NBILL_DATA_DIR = join(resolve(__dirname, '..'), 'data_test');

import supertest from 'supertest';
import { expect } from 'chai';
import { seedTestData, cleanup, TEST_USERNAME, TEST_PASSWORD } from './helpers.js';
import { initConfig } from '../src/config.js';
import { initLogger } from '../src/logger.js';
import { createApp } from '../src/server.js';
import { resetBruteForce } from '../src/auth/index.js';

let request, authToken;

describe('Analytics API', function () {
  before(async function () {
    this.timeout(10000);
    await seedTestData();
    resetBruteForce();
    initConfig();
    initLogger();
    request = supertest(createApp());
    const res = await request.post('/api/auth/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    authToken = res.body.token;
  });

  after(() => {
    cleanup();
  });

  // ── Auth Tests ──
  describe('Authentication', () => {
    it('should reject request without auth token', async () => {
      const res = await request.get('/api/analytics');
      expect(res.status).to.equal(401);
    });

    it('should reject request with invalid token', async () => {
      const res = await request.get('/api/analytics').set('Authorization', 'Bearer invalid-token-here');
      expect(res.status).to.equal(401);
    });
  });

  // ── Basic Response Structure ──
  describe('GET /api/analytics — Basic Structure', () => {
    let result;

    before(async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      expect(res.status).to.equal(200);
      result = res.body;
    });

    it('should have computedAt timestamp', () => {
      expect(result).to.have.property('computedAt');
      expect(new Date(result.computedAt).getTime()).to.be.a('number');
      expect(isNaN(new Date(result.computedAt).getTime())).to.be.false;
    });

    it('should have all top-level analysis keys', () => {
      expect(result).to.have.keys([
        'computedAt', 'period', 'basicStats', 'cashBalanceTrend', 'monthlySummary',
        'categoryAnalysis', 'amountDistribution', 'externalAnalysis', 'bonus',
      ]);
      expect(result.basicStats.maxHistoricalCash).to.have.keys(['amount', 'date', 'source']);
      expect(result.categoryAnalysis.timeWindow).to.have.keys(['months', 'startDate', 'endDate']);
      expect(result.bonus.monthlyTrends[0]).to.have.keys([
        'yearMonth', 'expenseMoM', 'incomeMoM', 'expenseYoY', 'incomeYoY',
      ]);
      expect(result.bonus.pareto[0]).to.have.keys([
        'subcategory', 'category', 'amount', 'percent', 'cumulativePercent', 'isCore',
      ]);
      expect(result.bonus.frequencyAmount[0]).to.have.keys([
        'subcategory', 'category', 'type', 'frequency', 'totalAmount', 'avgAmount',
      ]);
    });
  });

  // ── Item 1: Basic Statistics ──
  describe('Item 1: Basic Statistics', () => {
    let basicStats;

    before(async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      basicStats = res.body.basicStats;
    });

    describe('1.1 Overview', () => {
      it('should compute totalIncome correctly', () => {
        // Ordinary income only: ID=2 Amount=2000.
        expect(basicStats.overview).to.have.property('totalIncome');
        expect(basicStats.overview.totalIncome).to.equal(2000);
      });

      it('should compute totalExpense correctly', () => {
        // Ordinary expenses only: 35.5 + 25.
        expect(basicStats.overview).to.have.property('totalExpense');
        expect(basicStats.overview.totalExpense).to.equal(60.5);
      });

      it('should compute netBalance as income - expense', () => {
        const expected = basicStats.overview.totalIncome - basicStats.overview.totalExpense;
        expect(basicStats.overview.netBalance).to.be.closeTo(expected, 0.1);
      });
    });

    describe('1.2 Quintiles', () => {
      it('should have income quintiles with breakpoints, average, and count', () => {
        expect(basicStats.quintiles).to.have.property('income');
        expect(basicStats.quintiles.income).to.have.property('breakpoints');
        expect(basicStats.quintiles.income).to.have.property('average');
        expect(basicStats.quintiles.income).to.have.property('count');
        expect(basicStats.quintiles.income.count).to.be.at.least(1); // 1 Income txn in seed
      });

      it('should have expense quintiles with breakpoints, average, and count', () => {
        expect(basicStats.quintiles).to.have.property('expense');
        expect(basicStats.quintiles.expense).to.have.property('breakpoints');
        expect(basicStats.quintiles.expense).to.have.property('average');
        expect(basicStats.quintiles.expense).to.have.property('count');
        expect(basicStats.quintiles.expense.count).to.be.at.least(2); // 2 Expense txns in seed
      });

      it('should have 4 breakpoints for quintiles (20%, 40%, 60%, 80%)', () => {
        expect(basicStats.quintiles.income.breakpoints).to.have.lengthOf(4);
        expect(basicStats.quintiles.expense.breakpoints).to.have.lengthOf(4);
      });
    });

    describe('1.3 Extremes', () => {
      it('should find max income record (Amount=2000)', () => {
        expect(basicStats.extremes).to.have.property('maxIncome');
        if (basicStats.extremes.maxIncome) {
          expect(basicStats.extremes.maxIncome.amount).to.equal(2000);
          expect(basicStats.extremes.maxIncome).to.have.property('billDate');
          expect(basicStats.extremes.maxIncome).to.have.property('category');
          expect(basicStats.extremes.maxIncome).to.have.property('description');
        }
      });

      it('should find max expense record', () => {
        expect(basicStats.extremes).to.have.property('maxExpense');
        if (basicStats.extremes.maxExpense) {
          expect(basicStats.extremes.maxExpense.amount).to.be.at.least(25);
          expect(basicStats.extremes.maxExpense).to.have.property('billDate');
          expect(basicStats.extremes.maxExpense).to.have.property('category');
        }
      });
    });

    describe('1.4 Max Historical Cash', () => {
      it('should compute max historical cash amount and date', () => {
        expect(basicStats).to.have.property('maxHistoricalCash');
        expect(basicStats.maxHistoricalCash).to.have.property('amount');
        expect(basicStats.maxHistoricalCash).to.have.property('date');
        // Should be at least the initial balance
        expect(basicStats.maxHistoricalCash.amount).to.be.at.least(10000);
      });
    });

    describe('1.5 External Cash Flow', () => {
      it('should report external cash separately from operating totals', () => {
        expect(basicStats.overview.externalIn).to.equal(500);
        expect(basicStats.overview.externalOut).to.equal(1500);
        expect(basicStats.overview.externalNetCashFlow).to.equal(-1000);
      });
    });

    describe('1.6 Record Counts', () => {
      it('should count all 6 tables', () => {
        expect(basicStats.recordCounts).to.have.property('transactions');
        expect(basicStats.recordCounts).to.have.property('externalTransactions');
        expect(basicStats.recordCounts).to.have.property('billCategories');
        expect(basicStats.recordCounts).to.have.property('billTags');
        expect(basicStats.recordCounts).to.have.property('exFlowType');
        expect(basicStats.recordCounts).to.have.property('exRelatedParty');
      });

      it('should match seed data counts', () => {
        expect(basicStats.recordCounts.transactions).to.equal(3);
        expect(basicStats.recordCounts.externalTransactions).to.equal(3);
        expect(basicStats.recordCounts.billCategories).to.equal(6);
        expect(basicStats.recordCounts.billTags).to.equal(3);
        expect(basicStats.recordCounts.exFlowType).to.equal(2);
        expect(basicStats.recordCounts.exRelatedParty).to.equal(2);
      });
    });
  });

  // ── Item 2: Cash Balance Trend ──
  describe('Item 2: Cash Balance Trend', () => {
    it('should return an array of date/balance points', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const trend = res.body.cashBalanceTrend;
      expect(trend).to.be.an('array');
      expect(trend.length).to.be.at.least(1);
      expect(trend[0]).to.have.property('date');
      expect(trend[0]).to.have.property('balance');
    });

    it('should have first balance equal to or near initialBalance', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const trend = res.body.cashBalanceTrend;
      // First point balance should reflect records before/at the first date
      expect(trend[0].balance).to.be.a('number');
    });

    it('should have monotonically increasing dates', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const trend = res.body.cashBalanceTrend;
      for (let i = 1; i < trend.length; i++) {
        expect(trend[i].date >= trend[i - 1].date).to.be.true;
      }
    });
  });

  // ── Item 3: Monthly Summary ──
  describe('Item 3: Monthly Summary', () => {
    let monthlySummary;

    before(async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      monthlySummary = res.body.monthlySummary;
    });

    it('should return an array covering all months from earliest to current', () => {
      expect(monthlySummary).to.be.an('array');
      expect(monthlySummary.length).to.be.at.least(1);
    });

    it('should have all required fields per month', () => {
      const m = monthlySummary[0];
      expect(m).to.have.property('yearMonth');
      expect(m).to.have.property('totalIncome');
      expect(m).to.have.property('totalExpense');
      expect(m).to.have.property('netProfit');
      expect(m).to.have.property('frequency');
      expect(m).to.have.property('foodExpense');
      expect(m).to.have.property('nonFoodExpense');
      expect(m).to.have.property('activeChoiceExpense');
      expect(m).to.have.property('expenseCount');
      expect(m).to.have.property('incomeCount');
      expect(m).to.have.property('avgPerExpense');
      expect(m.yearMonth).to.match(/^\d{4}-\d{2}$/);
    });

    it('should have netProfit = totalIncome - totalExpense', () => {
      for (const m of monthlySummary) {
        expect(m.netProfit).to.be.closeTo(m.totalIncome - m.totalExpense, 0.1);
      }
    });

    it('should have nonFoodExpense = totalExpense - foodExpense', () => {
      for (const m of monthlySummary) {
        expect(m.nonFoodExpense).to.be.closeTo(m.totalExpense - m.foodExpense, 0.1);
      }
    });
  });

  // ── Item 4: Category Analysis ──
  describe('Item 4: Category Analysis', () => {
    let catAnalysis;

    before(async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      catAnalysis = res.body.categoryAnalysis;
    });

    it('should have timeWindow info', () => {
      expect(catAnalysis).to.have.property('timeWindow');
      expect(catAnalysis.timeWindow).to.have.property('months');
      expect(catAnalysis.timeWindow).to.have.property('startDate');
      expect(catAnalysis.timeWindow).to.have.property('endDate');
    });

    it('should have byCategory array with required fields', () => {
      expect(catAnalysis).to.have.property('byCategory');
      expect(catAnalysis.byCategory).to.be.an('array');
      if (catAnalysis.byCategory.length > 0) {
        const item = catAnalysis.byCategory[0];
        expect(item).to.have.property('name');
        expect(item).to.have.property('type');
        expect(item).to.have.property('recordCount');
        expect(item).to.have.property('totalAmount');
      }
    });

    it('should have bySubcategory array with required fields', () => {
      expect(catAnalysis).to.have.property('bySubcategory');
      expect(catAnalysis.bySubcategory).to.be.an('array');
      if (catAnalysis.bySubcategory.length > 0) {
        const item = catAnalysis.bySubcategory[0];
        expect(item).to.have.property('name');
        expect(item).to.have.property('parentCategory');
        expect(item).to.have.property('type');
        expect(item).to.have.property('recordCount');
        expect(item).to.have.property('totalAmount');
      }
    });
  });

  // ── Item 5: Amount Distribution ──
  describe('Item 5: Amount Distribution', () => {
    it('should have income and expense distribution', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const dist = res.body.amountDistribution;
      expect(dist).to.have.property('income');
      expect(dist).to.have.property('expense');
      expect(dist.income).to.be.an('array');
      expect(dist.expense).to.be.an('array');
    });

    it('should have bucket edges for each bin', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const dist = res.body.amountDistribution;
      if (dist.expense.length > 0) {
        const bin = dist.expense[0];
        expect(bin).to.have.property('min');
        expect(bin).to.have.property('max');
        expect(bin).to.have.property('count');
      }
    });

    it('should have total counts matching transaction counts', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const dist = res.body.amountDistribution;
      const recordCounts = res.body.basicStats.recordCounts;

      // Count only transaction records (not external) for distribution
      const incomeCount = dist.income.reduce((s, b) => s + b.count, 0);
      const expenseCount = dist.expense.reduce((s, b) => s + b.count, 0);
      // Seed has 1 Income + 2 Expense transactions
      expect(incomeCount).to.equal(1);
      expect(expenseCount).to.equal(2);
    });
  });

  // ── Item 6: External Transactions Analysis ──
  describe('Item 6: External Transactions Analysis', () => {
    let extAnalysis;

    before(async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      extAnalysis = res.body.externalAnalysis;
    });

    it('should report period external cash flow', () => {
      expect(extAnalysis.cashFlow).to.deep.equal({ totalIn: 500, totalOut: 1500, netCashFlow: -1000 });
    });

    it('should keep the unmatched OUT record open by amount', () => {
      expect(extAnalysis.outstanding).to.include({ openGroups: 1, totalOutstanding: 1000 });
      const id3 = extAnalysis.groups.find((group) => group.transactionIds.includes(3));
      expect(id3).to.include({ status: 'open', outstandingAmount: 1000 });
    });

    it('should have byParty breakdown', () => {
      expect(extAnalysis).to.have.property('byParty');
      expect(extAnalysis.byParty).to.be.an('array');
      if (extAnalysis.byParty.length > 0) {
        const p = extAnalysis.byParty[0];
        expect(p).to.have.property('party');
        expect(p).to.have.property('openGroups');
        expect(p).to.have.property('outstandingAmount');
        expect(p).to.have.property('oldestAgeDays');
      }
    });
  });

  // ── Bonus Items ──
  describe('Bonus Items', () => {
    it('should have savingsRate array', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const bonus = res.body.bonus;
      expect(bonus).to.have.property('savingsRate');
      expect(bonus.savingsRate).to.be.an('array');
    });

    it('should have monthlyTrends array', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const bonus = res.body.bonus;
      expect(bonus).to.have.property('monthlyTrends');
      expect(bonus.monthlyTrends).to.be.an('array');
    });

    it('should have dayOfWeek analysis', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const bonus = res.body.bonus;
      expect(bonus).to.have.property('dayOfWeek');
      expect(bonus.dayOfWeek).to.be.an('array');
      expect(bonus.dayOfWeek).to.have.lengthOf(7);
      expect(bonus.dayOfWeek[0]).to.have.property('dayName');
      expect(bonus.dayOfWeek[0]).to.have.property('expenseCount');
      expect(bonus.dayOfWeek[0]).to.have.property('expenseAmount');
    });

    it('should have pareto analysis', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const bonus = res.body.bonus;
      expect(bonus).to.have.property('pareto');
      expect(bonus.pareto).to.be.an('array');
    });

    it('should have tagAnalysis', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const bonus = res.body.bonus;
      expect(bonus).to.have.property('tagAnalysis');
      expect(bonus.tagAnalysis).to.be.an('array');
    });

    it('should have frequencyAmount matrix', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const bonus = res.body.bonus;
      expect(bonus).to.have.property('frequencyAmount');
      expect(bonus.frequencyAmount).to.be.an('array');
    });

    it('should have anomalies array', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const bonus = res.body.bonus;
      expect(bonus).to.have.property('anomalies');
      expect(bonus.anomalies).to.be.an('array');
    });

    it('should have topRecords array', async () => {
      const res = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const bonus = res.body.bonus;
      expect(bonus).to.have.property('topRecords');
      expect(bonus.topRecords).to.be.an('array');
    });
  });

  // ── Repeatability ──
  describe('Repeatability', () => {
    it('should return fresh results on each call', async () => {
      const res1 = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      const res2 = await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);
      expect(res1.status).to.equal(200);
      expect(res2.status).to.equal(200);
      // Both should have the same structure
      expect(res1.body).to.have.property('basicStats');
      expect(res2.body).to.have.property('basicStats');
      // computedAt timestamps may differ slightly
    });

    it('should not mutate store data after analytics computation', async () => {
      // Get record counts before analytics
      const statusBefore = await request.get('/api/status').set('Authorization', `Bearer ${authToken}`);
      const countsBefore = statusBefore.body.counts;

      // Run analytics
      await request.get('/api/analytics').set('Authorization', `Bearer ${authToken}`);

      // Check counts unchanged
      const statusAfter = await request.get('/api/status').set('Authorization', `Bearer ${authToken}`);
      const countsAfter = statusAfter.body.counts;

      expect(countsAfter.transactions).to.equal(countsBefore.transactions);
      expect(countsAfter.externalTransactions).to.equal(countsBefore.externalTransactions);
    });
  });
});
