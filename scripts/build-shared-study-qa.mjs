#!/usr/bin/env node
/** Derive an isolated QA host from an existing built Corridor site.
 *
 * The source site is copied with a macOS clone (`cp -c -R`) so its original
 * build identity remains byte-for-byte intact. Only the derived index and the
 * explicitly owned host modules are changed; a separate receipt records the
 * transformation and never claims a production build. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync,
  statSync, writeFileSync} from 'node:fs';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {QA_HOST_MARKER} from '../prototypes/corridor/shared-study-test-host.mjs';
import {verifyBundledArtifact} from '../prototypes/bunki-desktop/lib/artifact.cjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(repo, 'prototypes/corridor');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const QA_MODULES = [
  'corridor.js',
  'study-engine-adapter.mjs',
  'shared-study-runtime.mjs',
  'shared-study-presentation.mjs',
  'shared-study-audio-preparation.mjs',
  'shared-study-test-host.mjs',
  'shared-study-test-bootstrap.mjs',
  'shared-study-sync.mjs',
];
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/build-shared-study-qa.mjs --site <existing-built-site> --out <fresh-directory-under-~/.dharma> --run <safe-run>');
  process.exit(2);
}

const flags = new Map();
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 2) {
  const flag = argv[index];
  const value = argv[index + 1];
  if (!['--site', '--out', '--run'].includes(flag) || value === undefined || flags.has(flag))
    usage(`Unexpected argument: ${flag ?? ''}`);
  flags.set(flag, value);
}
if (flags.size !== 3) usage();

const site = resolve(flags.get('--site'));
const output = resolve(flags.get('--out'));
const runId = flags.get('--run');
if (!RUN_ID.test(runId || '')) usage('Run ID must be safe alphanumeric/hyphen text.');
if (!isAbsolute(flags.get('--site')) || !isAbsolute(flags.get('--out')))
  usage('Both --site and --out must be absolute paths.');
if (!existsSync(site) || !statSync(site).isDirectory()) usage('The source site does not exist.');
const sourceIndex = join(site, 'index.html');
if (!existsSync(sourceIndex) || !statSync(sourceIndex).isFile()) usage('The source site has no index.html.');
if (existsSync(output)) usage('The output directory already exists; choose a fresh directory.');

function inside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}
function canonicalDestination(path) {
  let ancestor = path;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  return resolve(realpathSync(ancestor), relative(ancestor, path));
}

const destination = canonicalDestination(output);
const allowedRoot = canonicalDestination(join(homedir(), '.dharma'));
if (!inside(allowedRoot, destination) || destination === allowedRoot)
  usage('The output must be a fresh directory under ~/.dharma.');
if (inside(realpathSync(repo), destination)) usage('The output must be outside the checkout.');
for (const module of QA_MODULES) {
  const path = join(source, module);
  if (!existsSync(path) || !statSync(path).isFile()) usage(`Missing host module: ${module}`);
}

try {
  if(realpathSync(site)!==site)throw Error('QA source site must be a real directory, not a symlink alias.');
  // Authenticate all admitted source bytes before deriving the QA shell. Its
  // producer may predate this branch; that distinction stays in the receipt.
  const admitted=verifyBundledArtifact(site);
  const routeInputs=['index.html','corridor.js','modules/study-host.mjs','decks/player/mount.js',
    'shared-study-audio-preparation.mjs',
    'shared-study-content.mjs','shared-study-presentation.mjs','shared-study-storage.mjs','decks/player/shared-frame.mjs','decks/player/shared-mount.mjs'].map(path=>{
      const bytes=readFileSync(join(site,path));
      const current=digest(readFileSync(join(source,path)));
      if(path!=='corridor.js'&&digest(bytes)!==current)throw Error(`QA source route differs from current source: ${path}`);
      return {path,sourceArtifactSha256:digest(bytes),currentSourceSha256:current,
        ...(path==='corridor.js'?{qaOverlay:true}:{})};
    });
  mkdirSync(dirname(output), {recursive: true});
  // Native clone on macOS; this copies the built site itself, never a
  // dependency installation or a second production build.
  execFileSync('cp', ['-c', '-R', site, output], {stdio: 'pipe'});
  const derivedIndex = join(output, 'index.html');
  if (!existsSync(derivedIndex)) throw Error('Copied site is missing index.html.');
  const original = readFileSync(derivedIndex, 'utf8');
  const entries = [...original.matchAll(/<script\b[^>]*>\s*<\/script>/gi)].filter(match =>
    /\btype\s*=\s*["']module["']/i.test(match[0]) &&
    /\bsrc\s*=\s*["'](?:\.\/)?corridor\.js["']/i.test(match[0]));
  if (entries.length !== 1) throw Error('The source index must have exactly one module corridor.js entry.');
  const entry = entries[0];
  const boot = '<script type="module" src="shared-study-test-bootstrap.mjs"></script>';
  let html = original.slice(0, entry.index) + boot + original.slice(entry.index + entry[0].length);
  const head = html.search(/<\/head\s*>/i);
  if (head < 0) throw Error('The source index has no head element.');
  const meta = `    <meta name="bunki-shared-study-qa" content="${QA_HOST_MARKER}" />\n` +
    `    <meta name="bunki-shared-study-qa-run" content="${runId}" />\n`;
  html = html.slice(0, head) + meta + html.slice(head);
  writeFileSync(derivedIndex, html);

  const modules = QA_MODULES.map(path => {
    const from = join(source, path);
    const to = join(output, path);
    copyFileSync(from, to);
    const bytes = readFileSync(to);
    return {path, bytes: bytes.length, sha256: digest(bytes)};
  });

  const originalBytes = readFileSync(sourceIndex);
  const derivedBytes = readFileSync(derivedIndex);
  const identityPath = join(output, 'build-identity.json');
  const identityBytes = existsSync(identityPath) ? readFileSync(identityPath) : null;
  let identity = null;
  if (identityBytes) {
    try {
      const parsed = JSON.parse(identityBytes);
      identity = {buildId: parsed.buildId ?? null, gitSha: parsed.gitSha ?? null,
        release: parsed.release ?? null, artifactSha256: parsed.artifactSha256 ?? null};
    } catch { identity = null; }
  }
  const receipt = {
    format: 'bunki-shared-study-qa-host-receipt/v1',
    productionBuild: false,
    productionIdentity: 'source-site-build-identity-copied-unchanged',
    qaHostMarker: QA_HOST_MARKER,
    runId,
    sourceSite: realpathSync(site),
    admittedSourceArtifactSha256:admitted.artifactSha256,
    actualCorridorRouteInputs:routeInputs,
    sourceIndex: {bytes: originalBytes.length, sha256: digest(originalBytes)},
    derivedIndex: {bytes: derivedBytes.length, sha256: digest(derivedBytes)},
    sourceBuildIdentity: identityBytes ? {sha256: digest(identityBytes), ...identity,
      mutated: false} : null,
    entryReplacement: {from: 'corridor.js', to: 'shared-study-test-bootstrap.mjs'},
    modules,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(output, 'qa-host-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({output, runId, productionBuild: false,
    derivedIndexSha256: receipt.derivedIndex.sha256, modules: modules.length}, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
