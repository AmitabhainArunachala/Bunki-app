export function observeSharedStudyLegacyWrites() {
  const {window, IDBObjectStore, localStorage} = globalThis;
  window.__legacyWrites = [];
  for (const method of ['put', 'add', 'delete', 'clear']) {
    const original = IDBObjectStore.prototype[method];
    IDBObjectStore.prototype[method] = function (...args) {
      if (
        !this.transaction.db.name.startsWith('bunki-shared-study-') &&
        this.transaction.db.name !== 'nsrs-private-audio-demand-v1'
      )
        window.__legacyWrites.push({
          database: this.transaction.db.name,
          store: this.name,
          method,
        });
      return original.apply(this, args);
    };
  }
  if (window === window.top && !localStorage.getItem('bunki-cloze:n2'))
    localStorage.setItem(
      'bunki-cloze:n2',
      '{"format":"synthetic-preserved-legacy","cards":{"not-a-frozen-task":{}}}',
    );
}
