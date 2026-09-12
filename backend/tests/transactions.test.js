/**
 * Transactions API tests — CRUD, search, edit window enforcement.
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
import { getTransactions, purge } from '../src/store/engine.js';

let request;
let authToken;

async function login() {
  const res = await request
    .post('/api/auth/login')
    .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
  authToken = res.body.token;
  return authToken;
}

describe('Transactions API', function () {
  before(async function () {
    this.timeout(10000);
    await seedTestData();
    resetBruteForce();
    initConfig();
    initLogger();
    const app = createApp();
    request = supertest(app);
    await login();
  });

  after(function () {
    purge();
    cleanup();
  });

  describe('GET /api/transactions', function () {
    it('should list all transactions', async function () {
      const res = await request
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('data');
      expect(res.body).to.have.property('total');
      expect(res.body.data).to.be.an('array');
      expect(res.body.data.length).to.be.greaterThan(0);
    });

    it('should filter by type', async function () {
      const res = await request
        .get('/api/transactions?type=Expense')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      res.body.data.forEach((t) => {
        expect(t.Type).to.equal('Expense');
      });
    });

    it('should filter by category', async function () {
      const res = await request
        .get('/api/transactions?category=餐饮食品')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      res.body.data.forEach((t) => {
        expect(t.Category).to.equal('餐饮食品');
      });
    });

    it('should search by description (fuzzy)', async function () {
      const res = await request
        .get('/api/transactions?description=午餐')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.data.some((t) => t.Description.includes('午餐'))).to.be.true;
    });

    it('should filter by date range', async function () {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      const res = await request
        .get(`/api/transactions?dateFrom=${today}&dateTo=${today}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
    });

    it('should support pagination', async function () {
      const res = await request
        .get('/api/transactions?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.page).to.equal(1);
      expect(res.body.limit).to.equal(2);
      expect(res.body.data.length).to.be.at.most(2);
    });

    it('should not reorder the live store when sorting a query', async function () {
      const live = getTransactions();
      live.reverse();
      const before = live.map((transaction) => transaction.ID);

      await request
        .get('/api/transactions?sortBy=Amount&sortOrder=asc')
        .set('Authorization', `Bearer ${authToken}`);

      expect(live.map((transaction) => transaction.ID)).to.deep.equal(before);
    });
  });

  describe('GET /api/transactions/:id', function () {
    it('should get a transaction by ID', async function () {
      const res = await request
        .get('/api/transactions/1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.data).to.have.property('ID', 1);
      expect(res.body.data).to.have.property('Type');
      expect(res.body.data).to.have.property('Amount');
    });

    it('should return 404 for non-existent ID', async function () {
      const res = await request
        .get('/api/transactions/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(404);
    });
  });

  describe('POST /api/transactions', function () {
    it('should create a new transaction', async function () {
      const newTxn = {
        Type: 'Expense',
        BillDate: dateOffsetString(0),
        Category: '餐饮食品',
        Subcategory: '正餐',
        Description: '测试午餐',
        Tag: '主动选择',
        Amount: 42.5,
        Notes: '测试备注',
      };

      const res = await request
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newTxn);

      expect(res.status).to.equal(201);
      expect(res.body.data).to.have.property('ID');
      expect(res.body.data.Type).to.equal('Expense');
      expect(res.body.data.Amount).to.equal(42.5);
    });

    it('should fail with missing required fields', async function () {
      const res = await request
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ Type: 'Expense' });

      expect(res.status).to.equal(400);
    });

    it('should fail with invalid category', async function () {
      const res = await request
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          Type: 'Expense',
          BillDate: dateOffsetString(0),
          Category: '不存在的分类',
          Subcategory: '不存在',
          Description: '测试',
          Amount: 100,
        });

      expect(res.status).to.equal(400);
      expect(res.body.error).to.include('does not exist');
    });

    it('should fail with invalid tag', async function () {
      const res = await request
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          Type: 'Expense',
          BillDate: dateOffsetString(0),
          Category: '餐饮食品',
          Subcategory: '正餐',
          Description: '测试',
          Tag: '不存在的标签',
          Amount: 100,
        });

      expect(res.status).to.equal(400);
    });

    it('should reject invalid and future bill dates', async function () {
      const base = {
        Type: 'Expense',
        Category: '餐饮食品',
        Subcategory: '正餐',
        Description: '日期校验',
        Amount: 10,
      };

      for (const BillDate of ['2026-02-31', dateOffsetString(1)]) {
        const res = await request
          .post('/api/transactions')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ ...base, BillDate });
        expect(res.status).to.equal(400);
      }
    });

    it('should reject partially numeric amounts', async function () {
      const res = await request
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          Type: 'Expense', BillDate: dateOffsetString(0),
          Category: '餐饮食品', Subcategory: '正餐',
          Description: '金额校验', Amount: '12abc',
        });

      expect(res.status).to.equal(400);
    });
  });

  describe('PUT /api/transactions/:id', function () {
    it('should update a recent transaction', async function () {
      const res = await request
        .put('/api/transactions/1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ Amount: 50, Notes: 'updated' });

      expect(res.status).to.equal(200);
      expect(res.body.data.Amount).to.equal(50);
      expect(res.body.data.Notes).to.equal('updated');
    });

    it('should not allow editing old transactions (edit window)', async function () {
      // Transaction ID 3 has a date 40 days ago
      const res = await request
        .put('/api/transactions/3')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ Amount: 999 });

      expect(res.status).to.equal(403);
      expect(res.body.error).to.include('outside the editable window');
    });

    it('should allow a confirmed historical transaction correction after backup', async function () {
      const res = await request
        .put('/api/transactions/3?confirmHistoricalEdit=true')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ Amount: 26, Notes: '历史纠错' });

      expect(res.status).to.equal(200);
      expect(res.body).to.include({ historicalEdit: true, backupCreated: true });
      expect(res.body.data).to.include({ ID: 3, Amount: 26, Notes: '历史纠错' });
    });

    it('should leave the original record unchanged when update validation fails', async function () {
      const before = await request
        .get('/api/transactions/1')
        .set('Authorization', `Bearer ${authToken}`);

      const updateRes = await request
        .put('/api/transactions/1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ Category: '不存在的分类', Subcategory: '不存在', Tag: '家庭' });

      const after = await request
        .get('/api/transactions/1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(updateRes.status).to.equal(400);
      expect(after.body.data.Category).to.equal(before.body.data.Category);
      expect(after.body.data.Subcategory).to.equal(before.body.data.Subcategory);
      expect(after.body.data.Tag).to.equal(before.body.data.Tag);
    });
  });

  describe('DELETE /api/transactions/:id', function () {
    it('should not delete old transactions', async function () {
      const res = await request
        .delete('/api/transactions/3')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(403);
    });

    it('should delete a recent transaction', async function () {
      // First create a new one to delete
      const createRes = await request
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          Type: 'Income',
          BillDate: dateOffsetString(0),
          Category: '奖励补贴',
          Subcategory: '奖金',
          Description: '要删除的记录',
          Amount: 100,
        });

      const newId = createRes.body.data.ID;

      const deleteRes = await request
        .delete(`/api/transactions/${newId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteRes.status).to.equal(200);
    });
  });
});
