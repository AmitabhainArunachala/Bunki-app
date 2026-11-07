/** Deterministic QA adapter, shared by multiple replica handles. Not OS durability. */
export function createMemoryAdapter({ beforeCommit = () => {}, afterCommit = () => {} } = {}) {
  const states = new Map();
  const key = scope => JSON.stringify([scope.environment, scope.learner, scope.installation]);
  return Object.freeze({
    async read(scope) { return structuredClone(states.get(key(scope)) ?? null); },
    async compareAndSwap(scope, expectedRevision, candidate) {
      const current = states.get(key(scope));
      if ((current?.storageRevision ?? null) !== expectedRevision) return false;
      // No await between comparison and commit: concurrent callers cannot interleave here.
      beforeCommit(structuredClone(candidate));
      states.set(key(scope), structuredClone(candidate));
      afterCommit(structuredClone(candidate));
      return true;
    },
  });
}
