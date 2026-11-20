/** G11 judge: one inbox contract with provenance, capability (retained body or pointer) and exact anchors, extended in
 * place (campaign/contracts/G11.json; SPEC S3-R13, S3-R14, S4-R24). Pinned by the contract: the worker extends
 * prototypes/corridor/source-inbox.mjs in place and may not edit this file.
 *
 * The inbox module imports two generated bundles (modules/reading-core.mjs, modules/record-core.mjs) that the release
 * build stages and never commits, so this judge stages them the same way — scripts/build-reading-module.mjs over this
 * checkout — beside the checkout's exact source-inbox.mjs bytes in a scratch directory with a build-identity manifest, and
 * imports the module from there. Nothing is written into the tree. The two existing tests are pinned by sha256 to their
 * base bytes; tools/source-inbox.test.mjs is run against the same staging, tools/verify-source-inbox.mjs is a browser run
 * the release battery owns. Authored by the Bunki lead 2026-11-06; TESTS_SOUND by a second family before pinning. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..', '..');
const ROOT = realpathSync(resolve(CORRIDOR, '..', '..'));
const SOURCE_INBOX = join(CORRIDOR, 'source-inbox.mjs');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
/** base bytes of the tests the contract keeps unchanged (95b88309e; identical at the G2 integration base) */
const PINNED = {
  'prototypes/corridor/tools/source-inbox.test.mjs': 'b1bd06179f82ac7f04bd85bf737ef059440a2fccf96a985c880ece96e9ab5c59',
  'prototypes/corridor/tools/verify-source-inbox.mjs': '43c898eadf446c49b500a80bb7a4d6fc004fd4c390c9dc9dff7e75bda2b6e34f',
};
/** every export of source-inbox.mjs at the base: all must survive the extension */
const BASE_EXPORTS = ['SOURCE_INBOX_LIMITS', 'SourceInboxError', 'TRANSCRIPT_LIMITS', 'FILE_SOURCE_LIMITS', 'parseFileReference',
  'parseFileTextObservation', 'reviewFileText', 'sameFileBytes', 'parseCaptureInput', 'createSourceCapture', 'parseSourceInbox',
  'acceptSourceCapture', 'selectSourceCapture', 'parseSourceReferenceInput', 'createSourceReferenceCapture',
  'sourceReferenceInputForCapture', 'sourceReferenceIntent', 'prepareSourceReferenceCapture', 'sourceReferenceShelf', 'parseMediaTime',
  'formatMediaTime', 'selectListeningSource', 'selectListeningExcerpt', 'selectListeningTranscript', 'selectListeningTranscriptRange',
  'previewListeningTranscript', 'addListeningTranscript', 'registerListeningSource', 'confirmListeningPosition', 'addListeningExcerpt',
  'listeningResumeLink', 'createListeningExcerptRecovery', 'createListeningTranscriptRecovery', 'addFileCapture', 'selectFileCapture',
  'selectFileTextRange', 'createFileCaptureRecovery', 'createCaptureRecovery'];

// ---- staging: the checkout's inbox bytes beside freshly built bundles, as the release build stages them -------------
const STAGE = mkdtempSync(join(tmpdir(), 'g11-source-intake-'));
after(() => rmSync(STAGE, { recursive: true, force: true }));
async function stage() {
  const { buildCorridorModules } = await import(pathToFileURL(join(ROOT, 'scripts', 'build-reading-module.mjs')));
  const wanted = new Set(['modules/reading-core.mjs', 'modules/record-core.mjs']);
  const modules = buildCorridorModules(ROOT).filter((module) => wanted.has(module.path));
  assert.equal(modules.length, 2, 'the reading and record bundles build from this checkout');
  mkdirSync(join(STAGE, 'modules'), { recursive: true });
  const files = [];
  const put = (path, bytes) => { writeFileSync(join(STAGE, path), bytes); files.push({ path, bytes: bytes.length, sha256: sha(bytes) }); };
  put('source-inbox.mjs', readFileSync(SOURCE_INBOX));
  for (const module of modules) put(module.path, module.bytes);
  writeFileSync(join(STAGE, 'build-identity.json'), `${JSON.stringify({ schemaVersion: 1, product: 'KAIRO', stagedBy: 'G11 judge', files }, null, 2)}\n`);
  return import(pathToFileURL(join(STAGE, 'source-inbox.mjs')));
}

// ---- the S4-R24 scan: every module under prototypes/corridor and apps that exports a capture-inbox API ---------------
const SKIP = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', '.turbo', 'out', '.git']);
const INBOX_API = /^(parse|create|accept|add|ingest|store|save|record)\w*(Capture|Inbox)\w*$/u;
function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP.has(entry.name)) yield* sourceFiles(join(dir, entry.name)); }
    else if (/\.(mjs|js|ts|tsx)$/u.test(entry.name)) yield join(dir, entry.name);
  }
}
function exportedNames(file) {
  const source = readFileSync(file, 'utf8');
  if (!/export/u.test(source)) return [];
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const names = [];
  sf.forEachChild(function visit(node) {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const exported = !!modifiers && modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && ts.isFunctionDeclaration(node) && node.name) names.push(node.name.text);
    if (exported && ts.isVariableStatement(node)) for (const d of node.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text);
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) for (const el of node.exportClause.elements) names.push(el.name.text);
    ts.forEachChild(node, visit);
  });
  return names;
}
/** files under the roots that export a capture-inbox API, relative to `base` */
function captureInboxModules(roots, base) {
  const hits = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const file of sourceFiles(root)) {
      const api = exportedNames(file).filter((name) => INBOX_API.test(name));
      if (api.length) hits.push({ file: relative(base, file).split(sep).join('/'), api });
    }
  }
  return hits.sort((a, b) => (a.file < b.file ? -1 : 1));
}

const now = '2026-11-06T02:00:00.000Z';
const A = '3c9b1f2e-5d7a-4c6b-8e1f-0a2b3c4d5e6f', B = '4c9b1f2e-5d7a-4c6b-8e1f-0a2b3c4d5e6f', C = '5c9b1f2e-5d7a-4c6b-8e1f-0a2b3c4d5e6f';
const L = '6c9b1f2e-5d7a-4c6b-8e1f-0a2b3c4d5e6f', X = '7c9b1f2e-5d7a-4c6b-8e1f-0a2b3c4d5e6f', Y = '8c9b1f2e-5d7a-4c6b-8e1f-0a2b3c4d5e6f';
const body = '  図書館で本を読む。\r\n二行目は短い。  ';
const other = '別の文章。';
const url = 'https://example.org/watch?v=personal&t=73#t=1m13s';

test('source intake contract · G11', async (t) => {
  let m;
  await t.test('the extended inbox module stages and exports the contract', async () => {
    m = await stage();
    for (const name of ['createSourceIntake', 'acceptSourceIntake', 'selectSourceIntake', 'addSourceAnchor', 'selectSourceAnchor', 'resolveSourceAnchor'])
      assert.equal(typeof m[name], 'function', `source-inbox.mjs exports ${name}`);
    for (const name of BASE_EXPORTS) assert.ok(name in m, `base export ${name} survives`);
  });

  const intake = (id, origin, { title = '図書館で', link = url, text = body, claims = null } = {}) => m.createSourceIntake({
    id, capturedAt: now, provenance: { sourceId: id, title, origin, url: link }, capability: text.trim() ? 'retained-body' : 'pointer', text, claims });

  await t.test('[0] a capture through the contract: retained-body keeps the body; a pointer-only source records pointer and no body', () => {
    const kept = intake(A, 'library');
    assert.equal(kept.intake.capability, 'retained-body');
    assert.equal(kept.capture.candidate.article.body.text, body, 'the exact text is retained');
    assert.equal(kept.intake.textSha256, sha(body)); assert.equal(kept.capture.candidate.article.body.contentSha256, sha(body));
    for (const op of ['display-body', 'retain-offline', 'quote-extract']) assert.equal(kept.capture.candidate.article.capabilities[op].status, 'allowed', `${op} from the learner's own action`);
    assert.equal(kept.capture.candidate.article.capabilities['display-body'].basis.kind, 'user-action');
    const pointer = intake(B, 'intake', { title: '', text: '' });
    assert.equal(pointer.intake.capability, 'pointer');
    assert.equal(pointer.capture.candidate.article.body, null, 'no body text'); assert.equal(pointer.intake.textSha256, null);
    assert.equal(pointer.capture.encounterUrl, url);
    for (const [op, decision] of Object.entries(pointer.capture.candidate.article.capabilities)) if (op !== 'discover-metadata') assert.notEqual(decision.status, 'allowed', `${op} not granted by a pointer`);
    // a capability untrue to the bytes is refused
    assert.throws(() => m.createSourceIntake({ id: C, capturedAt: now, provenance: { sourceId: C, title: 'x', origin: 'library', url }, capability: 'retained-body', text: '   ', claims: null }), /intake-capability-mismatch/u);
    assert.throws(() => m.createSourceIntake({ id: C, capturedAt: now, provenance: { sourceId: C, title: 'x', origin: 'library', url }, capability: 'pointer', text: body, claims: null }), /intake-capability-mismatch/u);
    assert.throws(() => m.createSourceIntake({ id: C, capturedAt: now, provenance: { sourceId: C, title: 'x', origin: 'library', url: null }, capability: 'pointer', text: '', claims: null }), /capture-empty/u, 'a pointer needs a link');
    assert.throws(() => m.createSourceIntake({ id: C, capturedAt: now, provenance: { sourceId: A, title: 'x', origin: 'library', url }, capability: 'retained-body', text: body, claims: null }), /intake-source-mismatch/u);
    assert.throws(() => m.createSourceIntake({ id: C, capturedAt: now, provenance: { sourceId: C, title: 'x', origin: 'elsewhere', url }, capability: 'retained-body', text: body, claims: null }), /invalid-intake-origin/u);
  });

  await t.test('[1] a licence or permission claim is stored as provenance only; no copy, processing or export flag is derived (S3-R13)', () => {
    const claims = { licence: 'CC BY 4.0, so the learner says', permission: 'the author said I may copy and process it' };
    const claimed = intake(C, 'clipboard', { link: null, claims });
    const plain = intake(C, 'clipboard', { link: null });
    assert.deepEqual(claimed.capture, plain.capture, 'the claim changes nothing in the capture: same policy, same provenance, same bytes');
    assert.deepEqual(claimed.intake.claims, claims, 'the claim is kept as the learner\'s words');
    for (const op of ['ai-transform', 'sync-body', 'synthesize-audio', 'redistribute-audio']) assert.notEqual(claimed.capture.candidate.article.capabilities[op].status, 'allowed', `${op} is not granted by a claim`);
    assert.deepEqual(Object.keys(claimed.intake).sort(), ['capability', 'captureId', 'claims', 'origin', 'textSha256'], 'no flag beside the claim');
    const view = m.selectSourceIntake(m.acceptSourceIntake(null, claimed), C);
    assert.deepEqual(view.provenance.claims, claims);
    assert.equal(view.provenance.licence, plain.capture.candidate.provenance[0].license, 'the candidate\'s licence field is the module\'s own statement, not the claim');
    assert.match(view.provenance.licence, /not established/iu);
    assert.equal(view.capability, 'retained-body'); assert.equal(view.provenance.origin, 'clipboard'); assert.equal(view.body, body);
    // the base's guard still holds: a claim written into the candidate's provenance is refused
    const forged = clone(claimed.capture); forged.candidate.provenance[0].license = claims.licence;
    assert.throws(() => m.acceptSourceCapture(null, forged), /capture-contract-mismatch/u);
    // and an intake row cannot say more than the bytes
    const pointer = intake(B, 'intake', { title: '', text: '' });
    assert.throws(() => m.acceptSourceIntake(null, { capture: pointer.capture, intake: { ...pointer.intake, capability: 'retained-body' } }), /invalid-intake/u);
    assert.throws(() => m.acceptSourceIntake(null, { capture: pointer.capture, intake: { ...pointer.intake, textSha256: sha(body) } }), /invalid-intake/u);
  });

  await t.test('[2] an exact anchor {source id, text sha256, token} reads back identical; a changed text invalidates it instead of moving it (S3-R14)', () => {
    let lib = m.acceptSourceIntake(null, intake(A, 'library'));
    const anchor = { id: X, sourceId: A, textSha256: sha(body), token: { index: 7, length: 3 } };
    lib = m.addSourceAnchor(lib, anchor);
    assert.deepEqual(m.selectSourceAnchor(lib, X), anchor, 'read back identical');
    assert.deepEqual(m.parseSourceInbox(clone(lib)), lib, 'survives a storage round trip');
    assert.deepEqual(m.resolveSourceAnchor(lib, X), { status: 'exact', sourceId: A, textSha256: sha(body), token: { index: 7, length: 3 } });
    assert.strictEqual(m.addSourceAnchor(lib, anchor), lib, 'a retry is idempotent');
    assert.throws(() => m.addSourceAnchor(lib, { ...anchor, token: { index: 8, length: 3 } }), /anchor-conflict/u);
    // written against text that is not there: refused
    assert.throws(() => m.addSourceAnchor(lib, { ...anchor, id: Y, textSha256: sha(other) }), /anchor-text-mismatch/u);
    const withPointer = m.acceptSourceIntake(lib, intake(B, 'intake', { title: '', text: '' }));
    assert.throws(() => m.addSourceAnchor(withPointer, { ...anchor, id: Y, sourceId: B }), /anchor-text-mismatch/u, 'a pointer holds no text to anchor');
    assert.throws(() => m.addSourceAnchor(lib, { ...anchor, id: Y, token: { index: -1, length: 3 } }), /invalid-anchor-token/u);
    assert.throws(() => m.addSourceAnchor(lib, { ...anchor, id: Y, sourceId: C }), /invalid-source-anchor/u, 'no such source');
    // the text behind the anchor changed: the record is kept, the position is invalid, never moved
    const stale = clone(lib); stale.anchors[0].textSha256 = sha(other);
    const parsed = m.parseSourceInbox(stale);
    assert.deepEqual(m.selectSourceAnchor(parsed, X), stale.anchors[0], 'kept as written');
    const resolved = m.resolveSourceAnchor(parsed, X);
    assert.equal(resolved.status, 'invalid'); assert.equal(resolved.reason, 'text-changed'); assert.equal(resolved.token, null, 'no guessed position');
    assert.equal(m.resolveSourceAnchor(lib, Y), null);
  });

  await t.test('[3] captures from library, intake and clipboard paths land in the one inbox; the base functions keep their signatures (S4-R24)', () => {
    let one = null;
    for (const [id, origin, opts] of [[A, 'library', {}], [B, 'intake', { title: '', text: '' }], [C, 'clipboard', { link: null }]]) one = m.acceptSourceIntake(one, intake(id, origin, opts));
    assert.equal(one.version, 5); assert.equal(one.entries.length, 3);
    assert.deepEqual(one.intake.map((row) => row.origin), ['library', 'intake', 'clipboard']);
    assert.deepEqual(m.parseSourceInbox(clone(one)), one, 'parsed by parseSourceInbox');
    assert.ok(Object.isFrozen(one.intake) && Object.isFrozen(one.anchors));
    for (const id of [A, B, C]) assert.ok(m.selectSourceCapture(one, id), `${id} is in the inbox`);
    assert.deepEqual(m.selectSourceCapture(one, A), m.createSourceCapture({ id: A, capturedAt: now, title: '図書館で', url, text: body }), 'the contract\'s captures are the inbox\'s own captures, byte for byte');
    assert.strictEqual(m.acceptSourceIntake(one, intake(A, 'library')), one, 'a retry is idempotent');
    assert.throws(() => m.acceptSourceIntake(one, intake(A, 'share')), /intake-conflict/u, 'a different row for the same capture is refused');
    assert.throws(() => m.acceptSourceIntake(one, intake(A, 'library', { text: other })), /capture-conflict/u, 'the base guard still refuses a conflicting capture');
    // an inbox from before the contract still parses, is read through the contract, and upgrades only when written to
    const legacy = m.acceptSourceCapture(null, m.createSourceCapture({ id: L, capturedAt: now, title: '古い', url, text: body }));
    assert.equal(legacy.version, 1);
    const view = m.selectSourceIntake(legacy, L);
    assert.equal(view.capability, 'retained-body'); assert.equal(view.provenance.origin, null); assert.equal(view.provenance.claims, null); assert.equal(view.textSha256, sha(body));
    const upgraded = m.acceptSourceIntake(legacy, intake(B, 'intake', { title: '', text: '' }));
    assert.equal(upgraded.version, 5); assert.equal(upgraded.entries.length, 2); assert.equal(upgraded.intake.length, 1);
    assert.ok(m.selectSourceCapture(upgraded, L));
    assert.throws(() => m.parseSourceInbox({ version: 5, entries: [] }), 'a version-5 inbox without its arrays fails closed, as the base test expects');
    assert.throws(() => m.parseSourceInbox({ ...clone(upgraded), intake: [upgraded.intake[0], upgraded.intake[0]] }), /duplicate-intake/u, 'two rows for one capture');
    assert.throws(() => m.parseSourceInbox({ ...clone(one), intake: [...one.intake, one.intake[0]] }), /invalid-intake-library/u, 'more rows than captures');
    assert.equal(m.createSourceCapture.length, 1); assert.equal(m.acceptSourceCapture.length, 2); assert.equal(m.parseSourceInbox.length, 1);
    const parsers = exportedNames(SOURCE_INBOX).filter((name) => name === 'parseSourceInbox');
    assert.equal(parsers.length, 1, 'one parseSourceInbox');
  });

  await t.test('[4] no second capture inbox under prototypes/corridor or apps; a planted second module turns the scan red (S4-R24)', () => {
    const hits = captureInboxModules([join(ROOT, 'prototypes', 'corridor'), join(ROOT, 'apps')], ROOT);
    assert.deepEqual(hits.map((hit) => hit.file), ['prototypes/corridor/source-inbox.mjs'], `only source-inbox.mjs exports a capture-inbox API; found ${JSON.stringify(hits)}`);
    assert.ok(hits[0].api.includes('createSourceCapture') && hits[0].api.includes('acceptSourceCapture') && hits[0].api.includes('parseSourceInbox'));
    // negative control: a scratch tree with the inbox and a second module exporting createSourceCapture under another name
    const tree = join(STAGE, 'scan-control'); mkdirSync(join(tree, 'prototypes', 'corridor', 'shelf'), { recursive: true });
    writeFileSync(join(tree, 'prototypes', 'corridor', 'source-inbox.mjs'), readFileSync(SOURCE_INBOX));
    writeFileSync(join(tree, 'prototypes', 'corridor', 'shelf', 'shelf-inbox.mjs'), "import { createSourceCapture } from '../source-inbox.mjs';\nexport { createSourceCapture as createShelfCapture };\nexport function acceptShelfInboxItem(raw) { return raw; }\n");
    const planted = captureInboxModules([join(tree, 'prototypes', 'corridor')], tree);
    assert.equal(planted.length, 2, 'the planted module is found');
    assert.throws(() => assert.deepEqual(planted.map((hit) => hit.file), ['prototypes/corridor/source-inbox.mjs']), 'the scan goes red');
    assert.deepEqual(planted[0].api.sort(), ['acceptShelfInboxItem', 'createShelfCapture']);
  });

  await t.test('[5] the existing tests are unchanged and still green against the same staging', () => {
    for (const [path, pinned] of Object.entries(PINNED)) assert.equal(sha(readFileSync(join(ROOT, path))), pinned, `${path} is byte-identical to the base`);
    // the runner's own context variable must not reach the grandchild, or it reports as a test child instead of printing TAP
    const { NODE_TEST_CONTEXT, ...env } = process.env;
    const out = execFileSync(process.execPath, ['--test', 'prototypes/corridor/tools/source-inbox.test.mjs'], { cwd: ROOT, encoding: 'utf8', env: { ...env, KAIRO_SITE_DIR: STAGE }, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.match(out, /^# fail 0$/mu, `tools/source-inbox.test.mjs: ${out.split('\n').filter((l) => /^# (pass|fail)/u.test(l)).join(' ')}`);
    assert.ok(Number((out.match(/^# pass (\d+)$/mu) || [])[1]) >= 10, 'the base suite ran');
    // tools/verify-source-inbox.mjs is a Playwright run over the staged site; pinned here, run by the release battery (verify-release-gates: source-inbox-integration)
  });
});
