/**
 * WCAG 2.1 relative luminance and contrast ratio (WP-05).
 *
 * REQ-UI-09 makes contrast a requirement rather than polish, and controller §10
 * asks for AA "in both light/dark". A palette can only be *claimed* to meet AA
 * if something checks it, so the ratios are computed here from the same hex
 * values the styles use and asserted in `test/theme-contrast.test.ts`. Change a
 * colour and the test tells you what it broke.
 *
 * Pure arithmetic on sRGB hex strings — no React, no platform API — so it runs
 * in the test runner exactly as it does in the app.
 */

/** WCAG 2.1 §1.4.3 — normal-size text and images of text. */
export const AA_NORMAL_TEXT = 4.5;

/** WCAG 2.1 §1.4.3 — text at ≥18.66px bold or ≥24px regular. */
export const AA_LARGE_TEXT = 3;

/** WCAG 2.1 §1.4.11 — boundaries of interactive components and graphics. */
export const AA_NON_TEXT = 3;

/** `#rgb` and `#rrggbb`, upper or lower case. */
const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export class ColorParseError extends Error {
  constructor(value: string) {
    super(`'${value}' is not a #rgb or #rrggbb colour`);
    this.name = 'ColorParseError';
  }
}

/** sRGB channels in `[0, 255]`. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function parseHexColor(value: string): Rgb {
  if (!HEX_PATTERN.test(value)) throw new ColorParseError(value);
  const body = value.slice(1);
  const full =
    body.length === 3
      ? body
          .split('')
          .map((char) => char + char)
          .join('')
      : body;
  const numeric = Number.parseInt(full, 16);
  return {
    r: (numeric >> 16) & 0xff,
    g: (numeric >> 8) & 0xff,
    b: numeric & 0xff,
  };
}

/** The sRGB → linear transfer function from WCAG 2.1's relative-luminance definition. */
function linearize(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: string): number {
  const { r, g, b } = parseHexColor(color);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** `(lighter + 0.05) / (darker + 0.05)`; symmetric in its arguments, so 1 ≤ ratio ≤ 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsContrast(foreground: string, background: string, minimum: number): boolean {
  return contrastRatio(foreground, background) >= minimum;
}
