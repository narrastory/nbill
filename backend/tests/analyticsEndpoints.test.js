import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.NBILL_DATA_DIR = join(resolve(__dirname, '..'), 'data_test');

import supertest from 'supertest';
import { expect } from 'chai';
import { initConfig } from '../src/config.js';
import { initLogger } from '../src/logger.js';
import { createApp } from '../src/server.js';
import { purge } from '../src/store/engine.js';
import {
  cleanup,
  dateOffsetString,
  seedTestData,
  TEST_PASSWORD,
  TEST_USERNAME,
} from './helpers.js';

describe('Range-aware analytics endpoints', function () {
  let request;
  let bearer;

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
    bearer = `Bearer ${login.body.token}`;
  });

  afterEach(function () {
    purge();
    cleanup();
  });

  it('rejects invalid, future, and reversed analytics ranges', async function () {
    const invalid = await request
      .get('/api/analytics?dateFrom=2026-02-30')
      .set('Authorization', bearer);
    const future = await request
      .get(`/api/analytics?dateTo=${dateOffsetString(1)}`)
      .set('Authorization', bearer);
    const reversed = await request
      .get(`/api/analytics?dateFrom=${dateOffsetString()}&dateTo=${dateOffsetString(-1)}`)
      .set('Authorization', bearer);

    expect(invalid.status).to.equal(400);
    expect(future.status).to.equal(400);
    expect(reversed.status).to.equal(400);
  });

  it('applies inclusive range filtering while carrying prior cash forward', async function () {
    const today = dateOffsetString();
    const response = await request
      .get(`/api/analytics?dateFrom=${today}&dateTo=${today}`)
      .set('Authorization', bearer);

    expect(response.status).to.equal(200);
    expect(response.body.period).to.deep.equal({ dateFrom: today, dateTo: today });
    expect(response.body.basicStats.overview).to.include({
      totalIncome: 0,
      totalExpense: 35.5,
      externalIn: 0,
      externalOut: 500,
      openingCashBalance: 11475,
      closingCashBalance: 10939.5,
    });
    expect(response.body.monthlySummary).to.have.length(1);
    expect(response.body.monthlySummary[0].yearMonth).to.equal(today.slice(0, 7));
  });

  it('returns a lightweight summary with previous-period comparison', async function () {
    const today = dateOffsetString();
    const response = await request
      .get(`/api/analytics/summary?dateFrom=${today}&dateTo=${today}`)
      .set('Authorization', bearer);

    expect(response.status).to.equal(200);
    expect(response.body).to.have.keys([
      'period', 'cash', 'operating', 'external', 'comparison', 'topExpenseCategories',
    ]);
    expect(response.body.operating).to.deep.equal({
      totalIncome: 0,
      totalExpense: 35.5,
      netIncome: -35.5,
      savingsRate: null,
    });
    expect(response.body.cash).to.deep.equal({
      openingCashBalance: 11475,
      closingCashBalance: 10939.5,
      periodCashChange: -535.5,
    });
    expect(response.body.comparison.period).to.deep.equal({
      dateFrom: dateOffsetString(-1),
      dateTo: dateOffsetString(-1),
    });
  });

  it('returns and filters amount-based external outstanding groups', async function () {
    const response = await request
      .get(`/api/analytics/external-outstanding?asOf=${dateOffsetString()}&status=open&relatedParty=${encodeURIComponent('测试往来方乙')}`)
      .set('Authorization', bearer);

    expect(response.status).to.equal(200);
    expect(response.body).to.have.keys(['asOf', 'filters', 'summary', 'groups', 'byParty']);
    expect(response.body.summary).to.have.keys([
      'totalGroups', 'openGroups', 'settledGroups', 'overpaidGroups',
      'unmatchedInGroups', 'totalOutstanding', 'totalOverpaid',
    ]);
    expect(response.body.summary).to.include({ openGroups: 1, totalOutstanding: 1000 });
    expect(response.body.groups).to.have.length(1);
    expect(response.body.groups[0]).to.have.keys([
      'groupId', 'transactionIds', 'parties', 'earliestOutDate', 'totalOut', 'totalIn',
      'outstandingAmount', 'overpaidAmount', 'status', 'ageDays', 'danglingRelatedIds',
    ]);
    expect(response.body.groups[0]).to.include({ status: 'open', outstandingAmount: 1000 });
    expect(response.body.groups[0].transactionIds).to.deep.equal([3]);
    expect(response.body.byParty[0]).to.include({ party: '测试往来方乙', outstandingAmount: 1000 });
  });

  it('rejects an invalid outstanding status and future asOf date', async function () {
    const invalidStatus = await request
      .get('/api/analytics/external-outstanding?status=missing')
      .set('Authorization', bearer);
    const future = await request
      .get(`/api/analytics/external-outstanding?asOf=${dateOffsetString(1)}`)
      .set('Authorization', bearer);
    expect(invalidStatus.status).to.equal(400);
    expect(future.status).to.equal(400);
  });

  it('returns a read-only data quality report', async function () {
    const response = await request
      .get('/api/analytics/data-quality')
      .set('Authorization', bearer);

    expect(response.status).to.equal(200);
    expect(response.body).to.have.keys(['healthy', 'checkedAt', 'summary', 'issues']);
    expect(response.body.healthy).to.equal(true);
    expect(response.body.summary).to.deep.equal({ error: 0, warning: 0, total: 0 });
    expect(response.body.issues).to.deep.equal([]);
  });
});
