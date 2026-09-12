/**
 * ExRelatedParty API tests.
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

describe('ExRelatedParty API', function () {
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

  it('should list related parties', async () => {
    const res = await request.get('/api/ex-related-parties').set('Authorization', `Bearer ${authToken}`);
    expect(res.status).to.equal(200);
    expect(res.body.data).to.be.an('array');
  });

  it('should add a new related party', async () => {
    const res = await request.post('/api/ex-related-parties')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ Relatedparty: '新朋友' });
    expect(res.status).to.equal(201);
  });

  it('should rename a related party', async () => {
    const res = await request.put('/api/ex-related-parties/测试往来方甲')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ newRelatedparty: '崔某' });
    expect(res.status).to.equal(200);
    expect(res.body.data.Relatedparty).to.equal('崔某');
  });
});
