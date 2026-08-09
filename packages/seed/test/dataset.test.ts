/**
 * Seed dataset shape, coverage and honesty (WP-04, controller §8).
 *
 * The counts in controller §8 are a scope contract, not a suggestion: a seed that
 * quietly grows into a half-imported dictionary is exactly the outcome §2 and
 * WP-04's "not done" list forbid. The coverage assertions are the other half —
 * a lexeme whose kanji has no page, or a kanji no word uses, is a dead end a
 * demo will walk a reviewer straight into.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CANONICAL_TARGET,
  GOLDEN_SOURCE_ANCHOR_ID,
  GOLDEN_SOURCE_ID,
  SEED_COVERAGE_DISCLOSURE,
  SEED_ENTRY_DISCLOSURE,
  allSeedRecords,
  findKanji,
  findLexeme,
  findSource,
  seedDataset,
} from '../src/index.ts';

/** Leading run of non-kana characters — the part of a headword inflection cannot change. */
const kanjiStem = (headword: string): string => /^[^぀-ヿ]*/.exec(headword)?.[0] ?? headword;

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('controller §8 dataset scope', () => {
  it('holds 12–20 lexemes', () => {
    expect(seedDataset.lexemes.length).toBeGreaterThanOrEqual(12);
    expect(seedDataset.lexemes.length).toBeLessThanOrEqual(20);
  });

  it('holds 8–12 kanji, including 分 and 岐 for the OD-02 fixture', () => {
    expect(seedDataset.kanji.length).toBeGreaterThanOrEqual(8);
    expect(seedDataset.kanji.length).toBeLessThanOrEqual(12);
    expect(findKanji('分')).toBeDefined();
    expect(findKanji('岐')).toBeDefined();
  });

  it('holds 2–3 grammar constructions', () => {
    expect(seedDataset.grammar.length).toBeGreaterThanOrEqual(2);
    expect(seedDataset.grammar.length).toBeLessThanOrEqual(3);
  });

  it('holds 6–10 example sentences', () => {
    expect(seedDataset.sentences.length).toBeGreaterThanOrEqual(6);
    expect(seedDataset.sentences.length).toBeLessThanOrEqual(10);
  });

  it('holds exactly one integration passage of 100–200 characters embedding 分岐', () => {
    expect(seedDataset.passages).toHaveLength(1);
    const passage = seedDataset.passages[0];
    expect(passage).toBeDefined();
    expect([...(passage?.body ?? '')].length).toBeGreaterThanOrEqual(100);
    expect([...(passage?.body ?? '')].length).toBeLessThanOrEqual(200);
    expect(passage?.body).toContain(DEFAULT_CANONICAL_TARGET);
    expect(passage?.targetForm).toBe(DEFAULT_CANONICAL_TARGET);
  });

  it('pins one real original article as the permanent A1 golden source', () => {
    expect(seedDataset.sources).toHaveLength(1);
    const source = findSource(GOLDEN_SOURCE_ID);
    expect(source?.title).toBe('静かな朝');
    expect(source?.pool).toBe('original');
    expect(source?.sourceKind).toBe('article');
    expect(source?.locationUnit).toBe('utf16-code-unit');

    const authoritative = JSON.parse(
      readFileSync(
        join(REPOSITORY_ROOT, 'prototypes/corridor/data/articles/bunki-graded-n5-morning.json'),
        'utf8',
      ),
    ) as { id: string; title: string; text: string; pool: string };
    expect(authoritative.id).toBe('bunki-graded-n5-morning');
    expect(authoritative.pool).toBe('original');
    expect(source?.title).toBe(authoritative.title);
    expect(source?.body).toBe(authoritative.text);
    expect(source?.body.length).toBe(301);
    expect(
      createHash('sha256')
        .update(source?.body ?? '', 'utf8')
        .digest('hex'),
    ).toBe(source?.contentSha256);
    expect(source?.contentSha256).toBe(
      'cb8535ea848848a58054d17582616abebe52deb5f26320f1af29d04bea1b99b2',
    );
  });

  it('carries a stroke SVG for every seed kanji', () => {
    expect(seedDataset.strokes.files).toHaveLength(seedDataset.kanji.length);
    for (const kanji of seedDataset.kanji) {
      expect(
        seedDataset.strokes.files.some((file) => file.file === kanji.strokeSvg),
        `${kanji.character} has no stroke file`,
      ).toBe(true);
    }
  });
});

describe('the seed closes over itself', () => {
  it('gives every kanji used by a lexeme its own kanji record', () => {
    for (const lexeme of seedDataset.lexemes) {
      for (const character of lexeme.kanjiUsed) {
        expect(
          findKanji(character),
          `${lexeme.headword} uses ${character}, which has no page`,
        ).toBeDefined();
      }
    }
  });

  it('uses every seed kanji in at least one lexeme', () => {
    for (const kanji of seedDataset.kanji) {
      expect(
        seedDataset.lexemes.some((lexeme) => lexeme.kanjiUsed.includes(kanji.character)),
        `${kanji.character} is not used by any seed lexeme`,
      ).toBe(true);
    }
  });

  it('derives kanjiUsed from the headword itself', () => {
    for (const lexeme of seedDataset.lexemes) {
      const inHeadword = [...lexeme.headword].filter((char) => /[一-鿿]/.test(char));
      expect([...lexeme.kanjiUsed], lexeme.headword).toEqual([...new Set(inHeadword)]);
    }
  });

  it('derives every codepoint from its own character', () => {
    for (const kanji of seedDataset.kanji) {
      const expected = `U+${kanji.character.codePointAt(0)?.toString(16).toUpperCase()}`;
      expect(kanji.codepoint, kanji.character).toBe(expected);
    }
  });

  it('resolves every lexeme and construction id referenced by a sentence or passage', () => {
    const constructionIds = new Set(seedDataset.grammar.map((entry) => entry.id));
    for (const record of [...seedDataset.sentences, ...seedDataset.passages]) {
      for (const id of record.lexemeIds) {
        expect(findLexeme(id), `${record.id} -> ${id}`).toBeDefined();
      }
      for (const id of record.constructionIds) {
        expect(constructionIds, `${record.id} -> ${id}`).toContain(id);
      }
    }
  });

  it('resolves every exact source anchor to its lexeme and source substring', () => {
    for (const source of seedDataset.sources) {
      const anchorIds = source.anchors.map((anchor) => anchor.id);
      expect(new Set(anchorIds).size, `${source.id} has duplicate anchor ids`).toBe(
        anchorIds.length,
      );
      for (const anchor of source.anchors) {
        const lexeme = findLexeme(anchor.lexemeId);
        expect(lexeme, `${source.id}.${anchor.id} -> ${anchor.lexemeId}`).toBeDefined();
        expect(anchor.end, `${source.id}.${anchor.id} exceeds source body`).toBeLessThanOrEqual(
          source.body.length,
        );
        expect(source.body.slice(anchor.start, anchor.end), `${source.id}.${anchor.id}`).toBe(
          lexeme?.headword,
        );
      }
    }

    const golden = findSource(GOLDEN_SOURCE_ID);
    const anchor = golden?.anchors.find((candidate) => candidate.id === GOLDEN_SOURCE_ANCHOR_ID);
    expect(anchor).toEqual({
      id: 'anchor-jibun-01',
      start: 283,
      end: 285,
      lexemeId: 'lex-jibun',
    });
    expect(golden?.body.slice(anchor?.start, anchor?.end)).toBe('自分');
  });

  it('really contains each linked lexeme, matching on the stem so inflection still counts', () => {
    for (const record of [...seedDataset.sentences, ...seedDataset.passages]) {
      const text = 'japanese' in record ? record.japanese : record.body;
      for (const id of record.lexemeIds) {
        const lexeme = findLexeme(id);
        const stem = kanjiStem(lexeme?.headword ?? '');
        expect(
          text,
          `${record.id} claims ${lexeme?.headword} but does not contain "${stem}"`,
        ).toContain(stem);
      }
    }
  });

  it('uses every grammar construction somewhere in the seed', () => {
    const used = new Set(
      [...seedDataset.sentences, ...seedDataset.passages].flatMap(
        (record) => record.constructionIds,
      ),
    );
    for (const construction of seedDataset.grammar) {
      expect(used, `${construction.pattern} is documented but never attested`).toContain(
        construction.id,
      );
    }
  });

  it('gives every record a unique id', () => {
    const ids = allSeedRecords.map((record) => record.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('honesty about what this dataset is (controller §8, REQ-GATE-03)', () => {
  it('says it is a seed, not a dictionary', () => {
    expect(SEED_COVERAGE_DISCLOSURE).toMatch(/not a complete dictionary/);
    expect(SEED_ENTRY_DISCLOSURE).toMatch(/not verified against a published dictionary/);
  });

  it('claims no JMdict, KANJIDIC2 or Tatoeba content anywhere in the dataset', () => {
    // Those three sources were unreachable from the build session (LICENSES.md
    // D-1/D-2). Labelling content with them, or inventing an entry sequence
    // number, would be fabricated provenance — the exact failure this asserts against.
    const forbidden = /jmdict|kanjidic|tatoeba|edrdg/i;
    for (const record of allSeedRecords) {
      for (const [field, provenance] of Object.entries(
        record.provenance as Record<string, { source: string; attribution: string }>,
      )) {
        expect(provenance.source, `${record.id}.${field}`).not.toMatch(forbidden);
        expect(provenance.attribution, `${record.id}.${field}`).not.toMatch(forbidden);
      }
    }
  });

  it('labels hand-assembled lexical claims as unreviewed rather than verified', () => {
    for (const lexeme of seedDataset.lexemes) {
      for (const field of ['reading', 'senses', 'partOfSpeech'] as const) {
        expect(lexeme.provenance[field].review_status, `${lexeme.headword}.${field}`).toBe(
          'unreviewed',
        );
        expect(lexeme.provenance[field].source_entry_id, `${lexeme.headword}.${field}`).toBeNull();
      }
    }
    for (const kanji of seedDataset.kanji) {
      for (const field of ['onReadings', 'kunReadings', 'meanings'] as const) {
        expect(kanji.provenance[field].review_status, `${kanji.character}.${field}`).toBe(
          'unreviewed',
        );
      }
    }
  });

  it('labels the integration passage as this project’s own work, not AI-generated', () => {
    const passage = seedDataset.passages[0];
    expect(passage).toBeDefined();
    const bodyProvenance = passage?.provenance.body;
    expect(bodyProvenance?.source).toMatch(/original text written for this project/);
    expect(bodyProvenance?.modification_status).toBe('original');
    expect(bodyProvenance?.license).toMatch(/pending operator decision/);
  });

  it('labels the golden article as unchanged project-authored original content', () => {
    const source = findSource(GOLDEN_SOURCE_ID);
    expect(source?.provenance.body.source).toMatch(/original project-authored article/);
    expect(source?.provenance.body.modification_status).toBe('unmodified');
    expect(source?.provenance.body.license).toMatch(/pending operator decision/);
    expect(source?.provenance.body.source_entry_id).toBe('bunki-graded-n5-morning');
  });

  it('leaves the repository licence pending on every project-authored field (OD-09)', () => {
    for (const source of Object.values(seedDataset.provenanceSources)) {
      if (!/^Bunki (Phase-0 seed|v11 reading catalog)/.test(source.source)) continue;
      expect(source.license, source.source).toMatch(/pending operator decision/);
    }
  });

  it('confines share-alike content to KanjiVG, the one source whose licence was verified', () => {
    const shareAlike = Object.values(seedDataset.provenanceSources).filter((source) =>
      /CC BY-SA/i.test(source.license),
    );
    expect(shareAlike.length).toBeGreaterThan(0);
    for (const source of shareAlike) {
      expect(source.source).toBe('KanjiVG');
      expect(source.review_status).toBe('primary-source-verified');
    }
  });
});
