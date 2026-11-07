/** Independent KT3 oracle and pure rejection controls. No product module is imported. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const PIN = Object.freeze({
  release: '3.6.2+20260803141815',
  archiveSha256: '5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6',
  dictionaryDate: '2026-08-03',
  databaseVersion: '2026-215',
  projectedRows: 10384,
  projectedSha256: '5449793753db312e7698c10e3b09238cc211e23b9ad55dcb662fc44b0b4c9b63',
});
const sha = (value) => createHash('sha256').update(value).digest('hex');
const serialize = (rows) => `${JSON.stringify(rows)}\n`;
const CASES = [['稿', ''], ['食', 'たべる'], ['剝', 'はがす']];

/** Pin the complete accepted projection, not merely its self-reported digest or three convenient rows. */
export function kt3LabelContract(extra) {
  assert.equal(extra?.schemaVersion, 4, 'KT3 reference schema');
  assert.equal(extra.kanjiFactsVersion, 1, 'KT3 facts schema');
  assert.equal(extra.audit?.kanjiFacts?.schemaVersion, 1, 'KT3 provenance schema');
  for (const [key, value] of Object.entries(PIN)) {
    assert.equal(extra.audit.kanjiFacts[key], value, `KT3 pinned ${key}`);
  }
  const rows = extra.kanjiFacts;
  assert(Array.isArray(rows), 'KT3 facts array');
  assert.equal(rows.length, PIN.projectedRows, 'KT3 complete fact count');
  let previous = -1;
  const byGlyph = new Map();
  const radical = (value) => Number.isInteger(value) && value >= 1 && value <= 214;
  for (const row of rows) {
    assert(Array.isArray(row) && row.length === 4, 'KT3 fact tuple');
    const [glyph, meanings, classical, nelson] = row;
    assert(typeof glyph === 'string' && [...glyph].length === 1 && !/[\uD800-\uDFFF]/u.test(glyph), 'KT3 Unicode scalar');
    assert(glyph.codePointAt(0) > previous, 'KT3 unique sorted glyphs');
    previous = glyph.codePointAt(0);
    assert(Array.isArray(meanings) && meanings.length && meanings.every((s) => typeof s === 'string' && s.trim()), 'KT3 complete English meanings');
    assert(radical(classical) && (nelson === null || radical(nelson)), 'KT3 independent radical fields');
    byGlyph.set(glyph, meanings);
  }
  assert.equal(sha(serialize(rows)), PIN.projectedSha256, 'KT3 independently hashed pinned projection');
  const cases = Object.fromEntries(CASES.map(([glyph, reading]) => {
    const meanings = byGlyph.get(glyph);
    assert(meanings?.length, `KT3 source contains ${glyph}`);
    const head = reading ? `${glyph} ${reading}` : glyph;
    const expected = `${head} — ${meanings.join('; ').toLowerCase()}`;
    return [glyph, { glyph, reading, head, primary: meanings[0].toLowerCase(), expected }];
  }));
  return { source: { ...PIN }, cases };
}

/** All checks consume independently derived facts; exactness rejects extra or omitted senses and appended text. */
export function assertKt3Observation(got, expected) {
  const detail = JSON.stringify(got);
  assert.equal(got.text, expected.glyph, `KT3 visible glyph: ${detail}`);
  assert.equal(got.label?.split(' — ')[0], expected.head, `KT3 glyph-first and reading: ${detail}`);
  assert.equal(got.label?.split(' — ')[1]?.split('; ')[0], expected.primary, `KT3 primary meaning: ${detail}`);
  assert.equal(got.label, expected.expected, `KT3 complete source-derived label: ${detail}`);
  assert.equal(got.byRole, 1, `KT3 exactly one accessible action: ${detail}`);
}

export const KT3_LABEL_ANCHOR = "b.setAttribute('aria-label', kdxGlyphName(c, readingOf?.(c) || ''));";
export const KT3_CONTROL_MUTATIONS = Object.freeze({
  // The original KT3 gloss-only control remains byte-for-byte unchanged.
  'gloss-only': "if (D.kanji[c]) b.setAttribute('aria-label', D.kanji[c].m);",
  'missing-glyph': "b.setAttribute('aria-label', kdxGlyphName(c, readingOf?.(c) || '').slice(c.length).trimStart());",
  'missing-primary-meaning': "{ const label = kdxGlyphName(c, readingOf?.(c) || ''); const [head, meanings] = label.split(' — '); b.setAttribute('aria-label', head + ' — ' + meanings.split('; ').slice(1).join('; ')); }",
});

// The already-admitted ci-contracts test calls this; importing from the native verifier runs no tests.
export function registerKt3ProofTests() {
  const extra = JSON.parse(readFileSync(new URL('../data/share_alike/reference-extra.json', import.meta.url), 'utf8'));
  const contract = kt3LabelContract(extra);
  const observation = (expected) => ({ text: expected.glyph, label: expected.expected, byRole: 1 });
  const changed = (fn) => { const copy = structuredClone(extra); fn(copy); return copy; };
  const expectRejection = (name, make, message) => test(name, () => assert.throws(() => kt3LabelContract(make()), message));
  for (const [key] of Object.entries(PIN)) {
    expectRejection(`KT3 rejects foreign ${key}`, () => changed((x) => { x.audit.kanjiFacts[key] = 'foreign'; }), new RegExp(`KT3 pinned ${key}`));
  }
  expectRejection('KT3 rejects a missing fact', () => changed((x) => x.kanjiFacts.pop()), /complete fact count/);
  expectRejection('KT3 rejects duplicate or unsorted glyphs', () => changed((x) => { x.kanjiFacts[1][0] = x.kanjiFacts[0][0]; }), /unique sorted glyphs/);
  expectRejection('KT3 rejects an edited meaning even with unchanged self-reported pin', () => changed((x) => { x.kanjiFacts.find(([glyph]) => glyph === '稿')[1].push('unrelated text'); }), /independently hashed pinned projection/);
  expectRejection('KT3 rejects empty meanings', () => changed((x) => { x.kanjiFacts[0][1] = []; }), /complete English meanings/);
  expectRejection('KT3 rejects an invalid radical', () => changed((x) => { x.kanjiFacts[0][2] = 215; }), /independent radical fields/);
  const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');
  test('KT3 native mutation anchor occurs exactly once', () => assert.equal(source.split(KT3_LABEL_ANCHOR).length, 2));
  for (const expected of Object.values(contract.cases)) {
    test(`KT3 accepts complete pinned ${expected.glyph} label`, () => assert.doesNotThrow(() => assertKt3Observation(observation(expected), expected)));
    const mutants = [
      ['missing visible glyph', { text: '' }, /visible glyph/],
      ['appended unrelated text', { label: `${expected.expected}; unrelated text` }, /complete source-derived label/],
      ['missing secondary senses', { label: `${expected.head} — ${expected.primary}` }, /complete source-derived label/],
      ['absent accessible action', { byRole: 0 }, /exactly one accessible action/],
      ['duplicate accessible action', { byRole: 2 }, /exactly one accessible action/],
    ];
    if (expected.reading) mutants.push(['missing reading', { label: expected.expected.replace(` ${expected.reading}`, '') }, /glyph-first and reading/]);
    for (const [name, patch, message] of mutants) {
      test(`KT3 rejects ${expected.glyph}: ${name}`, () => assert.throws(() => assertKt3Observation({ ...observation(expected), ...patch }, expected), message));
    }
    for (const [name, mutation] of Object.entries(KT3_CONTROL_MUTATIONS)) {
      test(`KT3 rejects actual ${name} route mutation for ${expected.glyph}`, () => {
        let label = null;
        // Execute the exact native replacement fragment; no browser or product oracle is used.
        runInNewContext(mutation, {
          c: expected.glyph, readingOf: () => expected.reading,
          kdxGlyphName: () => expected.expected,
          D: { kanji: { [expected.glyph]: { m: expected.primary } } },
          b: { setAttribute: (_, value) => { label = value; } },
        });
        assert.throws(() => assertKt3Observation({ ...observation(expected), label }, expected),
          name === 'missing-primary-meaning' ? /primary meaning/ : /glyph-first and reading/);
      });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) registerKt3ProofTests();
