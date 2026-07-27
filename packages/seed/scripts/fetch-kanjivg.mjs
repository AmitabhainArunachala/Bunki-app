/**
 * Fetch the KanjiVG stroke SVGs for the Phase-0 seed kanji (WP-04, controller §8).
 *
 * The strokes in `packages/seed/data/strokes/` are **verbatim, unmodified copies**
 * of upstream KanjiVG files. They are never hand-drawn, traced, minified, or
 * regenerated: KanjiVG is CC BY-SA 3.0, and shipping unmodified copies keeps the
 * share-alike position simple and the attribution honest
 * (`modification_status: "unmodified"` in every stroke provenance record).
 *
 * Upstream is pinned to a commit SHA, not a branch, so re-running this script
 * reproduces byte-identical files.
 *
 *   node packages/seed/scripts/fetch-kanjivg.mjs           # download + rewrite
 *   node packages/seed/scripts/fetch-kanjivg.mjs --check   # verify, never write
 *
 * Not wired into `npm run test`: the controller §17.5 check set must pass with no
 * network. Provenance of the committed files is asserted offline by
 * `test/strokes.test.ts` against the sha256 recorded in `data/strokes.json`.
 */

/*
 * ESLint's Node-globals block in `eslint.config.mjs` is scoped to the repository
 * root's `scripts/` directory, so it does not reach a script inside a package.
 * Widening that glob to reach package-level scripts is WP-01's surface, not
 * WP-04's, so the globals are declared locally instead and the glob change is
 * raised as a coordination request rather than edited across a boundary.
 */
/* global fetch, console, process, Buffer */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..');
const STROKE_DIR = join(PACKAGE_ROOT, 'data', 'strokes');
const MANIFEST = join(PACKAGE_ROOT, 'data', 'strokes.json');

/**
 * Pinned upstream revision of https://github.com/KanjiVG/kanjivg, resolved with
 * `git ls-remote https://github.com/KanjiVG/kanjivg.git HEAD` on 2026-07-27.
 * Bump deliberately, never silently: a bump changes licensed third-party content
 * and must be re-recorded in LICENSES.md.
 */
export const KANJIVG_COMMIT = '61e39cfc29724132a6f8823b166296932985a0ff';

/** The seed kanji, in the order they appear in `data/kanji.json`. */
export const SEED_KANJI = ['分', '岐', '点', '路', '線', '道', '車', '駅', '自', '部'];

export const codepointHex = (character) => character.codePointAt(0).toString(16).padStart(5, '0');

export const rawUrlFor = (hex) =>
  `https://raw.githubusercontent.com/KanjiVG/kanjivg/${KANJIVG_COMMIT}/kanji/${hex}.svg`;

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

async function main() {
  const check = process.argv.includes('--check');
  if (!check) await mkdir(STROKE_DIR, { recursive: true });

  const recorded = check ? JSON.parse(await readFile(MANIFEST, 'utf8')) : null;
  let failures = 0;

  for (const character of SEED_KANJI) {
    const hex = codepointHex(character);
    const url = rawUrlFor(hex);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
    const svg = await response.text();
    const digest = sha256(svg);

    if (check) {
      const committed = await readFile(join(STROKE_DIR, `${hex}.svg`), 'utf8');
      const entry = recorded.files.find((file) => file.character === character);
      const ok = committed === svg && entry?.sha256 === digest;
      if (!ok) failures += 1;
      console.log(`${ok ? 'MATCH ' : 'DIFFER'} ${character} ${hex}.svg ${digest}`);
    } else {
      await writeFile(join(STROKE_DIR, `${hex}.svg`), svg, 'utf8');
      console.log(`wrote ${hex}.svg sha256=${digest} bytes=${Buffer.byteLength(svg)}`);
    }
  }

  if (check && failures > 0) {
    console.error(`${failures} stroke file(s) differ from pinned upstream`);
    process.exitCode = 1;
  }
}

await main();
