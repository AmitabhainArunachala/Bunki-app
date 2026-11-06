import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY = resolve(HERE, '../../../../../');
const BASE_COMMIT = '65f84d7ff6b308ad9ebbecea0bcdbef492c44daa';
const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const PATHS = {
  corridor: 'prototypes/corridor/corridor.js',
  merge: 'prototypes/corridor/modules/learner.mjs',
  harvested: 'prototypes/corridor/data/original/grammar-v11.json',
  generated: 'prototypes/corridor/data/shared-study/grammar.json',
  registry: 'prototypes/corridor/data/shared-study/registry.json',
  reviews: 'prototypes/corridor/data/shared-study/grammar-reviews.json',
};

const bytes = (path) => readFileSync(resolve(REPOSITORY, path));
const json = (path) => JSON.parse(bytes(path).toString('utf8'));
const sha256 = (path) => createHash('sha256').update(bytes(path)).digest('hex');
const normalizePattern = (pattern) => pattern.replace(/[〜～\s（）()]/g, '');

function arrayLiteral(source, name) {
  const start = source.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const open = source.indexOf('[', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '[') depth += 1;
    else if (source[index] === ']' && --depth === 0) {
      return new Function(`return ${source.slice(open, index + 1)}`)();
    }
  }
  throw new Error(`Unterminated ${name}`);
}

const corridorText = bytes(PATHS.corridor).toString('utf8');
const inline = arrayLiteral(corridorText, 'GRAMMAR');
const harvestedDocument = json(PATHS.harvested);
const harvested = harvestedDocument.entries;
const generatedDocument = json(PATHS.generated);
const generated = generatedDocument.records;

const canonicalAuthored = inline.map((row) => ({ row, family: 'corridor-grammar', aliases: [] }));
for (const row of harvested) {
  const existing = canonicalAuthored.find(
    (candidate) => normalizePattern(candidate.row.p) === normalizePattern(row.p),
  );
  if (existing) existing.aliases.push(row);
  else canonicalAuthored.push({ row, family: 'grammar-v11', aliases: [] });
}

const authoredUnits = canonicalAuthored.map(({ row, family, aliases }) => {
  const id = `gram:authored:${row.id}`;
  const examples = row.ex.map((example, index) => ({
    exampleId: `${row.id}:example:${index + 1}`,
    ja: example.ja,
    en: example.en,
  }));
  const occurrenceLinks = examples.map((example, index) => ({
    kind: 'source-example',
    source: family,
    sourceRecordId: row.id,
    exampleIndex: index,
    exampleId: example.exampleId,
  }));
  return {
    id,
    draftVersion: 1,
    family: 'authored',
    pattern: row.p,
    level: row.lv,
    meaning: { en: row.mEn, ja: row.mJa },
    formation: row.form,
    register: row.note ?? null,
    contrasts: [],
    examples,
    occurrenceLinks,
    aliases: aliases.map((alias) => ({
      source: 'grammar-v11',
      sourceRecordId: alias.id,
      draftVersion: 1,
      pattern: alias.p,
      meaning: { en: alias.mEn, ja: alias.mJa },
      formation: alias.form,
      register: alias.note ?? null,
      examples: alias.ex.map((example, index) => ({
        exampleId: `${alias.id}:example:${index + 1}`,
        ja: example.ja,
        en: example.en,
      })),
      occurrenceLinks: alias.ex.map((example, index) => ({
        kind: 'source-example',
        source: 'grammar-v11',
        sourceRecordId: alias.id,
        exampleIndex: index,
        exampleId: `${alias.id}:example:${index + 1}`,
      })),
      provenance: {
        dataset: 'grammar-v11',
        version: BASE_COMMIT,
        licence: harvestedDocument.sources[0].licence,
        contentClass: 'editorial',
        nativeReviewStatus: 'native-unreviewed',
      },
      mergeBasis: 'Exact corridor mergeGrammar normalization; the inline corridor entry wins.',
    })),
    provenance: {
      dataset: family,
      version: BASE_COMMIT,
      sourceRecordId: row.id,
      contentClass: 'editorial',
      nativeReviewStatus: 'native-unreviewed',
      licence:
        family === 'grammar-v11' ? harvestedDocument.sources[0].licence : 'operator-owned-original',
    },
    requiredWork: [
      'add-examples-to-minimum-three',
      'structure-register-and-contrasts',
      'reconcile-first-full-version-occurrences',
      'link-source-specific-contrast-and-production-practice',
      'native-review',
    ],
  };
});

const generatedUnits = generated.map((row) => ({
  id: `gram:generated:${row.guid}`,
  draftVersion: 1,
  family: 'generated',
  pattern: row.pattern,
  level: row.level,
  meaning: { en: row.meaning, ja: null },
  formation: row.formation,
  register: row.nuance,
  contrasts: row.relatedReferences.map((reference) => reference.text),
  examples: row.examples.map((example) => ({
    exampleId: example.exampleId,
    ja: example.ja,
    en: example.en,
    cloze: example.cloze,
  })),
  occurrenceLinks: row.examples.map((example, index) => ({
    kind: 'source-example',
    source: 'shared-study-grammar',
    sourceRecordId: row.guid,
    exampleIndex: index,
    exampleId: example.exampleId,
    contentRevision: row.contentRevision,
  })),
  aliases: [],
  provenance: {
    dataset: 'shared-study-grammar',
    version: row.contentRevision,
    datasetVersion: `nihongo-grammar-module@${generatedDocument.version}:${generatedDocument.masterContentSha256}`,
    sourceRecordId: row.guid,
    sourceBatch: row.source,
    contentClass: 'generated',
    nativeReviewStatus: 'native-unreviewed',
    translationReviewStatus: generatedDocument.distributionStatus,
    licence: 'not-stated-in-source',
  },
  requiredWork: [
    'reconcile-first-full-version-occurrences',
    'link-source-specific-contrast-and-production-practice',
    'native-review',
  ],
}));

const units = [...authoredUnits, ...generatedUnits].sort((a, b) => {
  const levelDifference = LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level);
  if (levelDifference) return levelDifference;
  if (a.family !== b.family) return a.family === 'authored' ? -1 : 1;
  return 0;
});

const byNormalizedPattern = new Map();
for (const unit of units) {
  const key = normalizePattern(unit.pattern);
  if (!byNormalizedPattern.has(key)) byNormalizedPattern.set(key, []);
  byNormalizedPattern.get(key).push(unit);
}

let crossFamilyCandidateCount = 0;
units.forEach((unit, index) => {
  unit.sequence = index + 1;
  unit.bandSequence =
    units.slice(0, index).filter((candidate) => candidate.level === unit.level).length + 1;
  unit.prerequisites = index === 0 ? [] : [units[index - 1].id];
  unit.sequenceBasis =
    'Draft proposal: JLPT band, authored before generated, then stable source order; not a native-approved linguistic dependency graph.';
  unit.outcome = `Recognize ${unit.pattern} in context, explain its source-specific meaning and register, distinguish reviewed contrasts, and use the construction in a changed context.`;
  unit.assessment = {
    obligation: 'contextual-meaning+source-specific-contrast+changed-context-production',
    changedContextRequired: true,
    assistanceRecordedSeparately: true,
    acceptableAlternatives: 'native-reviewed-before-acceptance',
    unaidedSuccessRequired: true,
    schedulingBoundary:
      'Reuse only identity-compatible approved task contracts; this manifest creates no scheduler or learner history.',
  };
  unit.reviewObligations = [
    'native-entry-and-example-review',
    'source-specific-contrast-review',
    'changed-context-production-review',
    'occurrence-link-reconciliation',
  ];
  unit.samePatternCandidates = byNormalizedPattern
    .get(normalizePattern(unit.pattern))
    .filter((candidate) => candidate.family !== unit.family)
    .map((candidate) => ({
      unit: candidate.id,
      status: 'pending-native-disambiguation-no-string-merge',
    }));
  if (unit.family === 'authored') crossFamilyCandidateCount += unit.samePatternCandidates.length;
});

const levelCounts = Object.fromEntries(
  LEVELS.map((level) => [
    level,
    {
      authored: authoredUnits.filter((unit) => unit.level === level).length,
      generated: generatedUnits.filter((unit) => unit.level === level).length,
    },
  ]),
);

const manifest = {
  schema: 'bunki-grammar-manifest-draft/1',
  node: 'L2B.0',
  version: '2026.11.07-draft.1',
  date: '2026-11-07',
  status: 'draft-not-reviewed-not-frozen',
  spec: ['S2-R21', 'S2-R23', 'S8(g)', 'S13.8'],
  baseCommit: BASE_COMMIT,
  freeze: {
    eligible: false,
    nextNodes: ['MF4R', 'MF4'],
    requiredBeforeFreeze: [
      'different-family review of this exact draft',
      'resolve MF1@data and MF2@data coverage dependencies',
      'reconcile first-full-version reading and kanji-unit construction occurrences',
      'version any later change and recheck dependent content',
    ],
    nativeReviewBoundary:
      'Native review is required before presentation; this draft neither claims nor replaces it.',
  },
  sequence: {
    bands: LEVELS,
    basis:
      'Corridor mergeGrammar band order, authored before generated, stable source order within each family.',
    prerequisiteSemantics:
      'Draft teaching-order proposal only; prerequisites do not describe learner history, mastery, or a completed pedagogical review.',
    generatedRecordsRemainDistinct: true,
  },
  entryContract: {
    required: [
      'meaning',
      'formation',
      'register',
      'at least three examples',
      'contrasts',
      'occurrence links',
      'native review before presentation',
    ],
    practice:
      'Every occurrence leads to source-specific contrast and changed-context production; assistance and acceptable alternatives stay distinct from unaided success.',
    identity:
      'gram:<family>:<source id>; candidate same-pattern records remain separate until native disambiguation.',
  },
  coverage: {
    complete: false,
    counts: {
      authoredSourceRecords: inline.length + harvested.length,
      authoredUnits: authoredUnits.length,
      authoredAliases: harvested.length - (authoredUnits.length - inline.length),
      generatedRecords: generatedUnits.length,
      units: units.length,
      crossFamilySamePatternCandidates: crossFamilyCandidateCount,
    },
    byLevel: levelCounts,
    externalReconciliation: {
      status: 'pending',
      dependencies: [
        {
          id: 'G9',
          status: 'present-at-base',
          commit: 'fb74e1036335c92b4cf2c09f25e5faf989c0148b',
          contract: 'packages/domain/src/identity/index.ts',
        },
        {
          id: 'MF1@data',
          status: 'not-present-at-base',
          expected: 'prototypes/corridor/data/kanji-units/manifest/',
          obligation:
            'Map every construction used by the frozen kanji units to an existing unit or add a sourced draft unit.',
        },
        {
          id: 'MF2@data',
          status: 'not-present-at-base',
          expected: 'prototypes/corridor/data/beginner/manifest/',
          obligation:
            'Map every construction used by the frozen beginner on-ramp to an existing unit or add a sourced draft unit.',
        },
        {
          id: 'first-full-version-readings',
          status: 'not-enumerated-by-this-packet',
          obligation:
            'Map source occurrences by durable source identity and text anchor; do not infer coverage from substring matches.',
        },
      ],
    },
  },
  sources: [
    {
      id: 'corridor-grammar',
      path: PATHS.corridor,
      locator: 'const GRAMMAR',
      records: inline.length,
      sha256: sha256(PATHS.corridor),
      producer:
        'Original editorial explanations and examples authored for KAIRO, per the source comment.',
      licence: 'operator-owned-original',
      nativeReviewStatus: 'native-unreviewed',
    },
    {
      id: 'grammar-v11',
      path: PATHS.harvested,
      locator: 'entries',
      records: harvested.length,
      sha256: sha256(PATHS.harvested),
      producer: harvestedDocument.sources[0].attribution,
      licence: harvestedDocument.sources[0].licence,
      attribution: harvestedDocument.sources[0].attribution,
      nativeReviewStatus: 'native-unreviewed',
    },
    {
      id: 'shared-study-grammar',
      path: PATHS.generated,
      locator: 'records',
      records: generated.length,
      sha256: sha256(PATHS.generated),
      format: generatedDocument.format,
      version: generatedDocument.version,
      masterContentSha256: generatedDocument.masterContentSha256,
      identityRegistrySha256: generatedDocument.identityRegistrySha256,
      contentLabel: generatedDocument.contentLabel,
      producer:
        'AI-written batches nsrs-gen-20261028/g001 through g020; source batch retained per record.',
      nativeReviewStatus: 'native-unreviewed',
      translationReviewStatus: generatedDocument.distributionStatus,
      licence: 'not-stated-in-source',
    },
    {
      id: 'shared-study-registry',
      path: PATHS.registry,
      sha256: sha256(PATHS.registry),
      role: 'Identity and source-example corroboration only; no mastery or native-review evidence.',
    },
    {
      id: 'shared-study-translation-reviews',
      path: PATHS.reviews,
      sha256: sha256(PATHS.reviews),
      role: 'AI translation-faithfulness evidence only; not native grammar review.',
    },
    {
      id: 'corridor-merge-rule',
      path: PATHS.merge,
      locator: 'mergeGrammar',
      sha256: sha256(PATHS.merge),
      role: 'Authored alias normalization and N5-to-N1 display order.',
    },
  ],
  units,
};

const document = `# Bunki L2B.0 grammar manifest draft

Status: **draft, not independently reviewed, not frozen, not complete for presentation**.

This packet enumerates 240 canonical authored N5–N1 patterns and all 289 AI-written N1/N2 records at base commit \`${BASE_COMMIT}\`. It preserves 533 source records as 529 units: four harvested aliases attach to their inline corridor winners. The 144 cross-family same-pattern candidates remain separate pending native disambiguation; text equality never merges identities.

Every unit carries its actual source meaning, formation, register/usage field (null where the source lacks it), contrasts where present, examples, source-example links, draft outcome, prerequisite, assessment obligation, review obligations, and required work. The N5→N1 sequence follows the existing \`mergeGrammar\` convention and keeps stable source order within each family. Its prerequisites are editorial sequencing proposals, not learner history or claims of linguistic dependency.

## Boundaries and open coverage

- No entry is marked native-reviewed. The 289 generated records retain their AI-created/AI-reviewed, native-unconfirmed provenance; translation-faithfulness evidence is not native grammar review.
- Authored entries currently have one or two examples, so every one needs at least one more before S2-R23 completion. Generated records already have three.
- G9 is present at the requested base. MF1@data, MF2@data, and a durable first-full-version reading occurrence inventory are not available in this checkout. Their constructions must be mapped or added before MF4R/MF4; this packet does not claim that coverage denominator is closed.
- Source-example links are not substitutes for occurrence reconciliation across the on-ramp, readings, and kanji units. No substring matcher is used to invent occurrence links.
- No learner history, scheduling event, campaign file, receipt, runbook, credential, or native iPhone artifact is read or written by the generator.

## Reproduce and validate

From this directory, with Node.js 22.13 or newer:

\`\`\`sh
node build.mjs
node validate.mjs
node validate.mjs --self-test
\`\`\`

The following fenced JSON is the manifest data consumed by validation and intended for the later freeze step. It is not a frozen hash or an MF4 output.

\`\`\`json
${JSON.stringify(manifest, null, 2)}
\`\`\`
`;

writeFileSync(resolve(HERE, 'MANIFEST.md'), document);
console.log(
  `Wrote MANIFEST.md: ${units.length} units, ${authoredUnits.length} authored, ${generatedUnits.length} generated, ${crossFamilyCandidateCount} cross-family candidates.`,
);
