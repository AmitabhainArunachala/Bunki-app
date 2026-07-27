/**
 * The ruby column must not be readable piece by piece (WP-05, REQ-UI-09).
 *
 * ## Why this file exists
 *
 * `ruby.tsx` used to hide its pieces with `importantForAccessibility="no"`, and
 * both the code and the build capsule said the pieces were hidden. On the
 * Phase-0 target runtime (Expo Web, REQ-ARCH-01) they were not: that prop is
 * Android/iOS-only, `react-native-web` forwards only the props it knows, and it
 * does not know that one. Every piece stayed in the accessibility tree, so
 * 分かれる（わかれる）was announced as "わ 分 かれる" — the exact interleaving
 * the comment claimed to prevent. Nothing failed, because the suite has no
 * renderer and no test read the platform's own prop table.
 *
 * ## What is checked, and what it is worth
 *
 * The load-bearing assertion is the third one: it reads the **installed** copy
 * of `react-native-web` and checks that the prop the component relies on is one
 * that version actually forwards. That is the check whose absence let the bug
 * ship, and it keeps working across upgrades — if a future react-native-web
 * stops forwarding `aria-hidden`, this fails rather than the app going quiet.
 *
 * The source scans around it are narrower: they prove the component does not
 * reach for a prop that has already been measured not to work. The end-to-end
 * proof — that the rendered accessibility tree really does expose one node —
 * cannot be made here without a renderer, and is made instead against the real
 * `expo export` output by the `Accessibility.getFullAXTree` audit in
 * `scripts/capture-evidence.mjs`.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rubySource = readFileSync(resolve(APP_ROOT, 'src/ui/ruby.tsx'), 'utf8');

/** `ruby.tsx` with comments stripped: the header has to be able to name the trap. */
const rubyCode = rubySource
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const require = createRequire(import.meta.url);

/**
 * The prop table react-native-web actually consults, read from the installed
 * package rather than from memory or from documentation.
 */
function forwardedPropsSource(): string {
  const packageJson = require.resolve('react-native-web/package.json');
  return readFileSync(join(dirname(packageJson), 'dist/modules/forwardedProps/index.js'), 'utf8');
}

describe('the ruby pieces are hidden with a prop the web target honours', () => {
  it('never reaches for a native-only hiding prop', () => {
    // Both of these are silently dropped by react-native-web. `aria-hidden` is
    // mapped onto both of them by React Native ≥0.71 on native, so the modern
    // spelling is strictly more portable, not a web-only concession.
    expect(rubyCode).not.toContain('importantForAccessibility');
    expect(rubyCode).not.toContain('accessibilityElementsHidden');
  });

  it('marks every visual piece aria-hidden', () => {
    const mapAt = rubyCode.indexOf('segments.map(');
    expect(mapAt).toBeGreaterThan(-1);
    const segmentBlock = rubyCode.slice(mapAt);

    // Attribute values in this file contain no `>`, so an opening tag ends at
    // the first one even when it spans lines.
    const openings = segmentBlock.match(/<(?:Text|View)\b[^>]*>/g) ?? [];
    const exposed = openings.filter((tag) => !tag.includes('aria-hidden'));

    // Exactly one element in a segment is not hidden: the column wrapper. It
    // must stay exposed — hiding it would take the whole word with it, and it
    // carries no text of its own.
    expect(openings.length).toBeGreaterThanOrEqual(3);
    expect(exposed).toHaveLength(1);
    expect(exposed[0]).toMatch(/^<View\b/);
  });

  it('uses a prop the installed react-native-web forwards', () => {
    const source = forwardedPropsSource();
    expect(source).toMatch(/['"]aria-hidden['"]:\s*true/);
    // The regression itself: this is what the component used to pass.
    expect(source).not.toContain('importantForAccessibility');
  });
});

describe('the spoken label does not depend on naming a generic element', () => {
  it('renders the label as real text content, not only as an accessibilityLabel', () => {
    expect(rubyCode).toContain('furiganaAccessibilityLabel(written, reading)');
    // The label reaches a Text node; an aria-label on the container would be
    // dropped by assistive technology, because react-native-web maps
    // accessibilityRole="text" to no ARIA role and the element stays generic.
    expect(rubyCode).toMatch(/<Text>\{spokenLabel\}<\/Text>/);
  });

  it('clips the label instead of hiding it with opacity or display', () => {
    expect(rubyCode).toContain('spokenClip');
    expect(rubyCode).toMatch(/spokenClip:\s*\{[^}]*overflow:\s*'hidden'/);
    expect(rubyCode).toMatch(/spokenClip:\s*\{[^}]*position:\s*'absolute'/);
  });

  it('reserves the empty ruby line with a spacer rather than transparent text', () => {
    // The old placeholder was an opacity-0 ideographic space, which is content:
    // it reached the accessibility tree and a copied selection alike.
    expect(rubySource).not.toContain('　');
    expect(rubyCode).not.toMatch(/opacity:\s*(?:segment|0)/);
    expect(rubyCode).toMatch(/<View aria-hidden[^>]*height: rubyLineHeight/);
  });
});
