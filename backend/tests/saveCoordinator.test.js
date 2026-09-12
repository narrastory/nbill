import { expect } from 'chai';
import { createSaveCoordinator } from '../src/store/saveCoordinator.js';

describe('Save coordinator', function () {
  it('serializes concurrent save requests', async function () {
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const coordinator = createSaveCoordinator(async () => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gate;
      active -= 1;
    });

    coordinator.markDirty();
    const saves = [coordinator.save(), coordinator.save(), coordinator.save()];
    await new Promise((resolve) => setImmediate(resolve));
    release();
    await Promise.all(saves);

    expect(calls).to.equal(1);
    expect(maxActive).to.equal(1);
    expect(coordinator.isDirty()).to.equal(false);
  });

  it('saves a new revision created while a save is running', async function () {
    let calls = 0;
    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    const coordinator = createSaveCoordinator(async () => {
      calls += 1;
      if (calls === 1) await firstGate;
    });

    coordinator.markDirty();
    const saving = coordinator.save();
    await new Promise((resolve) => setImmediate(resolve));
    coordinator.markDirty();
    releaseFirst();
    await saving;

    expect(calls).to.equal(2);
    expect(coordinator.isDirty()).to.equal(false);
  });

  it('keeps dirty state after failure so a later save can retry', async function () {
    let shouldFail = true;
    const coordinator = createSaveCoordinator(async () => {
      if (shouldFail) throw new Error('disk unavailable');
    });

    coordinator.markDirty();
    let error;
    try {
      await coordinator.save();
    } catch (caught) {
      error = caught;
    }

    expect(error?.message).to.equal('disk unavailable');
    expect(coordinator.isDirty()).to.equal(true);

    shouldFail = false;
    await coordinator.save();
    expect(coordinator.isDirty()).to.equal(false);
  });
});
