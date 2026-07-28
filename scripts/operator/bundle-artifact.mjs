/**
 * Fold the expo web export into one self-contained HTML file, for publishing the
 * app as a link the operator can open.
 *
 *   node scripts/operator/bundle-artifact.mjs /path/to/out.html
 *
 * Three things this has to get right, each learned by getting it wrong:
 *
 *   1. **The router must not read the hosting URL.** An artifact is served from a
 *      nested path; expo-router reads `location.pathname` on boot, so the app
 *      looked for a route named after the artifact id and rendered "unmatched
 *      route". A `history.replaceState` to '/' before the bundle evaluates fixes
 *      it, and it has to be injected *before* the script that loads it.
 *   2. **The bundle cannot go in an inline `<script>` body.** It contains the
 *      literal string `</script>` inside string constants, which terminates the
 *      tag early — that produced "SyntaxError: Unexpected strict mode reserved
 *      word" plus a mangled SVG width attribute. Base64 removes the escaping
 *      surface entirely.
 *   3. **Base64 alone inflates by a third**, which took an 8 MB bundle to 10.8 MB
 *      before the map and the dive had even landed. Gzipping first turns that
 *      around — 10.8 MB to 4.0 MB — and the cost is one `DecompressionStream`
 *      call every current browser already has.
 *
 * Everything is inlined because a published artifact runs under a strict CSP that
 * blocks every external host.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = process.env.BUNKI_DIST ?? '/home/user/Bunki-app/apps/app/dist';
const OUT = process.argv[2];
if (!OUT) {
  console.error('usage: node scripts/operator/bundle-artifact.mjs <out.html>');
  process.exit(1);
}

let html = readFileSync(join(DIST, 'index.html'), 'utf8');

const match = /<script src="(\/_expo\/[^"]+)"[^>]*><\/script>/.exec(html);
if (!match) throw new Error('no expo bundle script tag found in index.html');
const bundle = readFileSync(join(DIST, match[1].replace(/^\//, '')), 'utf8');

// A missing external favicon is a console error; the publisher sets the tab icon.
html = html.replace(/<link[^>]*rel="(shortcut )?icon"[^>]*>/gi, '');

const shim = `<script>
/* Served from a nested path; expo-router reads location.pathname on boot and
   would look for a route named after the artifact id. Rewrite to the app root
   before the bundle evaluates. */
try { if (location.pathname !== '/') history.replaceState(null, '', '/'); } catch (e) {}
</script>`;

const b64 = gzipSync(Buffer.from(bundle, 'utf8'), { level: 9 }).toString('base64');

const loader = `<script>
(async () => {
  const bin = atob(document.getElementById('bunki-bundle').textContent);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const source = await new Response(stream).text();
  // Indirect eval so the bundle evaluates in global scope, as a <script> would.
  (0, eval)(source);
})();
</script>`;

html = html.replace(
  match[0],
  `${shim}\n<script type="application/octet-stream" id="bunki-bundle">${b64}</script>\n${loader}`,
);

const externals = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
if (externals.length > 0) {
  console.warn('WARNING: external refs remain and will be CSP-blocked:', [...new Set(externals)]);
}

writeFileSync(OUT, html);
console.log(`wrote ${OUT} — ${(Buffer.byteLength(html) / 1e6).toFixed(1)} MB`);
