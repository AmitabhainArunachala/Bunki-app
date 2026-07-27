/**
 * T3 — kill/restart storm (controller §17.2; T-16 at the web runtime).
 *
 * The requirement: **persistence survives restart/background on every claimed
 * runtime.** These tests do it repeatedly and adversarially, because a single
 * reload proves the happy case and the failures worth finding are the ones that
 * accumulate — a snapshot key that drifts, a rehydration that double-counts, a
 * write that lands after teardown.
 *
 * ## Two different kills, on purpose
 *
 * **Reload** keeps the browser context, so `localStorage` is never touched by
 * the harness and only the document dies. That is the "the tab crashed and came
 * back" case.
 *
 * **New context on the same origin** is the closer analogue of force-quitting:
 * every in-memory structure the app had — React state, the store's `Map`s, the
 * module registry — is gone, and the only thing that connects the two runs is
 * what actually reached the disk. Playwright gives each context its own profile
 * by default, so the storage state is carried across explicitly with
 * {@link captureOriginStorage} / {@link restoreOriginStorage}: it is the same
 * bytes a real profile would still be holding, moved by the harness rather than
 * by the OS.
 *
 * ## What "no data loss" is measured against
 *
 * The durable log itself, read out of `localStorage` — not the row count in the
 * inspector, which would be testing the inspector. Both directions matter and
 * both are asserted: the log must not shrink (loss) and must not silently gain
 * events across a restart that made no writes (duplication on rehydrate).
 *
 * ## Scope
 *
 * Chromium on Expo Web. Controller §13's zero-lost-captures-in-100-trials and
 * the background/kill measurements are **native** and belong to WP-11; nothing
 * here is evidence for them, and the counts below are deliberately smaller and
 * differently shaped so they cannot be misread as that trial.
 */

import type { BrowserContext, Page } from '@playwright/test';

import {
  expect,
  test,
  openApp,
  onCaptureScreen,
  keepWord,
  keptThreadCount,
  takeUpForStudy,
  durableEventCount,
  durableEventTypes,
  durableSnapshots,
  expectDurableStoreFound,
  exportAndVerify,
  visibleTestId,
} from './support/adv-harness.ts';

/** Reload cycles. Enough that a per-cycle leak or drift compounds visibly. */
const RELOAD_CYCLES = 12;

/** Context kills. Fewer, because each one is a whole browser profile. */
const KILL_CYCLES = 5;

/** Read every `localStorage` pair for the origin. */
async function captureOriginStorage(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const storage = globalThis.localStorage;
    const out: Record<string, string> = {};
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key === null) continue;
      const value = storage.getItem(key);
      if (value !== null) out[key] = value;
    }
    return out;
  });
}

/**
 * Put those pairs back before the app's first line runs.
 *
 * An `addInitScript` rather than a post-load `evaluate`: the store reads its
 * snapshot while mounting, so writing afterwards would be restoring state the
 * app had already decided it did not have.
 */
async function restoreOriginStorage(
  context: BrowserContext,
  entries: Record<string, string>,
): Promise<void> {
  await context.addInitScript((pairs: Record<string, string>) => {
    for (const [key, value] of Object.entries(pairs)) globalThis.localStorage.setItem(key, value);
  }, entries);
}

test('T-16-web: twelve reload cycles lose nothing and duplicate nothing', async ({ page, app }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));

  await openApp(page, app.origin);
  await keepWord(page, '分岐');
  await takeUpForStudy(page);
  await expectDurableStoreFound(page);

  const baseline = await durableEventCount(page);
  const baselineTypes = await durableEventTypes(page);
  expect(baseline).toBeGreaterThan(0);

  for (let cycle = 1; cycle <= RELOAD_CYCLES; cycle += 1) {
    await page.reload({ waitUntil: 'load' });
    await onCaptureScreen(page);

    expect(
      await durableEventCount(page),
      `event count changed on reload cycle ${String(cycle)} without any write between cycles`,
    ).toBe(baseline);
    expect(
      await durableEventTypes(page),
      `the log's contents changed on reload cycle ${String(cycle)}`,
    ).toEqual(baselineTypes);
    expect(
      await keptThreadCount(page),
      `the kept thread disappeared on reload cycle ${String(cycle)}`,
    ).toBe(1);
    await expect(visibleTestId(page, 'capture-threads')).toContainText('learn');
  }

  expect(errors, 'a reload cycle threw').toEqual([]);
});

test('T-16-web: a write in every reload cycle accumulates exactly once each', async ({
  page,
  app,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));

  // Six distinct seed words, so each cycle's capture is a genuinely new thread
  // rather than an idempotent repeat of the last one. Repeats are T1's lane;
  // this one is about whether a restart between writes loses or doubles them.
  const words = ['分岐', '岐', '分かれる', '道', '点', '線'] as const;

  await openApp(page, app.origin);
  await keepWord(page, words[0]);
  await expectDurableStoreFound(page);

  let expected = await durableEventCount(page);
  let threads = await keptThreadCount(page);

  for (let cycle = 1; cycle < words.length; cycle += 1) {
    await page.reload({ waitUntil: 'load' });
    await onCaptureScreen(page);

    expect(
      await durableEventCount(page),
      `the log changed across the restart before cycle ${String(cycle)}`,
    ).toBe(expected);

    await keepWord(page, words[cycle] as string);

    const after = await durableEventCount(page);
    expect(
      after,
      `capture ${String(cycle)} after a restart added no events to the durable log`,
    ).toBeGreaterThan(expected);
    expected = after;

    const threadsAfter = await keptThreadCount(page);
    expect(
      threadsAfter,
      `capture ${String(cycle)} after a restart did not produce exactly one new thread`,
    ).toBe(threads + 1);
    threads = threadsAfter;
  }

  // Everything still replays after a storm of restarts (T-14 from the UI).
  await visibleTestId(page, 'nav-evidence').click();
  await expect(visibleTestId(page, 'screen-evidence')).toBeVisible();
  expect(await exportAndVerify(page)).toContain('Replay check passed');

  expect(errors).toEqual([]);
});

test('T-16-web: five force-quit cycles keep every capture', async ({ browser, app }) => {
  // One context per "app run". Each is a fresh profile with nothing in memory,
  // so the only thing that can carry state across is what was written down.
  let carried: Record<string, string> = {};
  let expectedThreads = 0;
  let expectedEvents = 0;
  const seen: string[] = [];
  const words = ['分岐', '岐', '分かれる', '道', '点'] as const;

  for (let run = 0; run < KILL_CYCLES; run += 1) {
    const context = await browser.newContext();
    if (run > 0) await restoreOriginStorage(context, carried);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));

    await openApp(page, app.origin);
    await onCaptureScreen(page);

    if (run > 0) {
      expect(
        await keptThreadCount(page),
        `run ${String(run)} came up after a force quit with the wrong number of threads`,
      ).toBe(expectedThreads);
      expect(
        await durableEventCount(page),
        `run ${String(run)} came up after a force quit with a different log`,
      ).toBe(expectedEvents);
      for (const word of seen) {
        await expect(
          visibleTestId(page, 'capture-threads'),
          `run ${String(run)} lost the thread for ${word}`,
        ).toContainText(word);
      }
    }

    const word = words[run] as string;
    await keepWord(page, word);
    seen.push(word);
    expectedThreads = await keptThreadCount(page);
    expectedEvents = await durableEventCount(page);
    expect(expectedThreads).toBe(run + 1);

    carried = await captureOriginStorage(page);
    expect(
      Object.keys(carried).length,
      `run ${String(run)} wrote nothing to storage, so the next run has nothing to survive on`,
    ).toBeGreaterThan(0);

    expect(errors, `run ${String(run)} threw`).toEqual([]);
    // The force quit: no unload handler gets to run, no graceful shutdown.
    await context.close();
  }
});

test('T-16-web: a kill immediately after the acknowledgment keeps the capture', async ({
  browser,
  app,
}) => {
  // The acknowledgment is the app's promise that the encounter is saved
  // (definition-of-done §3.1, "saved acknowledgment feels immediate"). This
  // kills the browser at the first instant that promise has been made, with no
  // navigation, no idle time, and nothing else in between.
  const first = await browser.newContext();
  const page = await first.newPage();
  await openApp(page, app.origin);
  const ack = await keepWord(page, '分岐');
  expect(ack).toContain('Kept — 分岐');

  const carried = await captureOriginStorage(page);
  await first.close();

  const second = await browser.newContext();
  await restoreOriginStorage(second, carried);
  const revived = await second.newPage();
  await openApp(revived, app.origin);
  await onCaptureScreen(revived);

  expect(
    await keptThreadCount(revived),
    'the encounter acknowledged as kept did not survive an immediate kill',
  ).toBe(1);
  await expect(visibleTestId(revived, 'capture-threads')).toContainText('分岐');
  await expectDurableStoreFound(revived);

  await second.close();
});

test('T-16-web: the snapshot the app leaves behind is one parseable, versioned record', async ({
  page,
  app,
}) => {
  await openApp(page, app.origin);
  await keepWord(page, '分岐');
  await takeUpForStudy(page);

  const snapshots = await durableSnapshots(page);
  expect(
    snapshots.length,
    'the app split its durable log across several storage records, so a partial write could ' +
      'leave the two halves disagreeing',
  ).toBe(1);

  const [snapshot] = snapshots;
  expect(snapshot?.events.length).toBeGreaterThan(0);

  // Every event carries its schema version. An unversioned event in the file is
  // the fail-closed case T-04 exists for, and it would only surface on the
  // *next* build — which is exactly why it is checked at write time here.
  for (const event of snapshot?.events ?? []) {
    const record = event as { v?: unknown; type?: unknown; eventId?: unknown };
    expect(
      record.v,
      `an event reached storage with no schema version: ${JSON.stringify(event)}`,
    ).toBe(1);
    expect(typeof record.type).toBe('string');
    expect(typeof record.eventId).toBe('string');
  }
});
