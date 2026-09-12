/**
 * BillTags API tests.
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

describe('BillTags API', function () {
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

  describe('GET /api/bill-tags', () => {
    it('should list all tags', async () => {
      const res = await request.get('/api/bill-tags').set('Authorization', `Bearer ${authToken}`);
      expect(res.status).to.equal(200);
      expect(res.body.data).to.be.an('array');
    });
  });

  describe('POST /api/bill-tags', () => {
    it('should add a new tag', async () => {
      const res = await request.post('/api/bill-tags')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ Tag: '新标签', Description: '测试', AppliesTo: 'Expense' });
      expect(res.status).to.equal(201);
      expect(res.body.data.Tag).to.equal('新标签');
    });

    it('should reject duplicate tag', async () => {
      const res = await request.post('/api/bill-tags')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ Tag: '主动选择', Description: '重复' });
      expect(res.status).to.equal(400);
    });
  });

  describe('PUT /api/bill-tags/:tag', () => {
    it('should rename a tag', async () => {
      const res = await request.put('/api/bill-tags/主动选择')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ newTag: '明智消费', newDescription: '改名' });
      expect(res.status).to.equal(200);
      expect(res.body.data.Tag).to.equal('明智消费');
    });
  });
});
