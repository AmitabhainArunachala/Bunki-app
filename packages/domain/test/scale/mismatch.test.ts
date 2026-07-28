/**
 * The diagnosis: a lit surface with a dark interior (Campaign E, Wave C / B2).
 */

import { describe, expect, it } from 'vitest';

import {
  RETRIEVAL_TARGET_LEVELS,
  SCALE_LEVELS,
  STROKE_ID_PREFIX,
  diagnoseInterior,
  diveAt,
  indexReadings,
  isRetrievalTarget,
  readingFor,
  sharpestMismatches,
  type ScaleMismatch,
  type ScaleReading,
} from '../../src/index.ts';
import { forestLadder } from './support.ts';

const ladder = forestLadder();

/** A five-step ramp, which is the shape the surface's own bands have. */
function reading(nodeId: string, capability: string, step: number, unseen = false): ScaleReading {
  return { nodeId, capability, step, steps: 5, unseen, basis: 'a fixture, not evidence' };
}

describe('the finding the whole feature exists for', () => {
  it('names a word known better than the character inside it', () => {
    // 森林 settled; 林 faint. The design document's own case.
    const readings = indexReadings([
      reading('lex-shinrin', 'meaning', 3),
      reading('kanji:森', 'meaning', 3),
      reading('kanji:林', 'meaning', 1),
    ]);
    const findings = diagnoseInterior(diveAt(ladder, 'lex-shinrin'), readings, ['meaning']);

    const about林 = findings.filter((finding) => finding.inner === 'kanji:林');
    expect(about林).toHaveLength(1);
    expect(about林[0]?.kind).toBe('interior_weaker');
    expect(about林[0]?.outerLabel).toBe('森林');
    expect(about林[0]?.innerLabel).toBe('林');
    expect(about林[0]?.detail).toMatch(/森林 reads stronger for meaning than the 林 inside it/);
    // 森 is the same step as the word, so it is not a finding.
    expect(findings.some((finding) => finding.inner === 'kanji:森')).toBe(false);
  });

  it('tells "never checked" apart from "checked and weaker"', () => {
    const readings = indexReadings([
      reading('lex-shinrin', 'meaning', 3),
      reading('kanji:森', 'meaning', 3),
      reading('kanji:林', 'meaning', 0, true),
    ]);
    const findings = diagnoseInterior(diveAt(ladder, 'lex-shinrin'), readings, ['meaning']);
    const about林 = findings.find((finding) => finding.inner === 'kanji:林');
    expect(about林?.kind).toBe('interior_unseen');
    expect(about林?.innerStep).toBeNull();
    expect(about林?.detail).toMatch(/has none/);
  });

  it('treats an interior with no reading at all the same as an unseen one', () => {
    const readings = indexReadings([reading('lex-shinrin', 'meaning', 4)]);
    const findings = diagnoseInterior(diveAt(ladder, 'lex-shinrin'), readings, ['meaning']);
    expect(findings.every((finding) => finding.kind === 'interior_unseen')).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('sees inside a ring member through its preview, not only inside the centre', () => {
    // Standing at 林, the 森林 in the outward ring is lit and its own interior
    // is dark. Nothing about the centre could have told us that.
    const readings = indexReadings([
      reading('lex-shinrin', 'reading', 4),
      reading('kanji:森', 'reading', 0, true),
      reading('kanji:林', 'reading', 4),
    ]);
    const findings = diagnoseInterior(diveAt(ladder, 'kanji:林'), readings, ['reading']);
    const found = findings.find(
      (finding) => finding.outer === 'lex-shinrin' && finding.inner === 'kanji:森',
    );
    expect(found?.kind).toBe('interior_unseen');
  });
});

describe('what it refuses to report', () => {
  it('says nothing when the outside has no evidence either', () => {
    const readings = indexReadings([
      reading('lex-shinrin', 'meaning', 0, true),
      reading('kanji:林', 'meaning', 0, true),
    ]);
    expect(diagnoseInterior(diveAt(ladder, 'lex-shinrin'), readings, ['meaning'])).toEqual([]);
  });

  /**
   * Scoped to the pair under test on purpose.
   *
   * A dive at 森林 also previews the components inside 森 and 林, and the fixture
   * gives those no reading at all — so `component:木` is a real
   * `interior_unseen` finding in every case below and asserting an empty array
   * would be asserting that the diagnosis *stops working* two levels down.
   * Filtering to the pair keeps each test about the rule it names.
   */
  const about = (findings: readonly ScaleMismatch[], inner: string): readonly ScaleMismatch[] =>
    findings.filter((finding) => finding.inner === inner);

  it('says nothing when the inside is the stronger one', () => {
    const readings = indexReadings([
      reading('lex-shinrin', 'meaning', 1),
      reading('kanji:森', 'meaning', 4),
      reading('kanji:林', 'meaning', 4),
    ]);
    const findings = diagnoseInterior(diveAt(ladder, 'lex-shinrin'), readings, ['meaning']);
    expect(about(findings, 'kanji:森')).toEqual([]);
    expect(about(findings, 'kanji:林')).toEqual([]);
  });

  it('does not fire on a one-step difference, which is ordinary texture', () => {
    const readings = indexReadings([
      reading('lex-shinrin', 'meaning', 3),
      reading('kanji:森', 'meaning', 2),
      reading('kanji:林', 'meaning', 2),
    ]);
    const findings = diagnoseInterior(diveAt(ladder, 'lex-shinrin'), readings, ['meaning']);
    expect(about(findings, 'kanji:森')).toEqual([]);
    expect(about(findings, 'kanji:林')).toEqual([]);
  });

  it('never compares two readings from ramps of different sizes', () => {
    const readings = indexReadings([
      { ...reading('lex-shinrin', 'meaning', 4), steps: 5 },
      { ...reading('kanji:森', 'meaning', 0), steps: 3 },
      { ...reading('kanji:林', 'meaning', 0), steps: 3 },
    ]);
    const findings = diagnoseInterior(diveAt(ladder, 'lex-shinrin'), readings, ['meaning']);
    // A three-step 0 against a five-step 4 is a gap of four if the ramps are
    // confused and no comparison at all if they are not.
    expect(about(findings, 'kanji:森')).toEqual([]);
    expect(about(findings, 'kanji:林')).toEqual([]);
  });
});

describe('there is no aggregate anywhere in the result', () => {
  it('names one capability on every finding', () => {
    const readings = indexReadings([
      reading('lex-shinrin', 'meaning', 4),
      reading('lex-shinrin', 'reading', 4),
    ]);
    const findings = diagnoseInterior(diveAt(ladder, 'lex-shinrin'), readings, [
      'meaning',
      'reading',
    ]);
    expect(findings.length).toBeGreaterThan(0);
    findings.forEach((finding: ScaleMismatch) => {
      expect(['meaning', 'reading']).toContain(finding.capability);
    });
    // Both capabilities produce their own findings; nothing merges them.
    expect(new Set(findings.map((finding) => finding.capability))).toEqual(
      new Set(['meaning', 'reading']),
    );
  });

  it('keeps one node’s two capability readings apart', () => {
    const index = indexReadings([
      reading('kanji:森', 'meaning', 4),
      reading('kanji:森', 'reading', 0, true),
    ]);
    expect(readingFor(index, 'kanji:森', 'meaning')?.step).toBe(4);
    expect(readingFor(index, 'kanji:森', 'reading')?.unseen).toBe(true);
    expect(readingFor(index, 'kanji:森', 'listening')).toBeNull();
  });
});

describe('sharpening', () => {
  it('keeps the never-checked finding over the merely-weaker one for a pair', () => {
    const weaker: ScaleMismatch = {
      kind: 'interior_weaker',
      capability: 'meaning',
      outer: 'a',
      outerLabel: 'A',
      inner: 'b',
      innerLabel: 'B',
      outerStep: 4,
      innerStep: 1,
      steps: 5,
      detail: 'weaker',
    };
    const unseen: ScaleMismatch = { ...weaker, kind: 'interior_unseen', innerStep: null };
    expect(sharpestMismatches([weaker, unseen])).toEqual([unseen]);
    expect(sharpestMismatches([unseen, weaker])).toEqual([unseen]);
  });
});

/* ------------------------------------------------------------------ *
 * Levels a contract could exist at
 * ------------------------------------------------------------------ */

describe('a stroke is never reported as an unlearned interior', () => {
  /*
    At a character the inward rings are components *and* strokes, so a diagnosis
    with no level filter reported "分 ⟶ 1/4 — 分 has meaning evidence and 1/4
    inside it has none", which is an absence that no action closes: nothing
    instantiates a contract on a stroke, which is why `strokeNodeOf` gives one an
    empty `componentIds` "by rule rather than by missing data". The panel shows
    four findings, so two of these pushed two real ones off the screen.
  */
  const view = diveAt(ladder, 'kanji:林');
  // 林 is lit and its component is explicitly unseen, so there is one genuine
  // finding for the stroke findings to have been crowding out.
  const litKanji = indexReadings([
    reading('kanji:林', 'meaning', 3),
    reading('component:木', 'meaning', 0, true),
  ]);

  it('materialises strokes in the view, so there is something to filter', () => {
    const strokeRing = view.rings.find((ring) => ring.level === 'stroke');
    expect(strokeRing?.members.length ?? 0).toBeGreaterThan(3);
  });

  it('would report every one of them but for the filter, so this is not vacuous', () => {
    // Each stroke of 林 has no reading at all while 林 itself is lit, which is
    // exactly the `interior_unseen` shape.
    const strokeRing = view.rings.find((ring) => ring.level === 'stroke');
    for (const member of strokeRing?.members ?? []) {
      expect(member.node.level).toBe('stroke');
      expect(readingFor(litKanji, member.node.id, 'meaning')).toBeNull();
    }
  });

  it('reports the component and not one stroke', () => {
    const findings = diagnoseInterior(view, litKanji, ['meaning']);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.map((finding) => finding.inner)).toContain('component:木');
    expect(findings.filter((finding) => finding.inner.startsWith(STROKE_ID_PREFIX))).toEqual([]);
  });

  it('reports nothing at all when the only dark interiors are strokes', () => {
    const everythingElseLit = indexReadings([
      reading('kanji:林', 'meaning', 3),
      reading('component:木', 'meaning', 3),
    ]);
    expect(diagnoseInterior(view, everythingElseLit, ['meaning'])).toEqual([]);
  });

  it('names every level except the stroke as a retrieval target', () => {
    expect([...RETRIEVAL_TARGET_LEVELS]).toEqual(
      SCALE_LEVELS.filter((level) => level !== 'stroke'),
    );
    expect(isRetrievalTarget('stroke')).toBe(false);
    expect(isRetrievalTarget('kanji')).toBe(true);
  });
});
