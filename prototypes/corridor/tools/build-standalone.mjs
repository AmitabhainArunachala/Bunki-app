/**
 * Build a single self-contained corridor-standalone.html — same surface, same
 * bytes of CSS/JS/data, with the bundles embedded instead of fetched. Exists so
 * the prototype can be handed over on a host that will not serve a directory
 * (and so it survives being emailed to a phone).
 *
 * Usage: node build-standalone.mjs [external-outfile] [--fragment]
 * Without KAIRO_SITE_DIR, a complete canonical runtime is prepared externally.
 * Output is always a fresh file under ~/.dharma or CI temporary storage.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync, version } from 'esbuild';
import { externalPath } from '../../bunki-desktop/lib/paths.cjs';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { isMachineCheckedEntry } from './assessment/machine-checked-class.mjs';

const args = process.argv.slice(2);
assert(args.filter((arg) => !arg.startsWith('--')).length <= 1 && args.every((arg) => !arg.startsWith('--') || arg === '--fragment'), 'Usage: build-standalone.mjs [external-outfile] [--fragment]');
const outArg = args.find((arg) => !arg.startsWith('--'));
const out = externalPath(outArg || join(resolveCorridorEvidence(), 'corridor-standalone.html'), { fresh: true });
const fromCheckout = relative(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), out);
assert(fromCheckout === '..' || fromCheckout.startsWith('..' + sep) || isAbsolute(fromCheckout), 'Standalone output must be outside the checkout');
assert(!existsSync(out + '.build.json'), 'Standalone receipt already exists; choose a fresh output.');
const CORRIDOR = resolveCorridorSite();
const read = (p) => readFileSync(resolve(CORRIDOR, p), 'utf8');
// Bundle the app controllers together with the learner record. Independent
// bundles repeated the reading/feed/assessment cores several times; one module
// preserves their shared classes and state as well as carrying each byte once.
const controllerImports = new Map([
  ['READING_CONTROLLER', ['./reading-controller.mjs', 'readingController']],
  ['READING_POSITION', ['./reading-position.mjs', 'readingPosition']],
  ['TEACHER_CONTEXT', ['./teacher-context.mjs', 'teacherContext']],
  ['TEACHER_DRAFTS', ['./teacher-drafts.mjs', 'teacherDrafts']],
  ['TEACHER_DRAFT_CONTROLLER', ['./teacher-draft-controller.mjs', 'teacherDraftController']],
  ['SENTENCE_DRAFTS', ['./sentence-drafts.mjs', 'sentenceDrafts']],
  ['SENTENCE_DRAFT_CONTROLLER', ['./sentence-draft-controller.mjs', 'sentenceDraftController']],
  ['ASSESSMENT_CONTROLLER', ['./assessment-controller.mjs', 'assessmentController']],
  ['FEED_CONTROLLER', ['./feed-controller.mjs', 'feedController']],
  ['PUBLISHER_CONTROLLER', ['./publisher-controller.mjs', 'publisherController']],
  ['SOURCE_INBOX', ['./source-inbox.mjs', 'sourceInbox']],
  ['SENTENCE_PRACTICE', ['./sentence-practice.mjs', 'sentencePractice']],
  ['SOURCE_PROCESSING', ['./source-processing.mjs', 'sourceProcessing']],
]);
const recordImports = new Map([
  ['./record-controller.mjs', 'controller'],
  ['./record-binding.mjs', 'binding'],
  ['./record-app.mjs', 'app'],
  ['./record-sync.mjs', 'sync'],
  ['./modules/record-core.mjs', 'core'],
]);
const assessmentImports = new Map([
  ['./assessment-v2-controller.mjs', 'assessmentV2'],
  ['./assessment-learning.mjs', 'assessmentLearning'],
  ...(existsSync(resolve(CORRIDOR, 'assessment-question-practice.mjs')) ? [
    ['./assessment-question-practice.mjs', 'assessmentQuestionPractice'],
    ['./assessment-question-view.mjs', 'assessmentQuestionView'],
    ['./assessment-question-source.mjs', 'assessmentQuestionSource'],
  ] : []),
  ['./assessment-view.mjs', 'assessmentView'],
  ['./assessment-delivery.mjs', 'assessmentDelivery'],
  ['./assessment-received.mjs', 'assessmentReceived'],
]);
const recordRuntimeBuild = buildSync({
  absWorkingDir: CORRIDOR,
  stdin: { contents: [...recordImports, ...assessmentImports, ...controllerImports.values()].map(([specifier, name]) =>
    `export * as ${name} from ${JSON.stringify(specifier)};`).join('\n'),
  resolveDir: CORRIDOR, sourcefile: 'standalone-record-entry.mjs', loader: 'js' },
  outfile: 'standalone-record-runtime.mjs', bundle: true, format: 'esm',
  platform: 'browser', target: ['safari17', 'chrome120'], charset: 'utf8',
  minify: true, legalComments: 'inline', metafile: true, write: false,
});
assert.equal(recordRuntimeBuild.outputFiles.length, 1);
assert.deepEqual(Object.values(recordRuntimeBuild.metafile.outputs)[0].imports, [], 'Standalone record runtime must have no external imports');
const recordRuntimeBytes = Buffer.from(recordRuntimeBuild.outputFiles[0].contents);
const recordRuntimeBase64 = recordRuntimeBytes.toString('base64');
const inkBuild = buildSync({
  absWorkingDir: CORRIDOR, entryPoints: ['corridor-ink.js'],
  outfile: 'standalone-ink.mjs', bundle: true, format: 'esm',
  platform: 'browser', target: ['safari17', 'chrome120'], charset: 'utf8',
  minify: true, legalComments: 'inline', metafile: true, write: false,
});
assert.equal(inkBuild.outputFiles.length, 1);
assert.deepEqual(Object.values(inkBuild.metafile.outputs)[0].imports, [], 'Standalone writing engine must have no external imports');
const inkBytes = Buffer.from(inkBuild.outputFiles[0].contents);
const inkUrl = 'data:text/javascript;base64,' + inkBytes.toString('base64');
// 案内つきの稽古 — the guided session travels whole: its module (engine and content inlined), its
// moments, both stylesheets, the sets its index lists and the sprite sheet. A served build loads
// these as siblings; a blob: module resolves no sibling, so each gets its own URL at boot.
const guidedModule = (entry) => {
  const built = buildSync({
    absWorkingDir: CORRIDOR, entryPoints: [entry],
    outfile: `standalone-${entry}`, bundle: true, format: 'esm',
    platform: 'browser', target: ['safari17', 'chrome120'], charset: 'utf8',
    minify: true, legalComments: 'inline', metafile: true, write: false,
  });
  assert.equal(built.outputFiles.length, 1);
  assert.deepEqual(Object.values(built.metafile.outputs)[0].imports, [], `Standalone ${entry} must have no external imports`);
  return Buffer.from(built.outputFiles[0].contents);
};
const guidedSessionBytes = guidedModule('guided-session.mjs');
const guidedMomentsBytes = guidedModule('guided-moments.mjs');
const GUIDED_SPRITE_REF = "url('guided/samurai-sprites-v2.png')";
const guidedStyles = { session: read('guided-session.css'), moments: read('guided-moments.css') };
assert.equal(guidedStyles.moments.split(GUIDED_SPRITE_REF).length - 1, 1, 'Standalone moments sprite reference changed');
assert(!/url\(/u.test(guidedStyles.session), 'Standalone guided stylesheet gained a sibling reference');
const guidedSprite = readFileSync(resolve(CORRIDOR, 'guided/samurai-sprites-v2.png'));
// A data: URI is self-contained (the design pass's washi textures); any other url() names a sibling
// file the single-file build would not carry.
const cssSiblingRefs = (css) => [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gu)].map((match) => match[2])
  .filter((ref) => !ref.startsWith('data:'));
assert.deepEqual(cssSiblingRefs(read('editorial.css')), [], 'Standalone editorial stylesheet gained a sibling reference');
const shelfArt = readFileSync(resolve(CORRIDOR, 'design/ink-hoku-nami.png'));
function moduleUrlExpression(dataUrl) {
  const prefix = 'data:text/javascript;base64,';
  assert(dataUrl.startsWith(prefix), 'Standalone modules must contain inline JavaScript bytes');
  return `standaloneModuleUrl(${JSON.stringify(dataUrl.slice(prefix.length))})`;
}
let appScript = read('corridor.js');
assert(appScript.includes('window.__KAIRO_SHELF_ART_URL__'), 'Standalone shelf art requires the application asset URL hook');
for (const [specifier, name] of [...recordImports, ...assessmentImports]) {
  const original = `import('${specifier}')`;
  assert.equal(appScript.split(original).length - 1, 1, `Standalone runtime import changed: ${specifier}`);
  appScript = appScript.replace(original, `import(window.__KAIRO_RECORD_RUNTIME_URL__).then(module => module.${name})`);
}
for (const [hook, [specifier, name]] of controllerImports) {
  const original = `import(window.__KAIRO_${hook}_URL__ || '${specifier}')`;
  assert.equal(appScript.split(original).length - 1, 1, `Standalone controller import changed: ${specifier}`);
  appScript = appScript.replace(original, `import(window.__KAIRO_RECORD_RUNTIME_URL__).then(module => module.${name})`);
}
assert.equal(appScript.split("import('./corridor-ink.js')").length - 1, 1, 'Standalone writing import changed');
appScript = appScript.replace("import('./corridor-ink.js')", 'import(window.__KAIRO_INK_URL__)');
let driftScript = read('drift-layer.js');
assert.equal(driftScript.split('import("./record-controller.mjs")').length - 1, 1, 'Standalone Drift record import changed');
driftScript = driftScript.replace('import("./record-controller.mjs")',
  'import(window.__KAIRO_RECORD_RUNTIME_URL__).then(module => module.controller)');

const BUNDLES = {
  'proprietary_safe/kanken': 'data/proprietary_safe/kanken.json',
  'proprietary_safe/sem': 'data/proprietary_safe/sem.json',
  'share_alike/kanji': 'data/share_alike/kanji.json',
  'share_alike/words': 'data/share_alike/words.json',
  'share_alike/idioms': 'data/share_alike/idioms.json',
  'share_alike/dict': 'data/share_alike/dict.json',
  'share_alike/strokes': 'data/share_alike/strokes.json',
  'share_alike/radicals214': 'data/share_alike/radicals214.json',
  'share_alike/skip': 'data/share_alike/skip.json',
  'original/grammar-v11': 'data/original/grammar-v11.json',
  manifest: 'data/manifest.json',
  'fsrs-pin': 'data/fsrs-pin.json',
  'share_alike/reference-extra': 'data/share_alike/reference-extra.json',
  'share_alike/kkld': 'data/share_alike/kkld.json',
};

const bundle = {};
for (const [key, path] of Object.entries(BUNDLES)) bundle[key] = JSON.parse(read(path));

// the article shelf: index + one entry per article file, keyed articles/<slug>
// (the standalone build embeds what the served build fetches lazily)
import { readdirSync } from 'node:fs';
const articlesDir = resolve(CORRIDOR, 'data/articles');
for (const file of readdirSync(articlesDir).sort()) {
  if (!file.endsWith('.json')) continue;
  // the newspaper archive (archive/ + its index) stays served-build only:
  // embedding the index without its 694 bodies would advertise a stack the
  // single file cannot open, and embedding the bodies would add ~28 MB
  if (file === 'archive-index.json') continue;
  const key = file === 'index.json' ? 'articles/index' : `articles/${file.replace(/\.json$/, '')}`;
  bundle[key] = JSON.parse(read(`data/articles/${file}`));
}

// 模試 — the papers travel with the single file (~500 KB against 43 MB): a
// mock room that could not open in the handoff build would be a door onto
// nothing, and the sets are exactly the kind of thing a frozen artifact
// should still be able to sit
const mockDir = resolve(CORRIDOR, 'data/mock');
if (existsSync(mockDir)) {
  bundle['mock/index'] = JSON.parse(read('data/mock/index.json'));
  for (const file of readdirSync(resolve(mockDir, 'sets')).sort()) {
    if (!file.endsWith('.json')) continue;
    bundle[`mock/sets/${file.replace(/\.json$/, '')}`] = JSON.parse(read(`data/mock/sets/${file}`));
  }
}

// 案内つきの稽古's sets, keyed by path without .json — the room reads them through its host
const guidedIndex = JSON.parse(read('guided/sets/index.json'));
bundle['guided/sets/index'] = guidedIndex;
for (const entry of guidedIndex.sets) {
  const set = JSON.parse(read(entry.path));
  bundle[entry.path.replace(/\.json$/u, '')] = set;
  // a set built from the bank reads its questions from the reviewed form, so the form travels too
  if (set.questions.some((question) => question.bank)) bundle[set.source.formPath.replace(/\.json$/u, '')] = JSON.parse(read(set.source.formPath));
}

// Only assets admitted into the public catalog travel with the handoff. The
// private authoring/review workspaces are never searched or embedded here.
const assessmentAssets = new Map();
const publicDigest = bytes => createHash('sha256').update(bytes).digest('hex');
function assessmentPath(raw) {
  const path = raw?.startsWith('data/assessment/') ? raw : `data/assessment/${raw}`;
  assert(/^data\/assessment\/[a-zA-Z0-9_./-]+$/u.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid public assessment path');
  return path;
}
function packAssessment(path, mimeType = 'application/json') {
  path = assessmentPath(path);
  if (!assessmentAssets.has(path)) {
    const bytes = readFileSync(resolve(CORRIDOR, path));
    assessmentAssets.set(path, { mimeType, base64: bytes.toString('base64'), bytes: bytes.length, sha256: publicDigest(bytes) });
  }
  return assessmentAssets.get(path);
}
packAssessment('catalog.json'); packAssessment('sources.json');
const assessmentCatalog = JSON.parse(read('data/assessment/catalog.json'));
for (const entry of [...assessmentCatalog.entries, ...(assessmentCatalog.archivedEntries || [])]) {
  if (!entry.availability?.ready) continue;
  assert(entry.review?.status === 'ai-reviewed' || isMachineCheckedEntry(entry), 'Only admitted public assessments may be embedded');
  packAssessment(entry.formPath); packAssessment(entry.deliveryPath);
  const form = JSON.parse(read(assessmentPath(entry.formPath)));
  const delivery = JSON.parse(read(assessmentPath(entry.deliveryPath)));
  assert.equal(form.sha256, entry.formSha256, 'Public form identity changed');
  assert.equal(delivery.form.sha256, form.sha256, 'Public delivery identity changed');
  for (const asset of delivery.assets) {
    const packed = packAssessment(asset.path, asset.mimeType);
    assert.equal(packed.sha256, asset.bytesSha256, 'Public assessment media changed');
  }
}
const assessmentPack = Object.fromEntries([...assessmentAssets].map(([path, asset]) =>
  [path, { mimeType: asset.mimeType, base64: asset.base64 }]));
// 単語帳 — the deck room reads its decks from the bundle the same way
const decksDir = resolve(CORRIDOR, 'data/share_alike/decks');
if (existsSync(decksDir)) {
  for (const file of readdirSync(decksDir).sort()) {
    if (!file.endsWith('.json')) continue;
    bundle[`decks/${file.replace(/\.json$/, '')}`] = JSON.parse(read(`data/share_alike/decks/${file}`));
  }
}

const tsfsrs = read('vendor/ts-fsrs.mjs').replace(/\/\/# sourceMappingURL=.*$/m, '');
const EXPORTS = ['fsrs', 'generatorParameters', 'createEmptyCard', 'Rating'];

const fragment = process.argv.includes('--fragment');

// The expanded dictionary stays JSON-inert until search or a full entry asks
// for it. This keeps the handoff self-contained without allocating the 70k
// JS object graph at boot; each node is removed by corridor.js after its JSON
// is parsed, so raw text and live objects are never both retained.
const dictionaryDir = resolve(CORRIDOR, 'data/share_alike/dict-v2');
const dictionaryScripts = readdirSync(dictionaryDir)
  .filter((file) => file.endsWith('.json'))
  .sort((a, b) => (a === 'index.json' ? -1 : b === 'index.json' ? 1 : a.localeCompare(b)))
  .map((file) => {
    const id = file.replace(/\.json$/, '');
    const json = read(`data/share_alike/dict-v2/${file}`).replace(/</g, '\\u003c');
    return `<script type="application/json" id="corridor-dictionary-${id}">${json}</script>`;
  })
  .join('\n');

// the drift layer self-mounts and sleeps until the corridor wakes it; its
// emitter asserts the file carries no "</script" sequence, so inlining is safe
const BODY = `<div id="app"></div>
<script>
${read('maintenance/report-client.js')}
</script>
<script>
${read('reference-core.js')}
${read('reference-ui.js')}
</script>
<script type="application/json" id="corridor-bundle">${JSON.stringify(bundle).replace(/</g, '\\u003c')}</script>
${dictionaryScripts}
<script>
${driftScript}
</script>
<script>
${read('skip-core.js')}
${read('skip-ui.js')}
</script>
<script type="module">
${tsfsrs}
window.__TSFSRS__ = { ${EXPORTS.join(', ')} };
</script>
<script type="application/octet-stream" id="standalone-record-module">${recordRuntimeBase64}</script>
<script type="application/json" id="standalone-assessment-assets">${JSON.stringify(assessmentPack).replace(/</g, '\\u003c')}</script>
<script type="application/octet-stream" id="standalone-guided-sprite">${guidedSprite.toString('base64')}</script>
<script type="application/octet-stream" id="standalone-shelf-art">${shelfArt.toString('base64')}</script>
<script type="application/json" id="standalone-guided-styles">${JSON.stringify(guidedStyles).replace(/</g, '\\u003c')}</script>
<script type="module">
// Local module URLs avoid the Chromium full-page boot/reload crashes seen
// with large data URLs. Isolated data-URL imports pass; no general URL-size
// limit is asserted. Each URL lives for this document's module lifetime.
function standaloneModuleUrl(base64) {
  return URL.createObjectURL(new Blob([
    Uint8Array.from(atob(base64), character => character.charCodeAt(0)),
  ], { type: 'text/javascript' }));
}
window.__CORRIDOR_STANDALONE__ = true;
const corridorBundleNode = document.getElementById('corridor-bundle');
window.__CORRIDOR_BUNDLE__ = JSON.parse(corridorBundleNode.textContent);
corridorBundleNode.remove();
// The public forms remain part of the handoff, including archived versions
// referenced by saved work. Leave their JSON inert until assessment is used.
let assessmentPack;
function standaloneAssessmentPack() {
  if (!assessmentPack) {
    const node = document.getElementById('standalone-assessment-assets');
    assessmentPack = new Map(Object.entries(JSON.parse(node.textContent)).map(([path, value]) =>
      [new URL(path, document.baseURI).href, value]));
    node.remove();
  }
  return assessmentPack;
}
const assessmentAddress = input => new URL(typeof input === 'string' || input instanceof URL ? input : input.url, document.baseURI).href;
window.__KAIRO_ASSESSMENT_FETCH__ = async (input, init) => {
  const entry = standaloneAssessmentPack().get(assessmentAddress(input));
  if (!entry || (init?.method || input?.method || 'GET') !== 'GET') return fetch(input, init);
  const bytes = Uint8Array.from(atob(entry.base64), character => character.charCodeAt(0));
  return new Response(bytes, { headers: { 'Content-Type': entry.mimeType } });
};
// CacheStorage does not accept file:// requests. The immutable public pack is
// already durable in this HTML; this document-local cache only saves decoding.
const assessmentCaches = new Map();
window.__KAIRO_ASSESSMENT_CACHE__ = {
  async open(name) {
    if (!assessmentCaches.has(name)) assessmentCaches.set(name, new Map());
    const entries = assessmentCaches.get(name);
    return {
      async match(input) { return entries.get(assessmentAddress(input))?.clone(); },
      async put(input, response) { entries.set(assessmentAddress(input), response.clone()); },
    };
  },
};
// App and Drift share one record module identity, including its classes/state.
const standaloneRecordData = document.getElementById('standalone-record-module');
window.__KAIRO_RECORD_RUNTIME_URL__ = standaloneModuleUrl(standaloneRecordData.textContent);
standaloneRecordData.remove();
window.__KAIRO_INK_URL__ = ${moduleUrlExpression(inkUrl)};
// 案内つきの稽古: one sprite blob, shared by the moments' stylesheet and their preload
const guidedSpriteNode = document.getElementById('standalone-guided-sprite');
const guidedSpriteUrl = URL.createObjectURL(new Blob([
  Uint8Array.from(atob(guidedSpriteNode.textContent), character => character.charCodeAt(0)),
], { type: 'image/png' }));
guidedSpriteNode.remove();
const shelfArtNode = document.getElementById('standalone-shelf-art');
window.__KAIRO_SHELF_ART_URL__ = URL.createObjectURL(new Blob([
  Uint8Array.from(atob(shelfArtNode.textContent), character => character.charCodeAt(0)),
], { type: 'image/png' }));
shelfArtNode.remove();
const guidedStylesNode = document.getElementById('standalone-guided-styles');
const guidedStyles = JSON.parse(guidedStylesNode.textContent);
guidedStylesNode.remove();
const guidedStyleUrl = (css) => URL.createObjectURL(new Blob([css], { type: 'text/css' }));
window.__KAIRO_GUIDED_SESSION_URL__ = ${moduleUrlExpression('data:text/javascript;base64,' + guidedSessionBytes.toString('base64'))};
window.__KAIRO_GUIDED_MOMENTS_URL__ = ${moduleUrlExpression('data:text/javascript;base64,' + guidedMomentsBytes.toString('base64'))};
window.__KAIRO_GUIDED_STYLE_URL__ = guidedStyleUrl(guidedStyles.session);
window.__KAIRO_GUIDED_MOMENTS_STYLE_URL__ = guidedStyleUrl(
  guidedStyles.moments.split(${JSON.stringify(GUIDED_SPRITE_REF)}).join("url('" + guidedSpriteUrl + "')"));
window.__KAIRO_GUIDED_SPRITE_URL__ = guidedSpriteUrl;
${appScript}
</script>`;

// Fragment mode: style + body content only, for hosts that supply the document
// skeleton themselves.
const fragmentHtml = `<title>回廊 KAIRO</title>
<style>
${read('corridor.css')}
${read('reference-ui.css')}
${read('drift-layer.css')}
${read('skip-ui.css')}
${read('register.css')}
${read('maintenance/report-client.css')}
${read('editorial.css')}
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
<title>回廊 KAIRO</title>
<style>
${read('corridor.css')}
${read('reference-ui.css')}
${read('drift-layer.css')}
${read('skip-ui.css')}
${read('register.css')}
${read('maintenance/report-client.css')}
${read('editorial.css')}
</style>
</head>
<body>
${BODY}
</body>
</html>
`;

const emitted = fragment ? fragmentHtml : html;
// story pictures are served-build only (storyPictureSource), so a WebP in the single file is dead weight
assert(!/data:image\/webp|UklGR[A-Za-z0-9+/]{6}XRUJQ/u.test(emitted), 'Standalone must carry no WebP payload');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, emitted, { flag: 'wx' });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
writeFileSync(out + '.build.json', JSON.stringify({ status: 'passed', site: CORRIDOR,
  artifactSha256: JSON.parse(read('build-identity.json')).artifactSha256,
  output: out, standaloneSha256: digest(readFileSync(out)),
  inlinedControllerModules: [...controllerImports.values()].map(([specifier]) => specifier),
  recordRuntimeSha256: digest(recordRuntimeBytes), inlinedRecordModules: [...recordImports.keys()],
  inlinedAssessmentModules: [...assessmentImports.keys()],
  assessmentAssets: [...assessmentAssets].map(([path, { bytes, sha256 }]) => ({ path, bytes, sha256 })),
  recordModuleTransport: 'blob', inlinedModuleTransport: 'blob', driftSharesRecordRuntime: true,
  inkModuleSha256: digest(inkBytes), builderSha256: digest(readFileSync(fileURLToPath(import.meta.url))),
  guidedSessionSha256: digest(guidedSessionBytes), guidedMomentsSha256: digest(guidedMomentsBytes),
  editorialStyleSha256: digest(read('editorial.css')), shelfArtSha256: digest(shelfArt),
  guidedSets: guidedIndex.sets.map((entry) => entry.path),
  compiler: { name: 'esbuild', version }, selfContainedController: true,
  scope: 'Standalone corpus, shared controllers, durable record and writing engine; no live-provider, native account or whole-audio-library claim.' }, null, 2) + '\n', { flag: 'wx' });
console.log(`${out}  ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
