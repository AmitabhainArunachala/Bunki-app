/** DOTS: actual raster visibility, independent of the CSS pigment proxy.
 * Delta-E 76 >= 10 is a conservative engineering separation, not a WCAG rule.
 * Evidence-only --worlds may narrow a diagnostic, never the full 22-context claim.
 * The ladder contract is exercised as an attribute, not claimed as a ladder interaction.
 * Lead 1940's title rows use real first and second taps on fresh native profiles; they
 * measure the title's layout through the first state, not the Ladder's own behaviour.
 * Lead 2140 adds the same taps on 大賞 beside a saved 日本; lead 2240 adds the natural wrapped
 * title of wikinews:27998, tapping 大臣 on the line below a saved 巡る. Each ring is held to
 * every OTHER visible card character's box, ruby included, and to all of the card's actual
 * text ink, its own word's included. Its own word's font box is measured, not required clear.
 * The saved occurrence itself is bound in every raster frame, its ring pixels included. Where the
 * open slip covers it, that frame is geometry only; the native Escape then uncovers the same ring,
 * and the word's native first input shows its reading again beside it; a real pointer hover on the saved word, with that
 * reading still open, then puts its own hairline mark under the ring. That mark is a box shadow, not a glyph: the bare frame removes it with the
 * text, so a dot painted on it counts as ink. On the 日本 title, after its own walk, the story opened again through its
 * native door and 大賞's native first input show 大賞's reading on the phone's next line; a real pointer hover, then the
 * title's own roving Home key, make the saved 日本 active without activating it: its lowered ring must clear that reading
 * too, and the reading, record, title and scroll stay as they were.
 * A raster batch is taken only
 * on the settled reader (no room transition); its shots may differ only within dots, or it is retaken.
 * Identity is read from what the app opened and showed, not from the selectors the verifier chose.
 * --title-rings runs only those ring cases: 2 engines x 11 worlds x phone (21px) and desktop
 * (34px), 44 exact cases. It never sets fullAcceptance; only the exact roster sets its own field.
 * --self-test-admission runs the roster and saved-ring verdicts against altered receipts, no browser.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { startStaticHost } from '../../bunki-desktop/lib/static-host.cjs';
import { readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';

const WORLDS = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku'];
const PARA = { unmet: 23, met: 14, again: 18, recalled: 20, owned: 13, listed: 21, notYet: 31 };
const DAY = 86400000;
const STORY = 'kantei:jp-105-actions-202609-25startup';
const CONTEXT_STORY = 'aozora:000772-1';
// nextLineOn: the engine/size layouts where the natural title sets the tapped word's reading on the line below the ring.
const LIVE = [{ name: 'live-daisho', id: STORY, query: 'スタートアップ大賞', word: '大賞' }, { name: 'live-watashi', id: CONTEXT_STORY, query: '私の個人主義', word: '私' },
  { name: 'live-daisho-saved-nihon', id: STORY, query: 'スタートアップ大賞', word: '大賞', reading: 'たいしょう', prior: '日本', nextLineOn: ['webkit/phone'], besideReading: true },
  { name: 'live-daijin-saved-meguru', id: 'wikinews:27998', archiveYear: '2015', query: '巡る', word: '大臣', reading: 'だいじん', prior: '巡る', nextLineOn: ['webkit/desktop', 'chromium/desktop'], uncover: true }];
// Phone or desktop leading follows the page's own (max-width: 520px) match, never a rounded innerWidth.
const titleLeading = (fontPx, phone) => fontPx * 1.45 + (phone ? 20 : 31);
const DEVICES = { phone: { viewport: { width: 390, height: 844 }, touch: true, titleFont: '21px' }, desktop: { viewport: { width: 1440, height: 900 }, touch: false, titleFont: '34px' } };
const defaultSize = (engine) => (engine === 'webkit' ? 'phone' : 'desktop');
const RING_LIVE = LIVE.filter((l) => l.prior);
const RING_ENGINES = ['webkit', 'chromium'];
const RING_SIZES = ['phone', 'desktop'];
const ringFrames = (spec) => [['before', true], ['reading', true], ['stage-open', false], ['stage-met', !spec.uncover],
  ...(spec.uncover ? [['stage-met-uncovered', true], ['stage-met-restored', true], ['active-saved', true]] : []), ...(spec.besideReading ? [['active-hover', true], ['active-key', true]] : [])];
const ringRows = (spec) => [`world.${spec.name}`, `${spec.name}.device`, ...['fresh', 'reading-beside-ring', 'reading-without-encounter', 'prior-state-intact', 'stage-commits-met', 'first-tap-base-glyphs', 'second-tap-base-glyphs',
  'fresh-to-state-base-glyphs', 'title-rhythm-through-inputs', 'source-visible-and-owned', 'scroll-unchanged', 'slip-seated', 'title-leading-breakpoint',
  ...(spec.besideReading ? ['active-hover-input', 'active-key-input'] : []),
  ...(spec.uncover ? ['uncovered-record-identical', 'uncovered-title-stable', 'restored-reading', 'restored-record-identical', 'active-saved-input'] : [])].map((id) => `${spec.name}.${id}`),
  ...ringFrames(spec).flatMap(([frame, raster]) => ['fragment-alignment', 'no-other-glyph-overlap', ...(raster ? ['scene-settled', 'ring-clear-of-ink', 'saved-occurrence', 'active-mark'] : [])].map((id) => `${spec.name}-${frame}.${id}`))];
const ringCaseId = (engine, world, size) => `${engine}/${world}/${size}`;
const RING_REQUIRED = RING_ENGINES.flatMap((engine) => WORLDS.flatMap((world) => RING_SIZES.map((size) => ({ caseId: ringCaseId(engine, world, size), engine, world, size, titleFont: DEVICES[size].titleFont,
  rows: RING_LIVE.flatMap(ringRows), nextLineWitnesses: RING_LIVE.filter((l) => l.nextLineOn.includes(`${engine}/${size}`)).map((l) => l.name) }))));
// Lead 2010: these titles are already enhanced when their reader opens. Only
// wikinews has a BODY sidecar request; jawiki has no deferred-title arm.
const LATE = [
  { name: 'jawiki-cold', id: 'jawiki:5238864-s63', query: '台風', mode: 'cold', words: 6, phases: ['cold', 'settled-cold'] },
  { name: 'wikinews-body-success', id: 'wikinews:27998', archiveYear: '2015', mode: 'success', words: 26, phases: ['cold', 'body-loaded'] },
  { name: 'wikinews-body-fail-retry', id: 'wikinews:27998', archiveYear: '2015', mode: 'fail-retry', words: 26, phases: ['cold', 'body-failed', 'body-retry-pending', 'body-loaded'] },
];
const LATE_ENGINES = ['webkit', 'chromium'];
const LATE_WORLDS = ['hokusai', 'sumi'];
const lateRows = (spec) => [`world.${spec.name}`, ...[
  'cold-open', 'native-title-not-deferred', 'unconditional-title-rhythm', 'title-identical', 'card-identical', 'glyphs-identical', 'scroll-identical', 'phase-roster', 'request-sequence',
  ...(spec.mode === 'cold' ? ['cold-loaded'] : ['body-pending', 'body-loaded']),
  ...(spec.mode === 'fail-retry' ? ['body-failed', 'native-retry'] : []),
].map((id) => `${spec.name}.${id}`)];
const lateCaseId = (engine, world, spec) => `${engine}/${world}/${spec.name}`;
const LATE_REQUIRED = LATE_ENGINES.flatMap((engine) => LATE_WORLDS.flatMap((world) => LATE.map((spec) => ({ caseId: lateCaseId(engine, world, spec), engine, world, name: spec.name, story: spec.id, mode: spec.mode, phases: spec.phases, rows: lateRows(spec) }))));
const exactRoster = (observed, expected) => observed.length === expected.length && new Set(observed).size === observed.length && observed.every((id) => expected.includes(id));
const savedWord = (id, now) => ({ t: 'word', id, label: id, ts: now - 40 * DAY, started: now - 40 * DAY });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const option = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const allowedArgs = new Set(['--worlds', '--control-current-paint', '--scene-fixture', '--mark-fixture']);
for (let i = 2; i < process.argv.length; i++) { if (['--diagnostic-inline-end', '--late-lookup', '--title-rings', '--self-test-admission'].includes(process.argv[i])) continue; assert(allowedArgs.has(process.argv[i]) && process.argv[i + 1], `Invalid option ${process.argv[i]}`); i++; }
const diagnosticInlineEnd = process.argv.includes('--diagnostic-inline-end');
const lateLookup = process.argv.includes('--late-lookup');
const titleRings = process.argv.includes('--title-rings');
const selfTestAdmission = process.argv.includes('--self-test-admission');
assert(!lateLookup || (!option('--worlds') && !diagnosticInlineEnd), 'The late-lookup roster names its own worlds and paint');
assert(!titleRings || (!lateLookup && !diagnosticInlineEnd), 'The title-ring roster is its own mode');
assert(!selfTestAdmission || process.argv.length - 3 === 2 * ['--scene-fixture', '--mark-fixture'].filter((o) => option(o)).length, 'The admission self-test takes only --scene-fixture and --mark-fixture');
assert((!option('--scene-fixture') && !option('--mark-fixture')) || selfTestAdmission, 'Fixtures belong to the admission self-test');
const worlds = lateLookup ? LATE_WORLDS : option('--worlds')?.split(',') || WORLDS;
assert(worlds.length && new Set(worlds).size === worlds.length && worlds.every((w) => WORLDS.includes(w)), 'Named, unique public worlds required');
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['webkit', 'chromium'];
assert(engines.every((e) => ['webkit', 'chromium'].includes(e)), 'Unknown engine');
const evidence = resolveCorridorEvidence();
const controlFile = option('--control-current-paint');
const controlBytes = controlFile ? readFileSync(resolve(controlFile)) : null;
const report = { schemaVersion: 1, runId: process.env.KAIRO_GATE_RUN_ID || randomUUID(), startedAt: new Date().toISOString(),
  verifierSha256: hash(readFileSync(fileURLToPath(import.meta.url))), command: [process.execPath, ...process.argv.slice(1)],
  scope: { engines, worlds, full: !lateLookup && !titleRings && engines.length === 2 && worlds.length === 11, rooms: lateLookup || titleRings ? [] : ['slip', 'basis', 'tray', 'today', 'mirror'],
    ...(titleRings ? { titleRingRoster: { fixtures: RING_LIVE.map((l) => ({ name: l.name, story: l.id, saved: l.prior, tapped: l.word, nextLineOn: l.nextLineOn })), engines: RING_ENGINES, worlds: WORLDS, sizes: DEVICES, cases: RING_REQUIRED.length, required: RING_REQUIRED,
      scheduled: RING_REQUIRED.filter((c) => engines.includes(c.engine) && worlds.includes(c.world)).map((c) => c.caseId), claim: 'lead2240: both saved-ring fixtures, real first and second input, at 21px phone and 34px desktop titles',
      nextLineGap: 'chromium/phone: neither natural title sets a tapped reading on the line below a saved ring; its rows hold every other box and all ink, and no next-line clearance is claimed there' } } : {}),
    ...(lateLookup ? { lateRoster: { titles: [...new Set(LATE.map((l) => l.id))], engines: LATE_ENGINES, worlds: LATE_WORLDS, cases: LATE_REQUIRED.length, required: LATE_REQUIRED, scheduled: LATE_REQUIRED.filter((c) => engines.includes(c.engine)).map((c) => c.caseId), claim: 'lead2010: native cold titles plus actual wikinews BODY success/failure/retry; 12 real cases, not every world', jawikiSidecar: 'not exercised: no such request exists', deferredTitleWitness: 'not required by lead2010; neither native title is deferred' } } : {}),
    card: { title: STORY, context: `${CONTEXT_STORY} 講演 met+saved`, live: LIVE.map((l) => `${l.id} ${l.word}: fresh profile${l.prior ? ` with ${l.prior} met+saved` : ''}, real first and second input`) },
    fixture: 'G2 first paragraph; native installation record; exact dictionary identities', ladder: 'attribute contract only' },
  thresholds: { fillCssPx: 6, actualFillExtentCssPx: 5, actualFillAreaCssPx2: 18, actualFillNote: 'Interior mask excludes 0.25px radius edge; extent allows circle antialiasing, area rejects clipped stripes', keptOuterCssPx: 10, knownContrast: 3, savedContrast: 3, metContrast: 1.5, semanticDeltaE76: 10,
    deltaEStatus: 'conservative engineering bound, not WCAG', measurement: 'actual device pixels: painted screenshot vs identical geometry with only dots hidden; paper is the hidden pixel' },
  diagnosticInlineEnd,
  control: { file: controlFile, sha256: controlBytes ? hash(controlBytes) : null, served: [], setupError: null }, contexts: [], errors: [], passed: false, fullAcceptance: false };
const save = () => writeFileSync(resolve(evidence, lateLookup ? 'verify-depth-visibility-late.json' : titleRings ? 'verify-depth-visibility-title-rings.json' : 'verify-depth-visibility.json'), JSON.stringify(report, null, 2));
const shotTag = (out) => (titleRings ? `${out.engine}-${out.world}-${out.size}` : `${out.engine}-${out.world}`);
const row = (out, id, passed, detail) => { out.rows.push({ id, passed: Boolean(passed), detail }); if (!passed) console.log(`FAIL ${out.engine}/${out.world}${titleRings ? `/${out.size}` : ''} ${id}`); };
let host;
let base;
function png(buffer) {
  let at = 8, width, height, depth, type, interlace; const chunks = [];
  while (at < buffer.length) { const n = buffer.readUInt32BE(at), kind = buffer.toString('latin1', at + 4, at + 8), d = buffer.subarray(at + 8, at + 8 + n);
    if (kind === 'IHDR') { width = d.readUInt32BE(0); height = d.readUInt32BE(4); depth = d[8]; type = d[9]; interlace = d[12]; }
    if (kind === 'IDAT') chunks.push(d); if (kind === 'IEND') break; at += n + 12; }
  assert(depth === 8 && [2, 6].includes(type) && interlace === 0, 'Unsupported PNG');
  const bpp = type === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync(Buffer.concat(chunks)), pixels = new Uint8Array(width * height * 3);
  let prev = new Uint8Array(stride), line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) { const f = raw[y * (stride + 1)], bytes = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0; let v = bytes[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; } else assert(f === 0, 'Unsupported PNG filter'); line[x] = v & 255; }
    for (let x = 0; x < width; x++) for (let k = 0; k < 3; k++) pixels[(y * width + x) * 3 + k] = line[x * bpp + k]; [prev, line] = [line, prev]; }
  return { width, height, pixels };
}
const pix = (im, x, y) => { assert(x >= 0 && y >= 0 && x < im.width && y < im.height, 'Pixel outside screenshot'); const i = (y * im.width + x) * 3; return Array.from(im.pixels.subarray(i, i + 3)); };
const linear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => rgb.map(linear).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const lab = (rgb) => { const [r, g, b] = rgb.map(linear); const f = (t) => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047), y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b), z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883); return [116 * y - 16, 500 * (x - y), 200 * (y - z)]; };
const delta = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
const median = (colors) => colors.length ? [0, 1, 2].map((i) => colors.map((x) => x[i]).sort((a, b) => a - b)[Math.floor(colors.length / 2)]) : null;
const hideCss = '#reader .tok > .tok-word::after,.japanese-lookup-word::after,#mini .mini-word::after,.today-star::after{visibility:hidden!important}.depth-dot{visibility:hidden!important}';
const hideCardText = '.reader-card,.reader-card *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-decoration-color:transparent!important;text-shadow:none!important}';
// Bare frame only: the touched title word's native hairline mark (editorial.css "H · Word", an inset box shadow) is ink too.
const hideTitleMark = '.reader-card > h1.view-title .japanese-lookup-word:is(:hover,:focus-visible){box-shadow:none!important}';
async function boot(page) {
  await page.goto(new URL('index.html?entry=shelf&ui=bi', base).href);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
}
/** Open a passage through its native door: the shelf (or its search), or the archive's year fold. */
async function openPassage(page, { id, query, archiveYear }) {
  if (archiveYear) {
    await page.locator('#archive-link').click(); await page.locator(`.archive-year[data-year="${archiveYear}"]`).click();
    const row = page.locator(`.archive-row[data-passage="${id}"]`); const door = await row.getAttribute('data-passage'); await row.click(); return door;
  }
  const direct = page.locator(`[data-passage="${id}"]:not([data-recommendation]) .shelf-open`).first();
  const open = (await direct.count()) ? direct : null;
  if (!open) { await openShelfTools(page); await page.locator('#shelf-reading-search').fill(query); await page.locator('#shelf-reading-search').press('Enter'); }
  const button = open || page.locator(`#shelf-reading-results [data-passage="${id}"] .shelf-open`).first();
  const door = await button.evaluate((el) => el.closest('[data-passage]')?.dataset.passage ?? null); await button.click(); return door;
}
async function story(page, id = STORY, query = 'スタートアップ大賞', archiveYear) {
  await boot(page);
  const door = await openPassage(page, { id, query, archiveYear });
  await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 30000 }); await delay(1000);
  return door;
}
/** The title as laid out now, with the native depth of every card word read
 * through the app's own resolver, independent of painted attributes. */
const titleLayout = (page) => page.evaluate(async () => {
  await document.fonts.ready;
  const h1 = document.querySelector('.reader-card > h1.view-title');
  if (!h1) return null;
  const style = getComputedStyle(h1);
  const words = [...document.querySelectorAll('.reader-card .japanese-lookup-word[data-lookup-text]')].map((w) => {
    const d = window.__KAIRO_DEPTH__.depth({ t: 'word', id: w.dataset.lookupText });
    return { text: w.dataset.lookupText, title: h1.contains(w), painted: w.dataset.depth != null || w.dataset.kept != null, nativeActive: Boolean(d && (d.depth !== 'unmet' || d.kept)) };
  });
  return { fontSize: style.fontSize, lineHeight: style.lineHeight, paddingBottom: style.paddingBottom, height: h1.getBoundingClientRect().height, titleWords: words.filter((w) => w.title).length, words };
});
const stateless = (layout, where = () => true) => Boolean(layout) && !layout.words.some((w) => where(w) && (w.painted || w.nativeActive));
const sameRhythm = (a, b) => Boolean(a && b) && ['fontSize', 'lineHeight', 'paddingBottom', 'height'].every((k) => a[k] === b[k]);
/** Commit a whole learner record through the app's own replication store. */
async function commitRecord(page, value, tag) {
  const blank = new URL(`__dots-${tag}-blank`, base).href;
  await page.route(blank, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Native fixture</title>' }));
  await page.goto(blank);
  await page.evaluate(async ({ text, moduleUrl, tag }) => { const core = await import(moduleUrl); const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1')); const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, policy, actor: installation.actor });
    try { const before = await store.snapshot(); await store.commitLocal({ changeId: `dots-${tag}-${crypto.randomUUID()}`, binding: policy.binding, expectedRevision: before.revision, occurredAt: new Date().toISOString(), mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: JSON.parse(text) }], operations: [] }); } finally { await store.close(); }
  }, { text: JSON.stringify(value), moduleUrl: new URL('modules/record-core.mjs', base).href, tag });
}
async function seed(page, out) {
  await story(page);
  out.freshTitle = await titleLayout(page);
  const nodes = await page.evaluate((map) => Object.fromEntries(Object.entries(map).map(([name, at]) => { const node = window.__KAIRO_DEPTH__.readerNode(at); return [name, { node, key: window.__KAIRO_DEPTH__.key(node || {}), kind: window.__KAIRO_DEPTH__.identity(node || {})?.kind }]; })), PARA);
  const wanted = { unmet: '出席', met: '官邸', again: '大賞', recalled: '表彰', owned: '大臣', listed: '式', notYet: '挨拶' };
  assert(Object.entries(wanted).every(([k, v]) => nodes[k]?.node?.id === v && nodes[k].kind === 'core'), `Fixture identity mismatch: ${JSON.stringify(nodes)}`);
  const today = await page.evaluate(() => window.__KAIRO_DEPTH__.day()), now = Date.now();
  const value = (await readAppRecordSnapshot(page)).record;
  const item = (id) => savedWord(id, now);
  const card = (stability, daysAgo) => ({ due: new Date(now + Math.round(stability * 0.6) * DAY).toISOString(), last_review: new Date(now - daysAgo * DAY).toISOString(), stability, difficulty: 5.1, elapsed_days: daysAgo, scheduled_days: Math.round(stability * 0.6) + daysAgo, reps: 7, lapses: 0, learning_steps: 0, state: 2 });
  value.taken = [...value.taken, ...['大臣', '挨拶', '日', '年', '官邸', '大賞', '表彰'].map(item)];
  value.lists = { ...value.lists, 式典: [{ t: 'word', id: '式', label: '式', ts: now - 3 * DAY }] };
  value.srs = { ...value.srs, 'word:大臣': card(64, 3), 'word:表彰': card(12, 1), 'word:挨拶': card(48, 2), 'word:日': card(80, 4), 'word:年': card(90, 5) };
  const rev = (t, g) => [t, 'word:大臣', g, 2, 3, 0.95, 40, 5, 42, 5, 30, t + 30 * DAY];
  value.revlog = [...value.revlog, rev(now - 3 * DAY, 1), rev(now - 2 * DAY, 3)];
  // Native history reaches real Today looked/due variants, including the due
  // star's authored breathing opacity; no DOM state or paint is manufactured.
  value.obslog = [...(value.obslog || []), ...['官邸', '大賞', '表彰'].flatMap((word) => [[now - 30 * 60000, 'tap', `word:${word}`, 2, STORY], [now - 15 * 60000, 'tap', `word:${word}`, 2, STORY], [now - 6 * DAY, 'dojo', `word:${word}`, 1], [now - 5 * DAY, 'dojo', `word:${word}`, 3]])];
  value.srs['word:挨拶'].due = new Date(now - 60000).toISOString();
  value.met = { version: 1, entries: Object.fromEntries([['met', 0, 0, 1], ['again', 9, 1, 3], ['recalled', 30, 4, 6], ['owned', 60, 2, 11], ['notYet', 20, 1, 4]].map(([k, first, last, days]) => [nodes[k].key, { first: today - first, last: today - last, days, ...(k === 'notYet' ? { said: { value: 'not-yet', at: now - DAY, cursor: value.revlog.length } } : {}) }])) };
  // The title's first word, met today and saved: on the phone its ring sits on
  // the first title line, over the second line's glyphs.
  const nativeTitle = await page.evaluate(() => { const node = { t: 'word', id: '日本' }; return { node, key: window.__KAIRO_DEPTH__.key(node), kind: window.__KAIRO_DEPTH__.identity(node)?.kind }; });
  assert.equal(nativeTitle.kind, 'core', 'Native title 日本 identity is core');
  value.met.entries[nativeTitle.key] = { first: today, last: today, days: 1 };
  value.taken.push(item('日本'));
  await commitRecord(page, value, 'seed');
  await story(page); await page.waitForFunction(() => document.querySelector('#reader .tok[data-depth]')); await delay(700); return nodes;
}
/** Geometry is read before hiding paint; pixels decide whether paint exists. */
async function facts(page, selector, pseudo = true) {
  return page.locator(selector).evaluateAll((elements, pseudo) => { const dots = elements.map((el) => {
    const owner = el.closest('#reader .tok') || (el.matches('.mini-word') ? el.closest('#mini') : el);
    const c = getComputedStyle(el, pseudo ? '::after' : null), r = el.getBoundingClientRect(), style = getComputedStyle(el);
    const fragments = [...el.getClientRects()];
    const first = fragments[0] || r, last = fragments[fragments.length - 1] || r;
    const inline = style.display === 'inline';
    const originLeft = inline ? first.left : r.left;
    const originTop = inline ? first.top : r.top;
    const originBottom = inline ? last.bottom : r.bottom;
    const containingWidth = inline ? Math.max(0, last.right - first.left) : r.width;
    const width = parseFloat(c.width) || 0, height = parseFloat(c.height) || 0;
    const px = (value, size) => String(value).trim().endsWith('%') ? parseFloat(value) * size / 100 : parseFloat(value) || 0;
    let left = r.left, top = r.top;
    if (pseudo && c.position === 'absolute') {
      left = c.left === 'auto' && c.right === 'auto' ? last.right : c.left === 'auto' ? (inline ? last.right : r.right) - px(c.right, containingWidth) - width - (parseFloat(c.marginRight) || 0) : originLeft + (parseFloat(style.borderLeftWidth) || 0) + px(c.left, containingWidth) + (parseFloat(c.marginLeft) || 0);
      top = c.top !== 'auto' ? originTop + px(c.top, originBottom - originTop) : originBottom - (parseFloat(style.borderBottomWidth) || 0) - (parseFloat(c.bottom) || 0) - height;
      if (c.transform !== 'none') { const m = new DOMMatrix(c.transform); left += m.m41; top += m.m42; }
    } else if (pseudo) { left = r.right - (parseFloat(style.paddingRight) || 0) - (parseFloat(style.borderRightWidth) || 0) - (parseFloat(c.marginRight) || 0) - width; top = r.top + r.height / 2 - height / 2; }
    const spreads = [...c.boxShadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g)].map((m) => Number(m[4]));
    const spread = Math.max(0, ...spreads);
    return { probeId: el.dataset.dotsNode || null, index: owner.dataset.index ?? null, text: el.textContent, depth: owner.dataset.depth || null, kept: owner.dataset.kept != null,
      content: c.content, display: c.display, visibility: c.visibility, opacity: c.opacity, background: c.backgroundColor, shadow: c.boxShadow,
      width, height, spread, outer: Math.min(width, height) + 2 * spread,
      left: left + scrollX, top: top + scrollY, right: left + width + scrollX, bottom: top + height + scrollY,
      fragments: fragments.map((box) => ({ left: box.left + scrollX, top: box.top + scrollY, right: box.right + scrollX, bottom: box.bottom + scrollY })),
      cssGeometry: { left: c.left, right: c.right, fontSize: c.fontSize, top: c.top, bottom: c.bottom, transform: c.transform, position: c.position }, html: el.outerHTML.slice(0, 700),
      className: owner.className, parentOpacity: getComputedStyle(owner).opacity,
      host: { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }, readerPaper: getComputedStyle(document.querySelector('#reader') || document.body).getPropertyValue('--reader-paper') };
  });
    const glyphs = [];
    const roots = [...new Set(elements.map((el) => el.matches('.japanese-lookup-word') && el.closest('#sheet, .reader-card')).filter(Boolean))];
    if (roots.length) {
      // Each containing prose block includes ordinary Japanese, English,
      // punctuation and ruby. Lookup spans are owners, never the glyph census.
      const blocks = new Set(roots.flatMap((root) => root.matches('.reader-card') ? [root] : [...root.querySelectorAll('.japanese-lookup-word')].map((el) => {
        let block = el.parentElement;
        while (block && block !== root && getComputedStyle(block).display === 'inline') block = block.parentElement;
        return block;
      })).filter(Boolean));
      const seen = new Set();
      for (const block of blocks) {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT); let text;
        while ((text = walker.nextNode())) {
          if (seen.has(text)) continue; seen.add(text);
          const parent = text.parentElement, owner = parent.closest('.japanese-lookup-word');
          const lane = block.matches('.reader-card') ? [...block.children].find((child) => child.contains(parent)) || block : block;
          const folded = parent.closest('details:not([open])');
          if (parent.closest('[hidden]') || (folded && !folded.querySelector(':scope > summary')?.contains(parent))) continue;
          const style = getComputedStyle(parent);
          if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
          for (let i = 0; i < text.length; i++) { if (!text.textContent[i].trim()) continue; const range = document.createRange(); range.setStart(text, i); range.setEnd(text, i + 1); for (const r of range.getClientRects()) if (r.width && r.height) glyphs.push({ owner: owner?.dataset.dotsNode || null, text: text.textContent[i], rt: !!parent.closest('rt'), block: lane.className || lane.tagName, left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY }); }
        }
      }
    }
    return { dots, frame: { at: performance.now(), scrollX, scrollY, glyphs } };
  }, pseudo).then(({ dots, frame }) => { dots.captureFrame = frame; return dots; });
}
async function capture(page, out, name, selector, pseudo = true, confirm = true) {
  await delay(180);
  const captureId = randomUUID();
  await page.locator(selector).evaluateAll((els, id) => { els.forEach((el, i) => { el.dataset.dotsCapture = id; el.dataset.dotsNode ||= `${id}-${i}`; }); }, captureId);
  const factSelector = `[data-dots-capture="${captureId}"]`;
  const f = await facts(page, factSelector, pseudo);
  assert(f.length, `No real ${name} dot targets`);
  out.captureFrames ||= {}; out.captureFrames[name] = f.captureFrame;
  for (const d of f) d.captureFrame = name;
  const beforeGeometry = JSON.stringify(f.map((x) => [x.host, x.left, x.top]));
  const fullPage = name === 'reader';
  const offset = fullPage ? { x: 0, y: 0 } : await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const shownBytes = await page.screenshot({ path: resolve(evidence, `${out.engine}-${out.world}-${name}.png`), fullPage, animations: 'allow' });
  const css = await page.addStyleTag({ content: hideCss });
  const hiddenBytes = await page.screenshot({ path: resolve(evidence, `${out.engine}-${out.world}-${name}-paper.png`), fullPage, animations: 'allow' });
  const hiddenFacts = await facts(page, factSelector, pseudo);
  await css.evaluate((s) => s.remove());
  assert.equal(beforeGeometry, JSON.stringify(hiddenFacts.map((x) => [x.host, x.left, x.top])), 'Hiding only paint changed geometry');
  const shown = png(shownBytes), hidden = png(hiddenBytes), dpr = await page.evaluate(() => devicePixelRatio);
  assert(shown.width === hidden.width && shown.height === hidden.height, 'Screenshot dimensions changed');
  for (const dot of f) {
    const cx = (dot.left + dot.right) / 2 - offset.x, cy = (dot.top + dot.bottom) / 2 - offset.y, radius = Math.min(dot.width, dot.height) / 2;
    const fill = [], papers = [], ring = [], ringPapers = [], changed = [], fillChanged = [];
    const loX = Math.max(0, Math.floor((dot.left - offset.x - dot.spread - 1) * dpr)), hiX = Math.min(shown.width, Math.ceil((dot.right - offset.x + dot.spread + 1) * dpr));
    const loY = Math.max(0, Math.floor((dot.top - offset.y - dot.spread - 1) * dpr)), hiY = Math.min(shown.height, Math.ceil((dot.bottom - offset.y + dot.spread + 1) * dpr));
    for (let y = loY; y < hiY; y++) for (let x = loX; x < hiX; x++) {
      const a = pix(shown, x, y), b = pix(hidden, x, y), distance = Math.hypot((x + 0.5) / dpr - cx, (y + 0.5) / dpr - cy);
      if (Math.max(...a.map((v, i) => Math.abs(v - b[i]))) > 3) { changed.push([x, y]); if (distance <= radius - 0.25) fillChanged.push([x, y]); }
      if (distance <= Math.max(0.6, radius - 1)) { fill.push(a); papers.push(b); }
      if (dot.kept && distance >= radius + Math.max(0, dot.spread - 1) && distance <= radius + dot.spread - 0.25) { ring.push(a); ringPapers.push(b); }
    }
    dot.raster = { screenshot: `${out.engine}-${out.world}-${name}.png`, fullPage, offset, fillChangedPixels: fillChanged.length,
      fillPaintedWidth: fillChanged.length ? (Math.max(...fillChanged.map((p) => p[0])) - Math.min(...fillChanged.map((p) => p[0])) + 1) / dpr : 0,
      fillPaintedHeight: fillChanged.length ? (Math.max(...fillChanged.map((p) => p[1])) - Math.min(...fillChanged.map((p) => p[1])) + 1) / dpr : 0,
      fillPaintedAreaCssPx2: fillChanged.length / (dpr * dpr), changedPixels: changed.length, fill: median(fill), paper: median(papers), ring: median(ring), ringPaper: median(ringPapers),
      paintedWidth: changed.length ? (Math.max(...changed.map((p) => p[0])) - Math.min(...changed.map((p) => p[0])) + 1) / dpr : 0,
      paintedHeight: changed.length ? (Math.max(...changed.map((p) => p[1])) - Math.min(...changed.map((p) => p[1])) + 1) / dpr : 0 };
    dot.raster.fillContrast = dot.raster.fill && dot.raster.paper ? contrast(dot.raster.fill, dot.raster.paper) : null;
    dot.raster.ringContrast = dot.raster.ring && dot.raster.ringPaper ? contrast(dot.raster.ring, dot.raster.ringPaper) : null;
  }
  if (confirm) {
    // Full-page captures can contain the fixed footer over an offscreen word.
    // Recheck zero-paint targets with that occurrence centered in the viewport;
    // preserve the first observation and its image, never call occlusion a kill.
    for (let i = 0; i < f.length; i++) if (f[i].raster.changedPixels < 4 || (f[i].depth && f[i].depth !== 'unmet' && f[i].raster.fillPaintedAreaCssPx2 < 18)) {
      const marker = `${name}-${i}`;
      await page.locator(selector).nth(i).evaluate((el, marker) => { el.dataset.dotsMeasure = marker; el.scrollIntoView({ block: 'center', inline: 'nearest' }); }, marker);
      const target = `[data-dots-measure="${marker}"]`;
      await delay(220);
      const [confirmed] = await capture(page, out, `${name}-centered-${i}`, target, pseudo, false);
      confirmed.initialFullPageObservation = f[i];
      confirmed.measurementCapture = `${name}-centered-${i}`;
      f[i] = confirmed;
    }
  }
  out.measurements[name] = f;
  save();
  return f;
}
function checkPaint(out, name, dots) {
  const active = dots.filter((d) => d.depth || d.kept);
  row(out, `${name}.nonempty`, active.length > 0 && active.every((d) => d.raster.changedPixels >= 4 && d.display !== 'none' && d.visibility !== 'hidden'), active.map((d) => ({ index: d.index, depth: d.depth, changed: d.raster.changedPixels })));
  row(out, `${name}.size`, active.every((d) => (d.depth === 'unmet' || !d.depth || (Math.min(d.width, d.height) >= 6 && d.raster.fillPaintedWidth >= 5 && d.raster.fillPaintedHeight >= 5 && d.raster.fillPaintedAreaCssPx2 >= 18)) && (!d.kept || (d.outer >= 10 && Math.min(d.raster.paintedWidth, d.raster.paintedHeight) >= 9))), active.map((d) => ({ index: d.index, width: d.width, outer: d.outer, raster: [d.raster.paintedWidth, d.raster.paintedHeight] })));
  row(out, `${name}.contrast`, active.every((d) => (!['owned', 'recalled'].includes(d.depth) || d.raster.fillContrast >= 3) && (!['met', 'again'].includes(d.depth) || d.raster.fillContrast >= 1.5) && (!d.kept || d.raster.ringContrast >= 3)), active.map((d) => ({ index: d.index, depth: d.depth, fill: d.raster.fillContrast, ring: d.raster.ringContrast })));
}
/** Enumerate the native surface before looking at painter output. A deleted
 * data-depth/data-kept attribute cannot delete its obligation from this census. */
async function surfaceCapture(page, out, name, selector, pseudo = true) {
  const censusId = randomUUID();
  const census = await page.locator(selector).evaluateAll((els, censusId) => els.map((el, i) => {
    const owner = el.matches('.mini-word') ? el.closest('#mini') : el;
    el.dataset.dotsNode ||= `${censusId}-${i}`;
    let node = null, exclusion = null;
    if (owner.dataset.depthNode) {
      try { node = { t: 'word', ...JSON.parse(owner.dataset.depthNode) }; } catch { exclusion = 'invalid native identity'; }
    } else if (el.matches('.japanese-lookup-word')) {
      if (el.closest('.headword')) exclusion = 'headword: basis line owns the dot';
      else {
        const candidate = { t: 'word', id: el.dataset.lookupText };
        const identity = window.__KAIRO_DEPTH__.identity(candidate);
        if (/[\p{Script=Han}\p{Script=Katakana}]/u.test(candidate.id) || identity?.kind === 'core') node = candidate;
        else exclusion = 'outside Japanese word painter eligibility';
      }
    }
    if (!node && !exclusion && el.matches('.today-star.glyph') && [...el.textContent.trim()].length === 1) exclusion = 'native Today kanji glyph: not a word';
    if (!node && !exclusion) exclusion = 'invalid native identity';
    const expected = node ? window.__KAIRO_DEPTH__.depth(node) : null;
    const folded = el.closest('details:not([open])');
    const notRendered = el.closest('[hidden]') ? 'native hidden ancestor' : folded && !folded.querySelector(':scope > summary')?.contains(el) ? 'closed native details body' : null;
    const active = Boolean(!notRendered && expected && (expected.depth !== 'unmet' || expected.kept));
    if (active) el.dataset.dotsExpected = censusId;
    return { probeId: el.dataset.dotsNode, text: el.textContent, className: el.className, node, exclusion, notRendered, expectedDepth: expected?.depth || null, expectedKept: expected?.kept || false, active, actualDepth: owner.dataset.depth || null, actualKept: owner.dataset.kept != null };
  }), censusId);
  out.nativeCensus ||= {}; out.nativeCensus[name] = census;
  const active = census.filter((r) => r.active);
  row(out, `${name}.native-painter-census`, active.length > 0 && census.every((r) => r.exclusion !== 'invalid native identity') && active.every((r) => r.expectedDepth === r.actualDepth && r.expectedKept === r.actualKept), census);
  // Empty eligible scope is a recorded failure, not a silent or setup pass.
  const dots = active.length ? await capture(page, out, name, `[data-dots-expected="${censusId}"]`, pseudo) : [];
  row(out, `${name}.all-expected-painted`, active.length > 0 && active.every((r) => dots.some((d) => d.probeId === r.probeId && d.raster.changedPixels >= 4)), { expected: active.map((r) => r.probeId), observed: dots.map((d) => ({ probeId: d.probeId, changedPixels: d.raster.changedPixels })) });
  return dots;
}
function semanticFamily(out, family, samples) {
  const met = samples.filter((d) => d.depth === 'met' && d.raster.fill);
  const known = samples.filter((d) => ['owned', 'recalled'].includes(d.depth) && d.raster.fill);
  const saved = samples.filter((d) => d.kept && d.raster.ring);
  const pairs = { metKnown: met.flatMap((a) => known.map((b) => delta(a.raster.fill, b.raster.fill))), metSaved: met.flatMap((a) => saved.map((b) => delta(a.raster.fill, b.raster.ring))), knownSaved: known.flatMap((a) => saved.map((b) => delta(a.raster.fill, b.raster.ring))) };
  const coverage = { met: met.length, known: known.length, saved: saved.length, knownStates: [...new Set(known.map((d) => d.depth))], unavailable: ['met', 'known', 'saved'].filter((k) => !({ met, known, saved })[k].length) };
  out.semanticCoverage ||= {}; out.semanticCoverage[family] = coverage;
  row(out, `${family}.semantic-separation`, !coverage.unavailable.length && Object.values(pairs).every((values) => values.length && values.every((v) => v >= 10)) && met.every((a) => known.every((b) => a.raster.fillContrast < b.raster.fillContrast)), { coverage, minimumDeltaE76: Object.fromEntries(Object.entries(pairs).map(([key, values]) => [key, values.length ? Math.min(...values) : null])), metContrast: met.map((d) => d.raster.fillContrast), knownContrast: known.map((d) => d.raster.fillContrast) });
}
async function worldBinding(page, out, phase) {
  const actual = await page.evaluate(() => ({ stored: localStorage.getItem('kairo-theme'), rendered: document.documentElement.dataset.theme ?? null, inlineScheme: document.documentElement.style.colorScheme, computedScheme: getComputedStyle(document.documentElement).colorScheme, metaScheme: document.querySelector('meta[name="color-scheme"]')?.content || null }));
  const expectedTheme = out.world === 'hokusai' ? '' : out.world;
  const expectedScheme = ['rokusho', 'yoru', 'nami', 'hakuu', 'kaku'].includes(out.world) ? 'dark' : 'light';
  row(out, `world.${phase}`, actual.stored === out.world && actual.rendered === expectedTheme && actual.inlineScheme === expectedScheme && actual.computedScheme === expectedScheme && actual.metaScheme === expectedScheme, { requested: out.world, expectedTheme, expectedScheme, ...actual });
}
async function ladderContract(page, out) {
  const target = page.locator(`#reader .tok[data-index="${PARA.owned}"]`);
  await target.scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => Math.round(scrollY));
  await waitForAppRecord(page, (value) => value.readerPos?.[STORY] === position, { description: 'the real prior scroll is durably saved before the attribute-only contract' });
  await delay(100);
  const beforeRecord = JSON.stringify((await readAppRecordSnapshot(page)).record);
  const before = await facts(page, '#reader .tok:is([data-depth],[data-kept]) > .tok-word');
  const beforeImage = png(await page.screenshot({ path: resolve(evidence, `${out.engine}-${out.world}-hook-before.png`) }));
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY, dpr: devicePixelRatio }));
  await target.evaluate((e) => { e.dataset.depthAside = 'meaning'; }); await delay(100);
  const during = await facts(page, '#reader .tok:is([data-depth],[data-kept]) > .tok-word');
  const duringImage = png(await page.screenshot({ path: resolve(evidence, `${out.engine}-${out.world}-hook-meaning.png`) }));
  await target.evaluate((e) => { delete e.dataset.depthAside; }); await delay(100);
  const after = await facts(page, '#reader .tok:is([data-depth],[data-kept]) > .tok-word');
  const afterImage = png(await page.screenshot({ path: resolve(evidence, `${out.engine}-${out.world}-hook-restored.png`) }));
  const afterRecord = JSON.stringify((await readAppRecordSnapshot(page)).record);
  const isHidden = (d) => d.visibility === 'hidden' || d.display === 'none' || Number(d.opacity) === 0 || ['none', 'normal'].includes(d.content);
  const at = before.findIndex((d) => d.index === String(PARA.owned));
  let withinChanged = 0, outsideChanged = 0, unrestored = 0;
  assert(beforeImage.width === duringImage.width && beforeImage.height === duringImage.height && beforeImage.width === afterImage.width && beforeImage.height === afterImage.height, 'Ladder screenshots retain dimensions');
  const box = before[at]; assert(box, 'Owned target occurrence exists');
  for (let y = 0; y < beforeImage.height; y++) for (let x = 0; x < beforeImage.width; x++) {
    const i = (y * beforeImage.width + x) * 3;
    const changed = [0, 1, 2].some((k) => Math.abs(beforeImage.pixels[i + k] - duringImage.pixels[i + k]) > 3);
    const inside = x / scroll.dpr >= box.left - scroll.x - box.spread - 1 && x / scroll.dpr <= box.right - scroll.x + box.spread + 1 && y / scroll.dpr >= box.top - scroll.y - box.spread - 1 && y / scroll.dpr <= box.bottom - scroll.y + box.spread + 1;
    if (changed) { if (inside) withinChanged++; else outsideChanged++; }
    if ([0, 1, 2].some((k) => Math.abs(beforeImage.pixels[i + k] - afterImage.pixels[i + k]) > 3)) unrestored++;
  }
  row(out, 'ladder.actual-painted-scope', withinChanged >= 4 && outsideChanged === 0 && unrestored === 0, { withinChanged, outsideChanged, unrestored, scroll, box });
  row(out, 'ladder.target-only', at >= 0 && !isHidden(before[at]) && isHidden(during[at]) && !isHidden(after[at]) && during.every((d, i) => i === at || JSON.stringify(d) === JSON.stringify(before[i])), { before: before[at], during: during[at], after: after[at] });
  row(out, 'ladder.no-geometry-or-record-change', beforeRecord === afterRecord && JSON.stringify(before.map((d) => d.host)) === JSON.stringify(during.map((d) => d.host)) && JSON.stringify(before) === JSON.stringify(after), { recordBefore: hash(beforeRecord), recordAfter: hash(afterRecord), changedKeys: [...new Set([...Object.keys(JSON.parse(beforeRecord)), ...Object.keys(JSON.parse(afterRecord))])].filter((key) => JSON.stringify(JSON.parse(beforeRecord)[key]) !== JSON.stringify(JSON.parse(afterRecord)[key])).map((key) => ({ key, before: JSON.parse(beforeRecord)[key], after: JSON.parse(afterRecord)[key] })) });
}
function lineGeometry(out, name, dots) {
  row(out, `${name}.fragment-alignment`, dots.every((d) => d.fragments.some((f) => (d.left + d.right) / 2 >= f.left - 0.5 && (d.left + d.right) / 2 <= f.right + 0.5 && (d.top + d.bottom) / 2 >= f.bottom - 2 && (d.top + d.bottom) / 2 <= f.bottom + 12)), dots.map((d) => ({ text: d.text, dot: [d.left, d.top, d.right, d.bottom], fragments: d.fragments, cssGeometry: d.cssGeometry })));
  const clashes = dots.flatMap((d) => out.captureFrames[d.captureFrame].glyphs.filter((g) => g.owner !== d.probeId && d.left - d.spread < g.right && d.right + d.spread > g.left && d.top - d.spread < g.bottom && d.bottom + d.spread > g.top).map((g) => ({ captureFrame: d.captureFrame, dot: d.text, dotBox: [d.left - d.spread, d.top - d.spread, d.right + d.spread, d.bottom + d.spread], host: d.host, fragments: d.fragments, cssGeometry: d.cssGeometry, glyph: g })));
  row(out, `${name}.no-other-glyph-overlap`, clashes.length === 0, clashes);
}
/** The reader's title words sit on the raised title card, not the reader's
 * paper. The native fixture's saved and reviewed words hold state there too.
 * Every visible glyph on the card, the English caption included, is text a
 * title dot must not overlap. */
async function titleCard(page, out) {
  const heading = page.locator('.reader-card h1.view-title');
  if (await heading.count()) { await heading.first().evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })); await delay(250); }
  const title = await surfaceCapture(page, out, 'title', '.reader-card .japanese-lookup-word[data-lookup-text]');
  checkPaint(out, 'title', title);
  lineGeometry(out, 'title', title);
  const census = out.captureFrames?.title?.glyphs || [];
  const captionCharacters = (await page.locator('.reader-card > .view-title-en').allTextContents()).join('').replace(/\s/gu, '').length;
  const captionGlyphs = census.filter((g) => String(g.block).split(/\s+/).includes('view-title-en')).length;
  out.titleCoverage = { words: title.map((d) => ({ text: d.text, depth: d.depth, kept: d.kept, fragments: d.fragments.length, wrapped: d.fragments.length > 1 })),
    glyphCensus: census.reduce((lanes, g) => ({ ...lanes, [g.block]: (lanes[g.block] || 0) + 1 }), {}), captionCharacters, captionGlyphs };
  row(out, 'title.card-glyph-census', census.length > 0 && captionGlyphs === captionCharacters, out.titleCoverage);
  row(out, 'title.fixture-states', title.some((d) => ['met', 'again', 'recalled', 'owned'].includes(d.depth)) && title.some((d) => d.kept), out.titleCoverage);
  const nihon = (out.nativeCensus?.title || []).find((r) => r.text === '日本');
  const nihonKind = await page.evaluate(() => window.__KAIRO_DEPTH__.identity({ t: 'word', id: '日本' })?.kind ?? null);
  row(out, 'title.native-nihon', nihonKind === 'core' && nihon?.active === true && nihon.expectedDepth === 'met' && nihon.expectedKept && nihon.actualDepth === 'met' && nihon.actualKept, { kind: nihonKind, census: nihon || null });
  if (out.engine === 'webkit') {
    const first = title.find((d) => d.text === '日本'), second = title.find((d) => d.text === '大賞');
    const a = first?.fragments.at(-1), b = second?.fragments[0];
    const distinct = Boolean(a && b) && b.top - a.top > (a.bottom - a.top) / 2 && a.top <= Math.min(...title.flatMap((d) => d.fragments.map((f) => f.top))) + 0.5;
    const underRing = distinct ? out.captureFrames[first.captureFrame].glyphs.filter((g) => g.owner !== first.probeId && Math.abs(g.top - b.top) <= 1 && g.left < first.right + first.spread && g.right > first.left - first.spread) : [];
    row(out, 'title.first-line-ring', distinct && first.kept && underRing.length > 0, { first: first && { fragments: first.fragments, dot: [first.left, first.top, first.right, first.bottom], spread: first.spread, kept: first.kept }, second: second && { fragments: second.fragments }, underRing });
  }
  const fresh = out.freshTitle, stateful = await titleLayout(page);
  row(out, 'title.same-rhythm-fresh-and-stateful', fresh?.titleWords > 0 && stateless(fresh) && stateful?.words.some((w) => w.title && w.painted) && sameRhythm(fresh, stateful),
    { law: 'lead 1940: a title holding lookup words reserves its line space before any state', fresh, stateful });
}
/** A real context line (aozora:000772-1) under the title: its word holds
 * native met+saved history while no title word does. Its dot is measured like
 * every other card dot, and the title keeps its fresh layout. */
async function contextCard(page, out) {
  await story(page, CONTEXT_STORY, '私の個人主義');
  const fresh = await titleLayout(page);
  const word = await page.evaluate(() => { const node = { t: 'word', id: '講演' }; return { present: Boolean(document.querySelector('.reader-card .reader-context .japanese-lookup-word[data-lookup-text="講演"]')), key: window.__KAIRO_DEPTH__.key(node), kind: window.__KAIRO_DEPTH__.identity(node)?.kind ?? null }; });
  assert(word.present && word.kind === 'core', `Native context word 講演: ${JSON.stringify(word)}`);
  const today = await page.evaluate(() => window.__KAIRO_DEPTH__.day()), now = Date.now();
  const value = (await readAppRecordSnapshot(page)).record;
  value.met = { version: 1, entries: { ...(value.met?.entries || {}), [word.key]: { first: today, last: today, days: 1 } } };
  value.taken = [...(value.taken || []), savedWord('講演', now)];
  await commitRecord(page, value, 'context');
  await story(page, CONTEXT_STORY, '私の個人主義');
  await page.waitForFunction(() => document.querySelector('.reader-card .reader-context .japanese-lookup-word[data-lookup-text="講演"][data-depth]'));
  const contextOnly = await titleLayout(page);
  row(out, 'context.title-unchanged', fresh?.titleWords > 0 && stateless(fresh) && stateless(contextOnly, (w) => w.title) && contextOnly?.words.some((w) => !w.title && w.text === '講演' && w.painted) && sameRhythm(fresh, contextOnly), { fresh, contextOnly });
  await page.locator('.reader-card').evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })); await delay(250);
  const card = await surfaceCapture(page, out, 'context', '.reader-card .japanese-lookup-word[data-lookup-text]');
  checkPaint(out, 'context', card);
  lineGeometry(out, 'context', card);
  const kouen = (out.nativeCensus?.context || []).find((r) => r.text === '講演');
  row(out, 'context.native-kouen', kouen?.active === true && kouen.expectedDepth === 'met' && kouen.expectedKept && kouen.actualDepth === 'met' && kouen.actualKept && card.some((d) => d.probeId === kouen.probeId && d.raster.changedPixels >= 4), { kind: word.kind, census: kouen || null });
}
/** Lead 1940/1950: on a fresh native profile, the first input on a title word
 * shows its reading without an encounter, the second opens its stage and
 * records the first state. The same Japanese base characters (rt excluded)
 * stay within 1 CSS px through both inputs, the title keeps its BEFORE height
 * and rhythm exactly, the word stays visible and owns its hit, the page does
 * not scroll, and the open slip sits at its authored gap from the word and its
 * reading (rt included). The whole lookup element box is telemetry only. */
const SLIP_GAP = 10;
async function settledRecord(page, { quietMs = 750, timeout = 8000 } = {}) {
  const started = Date.now(), reads = [];
  let snapshot = await readAppRecordSnapshot(page), since = Date.now();
  reads.push({ atMs: 0, revision: snapshot.revision });
  while (Date.now() - started < timeout) {
    await delay(50);
    const next = await readAppRecordSnapshot(page);
    if (next.revision !== snapshot.revision) { snapshot = next; since = Date.now(); reads.push({ atMs: Date.now() - started, revision: next.revision }); }
    else if (Date.now() - since >= quietMs) return { snapshot, settled: true, quietMs, waitedMs: Date.now() - started, reads };
  }
  return { snapshot, settled: false, quietMs, waitedMs: Date.now() - started, reads };
}
/** Native met+saved history for one title word, committed before the live inputs begin. */
async function seedPrior(page, { id, query, prior, archiveYear }) {
  await story(page, id, query, archiveYear);
  const node = await page.evaluate((word) => { const node = { t: 'word', id: word }; return { key: window.__KAIRO_DEPTH__.key(node), kind: window.__KAIRO_DEPTH__.identity(node)?.kind ?? null }; }, prior);
  assert.equal(node.kind, 'core', `Native title ${prior} identity is core`);
  const today = await page.evaluate(() => window.__KAIRO_DEPTH__.day()), now = Date.now();
  const value = (await readAppRecordSnapshot(page)).record;
  value.met = { version: 1, entries: { ...(value.met?.entries || {}), [node.key]: { first: today, last: today, days: 1 } } };
  value.taken = [...(value.taken || []), savedWord(prior, now)];
  await commitRecord(page, value, 'prior');
  const door = await story(page, id, query, archiveYear);
  await page.waitForFunction((word) => document.querySelector(`.reader-card > h1.view-title .japanese-lookup-word[data-lookup-text="${word}"][data-depth="met"][data-kept]`), prior);
  return { ...node, door };
}
const TITLE_DOTS = '.reader-card > h1.view-title .japanese-lookup-word:is([data-depth],[data-kept])';
/** One live frame of the title's stateful dots against the whole card: every visible character box (title, its shown
 * readings, caption, context and instrument lines) by the common title law, and, when asked, the actual raster: ring
 * pixels (shown vs dots hidden) never on text ink (dots hidden vs card text transparent), its own word's glyphs included. */
/** The saved occurrence named by the fixture, independent of what TITLE_DOTS happens to match: exactly one title
 * occurrence of the word, painted met and kept, with visible pixels in its ring band (beyond the fill and its gap). */
const savedOccurrenceVerdict = (occurrences, ink) => {
  const entry = occurrences.length === 1 ? ink.find((d) => d.probeId === occurrences[0]) : null;
  return { occurrences, entry: entry || null, passed: Boolean(entry && entry.depth === 'met' && entry.kept && entry.painted >= 4 && entry.ringPainted >= 4) };
};
/** Verifier-only witness of the app's room transitions (corridor.js enterRoomTransition / startViewTransition): each new
 * html[data-room-transition] and each native view transition is counted; the app's behaviour and timing are untouched. */
function sceneObserver() {
  const scene = window.__dotsScene = { generation: 0, viewTransitions: 0, activeViewTransitions: 0 };
  const watch = () => new MutationObserver((records) => { for (const r of records) if (r.attributeName === 'data-room-transition' && r.oldValue === null && document.documentElement.hasAttribute('data-room-transition')) scene.generation++; })
    .observe(document.documentElement, { attributes: true, attributeOldValue: true, attributeFilter: ['data-room-transition'] });
  if (document.documentElement) watch(); else document.addEventListener('readystatechange', watch, { once: true });
  const start = Document.prototype.startViewTransition;
  if (start) Document.prototype.startViewTransition = function (...args) { const t = start.apply(this, args); scene.viewTransitions++; scene.activeViewTransitions++; const done = () => { scene.activeViewTransitions--; }; t.finished.then(done, done); return t; };
}
const sceneState = (page) => page.evaluate(() => {
  const html = document.documentElement, main = document.querySelector('#app > main'), s = window.__dotsScene || null;
  const room = document.getAnimations().filter((a) => String(a.animationName || '').startsWith('kairo-room') || String(a.effect?.pseudoElement || '').startsWith('::view-transition'))
    .filter((a) => a.pending || a.playState !== 'finished').map((a) => ({ name: a.animationName || null, pseudo: a.effect?.pseudoElement || null, state: a.playState, pending: a.pending }));
  return { observer: Boolean(s), generation: s?.generation ?? null, viewTransitions: s?.viewTransitions ?? null, activeViewTransitions: s?.activeViewTransitions ?? null,
    transition: html.hasAttribute('data-room-transition'), hero: html.hasAttribute('data-room-hero'), arrival: Boolean(main?.hasAttribute('data-room-arrival')),
    mainOpacity: main ? getComputedStyle(main).opacity : null, room, view: document.body.dataset.view || null, mainBound: Boolean(main && window.__dotsSceneMain === main) };
});
/** A capture may begin only on the settled reader: no room transition, hero or arrival marker, the main room opaque, no
 * room or view-transition animation pending or unfinished; once bound, the same main element and transition counts. */
const settledScene = (state, bound = null) => Boolean(state?.observer && !state.transition && !state.hero && !state.arrival && state.mainOpacity === '1' && state.activeViewTransitions === 0 &&
  Array.isArray(state.room) && state.room.length === 0 && state.view === 'reader' && (!bound || (state.mainBound && state.generation === bound.generation && state.viewTransitions === bound.viewTransitions)));
async function bindScene(page, { timeout = 15000 } = {}) {
  const started = Date.now(); let state = await sceneState(page);
  while (!settledScene(state) && Date.now() - started < timeout) { await delay(50); state = await sceneState(page); }
  if (!settledScene(state)) throw new Error(`Reader scene never settled: ${JSON.stringify(state)}`);
  await page.evaluate(() => { window.__dotsSceneMain = document.querySelector('#app > main'); return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))); });
  state = await sceneState(page);
  if (!settledScene(state) || !state.mainBound) throw new Error(`Reader scene changed while binding: ${JSON.stringify(state)}`);
  return state;
}
/** Decoded-pixel scene invariant for one differential batch: the painted and dots-hidden shots differ only within some
 * eligible dot's outer ring (+1 CSS px), and the restored shot, same styles as the first, equals it everywhere. */
function sceneStability({ shown, paper, restored }, circles, view) {
  const same = [paper, restored].filter(Boolean).every((im) => im.width === shown.width && im.height === shown.height);
  if (!same) return { stable: false, reason: 'screenshot size changed', outsideChanged: null, restoredChanged: null };
  const differs = (a, b, i) => Math.abs(a[i] - b[i]) > 3 || Math.abs(a[i + 1] - b[i + 1]) > 3 || Math.abs(a[i + 2] - b[i + 2]) > 3;
  let outsideChanged = 0, restoredChanged = 0, firstOutside = null;
  for (let y = 0; y < shown.height; y++) for (let x = 0; x < shown.width; x++) {
    const i = (y * shown.width + x) * 3;
    if (restored && differs(shown.pixels, restored.pixels, i)) restoredChanged++;
    if (!differs(shown.pixels, paper.pixels, i)) continue;
    const cx = (x + 0.5) / view.dpr + view.x, cy = (y + 0.5) / view.dpr + view.y;
    if (!circles.some((c) => Math.hypot(cx - c.x, cy - c.y) <= c.r)) { outsideChanged++; firstOutside ||= [cx, cy]; }
  }
  return { stable: outsideChanged === 0 && restoredChanged === 0 && Boolean(restored), outsideChanged, restoredChanged, restoredCompared: Boolean(restored), firstOutside };
}
const ALL_DOTS = '#reader .tok:is([data-depth],[data-kept]) > .tok-word, .japanese-lookup-word:is([data-depth],[data-kept]), #mini:is([data-depth],[data-kept]) .mini-word';
/** Each touched (hovered or focused) title word's native mark: its computed inset shadow's thickness at the foot of every
 * fragment. Geometry only; whether it is painted is read from the paper and bare pixels. */
const titleMarks = (page) => page.evaluate(() => [...document.querySelectorAll('.reader-card > h1.view-title .japanese-lookup-word')].flatMap((el) => {
  const shadow = getComputedStyle(el).boxShadow, hover = el.matches(':hover'), focusVisible = el.matches(':focus-visible');
  if (!(hover || focusVisible) || !/inset/.test(shadow)) return [];
  const [, offsetY = 0] = [...shadow.replace(/[a-z-]+\([^)]*\)/gi, '').matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
  const thickness = Math.abs(offsetY);
  return thickness > 0 ? [{ probeId: el.dataset.dotsNode || null, text: el.dataset.lookupText, hover, focusVisible, shadow, thickness,
    bands: [...el.getClientRects()].map((r) => ({ left: r.left + scrollX, right: r.right + scrollX, top: r.bottom + scrollY - thickness, bottom: r.bottom + scrollY })) }] : [];
}));
/** Every touched word's mark must be painted (ink in paper, gone in bare) and no dot may paint on any mark. A frame that names
 * its touched word needs exactly that word's mark and its own unoccluded dot: a saved word's ring painted, a met word's fill. */
const activeMarkVerdict = (marks, ink, expected = null) => {
  const named = expected ? marks.filter((m) => m.text === expected.text) : [];
  const dot = named.length === 1 ? ink.find((d) => d.probeId === named[0].probeId) || null : null;
  const own = !expected || Boolean(dot && named[0].markInk > 0 && dot.painted >= 4 && !dot.coveredBySlip && (dot.hits.mark ?? 0) === 0 &&
    (expected.kept ? dot.kept && dot.depth === 'met' && dot.ringPainted >= 4 : !dot.kept && dot.depth === 'met'));
  return { expected, marks: marks.map(({ bands: _, ...m }) => m), dot: dot && { probeId: dot.probeId, text: dot.text, depth: dot.depth, kept: dot.kept, painted: dot.painted, ringPainted: dot.ringPainted, coveredBySlip: dot.coveredBySlip, hits: dot.hits },
    passed: marks.every((m) => m.markInk > 0) && ink.every((d) => typeof d.hits.mark === 'number' && d.hits.mark === 0) && own };
};
const dotCircles = (dots) => dots.map((d) => ({ x: (d.left + d.right) / 2, y: (d.top + d.bottom) / 2, r: Math.min(d.width, d.height) / 2 + d.spread + 1, text: d.text }));
async function titleRingFrame(page, out, name, label, raster, prior, expectedActive = null) {
  const frame = `${name}-${label}`;
  await page.locator('.reader-card .japanese-lookup-word').evaluateAll((els, name) => els.forEach((el, i) => { el.dataset.dotsNode ||= `${name}-${i}`; }), name);
  const dots = await facts(page, TITLE_DOTS);
  out.captureFrames ||= {}; out.captureFrames[frame] = dots.captureFrame;
  for (const d of dots) d.captureFrame = frame;
  out.measurements[frame] = dots;
  lineGeometry(out, frame, dots);
  const slip = await page.evaluate((centres) => { const m = document.getElementById('mini'), s = m && getComputedStyle(m), r = m?.getBoundingClientRect();
    return m && s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 ? { left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY, onTop: centres.map(([x, y]) => Boolean(document.elementFromPoint(x - scrollX, y - scrollY)?.closest('#mini'))) } : null; },
  dots.map((d) => [(d.left + d.right) / 2, (d.top + d.bottom) / 2]));
  const covered = (d, i) => Boolean(slip && slip.onTop[i] && d.left - d.spread >= slip.left && d.top - d.spread >= slip.top && d.right + d.spread <= slip.right && d.bottom + d.spread <= slip.bottom);
  out.ringOcclusion ||= {}; out.ringOcclusion[frame] = { slip, raster, covered: dots.map((d, i) => ({ text: d.text, probeId: d.probeId, coveredBySlip: covered(d, i) })) };
  if (!raster) return dots;
  const circles = dotCircles([...await facts(page, ALL_DOTS), ...await facts(page, '.depth-dot:is([data-depth],[data-kept])', false)]);
  const marks = await titleMarks(page);
  const attempts = []; out.sceneAttempts ||= {}; out.sceneAttempts[frame] = attempts;
  let view, shown, paper, bare, again;
  for (let attempt = 1; ; attempt++) {
    const bound = await bindScene(page), states = [];
    view = await page.evaluate(() => ({ x: scrollX, y: scrollY, dpr: devicePixelRatio }));
    const shot = async (suffix) => { const image = png(await page.screenshot({ path: resolve(evidence, `${shotTag(out)}-${frame}${suffix}${attempt > 1 ? `-attempt${attempt}` : ''}.png`), animations: 'allow' })); states.push(await sceneState(page)); return image; };
    shown = await shot('');
    const noDots = await page.addStyleTag({ content: hideCss }); paper = await shot('-paper');
    const noText = await page.addStyleTag({ content: hideCardText + hideTitleMark }); bare = await shot('-bare');
    await noText.evaluate((s) => s.remove()); await noDots.evaluate((s) => s.remove());
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const restored = await shot('-restored');
    again = await facts(page, TITLE_DOTS);
    const scene = sceneStability({ shown, paper, restored }, circles, view), settled = states.every((state) => settledScene(state, bound));
    attempts.push({ attempt, bound: { generation: bound.generation, viewTransitions: bound.viewTransitions }, settled, ...(settled ? {} : { states }), ...scene });
    if (settled && scene.stable) break;
    save();
    if (attempt >= 3) throw new Error(`${frame}: no settled, stable raster scene in 3 attempts: ${JSON.stringify(attempts.map(({ states: _, ...a }) => a))}`);
  }
  row(out, `${frame}.scene-settled`, true, { attempts, circles: circles.length });
  const stable = JSON.stringify(again.map((d) => [d.probeId, d.host, d.left, d.top])) === JSON.stringify(dots.map((d) => [d.probeId, d.host, d.left, d.top])) && JSON.stringify(again.captureFrame.glyphs) === JSON.stringify(dots.captureFrame.glyphs);
  const differs = (a, b) => a.some((v, k) => Math.abs(v - b[k]) > 3);
  const onMark = (x, y) => { const l = x / view.dpr + view.x, t = y / view.dpr + view.y, r = l + 1 / view.dpr, b = t + 1 / view.dpr;
    return marks.some((m) => m.bands.some((band) => r > band.left && l < band.right && b > band.top && t < band.bottom)); };
  for (const m of marks) {
    m.markInk = 0;
    for (const band of m.bands)
      for (let y = Math.max(0, Math.floor((band.top - view.y) * view.dpr)); y < Math.min(shown.height, Math.ceil((band.bottom - view.y) * view.dpr)); y++)
        for (let x = Math.max(0, Math.floor((band.left - view.x) * view.dpr)); x < Math.min(shown.width, Math.ceil((band.right - view.x) * view.dpr)); x++) if (differs(pix(paper, x, y), pix(bare, x, y))) m.markInk++;
  }
  const ink = dots.map((d, i) => {
    const box = { left: d.left - d.spread - 1, top: d.top - d.spread - 1, right: d.right + d.spread + 1, bottom: d.bottom + d.spread + 1 }, hits = { own: 0, other: 0, reading: 0, mark: 0, unattributed: 0 };
    const centre = [(d.left + d.right) / 2, (d.top + d.bottom) / 2];
    let painted = 0, ringPainted = 0;
    for (let y = Math.max(0, Math.floor((box.top - view.y) * view.dpr)); y < Math.min(shown.height, Math.ceil((box.bottom - view.y) * view.dpr)); y++)
      for (let x = Math.max(0, Math.floor((box.left - view.x) * view.dpr)); x < Math.min(shown.width, Math.ceil((box.right - view.x) * view.dpr)); x++) {
        const behind = pix(paper, x, y);
        if (!differs(pix(shown, x, y), behind)) continue;
        painted++;
        const cx = (x + 0.5) / view.dpr + view.x, cy = (y + 0.5) / view.dpr + view.y;
        if (Math.hypot(cx - centre[0], cy - centre[1]) > d.width / 2 + 0.5) ringPainted++;
        if (!differs(behind, pix(bare, x, y))) continue;
        if (onMark(x, y)) { hits.mark++; continue; }
        const glyph = dots.captureFrame.glyphs.find((g) => cx >= g.left && cx <= g.right && cy >= g.top && cy <= g.bottom);
        hits[!glyph ? 'unattributed' : glyph.rt ? 'reading' : glyph.owner === d.probeId ? 'own' : 'other']++;
      }
    return { probeId: d.probeId, text: d.text, depth: d.depth, kept: d.kept, box, painted, ringPainted, coveredBySlip: covered(d, i), hits };
  });
  row(out, `${frame}.ring-clear-of-ink`, stable && ink.length > 0 && ink.every((d) => d.painted >= 4 && Object.values(d.hits).every((n) => n === 0)), { stable, view, slip, ink });
  if (prior) {
    const occurrences = await page.locator(`.reader-card > h1.view-title .japanese-lookup-word[data-lookup-text="${prior}"]`).evaluateAll((els) => els.map((el) => el.dataset.dotsNode));
    row(out, `${frame}.saved-occurrence`, savedOccurrenceVerdict(occurrences, ink).passed, { saved: prior, ...savedOccurrenceVerdict(occurrences, ink) });
  }
  const markVerdict = activeMarkVerdict(marks, ink, expectedActive);
  row(out, `${frame}.active-mark`, stable && markVerdict.passed, { stable, category: 'native box-shadow mark, not a font glyph', ...markVerdict });
  dots.ink = ink; dots.marks = marks;
  return dots;
}
async function liveFirstState(page, out, { name, id, query, word, prior, archiveYear, nextLineOn = [], uncover = false }) {
  const priorNode = prior ? await seedPrior(page, { id, query, prior, archiveYear }) : null;
  const door = prior ? priorNode.door : await story(page, id, query, archiveYear);
  const nextLineRequired = nextLineOn.includes(`${out.engine}/${out.size}`);
  await page.locator('.reader-card').evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })); await delay(250);
  const selector = `.reader-card > h1.view-title .japanese-lookup-word[data-lookup-text="${word}"]`, target = page.locator(selector).first();
  const native = await page.evaluate((word) => { const node = { t: 'word', id: word }; return { key: window.__KAIRO_DEPTH__.key(node), kind: window.__KAIRO_DEPTH__.identity(node)?.kind ?? null }; }, word);
  const openedStory = await page.evaluate(() => ({ listen: [...document.querySelectorAll('#app > main .listen-row[data-passage]')].map((el) => el.dataset.passage), places: [...document.querySelectorAll('#record-reading-places[data-source-id]')].map((el) => el.dataset.sourceId) }));
  const lines = await page.evaluate(() => [...document.querySelectorAll('.reader-card > h1.view-title .japanese-lookup-word')].map((w) => { const rects = [...w.getClientRects()], r = rects[0]; return { text: w.dataset.lookupText, top: r?.top ?? null, bottom: r?.bottom ?? null, fragments: rects.map((f) => ({ top: f.top, bottom: f.bottom })) }; }));
  const lineTops = [];
  for (const f of lines.flatMap((l) => l.fragments).sort((a, b) => a.top - b.top)) if (!lineTops.length || f.top - lineTops.at(-1) > (f.bottom - f.top) / 2) lineTops.push(f.top);
  const lineOf = (f) => (f ? lineTops.findIndex((top) => Math.abs(f.top - top) <= (f.bottom - f.top) / 2) : -1);
  const priorLine = prior ? lineOf(lines.find((l) => l.text === prior)?.fragments.at(-1)) : -1, targetLine = lineOf(lines.find((l) => l.text === word)?.fragments[0]);
  const adjacent = priorLine >= 0 && targetLine === priorLine + 1, layout = { size: out.size, lineTops, priorLine, targetLine, adjacent, nextLineRequired };
  const sample = (label) => page.evaluate(async ({ selector, label }) => {
    await document.fonts.ready;
    const el = document.querySelector(selector);
    const plain = (b) => ({ x: b.x, y: b.y, width: b.width, height: b.height });
    const h1 = el.closest('h1.view-title'), heading = getComputedStyle(h1), r = el.getBoundingClientRect(), base = [], all = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let text;
    while ((text = walker.nextNode())) {
      const reading = Boolean(text.parentElement.closest('rt, rp'));
      for (let i = 0; i < text.length; i++) {
        if (!text.textContent[i].trim()) continue;
        const range = document.createRange(); range.setStart(text, i); range.setEnd(text, i + 1);
        for (const b of range.getClientRects()) if (b.width && b.height) { const g = { char: text.textContent[i], left: b.left, top: b.top, right: b.right, bottom: b.bottom }; all.push(g); if (!reading) base.push(g); }
      }
    }
    const union = (gs) => (gs.length ? { left: Math.min(...gs.map((g) => g.left)), top: Math.min(...gs.map((g) => g.top)), right: Math.max(...gs.map((g) => g.right)), bottom: Math.max(...gs.map((g) => g.bottom)) } : null);
    const baseBox = union(base), mini = document.getElementById('mini'), m = mini?.getBoundingClientRect(), ms = mini && getComputedStyle(mini);
    const hit = baseBox ? document.elementFromPoint((baseBox.left + baseBox.right) / 2, (baseBox.top + baseBox.bottom) / 2) : null;
    return { label, scrollX, scrollY, source: plain(r), base, baseBox, union: union(all), rung: el.dataset.ladderRung || null, depth: el.dataset.depth || null, kept: el.dataset.kept != null,
      reading: [...el.querySelectorAll('rt')].filter((rt) => { const s = getComputedStyle(rt); return !rt.classList.contains('hidden-rt') && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'; }).map((rt) => rt.textContent).join(''),
      title: { height: h1.getBoundingClientRect().height, lineHeight: heading.lineHeight, paddingBottom: heading.paddingBottom, fontSize: heading.fontSize },
      visible: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, hitOwned: Boolean(hit && (hit === el || el.contains(hit))),
      mini: m && m.width > 0 && m.height > 0 && ms.display !== 'none' && ms.visibility !== 'hidden' ? plain(m) : null };
  }, { selector, label });
  const input = () => (out.touch ? target.tap() : target.click());
  const shift = (a, b) => (a && b ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) : Infinity);
  const baseShift = (a, b) => (a.base.length && a.base.length === b.base.length && a.base.every((g, i) => g.char === b.base[i].char)
    ? Math.max(...a.base.flatMap((g, i) => ['left', 'top', 'right', 'bottom'].map((k) => Math.abs(g[k] - b.base[i][k])))) : Infinity);
  const seat = (s) => {
    if (!s.mini || !s.union) return { side: null, gap: null, overlapsAcross: false };
    const m = { left: s.mini.x, top: s.mini.y, right: s.mini.x + s.mini.width, bottom: s.mini.y + s.mini.height }, u = s.union;
    const side = m.bottom <= u.top ? 'above' : m.top >= u.bottom ? 'below' : m.right <= u.left ? 'left' : m.left >= u.right ? 'right' : 'overlapping';
    const gap = { above: u.top - m.bottom, below: m.top - u.bottom, left: u.left - m.right, right: m.left - u.right }[side] ?? null;
    const overlapsAcross = ['above', 'below'].includes(side) ? m.left < u.right && m.right > u.left : ['left', 'right'].includes(side) ? m.top < u.bottom && m.bottom > u.top : false;
    return { side, gap, overlapsAcross };
  };
  const seated = (s) => { const x = seat(s); return Number.isFinite(x.gap) && Math.abs(x.gap - SLIP_GAP) <= 1 && x.overlapsAcross; };
  const fresh = await titleLayout(page);
  const pre = await readAppRecordSnapshot(page);
  const before = await sample('before');
  const first = lines.find((l) => l.text === '日本'), daisho = lines.find((l) => l.text === '大賞');
  const twoLine = Boolean(first && daisho && first.top != null && daisho.top != null && daisho.top - first.top > (first.bottom - first.top) / 2);
  const priorPainted = !prior || Boolean(fresh?.words.some((w) => w.title && w.text === prior && w.painted && w.nativeActive));
  row(out, `${name}.fresh`, native.kind === 'core' && fresh?.titleWords > 0 && stateless(fresh, (w) => w.text !== prior) && priorPainted && !before.rung && !before.mini && !pre.record.met?.entries?.[native.key] && (out.engine !== 'webkit' || out.size !== 'phone' || id !== STORY || twoLine) && (!nextLineRequired || adjacent), { native, prior: prior ? { word: prior, node: priorNode, painted: priorPainted } : null, lines, twoLine, layout, fresh, before, revision: pre.revision });
  if (prior) await titleRingFrame(page, out, name, 'before', true, prior);
  await page.evaluate(() => { window.__dotsInputs = []; for (const type of ['touchstart', 'pointerdown', 'click']) document.addEventListener(type, (e) => window.__dotsInputs.push({ type, trusted: e.isTrusted, pointerType: e.pointerType ?? null, word: e.target?.closest?.('.japanese-lookup-word')?.dataset.lookupText ?? null }), true); });
  await input();
  const input1 = await sample('input-1');
  await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.ladderRung != null, selector); await delay(350);
  const reading = await sample('reading');
  const readingOwners = await page.evaluate(() => { const baseText = (el) => { const copy = el.cloneNode(true); copy.querySelectorAll('rt, rp').forEach((r) => r.remove()); return copy.textContent.replace(/\s/gu, ''); };
    return [...document.querySelectorAll('.reader-card > h1.view-title [data-ladder-rung]')].map((el) => ({ rung: el.dataset.ladderRung, lookup: el.dataset.lookupText ?? null, base: baseText(el),
      reading: [...el.querySelectorAll('rt')].filter((rt) => { const st = getComputedStyle(rt); return !rt.classList.contains('hidden-rt') && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0'; }).map((rt) => rt.textContent).join('') })); });
  if (prior) {
    const ringDots = await titleRingFrame(page, out, name, 'reading', true, prior), ring = ringDots.find((d) => d.text === prior);
    const targetNode = await target.evaluate((el) => el.dataset.dotsNode);
    const readingGlyphs = out.captureFrames[`${name}-reading`].glyphs.filter((g) => g.rt && g.owner === targetNode);
    const underRing = ring ? readingGlyphs.filter((g) => g.top > ring.fragments.at(-1).bottom && g.left < ring.right + ring.spread && g.right > ring.left - ring.spread) : [];
    row(out, `${name}.reading-beside-ring`, ring?.depth === 'met' && ring.kept && readingGlyphs.length > 0 && readingGlyphs.map((g) => g.text).join('') === reading.reading.replace(/\s/gu, '') && (!nextLineRequired || underRing.length > 0),
      { layout, ring: ring && { text: ring.text, depth: ring.depth, kept: ring.kept, box: [ring.left - ring.spread, ring.top - ring.spread, ring.right + ring.spread, ring.bottom + ring.spread], fragments: ring.fragments }, reading: reading.reading, readingGlyphs, underRing });
  }
  const settle = await settledRecord(page);
  const beforeInput2 = await readAppRecordSnapshot(page);
  const encounterAt = (snapshot) => snapshot.record.met?.entries?.[native.key] ?? null;
  row(out, `${name}.reading-without-encounter`, reading.rung === 'reading' && reading.reading.length > 0 && !reading.mini && !encounterAt(pre) && settle.settled && !encounterAt(settle.snapshot) && !encounterAt(beforeInput2),
    { reading, revisions: { beforeInput1: pre.revision, settle: settle.reads, settled: settle.settled, waitedMs: settle.waitedMs, quietMs: settle.quietMs, beforeInput2: beforeInput2.revision }, encounter: { settled: encounterAt(settle.snapshot), beforeInput2: encounterAt(beforeInput2) } });
  await input();
  await page.locator('#mini').waitFor({ state: 'visible' });
  const opened = await sample('stage-open');
  const slipAnchor = await page.evaluate(() => { const baseText = (el) => { const copy = el.cloneNode(true); copy.querySelectorAll('rt, rp').forEach((r) => r.remove()); return copy.textContent.replace(/\s/gu, ''); }; const mini = document.getElementById('mini'), anchor = mini?._kept?.anchor || null;
    return { present: Boolean(mini), connected: Boolean(anchor?.isConnected), inTitle: Boolean(anchor && document.querySelector('.reader-card > h1.view-title')?.contains(anchor)), lookup: anchor?.dataset?.lookupText ?? null, base: anchor ? baseText(anchor) : null, miniKind: mini?.dataset.kind ?? null, miniKey: mini?.dataset.key ?? null }; });
  if (prior) await titleRingFrame(page, out, name, 'stage-open', false, prior);
  const miniHandle = await page.$('#mini');
  const committed = await waitForAppRecord(page, (value) => Boolean(value.met?.entries?.[native.key]), { description: `native first encounter for ${word}` });
  await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.depth === 'met', selector); await delay(350);
  const met = await sample('stage-met');
  if (prior) await titleRingFrame(page, out, name, 'stage-met', !uncover, prior);
  const after = await readAppRecordSnapshot(page);
  if (prior) {
    const priorDepth = await page.evaluate((word) => window.__KAIRO_DEPTH__.depth({ t: 'word', id: word }), prior);
    const saved = (record) => JSON.stringify((record.taken || []).filter((t) => t.id === prior));
    row(out, `${name}.prior-state-intact`, JSON.stringify(pre.record.met?.entries?.[priorNode.key]) === JSON.stringify(after.record.met?.entries?.[priorNode.key]) && Boolean(pre.record.met?.entries?.[priorNode.key]) &&
      saved(pre.record) !== '[]' && saved(pre.record) === saved(after.record) && Object.keys(pre.record).every((key) => key in after.record) && priorDepth?.depth === 'met' && priorDepth.kept,
      { before: { met: pre.record.met?.entries?.[priorNode.key], taken: JSON.parse(saved(pre.record)) }, after: { met: after.record.met?.entries?.[priorNode.key], taken: JSON.parse(saved(after.record)) }, priorDepth, missingKeys: Object.keys(pre.record).filter((key) => !(key in after.record)) });
  }
  const sameMini = Boolean(miniHandle) && await miniHandle.evaluate((el) => el.isConnected && el === document.getElementById('mini'));
  const expected = await page.evaluate((word) => window.__KAIRO_DEPTH__.depth({ t: 'word', id: word }), word);
  const frames = [before, input1, reading, opened, met];
  row(out, `${name}.stage-commits-met`, opened.rung === 'stage' && met.rung === 'stage' && !encounterAt(beforeInput2) && committed.met.entries[native.key]?.days >= 1 && encounterAt(after) && expected?.depth === 'met' && met.depth === 'met',
    { encounter: committed.met.entries[native.key], revisions: { beforeInput2: beforeInput2.revision, after: after.revision }, expected, opened: { rung: opened.rung, depth: opened.depth }, met: { rung: met.rung, depth: met.depth } });
  const firstMove = Math.max(baseShift(before, input1), baseShift(before, reading)), secondMove = Math.max(baseShift(reading, opened), baseShift(reading, met));
  const cumulativeMove = Math.max(...frames.map((f) => baseShift(before, f)));
  const telemetry = frames.map((f) => ({ label: f.label, element: f.source, elementShift: shift(before.source, f.source), baseBox: f.baseBox, union: f.union }));
  row(out, `${name}.first-tap-base-glyphs`, firstMove <= 1, { maxShift: firstMove, before: before.base, input1: input1.base, reading: reading.base, telemetry });
  row(out, `${name}.second-tap-base-glyphs`, secondMove <= 1, { maxShift: secondMove, reading: reading.base, opened: opened.base, met: met.base, telemetry });
  row(out, `${name}.fresh-to-state-base-glyphs`, cumulativeMove <= 1, { maxShift: cumulativeMove, perFrame: frames.map((f) => ({ label: f.label, shift: baseShift(before, f) })) });
  row(out, `${name}.title-rhythm-through-inputs`, frames.every((f) => JSON.stringify(f.title) === JSON.stringify(before.title)), frames.map((f) => ({ label: f.label, ...f.title })));
  row(out, `${name}.source-visible-and-owned`, frames.every((f) => f.visible && f.hitOwned), frames.map((f) => ({ label: f.label, visible: f.visible, hitOwned: f.hitOwned })));
  row(out, `${name}.scroll-unchanged`, frames.every((f) => f.scrollY === before.scrollY && f.scrollX === before.scrollX), frames.map((f) => ({ label: f.label, scrollX: f.scrollX, scrollY: f.scrollY })));
  row(out, `${name}.slip-seated`, sameMini && shift(opened.mini, met.mini) <= 1 && seated(opened) && seated(met),
    { authoredGap: SLIP_GAP, sameMini, miniShift: shift(opened.mini, met.mini), opened: { mini: opened.mini, union: opened.union, ...seat(opened) }, met: { mini: met.mini, union: met.union, ...seat(met) }, openedBeforeState: !opened.depth });
  if (uncover) {
    // The open slip covers this saved ring; the app's own Escape folds the slip and uncovers the same occurrence.
    const held = await settledRecord(page);
    await page.keyboard.press('Escape');
    await page.locator('#mini').waitFor({ state: 'detached' }); await delay(350);
    const uncovered = await sample('stage-met-uncovered');
    const uncoveredDots = await titleRingFrame(page, out, name, 'stage-met-uncovered', true, prior);
    const released = await settledRecord(page);
    row(out, `${name}.uncovered-record-identical`, held.settled && released.settled && released.snapshot.revision === held.snapshot.revision && JSON.stringify(released.snapshot.record) === JSON.stringify(held.snapshot.record),
      { control: 'Escape', held: { revision: held.snapshot.revision, settled: held.settled }, released: { revision: released.snapshot.revision, settled: released.settled, reads: released.reads } });
    row(out, `${name}.uncovered-title-stable`, !uncovered.mini && uncovered.visible && uncovered.hitOwned && JSON.stringify(uncovered.title) === JSON.stringify(before.title) && baseShift(before, uncovered) <= 1 && uncovered.scrollX === before.scrollX && uncovered.scrollY === before.scrollY && uncovered.depth === 'met',
      { title: uncovered.title, before: before.title, baseShift: baseShift(before, uncovered), scroll: [uncovered.scrollX, uncovered.scrollY], mini: uncovered.mini, depth: uncovered.depth, reading: uncovered.reading });
    // The fold also folds the lower word's reading; its native first input shows the same reading again beside the same ring.
    await input();
    await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.ladderRung === 'reading', selector); await delay(350);
    const restored = await sample('stage-met-restored');
    const restoredDots = await titleRingFrame(page, out, name, 'stage-met-restored', true, prior, { text: word, kept: false });
    const restoredRecord = await settledRecord(page);
    const savedPaint = (frameDots) => { const e = frameDots.ink?.find((d) => d.text === prior); return e ? { painted: e.painted, ringPainted: e.ringPainted, depth: e.depth, kept: e.kept } : null; };
    const ring = restoredDots.find((d) => d.text === prior), targetNode = await target.evaluate((el) => el.dataset.dotsNode);
    const restoredGlyphs = out.captureFrames[`${name}-stage-met-restored`].glyphs.filter((g) => g.rt && g.owner === targetNode);
    const underRing = ring ? restoredGlyphs.filter((g) => g.top > ring.fragments.at(-1).bottom && g.left < ring.right + ring.spread && g.right > ring.left - ring.spread) : [];
    row(out, `${name}.restored-reading`, restored.rung === 'reading' && restored.reading.length > 0 && restored.reading === reading.reading && restored.depth === 'met' && !restored.mini && restored.visible && restored.hitOwned &&
      JSON.stringify(restored.title) === JSON.stringify(before.title) && baseShift(before, restored) <= 1 && restored.scrollX === before.scrollX && restored.scrollY === before.scrollY &&
      Boolean(savedPaint(uncoveredDots)) && JSON.stringify(savedPaint(restoredDots)) === JSON.stringify(savedPaint(uncoveredDots)) && (!nextLineRequired || underRing.length > 0),
      { input: out.touch ? 'tap' : 'click', rung: restored.rung, reading: restored.reading, original: reading.reading, depth: restored.depth, mini: restored.mini, title: restored.title, before: before.title, baseShift: baseShift(before, restored),
        scroll: [restored.scrollX, restored.scrollY], savedPaint: { uncovered: savedPaint(uncoveredDots), restored: savedPaint(restoredDots) }, underRing, nextLineRequired });
    row(out, `${name}.restored-record-identical`, held.settled && restoredRecord.settled && restoredRecord.snapshot.revision === held.snapshot.revision && JSON.stringify(restoredRecord.snapshot.record) === JSON.stringify(held.snapshot.record),
      { control: 'native first input after Escape', held: { revision: held.snapshot.revision }, restored: { revision: restoredRecord.snapshot.revision, settled: restoredRecord.settled, reads: restoredRecord.reads } });
    // The saved word itself under a real pointer while the lower word's reading stays open: its ring beside its own mark. At
    // the phone's size this is a narrow window's pointer; a touch instead moves the reading to the touched word.
    const priorSelector = `.reader-card > h1.view-title .japanese-lookup-word[data-lookup-text="${prior}"]`, priorTarget = page.locator(priorSelector).first();
    await priorTarget.hover(); await delay(350);
    const touched = await sample('active-saved');
    const priorState = await page.evaluate((sel) => { const el = document.querySelector(sel); return { hover: el.matches(':hover'), focusVisible: el.matches(':focus-visible'), rung: el.dataset.ladderRung || null, depth: el.dataset.depth || null, kept: el.dataset.kept != null }; }, priorSelector);
    await titleRingFrame(page, out, name, 'active-saved', true, prior, { text: prior, kept: true });
    const touchedRecord = await settledRecord(page);
    row(out, `${name}.active-saved-input`, priorState.hover && priorState.depth === 'met' && priorState.kept && touched.rung === 'reading' && touched.reading === reading.reading &&
      JSON.stringify(touched.title) === JSON.stringify(before.title) && baseShift(before, touched) <= 1 && touched.scrollX === before.scrollX && touched.scrollY === before.scrollY &&
      held.settled && touchedRecord.settled && touchedRecord.snapshot.revision === held.snapshot.revision && JSON.stringify(touchedRecord.snapshot.record) === JSON.stringify(held.snapshot.record),
      { input: 'pointer hover', prior: priorState, target: { rung: touched.rung, reading: touched.reading }, title: touched.title, before: before.title, baseShift: baseShift(before, touched), scroll: [touched.scrollX, touched.scrollY],
        record: { held: held.snapshot.revision, touched: touchedRecord.snapshot.revision, settled: touchedRecord.settled } });
  }
  const saved = prior ? await page.evaluate((word) => [...document.querySelectorAll(`.reader-card > h1.view-title .japanese-lookup-word[data-lookup-text="${word}"][data-kept]`)].map((el) => el.dataset.lookupText), prior) : [];
  return { story: openedStory, saved, readingOwners, slipAnchor, selectedInput: { door, word: await target.evaluate((el) => el.dataset.lookupText) } };
}
async function rooms(page, out) {
  out.roomStateCoverage = {};
  const familySamples = { slip: [], basis: [], prose: [] };
  // Traverse actual doors for all four fills. These are independently seeded
  // native identities; opening a slip can add today's encounter naturally.
  for (const name of ['owned', 'met', 'again', 'recalled']) {
    const word = page.locator(`#reader .tok[data-index="${PARA[name]}"]`);
    await word.scrollIntoViewIfNeeded(); await word.click();
    await page.waitForFunction((e) => document.getElementById('mini') || e?.dataset.ladderRung === 'reading', await word.elementHandle());
    if (!await page.locator('#mini').count()) await word.click();
    await page.locator('#mini .mini-word').waitFor(); await delay(200);
    const slip = await surfaceCapture(page, out, `slip-${name}`, '#mini .mini-word');
    checkPaint(out, `slip-${name}`, slip);
    await page.locator('#mini .mini-word').click(); await page.locator('#depth-basis .depth-dot').waitFor(); await delay(300);
    const basis = await surfaceCapture(page, out, `basis-${name}`, '#sheet .depth-dot', false);
    checkPaint(out, `basis-${name}`, basis);
    familySamples.slip.push(...slip); familySamples.basis.push(...basis);
    out.roomStateCoverage[name] = { slip: slip.map((d) => d.depth), basis: basis.map((d) => d.depth) };
    const proseSelector = '#sheet .japanese-lookup-word[data-lookup-text]:not(.headword .japanese-lookup-word)';
    if (await page.locator(proseSelector).count()) {
      const prose = await surfaceCapture(page, out, `prose-${name}`, proseSelector);
      checkPaint(out, `prose-${name}`, prose); familySamples.prose.push(...prose);
      lineGeometry(out, `prose-${name}`, prose);
      out.proseCoverage = [...(out.proseCoverage || []), ...prose.map((d) => ({ text: d.text, depth: d.depth, kept: d.kept }))];
    }
    await page.locator('#sheet-back').click(); await page.waitForFunction(() => !document.getElementById('sheet')); await delay(250);
    if (await page.locator('#mini').count()) { await page.keyboard.press('Escape'); await delay(150); }
  }
  row(out, 'room.native-fill-coverage', ['owned', 'met', 'again', 'recalled'].every((name) => out.roomStateCoverage[name].slip.includes(name) && out.roomStateCoverage[name].basis.includes(name)), out.roomStateCoverage);
  row(out, 'room.generic-prose-covered', (out.proseCoverage || []).length > 0, out.proseCoverage || []);
  for (const [family, samples] of Object.entries(familySamples)) semanticFamily(out, family, samples);
  await page.locator('#tray').click(); await page.locator('.tray-line').first().waitFor(); await delay(300);
  const tray = await surfaceCapture(page, out, 'tray', '.tray-line .depth-dot', false);
  checkPaint(out, 'tray', tray); semanticFamily(out, 'tray', tray);
  await page.locator('#tab-today').click(); await page.locator('.today-star').first().waitFor(); await delay(350);
  const today = await surfaceCapture(page, out, 'today', '.today-star:not([hidden])');
  checkPaint(out, 'today', today); semanticFamily(out, 'today', today);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Reconstructed after the native gate timeout from its retained partial
  // 95ddf5cf receipt: float at authored rest, independently breath at its trough.
  // This does not claim full opacity inside the deliberately fading moving edge.
  out.todayAnimation = await page.evaluate(() => {
    const found = [];
    for (const animation of document.getAnimations()) {
      const timing = animation.effect.getTiming(); animation.pause();
      if (animation.animationName === 'today-float') animation.currentTime = 0;
      if (animation.animationName === 'today-breath') {
        animation.currentTime = Number(timing.delay || 0) + Number(timing.duration);
        const target = animation.effect.target;
        found.push({ name: animation.animationName, text: target?.textContent, node: target?.dataset.depthNode, currentTime: animation.currentTime, playState: animation.playState,
          timing, frames: animation.effect.getKeyframes(), opacity: Number(getComputedStyle(target).opacity) });
      }
    }
    return found;
  });
  row(out, 'today.native-breath-reached', out.todayAnimation.length > 0 && out.todayAnimation.every((a) => {
    const endpoint = a.frames.find((f) => f.computedOffset === 1);
    return a.playState === 'paused' && a.currentTime === Number(a.timing.delay || 0) + Number(a.timing.duration) && Number(endpoint?.opacity) === 0.66 && Math.abs(a.opacity - 0.66) < 0.000001;
  }), out.todayAnimation);
  const trough = await surfaceCapture(page, out, 'today-minimum-breath', '.today-star.due:not([hidden])');
  const dueFacts = await facts(page, '.today-star.due:not([hidden])');
  out.todayFloatRest = await page.locator('.today-star.due:not([hidden])').evaluateAll((stars, { dots, measured }) => stars.map((star) => {
    const d = dots.find((dot) => dot.probeId === star.dataset.dotsNode), raster = measured.find((dot) => dot.probeId === star.dataset.dotsNode);
    const style = getComputedStyle(star), lane = star.closest('.today-sky-lane'), laneStyle = lane && getComputedStyle(lane), box = lane?.getBoundingClientRect();
    const mask = laneStyle?.maskImage && laneStyle.maskImage !== 'none' ? laneStyle.maskImage : laneStyle?.webkitMaskImage || 'none';
    const fade = mask === 'none' ? 0 : Number(/rgb\(0, 0, 0\) ([\d.]+)px/.exec(mask)?.[1]);
    const opaque = box ? { left: box.left + scrollX + fade, right: box.right + scrollX - fade } : null;
    const ring = d ? { left: d.left - d.spread, right: d.right + d.spread, top: d.top - d.spread, bottom: d.bottom + d.spread } : null;
    const clearance = ring && opaque ? { left: ring.left - opaque.left, right: opaque.right - ring.right } : null;
    const animation = star.getAnimations().find((a) => a.animationName === 'today-float');
    const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
    const vars = Object.fromEntries(['--from', '--to', '--lag', '--ring'].map((key) => [key, style.getPropertyValue(key).trim()]));
    const timeline = animation?.effect.getTiming();
    const authoredX = timeline ? parseFloat(vars['--from']) + (parseFloat(vars['--to']) - parseFloat(vars['--from'])) * ((-Number(timeline.delay) / Number(timeline.duration)) % 1) : null;
    return { probeId: star.dataset.dotsNode, text: star.textContent, node: star.dataset.depthNode, measured: Boolean(raster), lane: lane?.dataset.lane,
      claim: 'breath-trough paint with float at authored rest', animations: star.getAnimations().map((a) => ({ name: a.animationName, currentTime: a.currentTime, playState: a.playState, timing: a.effect.getTiming(), frames: a.effect.getKeyframes() })),
      currentTime: animation?.currentTime ?? null, playState: animation?.playState ?? null, transform: style.transform, opacity: Number(style.opacity), vars, authoredX,
      // Native WebKit serializes rest as +0.000012px. This precision bound is
      // only for transform arithmetic; all ring/mask boundaries stay >= 0.
      atRest: !animation || (Math.abs(authoredX) < 0.001 && Math.abs(matrix.m41 - authoredX) < 0.001 && matrix.m42 === 0 && matrix.m11 === 1 && matrix.m22 === 1),
      mask, fade, laneBox: box ? { left: box.left + scrollX, right: box.right + scrollX, top: box.top + scrollY, bottom: box.bottom + scrollY } : null,
      host: d?.host, ring, opaque, clearance,
      sameCapturedRing: Boolean(d && raster) && ['left', 'right', 'top', 'bottom', 'spread'].every((key) => d[key] === raster[key]),
      viewport: Boolean(ring && raster) && ring.left - raster.raster.offset.x >= 0 && ring.right - raster.raster.offset.x <= innerWidth && ring.top - raster.raster.offset.y >= 0 && ring.bottom - raster.raster.offset.y <= innerHeight };
  }), { dots: dueFacts, measured: trough });
  row(out, 'today-minimum-breath.float-at-rest', trough.length > 0 && exactRoster(out.todayFloatRest.filter((d) => d.measured).map((d) => d.probeId), trough.map((d) => d.probeId)) && out.todayFloatRest.filter((d) => d.measured).every((d) =>
    d.sameCapturedRing && d.atRest && d.viewport && Number.isFinite(d.fade) && d.clearance?.left >= 0 && d.clearance?.right >= 0 &&
    (d.currentTime === null || (d.currentTime === 0 && d.playState === 'paused')) && d.animations.every((a) => a.playState === 'paused' && (a.name !== 'today-breath' || (a.currentTime === Number(a.timing.delay || 0) + Number(a.timing.duration) && Math.abs(d.opacity - 0.66) < 0.000001)))), out.todayFloatRest);
  checkPaint(out, 'today-minimum-breath', trough);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#tab-me, #tab-progress').first().click(); await page.locator('#me-progress').waitFor(); await page.locator('#me-progress').click();
  await page.waitForFunction(() => document.body.dataset.view === 'kagami'); await delay(300);
  const mirror = await surfaceCapture(page, out, 'mirror', '.kagami-row .depth-dot', false);
  checkPaint(out, 'mirror', mirror); semanticFamily(out, 'mirror', mirror);
}

/** A fresh native profile for this engine and world, served the same CSS as every other page of the run. */
async function openContext(browser, engine, world, size = defaultSize(engine)) {
  const device = DEVICES[size];
  const context = await browser.newContext({ viewport: device.viewport, deviceScaleFactor: 2, isMobile: device.touch, hasTouch: device.touch, reducedMotion: 'reduce', colorScheme: 'light', serviceWorkers: 'block' });
  await context.addInitScript((world) => { localStorage.setItem('kairo-theme', world); localStorage.setItem('kairo-word-ladder-demo-v1', '1'); }, world);
  await context.addInitScript(sceneObserver);
  if (controlBytes || diagnosticInlineEnd || process.env.DOTS_BASE_URL) await context.route(new URL('editorial.css', base).href + '*', async (route) => { try { const response = await route.fetch(); const original = await response.body(); const expected = report.identity.files?.find((f) => f.path === 'editorial.css')?.sha256; assert(expected && hash(original) === expected, 'Control fetched CSS does not match artifact'); const servedBytes = controlBytes || (process.env.DOTS_BASE_URL ? original : Buffer.concat([original, Buffer.from('\n.japanese-lookup-word:is([data-depth],[data-kept])::after { left:auto; right:auto; transform:translateX(calc(-0.5em - var(--depth-size)/2)); }\n')])); if (!process.env.DOTS_BASE_URL) assert(hash(original) !== hash(servedBytes), 'Control must change CSS'); (process.env.DOTS_BASE_URL ? (report.remoteCssServed ||= []) : report.control.served).push({ url: route.request().url(), candidateSha256: hash(original), servedSha256: hash(servedBytes) }); await route.fulfill({ response, body: servedBytes, headers: { ...response.headers(), 'content-length': String(servedBytes.length), 'content-type': 'text/css' } }); } catch (e) { report.control.setupError = String(e.stack); await route.abort(); } });
  return context;
}
async function freshWalk(browser, out, walk) {
  const context = await openContext(browser, out.engine, out.world, out.size);
  try { const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', (e) => out.errors.push(String(e))); await walk(page); }
  finally { await context.close(); }
}
/** The reader title as laid out now: its box, rhythm, card and every authored
 * character (never a retry button's label or a reading), in viewport pixels. */
const titleGeometry = (page, label) => page.evaluate(async (label) => {
  await document.fonts.ready;
  const h = document.querySelector('.reader-card > h1.view-title');
  if (!h) return { label, missing: true };
  const card = h.closest('.reader-card'), style = getComputedStyle(h), box = (r) => ({ left: r.left, top: r.top, width: r.width, height: r.height }), glyphs = [];
  const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT); let text;
  while ((text = walker.nextNode())) {
    if (text.parentElement.closest('button, rt, rp')) continue;
    for (let i = 0; i < text.length; i++) { if (!text.textContent[i].trim()) continue; const range = document.createRange(); range.setStart(text, i); range.setEnd(text, i + 1); const b = range.getBoundingClientRect(); if (b.width && b.height) glyphs.push({ char: text.textContent[i], left: b.left, top: b.top, right: b.right, bottom: b.bottom }); }
  }
  const wrapper = h.querySelector('[data-lookup-readings-pending]'), reader = document.querySelector('#reader');
  return { label, scrollX, scrollY, viewportWidth: innerWidth, phone: matchMedia('(max-width: 520px)').matches, title: box(h.getBoundingClientRect()), card: box(card.getBoundingClientRect()), lineHeight: style.lineHeight, paddingBottom: style.paddingBottom, fontSize: style.fontSize,
    titleText: h.textContent, titleHTML: h.innerHTML, lookupGroups: [...h.querySelectorAll('.japanese-lookup-text')].map((g) => g.textContent),
    pending: Boolean(wrapper), busy: wrapper?.getAttribute('aria-busy') ?? null, words: h.querySelectorAll('.japanese-lookup-word').length, buttons: [...h.querySelectorAll('button')].map((b) => b.textContent), glyphs,
    body: { busy: reader?.getAttribute('aria-busy'), tokens: reader?.querySelectorAll('.tok[data-index]').length ?? 0, notes: [...document.querySelectorAll('main .note')].map((n) => n.textContent), retry: [...document.querySelectorAll('main .note button')].map((b) => b.textContent) } };
}, label);
const glyphShift = (a, b) => (a.length && a.length === b.length && a.every((g, i) => g.char === b[i].char) ? Math.max(...a.flatMap((g, i) => ['left', 'top', 'right', 'bottom'].map((k) => Math.abs(g[k] - b[i][k])))) : Infinity);
const titleDelta = (a, b) => (a.missing || b.missing ? null : { title: Object.fromEntries(['left', 'top', 'width', 'height'].map((k) => [k, b.title[k] - a.title[k]])),
  card: Object.fromEntries(['left', 'top', 'width', 'height'].map((k) => [k, b.card[k] - a.card[k]])), scrollX: b.scrollX - a.scrollX, scrollY: b.scrollY - a.scrollY,
  rhythm: [a.lineHeight, a.paddingBottom, a.fontSize].join() === [b.lineHeight, b.paddingBottom, b.fontSize].join(), glyphShift: glyphShift(a.glyphs, b.glyphs) });
/** Lead 2010's native observation: no deferred TITLE in either story. Hold the
 * actual wikinews BODY request; retry only its native .note/Try again door. */
async function lateTitle(page, out, spec, result) {
  const requests = result.requests, held = [];
  await page.route('**/data/share_alike/skip.json', async (route) => {
    const request = { url: route.request().url(), requestedAt: new Date().toISOString(), status: null, fulfilled: false }; requests.push(request);
    try {
      request.status = spec.mode === 'cold' ? 200 : await new Promise((release) => held.push(release));
      request.releasedAt = new Date().toISOString();
      if (request.status === 200) {
        const response = await route.fetch(); assert(response.ok(), 'Actual sidecar response must succeed'); const bytes = await response.body();
        request.bodySha256 = hash(bytes); request.bytes = bytes.length;
        const expected = report.identity.files?.find((f) => f.path === 'data/share_alike/skip.json')?.sha256;
        assert(expected && request.bodySha256 === expected, 'Sidecar bytes must match the pinned artifact');
        await route.fulfill({ response, body: bytes });
      } else await route.fulfill({ status: request.status, contentType: 'text/plain', body: 'Deliberate native BODY name-readings failure' });
      request.fulfilled = true;
    } catch (error) { request.error = String(error.stack || error); out.errors.push(request.error); await route.abort().catch(() => {}); }
  });
  const heldCount = async (count) => { const deadline = Date.now() + 15000; while (held.length < count && Date.now() < deadline) await delay(25); return held.length === count; };
  const add = (suffix, passed, detail) => row(out, `${spec.name}.${suffix}`, passed, detail);
  const sample = async (label) => {
    const frame = await titleGeometry(page, label); result.frames.push(frame);
    const name = `${out.engine}-${out.world}-${spec.name}-${label}.png`;
    const bytes = await page.screenshot({ path: resolve(evidence, name), fullPage: false, animations: 'allow' });
    result.screenshots.push({ label, path: name, sha256: hash(bytes) }); save(); return frame;
  };
  try {
    await boot(page); await openPassage(page, spec);
    await page.locator('.reader-card > h1.view-title').waitFor({ timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.reader-card').evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })); await delay(250);
    await worldBinding(page, out, spec.name);
    if (spec.mode !== 'cold') assert(await heldCount(1), 'Exactly one real BODY request must be held');
    const cold = await sample('cold');
    add('cold-open', !cold.missing && cold.glyphs.length > 0 && cold.words === spec.words && !cold.pending && !cold.buttons.length, { story: spec.id, words: cold.words, pending: cold.pending, requestCount: requests.length, trigger: spec.mode === 'cold' ? 'none observed' : 'BODY', titleText: cold.titleText });
    if (spec.mode === 'cold') {
      await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 30000 }); await delay(350);
      const settled = await sample('settled-cold');
      result.sidecar = 'not exercised: no such request exists';
      add('cold-loaded', cold.body.tokens > 0 && settled.body.tokens > 0 && settled.body.busy !== 'true' && requests.length === 0, { cold: cold.body, settled: settled.body, sidecar: result.sidecar });
    } else {
      add('body-pending', cold.body.busy === 'true' && cold.body.tokens === 0 && requests.length === 1 && held.length === 1 && requests[0].status === null, { body: cold.body, requests: requests.length });
      held.shift()(spec.mode === 'fail-retry' ? 503 : 200);
      if (spec.mode === 'fail-retry') {
        const retry = page.locator('main .note').getByRole('button', { name: 'Try again', exact: true });
        await retry.waitFor({ timeout: 15000 });
        const failed = await sample('body-failed');
        add('body-failed', failed.body.busy === 'false' && failed.body.tokens === 0 && failed.body.retry.length === 1 && failed.body.retry[0] === 'Try again' && requests.length === 1 && requests[0].status === 503 && requests[0].fulfilled, { body: failed.body, request: requests[0] });
        result.retryInput = { method: out.engine === 'webkit' ? 'tap' : 'click', selector: 'main .note', accessibleName: 'Try again', at: new Date().toISOString() };
        if (out.engine === 'webkit') await retry.tap(); else await retry.click();
        await page.waitForFunction(() => document.querySelector('#reader')?.getAttribute('aria-busy') === 'true');
        const retryHeld = await heldCount(1);
        const retrying = await sample('body-retry-pending');
        add('native-retry', retryHeld && requests.length === 2 && requests[1].status === null && retrying.body.busy === 'true' && retrying.body.tokens === 0 && !retrying.body.retry.length, { body: retrying.body, requests: requests.map((r) => r.status), input: result.retryInput });
        assert(held.length === 1, 'Exactly one retry request must be held'); held.shift()(200);
      }
      await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 30000 }); await delay(350);
      const loaded = await sample('body-loaded');
      add('body-loaded', loaded.body.tokens === 532 && loaded.body.busy !== 'true' && !loaded.body.retry.length && requests.at(-1)?.status === 200 && requests.at(-1)?.fulfilled, { body: loaded.body, expectedNativeTokens: 532 });
      result.sidecar = 'actual BODY-triggered request exercised; title was already enhanced';
    }
    const frames = result.frames, deltas = frames.map((f) => ({ label: f.label, delta: titleDelta(cold, f) }));
    add('native-title-not-deferred', frames.every((f) => !f.missing && f.titleText === cold.titleText && f.words === spec.words && !f.pending && !f.buttons.length), frames.map((f) => ({ label: f.label, words: f.words, pending: f.pending, buttons: f.buttons })));
    add('unconditional-title-rhythm', frames.every((f) => Number.parseFloat(f.paddingBottom) === 8 && Math.abs(Number.parseFloat(f.lineHeight) - titleLeading(Number.parseFloat(f.fontSize), f.phone)) < 0.01), frames.map((f) => ({ label: f.label, viewportWidth: f.viewportWidth, phone: f.phone, fontSize: f.fontSize, lineHeight: f.lineHeight, paddingBottom: f.paddingBottom })));
    add('title-identical', deltas.every(({ delta: d }) => d && d.rhythm && Object.values(d.title).every((v) => v === 0)), deltas);
    add('card-identical', deltas.every(({ delta: d }) => d && Object.values(d.card).every((v) => v === 0)), deltas);
    add('glyphs-identical', deltas.every(({ delta: d }) => d && d.glyphShift === 0), deltas);
    add('scroll-identical', deltas.every(({ delta: d }) => d && d.scrollX === 0 && d.scrollY === 0), deltas);
    add('phase-roster', frames.map((f) => f.label).join('|') === spec.phases.join('|'), { required: spec.phases, executed: frames.map((f) => f.label) });
    const expectedStatuses = spec.mode === 'cold' ? [] : spec.mode === 'success' ? [200] : [503, 200];
    add('request-sequence', requests.length === expectedStatuses.length && requests.every((r, i) => r.status === expectedStatuses[i] && r.fulfilled && !r.error && (r.status !== 200 || Boolean(r.bodySha256))), { expected: expectedStatuses, requests, sidecar: result.sidecar });
    result.completed = true;
  } finally { while (held.length) { result.cleanupReleased = true; held.shift()(503); } }
}
function lateContextAdmission(out) {
  const expectedCases = LATE.map((spec) => lateCaseId(out.engine, out.world, spec));
  const expectedRows = LATE.flatMap(lateRows);
  return { requiredCases: expectedCases, executedCases: out.lateCases.map((c) => c.caseId), requiredRows: expectedRows, executedRows: out.rows.map((r) => r.id),
    accepted: !out.errors.length && exactRoster(out.lateCases.map((c) => c.caseId), expectedCases) && exactRoster(out.rows.map((r) => r.id), expectedRows) && out.rows.every((r) => r.passed === true) && LATE.every((spec) => {
      const c = out.lateCases.find((entry) => entry.caseId === lateCaseId(out.engine, out.world, spec));
      return c?.completed === true && !c.cleanupReleased && !c.error && c.story === spec.id && c.mode === spec.mode && exactRoster(c.rowIds, lateRows(spec)) && c.frames.map((f) => f.label).join('|') === spec.phases.join('|');
    }) };
}
async function lateWalk(browser, out) {
  out.lateCases = [];
  for (const spec of LATE) {
    const result = { caseId: lateCaseId(out.engine, out.world, spec), name: spec.name, story: spec.id, mode: spec.mode, startedAt: new Date().toISOString(), frames: [], requests: [], screenshots: [], rowIds: [], completed: false };
    out.lateCases.push(result); const start = out.rows.length;
    try { await freshWalk(browser, out, (page) => lateTitle(page, out, spec, result)); }
    catch (error) { result.error = String(error.stack || error); out.errors.push(`${spec.name}: ${result.error}`); console.error(`${out.engine}/${out.world} ${spec.name}: ${error.message}`); }
    finally { result.rowIds = out.rows.slice(start).map((r) => r.id); result.completedAt = new Date().toISOString(); save(); }
  }
  out.completedWalk = true;
  out.completedAt = new Date().toISOString();
  out.lateAdmission = lateContextAdmission(out);
  out.passed = out.lateAdmission.accepted;
  save();
}
/** Lead 2240: each saved-ring fixture on a fresh native profile at this size, with the viewport and font it actually
 * rendered and the trusted input events the native taps or clicks actually delivered to the tapped word. */
async function ringDevice(page, out, spec) {
  const device = DEVICES[out.size];
  const actual = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, touchEvents: 'ontouchstart' in window, touchPoints: navigator.maxTouchPoints, fontSize: getComputedStyle(document.querySelector('.reader-card > h1.view-title')).fontSize, inputs: window.__dotsInputs || [] }));
  const onWord = actual.inputs.filter((e) => e.trusted && e.word === spec.word);
  const touches = onWord.filter((e) => e.type === 'touchstart' || (e.type === 'pointerdown' && e.pointerType === 'touch')).length, mice = onWord.filter((e) => e.type === 'pointerdown' && e.pointerType === 'mouse').length;
  const inputProof = device.touch ? touches >= 2 && mice === 0 : mice >= 2 && touches === 0;
  row(out, `${spec.name}.device`, actual.width === device.viewport.width && actual.height === device.viewport.height && actual.fontSize === device.titleFont && inputProof,
    { size: out.size, input: out.touch ? 'tap' : 'click', expected: device, actual, trustedOnWord: { touches, mice } });
  // The page's own stylesheets, title classes and root attributes in frames 520, 520.5 and 521 CSS px wide and a 520.5 px frame
  // zoomed 2x: each frame's leading follows its own (max-width: 520px) match. Plain frames snap to whole pixels in both engines.
  // Chromium carries the zoom into the frame and lays it out 520.5 px wide, where neither (max-width: 520px) nor the retired
  // (min-width: 521px) holds: there the title must take the complement's desktop leading, so that query cannot come back unseen.
  // WebKit keeps the zoomed frame's own width whole; its observation is recorded, not claimed.
  const breakpoint = await page.evaluate(async (specs) => {
    const attrs = (el) => [...el.attributes].map((a) => `${a.name}="${a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join(' ');
    const h = document.querySelector('.reader-card > h1.view-title'), card = h.closest('.reader-card'), sheets = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
    const live = { phone: matchMedia('(max-width: 520px)').matches, fontSize: getComputedStyle(h).fontSize, lineHeight: getComputedStyle(h).lineHeight, paddingBottom: getComputedStyle(h).paddingBottom }, frames = [];
    for (const { width, zoom = 1 } of specs) {
      const frame = document.createElement('iframe');
      frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:300px;border:0;visibility:hidden${zoom === 1 ? '' : `;zoom:${zoom}`}`;
      frame.srcdoc = `<!doctype html><html ${attrs(document.documentElement)}><head>${sheets.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head><body ${attrs(document.body)}><div id="app"><main><div class="${card.className}"><h1 class="${h.className}">日本</h1></div></main></div></body></html>`;
      const loaded = new Promise((done) => frame.addEventListener('load', done, { once: true }));
      document.documentElement.append(frame); await loaded;
      const w = frame.contentWindow, t = w.document.querySelector('h1'), st = w.getComputedStyle(t), mm = (q) => w.matchMedia(q).matches;
      frames.push({ width, zoom, viewportWidth: w.document.documentElement.getBoundingClientRect().width, innerWidth: w.innerWidth, phone: mm('(max-width: 520px)'), retiredDesktop: mm('(min-width: 521px)'),
        sheets: w.document.styleSheets.length, fontSize: st.fontSize, lineHeight: st.lineHeight, paddingBottom: st.paddingBottom });
      frame.remove();
    }
    return { live, frames, sheets: sheets.length };
  }, [{ width: 520 }, { width: 520.5 }, { width: 521 }, { width: 520.5, zoom: 2 }]);
  const leads = (f) => Number.parseFloat(f.paddingBottom) === 8 && Math.abs(Number.parseFloat(f.lineHeight) - titleLeading(Number.parseFloat(f.fontSize), f.phone)) < 0.01;
  const [at520, fractional, at521, zoomed] = breakpoint.frames;
  breakpoint.fractionalWitness = { engine: out.engine, gap: !zoomed.phone && !zoomed.retiredDesktop, viewportWidth: zoomed.viewportWidth, fractional: !Number.isInteger(zoomed.viewportWidth),
    required: out.engine === 'chromium', note: out.engine === 'chromium' ? 'Chromium lays the zoomed frame out at a fractional width' : 'WebKit keeps the zoomed frame whole; recorded as observed' };
  row(out, `${spec.name}.title-leading-breakpoint`, leads(breakpoint.live) && breakpoint.live.phone === device.touch && breakpoint.frames.every((f) => leads(f) && f.sheets === breakpoint.sheets) && breakpoint.sheets > 0 &&
    at520.phone && !at521.phone && fractional.phone === (fractional.innerWidth <= 520) && (out.engine !== 'chromium' || (breakpoint.fractionalWitness.gap && breakpoint.fractionalWitness.fractional)), breakpoint);
}
/** After the fixture's own walk the same learner opens the story again through its native door, and the lower word's native
 * first input shows its reading (on the phone, on the line below the saved ring). A real pointer hover (a narrow window's mouse),
 * then, with the pointer parked on the card's corner, the title's own roving Home key (focus-visible, no activation) each make the
 * saved word active: neither folds or moves that reading or writes the record, and its ring, lowered below its own mark, must still
 * clear the reading's boxes and ink and every other card box. A touch on the saved word is not this case: it moves the reading. */
async function besideReadingWalk(page, out, { name, id, query, word, reading, prior, archiveYear, nextLineOn = [] }) {
  await story(page, id, query, archiveYear);
  await page.waitForFunction((word) => document.querySelector(`.reader-card > h1.view-title .japanese-lookup-word[data-lookup-text="${word}"][data-depth="met"][data-kept]`), prior);
  await page.locator('.reader-card').evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })); await delay(250);
  const nextLineRequired = nextLineOn.includes(`${out.engine}/${out.size}`);
  const selector = `.reader-card > h1.view-title .japanese-lookup-word[data-lookup-text="${word}"]`, target = page.locator(selector).first();
  const priorSelector = `.reader-card > h1.view-title .japanese-lookup-word[data-lookup-text="${prior}"]`, priorTarget = page.locator(priorSelector).first();
  const sample = (label) => page.evaluate(({ selector, label }) => {
    const el = document.querySelector(selector), h1 = el.closest('h1.view-title'), heading = getComputedStyle(h1), base = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let text;
    while ((text = walker.nextNode())) {
      if (text.parentElement.closest('rt, rp')) continue;
      for (let i = 0; i < text.length; i++) { if (!text.textContent[i].trim()) continue; const range = document.createRange(); range.setStart(text, i); range.setEnd(text, i + 1);
        for (const b of range.getClientRects()) if (b.width && b.height) base.push({ char: text.textContent[i], left: b.left, top: b.top, right: b.right, bottom: b.bottom }); }
    }
    const mini = document.getElementById('mini'), m = mini?.getBoundingClientRect(), ms = mini && getComputedStyle(mini);
    return { label, scrollX, scrollY, base, rung: el.dataset.ladderRung || null, depth: el.dataset.depth || null,
      reading: [...el.querySelectorAll('rt')].filter((rt) => { const s = getComputedStyle(rt); return !rt.classList.contains('hidden-rt') && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'; }).map((rt) => rt.textContent).join(''),
      title: { height: h1.getBoundingClientRect().height, lineHeight: heading.lineHeight, paddingBottom: heading.paddingBottom, fontSize: heading.fontSize },
      mini: m && m.width > 0 && m.height > 0 && ms.display !== 'none' && ms.visibility !== 'hidden' ? { x: m.x, y: m.y, width: m.width, height: m.height } : null };
  }, { selector, label });
  const baseShift = (a, b) => (a.base.length && a.base.length === b.base.length && a.base.every((g, i) => g.char === b.base[i].char)
    ? Math.max(...a.base.flatMap((g, i) => ['left', 'top', 'right', 'bottom'].map((k) => Math.abs(g[k] - b.base[i][k])))) : Infinity);
  const activeState = () => page.evaluate(({ priorSelector, selector }) => {
    const p = document.querySelector(priorSelector), t = document.querySelector(selector), a = document.activeElement, block = p.closest('[data-prose-roving]');
    return { prior: { hover: p.matches(':hover'), focusVisible: p.matches(':focus-visible'), focused: a === p, depth: p.dataset.depth || null, kept: p.dataset.kept != null },
      target: { hover: t.matches(':hover'), focused: a === t }, active: a ? { tag: a.tagName, lookup: a.dataset?.lookupText ?? null, inTitleRoving: Boolean(block && (a === block || block.contains(a))) } : null };
  }, { priorSelector, selector });
  const same = (a, b) => a.settled && b.settled && a.snapshot.revision === b.snapshot.revision && JSON.stringify(a.snapshot.record) === JSON.stringify(b.snapshot.record);
  // WebKit lays a keyboard-focused title word out anew only at its next rendering (the focus token's box-decoration-break), so
  // each state is rendered once, unrecorded, before anything is measured: a frame never straddles two layouts.
  const rendered = async () => { await page.screenshot({ animations: 'allow' }); await delay(100); };
  await rendered();
  const before = await sample('beside-before'), beforeGeometry = await titleGeometry(page, 'beside-before'), pre = await settledRecord(page);
  await (out.touch ? target.tap() : target.click());
  await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.ladderRung === 'reading', selector); await delay(350); await rendered();
  const held = await settledRecord(page), afterInput1 = await activeState();
  for (const [label, how] of [['active-hover', 'pointer hover'], ['active-key', 'keyboard Home']]) {
    let start = null, park = null;
    if (label === 'active-hover') await priorTarget.hover();
    else {
      park = await page.locator('.reader-card').evaluate((el) => { const r = el.getBoundingClientRect(), x = r.left + 2, y = r.top + 2, under = document.elementFromPoint(x, y);
        return { x, y, under: under ? { tag: under.tagName, className: String(under.className), lookup: Boolean(under.closest('.japanese-lookup-word')) } : null }; });
      await page.mouse.move(park.x, park.y); await delay(150); start = await activeState(); await page.keyboard.press('Home');
    }
    await delay(350); await rendered();
    const touched = await sample(label), state = await activeState(), geometry = await titleGeometry(page, label);
    const frameDots = await titleRingFrame(page, out, name, label, true, prior, { text: prior, kept: true });
    const ring = frameDots.find((d) => d.text === prior), targetNode = await target.evaluate((el) => el.dataset.dotsNode);
    const readingGlyphs = out.captureFrames[`${name}-${label}`].glyphs.filter((g) => g.rt && g.owner === targetNode);
    const underRing = ring ? readingGlyphs.filter((g) => g.top > ring.fragments.at(-1).bottom && g.left < ring.right + ring.spread && g.right > ring.left - ring.spread) : [];
    const record = await settledRecord(page);
    const activated = label === 'active-hover' ? state.prior.hover && !state.prior.focusVisible : state.prior.focused && state.prior.focusVisible && !state.prior.hover && !park.under?.lookup && Boolean(start?.active?.inTitleRoving);
    row(out, `${name}.${label}-input`, activated && state.prior.depth === 'met' && state.prior.kept && touched.rung === 'reading' && touched.reading === reading && !touched.mini &&
      JSON.stringify(touched.title) === JSON.stringify(before.title) && baseShift(before, touched) <= 1 && glyphShift(beforeGeometry.glyphs, geometry.glyphs) <= 1 &&
      touched.scrollX === before.scrollX && touched.scrollY === before.scrollY && (!nextLineRequired || underRing.length > 0) && same(held, record),
      { input: how, opened: 'the story again through its native door, then the word\'s native first input', afterInput1, park, start, state, target: { rung: touched.rung, reading: touched.reading, depth: touched.depth, mini: touched.mini },
        title: touched.title, before: before.title, baseShift: baseShift(before, touched), titleGlyphShift: glyphShift(beforeGeometry.glyphs, geometry.glyphs), scroll: [touched.scrollX, touched.scrollY], nextLineRequired, underRing,
        ring: ring && { box: [ring.left - ring.spread, ring.top - ring.spread, ring.right + ring.spread, ring.bottom + ring.spread], cssBottom: ring.cssGeometry.bottom },
        record: { beforeInput1: pre.snapshot.revision, held: held.snapshot.revision, after: record.snapshot.revision, input1Wrote: !same(pre, held), settled: [pre.settled, held.settled, record.settled] } });
  }
}
function ringContextAdmission(out) {
  const requiredRows = RING_LIVE.flatMap(ringRows), executedRows = out.rows.map((r) => r.id);
  const known = RING_REQUIRED.some((c) => c.caseId === ringCaseId(out.engine, out.world, out.size));
  const identity = (c) => { const spec = RING_LIVE.find((l) => l.name === c.name);
    const o = c.observed, owner = o?.readingOwners?.length === 1 ? o.readingOwners[0] : null, slip = o?.slipAnchor;
    return Boolean(spec) && c.story === spec.id && c.saved === spec.prior && c.tapped === spec.word &&
      JSON.stringify(o?.story?.listen) === JSON.stringify([spec.id]) && JSON.stringify(o?.story?.places) === JSON.stringify([`bundled-reading:${spec.id}`]) && JSON.stringify(o?.saved) === JSON.stringify([spec.prior]) &&
      Boolean(owner) && owner.rung === 'reading' && owner.lookup === spec.word && owner.base === spec.word && owner.reading === spec.reading &&
      Boolean(slip?.present && slip.connected && slip.inTitle) && slip.lookup === spec.word && slip.base === spec.word; };
  return { caseId: ringCaseId(out.engine, out.world, out.size), requiredRows, executedRows, missingRows: requiredRows.filter((id) => !executedRows.includes(id)), unexpectedRows: executedRows.filter((id) => !requiredRows.includes(id)),
    identities: (out.ringCases || []).map((c) => ({ name: c.name, story: c.story, saved: c.saved, tapped: c.tapped, observed: c.observed ?? null, bound: identity(c) })),
    accepted: known && !out.errors.length && exactRoster(executedRows, requiredRows) && out.rows.every((r) => r.passed === true) && exactRoster((out.ringCases || []).map((c) => c.name), RING_LIVE.map((l) => l.name)) &&
      out.ringCases.every((c) => c.completed && !c.error && identity(c) && exactRoster(c.rowIds, ringRows(RING_LIVE.find((l) => l.name === c.name)))) };
}
async function ringWalk(browser, out) {
  out.ringCases = [];
  for (const spec of RING_LIVE) {
    const result = { name: spec.name, story: spec.id, saved: spec.prior, tapped: spec.word, startedAt: new Date().toISOString(), rowIds: [], completed: false };
    out.ringCases.push(result); const start = out.rows.length;
    try { await freshWalk(browser, out, async (page) => { result.observed = await liveFirstState(page, out, spec); await ringDevice(page, out, spec); await worldBinding(page, out, spec.name); if (spec.besideReading) await besideReadingWalk(page, out, spec); }); result.completed = true; }
    catch (error) { result.error = String(error.stack || error); out.errors.push(`${spec.name}: ${result.error}`); console.error(`${ringCaseId(out.engine, out.world, out.size)} ${spec.name}: ${error.message}`); }
    finally { result.rowIds = out.rows.slice(start).map((r) => r.id); result.completedAt = new Date().toISOString(); save(); }
  }
  out.completedWalk = true;
  out.completedAt = new Date().toISOString();
  out.ringAdmission = ringContextAdmission(out);
  out.passed = out.ringAdmission.accepted;
  save();
}
/** Executable negatives for the roster and saved-ring verdicts: one complete, passing synthetic context per fixture
 * set, then each single alteration a receipt could carry must be refused. No browser is launched. */
function runAdmissionSelfTest() {
  const good = () => {
    const out = { engine: 'webkit', world: 'hokusai', size: 'desktop', errors: [], rows: [], ringCases: [] };
    for (const spec of RING_LIVE) { const ids = ringRows(spec); out.rows.push(...ids.map((id) => ({ id, passed: true })));
      out.ringCases.push({ name: spec.name, story: spec.id, saved: spec.prior, tapped: spec.word, completed: true, rowIds: ids,
        observed: { story: { listen: [spec.id], places: [`bundled-reading:${spec.id}`] }, saved: [spec.prior], readingOwners: [{ rung: 'reading', lookup: spec.word, base: spec.word, reading: spec.reading }],
          slipAnchor: { present: true, connected: true, inTitle: true, lookup: spec.word, base: spec.word }, selectedInput: { door: spec.id, word: spec.word } } }); }
    return out;
  };
  const altered = {
    'wrong story': (o) => { o.ringCases[1].story = 'jawiki:5238864-s63'; },
    'wrong saved word': (o) => { o.ringCases[0].saved = '大賞'; },
    'wrong tapped word': (o) => { o.ringCases[1].tapped = '巡る'; },
    'reader opened another story': (o) => { o.ringCases[0].observed.story.listen = ['wikinews:27998']; },
    'bookmarks name another story': (o) => { o.ringCases[1].observed.story.places = ['bundled-reading:jawiki:5238864-s63']; },
    'intended door chosen, another story opened': (o) => { o.ringCases[1].observed.story.listen = [STORY]; },
    'reader story missing': (o) => { o.ringCases[0].observed.story.listen = []; },
    'another word shows its reading': (o) => { o.ringCases[0].observed.readingOwners[0].lookup = '日本'; },
    'two words show readings': (o) => { o.ringCases[1].observed.readingOwners.push({ ...o.ringCases[1].observed.readingOwners[0] }); },
    'wrong reading shown': (o) => { o.ringCases[1].observed.readingOwners[0].reading = 'たいしょう'; },
    'slip opened for another word': (o) => { o.ringCases[1].observed.slipAnchor.lookup = '巡る'; o.ringCases[1].observed.slipAnchor.base = '巡る'; },
    'slip anchored outside the title': (o) => { o.ringCases[0].observed.slipAnchor.inTitle = false; },
    'saved ring absent on the page': (o) => { o.ringCases[1].observed.saved = []; },
    'saved ring duplicated': (o) => { o.ringCases[0].observed.saved = ['日本', '日本']; },
    'missing row': (o) => { o.rows.pop(); },
    'duplicate row': (o) => { o.rows.push({ ...o.rows[0] }); },
    'failed row': (o) => { o.rows[3].passed = false; },
    'missing restored reading': (o) => { const id = 'live-daijin-saved-meguru.restored-reading'; o.rows = o.rows.filter((r) => r.id !== id); o.ringCases[1].rowIds = o.ringCases[1].rowIds.filter((r) => r !== id); },
    'missing active saved-ring proof': (o) => { const id = 'live-daijin-saved-meguru-active-saved.active-mark'; o.rows = o.rows.filter((r) => r.id !== id); o.ringCases[1].rowIds = o.ringCases[1].rowIds.filter((r) => r !== id); },
    'missing active saved-ring input': (o) => { const id = 'live-daijin-saved-meguru.active-saved-input'; o.rows = o.rows.filter((r) => r.id !== id); o.ringCases[1].rowIds = o.ringCases[1].rowIds.filter((r) => r !== id); },
    'missing leading breakpoint proof': (o) => { const id = 'live-daisho-saved-nihon.title-leading-breakpoint'; o.rows = o.rows.filter((r) => r.id !== id); o.ringCases[0].rowIds = o.ringCases[0].rowIds.filter((r) => r !== id); },
    'missing narrow hover beside the reading': (o) => { const id = 'live-daisho-saved-nihon-active-hover.no-other-glyph-overlap'; o.rows = o.rows.filter((r) => r.id !== id); o.ringCases[0].rowIds = o.ringCases[0].rowIds.filter((r) => r !== id); },
    'missing narrow keyboard input beside the reading': (o) => { const id = 'live-daisho-saved-nihon.active-key-input'; o.rows = o.rows.filter((r) => r.id !== id); o.ringCases[0].rowIds = o.ringCases[0].rowIds.filter((r) => r !== id); },
    'missing scene proof': (o) => { const id = 'live-daisho-saved-nihon-before.scene-settled'; o.rows = o.rows.filter((r) => r.id !== id); o.ringCases[0].rowIds = o.ringCases[0].rowIds.filter((r) => r !== id); },
    'missing uncovered continuation': (o) => { const id = 'live-daijin-saved-meguru-stage-met-uncovered.ring-clear-of-ink'; o.rows = o.rows.filter((r) => r.id !== id); o.ringCases[1].rowIds = o.ringCases[1].rowIds.filter((r) => r !== id); },
    'occluded stage-met raster substituted': (o) => { const from = 'live-daijin-saved-meguru-stage-met-uncovered.ring-clear-of-ink', to = 'live-daijin-saved-meguru-stage-met.ring-clear-of-ink'; o.rows.find((r) => r.id === from).id = to; o.ringCases[1].rowIds = o.ringCases[1].rowIds.map((r) => (r === from ? to : r)); },
    'page error': (o) => { o.errors.push('pageerror'); },
    'incomplete case': (o) => { o.ringCases[0].completed = false; },
    'missing fixture': (o) => { o.ringCases.pop(); },
    'unknown context': (o) => { o.size = 'tablet'; },
  };
  const ringInk = { probeId: 'n-1', text: '巡る', depth: 'met', kept: true, painted: 120, ringPainted: 60, hits: {} };
  const saved = {
    'lost kept attribute': [['n-1'], [{ ...ringInk, kept: false }]],
    'ring band unpainted': [['n-1'], [{ ...ringInk, ringPainted: 0 }]],
    'saved word lost its depth': [['n-1'], [{ ...ringInk, depth: null }]],
    'saved occurrence not painted at all': [['n-1'], [{ ...ringInk, painted: 0, ringPainted: 0 }]],
    'saved occurrence missing from paint': [['n-1'], [{ ...ringInk, probeId: 'n-2' }]],
    'two saved occurrences': [['n-1', 'n-3'], [ringInk]],
  };
  const markedRing = { ...ringInk, coveredBySlip: false, hits: { own: 0, other: 0, reading: 0, mark: 0, unattributed: 0 } }, mark = { probeId: 'n-1', text: '巡る', markInk: 40, bands: [] };
  const metFill = { ...markedRing, probeId: 'n-2', text: '大臣', kept: false, ringPainted: 0 }, metMark = { ...mark, probeId: 'n-2', text: '大臣' };
  const touched = {
    'touched mark absent': [[], [markedRing], { text: '巡る', kept: true }],
    'touched mark unpainted (still in the bare frame)': [[{ ...mark, markInk: 0 }], [markedRing], { text: '巡る', kept: true }],
    'ring painted on the mark': [[mark], [{ ...markedRing, hits: { ...markedRing.hits, mark: 3 } }], { text: '巡る', kept: true }],
    'mark census not taken': [[mark], [{ ...markedRing, hits: { own: 0, other: 0, reading: 0, unattributed: 0 } }], { text: '巡る', kept: true }],
    'touched ring under the slip': [[mark], [{ ...markedRing, coveredBySlip: true }], { text: '巡る', kept: true }],
    'touched ring band unpainted': [[mark], [{ ...markedRing, ringPainted: 0 }], { text: '巡る', kept: true }],
    'another word touched': [[metMark], [markedRing, metFill], { text: '巡る', kept: true }],
    'met fill on its own mark': [[metMark], [{ ...metFill, hits: { ...metFill.hits, mark: 12 } }], { text: '大臣', kept: false }],
    'met fill expected, saved ring found': [[mark], [markedRing], { text: '巡る', kept: false }],
    'untouched dot on another mark': [[metMark], [metFill, { ...markedRing, hits: { ...markedRing.hits, mark: 1 } }], null],
  };
  const settled = { observer: true, generation: 1, viewTransitions: 1, activeViewTransitions: 0, transition: false, hero: false, arrival: false, mainOpacity: '1', room: [], view: 'reader', mainBound: true };
  const bound = { generation: 1, viewTransitions: 1 };
  const scenes = {
    'room transition marker present': { ...settled, transition: true }, 'room hero marker present': { ...settled, hero: true }, 'main still arriving': { ...settled, arrival: true },
    'main not yet opaque': { ...settled, mainOpacity: '0.98' }, 'view transition unfinished': { ...settled, activeViewTransitions: 1 },
    'outgoing room snapshot still animating': { ...settled, room: [{ name: 'kairo-room-leave', pseudo: '::view-transition-old(kairo-room)', state: 'running', pending: false }] },
    'arrival animation pending': { ...settled, room: [{ name: 'kairo-room-arrive', pseudo: null, state: 'running', pending: true }] },
    'another transition began during the batch': { ...settled, generation: 2 }, 'another view transition began': { ...settled, viewTransitions: 2 },
    'main element replaced': { ...settled, mainBound: false }, 'not the reader': { ...settled, view: 'shelf' }, 'observer absent': { ...settled, observer: false },
  };
  const results = { positive: { admission: ringContextAdmission(good()).accepted, savedOccurrence: savedOccurrenceVerdict(['n-1'], [ringInk]).passed, settledScene: settledScene(settled, bound),
    touchedSavedRing: activeMarkVerdict([mark], [markedRing], { text: '巡る', kept: true }).passed, touchedMetFill: activeMarkVerdict([metMark], [markedRing, metFill], { text: '大臣', kept: false }).passed, untouchedFrame: activeMarkVerdict([], [markedRing], null).passed },
    refused: Object.fromEntries([...Object.entries(altered).map(([k, f]) => { const o = good(); f(o); return [k, !ringContextAdmission(o).accepted]; }),
      ...Object.entries(saved).map(([k, [occ, ink]]) => [k, !savedOccurrenceVerdict(occ, ink).passed]),
      ...Object.entries(scenes).map(([k, state]) => [`scene: ${k}`, !settledScene(state, bound)]),
      ...Object.entries(touched).map(([k, [marks, ink, expected]]) => [`mark: ${k}`, !activeMarkVerdict(marks, ink, expected).passed])]) };
  const markFixture = option('--mark-fixture');
  if (markFixture) {
    // c15c5bfd's retained Chromium 1440 藍 frame (DOTS-SHOT-1): 大臣's met fill over its own 0.5px mark, which the old bare frame kept.
    const receipt = JSON.parse(readFileSync(resolve(markFixture, 'verify-depth-visibility-title-rings.json'), 'utf8'));
    const context = receipt.contexts.find((c) => c.engine === 'chromium' && c.world === 'hokusai' && c.size === 'desktop'), frame = 'live-daijin-saved-meguru-stage-met-restored';
    const read = (suffix) => png(readFileSync(resolve(markFixture, `chromium-hokusai-desktop-${frame}${suffix}.png`)));
    const [shown, paper, bare] = ['', '-paper', '-bare'].map(read), view = context.rows.find((r) => r.id === `${frame}.ring-clear-of-ink`).detail.view;
    const dot = context.measurements[frame].find((d) => d.depth === 'met' && !d.kept), foot = dot.fragments.at(-1), band = { left: foot.left, right: foot.right, top: foot.bottom - 0.5, bottom: foot.bottom };
    const ink = context.rows.find((r) => r.id === `${frame}.ring-clear-of-ink`).detail.ink.find((d) => d.probeId === dot.probeId);
    const differs = (a, b) => a.some((v, k) => Math.abs(v - b[k]) > 3), rows = (b) => [Math.floor((b.top - view.y) * view.dpr), Math.ceil((b.bottom - view.y) * view.dpr)], cols = (b) => [Math.floor((b.left - view.x) * view.dpr), Math.ceil((b.right - view.x) * view.dpr)];
    let markInk = 0, paintedOnMark = 0;
    for (let y = rows(band)[0]; y < rows(band)[1]; y++) for (let x = cols(band)[0]; x < cols(band)[1]; x++) {
      if (differs(pix(paper, x, y), pix(bare, x, y))) markInk++;
      const cx = (x + 0.5) / view.dpr + view.x; if (cx >= dot.left - 1 && cx <= dot.right + 1 && differs(pix(shown, x, y), pix(paper, x, y))) paintedOnMark++;
    }
    const verdict = activeMarkVerdict([{ probeId: dot.probeId, text: '大臣', markInk, bands: [band] }], [ink], { text: '大臣', kept: false });
    results.markFixture = { dir: markFixture, receiptSha256: hash(readFileSync(resolve(markFixture, 'verify-depth-visibility-title-rings.json'))), producer: receipt.verifierSha256, dot: dot.probeId, band, markInk, paintedOnMark, oldHits: ink.hits };
    results.refused['retained c15 frame: met fill on a mark the old bare frame kept'] = !verdict.passed && markInk === 0 && paintedOnMark > 0;
  }
  const fixture = option('--scene-fixture');
  if (fixture) {
    // Native fix3's retained WebKit desktop batch: BEFORE's shown shot still holds the outgoing shelf; READING is settled.
    const receipt = JSON.parse(readFileSync(resolve(fixture, 'verify-depth-visibility-title-rings.json'), 'utf8'));
    const context = receipt.contexts.find((c) => c.engine === 'webkit' && c.world === 'hokusai' && c.size === 'desktop');
    const batch = (frame) => { const name = `webkit-hokusai-desktop-live-daisho-saved-nihon-${frame}`, read = (suffix) => png(readFileSync(resolve(fixture, `${name}${suffix}.png`)));
      const circles = dotCircles(context.measurements[`live-daisho-saved-nihon-${frame}`]), view = context.rows.find((r) => r.id === `live-daisho-saved-nihon-${frame}.ring-clear-of-ink`).detail.view;
      return sceneStability({ shown: read(''), paper: read('-paper'), restored: read('') }, circles, view); };
    const before = batch('before'), reading = batch('reading');
    results.fixture = { dir: fixture, receiptSha256: hash(readFileSync(resolve(fixture, 'verify-depth-visibility-title-rings.json'))), before, reading };
    results.positive.settledRetainedReading = reading.outsideChanged === 0;
    results.refused['retained fix3 BEFORE batch with the outgoing shelf'] = !before.stable && before.outsideChanged > 0;
  }
  const passed = Object.values(results.positive).every(Boolean) && Object.values(results.refused).every(Boolean);
  console.log(JSON.stringify({ selfTestAdmission: passed, ...results }, null, 1));
  return passed;
}
async function one(browser, engine, world, size = defaultSize(engine)) {
  const out = { engine, version: browser.version(), world, size, viewport: DEVICES[size].viewport, deviceScaleFactor: 2, touch: DEVICES[size].touch, startedAt: new Date().toISOString(), rows: [], measurements: {}, errors: [] };
  report.contexts.push(out); save();
  if (lateLookup) return lateWalk(browser, out);
  if (titleRings) return ringWalk(browser, out);
  const context = await openContext(browser, engine, world, size);
  try {
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', (e) => out.errors.push(String(e)));
    await seed(page, out);
    await worldBinding(page, out, 'reader');
    await page.evaluate(() => { const el = document.querySelector('#reader .tok[data-index]'); window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + scrollY - 160)); });
    await delay(400);
    await page.screenshot({ path: resolve(evidence, `${engine}-${world}-reader-viewport.png`), fullPage: false });
    const dots = await capture(page, out, 'reader', '#reader .tok:is([data-depth],[data-kept]) > .tok-word');
    checkPaint(out, 'reader', dots);
    const stateAudit = await page.evaluate(() => [...document.querySelectorAll('#reader .tok[data-index]')].flatMap((el) => {
      const node = window.__KAIRO_DEPTH__.readerNode(Number(el.dataset.index));
      const expected = node ? window.__KAIRO_DEPTH__.depth(node) : null;
      if (!expected || (expected.depth === 'unmet' && !expected.kept)) return [];
      return [{ index: el.dataset.index, expectedDepth: expected.depth, expectedKept: expected.kept, actualDepth: el.dataset.depth || null, actualKept: el.dataset.kept != null }];
    }));
    row(out, 'reader.all-stateful', stateAudit.length > 0 && stateAudit.every((r) => r.expectedDepth === r.actualDepth && r.expectedKept === r.actualKept && dots.some((d) => d.index === r.index && d.raster.changedPixels >= 4)), stateAudit);
    const byIndex = (id) => dots.find((d) => d.index === String(PARA[id]));
    const met = byIndex('met'), owned = byIndex('owned'), recalled = byIndex('recalled');
    row(out, 'reader.fixture-states', met?.depth === 'met' && owned?.depth === 'owned' && recalled?.depth === 'recalled' && owned.kept && byIndex('listed')?.kept, { met: met?.depth, owned: owned?.depth, recalled: recalled?.depth });
    const states = met?.raster.fill && owned?.raster.fill && owned?.raster.ring ? { metKnown: delta(met.raster.fill, owned.raster.fill), metSaved: delta(met.raster.fill, owned.raster.ring), knownSaved: delta(owned.raster.fill, owned.raster.ring) } : {};
    row(out, 'reader.semantic-separation', Object.keys(states).length === 3 && Object.values(states).every((d) => d >= 10) && met.raster.fillContrast < recalled.raster.fillContrast && met.raster.fillContrast < owned.raster.fillContrast, states);
    const collisions = await page.evaluate((dots) => {
      const glyphs = [];
      for (const tok of document.querySelectorAll('#reader .tok')) {
        const walker = document.createTreeWalker(tok, NodeFilter.SHOW_TEXT); let text;
        while ((text = walker.nextNode())) { const p = text.parentElement; if (!p || !text.textContent.trim()) continue; const style = getComputedStyle(p); if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
          for (let i = 0; i < text.length; i++) { const range = document.createRange(); range.setStart(text, i); range.setEnd(text, i + 1); for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) glyphs.push({ index: tok.dataset.index, rt: !!p.closest('rt'), left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY }); }
        }
      }
      return dots.flatMap((d) => glyphs.filter((g) => g.index !== d.index && d.left - d.spread < g.right && d.right + d.spread > g.left && d.top - d.spread < g.bottom && d.bottom + d.spread > g.top).map((g) => ({ dot: d.index, glyph: g })));
    }, dots);
    row(out, 'reader.no-next-line-overlap', collisions.length === 0, collisions);
    await ladderContract(page, out);
    await titleCard(page, out);
    console.log(JSON.stringify({ engine, world, metrics: { met: met?.raster, owned: owned?.raster, recalled: recalled?.raster }, states })); save();
    await rooms(page, out);
    await worldBinding(page, out, 'after-rooms');
    await freshWalk(browser, out, (fresh) => contextCard(fresh, out));
    for (const live of LIVE) await freshWalk(browser, out, (fresh) => liveFirstState(fresh, out, live));
    out.completedWalk = true;
  } catch (error) { out.errors.push(String(error.stack || error)); console.error(`${engine}/${world}: ${error.message}`); }
  finally { await context.close(); out.completedAt = new Date().toISOString(); out.passed = !out.errors.length && out.completedWalk && out.rows.length >= 24 && out.rows.every((r) => r.passed); save(); }
}
if (selfTestAdmission) process.exitCode = runAdmissionSelfTest() ? 0 : 1;
else try {
  report.load = execFileSync('uptime', { encoding: 'utf8' }).trim();
  if (process.env.DOTS_BASE_URL) {
    assert(!process.env.KAIRO_SITE_DIR && !controlBytes && !diagnosticInlineEnd, 'Remote evidence cannot impersonate a local artifact or use mutation controls');
    base = new URL(process.env.DOTS_BASE_URL); assert(base.protocol === 'https:' && base.pathname.endsWith('/'), 'DOTS_BASE_URL must be an HTTPS directory');
    const response = await fetch(new URL('build-identity.json', base)); assert(response.ok, 'Remote build identity missing'); const bytes = Buffer.from(await response.arrayBuffer()); report.identity = JSON.parse(bytes); report.identityBytesSha256 = hash(bytes);
    assert.equal(report.identity.gitSha, '09c9239dccea32242873c312a4866ca9f5080c11', 'Live build is not expected 09c9239d'); report.mode = 'remote evidence only';
    const css = await fetch(new URL('editorial.css', base)); assert(css.ok, 'Remote CSS missing'); const cssBytes = Buffer.from(await css.arrayBuffer()); report.remoteCssBytesSha256 = hash(cssBytes);
    assert.equal(report.remoteCssBytesSha256, report.identity.files?.find((f) => f.path === 'editorial.css')?.sha256, 'Remote CSS bytes must match build identity');
  } else { const site = resolveCorridorSite(); report.site = site; report.identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8')); host = await startStaticHost({ site, port: 0 }); base = new URL(`${host.origin}/`); report.mode = 'local artifact'; }
  report.baseUrl = base.href; save();
  const runEngine = async (engine) => { const browser = await ({ webkit, chromium }[engine]).launch({ headless: true }); try { for (const world of worlds) for (const size of titleRings ? RING_SIZES : [defaultSize(engine)]) await one(browser, engine, world, size); } finally { await browser.close(); } };
  report.parallelEngines = process.env.DOTS_PARALLEL_ENGINES === '1';
  if (report.parallelEngines) await Promise.all(engines.map(runEngine)); else for (const engine of engines) await runEngine(engine);
} catch (error) { report.errors.push(String(error.stack || error)); console.error(error.message); }
finally {
  if (report.mode === 'remote evidence only') {
    try { const response = await fetch(new URL('build-identity.json', base)); assert(response.ok, 'Remote identity recheck missing'); const bytes = Buffer.from(await response.arrayBuffer()); report.identityAfterBytesSha256 = hash(bytes); report.identityAfter = JSON.parse(bytes); assert.equal(report.identityAfterBytesSha256, report.identityBytesSha256, 'Remote identity changed during evidence run'); assert(report.remoteCssServed?.length, 'No bound remote CSS was served'); } catch (error) { report.errors.push(String(error.stack || error)); }
  }
  if (host) await host.close();
  report.completedAt = new Date().toISOString();
  report.passed = !report.errors.length && !report.control.setupError && report.contexts.length === engines.length * worlds.length * (titleRings ? RING_SIZES.length : 1) && report.contexts.every((c) => c.passed) && (!controlBytes || report.control.served.length > 0);
  report.fullAcceptance = report.passed && report.scope.full && report.mode === 'local artifact' && !controlBytes && !diagnosticInlineEnd;
  if (lateLookup) {
    const requiredContexts = LATE_ENGINES.flatMap((engine) => LATE_WORLDS.map((world) => `${engine}/${world}`));
    const requiredCases = LATE_REQUIRED.map((c) => c.caseId);
    const executedCases = report.contexts.flatMap((c) => (c.lateCases || []).map((entry) => entry.caseId));
    const requiredRows = LATE_REQUIRED.flatMap((c) => c.rows.map((id) => `${c.engine}/${c.world}/${id}`));
    const executedRows = report.contexts.flatMap((c) => c.rows.map((r) => `${c.engine}/${c.world}/${r.id}`));
    report.lateAdmission = { requiredContexts, executedContexts: report.contexts.map((c) => `${c.engine}/${c.world}`), requiredCases, executedCases, requiredRows, executedRows,
      missingCases: requiredCases.filter((id) => !executedCases.includes(id)), unexpectedCases: executedCases.filter((id) => !requiredCases.includes(id)),
      accepted: report.passed && report.mode === 'local artifact' && !controlBytes && !diagnosticInlineEnd && exactRoster(engines, LATE_ENGINES) && exactRoster(worlds, LATE_WORLDS) &&
        exactRoster(report.contexts.map((c) => `${c.engine}/${c.world}`), requiredContexts) && exactRoster(executedCases, requiredCases) && exactRoster(executedRows, requiredRows) &&
        report.contexts.every((c) => c.completedWalk && lateContextAdmission(c).accepted) };
    report.lateRosterAccepted = report.lateAdmission.accepted;
  }
  if (titleRings) {
    const requiredCases = RING_REQUIRED.map((c) => c.caseId), executedCases = report.contexts.map((c) => ringCaseId(c.engine, c.world, c.size));
    const requiredRows = RING_REQUIRED.flatMap((c) => c.rows.map((id) => `${c.caseId}/${id}`)), executedRows = report.contexts.flatMap((c) => c.rows.map((r) => `${ringCaseId(c.engine, c.world, c.size)}/${r.id}`));
    report.titleRingAdmission = { requiredCases, executedCases, missingCases: requiredCases.filter((id) => !executedCases.includes(id)), unexpectedCases: executedCases.filter((id) => !requiredCases.includes(id)),
      failedRows: report.contexts.flatMap((c) => c.rows.filter((r) => !r.passed).map((r) => `${ringCaseId(c.engine, c.world, c.size)}/${r.id}`)), requiredRowCount: requiredRows.length, executedRowCount: executedRows.length,
      accepted: report.passed && report.mode === 'local artifact' && !controlBytes && !diagnosticInlineEnd && exactRoster(engines, RING_ENGINES) && exactRoster(worlds, WORLDS) &&
        exactRoster(executedCases, requiredCases) && exactRoster(executedRows, requiredRows) && report.contexts.every((c) => c.completedWalk && ringContextAdmission(c).accepted) };
    report.titleRingRosterAccepted = report.titleRingAdmission.accepted;
    report.fullAcceptance = false;
  }
  report.control.killed = Boolean(controlBytes && !report.control.setupError && !report.errors.length && report.contexts.every((c) => !c.errors.length) && report.control.served.length && report.contexts.some((c) => c.rows.some((r) => /^(reader|title|context|slip|basis|prose|tray|today|mirror)(?:-[a-z]+)*\.(size|contrast|nonempty|semantic-separation)$/.test(r.id) && !r.passed)));
  save(); console.log(`DOTS ${report.passed ? 'PASS' : 'FAIL'}: ${evidence}`); if (!report.passed) process.exitCode = 1;
}
