import { expect } from 'chai';
import { prepareHistoricalEdit } from '../src/maintenance/historicalEdit.js';

describe('Historical edit preparation', function () {
  it('saves before backing up and returns the backup directory', async function () {
    const events = [];
    const result = await prepareHistoricalEdit({
      reason: 'historical-transaction-edit',
      saveFn: async () => events.push('save'),
      backupFn: async (options) => {
        events.push(`backup:${options.reason}`);
        return 'test-backup-dir';
      },
    });

    expect(events).to.deep.equal(['save', 'backup:historical-transaction-edit']);
    expect(result).to.deep.equal({ backupDir: 'test-backup-dir' });
  });

  it('rejects when a backup cannot be created', async function () {
    let error;
    try {
      await prepareHistoricalEdit({
        reason: 'historical-external-edit',
        saveFn: async () => {},
        backupFn: async () => null,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.include('backup');
  });

  it('propagates backup failures', async function () {
    let updated = false;
    let error;
    try {
      await prepareHistoricalEdit({
        reason: 'historical-transaction-edit',
        saveFn: async () => {},
        backupFn: async () => { throw new Error('backup failed'); },
      });
      updated = true;
    } catch (caught) {
      error = caught;
    }
    expect(error.message).to.equal('backup failed');
    expect(updated).to.equal(false);
  });
});
