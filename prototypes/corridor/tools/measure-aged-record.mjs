/** K · measure an aged record on the ACTIVE store (slice K, 2026-10-16). A measurement, not a migration: it seeds
 * year-one and year-two records — moderate (150 taps + 60 reviews a day) and heavy (400 + 120) — straight into the
 * installation's own IndexedDB record (kairo-local-record:<id>, learner-record/current, exactly as a year of use
 * would leave it), boots the real app on it at 390×844, and reports for each: whether it could be stored at all,
 * boot time, whether a save succeeds and how long it takes, export → import round-trip, and the day each ceiling
 * is reached. One more case seeds a record at the save ceiling and records what he sees when a save is refused.
 * Every learner byte is synthetic; no operator profile is opened.
 *   node measure-aged-record.mjs [--out <file.json>]      (KAIRO_SITE_DIR / KAIRO_ARTIFACT_SHA256 / KAIRO_BROWSER)
 * It FAILS only if a year-one moderate record cannot boot or save, in any engine measured.
 * Claim boundary: headless engines on a Mac, not an iPhone — times are relative, not his phone's; the store's own
 * limits are measured exactly, browser quota is not exercised (no disk is filled). */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecordSnapshot } from './record-test-support.mjs';

const SITE = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
const outArg = process.argv.indexOf('--out');
const REPORT = outArg > 0 ? resolve(process.argv[outArg + 1]) : resolve(OUT, 'aged-record.json');
const ENGINES = !process.env.KAIRO_BROWSER || process.env.KAIRO_BROWSER === 'all' ? ['webkit', 'chromium'] : [process.env.KAIRO_BROWSER];
assert(ENGINES.every((engine) => ['chromium', 'webkit'].includes(engine)));
const manifest = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
const toolSha256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (path === '/blank') { response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><meta charset="utf-8"><title>blank</title>'); return; }
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    if (!file.startsWith(`${SITE}/`) || !statSync(file).isFile()) throw new Error('missing');
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

// The ceilings the code itself enforces (read from source, not assumed)
const CEILINGS = {
  export: { values: 500000, bytes: 32 * 1024 * 1024, source: 'corridor.js IMPORT_MAX_NODES / IMPORT_MAX_BYTES (buildExportRecord → backup-limit; import refuses the same)' },
  save: { values: 1000000, chars: 32 * 1024 * 1024, source: 'packages/persistence/src/replication/json.ts MAX_NODES / MAX_CHARACTERS (encodeLocalJson → invalid-request)' },
  legacyLocalStorage: { bytes: 5 * 1024 * 1024, source: 'the brief\'s assumed 5 MB (string length × 2) — the record no longer lives there' },
};
const PROFILES = {
  moderate: { taps: 150, reviews: 60, newCards: 10 },
  heavy: { taps: 400, reviews: 120, newCards: 20 },
};
const DAY = 86400000;
const START = Date.UTC(2025, 9, 16, 0, 0, 0);

function values(value) {
  let count = 0;
  const stack = [value];
  while (stack.length) {
    const item = stack.pop();
    count += 1;
    if (Array.isArray(item)) for (const child of item) stack.push(child);
    else if (item && typeof item === 'object') for (const key of Object.keys(item)) stack.push(item[key]);
  }
  return count;
}
/** A deterministic year of use: every tap a row in obslog, every review a FSRS row in revlog, new cards taken and
 * scheduled. Row layouts are the validators' (corridor.js validObservationRow / validReviewRow / validStoredCard). */
function agedRoots(profile, days) {
  const { taps, reviews, newCards } = PROFILES[profile];
  const taken = []; const srs = {}; const revlog = []; const obslog = [];
  for (let day = 0; day < days; day += 1) {
    const t0 = START + day * DAY + 8 * 3600000;
    for (let i = 0; i < newCards; i += 1) {
      const n = day * newCards + i;
      const id = `語${n}`;
      taken.push({ t: 'word', id, ts: t0 + i * 1000, started: t0 + i * 1000 });
      srs[`word:${id}`] = { due: new Date(t0 + (1 + (n % 40)) * DAY).toISOString(), last_review: new Date(t0).toISOString(),
        stability: 3.17 + (n % 50) / 10, difficulty: 5.28, elapsed_days: 1, scheduled_days: 1 + (n % 40), reps: 1 + (n % 9),
        lapses: n % 3, learning_steps: 0, state: 2 };
    }
    const cards = Math.max(1, (day + 1) * newCards);
    for (let i = 0; i < reviews; i += 1) {
      const n = (day * reviews + i) % cards;
      const t = t0 + 3600000 + i * 20000;
      revlog.push([t, `word:語${n}`, 1 + ((n + i) % 4), 2, 4.125, 0.9123, 12.3456, 5.2811, 15.0021, 5.1999, 14, t + 14 * DAY]);
    }
    for (let i = 0; i < taps; i += 1) {
      const t = t0 + 7200000 + i * 7000;
      obslog.push([t, 'tap', `word:語${(day * 37 + i) % 9000}`, 1 + (i % 3), `article-${(day * 3 + (i % 3)) % 2000}`]);
    }
  }
  return { taken, srs, revlog, obslog };
}
function growth(profile) {
  const one = agedRoots(profile, 1); const ten = agedRoots(profile, 10);
  const perDay = (values(ten) - values(one)) / 9;
  const charsPerDay = (JSON.stringify(ten).length - JSON.stringify(one).length) / 9;
  return { valuesPerDay: Math.round(perDay), charsPerDay: Math.round(charsPerDay) };
}
async function ready(page, timeout = 180000) { await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout }); }
async function settle(page) {
  await page.waitForFunction(() => !document.documentElement.dataset.roomTransition, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(250);
}
async function state(page) { return page.evaluate(() => window.__KAIRO_RECORD_SAFETY__?.state() || null); }
/** Seeds the installation's own record document directly (the app is closed: the page is on /blank). */
async function seed(page, record) {
  return page.evaluate(async (recordText) => {
    const core = await import('/modules/record-core.mjs');
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, policy, actor: installation.actor });
    try {
      const before = await store.snapshot();
      const t0 = performance.now();
      await store.commitLocal({ changeId: `aged-seed-${crypto.randomUUID()}`, binding: policy.binding, expectedRevision: before.revision,
        occurredAt: new Date().toISOString(), mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: JSON.parse(recordText) }], operations: [] });
      return { stored: true, ms: Math.round(performance.now() - t0) };
    } catch (error) { return { stored: false, code: error?.code || error?.name || null, message: String(error?.message || error) }; }
    finally { await store.close(); }
  }, JSON.stringify(record));
}
async function boot(page) {
  const t0 = Date.now();
  await page.goto(`${origin}/index.html?entry=shelf&ui=bi`, { timeout: 180000 });
  await ready(page);
  const readyMs = Date.now() - t0;
  // the record is open when the app may write it (or has said it cannot)
  await page.waitForFunction(() => { const s = window.__KAIRO_RECORD_SAFETY__?.state(); return s && (s.writable || s.notSaving); }, null, { timeout: 180000 });
  return { readyMs, recordOpenMs: Date.now() - t0 };
}
async function noteSave(page, text) {
  const t0 = Date.now();
  await page.fill('#note-input', text);
  await page.click('#note-send');
  const outcome = await page.waitForFunction(() => {
    const input = document.getElementById('note-input');
    const alert = document.getElementById('store-alert');
    if (input && input.value === '' && !document.getElementById('note-send')?.disabled) return 'saved';
    if (alert && !alert.hidden && alert.textContent.trim()) return 'refused';
    return false;
  }, null, { timeout: 180000, polling: 100 }).then((handle) => handle.jsonValue());
  return { outcome, ms: Date.now() - t0, alert: await page.evaluate(() => document.getElementById('store-alert')?.textContent?.trim() || null) };
}
async function exportRecord(page, directory, name) {
  const button = page.locator('#export-store');
  await button.scrollIntoViewIfNeeded();
  const t0 = Date.now();
  const download = page.waitForEvent('download', { timeout: 180000 }).catch(() => null);
  await button.click();
  const refusal = page.waitForFunction(() => {
    const note = document.getElementById('record-portability-status')?.textContent?.trim();
    return note && /could not|exceeds|larger than|上限|作れない|収まる/u.test(note) ? note : false;
  }, null, { timeout: 180000, polling: 200 }).then((handle) => handle.jsonValue()).catch(() => null);
  const first = await Promise.race([download.then((file) => ({ file })), refusal.then((note) => ({ note }))]);
  const ms = Date.now() - t0;
  if (first.file) {
    const path = resolve(directory, `${name}-export.json`);
    await first.file.saveAs(path);
    const text = readFileSync(path, 'utf8');
    const backup = JSON.parse(text);
    return { ok: true, ms, path, bytes: Buffer.byteLength(text), values: values(backup), format: backup.format, completeness: backup.completeness };
  }
  return { ok: false, ms, refusal: first.note };
}
async function importRecord(page, path) {
  const t0 = Date.now();
  const marker = randomUUID();
  await page.evaluate((m) => { window.__agedImport = m; }, marker);
  await page.locator('#import-file').setInputFiles(path);
  const done = await page.waitForFunction((m) => {
    if (window.__agedImport !== m && document.body?.dataset.ready === '1') return 'reloaded';
    const note = document.getElementById('record-portability-status')?.textContent?.trim();
    return note && /could not|exceeds|上限|できなかった|limit/u.test(note) ? note : false;
  }, marker, { timeout: 300000, polling: 200 }).then((handle) => handle.jsonValue());
  return { outcome: done === 'reloaded' ? 'imported' : 'refused', note: done === 'reloaded' ? null : done, ms: Date.now() - t0 };
}
const portable = (record) => Object.fromEntries(Object.entries(record).filter(([key]) => !['ai', 'aiEvidence', 'recordGeneration'].includes(key)));

const report = { tool: 'measure-aged-record', version: 1, toolSha256, site: { gitSha: manifest.gitSha, sourceDirty: manifest.sourceDirty,
  artifactSha256: manifest.artifactSha256 }, startedAt: new Date().toISOString(), viewport: '390x844', ceilings: CEILINGS,
  assumptions: { profiles: PROFILES, rows: 'tap row [t,"tap",key,depth,articleId] = 6 values; review row (12 fields) = 13 values; card = taken 5 + srs 12',
    seeding: 'direct commitLocal of learner-record/current into the installation store after a fresh boot (the record a year of use leaves; no migration path)' },
  growth: {}, engines: {} };
for (const profile of Object.keys(PROFILES)) {
  const g = growth(profile);
  const base = values(agedRoots(profile, 0));
  report.growth[profile] = { ...g,
    exportCeilingDay: Math.floor((CEILINGS.export.values - base) / g.valuesPerDay),
    saveCeilingDay: Math.floor((CEILINGS.save.values - base) / g.valuesPerDay),
    assumed5MBDay: Math.floor((CEILINGS.legacyLocalStorage.bytes / 2) / g.charsPerDay),
    note: 'days from an empty record at this pace; the app\'s own small roots shift these by a few days at most' };
}
const failures = [];
try {
  for (const engine of ENGINES) {
    const browser = await ({ chromium, webkit })[engine].launch();
    const engineReport = report.engines[engine] = { version: browser.version(), cases: {} };
    const directory = resolve(OUT, engine); mkdirSync(directory, { recursive: true });
    // the curve first (moderate at 90 and 180 days), then the brief's four records, then the ceiling itself
    const cases = [['moderate', 90 / 365], ['moderate', 180 / 365], ['moderate', 1], ['moderate', 2], ['heavy', 1], ['heavy', 2], ['ceiling', 0]];
    for (const [profile, years] of cases) {
      const name = profile === 'ceiling' ? 'at-the-save-ceiling' : Number.isInteger(years) ? `${profile}-year-${years}` : `${profile}-day-${Math.round(years * 365)}`;
      const result = engineReport.cases[name] = {};
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true });
      await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const began = Date.now();
      try {
        await page.goto(`${origin}/index.html?entry=shelf&ui=bi`); await ready(page);
        const baseline = await readAppRecordSnapshot(page);
        let record;
        if (profile === 'ceiling') {
          // as large as one save allows, less a few rows: the next taps or notes are refused
          const target = CEILINGS.save.values - 40 - values(baseline.archive);
          const roots = agedRoots('moderate', 600);
          record = { ...baseline.record, ...roots };
          const over = values(record) - target;
          record.obslog = roots.obslog.slice(0, roots.obslog.length - Math.ceil(over / 6));
        } else record = { ...baseline.record, ...agedRoots(profile, Math.round(365 * years)) };
        Object.assign(result, { days: profile === 'ceiling' ? null : Math.round(365 * years), values: values(record) + values(baseline.archive),
          chars: JSON.stringify(record).length, rows: { taken: record.taken.length, srs: Object.keys(record.srs).length, revlog: record.revlog.length, obslog: record.obslog.length } });
        await page.goto(`${origin}/blank`);
        result.seed = await seed(page, record);
        if (!result.seed.stored) throw Object.assign(new Error(`cannot be stored: ${result.seed.code}`), { verdict: true });
        result.boot = await boot(page);
        const after = await state(page);
        result.openState = { writable: after.writable, notSaving: after.notSaving, band: await page.locator('#record-band').isVisible() };
        if (!after.writable) throw Object.assign(new Error('boots but cannot write'), { verdict: true });
        await page.waitForFunction(() => !!window.__KAIRO_RECORD_SAFETY__.state().size, null, { timeout: 60000 }).catch(() => {});
        result.measured = (await state(page)).size;
        let t0 = Date.now();
        await page.locator('#tab-today').click();
        await page.waitForFunction(() => document.body.dataset.view === 'tray', null, { timeout: 180000 });
        await settle(page);
        result.todayRenderMs = Date.now() - t0;
        result.todaySizeNote = await page.locator('#record-size-nudge').textContent().catch(() => null);
        const saves = [];
        for (let i = 0; i < (profile === 'ceiling' ? 12 : 2); i += 1) {
          const save = await noteSave(page, `Aged record note ${i + 1}.`);
          saves.push(save);
          if (save.outcome !== 'saved') break;
        }
        result.saves = saves;
        result.save = { ok: saves[0]?.outcome === 'saved', ms: saves[0]?.ms ?? null, secondMs: saves[1]?.ms ?? null };
        const durable = await readAppRecordSnapshot(page);
        const savedNotes = durable.record.obslog.filter((row) => row[1] === 'note' && String(row[3]).startsWith('Aged record note')).length;
        result.save.durableNotes = savedNotes;
        if (profile === 'ceiling') {
          const refused = saves.find((save) => save.outcome === 'refused');
          result.atCeiling = { savesBeforeRefusal: saves.filter((save) => save.outcome === 'saved').length, refused: !!refused, alert: refused?.alert ?? null,
            band: await page.locator('#record-band').isVisible(), bandText: await page.locator('#record-band').textContent().catch(() => null),
            state: await state(page) };
          await page.screenshot({ path: resolve(directory, 'at-the-save-ceiling.png') });
          // the record that stopped growing still opens
          const again = await boot(page);
          result.rebootAfterRefusal = { ...again, writable: (await state(page)).writable,
            unchanged: JSON.stringify(portable((await readAppRecordSnapshot(page)).record)) === JSON.stringify(portable(durable.record)) };
        }
        if (await page.evaluate(() => document.body.dataset.view) !== 'tray') {
          await page.locator('#tab-today').click();
          await page.waitForFunction(() => document.body.dataset.view === 'tray', null, { timeout: 180000 });
          await settle(page);
        }
        t0 = Date.now();
        const exported = await exportRecord(page, directory, name);
        result.export = { ...exported, path: undefined };
        if (exported.ok) {
          const imported = await importRecord(page, exported.path);
          result.import = imported;
          if (imported.outcome === 'imported') {
            const back = await readAppRecordSnapshot(page);
            result.roundTrip = { ok: JSON.stringify(portable(back.record)) === JSON.stringify(portable(durable.record)), ms: Date.now() - t0 };
          } else result.roundTrip = { ok: false, why: imported.note };
        } else result.roundTrip = { ok: false, why: `export refused: ${exported.refusal}` };
        result.verdict = [result.save.ok ? 'boots and saves' : 'boots, save refused', result.roundTrip.ok ? 'export → import round-trips' : 'no round-trip'].join('; ');
      } catch (error) {
        if (error?.verdict) result.verdict = error.message;
        else {
          result.error = String(error?.stack || error).slice(0, 2000);
          result.verdict = `measurement failed: ${String(error?.message || error).slice(0, 200)}`;
          await page.screenshot({ path: resolve(directory, `${name}-failure.png`) }).catch(() => {});
        }
      } finally {
        result.pageErrors = pageErrors;
        result.elapsedMs = Date.now() - began;
        await context.close();
        console.log(`${engine} ${name}: ${result.verdict}`);
      }
      if (name === 'moderate-year-1' && !(result.boot && result.save?.ok)) failures.push(`${engine}: a year-one moderate record cannot boot or save (${result.verdict})`);
    }
    await browser.close();
  }
} finally {
  await new Promise((done) => server.close(done));
  report.completedAt = new Date().toISOString();
  report.pass = failures.length === 0;
  report.failures = failures;
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(`report: ${REPORT}`);
}
assert.deepEqual(failures, [], 'a year-one moderate record must boot and save');
