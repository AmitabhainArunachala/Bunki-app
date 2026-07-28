/**
 * The self-hosted faces: that they are self-hosted, that they cover what they
 * claim to, and that they stay inside a budget.
 *
 * REQ-UI-08 asks for real Japanese type. The Phase-0 answer was a font *stack*,
 * which is real type only on a host that happens to own one; the experience
 * layer ships the faces. Three things about that need to be checked rather than
 * asserted, because all three are silent when they break:
 *
 *   - **No network.** A face that resolved to a CDN URL would look identical in
 *     every screenshot taken on a machine with a network, and be a blank page on
 *     the operator's train. Every source must be a `data:` URI.
 *   - **Coverage.** A subset is a promise about which characters render in the
 *     designed face. The promise is only meaningful if the shipped corpus is
 *     inside it, so the seed's own text is checked against the declared ranges.
 *   - **Budget.** Inline bytes are parsed with the bundle. A face that grew by a
 *     megabyte would slow the first paint on every screen, and nothing else in
 *     the suite would notice.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { COVERAGE_RANGES, coverageBase } from '../src/theme/fonts/coverage.mjs';
import { JOYO } from '../src/theme/fonts/joyo.mjs';
import { FONT_STACKS, SELF_HOSTED_FACES } from '../src/ui/theme.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = resolve(APP_ROOT, 'src/theme/fonts');

/** The whole coverage contract, as a set, exactly as the generator computes it. */
const coverage = new Set([...coverageBase(), ...JOYO]);

describe('the faces are self-hosted', () => {
  it('ships the three faces the type scale names', () => {
    expect(SELF_HOSTED_FACES.map((face) => `${face.family} ${String(face.weight)}`).sort()).toEqual(
      ['Noto Sans JP 400', 'Noto Sans JP 700', 'Shippori Mincho 400'],
    );
  });

  it.each(
    SELF_HOSTED_FACES.map((face) => [`${face.family} ${String(face.weight)}`, face] as const),
  )('%s carries every chunk inline, with a hash', (_name, face) => {
    expect(face.chunks.length).toBeGreaterThan(0);
    for (const chunk of face.chunks) {
      expect(chunk.source.startsWith('data:font/woff2;base64,')).toBe(true);
      expect(chunk.unicodeRange).toMatch(/^U\+[0-9a-f]/i);
      expect(chunk.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('reaches no network at all', () => {
    for (const file of readdirSync(FONT_DIR).filter((name) => name.endsWith('.ts'))) {
      const source = readFileSync(resolve(FONT_DIR, file), 'utf8');
      expect(source, `${file} contains a remote URL`).not.toMatch(/https?:\/\/[^\s'"`]+\.woff2/i);
    }
    const faceModule = readFileSync(resolve(APP_ROOT, 'src/theme/font-face.ts'), 'utf8');
    expect(faceModule).not.toMatch(/https?:\/\//);
  });

  it('names the self-hosted family first in each stack, and keeps a fallback', () => {
    expect(FONT_STACKS.mincho.startsWith('"Shippori Mincho"')).toBe(true);
    expect(FONT_STACKS.sans.startsWith('"Noto Sans JP"')).toBe(true);
    // A reading surface must never fall back into the UI sans: a host with no
    // CJK serif should land on *a* serif, so the two registers stay two.
    expect(FONT_STACKS.mincho.trim().endsWith('serif')).toBe(true);
    expect(FONT_STACKS.sans.trim().endsWith('sans-serif')).toBe(true);
    expect(FONT_STACKS.mincho).not.toContain('sans-serif');
  });

  it('declares a licence for every family it ships', () => {
    const licenses = readFileSync(resolve(FONT_DIR, 'LICENSES.md'), 'utf8');
    for (const family of new Set(SELF_HOSTED_FACES.map((face) => face.family))) {
      expect(licenses, `${family} has no attribution`).toContain(family);
    }
    expect(licenses).toContain('SIL Open Font License');
    // Both notices travel with the bytes; that is the OFL's actual condition.
    expect(readdirSync(FONT_DIR)).toEqual(
      expect.arrayContaining(['OFL-ShipporiMincho.txt', 'OFL-NotoSansJP.txt']),
    );
  });
});

describe('the coverage contract', () => {
  it('covers kana, CJK punctuation and the jōyō set', () => {
    for (const character of 'あいうえおアイウエオ、。「」〜ー々') {
      expect(coverage.has(character), `${character} is outside the subset`).toBe(true);
    }
    expect(JOYO.length).toBeGreaterThanOrEqual(2136);
    for (const character of JOYO) expect(coverage.has(character)).toBe(true);
  });

  it('declares ranges in ascending, non-overlapping order', () => {
    let previousEnd = -1;
    for (const range of COVERAGE_RANGES as readonly (readonly number[])[]) {
      const first = range[0] ?? Number.NaN;
      const last = range[1] ?? Number.NaN;
      expect(Number.isFinite(first) && Number.isFinite(last), 'a range is not a pair').toBe(true);
      expect(first).toBeLessThanOrEqual(last);
      expect(
        first,
        `range starting U+${first.toString(16)} overlaps the one before`,
      ).toBeGreaterThan(previousEnd);
      previousEnd = last;
    }
  });

  /**
   * Everything the app can display today is inside the subset.
   *
   * This is the assertion that would actually fail in the operator's hands: a
   * seed word whose kanji is outside the subset renders in a platform fallback
   * beside words that do not, and the page looks like two fonts had an
   * argument. Checked against the shipped dataset rather than against a sample.
   */
  it('covers every character in the seed corpus', async () => {
    const { seedDataset } = await import('@bunki/seed');
    const text = JSON.stringify(seedDataset);
    const missing = new Set<string>();
    for (const character of text) {
      const point = character.codePointAt(0) ?? 0;
      // Only the characters a Japanese face is responsible for. Latin below
      // U+2000 is covered by the ASCII range and checked with everything else.
      if (point < 0x2000 && point > 0x7e) continue;
      if (!coverage.has(character)) missing.add(character);
    }
    expect([...missing], 'these seed characters would render in a fallback face').toEqual([]);
  });
});

describe('the byte budget', () => {
  /**
   * Per-face and total ceilings on the *module* text, base64 included.
   *
   * The generator has its own ceiling on the binary; this one is on what the
   * bundle actually carries, which is the number a learner waits for.
   */
  const MAX_MODULE_BYTES = 800_000;
  const MAX_TOTAL_BYTES = 2_200_000;

  const modules = readdirSync(FONT_DIR).filter(
    (name) => name.endsWith('.ts') && name !== 'face-chunk.ts',
  );

  it.each(modules)('%s stays inside the per-face ceiling', (file) => {
    const size = readFileSync(resolve(FONT_DIR, file)).byteLength;
    expect(size, `${file} is ${size} bytes`).toBeLessThanOrEqual(MAX_MODULE_BYTES);
  });

  it('stays inside the total ceiling', () => {
    const total = modules.reduce(
      (sum, file) => sum + readFileSync(resolve(FONT_DIR, file)).byteLength,
      0,
    );
    expect(total, `the faces total ${total} bytes`).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
  });
});
