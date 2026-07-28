/**
 * Regenerates the self-hosted face modules in this directory.
 *
 *   node apps/app/src/theme/fonts/generate-faces.mjs
 *
 * ## Why the faces are checked in as base64 rather than as files
 *
 * REQ-UI-08 asks for real Japanese type. Phase 0 shipped font *stacks* instead
 * of faces and said why: a CJK serif is megabytes, and a font binary is licensed
 * content. Both objections have answers now rather than being unanswerable.
 *
 *   - **Licence.** Shippori Mincho and Noto Sans JP are SIL OFL 1.1; the
 *     retrieved notices, their hashes and the reserved-name check are in
 *     `LICENSES.md` beside this file. The OFL exists to permit exactly this:
 *     bundle, redistribute, embed, subset, with the licence carried along. No
 *     operator decision is pending on an OFL face.
 *   - **Size.** The faces are subset to `coverage.mjs`, and the payload is split
 *     the way Google Fonts splits it — one `@font-face` per chunk, each with the
 *     `unicode-range` the chunk actually covers — so a browser downloads nothing
 *     for a range the page does not use. Except there is no download: the bytes
 *     are inline, which is the point of the next paragraph.
 *
 * The bytes are base64 data URIs inside a TypeScript module because the app's
 * bundler is Metro, and this lane may not touch `metro.config.js`, `app.json`,
 * `package.json` or the HTML shell. A data URI needs none of them: it is a
 * string, it survives `expo export --platform web` untouched, it cannot 404, and
 * it makes "self-hosted, no CDN" a property of the bundle rather than a promise
 * about a server. The cost is honest and worth naming: the bytes are parsed with
 * the JS bundle instead of being fetched in parallel, and they are ~1/3 larger
 * than the binary. `MAX_FACE_BYTES` is the ceiling that keeps that cost from
 * growing quietly.
 *
 * ## What this script does
 *
 * It asks the Google Fonts CSS API for the subset — `&text=` returns a woff2
 * containing exactly the requested glyphs — in chunks, and writes each chunk's
 * `unicode-range` and payload into a module. The `unicode-range` is the one the
 * API returns rather than one computed here: it describes what the file
 * *contains*, so a character the face does not have falls through to the
 * platform stack instead of rendering as a blank box.
 *
 * Regenerating is not byte-reproducible — the API re-cuts subsets and the
 * `kit=` URLs rotate — so each module records the SHA-256 of every chunk it
 * carries. A regeneration that changes the bytes is a visible diff with a
 * visible reason, not a silent swap.
 */

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { coverageBase } from './coverage.mjs';
import { JOYO } from './joyo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * A desktop UA. The CSS API returns woff2 only to clients it believes support
 * it; without this it answers with truetype and the payload triples.
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Characters per request. Keeps the request URL well inside any sane limit. */
const CHUNK = 320;

/** Refuse to write a face larger than this. A design system is not a payload. */
const MAX_FACE_BYTES = 700_000;

/**
 * The three faces.
 *
 * Two families, three weights. Mincho ships one weight on purpose: emphasis in
 * a mincho setting comes from size and from ma, not from weight, and a bold
 * mincho is the register of a supermarket flyer rather than of a museum card.
 * The sans ships two because UI chrome genuinely needs a heading weight.
 */
const FACES = [
  {
    module: 'shippori-mincho-400.ts',
    constant: 'SHIPPORI_MINCHO_400',
    family: 'Shippori Mincho',
    query: 'Shippori+Mincho',
    weight: 400,
    role: 'reading surfaces',
  },
  {
    module: 'noto-sans-jp-400.ts',
    constant: 'NOTO_SANS_JP_400',
    family: 'Noto Sans JP',
    query: 'Noto+Sans+JP:wght@400',
    weight: 400,
    role: 'UI chrome',
  },
  {
    module: 'noto-sans-jp-700.ts',
    constant: 'NOTO_SANS_JP_700',
    family: 'Noto Sans JP',
    query: 'Noto+Sans+JP:wght@700',
    weight: 700,
    role: 'UI headings',
  },
];

function coverageText() {
  const set = new Set([...coverageBase(), ...JOYO]);
  return [...set].sort();
}

async function fetchChunk(face, text) {
  const url = `https://fonts.googleapis.com/css2?family=${face.query}&text=${encodeURIComponent(text)}`;
  const cssResponse = await globalThis.fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!cssResponse.ok) throw new Error(`CSS ${cssResponse.status} for ${face.family}`);
  const css = await cssResponse.text();

  const rangeMatch = css.match(/unicode-range:\s*([^;]+);/);
  const urlMatch = css.match(/src:\s*url\((https:[^)]+)\)/);
  if (rangeMatch === null || urlMatch === null) {
    throw new Error(`unexpected CSS for ${face.family}: ${css.slice(0, 200)}`);
  }

  const fontResponse = await globalThis.fetch(urlMatch[1], {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!fontResponse.ok) throw new Error(`font ${fontResponse.status} for ${face.family}`);
  const bytes = new Uint8Array(await fontResponse.arrayBuffer());
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  if (magic !== 'wOF2') throw new Error(`${face.family} returned ${magic}, not woff2`);

  return {
    unicodeRange: rangeMatch[1].trim().replace(/\s+/g, ' '),
    base64: Buffer.from(bytes).toString('base64'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  };
}

function renderModule(face, chunks, requested) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
  const header = `/**
 * ${face.family} ${face.weight} — ${face.role}. GENERATED; do not hand-edit.
 *
 * Written by \`generate-faces.mjs\` in this directory; see that file for why the
 * bytes are inline and how to regenerate them. Licence: SIL OFL 1.1; attribution,
 * retrieval provenance and the reserved-name check are in \`LICENSES.md\` beside
 * this module. Family name kept as ${face.family}: upstream reserves none.
 *
 * Subset to \`coverage.mjs\` + \`joyo.mjs\`: ${requested} characters requested,
 * ${chunks.length} chunks, ${total} bytes of woff2 before base64.
 */

import { type FontChunk } from './face-chunk.ts';

export const ${face.constant}: readonly FontChunk[] = [
`;

  const body = chunks
    .map(
      (chunk) =>
        `  {\n` +
        `    unicodeRange: '${chunk.unicodeRange}',\n` +
        `    source: 'data:font/woff2;base64,${chunk.base64}',\n` +
        `    sha256: '${chunk.sha256}',\n` +
        `  },\n`,
    )
    .join('');

  return `${header}${body}];\n`;
}

async function main() {
  const characters = coverageText();
  process.stdout.write(`coverage: ${characters.length} characters\n`);

  for (const face of FACES) {
    const chunks = [];
    for (let index = 0; index < characters.length; index += CHUNK) {
      const slice = characters.slice(index, index + CHUNK).join('');
      chunks.push(await fetchChunk(face, slice));
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
    if (total > MAX_FACE_BYTES) {
      throw new Error(`${face.family} ${face.weight} is ${total} bytes, over MAX_FACE_BYTES`);
    }
    await writeFile(join(HERE, face.module), renderModule(face, chunks, characters.length), 'utf8');
    process.stdout.write(`${face.module}: ${chunks.length} chunks, ${total} bytes\n`);
  }
}

await main();
