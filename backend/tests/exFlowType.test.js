/**
 * ExFlowType API tests.
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

describe('ExFlowType API', function () {
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

  it('should list flow types', async () => {
    const res = await request.get('/api/ex-flow-types').set('Authorization', `Bearer ${authToken}`);
    expect(res.status).to.equal(200);
    expect(res.body.data).to.be.an('array');
  });

  it('should add a new flow type', async () => {
    const res = await request.post('/api/ex-flow-types')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ Flowtype: '押金' });
    expect(res.status).to.equal(201);
  });

  it('should rename a flow type', async () => {
    const res = await request.put('/api/ex-flow-types/借款')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ newFlowtype: '借出款' });
    expect(res.status).to.equal(200);
    expect(res.body.data.Flowtype).to.equal('借出款');
  });

  it('should reject duplicate flow type', async () => {
    const res = await request.post('/api/ex-flow-types')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ Flowtype: '还款' });
    expect(res.status).to.equal(400);
  });
});
