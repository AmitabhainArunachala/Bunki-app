#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const core = require('../skip-core.js');
const data = JSON.parse(readFileSync(resolve(HERE, '../data/share_alike/skip.json'), 'utf8'));
const byLiteral = new Map(data.entries.map((entry) => [entry.literal, entry]));
const fixture = {
  entries: [
    { literal: '情', canonical: ['1-3-8'], alternatives: [{ code: '1-1-10', misclass: 'posn' }], radical: 61 },
    { literal: '明', canonical: ['1-4-4'], alternatives: [], radical: 72 },
    { literal: '寺', canonical: ['2-3-3'], alternatives: [], radical: 41 },
    { literal: '国', canonical: ['3-3-5'], alternatives: [], radical: 31 },
    { literal: '雨', canonical: ['4-8-1'], alternatives: [], radical: 173 },
    { literal: '生', canonical: ['4-5-2'], alternatives: [], radical: 100 },
    { literal: '中', canonical: ['4-4-3'], alternatives: [], radical: 2 },
    { literal: '大', canonical: ['4-3-4'], alternatives: [], radical: 37 },
    { literal: '王', canonical: ['4-4-1'], alternatives: [], radical: 96 },
    // Appears after 情's alternate hit: all canonical matches must still rank first.
    { literal: '甲', canonical: ['1-1-10'], alternatives: [{ code: '1-1-10', misclass: 'stroke_count' }], radical: 61 },
  ],
};
function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}
freezeDeep(fixture);
freezeDeep(data);
const literals = (hits) => hits.map((hit) => hit.literal);

test('UMD exposes exactly the same public API in a browser without dependencies', () => {
  const sandbox = {};
  vm.runInNewContext(readFileSync(resolve(HERE, '../skip-core.js'), 'utf8'), sandbox);
  assert.deepEqual(Object.keys(sandbox.BunkiSkipCore), Object.keys(core));
  assert.equal(sandbox.BunkiSkipCore.parseQuery('ＳＫＩＰ：１−３−８').normalized, '1-3-8');
  assert.equal(core.match, core.search);
  assert.ok(Object.isFrozen(core));
});

test('normalizes fullwidth ASCII, case, whitespace and common hyphens', () => {
  for (const raw of ['1-3-8', 'skip:1-3-8', 'SkIp : 1 - 3 - 8', '　ＳＫＩＰ：０１－０３－０８　',
    ...['‐', '‑', '‒', '–', '—', '―', '−', '﹘', '﹣'].map((h) => `1${h}3${h}8`)]) {
    const result = core.parseQuery(raw);
    assert.equal(result.kind, 'skip', raw);
    assert.equal(result.normalized, '1-3-8', raw);
    assert.deepEqual(result.parts, [1, 3, 8], raw);
    assert.equal(result.complete, true);
    assert.equal(result.raw, raw);
  }
});

test('partial fields and whole-field wildcards are unambiguous', () => {
  for (const [raw, parts] of [
    ['1-3', [1, 3, null]], ['1-3-', [1, 3, null]], ['1--8', [1, null, 8]],
    ['1-*-8', [1, null, 8]], ['1-?-8', [1, null, 8]], ['skip:1', [1, null, null]],
    ['*-3-8', [null, 3, 8]], ['skip:', [null, null, null]],
    ['skip:*', [null, null, null]], ['skip:?', [null, null, null]],
    ['skip:4-8', [4, 8, null]], ['skip:*-8-9', [null, 8, 9]],
  ]) {
    const result = core.parseQuery(raw);
    assert.equal(result.kind, 'skip', raw);
    assert.deepEqual(result.parts, parts, raw);
    assert.equal(result.complete, false);
  }
});

test('ordinary text is not hijacked, including kana prolonged-sound marks', () => {
  for (const raw of ['', null, undefined, '1', '４', '*', '?', '情', 'コーヒー',
    '東京', 'skip', 'skip meaning', 'left-right', '㡀', '﨑']) {
    assert.equal(core.parseQuery(raw).kind, 'text', String(raw));
    assert.deepEqual(core.search(fixture, raw), []);
  }
  assert.equal(core.parseQuery('﨑').normalized, '﨑');
});

test('SKIP intent with malformed syntax produces invalid rather than text', () => {
  for (const raw of ['5-3-8', '0-3-8', '1-0-8', '1-3-0', '1-3-x', '1-3-8-61',
    '1---8', '1-3-8junk', 'skip:abc', 'skip:1.5-3-8', 'skip:1e0-3-8',
    'skip:1 2-3-8', 'skip:1-**-8', 'skip:1-+3-8', '-1-3-8', 'skip:-1-3-8',
    'skip:1-9007199254740992-8', 'skip:NaN', 'skip:Infinity', 'skip:1/3/8',
    'skip:<script>', 'SKIP：４－３－５']) {
    const result = core.parseQuery(raw);
    assert.equal(result.kind, 'invalid', raw);
    assert.ok(result.error, raw);
    assert.deepEqual(core.search(fixture, result), [], raw);
  }
});

test('solid second field is total strokes and third is subtype 1–4', () => {
  for (const subtype of [1, 2, 3, 4]) {
    assert.equal(core.parseQuery(`4-8-${subtype}`).kind, 'skip');
  }
  for (const query of ['4-8-5', '4-8-8', '4-*-5', 'skip:4-?-99']) {
    assert.equal(core.parseQuery(query).kind, 'invalid', query);
  }
  assert.equal(core.parseQuery('1-8-8').kind, 'skip');
  assert.deepEqual(literals(core.search(fixture, '4-8-1')), ['雨']);
  assert.deepEqual(literals(core.search(fixture, '4-4-*')), ['中', '王']);
  assert.equal(core.patterns[3].second, 'Total strokes');
  assert.match(core.rules.precedence, /lowest/);
  assert.equal(core.solidSubtypes.length, 4);
});

test('all four patterns return fixture matches', () => {
  for (const [query, literal] of [['1-4-4', '明'], ['2-3-3', '寺'], ['3-3-5', '国'], ['4-3-4', '大']]) {
    assert.deepEqual(literals(core.search(fixture, query)), [literal]);
  }
  assert.deepEqual(core.search(fixture, '1-99-99'), []);
});

test('alternates are opt-in, marked, deduped and ordered after canonical hits', () => {
  assert.deepEqual(literals(core.search(fixture, '1-1-10')), ['甲']);
  const hits = core.search(fixture, '1-1-10', { includeAlternates: true });
  assert.deepEqual(literals(hits), ['甲', '情']);
  assert.equal(hits[0].matchType, 'canonical');
  assert.equal(hits[0].misclass, null);
  assert.equal(hits[1].matchType, 'alternate');
  assert.equal(hits[1].misclass, 'posn');
  assert.equal(hits[1].matchedCode, '1-1-10');
  assert.deepEqual(hits[1].canonical, ['1-3-8']);
  assert.deepEqual(literals(core.search(fixture, '1-1-10', { includeAlternates: 'true' })), ['甲']);
  const all = core.search(fixture, 'skip:', { includeAlternates: true });
  assert.equal(all.length, fixture.entries.length);
  assert.ok(all.every((hit) => hit.matchType === 'canonical'));
});

test('later duplicate canonical record outranks earlier alternate and multiple codes dedupe', () => {
  const rows = [
    { literal: '情', canonical: ['1-3-8'], alternatives: [{ code: '2-3-4', misclass: 'posn' }] },
    { literal: '情', canonical: ['2-3-4', '2-3-5'], alternatives: [] },
    { literal: '情', canonical: ['2-3-4'], alternatives: [] },
  ];
  const hits = core.search(rows, '2-3-*', { includeAlternates: true });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].matchType, 'canonical');
  assert.equal(hits[0].matchedCode, '2-3-4');
});

test('all four alternate categories are independently preserved', () => {
  for (const misclass of Object.keys(core.misclassifications)) {
    const rows = [{ literal: '試', canonical: ['1-7-6'], alternatives: [{ code: '1-6-6', misclass }] }];
    assert.equal(core.search(rows, '1-6-6').length, 0);
    assert.equal(core.search(rows, '1-6-6', { includeAlternates: true })[0].misclass, misclass);
  }
});

test('radical is an independent optional number filter, not a SKIP fourth field', () => {
  assert.deepEqual(literals(core.search(fixture, '1-*-*', { radical: 61 })), ['情', '甲']);
  assert.deepEqual(literals(core.search(fixture, '1-*-*', { radical: '72' })), ['明']);
  assert.deepEqual(literals(core.search(fixture, '1-1-10', { radical: 61, includeAlternates: true })), ['甲', '情']);
  assert.deepEqual(core.search(fixture, '1-1-10', { radical: 72, includeAlternates: true }), []);
  for (const radical of [0, -1, 215, 1.5, 'heart', true, {}, []]) {
    assert.deepEqual(core.search(fixture, 'skip:', { radical }), [], String(radical));
  }
  for (const radical of [undefined, null, '']) {
    assert.equal(core.search(fixture, 'skip:', { radical }).length, fixture.entries.length);
  }
});

test('invalid parsed objects, missing data and malformed records fail safely', () => {
  for (const query of [{}, { kind: 'skip' }, { kind: 'skip', parts: [1, 3] },
    { kind: 'skip', parts: [4, 8, 9] }, { kind: 'skip', parts: ['1', 3, 8] }]) {
    assert.deepEqual(core.search(fixture, query), []);
  }
  for (const doc of [null, undefined, {}, { entries: {} }]) {
    assert.deepEqual(core.search(doc, '1-3-8'), []);
  }
  assert.deepEqual(core.search([null, {}, { literal: '試', canonical: [null, '4-8-9'] }], 'skip:'), []);
});

test('search is pure and does not mutate frozen inputs, options, or parsed query', () => {
  const before = JSON.stringify(fixture);
  const parsed = freezeDeep(core.parseQuery('1-*-*'));
  const options = Object.freeze({ includeAlternates: true, radical: null });
  const result = core.search(fixture, parsed, options);
  assert.equal(JSON.stringify(fixture), before);
  assert.notEqual(result[0], fixture.entries[0]);
  assert.deepEqual(core.search(fixture, parsed, options), result);
});

test('actual sidecar includes every pinned entry and all categories with explicit provenance', () => {
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.pool, 'share_alike');
  assert.equal(data.licence, 'CC BY-SA 4.0');
  assert.equal(data.entries.length, 10384);
  assert.equal(byLiteral.size, data.entries.length);
  assert.equal(data.counts.canonicalCodes, 10384);
  assert.equal(data.counts.alternateCodes, 942);
  assert.deepEqual(data.counts.alternateCategories, {
    posn: 421, stroke_count: 211, stroke_and_posn: 24, stroke_diff: 286,
  });
  assert.deepEqual(data.counts.canonicalPatterns, { 1: 6763, 2: 2489, 3: 848, 4: 284 });
  assert.match(data.sources[0].attribution, /Jack Halpern/);
  assert.equal(data.sources[0].permissionEffectiveDate, '2014-12-12');
  assert.match(data.sources[0].url, /kanji\.org/);
  assert.match(data.provenance.licensingConflict.notice, /Noncommercial/);
  assert.equal(data.sources[2].sha256, '5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6');
});

test('actual known codes verify pattern meanings and solid subtype precedence', () => {
  for (const [literal, code] of [
    ['情', '1-3-8'], ['明', '1-4-4'], ['寺', '2-3-3'], ['国', '3-3-5'],
    ['雨', '4-8-1'], ['下', '4-3-1'], ['垂', '4-8-2'], ['中', '4-4-3'],
    ['大', '4-3-4'], ['王', '4-4-1'], ['生', '4-5-2'], ['一', '4-1-4'],
  ]) {
    assert.ok(byLiteral.get(literal).canonical.includes(code), `${literal} ${code}`);
    assert.ok(core.search(data, code).some((hit) => hit.literal === literal), literal);
  }
  assert.ok(!core.search(data, '4-4-2').some((hit) => hit.literal === '王'));
  assert.ok(!core.search(data, '4-5-3').some((hit) => hit.literal === '生'));
});

test('actual fallback coverage is independent of the limited Corridor catalog', () => {
  const catalog = JSON.parse(readFileSync(resolve(HERE, '../data/share_alike/kanji.json'), 'utf8')).kanji;
  const outside = data.entries.filter((entry) => !Object.hasOwn(catalog, entry.literal));
  assert.equal(outside.length, 7808);
  for (const entry of data.entries) {
    assert.ok(Array.isArray(entry.readings.on));
    assert.ok(Array.isArray(entry.readings.kun));
    assert.ok(Array.isArray(entry.readings.nanori));
    assert.ok(Array.isArray(entry.meanings));
    assert.ok(entry.radical === null || Number.isInteger(entry.radical) && entry.radical >= 1 && entry.radical <= 214);
  }
  const fallback = outside.find((entry) => entry.meanings.length && entry.readings.on.length && !entry.sourceIssues);
  assert.ok(fallback);
  const hit = core.search(data, fallback.canonical[0]).find((entry) => entry.literal === fallback.literal);
  assert.deepEqual(hit.readings, fallback.readings);
  assert.deepEqual(hit.meanings, fallback.meanings);
});

test('source anomalies are retained but never passed off as valid classifications', () => {
  const issues = data.entries.flatMap((entry) => (entry.sourceIssues || []).map((issue) =>
    [entry.literal, issue.code, issue.misclass]));
  assert.deepEqual(issues, [
    ['㡀', '4-2-5', null], ['口', '3-3-0', 'posn'],
    ['囗', '3-3-0', 'posn'], ['門', '3-8-0', 'posn'],
  ]);
  assert.deepEqual(byLiteral.get('㡀').canonical, ['4-2-5']);
  assert.equal(core.parseQuery('4-2-5').kind, 'invalid');
  assert.equal(core.search(data, '4-2-5', { includeAlternates: true }).length, 0);
  assert.ok(!core.search(data, '4-*-*').some((entry) => entry.literal === '㡀'));
  assert.deepEqual(byLiteral.get('搔').sourceNormalizations, [{ from: '1-3-09', to: '1-3-9', misclass: null }]);
  assert.ok(core.search(data, '1-3-09').some((entry) => entry.literal === '搔'));
});

test('every valid actual canonical and alternate code is reachable, deduped, and correctly ordered', () => {
  const cache = new Map();
  const queryHits = (code, alternates) => {
    const key = `${code}/${alternates}`;
    if (!cache.has(key)) {
      const hits = core.search(data, code, { includeAlternates: alternates });
      assert.equal(new Set(literals(hits)).size, hits.length, key);
      let alternateStarted = false;
      for (const hit of hits) {
        if (hit.matchType === 'alternate') alternateStarted = true;
        else assert.equal(alternateStarted, false, `${key}: canonical hit after alternate`);
      }
      cache.set(key, new Map(hits.map((hit) => [hit.literal, hit])));
    }
    return cache.get(key);
  };
  let canonicalCount = 0;
  let alternateCount = 0;
  for (const entry of data.entries) {
    for (const code of entry.canonical) {
      if (core.parseQuery(code).kind !== 'skip') continue;
      const hit = queryHits(code, false).get(entry.literal);
      assert.ok(hit, `${entry.literal}: ${code}`);
      assert.equal(hit.matchType, 'canonical');
      canonicalCount++;
    }
    for (const alt of entry.alternatives) {
      if (core.parseQuery(alt.code).kind !== 'skip') continue;
      const hit = queryHits(alt.code, true).get(entry.literal);
      assert.ok(hit, `${entry.literal}: ${alt.code}/${alt.misclass}`);
      if (!entry.canonical.includes(alt.code)) assert.equal(hit.matchType, 'alternate');
      alternateCount++;
    }
  }
  assert.equal(canonicalCount, 10383);
  assert.equal(alternateCount, 939);
  assert.equal(core.search(data, 'skip:').length, 10383);
  console.log(`Verified ${canonicalCount} canonical and ${alternateCount} alternate memberships across ${cache.size} query modes.`);
});

const archiveIndex = process.argv.indexOf('--archive');
test('optional raw pinned archive reproduces byte-for-byte sidecar and preserves stripped corpus output', {
  skip: archiveIndex === -1 ? 'Pass --archive /path/to/pinned.zip for full raw-source parity.' : false,
}, () => {
  const archive = process.argv[archiveIndex + 1];
  assert.ok(archive, '--archive requires a file');
  const corpusPython = process.env.KAIRO_CORPUS_PYTHON || 'python3';
  const pythonOptions = { encoding: 'utf8', timeout: 120_000, killSignal: 'SIGKILL' };
  console.log(`Raw SKIP parity interpreter: ${corpusPython}; timeout: ${pythonOptions.timeout} ms per call.`);
  const result = spawnSync(corpusPython, [
    resolve(HERE, 'build-skip-data.py'), '--archive', archive, '--check',
  ], pythonOptions);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout || `${corpusPython} ended with signal ${result.signal}`);
  const parity = spawnSync(corpusPython, ['-c', `
import sys, json, zipfile
from pathlib import Path
root = Path(sys.argv[1])
sys.path.insert(0, str(root / 'corpus/src'))
from corpus.sources.jmdict.kanjidic import strip_character, OUTPUT_KEYS
with zipfile.ZipFile(sys.argv[2]) as z:
    source = json.loads(z.read(z.namelist()[0]))
sidecar = json.loads((root / 'prototypes/corridor/data/share_alike/skip.json').read_text())
lookup = {e['literal']: e for e in sidecar['entries']}
for char in source['characters']:
    expected = [(q['value'], q['skipMisclassification']) for q in char['queryCodes'] if q['type'] == 'skip']
    if not expected:
        continue
    entry = lookup[char['literal']]
    actual = [(c, None) for c in entry['canonical']] + [(a['code'], a['misclass']) for a in entry['alternatives']]
    normalized = [('-'.join(str(int(p)) for p in c.split('-')), m) for c,m in expected]
    assert sorted(normalized, key=str) == sorted(actual, key=str), char['literal']
    stripped = strip_character(char)
    assert set(stripped) == set(OUTPUT_KEYS)
    assert 'queryCodes' not in stripped and 'skip' not in stripped
    assert entry['readings']['on'] == list(dict.fromkeys(stripped['on_readings']))
    assert entry['readings']['kun'] == list(dict.fromkeys(stripped['kun_readings']))
    assert entry['meanings'] == list(dict.fromkeys(stripped['meanings']))
    assert entry['readings']['nanori'] == list(dict.fromkeys(stripped['nanori']))
print('All raw SKIP values/categories and fallback text match; stripped allowlist is intact.')
`, resolve(HERE, '../../..'), archive], pythonOptions);
  assert.ifError(parity.error);
  assert.equal(parity.status, 0, parity.stderr || parity.stdout || `${corpusPython} ended with signal ${parity.signal}`);
  console.log(parity.stdout.trim());
});
