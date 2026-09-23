import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { chromium, webkit, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {} from './restore-browser-fixture.ts';

const requested = (process.env['KAIRO_IDB_BROWSERS'] ?? 'chromium,webkit').split(',');
const engines = [
  ['chromium', chromium],
  ['webkit', webkit],
] as const;
if (requested.some((name) => !engines.some(([engine]) => engine === name)))
  throw new Error('Unknown KAIRO_IDB_BROWSERS engine');

describe.each(engines.filter(([name]) => requested.includes(name)))(
  'operation restore in native IndexedDB: %s',
  (engine, browserType) => {
    let browser: Browser;
    let context: BrowserContext;
    let server: Server;
    let origin: string;
    let evidence: string;
    let serial = 0;
    const errors: string[] = [];
    async function pageFor(
      database = `restore-${engine}-${serial++}`,
    ): Promise<{ page: Page; database: string }> {
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin);
      await page.waitForFunction(() => !!window.restoreFixture);
      await page.evaluate((database) => window.restoreFixture.open(database), database);
      return { page, database };
    }
    beforeAll(async () => {
      const base =
        process.env['KAIRO_EVIDENCE_DIR'] ??
        join(homedir(), '.dharma/test-runtime/replication-restore-browser');
      await mkdir(base, { recursive: true });
      evidence = await mkdtemp(join(base, `${engine}-`));
      const bundled = await build({
        entryPoints: [fileURLToPath(new URL('./restore-browser-fixture.ts', import.meta.url))],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        metafile: true,
      });
      expect(
        Object.keys(bundled.metafile.inputs).some((file) => /\/sqlite(?:\/|\.ts$)/u.test(file)),
      ).toBe(false);
      const script = bundled.outputFiles[0]!.contents;
      server = createServer((request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader(
          'Content-Type',
          request.url === '/fixture.js' ? 'text/javascript' : 'text/html',
        );
        response.end(
          request.url === '/fixture.js'
            ? script
            : '<!doctype html><title>Synthetic journal restore</title><script src="/fixture.js"></script>',
        );
      });
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing restore fixture origin');
      origin = `http://127.0.0.1:${address.port}`;
      browser = await browserType.launch();
      context = await browser.newContext();
      await writeFile(
        join(evidence, 'engine.json'),
        JSON.stringify(
          {
            engine,
            version: browser.version(),
            bundleInputs: Object.keys(bundled.metafile.inputs),
          },
          null,
          2,
        ),
      );
    });
    afterAll(async () => {
      await context?.close();
      await browser?.close();
      if (server) await new Promise<void>((done) => server.close(() => done()));
      // Native synthetic databases disappear with the context; keep engine receipt.
      expect(errors).toEqual([]);
    });

    it('merges between two real databases, retains deletion/outbox/cursors and displays the same returned projection after reopen', async () => {
      const { page, database } = await pageFor();
      const result = await page.evaluate(async (database) => {
        const f = window.restoreFixture;
        await f.open(`${database}-source`, 'source', {
          deviceId: 'offline-tablet',
          incarnationId: 'tablet-install',
        });
        const initial = f.remote('original');
        const delivery = {
          deliveryId: 'existing-channel',
          expectedRevision: 0,
          delivery: { binding: f.POLICY.binding, operations: [initial] },
          checkpoint: { channelId: 'network', expected: null, next: 'cursor-existing' },
        };
        await f.receive(delivery);
        await f.receive(delivery, 'source');
        await f.commit({
          ...f.local('delete', 1),
          operations: [
            {
              payload: {
                kind: 'entity.tombstone',
                target: { kind: 'note', id: 'note-a' },
                reason: 'user-deleted',
              },
              dependencies: [f.operationReference(initial)],
            },
          ],
        });
        await f.commit(
          {
            ...f.local('stale-change', 1),
            operations: [
              {
                payload: {
                  kind: 'note.version',
                  noteId: 'note-a',
                  versionId: 'stale-edit',
                  generation: null,
                  supersedes: [f.operationReference(initial)],
                  segments: [{ kind: 'original', text: 'Stale edit' }],
                },
                dependencies: [],
              },
            ],
          },
          'source',
        );
        await f.commit(
          {
            ...f.local('offline-unrelated', 2),
            operations: [
              {
                payload: {
                  kind: 'note.version',
                  noteId: 'unrelated',
                  versionId: 'unrelated-v1',
                  generation: null,
                  supersedes: [],
                  segments: [{ kind: 'original', text: 'Retain this offline note' }],
                },
                dependencies: [],
              },
            ],
          },
          'source',
        );
        const before = await f.snapshot();
        const sourceBefore = await f.disk('source');
        const journal = f.exportOperationJournal((await f.snapshot('source')).replica);
        const receipt = await f.restore({ ...f.request(before.revision), backup: journal });
        const after = await f.snapshot();
        const sourceUnchanged = (await f.disk('source')) === sourceBefore;
        await f.close();
        await f.open(database);
        const reopened = await f.snapshot();
        return { before, after, reopened, receipt, sourceUnchanged };
      }, database);
      expect(result.receipt.operations).toHaveLength(2);
      expect(result.after.actor).toEqual(result.before.actor);
      expect(result.after.policy).toEqual(result.before.policy);
      expect(result.after.inbox).toEqual(result.before.inbox);
      expect(result.after.checkpoints).toEqual(result.before.checkpoints);
      expect(result.after.outbox).toHaveLength(result.before.outbox.length + 2);
      expect(result.after.replica.projection.suppressed).toHaveLength(2);
      expect(
        result.after.replica.projection.entities.find((entity) => entity.target.id === 'note-a')
          ?.versions,
      ).toEqual([]);
      expect(
        result.after.replica.projection.entities.find((entity) => entity.target.id === 'unrelated')
          ?.heads,
      ).toHaveLength(1);
      expect(result.sourceUnchanged).toBe(true);
      expect(result.reopened).toEqual(result.after);
      await page.close();
    });

    for (const kind of ['document', 'operation', 'outbox', 'profile', 'receipt']) {
      it(`rolls back all restore state after an actual ${kind} request succeeds and its native transaction aborts`, async () => {
        const { page, database } = await pageFor();
        const result = await page.evaluate(async (kind) => {
          const f = window.restoreFixture;
          await f.commit(f.local());
          const before = await f.disk();
          f.arm(kind, 'abort');
          let rejected = false;
          try {
            await f.restore(f.request());
          } catch {
            rejected = true;
          }
          const fault = f.fault();
          f.disarm();
          return { before, after: await f.disk(), fault, rejected };
        }, kind);
        expect(result.rejected).toBe(true);
        expect(result.fault).toMatchObject({ fired: true, succeeded: true, completed: false });
        expect(result.after).toBe(result.before);
        await page.close();
        const reopened = await pageFor(database);
        expect(await reopened.page.evaluate(() => window.restoreFixture.disk())).toBe(
          result.before,
        );
        await reopened.page.close();
      });
    }
    it('rolls back a quota throw after real native writes without altering actor or documents', async () => {
      const { page } = await pageFor();
      const result = await page.evaluate(async () => {
        const f = window.restoreFixture;
        await f.commit(f.local());
        const before = await f.disk();
        f.arm('outbox', 'quota');
        let message = '';
        try {
          await f.restore(f.request());
        } catch (error) {
          message = (error as Error).name;
        }
        const fault = f.fault();
        f.disarm();
        return { before, after: await f.disk(), fault, message };
      });
      expect(result.message).toBe('QuotaExceededError');
      expect(result.fault?.fired).toBe(true);
      expect(result.after).toBe(result.before);
      await page.close();
    });
    it('recovers a durable restore with lost native completion acknowledgement once after page close', async () => {
      const { page, database } = await pageFor();
      await page.evaluate(async () => {
        const f = window.restoreFixture;
        await f.commit(f.local());
        f.arm('receipt', 'lose-ack');
        void f.restore(f.request()).catch(() => undefined);
      });
      await page.waitForFunction(() => window.restoreFixture.fault()?.completed === true);
      await page.close();
      const reopened = await pageFor(database);
      const result = await reopened.page.evaluate(async () => {
        const f = window.restoreFixture;
        const before = await f.disk();
        const receipt = await f.restore(f.request());
        return { before, after: await f.disk(), receipt, snapshot: await f.snapshot() };
      });
      expect(result.receipt.outcome).toBe('duplicate');
      expect(result.after).toBe(result.before);
      expect(result.snapshot.actor.sequence).toBe(1);
      expect(result.snapshot.outbox).toHaveLength(2);
      expect(result.snapshot.revision).toBe(2);
      await reopened.page.close();
    });
    it('rejects changed restore bytes and wrong epoch before any payload getter can run', async () => {
      const { page } = await pageFor();
      const result = await page.evaluate(async () => {
        const f = window.restoreFixture;
        await f.commit(f.local());
        await f.restore(f.request());
        const before = await f.disk();
        let touched = false;
        const wrong = { ...f.request(), backup: { ...f.request().backup, deletionEpoch: 99 } };
        Object.defineProperty(wrong.backup, 'operations', {
          enumerable: true,
          get: () => {
            touched = true;
            throw new Error('UNTRUSTED_PAYLOAD');
          },
        });
        const codes = [];
        try {
          await f.restore(wrong);
        } catch (error) {
          codes.push((error as { code: string }).code);
        }
        try {
          await f.restore({ ...f.request(), mutations: [] });
        } catch (error) {
          codes.push((error as { code: string }).code);
        }
        return { before, after: await f.disk(), codes, touched };
      });
      expect(result.codes).toEqual(['epoch-mismatch', 'change-identity-conflict']);
      expect(result.touched).toBe(false);
      expect(result.after).toBe(result.before);
      await page.close();
    });
    it('restores a journal beyond the receive batch limit in one native transaction', async () => {
      const { page } = await pageFor();
      const result = await page.evaluate(async () => {
        const f = window.restoreFixture;
        let prior: ReturnType<typeof f.remote> | undefined;
        const operations = [];
        for (let index = 0; index < 1005; index++) {
          const next = f.remote(`large-${index}`, prior);
          operations.push(next);
          prior = next;
        }
        const backup = f.packed(operations);
        const before = await f.snapshot();
        const receipt = await f.restore({ ...f.request(0), backup });
        const after = await f.snapshot();
        return {
          receipt,
          beforeActor: before.actor,
          afterActor: after.actor,
          count: after.replica.operations.length,
          queued: after.outbox.length,
          revision: after.revision,
        };
      });
      expect(result.receipt.operations).toHaveLength(1005);
      expect(result.count).toBe(1005);
      expect(result.queued).toBe(1005);
      expect(result.revision).toBe(1);
      expect(result.afterActor).toEqual(result.beforeActor);
      await page.close();
    }, 30_000);
  },
);
