/** verify-record-depth · slice G2's record and R's identity, on the served build (MASTER_SPEC §4 G, the G2 lines; G2 BRIEF
 * decision 1; G2/PREP-codex §1.1, §3, §4, §6, §7 and its 03:44 tutor addendum). WebKit and Chromium at 390×844 — the engine
 * KAIRO_BROWSER names, each version logged — service workers blocked, every request off the host refused, every page error
 * a failure (none filtered).
 *   A   an aged record, upgraded. A ninety-day moderate record (measure-aged-record's own profile: taps, reviews and cards a
 *       day) written by a build before G2, with a root no build knows, boots on this build with no new root and not one
 *       byte changed. One look-up adds met (one identity) and readHelp (one article, one word) beside its tap row, and nothing
 *       that schedules; "I know this" writes met only; finishing the article seals its first reading; export → import
 *       returns exactly the record exported — met, readHelp and the unknown root with it.
 *   A2  a later met. A record whose met is a newer build's (version 2) boots, looks up, exports and imports with that met
 *       byte for byte: this build reads it as nothing and never writes it.
 *   R   R's identity in every room (a saved ねん card never shows とし): 年 kept as ねん (#2084840) — its saved-words row's
 *       door, Today's star, the mirror's row and door, the reader's 令和８年 — and its page opened cold, with the full
 *       dictionary refused: ねん everywhere, とし nowhere.
 *   T   the tutor's and the examples' archive by identity: a spelling-keyed 訳 reply (STALE_WAKE_REASON) and an examples
 *       sentinel never fill the page of 訳 read やく (Kawaguchi, token 548, opened by the keyboard before the full dictionary
 *       answers: G3's keyboard door waits up to READING_WAIT_MS for the reading, so the full dictionary is held until the
 *       page has opened), with no provider reachable; the archive rows stay exactly as seeded.
 *   --control kagami-spelling-only  the mirror's doors open the spelling alone (serveMutation of corridor.js): R.mirror red.
 *   --control tutor-spelling-key    the tutor's archive is read back by the spelling alone, as before G2: T.archive red.
 * Claim boundary: headless engines on a Mac, not his phone; the record and archive are seeded straight into the
 * installation's own store (the state a year of use leaves), never through an app reducer. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecordSnapshot } from './record-test-support.mjs';
import { serveMutation } from './reader-gloss-mutants.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';

assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin an immutable built site and its digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
mkdirSync(evidence, { recursive: true });
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
assert.equal(identity.artifactSha256, process.env.KAIRO_ARTIFACT_SHA256, 'the pinned digest is this site\'s');
const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const CONTROLS = {
  'kagami-spelling-only': { kills: ['R.mirror'], edits: [{ file: 'corridor.js', key: 'door',
    from: "      row.dataset.kagamiFrontier = item.key;\n      // G2 · a kept word's door is its capture (keptItemNode): the entry and reading he saved, never the spelling alone\n      const door = keptItemNode(t, id);",
    to: "      row.dataset.kagamiFrontier = item.key;\n      const door = { t, id };" }] },
  // the tutor's archive read back by the spelling alone, as before G2
  'tutor-spelling-key': { kills: ['T.archive'], edits: [{ file: 'corridor.js', key: 'ref',
    from: '  const ref = wordArchiveRef(node, rec);', to: '  const ref = `word:${node.id}`;' }] },
};
const controlAt = process.argv.indexOf('--control');
const controlName = controlAt >= 0 ? process.argv[controlAt + 1] : null;
const control = controlName ? CONTROLS[controlName] : null;
assert(!controlName || control, `--control is one of ${Object.keys(CONTROLS).join(', ')}`);
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const manifest = new Map(identity.files.map((file) => [file.path, file.sha256]));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const DAY = 86400000;
const STORY = Object.freeze({ id: 'kantei:jp-105-actions-202609-25startup', search: 'スタートアップ大賞' });
const KAWAGUCHI = Object.freeze({ id: 'aozora:049966-1', search: 'チベット旅行記', index: 548 });

const rows = [];
const versions = {};
const served = { served: [], setupError: null };
let engine = '';
const check = (id, title, ok, observed = '') => {
  rows.push({ id: `${engine}/${id}`, title, ok: !!ok, observed });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine}/${id} ${title}${ok ? '' : ` — ${JSON.stringify(observed).slice(0, 700)}`}`);
  return !!ok;
};
const host = await startStaticHost({ site, port: 0 });

/** measure-aged-record's moderate profile (150 taps, 60 reviews and 10 new cards a day), its row layouts unchanged. */
function agedRoots(days) {
  const taps = 150, reviews = 60, newCards = 10, start = Date.UTC(2025, 9, 16);
  const taken = [], srs = {}, revlog = [], obslog = [];
  for (let day = 0; day < days; day += 1) {
    const t0 = start + day * DAY + 8 * 3600000;
    for (let i = 0; i < newCards; i += 1) {
      const n = day * newCards + i, id = `語${n}`;
      taken.push({ t: 'word', id, ts: t0 + i * 1000, started: t0 + i * 1000 });
      srs[`word:${id}`] = { due: new Date(t0 + (1 + (n % 40)) * DAY).toISOString(), last_review: new Date(t0).toISOString(),
        stability: 3.17 + (n % 50) / 10, difficulty: 5.28, elapsed_days: 1, scheduled_days: 1 + (n % 40), reps: 1 + (n % 9),
        lapses: n % 3, learning_steps: 0, state: 2 };
    }
    const cards = Math.max(1, (day + 1) * newCards);
    for (let i = 0; i < reviews; i += 1) {
      const n = (day * reviews + i) % cards, t = t0 + 3600000 + i * 20000;
      revlog.push([t, `word:語${n}`, 1 + ((n + i) % 4), 2, 4.125, 0.9123, 12.3456, 5.2811, 15.0021, 5.1999, 14, t + 14 * DAY]);
    }
    for (let i = 0; i < taps; i += 1) obslog.push([t0 + 7200000 + i * 7000, 'tap', `word:語${(day * 37 + i) % 9000}`, 1 + (i % 3), `article-${(day * 3 + (i % 3)) % 2000}`]);
  }
  return { taken, srs, revlog, obslog };
}
const portable = (record) => Object.fromEntries(Object.entries(record).filter(([key]) => !['ai', 'aiEvidence', 'recordGeneration'].includes(key)));
const canonical = (value) => (Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value));
const changedRoots = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])]
  .filter((key) => canonical(before[key] ?? null) !== canonical(after[key] ?? null)).sort();
const SCHEDULING = ['taken', 'lists', 'srs', 'revlog', 'stats', 'suspended', 'deepWords'];

async function ready(page) { await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120000 }); }
async function writable(page) {
  await page.waitForFunction(() => { const state = window.__KAIRO_RECORD_SAFETY__?.state(); return state && (state.writable || state.notSaving); }, null, { timeout: 120000 });
}
async function boot(page) {
  await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`, { timeout: 120000 });
  await ready(page);
  await writable(page);
}
/** The record (and, if given, the archive) committed straight into the installation's own store, the app closed. */
async function seed(page, record, archive = null) {
  await page.goto(`${host.origin}/__g2-blank`);
  const result = await page.evaluate(async ({ recordText, archiveText }) => {
    const core = await import('/modules/record-core.mjs');
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, policy, actor: installation.actor });
    try {
      const before = await store.snapshot();
      const mutations = [{ kind: 'put', collection: 'learner-record', id: 'current', value: JSON.parse(recordText) }];
      if (archiveText) mutations.push({ kind: 'put', collection: 'learner-archive', id: 'current', value: JSON.parse(archiveText) });
      await store.commitLocal({ changeId: `g2-seed-${crypto.randomUUID()}`, binding: policy.binding, expectedRevision: before.revision,
        occurredAt: new Date().toISOString(), mutations, operations: [] });
      return { stored: true };
    } catch (error) { return { stored: false, message: String(error?.message || error) }; }
    finally { await store.close(); }
  }, { recordText: JSON.stringify(record), archiveText: archive ? JSON.stringify(archive) : null });
  assert(result.stored, `seeded: ${result.message}`);
}
async function openArticle(page, story) {
  const direct = page.locator(`[data-passage="${story.id}"]:not([data-recommendation]) .shelf-open`).first();
  if (await direct.count()) await direct.click();
  else {
    await openShelfTools(page);
    await page.locator('#shelf-reading-search').fill(story.search);
    await page.locator('#shelf-reading-search').press('Enter');
    await page.locator(`#shelf-reading-results [data-passage="${story.id}"] .shelf-open`).first().click();
  }
  await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 30000 });
  await delay(800);
}
const tok = (page, index) => page.locator(`#reader .tok[data-index="${index}"]`).first();
/** G3 · an idle word is no focus stop: the keyboard selects it through its paragraph's controller (the paragraph's one
 * Tab stop, Home, then the arrows), as verify-reader-doors does. */
async function selectWord(page, locator) {
  const position = await locator.evaluate((node) => {
    const block = node.closest('[data-prose-roving]');
    return { block: [...document.querySelectorAll('#reader [data-prose-roving]')].indexOf(block),
      word: block ? [...block.querySelectorAll('.tok[data-para]')].indexOf(node) : -1 };
  });
  if (position.block < 0 || position.word < 0) throw new Error('the word has no place in its paragraph\'s keyboard order');
  await page.locator('#reader [data-prose-roving]').nth(position.block).focus();
  await page.keyboard.press('Home');
  for (let step = 0; step < position.word; step += 1) await page.keyboard.press('ArrowRight');
}
/** A word's stage (its card), one observed rung per tap: the ladder raises the reading first (G3's tap 1) and, Ladder (John,
 * 10-19), a word set in text then shows its English under it; each next tap comes only once the rung before it is seen,
 * past the last one. A word already standing on a rung climbs on from there; a rung that does not move fails the walk,
 * never tapped again. */
async function stage(page, locator) {
  const node = await locator.elementHandle();
  let rung = await locator.getAttribute('data-ladder-rung');
  do {
    await locator.tap();
    rung = await page.waitForFunction(({ node, after }) => {
      if (document.getElementById('mini')) return 'stage';
      const order = ['reading', 'gloss'], now = node?.dataset.ladderRung;
      // the English rung is seen once its row stands under the word
      if (now === 'gloss' && !node.querySelector(':scope > .tok-en .tok-en-text')) return null;
      return order.indexOf(now) > order.indexOf(after) ? now : null;
    }, { node, after: rung }, { timeout: 10000 }).then((handle) => handle.jsonValue());
  } while (rung !== 'stage');
  await page.locator('#mini .mini-word').waitFor();
}
async function waitRecord(page, predicate, what, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let record;
  do {
    record = (await readAppRecordSnapshot(page)).record;
    if (predicate(record)) return record;
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error(`timed out waiting for ${what}`);
}
/** Today, where the backup door stands: reached before the record is read, so a reading place saved on leaving the
 * reader is part of the record exported, not a difference after it. */
async function toBackup(page) {
  await page.locator('#tab-today').click();
  await page.waitForFunction(() => document.body.dataset.view === 'tray', null, { timeout: 30000 });
  await delay(800);
}
async function exportRecord(page, name) {
  const button = page.locator('#export-store');
  await button.scrollIntoViewIfNeeded();
  const download = page.waitForEvent('download', { timeout: 120000 });
  await button.click();
  const file = await download;
  const path = resolve(evidence, `${engine}-${name}-export.json`);
  await file.saveAs(path);
  return { path, backup: JSON.parse(readFileSync(path, 'utf8')) };
}
async function importRecord(page, path) {
  const marker = randomUUID();
  await page.evaluate((m) => { window.__g2Import = m; }, marker);
  await page.locator('#import-file').setInputFiles(path);
  const outcome = await page.waitForFunction((m) => {
    if (window.__g2Import !== m && document.body?.dataset.ready === '1') return 'reloaded';
    const note = document.getElementById('record-portability-status')?.textContent?.trim();
    return note && /could not|exceeds|上限|できなかった|limit/u.test(note) ? note : false;
  }, marker, { timeout: 300000, polling: 200 }).then((handle) => handle.jsonValue());
  if (outcome === 'reloaded') await writable(page);
  return outcome;
}

try {
  for (engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    versions[engine] = browser.version();
    console.log(`engine ${engine} ${versions[engine]}`);
    const kase = async (name, body, { cold = false, held = false } = {}) => {
      if (only && !only.includes(name)) return;
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
        serviceWorkers: 'block', acceptDownloads: true });
      await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
      await context.route('**/__g2-blank', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>g2</title>' }));
      if (cold) await context.route((url) => url.origin === host.origin && (url.pathname.includes('/dict-v2/') || url.pathname.endsWith('/dictionary-worker.js')),
        (route) => route.abort());
      // held: the full dictionary answers only once the case lets it through (release), every request it made meanwhile intact
      let release = () => {};
      if (held) {
        const gate = new Promise((done) => { release = done; });
        await context.route((url) => url.origin === host.origin && (url.pathname.includes('/dict-v2/') || url.pathname.endsWith('/dictionary-worker.js')),
          async (route) => { await gate; await route.continue().catch(() => {}); });
      }
      if (control) await serveMutation(context, { origin: host.origin, manifest, control: served, edits: control.edits });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(30000);
      page.on('pageerror', (error) => errors.push(error.message));
      try { await body(page, { release }); }
      catch (error) {
        check(`${name}.error`, `${name} ran to the end`, false, String(error.stack || error).slice(0, 900));
        await page.screenshot({ path: resolve(evidence, `${engine}-${name}-error.png`) }).catch(() => {});
      } finally {
        release();
        check(`${name}.page-errors`, `${name}: no page errors`, errors.length === 0, errors);
        await context.close();
      }
    };

    // A · an aged record, upgraded, used, exported and imported
    await kase('A', async (page) => {
      await boot(page);
      const fresh = (await readAppRecordSnapshot(page)).record;
      const old = { ...fresh, ...agedRoots(90), futureRoot: { keep: 'g2-aged', nested: [1, { two: 2 }] } };
      delete old.met;
      delete old.readHelp;
      await seed(page, old);
      await boot(page);
      const booted = (await readAppRecordSnapshot(page)).record;
      check('A.upgrade', 'a ninety-day record from before G2, with a root no build knows, boots with no new root and not one byte changed',
        canonical(portable(booted)) === canonical(portable(old)) && !('met' in booted) && !('readHelp' in booted),
        { changed: changedRoots(portable(old), portable(booted)), roots: Object.keys(booted).length, revlog: booted.revlog.length });
      await openArticle(page, STORY);
      // Ladder (John, 10-19): the climb to 総理's card is three taps now (its reading, its English, its card). The look-up's
      // met and readHelp ride in the reading rung's own tap row, so they are read on that rung, before the English rung's
      // row can land beside them ("beside its tap row" observed as the one row, not raced against the next); the climb then
      // goes on from the reading, one observed rung at a time
      const souri = tok(page, 9);
      await souri.tap();
      await page.waitForFunction((node) => node?.dataset.ladderRung === 'reading', await souri.elementHandle(), { timeout: 10000 });
      const looked = await waitRecord(page, (record) => !!record.met, 'the look-up\'s met');
      const metKeys = Object.keys(looked.met.entries);
      const changed = changedRoots(booted, looked);
      check('A.look-up', 'one look-up of 総理 adds met (one identity: the core record read そうり) and readHelp (this article, that word) beside its tap row — nothing that schedules',
        metKeys.length === 1 && canonical(JSON.parse(metKeys[0])) === canonical([1, 'word', '総理', 'core', null, 'そうり']) &&
        looked.met.entries[metKeys[0]].days === 1 && canonical(looked.readHelp.articles[STORY.id]?.helped) === canonical(metKeys) &&
        changed.every((key) => ['met', 'readHelp', 'obslog', 'readerPos'].includes(key)) && SCHEDULING.every((key) => !changed.includes(key)) &&
        looked.obslog.length === booted.obslog.length + 1, { changed, met: looked.met, readHelp: looked.readHelp });
      await stage(page, souri);
      await page.locator('#mini .mini-word').tap();
      await page.locator('#depth-known').waitFor({ timeout: 15000 });
      await page.locator('#depth-known').click();
      const known = await waitRecord(page, (record) => Object.values(record.met.entries).some((entry) => entry.said?.value === 'known'), 'his "I know this"');
      const pressed = changedRoots(looked, known);
      check('A.known', '"I know this" writes met only', pressed.every((key) => ['met', 'obslog', 'readerPos'].includes(key)) && pressed.includes('met') &&
        SCHEDULING.every((key) => !pressed.includes(key)), { pressed, said: Object.values(known.met.entries).map((entry) => entry.said) });
      await page.locator('#sheet-back').tap();
      await page.waitForFunction(() => !document.getElementById('sheet'), null, { timeout: 15000 });
      if (await page.locator('#mini').count()) { await page.keyboard.press('Escape'); await delay(300); }
      await page.locator('#read-fin').scrollIntoViewIfNeeded();
      await page.locator('#read-fin').click();
      const finished = await waitRecord(page, (record) => !!record.readDone?.[STORY.id] && !!record.readHelp?.articles?.[STORY.id]?.done, 'the first finish');
      const sealed = finished.readHelp.articles[STORY.id];
      check('A.finish', 'finishing the article seals its first reading in the same write: the month, its characters, its level, the one word asked',
        /^\d{4}-\d{2}$/u.test(sealed.month) && sealed.chars > 500 && sealed.helped.length === 1 && sealed.done === finished.readDone[STORY.id], sealed);
      await toBackup(page);
      const durable = (await readAppRecordSnapshot(page)).record;
      const exported = await exportRecord(page, 'A');
      const outcome = await importRecord(page, exported.path);
      const back = (await readAppRecordSnapshot(page)).record;
      check('A.round-trip', 'export → import returns exactly the record exported: met, readHelp, the unknown root and every year-old row',
        outcome === 'reloaded' && canonical(portable(back)) === canonical(portable(durable)) && canonical(back.met) === canonical(durable.met) &&
        canonical(back.readHelp) === canonical(durable.readHelp) && canonical(back.futureRoot) === canonical(old.futureRoot),
        { outcome, changed: changedRoots(portable(durable), portable(back)) });
    });

    // A2 · a newer build's met: kept byte for byte, never written here
    await kase('A2', async (page) => {
      await boot(page);
      const fresh = (await readAppRecordSnapshot(page)).record;
      const later = { version: 2, ledger: { '総理|そうり': { span: [20000, 20010], weight: 0.7 } }, note: 'a newer build\'s shape' };
      const old = { ...fresh, met: later };
      delete old.readHelp;
      await seed(page, old);
      await boot(page);
      await openArticle(page, STORY);
      await stage(page, tok(page, 9));
      const after = await waitRecord(page, (record) => record.obslog.length > old.obslog.length, 'the tap row');
      await delay(500);
      await toBackup(page);
      const settled = (await readAppRecordSnapshot(page)).record;
      const exported = await exportRecord(page, 'A2');
      const outcome = await importRecord(page, exported.path);
      const back = (await readAppRecordSnapshot(page)).record;
      check('A2.later-met', 'a met of version 2 boots, looks up, exports and imports byte for byte: read as nothing, never written',
        canonical(after.met) === canonical(later) && canonical(settled.met) === canonical(later) && canonical(exported.backup).includes('"a newer build\'s shape"') &&
        outcome === 'reloaded' && canonical(back.met) === canonical(later), { after: after.met, back: back.met, outcome });
    });

    // R · a saved ねん card never shows とし, in every room
    const keptNen = async (page) => {
      await boot(page);
      const fresh = (await readAppRecordSnapshot(page)).record;
      const now = Date.now();
      const record = { ...fresh,
        taken: [...fresh.taken, { t: 'word', id: '年', label: '年', ts: now - 20 * DAY, started: now - 20 * DAY, entrySeq: '2084840', cueReading: 'ねん' }],
        deepWords: { ...fresh.deepWords, 年: { r: 'ねん', m: ['counter for years', 'year'], seq: '2084840' } },
        lists: { ...fresh.lists, 年表: [{ t: 'word', id: '年', label: '年', ts: now - 5 * DAY }] },
        srs: { ...fresh.srs, 'word:年': { due: new Date(now + 30 * DAY).toISOString(), last_review: new Date(now - 2 * DAY).toISOString(), stability: 45,
          difficulty: 5, elapsed_days: 2, scheduled_days: 32, reps: 6, lapses: 1, learning_steps: 0, state: 2 } },
        revlog: [...fresh.revlog, [now - 3 * DAY, 'word:年', 1, 2, 3, 0.9, 40, 5, 20, 6, 1, now - 2 * DAY], [now - 2 * DAY, 'word:年', 3, 3, 1, 0.95, 20, 6, 45, 5, 32, now + 30 * DAY]] };
      await seed(page, record);
      await boot(page);
    };
    // the word's own band: its headword, its reading and the basis line (the page may list 年's other entries below as their
    // own doors — とし among them is another entry, never this card's answer)
    const pageReading = (page) => page.evaluate(() => {
      const band = ['#sheet .headword', '#sheet .reading', '#depth-basis'].map((selector) => document.querySelector(selector)?.textContent || '').join(' ');
      return { reading: document.querySelector('#sheet .reading')?.textContent?.trim() || '', toshi: /とし/u.test(band), band };
    });
    await kase('R', async (page) => {
      await keptNen(page);
      // the saved-words row's door
      await page.locator('#tray').click();
      await page.waitForFunction(() => [...document.querySelectorAll('.tray-line .w')].some((w) => w.textContent === '年'), null, { timeout: 15000 });
      await page.locator('.tray-line', { has: page.locator('.w', { hasText: /^年$/u }) }).first().click();
      await page.locator('#sheet').waitFor();
      await delay(900);
      const list = await pageReading(page);
      check('R.list', 'the saved-words row for 年 opens its page read ねん, with no とし on it', list.reading === 'ねん' && !list.toshi, list);
      await page.locator('#sheet-back').tap();
      await page.waitForFunction(() => !document.getElementById('sheet'), null, { timeout: 15000 });
      // Today: his missed word is a star in the sky (its slip reads ねん) or, when Today chose it, the day's word (read ねん)
      await toBackup(page);
      await page.waitForFunction(() => [...document.querySelectorAll('.today-star')].some((s) => s.textContent.trim() === '年') ||
        [...document.querySelectorAll('.dw-word .dw-glyph')].some((g) => g.textContent === '年'), null, { timeout: 15000 });
      let sky;
      if (await page.locator('.today-star', { hasText: /^年$/u }).count()) {
        await page.evaluate(() => { for (const star of document.querySelectorAll('.today-star')) star.hidden = false; });
        await page.locator('.today-star', { hasText: /^年$/u }).first().evaluate((node) => node.click());
        await page.locator('#mini .mini-word').waitFor();
        await delay(700);
        sky = await page.evaluate(() => ({ where: 'star', reading: document.querySelector('#mini .mini-reading')?.textContent || '', text: document.getElementById('mini')?.innerText || '',
          kept: document.getElementById('mini')?.dataset.kept != null }));
        await page.keyboard.press('Escape');
        await delay(300);
      } else {
        const said = await page.locator('.dw-word .dw-r').textContent().catch(() => '');
        await page.locator('.dw-word').click();
        await page.locator('#sheet').waitFor();
        await delay(900);
        sky = { where: 'day word', said, ...(await pageReading(page)), kept: true };
        sky.text = sky.band;
        await page.locator('#sheet-back').tap();
        await page.waitForFunction(() => !document.getElementById('sheet'), null, { timeout: 15000 });
      }
      check('R.sky', 'Today shows 年 read ねん — a star whose slip reads ねん and rings kept, or the day\'s word read ねん whose page reads ねん — with no とし',
        sky.reading === 'ねん' && !/とし/u.test(sky.text) && sky.kept && (sky.where === 'star' || sky.said === 'ねん'), sky);
      // the mirror: its row names the kept reading, and its door opens ねん
      await page.locator('#tab-me, #tab-progress').first().click();
      await page.locator('#me-progress').click();
      await page.waitForFunction(() => document.body.dataset.view === 'kagami', null, { timeout: 15000 });
      await page.waitForFunction(() => !!document.querySelector('.kagami-row[data-kagami-frontier="word:年"]'), null, { timeout: 15000 });
      await delay(400);
      const rowReading = await page.locator('.kagami-row[data-kagami-frontier="word:年"] .row-reading').textContent().catch(() => '');
      await page.locator('.kagami-row[data-kagami-frontier="word:年"]').scrollIntoViewIfNeeded();
      if (engine === 'webkit' && !control) await page.screenshot({ path: resolve(evidence, `${engine}-G2-kagami-kept-reading.png`) });
      await page.locator('.kagami-row[data-kagami-frontier="word:年"]').click();
      await page.locator('#sheet').waitFor();
      await delay(900);
      const mirror = await pageReading(page);
      check('R.mirror', 'the mirror\'s row for 年 names ねん, and its door opens the page read ねん, with no とし', rowReading === 'ねん' && mirror.reading === 'ねん' && !mirror.toshi,
        { rowReading, mirror });
      await page.locator('#sheet-back').tap();
      await page.waitForFunction(() => !document.getElementById('sheet'), null, { timeout: 15000 });
      // the reader: 令和８年's 年 wears the kept ring and its slip reads ねん
      await page.locator('#tab-read').click().catch(() => {});
      await boot(page);
      await openArticle(page, STORY);
      await page.waitForFunction(() => !!document.querySelector('#reader .tok[data-index="2"][data-kept]'), null, { timeout: 8000 }).catch(() => {});
      const ring = await tok(page, 2).evaluate((node) => ({ kept: node.dataset.kept != null, depth: node.dataset.depth || null }));
      await stage(page, tok(page, 2));
      await page.waitForFunction(() => /ねん/u.test(document.querySelector('#mini .mini-reading')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
      const reader = await page.evaluate(() => ({ reading: document.querySelector('#mini .mini-reading')?.textContent || '', text: document.getElementById('mini')?.innerText || '' }));
      check('R.reader', 'the reader\'s 年 in 令和８年 wears the kept ring and its slip reads ねん, with no とし', ring.kept && reader.reading === 'ねん' && !/とし/u.test(reader.text), { ring, reader });
    });
    await kase('R-cold', async (page) => {
      await keptNen(page);
      await page.locator('#tab-me, #tab-progress').first().click();
      await page.locator('#me-progress').click();
      await page.waitForFunction(() => !!document.querySelector('.kagami-row[data-kagami-frontier="word:年"]'), null, { timeout: 15000 });
      await page.locator('.kagami-row[data-kagami-frontier="word:年"]').click();
      await page.locator('#sheet').waitFor();
      await delay(1500);
      const cold = await page.evaluate(() => ({ reading: document.querySelector('#sheet .reading')?.textContent?.trim() || '',
        gloss: document.querySelector('#sheet .gloss, #sheet .sense-list')?.textContent?.trim() || '', toshi: /とし/u.test(document.getElementById('sheet')?.innerText || ''),
        state: window.__KAIRO_DEPTH__ ? 'handle' : 'none' }));
      check('R.cold', 'with the full dictionary refused, 年\'s page answers from its own card: ねん and "counter for years", no とし',
        cold.reading === 'ねん' && /counter for years/u.test(cold.gloss) && !cold.toshi, cold);
    }, { cold: true });

    // T · the archive read back by identity
    await kase('T', async (page, { release }) => {
      await boot(page);
      const snapshot = await readAppRecordSnapshot(page);
      const sentinels = [
        { surface: 'word-tutor', role: 'assistant', content: 'STALE_WAKE_REASON', ts: 1, contextRef: 'word:訳' },
        { surface: 'examples', role: 'assistant', content: 'N3 | STALE_EXAMPLE_SENTINEL | すてーる | stale example', ts: 2, contextRef: 'word:訳' },
      ];
      const archive = { ...snapshot.archive, turns: [...snapshot.archive.turns, ...sentinels] };
      await seed(page, snapshot.record, archive);
      // the tutor's doors are shown only with a provider set on this device: a synthetic one, unreachable (every request
      // off the host is refused), so nothing is ever sent
      await page.evaluate(() => localStorage.setItem('kairo-ai-provider-v1', JSON.stringify({ v: 1, baseUrl: 'https://api.anthropic.com',
        model: 'claude-opus-5', credential: { origin: 'https://api.anthropic.com', key: 'g2-synthetic-unreachable' } })));
      await boot(page);
      await openArticle(page, KAWAGUCHI);
      const word = tok(page, KAWAGUCHI.index);
      await word.scrollIntoViewIfNeeded();
      const text = await word.evaluate((node) => node.textContent);
      await selectWord(page, word);
      // G3 · the keyboard's page waits up to READING_WAIT_MS for the word's reading (openPreparedWordEntry); held past it, the
      // page opens before the full dictionary answers, and the dictionary answers after, as T states
      await page.keyboard.press('Control+Enter');
      await page.locator('#sheet').waitFor();
      release();
      await delay(1800);
      const shown = await page.evaluate(() => ({ head: document.querySelector('#sheet .headword')?.textContent?.trim() || '',
        reading: document.querySelector('#sheet .reading')?.textContent?.trim() || '', tutor: !!document.querySelector('#sheet .ai-tutor'),
        answer: [...document.querySelectorAll('#sheet .ai-answer, #sheet .ai-examples')].map((node) => node.textContent).join(' | '),
        page: document.getElementById('sheet')?.innerText || '' }));
      const after = await readAppRecordSnapshot(page);
      check('T.archive', '訳 read やく (opened before the full dictionary answers): neither the spelling-keyed わけ reply nor the examples sentinel fills its page; the rows stay as seeded',
        /訳/u.test(text) && shown.head.startsWith('訳') && shown.reading === 'やく' && shown.tutor && !/STALE_/u.test(shown.page) &&
        canonical(after.archive.turns.filter((turn) => String(turn.content).includes('STALE_'))) === canonical(sentinels), shown);
    }, { held: true });
    await browser.close();
  }
} finally {
  await host.close();
}
writeFileSync(resolve(evidence, 'verify-record-depth.json'), JSON.stringify({ site, gitSha: identity.gitSha, artifactSha256: identity.artifactSha256,
  browsers: versions, ...(control ? { control: { name: controlName, kills: control.kills, served: served.served, setupError: served.setupError } } : {}), rows }, null, 1));
const failed = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} — evidence ${evidence}`);
process.exit(failed.length ? 1 : 0);
