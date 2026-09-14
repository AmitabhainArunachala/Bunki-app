import { chromium } from 'playwright-core';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const temporary = mkdtempSync(resolve(tmpdir(), 'bunki-skip-standalone-'));
const bundle = resolve(temporary, 'index.html');
execFileSync(process.execPath, [
  resolve(dirname(fileURLToPath(import.meta.url)), 'build-standalone.mjs'), bundle,
], {stdio:'inherit'});
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || undefined});
const context = await browser.newContext({viewport:{width:390,height:844}});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
const requests = [];
page.on('pageerror', e => errors.push(e.message));
const html = readFileSync(bundle,'utf8');
await context.route('**/*', route => {
  if (route.request().isNavigationRequest()) return route.fulfill({contentType:'text/html',body:html});
  requests.push(route.request().url());
  return route.abort();
});
try {
  await page.goto('http://127.0.0.1:3000/?entry=shelf&ui=bi',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'字引 find a kanji by shape'}).click();
  await page.locator('.kdx-lens').filter({hasText:'SKIP'}).click();
  await page.locator('.skip-hit').first().waitFor();
  assert.equal(await page.locator('.skip-wheel').count(),4);
  assert.equal(requests.filter(u=>u.includes('skip')).length,0);
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS standalone: real SKIP grid and four wheels with all subresource network blocked.');
  console.log('PASS no runtime exceptions or external SKIP data requests.');
} finally {
  await browser.close();
  rmSync(temporary,{recursive:true,force:true});
}
