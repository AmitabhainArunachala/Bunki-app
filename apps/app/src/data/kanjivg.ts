/**
 * KanjiVG stroke extraction (WP-05, REQ-UI-03 "stroke animation").
 *
 * Takes the text of a KanjiVG SVG from `@bunki/seed` and returns its strokes in
 * writing order. Pure string work: no DOM, no XML library, no platform — so it
 * runs identically in the app, in the unit tests (which feed it the real seed
 * files off disk), and in the screenshot harness.
 *
 * Why parse at all rather than render the SVG whole: an `<img>` of the file
 * shows the finished character. The requirement is the *order*, which is the
 * teaching content of the asset — so each stroke has to be an addressable
 * element the UI can reveal one at a time.
 *
 * **Licence note.** KanjiVG is CC BY-SA 3.0 and lives in `packages/seed`, which
 * is the only package share-alike data is admitted into (controller §4, DL-33).
 * Nothing here copies stroke data into `apps/app`: this module reads whatever
 * text it is handed and the seed remains the sole holder of the bytes. The
 * attribution the UI renders comes from the seed's own `strokes.upstream`
 * record, never from a string typed here.
 */

/** One stroke, in writing order. */
export interface KanjiStroke {
  /** 1-based position in the writing order. */
  readonly order: number;
  /** The SVG path `d` attribute, verbatim. */
  readonly d: string;
  /**
   * KanjiVG's stroke-type annotation (`㇑a`, `㇔`, …) when present. Rendered as
   * a spoken hint only; it is upstream vocabulary, not a claim of our own.
   */
  readonly type: string | null;
  /** The `kvg:` element id, kept so a stroke can be traced back upstream. */
  readonly id: string;
}

export interface KanjiStrokeSet {
  /** The SVG `viewBox`, so the UI scales without assuming 109×109. */
  readonly viewBox: string;
  readonly strokes: readonly KanjiStroke[];
}

export class KanjiVgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KanjiVgParseError';
  }
}

const VIEWBOX_PATTERN = /<svg\b[^>]*\bviewBox="([^"]+)"/i;

/**
 * `<path …/>` elements, in document order.
 *
 * KanjiVG puts every stroke in the `StrokePaths` group and every stroke number
 * in a separate `StrokeNumbers` group made of `<text>` elements, so matching
 * paths alone already excludes the numbering. Stroke order is document order —
 * that is the file format's guarantee, and the `-sN` suffix on each id is
 * checked below rather than trusted, so a file whose ids and order disagree
 * fails loudly instead of animating in the wrong sequence.
 */
const PATH_PATTERN = /<path\b([^>]*)\/?>/gi;
const ATTRIBUTE_PATTERN = /([\w:-]+)="([^"]*)"/g;

function attributesOf(tagBody: string): Map<string, string> {
  const attributes = new Map<string, string>();
  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match = ATTRIBUTE_PATTERN.exec(tagBody);
  while (match !== null) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) attributes.set(name, value);
    match = ATTRIBUTE_PATTERN.exec(tagBody);
  }
  return attributes;
}

const STROKE_ID_PATTERN = /-s(\d+)$/;

export function parseKanjiVgStrokes(svgText: string): KanjiStrokeSet {
  const viewBoxMatch = VIEWBOX_PATTERN.exec(svgText);
  if (viewBoxMatch === null || viewBoxMatch[1] === undefined) {
    throw new KanjiVgParseError('the SVG has no viewBox on its root element');
  }
  const viewBox = viewBoxMatch[1];

  const strokes: KanjiStroke[] = [];
  PATH_PATTERN.lastIndex = 0;
  let match = PATH_PATTERN.exec(svgText);
  while (match !== null) {
    const body = match[1] ?? '';
    const attributes = attributesOf(body);
    const d = attributes.get('d');
    const id = attributes.get('id') ?? '';
    if (d !== undefined && d !== '') {
      const order = strokes.length + 1;
      const declared = STROKE_ID_PATTERN.exec(id);
      // Document order is the writing order; the id encodes the same number.
      // A disagreement means the file is not the format we think it is.
      if (declared !== null && Number(declared[1]) !== order) {
        throw new KanjiVgParseError(
          `stroke ${id} is at document position ${order} but its id claims stroke ${String(declared[1])}`,
        );
      }
      strokes.push({ order, d, type: attributes.get('kvg:type') ?? null, id });
    }
    match = PATH_PATTERN.exec(svgText);
  }

  if (strokes.length === 0) {
    throw new KanjiVgParseError('the SVG contains no stroke paths');
  }

  return { viewBox, strokes };
}

/**
 * A spoken description of a stroke's position in the order.
 *
 * The animation is visual; a screen-reader user gets the count and the current
 * position in words instead (REQ-UI-09 screen-reader labels).
 */
export function strokeAccessibilityLabel(
  character: string,
  revealed: number,
  total: number,
): string {
  if (revealed >= total) {
    return `Stroke order for ${character}: all ${total} strokes shown.`;
  }
  return `Stroke order for ${character}: ${revealed} of ${total} strokes shown.`;
}
