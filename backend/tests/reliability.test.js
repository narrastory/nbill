import { expect } from 'chai';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  init as initCounters,
  loadCounters,
  recoverCounter,
  getCurrentId,
} from '../src/store/idCounter.js';

describe('Reliability safeguards', function () {
  describe('ID counter recovery', function () {
    beforeEach(function () {
      initCounters('unused');
    });

    it('recovers the counter from uppercase ID values', function () {
      recoverCounter('transactions', [{ ID: 12 }, { ID: 854 }]);
      expect(getCurrentId('transactions')).to.equal(854);
    });

    it('recovers the counter from lowercase id values', function () {
      recoverCounter('transactions', [{ id: 7 }, { id: 31 }]);
      expect(getCurrentId('transactions')).to.equal(31);
    });

    it('does not lower a counter that is already ahead of the data', function () {
      recoverCounter('transactions', [{ ID: 900 }]);
      recoverCounter('transactions', [{ ID: 100 }]);
      expect(getCurrentId('transactions')).to.equal(900);
    });

    it('recovers safely when the counter file contains a non-object JSON value', async function () {
      const dir = await mkdtemp(join(tmpdir(), 'nbill-counter-'));
      try {
        await writeFile(join(dir, 'idCounters.json'), 'null');
        initCounters(dir);
        await loadCounters();
        recoverCounter('transactions', [{ ID: 42 }]);
        expect(getCurrentId('transactions')).to.equal(42);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('defaults invalid counter fields before recovering from table IDs', async function () {
      const dir = await mkdtemp(join(tmpdir(), 'nbill-counter-'));
      try {
        await writeFile(join(dir, 'idCounters.json'), '{"transactions":"bad","externalTransactions":-3}');
        initCounters(dir);
        await loadCounters();
        recoverCounter('externalTransactions', [{ ID: 17 }]);
        expect(getCurrentId('transactions')).to.equal(0);
        expect(getCurrentId('externalTransactions')).to.equal(17);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
