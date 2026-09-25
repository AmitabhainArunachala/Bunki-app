/**
 * Reader doors that answer: every door on the shelf and in an article does something.
 *
 *   D0 identity: the served build is the commit under test.
 *   D1 today's picks: at 1728×996 and 390×844, each #shelf-today door's own centre is the
 *      door (no sibling painted over it), and a real click there opens that article.
 *      Control: the 09-24 study overlay's 6-column grid (register.css before the C1
 *      spanning rule) put the strip in one ~106 px column; its centre hit the next
 *      heading and the tap did nothing ("The Man in the Next Room", Codex 04:07Z).
 *   D2 one committed reading door, bound to literals copied from the article (2026-09-25):
 *      aozora:046605 (やまなし) token 1, surface 谷川, reading たにがわ, c:false; its neighbour,
 *      token 2, is の. The served article must still hold exactly that token (D2.fixture). At
 *      kanji 0, spacing 0 and furigana 1 then 0 (a fresh document each): tap, Enter and Space
 *      show, hide and show exactly たにがわ, in the visible ruby and in the whole accessible label
 *      ("谷川 · activate to show or hide the reading", with たにがわ as its only middle segment while
 *      shown: no other reading, gloss or word); no painted English; focus kept; the neighbour and
 *      the passage unchanged. Control r1 (below).
 *   D3 readings always on (0,2,0) or already kana (2,1,0): names are plain text without a
 *      pointer cursor. Control: 10125f16 renders a button at 2,1,0 that reveals nothing.
 *   D4 reveal/gloss marks stay with their passage (the Codex D11-NAME-DOOR-REVIEW schedule),
 *      walked in ONE document: shelf → aozora:000628 (ごん狐), whose token 1 これ (content) two
 *      taps leave revealed and glossed → 戻る (#back) → shelf → aozora:046605. A marker set on the
 *      document before A must still be there in B. In both articles the dial controls themselves
 *      (文字設定, opened once in A and left open) must read kanji 0, furigana 1, spacing 0 by
 *      aria-pressed, and the text must agree (no spacing class; readings hidden until touched).
 *      B token 1 must be the reading door 谷川 (its own row: a plain token fails it, never skips
 *      it) and open with no reading, mark or English, its label exactly the hidden one. It is then
 *      tapped twice whatever those rows found: たにがわ shown, then hidden, each with its exact
 *      label, and never English. Controls m1 and m2 (below). Claim boundary: this shelf walk only;
 *      the example-sentence detour is D5.
 *   D5 the detour return (D22), in ONE document, dials 0,1,0: home aozora:046605 (やまなし) takes
 *      its own marks (token 3 底, revealed そこ and glossed by two taps; token 1 谷川 stays the
 *      hidden reading door). わかる's word sheet opens from its token 293 through the focus
 *      actions (全項目, no press on the ladder). Its first example is ごん狐's only わかる
 *      sentence: ごん狐 precedes やまなし in the index, no other shelf article has わかる, and
 *      ごん狐's body is loaded first by opening it (the sheet lists loaded articles only). ▹, then
 *      この記事を読む, opens aozora:000628 (ごん狐), where token 1 これ, an index home has not
 *      revealed, takes two taps. Then 戻る (#back), and again only while a sheet the detour left
 *      from is still open. The marks separate a restore from both failures. Home's index 3 is
 *      home-only (ごん狐 never touches it) and must come back exactly, at the return and with the
 *      sheets closed: a clear-all return fails there. ごん狐's index 1 collides with an index home
 *      left unmarked and must stay absent (谷川 not lit, no reading, exact hidden label): the leak
 *      fails there. A tap on 谷川 then shows exactly たにがわ, and it never shows English. Controls m3,
 *      m4, m5 (below).
 *      Scope: the この記事を読む → 戻る route only. No read-aloud claim: D5 never starts 聞く, so
 *      the stopReadAloud() the D22 fix adds on this return is unobserved. Not covered: the learning
 *      source route (元の文を読む → reader-source-back, D22b, fixed and tested separately), the
 *      same-passage detour (its marks stay as they are, by design), and nested detours.
 *   D6 the learning-source return (D22b), dials 0,1,0. First the record gets one saved word, わかる,
 *      whose encounter is ごん狐's sentence 2347–2356 (わかる at 2351). It enters through the real
 *      importer (record-fixture-support's restoreAppFixture). The encounter is built by the served
 *      candidate's own teacher-context.mjs, so its content-derived id is the one this candidate
 *      verifies. Then, in ONE document: home やまなし takes the same marks as in D5 (token 3 底,
 *      home-only). わかる's sheet, opened from token 293 through its focus actions, shows the saved
 *      encounter. 元の文を読む visits ごん狐 at token 2351, where token 1 これ (colliding with home's
 *      unmarked 谷川) takes two taps. reader-source-back returns home under the sheet the visit
 *      left from, and ends the visit; 戻る closes that sheet. The same oracle as D5 applies: home's
 *      marks exact under the sheet and with it closed (a clear-all fails), 谷川 not lit and its
 *      label exact (the leak fails), a tap on 谷川 shows exactly たにがわ, and no reading door in
 *      home shows English. Controls m6, m7 (below). Scope: this route only. No read-aloud claim:
 *      the D22b stopReadAloud() is unobserved. Not covered: the review and sentence-practice
 *      callers of 元の文を読む, source-reader (capture) and publisher visits, nested visits.
 *
 * Token taps and D1's doors go to coordinates (page.mouse), not locator.click: Playwright
 * retries a locator click when another element would receive it, which hides exactly the D1
 * defect. Navigation (a shelf door into a fixture article, 戻る) uses locator.click; the passage
 * it opens is asserted by id right after.
 *
 * Mutation controls run after the cases, against the SAME served candidate, each in its own
 * context with service workers blocked. The pattern is verify-corridor-doors T3's route
 * interception: the file is fetched from the host, its bytes must equal the digest in
 * build-identity.json, each literal edit must match exactly once, and the edited bytes are
 * served in its place. Each control declares the rows that establish its schedule (requires), the
 * witness rows it must fail (kills) and the only other rows allowed to fail with it (allowed).
 * Its run must record exactly the schedule's rows (RUN_ROWS), once each, with every other row
 * passing, against a candidate that passes those same rows once each and whose fixture row for
 * that schedule (RUN_FIXTURE: D2/D4/D5/D6.fixture, the candidate's alone) passed exactly once.
 * Otherwise the control is `incomplete` (setup or identity failure, a failed candidate fixture, page
 * error, edit never served, schedule not established, rows never reached, an unclean candidate or
 * baseline) or `contaminated`
 * (duplicate or extra rows, an unallowed failure, witnesses failing other than as declared),
 * never a kill. Each control adds one `C` row (pass = killed). Its own rows are evidence about
 * the mutant, kept in the receipt's `controls`, and do not enter the verdict.
 *   m1  openPassage's per-passage reset removed. B token 1 opens showing たにがわ, lit by A's
 *       mark → D4.no-inherited-state fails. Allowed: the two toggle rows, which reverse (each tap
 *       starts from the inherited reveal). D4.never-english must pass: the reading-only paint
 *       holds even with A's gloss mark under B token 1.
 *   m2  the reading-only paint removed: wireNamedToken calls the shared paintTok again (10125f16's
 *       painter, today's label). Evaluated ON m1. While the reset stands, no shelf walk can put
 *       A's gloss mark under B token 1, so m2 alone is equivalent on this schedule. m1 supplies
 *       that prior state by real navigation. m1 must itself be an admitted kill, which includes
 *       its passing D4.never-english, so the one difference is the paint → D4.never-english fails
 *       (English on 谷川). Allowed: m1's inherited rows (no-inherited-state, both toggles). m2 is
 *       not killed alone on D5 either. The restore puts back home's own marks, and those can never
 *       hold a gloss mark at a reading door's index: its door only toggles the reveal.
 *   m3  returnFromNavigation's restore block removed: the return before D22 (e21160fe's corridor.js;
 *       the frame's saved copies are left in place, and nothing else reads them). Home comes back
 *       showing exactly ごん狐's marks → D5.home-marks-restored and D5.away-index-not-lit fail.
 *       Allowed: D5.named-toggle (the tap starts from the inherited reveal and hides it).
 *       D5.named-no-english must pass: the reading-only paint holds on the inherited gloss mark.
 *       The block's stopReadAloud() goes with it, unobserved (no audio claim).
 *   m4  the reading-only paint removed, evaluated ON m3 (the only route to the prior state here, as
 *       m1 is for D4). m3 must be an admitted kill → D5.named-no-english fails, a gloss line on 谷川.
 *       Allowed: m3's inherited rows.
 *   m5  the restore's two assignments replaced by clearing every mark: nothing leaks, but home's
 *       own mark is lost → D5.home-marks-restored fails, having come back with no marks at all.
 *       Allowed: nothing else (谷川 stays unlit, and its tap and English rows must pass).
 *   m6  restoreLearningSourceCaller's D22b block removed: the source return of 1561ff95. Home comes
 *       back showing exactly ごん狐's marks → D6.home-marks-restored and D6.away-index-not-lit fail.
 *       Allowed: D6.named-toggle. D6.named-no-english must pass.
 *   m7  D22b's two assignments replaced by clearing every mark → only D6.home-marks-restored fails,
 *       having come back with no marks at all. Allowed: nothing else.
 *       D6's English row has no control of its own here: the painter's English defect is controlled
 *       on D4 (m2) and D5 (m4).
 *   r1  aozora:046605 token 1 served read たにかわ (r and ruby): a consistent wrong reading, the
 *       kind the old oracle (any ruby, toggled consistently) accepted → D2.f1/f0
 *       visible-reading and accessible-reading all fail, having shown たにかわ as ruby and as the
 *       whole label. Allowed: nothing else.
 *
 * Scope: desktop Chromium only (chromium.launch; no WebKit), the bilingual UI (ui=bi, pinned for
 * D2, D4, D5 and D6; the product default), mouse clicks at coordinates and keyboard Enter/Space. Not
 * the 日本語のみ UI (ui=ja), whose door label is Japanese. D1's 390×844 is a narrow window driven by the mouse,
 * not touch: real mobile touch input on a reading door (and WebKit) stays pending. Dials: D2
 * 0,1,0 and 0,0,0; D3 0,2,0 and 2,1,0; D4, D5 and D6 0,1,0. Not covered: kanji 1 with an
 * all-converted token, spacing 1 and 2, reading doors other than the fixture token.
 *
 * Receipt: reader-doors.json is written from `finally`, with every row, each control's record
 * (literal edits, served digests, rows, page errors, verdict) and the candidate's page errors,
 * which are aggregated last. SITE and EVIDENCE are resolved at module top level, before the
 * terminal try. A resolver or evidence-directory failure therefore ends the process with at most
 * the resolver's own selection.json (status failed) and no reader-doors.json: classify that as
 * setup/incomplete, never as a behavioural verdict.
 *
 * Usage: node verify-reader-doors.mjs   (KAIRO_SITE_DIR may pin a staged artifact)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { restoreAppFixture } from './record-fixture-support.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');

const SITE = resolveCorridorSite();
const EVIDENCE = resolveCorridorEvidence();
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
// The door's whole accessible label, as namedAccessibleLabel builds it in the bilingual UI (ui=bi, pinned in the D2/D4
// URLs; it is also the default): the surface, the reading only while shown, the instruction. Nothing else may appear.
const DOOR_HINT = 'activate to show or hide the reading';
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

// The controls' literal edits. Each `from` was counted exactly once in 9ceb139e's corridor.js and
// aozora-046605.json; the served bytes are edited, never the checkout.
const EDITS = Object.freeze({
  reset: Object.freeze({ file: 'corridor.js', from: '    S.revealed = new Set();\n    S.glossed = new Set();\n', to: '' }),
  paint: Object.freeze({ file: 'corridor.js', from: '    paintNamedTok(span, token, index);\n',
    to: "    paintTok(span, token, index);\n    span.setAttribute('aria-label', namedAccessibleLabel(token, index));\n" }),
  reading: Object.freeze({ file: DOOR.file, from: JSON.stringify(DOOR.token),
    to: JSON.stringify({ ...DOOR.token, r: WRONG_READING, f: [{ t: SURFACE, r: WRONG_READING }] }) }),
  // counted exactly once in 1561ff95's corridor.js (0bf1afdb); absent from e21160fe's, the return before D22
  restore: Object.freeze({ file: 'corridor.js', from: '  if (home.passageId !== S.passageId) {\n    stopReadAloud();\n'
    + '    S.revealed = home.revealed ? new Set(home.revealed) : null;\n    S.glossed = home.glossed ? new Set(home.glossed) : null;\n  }\n', to: '' }),
  // the same block's two assignments, counted exactly once there: a return that clears every mark instead of restoring
  clearall: Object.freeze({ file: 'corridor.js',
    from: '    S.revealed = home.revealed ? new Set(home.revealed) : null;\n    S.glossed = home.glossed ? new Set(home.glossed) : null;\n',
    to: '    S.revealed = new Set(); S.glossed = new Set();\n' }),
  // D22b's block in restoreLearningSourceCaller, counted exactly once in 5d9d4cdd's corridor.js (7fdaa61c) and absent from
  // 1561ff95's; then its two assignments, for a return that clears instead of restoring
  visitRestore: Object.freeze({ file: 'corridor.js', from: '  if (visit.sourceState.passageId !== S.passageId) {\n    stopReadAloud();\n'
    + '    S.revealed = visit.revealed ? new Set(visit.revealed) : null;\n    S.glossed = visit.glossed ? new Set(visit.glossed) : null;\n  }\n', to: '' }),
  visitClearall: Object.freeze({ file: 'corridor.js',
    from: '    S.revealed = visit.revealed ? new Set(visit.revealed) : null;\n    S.glossed = visit.glossed ? new Set(visit.glossed) : null;\n',
    to: '    S.revealed = new Set(); S.glossed = new Set();\n' }),
});
// Every row one D4 walk or one D2 pair records, by id. A control's run must produce exactly these, once each, and the
// candidate must pass all of them, once each, before any mutant can be said to differ from it.
const RUN_ROWS = Object.freeze({
  d4: Object.freeze(['D4.A-prior-state', 'D4.same-document', 'D4.same-dials', 'D4.B-door', 'D4.no-inherited-state',
    'D4.toggle-shows', 'D4.toggle-hides', 'D4.never-english']),
  d2: Object.freeze([1, 0].flatMap((f) => ['door', 'visible-reading', 'accessible-reading', 'no-english', 'focus-kept',
    'neighbour-unchanged', 'no-navigation', 'label-names-reading'].map((row) => `D2.f${f}.${row}`))),
  d5: Object.freeze(['D5.home-marks', 'D5.detour', 'D5.away-marks', 'D5.returned', 'D5.home-marks-restored',
    'D5.away-index-not-lit', 'D5.named-toggle', 'D5.named-no-english']),
  d6: Object.freeze(['D6.home-marks', 'D6.source-visit', 'D6.away-marks', 'D6.returned', 'D6.home-marks-restored',
    'D6.away-index-not-lit', 'D6.named-toggle', 'D6.named-no-english']),
});
// The candidate-only fixture row each schedule's controls stand on: it must have passed exactly once before any kill counts.
const RUN_FIXTURE = Object.freeze({ d2: 'D2.fixture', d4: 'D4.fixture', d5: 'D5.fixture', d6: 'D6.fixture' });
// requires: rows that establish the schedule. kills: witness rows that must fail, as `witness` describes.
// allowed: the only other rows that may fail. Every remaining row of the run must pass.
const CONTROLS = Object.freeze([
  Object.freeze({ name: 'm1', title: "openPassage's per-passage reset removed", edits: ['reset'], run: 'd4',
    requires: ['D4.A-prior-state', 'D4.same-document', 'D4.same-dials', 'D4.B-door'],
    kills: ['D4.no-inherited-state'],
    // B token 1 opens revealed, so each tap does the opposite of the candidate's; D4.never-english must still pass
    allowed: ['D4.toggle-shows', 'D4.toggle-hides'],
    witness: (rows) => (rows.get('D4.no-inherited-state')?.observed?.visibleRuby === READING ? '' : `B token 1 did not open showing ${READING}`) }),
  Object.freeze({ name: 'm2', title: 'the reading-only paint removed, on m1 for the prior state', edits: ['reset', 'paint'], run: 'd4',
    // m1 itself must be an admitted kill: that includes its own passing D4.never-english, the baseline this one differs from
    baseline: 'm1',
    requires: ['D4.A-prior-state', 'D4.same-document', 'D4.same-dials', 'D4.B-door'],
    kills: ['D4.never-english'],
    // inherited from m1: B token 1 opens revealed and the taps reverse
    allowed: ['D4.no-inherited-state', 'D4.toggle-shows', 'D4.toggle-hides'],
    witness: (rows) => ((rows.get('D4.never-english')?.observed?.glosses || []).some((gloss) => typeof gloss === 'string' && gloss.trim())
      ? '' : 'no English text appeared') }),
  Object.freeze({ name: 'r1', title: `${PASSAGE_B} token ${DOOR.index} served read ${WRONG_READING}`, edits: ['reading'], run: 'd2',
    requires: ['D2.f1.door', 'D2.f0.door', 'D2.f1.no-navigation', 'D2.f0.no-navigation'],
    kills: ['D2.f1.visible-reading', 'D2.f1.accessible-reading', 'D2.f0.visible-reading', 'D2.f0.accessible-reading'],
    // nothing else may fail: focus, neighbour, painted English and the label's wording stay the candidate's
    allowed: [],
    witness: (rows) => ([1, 0].every((f) => rows.get(`D2.f${f}.visible-reading`)?.observed?.[1] === WRONG_READING
      && rows.get(`D2.f${f}.accessible-reading`)?.observed?.[1] === doorLabel(WRONG_READING))
      ? '' : `the door did not show ${WRONG_READING}, as ruby and as its whole label`) }),
  Object.freeze({ name: 'm3', title: 'the D22 restore removed from returnFromNavigation (the return before 1561ff95)', edits: ['restore'], run: 'd5',
    requires: ['D5.home-marks', 'D5.detour', 'D5.away-marks', 'D5.returned'],
    kills: ['D5.home-marks-restored', 'D5.away-index-not-lit'],
    // 谷川 comes back revealed by ごん狐's mark, so its tap hides the reading; D5.named-no-english must still pass
    allowed: ['D5.named-toggle'],
    witness: (rows) => (canonical(rows.get('D5.home-marks-restored')?.observed?.atReturn) === canonical({ lit: [A_TOKEN.index], glossed: [] })
      ? '' : `home did not come back showing exactly ${D5.away}'s mark at index ${A_TOKEN.index}`) }),
  Object.freeze({ name: 'm4', title: 'the reading-only paint removed, on m3 for the prior state', edits: ['restore', 'paint'], run: 'd5',
    baseline: 'm3',
    requires: ['D5.home-marks', 'D5.detour', 'D5.away-marks', 'D5.returned'],
    kills: ['D5.named-no-english'],
    // inherited from m3: home shows ごん狐's marks and the tap on 谷川 starts from the inherited reveal
    allowed: ['D5.home-marks-restored', 'D5.away-index-not-lit', 'D5.named-toggle'],
    witness: (rows) => ((rows.get('D5.named-no-english')?.observed?.glosses || []).some((gloss) => typeof gloss === 'string' && gloss.trim())
      ? '' : 'no gloss line appeared on 谷川') }),
  Object.freeze({ name: 'm5', title: 'the D22 restore replaced by clearing every mark on the return', edits: ['clearall'], run: 'd5',
    requires: ['D5.home-marks', 'D5.detour', 'D5.away-marks', 'D5.returned'],
    kills: ['D5.home-marks-restored'],
    // clearing leaks nothing: 谷川 stays unlit, and its tap and English rows must all still pass
    allowed: [],
    witness: (rows) => (canonical(rows.get('D5.home-marks-restored')?.observed?.atReturn) === canonical({ lit: [], glossed: [] })
      ? '' : 'home did not come back with no marks at all') }),
  Object.freeze({ name: 'm6', title: 'the D22b restore removed from restoreLearningSourceCaller (the source return of 1561ff95)', edits: ['visitRestore'], run: 'd6',
    requires: ['D6.home-marks', 'D6.source-visit', 'D6.away-marks', 'D6.returned'],
    kills: ['D6.home-marks-restored', 'D6.away-index-not-lit'],
    // 谷川 comes back revealed by ごん狐's mark, so its tap hides the reading; D6.named-no-english must still pass
    allowed: ['D6.named-toggle'],
    witness: (rows) => (canonical(rows.get('D6.home-marks-restored')?.observed?.atReturn) === canonical({ lit: [A_TOKEN.index], glossed: [] })
      ? '' : `home did not come back showing exactly ${D6.away}'s mark at index ${A_TOKEN.index}`) }),
  Object.freeze({ name: 'm7', title: 'the D22b restore replaced by clearing every mark on the source return', edits: ['visitClearall'], run: 'd6',
    requires: ['D6.home-marks', 'D6.source-visit', 'D6.away-marks', 'D6.returned'],
    kills: ['D6.home-marks-restored'],
    // clearing leaks nothing: only the restore row may die
    allowed: [],
    witness: (rows) => (canonical(rows.get('D6.home-marks-restored')?.observed?.atReturn) === canonical({ lit: [], glossed: [] })
      ? '' : 'home did not come back with no marks at all') }),
]);

async function openPage(viewport, query, mutation = null) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width > 1000 ? 2 : 3,
    ...(mutation ? { serviceWorkers: 'block' } : {}) });
  const sink = mutation ? mutation.control.pageErrors : pageErrors;
  context.on('page', (page) => page.on('pageerror', (error) => {
    if (sink.length < 20) sink.push({ case: currentCase, message: error.message });
  }));
  try {
    if (mutation) await serveMutation(context, mutation);
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
  return { tag: node.tagName.toLowerCase(), cls: node.className, surface: bare.textContent,
    ruby: rts.map((rt) => rt.textContent).join(''),
    visibleRuby: rts.filter((rt) => !rt.classList.contains('hidden-rt')).map((rt) => rt.textContent).join(''),
    gloss: en ? en.textContent : null, lit: node.classList.contains('lit'), hasEn: node.classList.contains('has-en'),
    focused: document.activeElement === node, label: node.getAttribute('aria-label') || '', cursor: getComputedStyle(node).cursor };
}, String(index));
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

/** D2 at one furigana setting: the fixture door, tap/Enter/Space, against the literal reading. */
async function d2Door(page, rec, furigana) {
  const key = `D2.f${furigana}`, label = `D2 f=${furigana}`;
  await openArticle(page, `dials=0,${furigana},0&ui=bi`, PASSAGE_B);
  const before = await tokenState(page, DOOR.index), neighbourBefore = await tokenState(page, DOOR.neighbour.index);
  rec(`${key}.door`, `${label}: token ${DOOR.index} of ${PASSAGE_B} is the reading door ${SURFACE}, its reading hidden, beside ${DOOR.neighbour.s}`,
    before?.tag === 'button' && classes(before).includes('named') && before.surface === SURFACE && before.visibleRuby === ''
      && neighbourBefore?.surface === DOOR.neighbour.s, JSON.stringify({ before, neighbour: neighbourBefore?.surface ?? null }));
  const views = [before], acts = [];
  for (const how of ['tap', 'Enter', 'Space']) {
    if (how === 'tap') acts.push({ how, ...(await tapCentre(page, DOOR.index)) });
    else {
      const node = page.locator(`#reader .tok[data-index="${DOOR.index}"]`);
      const present = (await node.count()) === 1;
      if (present) { await node.focus(); await page.keyboard.press(how); }
      acts.push({ how, done: present });
    }
    views.push(await tokenState(page, DOOR.index));
  }
  const done = acts.every((act) => act.done);
  const visible = views.map((view) => view?.visibleRuby ?? null);
  rec(`${key}.visible-reading`, `${label}: tap shows exactly ${READING}, Enter hides it, Space shows ${READING} again (visible ruby)`,
    done && canonical(visible) === canonical(['', READING, '', READING]), JSON.stringify({ visible, acts }), visible);
  const labels = views.map((view) => view?.label ?? null);
  // the whole label, not a segment of it: no second reading, gloss or other word may ride along
  rec(`${key}.accessible-reading`, `${label}: the accessible label is exactly "${doorLabel()}", and "${doorLabel(READING)}" while shown`,
    done && canonical(labels) === canonical([doorLabel(), doorLabel(READING), doorLabel(), doorLabel(READING)]), JSON.stringify(labels), labels);
  rec(`${key}.no-english`, `${label}: no English gloss is painted on the door (.tok-en, has-en)`, done && views.every((view) => view && view.gloss === null && !view.hasEn),
    JSON.stringify(views.map((view) => view?.gloss ?? null)));
  rec(`${key}.focus-kept`, `${label}: focus stays on the same button after keyboard activation`, !!views[2]?.focused && !!views[3]?.focused);
  rec(`${key}.neighbour-unchanged`, `${label}: the neighbour token is unchanged`,
    !!neighbourBefore && JSON.stringify(await tokenState(page, DOOR.neighbour.index)) === JSON.stringify({ ...neighbourBefore, focused: false }));
  rec(`${key}.no-navigation`, `${label}: no navigation, still ${PASSAGE_B}`, await page.evaluate((pid) => document.body.dataset.view === 'reader'
    && document.querySelector('.listen-row')?.dataset.passage === pid, PASSAGE_B));
  rec(`${key}.label-names-reading`, `${label}: the label names a reading, not a word class`,
    /reading|読み/u.test(labels[1] || '') && !/\bname\b|名前/u.test(labels[1] || ''), labels[1] || '');
}

/** D4 in one document: A token 1 revealed and glossed, 戻る, B from the shelf, B token 1 checked and toggled. */
async function d4Walk(page, rec) {
  const marker = await page.evaluate(() => (window.__readerDoorsDocument = `${Date.now()}-${Math.random().toString(36).slice(2)}`));
  await openFromShelf(page, PASSAGE_A);
  const dialsA = await readDials(page), shownA = await dialSignature(page);
  const aBefore = await tokenState(page, A_TOKEN.index);
  const aTaps = [];
  for (let i = 0; i < 2; i++) aTaps.push(await tapCentre(page, A_TOKEN.index));
  await page.waitForFunction((i) => !!document.querySelector(`#reader .tok[data-index="${i}"] .tok-en`), String(A_TOKEN.index), { timeout: 3_000 })
    .catch(() => {});
  const aAfter = await tokenState(page, A_TOKEN.index);
  rec('D4.A-prior-state', `D4 ${PASSAGE_A} token ${A_TOKEN.index} ${A_TOKEN.token.s} starts plain, and two taps leave it revealed and glossed`,
    aBefore?.tag === 'button' && classes(aBefore).includes('content') && aBefore.surface === A_TOKEN.token.s && !aBefore.lit && aBefore.gloss === null
      && aTaps.every((tap) => tap.done) && !!aAfter?.lit && typeof aAfter.gloss === 'string' && aAfter.gloss.trim() !== '' && aAfter.hasEn,
    JSON.stringify({ aBefore, aAfter, aTaps }));
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
    b0?.tag === 'button' && classes(b0).includes('named') && b0.surface === SURFACE && b0.ruby === READING, JSON.stringify(b0));
  rec('D4.no-inherited-state', `D4 it opens with no reveal, mark or English from ${PASSAGE_A} token ${A_TOKEN.index}, labelled exactly "${doorLabel()}"`,
    !!b0 && b0.visibleRuby === '' && !b0.lit && b0.gloss === null && !b0.hasEn && b0.label === doorLabel(), JSON.stringify(b0),
    { visibleRuby: b0?.visibleRuby ?? null, lit: b0?.lit ?? null, gloss: b0?.gloss ?? null });
  // exercised whatever the rows above found: a missing or plain token fails the rows below, it never skips them
  const taps = [], views = [];
  for (let i = 0; i < 2; i++) {
    taps.push(await tapCentre(page, DOOR.index));
    views.push(await tokenState(page, DOOR.index));
  }
  const done = taps.every((tap) => tap.done);
  rec('D4.toggle-shows', `D4 the first tap shows exactly ${READING}, labelled exactly "${doorLabel(READING)}"`,
    done && views[0]?.visibleRuby === READING && views[0].label === doorLabel(READING), JSON.stringify({ view: views[0], tap: taps[0] }));
  rec('D4.toggle-hides', `D4 the second tap hides it again, back to "${doorLabel()}"`,
    done && views[1]?.visibleRuby === '' && views[1].label === doorLabel(), JSON.stringify({ view: views[1], tap: taps[1] }));
  const glosses = views.map((view) => view?.gloss ?? null);
  rec('D4.never-english', `D4 toggling it never adds English, though ${PASSAGE_A} token ${A_TOKEN.index} was glossed`,
    done && views.every((view) => view && view.gloss === null && !view.hasEn), JSON.stringify(glosses), { glosses });
}

/** D5 in one document: home's own marks, the この記事を読む detour into the away article with a mark at index 1 there,
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
  const knownTaps = [];
  for (let i = 0; i < 2; i++) knownTaps.push(await tapCentre(page, D5.known.index));
  await page.waitForFunction((i) => !!document.querySelector(`#reader .tok[data-index="${i}"] .tok-en`), String(D5.known.index), { timeout: 3_000 })
    .catch(() => {});
  const homeBefore = await readerMarks(page);
  const known = await tokenState(page, D5.known.index), named = await tokenState(page, DOOR.index);
  rec('D5.home-marks', `D5 ${D5.home} opens unmarked; two taps leave token ${D5.known.index} ${D5.known.token.s} revealed (${D5.known.token.r}) and glossed, its only marks; token ${DOOR.index} ${SURFACE} is the hidden reading door`,
    canonical(markSets(clean)) === canonical({ lit: [], glossed: [] }) && knownTaps.every((tap) => tap.done)
      && canonical(markSets(homeBefore)) === canonical({ lit: [D5.known.index], glossed: [D5.known.index] })
      && known?.visibleRuby === D5.known.token.r && typeof known.gloss === 'string' && known.gloss.trim() !== ''
      && named?.tag === 'button' && classes(named).includes('named') && named.visibleRuby === '' && named.label === doorLabel(),
    JSON.stringify({ clean: markSets(clean), homeBefore: markSets(homeBefore), known, named, knownTaps }));

  const detour = { word: (await tokenState(page, D5.word.index))?.surface ?? null, examples: null, anchor: null };
  let step = `focus token ${D5.word.index}`;
  try {
    // the sheet opens through the token's own actions: focus without a press shows 全項目, and nothing climbs the tap ladder
    await page.locator(`#reader .tok[data-index="${D5.word.index}"]`).focus();
    step = '全項目';
    const entry = page.locator('#reader .token-door').filter({ has: page.locator(`.tok[data-index="${D5.word.index}"]`) })
      .locator('[data-action="entry.open"]');
    await entry.waitFor({ state: 'visible', timeout: 5_000 });
    await entry.click();
    step = `the ${D5.word.token.b} sheet`;
    await page.locator(`#sheet[data-node="word:${D5.word.token.b}"]`).waitFor({ timeout: 10_000 });
    detour.examples = await page.evaluate(() => [...document.querySelectorAll('#sheet .example')].map((line) => line.querySelector('.example-src')?.textContent ?? ''));
    const at = detour.examples.indexOf(D5.awaySource);
    if (at < 0) throw new Error(`no example from ${D5.awaySource}: ${JSON.stringify(detour.examples)}`);
    step = '▹';
    await page.locator('#sheet .example').nth(at).locator('.sent-door').click();
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
  rec('D5.detour', `D5 ${D5.word.token.b}'s sheet opens from token ${D5.word.index}; its first example is ${D5.away}'s only one, whose ▹ and この記事を読む open ${D5.away} at token ${D5.awaySentence.at}, in the same document`,
    detour.word === D5.word.token.s && detour.examples?.[0] === D5.awaySource && detour.examples.filter((source) => source === D5.awaySource).length === 1
      && detour.anchor === D5.awaySentence.at && await sameDocument(), JSON.stringify(detour));

  const awayClean = await readerMarks(page);
  const awayTaps = [];
  for (let i = 0; i < 2; i++) awayTaps.push(await tapCentre(page, A_TOKEN.index));
  await page.waitForFunction((i) => !!document.querySelector(`#reader .tok[data-index="${i}"] .tok-en`), String(A_TOKEN.index), { timeout: 3_000 })
    .catch(() => {});
  const awayMarked = await readerMarks(page);
  rec('D5.away-marks', `D5 ${D5.away} opens unmarked, and two taps leave its token ${A_TOKEN.index} ${A_TOKEN.token.s} (an index ${D5.home} has not revealed) revealed and glossed, its only marks`,
    awayClean.passage === D5.away && canonical(markSets(awayClean)) === canonical({ lit: [], glossed: [] }) && awayTaps.every((tap) => tap.done)
      && canonical(markSets(awayMarked)) === canonical({ lit: [A_TOKEN.index], glossed: [A_TOKEN.index] }) && !homeBefore.lit.includes(A_TOKEN.index),
    JSON.stringify({ awayClean: markSets(awayClean), awayMarked: markSets(awayMarked), awayTaps }));

  // 戻る: the frame returns home under the sheets the detour left from; then the sheet's own 戻る (#sheet-back), only while one
  // of them is still open — under a dialog the chrome's #back is inert behind the scrim (the layer law)
  await page.locator('#back').click();
  await page.waitForFunction((pid) => document.querySelector('.listen-row')?.dataset.passage === pid && document.querySelector('#reader .tok'),
    D5.home, { timeout: 10_000 });
  const atReturn = await readerMarks(page), namedAtReturn = await tokenState(page, DOOR.index);
  let presses = 0;
  while (presses < 3 && (await page.locator('#sheet').count())) { await page.locator('#sheet #sheet-back').click(); presses += 1; }
  const uncovered = await readerMarks(page), namedUncovered = await tokenState(page, DOOR.index);
  rec('D5.returned', `D5 戻る returns to ${D5.home} in the same document, and closing the sheets it left from keeps ${D5.home}`,
    atReturn.passage === D5.home && uncovered.passage === D5.home && uncovered.sheet === null && await sameDocument(),
    JSON.stringify({ atReturn: { passage: atReturn.passage, sheet: atReturn.sheet }, uncovered: { passage: uncovered.passage, sheet: uncovered.sheet }, presses }));
  rec('D5.home-marks-restored', `D5 ${D5.home}'s own marks come back exactly (token ${D5.known.index} revealed and glossed, nothing else), under the sheets and with them closed`,
    canonical(markSets(atReturn)) === canonical(markSets(homeBefore)) && canonical(markSets(uncovered)) === canonical(markSets(homeBefore)),
    JSON.stringify({ before: markSets(homeBefore), atReturn: markSets(atReturn), uncovered: markSets(uncovered) }),
    { before: markSets(homeBefore), atReturn: markSets(atReturn), uncovered: markSets(uncovered) });
  rec('D5.away-index-not-lit', `D5 ${D5.away}'s mark at index ${A_TOKEN.index} does not land on ${D5.home}'s ${SURFACE}: not lit, reading hidden, label exactly "${doorLabel()}"`,
    [namedAtReturn, namedUncovered].every((view) => view && classes(view).includes('named') && !view.lit && view.visibleRuby === '' && view.label === doorLabel()),
    JSON.stringify({ namedAtReturn, namedUncovered }));
  // the closed sheet hands focus back to token 293 in an animation frame (showing its actions): let that land, then move
  // focus to the door itself, so the tap below meets the door and no pill
  await frames();
  await page.locator(`#reader .tok[data-index="${DOOR.index}"]`).focus().catch(() => {});
  const toggle = await tapCentre(page, DOOR.index);
  const namedAfter = await tokenState(page, DOOR.index);
  rec('D5.named-toggle', `D5 a tap on ${D5.home}'s ${SURFACE} then shows exactly ${READING}, labelled exactly "${doorLabel(READING)}"`,
    toggle.done && namedAfter?.visibleRuby === READING && namedAfter.label === doorLabel(READING), JSON.stringify({ namedAfter, toggle }));
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
  const knownTaps = [];
  for (let i = 0; i < 2; i++) knownTaps.push(await tapCentre(page, D5.known.index));
  await page.waitForFunction((i) => !!document.querySelector(`#reader .tok[data-index="${i}"] .tok-en`), String(D5.known.index), { timeout: 3_000 })
    .catch(() => {});
  const homeBefore = await readerMarks(page);
  const known = await tokenState(page, D5.known.index), named = await tokenState(page, DOOR.index);
  rec('D6.home-marks', `D6 ${D6.home} opens unmarked; two taps leave token ${D5.known.index} ${D5.known.token.s} revealed (${D5.known.token.r}) and glossed, its only marks; token ${DOOR.index} ${SURFACE} is the hidden reading door`,
    canonical(markSets(clean)) === canonical({ lit: [], glossed: [] }) && knownTaps.every((tap) => tap.done)
      && canonical(markSets(homeBefore)) === canonical({ lit: [D5.known.index], glossed: [D5.known.index] })
      && known?.visibleRuby === D5.known.token.r && typeof known.gloss === 'string' && known.gloss.trim() !== ''
      && named?.tag === 'button' && classes(named).includes('named') && named.visibleRuby === '' && named.label === doorLabel(),
    JSON.stringify({ clean: markSets(clean), homeBefore: markSets(homeBefore), known, named, knownTaps }));

  const visit = { word: (await tokenState(page, D6.word.index))?.surface ?? null, quote: null, anchor: null, sourceBack: false };
  let step = `focus token ${D6.word.index}`;
  try {
    // the sheet opens through the token's own actions (focus without a press shows 全項目; nothing climbs the tap ladder)
    await page.locator(`#reader .tok[data-index="${D6.word.index}"]`).focus();
    step = '全項目';
    const entry = page.locator('#reader .token-door').filter({ has: page.locator(`.tok[data-index="${D6.word.index}"]`) })
      .locator('[data-action="entry.open"]');
    await entry.waitFor({ state: 'visible', timeout: 5_000 });
    await entry.click();
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
  const awayTaps = [];
  for (let i = 0; i < 2; i++) awayTaps.push(await tapCentre(page, A_TOKEN.index));
  await page.waitForFunction((i) => !!document.querySelector(`#reader .tok[data-index="${i}"] .tok-en`), String(A_TOKEN.index), { timeout: 3_000 })
    .catch(() => {});
  const awayMarked = await readerMarks(page);
  rec('D6.away-marks', `D6 ${D6.away} opens unmarked, and two taps leave its token ${A_TOKEN.index} ${A_TOKEN.token.s} (an index ${D6.home} has not revealed) revealed and glossed, its only marks`,
    awayClean.passage === D6.away && canonical(markSets(awayClean)) === canonical({ lit: [], glossed: [] }) && awayTaps.every((tap) => tap.done)
      && canonical(markSets(awayMarked)) === canonical({ lit: [A_TOKEN.index], glossed: [A_TOKEN.index] }) && !homeBefore.lit.includes(A_TOKEN.index),
    JSON.stringify({ awayClean: markSets(awayClean), awayMarked: markSets(awayMarked), awayTaps }));

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
  rec('D6.home-marks-restored', `D6 ${D6.home}'s own marks come back exactly (token ${D5.known.index} revealed and glossed, nothing else), under the sheet and with it closed`,
    canonical(markSets(atReturn)) === canonical(markSets(homeBefore)) && canonical(markSets(uncovered)) === canonical(markSets(homeBefore)),
    JSON.stringify({ before: markSets(homeBefore), atReturn: markSets(atReturn), uncovered: markSets(uncovered) }),
    { before: markSets(homeBefore), atReturn: markSets(atReturn), uncovered: markSets(uncovered) });
  rec('D6.away-index-not-lit', `D6 ${D6.away}'s mark at index ${A_TOKEN.index} does not land on ${D6.home}'s ${SURFACE}: not lit, reading hidden, label exactly "${doorLabel()}"`,
    [namedAtReturn, namedUncovered].every((view) => view && classes(view).includes('named') && !view.lit && view.visibleRuby === '' && view.label === doorLabel()),
    JSON.stringify({ namedAtReturn, namedUncovered }));
  // the closed sheet hands focus back in an animation frame: let that land, then move focus to the door itself
  await frames();
  await page.locator(`#reader .tok[data-index="${DOOR.index}"]`).focus().catch(() => {});
  const toggle = await tapCentre(page, DOOR.index);
  const namedAfter = await tokenState(page, DOOR.index), englishAfter = await namedEnglish();
  rec('D6.named-toggle', `D6 a tap on ${D6.home}'s ${SURFACE} then shows exactly ${READING}, labelled exactly "${doorLabel(READING)}"`,
    toggle.done && namedAfter?.visibleRuby === READING && namedAfter.label === doorLabel(READING), JSON.stringify({ namedAfter, toggle }));
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
    const opened = await openPage(DESK, spec.run === 'd2' ? '?entry=shelf' : D4_QUERY, { control, edits });
    context = opened.context;
    if (spec.run === 'd4') await d4Walk(opened.page, rec);
    else if (spec.run === 'd5') await d5Detour(opened.page, rec);
    else if (spec.run === 'd6') await d6Visit(opened.page, rec);
    else for (const furigana of [1, 0]) await d2Door(opened.page, rec, furigana);
  } catch (error) {
    control.error = error.message;
  } finally {
    await context?.close().catch(() => {});
  }
  [control.verdict, control.reason] = adjudicate(spec, control);
  check(`C ${spec.name} (${spec.title}) is killed by ${spec.kills.join(' + ')}`, control.verdict === 'killed',
    `${control.verdict}: ${control.reason}`, { id: `C.${spec.name}` });
  return control;
}

try {
  host = await startStaticHost({ site: SITE, port: 0 });
  origin = host.origin;
  browser = await chromium.launch();

  currentCase = 'D0';
  {
    const { context, page } = await openPage({ width: 1024, height: 800 }, '?entry=shelf');
    const identity = await (await page.request.get(`${origin}/build-identity.json`)).json();
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
    const { context, page } = await openPage(viewport, '?entry=shelf');
    const count = await page.locator('#shelf-today .shelf-open').count();
    check(`D1 ${label}: today's picks are on the shelf`, count > 0, `${count} doors`);
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
    for (const dials of ['0,2,0', '2,1,0']) {
      await openArticle(page, `dials=${dials}`, PASSAGE_B);
      const state = await page.evaluate(() => ({ named: document.querySelectorAll('#reader .tok.named').length,
        buttons: document.querySelectorAll('#reader button.tok.named').length,
        cursor: [...document.querySelectorAll('#reader span.tok.named')].slice(0, 1).map((n) => getComputedStyle(n).cursor)[0] || null }));
      check(`D3 dials ${dials}: names are plain text, not buttons that reveal nothing`, state.named > 0 && state.buttons === 0, JSON.stringify(state));
      check(`D3 dials ${dials}: plain names do not advertise a click`, state.cursor !== 'pointer', String(state.cursor));
    }
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
  writeFileSync(resolve(EVIDENCE, 'reader-doors.json'), JSON.stringify({ origin, results, controls, pageErrors, lastCase: currentCase }, null, 2) + '\n');
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · evidence ${EVIDENCE}`);
process.exit(failed.length ? 1 : 0);
