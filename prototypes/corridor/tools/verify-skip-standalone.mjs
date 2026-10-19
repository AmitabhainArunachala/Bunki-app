import { openShelfTools } from './shelf-tools-support.mjs';
import { chromium } from 'playwright-core';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
assert(process.argv.slice(2).every(arg => arg === '--fragment'), 'Usage: verify-skip-standalone.mjs [--fragment]');
const fragment = process.argv.includes('--fragment');
const site = resolveCorridorSite();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const temporary = mkdtempSync(resolve(resolveCorridorEvidence(), fragment ? 'skip-standalone-fragment-' : 'skip-standalone-document-'));
const bundle = resolve(temporary, 'index.html');
execFileSync(process.execPath, [
  resolve(dirname(fileURLToPath(import.meta.url)), 'build-standalone.mjs'), bundle,
  ...(fragment ? ['--fragment'] : []),
], {stdio:'inherit', timeout:120000, env:{...process.env,KAIRO_SITE_DIR:site,KAIRO_ARTIFACT_SHA256:identity.artifactSha256}});
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || undefined});
const context = await browser.newContext({viewport:{width:390,height:844}});
await silenceBrowserAudio(context);
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
const requests = [];
const checks = [];
page.on('pageerror', e => errors.push(e.message));
const documentPath = fragment ? resolve(temporary, 'fragment-host.html') : bundle;
if (fragment) writeFileSync(documentPath, `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${readFileSync(bundle, 'utf8')}</body></html>`);
const documentURL = pathToFileURL(documentPath);
documentURL.search = '?entry=shelf&ui=ja';
const personalURL = new URL(documentURL);
personalURL.searchParams.set('deck', 'personal');
personalURL.searchParams.set('ui', 'bi');
await context.route('**/*', route => {
  const request = route.request();
  // Open the actual handoff from disk. Sending a large HTML body through
  // route.fulfill base64-encodes it and can exceed Chromium's DevTools pipe limit.
  if (request.isNavigationRequest() && request.frame() === page.mainFrame() &&
      [documentURL.href, personalURL.href].includes(request.url()))
    return route.continue();
  if (!request.isNavigationRequest() && /^(blob|data):/u.test(request.url())) return route.continue();
  requests.push(request.url());
  return route.abort();
});
try {
  await page.goto(documentURL.href,{waitUntil:'domcontentloaded'});
  const kanjidex = page.locator('#kanjidex-link');
  await kanjidex.waitFor({state:'attached'});
  // The single file carries the editorial layer and the shelf art itself: no sibling request can supply them.
  await page.locator('#shelf-reading-results .shelf-item').first().waitFor();
  await page.waitForFunction(() => document.querySelector('.shelf-art')?.complete, null, { timeout: 15000 });
  assert.equal(await page.locator('#standalone-assessment-assets').count(), 1,
    'The assessment asset pack stays unparsed until an assessment is requested');
  const shelfLook = await page.evaluate(() => {
    const art = document.querySelector('.shelf-art');
    return { art: art?.naturalWidth || 0, artSource: art?.src.slice(0, 5) || '', grid: getComputedStyle(document.getElementById('shelf-reading-results')).display };
  });
  assert(shelfLook.art > 0 && shelfLook.artSource === 'blob:', `The shelf art must be embedded: ${JSON.stringify(shelfLook)}`);
  checks.push('embedded-shelf-art');
  assert.equal(shelfLook.grid, 'grid', 'The editorial shelf layout must be inlined');
  checks.push('inlined-editorial-shelf-layout');
  // The shelf's cards are each one door (a button), so the shelf holds no prose lookup word to measure; it has had
  // none since before 10-17, when this row began reading an absent word. The study hall, one door away in the same
  // Japanese chrome, sets its Japanese prose with lookup words: measure the first of those, then reopen the shelf.
  await openShelfTools(page);
  await page.locator('#decks-link').click();
  const proseWord = page.locator('#study-hall .japanese-lookup-word').first();
  await proseWord.waitFor({ state: 'visible' });
  const lookupLook = await proseWord.evaluate((node) => {
    const style = getComputedStyle(node);
    return { surface: 'study-hall', text: node.textContent,
      word: { display: style.display, border: style.borderTopStyle, background: style.backgroundColor,
        padding: style.padding, minWidth: style.minWidth, minHeight: style.minHeight } };
  });
  // A native button can compute declared display:inline to inline-block. Both
  // stay in the prose line; zero padding/border/background is the contract.
  assert(['inline', 'inline-block'].includes(lookupLook.word?.display), 'Lookup words stay in the prose line');
  assert.deepEqual({ ...lookupLook.word, display: undefined },
    { display: undefined, border: 'none', background: 'rgba(0, 0, 0, 0)', padding: '0px', minWidth: '0px', minHeight: '0px' },
    'Lookup words must read as prose, not default buttons');
  checks.push('lookup-words-read-as-prose');
  await page.goto(documentURL.href,{waitUntil:'domcontentloaded'});
  await page.locator('#shelf-reading-results .shelf-item').first().waitFor();
  // The English chrome no longer supplies incidental Japanese lookup words.
  await page.locator('#lang [data-lang="bi"]').click();
  assert.equal(await page.locator('#lang [data-lang="bi"]').getAttribute('aria-pressed'), 'true',
    'The remaining standalone journey uses English chrome');
  checks.push('english-chrome');
  // the study tools sit behind the shelf's one 学習ツール button (glance pass 2026-10-01): the door
  // is closed away until that button opens the panel, and then it is visible and reachable
  assert(!(await kanjidex.isVisible()), 'The dictionary door waits behind the 学習ツール button');
  await openShelfTools(page);
  assert(await kanjidex.isVisible(), 'The dictionary door is visible once the 学習ツール panel is open');
  assert.equal(await kanjidex.and(page.getByRole('button',{name:/^kanji by shape$/u})).count(),1,
    'Dictionary tool includes its label in the accessible name');
  checks.push('dictionary-door-behind-study-tools');
  await kanjidex.click();
  await page.locator('.kdx-lens').filter({hasText:'by its shape'}).click();
  await page.locator('.skip-hit').first().waitFor();
  assert.equal(await page.locator('.skip-wheel').count(),5);
  assert.equal(await page.locator('.skip-wheel-column:not(.skip-wheel-filter)').count(),3);
  assert.equal(await page.locator('.skip-wheel-filter[data-role="filter"]').count(),1);
  assert.equal(await page.locator('.skip-wheel-parts[data-role="left-parts"]').count(),1);
  checks.push('skip-grid-wheels-and-filters');
  assert.equal(requests.filter(u=>u.includes('skip')).length,0);
  assert.equal(requests.filter(u=>/editorial\.css|design\//u.test(u)).length,0,JSON.stringify(requests));
  checks.push('no-skip-or-editorial-requests');
  await page.click('#back');
  await openShelfTools(page);
  await page.locator('#decks-link').click();
  await page.locator('.dojo-deck[data-deck="context"]').waitFor();
  assert.equal(await page.locator('.dojo-deck[data-deck="personal"]').count(),0,'The handoff offers no personal-collections deck');
  checks.push('no-personal-deck-row');
  await page.goto(personalURL.href,{waitUntil:'domcontentloaded'});
  await page.locator('#shelf-reading-results .shelf-item').first().waitFor();
  assert.notEqual(await page.evaluate(() => document.body.dataset.view),'personaldeck','The personal route falls back to the shelf');
  assert.equal(await page.locator('.pc').count(),0);
  checks.push('personal-route-falls-back-to-shelf');
  assert.equal(requests.filter(u=>u.includes('decks/personal')).length,0,JSON.stringify(requests));
  checks.push('no-personal-requests');
  assert.equal(errors.length,0,JSON.stringify(errors));
  checks.push('no-page-errors');
  await page.screenshot({path:resolve(temporary,'skip-standalone.png')});
  writeFileSync(resolve(temporary,'result.json'),JSON.stringify({pass:true,mode:fragment?'fragment':'document',runId:process.env.KAIRO_GATE_RUN_ID??null,site,artifactSha256:identity.artifactSha256,browser:browser.version(),checks,requests,errors,shelfLook,lookupLook,scope:'Silent Chromium standalone lookup mechanics and embedded editorial layer; no physical-device or full learner journey acceptance'},null,2)+'\n');
  console.log('PASS standalone: real SKIP grid, three code wheels and two independent filters with all subresource network blocked.');
  console.log('PASS no runtime exceptions or external SKIP data requests.');
  console.log(`PASS embedded editorial layer and shelf art: ${JSON.stringify(shelfLook)}`);
  console.log(`PASS lookup words read as prose: ${JSON.stringify(lookupLook)}`);
  console.log('PASS no personal-collections deck row or route in the single file.');
} finally {
  await browser.close();
}
