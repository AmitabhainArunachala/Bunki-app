/** verify-sense-truth · R3 (2026-10-18; Grok's sense audit 0315 and the lead's R3 brief). The slip teaches the sense its
 * sentence uses, not the entry's first gloss: the auxiliary ない is "not", never "nonexistent"; 一つ's つ is the counter;
 * 床につく never lamps; a name in its text is a name. Served build only, WebKit and Chromium, 390×844, touch.
 *   F0  the served data: every fixture's token as recorded; its expected entry and sense in the served dictionary (the
 *       sense's first gloss is the meaning line, the wrong teaching is another sense's); the sense sidecar's every row
 *       names a token of a shipped article and a sense its entry has, and its receipts back it (two models agreeing, or a
 *       third siding with one)
 *   G   Grok's table (0315), one real tap per row: the card's meaning line is the expected sense's first gloss, its second
 *       line that sense's next glosses, data-sense-entry names entry and sense, and no line is the wrong teaching; Grok's
 *       "control, right" rows stay right; ごん, the fox, shows as a name
 *   P   the word page from the slip: the expected sense is marked among its entry's senses ("the meaning in this text")
 *   C   classes, one real tap per distinct word in its context, across every article on the shelf:
 *       C1 an auxiliary verb (助動詞) whose served entries headed by it have an auxiliary sense shows one
 *       C2 a suffix after a number (一つ, 一本, 12日, 二疋) written by a served entry read the text's way that has a
 *          counter's or a suffix's sense shows one
 *       C3 ない after a verb's stem or after the copula's, an adjective's or an auxiliary's conjunctive form never shows
 *          "nonexistent"
 *       C4 every row of the sense sidecar, tapped: the card shows the row's sense (or a name)
 *   S   recorded: taps, the sidecar's rows, coverage and agreement (from its receipts)
 * Negative controls: the sense rules off → G and C1–C3 go red; one sidecar row moved to another sense → F0 goes red
 * (the row and its receipts' agreement), and F0 stops the run.
 * SENSE_TRUTH_ONLY=<f0,g,p,c,…> runs only those cases (a control's scope; marked partial, never an acceptance). */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';

assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin an immutable built site and its digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const ONLY = (process.env.SENSE_TRUTH_ONLY || '').split(',').filter(Boolean);
const run = (name) => !ONLY.length || ONLY.includes(name);
const versions = {};
const json = (path) => JSON.parse(readFileSync(resolve(site, path), 'utf8'));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/* ------------------------------------------------------------------ report */
const rows = [];
let engine = 'data';
const check = (id, title, ok, observed = '') => {
  rows.push({ engine, id, title, ok: !!ok, observed });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine}/${id} ${title}${ok ? '' : ` — ${typeof observed === 'string' ? observed : JSON.stringify(observed)}`}`);
};
const record = (id, title, observed) => {
  rows.push({ engine, id, title, recorded: true, observed });
  console.log(`rec  ${engine}/${id} ${title} — ${JSON.stringify(observed)}`);
};

/* ------------------------------------------------------------------ the served data */
const shelf = json('data/articles/index.json').articles;
const fileOf = new Map(shelf.map((row) => [row.id, row]));
const tokensCache = new Map();
const tokensOf = (id) => {
  if (!tokensCache.has(id)) tokensCache.set(id, json(`data/articles/${fileOf.get(id).file}`).tokens || []);
  return tokensCache.get(id);
};
const entries = json('data/share_alike/dict-v2/index.json').entries;
const bySeq = new Map(entries.map((row) => [String(row[0]), row]));
const shardCache = new Map();
const shardIdOf = (seq) => {
  let hash = 0x811c9dc5;
  for (const character of String(seq)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return (hash & 15).toString(16).padStart(2, '0');
};
const detailOf = (seq) => {
  const id = shardIdOf(seq);
  if (!shardCache.has(id)) shardCache.set(id, new Map(json(`data/share_alike/dict-v2/${id}.json`).entries.map((entry) => [String(entry[0]), entry])));
  return shardCache.get(id).get(String(seq)) || null;
};
const glossesOf = (seq, k) => (detailOf(seq)?.[3]?.[k]?.[10] || []).map((gloss) => String(gloss[0]));
const posOfSense = (seq, k) => detailOf(seq)?.[3]?.[k]?.[0] || [];
const k2h = (s) => String(s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const byKana = new Map(), byForm = new Map();
for (const row of entries) {
  for (const kana of row[5]) { const key = k2h(kana); if (!byKana.has(key)) byKana.set(key, []); byKana.get(key).push(row); }
  for (const form of new Set([row[1], ...row[4], ...row[5]])) { if (!byForm.has(form)) byForm.set(form, []); byForm.get(form).push(row); }
}
const sidecar = json('data/articles/senses.json');
const receipts = JSON.parse(readFileSync(resolve(REPO, 'prototypes/corridor/tools/sense-sidecar-receipts.json'), 'utf8'));

/* ------------------------------------------------------------------ fixtures: Grok's table (0315) */
const fx = (name, at, index, s, seq, k, never, more = {}) => Object.freeze({ name, at, index, s, seq, k, never, ...more });
// rows the sense rules settle (expected: entry seq and sense k; never: the wrong teaching Grok saw)
const RULES = Object.freeze([
  fx('ない, auxiliary (聞こえない)', 'adapt-n3:govonline:article-202609-radio-3741', 36, 'ない', '1529520', 4, 'nonexistent'),
  fx('ない in ではない', 'bunki-essay-n1-beyond-fact-fiction', 529, 'ない', '1529520', 4, 'nonexistent'),
  fx('つ, the counter (一つ)', 'adapt-n3:govonline:article-202609-tv-6628', 93, 'つ', '2220330', 0, 'indicates two contrasting actions'),
  fx('本 read ぽん, the counter (一本)', 'aozora:000772-1', 159, '本', '1522150', 4, 'book'),
  fx('もの, the noun (食べるもの)', 'adapt-n3:global-voices:2026-09-28-65726', 138, 'もの', '1502390', 0, 'indicates reason or excuse'),
  fx('方 read かた, the suffix (やり方)', 'aozora:000772-1', 1448, '方', '1516925', 2, 'direction'),
  fx('性, the suffix (必然性)', 'aozora:000772-1', 1199, '性', '1375260', 4, 'nature (of a person)'),
  fx('ん before だ, the explanatory んだ', 'aozora:000628', 1055, 'ん', '2849387', 0, 'yes', { label: 'んだ' }),
  fx('（金）, the weekday', 'env:press-press_05463', 95, '金', '1242600', 6, 'gold (metal)'),
  fx('品, the suffix (完成品)', 'bunki-graded-n3-feel-jingu-forest', 290, '品', '2648780', 1, 'elegance'),
  fx('なる, the classical copula', 'aozora:002359-1', 1139, 'なる', '1536290', 0, 'or something', { label: 'なり' }),
  fx('日 read にち after 12', 'bunki-read-n1-nobel-economics', 60, '日', '2083100', 1, 'Sunday'),
  fx('ただ, the adverb', 'aozora:000772-1', 157, 'ただ', '1538900', 3, 'ordinary'),
  fx('いけ in てはいけない', 'aozora:002359-1', 39, 'いけ', '1000730', 1, 'to be good (at)', { label: 'いけない' }),
  fx('一定, the noun', 'bunki-essay-n2-rain', 86, '一定', '1164950', 1, 'to fix'),
  // the つく row's について (115 of its taps: "to be attached", "to be lit") and the idioms of the ない row (Grok's 727:
  // もったいない, ちがいない/違いない, 間もなく), read whole; たくない (an auxiliary's く form) is "not"
  fx('について (日本について)', 'wikinews:45227', 325, 'つい', '1009780', 0, 'to be lit (of a lamp, burner, etc.)', { label: 'について' }),
  // the とる row's にとって ("take, catch, or にとって"; six of its taps read "to have (e.g. lunch)")
  fx('にとって', 'bunki-essay-n1-city', 50, 'とっ', '1009600', 0, 'to have (e.g. lunch)', { label: 'にとって' }),
  fx('もったいない', 'bunki-essay-n2-translation', 27, 'ない', '1605250', 0, 'nonexistent', { label: '勿体ない' }),
  fx('ちがいない (言ったにちがいない)', 'aozora:000628', 1498, 'ない', '1610740', 0, 'nonexistent', { label: '違いない' }),
  fx('間もなく', 'aozora:046605', 1524, 'なく', '1215290', 0, 'nonexistent', { label: '間もなく' }),
  fx('たくない (〜たくない)', 'bunki-graded-n3-feel-jingu-forest', 462, 'ない', '1529520', 4, 'nonexistent'),
]);
// Grok's "control, right" rows (and the adjective ない he left out of his tally): right before, right after
const CONTROLS = Object.freeze([
  fx('月 read がつ (control)', 'adapt-n3:env:press-press_05643', 1, '月', '2871532', 0, 'Moon'),
  fx('（日）, Sunday (control)', 'env:press-press_05591', 802, '日', '2083100', 0, 'nth day (of the month)'),
  fx('ない, the adjective (羽のない)', 'adapt-n3:env:press-press_05643', 96, 'ない', '1529520', 0, 'not'),
  fx('かける, hung (納屋にかけてある火縄銃) (control)', 'aozora:000628', 2964, 'かけ', '1207610', 0, 'to secure (e.g. lock)'),
]);
// Grok's wrong-teaching rows the rules leave to the sidecar. The expected sense is his (pinned here, never read from the
// sidecar): the sidecar's row must name it, and the card must show it
const SIDECAR = Object.freeze([
  fx('ため', 'adapt-n3:env:press-press_05643', 158, 'ため', '1157080', 1, 'good'),
  fx('つく in 床についていて', 'aozora:000628', 1484, 'つい', '1331530', 0, 'to be lit (of a lamp, burner, etc.)'),
  fx('とる (魚をとる)', 'aozora:000628', 463, 'とる', '1514140', 0, 'to have (e.g. lunch)'),
  fx('先 (買う先)', 'adapt-n3:govonline:article-202609-tv-6628', 105, '先', '1387210', 6, 'point'),
  fx('機関', 'adapt-n3:govonline:article-202609-tv-6628', 162, '機関', '1220870', 1, 'engine'),
  fx('推進', 'adapt-n3:govonline:article-202609-radio-3741', 100, '推進', '1371140', 1, 'propulsion'),
  fx('大会', 'adapt-n3:jawiki:3492442', 8, '大会', '1413180', 1, 'mass meeting'),
  fx('点', 'aozora:000772-1', 1050, '点', '1441390', 4, 'dot'),
  fx('部 (南西部)', 'adapt-n3:env:press-press_05643', 49, '部', '1499290', 2, 'department (in an organization, company, etc.)'),
  fx('中 in そこら中, read じゅう', 'aozora:046605', 406, '中', '2083570', 2, 'medium (size)'),
  fx('方, a polite person (発見された方), read かた', 'env:press-press_05643', 933, '方', '1516925', 1, 'direction'),
  fx('台, the counter (一台)', 'bunki-graded-n3-hashira-counter', 27, '台', '1412560', 3, 'stand'),
  fx('あげ, to give (人にあげちゃった)', 'bunki-read-n3-honda-quarter', 452, 'あげ', '1352320', 4, 'to raise'),
  fx('かけ, to lock (かぎはかけましたか)', 'bunki-graded-n4-bicycle', 124, 'かけ', '1207610', 9, 'to hang up (e.g. a coat, a picture on the wall)'),
  fx('一枚岩 (first-versus-supreme)', 'bunki-essay-n1-first-versus-supreme', 487, '枚', '1166750', 1, 'counter for thin, flat objects (e.g. sheets of paper, plates, coins)', { label: '一枚岩' }),
  fx('一枚岩 (kojiki-power)', 'bunki-essay-n1-kojiki-power', 789, '枚', '1166750', 1, 'counter for thin, flat objects (e.g. sheets of paper, plates, coins)', { label: '一枚岩' }),
]);
// Grok's rows whose right sense leads with a misleading gloss: the sidecar's row names the gloss the slip leads with
// (leads: the glosses that carry his meaning); the sense's own first gloss is never the meaning line
const GLOSSED = Object.freeze([
  fx('実施, carrying out (a survey)', 'bunki-read-n2-kokugo-survey', 113, '実施', '1321140', 0, 'enforcement', { leads: [1, 3] }),
  fx('遺産, heritage (世界遺産)', 'govonline:article-202609-radio-3743', 16, '遺産', '1159260', 0, 'inheritance', { leads: [3] }),
  fx('発, from (大学発)', 'mext:b_menu-houdou-2025-mext_00009', 15, '発', '1477120', 0, 'departure', { leads: [1] }),
]);
// Grok's rows the rules settle that his wrong-teaching table adds to the taps above (月 and 分 after their readings)
const MORE = Object.freeze([
  fx('月 read がつ (9月)', 'adapt-n3:jawiki:5238864-s63', 3, '月', '2871532', 0, 'Moon'),
  fx('分, minutes (60分), read ぷん', 'mext:b_menu-houdou-mext_01683', 409, '分', '1502840', 0, 'part'),
  fx('分, minutes (59分), read ふん', 'wikinews:44384', 105, '分', '1502840', 0, 'part'),
]);
// Grok's imprecise table: right word, the better sense
const IMPRECISE = Object.freeze([
  fx('ものだ, a wish (帰りたいものだ)', 'aozora:051034', 790, 'もの', '1502390', 5, 'thing'),
  fx('ものだ, what should be (しそうなものだ)', 'aozora:000628', 1086, 'もの', '1502390', 5, 'thing'),
  fx('ものです, a habit (威張ったものです)', 'aozora:000772-1', 669, 'もの', '1502390', 5, 'thing'),
  fx('なり, or (父母なり)', 'aozora:049966-1', 971, 'なり', '2029070', 1, 'or something'),
  fx('なり, or (同胞なり)', 'aozora:049966-1', 973, 'なり', '2029070', 1, 'or something'),
  fx('なり, or (他の朋友なり)', 'aozora:049966-1', 977, 'なり', '2029070', 1, 'sum of money'),
  fx('方がいい, had better not (しない方がよい)', 'bunki-essay-n1-ise-time', 862, '方', '2160680', 1, 'indicates one side of a comparison', { label: '方がいい' }),
  fx('方がいい, had better not (しない方がいい)', 'bunki-essay-n1-prayer-reality', 321, '方', '2160680', 1, 'indicates one side of a comparison', { label: '方がいい' }),
  fx('方, one side of a comparison (限定した方が)', 'bunki-essay-n1-nakaima-time-theory', 622, '方', '1516930', 4, 'direction'),
  fx('僕の方, one side', 'aozora:046605', 1231, '方', '1516930', 4, 'direction'),
  fx('兄さんの方, one side', 'aozora:046605', 1312, '方', '1516930', 4, 'direction'),
  fx('僕の方 (mine), read ほう', 'aozora:046605', 1323, '方', '1516930', 4, 'direction'),
  fx('ただの気のせい, mere', 'bunki-essay-n1-prayer-reality', 397, 'ただ', '1538900', 3, 'ordinary'),
  fx('ただの習慣, mere', 'bunki-read-n3-gojuon-sanskrit', 33, 'ただ', '1538900', 3, 'ordinary'),
  fx('成果をあげた, to achieve', 'wikinews:1403', 646, 'あげ', '1352320', 7, 'to raise'),
  fx('成果をあげた, to achieve (sports)', 'sports:sports-b_menu-houdou-31-09-1420919_00007', 39, 'あげ', '1352320', 7, 'to raise'),
  fx('小・中・高校, junior high', 'env:press-press_05584', 528, '中', '1620400', 6, 'medium (size)'),
]);
// names in their text: the card says so, never a dictionary homograph
const NAMES = Object.freeze([
  fx('ごん, the fox', 'aozora:000628', 76, 'ごん', null, null, 'great burdock'),
  fx('台 in 五台山, a name', 'bunki-read-n2-bodhisena', 232, '台', null, null, 'stand'),
]);
const NAME = NAMES[0];
// the glosses the card shows for a sense: a glossed row's lead first, then the rest but the misleading first (as the app)
const led = (glosses, lead) => (Number.isInteger(lead) && lead > 0 && lead < glosses.length
  ? [glosses[lead], ...glosses.filter((_, g) => g !== lead && g !== 0)] : glosses);
// the fixtures whose word page is opened from the slip: a lookup word, a reading word the sidecar settles, a glossed
// word, an expression (方がいい: a reading word; a single-kanji lookup word's band opens the kanji's page on this branch)
const PAGE = new Set([RULES[0].name, SIDECAR[1].name, GLOSSED[0].name, IMPRECISE[6].name]);

/* ------------------------------------------------------------------ F0 */
const sidecarRow = (at, index) => sidecar.articles?.[at]?.[String(index)] || null;
if (run('f0')) {
  for (const fixture of [...RULES, ...CONTROLS, ...MORE, ...IMPRECISE]) {
    const token = tokensOf(fixture.at)[fixture.index];
    const glosses = glossesOf(fixture.seq, fixture.k);
    const other = (detailOf(fixture.seq)?.[3] || []).some((sense, k) => k !== fixture.k && sense[10].some((g) => g[0] === fixture.never))
      || [...(byForm.get(token?.s) || []), ...(byForm.get(token?.b) || []), ...(byKana.get(k2h(token?.b || token?.s)) || [])].some((row) => row[6].includes(fixture.never));
    check(`F0.${fixture.name}`, `${fixture.at} #${fixture.index} is ${fixture.s}; entry ${fixture.seq} sense ${fixture.k + 1} begins "${glosses[0]}"${fixture.never ? `; "${fixture.never}" is another sense's` : ''}`,
      token?.s === fixture.s && glosses.length > 0 && (!fixture.never || (!glosses.includes(fixture.never) && other)),
      { token, glosses, pos: posOfSense(fixture.seq, fixture.k) });
  }
  for (const fixture of SIDECAR) {
    const token = tokensOf(fixture.at)[fixture.index], row = sidecarRow(fixture.at, fixture.index);
    const glosses = glossesOf(fixture.seq, fixture.k);
    check(`F0.sidecar.${fixture.name}`, `${fixture.at} #${fixture.index} is ${fixture.s}; the sidecar names entry ${fixture.seq} sense ${fixture.k + 1} ("${glosses[0]}"), never "${fixture.never}"`,
      token?.s === fixture.s && glosses.length > 0 && !glosses.includes(fixture.never) && row?.[0] === fixture.seq && row?.[1] === fixture.k, { token, row, glosses });
  }
  for (const fixture of GLOSSED) {
    const token = tokensOf(fixture.at)[fixture.index], row = sidecarRow(fixture.at, fixture.index);
    const glosses = glossesOf(fixture.seq, fixture.k);
    check(`F0.gloss.${fixture.name}`, `${fixture.at} #${fixture.index} is ${fixture.s}; the sidecar names entry ${fixture.seq} sense ${fixture.k + 1} led by ${fixture.leads.map((g) => `"${glosses[g]}"`).join(' or ')}, never "${fixture.never}"`,
      token?.s === fixture.s && glosses[0] === fixture.never && row?.[0] === fixture.seq && row?.[1] === fixture.k && fixture.leads.includes(row?.[3]), { token, row, glosses });
  }
  for (const fixture of NAMES) {
    const token = tokensOf(fixture.at)[fixture.index], row = sidecarRow(fixture.at, fixture.index);
    check(`F0.name.${fixture.name}`, `${fixture.at} #${fixture.index} is ${fixture.s}; the sidecar names it a name`, token?.s === fixture.s && row?.[0] === 'name', { token, row });
  }
  // the sidecar: well formed, every row a shipped token and an entry's sense, every row backed by its receipts
  const backed = new Map(receipts.tasks.filter((task) => task.source).map((task) => [`${task.passage}#${task.index}`, task]));
  let rowCount = 0;
  const bad = [];
  for (const [at, list] of Object.entries(sidecar.articles || {})) {
    for (const [index, row] of Object.entries(list)) {
      rowCount += 1;
      const token = fileOf.has(at) ? tokensOf(at)[Number(index)] : null;
      const task = backed.get(`${at}#${index}`);
      // the row is the pick its source names: both models agreeing; the third siding with one where they split; the
      // third agreeing with the first where the second never answered
      const choice = row[0] === 'name' ? 'N' : row.length > 3 ? `${row[0]}:${row[1]}:${row[3]}` : `${row[0]}:${row[1]}`;
      const a = task?.a?.choice, b = task?.b?.choice, c = task?.c?.choice;
      const agreed = { agree: a === choice && b === choice, 'third:a': !!b && a !== b && a === choice && c === choice,
        'third:b': !!a && a !== b && b === choice && c === choice, 'pair:ac': !b && a === choice && c === choice,
        'pair:bc': !a && b === choice && c === choice, review: task?.review?.choice === choice && !!task.review.reason }[task?.source];
      const fine = !!token && !!task && !!agreed && (row[0] === 'name' ? row[1] === task.source
        : glossesOf(row[0], row[1]).length > (row.length > 3 ? row[3] : 0) && row[2] === task.source);
      if (!fine) bad.push(`${at}#${index}`);
    }
  }
  check('F0.sidecar', `the sense sidecar: ${rowCount} rows, each a shipped token, an entry's sense (or a name), and its receipts' agreement`,
    sidecar.schemaVersion === 1 && rowCount > 0 && !bad.length, bad.slice(0, 10));
  record('S.sidecar', 'the sidecar and its receipts', { rows: rowCount, tally: receipts.tally, splits: receipts.splits?.length, models: receipts.models });
}
const F0_OK = rows.every((row) => row.recorded || row.ok);

/* ------------------------------------------------------------------ the browser */
const host = await startStaticHost({ site, port: 0 });
// an article's first word, waited for up to a minute: a long text (やまなし, 1,692 words) under a full battery's load has
// taken over 20 s to draw; a wait, not an assertion
const OPEN_MS = 60000;
// the reader is drawn when any of its words has a box (a text may hold hidden words before its first paragraph)
const readerDrawn = (page) => page.waitForFunction(() => [...document.querySelectorAll('#reader .tok[data-index]')]
  .some((node) => node.getBoundingClientRect().height > 0), null, { timeout: OPEN_MS });
async function boot(page) {
  await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: OPEN_MS });
}
async function openArticle(page, id) {
  const row = fileOf.get(id);
  // a simplified version (adapt-n3:…) opens from its original's reader, by its version switch
  if (row.adaptation?.basedOn) {
    if (!(await openArticle(page, row.adaptation.basedOn))) return false;
    await page.locator(`.version-choice[data-version="${id}"]`).click();
    await page.waitForFunction((pid) => document.querySelector(`.version-choice[data-version="${pid}"]`)?.getAttribute('aria-pressed') === 'true',
      id, { timeout: OPEN_MS });
    await readerDrawn(page);
    return true;
  }
  await boot(page);
  const direct = page.locator(`[data-passage="${id}"]:not([data-recommendation]) .shelf-open`).first();
  if (await direct.count()) await direct.click();
  else {
    await openShelfTools(page);
    await page.locator('#shelf-reading-search').fill(row.title);
    await page.locator('#shelf-reading-search').press('Enter');
    const found = page.locator(`#shelf-reading-results [data-passage="${id}"] .shelf-open`).first();
    try { await found.waitFor({ timeout: OPEN_MS }); } catch { return false; }
    await found.click();
  }
  await readerDrawn(page);
  return true;
}
const tok = (page, index) => page.locator(`#reader .tok[data-index="${index}"], #reader .tok[data-index-end]`).filter({ has: page.locator(':scope') })
  .first();
async function closeMini(page) {
  for (let attempt = 0; attempt < 3 && await page.locator('#mini').count(); attempt++) {
    await page.locator('#mini').press('Escape').catch(() => {});
    await delay(150);
  }
}
const cardState = (page) => page.evaluate(() => {
  const mini = document.getElementById('mini');
  if (!mini) return null;
  const take = mini.querySelector('#mini-take');
  return { word: mini.querySelector('.mini-word')?.childNodes[0]?.textContent ?? null, reading: mini.querySelector('.mini-reading')?.textContent ?? '',
    lines: [...mini.querySelectorAll('.mini-gloss')].map((node) => node.textContent), more: mini.querySelector('.mini-gloss-more')?.textContent ?? '',
    sense: mini.dataset.senseEntry || '', take: take ? { disabled: take.disabled } : null };
});
/** A real tap; the card as it settles: no longer busy (aria-busy), its sense no longer pending (data-sense). */
async function card(page, index) {
  await closeMini(page);
  const target = page.locator(`#reader .tok[data-index="${index}"]`).first();
  await target.tap({ timeout: 30000 });
  await page.locator('#mini').waitFor({ timeout: OPEN_MS });
  await page.waitForFunction(() => {
    const mini = document.getElementById('mini');
    return mini && mini.getAttribute('aria-busy') !== 'true' && mini.dataset.sense !== 'pending';
  }, null, { timeout: 30000 });
  await delay(150);
  return cardState(page);
}
/** The word page from the slip's band: the senses marked "in this text". */
async function pageSense(page) {
  await page.locator('#mini .mini-word').click();
  await page.locator('#sheet .headword').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#sheet .dictionary-senses'), null, { timeout: 15000 }).catch(() => {});
  await delay(400);
  return page.evaluate(() => [...document.querySelectorAll('#sheet .dictionary-sense')].map((node, k) => ({ k, marked: node.getAttribute('aria-current') === 'true',
    text: node.querySelector('.gloss, .dictionary-glosses li')?.textContent ?? '' })).filter((sense) => sense.marked));
}

async function grokCases(_, fresh) {
  const fixtures = [...RULES, ...CONTROLS, ...MORE, ...SIDECAR, ...IMPRECISE].map((f) => ({ ...f, kind: 'sense' }))
    .concat(GLOSSED.map((f) => ({ ...f, kind: 'gloss' })), NAMES.map((f) => ({ ...f, kind: 'name' })));
  for (const fixture of fixtures) {
    // each row in its own context; a row that cannot be run (a timeout: the page stalled) runs once more in a fresh
    // one, and fails alone, with its screenshot, if it still cannot; its checks are recorded once, from the run that ran
    for (let attempt = 1; ; attempt += 1) {
      const { page, close } = await fresh();
      try {
        const rows = await grokCase(page, fixture);
        for (const row of rows) check(row[0], row[1], row[2], attempt > 1 ? { attempt, detail: row[3] } : row[3]);
        break;
      } catch (error) {
        if (attempt < 2) { retried.push(`${engine}:${fixture.name}: ${String(error.message || error).split('\n')[0].slice(0, 120)}`); continue; }
        check(`G.${fixture.name}`, `${fixture.at} #${fixture.index} ${fixture.s}: the row ran`, false, String(error.message || error).slice(0, 400));
        await page.screenshot({ path: resolve(evidence, `${engine}-G-${fixture.at.replace(/[^a-z0-9]+/giu, '_')}-${fixture.index}.png`) }).catch(() => {});
        break;
      } finally { await close(); }
    }
  }
}
const retried = [];
/** One row of Grok's tables, tapped: the checks it earns, as [name, description, ok, detail] (recorded by grokCases). */
async function grokCase(page, fixture) {
  const rows = [];
  {
    if (!(await openArticle(page, fixture.at))) return [[`G.${fixture.name}`, `${fixture.at} opens from the shelf`, false]];
    const got = await card(page, fixture.index);
    if (fixture.kind === 'name') {
      return [[`G.${fixture.name}`, `${fixture.at} #${fixture.index} ${fixture.s}: the card says it is a name in this text, never "${fixture.never}"`,
        got?.word === fixture.s && got.lines[0] === 'a name in this text' && !got.lines.includes(fixture.never), got]];
    }
    const lead = fixture.kind === 'gloss' ? sidecarRow(fixture.at, fixture.index)?.[3] : undefined;
    const glosses = led(glossesOf(fixture.seq, fixture.k), lead);
    const lines = [...(got?.lines || []), ...(got?.more ? got.more.split('; ') : [])];
    rows.push([`G.${fixture.name}`, `${fixture.at} #${fixture.index} ${fixture.s}: the card is entry ${fixture.seq} sense ${fixture.k + 1}, "${glosses[0]}"${glosses.length > 1 ? ' then its next glosses' : ''}${fixture.kind === 'gloss' ? ` (led by the sidecar's gloss ${lead})` : ''}; never "${fixture.never}"`,
      got?.lines?.[0] === glosses[0] && got.sense === `${fixture.seq}:${fixture.k}` && (!fixture.label || got.word === fixture.label)
        && (glosses.length < 2 || got.more.startsWith(glosses[1])) && (fixture.kind !== 'gloss' || fixture.leads.includes(lead))
        && !lines.includes(fixture.never), got]);
    if (PAGE.has(fixture.name)) {
      const marked = await pageSense(page);
      rows.push([`P.${fixture.name}`, `its word page marks sense ${fixture.k + 1} as the meaning in this text`, marked.length === 1 && marked[0].k === fixture.k, marked]);
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ C · classes across the shelf */
const SENSE_NUMBER = /^[0-9０-９〇一二三四五六七八九十百千万億兆]+$/u;
const NUMBER_WORDS = new Set(['ひと', 'ふた', 'いく', '幾', '何', '数']);
const AUX = /^(?:aux|aux-v|aux-adj|cop)$/u;
const kanaForm = (token) => k2h(token.b || token.s);
// the verifier's own reading of the served data: entries read as the word, headed by it (or usually written in kana)
const headed = (form) => (byKana.get(k2h(form)) || []).filter((row) => row[1] === form
  || (detailOf(row[0])?.[3] || []).some((sense) => (sense[7] || []).includes('uk')));
function classCases() {
  const keys = new Map();
  const add = (cls, at, index, token, key) => {
    if (!keys.has(key)) keys.set(key, { cls, at, index, token, occurrences: 0 });
    keys.get(key).occurrences += 1;
  };
  for (const row of shelf) {
    const tokens = tokensOf(row.id);
    tokens.forEach((token, index) => {
      const prev = tokens[index - 1], prev2 = tokens[index - 2];
      if (token.p === '助動詞' && headed(token.b || token.s).some((entry) => (detailOf(entry[0])?.[3] || []).some((sense) => sense[0].some((code) => AUX.test(code))))) {
        add('C1', row.id, index, token, `C1|${token.s}|${token.b}`);
      }
      // a suffix after a number, written by a served entry read the text's way that has a counter's or a suffix's sense
      // (a counter inside an idiom is the idiom's: 一枚岩's 枚, pinned by G as Grok's row asks)
      const idiom = token.s === '枚' && tokens[index + 1]?.s === '岩';
      if (token.p === '接尾辞' && !idiom && prev && (SENSE_NUMBER.test(prev.s) || NUMBER_WORDS.has(prev.s))
        && (byForm.get(token.s) || []).filter((entry) => (entry[1] === token.s || entry[4].includes(token.s)) && entry[5].some((kana) => k2h(kana) === k2h(token.r || token.s)))
          .some((entry) => (detailOf(entry[0])?.[3] || []).some((sense) => sense[0].some((code) => /^(?:ctr|suf|n-suf)$/u.test(code))))) {
        add('C2', row.id, index, token, `C2|${token.s}|${token.r}`);
      }
      // an adjective's or an auxiliary's く form (高くない, 行きたくない)
      const ku = (t) => ['形容詞', '助動詞'].includes(t?.p) && /く$/u.test(String(t?.s || ''));
      if (['ない', '無い'].includes(token.b) && (token.p === '助動詞' || (token.p === '形容詞' && (['で', 'じゃ', 'じゃあ'].includes(prev?.s)
        || ku(prev) || (['は', 'も'].includes(prev?.s) && (['で', 'じゃ'].includes(prev2?.s) || ku(prev2))))))) {
        add('C3', row.id, index, token, `C3|${token.s}|${token.p}|${prev?.s}`);
      }
    });
  }
  for (const [at, list] of Object.entries(sidecar.articles || {})) for (const index of Object.keys(list)) add('C4', at, Number(index), tokensOf(at)[Number(index)], `C4|${at}|${index}`);
  return [...keys.values()];
}

async function classSweep(fresh, cases) {
  const report = { cls: {}, failures: [] };
  const byArticle = new Map();
  for (const item of cases) { if (!byArticle.has(item.at)) byArticle.set(item.at, []); byArticle.get(item.at).push(item); }
  for (const [at, items] of byArticle) {
    // each text in its own context (see fresh); a text that cannot be opened fails its rows, with the reason
    let { page, close } = await fresh();
    try {
    // a text that does not open (a stalled load, a slow shelf search) is opened once more in a fresh context
    let opened = false;
    try { opened = await openArticle(page, at); } catch (error) { opened = false; }
    if (!opened) {
      retried.push(`${engine}:C:${at}: the text did not open`);
      await close();
      ({ page, close } = await fresh());
      try { opened = await openArticle(page, at); } catch (error) { opened = false; }
    }
    if (!opened) {
      // a text that did not open fails every row of it (counted, never skipped)
      for (const item of items) {
        const cls = report.cls[item.cls] ||= { tapped: 0, occurrences: 0, failed: 0 };
        cls.failed += 1; cls.occurrences += item.occurrences;
        report.failures.push({ cls: item.cls, at: item.at, index: item.index, s: item.token?.s, got: null, issue: 'the text did not open' });
      }
      continue;
    }
    for (const item of items.sort((a, b) => a.index - b.index)) {
      const cls = report.cls[item.cls] ||= { tapped: 0, occurrences: 0, failed: 0 };
      let got = null;
      // a tap that times out (the page stalled) gets one more try; a card that answers wrongly is never retried
      try { got = await card(page, item.index); } catch (error) {
        retried.push(`${engine}:C:${item.at}#${item.index}: ${String(error.message || error).split('\n')[0].slice(0, 120)}`);
        try { got = await card(page, item.index); } catch (again) { got = null; }
      }
      cls.tapped += 1; cls.occurrences += item.occurrences;
      const [seq, k] = String(got?.sense || ':').split(':');
      const pos = seq ? posOfSense(seq, Number(k)) : [];
      let ok = !!got;
      if (item.cls === 'C1') ok = ok && pos.some((code) => AUX.test(code));
      if (item.cls === 'C2') ok = ok && pos.some((code) => /^(?:ctr|suf|n-suf)$/u.test(code));
      if (item.cls === 'C3') ok = ok && !got.lines.includes('nonexistent');
      if (item.cls === 'C4') {
        const row = sidecarRow(item.at, item.index);
        // the row's sense; a glossed row's lead gloss is the meaning line
        ok = ok && (row[0] === 'name' ? got.lines[0] === 'a name in this text' : got.sense === `${row[0]}:${row[1]}`
          && (row.length < 4 || got.lines[0] === glossesOf(row[0], row[1])[row[3]]));
      }
      if (!ok) { cls.failed += 1; report.failures.push({ cls: item.cls, at: item.at, index: item.index, s: item.token?.s, got }); }
    }
    } finally { await close(); }
  }
  return report;
}

try {
  if (!F0_OK) throw new Error('F0: the served data moved; nothing below would mean what it says');
  const cases = run('c') ? classCases() : [];
  for (engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    versions[engine] = browser.version();
    console.log(`engine ${engine} · ${browser.browserType().name()} ${versions[engine]}`);
    const contextOptions = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      serviceWorkers: 'block', reducedMotion: 'reduce' };
    const each = async (name, body) => {
      const context = await browser.newContext(contextOptions);
      await silenceBrowserAudio(context);
      await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => errors.push(error.message));
      // a fresh context for a part that opens many texts: one page load after another in the same context has stalled a
      // tap for minutes in WebKit (both N2's build and R3's: R3/tools/boot-timing.mjs)
      const fresh = async () => {
        const own = await browser.newContext(contextOptions);
        await silenceBrowserAudio(own);
        await own.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
        const p = await own.newPage();
        p.setDefaultTimeout(15000);
        p.on('pageerror', (error) => errors.push(error.message));
        return { page: p, close: () => own.close() };
      };
      try { return await body(page, fresh); }
      catch (error) {
        check(`${name}.error`, `${name} ran to the end`, false, String(error.stack || error).slice(0, 600));
        await page.screenshot({ path: resolve(evidence, `${engine}-${name}.png`) }).catch(() => {});
        return null;
      } finally {
        check(`${name}.page-errors`, `${name}: no page errors`, errors.length === 0, errors.slice(0, 5));
        await context.close();
      }
    };
    if (run('g')) await each('g', grokCases);
    if (run('c')) {
      const report = await each('c', (_, fresh) => classSweep(fresh, cases));
      if (report) {
        writeFileSync(resolve(evidence, `classes-${engine}.json`), `${JSON.stringify(report, null, 1)}\n`);
        const list = (cls) => report.failures.filter((x) => x.cls === cls).map((x) => `${x.at} #${x.index} ${x.s}: ${JSON.stringify(x.got)?.slice(0, 160)}`).slice(0, 10);
        const c = (cls) => report.cls[cls] || { tapped: 0, occurrences: 0, failed: 0 };
        check('C1', `every auxiliary verb whose served entries headed by it have an auxiliary sense shows one (${c('C1').tapped} distinct, ${c('C1').occurrences} occurrences)`,
          c('C1').tapped > 0 && !c('C1').failed, list('C1'));
        check('C2', `every suffix after a number written by an entry read its way with a counter's or a suffix's sense shows one (${c('C2').tapped} distinct, ${c('C2').occurrences} occurrences)`,
          c('C2').tapped > 0 && !c('C2').failed, list('C2'));
        check('C3', `no ない after a verb's stem or the copula's or an adjective's conjunctive form shows "nonexistent" (${c('C3').tapped} distinct, ${c('C3').occurrences} occurrences)`,
          c('C3').tapped > 0 && !c('C3').failed, list('C3'));
        check('C4', `every row of the sense sidecar shows its sense (${c('C4').tapped} rows tapped)`, c('C4').tapped > 0 && !c('C4').failed, list('C4'));
        record('S.taps', 'the class sweep\'s taps', report.cls);
      }
    }
    await browser.close();
  }
} finally {
  await host.close();
  const failed = rows.filter((row) => !row.recorded && !row.ok);
  record('S.retried', 'rows and taps run once more after a timeout (never after a wrong answer)', { count: retried.length, retried: retried.slice(0, 40) });
  writeFileSync(resolve(evidence, 'verify-sense-truth.json'), `${JSON.stringify({ site, served: identity.gitSha, artifactSha256: identity.artifactSha256,
    engines, versions, partial: ONLY.length ? ONLY : false, failed: failed.length, rows }, null, 2)}\n`);
  if (ONLY.length) console.log(`PARTIAL RUN (${ONLY.join(', ')}): a control's scope, not an acceptance result`);
  console.log(`\n${rows.filter((row) => !row.recorded).length - failed.length} passed, ${failed.length} failed, ${rows.filter((row) => row.recorded).length} recorded · engines ${JSON.stringify(versions)} · evidence ${evidence}`);
  process.exitCode = failed.length ? 1 : 0;
}
