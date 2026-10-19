/**
 * Kanji-trust invariant over the shipped data (K01, K03, K04, K05, K07, K08). Node only, no browser.
 *   - every one of the 2,136 常用漢字表 (2010) forms resolves to a record with every official reading (no exceptions);
 *   - every KANJIDIC2 reading the sidecar projects is the shipped source's, and no listed reading is ever dropped;
 *   - the reading lookup rule finds 食 by たべる/た and 生 by いきる/うまれる/なま, normalises IME input, never
 *     concatenates two readings;
 *   - every Kodansha number round-trips to a glyph the app can open, in both editions;
 *   - every newspaper-frequency band is counted over the same universe the finder lists;
 *   - every Jōyō word page has words, or is one the shipped dictionaries truly cannot fill (and says so);
 *   - the lesson planner (lifted from corridor.js itself) puts every lane kanji in a lesson, tails included.
 * Each check is then run against an in-memory corruption and must fail (a control that cannot fail proves nothing).
 * Usage: node prototypes/corridor/tools/test-kanji-trust.mjs [--site <built site>]   (default: the checkout)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const siteAt = process.argv.indexOf('--site');
const CORRIDOR = siteAt >= 0 ? resolve(process.argv[siteAt + 1]) : resolve(REPO, 'prototypes/corridor');
const read = (path) => JSON.parse(readFileSync(resolve(CORRIDOR, path), 'utf8'));
// the rule is the checkout's (reference-core.js); the data is the site's, so a base site shows its data gaps, not a crash
const core = require(resolve(REPO, 'prototypes/corridor/reference-core.js'));
const official = JSON.parse(readFileSync(resolve(REPO, 'tools/fixtures/reference/joyo-2010.json'), 'utf8'));

function load() {
  const extra = read('data/share_alike/reference-extra.json');
  for (const table of ['kanjiReadings', 'officialReadings', 'kanjiRecords', 'jmdictWords', 'kanjiWithoutWords']) extra[table] ||= [];
  return {
    kanji: read('data/share_alike/kanji.json').kanji,
    kmeta: read('data/share_alike/strokes.json').meta,
    extra,
    skip: read('data/share_alike/skip.json'),
    kkld: read('data/share_alike/kkld.json'),
    dict: read('data/share_alike/dict.json').words,
    words: read('data/share_alike/words.json').words,
    kanken: read('data/proprietary_safe/kanken.json').levels,
    index: read('data/share_alike/dict-v2/index.json'),
  };
}
const clone = (value) => JSON.parse(JSON.stringify(value));

/** The record the app shows for a glyph: kanji.json's readings first, then KANJIDIC2's, then 常用漢字表's (adapter rule). */
function merged(data, glyph) {
  const row = data.extra.kanjiReadings.find((item) => item[0] === glyph);
  const added = data.extra.officialReadings.filter(([id]) => id === glyph).map(([, reading]) => reading);
  const base = data.kanji[glyph];
  const isOn = (reading) => core.readingKey(reading).startsWith('on:');
  return {
    exists: !!base || data.extra.kanjiRecords.some(([id]) => id === glyph),
    on: core.mergeReadings(base?.on, row?.[1], added.filter(isOn)),
    kun: core.mergeReadings(base?.kun, row?.[2], added.filter((reading) => !isOn(reading))),
  };
}

const checks = {
  'K01 every official form resolves to a record with a KANJIDIC2 reading row'(data) {
    const failures = [];
    for (const [glyph] of official.rows) {
      if (!merged(data, glyph).exists) failures.push(`${glyph}: no record`);
      if (!data.extra.kanjiReadings.some(([id]) => id === glyph)) failures.push(`${glyph}: no reading row`);
    }
    return failures;
  },
  'K01 every official reading of every Jōyō kanji is in its record (no exceptions)'(data) {
    const failures = [];
    for (const [glyph, readings] of official.rows) {
      const record = merged(data, glyph);
      const keys = new Set([...record.on, ...record.kun].map(core.readingKey));
      for (const reading of readings) if (!keys.has(core.readingKey(reading))) failures.push(`${glyph}:${reading}`);
    }
    return failures;
  },
  'K01 the projected readings are the shipped KANJIDIC2 strings, and no listed reading is dropped'(data) {
    const failures = [];
    const skipBy = new Map(data.skip.entries.map((entry) => [entry.literal, entry]));
    for (const [glyph, on, kun] of data.extra.kanjiReadings) {
      const source = skipBy.get(glyph);
      if (JSON.stringify([on, kun]) !== JSON.stringify([source?.readings.on, source?.readings.kun])) failures.push(`${glyph}: differs from skip.json`);
    }
    for (const [glyph, row] of Object.entries(data.kanji)) {
      const record = merged(data, glyph);
      for (const reading of [...row.on, ...row.kun]) if (![...record.on, ...record.kun].includes(reading)) failures.push(`${glyph}: dropped ${reading}`);
    }
    // complete, not only faithful: every kanji.json or Jōyō glyph KANJIDIC2 gives readings has its row
    const projected = new Set(data.extra.kanjiReadings.map(([glyph]) => glyph));
    for (const glyph of new Set([...Object.keys(data.kanji), ...official.rows.map(([g]) => g)])) {
      const source = skipBy.get(glyph);
      if ((source?.readings.on.length || source?.readings.kun.length) && !projected.has(glyph)) failures.push(`${glyph}: no projected row`);
    }
    return failures;
  },
  'K01 each official-only reading is one the table lists and neither kanji.json nor KANJIDIC2 has'(data) {
    const failures = [];
    const table = new Map(official.rows.map(([glyph, readings]) => [glyph, readings]));
    for (const [glyph, reading] of data.extra.officialReadings) {
      if (!table.get(glyph)?.includes(reading)) failures.push(`${glyph}:${reading} is not in the table`);
      const row = data.extra.kanjiReadings.find((item) => item[0] === glyph);
      const have = [...(data.kanji[glyph]?.on || []), ...(data.kanji[glyph]?.kun || []), ...(row?.[1] || []), ...(row?.[2] || [])];
      if (have.some((value) => core.readingKey(value) === core.readingKey(reading))) failures.push(`${glyph}:${reading} was already present`);
    }
    // and complete: every official reading neither kanji.json nor KANJIDIC2 has is named here
    const named = new Set(data.extra.officialReadings.map(([glyph, reading]) => `${glyph}:${reading}`));
    const skipBy = new Map(data.skip.entries.map((entry) => [entry.literal, entry]));
    for (const [glyph, readings] of official.rows) {
      const source = skipBy.get(glyph);
      const have = new Set([...(data.kanji[glyph]?.on || []), ...(data.kanji[glyph]?.kun || []), ...(source?.readings.on || []), ...(source?.readings.kun || [])].map(core.readingKey));
      for (const reading of readings) if (!have.has(core.readingKey(reading)) && !named.has(`${glyph}:${reading}`)) failures.push(`${glyph}:${reading} unnamed`);
    }
    return failures;
  },
  'K01 the named entries carry their everyday readings, and the sources are recorded'(data) {
    const failures = [];
    const want = { 生: ['うまれる', 'うむ', 'おう', 'はえる', 'はやす', 'き', 'なま', 'いきる'], 開: ['あく', 'あける', 'ひらける', 'ひらく'],
      汚: ['よごす', 'よごれる', 'きたない', 'けがす'], 中: ['ジュウ'], 剝: ['ハク', 'はがす', 'はぐ', 'はがれる', 'はげる'], 𠮟: ['シツ', 'しかる'] };
    for (const [glyph, list] of Object.entries(want)) {
      const record = merged(data, glyph);
      const keys = new Set([...record.on, ...record.kun].map(core.readingKey));
      for (const reading of list) if (!keys.has(core.readingKey(reading))) failures.push(`${glyph} lacks ${reading}`);
    }
    const source = data.extra.sources.find((item) => item.name.startsWith('常用漢字表'));
    if (!source || source.url !== official.url || source.fetchedAt !== official.fetchedAt) failures.push('常用漢字表 source, URL or fetch date missing');
    const trust = data.extra.audit?.kanjiTrust;
    if (trust?.readingSource?.release !== '3.6.2+20260803141815' || trust?.readingSource?.dictionaryDate !== '2026-08-03') failures.push('KANJIDIC2 release/date not recorded');
    return failures;
  },
  'K03 the lookup rule: full readings, stems, romaji, katakana, NFKC, IME, no concatenation'(data) {
    const failures = [];
    const romaji = (text) => ({ taberu: 'たべる', tabe: 'たべ', ta: 'た', ikiru: 'いきる', umareru: 'うまれる', nama: 'なま' })[text] || null;
    const query = (raw) => core.normalizeReadingQuery(raw, romaji);
    for (const [raw, want] of [['たべる', 'たべる'], ['taberu', 'たべる'], ['タベル', 'たべる'], ['ﾀﾍﾞﾙ', 'たべる'], ['ｔａｂｅｒｕ', 'たべる'],
      ['たべr', 'たべ'], ['taber', 'たべ'], ['TABERU', 'たべる'], [' た ', 'た'], ['xyz', ''], ['た・べ・る', 'たべる']]) {
      if (query(raw) !== want) failures.push(`query ${JSON.stringify(raw)} → ${JSON.stringify(query(raw))}, want ${want}`);
    }
    const readingsOf = (glyph) => { const record = merged(data, glyph); return [...record.on, ...record.kun]; };
    for (const [glyph, raw, level] of [['食', 'たべる', 2], ['食', 'た', 2], ['食', 'たべ', 1], ['生', 'いきる', 2], ['生', 'うまれる', 2], ['生', 'なま', 2],
      ['剝', 'はがす', 2], ['𠮟', 'しかる', 2], ['開', 'ひらける', 2], ['汚', 'よごれる', 2]]) {
      if (core.readingMatch(readingsOf(glyph), query(raw)) !== level) failures.push(`${glyph} by ${raw}: ${core.readingMatch(readingsOf(glyph), query(raw))}, want ${level}`);
    }
    if (core.readingMatch(readingsOf('介'), 'かいう')) failures.push('介 matched かいう: two readings were joined');
    return failures;
  },
  'K04 every Kodansha number round-trips to a glyph the app can open, both editions'(data) {
    const failures = [];
    const finder = lifted(data, failures);
    if (!finder) return failures;
    const openable = new Set([...Object.keys(data.kanji), ...data.extra.kanjiRecords.map(([glyph]) => glyph),
      ...data.extra.kanjiMetadata.map(([glyph]) => glyph), ...data.skip.entries.map((entry) => entry.literal)]);
    let mappings = 0;
    for (const [field, table] of [['ed2013', data.kkld.byNumber2013], ['ed1999', data.kkld.byNumber1999]]) {
      for (const [number, glyphs] of Object.entries(table)) {
        for (const glyph of glyphs) {
          mappings += 1;
          if (String(data.kkld.entries[glyph]?.[field]) !== number) failures.push(`${field} #${number} ${glyph}: entry says ${data.kkld.entries[glyph]?.[field]}`);
          if (!finder.kkldNumberGlyphs(field, number).includes(glyph)) failures.push(`${field} #${number}: the finder does not list ${glyph}`);
          if (!openable.has(glyph)) failures.push(`${field} #${number} ${glyph}: no record to open`);
        }
      }
    }
    if (mappings !== data.kkld.counts.ed2013 + data.kkld.counts.ed1999) failures.push(`${mappings} mappings, counts say ${data.kkld.counts.ed2013 + data.kkld.counts.ed1999}`);
    return failures;
  },
  'K05 every frequency band is fully reachable through the finder (100 · 400 · 499 · 1,150)'(data) {
    const failures = [];
    const finder = lifted(data, failures);
    if (!finder) return failures;
    const universe = new Set([...Object.keys(data.kanji), ...data.extra.kanjiRecords.map(([glyph]) => glyph)]);
    const rank = new Map(data.skip.entries.filter((entry) => entry.frequency != null).map((entry) => [entry.literal, entry.frequency]));
    for (const [lo, hi, size] of [[1, 100, 100], [101, 500, 400], [501, 1000, 499], [1001, 2501, 1150]]) {
      const members = [...universe].filter((glyph) => rank.get(glyph) >= lo && rank.get(glyph) <= hi);
      const hits = finder.kdxFrequencyHits(lo, hi);
      if (members.length !== size || hits.length !== size) failures.push(`${lo}–${hi}: data ${members.length}, finder ${hits.length}, want ${size}`);
      if (new Set(hits).size !== hits.length || hits.some((glyph) => !members.includes(glyph))) failures.push(`${lo}–${hi}: the finder lists a stranger or a repeat`);
      const first = finder.kdxGridShown(hits, 500, false);
      const all = finder.kdxGridShown(hits, 500, true);
      if (first.length !== Math.min(500, hits.length)) failures.push(`${lo}–${hi}: first page ${first.length}`);
      if (all.length !== hits.length) failures.push(`${lo}–${hi}: ${all.length} of ${hits.length} reachable once opened`);
    }
    return failures;
  },
  'K07 every Jōyō word page has words, or is one no shipped dictionary can fill'(data) {
    const failures = [];
    const buckets = core.kanjiWordBuckets(data.dict, data.words);
    const alternates = core.kanjiAltWords(data.dict);
    const filled = new Map(data.extra.jmdictWords);
    const without = new Set(data.extra.kanjiWithoutWords);
    for (const [glyph] of official.rows) {
      const has = buckets.get(glyph)?.size || alternates.get(glyph)?.length || filled.get(glyph)?.length;
      if (!has && !without.has(glyph)) failures.push(`${glyph}: empty and unexplained`);
      if (has && without.has(glyph)) failures.push(`${glyph}: listed as wordless but has words`);
    }
    const shii = alternates.get('椎') || [];
    const ai = alternates.get('藍') || [];
    if (!shii.some(([id, form]) => id === 'しいたけ' && form === '椎茸')) failures.push('椎 does not reach しいたけ／椎茸');
    if (!ai.some(([id, form]) => id === 'あい' && form === '藍')) failures.push('藍 does not reach あい／藍');
    return failures;
  },
  'K07 every build-time JMdict word keeps its entry, spelling, reading and sense; the wordless have none'(data) {
    const failures = [];
    const bySeq = new Map(data.index.entries.map((row) => [row[0], row]));
    const shards = new Map();
    const detail = (seq) => {
      const { offsetBasis, prime, shardCount } = data.index.sharding;
      let value = offsetBasis >>> 0;
      for (const ch of String(seq)) value = Math.imul(value ^ ch.charCodeAt(0), prime) >>> 0;
      const shard = (value & (shardCount - 1)).toString(16).padStart(2, '0');
      if (!shards.has(shard)) shards.set(shard, new Map(read(`data/share_alike/dict-v2/${shard}.json`).entries.map((entry) => [entry[0], entry])));
      return shards.get(shard).get(seq);
    };
    const applies = (list, value) => list.includes('*') || list.includes(value);
    for (const [glyph, rows] of data.extra.jmdictWords) {
      if (!rows.length || rows.length > 10) failures.push(`${glyph}: ${rows.length} words`);
      for (const [seq, form, reading, gloss, tags] of rows) {
        const entry = detail(seq);
        const kanjiForm = entry?.[1].find(([text]) => text === form);
        if (!bySeq.has(seq) || !kanjiForm) { failures.push(`${glyph} ${seq} ${form}: not a JMdict spelling`); continue; }
        if (!form.includes(glyph)) failures.push(`${glyph} ${form}: does not contain the kanji`);
        if (kanjiForm[2].includes('sK')) failures.push(`${glyph} ${form}: a search-only spelling`);
        if (JSON.stringify(kanjiForm[2]) !== JSON.stringify(tags)) failures.push(`${glyph} ${form}: tags differ`);
        if (!entry[2].some(([text, , , kanji]) => text === reading && applies(kanji, form))) failures.push(`${glyph} ${form}: ${reading} not allowed`);
        if (!entry[3].some((sense) => applies(sense[1], form) && applies(sense[2], reading) && sense[10].some(([text]) => text === gloss))) failures.push(`${glyph} ${form}: gloss "${gloss}" not of an allowed sense`);
      }
    }
    // complete: every Jōyō kanji no shipped word list names and JMdict writes with a displayable spelling has words
    const buckets = core.kanjiWordBuckets(data.dict, data.words);
    const alternates = core.kanjiAltWords(data.dict);
    const filled = new Set(data.extra.jmdictWords.map(([glyph]) => glyph));
    const written = new Map();
    for (const row of data.index.entries) for (const form of row[4]) for (const glyph of new Set([...form])) {
      if (!written.has(glyph)) written.set(glyph, []);
      written.get(glyph).push([row[0], form]);
    }
    for (const [glyph] of official.rows) {
      if (buckets.get(glyph)?.size || alternates.get(glyph)?.length || filled.has(glyph)) continue;
      const shown = (written.get(glyph) || []).find(([seq, form]) => !detail(seq)[1].find(([text]) => text === form)?.[2].includes('sK'));
      if (shown) failures.push(`${glyph}: JMdict writes ${shown[1]} (${shown[0]}) but the page has no words`);
    }
    for (const glyph of data.extra.kanjiWithoutWords) {
      for (const row of data.index.entries) {
        for (const form of row[4]) {
          if (!form.includes(glyph)) continue;
          const kanjiForm = detail(row[0])[1].find(([text]) => text === form);
          if (!kanjiForm?.[2].includes('sK')) failures.push(`${glyph}: JMdict writes ${form} (${row[0]})`);
        }
      }
    }
    return failures;
  },
  'K08 the lesson planner (from corridor.js) puts every lane kanji in a lesson, short tails included'(data) {
    const failures = [];
    const plan = lessonPlanner(data);
    for (const lane of ['10級', '9級', '8級', '7級', '6級', '5級', '4級', '3級', '準2級', '2級', '準1級', '1級']) {
      const lane_ = Object.entries(data.kanken).filter(([, row]) => row.kk === lane).map(([glyph]) => glyph).sort();
      const planned = plan('kanji', lane).flatMap((lesson) => lesson.words);
      if (JSON.stringify(planned) !== JSON.stringify(lane_)) failures.push(`${lane}: ${planned.length} planned of ${lane_.length}`);
      const ids = plan('kanji', lane).map((lesson) => lesson.id);
      if (new Set(ids).size !== ids.length) failures.push(`${lane}: duplicate lesson ids`);
    }
    for (const glyph of '鹿領額飼骨黙鼓齢鶴麓麺') {
      const lane = data.kanken[glyph]?.kk;
      if (!plan('kanji', lane).some((lesson) => lesson.words.includes(glyph))) failures.push(`${glyph} is in no lesson`);
    }
    // an existing lesson keeps its id and its ten items: the stored score still names the same lesson
    const first = plan('kanji', '10級')[0];
    if (first.id !== '10級-1' || first.words.join('') !== '一七三上下中九二五人') failures.push(`10級-1 changed: ${first.words.join('')}`);
    return failures;
  },
};

/** Lift top-level definitions verbatim from the site's corridor.js (as verify-learning-record does). */
function liftSource(names, patch = null) {
  const text = readFileSync(resolve(CORRIDOR, 'corridor.js'), 'utf8');
  const ast = ts.createSourceFile('corridor.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const picked = ast.statements.filter((statement) => {
    const declared = ts.isFunctionDeclaration(statement) ? [statement.name?.text]
      : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map((node) => node.name.getText(ast)) : [];
    return declared.some((name) => names.includes(name));
  });
  const found = new Set(picked.flatMap((statement) => (ts.isFunctionDeclaration(statement) ? [statement.name?.text]
    : statement.declarationList.declarations.map((node) => node.name.getText(ast)))));
  const missing = names.filter((name) => !found.has(name));
  let source = picked.map((statement) => statement.getText(ast)).join('\n');
  if (patch) {
    assert.equal(source.split(patch.from).length, 2, `control edit matches once: ${patch.from}`);
    source = source.replace(patch.from, patch.to);
  }
  return { missing, source };
}
const FINDER = ['kanjiReferenceIndexFor', 'kanjiReferenceIndex', 'kanjiReferenceRows', 'kanjiFinderUniverse', 'kdxFrequencyHits', 'kdxGridShown', 'kkldNumberGlyphs'];
let finderPatch = null;
/** The finder's pure lookups (number → glyphs, band → glyphs, grid page), lifted from corridor.js over this data. */
function lifted(data, failures) {
  const { missing, source } = liftSource(FINDER, finderPatch);
  if (missing.length) {
    failures.push(`corridor.js has no ${missing.join(', ')} (the finder filters or caps inside its renderers)`);
    return null;
  }
  const kanjiFreq = Object.fromEntries(data.skip.entries.filter((entry) => entry.frequency != null).map((entry) => [entry.literal, entry.frequency]));
  const context = vm.createContext({ D: { kanji: data.kanji, kkld: data.kkld, kanjiFreq, referenceExtra: data.extra } });
  return vm.runInContext(`${source}\n({ kkldNumberGlyphs, kdxFrequencyHits, kdxGridShown });`, context);
}

/** lessonPlan and its helpers, lifted verbatim from corridor.js and run over the shipped data. */
let plannerSource = null;
function lessonPlanner(data) {
  if (!plannerSource) {
    const text = readFileSync(resolve(CORRIDOR, 'corridor.js'), 'utf8');
    const ast = ts.createSourceFile('corridor.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const names = new Set(['JLPT_LANES', 'KANKEN_LANES', 'LANE_CACHE', 'laneMembers', 'LESSON_SIZE', 'lessonLaneIds', 'lessonPlan']);
    const picked = ast.statements.filter((statement) => {
      const declared = ts.isFunctionDeclaration(statement) ? [statement.name?.text]
        : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map((node) => node.name.getText(ast)) : [];
      return declared.some((name) => names.has(name));
    });
    assert.equal(picked.length, names.size, 'every planner definition comes from the current corridor.js');
    plannerSource = `${picked.map((statement) => statement.getText(ast)).join('\n')}\n({ lessonPlan });`;
  }
  const context = vm.createContext({ D: { dict: data.dict, kanken: data.kanken } });
  return vm.runInContext(plannerSource, context).lessonPlan;
}

/** In-memory corruptions: each must turn its check red. */
const controls = [
  ['K01 every official reading of every Jōyō kanji is in its record (no exceptions)', 'drop うまれる from 生',
    (data) => { const row = data.extra.kanjiReadings.find(([glyph]) => glyph === '生'); row[2] = row[2].filter((r) => !['う.まれる', 'うま.れる'].includes(r)); }],
  ['K01 every official reading of every Jōyō kanji is in its record (no exceptions)', 'drop the 常用漢字表 reading of 中',
    (data) => { data.extra.officialReadings = data.extra.officialReadings.filter(([glyph]) => glyph !== '中'); }],
  ['K01 every official form resolves to a record with a KANJIDIC2 reading row', 'lose the record of 剝',
    (data) => { data.extra.kanjiRecords = data.extra.kanjiRecords.filter(([glyph]) => glyph !== '剝'); }],
  ['K01 the projected readings are the shipped KANJIDIC2 strings, and no listed reading is dropped', 'invent a reading',
    (data) => { data.extra.kanjiReadings.find(([glyph]) => glyph === '開')[2].push('あけっぴろげ'); }],
  ['K03 the lookup rule: full readings, stems, romaji, katakana, NFKC, IME, no concatenation', 'stems only (the old matcher)',
    (data) => { for (const row of data.extra.kanjiReadings) row[2] = row[2].map((r) => r.split('.')[0]); for (const k of Object.values(data.kanji)) k.kun = k.kun.map((r) => r.split('.')[0]); }],
  ['K04 every Kodansha number round-trips to a glyph the app can open, both editions', 'a number pointing at an unopenable glyph',
    (data) => { data.kkld.byNumber2013['8'] = ['〇']; data.kkld.entries['〇'] = { ed2013: 8 }; }],
  ['K04 every Kodansha number round-trips to a glyph the app can open, both editions', 're-filter Kodansha numbers by the core layer',
    { from: "return [...(table?.[String(Number(number))] || [])];", to: "return [...(table?.[String(Number(number))] || [])].filter((c) => D.kanji[c]);" }],
  ['K05 every frequency band is fully reachable through the finder (100 · 400 · 499 · 1,150)', 're-cap the browse at its first page',
    { from: 'return open ? chars : chars.slice(0, cap);', to: 'return chars.slice(0, cap);' }],
  ['K05 every frequency band is fully reachable through the finder (100 · 400 · 499 · 1,150)', 'a band losing a member',
    (data) => { delete data.kanji['卸']; }],
  ['K07 every Jōyō word page has words, or is one no shipped dictionary can fill', 'the alternate spelling of しいたけ lost',
    (data) => { delete data.dict['しいたけ'].alt; }],
  ['K07 every build-time JMdict word keeps its entry, spelling, reading and sense; the wordless have none', 'a reading JMdict does not allow',
    (data) => { data.extra.jmdictWords.find(([glyph]) => glyph === '梨')[1][0][2] = 'りんご'; }],
  ['K08 the lesson planner (from corridor.js) puts every lane kanji in a lesson, short tails included', 'the old tail cut',
    null],
];

let failed = 0;
const base = load();
for (const [name, check] of Object.entries(checks)) {
  const failures = check(base);
  console.log(`${failures.length ? 'FAIL' : 'PASS'} ${name}${failures.length ? ` — ${failures.slice(0, 12).join(' · ')}${failures.length > 12 ? ` … (${failures.length})` : ''}` : ''}`);
  if (failures.length) failed += 1;
}
for (const [name, label, corrupt] of controls) {
  let failures;
  if (typeof corrupt === 'function') {
    const data = clone(base);
    corrupt(data);
    failures = checks[name](data);
  } else if (corrupt) {
    finderPatch = corrupt;
    failures = checks[name](base);
    finderPatch = null;
  } else {
    // the planner control re-lifts lessonPlan with the 09c9239d tail cut put back
    const saved = plannerSource;
    lessonPlanner(base);
    plannerSource = plannerSource.replace('const words = ids.slice(i, i + LESSON_SIZE);', 'const words = ids.slice(i, i + LESSON_SIZE);\n    if (words.length < 4) break;');
    assert.notEqual(plannerSource, saved ?? '', 'control edit applied');
    failures = checks[name](base);
    plannerSource = null;
  }
  console.log(`${failures.length ? 'PASS' : 'FAIL'} control "${label}" turns "${name.split(' ').slice(0, 1)}" red${failures.length ? ` — ${failures[0]}` : ' — IT STAYED GREEN'}`);
  if (!failures.length) failed += 1;
}
console.log(failed ? `\n${failed} kanji-trust check(s) failed.` : `\n${Object.keys(checks).length} kanji-trust checks and ${controls.length} controls passed.`);
process.exit(failed ? 1 : 0);
