/**
 * Furigana alignment (WP-05, REQ-UI-08 "first-class furigana").
 *
 * Given a headword and its reading, decide which part of the reading belongs
 * over which part of the written form: 分かれる + わかれる puts わ over 分 and
 * leaves かれる bare, rather than floating わかれる over the whole word.
 *
 * The algorithm is the classic okurigana anchor walk. The written form splits
 * into kana runs and base (kanji) runs; each kana run is then located in the
 * remaining reading, and whatever precedes it is the reading of the base run
 * before it. Katakana is folded to hiragana for matching only — the displayed
 * text is always the original.
 *
 * **When it cannot align, it says so.** A base run whose reading cannot be
 * located returns a single whole-word segment with the complete reading over
 * the complete written form. That is never *wrong*, only less precise, and the
 * alternative — guessing a split — would put a reading over a character that
 * does not have it. `alignFurigana` reports which happened in `precision`, so a
 * caller (and the test suite) can tell a real alignment from a fallback.
 *
 * Pure string arithmetic: no React, no platform, unit-tested against every seed
 * lexeme in `test/furigana.test.ts`.
 */

/** One piece of a written form, with the reading that sits above it (or none). */
export interface RubySegment {
  /** The written text, exactly as it appears in the headword. */
  readonly text: string;
  /** The reading to render above `text`, or `null` for kana that reads itself. */
  readonly ruby: string | null;
}

export type FuriganaPrecision =
  /** Every base run was anchored against the reading. */
  | 'aligned'
  /** No kana anchors existed (e.g. 分岐): one segment, whole reading. */
  | 'whole-word'
  /** Anchoring failed; fell back to one segment rather than guess a split. */
  | 'unaligned';

export interface FuriganaResult {
  readonly segments: readonly RubySegment[];
  readonly precision: FuriganaPrecision;
}

const HIRAGANA_START = 0x3041;
const HIRAGANA_END = 0x309f;
const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30fa;
/** ー (U+30FC) reads as part of either script; ・ (U+30FB) is punctuation. */
const PROLONGED_SOUND_MARK = 0x30fc;

export function isKana(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  if (code === PROLONGED_SOUND_MARK) return true;
  return (
    (code >= HIRAGANA_START && code <= HIRAGANA_END) ||
    (code >= KATAKANA_START && code <= KATAKANA_END)
  );
}

/** Katakana → hiragana, for matching only. Leaves everything else untouched. */
export function foldToHiragana(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code !== undefined && code >= KATAKANA_START && code <= KATAKANA_END) {
      out += String.fromCodePoint(code - 0x60);
    } else {
      out += char;
    }
  }
  return out;
}

interface Run {
  readonly kind: 'kana' | 'base';
  readonly text: string;
}

/** Split a written form into alternating kana and base runs, in order. */
function splitRuns(written: string): Run[] {
  const runs: Run[] = [];
  for (const char of written) {
    const kind: Run['kind'] = isKana(char) ? 'kana' : 'base';
    const last = runs[runs.length - 1];
    if (last !== undefined && last.kind === kind) {
      runs[runs.length - 1] = { kind, text: last.text + char };
    } else {
      runs.push({ kind, text: char });
    }
  }
  return runs;
}

const wholeWord = (
  written: string,
  reading: string,
  precision: FuriganaPrecision,
): FuriganaResult => ({
  segments: [{ text: written, ruby: reading === '' ? null : reading }],
  precision,
});

/**
 * Align `reading` over `written`.
 *
 * @param written The headword as written, e.g. `分かれる`.
 * @param reading Its reading in kana, e.g. `わかれる`.
 */
export function alignFurigana(written: string, reading: string): FuriganaResult {
  if (written === '') return { segments: [], precision: 'aligned' };
  if (reading === '') return { segments: [{ text: written, ruby: null }], precision: 'aligned' };

  const runs = splitRuns(written);

  // All kana: the written form reads itself, no ruby anywhere.
  if (runs.every((run) => run.kind === 'kana')) {
    return { segments: [{ text: written, ruby: null }], precision: 'aligned' };
  }

  // A single base run with no kana anchors — 分岐. The whole reading belongs to
  // the whole run, and that is exact, not a fallback.
  if (runs.length === 1) return wholeWord(written, reading, 'whole-word');

  const foldedReading = foldToHiragana(reading);
  const segments: RubySegment[] = [];
  let cursor = 0;

  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    if (run === undefined) return wholeWord(written, reading, 'unaligned');

    if (run.kind === 'kana') {
      const folded = foldToHiragana(run.text);
      // A kana run reads itself; it must appear next in the reading.
      if (!foldedReading.startsWith(folded, cursor)) {
        return wholeWord(written, reading, 'unaligned');
      }
      segments.push({ text: run.text, ruby: null });
      cursor += folded.length;
      continue;
    }

    const next = runs[index + 1];
    if (next === undefined) {
      // Trailing base run takes whatever reading is left.
      const rest = reading.slice(cursor);
      if (rest === '') return wholeWord(written, reading, 'unaligned');
      segments.push({ text: run.text, ruby: rest });
      cursor = reading.length;
      continue;
    }

    // Base run followed by kana: the base run's reading is everything up to the
    // next occurrence of that kana. `indexOf` from `cursor + 1` because a base
    // run always reads as at least one mora, so a zero-length reading is a
    // misalignment rather than a valid split.
    const anchor = foldToHiragana(next.text);
    const anchorAt = foldedReading.indexOf(anchor, cursor + 1);
    if (anchorAt === -1) return wholeWord(written, reading, 'unaligned');

    segments.push({ text: run.text, ruby: reading.slice(cursor, anchorAt) });
    cursor = anchorAt;
  }

  // Every mora of the reading must have been consumed; a leftover tail means the
  // walk drifted and the result would place readings over the wrong characters.
  if (cursor !== foldedReading.length) return wholeWord(written, reading, 'unaligned');

  return { segments, precision: 'aligned' };
}

/**
 * The spoken form of a ruby-annotated word.
 *
 * A screen reader walking the visual segments would interleave base text and
 * furigana character by character ("ぶん 分 き 岐"), which is noise. `RubyText`
 * therefore renders this string as the one piece of real text content in the
 * word, and marks every visual piece `aria-hidden`. See the header of
 * `./ruby.tsx` for why an `accessibilityLabel` on the container is not on its
 * own sufficient on the Phase-0 web target, and where the accessibility tree is
 * actually measured.
 */
export function furiganaAccessibilityLabel(written: string, reading: string): string {
  if (reading === '' || reading === written) return written;
  return `${written}（${reading}）`;
}
