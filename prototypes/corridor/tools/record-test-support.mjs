/** Native storage probes for rendered-app journeys. These functions never
 * replace application reads, invoke app reducers, or create missing databases.
 * Legacy localStorage is migration input and a fence, not the active record.
 */
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function readAppRecordSnapshot(page) {
  // Playwright's object codec drops own __proto__ keys; cross as JSON text.
  const text = await page.evaluate(async () => {
    const installationText = localStorage.getItem('kairo-local-record-binding-v1');
    if (!installationText) throw new Error('The app has no installed record binding');
    const installation = JSON.parse(installationText);
    const db = await new Promise((done, fail) => {
      const request = indexedDB.open(installation.databaseName);
      request.onupgradeneeded = () => {
        request.transaction.abort();
        fail(new Error('The app record database must already exist'));
      };
      request.onsuccess = () => done(request.result);
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('The app record database is blocked'));
    });
    try {
      const rows = await new Promise((done, fail) => {
        const tx = db.transaction('kairo_replication_rows', 'readonly');
        const request = tx.objectStore('kairo_replication_rows').getAll();
        tx.oncomplete = () => done(request.result);
        tx.onabort = () => fail(tx.error || new Error('Native record read aborted'));
      });
      const documents = rows.filter((row) => row.kind === 'document').map((row) => JSON.parse(row.text));
      const select = (collection) => documents.find((row) => row.collection === collection && row.id === 'current')?.value;
      const record = select('learner-record');
      if (!record) throw new Error('The app has no active learner-record document');
      const profile = rows.find((row) => row.kind === 'profile');
      return JSON.stringify({ installation, record, archive: select('learner-archive'),
        revision: profile ? JSON.parse(profile.text).revision : null, rows, documents });
    } finally { db.close(); }
  });
  return JSON.parse(text);
}

export async function readAppRecord(page) {
  return (await readAppRecordSnapshot(page)).record;
}

/** Wait for a durable predicate, not a click dispatch or optimistic UI value. */
export async function waitForAppRecord(page, predicate, { timeout = 10000, description = 'durable learner record' } = {}) {
  const deadline = Date.now() + timeout;
  let record;
  do {
    record = await readAppRecord(page);
    if (await predicate(record)) return record;
    await delay(25);
  } while (Date.now() < deadline);
  assert.fail(`Timed out waiting for ${description}`);
}

/** Fail an ordinary host transaction after real native puts have been queued.
 * Optional roots restrict the fault to transactions changing those roots. The
 * hook remains armed until cleared, and exposes fired so a no-op cannot pass.
 */
export async function armRecordWriteFailure(page, mode = 'quota', { roots = [] } = {}) {
  assert(['quota', 'abort'].includes(mode));
  const before = await readAppRecordSnapshot(page);
  await page.evaluate(({ mode, roots, databaseName, baselineText }) => {
    if (window.__recordTestFault) throw new Error('A record write fault is already installed');
    const baseline = JSON.parse(baselineText);
    const nativePut = window.IDBObjectStore.prototype.put;
    const matched = new WeakSet();
    const fault = { mode, databaseName, fired: 0 };
    window.IDBObjectStore.prototype.put = function (...args) {
      const request = nativePut.apply(this, args);
      if (this.transaction.db.name !== databaseName || this.name !== 'kairo_replication_rows' || args[0]?.kind !== 'document') return request;
      const row = JSON.parse(args[0].text);
      if (row.collection === 'learner-record' && roots.some((root) => JSON.stringify(row.value[root]) !== JSON.stringify(baseline[root]))) matched.add(this.transaction);
      if (row.collection === 'kairo:record-host-commands' && (!roots.length || matched.has(this.transaction))) {
        fault.fired++;
        if (mode === 'abort') this.transaction.abort();
        else throw new DOMException('Synthetic quota after real native record puts', 'QuotaExceededError');
      }
      return request;
    };
    fault.disarm = () => { window.IDBObjectStore.prototype.put = nativePut; };
    window.__recordTestFault = fault;
  }, { mode, roots, databaseName: before.installation.databaseName, baselineText: JSON.stringify(before.record) });
}

export async function clearRecordWriteFailure(page) {
  return page.evaluate(() => {
    const fault = window.__recordTestFault;
    if (!fault) throw new Error('No record write fault is installed');
    const { mode, databaseName, fired } = fault;
    fault.disarm();
    delete window.__recordTestFault;
    return { mode, databaseName, fired };
  });
}
