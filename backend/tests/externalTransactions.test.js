/**
 * ExternalTransactions API tests.
 */

import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.NBILL_DATA_DIR = join(resolve(__dirname, '..'), 'data_test');

import supertest from 'supertest';
import { expect } from 'chai';
import { seedTestData, cleanup, TEST_USERNAME, TEST_PASSWORD, dateOffsetString } from './helpers.js';
import { initConfig } from '../src/config.js';
import { initLogger } from '../src/logger.js';
import { createApp } from '../src/server.js';
import { resetBruteForce } from '../src/auth/index.js';
import { getExternalTransactions, purge } from '../src/store/engine.js';

let request, authToken;

describe('ExternalTransactions API', function () {
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
    purge();
    cleanup();
  });

  describe('GET /api/external-transactions', () => {
    it('should list all external transactions', async () => {
      const res = await request.get('/api/external-transactions').set('Authorization', `Bearer ${authToken}`);
      expect(res.status).to.equal(200);
      expect(res.body.data).to.be.an('array');
      expect(res.body.total).to.be.greaterThan(0);
    });

    it('should filter by type', async () => {
      const res = await request.get('/api/external-transactions?type=OUT').set('Authorization', `Bearer ${authToken}`);
      res.body.data.forEach((t) => expect(t.Type).to.equal('OUT'));
    });

    it('should not reorder the live store when sorting a query', async () => {
      const live = getExternalTransactions();
      live.reverse();
      const before = live.map((transaction) => transaction.ID);

      await request.get('/api/external-transactions?sortBy=Amount&sortOrder=asc')
        .set('Authorization', `Bearer ${authToken}`);

      expect(live.map((transaction) => transaction.ID)).to.deep.equal(before);
    });
  });

  describe('GET /api/external-transactions/:id', () => {
    it('should resolve RelatedID to relatedTransactions', async () => {
      const res = await request.get('/api/external-transactions/2').set('Authorization', `Bearer ${authToken}`);
      expect(res.status).to.equal(200);
      expect(res.body.data).to.have.property('relatedTransactions');
      expect(res.body.data.relatedTransactions).to.be.an('array');
    });
  });

  describe('POST /api/external-transactions', () => {
    it('should create a new external transaction', async () => {
      const res = await request.post('/api/external-transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          Type: 'IN', FlowDate: dateOffsetString(0), Description: '测试收入',
          FlowType: '还款', RelatedParty: '测试往来方甲', Amount: 200, RelatedID: '1',
        });
      expect(res.status).to.equal(201);
      expect(res.body.data).to.have.property('ID');
    });

    it('should reject invalid dates and partially numeric amounts', async () => {
      const base = {
        Type: 'IN', Description: '校验测试', FlowType: '还款',
        RelatedParty: '测试往来方甲', Amount: 20, RelatedID: '1',
      };

      const invalidDate = await request.post('/api/external-transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...base, FlowDate: '2026-02-31' });
      const invalidAmount = await request.post('/api/external-transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...base, FlowDate: dateOffsetString(0), Amount: '12abc' });

      expect(invalidDate.status).to.equal(400);
      expect(invalidAmount.status).to.equal(400);
    });
  });

  describe('PUT /api/external-transactions/:id', () => {
    it('should update a recent transaction', async () => {
      const res = await request.put('/api/external-transactions/1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ Amount: 600, Description: '更新描述' });
      expect(res.status).to.equal(200);
    });

    it('should reject update of old transaction', async () => {
      const res = await request.put('/api/external-transactions/3')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ Amount: 5000 });
      expect(res.status).to.equal(403);
    });

    it('should allow a confirmed historical external transaction correction after backup', async () => {
      const res = await request.put('/api/external-transactions/3?confirmHistoricalEdit=true')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ Amount: 1001, Description: '历史纠错' });

      expect(res.status).to.equal(200);
      expect(res.body).to.include({ historicalEdit: true, backupCreated: true });
      expect(res.body.data).to.include({ ID: 3, Amount: 1001, Description: '历史纠错' });
    });
  });
});
