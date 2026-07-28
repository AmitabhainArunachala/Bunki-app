/**
 * Approximate arc length of an SVG path, in user units.
 *
 * ## Why this exists
 *
 * The brief asks for motion that serves comprehension, and the first example is
 * "strokes that draw". Drawing a stroke means animating `strokeDashoffset` from
 * the path's length to zero — and the length has to come from somewhere.
 *
 * The obvious source is `SVGGeometryElement.getTotalLength()`, which is exactly
 * why `stroke-order.tsx` does a discrete reveal instead: that API exists in the
 * browser and not, portably, in `react-native-svg` on every platform. A teaching
 * animation that silently degrades on one runtime is worse than one that behaves
 * identically everywhere, so the length is computed here, from the path data, in
 * arithmetic that runs the same in a browser, on a device and in the test runner.
 *
 * ## What it computes, and how exact it is
 *
 * The path is walked command by command and every curve is flattened into
 * `FLATTEN_STEPS` chords. That converges from below — a polyline inscribed in a
 * curve is never longer than the curve — so the value is a slight underestimate,
 * by well under a percent at 24 steps for the curvature KanjiVG strokes actually
 * contain. For a dash offset, an underestimate by a fraction of a percent is
 * invisible; for anything that needed exactness this would be the wrong tool and
 * the header would say so.
 *
 * Elliptical arcs (`A`/`a`) are the one command not flattened: they are measured
 * as the straight chord to their endpoint, and KanjiVG contains none. That is
 * recorded rather than hidden, because an arc-heavy path would draw at a visibly
 * wrong rate and the reason should be findable.
 */

/** Chords per curve segment. 24 is where the error stops mattering for this use. */
const FLATTEN_STEPS = 24;

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Split `d` into `[command, ...numbers]` groups, tolerating any legal separator. */
function tokenize(d: string): { command: string; args: number[] }[] {
  const groups: { command: string; args: number[] }[] = [];
  const pattern = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  for (const match of d.matchAll(pattern)) {
    const command = match[1] ?? '';
    const body = match[2] ?? '';
    const args = (body.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    groups.push({ command, args });
  }
  return groups;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + e * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + e * p3.y,
  };
}

function quadraticAt(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function flattenCubic(p0: Point, p1: Point, p2: Point, p3: Point): number {
  let length = 0;
  let previous = p0;
  for (let step = 1; step <= FLATTEN_STEPS; step += 1) {
    const point = cubicAt(p0, p1, p2, p3, step / FLATTEN_STEPS);
    length += distance(previous, point);
    previous = point;
  }
  return length;
}

function flattenQuadratic(p0: Point, p1: Point, p2: Point): number {
  let length = 0;
  let previous = p0;
  for (let step = 1; step <= FLATTEN_STEPS; step += 1) {
    const point = quadraticAt(p0, p1, p2, step / FLATTEN_STEPS);
    length += distance(previous, point);
    previous = point;
  }
  return length;
}

/**
 * The path's approximate length. Returns 0 for an empty or unparseable path
 * rather than throwing: a stroke that cannot be measured should draw instantly,
 * not crash the page it is on.
 */
export function svgPathLength(d: string): number {
  let length = 0;
  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  /** Reflection anchor for S/s and T/t. */
  let lastCubicControl: Point | null = null;
  let lastQuadraticControl: Point | null = null;

  for (const { command, args } of tokenize(d)) {
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    const at = (index: number): number => args[index] ?? 0;
    const point = (x: number, y: number): Point =>
      relative ? { x: current.x + x, y: current.y + y } : { x, y };

    switch (upper) {
      case 'M': {
        for (let index = 0; index + 1 < args.length || index === 0; index += 2) {
          if (args.length < index + 2) break;
          const next = point(at(index), at(index + 1));
          // Only the first pair is a move; subsequent pairs are implicit line-tos.
          if (index > 0) length += distance(current, next);
          current = next;
          if (index === 0) start = next;
        }
        lastCubicControl = null;
        lastQuadraticControl = null;
        break;
      }
      case 'L': {
        for (let index = 0; index + 1 < args.length; index += 2) {
          const next = point(at(index), at(index + 1));
          length += distance(current, next);
          current = next;
        }
        lastCubicControl = null;
        lastQuadraticControl = null;
        break;
      }
      case 'H': {
        for (const value of args) {
          const next = { x: relative ? current.x + value : value, y: current.y };
          length += distance(current, next);
          current = next;
        }
        lastCubicControl = null;
        lastQuadraticControl = null;
        break;
      }
      case 'V': {
        for (const value of args) {
          const next = { x: current.x, y: relative ? current.y + value : value };
          length += distance(current, next);
          current = next;
        }
        lastCubicControl = null;
        lastQuadraticControl = null;
        break;
      }
      case 'C': {
        for (let index = 0; index + 5 < args.length; index += 6) {
          const c1 = point(at(index), at(index + 1));
          const c2 = point(at(index + 2), at(index + 3));
          const end = point(at(index + 4), at(index + 5));
          length += flattenCubic(current, c1, c2, end);
          current = end;
          lastCubicControl = c2;
        }
        lastQuadraticControl = null;
        break;
      }
      case 'S': {
        for (let index = 0; index + 3 < args.length; index += 4) {
          const reflected: Point =
            lastCubicControl === null
              ? current
              : { x: 2 * current.x - lastCubicControl.x, y: 2 * current.y - lastCubicControl.y };
          const c2 = point(at(index), at(index + 1));
          const end = point(at(index + 2), at(index + 3));
          length += flattenCubic(current, reflected, c2, end);
          current = end;
          lastCubicControl = c2;
        }
        lastQuadraticControl = null;
        break;
      }
      case 'Q': {
        for (let index = 0; index + 3 < args.length; index += 4) {
          const c1 = point(at(index), at(index + 1));
          const end = point(at(index + 2), at(index + 3));
          length += flattenQuadratic(current, c1, end);
          current = end;
          lastQuadraticControl = c1;
        }
        lastCubicControl = null;
        break;
      }
      case 'T': {
        for (let index = 0; index + 1 < args.length; index += 2) {
          const reflected: Point =
            lastQuadraticControl === null
              ? current
              : {
                  x: 2 * current.x - lastQuadraticControl.x,
                  y: 2 * current.y - lastQuadraticControl.y,
                };
          const end = point(at(index), at(index + 1));
          length += flattenQuadratic(current, reflected, end);
          current = end;
          lastQuadraticControl = reflected;
        }
        lastCubicControl = null;
        break;
      }
      case 'A': {
        // Chord, not arc. See the header: KanjiVG has none, and pretending to
        // measure one would be worse than saying that this does not.
        for (let index = 0; index + 6 < args.length; index += 7) {
          const end = point(at(index + 5), at(index + 6));
          length += distance(current, end);
          current = end;
        }
        lastCubicControl = null;
        lastQuadraticControl = null;
        break;
      }
      case 'Z': {
        length += distance(current, start);
        current = start;
        lastCubicControl = null;
        lastQuadraticControl = null;
        break;
      }
      default:
        break;
    }
  }

  return length;
}
