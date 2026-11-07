/** Hfix-2e · X-19: the thesaurus's quiet labels read at 4.5:1 in every world, on the reference grid's ruled lines too.
 * Reuses the pixel-based contrast sweep unchanged and replaces only its navigation schedule, as verify-hfix2a-contrast.mjs
 * does: slot `words` opens the word web for 橋 and brings the thesaurus's labels ("to walk", "opposites", "opinion") into
 * view; slot `learn` searches 歩く and brings the search's near-in-meaning rows (their "opposites" label) into view. The
 * prerequisite walk is dropped (each slot navigates fresh). One engine per run: WebKit 390×844 touch, Chromium 1440×900
 * (HFIX2E_VIEWPORT=phone measures Chromium at the sweep's own 390×844). All eleven worlds, every `.thes-gloss` and
 * `.thes-rel` pair the sweep reads, at the sweep's own C1 threshold.
 * HFIX2E_MODE: base (the unfixed build: the row must be red), branch (green), control (the branch build with the labels'
 * ink served back as the shared quiet ink: red). Exit 0 = the row is green, 1 = red. Never an app-wide acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const engine = process.env.KAIRO_BROWSER;
assert(['webkit', 'chromium'].includes(engine), 'One engine at a time');
assert(!process.env.SWEEP_WORLDS && !process.env.SWEEP_STATES, 'All eleven worlds and exactly the two label slots');
const mode = process.env.HFIX2E_MODE || 'branch';
assert(['base', 'branch', 'control'].includes(mode), `unknown HFIX2E_MODE ${mode}`);
const viewport = process.env.HFIX2E_VIEWPORT || (engine === 'webkit' ? 'phone' : 'desktop');
assert(['phone', 'desktop'].includes(viewport) && !(engine === 'webkit' && viewport === 'desktop'), `bad HFIX2E_VIEWPORT ${viewport}`);
const WORLDS = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku'];
const LABEL = /\.?thes-(gloss|rel)\b/u;
const CONSUMER = ':is(.thes-gloss, .thes-rel) { color: var(--color-thes-label, var(--faint)); }';
const OLD_INK = ':is(.thes-gloss, .thes-rel) { color: var(--faint); }';
const out = resolveCorridorEvidence(); mkdirSync(out, { recursive: true });
const sha = (text) => createHash('sha256').update(text).digest('hex');
const load = () => execFileSync('uptime', { encoding: 'utf8' }).trim();

// the build under test carries the fix (branch, control) or not (base): checked on the served file itself
const servedCss = readFileSync(join(process.env.KAIRO_SITE_DIR, 'editorial.css'), 'utf8');
const carries = servedCss.split(CONSUMER).length - 1;
assert.equal(carries, mode === 'base' ? 0 : 1, `${mode}: the build ${mode === 'base' ? 'must not carry' : 'must carry'} the X-19 label ink`);

const source = new URL('./verify-contrast-sweep.mjs', import.meta.url);
const original = readFileSync(source, 'utf8');
let adapted = original.replace(/from '([^']+)'/gu, (whole, specifier) => specifier.startsWith('.')
  ? `from ${JSON.stringify(new URL(specifier, source).href)}`
  : specifier === 'playwright-core' ? `from ${JSON.stringify(import.meta.resolve(specifier))}` : whole);
function replaceOnce(before, after) {
  assert.equal(adapted.split(before).length, 2, `Contrast adapter seam must be unique: ${before.slice(0, 60)}`);
  adapted = adapted.replace(before, after);
}
// the runner lives beside its evidence: the sweep's own location answers its require, its digest and its sibling predicate
assert.equal(adapted.split('import.meta.url').length - 1, 3, 'Contrast adapter seam: the sweep names its own location three times');
adapted = adapted.split('import.meta.url').join(JSON.stringify(source.href));
// each slot navigates fresh: no prerequisite walk
replaceOnce("if (!states.includes(state) && !['shelf', 'reader', 'slip', 'page', 'today', 'me', 'deck-front'].includes(state)) continue;",
  'if (!states.includes(state)) continue;');
const phone = "viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: DPR, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'light' }";
if (viewport === 'desktop') replaceOnce(phone, "viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: DPR, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'light' }");
// control: the labels' ink served back as the shared quiet ink (registered after the origin route, so it answers first)
const originRoute = "await context.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));";
if (mode === 'control') replaceOnce(originRoute, `${originRoute}
      await context.route('**/editorial.css', async (route) => {
        const response = await route.fetch(); const text = await response.text();
        const served = text.split(${JSON.stringify(CONSUMER)}).join(${JSON.stringify(OLD_INK)});
        if (served === text) throw new Error('X-19 control: the mutation must fire');
        globalThis.__hfix2eMutations = (globalThis.__hfix2eMutations || 0) + 1;
        await route.fulfill({ response, body: served });
      });`);
replaceOnce('/* ------------------------------------------------------------------ run */', `
STEPS.words = async (page) => {
  await page.goto(origin + '/index.html?entry=shelf&ui=bi'); await ready(page);
  await page.evaluate(() => window.openWordWeb('橋', { type: 'word' })); await ready(page);
  await page.locator('.thes-gloss').filter({ hasText: 'to walk' }).first().scrollIntoViewIfNeeded(); await settle(page, 600);
};
STEPS.learn = async (page) => {
  await page.goto(origin + '/index.html?entry=shelf&ui=bi'); await ready(page);
  await openShelfTools(page); await page.locator('#search').fill('歩く');
  await page.locator('.search-syn .thes-rel').first().waitFor();
  await page.locator('.search-syn .thes-rel').first().scrollIntoViewIfNeeded(); await settle(page, 600);
};
/* ------------------------------------------------------------------ run */`);
if (mode === 'control') replaceOnce("writeFileSync(join(evidence, 'contrast-sweep.json'), JSON.stringify(report, null, 1));",
  "report.hfix2eMutations = globalThis.__hfix2eMutations || 0; writeFileSync(join(evidence, 'contrast-sweep.json'), JSON.stringify(report, null, 1));");
const runner = join(out, 'hfix2e-contrast-runner.mjs'); writeFileSync(runner, adapted);
const before = load();
const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', env: { ...process.env, SWEEP_STATES: 'learn,words' } });
const after = load();
if (result.error) throw result.error;
const report = JSON.parse(readFileSync(join(out, `sweep-${engine}.json`), 'utf8'));
if (mode === 'control') assert(report.hfix2eMutations > 0, 'X-19 control: the mutation fired');

const surfaces = { words: 'thesaurus (word web 橋)', learn: 'search 歩く, near-in-meaning rows' };
const perWorld = {}; const problems = [];
for (const world of WORLDS) {
  perWorld[world] = {};
  for (const state of Object.keys(surfaces)) {
    const row = report.results.find((r) => r.world === world && r.state === state && r.engine === engine);
    if (!row) { problems.push(`${world}/${state}: not measured`); continue; }
    const pairs = row.pairs.filter((pair) => LABEL.test(pair.sel || ''));
    const glosses = pairs.filter((pair) => /thes-gloss/u.test(pair.sel)).length, rels = pairs.filter((pair) => /thes-rel/u.test(pair.sel)).length;
    if (state === 'words' && (!glosses || !rels)) problems.push(`${world}/words: ${glosses} glosses and ${rels} relations measured`);
    if (state === 'learn' && !rels) problems.push(`${world}/learn: no relation label measured`);
    const worst = pairs.reduce((low, pair) => (!low || pair.ratio < low.ratio ? pair : low), null);
    const failing = pairs.filter((pair) => !pair.ok);
    for (const pair of failing) problems.push(`${world}/${state}: ${pair.ratio}<${pair.required} ${pair.fg} on ${pair.bg} "${pair.text}"`);
    perWorld[world][state] = { pairs: pairs.length, failing: failing.length,
      worst: worst && { ratio: worst.ratio, required: worst.required, fg: worst.fg, bg: worst.bg, text: worst.text, sel: worst.sel } };
  }
}
const pass = problems.length === 0;
const summary = { row: 'X-19 thesaurus labels ≥ 4.5:1, all eleven worlds', mode, engine, browser: report.engines?.[engine], viewport,
  site: process.env.KAIRO_SITE_DIR, artifact: process.env.KAIRO_ARTIFACT_SHA256, gitSha: report.identity?.gitSha, surfaces,
  sweepExit: result.status, mutations: report.hfix2eMutations ?? null, loadBefore: before, loadAfter: after, pass, problems, perWorld,
  adapter: { original: source.href, originalSha256: sha(original), adapterSha256: sha(readFileSync(new URL(import.meta.url))), runnerSha256: sha(adapted) } };
writeFileSync(join(out, `hfix2e-x19-${engine}-${mode}.json`), JSON.stringify(summary, null, 1));
console.log(`\nX-19 ${engine} ${summary.browser} ${viewport} ${mode}: ${pass ? 'PASS' : 'FAIL'} (${problems.length} problems)`);
for (const world of WORLDS) console.log(`  ${world.padEnd(9)} ${Object.entries(perWorld[world]).map(([state, v]) => `${state} ${v.worst ? v.worst.ratio.toFixed(2) : '—'} (${v.pairs})`).join('  ')}`);
for (const problem of problems.slice(0, 40)) console.log(`  - ${problem}`);
process.exitCode = pass ? 0 : 1;
