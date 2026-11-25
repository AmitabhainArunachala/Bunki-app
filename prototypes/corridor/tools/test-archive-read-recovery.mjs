// Hold a real IndexedDB success or completion to exercise the archive verifier's
// deadline without relying on device speed. All reads use the public controller.
import assert from 'node:assert/strict';
import { webkit, chromium } from 'playwright-core';
import staticHost from '../../bunki-desktop/lib/static-host.cjs';

const engine = process.env.KAIRO_BROWSER || 'webkit';
const host = await staticHost.startStaticHost({
  site: process.env.KAIRO_SITE_DIR,
  port: 0,
});
const browser = await { webkit, chromium }[engine].launch();
try {
  const page = await browser.newPage();
  await page.route(host.origin + '/fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Archive fixture</title>',
    }),
  );
  await page.goto(host.origin + '/fixture');
  const results = await page.evaluate(async () => {
    const { captureLegacySource } = await import('/record-controller.mjs');
    const recordKey = 'kairo-corridor-v1',
      archiveName = 'kairo-ai-log';
    const record = JSON.stringify({ v: 1, taken: [{ t: 'word', id: '新聞' }] });
    const row = {
      id: 1,
      format: 'kairo-archive-row',
      v: 1,
      turn: { surface: '新聞', role: 'user', content: 'しんぶん', ts: 1 },
    };
    const seed = indexedDB.open(archiveName, 3);
    seed.onupgradeneeded = () => {
      const turns = seed.result.createObjectStore('turns', {
        keyPath: 'id',
        autoIncrement: true,
      });
      turns.createIndex('logical-id', 'turn.id');
      seed.result.createObjectStore('imports', { keyPath: 'id' });
      turns.add(row);
    };
    await new Promise((resolve, reject) => {
      seed.onsuccess = resolve;
      seed.onerror = () => reject(seed.error);
    });
    seed.result.close();
    const nativeOpen = IDBFactory.prototype.open;
    const nativeTransaction = IDBDatabase.prototype.transaction;
    const nativeTimeout = window.setTimeout;
    const results = [];
    for (const [phase, failures, change] of [
      ['open', 1, ''],
      ['read', 1, ''],
      ['open', Infinity, ''],
      ['read', Infinity, ''],
      ['open', 1, 'owner'],
      ['read', 1, 'record'],
      ['open', 1, 'drift'],
      ['active-read', 1, ''],
      ['active-read', Infinity, ''],
      ['error', 0, ''],
      ['invalid-schema', 0, ''],
    ]) {
      localStorage.setItem(recordKey, record);
      localStorage.setItem('bunki-drift-v1', '{}');
      const token = { ownerId: 'reader', epoch: 1, sessionId: 'fixture' };
      let owned = true,
        deadline,
        attempts = 0,
        fired = 0,
        retryConfirmed = false;
      // The only 5-second timer in this isolated read is the controller's
      // open/transaction deadline. Let it win exactly when the result is held.
      window.setTimeout = function (fn, delay, ...args) {
        if (delay === 5000) deadline = fn;
        return nativeTimeout.call(window, fn, delay, ...args);
      };
      const hold = (target, event) => {
        if (attempts > failures) return;
        const property = 'on' + event;
        Object.defineProperty(target, property, {
          configurable: true,
          set(handler) {
            target.addEventListener(
              event,
              () => {
                fired++;
                if (change === 'owner') owned = false;
                if (change === 'record')
                  localStorage.setItem(
                    recordKey,
                    JSON.stringify({ v: 1, taken: [] }),
                  );
                if (change === 'drift')
                  localStorage.setItem('bunki-drift-v1', '{"lk":1}');
                deadline();
                // A late old success must never satisfy the retry or leak its connection.
                queueMicrotask(() => handler.call(target));
              },
              { once: true },
            );
          },
        });
      };
      IDBFactory.prototype.open = function (name, ...args) {
        // Opening existing v3 at v2 produces a real, non-timeout VersionError.
        const req =
          phase === 'error' && name === archiveName
            ? nativeOpen.call(this, name, 2)
            : nativeOpen.call(this, name, ...args);
        if (name === archiveName) {
          attempts++;
          if (phase === 'open') hold(req, 'success');
        }
        return req;
      };
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = nativeTransaction.apply(this, args);
        if (this.name === archiveName && phase === 'invalid-schema') {
          const objectStore = tx.objectStore.bind(tx);
          tx.objectStore = (name) => {
            const store = objectStore(name);
            if (name === 'turns')
              Object.defineProperty(store, 'keyPath', { value: 'invalid' });
            return store;
          };
          const abort = tx.abort.bind(tx);
          let waitingForAbort = false;
          tx.abort = () => {
            abort();
            // The verifier already rejected this schema. Model its deadline
            // landing before the native abort notification is delivered.
            if (!waitingForAbort) {
              waitingForAbort = true;
              fired++;
              deadline();
            }
          };
        }
        if (this.name === archiveName && attempts === 2)
          tx.addEventListener('complete', () => {
            retryConfirmed = true;
          });
        if (this.name === archiveName && phase === 'read') hold(tx, 'complete');
        if (
          this.name === archiveName &&
          phase === 'active-read' &&
          attempts <= failures
        ) {
          // Fire after JS installs the handlers, while the native transaction is still running.
          queueMicrotask(() => {
            fired++;
            deadline();
          });
        }
        return tx;
      };
      let error = null,
        saved = null;
      try {
        saved = await captureLegacySource(
          { capture: () => token, assert: () => owned },
          { includeDrift: true },
        );
      } catch (problem) {
        error = problem.code || problem.message;
      } finally {
        window.setTimeout = nativeTimeout;
        IDBFactory.prototype.open = nativeOpen;
        IDBDatabase.prototype.transaction = nativeTransaction;
      }
      results.push({
        phase,
        failures: Number.isFinite(failures) ? failures : 'all',
        change,
        attempts,
        fired,
        error,
        returnedRow: saved?.archive?.rows?.[0]?.turn?.content || null,
        sourceText: localStorage.getItem(recordKey),
        retryConfirmed,
      });
    }
    return results;
  });
  console.log(JSON.stringify(results));
  for (const result of results) {
    if (result.change === 'owner') {
      assert.equal(result.error, 'writer-required');
      assert.equal(result.attempts, 1);
    } else if (result.change) {
      assert.equal(result.error, 'source-changed');
    } else if (result.phase === 'invalid-schema') {
      assert.equal(result.error, 'unsupported-archive');
      assert.equal(result.attempts, 1);
      assert.equal(result.fired, 1);
    } else if (result.phase === 'error') {
      assert.equal(result.error, 'archive-unavailable');
      assert.equal(result.attempts, 1);
    } else if (result.failures === 'all') {
      assert.equal(result.error, 'archive-unavailable');
      assert.equal(result.attempts, 2);
      assert.equal(result.fired, 2);
    } else {
      assert.equal(result.error, null);
      assert.equal(result.attempts, 2);
      assert.equal(result.fired, 1);
      assert.equal(result.retryConfirmed, true);
      assert.equal(result.returnedRow, 'しんぶん');
    }
    if (result.error) assert.equal(result.returnedRow, null);
    if (result.change !== 'record')
      assert.deepEqual(JSON.parse(result.sourceText).taken, [
        { t: 'word', id: '新聞' },
      ]);
  }
  console.log(
    'PASS',
    engine,
    browser.version(),
    'recover delayed open/read, fail closed on persistent failure, lost owner and changed sources',
  );
} finally {
  await browser.close();
  await host.close();
}
