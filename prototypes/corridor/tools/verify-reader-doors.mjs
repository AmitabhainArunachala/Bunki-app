/** Reader doors, G3. Literal article/reading fixtures are retained from the prior verifier.
 * D0 pins clean source/artifact identity; D1 real coordinate hits test shelf doors.
 * D2 tests tap/Enter/Space: on-touch reading only → repeated activation stage → Escape bare;
 * off goes directly to stage without inline ruby. Spoken reading is checked on the selected word.
 * D3 always-on and kana-converted words go directly to stage, through native inline span doors.
 * D4 same-document shelf walk isolates occurrences and tests reading → stage → bare.
 * D5 example-sentence detour and D6 saved-learning-source return retain exact source, sheet,
 * focus and no-English assertions. G3 clears summoned readings when their visit ends; those
 * returns now require bare home prose. Saved navigation/encounter records are still exercised.
 * Historical m1–m7 mark-retention mutants contradicted G3 and are replaced by exact stalled-rung,
 * retained-reading and forbidden-off-ruby mutations. r1 still corrupts only the fixture reading;
 * m8 still removes only its named click handler. Each kill requires the clean candidate's exact
 * row schedule and declared observed failure, with all unrelated rows passing. Setup crashes,
 * unmatched edits, page errors, missing/duplicate rows and arbitrary reds never count as kills.
 * KAIRO_BROWSER=chromium|webkit selects one actual engine (default Chromium); each receipt
 * records browser.version(). Run both invocations for two-engine acceptance. Coordinate mouse
 * clicks are not physical-phone touch/VoiceOver evidence. No audio or provider claim.
 */

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { escapeObligations, READER_D1_DAY, READER_D1_PICKS, readerDoorsReceipt, deliveredAsBuilt, serveRecorded } from './vh-learning-contracts.mjs';
import { restoreAppFixture } from './record-fixture-support.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');

const SITE = resolveCorridorSite();
const EVIDENCE = resolveCorridorEvidence();
const engine = process.env.KAIRO_BROWSER || 'chromium';
if (!['chromium', 'webkit'].includes(engine)) throw new Error('KAIRO_BROWSER must be chromium or webkit; run each engine separately');
const runId = process.env.KAIRO_GATE_RUN_ID || randomUUID();
const verifierSha256 = shaAtStart();
const verifierGitSha = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
function shaAtStart() { return createHash('sha256').update(require('node:fs').readFileSync(new URL(import.meta.url))).digest('hex'); }
let servedIdentity = null;
let browserVersion = null;
const results = [];
const pageErrors = [];
const controls = [];
let currentCase = 'setup';
const check = (name, pass, detail = '', extra = {}) => {
  results.push({ ...extra, name, pass: !!pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
};
// D2 and D4 report through a recorder: the candidate's rows are verdicts, a control's are evidence
const record = (id, name, pass, detail = '', observed) => check(name, pass, detail, observed === undefined ? { id } : { id, observed });
const ready = (page) => page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** Sorted-key JSON, so a fixture comparison does not depend on property order. */
const canonical = (value) => (Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value));
/** Every occurrence, overlapping ones included, as make-corridor-mutant.mjs counts them. */
const occurrences = (text, needle) => {
  const at = [];
  for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + 1)) at.push(index);
  return at;
};
let host = null, origin = null, browser = null;
let manifest = null; // path → sha256 from the served build-identity.json, read in D0
const DESK = { width: 1280, height: 860 };

// Fixtures: tokens[1] of each committed article, copied by a read-only script (2026-09-25) in their
// on-disk key order, so JSON.stringify reproduces the exact bytes r1 edits.
const PASSAGE_A = 'aozora:000628', PASSAGE_B = 'aozora:046605';
const A_TOKEN = Object.freeze({ file: 'data/articles/aozora-000628.json', index: 1,
  token: Object.freeze({ s: 'これ', b: 'これ', p: '代名詞', r: 'これ', f: [{ t: 'これ' }], c: true }) });
const DOOR = Object.freeze({ file: 'data/articles/aozora-046605.json', index: 1,
  token: Object.freeze({ s: '谷川', b: '谷川', p: '名詞', r: 'たにがわ', f: [{ t: '谷川', r: 'たにがわ' }], c: false }),
  neighbour: Object.freeze({ index: 2, s: 'の' }) });
const SURFACE = DOOR.token.s, READING = DOOR.token.r;
const WRONG_READING = 'たにかわ';
// The door's whole accessible label, as nameReaderToken builds it in the bilingual UI (ui=bi, pinned in the D2/D4
// URLs; it is also the default): the surface, the reading only while shown, the keyboard help. Nothing else may appear.
const DOOR_HINT = 'Enter: next word layer · Shift+F10: save and more';
const doorLabel = (reading = null) => [SURFACE, ...(reading ? [reading] : []), DOOR_HINT].join(' · ');
const D4_QUERY = '?entry=shelf&dials=0,1,0&ui=bi';
// D5, copied from the committed articles by the same read-only script (2026-09-25). Home is やまなし: its own marks go on
// token 3, its reading door is DOOR (token 1), and わかる's sheet opens from its token 293. The detour is ごん狐: its only
// わかる sentence starts at token 2347 (わかる at 2351), and its token 1 is A_TOKEN, at the same index as home's door.
const D5 = Object.freeze({ home: PASSAGE_B, away: PASSAGE_A, awaySource: '青空文庫 · 新美南吉',
  known: Object.freeze({ index: 3, token: Object.freeze({ s: '底', b: '底', p: '名詞', r: 'そこ', f: [{ t: '底', r: 'そこ' }], c: true }) }),
  word: Object.freeze({ index: 293, token: Object.freeze({ s: 'わから', b: 'わかる', p: '動詞', r: 'わから', f: [{ t: 'わから' }], c: true }) }),
  awaySentence: Object.freeze({ start: 2347, at: 2351 }) });
// D6 (D22b): the saved word わかる, whose encounter is that same ごん狐 sentence, tokens 2347–2356 (わかる at 2351).
// The literals are read from the committed article and index row (2026-09-25). The reader is やまなし again, with D5's
// home-only index (3) and colliding index (1).
const D6 = Object.freeze({ home: D5.home, away: D5.away, word: D5.word, savedAt: Date.parse('2026-09-25T00:00:00Z'),
  encounter: Object.freeze({ sourceKind: 'bundled-passage', sourceId: PASSAGE_A, unit: 'token-index', start: 2347, end: 2357, index: 2351,
    quote: '」「それがわからんのだよ。', title: 'ごん狐', attribution: '青空文庫 新美南吉「ごん狐」',
    url: 'https://www.aozora.gr.jp/cards/000121/card628.html', target: Object.freeze({ type: 'word', id: 'わかる' }) }) });

// Mutations target the served bytes, never the source checkout. Each edit must match once.
const EDITS = Object.freeze({
  lookupClick: { file: 'corridor.js', from: "    quickLook(event.detail === 0 ? 'keyboard' : 'pointer');\n", to: '' },
  reading: { file: DOOR.file, from: JSON.stringify(DOOR.token),
    to: JSON.stringify({ ...DOOR.token, r: WRONG_READING, f: [{ t: SURFACE, r: WRONG_READING }] }) },
  stalled: { file: 'corridor.js', from: "      return ladderVisit.openStage({ restore: false, demo: false });", to: "      return 'reading';" },
  keepReading: { file: 'corridor.js', from: '  visit.clearReveal?.();', to: '  // control: leave the summoned reading painted' },
  lostFocus: { file: 'corridor.js', from: '  if (anchor.isConnected) focusProseWord(anchor, { preventScroll: true });\n}, true);',
    to: '  // VH control: popup closes without restoring focus\n}, true);' },
  wrongFocus: { file: 'corridor.js', from: '  if (anchor.isConnected) focusProseWord(anchor, { preventScroll: true });\n}, true);',
    to: '  document.querySelector("[data-vh-duplicate]")?.focus({ preventScroll: true });\n}, true);' },
  keepPopup: { file: 'corridor.js', from: '  slip?.remove();\n  miniAnchor = null;', to: '  // VH control: leave the mounted popup\n  miniAnchor = null;' },
  contentEnglish: { file: 'corridor.js', from: `    // R · the slip stands for the entry the token's own reading names (readingToken). A word the core lacks whose`,
    to: `    if (index === 1 && token.s === "これ") { span.querySelector(".tok-en")?.remove(); span.append(el("span", "tok-en", "VH_INLINE_ENGLISH")); span.classList.add("has-en"); }\n    // R · the slip stands for the entry the token's own reading names (readingToken). A word the core lacks whose` },
  namedEnglish: { file: 'corridor.js', from: "  span.querySelector('.tok-en')?.remove();\n  span.classList.remove('has-en');\n  span.classList.toggle('lit', shown);",
    to: "  span.querySelector('.tok-en')?.remove();\n  if (shown && index === 1) { span.append(el('span', 'tok-en', 'VH_INLINE_ENGLISH')); span.classList.add('has-en'); } else span.classList.remove('has-en');\n  span.classList.toggle('lit', shown);" },
  offRuby: { file: 'corridor.js', from: "  anchor.dataset.ladderRung = 'stage';\n  return visit.openStage({ restore: !!options.restore, demo: !!options.demo });",
    to: "  anchor.dataset.ladderRung = 'stage';\n  if (S.dials.furigana === 0) { inlineWordReading(anchor, reading); anchor.querySelectorAll('ruby').forEach(ruby => ruby.dataset.r = reading); }\n  return visit.openStage({ restore: !!options.restore, demo: !!options.demo });" },
});
const RUN_ROWS = Object.freeze({
  d2: [1, 0].flatMap(f => ['door','first-rung','popup-reading','visible-reading','accessible-reading','no-english','popup-focus-premise','focus-returns','popup-absent','neighbour-unchanged','no-navigation','bare-after-fold'].map(row => `D2.f${f}.${row}`)),
  d3: ['k0f2','k2f1'].flatMap(key => ['names','pointer','opens-lookup'].map(row => `D3.${key}.${row}`)),
  d5: ['home-marks','detour','away-marks','returned','home-bare-return','away-index-not-lit','named-tap','named-no-english'].map(id => `D5.${id}`),
  d4: ['D4.A-prior-state','D4.A-no-english','D4.same-document','D4.same-dials','D4.B-door','D4.no-inherited-state','D4.tap-shows','D4.second-tap-stage','D4.fold-bare','D4.never-english'],
});
const RUN_FIXTURE = Object.freeze({ d2: 'D2.fixture', d3: 'D3.fixture', d4: 'D4.fixture', d5: 'D5.fixture' });
const CONTROLS = Object.freeze([
  ...['lostFocus', 'wrongFocus', 'keepPopup'].map((edit, index) => ({
    name: ['escape-loses-source-focus', 'escape-focuses-other-occurrence', 'escape-leaves-popup-open'][index],
    title: 'Escape starts inside the real popup and returns to the exact source occurrence', edits: [edit], run: 'd2',
    requires: [1, 0].flatMap(f => [`D2.f${f}.popup-reading`, `D2.f${f}.popup-focus-premise`, ...(edit === 'keepPopup' ? [`D2.f${f}.focus-returns`] : [`D2.f${f}.popup-absent`])]),
    kills: [1, 0].map(f => `D2.f${f}.${edit === 'keepPopup' ? 'popup-absent' : 'focus-returns'}`), allowed: [],
    witness: rows => [1, 0].every(f => rows.get(`D2.f${f}.${edit === 'keepPopup' ? 'popup-absent' : 'focus-returns'}`)?.observed?.every(row =>
      edit === 'keepPopup' ? row.popupPresent && row.back : !row.back && row.popupGone && (edit !== 'wrongFocus' || row.onDuplicate))) ? '' : 'the exact Escape fault was not observed',
  })),
  { name: 'inline-english-content', title: 'content stage paints forbidden inline English', edits: ['contentEnglish'], run: 'd4',
    requires: ['D4.A-prior-state'], kills: ['D4.A-no-english'], allowed: [],
    witness: rows => rows.get('D4.A-no-english')?.observed?.glosses?.every(value => value === 'VH_INLINE_ENGLISH') ? '' : 'the exact content sentinel was not observed' },
  ...['d4', 'd5'].map(run => ({ name: `inline-english-named-${run}`, title: 'named reading paints forbidden inline English', edits: ['namedEnglish'], run,
    requires: [run === 'd4' ? 'D4.tap-shows' : 'D5.named-tap'], kills: [run === 'd4' ? 'D4.never-english' : 'D5.named-no-english'], allowed: [],
    witness: rows => rows.get(run === 'd4' ? 'D4.never-english' : 'D5.named-no-english')?.observed?.glosses?.includes('VH_INLINE_ENGLISH') ? '' : 'the exact named sentinel was not observed' })),
  { name:'g3-stalled', title:'second activation stalls before stage', edits:['stalled'], run:'d4',
    requires:['D4.A-prior-state','D4.B-door','D4.tap-shows'], kills:['D4.second-tap-stage'], allowed:[],
    witness:rows => rows.get('D4.second-tap-stage')?.observed?.popup === null ? '' : 'the stage still opened' },
  { name:'g3-kept-reading', title:'fold leaves summoned ruby behind', edits:['keepReading'], run:'d2',
    requires:['D2.f1.door','D2.f1.popup-reading'], kills:['D2.f1.bare-after-fold'], allowed:[],
    witness:rows => rows.get('D2.f1.bare-after-fold')?.observed?.every(row => row.visibleRuby === READING) ? '' : 'the folded word did not retain its exact reading' },
  { name:'g3-off-ruby', title:'off setting wrongly exposes inline reading', edits:['offRuby'], run:'d2',
    requires:['D2.f0.door','D2.f0.popup-reading'], kills:['D2.f0.visible-reading','D2.f0.bare-after-fold'], allowed:[],
    witness:rows => rows.get('D2.f0.visible-reading')?.observed?.every(value => value === READING) ? '' : 'off did not show the fixture reading' },
  { name:'m8', title:'named lookup click removed', edits:['lookupClick'], run:'d3',
    requires:['D3.k0f2.names','D3.k2f1.names'], kills:['D3.k0f2.opens-lookup','D3.k2f1.opens-lookup'], allowed:[],
    witness:rows => ['k0f2','k2f1'].every(key => rows.get(`D3.${key}.opens-lookup`)?.observed?.mini === null) ? '' : 'a stage still opened' },
  { name:'r1', title:`literal reading changed to ${WRONG_READING}`, edits:['reading'], run:'d2',
    requires:['D2.f1.door','D2.f0.door','D2.f1.no-navigation','D2.f0.no-navigation'],
    kills:['D2.f1.visible-reading','D2.f1.accessible-reading','D2.f1.popup-reading','D2.f0.popup-reading'], allowed:[],
    witness:rows => rows.get('D2.f1.visible-reading')?.observed?.every(value => value === WRONG_READING)
      && [1,0].every(f => rows.get(`D2.f${f}.popup-reading`)?.observed?.every(row => row?.reading === WRONG_READING))
      && rows.get('D2.f1.accessible-reading')?.observed?.every(row => row.description === `${WRONG_READING} · ${DOOR_HINT}`)
      ? '' : 'the exact wrong reading was not shown and spoken' },
]);

async function openPage(viewport, query, mutation = null, { shelfDay = null, restore = null } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', deviceScaleFactor: viewport.width > 1000 ? 2 : 3,
    ...(mutation || restore ? { serviceWorkers: 'block' } : {}) });
  const sink = mutation ? mutation.control.pageErrors : pageErrors;
  context.on('page', (page) => page.on('pageerror', (error) => {
    if (sink.length < 20) sink.push({ case: currentCase, message: error.message });
  }));
  try {
    // This suite models an already-seen demo on this device; the fresh-device demo has its own G3 verifier.
    await context.addInitScript(({ ownOrigin, day }) => {
      if (location.origin !== ownOrigin) return;
      localStorage.setItem('kairo-word-ladder-demo-v1', '1');
      if (day) localStorage.setItem('kairo-shelf-day', day);
    }, { ownOrigin: origin, day: shelfDay });
    if (mutation) await serveMutation(context, mutation);
    if (restore) await serveRecorded(context, { origin, files: restore.files, delivered: restore.delivered });
    const page = await context.newPage();
    await page.goto(`${origin}/index.html${query}`);
    if (mutation?.control.setupError) throw new Error(`mutation setup: ${mutation.control.setupError}`);
    await ready(page);
    return { context, page };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

/** Serve the candidate's own file with a control's literal edits, in place of the original. */
async function serveMutation(context, { control, edits }) {
  for (const file of new Set(edits.map((edit) => edit.file))) {
    const mine = edits.filter((edit) => edit.file === file);
    await context.route((url) => url.origin === origin && url.pathname === `/${file}`, async (route) => {
      try {
        const response = await route.fetch();
        const bytes = await response.body();
        const baseSha256 = sha256(bytes);
        if (baseSha256 !== manifest?.get(file)) throw new Error(`${file}: the served bytes are not the candidate's (build-identity.json)`);
        let text = bytes.toString('utf8');
        const applied = [];
        for (const edit of mine) {
          const at = occurrences(text, edit.from);
          if (at.length !== 1) throw new Error(`${file}: edit ${edit.key} matched ${at.length} times, not exactly once`);
          text = text.slice(0, at[0]) + edit.to + text.slice(at[0] + edit.from.length);
          applied.push({ key: edit.key, offset: at[0] });
        }
        const body = Buffer.from(text, 'utf8');
        // the host's content-length describes the original bytes (an edit changes the length), and the
        // fetched body is already decoded: drop both, so the length is recomputed for the edited body
        const headers = { ...response.headers() };
        delete headers['content-length'];
        delete headers['content-encoding'];
        control.served.push({ file, baseSha256, mutantSha256: sha256(body), applied });
        await route.fulfill({ status: response.status(), headers, body });
      } catch (error) {
        control.setupError ||= error.message;
        await route.abort().catch(() => {});
      }
    });
  }
}

// the observable state of one token by index: surface, readings (all and visible), gloss, mark, focus, label
const tokenState = (page, index) => page.evaluate((i) => {
  const node = document.querySelector(`#reader .tok[data-index="${i}"]`);
  if (!node) return null;
  const bare = node.cloneNode(true);
  for (const extra of bare.querySelectorAll('rt, .tok-en')) extra.remove();
  const rts = [...node.querySelectorAll('rt')];
  const en = node.querySelector('.tok-en');
  // On-touch reader ruby is painted by ::before (rt is the semantic record), while always-on uses native rt.
  const painted = [...node.querySelectorAll('ruby')].map(ruby => {
    const style = getComputedStyle(ruby, '::before');
    let text = style.content;
    if (text?.startsWith('attr(')) text = ruby.getAttribute('data-r') || '';
    else if (/^["'].*["']$/u.test(text)) text = text.slice(1, -1);
    else text = '';
    return { text, opacity: Number(style.opacity), display: style.display, visibility: style.visibility };
  }).filter(row => row.text && row.opacity > 0 && row.display !== 'none' && row.visibility !== 'hidden');
  const native = rts.filter(rt => { const style = getComputedStyle(rt);
    return !rt.classList.contains('hidden-rt') && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0;
  }).map(rt => rt.textContent).join('');
  return { tag: node.tagName.toLowerCase(), cls: node.className, surface: bare.textContent,
    ruby: rts.map((rt) => rt.textContent).join(''),
    visibleRuby: native || painted.map(row => row.text).join(''), paintedRuby: painted,
    rung: node.dataset.ladderRung || null, name: node.getAttribute('aria-label'), role: node.getAttribute('role'),
    preparedDescription: (node.dataset.proseDescription || '').split(/\s+/u).filter(Boolean).map(id => document.getElementById(id)?.textContent || '').filter(Boolean).join(' · '),
    description: (node.getAttribute('aria-describedby') || '').split(/\s+/u).filter(Boolean).map(id => document.getElementById(id)?.textContent || '').filter(Boolean).join(' · '),
    gloss: en ? en.textContent : null, lit: node.classList.contains('lit'), hasEn: node.classList.contains('has-en'),
    // R4 (2026-09-30): a word is named by itself and described by the rest — read together, in order
    focused: document.activeElement === node, label: [node.getAttribute('aria-label') || '',
      ...(node.getAttribute('aria-describedby') || '').split(/\s+/u).filter(Boolean).map((id) => document.getElementById(id)?.textContent || '')]
      .filter(Boolean).join(' · '), cursor: getComputedStyle(node).cursor };
}, String(index));
const spoken = (state, reading = null) => {
  const expected = [reading, DOOR_HINT].filter(Boolean).join(' · ');
  return !!state && (state.role === 'group'
    ? state.name === SURFACE && state.description === expected
    : state.role === 'presentation' && state.name === null && state.description === '' && state.preparedDescription === expected);
};
// Idle spans deliberately cannot receive focus: exercise the paragraph's actual keyboard controller.
async function focusToken(page, index) {
  const position = await page.locator(`#reader .tok[data-index="${index}"]`).evaluate(node => {
    const block = node.closest('[data-prose-roving]');
    return { block: [...document.querySelectorAll('#reader [data-prose-roving]')].indexOf(block),
      word: block ? [...block.querySelectorAll('.tok[data-para]')].indexOf(node) : -1 };
  });
  if (position.block < 0 || position.word < 0) throw new Error(`Token ${index} has no prose keyboard position`);
  await page.locator('#reader [data-prose-roving]').nth(position.block).focus();
  await page.keyboard.press('Home');
  for (let step = 0; step < position.word; step++) await page.keyboard.press('ArrowRight');
  if (!await page.locator(`#reader .tok[data-index="${index}"]`).evaluate(node => document.activeElement === node)) throw new Error(`Keyboard did not reach token ${index}`);
}
const classes = (state) => String(state?.cls || '').split(/\s+/);
// a real click at the token's centre; `own` records whether that point is the token itself (the click is made either way)
async function tapCentre(page, index) {
  const node = page.locator(`#reader .tok[data-index="${index}"]`);
  const count = await node.count();
  if (count !== 1) return { done: false, own: false, count };
  await node.scrollIntoViewIfNeeded();
  const probe = await node.evaluate((target) => {
    const box = target.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    return { x, y, own: target.contains(document.elementFromPoint(x, y)) };
  });
  await page.mouse.click(probe.x, probe.y);
  return { done: true, own: probe.own };
}
// what the dials leave visible: the spacing class, and whether readings wait hidden (furigana 1)
const dialSignature = (page) => page.evaluate(() => {
  const reader = document.querySelector('#reader');
  return { spacing: reader?.classList.contains('sp-bunsetsu') ? 2 : reader?.classList.contains('sp-word') ? 1 : 0,
    readingsHidden: document.querySelectorAll('#reader rt.hidden-rt').length > 0 };
});
// the dials themselves: the 文字設定 fold is opened if it is closed (a same-passage re-render, which keeps reveal/gloss
// marks; the fold then stays open across passages), and each dial's one aria-pressed button is read. null = not exactly one.
async function readDials(page) {
  const toggle = page.locator('#dials-toggle');
  if ((await toggle.count()) !== 1) return null;
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('#dials-toggle')?.getAttribute('aria-expanded') === 'true'
      && document.querySelectorAll('[data-dial]').length > 0, null, { timeout: 5_000 }).catch(() => {});
  }
  return page.evaluate(() => Object.fromEntries(['kanji', 'furigana', 'spacing'].map((key) => {
    const on = [...document.querySelectorAll(`[data-dial^="${key}:"]`)].filter((button) => button.getAttribute('aria-pressed') === 'true');
    return [key, on.length === 1 ? Number(on[0].dataset.dial.slice(key.length + 1)) : null];
  })));
}
const shelfDoor = (id) => `[data-passage="${id}"]:not([data-recommendation]) .shelf-open`;
// the learner's way in: a shelf door, in whatever document is already open
async function openFromShelf(page, id) {
  await page.waitForFunction(() => document.body.dataset.view === 'shelf', null, { timeout: 10_000 });
  const door = page.locator(shelfDoor(id));
  if ((await door.count()) < 1) throw new Error(`fixture passage ${id} has no door on the shelf`);
  await door.first().click();
  await page.waitForFunction((pid) => document.body.dataset.view === 'reader'
    && document.querySelector('.listen-row')?.dataset.passage === pid && document.querySelector('#reader .tok'), id, { timeout: 10_000 });
}
// a fresh document (goto) for cases that must share no state: D2, D3
async function openArticle(page, query, id) {
  await page.goto(`${origin}/index.html?entry=shelf&${query}`); await ready(page);
  await openFromShelf(page, id);
}
async function servedJson(page, path) {
  try {
    const response = await page.request.get(`${origin}/${path}`);
    return response.ok() ? await response.json() : null;
  } catch { return null; }
}
async function servedToken(page, file, index) {
  return (await servedJson(page, file))?.tokens?.[index] ?? null;
}
// the open article and every mark painted in it: lit = revealed (or glossed) tokens, glossed = tokens carrying a gloss line
const readerMarks = (page) => page.evaluate(() => ({
  passage: document.querySelector('.listen-row')?.dataset.passage ?? null,
  sheet: document.querySelector('#sheet')?.dataset.node ?? null,
  lit: [...document.querySelectorAll('#reader .tok.lit')].map((node) => Number(node.dataset.index)).sort((a, b) => a - b),
  glossed: [...document.querySelectorAll('#reader .tok')].filter((node) => node.querySelector('.tok-en'))
    .map((node) => Number(node.dataset.index)).sort((a, b) => a - b),
}));
const markSets = (marks) => (marks ? { lit: marks.lit, glossed: marks.glossed } : null);

/** D3: with readings always on (0,2,0) or the text already in kana (2,1,0), each in a fresh document, やまなし's names are
 * doors with a pointer, and a click on 谷川 (token 1) opens the shared lookup popup for 谷川 and stays in the article. */
async function d3Names(page, rec) {
  for (const [key, dials] of [['k0f2', '0,2,0'], ['k2f1', '2,1,0']]) {
    await openArticle(page, `dials=${dials}`, PASSAGE_B);
    const state = await page.evaluate((index) => {
      const door = document.querySelector(`#reader .tok[data-index="${index}"]`);
      return { named: document.querySelectorAll('#reader .tok.named').length, spans: document.querySelectorAll('#reader span.tok.named').length, buttons: document.querySelectorAll('#reader button.tok.named').length,
        door: door ? `${door.tagName.toLowerCase()}.${[...door.classList].join('.')}` : null, cursor: door ? getComputedStyle(door).cursor : null };
    }, DOOR.index);
    rec(`D3.${key}.names`, `D3 dials ${dials}: every name in ${PASSAGE_B} is a door, ${SURFACE} among them`,
      state.named > 0 && state.spans === state.named && state.buttons === 0 && state.door === 'span.tok.named', JSON.stringify(state));
    rec(`D3.${key}.pointer`, `D3 dials ${dials}: a name's door shows the pointer it answers to`, state.cursor === 'pointer', String(state.cursor));
    const tap = await tapCentre(page, DOOR.index);
    const mini = await page.waitForFunction(() => document.querySelector('#mini .mini-word')?.textContent.trim() || null, null, { timeout: 5_000 })
      .then((handle) => handle.jsonValue(), () => null);
    const after = await page.evaluate(() => ({ view: document.body.dataset.view, passage: document.querySelector('.listen-row')?.dataset.passage ?? null }));
    rec(`D3.${key}.opens-lookup`, `D3 dials ${dials}: a click on ${SURFACE} opens its lookup, in the article: never a button that reveals nothing`,
      tap.done && tap.own && mini === SURFACE && after.view === 'reader' && after.passage === PASSAGE_B,
      JSON.stringify({ tap, mini, ...after }), { mini });
  }
}

// the word popup as it stands: its word and reading, null when none is open
const popupState = (page) => page.evaluate(() => {
  const mini = document.getElementById('mini');
  return mini ? { word: mini.querySelector('.mini-word')?.textContent ?? null, reading: mini.querySelector('.mini-reading')?.textContent ?? null } : null;
});

/** D2 at one furigana setting: the fixture door, tap/Enter/Space, against the literal reading. */
async function d2Door(page, rec, furigana) {
  const key = `D2.f${furigana}`, label = `D2 f=${furigana}`;
  const views = [], accessibleViews = [], firsts = [], popups = [], folds = [], focus = [], neighbours = [], navigation = [], acts = [];
  let before = null;
  for (const how of ['tap','Enter','Space']) {
    await openArticle(page, `dials=0,${furigana},0&ui=bi`, PASSAGE_B);
    const node = page.locator(`#reader .tok[data-index="${DOOR.index}"]`);
    const source = await node.elementHandle(); // exact connected occurrence, captured before opening its popup
    before ||= await tokenState(page, DOOR.index);
    const neighbour = await tokenState(page, DOOR.neighbour.index);
    const activate = async () => how === 'tap' ? tapCentre(page, DOOR.index)
      : (await focusToken(page, DOOR.index), await page.keyboard.press(how), {done:true,own:true});
    const act = await activate(); acts.push(act);
    await page.waitForFunction(({i,f}) => document.querySelector(`#reader .tok[data-index="${i}"]`)?.dataset.ladderRung === (f===1 ? 'reading':'stage'),
      {i:DOOR.index,f:furigana},{timeout:5000}).catch(()=>{});
    firsts.push({rung:(await tokenState(page,DOOR.index))?.rung, popup:await popupState(page)});
    if (furigana===1) await activate();
    await page.waitForFunction(() => !!document.getElementById('mini'), null, {timeout:5000}).catch(()=>{});
    popups.push(await popupState(page));
    // A distinct, connected same-spelling occurrence makes a spelling-only return insufficient.
    await node.evaluate(n => { const twin = n.cloneNode(true); twin.dataset.vhDuplicate = 'true'; twin.dataset.index = 'vh-duplicate'; twin.tabIndex = -1; n.after(twin); });
    views.push(await tokenState(page, DOOR.index));
    if (how === 'tap') await page.locator('#mini').focus();
    const premise = await source.evaluate(n => ({ inside: !!document.activeElement?.closest('#mini'), source: document.activeElement === n, connected: n.isConnected }));
    await page.keyboard.press('Escape');
    const popupGone = await page.waitForFunction(() => !document.getElementById('mini'), null, {timeout:3000}).then(() => true, () => false);
    folds.push(await tokenState(page,DOOR.index));
    focus.push({how, premise, popupGone, popupPresent: !popupGone,
      back: await source.evaluate(n => n.isConnected && document.activeElement === n),
      onDuplicate: await page.evaluate(() => document.activeElement?.dataset.vhDuplicate === 'true')});
    await page.locator('[data-vh-duplicate]').evaluateAll(nodes => nodes.forEach(n => n.remove()));
    neighbours.push(canonical(await tokenState(page,DOOR.neighbour.index))===canonical(neighbour));
    navigation.push(await page.evaluate(pid=>document.body.dataset.view==='reader'&&document.querySelector('.listen-row')?.dataset.passage===pid,PASSAGE_B));
    // Separate fresh selection walk: never move focus to the source before the Escape being tested.
    await openArticle(page, `dials=0,${furigana},0&ui=bi`, PASSAGE_B);
    await activate();
    await page.waitForFunction(({i,f}) => document.querySelector(`#reader .tok[data-index="${i}"]`)?.dataset.ladderRung === (f === 1 ? 'reading' : 'stage'), {i:DOOR.index,f:furigana}, {timeout:5000});
    if (furigana === 1) await activate();
    await page.waitForFunction(() => !!document.getElementById('mini'), null, {timeout:5000});
    await focusToken(page, DOOR.index);
    accessibleViews.push(await tokenState(page, DOOR.index));
  }
  const done=acts.every(row=>row.done&&row.own);
  rec(`${key}.door`,`${label}: literal name is an inline span door, initially bare`, before?.tag==='span'&&classes(before).includes('named')&&before.surface===SURFACE&&before.visibleRuby==='',JSON.stringify(before));
  rec(`${key}.first-rung`,`${label}: initial activation ${furigana===1?'reveals reading only':'opens stage directly'}`,
    done&&firsts.every(row=>row.rung===(furigana===1?'reading':'stage')&&(furigana===1?row.popup===null:row.popup?.word===SURFACE)),JSON.stringify(firsts),firsts);
  rec(`${key}.popup-reading`,`${label}: each modality reaches the exact word and reading at stage`,done&&popups.every(row=>row?.word===SURFACE&&row.reading===READING),JSON.stringify(popups),popups);
  const visible=views.map(row=>row?.visibleRuby??null);
  rec(`${key}.visible-reading`,`${label}: inline ruby obeys the dial exactly`,done&&visible.every(value=>value===(furigana===1?READING:'')),JSON.stringify(visible),visible);
  const labels=accessibleViews.map(row=>({name:row?.name,description:row?.description,role:row?.role}));
  rec(`${key}.accessible-reading`,`${label}: selected prose word names only itself and describes only the permitted reading`,
    done&&accessibleViews.every(row=>row?.name===SURFACE&&row.role==='group'&&spoken(row,furigana===1?READING:null)),JSON.stringify(labels),labels);
  rec(`${key}.no-english`,`${label}: no inline English appears`,done&&views.every(row=>row&&row.gloss===null&&!row.hasEn),JSON.stringify(views.map(row=>row?.gloss)));
  const escape = escapeObligations(focus);
  rec(`${key}.popup-focus-premise`, `${label}: every Escape starts inside the popup, outside the exact source`, escape.premise, JSON.stringify(focus), focus);
  rec(`${key}.focus-returns`,`${label}: Escape returns from the popup to the exact connected occurrence`,escape.exactSource,JSON.stringify(focus),focus);
  rec(`${key}.popup-absent`, `${label}: Escape removes the actual popup`, escape.popupAbsent, JSON.stringify(focus), focus);
  rec(`${key}.neighbour-unchanged`,`${label}: neighbouring particle is unchanged`,neighbours.every(Boolean),JSON.stringify(neighbours));
  rec(`${key}.no-navigation`,`${label}: every activation stays in the literal article`,navigation.every(Boolean),JSON.stringify(navigation));
  rec(`${key}.bare-after-fold`,`${label}: Escape removes stage, rung and summoned reading`,folds.every(row=>row?.rung===null&&row.visibleRuby===''&&!row.lit),JSON.stringify(folds),folds);
}

/** D4 in one document: A token 1 touched, 戻る, B from the shelf, B token 1 checked and tapped twice. */
async function d4Walk(page, rec) {
  const marker = await page.evaluate(() => (window.__readerDoorsDocument = `${Date.now()}-${Math.random().toString(36).slice(2)}`));
  await openFromShelf(page, PASSAGE_A);
  const dialsA = await readDials(page), shownA = await dialSignature(page);
  const aBefore = await tokenState(page, A_TOKEN.index);
  const aTap = await tapCentre(page, A_TOKEN.index);
  await page.waitForFunction(() => !!document.getElementById('mini'), null, { timeout: 3_000 }).catch(() => {});
  const aAfter = await tokenState(page, A_TOKEN.index), aPopup = await popupState(page);
  rec('D4.A-prior-state', `D4 ${PASSAGE_A} token ${A_TOKEN.index} ${A_TOKEN.token.s} starts plain, and one tap leaves it the touched word, its popup open`,
    aBefore?.tag === 'span' && classes(aBefore).includes('content') && aBefore.surface === A_TOKEN.token.s && !aBefore.lit && aBefore.gloss === null
      && aTap.done && aAfter?.rung === 'stage' && aPopup?.word === A_TOKEN.token.b,
    JSON.stringify({ aBefore, aAfter, aTap, aPopup }));
  rec('D4.A-no-english', `D4 that tap writes no English under ${A_TOKEN.token.s}: the meaning is in its popup`,
    aTap.done && !!aAfter && aAfter.gloss === null && !aAfter.hasEn, JSON.stringify(aAfter?.gloss ?? null), { glosses: [aAfter?.gloss ?? null] });
  await focusToken(page, A_TOKEN.index);
  await page.keyboard.press('Escape');
  await page.locator('#back').click();
  await openFromShelf(page, PASSAGE_B);
  const sameDocument = await page.evaluate((value) => window.__readerDoorsDocument === value, marker);
  rec('D4.same-document', `D4 ${PASSAGE_A} → 戻る → shelf → ${PASSAGE_B} stayed in one document`, sameDocument, marker);
  // B token 1 is observed first: reading the dials can re-render B (only if its fold were closed)
  const b0 = await tokenState(page, DOOR.index);
  const dialsB = await readDials(page), shownB = await dialSignature(page);
  rec('D4.same-dials', 'D4 the dial controls read kanji 0, furigana 1, spacing 0 in both articles, and the text agrees (no spacing class; readings hidden until touched)',
    canonical(dialsA) === canonical({ kanji: 0, furigana: 1, spacing: 0 }) && canonical(dialsB) === canonical(dialsA)
      && canonical(shownA) === canonical({ spacing: 0, readingsHidden: true }) && canonical(shownB) === canonical(shownA),
    JSON.stringify({ dialsA, dialsB, shownA, shownB }));
  rec('D4.B-door', `D4 ${PASSAGE_B} token ${DOOR.index} is the reading door ${SURFACE} carrying ${READING}`,
    b0?.tag === 'span' && classes(b0).includes('named') && b0.surface === SURFACE && b0.ruby === READING, JSON.stringify(b0));
  rec('D4.no-inherited-state', `D4 it opens with no reveal, mark or English from ${PASSAGE_A} token ${A_TOKEN.index}, labelled exactly "${doorLabel()}"`,
    !!b0 && b0.visibleRuby === '' && !b0.lit && b0.gloss === null && !b0.hasEn && spoken(b0), JSON.stringify(b0),
    { visibleRuby: b0?.visibleRuby ?? null, lit: b0?.lit ?? null, gloss: b0?.gloss ?? null });
  // exercised whatever the rows above found: a missing or plain token fails the rows below, it never skips them
  const taps = [], views = [], popups = [];
  for (let i = 0; i < 2; i++) {
    taps.push(await tapCentre(page, DOOR.index));
    if (i === 0) await page.waitForFunction(i => document.querySelector(`#reader .tok[data-index="${i}"]`)?.dataset.ladderRung === 'reading', DOOR.index, {timeout:5000}).catch(()=>{});
    else await page.waitForFunction(() => !!document.getElementById('mini'), null, {timeout:5000}).catch(()=>{});
    views.push(await tokenState(page, DOOR.index));
    popups.push(await popupState(page));
  }
  const done = taps.every((tap) => tap.done);
  rec('D4.tap-shows', `D4 first tap reveals exactly ${READING} without a stage`,
    done && views[0]?.visibleRuby===READING && views[0].rung==='reading' && spoken(views[0],READING) && popups[0]===null,
    JSON.stringify({view:views[0],popup:popups[0]}));
  rec('D4.second-tap-stage', `D4 second tap opens the exact word stage`,
    done && popups[1]?.word===SURFACE && popups[1].reading===READING && views[1]?.rung==='stage',
    JSON.stringify({view:views[1],popup:popups[1]}),{popup:popups[1]});
  await focusToken(page, DOOR.index);
  await page.keyboard.press('Escape');
  const folded=await tokenState(page,DOOR.index);
  rec('D4.fold-bare','D4 Escape clears the reading and stage without leaving the article',
    folded?.visibleRuby==='' && !folded.lit && folded.rung===null && await popupState(page)===null && (await readerMarks(page)).passage===PASSAGE_B,JSON.stringify(folded));
  const glosses = views.map((view) => view?.gloss ?? null);
  rec('D4.never-english', `D4 tapping it never adds English, whatever ${PASSAGE_A} token ${A_TOKEN.index} carried`,
    done && views.every((view) => view && view.gloss === null && !view.hasEn), JSON.stringify(glosses), { glosses });
}

/** D5 in one document: home's own mark, the この記事を読む detour into the away article with a mark at index 1 there,
 * then 戻る home. Each step waits for its own landmark; a step that cannot happen stops the case (no row is guessed). */
async function d5Detour(page, rec) {
  const marker = await page.evaluate(() => (window.__readerDoorsDocument = `${Date.now()}-${Math.random().toString(36).slice(2)}`));
  const sameDocument = () => page.evaluate((value) => window.__readerDoorsDocument === value, marker);
  const frames = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  // the away body first: the word sheet lists examples from loaded articles only, so prefetch timing must not decide them
  await openFromShelf(page, D5.away);
  await page.locator('#back').click();
  await openFromShelf(page, D5.home);
  const clean = await readerMarks(page);
  // G3: first tap summons only this occurrence's reading; no English or stage.
  const knownTaps = [await tapCentre(page, D5.known.index)];
  await page.waitForFunction(i => document.querySelector(`#reader .tok[data-index="${i}"]`)?.dataset.ladderRung==='reading', D5.known.index,{timeout:3000}).catch(()=>{});
  const homeBefore = await readerMarks(page);
  const known = await tokenState(page, D5.known.index), named = await tokenState(page, DOOR.index);
  rec('D5.home-marks', `D5 ${D5.home} opens unmarked; one tap leaves token ${D5.known.index} ${D5.known.token.s} the touched word (${D5.known.token.r} shown), its only mark; token ${DOOR.index} ${SURFACE} is the hidden reading door`,
    canonical(markSets(clean)) === canonical({ lit: [], glossed: [] }) && knownTaps.every((tap) => tap.done)
      && canonical(homeBefore.lit) === canonical([D5.known.index]) && known?.visibleRuby === D5.known.token.r
      && named?.tag === 'span' && classes(named).includes('named') && named.visibleRuby === '' && spoken(named),
    JSON.stringify({ clean: markSets(clean), homeBefore: markSets(homeBefore), known, named, knownTaps }));

  const detour = { word: (await tokenState(page, D5.word.index))?.surface ?? null, examples: null, anchor: null };
  let step = `focus token ${D5.word.index}`;
  try {
    // the sheet opens through the word's own keyboard door (Ctrl+Enter): no popup, no touch on the text
    await focusToken(page, D5.word.index);
    step = 'Ctrl+Enter';
    await page.keyboard.press('Control+Enter');
    step = `the ${D5.word.token.b} sheet`;
    await page.locator(`#sheet[data-node="word:${D5.word.token.b}"]`).waitFor({ timeout: 10_000 });
    detour.examples = await page.evaluate(() => [...document.querySelectorAll('#sheet .example')].map((line) => line.querySelector('.example-src')?.textContent ?? ''));
    // G1 (Codex gap 17): the tapped word's own sentence from its article leads the examples; the rest wait, folded,
    // under "More examples" — a reader opens the fold to reach them, and so does this walk
    detour.ownFirst = await page.evaluate(() => document.querySelector('#sheet .example')?.hasAttribute('data-own') ?? false);
    const at = detour.examples.indexOf(D5.awaySource);
    if (at < 0) throw new Error(`no example from ${D5.awaySource}: ${JSON.stringify(detour.examples)}`);
    // found by its source, not its place: examples that arrive later (the bank's) take their own places in the list
    const away = page.locator('#sheet .example', { has: page.locator('.example-src', { hasText: D5.awaySource }) }).first();
    if (await away.evaluate((line) => !!line.closest('details:not([open])'))) {
      step = 'More examples';
      await page.locator('#sheet details.more-examples > summary').click();
    }
    step = '▹';
    await away.locator('.sent-door').click();
    step = 'この記事を読む';
    await page.locator('#sheet #sent-home').waitFor({ timeout: 5_000 });
    await page.locator('#sheet #sent-home').click();
    step = `${D5.away} at its example`;
    await page.waitForFunction((pid) => document.body.dataset.view === 'reader' && document.querySelector('.listen-row')?.dataset.passage === pid
      && !document.querySelector('#sheet') && document.querySelector('#reader .tok'), D5.away, { timeout: 10_000 });
    // openPassage restores the example's place in an animation frame: wait for its focus, so no later scroll moves a tap
    await page.waitForFunction((i) => document.activeElement?.dataset?.index === i, String(D5.awaySentence.at), { timeout: 5_000 });
    detour.anchor = D5.awaySentence.at;
  } catch (error) {
    throw new Error(`D5 detour stopped at ${step}: ${error.message}`);
  }
  rec('D5.detour', `D5 ${D5.word.token.b}'s sheet opens from token ${D5.word.index}; its first example is its own sentence in ${D5.home}, and ${D5.away}'s only one, whose ▹ and この記事を読む open ${D5.away} at token ${D5.awaySentence.at}, follows in the same document`,
    detour.word === D5.word.token.s && detour.ownFirst === true && detour.examples?.[0] !== D5.awaySource && detour.examples.filter((source) => source === D5.awaySource).length === 1
      && detour.anchor === D5.awaySentence.at && await sameDocument(), JSON.stringify(detour));

  const awayClean = await readerMarks(page);
  const awayTaps = [await tapCentre(page, A_TOKEN.index)];
  await page.waitForFunction(() => !!document.getElementById('mini'), null, { timeout: 3_000 }).catch(() => {});
  const awayMarked = await readerMarks(page);
  rec('D5.away-marks', `D5 ${D5.away} opens unmarked, and one tap leaves its token ${A_TOKEN.index} ${A_TOKEN.token.s} (an index ${D5.home} has not touched) the touched word, its only mark`,
    awayClean.passage === D5.away && canonical(markSets(awayClean)) === canonical({ lit: [], glossed: [] }) && awayTaps.every((tap) => tap.done)
      && (await tokenState(page,A_TOKEN.index))?.rung === 'stage' && (await popupState(page))?.word === A_TOKEN.token.b && !homeBefore.lit.includes(A_TOKEN.index),
    JSON.stringify({ awayClean: markSets(awayClean), awayMarked: markSets(awayMarked), awayTaps }));

  await focusToken(page, A_TOKEN.index);
  await page.keyboard.press('Escape');
  // 戻る: the frame returns home under the sheets the detour left from; then the sheet's own 戻る (#sheet-back), only while one
  // of them is still open — under a dialog the chrome's #back is inert behind the scrim (the layer law)
  await page.locator('#back').click();
  await page.waitForFunction((pid) => document.querySelector('.listen-row')?.dataset.passage === pid && document.querySelector('#reader .tok'),
    D5.home, { timeout: 10_000 });
  const atReturn = await readerMarks(page), namedAtReturn = await tokenState(page, DOOR.index);
  let presses = 0;
  while (presses < 3 && (await page.locator('#sheet').count())) {
    await page.locator('#sheet #sheet-back').click();
    presses += 1;
    // G1: Back moves the page inside its cut (the page changes in the cut's update, a frame after the click): the next
    // count reads the page that stands once no cut runs
    await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'), null, { timeout: 5_000 });
  }
  const uncovered = await readerMarks(page), namedUncovered = await tokenState(page, DOOR.index);
  rec('D5.returned', `D5 戻る returns to ${D5.home} in the same document, and closing the sheets it left from keeps ${D5.home}`,
    atReturn.passage === D5.home && uncovered.passage === D5.home && uncovered.sheet === null && await sameDocument(),
    JSON.stringify({ atReturn: { passage: atReturn.passage, sheet: atReturn.sheet }, uncovered: { passage: uncovered.passage, sheet: uncovered.sheet }, presses }));
  rec('D5.home-bare-return', `D5 ${D5.home} returns without a summoned reading, under its sheets and after they close`,
    canonical(markSets(atReturn)) === canonical({lit:[],glossed:[]}) && canonical(markSets(uncovered)) === canonical({lit:[],glossed:[]}),
    JSON.stringify({ before: markSets(homeBefore), atReturn: markSets(atReturn), uncovered: markSets(uncovered) }),
    { before: markSets(homeBefore), atReturn: markSets(atReturn), uncovered: markSets(uncovered) });
  rec('D5.away-index-not-lit', `D5 ${D5.away}'s mark at index ${A_TOKEN.index} does not land on ${D5.home}'s ${SURFACE}: not lit, reading hidden, label exactly "${doorLabel()}"`,
    [namedAtReturn, namedUncovered].every((view) => view && classes(view).includes('named') && !view.lit && view.visibleRuby === '' && spoken(view)),
    JSON.stringify({ namedAtReturn, namedUncovered }));
  // the closed sheet hands focus back to token 293 in an animation frame (showing its actions): let that land, then move
  // focus to the door itself, so the tap below meets the door and no pill
  await frames();
  await focusToken(page, DOOR.index);
  const toggle = await tapCentre(page, DOOR.index);
  await page.waitForFunction(i=>document.querySelector(`#reader .tok[data-index="${i}"]`)?.dataset.ladderRung==='reading',DOOR.index,{timeout:5000}).catch(()=>{});
  const namedAfter = await tokenState(page, DOOR.index);
  rec('D5.named-tap', `D5 a tap on ${D5.home}'s ${SURFACE} then shows exactly ${READING}, labelled exactly "${doorLabel(READING)}"`,
    toggle.done && namedAfter?.visibleRuby === READING && spoken(namedAfter,READING), JSON.stringify({ namedAfter, toggle }));
  const glosses = [namedAtReturn, namedUncovered, namedAfter].map((view) => view?.gloss ?? null);
  rec('D5.named-no-english', `D5 ${D5.home}'s ${SURFACE} shows no English: under the sheets, with them closed, or after its tap`,
    toggle.done && [namedAtReturn, namedUncovered, namedAfter].every((view) => view && view.gloss === null && !view.hasEn), JSON.stringify(glosses), { glosses });
}

/** The saved word enters through the real importer (record-fixture-support's restoreAppFixture, the existing convention).
 * Its encounter is built by the SERVED candidate's own teacher-context.mjs, so the content-derived id is the one this
 * candidate verifies. The source digest is computed here from the served article. */
async function seedSavedEncounter(page) {
  const away = await servedJson(page, A_TOKEN.file);
  const sourceDigest = sha256(Buffer.from(JSON.stringify((away?.tokens || []).map((token) => token.s)), 'utf8'));
  const teacher = await import(pathToFileURL(resolve(SITE, 'teacher-context.mjs')).href);
  const encounter = await teacher.createTeacherContext({ ...D6.encounter, target: { ...D6.encounter.target }, sourceDigest });
  const saved = { t: 'word', id: D6.word.token.b, label: D6.word.token.b, kind: '語', kindEn: 'word', from: null,
    ts: D6.savedAt, started: D6.savedAt, sourceContextRef: encounter.id };
  await restoreAppFixture(page, { v: 1, taken: [saved], teacherContexts: { version: 1, activeRef: null, entries: [encounter] } });
  return encounter;
}

/** D6: after seeding, in one document, home takes its own marks. わかる's sheet shows the saved encounter; 元の文を読む
 * visits ごん狐 and marks index 1 there; reader-source-back returns home (D22b). */
async function d6Visit(page, rec) {
  await seedSavedEncounter(page);
  await page.goto(`${origin}/index.html${D4_QUERY}`); await ready(page);
  const marker = await page.evaluate(() => (window.__readerDoorsDocument = `${Date.now()}-${Math.random().toString(36).slice(2)}`));
  const sameDocument = () => page.evaluate((value) => window.__readerDoorsDocument === value, marker);
  const frames = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await openFromShelf(page, D6.home);
  const clean = await readerMarks(page);
  // G3: first tap summons only this occurrence's reading; no English or stage.
  const knownTaps = [await tapCentre(page, D5.known.index)];
  await page.waitForFunction(i => document.querySelector(`#reader .tok[data-index="${i}"]`)?.dataset.ladderRung==='reading', D5.known.index,{timeout:3000}).catch(()=>{});
  const homeBefore = await readerMarks(page);
  const known = await tokenState(page, D5.known.index), named = await tokenState(page, DOOR.index);
  rec('D6.home-marks', `D6 ${D6.home} opens unmarked; one tap leaves token ${D5.known.index} ${D5.known.token.s} the touched word (${D5.known.token.r} shown), its only mark; token ${DOOR.index} ${SURFACE} is the hidden reading door`,
    canonical(markSets(clean)) === canonical({ lit: [], glossed: [] }) && knownTaps.every((tap) => tap.done)
      && canonical(homeBefore.lit) === canonical([D5.known.index]) && known?.visibleRuby === D5.known.token.r
      && named?.tag === 'span' && classes(named).includes('named') && named.visibleRuby === '' && spoken(named),
    JSON.stringify({ clean: markSets(clean), homeBefore: markSets(homeBefore), known, named, knownTaps }));

  const visit = { word: (await tokenState(page, D6.word.index))?.surface ?? null, quote: null, anchor: null, sourceBack: false };
  let step = `focus token ${D6.word.index}`;
  try {
    // the sheet opens through the word's own keyboard door (Ctrl+Enter): no popup, no touch on the text
    await focusToken(page, D6.word.index);
    step = 'Ctrl+Enter';
    await page.keyboard.press('Control+Enter');
    step = `the ${D6.word.token.b} sheet's saved encounter`;
    await page.locator(`#sheet[data-node="word:${D6.word.token.b}"] .learning-source`).waitFor({ timeout: 10_000 });
    const source = page.locator('#sheet .learning-source');
    visit.quote = await source.locator('.teacher-source-quote').textContent();
    if (!(await source.evaluate((node) => node.open))) await source.locator('summary').click();
    step = '元の文を読む';
    await page.locator('#learning-source-return').click();
    step = `${D6.away} at the encounter`;
    await page.waitForFunction((pid) => document.body.dataset.view === 'reader' && document.querySelector('.listen-row')?.dataset.passage === pid
      && !document.querySelector('#sheet') && document.querySelector('#reader .tok'), D6.away, { timeout: 10_000 });
    // openPassage restores the encounter's place in an animation frame: wait for its focus, so no later scroll moves a tap
    await page.waitForFunction((i) => document.activeElement?.dataset?.index === i, String(D6.encounter.index), { timeout: 5_000 });
    visit.anchor = D6.encounter.index;
    visit.sourceBack = (await page.locator('#reader-source-back').count()) === 1;
  } catch (error) {
    throw new Error(`D6 source visit stopped at ${step}: ${error.message}`);
  }
  rec('D6.source-visit', `D6 ${D6.word.token.b}'s sheet, opened from token ${D6.word.index}, shows the saved encounter "${D6.encounter.quote}"; 元の文を読む opens ${D6.away} at token ${D6.encounter.index}, offering reader-source-back, in the same document`,
    visit.word === D6.word.token.s && visit.quote === D6.encounter.quote && visit.anchor === D6.encounter.index && visit.sourceBack
      && await sameDocument(), JSON.stringify(visit));

  const awayClean = await readerMarks(page);
  const awayTaps = [await tapCentre(page, A_TOKEN.index)];
  await page.waitForFunction(() => !!document.getElementById('mini'), null, { timeout: 3_000 }).catch(() => {});
  const awayMarked = await readerMarks(page);
  rec('D6.away-marks', `D6 ${D6.away} opens unmarked, and one tap leaves its token ${A_TOKEN.index} ${A_TOKEN.token.s} (an index ${D6.home} has not touched) the touched word, its only mark`,
    awayClean.passage === D6.away && canonical(markSets(awayClean)) === canonical({ lit: [], glossed: [] }) && awayTaps.every((tap) => tap.done)
      && (await tokenState(page,A_TOKEN.index))?.rung === 'stage' && (await popupState(page))?.word === A_TOKEN.token.b && !homeBefore.lit.includes(A_TOKEN.index),
    JSON.stringify({ awayClean: markSets(awayClean), awayMarked: markSets(awayMarked), awayTaps }));

  // the touched word's popup floats over the page: Escape on the word puts it away before the return control is pressed
  await focusToken(page, A_TOKEN.index);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('mini'), null, { timeout: 3_000 }).catch(() => {});
  // reader-source-back: the visit returns home under exactly the sheet it left from, that sheet's own door focused
  // (restoreLearningSourceCaller focuses the visit's focusId in a frame); closing that ONE sheet hands focus back to the
  // reader token it was opened from. Restoring passage and marks while losing S.stack must fail here (Codex D6 review).
  await page.locator('#reader-source-back').click();
  await page.waitForFunction((pid) => document.querySelector('.listen-row')?.dataset.passage === pid && document.querySelector('#reader .tok'),
    D6.home, { timeout: 10_000 });
  await frames();
  const namedEnglish = () => page.evaluate(() => document.querySelectorAll('#reader .tok.named .tok-en, #reader .tok.named.has-en').length);
  const atReturn = await readerMarks(page), namedAtReturn = await tokenState(page, DOOR.index), englishAtReturn = await namedEnglish();
  const sheetsAtReturn = await page.evaluate(() => [...document.querySelectorAll('#sheet')].map((sheet) => sheet.dataset.node ?? null));
  const focusAtReturn = await page.evaluate(() => document.activeElement?.id || null);
  const closed = await page.locator('#sheet #sheet-back').click({ timeout: 5_000 }).then(() => true, () => false);
  await frames();
  const sheetsAfterClose = await page.locator('#sheet').count();
  const focusAfterClose = await page.evaluate(() => {
    const active = document.activeElement;
    return { index: active?.dataset?.index ?? null, doorOf: active?.closest?.('.token-door')?.querySelector('.tok')?.dataset?.index ?? null };
  });
  const uncovered = await readerMarks(page), namedUncovered = await tokenState(page, DOOR.index), englishUncovered = await namedEnglish();
  const visitGone = (await page.locator('#reader-source-back').count()) === 0;
  const wordIndex = String(D6.word.index);
  rec('D6.returned', `D6 reader-source-back returns to ${D6.home} in the same document under exactly the word:${D6.word.token.b} sheet, focus on #learning-source-return; one close ends the visit and focus returns to token ${D6.word.index}`,
    atReturn.passage === D6.home && canonical(sheetsAtReturn) === canonical([`word:${D6.word.token.b}`])
      && focusAtReturn === 'learning-source-return' && closed && sheetsAfterClose === 0
      && (focusAfterClose.index === wordIndex || focusAfterClose.doorOf === wordIndex)
      && uncovered.passage === D6.home && uncovered.sheet === null && visitGone && await sameDocument(),
    JSON.stringify({ atReturn: { passage: atReturn.passage, sheets: sheetsAtReturn, focus: focusAtReturn }, closed, sheetsAfterClose,
      focusAfterClose, uncovered: { passage: uncovered.passage, sheet: uncovered.sheet }, visitGone }));
  rec('D6.home-bare-return', `D6 ${D6.home} returns without a summoned reading, under its sheets and after they close`,
    canonical(markSets(atReturn)) === canonical({lit:[],glossed:[]}) && canonical(markSets(uncovered)) === canonical({lit:[],glossed:[]}),
    JSON.stringify({ before: markSets(homeBefore), atReturn: markSets(atReturn), uncovered: markSets(uncovered) }),
    { before: markSets(homeBefore), atReturn: markSets(atReturn), uncovered: markSets(uncovered) });
  rec('D6.away-index-not-lit', `D6 ${D6.away}'s mark at index ${A_TOKEN.index} does not land on ${D6.home}'s ${SURFACE}: not lit, reading hidden, label exactly "${doorLabel()}"`,
    [namedAtReturn, namedUncovered].every((view) => view && classes(view).includes('named') && !view.lit && view.visibleRuby === '' && spoken(view)),
    JSON.stringify({ namedAtReturn, namedUncovered }));
  // the closed sheet hands focus back in an animation frame: let that land, then move focus to the door itself
  await frames();
  await focusToken(page, DOOR.index);
  const toggle = await tapCentre(page, DOOR.index);
  await page.waitForFunction(i=>document.querySelector(`#reader .tok[data-index="${i}"]`)?.dataset.ladderRung==='reading',DOOR.index,{timeout:5000}).catch(()=>{});
  const namedAfter = await tokenState(page, DOOR.index), englishAfter = await namedEnglish();
  rec('D6.named-tap', `D6 a tap on ${D6.home}'s ${SURFACE} then shows exactly ${READING}, labelled exactly "${doorLabel(READING)}"`,
    toggle.done && namedAfter?.visibleRuby === READING && spoken(namedAfter,READING), JSON.stringify({ namedAfter, toggle }));
  const glosses = [namedAtReturn, namedUncovered, namedAfter].map((view) => view?.gloss ?? null);
  rec('D6.named-no-english', `D6 no reading door in ${D6.home} shows English (${SURFACE} included): under the sheet, with it closed, or after ${SURFACE}'s tap`,
    toggle.done && [namedAtReturn, namedUncovered, namedAfter].every((view) => view && view.gloss === null && !view.hasEn)
      && englishAtReturn === 0 && englishUncovered === 0 && englishAfter === 0,
    JSON.stringify({ glosses, named: [englishAtReturn, englishUncovered, englishAfter] }), { glosses });
}

/** killed only when the run is exactly the schedule: every row once, the witnesses failing as declared, only `allowed`
 * rows failing beside them. incomplete: the schedule never stood (setup, identity, page errors, rows not reached, a
 * candidate or baseline that is not clean). contaminated: it ran, but more changed than the declared mechanism. */
function adjudicate(spec, control) {
  const expected = RUN_ROWS[spec.run];
  const declared = [...spec.requires, ...spec.kills, ...spec.allowed];
  if (!expected || !RUN_FIXTURE[spec.run] || declared.some((id) => !expected.includes(id)) || new Set(declared).size !== declared.length)
    return ['incomplete', 'declaration: a run with a fixture row; requires, kills and allowed must be distinct rows of the run'];
  if (control.setupError) return ['incomplete', `setup: ${control.setupError}`];
  if (control.error) return ['incomplete', `stopped: ${control.error}`];
  if (control.pageErrors.length) return ['incomplete', `page errors in the mutant: ${JSON.stringify(control.pageErrors)}`];
  for (const file of new Set(spec.edits.map((key) => EDITS[key].file)))
    if (!control.served.some((row) => row.file === file)) return ['incomplete', `${file}: the edited bytes were never served`];
  if (spec.baseline) {
    const base = controls.find((row) => row.name === spec.baseline);
    if (base?.verdict !== 'killed') return ['incomplete', `baseline ${spec.baseline} is not an admitted kill (${base?.verdict ?? 'absent'})`];
  }
  // the mutant can only differ from a candidate that passes the same schedule, row for row, on the fixture it was built
  // for. The fixture row is the candidate's alone; a mutant run is never asked to repeat it.
  const fixture = RUN_FIXTURE[spec.run], fixtureHits = results.filter((row) => row.id === fixture);
  if (fixtureHits.length !== 1 || !fixtureHits[0].pass) return ['incomplete', `setup: the candidate's ${fixture} did not pass exactly once`];
  const unclean = expected.filter((id) => { const hits = results.filter((row) => row.id === id); return hits.length !== 1 || !hits[0].pass; });
  if (unclean.length) return ['incomplete', `the candidate does not pass these rows exactly once: ${unclean.join(', ')}`];
  const ids = control.rows.map((row) => row.id);
  const duplicated = [...new Set(ids.filter((id, at) => ids.indexOf(id) !== at))];
  const extra = [...new Set(ids.filter((id) => !expected.includes(id)))];
  if (duplicated.length || extra.length) return ['contaminated', `rows outside the schedule: ${[...duplicated.map((id) => `${id} (twice)`), ...extra].join(', ')}`];
  const rows = new Map(control.rows.map((row) => [row.id, row]));
  const missing = expected.filter((id) => !rows.has(id));
  if (missing.length) return ['incomplete', `never reached: ${missing.join(', ')}`];
  const unmet = spec.requires.filter((id) => !rows.get(id).pass);
  if (unmet.length) return ['incomplete', `the schedule was not established: ${unmet.join(', ')}`];
  const unlisted = expected.filter((id) => !spec.kills.includes(id) && !spec.allowed.includes(id) && !rows.get(id).pass);
  if (unlisted.length) return ['contaminated', `failures beside the witness that are not allowed: ${unlisted.join(', ')}`];
  const alive = spec.kills.filter((id) => rows.get(id).pass);
  if (alive.length) return ['survived', `still passing: ${alive.join(', ')}`];
  const other = spec.witness(rows);
  if (other) return ['contaminated', `the witness rows failed, but not as declared: ${other}`];
  return ['killed', spec.kills.map((id) => `${id} ${rows.get(id).detail}`).join(' | ')];
}

async function runControl(spec) {
  currentCase = `C-${spec.name}`;
  const edits = spec.edits.map((key) => ({ key, ...EDITS[key] }));
  const control = { name: spec.name, title: spec.title, run: spec.run,
    edits: edits.map(({ key, file, from, to }) => ({ key, file, from, to, fromSha256: sha256(from), toSha256: sha256(to) })),
    served: [], rows: [], pageErrors: [], setupError: null, error: null, verdict: null, reason: null };
  const rec = (id, name, pass, detail = '', observed) => {
    control.rows.push({ id, name, pass: !!pass, detail, ...(observed === undefined ? {} : { observed }) });
    console.log(`    [${spec.name}] ${pass ? 'ok  ' : 'fail'} ${name}`);
  };
  let context = null;
  try {
    const opened = await openPage(DESK, ['d2', 'd3'].includes(spec.run) ? '?entry=shelf' : D4_QUERY, { control, edits });
    context = opened.context;
    if (spec.run === 'd3') await d3Names(opened.page, rec);
    else if (spec.run === 'd4') await d4Walk(opened.page, rec);
    else if (spec.run === 'd5') await d5Detour(opened.page, rec);
    else if (spec.run === 'd6') await d6Visit(opened.page, rec);
    else for (const furigana of [1, 0]) await d2Door(opened.page, rec, furigana);
  } catch (error) {
    control.error = error.message;
  } finally {
    await context?.close().catch(() => {});
  }
  [control.verdict, control.reason] = adjudicate(spec, control);
  control.restore = { rows: [], delivered: [], error: null, pageErrors: [] };
  let restored = null;
  const errorsBefore = pageErrors.length;
  const files = edits.map((edit) => edit.file);
  try {
    restored = await openPage(DESK, ['d2', 'd3'].includes(spec.run) ? '?entry=shelf' : D4_QUERY, null,
      { restore: { files, delivered: control.restore.delivered } });
    const rec = (id, name, pass, detail, observed) => control.restore.rows.push({id, name, pass: !!pass, detail, observed});
    if (spec.run === 'd3') await d3Names(restored.page, rec);
    else if (spec.run === 'd4') await d4Walk(restored.page, rec);
    else if (spec.run === 'd5') await d5Detour(restored.page, rec);
    else for (const f of [1, 0]) await d2Door(restored.page, rec, f);
    deliveredAsBuilt({ files, rows: control.restore.delivered, manifest });
  } catch (error) { control.restore.error = String(error.stack || error); }
  finally { await restored?.context.close(); }
  control.restore.pageErrors = pageErrors.slice(errorsBefore);
  const restoredIds = control.restore.rows.map(row => row.id);
  control.restore.passed = !control.restore.error && !control.restore.pageErrors.length && restoredIds.length === RUN_ROWS[spec.run].length
    && new Set(restoredIds).size === restoredIds.length && RUN_ROWS[spec.run].every(id => control.restore.rows.some(row => row.id === id && row.pass));
  if (!control.restore.passed) { control.verdict = 'incomplete'; control.reason += '; restored candidate did not pass the exact schedule'; }
  check(`C ${spec.name} (${spec.title}) is killed by ${spec.kills.join(' + ')}`, control.verdict === 'killed',
    `${control.verdict}: ${control.reason}`, { id: `C.${spec.name}` });
  return control;
}

try {
  host = await startStaticHost({ site: SITE, port: 0 });
  origin = host.origin;
  browser = await ({chromium,webkit})[engine].launch();
  browserVersion=browser.version();
  console.log(`BROWSER ${engine} ${browserVersion}`);

  currentCase = 'D0';
  {
    const { context, page } = await openPage({ width: 1024, height: 800 }, '?entry=shelf');
    const identity = await (await page.request.get(`${origin}/build-identity.json`)).json();
    servedIdentity = identity;
    manifest = new Map(identity.files.map((row) => [row.path, row.sha256]));
    let head = null; try { head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* outside a checkout */ }
    const expected = process.env.KAIRO_EXPECT_GITSHA || head;
    const served = createHash('sha256').update(Buffer.from(await (await page.request.get(`${origin}/corridor.js`)).body())).digest('hex');
    check('D0 served build is the expected clean commit', identity.gitSha === expected && identity.sourceDirty === false
      && served === manifest.get('corridor.js'), `served=${identity.gitSha} expected=${expected}`);
    await context.close();
    if (results.some((r) => !r.pass)) throw new Error('identity failed');
  }

  currentCase = 'D1';
  for (const viewport of [{ width: 1728, height: 996 }, { width: 390, height: 844 }]) {
    const label = `${viewport.width}`;
    const { context, page } = await openPage(viewport, '?entry=shelf', null, { shelfDay: READER_D1_DAY });
    const count = await page.locator('#shelf-today .shelf-open').count();
    const day = await page.locator('#shelf-today').getAttribute('data-day').catch(() => null);
    check(`D1 ${label}: today's picks are on the shelf`, count === READER_D1_PICKS && day === READER_D1_DAY, `${count} doors on ${day}`,
      { observed: { day, count } });
    for (let i = 0; i < count; i++) {
      await page.goto(`${origin}/index.html?entry=shelf`); await ready(page);
      const door = page.locator('#shelf-today .shelf-open').nth(i);
      await door.scrollIntoViewIfNeeded();
      const probe = await door.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const x = box.left + box.width / 2, y = box.top + box.height / 2;
        const hit = document.elementFromPoint(x, y);
        const card = node.closest('[data-passage]');
        return { x, y, own: !!hit && hit.closest('.shelf-open') === node, hit: hit ? `${hit.tagName.toLowerCase()}.${[...hit.classList].join('.')}` : null,
          passage: card?.dataset.passage || null, strip: Math.round(document.querySelector('#shelf-today')?.getBoundingClientRect().width || 0) };
      });
      check(`D1 ${label} pick ${i + 1}: its centre is the door itself`, probe.own, JSON.stringify({ hit: probe.hit, strip: probe.strip }));
      await page.mouse.click(probe.x, probe.y);
      const opened = await page.waitForFunction((id) => document.body.dataset.view === 'reader'
        && document.querySelector('.listen-row')?.dataset.passage === id, probe.passage, { timeout: 5_000 }).then(() => true, () => false);
      check(`D1 ${label} pick ${i + 1}: a click at that point opens that same article`, opened && !!probe.passage, probe.passage || '');
    }
    await context.close();
  }

  currentCase = 'D2';
  {
    const { context, page } = await openPage(DESK, '?entry=shelf');
    const served = await servedToken(page, DOOR.file, DOOR.index), servedNeighbour = await servedToken(page, DOOR.file, DOOR.neighbour.index);
    check(`D2 fixture: ${PASSAGE_B} still serves token ${DOOR.index} as ${SURFACE} read ${READING} (c:false), token ${DOOR.neighbour.index} as ${DOOR.neighbour.s}`,
      canonical(served) === canonical(DOOR.token) && servedNeighbour?.s === DOOR.neighbour.s,
      JSON.stringify({ served, neighbour: servedNeighbour?.s ?? null }), { id: 'D2.fixture' });
    for (const furigana of [1, 0]) await d2Door(page, record, furigana);
    await context.close();
  }

  currentCase = 'D3';
  {
    const { context, page } = await openPage(DESK, '?entry=shelf');
    const served = await servedToken(page, DOOR.file, DOOR.index);
    check(`D3 fixture: ${PASSAGE_B} still serves token ${DOOR.index} as the name ${SURFACE} (c:false, read ${READING})`,
      canonical(served) === canonical(DOOR.token), JSON.stringify(served), { id: 'D3.fixture' });
    await d3Names(page, record);
    await context.close();
  }

  currentCase = 'D4';
  {
    const { context, page } = await openPage(DESK, D4_QUERY);
    const servedA = await servedToken(page, A_TOKEN.file, A_TOKEN.index), servedB = await servedToken(page, DOOR.file, DOOR.index);
    check(`D4 fixture: ${PASSAGE_A} still serves token ${A_TOKEN.index} as ${A_TOKEN.token.s} (content), ${PASSAGE_B} token ${DOOR.index} as ${SURFACE}`,
      canonical(servedA) === canonical(A_TOKEN.token) && canonical(servedB) === canonical(DOOR.token), JSON.stringify({ servedA, servedB }), { id: 'D4.fixture' });
    await d4Walk(page, record);
    await context.close();
  }

  currentCase = 'D5';
  {
    const { context, page } = await openPage(DESK, D4_QUERY);
    const home = await servedJson(page, DOOR.file), away = await servedJson(page, A_TOKEN.file), index = await servedJson(page, 'data/articles/index.json');
    const ids = (index?.articles || []).map((row) => row.id);
    const word = away?.tokens?.[D5.awaySentence.at], before = away?.tokens?.[D5.awaySentence.start - 1];
    check(`D5 fixture: ${D5.home} tokens ${DOOR.index}/${D5.known.index}/${D5.word.index} are ${SURFACE}/${D5.known.token.s}/${D5.word.token.s}; ${D5.away} token ${A_TOKEN.index} is ${A_TOKEN.token.s}, its ${D5.word.token.b} sentence starts at ${D5.awaySentence.start} with ${D5.word.token.b} at ${D5.awaySentence.at}; ${D5.away} (${D5.awaySource}) precedes ${D5.home} in the index`,
      canonical(home?.tokens?.[DOOR.index]) === canonical(DOOR.token) && canonical(home?.tokens?.[D5.known.index]) === canonical(D5.known.token)
        && canonical(home?.tokens?.[D5.word.index]) === canonical(D5.word.token) && canonical(away?.tokens?.[A_TOKEN.index]) === canonical(A_TOKEN.token)
        && word?.b === D5.word.token.b && word?.c === true && '。！？'.includes(before?.s || '-')
        && ids.includes(D5.away) && ids.indexOf(D5.away) < ids.indexOf(D5.home)
        && index.articles.find((row) => row.id === D5.away)?.sourceLabel === D5.awaySource,
      JSON.stringify({ word, before: before?.s ?? null, order: [ids.indexOf(D5.away), ids.indexOf(D5.home)] }), { id: 'D5.fixture' });
    await d5Detour(page, record);
    await context.close();
  }

  currentCase = 'D6';
  {
    const { context, page } = await openPage(DESK, D4_QUERY);
    const away = await servedJson(page, A_TOKEN.file), home = await servedJson(page, DOOR.file);
    const surfaces = (away?.tokens || []).map((token) => token.s), { encounter } = D6;
    // the importer and resolveTeacherSource compare the encounter with the passage as the app holds it (index row + body)
    const row = (await servedJson(page, 'data/articles/index.json'))?.articles?.find((entry) => entry.id === D6.away);
    const p = { ...row, ...away };
    check(`D6 fixture: ${D6.away} tokens ${encounter.start}–${encounter.end - 1} are the sentence "${encounter.quote}" with ${D6.word.token.b} at ${encounter.index}; its title, attribution and url are the encounter's; ${D6.home} token ${D6.word.index} is ${D6.word.token.s}`,
      surfaces.slice(encounter.start, encounter.end).join('') === encounter.quote && '。！？'.includes(surfaces[encounter.start - 1] || '-')
        && '。！？'.includes(surfaces[encounter.end - 1] || '-') && !surfaces.slice(encounter.start, encounter.end - 1).some((s) => '。！？'.includes(s))
        && away?.tokens?.[encounter.index]?.b === encounter.target.id && away?.tokens?.[encounter.index]?.c === true
        && (p.title || '') === encounter.title && (p.attribution || p.sourceLabel || '') === encounter.attribution && (p.url || null) === encounter.url
        && canonical(home?.tokens?.[D6.word.index]) === canonical(D6.word.token),
      JSON.stringify({ quote: surfaces.slice(encounter.start, encounter.end).join(''), title: p.title ?? null, attribution: p.attribution ?? null, url: p.url ?? null }),
      { id: 'D6.fixture' });
    await d6Visit(page, record);
    await context.close();
  }

  for (const spec of CONTROLS) controls.push(await runControl(spec));
} catch (error) {
  results.push({ name: `terminal (${currentCase})`, pass: false, detail: error.stack || String(error) });
  console.log(`  FAIL terminal in ${currentCase} — ${error.message}`);
} finally {
  await browser?.close().catch((error) => results.push({ name: 'browser · cleanup', pass: false, detail: error.message }));
  await host?.close().catch((error) => results.push({ name: 'host · cleanup', pass: false, detail: error.message }));
  if (pageErrors.length) results.push({ name: 'no uncaught page errors', pass: false, detail: JSON.stringify(pageErrors) });
  writeFileSync(resolve(EVIDENCE, 'reader-doors.json'), JSON.stringify(readerDoorsReceipt({ runId, servedIdentity, verifierGitSha, verifierSha256, engine, browserVersion, origin,
    d1Day: READER_D1_DAY, results, controls, pageErrors, expectedControls: CONTROLS.length, lastCase: currentCase }), null, 2) + '\n');
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · evidence ${EVIDENCE}`);
process.exit(failed.length ? 1 : 0);
