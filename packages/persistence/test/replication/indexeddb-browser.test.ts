import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { build } from 'esbuild';
import {
  chromium,
  webkit,
  type BrowserContext,
  type BrowserType,
  type Page,
} from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {} from './indexeddb-fixture.ts';

const evidence =
  process.env['KAIRO_EVIDENCE_DIR'] ??
  join(homedir(), '.dharma/test-runtime/replication-indexeddb');
const requested = (process.env['KAIRO_IDB_BROWSERS'] ?? 'chromium,webkit').split(',');
const engines: readonly [string, BrowserType][] = [
  ['chromium', chromium],
  ['webkit', webkit],
];
if (requested.some((name) => !engines.some(([engine]) => engine === name)))
  throw new Error('Unknown KAIRO_IDB_BROWSERS engine');

describe.each(engines.filter(([name]) => requested.includes(name)))(
  'IndexedDB real browser: %s',
  (engine, browserType) => {
    let context: BrowserContext;
    let server: Server;
    let origin: string;
    let profile: string;
    let nextDatabase = 0;
    let bundleInputs: string[];
    const errors: string[] = [];
    function observe(page: Page): void {
      page.on('pageerror', (error) => errors.push(error.message));
    }
    async function launch(): Promise<void> {
      context = await browserType.launchPersistentContext(profile, { headless: true });
      context.on('page', observe);
      for (const page of context.pages()) observe(page);
    }
    async function pageFor(
      database = `synthetic-${engine}-${nextDatabase++}`,
    ): Promise<{ page: Page; database: string }> {
      const page = await context.newPage();
      await page.goto(origin);
      await page.waitForFunction(() => !!window.fixture);
      await page.evaluate((name) => window.fixture.open(name), database);
      return { page, database };
    }
    beforeAll(async () => {
      await mkdir(evidence, { recursive: true });
      profile = await mkdtemp(join(evidence, `profile-${engine}-`));
      const result = await build({
        entryPoints: [fileURLToPath(new URL('./indexeddb-fixture.ts', import.meta.url))],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        metafile: true,
      });
      bundleInputs = Object.keys(result.metafile.inputs);
      const script = result.outputFiles[0]?.contents;
      if (!script) throw new Error('Browser fixture did not build');
      server = createServer((request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        if (request.url === '/fixture.js') {
          response.setHeader('Content-Type', 'text/javascript');
          response.end(script);
        } else {
          response.setHeader('Content-Type', 'text/html');
          response.end(
            '<!doctype html><meta charset="utf-8"><title>Synthetic IndexedDB fixture</title><script src="/fixture.js"></script>',
          );
        }
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No fixture origin');
      origin = `http://127.0.0.1:${address.port}`;
      await launch();
      await writeFile(
        join(evidence, `engine-${engine}.json`),
        JSON.stringify(
          {
            engine,
            browser: context.browser()?.version(),
            node: process.version,
            browserInputs: bundleInputs,
            origin,
            syntheticProfile: profile,
          },
          null,
          2,
        ),
      );
    }, 30_000);
    afterAll(async () => {
      await context?.close();
      if (server)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      if (profile) await rm(profile, { recursive: true, force: true });
      expect(errors, 'Unexpected browser page errors').toEqual([]);
    });

    it('loads the browser-only module and acknowledges only transaction completion', async () => {
      expect(bundleInputs.some((input) => /\/sqlite(?:\/|\.ts$)/u.test(input))).toBe(false);
      const { page } = await pageFor();
      const result = await page.evaluate(async () => {
        const receipt = await window.fixture.commit(window.fixture.local());
        return {
          receipt,
          completed: window.fixture.completed(),
          snapshot: await window.fixture.snapshot(),
        };
      });
      expect(result.completed).toBe(true);
      expect(result.receipt).toMatchObject({
        outcome: 'committed',
        committedRevision: 1,
        runtimeLabel: 'browser',
      });
      expect(result.snapshot.actor.sequence).toBe(1);
      expect(result.snapshot.outbox).toHaveLength(1);
      expect(result.snapshot.documents).toHaveLength(1);
      await page.close();
    });

    it('preserves full local histories and own prototype-like keys through reload without replicating them', async () => {
      const { page, database } = await pageFor();
      const before = await page.evaluate(async () => {
        const value = JSON.parse('{"__proto__":{"contextRef":"original"},"constructor":"kept"}');
        value.chat = Array.from({ length: 40 }, (_, index) => ({
          text: `original-${index}`,
          contextRef: { xid: String(index) },
        }));
        value.readings = Array.from({ length: 20 }, (_, index) => ({ text: `article-${index}` }));
        await window.fixture.commit({
          ...window.fixture.local(),
          operations: [],
          mutations: [{ kind: 'put', collection: 'private', id: '__proto__', value }],
        });
        return window.fixture.snapshot();
      });
      await page.reload();
      await page.waitForFunction(() => !!window.fixture);
      await page.evaluate((name) => window.fixture.open(name), database);
      const after = await page.evaluate(() => window.fixture.snapshot());
      expect(after).toEqual(before);
      // Playwright's value serializer sanitizes prototype-like keys. Check the
      // own property in the browser and transport its JSON text explicitly.
      const exact = await page.evaluate(async () =>
        JSON.stringify((await window.fixture.snapshot()).documents[0]?.value),
      );
      const restored = JSON.parse(exact!) as Record<string, { contextRef: string }>;
      expect(Object.hasOwn(restored, '__proto__')).toBe(true);
      expect(restored['__proto__']?.contextRef).toBe('original');
      expect(after.outbox).toEqual([]);
      expect(after.actor.sequence).toBe(0);
      await page.close();
    });

    it('retries durable intent after reload without a second sequence and rejects changed intent', async () => {
      const { page, database } = await pageFor();
      await page.evaluate(() => window.fixture.commit(window.fixture.local()));
      await page.reload();
      await page.waitForFunction(() => !!window.fixture);
      await page.evaluate((name) => window.fixture.open(name), database);
      const duplicate = await page.evaluate(() => window.fixture.commit(window.fixture.local()));
      expect(duplicate.outcome).toBe('duplicate');
      await expect(
        page.evaluate(() =>
          window.fixture.commit({
            ...window.fixture.local(),
            occurredAt: '2026-09-11T00:00:00.000Z',
          }),
        ),
      ).rejects.toThrow('change-identity-conflict');
      const snapshot = await page.evaluate(() => window.fixture.snapshot());
      expect(snapshot.actor.sequence).toBe(1);
      expect(snapshot.revision).toBe(1);
      await page.close();
    });

    it('serializes independent tabs and rejects a stale snapshot before any acknowledged overwrite', async () => {
      const first = await pageFor();
      const second = await pageFor(first.database);
      const commit = (page: Page, changeId: string, expectedRevision: number) =>
        page.evaluate(
          ({ changeId, expectedRevision }) =>
            window.fixture.commit({
              ...window.fixture.local(changeId, expectedRevision),
              mutations: [{ kind: 'put', collection: 'notes', id: changeId, value: changeId }],
            }),
          { changeId, expectedRevision },
        );
      const results = await Promise.allSettled([
        commit(first.page, 'tab-a', 0),
        commit(second.page, 'tab-b', 0),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const failed = results.findIndex((result) => result.status === 'rejected');
      expect(String((results[failed] as PromiseRejectedResult).reason)).toContain('stale-revision');
      await commit(failed === 0 ? first.page : second.page, failed === 0 ? 'tab-a' : 'tab-b', 1);
      const state = await first.page.evaluate(() => window.fixture.snapshot());
      expect(state.documents.map((document) => document.id).sort()).toEqual(['tab-a', 'tab-b']);
      expect(state.actor.sequence).toBe(2);
      expect(state.outbox).toHaveLength(2);
      await first.page.close();
      await second.page.close();
    });

    it('keeps a sibling snapshot behind an in-flight writer until its complete transaction is visible', async () => {
      const first = await pageFor();
      await first.page.evaluate(() => window.fixture.commit(window.fixture.local()));
      const second = await pageFor(first.database);
      await second.page.evaluate(() => {
        window.fixture.arm('receipt', 'hold');
        void window.fixture
          .commit({
            ...window.fixture.local('replace', 1),
            mutations: [
              {
                kind: 'put',
                collection: 'local-reading',
                id: 'article-a',
                value: 'new-full-document',
              },
            ],
          })
          .catch(() => undefined);
      });
      await second.page.waitForFunction(() => window.fixture.fault()?.requestSucceeded === true);
      const snapshot = first.page.evaluate(() => window.fixture.snapshot());
      expect(
        await Promise.race([snapshot.then(() => 'resolved'), delay(50).then(() => 'pending')]),
      ).toBe('pending');
      await second.page.evaluate(() => window.fixture.disarm());
      const current = await snapshot;
      expect(current.documents[0]?.value).toBe('new-full-document');
      expect(current.actor.sequence).toBe(2);
      expect(current.outbox).toHaveLength(2);
      expect(current.revision).toBe(2);
      await first.page.close();
      await second.page.close();
    });

    it('keeps identical IDs separate by both account and learner', async () => {
      const { page, database } = await pageFor();
      const states = await page.evaluate(async (name) => {
        const policies = [
          window.fixture.POLICY,
          {
            ...window.fixture.POLICY,
            binding: { ...window.fixture.POLICY.binding, learnerId: 'learner-b' },
          },
          {
            ...window.fixture.POLICY,
            binding: { ...window.fixture.POLICY.binding, accountId: 'account-b' },
          },
        ];
        for (let index = 0; index < policies.length; index++) {
          const policy = policies[index]!;
          await window.fixture.open(name, String(index), { policy });
          await window.fixture.commit(
            {
              ...window.fixture.local(),
              binding: policy.binding,
              mutations: [{ kind: 'put', collection: 'notes', id: 'same', value: index }],
            },
            String(index),
          );
        }
        return Promise.all(policies.map((_, index) => window.fixture.snapshot(String(index))));
      }, database);
      expect(states.map((state) => state.documents[0]?.value)).toEqual([0, 1, 2]);
      expect(
        new Set(states.flatMap((state) => state.outbox.map((operation) => operation.opId))).size,
      ).toBe(3);
      await page.close();
    });

    it('fences old tabs and captured requests after a distinct session replacement', async () => {
      const { page, database } = await pageFor();
      const sibling = await pageFor(database);
      await expect(
        page.evaluate(() => window.fixture.replace(0, window.fixture.POLICY.binding)),
      ).rejects.toThrow('invalid-request');
      await expect(
        page.evaluate(() =>
          window.fixture.replace(0, {
            ...window.fixture.POLICY.binding,
            accountId: 'different',
            sessionId: 'session-b',
          }),
        ),
      ).rejects.toThrow();
      await page.evaluate(() =>
        window.fixture.replace(0, { ...window.fixture.POLICY.binding, sessionId: 'session-b' }),
      );
      await expect(sibling.page.evaluate(() => window.fixture.snapshot())).rejects.toThrow();
      await expect(
        sibling.page.evaluate(() => window.fixture.commit(window.fixture.local())),
      ).rejects.toThrow();
      await page.evaluate(
        (name) =>
          window.fixture.open(name, 'new', {
            policy: {
              ...window.fixture.POLICY,
              binding: { ...window.fixture.POLICY.binding, sessionId: 'session-b' },
            },
          }),
        database,
      );
      await expect(
        page.evaluate(() =>
          window.fixture.commit({ ...window.fixture.local(), expectedRevision: 1 }, 'new'),
        ),
      ).rejects.toThrow();
      const snapshot = await page.evaluate(() => window.fixture.snapshot('new'));
      expect(snapshot.revision).toBe(1);
      expect(snapshot.documents).toEqual([]);
      await expect(
        page.evaluate(() =>
          window.fixture.receive(
            window.fixture.delivery([window.fixture.remote('late')], 1),
            'new',
          ),
        ),
      ).rejects.toThrow('stale-session');
      await expect(
        page.evaluate(() =>
          window.fixture.acknowledge(
            {
              acknowledgementId: 'late-ack',
              binding: window.fixture.POLICY.binding,
              expectedRevision: 1,
              operations: [window.fixture.operationReference(window.fixture.remote('late'))],
            },
            'new',
          ),
        ),
      ).rejects.toThrow('stale-session');
      await page.close();
      await sibling.page.close();
    });

    it.each(['document', 'operation', 'outbox', 'actor', 'profile', 'receipt'])(
      'rolls back local state after a real successful %s write is aborted',
      async (kind) => {
        const { page, database } = await pageFor();
        const before = await page.evaluate(() => window.fixture.snapshot());
        await page.evaluate((target) => window.fixture.arm(target, 'abort'), kind);
        await expect(
          page.evaluate(() => window.fixture.commit(window.fixture.local())),
        ).rejects.toThrow();
        expect(await page.evaluate(() => window.fixture.fault()?.requestSucceeded)).toBe(true);
        await page.reload();
        await page.waitForFunction(() => !!window.fixture);
        await page.evaluate((name) => window.fixture.open(name), database);
        expect(await page.evaluate(() => window.fixture.snapshot())).toEqual(before);
        await page.evaluate(() => window.fixture.commit(window.fixture.local()));
        expect((await page.evaluate(() => window.fixture.snapshot())).actor.sequence).toBe(1);
        await page.close();
      },
    );

    it.each(['operation', 'inbox', 'checkpoint', 'profile', 'receipt'])(
      'rolls back receive/projection/checkpoint after a real successful %s write is aborted',
      async (kind) => {
        const { page, database } = await pageFor();
        await page.evaluate(() => window.fixture.commit(window.fixture.local()));
        const before = await page.evaluate(() => window.fixture.snapshot());
        await page.evaluate((target) => window.fixture.arm(target, 'abort'), kind);
        await expect(
          page.evaluate(() =>
            window.fixture.receive({
              deliveryId: 'delivery-a',
              expectedRevision: 1,
              delivery: {
                binding: window.fixture.POLICY.binding,
                operations: [window.fixture.remote('remote-a')],
              },
              checkpoint: { channelId: 'cloud', expected: null, next: 'cursor-a' },
            }),
          ),
        ).rejects.toThrow();
        expect(await page.evaluate(() => window.fixture.fault()?.requestSucceeded)).toBe(true);
        await page.reload();
        await page.waitForFunction(() => !!window.fixture);
        await page.evaluate((name) => window.fixture.open(name), database);
        expect(await page.evaluate(() => window.fixture.snapshot())).toEqual(before);
        await page.close();
      },
    );

    it.each(['constraint', 'throw-quota'] as const)(
      'does not acknowledge a failed real transaction (%s)',
      async (mode) => {
        const { page } = await pageFor();
        const before = await page.evaluate(() => window.fixture.snapshot());
        await page.evaluate((mode) => window.fixture.arm('outbox', mode), mode);
        await expect(
          page.evaluate(() => window.fixture.commit(window.fixture.local())),
        ).rejects.toThrow();
        expect(await page.evaluate(() => window.fixture.fault()?.fired)).toBe(true);
        await page.evaluate(() => window.fixture.disarm());
        expect(await page.evaluate(() => window.fixture.snapshot())).toEqual(before);
        await page.close();
      },
    );

    it.each(['outbox', 'receipt'])(
      'recovers an interrupted open transaction after closing its tab at %s',
      async (kind) => {
        const { page, database } = await pageFor();
        const before = await page.evaluate(() => window.fixture.snapshot());
        await page.evaluate((target) => {
          window.fixture.arm(target, 'hold');
          void window.fixture.commit(window.fixture.local()).catch(() => undefined);
        }, kind);
        await page.waitForFunction(() => window.fixture.fault()?.requestSucceeded === true);
        await page.close();
        const reopened = await pageFor(database);
        expect(await reopened.page.evaluate(() => window.fixture.snapshot())).toEqual(before);
        await reopened.page.evaluate(() => window.fixture.commit(window.fixture.local()));
        expect((await reopened.page.evaluate(() => window.fixture.snapshot())).outbox).toHaveLength(
          1,
        );
        await reopened.page.close();
      },
    );

    it('resolves a lost post-COMMIT acknowledgement by receipt after tab close', async () => {
      const { page, database } = await pageFor();
      await page.evaluate(() => {
        window.fixture.arm('receipt', 'lose-ack');
        void window.fixture.commit(window.fixture.local()).catch(() => undefined);
      });
      await page.waitForFunction(() => window.fixture.fault()?.completed === true);
      await page.close();
      const reopened = await pageFor(database);
      const receipt = await reopened.page.evaluate(() =>
        window.fixture.commit(window.fixture.local()),
      );
      expect(receipt.outcome).toBe('duplicate');
      const state = await reopened.page.evaluate(() => window.fixture.snapshot());
      expect(state.revision).toBe(1);
      expect(state.outbox).toHaveLength(1);
      expect(state.actor.sequence).toBe(1);
      await reopened.page.close();
    });

    it('retains the durable outbox while pending arrivals become ready or quarantined after reload', async () => {
      const { page, database } = await pageFor();
      const pending = await page.evaluate(async () => {
        await window.fixture.commit(window.fixture.local());
        const parent = window.fixture.remote('parent');
        const child = window.fixture.remote('child', parent);
        const badParent = window.fixture.remote(
          'bad-parent',
          undefined,
          window.fixture.note('bad-parent'),
          'third-device',
        );
        const badChild = window.fixture.recreate(
          window.fixture.remote(
            'bad-child',
            badParent,
            window.fixture.note('bad-child'),
            'third-device',
          ),
          { predecessor: { opId: badParent.opId, sha256: 'f'.repeat(64) } },
        );
        await window.fixture.receive(window.fixture.delivery([child, badChild], 1));
        return window.fixture.snapshot();
      });
      expect(pending.replica.pending).toHaveLength(2);
      expect(pending.outbox).toHaveLength(1);
      await page.reload();
      await page.waitForFunction(() => !!window.fixture);
      await page.evaluate((name) => window.fixture.open(name), database);
      const ready = await page.evaluate(async () => {
        const parent = window.fixture.remote('parent');
        const badParent = window.fixture.remote(
          'bad-parent',
          undefined,
          window.fixture.note('bad-parent'),
          'third-device',
        );
        await window.fixture.receive(
          window.fixture.delivery([parent, badParent], 2, 'parents', 'cursor-a', 'cursor-b'),
        );
        return window.fixture.snapshot();
      });
      expect(ready.replica.operations).toHaveLength(5);
      expect(ready.replica.pending).toEqual([]);
      expect(ready.replica.quarantined).toHaveLength(1);
      expect(ready.replica.quarantined[0]?.reason).toBe('causal-reference-conflict');
      expect(ready.outbox).toEqual(pending.outbox);
      expect(ready.inbox).toHaveLength(4);
      expect(ready.checkpoints).toEqual([{ channelId: 'cloud', value: 'cursor-b' }]);
      await page.close();
    });

    it('requires exact outbox acknowledgements, retains echoes, and rolls back a failed acknowledgement', async () => {
      const { page, database } = await pageFor();
      await page.evaluate(async () => {
        await window.fixture.commit(window.fixture.local());
        await window.fixture.commit(window.fixture.local('second', 1));
        const own = (await window.fixture.snapshot()).outbox;
        await window.fixture.receive(window.fixture.delivery(own, 2));
      });
      const before = await page.evaluate(() => window.fixture.snapshot());
      expect(before.outbox).toHaveLength(2);
      expect(before.inbox).toHaveLength(2);
      await expect(
        page.evaluate(async () =>
          window.fixture.acknowledge({
            acknowledgementId: 'invalid',
            binding: window.fixture.POLICY.binding,
            expectedRevision: 3,
            operations: [
              ...(await window.fixture.snapshot()).outbox.map(window.fixture.operationReference),
              window.fixture.operationReference(window.fixture.remote('unknown')),
            ],
          }),
        ),
      ).rejects.toThrow('invalid-request');
      await page.evaluate(() => window.fixture.arm('outbox', 'abort'));
      await expect(
        page.evaluate(async () =>
          window.fixture.acknowledge({
            acknowledgementId: 'ack-a',
            binding: window.fixture.POLICY.binding,
            expectedRevision: 3,
            operations: (await window.fixture.snapshot()).outbox.map(
              window.fixture.operationReference,
            ),
          }),
        ),
      ).rejects.toThrow();
      await page.evaluate(() => window.fixture.disarm());
      expect(await page.evaluate(() => window.fixture.snapshot())).toEqual(before);
      await page.evaluate(async () =>
        window.fixture.acknowledge({
          acknowledgementId: 'ack-a',
          binding: window.fixture.POLICY.binding,
          expectedRevision: 3,
          operations: (await window.fixture.snapshot()).outbox.map(
            window.fixture.operationReference,
          ),
        }),
      );
      await page.reload();
      await page.waitForFunction(() => !!window.fixture);
      await page.evaluate((name) => window.fixture.open(name), database);
      const retried = await page.evaluate(
        (operations) =>
          window.fixture.acknowledge({
            acknowledgementId: 'ack-a',
            binding: window.fixture.POLICY.binding,
            expectedRevision: 3,
            operations,
          }),
        before.outbox.map((operation) => ({
          opId: operation.opId,
          sha256: before.inbox.find((item) => item.operation.opId === operation.opId)!.operation
            .sha256,
        })),
      );
      expect(retried.outcome).toBe('duplicate');
      const after = await page.evaluate(() => window.fixture.snapshot());
      expect(after.outbox).toEqual([]);
      expect(after.acknowledgedOutbox).toHaveLength(2);
      expect(after.replica.operations).toHaveLength(2);
      await page.close();
    });

    it('rejects mixed-owner batches, changed operation bytes, and stale cursor expectations atomically', async () => {
      const { page } = await pageFor();
      const before = await page.evaluate(() => window.fixture.snapshot());
      await expect(
        page.evaluate(() =>
          window.fixture.receive(
            window.fixture.delivery([
              window.fixture.remote('valid'),
              window.fixture.recreate(
                window.fixture.remote(
                  'foreign',
                  undefined,
                  window.fixture.note('foreign'),
                  'phone-c',
                ),
                { scope: { accountId: 'account-b', learnerId: 'learner-a' } },
              ),
            ]),
          ),
        ),
      ).rejects.toThrow();
      expect(await page.evaluate(() => window.fixture.snapshot())).toEqual(before);
      await page.evaluate(() =>
        window.fixture.receive(window.fixture.delivery([window.fixture.remote('valid')])),
      );
      const accepted = await page.evaluate(() => window.fixture.snapshot());
      await expect(
        page.evaluate(() => window.fixture.receive(window.fixture.delivery([], 1, 'wrong-cursor'))),
      ).rejects.toThrow('checkpoint-conflict');
      await expect(
        page.evaluate(() =>
          window.fixture.receive(
            window.fixture.delivery(
              [
                window.fixture.remote('other', undefined, window.fixture.note('other'), 'phone-c'),
                window.fixture.recreate(window.fixture.remote('valid'), {
                  payload: window.fixture.note('valid', 'Changed bytes'),
                }),
              ],
              1,
              'changed',
              'cursor-a',
              'cursor-b',
            ),
          ),
        ),
      ).rejects.toThrow();
      expect(await page.evaluate(() => window.fixture.snapshot())).toEqual(accepted);
      expect(
        (
          await page.evaluate(() =>
            window.fixture.receive(window.fixture.delivery([window.fixture.remote('valid')])),
          )
        ).outcome,
      ).toBe('duplicate');
      await page.close();
    });

    it('rejects unseen local-actor claims and cannot adopt incoming counter authority', async () => {
      const { page, database } = await pageFor();
      await expect(
        page.evaluate(() =>
          window.fixture.receive(
            window.fixture.delivery([
              window.fixture.recreate(window.fixture.remote('claim'), {
                actor: { ...window.fixture.ACTOR, sequence: 1 },
              }),
            ]),
          ),
        ),
      ).rejects.toThrow('local-actor-conflict');
      await page.evaluate(() =>
        window.fixture.receive(window.fixture.delivery([window.fixture.remote('accepted')])),
      );
      await expect(
        page.evaluate(
          (name) =>
            window.fixture.open(name, 'borrowed', {
              actor: { deviceId: 'phone-b', incarnationId: 'install-b' },
            }),
          database,
        ),
      ).rejects.toThrow('local-actor-conflict');
      await page.evaluate(
        (name) =>
          window.fixture.open(name, 'fresh', {
            actor: { deviceId: 'phone-b', incarnationId: 'new-incarnation' },
          }),
        database,
      );
      await page.evaluate(() => window.fixture.commit(window.fixture.local('fresh', 1), 'fresh'));
      expect((await page.evaluate(() => window.fixture.snapshot('fresh'))).actor.sequence).toBe(1);
      await page.close();
    });

    it('rejects lossy full data and smuggled replicated authority without writing local documents', async () => {
      const { page } = await pageFor();
      const result = await page.evaluate(async () => {
        let invoked = false;
        let rejected = 0;
        const value = Object.defineProperty({}, 'text', {
          enumerable: true,
          get() {
            invoked = true;
            return 'not-read';
          },
        });
        try {
          await window.fixture.commit({
            ...window.fixture.local(),
            mutations: [{ kind: 'put', collection: 'notes', id: 'bad', value }],
          });
        } catch {
          rejected += 1;
        }
        try {
          await window.fixture.commit({
            ...window.fixture.local(),
            operations: [
              {
                payload: Object.assign(window.fixture.note('bad'), {
                  apiKey: 'SYNTHETIC_NOT_A_CREDENTIAL',
                }),
                dependencies: [],
              },
            ],
          });
        } catch {
          rejected += 1;
        }
        return { invoked, rejected, snapshot: await window.fixture.snapshot() };
      });
      expect(result.invoked).toBe(false);
      expect(result.rejected).toBe(2);
      expect(result.snapshot.documents).toEqual([]);
      expect(result.snapshot.outbox).toEqual([]);
      await page.close();
    });

    it('retains concurrent facts and explicit tombstones through reload using the shared projection', async () => {
      const { page, database } = await pageFor();
      const concurrent = await page.evaluate(async () => {
        await window.fixture.receive(
          window.fixture.delivery([
            window.fixture.remote('a'),
            window.fixture.remote(
              'b',
              undefined,
              window.fixture.note('b', 'Concurrent note'),
              'phone-c',
            ),
          ]),
        );
        return window.fixture.snapshot();
      });
      expect(concurrent.replica.projection.entities[0]?.requiresChoice).toBe(true);
      await page.evaluate(() =>
        window.fixture.receive(
          window.fixture.delivery(
            [
              window.fixture.remote(
                'delete',
                undefined,
                {
                  kind: 'entity.tombstone',
                  target: { kind: 'note', id: 'note-a' },
                  reason: 'user-deleted',
                },
                'phone-d',
              ),
            ],
            1,
            'delete',
            'cursor-a',
            'cursor-b',
          ),
        ),
      );
      await page.reload();
      await page.waitForFunction(() => !!window.fixture);
      await page.evaluate((name) => window.fixture.open(name), database);
      const deleted = await page.evaluate(() => window.fixture.snapshot());
      expect(deleted.replica.operations).toHaveLength(3);
      expect(deleted.replica.projection.entities[0]?.versions).toEqual([]);
      expect(deleted.replica.projection.entities[0]?.tombstones).toHaveLength(1);
      expect(deleted.replica.projection.suppressed).toHaveLength(2);
      await page.close();
    });

    it('rebuilds 1,005 durable operations across receive batches and reload without pruning', async () => {
      const { page, database } = await pageFor();
      await page.evaluate(async () => {
        const operations = Array.from({ length: 1005 }, (_, index) =>
          window.fixture.remote(
            `version-${index}`,
            undefined,
            window.fixture.note(`version-${index}`),
            `remote-${index}`,
          ),
        );
        await window.fixture.receive(window.fixture.delivery(operations.slice(0, 1000)));
        await window.fixture.receive(
          window.fixture.delivery(operations.slice(1000), 1, 'second', 'cursor-a', 'cursor-b'),
        );
      });
      const before = await page.evaluate(() => window.fixture.snapshot());
      await page.reload();
      await page.waitForFunction(() => !!window.fixture);
      await page.evaluate((name) => window.fixture.open(name), database);
      const after = await page.evaluate(() => window.fixture.snapshot());
      expect(after).toEqual(before);
      expect(after.replica.operations).toHaveLength(1005);
      expect(after.inbox).toHaveLength(1005);
      await page.close();
    }, 30_000);

    it('closes an old connection on versionchange and refuses the unknown upgraded version', async () => {
      const { page, database } = await pageFor();
      await page.evaluate(() => window.fixture.commit(window.fixture.local()));
      const count = await page.evaluate(async (name) => {
        const db = await window.fixture.rawOpen(name, 2);
        const tx = db.transaction('kairo_replication_rows', 'readonly');
        const request = tx.objectStore('kairo_replication_rows').count();
        return new Promise<number>((resolve, reject) => {
          tx.oncomplete = () => {
            db.close();
            resolve(request.result);
          };
          tx.onabort = () => reject(tx.error);
        });
      }, database);
      expect(count).toBeGreaterThan(0);
      await expect(page.evaluate(() => window.fixture.snapshot())).rejects.toThrow('closed');
      await expect(
        page.evaluate((name) => window.fixture.open(name, 'new'), database),
      ).rejects.toThrow('unsupported-schema');
      const untouched = await page.evaluate(async (name) => {
        const db = await window.fixture.rawOpen(name);
        const tx = db.transaction('kairo_replication_rows', 'readonly');
        const request = tx.objectStore('kairo_replication_rows').count();
        return new Promise((resolve, reject) => {
          tx.oncomplete = () => {
            db.close();
            resolve({ version: db.version, count: request.result });
          };
          tx.onabort = () => reject(tx.error);
        });
      }, database);
      expect(untouched).toEqual({ version: 2, count });
      await page.close();
    });

    it.each(['marker', 'shape', 'digest'])(
      'fails closed on an incompatible %s while preserving stored bytes',
      async (fault) => {
        const { page, database } = await pageFor();
        await page.evaluate(() => window.fixture.commit(window.fixture.local()));
        const corrupt = await page.evaluate(
          async ({ name, fault }) => {
            await window.fixture.close();
            const db = await window.fixture.rawOpen(name);
            const tx = db.transaction(
              ['kairo_replication_rows', 'kairo_replication_meta'],
              'readwrite',
            );
            const rows = tx.objectStore('kairo_replication_rows');
            const all = rows.getAll();
            let altered = '';
            all.onsuccess = () => {
              if (fault === 'marker')
                tx.objectStore('kairo_replication_meta').put({
                  id: 'schema',
                  format: 'future-format',
                  v: 99,
                });
              else if (fault === 'shape') tx.objectStore('kairo_replication_meta').delete('schema');
              else {
                const row = all.result.find((item: { kind: string }) => item.kind === 'document');
                row.text += ' ';
                rows.put(row);
                altered = row.text;
              }
            };
            return new Promise((resolve, reject) => {
              tx.oncomplete = () => {
                db.close();
                resolve({ count: all.result.length, altered });
              };
              tx.onabort = () => reject(tx.error);
            });
          },
          { name: database, fault },
        );
        await expect(page.evaluate((name) => window.fixture.open(name), database)).rejects.toThrow(
          fault === 'digest' ? 'corrupt-store' : 'unsupported-schema',
        );
        const after = (await page.evaluate(async (name) => {
          const db = await window.fixture.rawOpen(name);
          const tx = db.transaction('kairo_replication_rows', 'readonly');
          const all = tx.objectStore('kairo_replication_rows').getAll();
          return new Promise((resolve, reject) => {
            tx.oncomplete = () => {
              db.close();
              resolve({
                count: all.result.length,
                altered: all.result.find((row: { kind: string }) => row.kind === 'document')?.text,
              });
            };
            tx.onabort = () => reject(tx.error);
          });
        }, database)) as { count: number; altered: string };
        expect(after.count).toBe((corrupt as { count: number }).count);
        if (fault === 'digest')
          expect(after.altered).toBe((corrupt as { altered: string }).altered);
        await page.close();
      },
    );

    it('times out behind a blocked upgrade and closes any late connection instead of leaking it', async () => {
      const { page, database } = await pageFor();
      const result = await page.evaluate(async (name) => {
        await window.fixture.close();
        const blocker = await window.fixture.rawOpen(name);
        let upgrade: IDBOpenDBRequest;
        const blocked = new Promise<void>((resolve) => {
          upgrade = indexedDB.open(name, 2);
          upgrade.onblocked = () => resolve();
        });
        await blocked;
        let code = '';
        try {
          await window.fixture.open(name, 'late', { openTimeoutMs: 100 });
        } catch (error) {
          code = (error as Error).message;
        }
        const completed = new Promise<void>((resolve, reject) => {
          upgrade!.onsuccess = () => {
            upgrade!.result.close();
            resolve();
          };
          upgrade!.onerror = () => reject(upgrade!.error);
        });
        blocker.close();
        await completed;
        let deletionBlocked = false;
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onblocked = () => {
            deletionBlocked = true;
            reject(new Error('Leaked late IndexedDB connection'));
          };
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        return { code, deletionBlocked };
      }, database);
      expect(result.code).toContain('reopen-required');
      expect(result.deletionBlocked).toBe(false);
      await page.close();
    });

    it('refuses an unrelated schema without upgrading or resetting it', async () => {
      const { page, database } = await pageFor();
      const alien = `${database}-unrelated`;
      await page.evaluate(
        (name) =>
          new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(name, 1);
            request.onupgradeneeded = () =>
              request.result.createObjectStore('other-product').put('preserved', 'user-data');
            request.onsuccess = () => {
              request.result.close();
              resolve();
            };
            request.onerror = () => reject(request.error);
          }),
        alien,
      );
      await expect(
        page.evaluate((name) => window.fixture.open(name, 'alien'), alien),
      ).rejects.toThrow('unsupported-schema');
      const untouched = await page.evaluate(async (name) => {
        const db = await window.fixture.rawOpen(name);
        const tx = db.transaction('other-product', 'readonly');
        const request = tx.objectStore('other-product').get('user-data');
        return new Promise((resolve, reject) => {
          tx.oncomplete = () => {
            db.close();
            resolve({
              stores: [...db.objectStoreNames],
              value: request.result,
              version: db.version,
            });
          };
          tx.onabort = () => reject(tx.error);
        });
      }, alien);
      expect(untouched).toEqual({ stores: ['other-product'], value: 'preserved', version: 1 });
      await page.close();
    });

    it('awaits outstanding transactions on close and rejects subsequent writes', async () => {
      const { page, database } = await pageFor();
      const receipt = await page.evaluate(async () => {
        const committed = window.fixture.commit(window.fixture.local());
        const closed = window.fixture.close();
        const late = window.fixture.commit(window.fixture.local('late', 1)).then(
          () => 'unexpected-success',
          (error: Error) => error.message,
        );
        const result = await committed;
        await closed;
        return { result, complete: window.fixture.completed(), late: await late };
      });
      expect(receipt.result.outcome).toBe('committed');
      expect(receipt.complete).toBe(true);
      expect(receipt.late).toContain('closed');
      await page.evaluate((name) => window.fixture.open(name), database);
      expect((await page.evaluate(() => window.fixture.snapshot())).outbox).toHaveLength(1);
      await page.close();
    });

    it('fails closed when the browser denies access to IndexedDB', async () => {
      const { page, database } = await pageFor();
      const denied = await page.evaluate(async (name) => {
        Object.defineProperty(window, 'indexedDB', {
          configurable: true,
          get() {
            throw new DOMException('Synthetic storage denial', 'SecurityError');
          },
        });
        try {
          await window.fixture.open(name, 'denied');
          return false;
        } catch {
          return true;
        }
      }, database);
      expect(denied).toBe(true);
      await page.close();
    });

    if (engine === 'chromium') {
      it.each(['hold', 'lose-ack'] as const)(
        'recovers from an actual Chromium browser-process crash (%s)',
        async (mode) => {
          const stages: string[] = [];
          const stage = async (value: string) => {
            stages.push(value);
            await writeFile(join(evidence, `process-crash-${mode}.json`), JSON.stringify(stages));
          };
          const { page, database } = await pageFor();
          await page.evaluate((mode) => {
            window.fixture.arm('receipt', mode);
            void window.fixture.commit(window.fixture.local()).catch(() => undefined);
          }, mode);
          if (mode === 'hold')
            await page.waitForFunction(() => window.fixture.fault()?.requestSucceeded === true);
          else await page.waitForFunction(() => window.fixture.fault()?.completed === true);
          const browser = context.browser();
          if (!browser) throw new Error('Missing isolated browser process');
          const cdp = await browser.newBrowserCDPSession();
          await stage('armed-before-process-crash');
          const disconnected = new Promise<void>((resolve) =>
            browser.once('disconnected', () => resolve()),
          );
          // Browser.crash intentionally has no successful protocol reply. The
          // process disconnect, not the command promise, is the observation.
          void cdp.send('Browser.crash').catch(() => undefined);
          await disconnected;
          await stage('browser-disconnected');
          expect(browser.isConnected()).toBe(false);
          await context.close();
          await stage('context-closed');
          await launch();
          await stage('browser-relaunched');
          const reopened = await pageFor(database);
          await stage('database-reopened');
          const beforeRetry = await reopened.page.evaluate(() => window.fixture.snapshot());
          expect(beforeRetry.revision).toBe(mode === 'hold' ? 0 : 1);
          expect(beforeRetry.actor.sequence).toBe(mode === 'hold' ? 0 : 1);
          expect(beforeRetry.outbox).toHaveLength(mode === 'hold' ? 0 : 1);
          const receipt = await reopened.page.evaluate(() =>
            window.fixture.commit(window.fixture.local()),
          );
          expect(receipt.outcome).toBe(mode === 'hold' ? 'committed' : 'duplicate');
          expect(
            (await reopened.page.evaluate(() => window.fixture.snapshot())).outbox,
          ).toHaveLength(1);
          await stage('retry-verified-with-one-durable-operation');
          await reopened.page.close();
        },
        15_000,
      );
    }

    it('retains acknowledged data through a complete browser restart', async () => {
      const { page, database } = await pageFor();
      await page.evaluate(() => window.fixture.commit(window.fixture.local()));
      const before = await page.evaluate(() => window.fixture.snapshot());
      await context.close();
      await launch();
      const reopened = await pageFor(database);
      expect(await reopened.page.evaluate(() => window.fixture.snapshot())).toEqual(before);
      await reopened.page.close();
    });
  },
);
