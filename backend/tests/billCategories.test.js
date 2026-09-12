/**
 * BillCategories API tests.
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

describe('BillCategories API', function () {
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

  after(() => cleanup());

  describe('GET /api/bill-categories', () => {
    it('should list all categories', async () => {
      const res = await request.get('/api/bill-categories').set('Authorization', `Bearer ${authToken}`);
      expect(res.status).to.equal(200);
      expect(res.body.data).to.be.an('array');
      expect(res.body).to.have.property('grouped');
      expect(res.body.data.length).to.be.greaterThan(0);
    });

    it('should filter by type', async () => {
      const res = await request.get('/api/bill-categories?type=Expense').set('Authorization', `Bearer ${authToken}`);
      expect(res.status).to.equal(200);
      res.body.data.forEach((c) => expect(c.Type).to.equal('Expense'));
    });
  });

  describe('POST /api/bill-categories', () => {
    it('should add a new category', async () => {
      const res = await request.post('/api/bill-categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ Type: 'Expense', Category: '测试分类', Subcategory: '测试子类', Description: '测试' });
      expect(res.status).to.equal(201);
      expect(res.body.data.Category).to.equal('测试分类');
    });

    it('should reject duplicate category', async () => {
      const res = await request.post('/api/bill-categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ Type: 'Expense', Category: '餐饮食品', Subcategory: '正餐', Description: '重复' });
      expect(res.status).to.equal(400);
    });
  });

  describe('PUT /api/bill-categories/:category/:subcategory', () => {
    it('should rename a subcategory', async () => {
      const res = await request.put('/api/bill-categories/餐饮食品/正餐')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ newSubcategory: '日常正餐', newDescription: '改名后' });
      expect(res.status).to.equal(200);
      expect(res.body.data.Subcategory).to.equal('日常正餐');
    });
  });
});
