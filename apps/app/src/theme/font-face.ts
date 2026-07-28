/**
 * Registering the self-hosted faces on the web.
 *
 * One `<style>` element, written once, holding one `@font-face` per chunk per
 * face. After it is in the document, `fontFamily: '"Shippori Mincho", …'` in any
 * style resolves to the bundled subset instead of falling through to whatever
 * the host happens to have.
 *
 * ## Why a stylesheet and not the FontFace API
 *
 * `new FontFace(...).load()` would work, and is what a font loader usually
 * reaches for. It is the wrong tool here because these faces are *chunked by
 * `unicode-range`*, and `unicode-range` is a property of a CSS rule, not of a
 * `FontFace` object you can hand to `document.fonts`. Registering the chunks
 * through the API would either lose the ranges — leaving one arbitrary chunk to
 * answer for the whole family — or need the ranges reimplemented in JS. A
 * stylesheet is the mechanism the ranges were designed for.
 *
 * ## Why it is called from an effect rather than at module scope
 *
 * `expo export --platform web` statically renders every route in Node, where
 * there is no `document`. A module-scope side effect would throw during the
 * export. The guard below makes the function safe to call anywhere, and
 * `ThemeProvider` calls it in a mount effect — the same place, and for the same
 * reason, as the colour-scheme resolution documented in `theme-context.tsx`.
 *
 * ## What a learner sees before this runs
 *
 * The platform stack, one entry down. Text is never invisible: there is no
 * `font-display: block` here and no opacity gate, so the first paint uses the
 * host's serif or sans and swaps when the rule lands. `font-display: swap` is
 * declared explicitly rather than left to the default, because the default
 * (`auto`) lets a browser choose a blocking period, and a blank reading surface
 * is worse than a re-flowed one.
 */

import { SELF_HOSTED_FACES } from './typography.ts';

/** The element's id, so a second call is a no-op rather than a second copy. */
const STYLE_ELEMENT_ID = 'bunki-self-hosted-faces';

function cssFor(family: string, weight: number, unicodeRange: string, source: string): string {
  return [
    '@font-face {',
    `  font-family: '${family}';`,
    '  font-style: normal;',
    `  font-weight: ${weight};`,
    '  font-display: swap;',
    `  src: url(${source}) format('woff2');`,
    `  unicode-range: ${unicodeRange};`,
    '}',
  ].join('\n');
}

export function installSelfHostedFaces(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ELEMENT_ID) !== null) return;

  const rules: string[] = [];
  for (const face of SELF_HOSTED_FACES) {
    for (const chunk of face.chunks) {
      rules.push(cssFor(face.family, face.weight, chunk.unicodeRange, chunk.source));
    }
  }

  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
}

export function selfHostedFacesInstalled(): boolean {
  return typeof document !== 'undefined' && document.getElementById(STYLE_ELEMENT_ID) !== null;
}
