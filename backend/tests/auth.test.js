/**
 * Authentication tests — login, logout, brute force, JWT validation.
 */

import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Set env BEFORE any app imports
process.env.NBILL_DATA_DIR = join(projectRoot, 'data_test');

import supertest from 'supertest';
import { expect } from 'chai';
import { seedTestData, cleanup, TEST_USERNAME, TEST_PASSWORD } from './helpers.js';
import { initConfig } from '../src/config.js';
import { initLogger } from '../src/logger.js';
import { createApp } from '../src/server.js';
import { resetBruteForce } from '../src/auth/index.js';
import { getIsLoaded, getTransactions, markDirty, purge } from '../src/store/engine.js';

let request;
let app;
let authToken;

describe('Authentication API', function () {
  before(async function () {
    this.timeout(10000);
    await seedTestData();
    initConfig();
    initLogger();
    app = createApp();
    request = supertest(app);
  });

  after(async function () {
    resetBruteForce();
    cleanup();
  });

  describe('POST /api/auth/login', function () {
    it('should login with correct credentials', async function () {
      const res = await request
        .post('/api/auth/login')
        .send({ username: TEST_USERNAME, password: TEST_PASSWORD });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('token');
      expect(res.body).to.have.property('lastEditTime');
      expect(res.body).to.have.property('initialBalance');
      authToken = res.body.token;
    });

    it('should fail with wrong password', async function () {
      const res = await request
        .post('/api/auth/login')
        .send({ username: TEST_USERNAME, password: 'wrongpassword' });

      expect(res.status).to.equal(401);
      expect(res.body).to.have.property('error');
    });

    it('should fail with wrong username', async function () {
      const res = await request
        .post('/api/auth/login')
        .send({ username: 'WrongUser', password: TEST_PASSWORD });

      expect(res.status).to.equal(401);
    });

    it('should fail with missing credentials', async function () {
      const res = await request
        .post('/api/auth/login')
        .send({});

      expect(res.status).to.equal(400);
    });

    it('preserves dirty in-memory data when the user logs in again', async function () {
      purge();
      resetBruteForce();

      const firstLogin = await request
        .post('/api/auth/login')
        .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
      expect(firstLogin.status).to.equal(200);

      const before = getTransactions().length;
      getTransactions().push({ ID: 999999, Amount: 1 });
      markDirty();

      const secondLogin = await request
        .post('/api/auth/login')
        .send({ username: TEST_USERNAME, password: TEST_PASSWORD });

      expect(secondLogin.status).to.equal(200);
      expect(getTransactions()).to.have.length(before + 1);
      expect(getTransactions().at(-1).ID).to.equal(999999);
      purge();
    });

    it('single-flights concurrent initial logins without a later reload', async function () {
      purge();
      resetBruteForce();
      const credentials = { username: TEST_USERNAME, password: TEST_PASSWORD };
      const firstRequest = request.post('/api/auth/login').send(credentials);
      const secondRequest = request.post('/api/auth/login').send(credentials);
      const first = await firstRequest;
      expect(first.status).to.equal(200);

      const before = getTransactions().length;
      getTransactions().push({ ID: 999998, Amount: 1 });
      markDirty();
      const second = await secondRequest;

      expect(second.status).to.equal(200);
      expect(getTransactions()).to.have.length(before + 1);
      expect(getTransactions().at(-1).ID).to.equal(999998);
      purge();
    });
  });

  describe('POST /api/auth/logout', function () {
    let logoutToken;

    before(async function () {
      // Login fresh to get a token
      const res = await request
        .post('/api/auth/login')
        .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
      logoutToken = res.body.token;
    });

    it('should logout successfully with valid token', async function () {
      const res = await request
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${logoutToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.message).to.include('Logged out');
    });

    it('should fail without token', async function () {
      const res = await request
        .post('/api/auth/logout');

      expect(res.status).to.equal(401);
    });

    it('should fail with invalid token', async function () {
      const res = await request
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalidtoken123');

      expect(res.status).to.equal(401);
    });

    it('should reject the old token after logout purges the store', async function () {
      const loginRes = await request
        .post('/api/auth/login')
        .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
      const tokenToInvalidate = loginRes.body.token;

      const logoutRes = await request
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${tokenToInvalidate}`);
      expect(logoutRes.status).to.equal(200);

      const res = await request
        .get('/api/status')
        .set('Authorization', `Bearer ${tokenToInvalidate}`);

      expect(res.status).to.equal(401);
    });
  });

  describe('JWT Protection', function () {
    it('should reject request without Authorization header', async function () {
      const res = await request.get('/api/transactions');
      expect(res.status).to.equal(401);
    });

    it('should reject request with expired token', async function () {
      // Create expired JWT manually
      const jwt = await import('jsonwebtoken');
      const config = initConfig();
      const expiredToken = jwt.default.sign(
        { username: TEST_USERNAME, iat: Math.floor(Date.now() / 1000) - 99999 },
        config.auth.jwtSecret,
        { algorithm: 'HS256', expiresIn: '1s' },
      );

      // Wait for token to expire
      await new Promise((r) => setTimeout(r, 1500));

      const res = await request
        .get('/api/transactions')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).to.equal(401);
    });
  });

  describe('Brute Force Protection', function () {
    it('should enforce delay after multiple failed attempts', async function () {
      this.timeout(20000);

      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request
          .post('/api/auth/login')
          .send({ username: TEST_USERNAME, password: `wrong${i}` });
      }

      // 6th attempt should be slow (10s delay)
      const start = Date.now();
      const res = await request
        .post('/api/auth/login')
        .send({ username: TEST_USERNAME, password: 'wrongagain' });
      const duration = Date.now() - start;

      expect(res.status).to.equal(401);
      // Should have taken at least ~9 seconds (10s delay minus some variance)
      // Actually in test environment the delay on the 6th attempt is from the accumulated state
      // The 5th attempt triggered maxAttempts, so 6th gets the delay
      expect(duration).to.be.greaterThan(8000);
    });
  });

  describe('Corrupted data handling', function () {
    it('should fail closed when a plain JSON table is corrupted', async function () {
      this.timeout(10000);
      resetBruteForce();
      purge();
      const tagsPath = join(projectRoot, 'data_test', 'bill_tags.json');
      const original = readFileSync(tagsPath);
      writeFileSync(tagsPath, '{ invalid json');

      try {
        const res = await request
          .post('/api/auth/login')
          .send({ username: TEST_USERNAME, password: TEST_PASSWORD });

        expect(res.status).to.equal(401);
        expect(getIsLoaded()).to.equal(false);
        expect(readFileSync(tagsPath, 'utf8')).to.equal('{ invalid json');
      } finally {
        writeFileSync(tagsPath, original);
        purge();
      }
    });
  });
});
