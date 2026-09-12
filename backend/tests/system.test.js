/**
 * System API tests — status and save endpoints.
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

describe('System API', function () {
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

  describe('GET /api/status', () => {
    it('should return system status with counts', async () => {
      const res = await request.get('/api/status').set('Authorization', `Bearer ${authToken}`);
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('authenticated', true);
      expect(res.body).to.have.property('lastEditTime');
      expect(res.body).to.have.property('initialBalance');
      expect(res.body).to.have.property('counts');
      expect(res.body.counts).to.have.property('transactions');
      expect(res.body.counts.transactions).to.be.greaterThan(0);
    });

    it('should reject without auth', async () => {
      const res = await request.get('/api/status');
      expect(res.status).to.equal(401);
    });
  });

  describe('POST /api/save', () => {
    it('should trigger manual save', async () => {
      const res = await request.post('/api/save').set('Authorization', `Bearer ${authToken}`);
      expect(res.status).to.equal(200);
      expect(res.body.message).to.include('saved');
    });
  });
});
