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

const args = process.argv.slice(2);
assert(args.filter((arg) => !arg.startsWith('--')).length <= 1 && args.every((arg) => !arg.startsWith('--') || arg === '--fragment'), 'Usage: build-standalone.mjs [external-outfile] [--fragment]');
const outArg = args.find((arg) => !arg.startsWith('--'));
const out = externalPath(outArg || join(resolveCorridorEvidence(), 'corridor-standalone.html'), { fresh: true });
const fromCheckout = relative(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), out);
assert(fromCheckout === '..' || fromCheckout.startsWith('..' + sep) || isAbsolute(fromCheckout), 'Standalone output must be outside the checkout');
assert(!existsSync(out + '.build.json'), 'Standalone receipt already exists; choose a fresh output.');
const CORRIDOR = resolveCorridorSite();
const read = (p) => readFileSync(resolve(CORRIDOR, p), 'utf8');
const controllerBuild = buildSync({
  absWorkingDir: CORRIDOR, entryPoints: ['reading-controller.mjs'],
  outfile: 'standalone-reading-controller.mjs', bundle: true, format: 'esm',
  platform: 'browser', target: ['safari17', 'chrome120'], charset: 'utf8',
  minify: true, legalComments: 'inline', metafile: true, write: false,
});
assert.equal(controllerBuild.outputFiles.length, 1);
assert.deepEqual(Object.values(controllerBuild.metafile.outputs)[0].imports, [], 'Standalone controller must not depend on external modules');
const controllerBytes = Buffer.from(controllerBuild.outputFiles[0].contents);
const controllerUrl = 'data:text/javascript;base64,' + controllerBytes.toString('base64');
const feedBytes = Buffer.from(read('modules/feed-core.mjs'));
const feedUrl = 'data:text/javascript;base64,' + feedBytes.toString('base64');
const feedControllerBuild = buildSync({
  absWorkingDir: CORRIDOR, entryPoints: ['feed-controller.mjs'],
  outfile: 'standalone-feed-controller.mjs', bundle: true, format: 'esm',
  platform: 'browser', target: ['safari17', 'chrome120'], charset: 'utf8',
  minify: true, legalComments: 'inline', metafile: true, write: false,
});
assert.equal(feedControllerBuild.outputFiles.length, 1);
assert.deepEqual(Object.values(feedControllerBuild.metafile.outputs)[0].imports, [], 'Standalone source controller must have no external imports');
const feedControllerBytes = Buffer.from(feedControllerBuild.outputFiles[0].contents);
const feedControllerUrl = 'data:text/javascript;base64,' + feedControllerBytes.toString('base64');
const assessmentControllerBuild = buildSync({
  absWorkingDir: CORRIDOR, entryPoints: ['assessment-controller.mjs'],
  outfile: 'standalone-assessment-controller.mjs', bundle: true, format: 'esm',
  platform: 'browser', target: ['safari17', 'chrome120'], charset: 'utf8',
  minify: true, legalComments: 'inline', metafile: true, write: false,
});
assert.equal(assessmentControllerBuild.outputFiles.length, 1);
assert.deepEqual(Object.values(assessmentControllerBuild.metafile.outputs)[0].imports, [], 'Standalone assessment controller must have no external imports');
const assessmentControllerBytes = Buffer.from(assessmentControllerBuild.outputFiles[0].contents);
const assessmentControllerUrl = 'data:text/javascript;base64,' + assessmentControllerBytes.toString('base64');
const publisherControllerBuild = buildSync({
  absWorkingDir: CORRIDOR, entryPoints: ['publisher-controller.mjs'],
  outfile: 'standalone-publisher-controller.mjs', bundle: true, format: 'esm',
  platform: 'browser', target: ['safari17', 'chrome120'], charset: 'utf8',
  minify: true, legalComments: 'inline', metafile: true, write: false,
});
assert.equal(publisherControllerBuild.outputFiles.length, 1);
assert.deepEqual(Object.values(publisherControllerBuild.metafile.outputs)[0].imports, [], 'Standalone publisher controller must have no external imports');
const publisherControllerBytes = Buffer.from(publisherControllerBuild.outputFiles[0].contents);
const publisherControllerUrl = 'data:text/javascript;base64,' + publisherControllerBytes.toString('base64');
const sourceInboxBuild = buildSync({
  absWorkingDir: CORRIDOR, entryPoints: ['source-inbox.mjs'],
  outfile: 'standalone-source-inbox.mjs', bundle: true, format: 'esm',
  platform: 'browser', target: ['safari17', 'chrome120'], charset: 'utf8',
  minify: true, legalComments: 'inline', metafile: true, write: false,
});
assert.equal(sourceInboxBuild.outputFiles.length, 1);
assert.deepEqual(Object.values(sourceInboxBuild.metafile.outputs)[0].imports, [], 'Standalone source inbox must have no external imports');
const sourceInboxUrl = 'data:text/javascript;base64,' + Buffer.from(sourceInboxBuild.outputFiles[0].contents).toString('base64');
const teacherDraftControllerBuild = buildSync({
  absWorkingDir: CORRIDOR, entryPoints: ['teacher-draft-controller.mjs'],
  outfile: 'standalone-teacher-draft-controller.mjs', bundle: true, format: 'esm',
  platform: 'browser', target: ['safari17', 'chrome120'], charset: 'utf8',
  minify: true, legalComments: 'inline', metafile: true, write: false,
});
assert.equal(teacherDraftControllerBuild.outputFiles.length, 1);
assert.deepEqual(Object.values(teacherDraftControllerBuild.metafile.outputs)[0].imports, [], 'Standalone draft controller must have no external imports');
const teacherDraftControllerBytes = Buffer.from(teacherDraftControllerBuild.outputFiles[0].contents);
const teacherDraftControllerUrl = 'data:text/javascript;base64,' + teacherDraftControllerBytes.toString('base64');
const sentenceDraftControllerBuild = buildSync({
  absWorkingDir: CORRIDOR, entryPoints: ['sentence-draft-controller.mjs'],
  outfile: 'standalone-sentence-draft-controller.mjs', bundle: true, format: 'esm',
  platform: 'browser', target: ['safari17', 'chrome120'], charset: 'utf8',
  minify: true, legalComments: 'inline', metafile: true, write: false,
});
assert.equal(sentenceDraftControllerBuild.outputFiles.length, 1);
assert.deepEqual(Object.values(sentenceDraftControllerBuild.metafile.outputs)[0].imports, [], 'Standalone sentence draft controller must have no external imports');
const sentenceDraftControllerUrl = 'data:text/javascript;base64,' + Buffer.from(sentenceDraftControllerBuild.outputFiles[0].contents).toString('base64');
const sentencePracticeBuild = buildSync({
  absWorkingDir: CORRIDOR, entryPoints: ['sentence-practice.mjs'],
  outfile: 'standalone-sentence-practice.mjs', bundle: true, format: 'esm',
  platform: 'browser', target: ['safari17', 'chrome120'], charset: 'utf8',
  minify: true, legalComments: 'inline', metafile: true, write: false,
});
assert.equal(sentencePracticeBuild.outputFiles.length, 1);
assert.deepEqual(Object.values(sentencePracticeBuild.metafile.outputs)[0].imports, []);
const sentencePracticeUrl = 'data:text/javascript;base64,' + Buffer.from(sentencePracticeBuild.outputFiles[0].contents).toString('base64');

// The learner record is needed even when this file has no sibling assets.
// Bundle its entry points together so their shared classes and module state
// retain one identity; bundling each facade independently would duplicate them.
const recordImports = new Map([
  ['./record-controller.mjs', 'controller'],
  ['./record-binding.mjs', 'binding'],
  ['./record-app.mjs', 'app'],
  ['./record-sync.mjs', 'sync'],
  ['./modules/record-core.mjs', 'core'],
]);
const recordRuntimeBuild = buildSync({
  absWorkingDir: CORRIDOR,
  stdin: { contents: [...recordImports].map(([specifier, name]) =>
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
function moduleUrlExpression(dataUrl) {
  const prefix = 'data:text/javascript;base64,';
  assert(dataUrl.startsWith(prefix), 'Standalone modules must contain inline JavaScript bytes');
  return `standaloneModuleUrl(${JSON.stringify(dataUrl.slice(prefix.length))})`;
}
let appScript = read('corridor.js');
for (const [specifier, name] of recordImports) {
  const original = `import('${specifier}')`;
  assert.equal(appScript.split(original).length - 1, 1, `Standalone record import changed: ${specifier}`);
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
<script>
${read('skip-core.js')}
${read('skip-ui.js')}
</script>
<script type="module">
${tsfsrs}
window.__TSFSRS__ = { ${EXPORTS.join(', ')} };
</script>
<script type="application/octet-stream" id="standalone-record-module">${recordRuntimeBase64}</script>
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
window.__CORRIDOR_BUNDLE__ = JSON.parse(document.getElementById('corridor-bundle').textContent);
window.__KAIRO_READING_CONTROLLER_URL__ = ${moduleUrlExpression(controllerUrl)};
window.__KAIRO_TEACHER_CONTEXT_URL__ = ${moduleUrlExpression('data:text/javascript;base64,' + readFileSync(join(CORRIDOR, 'teacher-context.mjs')).toString('base64'))};
window.__KAIRO_TEACHER_DRAFTS_URL__ = ${moduleUrlExpression('data:text/javascript;base64,' + readFileSync(join(CORRIDOR, 'teacher-drafts.mjs')).toString('base64'))};
window.__KAIRO_TEACHER_DRAFT_CONTROLLER_URL__ = ${moduleUrlExpression(teacherDraftControllerUrl)};
window.__KAIRO_SENTENCE_DRAFTS_URL__ = ${moduleUrlExpression('data:text/javascript;base64,' + readFileSync(join(CORRIDOR, 'sentence-drafts.mjs')).toString('base64'))};
window.__KAIRO_SENTENCE_DRAFT_CONTROLLER_URL__ = ${moduleUrlExpression(sentenceDraftControllerUrl)};
window.__KAIRO_READING_POSITION_URL__ = ${moduleUrlExpression('data:text/javascript;base64,' + readFileSync(join(CORRIDOR, 'reading-position.mjs')).toString('base64'))};
window.__KAIRO_ASSESSMENT_CONTROLLER_URL__ = ${moduleUrlExpression(assessmentControllerUrl)};
window.__KAIRO_FEED_CORE_URL__ = ${moduleUrlExpression(feedUrl)};
window.__KAIRO_FEED_CONTROLLER_URL__ = ${moduleUrlExpression(feedControllerUrl)};
window.__KAIRO_PUBLISHER_CONTROLLER_URL__ = ${moduleUrlExpression(publisherControllerUrl)};
window.__KAIRO_SOURCE_INBOX_URL__ = ${moduleUrlExpression(sourceInboxUrl)};
window.__KAIRO_SENTENCE_PRACTICE_URL__ = ${moduleUrlExpression(sentencePracticeUrl)};
window.__KAIRO_SOURCE_PROCESSING_URL__ = ${moduleUrlExpression('data:text/javascript;base64,' + readFileSync(join(CORRIDOR, 'source-processing.mjs')).toString('base64'))};
// App and Drift share one record module identity, including its classes/state.
const standaloneRecordData = document.getElementById('standalone-record-module');
window.__KAIRO_RECORD_RUNTIME_URL__ = standaloneModuleUrl(standaloneRecordData.textContent);
standaloneRecordData.remove();
window.__KAIRO_INK_URL__ = ${moduleUrlExpression(inkUrl)};
${appScript}
</script>`;

// Fragment mode: style + body content only, for hosts that supply the document
// skeleton themselves.
const fragmentHtml = `<title>回廊 KAIRO — corridor prototype</title>
<style>
${read('corridor.css')}
${read('reference-ui.css')}
${read('drift-layer.css')}
${read('skip-ui.css')}
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
${read('reference-ui.css')}
${read('drift-layer.css')}
${read('skip-ui.css')}
</style>
</head>
<body>
${BODY}
</body>
</html>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, fragment ? fragmentHtml : html, { flag: 'wx' });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
writeFileSync(out + '.build.json', JSON.stringify({ status: 'passed', site: CORRIDOR,
  artifactSha256: JSON.parse(read('build-identity.json')).artifactSha256,
  output: out, standaloneSha256: digest(readFileSync(out)), controllerSha256: digest(controllerBytes), feedSha256: digest(feedBytes),
  assessmentControllerSha256: digest(assessmentControllerBytes),
  feedControllerSha256: digest(feedControllerBytes),
  publisherControllerSha256: digest(publisherControllerBytes),
  teacherDraftControllerSha256: digest(teacherDraftControllerBytes),
  recordRuntimeSha256: digest(recordRuntimeBytes), inlinedRecordModules: [...recordImports.keys()],
  recordModuleTransport: 'blob', inlinedModuleTransport: 'blob', driftSharesRecordRuntime: true,
  inkModuleSha256: digest(inkBytes), builderSha256: digest(readFileSync(fileURLToPath(import.meta.url))),
  compiler: { name: 'esbuild', version }, selfContainedController: true,
  scope: 'Standalone corpus, shared controllers, durable record and writing engine; no live-provider, native account or whole-audio-library claim.' }, null, 2) + '\n', { flag: 'wx' });
console.log(`${out}  ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
