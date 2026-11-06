import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY = resolve(HERE, '../../../../../');
const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const BASE_COMMIT = '65f84d7ff6b308ad9ebbecea0bcdbef492c44daa';
const ALIAS_IDS = ['n3-koto-ni-naru', 'n4-nagara', 'n5-tai', 'n5-teiru'];
const normalizePattern = (pattern) => pattern.replace(/[〜～\s（）()]/g, '');

export function readManifest(path = resolve(HERE, 'MANIFEST.md')) {
  const document = readFileSync(path, 'utf8');
  const blocks = [...document.matchAll(/```json\n([\s\S]*?)\n```/g)];
  assert.equal(blocks.length, 1, 'MANIFEST.md must contain exactly one fenced JSON block');
  return JSON.parse(blocks[0][1]);
}

export function validateManifest(manifest, { verifySources = true } = {}) {
  assert.equal(manifest.schema, 'bunki-grammar-manifest-draft/1');
  assert.equal(manifest.node, 'L2B.0');
  assert.equal(manifest.version, '2026.11.07-draft.1');
  assert.equal(manifest.date, '2026-11-07');
  assert.equal(manifest.status, 'draft-not-reviewed-not-frozen');
  assert.equal(manifest.baseCommit, BASE_COMMIT);
  assert.equal(manifest.freeze.eligible, false);
  assert.equal(manifest.coverage.complete, false);
  assert.equal(manifest.coverage.externalReconciliation.status, 'pending');
  assert.deepEqual(manifest.sequence.bands, LEVELS);

  const units = manifest.units;
  assert.ok(Array.isArray(units));
  assert.equal(units.length, 529, 'Expected 529 manifest units');
  assert.equal(new Set(units.map((unit) => unit.id)).size, units.length, 'Unit IDs must be unique');
  assert.equal(units.filter((unit) => unit.family === 'authored').length, 240);
  assert.equal(units.filter((unit) => unit.family === 'generated').length, 289);
  assert.equal(units.flatMap((unit) => unit.aliases).length, 4);
  assert.deepEqual(
    units
      .flatMap((unit) => unit.aliases)
      .map((alias) => alias.sourceRecordId)
      .sort(),
    ALIAS_IDS,
  );

  const ids = new Set(units.map((unit) => unit.id));
  let previousLevel = -1;
  let previousBandSequence = 0;
  units.forEach((unit, index) => {
    assert.ok(unit.id.startsWith(`gram:${unit.family}:`), `${unit.id}: identity family prefix`);
    assert.equal(unit.draftVersion, 1, `${unit.id}: draft object version required`);
    assert.ok(
      unit.provenance.dataset && unit.provenance.version && unit.provenance.licence,
      `${unit.id}: dataset, version and licence provenance required`,
    );
    assert.ok(unit.pattern, `${unit.id}: pattern required`);
    assert.ok(LEVELS.includes(unit.level), `${unit.id}: valid level required`);
    assert.equal(unit.sequence, index + 1, `${unit.id}: contiguous sequence required`);
    const levelIndex = LEVELS.indexOf(unit.level);
    assert.ok(levelIndex >= previousLevel, `${unit.id}: bands must not regress`);
    if (levelIndex !== previousLevel) {
      previousLevel = levelIndex;
      previousBandSequence = 0;
    }
    previousBandSequence += 1;
    assert.equal(unit.bandSequence, previousBandSequence, `${unit.id}: band sequence required`);
    assert.ok(Array.isArray(unit.prerequisites), `${unit.id}: prerequisites array required`);
    for (const prerequisite of unit.prerequisites) {
      assert.ok(ids.has(prerequisite), `${unit.id}: missing prerequisite ${prerequisite}`);
    }
    if (index === 0) assert.deepEqual(unit.prerequisites, [], 'First unit has no prerequisite');
    else
      assert.deepEqual(
        unit.prerequisites,
        [units[index - 1].id],
        `${unit.id}: prerequisite must follow draft order`,
      );
    assert.ok(unit.outcome.includes(unit.pattern), `${unit.id}: pattern-specific outcome required`);
    assert.ok(unit.assessment?.obligation, `${unit.id}: assessment obligation required`);
    assert.equal(
      unit.assessment.changedContextRequired,
      true,
      `${unit.id}: changed-context production required`,
    );
    assert.equal(
      unit.assessment.assistanceRecordedSeparately,
      true,
      `${unit.id}: assistance must remain distinct`,
    );
    assert.equal(
      unit.assessment.unaidedSuccessRequired,
      true,
      `${unit.id}: unaided success required`,
    );
    assert.ok(
      unit.reviewObligations.includes('native-entry-and-example-review'),
      `${unit.id}: native review obligation required`,
    );
    assert.ok(
      unit.reviewObligations.includes('occurrence-link-reconciliation'),
      `${unit.id}: occurrence reconciliation required`,
    );
    assert.ok(unit.meaning?.en, `${unit.id}: meaning required`);
    assert.ok(unit.formation, `${unit.id}: formation required`);
    assert.ok(
      Object.hasOwn(unit, 'register'),
      `${unit.id}: register field required, null allowed only as a draft gap`,
    );
    assert.ok(Array.isArray(unit.contrasts), `${unit.id}: contrasts array required`);
    assert.ok(
      Array.isArray(unit.examples) && unit.examples.length > 0,
      `${unit.id}: actual source examples required`,
    );
    assert.ok(
      Array.isArray(unit.occurrenceLinks) && unit.occurrenceLinks.length > 0,
      `${unit.id}: source occurrence links required`,
    );
    assert.equal(
      unit.provenance.nativeReviewStatus,
      'native-unreviewed',
      `${unit.id}: no native review may be claimed`,
    );
    assert.ok(
      unit.requiredWork.includes('native-review'),
      `${unit.id}: native review must remain open`,
    );
    assert.ok(
      unit.requiredWork.includes('reconcile-first-full-version-occurrences'),
      `${unit.id}: external occurrence work must remain open`,
    );
    assert.ok(
      unit.requiredWork.includes('link-source-specific-contrast-and-production-practice'),
      `${unit.id}: production practice link must remain open`,
    );

    if (unit.family === 'authored') {
      assert.equal(unit.provenance.contentClass, 'editorial');
      assert.ok(unit.examples.length < 3, `${unit.id}: source example gap must remain visible`);
      assert.ok(
        unit.requiredWork.includes('add-examples-to-minimum-three'),
        `${unit.id}: third-example work required`,
      );
    } else {
      assert.equal(unit.provenance.contentClass, 'generated');
      assert.equal(unit.examples.length, 3, `${unit.id}: generated source has three examples`);
      assert.ok(!unit.requiredWork.includes('add-examples-to-minimum-three'));
      assert.equal(unit.provenance.translationReviewStatus, 'translation-verified');
      assert.ok(unit.provenance.sourceBatch.startsWith('nsrs-gen-20261028/'));
    }

    for (const example of unit.examples) {
      assert.ok(
        example.exampleId && example.ja && example.en,
        `${unit.id}: complete example identity and text required`,
      );
    }
    for (const link of unit.occurrenceLinks) {
      assert.equal(link.kind, 'source-example');
      assert.ok(
        link.sourceRecordId && link.exampleId,
        `${unit.id}: durable source-example reference required`,
      );
    }
  });

  const authored = units.filter((unit) => unit.family === 'authored');
  const generated = units.filter((unit) => unit.family === 'generated');
  assert.equal(
    new Set(authored.map((unit) => normalizePattern(unit.pattern))).size,
    240,
    'Authored patterns must follow mergeGrammar deduplication',
  );
  assert.equal(
    new Set(generated.map((unit) => unit.provenance.sourceRecordId)).size,
    289,
    'Generated GUIDs must remain unique',
  );
  assert.equal(
    new Set(generated.map((unit) => normalizePattern(unit.pattern))).size,
    289,
    'Generated patterns must remain deduplicated',
  );
  for (const alias of units.flatMap((unit) => unit.aliases)) {
    assert.equal(alias.draftVersion, 1, `${alias.sourceRecordId}: alias draft version required`);
    assert.ok(
      alias.provenance.dataset && alias.provenance.version && alias.provenance.licence,
      `${alias.sourceRecordId}: alias provenance required`,
    );
    assert.equal(alias.provenance.nativeReviewStatus, 'native-unreviewed');
  }

  let candidatePairs = 0;
  for (const unit of authored) {
    const matches = generated.filter(
      (candidate) => normalizePattern(candidate.pattern) === normalizePattern(unit.pattern),
    );
    candidatePairs += matches.length;
    assert.deepEqual(
      unit.samePatternCandidates.map((candidate) => candidate.unit).sort(),
      matches.map((candidate) => candidate.id).sort(),
      `${unit.id}: same-pattern candidates must be complete`,
    );
    for (const match of matches) {
      assert.ok(
        match.samePatternCandidates.some((candidate) => candidate.unit === unit.id),
        `${unit.id}: candidate link must be symmetric`,
      );
    }
  }
  assert.equal(candidatePairs, 144, 'Expected cross-family candidate denominator');
  for (const unit of units) {
    for (const candidate of unit.samePatternCandidates) {
      assert.equal(candidate.status, 'pending-native-disambiguation-no-string-merge');
      assert.ok(ids.has(candidate.unit));
    }
  }

  assert.deepEqual(manifest.coverage.counts, {
    authoredSourceRecords: 244,
    authoredUnits: 240,
    authoredAliases: 4,
    generatedRecords: 289,
    units: 529,
    crossFamilySamePatternCandidates: 144,
  });
  assert.deepEqual(manifest.coverage.byLevel, {
    N5: { authored: 17, generated: 0 },
    N4: { authored: 32, generated: 0 },
    N3: { authored: 49, generated: 0 },
    N2: { authored: 92, generated: 144 },
    N1: { authored: 50, generated: 145 },
  });

  const dependencies = new Map(
    manifest.coverage.externalReconciliation.dependencies.map((dependency) => [
      dependency.id,
      dependency,
    ]),
  );
  assert.equal(dependencies.get('G9').status, 'present-at-base');
  assert.equal(dependencies.get('MF1@data').status, 'not-present-at-base');
  assert.equal(dependencies.get('MF2@data').status, 'not-present-at-base');
  assert.equal(
    dependencies.get('first-full-version-readings').status,
    'not-enumerated-by-this-packet',
  );

  if (verifySources) {
    for (const source of manifest.sources) {
      const bytes = readFileSync(resolve(REPOSITORY, source.path));
      const actual = createHash('sha256').update(bytes).digest('hex');
      assert.equal(actual, source.sha256, `${source.id}: source pin changed`);
    }

    const corridorText = readFileSync(
      resolve(REPOSITORY, 'prototypes/corridor/corridor.js'),
      'utf8',
    );
    const readArrayLiteral = (source, name) => {
      const start = source.indexOf(`const ${name} = [`);
      assert.ok(start >= 0, `Missing ${name}`);
      const open = source.indexOf('[', start);
      let depth = 0;
      for (let index = open; index < source.length; index += 1) {
        if (source[index] === '[') depth += 1;
        else if (source[index] === ']' && --depth === 0) {
          return new Function(`return ${source.slice(open, index + 1)}`)();
        }
      }
      throw new Error(`Unterminated ${name}`);
    };
    const inlineRows = readArrayLiteral(corridorText, 'GRAMMAR');
    const harvestedRows = JSON.parse(
      readFileSync(
        resolve(REPOSITORY, 'prototypes/corridor/data/original/grammar-v11.json'),
        'utf8',
      ),
    ).entries;
    const generatedDocument = JSON.parse(
      readFileSync(
        resolve(REPOSITORY, 'prototypes/corridor/data/shared-study/grammar.json'),
        'utf8',
      ),
    );
    assert.equal(generatedDocument.records.length, 289);
    assert.equal(generatedDocument.contentLabel, 'AI作成・AI校閲（ネイティブ未確認）');
    assert.equal(generatedDocument.readingSource.reviewStatus, 'native-unreviewed');

    const authoredRows = new Map([
      ...inlineRows.map((row) => [`corridor-grammar:${row.id}`, row]),
      ...harvestedRows.map((row) => [`grammar-v11:${row.id}`, row]),
    ]);
    const generatedRows = new Map(generatedDocument.records.map((row) => [row.guid, row]));
    const representedAuthored = new Set();

    for (const unit of authored) {
      const sourceKey = `${unit.provenance.dataset}:${unit.provenance.sourceRecordId}`;
      const row = authoredRows.get(sourceKey);
      assert.ok(row, `${unit.id}: canonical source record must exist`);
      representedAuthored.add(sourceKey);
      assert.equal(unit.pattern, row.p, `${unit.id}: source pattern mismatch`);
      assert.equal(unit.level, row.lv, `${unit.id}: source level mismatch`);
      assert.deepEqual(
        unit.meaning,
        { en: row.mEn, ja: row.mJa },
        `${unit.id}: source meaning mismatch`,
      );
      assert.equal(unit.formation, row.form, `${unit.id}: source formation mismatch`);
      assert.equal(unit.register, row.note ?? null, `${unit.id}: source register mismatch`);
      assert.deepEqual(
        unit.examples,
        row.ex.map((example, index) => ({
          exampleId: `${row.id}:example:${index + 1}`,
          ja: example.ja,
          en: example.en,
        })),
        `${unit.id}: source examples mismatch`,
      );
      for (const alias of unit.aliases) {
        const aliasKey = `grammar-v11:${alias.sourceRecordId}`;
        const aliasRow = authoredRows.get(aliasKey);
        assert.ok(aliasRow, `${unit.id}: alias source record must exist`);
        representedAuthored.add(aliasKey);
        assert.equal(alias.pattern, aliasRow.p);
        assert.deepEqual(alias.meaning, { en: aliasRow.mEn, ja: aliasRow.mJa });
        assert.equal(alias.formation, aliasRow.form);
        assert.equal(alias.register, aliasRow.note ?? null);
        assert.deepEqual(
          alias.examples,
          aliasRow.ex.map((example, index) => ({
            exampleId: `${aliasRow.id}:example:${index + 1}`,
            ja: example.ja,
            en: example.en,
          })),
          `${unit.id}: alias examples mismatch`,
        );
      }
    }
    assert.equal(representedAuthored.size, 244, 'Every authored source record must be represented');
    for (const sourceKey of authoredRows.keys()) {
      assert.ok(representedAuthored.has(sourceKey), `${sourceKey}: source record dropped`);
    }

    for (const unit of generated) {
      const row = generatedRows.get(unit.provenance.sourceRecordId);
      assert.ok(row, `${unit.id}: generated source record must exist`);
      assert.equal(unit.pattern, row.pattern, `${unit.id}: source pattern mismatch`);
      assert.equal(unit.level, row.level, `${unit.id}: source level mismatch`);
      assert.deepEqual(
        unit.meaning,
        { en: row.meaning, ja: null },
        `${unit.id}: source meaning mismatch`,
      );
      assert.equal(unit.formation, row.formation, `${unit.id}: source formation mismatch`);
      assert.equal(unit.register, row.nuance, `${unit.id}: source register mismatch`);
      assert.deepEqual(
        unit.contrasts,
        row.relatedReferences.map((reference) => reference.text),
        `${unit.id}: source contrasts mismatch`,
      );
      assert.deepEqual(
        unit.examples,
        row.examples.map((example) => ({
          exampleId: example.exampleId,
          ja: example.ja,
          en: example.en,
          cloze: example.cloze,
        })),
        `${unit.id}: source examples mismatch`,
      );
      assert.equal(
        unit.provenance.version,
        row.contentRevision,
        `${unit.id}: content revision mismatch`,
      );
      assert.equal(unit.provenance.sourceBatch, row.source, `${unit.id}: source batch mismatch`);
    }
  }

  return {
    units: units.length,
    authored: authored.length,
    generated: generated.length,
    aliases: units.flatMap((unit) => unit.aliases).length,
    candidatePairs,
    sourcePins: verifySources ? manifest.sources.length : 0,
  };
}

function expectFailure(name, manifest, pattern) {
  assert.throws(() => validateManifest(manifest, { verifySources: false }), pattern, name);
}

const summary = validateManifest(readManifest());
console.log(
  `PASS grammar manifest: ${summary.units} units (${summary.authored} authored + ${summary.generated} generated), ${summary.aliases} aliases, ${summary.candidatePairs} pending-review unmerged candidate pairs, ${summary.sourcePins} source pins.`,
);

if (process.argv.includes('--self-test')) {
  const missingAssessment = structuredClone(readManifest());
  delete missingAssessment.units[0].assessment.obligation;
  expectFailure(
    'missing assessment obligation',
    missingAssessment,
    /assessment obligation required/,
  );

  const missingPrerequisite = structuredClone(readManifest());
  missingPrerequisite.units[1].prerequisites = ['gram:authored:not-in-manifest'];
  expectFailure('missing prerequisite', missingPrerequisite, /missing prerequisite/);

  const falseReview = structuredClone(readManifest());
  falseReview.units[0].provenance.nativeReviewStatus = 'native-reviewed';
  expectFailure('false native review', falseReview, /no native review may be claimed/);

  const mergedCandidate = structuredClone(readManifest());
  mergedCandidate.units = mergedCandidate.units.filter((unit) => unit.family !== 'generated');
  expectFailure(
    'dropped generated identities',
    mergedCandidate,
    /Expected 529|units.length|assert/,
  );

  console.log(
    'PASS negative controls: missing assessment, missing prerequisite, false native review, and dropped generated identities are rejected.',
  );
}
