/**
 * Serialize saves and keep saving until the latest in-memory revision has
 * reached durable storage.
 */
export function createSaveCoordinator(saveSnapshot) {
  let revision = 0;
  let dirty = false;
  let running = null;

  function markDirty() {
    revision += 1;
    dirty = true;
    return revision;
  }

  async function drain() {
    do {
      const targetRevision = revision;
      try {
        await saveSnapshot(targetRevision);
      } catch (err) {
        dirty = true;
        throw err;
      }
      dirty = revision !== targetRevision;
    } while (dirty);
  }

  function save() {
    if (running) return running;
    if (!dirty) return Promise.resolve();

    running = drain().finally(() => {
      running = null;
    });
    return running;
  }

  function reset() {
    revision = 0;
    dirty = false;
  }

  return {
    markDirty,
    save,
    reset,
    isDirty: () => dirty,
    getRevision: () => revision,
  };
}

export default { createSaveCoordinator };
