#!/usr/bin/env node
/** Headless, fresh browser profile only. No native app, screenshots or live data. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { startStaticHost } from '../prototypes/bunki-desktop/lib/static-host.cjs';
import { silenceBrowserAudio } from '../prototypes/corridor/tools/browser-audio-silence.mjs';
import { resolveCorridorSite, resolveCorridorEvidence } from './resolve-corridor-site.mjs';
import { checkSharedBacklog } from './shared-study-backlog-browser.mjs';
if (process.argv.includes('--if-ci') && !process.env.CI && !process.env.KAIRO_SITE_DIR) {
  console.log(
    'Shared-study browser check not requested locally; use npm run verify:shared-study:browser with an explicit built artifact.',
  );
  process.exit(0);
}
assert(
  process.env.KAIRO_SITE_DIR && process.env.KAIRO_EVIDENCE_DIR,
  'Explicit built site and external evidence directory required (mandatory in CI)',
);
const out = resolveCorridorEvidence(),
  site = resolveCorridorSite();
mkdirSync(out, { recursive: true });
const host = await startStaticHost({ site, port: 0 });
let browser;
const receipt = {
  checks: [],
  errors: [],
  sourceBuild: JSON.parse(readFileSync(resolve(site, 'build-identity.json'))).artifactSha256,
};
async function checkDictionaryPopup(frame, surface, label) {
  const prepared = await frame.evaluate((surface) => {
    const api = bunkiSharedStudy,
      entry = api.catalog.find((row) => row.noteGuid === 'nsrs-v-ee75dc6b2412');
    if (!entry || !entry.ja.startsWith('メール一本書くにも'))
      throw Error('Reviewed 一本 passage missing');
    if (!(api.dictionary?.entryCount > 0) || typeof api.dictionary.resolveExact !== 'function')
      throw Error('Canonical dictionary missing');
    const exact = api.dictionary.resolveExact('一本', 'いっぽん');
    if (!exact || !exact.glosses.length) throw Error('Bound 一本 headword missing');
    api.app.showTask(entry, true);
    return {
      taskKey: entry.taskKey,
      context: entry.ja,
      start: entry.ja.indexOf(surface),
      entryCount: api.dictionary.entryCount,
      exact,
    };
  }, surface);
  assert.equal(prepared.exact.kind, 'dictionary');
  assert.equal(prepared.exact.lemma, '一本');
  assert.equal(prepared.exact.reading, 'いっぽん');
  assert.equal(prepared.exact.source, 'JMdict');
  assert.ok(prepared.start >= 0);
  const state = () =>
    frame.evaluate(() => {
      const p = bunkiSharedStudy.backend.readProjection();
      return {
        reviews: p.reviews,
        permits: p.permits,
        introductions: p.introductions,
        settings: p.settings,
        scheduled: Object.values(p.tasks)
          .filter((task) => task.card || task.head)
          .map(({ taskKey, head, card }) => ({ taskKey, head, card })),
      };
    });
  const before = await state(),
    oldIds = await frame.evaluate(async () =>
      (await bunkiSharedStudy.store.outbox()).map((row) => row.event.id),
    );
  await frame.locator('[data-card]').press('Enter');
  await frame.waitForSelector('[data-study=back]');
  await frame
    .locator('[data-passage=passage] [data-word=' + JSON.stringify(surface) + ']')
    .first()
    .click();
  await frame.waitForSelector('.word-popover');
  await frame.waitForFunction(() => !bunkiSharedStudy.app.read().busy);
  assert.deepEqual(
    await frame
      .locator('.word-popover [data-vocabulary-entry] > .term-block > h1')
      .allTextContents(),
    ['一本'],
  );
  assert.equal(
    await frame.locator('[data-lookup-chunk]').count(),
    0,
    'Reviewed exact compound replaces misleading morphological chunk',
  );
  assert.match(
    await frame.locator('[data-reviewed-passage-reading]').innerText(),
    /一本（いっぽん）/,
  );
  assert.match(await frame.locator('[data-lexical-reading]').innerText(), /いっぽん/);
  assert.deepEqual(await frame.locator('.word-popover [data-short-gloss]').allTextContents(), [
    prepared.exact.glosses.join('; '),
  ]);
  assert.deepEqual(
    await state(),
    before,
    'Dictionary lookup does not change reviews, schedules, permits, introductions or settings',
  );
  const added = await frame.evaluate(
    async (old) =>
      (await bunkiSharedStudy.store.outbox())
        .map((row) => row.event)
        .filter((event) => !old.includes(event.id)),
    oldIds,
  );
  assert.equal(added.length, 1);
  assert.equal(added[0].type, 'capture');
  assert.equal(added[0].data.kind, 'lookup');
  assert.equal(added[0].data.surface, surface);
  assert.equal(added[0].data.contextTaskKey, prepared.taskKey);
  assert.deepEqual(added[0].data.span, {
    start: prepared.start,
    end: prepared.start + surface.length,
    unit: 'utf16-code-unit',
  });
  await frame.locator('.popover-close').click();
  receipt.dictionary.popups.push({
    label,
    surface,
    entryCount: prepared.entryCount,
    headword: prepared.exact.lemma,
    reading: prepared.exact.reading,
    source: prepared.exact.source,
    sourceId: prepared.exact.sourceId,
    captureType: added[0].type,
    captureKind: added[0].data.kind,
    scheduleUnchanged: true,
  });
  receipt.checks.push(label);
}
try {
  const dictionaryBinding = JSON.parse(
    readFileSync(resolve(site, 'data/shared-study-content.json')),
  ).dictionary;
  assert.equal(
    dictionaryBinding?.format,
    'bunki-shared-dictionary/v1',
    'Built artifact must bind the canonical dictionary',
  );
  receipt.dictionary = { ...dictionaryBinding, popups: [] };
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  receipt.browser = browser.version();
  const normalContext = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    serviceWorkers: 'block',
  });
  await silenceBrowserAudio(normalContext);
  const normal = await normalContext.newPage(),
    normalRequests = [];
  normal.on('request', (request) => normalRequests.push(new URL(request.url()).pathname));
  normal.on('pageerror', (error) => receipt.errors.push(error.message));
  // A copied shared-only URL must neither enter the legacy loader nor poison
  // the next normal deck with a sticky load error.
  await normal.goto(`${host.origin}/?deck=shared-grammar&dojo=1&ui=en`, {
    waitUntil: 'domcontentloaded',
  });
  await normal.locator('[data-deck="n2"]').waitFor({ timeout: 60000 });
  assert.equal(await normal.locator('[data-deck="shared-grammar"]').count(), 0);
  assert.equal(await normal.getByText('The deck could not be opened.', { exact: true }).count(), 0);
  await normal.locator('[data-deck="n2"]').click();
  await normal.locator('#kp-start').waitFor({ timeout: 60000 });
  assert.equal(await normal.locator('[data-shared-study-frame]').count(), 0);
  await normal.locator('#kp-start').click();
  await normal.locator('#kp-card').waitFor();
  await normal.keyboard.press('Space');
  await normal.locator('#kp-grade-again').click();
  await normal.waitForFunction(
    () =>
      Object.keys(JSON.parse(localStorage.getItem('bunki-cloze:n2') || '{}').cards || {}).length ===
      1,
  );
  const normalLedger = await normal.evaluate(() => localStorage.getItem('bunki-cloze:n2'));
  await normal.goto(`${host.origin}/?deck=n2&ui=en`, { waitUntil: 'domcontentloaded' });
  await normal.locator('#kp-start').waitFor({ timeout: 60000 });
  assert.equal(await normal.evaluate(() => localStorage.getItem('bunki-cloze:n2')), normalLedger);
  const legacyCounts = await normal.evaluate(async () => {
    const player = await import('/decks/player/mount.js'),
      summary = await player.summary('n2'),
      misses = await player.missedTerms('n2', localStorage, 0);
    return { summary, misses };
  });
  assert.equal(
    legacyCounts.misses.length,
    1,
    'A normal-mode Again remains available to missed terms',
  );
  assert.equal(legacyCounts.misses[0].deck, 'n2');
  assert(legacyCounts.misses[0].term);
  await normal.goto(`${host.origin}/?dojo=1&ui=en`, { waitUntil: 'domcontentloaded' });
  await normal.locator('[data-deck="n2"] .dojo-deck-bar').waitFor({ timeout: 60000 });
  const row = normal.locator('[data-deck="n2"]');
  assert.equal(
    Number(await row.locator('.dojo-deck-due b').textContent()),
    legacyCounts.summary.due,
  );
  assert.equal(
    Number(await row.locator('.dojo-deck-new b').textContent()),
    legacyCounts.summary.fresh,
  );
  assert.equal(
    await row
      .locator('.dojo-deck-bar')
      .evaluate((node) => Number(node.style.getPropertyValue('--begun'))),
    1 / legacyCounts.summary.words,
  );
  assert.equal(
    await normal.evaluate(() =>
      Object.keys(localStorage).some((key) => key.startsWith('bunki-shared-study:')),
    ),
    false,
  );
  await normal.setViewportSize({ width: 393, height: 852 });
  await normal.goto(`${host.origin}/?deck=n2&ui=en`, { waitUntil: 'domcontentloaded' });
  await normal.locator('#kp-start').waitFor({ timeout: 60000 });
  assert.equal(await normal.locator('[data-shared-study-frame]').count(), 0);
  assert.equal(await normal.evaluate(() => localStorage.getItem('bunki-cloze:n2')), normalLedger);
  assert.deepEqual(
    normalRequests.filter(
      (path) =>
        path.includes('/vendor/shared-study-engine/') || path.includes('/data/shared-study'),
    ),
    [],
  );
  assert.deepEqual(
    normalRequests.filter(
      (path) =>
        path.endsWith('/dictionary.json.gz') || path.endsWith('/data/shared-study/BUILD.json'),
    ),
    [],
  );
  receipt.checks.push('normal-route-does-not-request-dictionary-or-build');
  receipt.checks.push(
    'normal-route-ignores-shared-grammar-and-next-deck-opens',
    'normal-route-keeps-legacy-player-and-durable-history',
    'normal-deck-list-counts-begun-and-missed-terms-use-legacy-ledger',
    'normal-route-does-not-load-shared-engine-or-data',
    'normal-phone-route-keeps-legacy-player-and-history',
  );
  await normalContext.close();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    serviceWorkers: 'block',
  });
  await silenceBrowserAudio(context);
  const page = await context.newPage();
  page.on('pageerror', (e) => receipt.errors.push(e.message));
  await page.addInitScript(() => {
    window.__legacyWrites = [];
    for (const method of ['put', 'add', 'delete', 'clear']) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (...args) {
        if (!this.transaction.db.name.startsWith('bunki-shared-study-'))
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
  });
  const legacy = () =>
    page.evaluate(() => ({
      keys: Object.fromEntries(
        Object.entries(localStorage).filter(
          ([k]) => k.startsWith('bunki-cloze:') || k === 'kairo-corridor-v1',
        ),
      ),
      writes: structuredClone(window.__legacyWrites),
    }));
  async function shared(deck) {
    await page.goto(`${host.origin}/?deck=${deck}&sharedStudy=preview&ui=en`, {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('[data-shared-study-frame]').waitFor({ timeout: 60000 });
    const frame = await (
      await page.locator('[data-shared-study-frame]').elementHandle()
    ).contentFrame();
    assert(frame, 'Canonical iframe must be mounted');
    await frame.waitForURL(/shared-frame\.html/);
    try {
      await frame.waitForFunction(
        () => !!window.bunkiSharedStudy || !!document.querySelector('[role="alert"]'),
        null,
        { timeout: 60000 },
      );
      assert(
        await frame.evaluate(() => !!window.bunkiSharedStudy),
        await frame.locator('body').innerText(),
      );
    } catch (error) {
      receipt.frameFailure = { url: frame.url(), text: await frame.locator('body').innerText() };
      throw error;
    }
    return frame;
  }
  let frame = await shared('n2');
  const before = await legacy();
  assert.equal(await frame.evaluate(() => bunkiSharedStudy.catalog.length), 8508);
  assert.equal(await frame.evaluate(() => bunkiSharedStudy.app.read().module), 'n2');
  assert.equal(await frame.locator('.today-actions .primary').count(), 1);
  assert.match(await frame.locator('[data-today-counts]').innerText(), /20 new cards/);
  assert.equal(
    await frame.evaluate(() => frameElement.bunkiStudyPort.adapter.platform.canRequestNewCards()),
    false,
  );
  assert.equal(
    await frame.evaluate(() => frameElement.bunkiStudyPort.adapter.platform.presentation),
    'desktop',
  );
  await frame.locator('[data-start]:not(:disabled)').click();
  await frame.locator('[data-reveal]').click();
  assert.equal(await frame.locator('[data-grade-key]').count(), 4);
  await frame.locator('[data-grade="3"]').click();
  await frame.waitForFunction(() => bunkiSharedStudy.backend.readProjection().reviews.length === 1);
  assert.deepEqual(await legacy(), before);
  receipt.checks.push(
    'explicit-preview-route-mounts-canonical-ui',
    'full-8508-catalog',
    'grade-durable-with-no-legacy-write',
  );
  const due = await frame.evaluate(() => {
    const p = bunkiSharedStudy.backend.readProjection(),
      r = p.reviews[0];
    return {
      taskKey: r.taskKey,
      card: p.tasks[r.taskKey].card,
      event: r.id,
      installation: bunkiSharedStudy.backend.installation,
    };
  });
  frame = await shared('n1');
  assert.equal(await frame.evaluate(() => bunkiSharedStudy.app.read().module), 'n1');
  assert.equal(
    await frame.evaluate(() => bunkiSharedStudy.backend.readProjection().reviews.length),
    1,
  );
  assert.equal(
    await frame.evaluate(
      () =>
        Object.values(bunkiSharedStudy.backend.readProjection().permits).filter((p) => !p.usedBy)
          .length,
    ),
    19,
  );
  assert.match(await frame.locator('[data-today-counts]').innerText(), /19 new/);
  assert.equal(await frame.locator('.today-actions .primary').count(), 1);
  assert.deepEqual(
    await frame.evaluate(
      (key) => bunkiSharedStudy.backend.readProjection().tasks[key].card,
      due.taskKey,
    ),
    due.card,
  );
  receipt.checks.push('deck-switch-and-restart-retain-history-and-budget');
  frame = await shared('shared-grammar');
  assert.equal(await frame.evaluate(() => bunkiSharedStudy.app.read().module), 'grammar');
  await frame.locator('[data-start]').click();
  assert.equal(
    await frame.evaluate(() => bunkiSharedStudy.app.read().current.entry.module),
    'grammar',
  );
  assert(
    (await frame.locator('.grammar-card').count()) ||
      (await frame.locator('[class*="grammar"]').count()),
    'Canonical grammar face',
  );
  await frame.locator('[data-reveal]').click();
  await frame.locator('[data-grade="3"]').click();
  await frame.waitForFunction(() => bunkiSharedStudy.backend.readProjection().reviews.length === 2);
  receipt.checks.push('canonical-grammar-renderer-grades-shared-ledger');
  const secondContract = await frame.evaluate(() => {
    const last = bunkiSharedStudy.backend.readProjection().reviews.at(-1),
      first = bunkiSharedStudy.catalog.find((e) => e.taskKey === last.taskKey),
      wanted = first.contractId === 'grammar.cloze.v1' ? 'grammar.meaning.v1' : 'grammar.cloze.v1';
    const entry = bunkiSharedStudy.catalog.find(
      (e) =>
        e.contractId === wanted &&
        bunkiSharedStudy.backend.queue({ module: 'grammar' }).some((x) => x.taskKey === e.taskKey),
    );
    bunkiSharedStudy.app.showTask(entry);
    return wanted;
  });
  assert.equal(
    await frame
      .locator(secondContract === 'grammar.meaning.v1' ? '.grammar-pattern' : '.grammar-cue')
      .count(),
    1,
  );
  await page.keyboard.press('Enter');
  await frame.waitForSelector('[data-study=back]');
  await frame.locator('[data-grade="3"]').click();
  await frame.waitForFunction(() => bunkiSharedStudy.backend.readProjection().reviews.length === 3);
  receipt.checks.push('meaning-and-cloze-use-their-own-canonical-fronts');
  await page.goto(`${host.origin}/?deck=kotoba&sharedStudy=preview&ui=en`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByText('This practice contract is not mapped to shared study.').waitFor();
  receipt.checks.push('unmapped-legacy-deck-fenced');
  receipt.checks.push('initial-module-api-preserves-host-selection-and-global-shared-counts');
  const boundContext = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    serviceWorkers: 'block',
  });
  await silenceBrowserAudio(boundContext);
  const boundPage = await boundContext.newPage();
  boundPage.on('pageerror', (error) => receipt.errors.push(error.message));
  await boundPage.addInitScript(() => {
    if (window !== window.top) return;
    const api = () => import('/vendor/shared-study-engine/client/engine.mjs');
    let memory;
    const storage = () => (memory ||= api().then((module) => module.createMemoryAdapter()));
    const authority = (window.__boundStudyFixture = {
      enabled: false,
      online: true,
      refuse: false,
      calls: 0,
      release: null,
    });
    window.bunkiSharedStudyHost = {
      identity: {
        learner: 'test-bunki-host',
        environment: 'test-bunki-host',
        installation: 'test-bunki-host-install',
        mode: 'fresh',
      },
      presentation: 'phone',
      storage: {
        read: async (scope) => (await storage()).read(scope),
        compareAndSwap: async (...args) => (await storage()).compareAndSwap(...args),
      },
      canRequestNewCards: () => authority.enabled,
      isOnline: () => authority.online,
      transport: {
        reserveNewPermits: async ({ store }) => {
          authority.calls++;
          if (authority.refuse) throw Error('synthetic-reserve-refusal');
          await new Promise((resolve) => {
            authority.release = resolve;
          });
          if (
            store.scope.learner !== 'test-bunki-host' ||
            store.scope.environment !== 'test-bunki-host'
          )
            throw Error('synthetic-host-scope');
          const { dayBounds, payloadHash } = await api(),
            ts = Date.now();
          const event = {
            v: 4,
            id: '@server:1',
            learner: store.scope.learner,
            install: '@server',
            dseq: 1,
            base: 0,
            ts,
            epoch: 0,
            policy: 'nsrs-policy-v1',
            type: 'permit-grant',
            data: {
              install: store.scope.installation,
              permitIds: ['bound-fixture-1'],
              ...dayBounds(ts, 'Asia/Tokyo'),
            },
          };
          await store.reconcile({
            events: [{ seq: 1, rt: ts, authority: 'server', event, bodyHash: payloadHash(event) }],
            head: 1,
          });
          return { kind: 'reserved' };
        },
      },
    };
  });
  await boundPage.goto(`${host.origin}/?deck=senmon&ui=en`, { waitUntil: 'domcontentloaded' });
  await boundPage.locator('[data-shared-study-frame]').waitFor({ timeout: 60000 });
  const boundFrame = await (
    await boundPage.locator('[data-shared-study-frame]').elementHandle()
  ).contentFrame();
  await boundFrame.waitForFunction(() => !!window.bunkiSharedStudy, null, { timeout: 60000 });
  assert.equal(await boundFrame.evaluate(() => bunkiSharedStudy.app.read().module), 'senmon');
  assert.equal(
    await boundFrame.evaluate(() => frameElement.bunkiStudyPort.adapter.platform.presentation),
    'phone',
  );
  assert.equal(
    await boundFrame.evaluate(() => frameElement.bunkiStudyPort.adapter.platform.isPaired()),
    false,
  );
  assert.match(await boundFrame.locator('[data-today-counts]').innerText(), /^0 new cards$/);
  assert.equal(await boundFrame.locator('[data-start]').count(), 0);
  await boundPage.evaluate(() => {
    __boundStudyFixture.enabled = true;
    __boundStudyFixture.online = false;
  });
  await boundFrame.evaluate(() => dispatchEvent(new Event('offline')));
  assert.equal(await boundFrame.locator('[data-start]').count(), 0);
  assert.equal(await boundPage.evaluate(() => __boundStudyFixture.calls), 0);
  await boundPage.evaluate(() => {
    __boundStudyFixture.online = true;
    __boundStudyFixture.refuse = true;
  });
  await boundFrame.evaluate(() => dispatchEvent(new Event('online')));
  assert.equal(await boundFrame.locator('.today-actions .primary').count(), 1);
  await boundFrame.locator('[data-start]').click();
  await boundFrame.waitForFunction(
    () => !bunkiSharedStudy.app.read().busy && parent.__boundStudyFixture.calls === 1,
  );
  assert.equal(
    await boundFrame.evaluate(
      () => Object.keys(bunkiSharedStudy.backend.readProjection().permits).length,
    ),
    0,
  );
  await boundPage.evaluate(() => {
    __boundStudyFixture.refuse = false;
  });
  await boundFrame.locator('[data-start]').click();
  await boundPage.waitForFunction(
    () => __boundStudyFixture.calls === 2 && typeof __boundStudyFixture.release === 'function',
  );
  assert.equal(await boundFrame.evaluate(() => bunkiSharedStudy.app.read().current), null);
  assert.equal(await boundFrame.evaluate(() => bunkiSharedStudy.backend.queue().length), 0);
  await boundPage.evaluate(() => __boundStudyFixture.release());
  await boundFrame.waitForFunction(() => !!bunkiSharedStudy.app.read().current);
  assert.equal(
    await boundFrame.evaluate(() => bunkiSharedStudy.app.read().current.entry.module),
    'senmon',
  );
  assert.equal(
    await boundFrame.evaluate(
      () => Object.keys(bunkiSharedStudy.backend.readProjection().permits).length,
    ),
    1,
  );
  assert.equal(
    await boundFrame.locator('[data-first-card-hint]').innerText(),
    'Tap to show answer',
  );
  await boundFrame.locator('[data-reveal]').click();
  assert.equal(await boundFrame.locator('[data-grade-key]').count(), 0);
  assert.match(await boundFrame.locator('[data-save-status]').innerText(), /Sync is not set up/);
  assert.equal(await boundPage.evaluate(() => __boundStudyFixture.calls), 2);
  assert.equal(
    await boundPage.evaluate(() =>
      Object.keys(localStorage).some((key) => key.startsWith('bunki-cloze:')),
    ),
    false,
  );
  await checkDictionaryPopup(
    boundFrame,
    '一',
    'bound-host-real-dictionary-ippon-popup-and-neutral-lookup',
  );
  assert.equal(
    await boundPage.evaluate(() =>
      Object.keys(localStorage).some((key) => key.startsWith('bunki-cloze:')),
    ),
    false,
  );
  receipt.checks.push(
    'bound-host-requires-explicit-authority-and-online-state',
    'bound-host-refusal-does-not-grant-new-cards',
    'bound-host-awaits-real-reserve-before-selected-study',
    'explicit-phone-presentation-overrides-wide-host-without-pairing-or-permit-side-effects',
  );
  await boundContext.close();
  await checkSharedBacklog({ browser, origin: host.origin, receipt });
  const response = await fetch(`${host.origin}/decks/player/shared-frame.html`);
  assert.equal(response.headers.get('content-security-policy'), "frame-ancestors 'self'");
  const other = await fetch(`${host.origin}/index.html`);
  assert.equal(other.headers.get('content-security-policy'), "frame-ancestors 'none'");
  receipt.checks.push('only-shared-frame-allows-same-origin-embedding');
  const offlineContext = await browser.newContext({ viewport: { width: 393, height: 852 } });
  await silenceBrowserAudio(offlineContext);
  const offlinePage = await offlineContext.newPage();
  await offlinePage.goto(`${host.origin}/?deck=n2`, { waitUntil: 'domcontentloaded' });
  // The product auto-registers only on HTTPS; this isolated loopback fixture
  // explicitly exercises the exact stamped service worker from the built site.
  await offlinePage.evaluate(() => navigator.serviceWorker.register('/sw.js'));
  await offlinePage.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
    timeout: 60000,
  });
  const sharedCached = await offlinePage.evaluate(async () => {
    const names = await caches.keys(),
      urls = (
        await Promise.all(names.map((name) => caches.open(name).then((cache) => cache.keys())))
      )
        .flat()
        .map((request) => new URL(request.url).pathname);
    return urls.filter(
      (path) =>
        path.includes('/vendor/shared-study-engine/') || path.includes('/data/shared-study'),
    );
  });
  assert.deepEqual(sharedCached, []);
  receipt.checks.push('normal-install-does-not-precache-shared-corpus-or-fonts');
  // First bound use downloads and verifies shared content through the active
  // worker; ordinary installation no longer preloads the optional corpus.
  await offlinePage.goto(`${host.origin}/?deck=n2&sharedStudy=preview&ui=en`, {
    waitUntil: 'domcontentloaded',
  });
  await offlinePage.locator('[data-shared-study-frame]').waitFor({ timeout: 60000 });
  const onlineFrame = await (
    await offlinePage.locator('[data-shared-study-frame]').elementHandle()
  ).contentFrame();
  await onlineFrame.waitForURL(/shared-frame\.html/);
  await onlineFrame.waitForFunction(() => !!window.bunkiSharedStudy, null, { timeout: 60000 });
  assert.deepEqual(
    await onlineFrame.evaluate(() => {
      const p = frameElement.bunkiStudyPort.adapter.platform;
      return {
        presentation: p.presentation,
        storageKind: p.storageKind,
        paired: p.isPaired(),
        canRequest: p.canRequestNewCards(),
        requestBound: typeof p.requestNewCards === 'function',
      };
    }),
    {
      presentation: 'phone',
      storageKind: 'bunki-shared',
      paired: false,
      canRequest: false,
      requestBound: false,
    },
  );
  const phoneBefore = await onlineFrame.evaluate(() => ({
    permits: Object.keys(bunkiSharedStudy.backend.readProjection().permits).length,
    reviews: bunkiSharedStudy.backend.readProjection().reviews.length,
  }));
  assert.deepEqual(phoneBefore, { permits: 20, reviews: 0 });
  await onlineFrame.locator('[data-start]:not(:disabled)').click();
  assert.equal(
    await onlineFrame.locator('[data-first-card-hint]').innerText(),
    'Tap to show answer',
  );
  await onlineFrame.locator('[data-session-info]').click();
  assert.doesNotMatch(await onlineFrame.locator('#study-help').innerText(), /Space|Enter|1[–〜-]4/);
  await onlineFrame.locator('[data-session-info]').click();
  await onlineFrame.locator('[data-reveal]').click();
  assert.equal(await onlineFrame.locator('[data-grade]').count(), 4);
  assert.equal(await onlineFrame.locator('[data-grade-key]').count(), 0);
  assert.match(await onlineFrame.locator('[data-save-status]').innerText(), /Sync is not set up/);
  await onlineFrame.evaluate(() =>
    bunkiSharedStudy.app.showTask(bunkiSharedStudy.app.read().current.entry, true),
  );
  await offlinePage.keyboard.press('Enter');
  await onlineFrame.waitForSelector('[data-study=back]');
  assert.equal(await onlineFrame.locator('[data-grade]').count(), 0);
  assert.equal(await onlineFrame.locator('[data-finish-practice]').count(), 1);
  assert.deepEqual(
    await onlineFrame.evaluate(() => ({
      permits: Object.keys(bunkiSharedStudy.backend.readProjection().permits).length,
      reviews: bunkiSharedStudy.backend.readProjection().reviews.length,
    })),
    phoneBefore,
  );
  receipt.checks.push(
    'unpaired-preview-phone-controls-use-canonical-presentation',
    'phone-practice-has-no-grade-or-permit-side-effect',
  );
  const cachedDictionary = await offlinePage.evaluate(async () => {
    const names = await caches.keys(),
      paths = new Set(
        (await Promise.all(names.map((name) => caches.open(name).then((cache) => cache.keys()))))
          .flat()
          .map((request) => new URL(request.url).pathname),
      );
    return {
      build: paths.has('/data/shared-study/BUILD.json'),
      dictionary: paths.has('/data/shared-study/dictionary.json.gz'),
    };
  });
  assert.deepEqual(cachedDictionary, { build: true, dictionary: true });
  receipt.checks.push('explicit-shared-use-lazily-caches-pinned-build-and-dictionary');
  await offlineContext.setOffline(true);
  await offlinePage.reload({ waitUntil: 'domcontentloaded' });
  await offlinePage.locator('[data-shared-study-frame]').waitFor({ timeout: 60000 });
  const offlineFrame = await (
    await offlinePage.locator('[data-shared-study-frame]').elementHandle()
  ).contentFrame();
  await offlineFrame.waitForURL(/shared-frame\.html/);
  await offlineFrame.waitForFunction(
    () => !!window.bunkiSharedStudy || !!document.querySelector('[role="alert"]'),
    null,
    { timeout: 60000 },
  );
  assert(
    await offlineFrame.evaluate(() => !!window.bunkiSharedStudy),
    await offlineFrame.locator('body').innerText(),
  );
  receipt.checks.push('stamped-shared-module-and-full-content-reopen-offline');
  await checkDictionaryPopup(
    offlineFrame,
    '本',
    'offline-reload-real-dictionary-ippon-popup-and-neutral-lookup',
  );
  await offlineContext.close();
  assert.equal(receipt.errors.length, 0, receipt.errors.join('\n'));
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = error.stack;
  throw error;
} finally {
  writeFileSync(resolve(out, 'browser.json'), JSON.stringify(receipt, null, 2) + '\n');
  await browser?.close();
  await host.close();
  console.log(JSON.stringify(receipt));
}
