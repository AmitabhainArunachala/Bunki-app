/**
 * Build a single self-contained corridor-standalone.html — same surface, same
 * bytes of CSS/JS/data, with the bundles embedded instead of fetched. Exists so
 * the prototype can be handed over on a host that will not serve a directory
 * (and so it survives being emailed to a phone).
 *
 * Usage: node build-standalone.mjs [outfile]
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const read = (p) => readFileSync(resolve(CORRIDOR, p), 'utf8');

const BUNDLES = {
  'proprietary_safe/passages': 'data/proprietary_safe/passages.json',
  'proprietary_safe/kanken': 'data/proprietary_safe/kanken.json',
  'proprietary_safe/sem': 'data/proprietary_safe/sem.json',
  'share_alike/kanji': 'data/share_alike/kanji.json',
  'share_alike/words': 'data/share_alike/words.json',
  'share_alike/idioms': 'data/share_alike/idioms.json',
  manifest: 'data/manifest.json',
  'fsrs-pin': 'data/fsrs-pin.json',
};

const bundle = {};
for (const [key, path] of Object.entries(BUNDLES)) bundle[key] = JSON.parse(read(path));

const tsfsrs = read('vendor/ts-fsrs.mjs').replace(/\/\/# sourceMappingURL=.*$/m, '');
const EXPORTS = ['fsrs', 'generatorParameters', 'createEmptyCard', 'Rating'];

const fragment = process.argv.includes('--fragment');

const BODY = `<div id="app"></div>
<script type="application/json" id="corridor-bundle">${JSON.stringify(bundle).replace(/</g, '\\u003c')}</script>
<script type="module">
${tsfsrs}
window.__TSFSRS__ = { ${EXPORTS.join(', ')} };
</script>
<script type="module">
window.__CORRIDOR_BUNDLE__ = JSON.parse(document.getElementById('corridor-bundle').textContent);
${read('corridor.js')}
</script>`;

// Fragment mode: style + body content only, for hosts that supply the document
// skeleton themselves.
const fragmentHtml = `<title>回廊 KAIRO — corridor prototype</title>
<style>
${read('corridor.css')}
</style>
${BODY}
`;

const FAVICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%239e2b25'/%3E%3Ctext x='8' y='12' font-size='11' text-anchor='middle' fill='%23fcfbf6' font-family='serif'%3E回%3C/text%3E%3C/svg%3E`;

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light">
<link rel="icon" href="${FAVICON}">
<title>回廊 KAIRO — corridor prototype</title>
<style>
${read('corridor.css')}
</style>
</head>
<body>
<div id="app"></div>
<script type="application/json" id="corridor-bundle">${JSON.stringify(bundle).replace(/</g, '\\u003c')}</script>
<script type="module">
${tsfsrs}
window.__TSFSRS__ = { ${EXPORTS.join(', ')} };
</script>
<script type="module">
window.__CORRIDOR_BUNDLE__ = JSON.parse(document.getElementById('corridor-bundle').textContent);
${read('corridor.js')}
</script>
</body>
</html>
`;

const outArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const out = resolve(outArg ?? resolve(CORRIDOR, 'corridor-standalone.html'));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, fragment ? fragmentHtml : html);
console.log(`${out}  ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
