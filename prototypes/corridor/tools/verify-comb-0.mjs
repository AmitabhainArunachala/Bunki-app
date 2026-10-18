/**
 * Q · the comb, round 0 (one-hand/Q/BRIEF.md; John, 2026-10-16: "be systematic about everythign!! these are amateur
 * mistakes"). One named check per finding, on the staged artifact, in the engine KAIRO_BROWSER names (webkit or chromium;
 * both when unset), at 390×844 and 320 wide, in English and 日本語:
 *   G8   Guided opens: a warm open under 1 s; a cold one under 1 s or with its quiet progress line on screen;
 *   G12  the reader's Save fits its bar whole: one line, nothing cut, the bar inside the phone, the touched word named
 *        (shown when it fits, always in its accessible name), the longest word on the shelf included;
 *   G2/3 Japanese breaks only between words: the shelf's titles and ledes, a reader (body, title card, foot), a deck's
 *        front (no doors) and back: never inside a token, a number, a katakana word or before a word's kana ending;
 *   G10  a deck's answer is never under its grade bar: what the answer says stands above the bar when it shows, no fold
 *        row is cut by the bar's edge, and at the end of the scroll nothing is under it;
 *   G11  every room clears its bars (top and end); in Chromium, which alone can set the phone's insets, the report sheet
 *        and the focus room's grade bar clear the status bar and the home indicator;
 *   G6   the sky cuts no word at the glass: every word or glyph across an edge is dissolved (under 0.02) 3 px inside it;
 *   G7   the word web fits: every lens whole or not shown, the legend over no node's words, no label's ink outside the
 *        plate, no catalogue words in a caption; on the day's web (from today's word: it changes with the date) and on a
 *        fixed set seeded beside it, so the verdict cannot depend on the date (G7_FIXED);
 *   G4   a word's card keeps 8 px clear of the word and the reading drawn over it; each kanji's parts shown once, at
 *        their own level (none inside another shown part, never two forms of one part, strokes within the kanji's),
 *        named in plain meanings; 総 = 糸 + 忩;
 *   G5   Today's hook names a part only when it is the radical of every kanji it is said to hide in;
 *   G13  a learner meets learner words: the report sheet, the tutor and Settings keep ids, GitHub, addresses and models
 *        under one quiet Details, closed;
 *   G14  Me's lines for goals not begun are plain sentences, not capitals; his own D5 words stay word for word;
 *   G1   the shelf's count is the number of stories on the shelf, the same in both languages;
 *   13a  ticking a list in the Save menu keeps the keyboard on that box (WebKit never focuses a clicked checkbox);
 *   13b  a report with a screenshot saves with the device offline (the screenshot is read once, when chosen).
 * Negative controls (COMB_NEGATIVE=<one>): breaks, save, gradebar, safe, sky, web, labels, plain, card, parts, hook,
 * details, me, count, focus, offline, guided. Each puts its defect back (CSS over the page, or the base's own code served
 * for the changed lines) and its class's check must go red. Claim boundary: headless engines on a desk, not a phone; the
 * insets are emulated in Chromium only; the sky is sampled, not watched.
 */
/* global window, document, getComputedStyle, innerWidth, innerHeight, Node, NodeFilter, indexedDB */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

const NEGATIVE = process.env.COMB_NEGATIVE || '';
const out = resolveCorridorEvidence();
mkdirSync(out, { recursive: true });
const host = await startCorridorDev(0);
const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail: String(detail).slice(0, 1500) });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${String(detail).slice(0, 300)}` : ''}`);
};
const engines = process.env.KAIRO_BROWSER === 'chromium' ? { chromium }
  : process.env.KAIRO_BROWSER === 'webkit' ? { webkit } : { chromium, webkit };
const WIDTHS = [390, 320];
const LANGS = ['bi', 'ja'];
const STARTUP = 'kantei:jp-105-actions-202609-25startup';
// G7's fixed webs, seeded so its verdict cannot depend on the date: 健康 (the day's web on 2026-10-18, where the
// critic measured "dotted cliff radical (no…" 45 px past the plate at 390); the webs whose captions pressed hardest on
// the plate's edge in a scan of 206 webs at both widths in both languages (Q/probe/webscan2.mjs): 同局 (冂 upside-down
// box), 噴出 (凵), 免許証 (勹), 特製 (寺), 臼's family, 行楽地 (彳 ぎょうにんべん in 日本語); and the three the check began with
const G7_FIXED = [['word', '健康'], ['word', '同局'], ['word', '噴出'], ['word', '免許証'], ['word', '特製'], ['part', '臼'],
  ['word', '行楽地'], ['kanji', '総'], ['part', '冋'], ['word', '会社']].map(([type, key]) => ({ type, key }));
// the rooms whose text the app sets itself (el(), setJaWords); the JLPT room, Guided, the reference library's title and the
// deck home set theirs in their own modules, outside this slice (Q/DESIGN.md, the last line)
const ROOMS_JA = ['tray', 'saved', 'list', 'dojo', 'probe', 'lessons', 'feed', 'settings', 'me', 'kagami', 'search', 'thesaurus', 'ai', 'airead',
  'source-inbox', 'source-reader', 'publisher', 'grammar', 'yoji', 'kanjidex', 'srs-stats', 'archive', 'browse', 'contextdeck', 'sentence-practice', 'aiquiz', 'personaldeck'];

// the doors this check walks through, appended to the module's own source (changes nothing it does not name)
const BRIDGE = `
window.__COMB__ = {
  open: async (id) => { try { removeMini(); } catch {} S.stack = []; const p = D.passages.find((x) => x.id === id); if (!p) return false; await ensureArticle(p); openPassage(p.id); window.scrollTo(0, 0); return true; },
  visit: (v) => { try { removeMini(); } catch {} S.stack = []; S.strokes = null; S.view = v; render(); window.scrollTo(0, 0); return S.view; },
  run: (src) => eval(src),
};`;
// the negative controls: the defect put back, as CSS over the page or as the base's own lines served in place of the fix
const NEG_CSS = {
  breaks: `:is(.ja-words, .ja-flow) { word-break: normal !important; } .ja-unit, #reader span.tok.plain, #app .kp-sentence :is(.kp-w, .kp-tok) { white-space: normal !important; }`,
  save: `#app > .chrome button.save-one.chrome-keep { flex: none !important; width: 52px !important; } #app > .chrome .chrome-keep .save-bar-word { display: inline !important; }`,
  safe: `#bunki-reports-root .br-heading { padding-top: 18px !important; } body.has-primary-tabs:has(#app :is(.kp-study, .kp-done)) .kp-grades { bottom: env(safe-area-inset-bottom, 0px) !important; }`,
  sky: `#drift-layer :is(#sky, #fx) { -webkit-mask-image: none !important; mask-image: none !important; } .sky-edge { display: none !important; }`,
  web: `html:is([data-room='search'], [data-room='word-web']) .ww-plate { height: 404px !important; } html:is([data-room='search'], [data-room='word-web']) .ww-plate-in { position: absolute !important; inset: 0 !important; height: auto !important; } html:is([data-room='search'], [data-room='word-web']) .ww-legend { position: absolute !important; left: 12px !important; right: 12px !important; bottom: 9px !important; padding: 0 !important; } #search-lenses > .kdx-lens[data-out] { opacity: 1 !important; }`,
  me: `html[data-room='me'] body.ui-bi .me-hz-sub.is-sentence { text-transform: uppercase !important; }`,
  // the label rule removed: a caption 92 px wide wherever it stands, centred under its node, whatever the plate's edge
  labels: `html:is([data-room='search'], [data-room='word-web']) .ww-cap { max-width: 92px !important; translate: none !important; }`,
};
const NEG_SOURCE = {
  card: [['corridor.js', 'function anchorBox(anchor) {', 'function anchorBox(anchor) { return anchor.getBoundingClientRect();']],
  parts: [['corridor.js', 'function mainParts(c) {\n  const k = D.kanji[c];', "function mainParts(c) {\n  if (c === '総') return ['糸', '忩', '公'];\n  const k = D.kanji[c];"]],
  hook: [['corridor.js', 'function todayIsRadical(part, c) {', 'function todayIsRadical(part, c) { return true;']],
  count: [['corridor.js', 'function shelfTallyText(list) {', 'function shelfTallyText(list) { list = [...list, list[0]];']],
  focus: [['corridor.js', "box.addEventListener('change', () => { focusList = listName; void setMembership(listName, box.checked); });", "box.addEventListener('change', () => void setMembership(listName, box.checked));"]],
  // the base's seating: only the definition is budgeted above the pads (the note and the rest may sit under them), and
  // only the folds' summaries are rows the pads may not cut
  gradebar: [['decks/player/mount.js', 'function answerSaid(def) {', 'function answerSaid(def) { return def;'],
    ['decks/player/mount.js', "const FOLD_ROWS = '.kp-folds > details > summary, .kp-folds > :not(details)';", "const FOLD_ROWS = '.kp-folds > details > summary';"]],
  offline: [['maintenance/report-client.js', 'mime_type: file.type, bytes: bytes[i] })', 'mime_type: file.type, blob: file })']],
  // the web's kanji and parts named by the table's whole meaning again ("dotted cliff radical (no. 53)")
  plain: [['corridor.js', '  return { en: partMeaning(k.m), ja:', "  return { en: String(k.m || '').toLowerCase(), ja:"],
    ['corridor.js', '    en: partGloss(null, p) || `${count} kanji`,', '    en: D.kanji[p]?.m ? String(D.kanji[p].m).toLowerCase() : `${count} kanji`,']],
  guided: [['corridor.js', 'function openGuidedRoom(from) {', 'function openGuidedRoom(from) { const until = performance.now() + 1500; while (performance.now() < until) { /* the negative control: a slow open */ }']],
};

function NEG_SOURCE_CHECK() { return NEGATIVE ? (NEG_SOURCE[NEGATIVE] || []) : []; }
// in-page instruments: text leaves, their glyph boxes, and where a block's lines break
const INSTRUMENTS = `window.__I__ = (() => {
  const shown = (el) => { for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false; if (n !== el && s.overflow !== 'visible' && (n.clientWidth <= 2 || n.clientHeight <= 2)) return false; } const shut = el.closest('details:not([open])'); if (shut && !el.closest('summary')) return false; const r = el.getBoundingClientRect(); return r.width > 0.5 && r.height > 0.5; };
  const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const rects = (el) => [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).flatMap((n) => { const r = document.createRange(); r.selectNodeContents(n); return [...r.getClientRects()]; }).filter((r) => r.width > 0.5 && r.height > 0.5);
  const leaves = (root = document.body) => { const out = []; const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT); while (w.nextNode()) { const el = w.currentNode; if (el.closest('svg, script, style, template, [aria-hidden="true"], .visually-hidden, rt, rp')) continue; if (!own(el) || !shown(el)) continue; out.push(el); } return out; };
  // a block's glyphs in order, each with the unit element it belongs to, and the indices where a new line starts
  const lines = (el, unitSel) => { const g = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const n = w.currentNode; if (n.parentElement.closest('rt, rp, .tok-en, .visually-hidden, .tok-state, [aria-hidden="true"]')) continue; const unit = unitSel ? n.parentElement.closest(unitSel) : null; for (let i = 0; i < n.length; i += 1) { const ch = n.data[i]; if (/\\s/.test(ch)) { g.push({ ch: ' ', space: true }); continue; } const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = [...r.getClientRects()].find((x) => x.width > 0.1); if (b) g.push({ ch, top: b.top, bottom: b.bottom, left: b.left, right: b.right, unit: unit && el.contains(unit) ? unit : null }); } } const breaks = []; let prev = null; g.forEach((x, i) => { if (x.space) return; if (prev && x.top > prev.bottom - (prev.bottom - prev.top) * 0.35 && x.left < prev.left) breaks.push({ i, inUnit: !!x.unit && x.unit === prev.unit }); prev = x; }); return { text: g.map((x) => x.ch).join(''), glyphs: g, breaks }; };
  return { shown, own, rects, leaves, lines };
})();`;

// the plain oracle for a break before text[i] in untokenised Japanese (the app's own word rule is not consulted)
const KATA = /[ァ-ヺー]/u;
const KANJI = /[一-鿿々]/u;
const HIRA = /[ぁ-ゖ]/u;
const DIGIT = /[0-9０-９]/u;
const CLOSE = /[、。，．！？」』）〉》〕］｝ー〜…‥ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]/u;
const OPEN = /[「『（〈《〔［｛]/u;
// what a number counts (年, 月, 回, 人 …): a number and its counter are one word; any other kanji word after a number
// (1.2.1｜通常版) is a word of its own
const COUNTER = /[年月日時分秒回号人本件個円歳条位度階巻章話部点名社台枚冊匹頭羽杯軒週代種目期次世紀万億兆割倍％%]/u;
// a word's kana ending, as the plain oracle can know it without a dictionary: the okurigana of a one-kanji stem (並｜ぶ,
// 始｜まる, 思｜う) or a one-kana particle on a kanji or katakana word (熟語｜の, 決心｜の): a kana word of its own after
// a longer word (先生｜ことば, 通常版｜この) is not an ending
const PARTICLE = /[はがをにでとのもへや]/u;
function kanaEnding(text, i) {
  const stem = /[\p{Script=Han}々]+$/u.exec(text.slice(0, i))?.[0] || '';
  const kana = /^\p{Script=Hiragana}+/u.exec(text.slice(i))?.[0] || '';
  if ([...stem].length === 1 && !/\p{Script=Han}/u.test(text[i - 2] || '')) return true;
  return PARTICLE.test(kana[0] || '') && kana.length === 1;
}
function badBreak(text, i) {
  const a = text[i - 1], b = text[i];
  if (!a || !b || /\s/u.test(a) || /\s/u.test(b)) return '';
  if (DIGIT.test(a) && DIGIT.test(b)) return 'inside a number';
  if (a === '第' && DIGIT.test(b)) return 'between 第 and its number';
  if (DIGIT.test(a) && COUNTER.test(b)) return 'between a number and its counter';
  if (KATA.test(a) && KATA.test(b)) return 'inside a katakana word';
  if (HIRA.test(b) && (KANJI.test(a) || KATA.test(a)) && kanaEnding(text, i)) return 'before a word\'s kana ending';
  if (CLOSE.test(b)) return 'before a closing mark';
  if (OPEN.test(a)) return 'after an opening mark';
  return '';
}
// a break inside a katakana run is the emergency only when the run alone is wider than the block's line
function katakanaRunWidth(lines, i) {
  let s = i, e = i;
  while (s > 0 && KATA.test(lines.glyphs[s - 1]?.ch || '')) s -= 1;
  while (e < lines.glyphs.length && KATA.test(lines.glyphs[e]?.ch || '')) e += 1;
  return lines.glyphs.slice(s, e).reduce((w, g) => w + ((g.right ?? 0) - (g.left ?? 0)), 0);
}

// the in-word breaks of untokenised blocks by the plain oracle; the two emergencies a whole line cannot hold are let pass:
// a katakana word wider than the whole line, and a long word's kana ending taking the next line (the word stays whole)
function judge(blocks) {
  const bad = [];
  for (const b of blocks) for (const i of b.breaks) {
    const why = badBreak(b.text, i);
    if (!why) continue;
    if (why === 'inside a katakana word' && katakanaRunWidth(b, i) > b.width - 1) continue;
    if (why === 'before a word\'s kana ending' && /[\p{Script=Han}\p{Script=Katakana}ー々0-9０-９A-Za-zＡ-Ｚａ-ｚ]{6,}$/u.test(b.text.slice(0, i))) continue;
    if ((why === 'before a closing mark' || why === 'after an opening mark') && KATA.test(b.text[i - 1] || '') && KATA.test(b.text[i] || '') && katakanaRunWidth(b, i) > b.width - 1) continue;
    bad.push(`${b.where ? `${b.where}: ` : ''}${b.text.slice(Math.max(0, i - 6), i)}｜${b.text.slice(i, i + 6)} (${why})`);
  }
  return bad;
}
const phone = (width, reduced = true) => ({ viewport: { width, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  reducedMotion: reduced ? 'reduce' : 'no-preference', serviceWorkers: 'block', timezoneId: 'Asia/Tokyo' });
async function session(browser, width, lang, { reduced = true, query = 'entry=shelf', service = false } = {}) {
  const context = await browser.newContext(phone(width, reduced));
  await silenceBrowserAudio(context);
  // a report service on this host (synthetic: config and a guest session, no AI), as the relay answers on his phone
  if (service) await context.route(/\/api\/(config|session)$/, (route) => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify(route.request().url().endsWith('/config')
      ? { schema_version: 'bunki.maintenance/v1', build: { git_sha: null, artifact_sha256: null }, content_ids: [], ai: { status: 'unavailable' } }
      : { token: 'synthetic-guest-token', actor_ref: 'guest_q' }) }));
  // a negative control serves the base's own lines in place of the fix (its file named in full), the bridge always
  const negFiles = [...new Set((NEG_SOURCE[NEGATIVE] || []).map(([f]) => f))];
  for (const file of negFiles) await context.route(new RegExp(`/${file.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(\\?.*)?$`), async (route) => {
    const r = await route.fetch();
    let body = await r.text();
    for (const [f, from, to] of NEG_SOURCE[NEGATIVE]) if (f === file) { if (!body.includes(from)) throw new Error(`negative control ${NEGATIVE}: ${from.slice(0, 60)} not found`); body = body.replace(from, to); }
    if (file === 'corridor.js') body += BRIDGE;
    await route.fulfill({ response: r, body });
  });
  if (!negFiles.includes('corridor.js')) await context.route(/\/corridor\.js(\?.*)?$/, async (route) => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: (await r.text()) + BRIDGE });
  });
  await context.addInitScript(INSTRUMENTS);
  // G3 · the ladder's first-use demonstration is its own behaviour (verify-word-grammar's G3.demo rows): seen here, as
  // G3's verifiers set it, so a tap is a tap
  await context.addInitScript(() => { try { localStorage.setItem('kairo-word-ladder-demo-v1', '1'); } catch { /* private */ } });
  if (NEG_CSS[NEGATIVE]) await context.addInitScript((css) => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); }); }, NEG_CSS[NEGATIVE]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  await page.goto(`${host.origin}/index.html?${query}&ui=${lang}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && window.__COMB__ && window.__I__, null, { timeout: 60_000 });
  return { context, page, errors };
}
const settle = async (page, ms = 500) => {
  await page.waitForTimeout(ms);
  await page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity).length === 0, null, { timeout: 4000 }).catch(() => {});
};
const run = (page, src) => page.evaluate((s) => window.__COMB__.run(s), src);
// G3 · a tap climbs the word's ladder: the reading in place (readings shown on touch, the word's own hidden), then the
// stage (the slip). A check that needs the slip taps until it stands: the reading rung, then once more, never past it
async function climbToSlip(page, tok) {
  await tok.click();
  const rung = await page.waitForFunction((el) => (document.getElementById('mini') ? 'stage' : el.dataset.ladderRung === 'reading' ? 'reading' : null),
    await tok.elementHandle(), { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null);
  if (rung === 'reading') await tok.click();
}

// a negative control must find the lines it puts back, or it proves nothing: checked on the staged site before any page
for (const [file, from] of NEG_SOURCE_CHECK()) {
  const site = process.env.KAIRO_SITE_DIR;
  assert(site && readFileSync(join(site, file), 'utf8').includes(from), `negative control ${NEGATIVE}: "${from.slice(0, 60)}" is not in ${file}`);
}
const want = (cls) => !NEGATIVE || NEGATIVE === cls;
const log = { engines: {} };
try {
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch();
    log.engines[engine] = browser.version();
    console.log(`— ${engine} ${browser.version()}${NEGATIVE ? ` · negative control: ${NEGATIVE}` : ''}`);
    try {
      for (const lang of LANGS) for (const width of WIDTHS) {
        const tag = `${engine} ${lang} ${width}`;

        // G8 · Guided opens fast, or says it is opening
        if (want('guided')) {
          const { context, page } = await session(browser, width, lang, { reduced: false });
          const open = () => page.evaluate(async () => {
            const t0 = performance.now(); let line = null;
            window.__COMB__.run("openGuidedRoom('dojo')");
            for (;;) {
              const room = document.querySelector('#app main [data-stage]');
              const status = document.querySelector('#app main [role="status"]');
              if (!line && status && /Opening|開いて/.test(status.textContent)) line = performance.now() - t0;
              if (room?.dataset.stage && [...room.querySelectorAll('button')].some((b) => b.getClientRects().length)) return { ready: performance.now() - t0, line };
              if (performance.now() - t0 > 15000) return { ready: null, line };
              await new Promise((r) => requestAnimationFrame(r));
            }
          });
          const cold = await open();
          await page.evaluate(() => window.__COMB__.visit('dojo'));
          await settle(page, 300);
          const warm = await open();
          check(`G8 · ${tag} · Guided opens warm in under 1 s, and cold under 1 s or with its progress line`,
            warm.ready !== null && warm.ready < 1000 && cold.ready !== null && (cold.ready < 1000 || (cold.line !== null && cold.line < 300)),
            `cold ${Math.round(cold.ready ?? -1)} ms (line ${cold.line === null ? 'none' : `${Math.round(cold.line)} ms`}) · warm ${Math.round(warm.ready ?? -1)} ms`);
          await context.close();
        }

        // G12 · the reader's Save fits its bar
        if (want('save')) {
          const { context, page } = await session(browser, width, lang);
          for (const [state, id, index] of [['at rest', STARTUP, null], ['総理 touched', STARTUP, 9], ['the longest word touched', 'bunki-read-n2-kobe-jain', 27]]) {
            await page.evaluate((x) => window.__COMB__.open(x), id);
            await page.locator('#reader .tok').first().waitFor();
            await settle(page, 400);
            let word = '';
            if (index !== null) {
              const tok = page.locator(`#reader .tok[data-index="${index}"]`).first();
              await tok.scrollIntoViewIfNeeded();
              await climbToSlip(page, tok);
              await page.locator('#mini').waitFor().catch(() => {});
              word = await page.evaluate((i) => window.__COMB__.run(`readingToken(passage().tokens[${i}]).b`), index);
              await page.keyboard.press('Escape');
              await page.evaluate(() => window.scrollTo(0, 0));
              await settle(page, 400);
            }
            const bar = await page.evaluate(() => {
              const chrome = document.querySelector('#app > .chrome');
              const keep = document.getElementById('chrome-keep');
              const vw = document.documentElement.clientWidth;
              const doors = [...chrome.querySelectorAll(':scope > button, :scope > .lang-seg')].filter((n) => n.getClientRects().length).map((n) => n.getBoundingClientRect());
              const glyphs = [...keep.querySelectorAll('*')].filter((n) => window.__I__.shown(n)).flatMap((n) => window.__I__.rects(n));
              const bands = [];
              for (const r of glyphs) { const b = bands.find((x) => r.top < x.bottom - 1 && r.bottom > x.top + 1); if (b) { b.top = Math.min(b.top, r.top); b.bottom = Math.max(b.bottom, r.bottom); } else bands.push({ top: r.top, bottom: r.bottom }); }
              const wordEl = keep.querySelector('.save-bar-word');
              return { vw, wide: document.scrollingElement.scrollWidth - innerWidth, overflow: chrome.scrollWidth - chrome.clientWidth, outside: doors.filter((r) => r.left < -0.5 || r.right > vw + 0.5).length,
                cut: keep.scrollWidth - keep.clientWidth, lines: bands.length, text: keep.innerText.replace(/\s+/g, ' ').trim(), label: keep.getAttribute('aria-label') || '',
                word: wordEl?.textContent || '', wordShown: !!wordEl && window.__I__.shown(wordEl) };
            });
            const named = !word || (bar.word === word && bar.label.includes(word));
            const shownAt390 = !(word === '総理' && width === 390) || bar.wordShown;
            check(`G12 · ${tag} · the bar's Save fits whole, ${state}`, bar.overflow <= 1 && bar.wide <= 1 && bar.outside === 0 && bar.cut <= 0.5 && bar.lines === 1 && named && shownAt390,
              `"${bar.text}" (${bar.label}) · cut ${bar.cut.toFixed(1)} · lines ${bar.lines} · bar overflow ${bar.overflow} · page ${bar.wide} px past the glass · doors outside ${bar.outside}${word ? ` · word ${word} shown ${bar.wordShown}` : ''}`);
          }
          await context.close();
        }

        // G2/G3 · Japanese breaks only between words
        if (want('breaks')) {
          const { context, page } = await session(browser, width, lang);
          await page.evaluate(() => window.__COMB__.visit('shelf'));
          await settle(page, 900);
          const shelf = await page.evaluate(() => [...document.querySelectorAll('#app main :is(.shelf-title, .story-lede)')].filter((n) => window.__I__.shown(n)).map((n) => { const l = window.__I__.lines(n, null); return { text: l.text, glyphs: l.glyphs.map((g) => ({ ch: g.ch, left: g.left, right: g.right })), breaks: l.breaks.map((b) => b.i), width: n.getBoundingClientRect().width }; }));
          const bad = judge(shelf);
          const named = ['新田', '藤井', '第78回', 'ノーベル', '挑んだ', '２０２６', '正倉院'].flatMap((w) => shelf.filter((b) => b.text.includes(w)).flatMap((b) => { const at = b.text.indexOf(w); return b.breaks.filter((i) => i > at && i < at + w.length).map(() => w); }));
          check(`G2 · ${tag} · the shelf's ${shelf.length} titles and ledes break only between words`, shelf.length > 20 && !bad.length && !named.length,
            `${bad.length} in-word breaks${bad.length ? `: ${bad.slice(0, 6).join(' · ')}` : ''}${named.length ? ` · split: ${named.join(', ')}` : ''}`);
          // a reader: no token split; a number stays with its counter; the title card and the foot by the plain oracle
          for (const id of [STARTUP, 'bunki-read-n1-neocognitron']) {
            await page.evaluate((x) => window.__COMB__.open(x), id);
            await page.locator('#reader .tok').first().waitFor();
            await settle(page, 600);
            const reader = await page.evaluate(() => {
              const body = window.__I__.lines(document.getElementById('reader'), '.tok');
              const blocks = [...document.querySelectorAll('#app main :is(.reader-card h1, .article-about .note)')].filter((n) => window.__I__.shown(n)).map((n) => { const l = window.__I__.lines(n, '.japanese-lookup-word'); return { text: l.text, breaks: l.breaks.map((b) => b.i), inUnit: l.breaks.filter((b) => b.inUnit).length, glyphs: l.glyphs.map((g) => ({ ch: g.ch, left: g.left, right: g.right })), width: n.getBoundingClientRect().width }; });
              return { text: body.text, breaks: body.breaks.map((b) => b.i), inToken: body.breaks.filter((b) => b.inUnit).length, blocks };
            });
            const numbers = reader.breaks.filter((i) => { const why = badBreak(reader.text, i); return why === 'inside a number' || why === 'between 第 and its number' || why === 'between a number and its counter'; });
            const otherBad = reader.blocks.flatMap((b) => b.breaks.map((i) => [b, i, badBreak(b.text, i)]).filter(([blk, i, why]) => why && !(why === 'inside a katakana word' && katakanaRunWidth(blk, i) > blk.width - 1) && !/[A-Za-z0-9:/._-]/.test(blk.text[i - 1] + blk.text[i])))
              .map(([b, i, why]) => `${b.text.slice(Math.max(0, i - 5), i)}｜${b.text.slice(i, i + 5)} (${why})`);
            check(`G3 · ${tag} · ${id}: no token split, a number keeps its counter, the title and foot break between words`,
              reader.inToken === 0 && !numbers.length && !otherBad.length && reader.blocks.every((b) => b.inUnit === 0),
              `${reader.breaks.length} body breaks · in a token ${reader.inToken} · number splits ${numbers.map((i) => `${reader.text.slice(i - 4, i)}｜${reader.text.slice(i, i + 3)}`).join(' ')} · title/foot ${otherBad.slice(0, 4).join(' · ')}`);
          }
          await context.close();
          // a deck: the front (sealed: no doors) and the back keep every word whole
          const deck = await session(browser, width, lang, { query: 'deck=n2' });
          await deck.page.locator('#kp-start').click();
          await deck.page.locator('#kp-card').waitFor();
          await deck.page.waitForTimeout(2500); // the passage's tokens arrive once a sitting starts (the front takes them)
          await settle(deck.page, 800);
          const front = await deck.page.evaluate(() => { const p = document.querySelector('#kp-card .kp-sentence'); const l = window.__I__.lines(p, '.kp-w, .kp-tok'); return { doors: p.querySelectorAll('button, a, [role="button"], [tabindex]').length, breaks: l.breaks.length, inWord: l.breaks.filter((b) => b.inUnit).length, words: p.querySelectorAll('.kp-w').length, wide: document.scrollingElement.scrollWidth - innerWidth }; });
          await deck.page.locator('#kp-reveal').click();
          await deck.page.locator('.kp-grades').waitFor();
          await settle(deck.page, 900);
          const back = await deck.page.evaluate(() => { const p = document.querySelector('#kp-card .kp-sentence'); const l = window.__I__.lines(p, '.kp-w, .kp-tok'); return { breaks: l.breaks.length, inWord: l.breaks.filter((b) => b.inUnit).length, words: p.querySelectorAll('.kp-w, .kp-tok').length, wide: document.scrollingElement.scrollWidth - innerWidth, lines: l.breaks.length + 1, chars: l.text.length, width: p.getBoundingClientRect().width, font: parseFloat(getComputedStyle(p).fontSize) }; });
          // and both faces wrap inside the phone: never wider than the glass (a back that could not break ran 4,000 px)
          const fill = back.chars * back.font / back.width; // the lines the back's characters need at the least
          check(`G2 · ${tag} · the deck's front has no doors and keeps its words whole; so does its back; both wrap inside the phone`,
            front.doors === 0 && front.words > 10 && front.inWord === 0 && back.inWord === 0 && back.words > 10 && front.wide <= 1 && back.wide <= 1 && back.lines >= Math.floor(fill * 0.7),
            `front: ${front.doors} doors, ${front.words} words, ${front.inWord} of ${front.breaks} breaks inside one, ${front.wide} px past the glass · back: ${back.words} words, ${back.inWord} of ${back.breaks} inside one, ${back.lines} lines for ${back.chars} characters, ${back.wide} px past the glass`);
          await deck.context.close();
          // every room the app sets its own text in: its Japanese breaks only between words
          const rooms = await session(browser, width, lang);
          const census = [];
          for (const room of ROOMS_JA) {
            await rooms.page.evaluate((v) => window.__COMB__.visit(v), room);
            await settle(rooms.page, 350);
            const blocks = await rooms.page.evaluate(() => {
              const main = document.querySelector('#app main');
              if (!main) return [];
              const seen = new Set();
              const w = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
              while (w.nextNode()) {
                const t = w.currentNode;
                if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2}/u.test(t.data) || t.parentElement.closest('rt, rp, svg, input, textarea, select, [aria-hidden="true"], .visually-hidden, #reader')) continue;
                let b = t.parentElement;
                while (b !== main && getComputedStyle(b).display.startsWith('inline')) b = b.parentElement;
                if (window.__I__.shown(b)) seen.add(b);
              }
              return [...seen].map((n) => { const l = window.__I__.lines(n, null); return { text: l.text, glyphs: l.glyphs.map((g) => ({ ch: g.ch, left: g.left, right: g.right })), breaks: l.breaks.map((x) => x.i), width: n.getBoundingClientRect().width }; });
            });
            census.push(...blocks.map((b) => ({ ...b, where: room })));
          }
          const roomBad = judge(census);
          check(`G2 · ${tag} · the Japanese of ${ROOMS_JA.length} rooms (${census.length} blocks) breaks only between words`, census.length > 50 && !roomBad.length,
            `${roomBad.length} in-word breaks${roomBad.length ? `: ${roomBad.slice(0, 6).join(' · ')}` : ''}`);
          await rooms.context.close();
        }

        // G10 · a deck's answer is never under its grade bar
        if (want('gradebar')) {
          for (const id of ['n2', 'n1', 'senmon', 'kotoba']) {
            const { context, page } = await session(browser, width, lang, { query: `deck=${id}` });
            await page.locator('#kp-start').click();
            await page.locator('#kp-reveal').click();
            await page.locator('.kp-grades').waitFor();
            await settle(page, 1000);
            const rest = await page.evaluate(() => {
              const dock = document.querySelector('.kp-grades').getBoundingClientRect();
              const said = [...document.querySelectorAll('.kp-answer > :not(.kp-folds)')].filter((n) => n.getClientRects().length);
              const low = said.length ? Math.max(...said.map((n) => n.getBoundingClientRect().bottom)) : 0;
              const rows = [...document.querySelectorAll('.kp-folds > details > summary, .kp-folds > :not(details)')].map((n) => n.getBoundingClientRect()).filter((r) => r.height);
              const cut = rows.filter((r) => r.top < dock.top - 0.5 && r.bottom > dock.top + 0.5).length;
              return { dockTop: Math.round(dock.top), saidBottom: Math.round(low), cut, wide: document.scrollingElement.scrollWidth - innerWidth };
            });
            await page.evaluate(async () => { for (let i = 0; i < 6; i += 1) { window.scrollTo(0, document.scrollingElement.scrollHeight); await new Promise((r) => setTimeout(r, 80)); } });
            await settle(page, 200);
            const end = await page.evaluate(() => {
              const dock = document.querySelector('.kp-grades');
              const d = dock.getBoundingClientRect();
              // what is painted: a line of the passage's own scroll window (F: the window keeps its own scroll, seatUnderHeader)
              // that its overflow clips away is no ink under the bar, so each text box is cut to its clipping ancestors first
              const clipped = (el, r) => {
                let top = r.top, bottom = r.bottom, left = r.left, right = r.right;
                for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
                  const cs = getComputedStyle(a);
                  if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
                  const c = a.getBoundingClientRect();
                  top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom); left = Math.max(left, c.left); right = Math.min(right, c.right);
                }
                return { top, bottom, left, right };
              };
              return window.__I__.leaves(document.querySelector('.kp-study')).filter((el) => !dock.contains(el))
                .flatMap((el) => window.__I__.rects(el).map((r) => clipped(el, r))).filter((r) => r.bottom > r.top + 0.5 && r.right > r.left + 0.5)
                .filter((r) => r.bottom > d.top + 1 && r.top < d.bottom && r.right > d.left && r.left < d.right).length;
            });
            check(`G10 · ${tag} · ${id}: the answer stands above its grade bar, no fold row cut, nothing under it at the end`,
              rest.saidBottom <= rest.dockTop && rest.dockTop <= 844 && rest.cut === 0 && end === 0 && rest.wide <= 1,
              `answer says to ${rest.saidBottom}, bar at ${rest.dockTop} · rows cut ${rest.cut} · at the end ${end} under · ${rest.wide} px past the glass`);
            await context.close();
          }
        }

        // G11 · every room clears its bars; in Chromium, the sheets and the focus room clear the phone's insets
        if (want('safe')) {
          const { context, page } = await session(browser, width, lang);
          const rooms = ['tray', 'shelf', 'archive', 'feed', 'dojo', 'mock', 'guided', 'lessons', 'levels', 'ai', 'search', 'kanjidex', 'grammar', 'yoji', 'thesaurus', 'me', 'kagami', 'srs-stats', 'settings', 'saved', 'tests', 'browse'];
          const under = [];
          for (const room of rooms) {
            await page.evaluate((x) => window.__COMB__.visit(x), room);
            await settle(page, 350);
            const found = await page.evaluate(async () => {
              const bars = [...document.querySelectorAll('body *')].filter((el) => { const s = getComputedStyle(el); if (s.position !== 'fixed' && s.position !== 'sticky') return false; if (el.closest('#drift-layer')) return false; const r = el.getBoundingClientRect(); return r.width >= 24 && r.height >= 16 && !(r.width >= innerWidth - 1 && r.height >= innerHeight - 1) && window.__I__.shown(el); });
              const hit = (side) => { const bs = bars.filter((b) => { const r = b.getBoundingClientRect(); return side === 'top' ? r.top <= 1 : r.bottom >= innerHeight - 1; }); return window.__I__.leaves().filter((el) => !bs.some((b) => b.contains(el))).flatMap((el) => window.__I__.rects(el).map((r) => [el, r])).filter(([el, r]) => bs.some((b) => { const q = b.getBoundingClientRect(); if (!(r.left < q.right && r.right > q.left && r.top < q.bottom - 1 && r.bottom > q.top + 1)) return false; const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, (side === 'top' ? r.top : r.bottom) + (side === 'top' ? 1 : -1)))); return top && (b === top || b.contains(top)); })).map(([el]) => window.__I__.own(el).slice(0, 24)); };
              const wide = document.scrollingElement.scrollWidth - innerWidth;
              const atTop = hit('top');
              const sc = document.scrollingElement;
              for (let i = 0; i < 6; i += 1) { sc.scrollTop = sc.scrollHeight; await new Promise((r) => setTimeout(r, 60)); }
              return { atTop, atEnd: hit('bottom'), wide };
            });
            for (const t of found.atTop) under.push(`${room} top: ${t}`);
            for (const t of found.atEnd) under.push(`${room} end: ${t}`);
            if (found.wide > 1) under.push(`${room} is ${found.wide} px wider than the phone`);
          }
          check(`G11 · ${tag} · ${rooms.length} rooms clear their bars at the top and the end, and fit the phone's width`, !under.length, under.slice(0, 6).join(' · '));
          await context.close();
          if (engine === 'chromium') {
            const sheet = await session(browser, width, lang);
            const cdp = await sheet.context.newCDPSession(sheet.page);
            await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } });
            await sheet.page.evaluate(() => document.querySelector('#bunki-report-bug')?.click());
            await sheet.page.locator('dialog.br-sheet[open]').waitFor();
            await settle(sheet.page, 600);
            const head = await sheet.page.evaluate(() => Math.min(...['#br-title', '.br-close'].map((s) => document.querySelector(s)?.getBoundingClientRect().top ?? 0)));
            const end = await sheet.page.evaluate(async () => { const b = document.querySelector('dialog.br-sheet .br-body'); b.scrollTop = b.scrollHeight; await new Promise((r) => setTimeout(r, 120)); const leaves = window.__I__.leaves(document.querySelector('dialog.br-sheet')); return Math.max(...leaves.flatMap((el) => window.__I__.rects(el)).map((r) => r.bottom)); });
            check(`G11 · ${tag} · the report sheet clears the status bar (59 px) and the home indicator (34 px)`, head >= 59 && end <= 844 - 34, `title at ${Math.round(head)} · last line ends ${Math.round(end)}`);
            await sheet.context.close();
            const deck = await session(browser, width, lang, { query: 'deck=n2' });
            const dcdp = await deck.context.newCDPSession(deck.page);
            await dcdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } });
            await deck.page.locator('#kp-start').click();
            await deck.page.locator('#kp-reveal').click();
            await deck.page.locator('.kp-grades').waitFor();
            await settle(deck.page, 900);
            const dock = await deck.page.evaluate(() => { const d = document.querySelector('.kp-grades').getBoundingClientRect(); const below = window.__I__.leaves().filter((el) => !document.querySelector('.kp-grades').contains(el)).flatMap((el) => window.__I__.rects(el)).filter((r) => r.top >= d.bottom - 0.5 && r.top < innerHeight - 0.5).length; return { bottom: d.bottom, below }; });
            check(`G11 · ${tag} · the focus room's grade bar stands on the foot, no line of the page showing below it`, dock.bottom >= 844 - 0.5 && dock.below === 0, `bar bottom ${dock.bottom.toFixed(1)} · text below it ${dock.below}`);
            await deck.context.close();
          } else if (lang === 'bi' && width === 390) console.log(`  ..   G11 · ${engine}: the phone's insets cannot be set in WebKit; the inset checks run in Chromium`);
        }

        // G6 · the sky cuts no word at the glass
        if (want('sky')) {
          const { context, page } = await session(browser, width, lang, { reduced: false, query: 'entry=drift' });
          await settle(page, 1500);
          const cut = new Map();
          for (let k = 0; k < 6; k += 1) {
            const seen = await page.evaluate(() => {
              const vw = document.documentElement.clientWidth, vh = innerHeight;
              const layer = document.querySelector('#drift-layer #sky');
              const ls = getComputedStyle(layer);
              const masked = /gradient/.test(ls.webkitMaskImage || ls.maskImage || '');
              const edge = masked ? parseFloat(ls.getPropertyValue('--sky-edge')) || 0 : 0;
              const ramp = (d) => (masked && edge ? Math.max(0, Math.min(1, d / edge)) : 1);
              const painted = (el) => { let o = 1; for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden') return 0; o *= Number(s.opacity); } return o; };
              return [...document.querySelectorAll('#drift-layer :is(.word, .glyph, .part)')].map((n) => {
                const g = n.querySelector('.base, .g, .pch') || n; const r = document.createRange(); r.selectNodeContents(g);
                const rs = [...r.getClientRects()].filter((x) => x.width > 0.5); if (!rs.length) return null;
                const l = Math.min(...rs.map((x) => x.left)), rr = Math.max(...rs.map((x) => x.right)), t = Math.min(...rs.map((x) => x.top)), b = Math.max(...rs.map((x) => x.bottom));
                const across = l < 0 || rr > vw || t < 0 || b > vh;
                return across && painted(n) * ramp(3) >= 0.02 ? g.textContent.trim() : null;
              }).filter(Boolean);
            });
            for (const w of seen) cut.set(w, (cut.get(w) || 0) + 1);
            await page.waitForTimeout(600);
          }
          const bands = await page.evaluate(() => document.querySelectorAll('.sky-edge[data-drift-chrome]').length);
          check(`G6 · ${tag} · the sky cuts no word at the glass (6 samples while it drifts)`, cut.size === 0, `${cut.size} cut: ${[...cut.keys()].slice(0, 6).join(' ')} · edge bands ${bands}`);
          await context.close();
        }

        // G7 · the word web fits the phone: the day's web, then the fixed set
        if (want('web') || want('labels') || want('plain')) {
          const { context, page } = await session(browser, width, lang, { query: 'entry=shelf&room=search' });
          await settle(page, 1200);
          const faults = [];
          let stress = 0;
          let reached = 0;
          for (const centre of [null, ...G7_FIXED]) {
            if (centre) { await page.evaluate((c) => window.openWordWeb?.(c.key, { type: c.type }), centre); await settle(page, 700); }
            const f = await page.evaluate(() => {
              const out = [];
              const cut = [];
              let stress = 0;
              const strip = document.querySelector('#search-lenses');
              if (strip && strip.scrollWidth > strip.clientWidth + 1) {
                const box = strip.getBoundingClientRect();
                for (const lens of strip.querySelectorAll('.kdx-lens')) { const r = lens.getBoundingClientRect(); const whole = r.left >= box.left - 0.5 && r.right <= box.right + 0.5; if (!whole && Number(getComputedStyle(lens).opacity) > 0.05) out.push(`lens cut: ${lens.textContent.trim()}`); }
              }
              const plate = document.querySelector('.ww-plate');
              if (plate) {
                const p = plate.getBoundingClientRect(), vw = document.documentElement.clientWidth;
                const labels = [...plate.querySelectorAll('.ww-g, .ww-cap, .ww-c-r, .ww-c-m, .ww-st')].filter((n) => window.__I__.shown(n));
                // a label's ink: its text as its own box paints it (a caption that ends in an ellipsis is measured to its
                // box, never to the text it hides); the plate is never taken as a clip: crossing it is the fault
                const ink = (n) => {
                  const clip = getComputedStyle(n).overflow !== 'visible' ? n.getBoundingClientRect() : null;
                  const rs = window.__I__.rects(n).map((r) => (clip ? { left: Math.max(r.left, clip.left), right: Math.min(r.right, clip.right), top: Math.max(r.top, clip.top), bottom: Math.min(r.bottom, clip.bottom) } : r))
                    .filter((r) => r.right - r.left > 0.5 && r.bottom - r.top > 0.5);
                  return rs.length ? { l: Math.min(...rs.map((r) => r.left)), r: Math.max(...rs.map((r) => r.right)), t: Math.min(...rs.map((r) => r.top)), b: Math.max(...rs.map((r) => r.bottom)) } : null;
                };
                for (const n of labels) { const b = ink(n); if (b && (b.l < Math.max(0, p.left) - 0.5 || b.r > Math.min(vw, p.right) + 0.5)) out.push(`outside: ${n.textContent.trim().slice(0, 16)} by ${Math.round(Math.max(Math.max(0, p.left) - b.l, b.r - Math.min(vw, p.right)))} px`); }
                for (const item of plate.querySelector('.ww-legend')?.children || []) { const a = ink(item); if (!a) continue; for (const n of labels) { const b = ink(n); if (b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) out.push(`legend ${item.textContent.trim()} over ${n.textContent.trim().slice(0, 12)}`); } }
                // a caption is a name: never the catalogue's words
                for (const n of plate.querySelectorAll('.ww-cap, .ww-c-m')) if (/\bradical\b|\(no\.|\bvariant\b/i.test(n.textContent)) out.push(`catalogue words: ${n.textContent.trim().slice(0, 24)}`);
                // the case's own pressure: captions that one line up to 92 px wide, centred under their node, would ink past
                // the plate (what the base drew); a fixed set with none would prove nothing about the edge
                for (const n of plate.querySelectorAll('.ww-cap')) {
                  const r = document.createRange(); r.selectNodeContents(n); const text = r.getBoundingClientRect().width;
                  const node = n.closest('.ww-node').getBoundingClientRect(); const cx = (node.left + node.right) / 2; const w = Math.min(text + 6, 92);
                  if (cx - w / 2 + 3 < p.left - 0.5 || cx + w / 2 - 3 > p.right + 0.5) stress += 1;
                }
                // an English caption its width cuts short, on a node that has a slip (a word, a kanji, a part)
                if (document.body.classList.contains('ui-bi')) [...plate.querySelectorAll('.ww-node')].forEach((n, i) => { const c = n.querySelector('.ww-cap'); if (c && c.scrollWidth > c.clientWidth + 1 && ['word', 'kanji', 'part'].includes(n.dataset.wwType)) cut.push({ i, text: c.textContent.trim() }); });
              }
              return { out, stress, cut };
            });
            faults.push(...f.out.map((x) => `${centre ? centre.key : 'day'}: ${x}`));
            if (centre) stress += f.stress;
            // a caption cut short keeps its whole text a hold away: the slip the node opens says it
            for (const c of f.cut) {
              await page.locator('.ww-plate .ww-node').nth(c.i).click({ button: 'right' });
              const said = await page.waitForFunction(() => document.getElementById('mini')?.innerText || '', null, { timeout: 4000 }).then((h) => h.jsonValue()).catch(() => '');
              const plain = (t) => t.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
              if (!plain(said).includes(plain(c.text))) faults.push(`${centre ? centre.key : 'day'}: "${c.text.slice(0, 16)}" cut short, and the slip its hold opens does not say it whole`);
              await run(page, 'removeMini()');
              reached += 1;
            }
          }
          // in English at 320 the base pushed captions past the plate; the fixed set must still hold such captions
          const pressed = !(lang === 'bi' && width === 320) || stress > 0;
          check(`G7 · ${tag} · the word web fits: lenses whole, legend clear of the nodes, labels inside the plate and plainly named (the day's web and ${G7_FIXED.length} fixed)`,
            !faults.length && pressed, `${stress} captions under edge pressure · ${reached} cut short, read whole in their slips${pressed ? '' : ' · the fixed set holds no caption under edge pressure'}${faults.length ? ` · ${faults.slice(0, 6).join(' · ')}` : ''}`);
          await context.close();
        }

        // G4 · a card clear of its word's reading; each part once
        if (want('card') || want('parts')) {
          const { context, page } = await session(browser, width, lang);
          if (want('card')) {
            await page.evaluate((x) => window.__COMB__.open(x), STARTUP);
            await page.locator('#reader .tok[data-index="9"]').waitFor();
            await settle(page, 400);
            const gaps = [];
            for (const index of [9, 2, 14]) {
              await page.evaluate(() => window.__COMB__.run('removeMini()'));
              const tok = page.locator(`#reader .tok[data-index="${index}"]`).first();
              await tok.scrollIntoViewIfNeeded();
              await climbToSlip(page, tok);
              await page.locator('#mini').waitFor();
              await settle(page, 500);
              gaps.push(await page.evaluate((i) => {
                const t = document.querySelector(`#reader .tok[data-index="${i}"]`);
                const w = t.getBoundingClientRect();
                let top = w.top;
                // the reading drawn over the word (the reader's ruby::before, shown while its rt is not hidden)
                for (const ruby of t.querySelectorAll('ruby')) {
                  const rt = ruby.querySelector('rt');
                  const before = getComputedStyle(ruby, '::before');
                  if (rt && !rt.classList.contains('hidden-rt') && before.content && before.content !== 'none') top = Math.min(top, ruby.getBoundingClientRect().top - parseFloat(before.fontSize) * 1.2);
                  const range = document.createRange(); range.selectNodeContents(rt || ruby);
                  if (rt && getComputedStyle(rt).display !== 'none') for (const b of range.getClientRects()) top = Math.min(top, b.top);
                }
                const m = document.getElementById('mini').getBoundingClientRect();
                const above = m.bottom <= w.top + 1;
                return { i, word: t.textContent.trim().slice(0, 8), gap: above ? top - m.bottom : m.top - w.bottom };
              }, index));
            }
            check(`G4 · ${tag} · a word's card stands 8 px clear of the word and its reading`, gaps.every((g) => g.gap >= 8 - 0.5), gaps.map((g) => `${g.word} ${g.gap.toFixed(1)}`).join(' · '));
          }
          if (want('parts')) {
            const parts = await run(page, `(() => {
              const PAIRS = { 刂: ['刀'], 攵: ['攴'], 罒: ['网'], 灬: ['火'], 氺: ['水'], 冫: ['氷', '水'], 月: ['肉'], 忄: ['心'], 氵: ['水'], 艹: ['艸'], 扌: ['手'], 犭: ['犬'], 礻: ['示'], 衤: ['衣'], 纟: ['糸'], 讠: ['言'], 饣: ['食'], 阝: ['邑'], 亻: ['人'] };
              const st = (x) => D.kanji[x]?.st || D.radicals[x]?.st || null;
              const bad = [];
              for (const c of Object.keys(D.kanji)) {
                const shown = mainParts(c).filter((p) => p !== c);
                for (const p of shown) for (const q of shown) {
                  if (p !== q && (D.kanji[q]?.parts || []).includes(p)) bad.push(c + ': ' + p + ' inside ' + q);
                  if (p !== q && (PAIRS[p] || []).includes(q)) bad.push(c + ': ' + p + ' and ' + q + ' are one part');
                }
                const sum = shown.map((p) => ({ 辶: 3, 亻: 2, 彳: 3, 氵: 3, 冫: 2, 扌: 3, 忄: 3, 犭: 3, 阝: 3, 艹: 3, 礻: 4, 衤: 5, 刂: 2, 灬: 4, 罒: 5, 攵: 4 })[p] ?? st(p));
                if (D.kanji[c].st && sum.every(Boolean) && sum.reduce((a, b) => a + b, 0) > D.kanji[c].st) bad.push(c + ': ' + shown.join('+') + ' has more strokes than ' + c);
              }
              const noisy = [...new Set(Object.keys(D.kanji).flatMap((c) => mainParts(c).map((p) => partGloss(c, p))))].filter((g) => /radical|variant|\\(no/i.test(g));
              return { bad, noisy, so: mainParts('総').join('+') };
            })()`);
            await page.evaluate((x) => window.__COMB__.open(x), STARTUP);
            await climbToSlip(page, page.locator('#reader .tok[data-index="9"]').first());
            await page.locator('#mini .mini-kanji-row').first().waitFor();
            const row = await page.evaluate(() => [...document.querySelectorAll('#mini .mini-kanji-row[data-kanji="総"] .mini-kanji-part')].map((n) => n.textContent).join('+'));
            check(`G4 · ${tag} · each kanji's parts shown once, at their own level, named plainly (総 = 糸 + 忩 on the card)`,
              !parts.bad.length && !parts.noisy.length && parts.so === '糸+忩' && row === '糸+忩',
              `${parts.bad.length} faults${parts.bad.length ? `: ${parts.bad.slice(0, 4).join(' · ')}` : ''} · noisy names ${parts.noisy.slice(0, 3).join(', ')} · 総 = ${parts.so} · card ${row}`);
          }
          await context.close();
        }

        // G5 · Today's hook is true
        if (want('hook')) {
          const { context, page } = await session(browser, width, lang, { query: 'entry=shelf&room=tray' });
          await settle(page, 900);
          const hook = await run(page, `(() => {
            const pool = Object.keys(D.words || {}).filter((w) => TODAY_JA_WORD.test(w) && todaySharedPart(todayKanji(w)));
            const radicalOf = (part, c) => { const row = D.radByGlyph?.[part] || D.radByGlyph?.[({ 氵: '水', 忄: '心', 扌: '手', 亻: '人', 犭: '犬', 礻: '示', 衤: '衣', 艹: '艸', 阝: '邑', 刂: '刀', 攵: '攴', 罒: '网', 灬: '火', 氺: '水' })[part]]; return !!row && row.n === D.kanji[c].rad; };
            const untrue = pool.map((w) => [w, todayHook(w)]).filter(([w, h]) => h && (!todayKanji(w).filter((c) => h.shared || c === h.host).every((c) => radicalOf(h.part, c)) || /radical|variant|\\(no/i.test(h.meaning))).map(([w, h]) => w + ':' + h.part + ' ' + h.meaning);
            const shown = document.querySelector('.dw-word')?.dataset.uiContentValue?.split('|')[1] || '';
            const part = document.querySelector('.dw-hook .dw-pk')?.textContent || '';
            const shownTrue = !part || todayKanji(shown).filter((c) => (D.kanji[c].parts || []).includes(part)).every((c) => radicalOf(part, c));
            return { pool: pool.length, untrue, shown, part, shownTrue };
          })()`);
          check(`G5 · ${tag} · every hook Today can show names a part that is each kanji's radical (today: ${hook.shown} ${hook.part})`,
            hook.pool > 20 && !hook.untrue.length && hook.shownTrue, `${hook.pool} words · ${hook.untrue.length} untrue: ${hook.untrue.slice(0, 5).join(' · ')}`);
          await context.close();
        }

        // G13 · learner words first, the technical rest under one Details
        if (want('details')) {
          const { context, page } = await session(browser, width, lang);
          const DEV = /GitHub|kantei:|https?:\/\/|"surface"|\bAPI\b|Provider|\bModel\b|モデル|接続先/u;
          const visibleText = (sel) => page.evaluate(([s, neg]) => {
            const root = document.querySelector(s);
            if (!root) return null;
            if (neg) for (const d of root.querySelectorAll('details')) d.open = true;
            const leaves = window.__I__.leaves(root);
            return { text: leaves.map((el) => window.__I__.own(el)).join(' | '), details: root.querySelectorAll('details').length, closed: [...root.querySelectorAll('details')].every((d) => !d.open) };
          }, [sel, NEGATIVE === 'details']);
          await page.evaluate(() => window.__COMB__.open('kantei:jp-105-actions-202609-25startup'));
          await settle(page, 500);
          await page.evaluate(() => document.querySelector('#bunki-report-bug')?.click());
          await page.locator('dialog.br-sheet[open]').waitFor();
          await settle(page, 700);
          const sheet = await visibleText('dialog.br-sheet');
          const id = await page.evaluate(() => document.querySelector('dialog.br-sheet .br-details')?.textContent.includes('kantei:jp-105') || false);
          await page.keyboard.press('Escape');
          await page.evaluate(() => window.__COMB__.visit('ai'));
          await settle(page, 600);
          const tutor = await visibleText('#app main');
          const fields = await page.evaluate(() => ({ inFold: ['#ai-base-url', '#ai-model-input'].every((s) => document.querySelector(`#ai-connection ${s}`)), key: window.__I__.shown(document.getElementById('ai-key-input')) }));
          await page.evaluate(() => window.__COMB__.visit('settings'));
          await settle(page, 500);
          const settings = await page.evaluate(() => document.getElementById('settings-reports-status')?.textContent || '');
          const leak = [['report sheet', sheet?.text], ['tutor', tutor?.text], ['Settings', settings]].filter(([, t]) => DEV.test(t || '')).map(([w, t]) => `${w}: ${(t.match(DEV) || [''])[0]}`);
          check(`G13 · ${tag} · the report sheet, the tutor and Settings speak learner words; ids, GitHub, addresses and models sit under one closed Details`,
            !leak.length && sheet?.details === 1 && sheet.closed && id && tutor?.closed && fields.inFold && fields.key, `${leak.join(' · ') || 'no developer words shown'} · sheet Details ${sheet?.details}, closed ${sheet?.closed}, holds the id ${id} · tutor fold ${fields.inFold}, key shown ${fields.key}`);
          await context.close();
        }

        // G14 · Me in the house voice
        if (want('me')) {
          const { context, page } = await session(browser, width, lang);
          await page.evaluate(() => window.__COMB__.visit('me'));
          await settle(page, 700);
          const me = await page.evaluate(() => [...document.querySelectorAll('#app main .me-hz-sub.is-sentence')].map((n) => ({ text: n.textContent, shown: n.innerText, upper: getComputedStyle(n).textTransform })));
          const d5 = await page.evaluate(() => document.querySelector('#app main')?.innerText || '');
          const sentence = (t) => /^(Not started yet\. The (N1|fields) deck is in (Learn|Review)\.|No cards yet\. Save words as you read\.|Counted from the kanji in your saved words\.|まだ始めていない。(N1|専門)デッキは「(学ぶ|復習)」にある。|まだ札がない。読みながら言葉を保存する。|保存した言葉の漢字から数える。)$/u.test(t);
          const his = lang === 'bi' ? ['Rooted in Japanese history, tied to modern neuroscience', 'Neuroplasticity, learning about learning, human potential', 'Hofstadter, recursion, computer science and tech']
            : ['日本の歴史に根ざし、現代の脳科学につながる'];
          check(`G14 · ${tag} · Me's lines for goals not begun are plain sentences, never capitals; his own D5 words stay`,
            me.length >= 3 && me.every((m) => m.upper === 'none' && sentence(m.text) && m.shown.trim() === m.text) && his.every((h) => d5.includes(h)),
            me.map((m) => `${m.shown.trim()} [${m.upper}]`).join(' · '));
          await context.close();
        }

        // G1 · the shelf's count
        if (want('count') && width === 390) {
          const { context, page } = await session(browser, width, lang);
          await page.evaluate(() => window.__COMB__.visit('shelf'));
          await settle(page, 700);
          const count = await run(page, `(() => ({ tally: (document.querySelector('.tally-long')?.textContent || '').match(/\\d+/)?.[0] || '', shelf: new Set([...document.querySelectorAll('#app main .shelf-item[data-passage]')].map((n) => n.dataset.passage)).size, stories: shelfStories((D.passages || []).filter((p) => !String(p.file || '').startsWith('archive/'))).length }))()`);
          log[`count-${engine}-${lang}`] = count.tally;
          const other = log[`count-${engine}-${lang === 'bi' ? 'ja' : 'bi'}`];
          check(`G1 · ${tag} · the shelf's count is the stories on it (and the same in both languages)`, Number(count.tally) === count.stories && count.shelf === count.stories && (!other || other === count.tally),
            `tally ${count.tally} · stories on the shelf ${count.shelf} · shelfStories ${count.stories}${other ? ` · the other language ${other}` : ''}`);
          await context.close();
        }

        // 13a · ticking a list keeps the keyboard on its box
        if (want('focus') && width === 390) {
          const { context, page } = await session(browser, width, lang);
          await run(page, `(() => { S.lists = { ...(S.lists || {}), 'Q list': [] }; go({ t: 'word', id: '総理' }); })()`);
          await page.locator('#sheet-take').waitFor();
          await settle(page, 600);
          await page.locator('#sheet-take').click();
          await page.locator('#vocabulary-list-popover').waitFor();
          await page.locator('#vocabulary-list-popover input[data-list="Q list"]').click();
          await page.locator('#vocabulary-list-popover input[data-list="Q list"]:checked').waitFor();
          await page.waitForTimeout(600);
          const focused = await page.evaluate(() => document.activeElement?.matches?.('#vocabulary-list-popover input[data-list="Q list"]') || false);
          check(`13a · ${tag} · ticking a list in the Save menu keeps the keyboard on that box`, focused, String(await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 120))));
          await context.close();
        }

        // 13b · a report with a screenshot saves offline (a report service answers on this host, as on his relay, so the
        // sheet offers a screenshot; then the device goes offline before Send)
        if (want('offline') && width === 390) {
          const { context, page } = await session(browser, width, lang, { service: true });
          await page.evaluate(() => document.querySelector('#bunki-report-bug')?.click());
          await page.locator('#br-actual').waitFor();
          await page.locator('#br-files').waitFor({ timeout: 15_000 });
          await page.locator('#br-actual').fill('Q · offline save with a screenshot');
          const png = await page.screenshot({ clip: { x: 0, y: 0, width: 8, height: 8 } });
          await page.locator('#br-files').setInputFiles({ name: 'screen.png', mimeType: 'image/png', buffer: png });
          await page.locator('.br-attachments img').waitFor();
          await context.setOffline(true);
          await page.locator('#br-form .br-primary').click();
          const saved = await page.evaluate(async () => {
            const db = await new Promise((resolve) => { const r = indexedDB.open('bunki-maintenance-reports-v1'); r.onsuccess = () => resolve(r.result); });
            const read = (store) => new Promise((resolve) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); });
            let rows = [], files = [];
            for (let i = 0; i < 60 && !rows.length; i += 1) { rows = await read('records'); files = await read('attachments'); if (!rows.length) await new Promise((r) => setTimeout(r, 250)); }
            return { rows: rows.length, files: files.map((f) => (f.bytes instanceof ArrayBuffer ? f.bytes.byteLength : -1)), blobs: files.filter((f) => 'blob' in f).length, notice: document.querySelector('.br-notice')?.textContent || '' };
          });
          check(`13b · ${tag} · a report with a screenshot saves with the device offline, the screenshot as its bytes`,
            saved.rows === 1 && saved.files.length === 1 && saved.files[0] > 0 && saved.blobs === 0,
            `${saved.rows} saved · screenshots ${JSON.stringify(saved.files)} (blobs ${saved.blobs}) · ${saved.notice.slice(0, 160)}`);
          await context.setOffline(false);
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  const failed = checks.filter((c) => !c.pass);
  console.log(failed.length ? `COMB-0 FAIL — ${failed.length} of ${checks.length}` : `COMB-0 PASS — ${checks.length} checks`);
  if (failed.length || !checks.length) process.exitCode = 1;
} finally {
  writeFileSync(join(out, `comb-0${NEGATIVE ? `-negative-${NEGATIVE}` : ''}.json`), `${JSON.stringify({ engines: log.engines, negative: NEGATIVE || null, checks }, null, 2)}\n`);
  await host.close();
}
