/** verify-reading-truth · slice R (2026-10-16). The reading a word door shows is the reading its text gives the token,
 * and the entry it stands for is the one read that way: in 令和8年 the ruby says ねん, and the card said とし. A door with
 * no reading of its own (Words, the sky, prose), or with the quick dictionary's own reading, answers from the quick
 * dictionary as before. Served build only, WebKit and Chromium, 390×844, touch.
 *   F0  the served fixtures: token rows, the quick dictionary's readings, the full dictionary's entries
 *   A1  reader, one tap: the card's reading is the token's (年 ねん, 月 がつ, 時 じ, 一日 ついたち) and its meaning is
 *       the entry read that way; each twin read like the quick dictionary (年 とし, 月 つき, 時 とき) is unchanged
 *   A2  reader, the second tap: the entry reads ねん and is entry 2084840
 *   A3  Save keeps the entry and the reading shown (entrySeq 2084840, cueReading ねん); export → import keeps them
 *   A4  the stable case: Words search 年 opens the quick dictionary's とし; 総理 is unchanged
 *   A5  a sentence's words (an entry's 用例): a 年 counting years reads ねん
 *   A6  a deck card's back: a word the deck reads otherwise than the quick dictionary shows the deck's reading
 *   A7  the guided session: every word's card reads as the session reads it
 *   A8  the full dictionary first: スタートアップ is a normal card; 高市 says it has no entry and promises no door
 *   A9  the cold first tap (L): with the full dictionary held, 月 in 9月 (がつ) shows a quiet "…" and a held Save, never
 *       the quick dictionary's つき "Moon"; released, がつ's meaning; answered 500, the "…" stays. Every case counts every
 *       page error (L dropped R's ResizeObserver filter; the capture case listens too)
 *   A10 (N, 2026-10-17; rewritten by R2 to the lead's addendum class 2) a word no entry is read for: Kawaguchi's 訳 read
 *       やく; every dictionary the build serves reads 訳 only わけ ("reason"), and an entry read otherwise counts as
 *       missing. With the full dictionary held, the first tap shows 「やく …」 with Save held and silent. やく is 訳's
 *       on'yomi, so once the dictionary answers, the same card, with no second tap, is the kanji's: 訳 · やく ·
 *       "kanji · translate" (the kanji data's meaning), its Save the kanji's. Its meaning line never shows わけ's
 *       meaning, and its page (the second tap) is the kanji page of 訳
 *   R2  inflected words (Kimi 0258, Codex 0309/0323): the card reads the dictionary form the way the text reads it.
 *       Named: 忘却曲線 #297 おい → おく · 置く's meaning (never おけ, 奥, 億); Sōseki #576 云っ → 云う · いう · to say (never
 *       いい); #1414 解せ → 解す · げす · to understand (never かいする); Shosoin #483 来 read き and Sōseki #66 来 read こ →
 *       来る · くる (never きる, こる). Save on 云う keeps entry 1587040 and cueReading いう, in the same row shape as 年's
 *   R2.V  a sound change names the entry read the plain way, the card still showing the text's reading: 一 いっ, 本 ぽん,
 *       八 はっ, 歩 ぽ, 金持ち がねもち (R3, Grok 0315: 本 after a number shows that entry's counter sense, never "book")
 *   R2.K  a lone kanji read by its on'yomi, no word entry read so, is the kanji's card: 寺 じ, 国 こく, 仏 ぶつ (never
 *       仏 ふつ "France", the quick dictionary's)
 *   R2.C3 a reading the shipped dictionary now carries from the pinned JMdict: 私 read わたくし is entry 2842390
 *   R2.unfit a kana verb whose dictionary form the quick dictionary has only as a noun is that verb, read as its dictionary
 *       form (one form: never the surface's reading beside it): ごん狐 かえり, かえっ → かえる 帰る (never 蛙), MHLW なさ →
 *       なす 為す (never 茄子) — Codex 1352
 *   R2.stem a godan verb never stands as its bare stem: the い of ている / いました is いる 居る (entry 1577980), never the
 *       quick dictionary's godan いる, 要る "to be needed"; its Save keeps entry 1577980 (R2.capture.stem, the round trip).
 *       N2: the い of 済んでいます stands right after the te-form, so its card shows 居る's senses for the te-form ("to be
 *       ...-ing", "to have ...-ed"), no longer its first gloss; the い of 狐がいました, the verb of being, still does
 *   N2.te  (Grok 0036; the lead, 2026-10-18) a verb written in kana right after the te-form (the particle て or で after a
 *       verb or an auxiliary verb) is its auxiliary use: the card is the entry JMdict lists for that use (a sense of part of
 *       speech aux-v, or an expression, noted as following the te-form), read as the verb's dictionary form or, with none,
 *       as the text writes it; its lines are those senses' first glosses in JMdict's order, Save live, never the
 *       homograph's. Named: 津浪と人間 #103 いる (残っている) and the chip plant #210 いる (予定している), the two Grok found
 *       teaching 要る "to be needed", each with its full entry (1577980 stands; 要る is one of the others); the chip plant
 *       #604 い; おく 置く (never 奥); くる 来る (never 繰る); ください 下さい "please (do for me)" (never 下さる "to give")
 *   N2.alone a kana いる outside the te-form is 居る's "to be (of animate objects)", never "to be needed"; its full entry
 *       lists 要る among the form's entries, one tap away
 *   AUX  every token in every article on the shelf that is a verb written in kana right after the te-form, one tap per
 *       distinct token: where JMdict lists such a use, the card is that entry (expected from the served index and detail
 *       shards by this verifier's own reading, never the app's); no いる shows "to be needed"; a verb JMdict lists no such use
 *       for is recorded, answered as any word
 *   SWEEP every inflected token (surface ≠ base) of the forty reviewed articles (N's twenty and N2's: the review queue's
 *       hand-chosen kinds, original · aozora · gv · mext · govonline) and of a fixed sample of 20 inherited
 *       ones, one tap per distinct token per article: the reading the card states comes from the token's own (a kana
 *       base; the shared stem read alike; a reading the served dictionary lists for the form whose stem the token's
 *       reading keeps; 来 → くる), or the card is the word as written read as written (the label and the reading always
 *       name the same form: never the dictionary form beside the surface's reading); any meaning it shows belongs to an entry a
 *       served dictionary has (the quick one, the full one, the original word layer) that writes the card's word and reads
 *       it so, of the token's class (parts of speech from the quick dictionary and the served detail shards; an entry no
 *       served data gives a class is recorded as of unknown class; N2: the one card of another class a verb may show is,
 *       right after the te-form, JMdict's own expression for that use as the text writes it, 下さい for 〜てください);
 *       never "Not in the quick dictionary" once settled;
 *       never a card left at "…"; a card naming no entry holds its Save and says why.
 *       Counts and every exception are written to the report
 *   R   recorded, never asserted: 式 in 表彰式 and 改造 in 内閣改造 (sense: the tokens carry no sense data),
 *       し of する (an inflected verb reads its dictionary form), the first paint. G3 explicitly asserts
 *       that ちかい in the phonetic parenthetical is an annotation with no door, extra ruby or menu, that 拓's partial
 *       reading ひら (切り拓（ひら）く) is one too, and that a parenthetical reading no word before it (要因（ボトルネック）)
 *       keeps its doors.
 * Every engine run logs browser.version(). READING_TRUTH_ONLY=<case,…> runs only the named cases (a negative control's
 * scope); such a run is marked partial in the report and is never an acceptance result. READING_TRUTH_PAST_F0=1 lets a
 * negative control that moves a fixture (the 私/わたくし entry dropped) watch the browser too: the run still fails on F0
 * and is marked partial.
 * Negative control: the same run against a build with R's reading edits reverted fails A1 on 年 (とし). N2: with the te-form
 * rule reverted (no token marked) N2.te, R2.stem and AUX fail; with the kana いる rule reverted N2.alone fails. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { loadGuidedIndex, loadGuidedSet } from '../guided-session-content.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';

assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin an immutable built site and its digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
// a negative control's scope (READING_TRUTH_ONLY=r2,sweep,…): a partial run, never an acceptance result
const ONLY = (process.env.READING_TRUTH_ONLY || '').split(',').filter(Boolean);
const PAST_F0 = process.env.READING_TRUTH_PAST_F0 === '1';
const run = (name) => !ONLY.length || ONLY.includes(name);
const versions = {};
const json = (path) => JSON.parse(readFileSync(resolve(site, path), 'utf8'));
const k2h = (s) => String(s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

/* ------------------------------------------------------------------ fixtures */
const art = (id, file, search) => Object.freeze({ id, file: `data/articles/${file}`, search });
const STARTUP = art('kantei:jp-105-actions-202609-25startup', 'kantei-jp-105-actions-202609-25startup.json', 'スタートアップ大賞');
const MESSAGE = art('kantei:jp-105-discourse-20260923message', 'kantei-jp-105-discourse-20260923message.json', '観光・食文化交流');
const WIKINEWS = art('wikinews:45227', 'wikinews-45227.json', '21年の歴史');
const KOJIKI = art('bunki-essay-n2-kojiki-myth-history', 'bunki-essay-n2-kojiki-myth-history.json', '古事記');
const YAMANASHI = art('aozora:046605', 'aozora-046605.json', 'やまなし');
const DIARY = art('bunki-graded-n3-nakaima-diary', 'bunki-graded-n3-nakaima-diary.json', '中今');
const CABINET = art('jawiki:5294446', 'jawiki-5294446.json', '高市内閣');
const BOTTLENECK = art('env:press-press_05575', 'env-press-press_05575.json', 'ナッジ実証事業');
const KAWAGUCHI = art('aozora:049966-1', 'aozora-049966-1.json', 'チベット旅行記');
// a homograph read otherwise than the quick dictionary names its entry; its twin read like the quick dictionary is the core
const PAIRS = Object.freeze([
  { name: '年 ねん (令和8年: a counter)', at: STARTUP, index: 2, s: '年', r: 'ねん', seq: '2084840' },
  { name: '年 とし (twin)', at: MESSAGE, index: 39, s: '年', r: 'とし', core: true },
  { name: '月 がつ', at: WIKINEWS, index: 12, s: '月', r: 'がつ', seq: '2871532' },
  // R3 (Grok 0315): wikinews:45227 #107 was 7月 read つき, a tokenizer slip the lexicon now reads がつ; the twin is the
  // shelf's one real moon, やまなし #1087 (あんまり月が明るく)
  { name: '月 つき (twin)', at: YAMANASHI, index: 1087, s: '月', r: 'つき', core: true },
  { name: '時 じ', at: KOJIKI, index: 489, s: '時', r: 'じ', seq: '2020680' },
  { name: '時 とき (twin)', at: KOJIKI, index: 8, s: '時', r: 'とき', core: true },
  { name: '一日 ついたち', at: DIARY, index: 167, s: '一日', r: 'ついたち', seq: '2225040' },
]);
const STARTUP_WORD = { at: STARTUP, index: 17, s: 'スタートアップ', seq: '2303530', gloss: 'startup' };
// L · the cold first tap: 月 in 9月 reads がつ; the quick dictionary's 月 reads つき ("Moon")
const COLD = { at: STARTUP, index: 4, s: '月', r: 'がつ', seq: '2871532' };
const NAME = { at: STARTUP, index: 8, s: '高市' };
// N · a word no entry is read for: 訳 in シナ訳 reads やく; the served dictionaries' 訳 reads only わけ ("reason")
const UNREAD = { at: KAWAGUCHI, index: 548, s: '訳', r: 'やく' };
const NO_READING = 'No dictionary entry for this reading.';
const STABLE = { at: STARTUP, index: 9, s: '総理', r: 'そうり' };
const RECORDED = Object.freeze([
  { name: '式 in 表彰式 (sense)', at: STARTUP, index: 21, s: '式' },
  { name: '改造 in 第2次高市改造内閣 (sense)', at: CABINET, index: 5, s: '改造' },
  { name: 'ちかい in the phonetic parenthetical', at: CABINET, index: 11, s: 'ちかい' },
  { name: 'し of する (an inflected verb)', at: CABINET, index: 54, s: 'し' },
]);
const UNCONFIRMED = ['This entry’s answer cannot be confirmed yet, so it cannot be memorized.', 'この項目の答えをまだ確かめられないため、覚えられない。'];
const NO_ENTRY = 'No dictionary entry for this spelling.';
const SAVE_REASON = 'So it can’t be saved here.';
const QUICK_MISS = 'Not in the quick dictionary. Full entry looks it up in the whole dictionary.';
// R3 · a word the text uses as a name, or a reading it spells or talks about (悉曇（しったん）: しっ, た, ん), has no
// dictionary meaning: its card says so, in one line of its own
const NOT_A_WORD = ['a name in this text', 'a reading in this text'];
// R2 · inflected words: the card reads the dictionary form the way the text reads it (Kimi 0258, Codex 0309/0323)
const FORGETTING = art('bunki-read-n2-forgetting-curve', 'bunki-read-n2-forgetting-curve.json', '忘却曲線は');
const SOSEKI = art('aozora:000772-1', 'aozora-000772-1.json', '私の個人主義（抄）');
const SHOSOIN = art('bunki-read-n2-shosoin-names', 'bunki-read-n2-shosoin-names.json', '第78回正倉院展');
const BODHISENA = art('bunki-read-n2-bodhisena', 'bunki-read-n2-bodhisena.json', '大仏の目を開いた');
const BENZAITEN = art('bunki-read-n2-benzaiten', 'bunki-read-n2-benzaiten.json', '弁才天の長い旅');
const SOAI = art('bunki-read-n1-soai-nobel', 'bunki-read-n1-soai-nobel.json', '硤合憲三');
const HONDA = art('bunki-read-n3-honda-quarter', 'bunki-read-n3-honda-quarter.json', '本多静六');
// seq: the entry the card must stand for (its first gloss is the meaning shown); core: the quick dictionary's word;
// legacy: the original word layer's row the old card borrowed its reading from (so the check can fail for its reason)
const INFLECTED = Object.freeze([
  { name: 'おい → おく · 置く', at: FORGETTING, index: 297, s: 'おい', b: 'おく', r: 'おい', label: 'おく', reading: 'おく', seq: '1421850', legacy: 'おけ', not: ['1179320', '1182620'] },
  { name: '云っ → 云う いう', at: SOSEKI, index: 576, s: '云っ', b: '云う', r: 'いっ', label: '云う', reading: 'いう', seq: '1587040', legacy: 'いい' },
  { name: '解せ → 解す げす', at: SOSEKI, index: 1414, s: '解せ', b: '解する', r: 'げせ', label: '解す', reading: 'げす', seq: '2410330', legacy: 'かいする' },
  { name: '来 read き → 来る くる', at: SHOSOIN, index: 483, s: '来', b: '来る', r: 'き', label: '来る', reading: 'くる', core: true, never: 'きる' },
  { name: '来 read こ → 来る くる', at: SOSEKI, index: 66, s: '来', b: '来る', r: 'こ', label: '来る', reading: 'くる', core: true, never: 'こる' },
]);
// R2 · a verb whose kana dictionary form the quick dictionary has only as a noun (Codex 1352): the card is the verb's
// dictionary form read so, its entry the verb chosen among those read so — never the noun, never the surface's reading
const GONGITSUNE = art('aozora:000628', 'aozora-000628.json', 'ごん狐');
const MHLW = art('mhlw:stf-newpage_76126', 'mhlw-stf-newpage_76126.json', '高年齢者活躍企業コンテスト');
const UNFIT = Object.freeze([
  { name: 'かえり → かえる · 帰る (not 蛙)', at: GONGITSUNE, index: 2117, s: 'かえり', b: 'かえる', r: 'かえり', reading: 'かえる', seq: '1221270', noun: '蛙' },
  { name: 'かえっ → かえる · 帰る (not 蛙)', at: GONGITSUNE, index: 2627, s: 'かえっ', b: 'かえる', r: 'かえっ', reading: 'かえる', seq: '1221270', noun: '蛙' },
  { name: 'なさ → なす · 為す (not 茄子)', at: MHLW, index: 176, s: 'なさ', b: 'なす', r: 'なさ', reading: 'なす', seq: '2861111', noun: '茄子' },
]);
// R2 · a godan verb never stands as its bare stem: the い of ている and of いました is the ichidan 居る's (entry 1577980,
// written いる), never the quick dictionary's godan いる (要る, "to be needed"): 296 occurrences on the shelf
// N2 (Grok 0036): the first stands right after the te-form (済んで い ます), so its card shows 居る's senses for the
// te-form (te), no longer its first gloss; the second (狐が い ました) is the verb of being, its first gloss as before
const STEM = Object.freeze([
  { name: 'い (ている) → いる · 居る (not 要る)', at: FORGETTING, index: 431, s: 'い', b: 'いる', r: 'い', reading: 'いる', seq: '1577980', never: 'to be needed',
    te: ['to be ...-ing', 'to have ...-ed'] },
  { name: 'い (いました) → いる · 居る (not 要る)', at: GONGITSUNE, index: 83, s: 'い', b: 'いる', r: 'い', reading: 'いる', seq: '1577980', never: 'to be needed' },
]);
// N2 (Grok 0036; the lead, 2026-10-18) · a verb the text writes in kana right after the te-form is its auxiliary use: the
// card is the entry JMdict lists for that use (a sense of part of speech aux-v, or an expression, noted as following the
// te-form) read as the verb's dictionary form, or, with none, as the text writes it (ください → 下さい); its lines are those
// senses' first glosses in JMdict's order (lines), never the homograph's (never)
const TSUNAMI = art('aozora:004668-1', 'aozora-004668-1.json', '津浪と人間');
const CHIP = art('bunki-read-n2-japan-us-chip-fab', 'bunki-read-n2-japan-us-chip-fab.json', '半導体工場');
const NOBARA = art('aozora:051034', 'aozora-051034.json', '野ばら');
const AI_ESSAY = art('bunki-essay-n1-ai', 'bunki-essay-n1-ai.json', 'AI時代の知識');
const CITY = art('bunki-essay-n1-city', 'bunki-essay-n1-city.json', '都市の匿名性');
const TE = Object.freeze([
  { name: 'いる (残っている, Grok 0036)', at: TSUNAMI, index: 103, s: 'いる', b: 'いる', r: 'いる', form: 'いる', seq: '1577980',
    lines: ['to be ...-ing', 'to have ...-ed'], never: 'to be needed', entry: true },
  { name: 'いる (予定している, Grok 0036)', at: CHIP, index: 210, s: 'いる', b: 'いる', r: 'いる', form: 'いる', seq: '1577980',
    lines: ['to be ...-ing', 'to have ...-ed'], never: 'to be needed', entry: true },
  { name: 'い (なっていた)', at: CHIP, index: 604, s: 'い', b: 'いる', r: 'い', form: 'いる', seq: '1577980', lines: ['to be ...-ing', 'to have ...-ed'], never: 'to be needed' },
  { name: 'おく (暗記しておく)', at: AI_ESSAY, index: 58, s: 'おく', b: 'おく', r: 'おく', form: 'おく', seq: '1421850',
    lines: ['to do something in advance', 'to leave something in a certain state'], never: 'inner part' },
  { name: 'くる (廻り合せてくる)', at: TSUNAMI, index: 1155, s: 'くる', b: 'くる', r: 'くる', form: 'くる', seq: '1547720', lines: ['to come back', 'to come to be'], never: 'to reel' },
  { name: 'ください (いてください)', at: NOBARA, index: 854, s: 'ください', b: 'くださる', r: 'ください', form: 'ください', seq: '1184270', lines: ['please (do for me)'], never: 'to give' },
]);
// N2 · a kana いる outside the te-form is 居る (the entry headed いる): its first gloss, never 要る's "to be needed"; 要る stays
// one tap away, among the full entry's entries of the form
const IRU_ALONE = Object.freeze({ name: 'いる (ここにいる)', at: CITY, index: 95, s: 'いる', b: 'いる', r: 'いる', seq: '1577980', other: '1546640', never: 'to be needed' });
// R2.V · a sound change in a compound: the card shows the text's reading and the meaning of the entry read the plain way
const SOUND = Object.freeze([
  { name: '一 いっ (一本)', at: BODHISENA, index: 564, s: '一', r: 'いっ', plain: 'いち' },
  // R3 (Grok 0315): after a number 本 is the counter — the card shows the counter's sense of 本 read ほん, never "book"
  { name: '本 ぽん (一本)', at: BODHISENA, index: 565, s: '本', r: 'ぽん', plain: 'ほん', counter: true },
  { name: '八 はっ (八本)', at: BENZAITEN, index: 410, s: '八', r: 'はっ', plain: 'はち' },
  { name: '歩 ぽ (一歩)', at: SOAI, index: 527, s: '歩', r: 'ぽ', plain: 'ほ' },
  { name: '金持ち がねもち', at: HONDA, index: 385, s: '金持ち', r: 'がねもち', plain: 'かねもち' },
]);
// R2.K · a lone kanji read by its on'yomi with no word entry read so: the kanji's card
const LONE = Object.freeze([
  { name: '寺 じ', at: BODHISENA, index: 341, s: '寺', r: 'じ' },
  { name: '国 こく', at: SHOSOIN, index: 329, s: '国', r: 'こく' },
  { name: '仏 ぶつ (never ふつ, France)', at: KAWAGUCHI, index: 1359, s: '仏', r: 'ぶつ' },
]);
// R2.C3 · 私 read わたくし, an entry the pinned JMdict has and the build now ships (the article entries)
const WATAKUSHI = { at: SOSEKI, index: 0, s: '私', r: 'わたくし', seq: '2842390' };
// R2 · what is left after the addendum's classes 1–3 keeps N's honest line: no entry the served dictionaries hold reads
// these spellings this way, none is a sound change, none a lone kanji's on'yomi (the lead, 2026-10-17)
const ZAZEN = art('bunki-read-n1-zazen-brainwaves', 'bunki-read-n1-zazen-brainwaves.json', '坐禅');
const REMAINING = Object.freeze([
  { name: '行 ゆき', at: KAWAGUCHI, index: 1261, s: '行', r: 'ゆき' }, { name: '行 ゆき (2)', at: KAWAGUCHI, index: 1337, s: '行', r: 'ゆき' },
  { name: '足 たし', at: SOSEKI, index: 401, s: '足', r: 'たし' }, { name: '他 ひと', at: SOSEKI, index: 705, s: '他', r: 'ひと' },
  { name: '行う おこのう', at: KAWAGUCHI, index: 1432, s: '行う', r: 'おこのう' }, { name: '源 みなもとの', at: BENZAITEN, index: 70, s: '源', r: 'みなもとの' },
  { name: '章 あきら', at: ZAZEN, index: 115, s: '章', r: 'あきら' },
]);

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

/* ------------------------------------------------------------------ F0: the served fixtures */
const core = json('data/share_alike/dict.json').words;
const entries = json('data/share_alike/dict-v2/index.json').entries;
const bySeq = new Map(entries.map((row) => [String(row[0]), row]));
const firstGloss = (seq, reading) => {
  const row = bySeq.get(seq);
  const k = row?.[5]?.findIndex((kana) => k2h(kana) === k2h(reading)) ?? -1;
  return row && k >= 0 ? row[3] : null;
};
const tokenAt = (fixture) => json(fixture.at.file).tokens?.[fixture.index] || null;
for (const pair of PAIRS) {
  const token = tokenAt(pair);
  check(`F0.${pair.name}`, `${pair.at.id} #${pair.index} is ${pair.s} read ${pair.r}, uninflected, a content word`,
    token?.s === pair.s && token.b === pair.s && token.r === pair.r && token.c === true, token);
  if (pair.core) check(`F0.core.${pair.name}`, `the quick dictionary reads ${pair.s} ${pair.r}`, k2h(core[pair.s]?.r) === k2h(pair.r), core[pair.s]);
  else {
    check(`F0.core.${pair.name}`, `the quick dictionary reads ${pair.s} otherwise than ${pair.r}`, !!core[pair.s] && k2h(core[pair.s].r) !== k2h(pair.r), core[pair.s]);
    check(`F0.index.${pair.name}`, `the full dictionary's entry ${pair.seq} writes ${pair.s} and reads ${pair.r}`,
      bySeq.get(pair.seq)?.[4]?.includes(pair.s) && bySeq.get(pair.seq)[5].some((kana) => k2h(kana) === k2h(pair.r)), bySeq.get(pair.seq)?.slice(0, 6));
  }
}
check('F0.startup', `${STARTUP.id} #17 is スタートアップ; the quick dictionary lacks it; entry 2303530 is its one entry`,
  tokenAt(STARTUP_WORD)?.s === 'スタートアップ' && !core['スタートアップ'] && bySeq.get('2303530')?.[5]?.includes('スタートアップ')
    && entries.filter((row) => row[1] === 'スタートアップ' || row[4].includes('スタートアップ') || row[5].includes('スタートアップ')).length === 1,
  tokenAt(STARTUP_WORD));
check('F0.name', `${STARTUP.id} #8 is 高市, a name no dictionary lists`, tokenAt(NAME)?.s === '高市' && tokenAt(NAME).c === false && !core['高市']
  && !entries.some((row) => row[1] === '高市' || row[4].includes('高市') || row[5].includes('高市')), tokenAt(NAME));
check('F0.cold', `${STARTUP.id} #4 is 月 read がつ, uninflected; the quick dictionary reads it つき; entry ${COLD.seq} reads がつ`,
  tokenAt(COLD)?.s === '月' && tokenAt(COLD).b === '月' && tokenAt(COLD).r === 'がつ' && core['月']?.r === 'つき' && k2h(core['月'].r) !== 'がつ'
    && bySeq.get(COLD.seq)?.[5]?.some((kana) => k2h(kana) === 'がつ'), { token: tokenAt(COLD), core: core['月'] });
check('F0.unread', `${KAWAGUCHI.id} #548 is 訳 read やく, uninflected, a content word; the quick dictionary reads 訳 わけ; no entry the full dictionary serves writes 訳 and reads やく`,
  tokenAt(UNREAD)?.s === '訳' && tokenAt(UNREAD).b === '訳' && tokenAt(UNREAD).r === 'やく' && tokenAt(UNREAD).c === true && k2h(core['訳']?.r) === 'わけ'
    && entries.some((row) => row[4].includes('訳')) && !entries.some((row) => row[4].includes('訳') && row[5].some((kana) => k2h(kana) === 'やく')),
  { token: tokenAt(UNREAD), core: core['訳'], rows: entries.filter((row) => row[4].includes('訳') && row[1] === '訳').map((row) => row.slice(0, 4)) });
check('F0.stable', `${STARTUP.id} #9 is 総理 read そうり, like the quick dictionary`, tokenAt(STABLE)?.r === 'そうり' && core['総理']?.r === 'そうり', tokenAt(STABLE));
for (const fixture of RECORDED) check(`F0.${fixture.name}`, `${fixture.at.id} #${fixture.index} is ${fixture.s}`, tokenAt(fixture)?.s === fixture.s, tokenAt(fixture));
check('F0.no-sense', 'reader tokens carry no sense, gloss or entry number (s b p r f c, and rs)',
  [STARTUP, CABINET].every((a) => json(a.file).tokens.every((t) => Object.keys(t).every((key) => ['s', 'b', 'p', 'r', 'f', 'c', 'rs'].includes(key)))));
/* ------------------------------------------------------------------ F0 · R2's served fixtures */
const kanjiData = json('data/share_alike/kanji.json').kanji;
const legacyWords = json('data/share_alike/words.json').words;
const byForm = new Map();
for (const row of entries) {
  for (const form of new Set([row[1], ...row[4], ...row[5]])) {
    if (!byForm.has(form)) byForm.set(form, []);
    byForm.get(form).push(row);
  }
}
// the served index's own reading restriction (cell 11: 0 every written form, 1 none, an array the permitted ones)
const permits = (row, k, form) => row[5][k] === form ||
  (row[4].includes(form) && (row[11][k] === 0 || (Array.isArray(row[11][k]) && row[11][k].includes(row[4].indexOf(form)))));
const readAs = (form, reading) => (byForm.get(form) || []).filter((row) => row[5].some((kana, k) => k2h(kana) === k2h(reading) && permits(row, k, form)));
const listedReadings = (form) => [...new Set([core[form]?.r, ...(byForm.get(form) || []).flatMap((row) =>
  row[5].filter((kana, k) => permits(row, k, form)))].filter(Boolean).map(k2h))];
// the served detail shards' parts of speech, by entry
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
const posOf = (seq) => {
  const detail = detailOf(seq);
  return detail ? [...new Set(detail[3].flatMap((sense) => sense[0] || []))] : [];
};
// N2 · the senses the served detail shard lists for an entry's use after the te-form: part of speech aux-v (or an
// expression), with a note that it follows the te-form ("after the -te form of a verb", "after the ～て form",
// 'follows a verb in "-te" form', "after te-form"), in JMdict's order; the lines a card shows are their first glosses
const TE_NOTE = /-te form|"-te" form|te-form|[～〜]て/iu;
const teSensesOf = (seq) => (detailOf(seq)?.[3] || []).filter((sense) => (sense[0] || []).some((pos) => pos === 'aux-v' || pos === 'exp')
  && (sense[8] || []).some((note) => TE_NOTE.test(String(note))));
const teLinesOf = (seq) => teSensesOf(seq).map((sense) => String(sense[10]?.[0]?.[0] || ''));
const teEntries = (form, reading) => readAs(form, reading).filter((row) => teSensesOf(String(row[0])).length);
// a token right after the te-form: the particle て or で, after a verb or an auxiliary verb
const afterTeForm = (tokens, index) => index >= 2 && tokens[index - 1]?.p === '助詞' && ['て', 'で'].includes(tokens[index - 1].s)
  && ['動詞', '助動詞'].includes(tokens[index - 2]?.p);
const onyomi = (char) => (kanjiData[char]?.on || []).map(k2h);
const soundUndoneF0 = (reading) => {
  const voiced = 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ', plain = 'かきくけこさしすせそたちつてとはひふへほはひふへほ', r = k2h(reading);
  const flat = (x) => (voiced.includes(x[0]) ? plain[voiced.indexOf(x[0])] + x.slice(1) : '');
  return [flat(r), ...(r.endsWith('っ') ? [...'ちつくきう'].flatMap((end) => [r.slice(0, -1) + end, flat(r.slice(0, -1) + end)]) : [])].filter(Boolean);
};
for (const fixture of INFLECTED) {
  const token = tokenAt(fixture);
  check(`F0.R2.${fixture.name}`, `${fixture.at.id} #${fixture.index} is ${fixture.s} (base ${fixture.b}) read ${fixture.r}, inflected`,
    token?.s === fixture.s && token.b === fixture.b && token.r === fixture.r && token.s !== token.b, token);
  if (fixture.core) {
    check(`F0.R2.core.${fixture.name}`, `the quick dictionary reads ${fixture.label} ${fixture.reading}; no entry writes it read ${fixture.never}`,
      k2h(core[fixture.label]?.r) === k2h(fixture.reading) && !readAs(fixture.label, fixture.never).length, core[fixture.label]);
  } else {
    check(`F0.R2.entry.${fixture.name}`, `the quick dictionary lacks ${fixture.b}; the original word layer reads it ${fixture.legacy} (what the old card showed); entry ${fixture.seq} writes ${fixture.label} and reads it ${fixture.reading}`,
      !core[fixture.b] && legacyWords[fixture.b]?.r === fixture.legacy && readAs(fixture.label, fixture.reading).some((row) => String(row[0]) === fixture.seq)
        && (fixture.not || []).every((seq) => readAs(fixture.label, fixture.reading).some((row) => String(row[0]) === seq)),
      { legacy: legacyWords[fixture.b], rows: readAs(fixture.label, fixture.reading).map((row) => row.slice(0, 4)) });
  }
}
for (const fixture of UNFIT) {
  const token = tokenAt(fixture);
  check(`F0.R2.unfit.${fixture.name}`, `${fixture.at.id} #${fixture.index} is ${fixture.s} (base ${fixture.b}, a verb) read ${fixture.r}; the quick dictionary has ${fixture.b} only as the noun ${fixture.noun}; entry ${fixture.seq} is a verb that writes and reads ${fixture.b}`,
    token?.s === fixture.s && token.b === fixture.b && token.r === fixture.r && token.p === '動詞' && k2h(core[fixture.b]?.r) === k2h(fixture.reading)
      && !/verb/u.test(String(core[fixture.b]?.p || '')) && readAs(fixture.b, fixture.reading).some((row) => String(row[0]) === fixture.seq && row[6].some((g) => /^to /u.test(g)))
      && posOf(fixture.seq).some((code) => /^v/u.test(code)), { token, core: core[fixture.b], pos: posOf(fixture.seq) });
}
for (const fixture of STEM) {
  const token = tokenAt(fixture), parts = String(core[fixture.b]?.p || '').split(' · ');
  check(`F0.R2.stem.${fixture.name}`, `${fixture.at.id} #${fixture.index} is ${fixture.s} (base ${fixture.b}, a verb) read ${fixture.r}, its bare stem; the quick dictionary's ${fixture.b} is a godan verb, "${fixture.never}"; entry ${fixture.seq} is headed and read ${fixture.b}, an ichidan verb`,
    token?.s === fixture.s && token.b === fixture.b && token.r === fixture.r && token.p === '動詞' && k2h(fixture.reading).slice(0, -1) === k2h(fixture.r)
      && k2h(core[fixture.b]?.r) === k2h(fixture.reading) && parts.includes('godan verb') && !parts.includes('ichidan verb') && core[fixture.b].m[0] === fixture.never
      && readAs(fixture.b, fixture.reading).some((row) => String(row[0]) === fixture.seq && row[1] === fixture.b) && posOf(fixture.seq).includes('v1'),
    { token, core: core[fixture.b], pos: posOf(fixture.seq) });
  const tokens = json(fixture.at.file).tokens || [];
  if (fixture.te) {
    check(`F0.N2.stem.${fixture.name}`, `#${fixture.index} stands right after the te-form (${tokens[fixture.index - 2]?.s}${tokens[fixture.index - 1]?.s}); entry ${fixture.seq}'s senses for the te-form begin ${JSON.stringify(fixture.te)}`,
      afterTeForm(tokens, fixture.index) && JSON.stringify(teLinesOf(fixture.seq).slice(0, 2)) === JSON.stringify(fixture.te), teLinesOf(fixture.seq));
  } else {
    check(`F0.N2.stem.${fixture.name}`, `#${fixture.index} does not stand after the te-form: the verb of being, its first gloss`, !afterTeForm(tokens, fixture.index),
      tokens.slice(fixture.index - 2, fixture.index + 1).map((t) => t.s));
  }
}
for (const fixture of TE) {
  const tokens = json(fixture.at.file).tokens || [], token = tokens[fixture.index];
  const others = readAs(fixture.form, fixture.form).filter((row) => String(row[0]) !== fixture.seq);
  check(`F0.N2.te.${fixture.name}`, `${fixture.at.id} #${fixture.index} is ${fixture.s} (base ${fixture.b}, a verb in kana) read ${fixture.r}, right after the te-form; of the entries read ${fixture.form}, only ${fixture.seq} has senses for the te-form, and their first glosses are ${JSON.stringify(fixture.lines)}, no other entry's gloss; "${fixture.never}" is what the homograph says`,
    token?.s === fixture.s && token.b === fixture.b && token.r === fixture.r && token.p === '動詞' && /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(token.s)
      && afterTeForm(tokens, fixture.index)
      && JSON.stringify(teEntries(fixture.form, fixture.form).map((row) => String(row[0]))) === JSON.stringify([fixture.seq])
      && (fixture.form === fixture.b || !teEntries(fixture.b, fixture.b).length)
      && JSON.stringify(teLinesOf(fixture.seq).slice(0, 2)) === JSON.stringify(fixture.lines)
      && !others.some((row) => fixture.lines.some((line) => row[6].includes(line)))
      && (core[fixture.b]?.m?.[0] === fixture.never || others.some((row) => row[3] === fixture.never)),
    { token, before: tokens.slice(fixture.index - 2, fixture.index).map((t) => `${t.s}/${t.p}`), te: teEntries(fixture.form, fixture.form).map((row) => String(row[0])),
      lines: teLinesOf(fixture.seq), core: core[fixture.b]?.m?.[0] });
}
{
  const fixture = IRU_ALONE, tokens = json(fixture.at.file).tokens || [], token = tokens[fixture.index];
  check(`F0.N2.alone.${fixture.name}`, `${fixture.at.id} #${fixture.index} is いる (a verb in kana, uninflected), not after the te-form; the quick dictionary's いる is 要る, "${fixture.never}"; entries ${fixture.seq} (headed いる) and ${fixture.other} (要る) both read いる`,
    token?.s === 'いる' && token.b === 'いる' && token.r === 'いる' && token.p === '動詞' && !afterTeForm(tokens, fixture.index)
      && core['いる']?.m?.[0] === fixture.never && core['いる'].alt === '要る'
      && readAs('いる', 'いる').some((row) => String(row[0]) === fixture.seq && row[1] === 'いる') && readAs('いる', 'いる').some((row) => String(row[0]) === fixture.other),
    { token, before: tokens.slice(fixture.index - 2, fixture.index).map((t) => t.s), core: core['いる'] });
}
for (const fixture of SOUND) {
  const token = tokenAt(fixture);
  check(`F0.R2.V.${fixture.name}`, `${fixture.at.id} #${fixture.index} is ${fixture.s} read ${fixture.r}, uninflected; no entry reads it so; the quick dictionary or one entry reads it ${fixture.plain}`,
    token?.s === fixture.s && token.b === fixture.s && token.r === fixture.r && !readAs(fixture.s, fixture.r).length
      && (k2h(core[fixture.s]?.r) === k2h(fixture.plain) || readAs(fixture.s, fixture.plain).length === 1), { token, core: core[fixture.s] });
}
for (const fixture of LONE) {
  const token = tokenAt(fixture);
  check(`F0.R2.K.${fixture.name}`, `${fixture.at.id} #${fixture.index} is ${fixture.s} read ${fixture.r}, uninflected; no entry reads it so; ${fixture.r} is one of its on'yomi in the kanji data`,
    token?.s === fixture.s && token.b === fixture.s && token.r === fixture.r && !readAs(fixture.s, fixture.r).length && onyomi(fixture.s).includes(k2h(fixture.r)),
    { token, on: kanjiData[fixture.s]?.on, core: core[fixture.s] });
}
for (const fixture of REMAINING) {
  const token = tokenAt(fixture);
  check(`F0.R2.remaining.${fixture.name}`, `${fixture.at.id} #${fixture.index} is ${fixture.s} read ${fixture.r}; the served dictionaries list the spelling, no entry reads it so (nor a sound change of it), and it is no lone kanji's on'yomi`,
    token?.s === fixture.s && token.b === fixture.s && token.r === fixture.r && (byForm.get(fixture.s) || []).length > 0
      && ![fixture.r, ...soundUndoneF0(fixture.r)].some((reading) => readAs(fixture.s, reading).length || k2h(core[fixture.s]?.r) === k2h(reading))
      && !([...fixture.s].length === 1 && [fixture.r, ...soundUndoneF0(fixture.r)].some((reading) => onyomi(fixture.s).includes(k2h(reading)))),
    { token, core: core[fixture.s], on: kanjiData[fixture.s]?.on });
}
check('F0.R2.K.france', 'the quick dictionary reads 仏 ふつ, "France" — the word a voicing change would wrongly lend ぶつ', core['仏']?.r === 'ふつ' && core['仏'].m[0] === 'France', core['仏']);
check('F0.R2.C3', `${WATAKUSHI.at.id} #${WATAKUSHI.index} is 私 read わたくし; the quick dictionary reads 私 わたし; entry ${WATAKUSHI.seq} writes 私 and reads it わたくし`,
  tokenAt(WATAKUSHI)?.s === '私' && tokenAt(WATAKUSHI).r === 'わたくし' && core['私']?.r === 'わたし'
    && readAs('私', 'わたくし').some((row) => String(row[0]) === WATAKUSHI.seq), readAs('私', 'わたくし').map((row) => row.slice(0, 4)));
const guidedJson = async (path) => json(path);
const guided = await loadGuidedSet((await loadGuidedIndex(guidedJson))[0], guidedJson);
check('F0.guided', 'every guided word reads as the quick dictionary reads it (so its card can only agree)',
  Object.values(guided.words).every((word) => !core[word.surface] || k2h(core[word.surface].r) === k2h(word.reading)),
  Object.values(guided.words).filter((word) => core[word.surface] && k2h(core[word.surface].r) !== k2h(word.reading)).map((w) => w.surface));
const F0_OK = rows.every((row) => row.recorded || row.ok);

/* ------------------------------------------------------------------ the browser */
const host = await startStaticHost({ site, port: 0 });
async function boot(page, query = '?entry=shelf&ui=bi') {
  // The demo has its own fresh-record gate; reading-truth measures deliberate lookup.
  await page.addInitScript(() => localStorage.setItem('kairo-word-ladder-demo-v1', '1'));
  await page.goto(`${host.origin}/index.html${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
}
async function openArticle(page, at) {
  await boot(page);
  const direct = page.locator(`[data-passage="${at.id}"]:not([data-recommendation]) .shelf-open`).first();
  if (await direct.count()) await direct.click();
  else {
    await openShelfTools(page);
    await page.locator('#shelf-reading-search').fill(at.search);
    await page.locator('#shelf-reading-search').press('Enter');
    await page.locator(`#shelf-reading-results [data-passage="${at.id}"] .shelf-open`).first().click();
  }
  await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 20000 });
}
const tok = (page, index) => page.locator(`#reader .tok[data-index="${index}"]`).first();
/** A real tap on the element itself: Playwright scrolls it in, finds a point the element owns, and taps there. */
async function tapAt(page, locator) {
  await locator.tap({ timeout: 15000 });
}
async function tapExactPrintedReaderGlyph(page, locator, { index, surface, annotation = null }) {
  // Scroll setup only. Mobile WebKit does not implement mouse.wheel.
  await locator.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const evidence = await locator.evaluate(node => {
    const glyphs = [], text = [];
    const walker = document.createTreeWalker(node.querySelector('.tok-word') || node, NodeFilter.SHOW_TEXT, {
      acceptNode: t => t.parentElement.closest('rt,.tok-en,.tok-state') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    while (walker.nextNode()) {
      const t = walker.currentNode; let offset = 0;
      for (const char of t.textContent) {
        const range = document.createRange(); range.setStart(t, offset); offset += char.length; range.setEnd(t, offset);
        text.push(char); if (/\s/u.test(char)) continue;
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
          const owner = document.elementFromPoint(x, y);
          glyphs.push({ char, x, y, visible: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight,
            owns: !!owner && node.contains(owner), ownerIndex: owner?.closest('#reader .tok')?.dataset.index ?? null });
        }
      }
    }
    return { index: node.dataset.index, surface: text.join(''), annotation: node.dataset.readerAnnotation ?? null, glyphs };
  });
  assert.equal(evidence.index, String(index)); assert.equal(evidence.surface, surface);
  assert.equal(evidence.annotation, annotation, 'DOM annotation classification disagrees with independently proved source eligibility');
  assert(evidence.glyphs.length && evidence.glyphs.every(g => g.visible && g.owns && g.ownerIndex === String(index)),
    'Every printed glyph must be in view and owned by this exact occurrence; never rescue another point');
  await page.evaluate(() => {
    window.__readingTruthGlyphWitness = null;
    document.addEventListener('click', event => {
      window.__readingTruthGlyphWitness = { index: event.target.closest?.('#reader .tok')?.dataset.index ?? null,
        trusted: event.isTrusted, pointerType: event.pointerType ?? null };
    }, { capture: true, once: true });
  });
  const point = evidence.glyphs[0]; await page.touchscreen.tap(point.x, point.y);
  await page.waitForFunction(() => window.__readingTruthGlyphWitness !== null, null, { timeout: 1000 });
  const witness = await page.evaluate(() => window.__readingTruthGlyphWitness);
  assert(witness.trusted && witness.index === String(index), 'Native touch must activate the exact requested occurrence');
  return { ...evidence, witness };
}

async function closeMini(page) {
  for (let attempt = 0; attempt < 3 && await page.locator('#mini').count(); attempt++) {
    await page.locator('#mini').press('Escape').catch(() => {});
    await delay(200);
  }
}
const miniState = (page) => page.evaluate(() => {
  const mini = document.getElementById('mini');
  if (!mini) return null;
  const take = mini.querySelector('#mini-take');
  return { kind: mini.dataset.kind ?? null, word: mini.querySelector('.mini-word')?.childNodes[0]?.textContent ?? null, reading: mini.querySelector('.mini-reading')?.textContent ?? '',
    gloss: mini.querySelector('.mini-gloss')?.textContent ?? '', take: take ? { disabled: take.disabled, text: take.textContent.trim() } : null,
    reason: mini.querySelector('#mini-take-reason')?.textContent ?? null };
});
/** Reach the stage without waiting for dictionary settlement (cold-index gates hold that promise). */
async function activateStage(page, locator, activate = () => tapAt(page, locator)) {
  await activate();
  // Advance only an observed reading rung; no blind second tap can rescue a dead door.
  await page.waitForFunction((node) => !!document.getElementById('mini') || node.dataset.ladderRung === 'reading',
    await locator.elementHandle(), { timeout: 20000 });
  if (!await page.locator('#mini').count()) await activate();
  await page.locator('#mini').waitFor({ timeout: 20000 });
}
/** The slip as it first paints, and as it settles: a slip drawn before the full dictionary answered is aria-busy
 * until the answer redraws it (or the answer changes nothing). */
async function slip(page, locator, { keyboard = false, sweepTarget = null } = {}) {
  await closeMini(page);
  const activate = async () => {
    if (keyboard) {
      const rover = await locator.evaluate((node) => {
        const block = node.closest('[data-prose-roving]');
        const native = node.matches('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary');
        if (!block) return { index: -1, native };
        const selector = block.hasAttribute('data-reader-prose') ? '.tok[data-para]'
          : node.matches('.sentence-tok') ? '.sentence-tok'
            : node.matches('.kp-tok') ? '.kp-tok'
              : block.querySelector('.gs-word') ? '.japanese-lookup-word,.gs-word' : '.japanese-lookup-word';
        return { index: [...block.querySelectorAll(selector)].filter((word) => word.closest('[data-prose-roving]') === block).indexOf(node), native };
      });
      if (rover.index >= 0) {
        await locator.locator('xpath=ancestor::*[@data-prose-roving][1]').focus();
        await page.keyboard.press('Home');
        for (let n = 0; n < rover.index; n++) await page.keyboard.press('ArrowRight');
      } else {
        assert(rover.native, 'a keyboard target outside its selector-specific rover must be a native focusable control');
        await locator.focus();
      }
      assert(await locator.evaluate((node) => document.activeElement === node), 'keyboard activation must target the requested occurrence');
      await page.keyboard.press('Enter');
    } else if (sweepTarget) sweepTarget.taps.push(await tapExactPrintedReaderGlyph(page, locator, sweepTarget));
    else await tapAt(page, locator);
  };
  await activateStage(page, locator, activate);
  if (sweepTarget) {
    assert.equal(await locator.getAttribute('data-index'), String(sweepTarget.index));
    assert.equal(await locator.getAttribute('data-ladder-rung'), 'stage', 'The exact sweep occurrence must own the stage');
  }
  const first = await miniState(page);
  await page.waitForFunction(() => document.getElementById('mini')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 });
  await delay(100);
  return { first, settled: (await miniState(page)) || first };
}
/** Wait until a region's markup has held still for `quiet` ms (an entry sheet refreshes as its data arrive). */
async function stillFor(page, selector, quiet = 800, timeout = 15000) {
  let last = null, since = Date.now();
  for (const deadline = Date.now() + timeout; Date.now() < deadline; await delay(150)) {
    const now = await page.evaluate((s) => document.querySelector(s)?.innerHTML ?? null, selector);
    if (now !== last) { last = now; since = Date.now(); } else if (Date.now() - since >= quiet) return;
  }
}
const sheetState = (page) => page.evaluate(() => ({
  reading: document.querySelector('#sheet .reading')?.textContent ?? null,
  active: [...document.querySelectorAll('#sheet .dictionary-homograph.active')].map((row) => row.dataset.dictionaryEntry),
}));

async function readerCases(page) {
  for (const pair of PAIRS) {
    await openArticle(page, pair.at);
    const { first, settled } = await slip(page, tok(page, pair.index));
    const expected = pair.core ? { reading: core[pair.s].r, gloss: core[pair.s].m[0] } : { reading: pair.r, gloss: firstGloss(pair.seq, pair.r) };
    check(`A1.${pair.name}`, `the card for ${pair.s} in ${pair.at.id} reads ${pair.r} and means "${expected.gloss}"`,
      settled?.word === pair.s && k2h(settled.reading) === k2h(pair.r) && k2h(settled.reading) === k2h(expected.reading)
        && settled.gloss === expected.gloss && settled.take && !settled.take.disabled, { first, settled });
    if (pair === PAIRS[0]) {
      record('R.first-paint', 'the first paint of 年 (the full dictionary may still be opening)', first);
      // A2 · the second tap opens the entry the card stood for
      await tapAt(page, tok(page, pair.index));
      await page.locator('#sheet').waitFor({ timeout: 20000 });
      let entry = await sheetState(page);
      for (const deadline = Date.now() + 15000; Date.now() < deadline && !(entry.reading === pair.r && entry.active.includes(pair.seq)); await delay(200))
        entry = await sheetState(page);
      check('A2.entry', `the second tap opens entry ${pair.seq}, read ${pair.r}`, entry.reading === pair.r && entry.active.includes(pair.seq), entry);
      await page.keyboard.press('Escape');
      await delay(300);
    }
  }
}

async function captureCase(browser, contextOptions) {
  const context = await browser.newContext(contextOptions);
  await silenceBrowserAudio(context);
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
  const page = await context.newPage();
  // L · Save unfolds its menu inside the card: the path WebKit used to raise its ResizeObserver page error on
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let exported = null;
  try {
    await openArticle(page, STARTUP);
    const { settled } = await slip(page, tok(page, 2));
    check('A3.ready', 'the card for 年 in 令和8年 offers Save', settled?.reading === 'ねん' && settled.take && !settled.take.disabled, settled);
    await page.locator('#mini #mini-take').click();
    const saved = await waitForAppRecord(page, (rec) => (rec.taken || []).some((row) => row.t === 'word' && row.id === '年'),
      { description: 'the 年 card', timeout: 15000 });
    const row = saved.taken.find((r) => r.t === 'word' && r.id === '年'), snap = saved.deepWords?.['年'];
    check('A3.capture', 'Save keeps entry 2084840 and the reading shown (cueReading ねん), with its validated selection',
      row?.entrySeq === '2084840' && row.cueReading === 'ねん' && snap?.seq === '2084840' && snap.r === 'ねん' && snap.selection?.r === 'ねん'
        && snap.selection?.seq === '2084840', { row, snap });
    await page.keyboard.press('Escape');
    await closeMini(page);
    if (run('r2')) {
      // R2 · an inflected word saves its dictionary form's entry and reading, in the same row shape as 年's (no new shape)
      await openArticle(page, SOSEKI);
      const iu = await slip(page, tok(page, 576));
      check('R2.capture.ready', 'the card for 云っ (いっ) is 云う read いう and offers Save', iu.settled?.word === '云う' && k2h(iu.settled.reading) === 'いう'
        && iu.settled.take && !iu.settled.take.disabled, iu.settled);
      await page.locator('#mini #mini-take').click();
      const both = await waitForAppRecord(page, (rec) => (rec.taken || []).some((r) => r.t === 'word' && r.id === '云う'),
        { description: 'the 云う card', timeout: 15000 });
      const iuRow = both.taken.find((r) => r.t === 'word' && r.id === '云う'), iuSnap = both.deepWords?.['云う'];
      const yearRow = both.taken.find((r) => r.t === 'word' && r.id === '年');
      check('R2.capture', 'Save keeps entry 1587040 and cueReading いう (the dictionary form as the text reads it), with its validated selection, in the same row shape as 年\'s',
        iuRow?.entrySeq === '1587040' && iuRow.cueReading === 'いう' && iuSnap?.seq === '1587040' && iuSnap.r === 'いう' && iuSnap.selection?.r === 'いう'
          && JSON.stringify(Object.keys(iuRow).sort()) === JSON.stringify(Object.keys(yearRow || {}).sort()), { iuRow, iuSnap, yearKeys: Object.keys(yearRow || {}) });
      await page.keyboard.press('Escape');
      await closeMini(page);
      // R2 · the い of ている saves the ichidan 居る (entry 1577980), never the quick dictionary's godan いる (要る)
      const [stem] = STEM;
      await openArticle(page, stem.at);
      const iru = await slip(page, tok(page, stem.index));
      // N2 · the card shows entry 1577980's first sense for the te-form, "to be ...-ing" (STEM[0].te)
      check('R2.capture.stem.ready', `the card for い (ている) is いる read いる, entry ${stem.seq}'s meaning for the te-form ("${stem.te[0]}"), and offers Save`, iru.settled?.word === 'いる'
        && iru.settled.gloss === stem.te[0] && iru.settled.take && !iru.settled.take.disabled, iru.settled);
      await page.locator('#mini #mini-take').click();
      const three = await waitForAppRecord(page, (rec) => (rec.taken || []).some((r) => r.t === 'word' && r.id === 'いる'),
        { description: 'the いる card', timeout: 15000 });
      const iruRow = three.taken.find((r) => r.t === 'word' && r.id === 'いる'), iruSnap = three.deepWords?.['いる'];
      const yearKeys = Object.keys(three.taken.find((r) => r.t === 'word' && r.id === '年') || {}).sort();
      check('R2.capture.stem', `Save keeps entry ${stem.seq} and cueReading いる, with its validated selection, in the same row shape as 年's — never the quick dictionary's いる`,
        iruRow?.entrySeq === stem.seq && iruRow.cueReading === 'いる' && iruSnap?.seq === stem.seq && iruSnap.r === 'いる' && iruSnap.selection?.r === 'いる'
          && iruSnap.selection?.seq === stem.seq && JSON.stringify(Object.keys(iruRow).sort()) === JSON.stringify(yearKeys), { iruRow, iruSnap, yearKeys });
      await page.keyboard.press('Escape');
      await closeMini(page);
    }
    if (!(await page.locator('#note-input').count())) await page.locator('#tray').click();
    const download = page.waitForEvent('download', { timeout: 15000 });
    await page.locator('#export-store').click();
    const stream = await (await download).createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    exported = Buffer.concat(chunks);
  } finally {
    check('capture.page-errors', 'capture (Save, its menu unfolding in the card, export): no page errors', errors.length === 0, errors);
    await context.close();
  }
  const fresh = await browser.newContext(contextOptions);
  await silenceBrowserAudio(fresh);
  await fresh.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
  try {
    const page = await fresh.newPage();
    await boot(page);
    if (!(await page.locator('#note-input').count())) await page.locator('#tray').click();
    await page.evaluate(() => { window.__readingTruthDocument = 1; });
    await page.locator('#import-file').setInputFiles({ name: 'reading-truth.json', mimeType: 'application/json', buffer: exported });
    await page.waitForFunction(() => window.__readingTruthDocument !== 1, null, { timeout: 20000 });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
    const back = await waitForAppRecord(page, (rec) => (rec.taken || []).some((row) => row.t === 'word' && row.id === '年'),
      { description: 'the imported 年 card', timeout: 15000 });
    const row = back.taken.find((r) => r.t === 'word' && r.id === '年'), snap = back.deepWords?.['年'];
    check('A3.round-trip', 'export → import keeps entry 2084840, cueReading ねん and the snapshot',
      row?.entrySeq === '2084840' && row.cueReading === 'ねん' && snap?.seq === '2084840' && snap.r === 'ねん', { row, snap });
    if (run('r2')) {
      const iuRow = back.taken.find((r) => r.t === 'word' && r.id === '云う'), iuSnap = back.deepWords?.['云う'];
      check('R2.round-trip', 'export → import keeps 云う\'s entry 1587040, cueReading いう and the snapshot',
        iuRow?.entrySeq === '1587040' && iuRow.cueReading === 'いう' && iuSnap?.seq === '1587040' && iuSnap.r === 'いう', { iuRow, iuSnap });
      const iruRow = back.taken.find((r) => r.t === 'word' && r.id === 'いる'), iruSnap = back.deepWords?.['いる'];
      check('R2.round-trip.stem', 'export → import keeps いる\'s entry 1577980, cueReading いる and the snapshot',
        iruRow?.entrySeq === '1577980' && iruRow.cueReading === 'いる' && iruSnap?.seq === '1577980' && iruSnap.r === 'いる', { iruRow, iruSnap });
    }
  } finally { await fresh.close(); }
}

async function stableCases(page) {
  await boot(page);
  await openShelfTools(page);
  await page.fill('#search', '年');
  await page.waitForSelector('#search-results [data-result="word:年"]', { timeout: 20000 });
  await page.locator('#search-results [data-result="word:年"]').first().click();
  await page.locator('#sheet').waitFor({ timeout: 15000 });
  await delay(800);
  const words = await sheetState(page);
  check('A4.words', 'Words search 年 (no reading of its own) opens the quick dictionary\'s 年, read とし', words.reading === core['年'].r, words);
  await openArticle(page, STARTUP);
  const { settled } = await slip(page, tok(page, STABLE.index));
  check('A4.reads-like-core', '総理 (read like the quick dictionary) is the quick dictionary\'s card, unchanged',
    settled?.reading === 'そうり' && settled.gloss === core['総理'].m[0] && settled.take && !settled.take.disabled, settled);
  const startup = await slip(page, tok(page, STARTUP_WORD.index));
  check('A8.startup', 'スタートアップ, missing from the quick dictionary, is the full dictionary\'s card: startup, Save live',
    startup.settled?.gloss === STARTUP_WORD.gloss && startup.settled.take && !startup.settled.take.disabled && !startup.settled.reason, startup);
  const name = await slip(page, tok(page, NAME.index));
  check('A8.no-entry', '高市 says it has no entry, and its Save says only that it cannot be saved here',
    name.settled?.gloss === NO_ENTRY && name.settled.take?.disabled && name.settled.reason === SAVE_REASON, name.settled);
  for (const fixture of RECORDED.filter((f) => f.at === STARTUP)) record(`R.${fixture.name}`, fixture.name, (await slip(page, tok(page, fixture.index))).settled);
  await openArticle(page, CABINET);
  for (const fixture of RECORDED.filter((f) => f.at === CABINET)) {
    if (fixture.index !== 11) { record(`R.${fixture.name}`, fixture.name, (await slip(page, tok(page, fixture.index))).settled); continue; }
    await closeMini(page);
    const annotation = page.locator('#reader span[data-index="11"][data-reader-annotation="true"]');
    await annotation.waitFor();
    const before = await annotation.evaluate((node) => ({ text: node.textContent, action: node.dataset.action ?? null,
      role: node.getAttribute('role'), popup: node.getAttribute('aria-haspopup'), paragraphDoor: node.hasAttribute('data-para'),
      ruby: node.querySelectorAll('ruby,rt').length }));
    await annotation.tap(); await delay(200);
    const afterTap = await page.evaluate(() => ({ mini: !!document.getElementById('mini'), page: !!document.getElementById('sheet'),
      raised: document.querySelector('[data-index="11"][data-reader-annotation]')?.dataset.ladderRung ?? null }));
    await annotation.click({ button: 'right' }); await delay(200);
    // G5: the word menu became the strip (hold = seal); an inert annotation opens neither
    const menu = await page.locator('#seal-strip').count();
    check('G3.phonetic-annotation', 'Cabinet token11 ちかい remains source text, with no lookup door, extra ruby, stage or strip',
      before.text === fixture.s && !before.action && !before.role && !before.popup && !before.paragraphDoor && before.ruby === 0
        && !afterTap.mini && !afterTap.page && !afterTap.raised && menu === 0, { before, afterTap, menu });
  }
  await closeMini(page);
  // G3 · a parenthetical is an annotation only when it reads the word before it: 拓's partial reading in 切り拓（ひら）く is
  // the text's furigana; 要因（ボトルネック） names a second word, whose tokens stay doors like every other
  const facts = (index) => tok(page, index).evaluate((node) => {
    const copy = node.cloneNode(true);
    copy.querySelectorAll('rt').forEach((rt) => rt.remove());
    return { text: copy.textContent, annotation: node.dataset.readerAnnotation === 'true', door: node.hasAttribute('data-para'),
      popup: node.getAttribute('aria-haspopup') };
  });
  await openArticle(page, STARTUP);
  const partial = { written: await facts(407), reading: await facts(409) };
  check('G3.partial-annotation', 'Startup 切り拓（ひら）: 拓 stays a door and its partial reading ひら is an annotation with no door',
    partial.written.text === '拓' && partial.written.door && !partial.written.annotation
      && partial.reading.text === 'ひら' && partial.reading.annotation && !partial.reading.door && !partial.reading.popup, partial);
  await openArticle(page, BOTTLENECK);
  const semantic = [await facts(601), await facts(603), await facts(604)];
  check('G3.semantic-parenthetical', 'env-press 要因（ボトルネック）: a katakana word that does not read 要因 keeps its doors, ボトル and ネック',
    semantic.map((row) => row.text).join(',') === '要因,ボトル,ネック' && semantic.every((row) => row.door && !row.annotation), semantic);
}

async function sentenceCase(page) {
  // an entry's 用例 carry the reader's grammar. 月's entry, opened from 9月 in the startup article (its text is then
  // loaded, so its dated sentence is among the examples), shows 年 counting years as a door
  await openArticle(page, STARTUP);
  await slip(page, tok(page, 4));
  await tapAt(page, tok(page, 4));
  await page.locator('#sheet').waitFor({ timeout: 15000 });
  const year = page.locator('#sheet .example-ja .sentence-tok[data-prose-label="年"]');
  await year.first().waitFor({ timeout: 20000 });
  await stillFor(page, '#sheet');
  const counting = await year.evaluateAll((nodes) => nodes.findIndex((node) => /[0-9０-９〇一二三四五六七八九十]$/u.test(node.previousSibling?.textContent || '')));
  check('A5.found', 'a 用例 under 月 counts a year (a numeral, then 年)', counting >= 0, counting);
  if (counting < 0) return;
  const { settled } = await slip(page, year.nth(counting));
  check('A5.sentence', 'that 年 reads ねん, the entry read that way, Save live', settled?.reading === 'ねん'
    && settled.gloss === firstGloss('2084840', 'ねん') && settled.take && !settled.take.disabled, settled);
  await closeMini(page);
}

/** A9 · the cold first tap (L, 2026-10-16): until the full dictionary names the entry a card's own reading stands for,
 * the card borrows no other reading's meaning. The full dictionary's index is held; 月 in 9月 (read がつ; the quick
 * dictionary's 月 reads つき, "Moon") is tapped, and every text the card's meaning line ever shows is recorded in the page.
 * Held: the line is a quiet "…" and Save is held. Released: がつ's meaning, Save live. Answered with a 500: the "…" stays. */
const INDEX_PATH = '/data/share_alike/dict-v2/index.json';
async function coldCase(browser, contextOptions, answer) {
  const tag = answer === 'fail' ? 'A9.unanswered' : 'A9.cold';
  const context = await browser.newContext(contextOptions);
  await silenceBrowserAudio(context);
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
  let release = () => {}, asked = 0;
  const gate = new Promise((done) => { release = done; });
  await context.route((url) => url.pathname === INDEX_PATH, async (route) => {
    asked += 1;
    await gate;
    try {
      if (answer === 'fail') await route.fulfill({ status: 500, contentType: 'application/json', body: '{"syntheticFailure":"verify-reading-truth A9"}' });
      else await route.continue();
    } catch { /* the context closed first */ }
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const meaning = firstGloss(COLD.seq, COLD.r);
  try {
    await openArticle(page, COLD.at);
    await closeMini(page);
    await page.evaluate(() => {
      window.__readingTruthGlosses = [];
      const seen = () => {
        for (const node of document.querySelectorAll('#mini .mini-gloss')) {
          if (window.__readingTruthGlosses.at(-1) !== node.textContent) window.__readingTruthGlosses.push(node.textContent);
        }
      };
      new MutationObserver(seen).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await activateStage(page, tok(page, COLD.index));
    for (let attempt = 0; attempt < 80 && !asked; attempt++) await delay(250);
    const held = await miniState(page);
    const line = await page.evaluate(() => {
      const node = document.querySelector('#mini .mini-gloss');
      return node ? { className: node.className, color: node.style.color, weight: node.style.fontWeight,
        busy: document.getElementById('mini').getAttribute('aria-busy'),
        describedBy: document.querySelector('#mini #mini-take')?.getAttribute('aria-describedby') ?? null } : null;
    });
    // L · while the right entry is on its way the Save area is the held Save alone: no D23 sentence, nothing it points to
    check(`${tag}.held`, 'with the full dictionary held, the card for 月 in 9月 reads がつ, its meaning line is a quiet "…" (the world\'s muted ink), Save is held and says nothing',
      asked > 0 && held?.word === '月' && k2h(held.reading) === 'がつ' && held.gloss === '…' && line?.className === 'mini-gloss mini-wait'
        && line.color === 'var(--mini-head-ink-2)' && line.weight === '400' && line.busy === 'true' && held.take?.disabled === true
        && held.reason === null && line.describedBy === null, { asked, held, line });
    await delay(1200);
    const still = await miniState(page);
    check(`${tag}.still`, 'a moment later, still held, it still borrows nothing and still says nothing',
      still?.gloss === '…' && still.take?.disabled === true && still.reason === null, still);
    release();
    await page.waitForFunction(() => document.getElementById('mini')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 });
    await delay(300);
    const settled = await miniState(page);
    if (answer === 'fail') {
      // the same run: a dead end (the dictionary cannot answer) keeps D23's sentence, and the held Save points to it
      const describedBy = await page.locator('#mini #mini-take').getAttribute('aria-describedby');
      check(`${tag}.settled`, 'unanswered (the index answers 500): the "…" stays, Save stays held, and now it says why (D23\'s sentence) — never つき\'s meaning',
        k2h(settled?.reading) === 'がつ' && settled.gloss === '…' && settled.take?.disabled === true && UNCONFIRMED.includes(settled.reason)
          && describedBy === 'mini-take-reason', { settled, describedBy });
    } else {
      check(`${tag}.settled`, `released: the card fills with がつ's meaning ("${meaning}"), Save live`,
        k2h(settled?.reading) === 'がつ' && settled.gloss === meaning && settled.take && !settled.take.disabled, settled);
    }
    const shown = await page.evaluate(() => window.__readingTruthGlosses);
    const allowed = answer === 'fail' ? ['…'] : ['…', meaning];
    check(`${tag}.never-borrowed`, `the meaning line never showed another reading's meaning (the quick dictionary's つき: "${core['月'].m[0]}")`,
      shown.length > 0 && shown.every((text) => allowed.includes(text)), shown);
  } catch (error) {
    check(`${tag}.error`, `${tag} ran to the end`, false, String(error.stack || error).slice(0, 600));
  } finally {
    release();
    check(`${tag}.page-errors`, `${tag}: no page errors`, errors.length === 0, errors);
    await context.close();
  }
}

/** A10 · a word no entry is read for (N, 2026-10-17; Codex 0304): the cold first tap on Kawaguchi's 訳 (やく) settles,
 * in the same card, to "No dictionary entry for this reading." once the held full dictionary answers; its meaning line
 * never shows わけ's "reason"; the second tap's page shows no meaning. */
async function unreadCase(browser, contextOptions) {
  const tag = 'A10';
  const context = await browser.newContext(contextOptions);
  await silenceBrowserAudio(context);
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
  let release = () => {}, asked = 0;
  const gate = new Promise((done) => { release = done; });
  await context.route((url) => url.pathname === INDEX_PATH, async (route) => {
    asked += 1;
    await gate;
    try { await route.continue(); } catch { /* the context closed first */ }
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const other = core['訳']?.m?.[0];
  try {
    await openArticle(page, UNREAD.at);
    await closeMini(page);
    await page.evaluate(() => {
      window.__readingTruthGlosses = [];
      const seen = () => {
        for (const node of document.querySelectorAll('#mini .mini-gloss')) {
          if (window.__readingTruthGlosses.at(-1) !== node.textContent) window.__readingTruthGlosses.push(node.textContent);
        }
      };
      new MutationObserver(seen).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await activateStage(page, tok(page, UNREAD.index));
    for (let attempt = 0; attempt < 80 && !asked; attempt++) await delay(250);
    const held = await miniState(page);
    check(`${tag}.held`, 'with the full dictionary held, the card for 訳 reads やく, its meaning line is a quiet "…", Save is held and says nothing',
      asked > 0 && held?.word === '訳' && k2h(held.reading) === 'やく' && held.gloss === '…' && held.take?.disabled === true && held.reason === null,
      { asked, held });
    release();
    await page.waitForFunction(() => document.getElementById('mini')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 });
    await delay(600);
    const settled = await miniState(page);
    // R2 · やく is 訳's on'yomi: once answered, the card is the kanji's (the lead's addendum class 2)
    const kanjiLine = `kanji · ${String(kanjiData['訳']?.m || '').toLowerCase()}`;
    check(`${tag}.settled`, `answered, the same card — no second tap — is the kanji's: 訳 read やく, "${kanjiLine}" (the kanji data's meaning), its Save the kanji's`,
      settled?.kind === 'kanji' && settled.word === '訳' && k2h(settled.reading) === 'やく' && settled.gloss === kanjiLine && settled.take
        && !settled.take.disabled && settled.reason === null && !!kanjiData['訳']?.m, settled);
    const shown = await page.evaluate(() => window.__readingTruthGlosses);
    check(`${tag}.never-borrowed`, `the meaning line never showed わけ's meaning ("${other}")`,
      shown.length > 0 && shown.every((text) => ['…', kanjiLine].includes(text)), shown);
    await page.locator('#mini .mini-word').click();
    await page.locator('#sheet').waitFor({ timeout: 20000 });
    await delay(800);
    const sheet = await page.evaluate(() => {
      const node = document.getElementById('sheet');
      return node ? { node: node.dataset.node ?? null, glyph: node.querySelector('.hero-glyph')?.textContent ?? null } : null;
    });
    check(`${tag}.page`, 'the second tap\'s page is the kanji page of 訳', sheet?.node === 'kanji:訳' && sheet.glyph === '訳', sheet);
  } catch (error) {
    check(`${tag}.error`, `${tag} ran to the end`, false, String(error.stack || error).slice(0, 600));
  } finally {
    release();
    check(`${tag}.page-errors`, `${tag}: no page errors`, errors.length === 0, errors);
    await context.close();
  }
}

async function deckCase(page) {
  const file = json('decks/kotoba-mcd/tokens.json');
  await boot(page, '?deck=mcd&ui=bi');
  await page.locator('#kp-start').click();
  let tried = 0;
  for (; tried < 20; tried++) {
    if (await page.locator('#kp-reveal').count()) await page.locator('#kp-reveal').click();
    else if (await page.locator('.kp-choice').count()) await page.locator('.kp-choice').first().click();
    await page.locator('#kp-card .kp-sentence .kp-tok').first().waitFor({ timeout: 15000 });
    const id = await page.locator('#kp-card').getAttribute('data-card');
    const passage = file.passages?.[file.cards?.[id]] || [];
    const surfaces = passage.map(([s]) => s);
    // every word on this back the deck reads otherwise than the quick dictionary (uninflected, once on the card)
    const candidates = passage.filter(([s, b = '', r = '', k = '', ref = '']) => k === '語' && (!b || b === s) && r
      && core[ref || s] && k2h(core[ref || s].r) !== k2h(r) && surfaces.filter((x) => x === s).length === 1);
    // a revealed word wears its ruby: it is found by its own text, the rt set aside; the card's own word (its note
    // stands where Save would) is not the case here
    const hitIndex = candidates.length ? await page.evaluate((wanted) => {
      const all = [...document.querySelectorAll('#kp-card .kp-sentence .kp-tok:not(.kp-target)')];
      const own = (node) => { const copy = node.cloneNode(true); copy.querySelectorAll('rt, rp').forEach((n) => n.remove()); return copy.textContent; };
      for (let i = 0; i < wanted.length; i++) {
        const hit = all.find((node) => own(node) === wanted[i]);
        if (hit) { hit.dataset.readingTruth = 'target'; return i; }
      }
      return -1;
    }, candidates.map(([s]) => s)) : -1;
    if (hitIndex >= 0) {
      const pick = candidates[hitIndex];
      const [s, , r] = pick;
      const target = page.locator('[data-reading-truth="target"]');
      const one = await slip(page, target);
      check('A6.deck', `a deck back's ${s}, read ${r} by the deck (the quick dictionary reads ${core[pick[4] || s].r}), shows ${r}`,
        k2h(one.first?.reading) === k2h(r) && k2h(one.settled?.reading) === k2h(r), { card: id, token: pick, ...one });
      // the tap asked the full dictionary: a later look stands for the entry read that way, with Save live
      let two = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        await closeMini(page);
        await delay(800);
        two = (await slip(page, target)).settled;
        if (two?.take && !two.take.disabled) break;
      }
      check('A6.deck-entry', `a later look at ${s} is the full dictionary's entry read ${r}, Save live`,
        k2h(two?.reading) === k2h(r) && two.take && !two.take.disabled, two);
      await closeMini(page);
      return;
    }
    await page.locator('#kp-grade-good').click();
    await delay(400);
  }
  check('A6.deck', 'a deck back within 20 cards carries a word the deck reads otherwise than the quick dictionary', false, `${tried} cards`);
}

async function guidedCase(page) {
  await boot(page);
  await page.locator('#chrome-dojo').click();
  await page.locator('[data-study-door="guided"]').click();
  await page.locator('.guided-room [data-action="setup"]').first().click();
  await page.locator('.guided-room [data-action="start"]').first().click();
  const q = guided.questions[0];
  await page.locator(`.guided-room [name="answer"][value="${q.correct}"]`).check();
  await page.locator('.guided-room [data-action="check"]').first().click();
  await page.locator('.guided-room [data-action="explain"]').first().click();
  const doors = page.locator('.guided-room .gs-word[data-action="word"]');
  await doors.first().waitFor({ timeout: 15000 });
  const count = Math.min(await doors.count(), 4);
  const seen = [];
  for (let n = 0; n < count; n++) {
    const key = await doors.nth(n).getAttribute('data-word');
    // the room's band can lie over a door at this width: the keyboard reaches each door as a finger would
    const { settled } = await slip(page, doors.nth(n), { keyboard: true });
    seen.push({ key, word: guided.words[key], settled });
  }
  check('A7.guided', 'every guided word\'s card reads as the session reads it', count > 0
    && seen.every(({ word, settled }) => k2h(settled?.reading) === k2h(word?.reading)), seen);
  await closeMini(page);
}

/** R2 · the named inflected words, the sound changes, the lone kanji and 私 read わたくし: each a real tap in the reader,
 * judged against fixed expectations (never against the app's own derivation). */
async function r2Cases(page) {
  // the card's own band (its word, reading and meaning lines), not the sentence row beneath it
  const cardText = () => page.evaluate(() => document.querySelector('#mini .mini-head')?.textContent || '');
  const glossLines = () => page.evaluate(() => [...document.querySelectorAll('#mini .mini-gloss')].map((node) => node.textContent));
  for (const fixture of INFLECTED) {
    await openArticle(page, fixture.at);
    const { settled } = await slip(page, tok(page, fixture.index));
    const meaning = fixture.core ? core[fixture.label].m[0] : firstGloss(fixture.seq, fixture.reading);
    const text = await cardText();
    const wrong = fixture.legacy || fixture.never;
    check(`R2.${fixture.name}`, `${fixture.at.id} #${fixture.index} ${fixture.s} (${fixture.r}): the card is ${fixture.label} read ${fixture.reading}, "${meaning}", Save live; never ${wrong}`,
      settled?.kind === 'word' && settled.word === fixture.label && k2h(settled.reading || settled.word) === k2h(fixture.reading) && settled.gloss === meaning
        && settled.take && !settled.take.disabled && !k2h(text).includes(k2h(wrong)), { settled, text });
  }
  for (const fixture of UNFIT) {
    await openArticle(page, fixture.at);
    const { settled } = await slip(page, tok(page, fixture.index));
    const meaning = firstGloss(fixture.seq, fixture.reading), noun = core[fixture.b].m[0];
    const lines = await glossLines();
    check(`R2.unfit.${fixture.name}`, `${fixture.at.id} #${fixture.index} ${fixture.s} (${fixture.r}): the card is ${fixture.b} read ${fixture.reading} (one form), "${meaning}", Save live; never the noun's "${noun}", never ${fixture.r} beside ${fixture.b}`,
      settled?.word === fixture.b && k2h(settled.reading || settled.word) === k2h(fixture.reading) && settled.gloss === meaning && settled.take && !settled.take.disabled
        && !lines.includes(noun) && k2h(settled.reading) !== k2h(fixture.r), { settled, lines });
  }
  for (const fixture of STEM) {
    await openArticle(page, fixture.at);
    const { settled } = await slip(page, tok(page, fixture.index));
    // N2 · right after the te-form the card shows 居る's senses for the te-form (te); elsewhere its first gloss, as before
    const meaning = fixture.te ? fixture.te[0] : firstGloss(fixture.seq, fixture.reading);
    const lines = await glossLines();
    check(`R2.stem.${fixture.name}`, `${fixture.at.id} #${fixture.index} ${fixture.s} (${fixture.r}): the card is ${fixture.b} read ${fixture.reading}, entry ${fixture.seq}'s ${fixture.te ? JSON.stringify(fixture.te) : `"${meaning}"`}, Save live; never the quick dictionary's "${fixture.never}"`,
      settled?.word === fixture.b && k2h(settled.reading || settled.word) === k2h(fixture.reading) && settled.gloss === meaning && settled.take && !settled.take.disabled
        && !lines.includes(fixture.never) && (!fixture.te || JSON.stringify(lines) === JSON.stringify(fixture.te)), { settled, lines });
  }
  for (const fixture of SOUND) {
    await openArticle(page, fixture.at);
    const { settled } = await slip(page, tok(page, fixture.index));
    // R3 · a counter after a number shows the entry's first counter sense (its first gloss), from the served shard
    const counterGloss = () => {
      const seq = readAs(fixture.s, fixture.plain)[0]?.[0];
      const sense = (detailOf(String(seq))?.[3] || []).find((candidate) => (candidate[0] || []).includes('ctr'));
      return sense ? String(sense[10][0][0]) : null;
    };
    const meaning = fixture.counter ? counterGloss() : k2h(core[fixture.s]?.r) === k2h(fixture.plain) ? core[fixture.s].m[0] : readAs(fixture.s, fixture.plain)[0]?.[3];
    check(`R2.V.${fixture.name}`, `${fixture.s} read ${fixture.r}: the card shows ${fixture.r} and the meaning of ${fixture.s} read ${fixture.plain} ("${meaning}"), Save live`,
      settled?.word === fixture.s && settled.reading === fixture.r && settled.gloss === meaning && settled.take && !settled.take.disabled, settled);
  }
  for (const fixture of LONE) {
    await openArticle(page, fixture.at);
    const { settled } = await slip(page, tok(page, fixture.index));
    const meaning = `kanji · ${String(kanjiData[fixture.s].m).toLowerCase()}`;
    const lines = await glossLines();
    check(`R2.K.${fixture.name}`, `${fixture.s} read ${fixture.r}: the kanji's card, ${fixture.r} · "${meaning}", Save live; no meaning line is the word ${fixture.s} read ${core[fixture.s]?.r}'s ("${core[fixture.s]?.m?.[0]}")`,
      settled?.kind === 'kanji' && settled.word === fixture.s && settled.reading === fixture.r && settled.gloss === meaning && settled.take && !settled.take.disabled
        && lines.length > 0 && !lines.some((line) => (core[fixture.s]?.m || []).includes(line)), { settled, lines });
  }
  await openArticle(page, WATAKUSHI.at);
  const { settled } = await slip(page, tok(page, WATAKUSHI.index));
  const meaning = firstGloss(WATAKUSHI.seq, WATAKUSHI.r);
  check('R2.C3.私', `私 read わたくし: the card reads わたくし, "${meaning}" (entry ${WATAKUSHI.seq}), Save live`,
    settled?.word === '私' && k2h(settled.reading) === 'わたくし' && settled.gloss === meaning && settled.take && !settled.take.disabled, settled);
  for (const fixture of REMAINING) {
    await openArticle(page, fixture.at);
    const left = (await slip(page, tok(page, fixture.index))).settled;
    check(`R2.remaining.${fixture.name}`, `${fixture.s} read ${fixture.r}: the card reads ${fixture.r} and says "${NO_READING}", its Save held with "${SAVE_REASON}"`,
      left?.word === fixture.s && left.reading === fixture.r && left.gloss === NO_READING && left.take?.disabled === true && left.reason === SAVE_REASON, left);
  }
  await closeMini(page);
}

/* ------------------------------------------------------------------ SWEEP · every inflected token */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const reviewQueue = JSON.parse(readFileSync(resolve(REPO, 'docs/content/feed-review-queue.json'), 'utf8'));
// N2 (2026-10-17) rewrites the pin "the twenty (queue kind original)" strictly: the reviewed articles are every hand-chosen
// queue kind — N's twenty and N2's twenty, forty in all; the inherited shelf they leave, and its sample, is unchanged
const HAND_KINDS = new Set(['original', 'aozora', 'gv', 'mext', 'govonline']);
const TWENTY = reviewQueue.filter((row) => HAND_KINDS.has(row.kind) && row.decision !== 'rejected').map((row) => row.id);
const shelfRows = json('data/articles/index.json').articles;
const inheritedRows = shelfRows.filter((row) => !TWENTY.includes(row.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
// a fixed sample of 20 inherited articles the shelf shows: picks at an even step through the id order; a pick the shelf
// does not show (a row held back from the shelf, 検収前) gives way to the next row in id order
const SAMPLE_PICKS = Array.from({ length: 20 }, (_, i) => Math.floor((i * inheritedRows.length) / 20));
const SWEEP_ONLY = (process.env.READING_TRUTH_SWEEP_IDS || '').split(',').filter(Boolean);
const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
// a card still saying "…" has not answered: it is never counted as saying none (Codex's f2e3015e review)
const SAYS_NONE = (line) => [NO_ENTRY, NO_READING].includes(line) || /^Several entries: /u.test(line);
// the verifier's own sound changes (a final っ undone; a voiced or ぱ-row first kana made plain)
const VOICED = 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ', PLAIN = 'かきくけこさしすせそたちつてとはひふへほはひふへほ';
const soundUndone = (reading) => {
  const r = k2h(reading), plain = (x) => (VOICED.includes(x[0]) ? PLAIN[VOICED.indexOf(x[0])] + x.slice(1) : '');
  const out = [plain(r)];
  if (r.endsWith('っ')) for (const end of 'ちつくきう') out.push(r.slice(0, -1) + end, plain(r.slice(0, -1) + end));
  return out.filter(Boolean);
};
/** How the reading a card states comes from the token's own, by this verifier's own rules; '' when it does not. */
function derivedHow(token, label, stated) {
  const r = k2h(token.r), s = token.s;
  let base = token.b;
  if (label !== base) {
    const swap = [['する', 'す'], ['ずる', 'じる']].find(([from, to]) => base.endsWith(from) && label === base.slice(0, -from.length) + to);
    if (!swap) return '';
    base = label;
  }
  if (KANA_ONLY.test(base)) return stated === k2h(base) ? 'kana base' : '';
  const S = [...s], B = [...base];
  let n = 0;
  while (n < S.length && n < B.length && S[n] === B[n]) n += 1;
  const tailS = k2h(S.slice(n).join('')), tailB = k2h(B.slice(n).join(''));
  if (n && (!tailS || KANA_ONLY.test(tailS)) && (!tailB || KANA_ONLY.test(tailB)) && stated.endsWith(tailB) && r.endsWith(tailS)) {
    const stem = stated.slice(0, stated.length - tailB.length);
    if (stem && stem === r.slice(0, r.length - tailS.length)) return 'shared stem';
  }
  if (listedReadings(base).includes(stated) && (stated === r || (stated.length > 1 && r.startsWith(stated.slice(0, -1))))) return 'dictionary';
  if (/来る$/u.test(base) && stated.endsWith('くる') && /^[こきく]/u.test(r.slice(stated.length - 2))) return 'kuru';
  return '';
}
/** The entry a shown meaning belongs to, in a dictionary the build serves: the quick dictionary's word, a full-dictionary
 * entry, or a row of the original word layer (words.json) — it writes `label` and reads it `stated` (or a sound change of
 * it, for a word read as written), and the meaning is one of its own. */
function meaningEntry(label, stated, gloss, readings = [stated]) {
  if (core[label] && readings.includes(k2h(core[label].r)) && (core[label].m || []).includes(gloss)) {
    const seqs = readings.flatMap((reading) => readAs(label, reading)).map((row) => String(row[0]));
    return { from: 'quick', p: core[label].p, pos: [...new Set(seqs.flatMap(posOf))] };
  }
  for (const reading of readings) {
    const row = readAs(label, reading).find((candidate) => [candidate[3], ...candidate[6]].includes(gloss));
    if (row) return { from: 'index', seq: String(row[0]), pos: posOf(String(row[0])) };
  }
  const layer = legacyWords[label];
  if (layer && String(layer.r || '').split(/;\s*/u).map(k2h).some((reading) => readings.includes(reading)) && layer.g === gloss) {
    return { from: 'words', pos: [] };
  }
  return null;
}
// the token's class against the entry's: a verb by "verb" or a JMdict v… code; an adjective by its i-, ix-, ku- or shiku-
// class. An entry no served data gives a part of speech for is of unknown class: recorded, never counted as a fit
const verbal = (part) => /verb/u.test(part) || /^v[0-9a-z]/u.test(part);
const adjectival = (part) => /i-adjective|^adj-(i|ix|ku|shiku)$|aux-adj/u.test(part);
const classOf = (entry) => [...String(entry.p || '').split(' · ').filter(Boolean), ...entry.pos];
const classFits = (p, entry) => (p === '動詞' ? classOf(entry).some(verbal) : p === '形容詞' ? classOf(entry).some(adjectival) : true);
// N2 · the one card of another class a verb may show: right after the te-form, JMdict's own expression for that use,
// written as the text writes it (〜てください: 下さい, an expression whose sense follows the te-form)
const teExpressionFits = (tokens, index, label, stated) => afterTeForm(tokens, index)
  && readAs(label, stated).some((row) => teSensesOf(String(row[0])).some((sense) => (sense[0] || []).includes('exp')));
// R3 (Grok 0315) · the card of an expression the text writes around the token, read whole (について, にとって, いけない,
// 一枚岩, 方がいい, もったいない, ちがいない, 間もなく, なりに, んだ): two to four tokens holding this one, whose spelling is
// the card's word or whose reading is its reading line. Its meaning must still be an entry's that writes that word and
// reads it so (meaningEntry); つく's "to be attached" for について was the wrong sense this sweep's class rule pinned.
// R3 (Grok 2029) · the must family runs to five (なく て は いけ ない), and a card names an expression by its dictionary
// form, as a verb's card does: the run's last word may be written inflected (床につい: 床につく; ならなく: ならない), or as
// a negative ending ぬ, ん or ず where the form says ない (しなければならん, ならぬ, ならず: なければならない)
const NEGATIVE_ENDINGS = new Set(['ぬ', 'ん', 'ず']);
const expressionFits = (tokens, index, label, stated) => {
  for (let from = Math.max(0, index - 4); from <= index; from += 1) {
    for (let to = Math.max(index, from + 1); to <= Math.min(tokens.length - 1, from + 4); to += 1) {
      const run = tokens.slice(from, to + 1), last = run.at(-1), head = run.slice(0, -1).map((t) => t.s).join('');
      if (run.map((t) => t.s).join('') === label || k2h(run.map((t) => t.r || t.s).join('')) === k2h(stated)) return true;
      if ((last.b && last.b !== last.s && head + last.b === label) || (NEGATIVE_ENDINGS.has(last.s) && `${head}ない` === label)) return true;
    }
  }
  return false;
};


// Explicit independently reviewed source proofs, never inferred from a renderer flag.
// New/changed fixtures fail closed and require re-review. Semantic parentheticals
// stay eligible; stable-case controls for ボトル/ネック remain mandatory separately.
const SWEEP_PRONUNCIATION_PROOFS = [
  { id: 'gojuon-pronunciation', article: 'bunki-read-n3-gojuon-sanskrit',
    sha256: '830d99e8e1c86e273f6ed334de1cc6dbcbf030972c9424465735af42557fff0d',
    bracket: [348, 354], written: '悉曇', reading: 'しったん', tokenReadingIndex: 230,
    basis: 'Authored source phrase and token230.r independently agree exactly with bracket content.' },
  // re-reviewed at the five-merge integration: R3's 657dd4da changed only the article's month tokens (月 read がつ after a
  // number); its text, this bracket and its written form are unchanged
  { id: 'cabinet-pronunciation', article: 'jawiki:5294446',
    sha256: '16b4d1f863d4c32f84994f4d6ed1009bc217abd5203e9473b93faf0f7ea31881',
    bracket: [9, 27], written: '第2次高市改造内閣', reading: 'だいにじたかいちかいぞうないかく',
    basis: 'Reviewed literal source title pronunciation; same complete bracket as accepted Cabinet token11 fixture. Tokenizer readings are imperfect; do not infer equality from token.r concatenation.' },
  // re-reviewed at the five-merge integration: R3's 657dd4da changed only one month token's fields (月 #155); the text,
  // this bracket and its written form are unchanged
  { id: 'shina-name-pronunciation', article: 'wikinews:45089',
    sha256: 'a03f12824cc1664490ff95a0979059ef7aabc89657801812969e55f8ff5424b0',
    bracket: [40, 48], written: '階猛', reading: 'しな・たけし',
    basis: 'Reviewed literal source name pronunciation 階猛（しな・たけし）氏. Tokenizer 階.r=かい is not the name reading; fixture is explicit, not guessed from that token.' },
];

function sweepEligibility(article, file, tokens) {
  const text = tokens.map(t => t.s).join('');
  const proofs = SWEEP_PRONUNCIATION_PROOFS.filter(p => p.article === article);
  const fileSha256 = createHash('sha256').update(readFileSync(resolve(site, 'data/articles', file))).digest('hex');
  for (const proof of proofs) {
    assert.equal(fileSha256, proof.sha256, `${article}: pronunciation source changed; re-review`);
    assert.equal(text.slice(...proof.bracket), `（${proof.reading}）`);
    assert.equal(text.slice(proof.bracket[0] - proof.written.length, proof.bracket[0]), proof.written);
    if (proof.tokenReadingIndex !== undefined) {
      assert.equal(tokens[proof.tokenReadingIndex].s, proof.written);
      assert.equal(tokens[proof.tokenReadingIndex].r, proof.reading);
    }
  }
  let offset = 0; const occurrences = [], distinct = new Map(), original = new Set();
  for (const [index, token] of tokens.entries()) {
    const start = offset; offset += token.s.length;
    if (!token.b || token.b === token.s) continue;
    const key = `${token.s}|${token.b}|${token.r}|${!!token.c}`;
    original.add(key);
    const proof = proofs.find(p => start >= p.bracket[0] && offset <= p.bracket[1]);
    occurrences.push({ index, start, end: offset, token, eligible: !proof, proof: proof?.id ?? null });
    if (proof) continue; // BEFORE dedup: wikinews #27 excluded, semantic #61 retained.
    if (distinct.has(key)) { distinct.get(key).occurrences++; distinct.get(key).indices.push(index); }
    else distinct.set(key, { index, token, occurrences: 1, indices: [index] });
  }
  return { fileSha256, proofs, occurrences, originalDistinct: original.size, distinct };
}
async function checkSweepAnnotation(page, occurrence) {
  await closeMini(page);
  const locator = tok(page, occurrence.index);
  const beforeRecord = await readAppRecord(page);
  const geometry = await tapExactPrintedReaderGlyph(page, locator, { index: occurrence.index, surface: occurrence.token.s, annotation: 'true' });
  await delay(200);
  const point = geometry.glyphs[0];
  await page.mouse.click(point.x, point.y, { button: 'right' }); await delay(100);
  const observed = await locator.evaluate(node => ({ text: node.textContent, para: node.hasAttribute('data-para'),
    action: node.dataset.action ?? null, role: node.getAttribute('role'), popup: node.getAttribute('aria-haspopup'),
    ruby: node.querySelectorAll('ruby,rt').length, rung: node.dataset.ladderRung ?? null,
    stage: !!document.getElementById('mini'), page: !!document.getElementById('sheet'), menu: !!document.getElementById('seal-strip') }));
  const afterRecord = await readAppRecord(page);
  assert.equal(observed.text, occurrence.token.s);
  assert(!observed.para && !observed.action && !observed.role && !observed.popup && !observed.ruby && !observed.rung && !observed.stage && !observed.page && !observed.menu,
    'Independently proved pronunciation must remain inert source text');
  for (const key of ['taken', 'srs', 'revlog', 'stats', 'lists', 'obslog']) assert.deepEqual(afterRecord[key], beforeRecord[key], `${key} unchanged for inert annotation`);
  return { geometry, observed, noSaveOrGrade: true };
}

async function sweepCase(browser, contextOptions) {
  const report = { engine, articles: [], notOnShelf: [], totals: { tokens: 0, occurrences: 0, tapped: 0, entry: 0, quick: 0, kanji: 0, several: 0, noEntry: 0,
    asWritten: 0, particle: 0, wordLayer: 0, unanswered: 0, classUnknown: 0, exceptions: 0, tapFailures: 0 }, exceptions: [], annotationChecks: [] };
  const context = await browser.newContext(contextOptions);
  await silenceBrowserAudio(context);
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  // an article the learner can open: its shelf card, else the shelf's own search by its title
  const opens = async (row) => {
    await boot(page);
    const direct = page.locator(`[data-passage="${row.id}"]:not([data-recommendation]) .shelf-open`).first();
    if (await direct.count()) await direct.click();
    else {
      await openShelfTools(page);
      await page.locator('#shelf-reading-search').fill(row.title);
      await page.locator('#shelf-reading-search').press('Enter');
      const found = page.locator(`#shelf-reading-results [data-passage="${row.id}"] .shelf-open`).first();
      try { await found.waitFor({ timeout: 4000 }); } catch { return false; }
      await found.click();
    }
    await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 20000 });
    return true;
  };
  const queue = [...TWENTY.map((id) => ({ id, group: 'twenty' })), ...SAMPLE_PICKS.map((at) => ({ at, group: 'inherited' }))];
  const swept = new Set();
  try {
    for (const item of queue) {
      let row = item.id ? shelfRows.find((candidate) => candidate.id === item.id) : null;
      if (item.group === 'inherited') {
        for (let at = item.at; at < inheritedRows.length && !row; at += 1) {
          const candidate = inheritedRows[at];
          if (swept.has(candidate.id)) continue;
          if (SWEEP_ONLY.length && !SWEEP_ONLY.includes(candidate.id)) break;
          if (await opens(candidate)) row = candidate;
          else report.notOnShelf.push(candidate.id);
        }
        if (!row) continue;
      } else {
        if (SWEEP_ONLY.length && !SWEEP_ONLY.includes(row.id)) continue;
        if (!(await opens(row))) { report.notOnShelf.push(row.id); continue; }
      }
      swept.add(row.id);
      const id = row.id;
      const tokens = json(`data/articles/${row.file}`).tokens || [];
      const eligibility = sweepEligibility(id, row.file, tokens), distinct = eligibility.distinct;
      const article = { id, group: item.group, tokens: distinct.size, occurrences: 0, rows: [],
        eligibility: { fileSha256: eligibility.fileSha256, proofs: eligibility.proofs, originalDistinct: eligibility.originalDistinct,
          originalOccurrences: eligibility.occurrences.length, roster: eligibility.occurrences,
          representatives: [...distinct.values()].map(({ index, indices }) => ({ index, indices })) } };
      report.articles.push(article);
      for (const occurrence of eligibility.occurrences.filter(r => !r.eligible)) {
        const result = { article: id, index: occurrence.index, proof: occurrence.proof, passed: false };
        try { result.evidence = await checkSweepAnnotation(page, occurrence); result.passed = true; }
        catch (error) { result.error = String(error.stack || error); }
        report.annotationChecks.push(result);
      }
      for (const { index, token, occurrences } of distinct.values()) {
        report.totals.tokens += 1;
        report.totals.occurrences += occurrences;
        article.occurrences += occurrences;
        let card = null, failure = null;
        const sweepTarget = { index, surface: token.s, taps: [] };
        let noSaveOrGrade = false;
        try {
          const beforeRecord = await readAppRecord(page);
          card = (await slip(page, tok(page, index), { sweepTarget })).settled;
          const afterRecord = await readAppRecord(page);
          for (const key of ['taken', 'srs', 'revlog', 'stats', 'lists']) assert.deepEqual(afterRecord[key], beforeRecord[key], `${key} unchanged for lookup`);
          noSaveOrGrade = true;
        } catch (error) { failure = String(error.message || error).split('\n')[0].slice(0, 160); }
        const out = { index, s: token.s, b: token.b, r: token.r, p: token.p, c: !!token.c, occurrences, card, how: '', answer: '', issues: [],
          taps: sweepTarget.taps, noSaveOrGrade };
        if (failure && card) out.issues.push(`activation/record assertion: ${failure}`);
        if (!card) {
          report.totals.tapFailures += 1;
          out.issues.push(`no card: ${failure}`);
        } else {
          report.totals.tapped += 1;
          const label = card.word || '', stated = k2h(card.reading || label), gloss = card.gloss || '';
          const asWritten = label === token.s && stated === k2h(token.r);
          // the label and the reading name one form: the dictionary form read the derived way, or the word as written read
          // as written — never the dictionary form beside the surface's reading (かえる read かえり; Codex 1352)
          out.how = card.kind === 'kanji' ? (asWritten ? 'kanji read as written' : '') : asWritten || (card.kind === 'particle' && label === token.s) ? 'as written'
            : derivedHow(token, label, stated);
          if (!out.how && card.kind !== 'kanji' && expressionFits(tokens, index, label, stated)) out.how = 'an expression read whole';
          if (!out.how) out.issues.push(`the card reads ${label} ${card.reading || '(no reading line)'}: not from ${token.s} read ${token.r}`);
          if (gloss === QUICK_MISS) out.issues.push('says "Not in the quick dictionary" once the full dictionary has answered');
          if (card.kind === 'particle') {
            // a particle's door (に, で of だ): the grammar layer's card for the word as written — no dictionary entry to judge
            out.answer = 'particle';
            if (label !== token.s || (card.reading && k2h(card.reading) !== k2h(token.r))) out.issues.push(`the particle card is not ${token.s} as written`);
          } else if (card.kind === 'kanji') {
            out.answer = 'kanji';
            if (gloss !== `kanji · ${String(kanjiData[label]?.m || '').toLowerCase()}`) out.issues.push(`the kanji card's meaning is not ${label}'s kanji data`);
          } else if (gloss === '…') {
            out.answer = 'unanswered';
            out.issues.push('the card still says "…": it never answered');
          } else if (NOT_A_WORD.includes(gloss)) {
            // R3 · a name or a reading: the card is the word as written, and lends no entry's meaning
            out.answer = 'notAWord';
            if (label !== token.s) out.issues.push(`the card says "${gloss}" yet is not a card of ${token.s} as written`);
          } else if (SAYS_NONE(gloss) || gloss === QUICK_MISS) {
            out.answer = /^Several entries: /u.test(gloss) ? 'several' : asWritten ? 'asWritten' : 'noEntry';
            // a card naming no entry holds its Save and says why (D23's honest line)
            if (!(card.take?.disabled === true && card.reason)) out.issues.push(`names no entry, yet its Save is not held with a reason (${JSON.stringify({ take: card.take, reason: card.reason })})`);
          } else {
            const entry = meaningEntry(label, stated, gloss, asWritten ? [stated, ...soundUndone(stated)] : [stated]);
            out.answer = entry?.from === 'quick' ? 'quick' : entry?.from === 'words' ? 'wordLayer' : 'entry';
            out.entry = entry;
            if (!entry) out.issues.push(`"${gloss}" belongs to no entry that writes ${label} and reads it ${stated}`);
            else if (['動詞', '形容詞'].includes(token.p) && !classOf(entry).length) out.classUnknown = true;
            else if (!classFits(token.p, entry) && !teExpressionFits(tokens, index, label, stated) && !expressionFits(tokens, index, label, stated)) out.issues.push(`${entry.seq || `the ${entry.from === 'words' ? 'word layer' : 'quick dictionary'}'s word`} is not a ${token.p} (${classOf(entry).join(' ')})`);
          }
          report.totals[out.answer] = (report.totals[out.answer] || 0) + 1;
          if (out.classUnknown) report.totals.classUnknown += 1;
        }
        if (out.issues.length) { report.totals.exceptions += 1; report.exceptions.push({ article: id, ...out }); }
        article.rows.push(out);
      }
    }
  } finally {
    await context.close();
    writeFileSync(resolve(evidence, `sweep-${engine}.json`), `${JSON.stringify(report, null, 1)}\n`);
  }
  check('SWEEP.annotations', 'only independently proved source pronunciation occurrences are excluded, and each remains inert in the actual DOM',
    report.annotationChecks.every(row => row.passed), report.annotationChecks);
  check('SWEEP.no-save-or-grade', 'ordinary sweep lookups never save or grade',
    report.articles.every(article => article.rows.every(row => row.noSaveOrGrade)),
    report.articles.flatMap(article => article.rows.filter(row => !row.noSaveOrGrade).map(row => ({ article: article.id, index: row.index, issues: row.issues }))));
  const all = report.exceptions;
  const list = (pick) => all.filter(pick).map((x) => `${x.article} #${x.index} ${x.s}/${x.b}/${x.r}: ${x.issues.join('; ')}`).slice(0, 12);
  const twentySwept = report.articles.filter((article) => article.group === 'twenty').length;
  const inheritedSwept = report.articles.filter((article) => article.group === 'inherited').length;
  check('SWEEP.articles', `the sweep walked the forty reviewed articles and 20 inherited articles the shelf shows (${twentySwept} + ${inheritedSwept}; not on the shelf: ${report.notOnShelf.join(', ') || 'none'})`,
    SWEEP_ONLY.length ? report.articles.length > 0 : twentySwept === TWENTY.length && TWENTY.length === 40 && inheritedSwept === 20 && !report.notOnShelf.some((id) => TWENTY.includes(id)),
    { twentySwept, inheritedSwept, notOnShelf: report.notOnShelf });
  check('SWEEP.taps', `every inflected token opened its card (${report.totals.tapped} of ${report.totals.tokens} distinct, ${report.totals.occurrences} occurrences, ${report.articles.length} articles)`,
    report.totals.tokens > 0 && report.totals.tapFailures === 0, list((x) => x.card === null));
  check('SWEEP.readings', 'every card states a reading that comes from its token\'s own, or is the word as the text writes and reads it',
    !all.some((x) => x.card && !x.how), list((x) => x.card && !x.how));
  check('SWEEP.meanings', 'every meaning a card shows belongs to an entry that writes its word, reads it so, and is of the token\'s class',
    !all.some((x) => x.issues.some((issue) => /belongs to no entry|is not a |kanji data/u.test(issue))), list((x) => x.issues.some((issue) => /belongs to no entry|is not a |kanji data/u.test(issue))));
  check('SWEEP.no-quick-miss', 'no settled card says "Not in the quick dictionary"', !all.some((x) => x.issues.some((issue) => /quick dictionary/u.test(issue))),
    list((x) => x.issues.some((issue) => /quick dictionary/u.test(issue))));
  check('SWEEP.answered', 'no card is left saying "…"', !all.some((x) => x.issues.some((issue) => /never answered/u.test(issue))),
    list((x) => x.issues.some((issue) => /never answered/u.test(issue))));
  check('SWEEP.held', 'every card naming no entry (none read so, several, or the word as written) holds its Save and says why',
    !all.some((x) => x.issues.some((issue) => /Save is not held/u.test(issue))), list((x) => x.issues.some((issue) => /Save is not held/u.test(issue))));
  check('SWEEP.page-errors', 'the sweep: no page errors', errors.length === 0, errors.slice(0, 5));
  record('SWEEP.counts', 'the sweep\'s counts (distinct tokens per article; answers)', report.totals);
  record('SWEEP.class-unknown', 'meanings whose entry no served data gives a part of speech for (not judged)', report.articles
    .flatMap((article) => article.rows.filter((row) => row.classUnknown).map((row) => `${article.id} #${row.index} ${row.s}/${row.b}: ${row.card?.word} ${row.card?.gloss} (${row.entry?.from})`)));
}

/* ------------------------------------------------------------------ N2 · the te-form's auxiliaries */
const miniLines = (page) => page.evaluate(() => [...document.querySelectorAll('#mini .mini-gloss')].map((node) => node.textContent));
/** The full entry the slip's band opens: its headword, the form's entries listed, and the one standing (active). */
async function slipEntry(page) {
  await page.locator('#mini .mini-word').click();
  await page.locator('#sheet .headword').waitFor({ timeout: 15000 });
  await stillFor(page, '#sheet');
  return page.evaluate(() => ({ head: document.querySelector('#sheet .headword')?.textContent ?? null,
    entries: [...document.querySelectorAll('#sheet .dictionary-homograph')].map((row) => row.dataset.dictionaryEntry),
    active: [...document.querySelectorAll('#sheet .dictionary-homograph.active')].map((row) => row.dataset.dictionaryEntry) }));
}
/** Named (Grok 0036): each a real tap, judged against fixed expectations. The two いる cases Grok found and the lone いる
 * also open their full entry: entry 1577980 stands, and 要る is one of the form's other entries. */
async function auxCases(page) {
  for (const fixture of TE) {
    await openArticle(page, fixture.at);
    const { settled } = await slip(page, tok(page, fixture.index));
    const lines = await miniLines(page);
    check(`N2.te.${fixture.name}`, `${fixture.at.id} #${fixture.index} ${fixture.s} after the te-form: the card is ${fixture.form}, its lines ${JSON.stringify(fixture.lines)} (entry ${fixture.seq}'s senses for the te-form, in JMdict's words), Save live; never "${fixture.never}"`,
      settled?.kind === 'word' && settled.word === fixture.form && k2h(settled.reading || settled.word) === k2h(fixture.form)
        && JSON.stringify(lines) === JSON.stringify(fixture.lines) && settled.take && !settled.take.disabled && !lines.includes(fixture.never), { settled, lines });
    if (fixture.entry) {
      const sheet = await slipEntry(page);
      check(`N2.te.entry.${fixture.name}`, `its full entry is entry ${fixture.seq}, one of the form's entries with 要る (${IRU_ALONE.other})`,
        JSON.stringify(sheet.active) === JSON.stringify([fixture.seq]) && sheet.entries.includes(IRU_ALONE.other), sheet);
    }
  }
  const fixture = IRU_ALONE;
  await openArticle(page, fixture.at);
  const { settled } = await slip(page, tok(page, fixture.index));
  const lines = await miniLines(page);
  const meaning = firstGloss(fixture.seq, 'いる');
  check(`N2.alone.${fixture.name}`, `${fixture.at.id} #${fixture.index} いる, not after the te-form: the card is いる, entry ${fixture.seq}'s "${meaning}", one line, Save live; never "${fixture.never}"`,
    settled?.word === 'いる' && settled.gloss === meaning && JSON.stringify(lines) === JSON.stringify([meaning]) && settled.take && !settled.take.disabled
      && !lines.includes(fixture.never), { settled, lines });
  const sheet = await slipEntry(page);
  check(`N2.alone.entry.${fixture.name}`, `its full entry is entry ${fixture.seq}; 要る (entry ${fixture.other}) is one tap away among the form's entries`,
    JSON.stringify(sheet.active) === JSON.stringify([fixture.seq]) && sheet.entries.includes(fixture.other), sheet);
}
/** The entry JMdict lists for a token's use after the te-form, by this verifier's own reading of the served data: the one
 * entry read as its dictionary form with senses for the te-form, else the one read as the text writes it; its lines (the
 * first glosses of those senses, at most two) and the other entries read alike. null when JMdict lists no such use. */
function auxExpected(token) {
  const pick = (rows, label, reading) => (rows.length === 1
    ? { label, seq: String(rows[0][0]), lines: teLinesOf(String(rows[0][0])).slice(0, 2), others: readAs(label, reading).filter((row) => String(row[0]) !== String(rows[0][0])) }
    : { ambiguous: rows.map((row) => String(row[0])) });
  const lemma = teEntries(token.b, token.b);
  if (lemma.length) return pick(lemma, token.b, token.b);
  const written = teEntries(token.s, token.r);
  return written.length ? pick(written, token.s, token.r) : null;
}
/** AUX · every token in every article on the shelf that is a verb written in kana right after the te-form, one tap per
 * distinct token (its first place, each article opened once). */
async function auxSweepCase(browser, contextOptions) {
  const keys = new Map();
  for (const row of shelfRows) {
    const tokens = json(`data/articles/${row.file}`).tokens || [];
    tokens.forEach((t, index) => {
      if (t.p !== '動詞' || !KANA_ONLY.test(String(t.s || '')) || !afterTeForm(tokens, index)) return;
      const key = `${t.s}|${t.b}|${t.r}`;
      if (!keys.has(key)) keys.set(key, { row, index, token: t, occurrences: 0, articles: new Set() });
      keys.get(key).occurrences += 1;
      keys.get(key).articles.add(row.id);
    });
  }
  const report = { engine, keys: keys.size, occurrences: 0, articles: [], tapped: 0, auxiliary: 0, plain: 0, notOnShelf: [], rows: [], exceptions: [] };
  const context = await browser.newContext(contextOptions);
  await silenceBrowserAudio(context);
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  const opens = async (row) => {
    await boot(page);
    const direct = page.locator(`[data-passage="${row.id}"]:not([data-recommendation]) .shelf-open`).first();
    if (await direct.count()) await direct.click();
    else {
      await openShelfTools(page);
      await page.locator('#shelf-reading-search').fill(row.title);
      await page.locator('#shelf-reading-search').press('Enter');
      const found = page.locator(`#shelf-reading-results [data-passage="${row.id}"] .shelf-open`).first();
      try { await found.waitFor({ timeout: 4000 }); } catch { return false; }
      await found.click();
    }
    await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 20000 });
    return true;
  };
  const byArticle = new Map();
  for (const item of keys.values()) {
    if (!byArticle.has(item.row.id)) byArticle.set(item.row.id, []);
    byArticle.get(item.row.id).push(item);
  }
  const articles = new Set();
  try {
    for (const [id, items] of byArticle) {
      if (!(await opens(items[0].row))) { report.notOnShelf.push(id); continue; }
      for (const item of items.sort((a, b) => a.index - b.index)) {
        const { token } = item;
        report.occurrences += item.occurrences;
        item.articles.forEach((article) => articles.add(article));
        const expected = auxExpected(token);
        let card = null, lines = [], failure = null;
        try { card = (await slip(page, tok(page, item.index))).settled; lines = await miniLines(page); }
        catch (error) { failure = String(error.message || error).split('\n')[0].slice(0, 160); }
        const out = { article: id, index: item.index, s: token.s, b: token.b, r: token.r, occurrences: item.occurrences, articles: item.articles.size, card, lines,
          expected: expected?.seq ? { label: expected.label, seq: expected.seq, lines: expected.lines } : expected?.ambiguous ? { ambiguous: expected.ambiguous } : null, issues: [] };
        if (!card) out.issues.push(`no card: ${failure}`);
        else {
          report.tapped += 1;
          if (expected?.ambiguous) out.issues.push(`several entries have senses for the te-form: ${expected.ambiguous.join(' ')}`);
          else if (expected) {
            report.auxiliary += 1;
            if (card.word !== expected.label) out.issues.push(`the card is ${card.word}, not ${expected.label}`);
            if (JSON.stringify(lines) !== JSON.stringify(expected.lines)) out.issues.push(`its lines ${JSON.stringify(lines)} are not entry ${expected.seq}'s ${JSON.stringify(expected.lines)}`);
            if (!card.take || card.take.disabled) out.issues.push('its Save is not live');
            const borrowed = lines.filter((line) => expected.others.some((other) => other[6].includes(line)));
            if (borrowed.length) out.issues.push(`a line is another entry's read alike: ${borrowed.join(' / ')}`);
          } else report.plain += 1;
          if (token.b === 'いる' && lines.includes('to be needed')) out.issues.push('いる shows "to be needed"');
        }
        if (out.issues.length) report.exceptions.push(out);
        report.rows.push(out);
      }
    }
  } finally {
    await context.close();
    report.articles = [...articles];
    writeFileSync(resolve(evidence, `aux-sweep-${engine}.json`), `${JSON.stringify(report, null, 1)}\n`);
  }
  const list = (pick) => report.exceptions.filter(pick).map((x) => `${x.article} #${x.index} ${x.s}/${x.b}/${x.r}: ${x.issues.join('; ')}`).slice(0, 12);
  const iru = report.rows.filter((row) => row.b === 'いる');
  check('AUX.taps', `every verb written in kana right after the te-form, in every article on the shelf, opened its card (${report.tapped} of ${keys.size} distinct, ${report.occurrences} occurrences, ${report.articles.length} articles; not on the shelf: ${report.notOnShelf.join(', ') || 'none'})`,
    keys.size > 0 && report.tapped === keys.size && !report.notOnShelf.length, list((x) => !x.card));
  check('AUX.entries', `every one JMdict lists a use after the te-form for (${report.auxiliary} distinct) is that entry: its senses for the te-form as its lines, in JMdict's words; Save live; no line another entry's read alike`,
    report.auxiliary > 0 && !report.exceptions.some((x) => x.card && x.expected), list((x) => x.card && x.expected));
  check('AUX.iru', `no いる after the te-form shows "to be needed" (${iru.length} distinct, ${iru.reduce((n, row) => n + row.occurrences, 0)} occurrences)`,
    iru.length > 0 && !iru.some((row) => row.lines.includes('to be needed')), iru.filter((row) => row.lines.includes('to be needed')).map((row) => `${row.article} #${row.index}`));
  check('AUX.page-errors', 'the auxiliary sweep: no page errors', errors.length === 0, errors.slice(0, 5));
  record('AUX.plain', 'verbs after the te-form JMdict lists no such use for, answered as any word', report.rows.filter((row) => row.card && !row.expected)
    .map((row) => `${row.article} #${row.index} ${row.s}/${row.b}: ${row.card.word} ${row.lines.join(' / ')} (×${row.occurrences})`));
  record('AUX.counts', 'the auxiliary sweep\'s counts', { keys: report.keys, occurrences: report.occurrences, articles: report.articles.length, tapped: report.tapped, auxiliary: report.auxiliary, plain: report.plain });
}

try {
  if (!F0_OK && !PAST_F0) throw new Error('F0: the served fixtures moved; nothing below would mean what it says');
  if (!F0_OK) console.log('F0 failed; READING_TRUTH_PAST_F0=1 watches the browser anyway (a control\'s observation, never an acceptance)');
  for (engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    // every run names the engine that actually ran (W: some verifiers launched Chromium whatever KAIRO_BROWSER said)
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
      // L · every page error counts: the ResizeObserver loop error this line used to drop (R) was the slip's own
      // observer resizing the card inside its callback, fixed at its source (keepFloatingBeside)
      page.on('pageerror', (error) => errors.push(error.message));
      try { await body(page); }
      catch (error) {
        check(`${name}.error`, `${name} ran to the end`, false, String(error.stack || error).slice(0, 600));
        await page.screenshot({ path: resolve(evidence, `${engine}-${name}.png`), fullPage: false }).catch(() => {});
      } finally {
        check(`${name}.page-errors`, `${name}: no page errors`, errors.length === 0, errors);
        await context.close();
      }
    };
    if (run('reader')) await each('reader', readerCases);
    if (run('stable')) await each('stable', stableCases);
    if (run('sentence')) await each('sentence', sentenceCase);
    if (run('deck')) await each('deck', deckCase);
    if (run('guided')) await each('guided', guidedCase);
    if (run('r2')) await each('r2', r2Cases);
    if (run('aux')) await each('aux', auxCases);
    if (run('auxsweep')) {
      try { await auxSweepCase(browser, contextOptions); }
      catch (error) { check('AUX.error', 'the auxiliary sweep ran to the end', false, String(error.stack || error).slice(0, 600)); }
    }
    if (run('capture')) {
      try { await captureCase(browser, contextOptions); }
      catch (error) { check('capture.error', 'capture ran to the end', false, String(error.stack || error).slice(0, 600)); }
    }
    for (const answer of run('cold') ? ['held', 'fail'] : []) {
      try { await coldCase(browser, contextOptions, answer); }
      catch (error) { check(`A9.${answer}.error`, `A9 (${answer}) ran to the end`, false, String(error.stack || error).slice(0, 600)); }
    }
    if (run('unread')) {
      try { await unreadCase(browser, contextOptions); }
      catch (error) { check('A10.error', 'A10 ran to the end', false, String(error.stack || error).slice(0, 600)); }
    }
    if (run('sweep')) {
      try { await sweepCase(browser, contextOptions); }
      catch (error) { check('SWEEP.error', 'the sweep ran to the end', false, String(error.stack || error).slice(0, 600)); }
    }
    await browser.close();
  }
} finally {
  await host.close();
  const failed = rows.filter((row) => !row.recorded && !row.ok);
  writeFileSync(resolve(evidence, 'verify-reading-truth.json'), `${JSON.stringify({ site, served: identity.gitSha, artifactSha256: identity.artifactSha256,
    engines, versions, partial: ONLY.length ? ONLY : false, sweepIds: SWEEP_ONLY.length ? SWEEP_ONLY : false, pastF0: PAST_F0, failed: failed.length, rows }, null, 2)}\n`);
  if (ONLY.length || SWEEP_ONLY.length || PAST_F0) console.log(`PARTIAL RUN (${[...ONLY, ...SWEEP_ONLY, ...(PAST_F0 ? ['past F0'] : [])].join(', ')}): a control's scope, not an acceptance result`);
  console.log(`\n${rows.filter((row) => !row.recorded).length - failed.length} passed, ${failed.length} failed, ${rows.filter((row) => row.recorded).length} recorded · engines ${JSON.stringify(versions)} · evidence ${evidence}`);
  process.exitCode = failed.length ? 1 : 0;
}
