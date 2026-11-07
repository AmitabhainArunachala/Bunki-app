/**
 * Pure K02 reference checks. No browser, build, learner-record writes or network.
 * node prototypes/corridor/tools/test-kanji-reference-facts.mjs [--archive /absolute/pinned.zip]
 * --archive adds independent full-source parity and corruption controls; without it the tests do not claim raw parity.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { buildReferenceData, kanjiFactsProjection } from '../../../tools/build-reference-data.mjs';

const core = createRequire(import.meta.url)('../reference-core.js');
const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const extra = read('../data/share_alike/reference-extra.json');
const kanji = read('../data/share_alike/kanji.json').kanji;
const clone = (value) => JSON.parse(JSON.stringify(value));
const digest = (value) =>
  createHash('sha256')
    .update(`${JSON.stringify(value)}\n`)
    .digest('hex');
const fact = (glyph) => core.kanjiReferenceFacts(extra, glyph);
const factsOnly = (source = extra) => ({
  schemaVersion: source.schemaVersion,
  kanjiFactsVersion: source.kanjiFactsVersion,
  kanjiFacts: source.kanjiFacts,
  audit: { kanjiFacts: source.audit.kanjiFacts },
});

test('complete reference facts retain their exact projection hash and named source', () => {
  assert(core.validateKanjiFacts(extra));
  assert.equal(extra.kanjiFacts.length, 10384);
  assert.equal(extra.kanjiFacts.filter((row) => row[3] !== null).length, 721);
  assert.equal(digest(extra.kanjiFacts), extra.audit.kanjiFacts.projectedSha256);
  assert.equal(
    fact('酒').referenceSource.archiveSha256,
    '5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6',
  );
  assert.equal(fact('酒').referenceSource.release, '3.6.2+20260803141815');
  assert.equal(fact('酒').referenceSource.sourceId, '酒');
});

test('classical and Nelson are independent: all 57 old disagreements are accounted for', () => {
  const mismatches = Object.entries(kanji).filter(
    ([glyph, old]) => fact(glyph) && old.rad !== fact(glyph).radicalSchemes.classical,
  );
  assert.equal(mismatches.length, 57);
  assert.equal(
    mismatches.filter(([glyph, old]) => old.rad === fact(glyph).radicalSchemes.nelson).length,
    44,
  );
  assert.equal(
    mismatches.filter(([glyph, old]) => old.rad !== fact(glyph).radicalSchemes.nelson).length,
    13,
  );
  assert.deepEqual(fact('酒').radicalSchemes, { classical: 164, nelson: 85 });
  assert.deepEqual(fact('頼').radicalSchemes, { classical: 181, nelson: null });
  assert.deepEqual(fact('之').radicalSchemes, { classical: 4, nelson: 8 });
  assert.equal(kanji.頼.rad, 154, 'Reference correction never rewrites the old lesson source');
});

test('all senses and long glosses remain accessible; no invented facts for source-absent parts', () => {
  for (const [glyph, meanings] of [
    ['月', ['month', 'moon']],
    ['森', ['forest', 'woods']],
    ['楽', ['music', 'comfort', 'ease']],
    ['長', ['long', 'leader', 'superior', 'senior']],
    ['𠮟', ['scold', 'reprove']],
    ['冫', ['two-stroke water radical or ice radical (no. 15)']],
    ['蕾', ['bud (plants, mushrooms not yet opened)']],
  ])
    assert.deepEqual(fact(glyph).completeMeanings, meanings);
  for (const glyph of ['劦', '厽', '壴', '夋', '甶', '菐', '森木', '\uD800'])
    assert.equal(fact(glyph), null);
  assert(
    core.validateKanjiFacts(extra),
    'A source-absent glyph is distinct from an unavailable table',
  );
});

test('old/malformed supplements fail closed rather than claiming complete reference facts', () => {
  assert.equal(core.validateKanjiFacts(null), false);
  assert.equal(core.kanjiReferenceFacts({ schemaVersion: 3 }, '酒'), null);
  const corruptions = [
    (copy) => {
      copy.schemaVersion = 3;
    },
    (copy) => {
      copy.kanjiFactsVersion = 2;
    },
    (copy) => {
      copy.audit.kanjiFacts.archiveSha256 = '0'.repeat(64);
    },
    (copy) => {
      copy.audit.kanjiFacts.dictionaryDate = '2020-01-01';
    },
    (copy) => {
      copy.audit.kanjiFacts.projectedRows--;
    },
    (copy) => {
      copy.kanjiFacts.pop();
    },
    (copy) => {
      copy.kanjiFacts[1][0] = copy.kanjiFacts[0][0];
    },
    (copy) => {
      copy.kanjiFacts[0][1] = [''];
    },
    (copy) => {
      copy.kanjiFacts[0][2] = 215;
    },
    (copy) => {
      copy.kanjiFacts[0][3] = undefined;
    },
  ];
  for (const corrupt of corruptions) {
    const copy = clone(factsOnly());
    corrupt(copy);
    assert.equal(core.validateKanjiFacts(copy), false);
    assert.equal(core.kanjiReferenceFacts(copy, '酒'), null);
  }
});

test('catalog gains searchable full reference meanings without changing lesson meanings or membership', () => {
  const selected = Object.fromEntries(
    ['酒', '頼', '月', '森', '劦'].map((glyph) => [glyph, kanji[glyph]]),
  );
  const input = { kanji: selected, extra: factsOnly() };
  const before = JSON.stringify(input);
  const catalog = core.createCatalog(input);
  const legacy = core.createCatalog(input, { includeCommitted: false });
  assert.deepEqual(catalog.stats.counts, legacy.stats.counts);
  const collection = catalog.collections.find((row) => row.id === 'kanken:unknown');
  const entries = [
    ...new Map(
      catalog.collections.flatMap((row) => row.entries).map((row) => [row.id, row]),
    ).values(),
  ];
  for (const entry of entries)
    assert.deepEqual(entry.meanings, selected[entry.id].m ? [selected[entry.id].m] : []);
  assert(core.searchEntries(entries, 'moon').some((row) => row.id === '月'));
  assert(core.searchEntries(entries, 'request').some((row) => row.id === '頼'));
  assert.equal(
    core.searchEntries(
      legacy.collections.flatMap((row) => row.entries),
      'moon',
    ).length,
    0,
  );
  assert(collection);
  const sake = entries.find((row) => row.id === '酒');
  assert.equal(sake.metadataSources.completeMeanings.source, 'kanjidic-pinned');
  assert.equal(sake.metadataSources.meanings.source, 'kanji');
  assert.equal(JSON.stringify(input), before);
  sake.completeMeanings.push('not a source meaning');
  sake.radicalSchemes.classical = 1;
  sake.referenceSource.release = 'changed';
  assert.deepEqual(fact('酒').completeMeanings, ['sake', 'alcohol']);
  assert.equal(fact('酒').radicalSchemes.classical, 164);
  assert.equal(fact('酒').referenceSource.release, '3.6.2+20260803141815');
  assert.equal(JSON.stringify(input), before);
});

test('offline checks reject corrupted reference facts and require raw archive for a legacy supplement', () => {
  const damaged = clone(extra);
  damaged.kanjiFacts.find((row) => row[0] === '月')[1].pop();
  assert.throws(
    () => buildReferenceData({ prior: damaged }),
    /Reference facts projection integrity mismatch/,
  );
  const old = clone(extra);
  delete old.kanjiFacts;
  assert.throws(() => buildReferenceData({ prior: old }), /pinned --archive/);
});

const archiveIndex = process.argv.indexOf('--archive');
if (archiveIndex >= 0) {
  const archive = process.argv[archiveIndex + 1];
  assert(archive, '--archive requires a path');
  assert.equal(
    createHash('sha256').update(readFileSync(archive)).digest('hex'),
    '5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6',
  );
  const raw = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); sys.stdout.buffer.write(z.read("kanjidic2-en-3.6.2.json"))',
        archive,
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    ),
  );
  // Independent oracle: map fields directly from the verified raw source, never call the production projector here.
  const oracle = new Map();
  for (const character of raw.characters) {
    const meanings = [];
    for (const group of character.readingMeaning.groups) {
      for (const meaning of group.meanings) if (meaning.lang === 'en') meanings.push(meaning.value);
    }
    let classical = null;
    let nelson = null;
    for (const radical of character.radicals) {
      if (radical.type === 'classical') classical = radical.value;
      if (radical.type === 'nelson_c') nelson = radical.value;
    }
    assert(!oracle.has(character.literal));
    oracle.set(character.literal, { meanings, classical, nelson });
  }
  function assertRawParity(rows) {
    assert.equal(rows.length, oracle.size);
    assert.equal(new Set(rows.map((row) => row[0])).size, oracle.size);
    for (const [literal, meanings, classical, nelson] of rows)
      assert.deepEqual({ meanings, classical, nelson }, oracle.get(literal), literal);
  }
  test('every projected literal, English gloss and radical scheme matches the verified raw archive', () => {
    assertRawParity(extra.kanjiFacts);
    assert.deepEqual(kanjiFactsProjection(raw.characters), extra.kanjiFacts);
  });
  test('raw parity detects swapped schemes, legacy radicals, missing senses, clipped glosses and missing rows', () => {
    const controls = [
      (rows) => {
        const row = rows.find(([glyph]) => glyph === '酒');
        [row[2], row[3]] = [row[3], row[2]];
      },
      (rows) => {
        rows.find(([glyph]) => glyph === '頼')[2] = 154;
      },
      (rows) => {
        rows.find(([glyph]) => glyph === '月')[1].pop();
      },
      (rows) => {
        const row = rows.find(([glyph]) => glyph === '蕾');
        row[1][0] = row[1][0].slice(0, 36);
      },
      (rows) => {
        rows.pop();
      },
    ];
    for (const corrupt of controls) {
      const rows = clone(extra.kanjiFacts);
      corrupt(rows);
      assert.throws(() => assertRawParity(rows), assert.AssertionError);
    }
  });
  test('projection rejects unknown/ambiguous source radical types and duplicate literals', () => {
    for (const corrupt of [
      (rows) => {
        rows[0].radicals.push({ type: 'unreviewed', value: 1 });
      },
      (rows) => {
        rows[0].radicals.push({ type: 'classical', value: 1 });
      },
      (rows) => {
        rows[1].literal = rows[0].literal;
      },
    ]) {
      const rows = clone(raw.characters);
      corrupt(rows);
      assert.throws(() => kanjiFactsProjection(rows), assert.AssertionError);
    }
  });
}
