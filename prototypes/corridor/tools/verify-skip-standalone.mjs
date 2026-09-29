import { chromium } from 'playwright-core';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
page.on('pageerror', e => errors.push(e.message));
const contents = readFileSync(bundle,'utf8');
const html = fragment ? `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${contents}</body></html>` : contents;
await context.route('**/*', route => {
  if (route.request().isNavigationRequest()) return route.fulfill({contentType:'text/html',body:html});
  requests.push(route.request().url());
  return route.abort();
});
try {
  await page.goto('http://127.0.0.1:3000/?entry=shelf&ui=bi',{waitUntil:'domcontentloaded'});
  const kanjidex = page.locator('#kanjidex-link');
  await kanjidex.waitFor({state:'attached'});
  // The single file carries the editorial layer and the shelf art itself: no sibling request can supply them.
  await page.locator('#shelf-reading-results .shelf-item').first().waitFor();
  await page.waitForFunction(() => document.querySelector('.shelf-art')?.complete, null, { timeout: 15000 });
  const shelfLook = await page.evaluate(() => {
    const art = document.querySelector('.shelf-art');
    const word = document.querySelector('#shelf-body .japanese-lookup-word');
    const style = word && getComputedStyle(word);
    return { art: art?.naturalWidth || 0, artSource: art?.src.slice(0, 5) || '', grid: getComputedStyle(document.getElementById('shelf-reading-results')).display,
      word: style && { display: style.display, border: style.borderTopStyle, background: style.backgroundColor,
        padding: style.padding, minWidth: style.minWidth, minHeight: style.minHeight } };
  });
  assert(shelfLook.art > 0 && shelfLook.artSource === 'blob:', `The shelf art must be embedded: ${JSON.stringify(shelfLook)}`);
  assert.equal(shelfLook.grid, 'grid', 'The editorial shelf layout must be inlined');
  // A native button can compute declared display:inline to inline-block. Both
  // stay in the prose line; zero padding/border/background is the contract.
  assert(['inline', 'inline-block'].includes(shelfLook.word?.display), 'Lookup words stay in the prose line');
  assert.deepEqual({ ...shelfLook.word, display: undefined },
    { display: undefined, border: 'none', background: 'rgba(0, 0, 0, 0)', padding: '0px', minWidth: '0px', minHeight: '0px' },
    'Lookup words must read as prose, not default buttons');
  await page.locator('.shelf-study-tools > summary').click();
  assert.equal(await kanjidex.and(page.getByRole('button',{name:/^字引/u})).count(),1,
    'Dictionary tool includes its label in the accessible name');
  await kanjidex.click();
  await page.locator('.kdx-lens').filter({hasText:'SKIP'}).click();
  await page.locator('.skip-hit').first().waitFor();
  assert.equal(await page.locator('.skip-wheel').count(),5);
  assert.equal(await page.locator('.skip-wheel-column:not(.skip-wheel-filter)').count(),3);
  assert.equal(await page.locator('.skip-wheel-filter[data-role="filter"]').count(),1);
  assert.equal(await page.locator('.skip-wheel-parts[data-role="left-parts"]').count(),1);
  assert.equal(requests.filter(u=>u.includes('skip')).length,0);
  assert.equal(requests.filter(u=>/editorial\.css|design\//u.test(u)).length,0,JSON.stringify(requests));
  assert.equal(errors.length,0,JSON.stringify(errors));
  await page.screenshot({path:resolve(temporary,'skip-standalone.png')});
  writeFileSync(resolve(temporary,'result.json'),JSON.stringify({pass:true,mode:fragment?'fragment':'document',artifactSha256:identity.artifactSha256,browser:browser.version(),requests,errors,shelfLook,scope:'Silent Chromium standalone lookup mechanics and embedded editorial layer; no physical-device or full learner journey acceptance'},null,2)+'\n');
  console.log('PASS standalone: real SKIP grid, three code wheels and two independent filters with all subresource network blocked.');
  console.log('PASS no runtime exceptions or external SKIP data requests.');
  console.log(`PASS embedded editorial layer and shelf art: ${JSON.stringify(shelfLook)}`);
} finally {
  await browser.close();
}
