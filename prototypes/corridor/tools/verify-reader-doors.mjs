/**
 * Reader doors that answer: every door on the shelf and in an article does something.
 *
 *   D0 identity: the served build is the commit under test.
 *   D1 today's picks: at 1728×996 and 390×844, each #shelf-today door's own centre is the
 *      door (no sibling painted over it), and a real click there opens that article.
 *      Control: the 09-24 study overlay's 6-column grid (register.css before the C1
 *      spanning rule) put the strip in one ~106 px column; its centre hit the next
 *      heading and the tap did nothing ("The Man in the Next Room", Codex 04:07Z).
 *   D2 names: a name written in kanji (a .tok.named door) shows its reading on a tap and
 *      hides it on the next. Control: 9ee2976d and earlier render it as a button with no
 *      handler — a tap changes nothing.
 *   D3 with readings always on, a name is plain text: no button that answers nothing.
 *
 * Clicks go to coordinates (page.mouse), not locator.click: Playwright retries a locator
 * click when another element would receive it, which hides exactly this defect.
 *
 * Usage: node verify-reader-doors.mjs   (KAIRO_SITE_DIR may pin a staged artifact)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { chromium } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');

const SITE = resolveCorridorSite();
const EVIDENCE = resolveCorridorEvidence();
const results = [];
const pageErrors = [];
let currentCase = 'setup';
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
};
const ready = (page) => page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
let host = null, origin = null, browser = null;

async function openPage(viewport, query) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width > 1000 ? 2 : 3 });
  context.on('page', (page) => page.on('pageerror', (error) => {
    if (pageErrors.length < 20) pageErrors.push({ case: currentCase, message: error.message });
  }));
  const page = await context.newPage();
  await page.goto(`${origin}/index.html${query}`);
  await ready(page);
  return { context, page };
}

try {
  host = await startStaticHost({ site: SITE, port: 0 });
  origin = host.origin;
  browser = await chromium.launch();

  currentCase = 'D0';
  {
    const { context, page } = await openPage({ width: 1024, height: 800 }, '?entry=shelf');
    const identity = await (await page.request.get(`${origin}/build-identity.json`)).json();
    let head = null; try { head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* outside a checkout */ }
    const expected = process.env.KAIRO_EXPECT_GITSHA || head;
    const served = createHash('sha256').update(Buffer.from(await (await page.request.get(`${origin}/corridor.js`)).body())).digest('hex');
    check('D0 served build is the expected clean commit', identity.gitSha === expected && identity.sourceDirty === false
      && served === new Map(identity.files.map((row) => [row.path, row.sha256])).get('corridor.js'), `served=${identity.gitSha} expected=${expected}`);
    await context.close();
    if (results.some((r) => !r.pass)) throw new Error('identity failed');
  }

  currentCase = 'D1';
  for (const viewport of [{ width: 1728, height: 996 }, { width: 390, height: 844 }]) {
    const label = `${viewport.width}`;
    const { context, page } = await openPage(viewport, '?entry=shelf');
    const count = await page.locator('#shelf-today .shelf-open').count();
    check(`D1 ${label}: today's picks are on the shelf`, count > 0, `${count} doors`);
    for (let i = 0; i < count; i++) {
      await page.goto(`${origin}/index.html?entry=shelf`); await ready(page);
      const door = page.locator('#shelf-today .shelf-open').nth(i);
      await door.scrollIntoViewIfNeeded();
      const probe = await door.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const x = box.left + box.width / 2, y = box.top + box.height / 2;
        const hit = document.elementFromPoint(x, y);
        const card = node.closest('[data-passage]');
        return { x, y, own: !!hit && hit.closest('.shelf-open') === node, hit: hit ? `${hit.tagName.toLowerCase()}.${[...hit.classList].join('.')}` : null,
          passage: card?.dataset.passage || null, strip: Math.round(document.querySelector('#shelf-today')?.getBoundingClientRect().width || 0) };
      });
      check(`D1 ${label} pick ${i + 1}: its centre is the door itself`, probe.own, JSON.stringify({ hit: probe.hit, strip: probe.strip }));
      await page.mouse.click(probe.x, probe.y);
      const opened = await page.waitForFunction(() => document.body.dataset.view === 'reader', null, { timeout: 5_000 }).then(() => true, () => false);
      check(`D1 ${label} pick ${i + 1}: a click at that point opens the article`, opened, probe.passage || '');
    }
    await context.close();
  }

  currentCase = 'D2';
  {
    const { context, page } = await openPage({ width: 1280, height: 860 }, '?entry=shelf&dials=0,1,0');
    // the first article whose text carries a named door
    const doors = await page.locator('.shelf-item:not([data-recommendation]) .shelf-open').count();
    let found = false;
    for (let i = 0; i < doors && !found; i++) {
      await page.goto(`${origin}/index.html?entry=shelf&dials=0,1,0`); await ready(page);
      await page.locator('.shelf-item:not([data-recommendation]) .shelf-open').nth(i).click();
      await page.waitForSelector('#reader .tok', { timeout: 10_000 }).catch(() => {});
      found = (await page.locator('#reader button.tok.named').count()) > 0;
    }
    check('D2 an article with a named door exists', found);
    if (found) {
      const name = page.locator('#reader button.tok.named').first();
      await name.scrollIntoViewIfNeeded();
      const shown = () => name.evaluate((node) => [...node.querySelectorAll('rt')].some((rt) => !rt.classList.contains('hidden-rt') && rt.textContent));
      const before = await shown();
      const box = await name.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      const after = await shown();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      const again = await shown();
      check('D2 a tap on a name shows its reading', before === false && after === true, JSON.stringify({ before, after }));
      check('D2 the next tap hides it again', again === false);
      check('D2 the name says what it is to assistive tech', /name|名前/u.test(await name.getAttribute('aria-label') || ''));
    }
    await context.close();
  }

  currentCase = 'D3';
  {
    const { context, page } = await openPage({ width: 1280, height: 860 }, '?entry=shelf&dials=0,2,0');
    const doors = await page.locator('.shelf-item:not([data-recommendation]) .shelf-open').count();
    let named = 0, buttons = 0;
    for (let i = 0; i < Math.min(doors, 12); i++) {
      await page.goto(`${origin}/index.html?entry=shelf&dials=0,2,0`); await ready(page);
      await page.locator('.shelf-item:not([data-recommendation]) .shelf-open').nth(i).click();
      await page.waitForSelector('#reader .tok', { timeout: 10_000 }).catch(() => {});
      named += await page.locator('#reader .tok.named').count();
      buttons += await page.locator('#reader button.tok.named').count();
    }
    check('D3 readings always on: names are present and none is a button', named > 0 && buttons === 0, JSON.stringify({ named, buttons }));
    await context.close();
  }
} catch (error) {
  results.push({ name: `terminal (${currentCase})`, pass: false, detail: error.stack || String(error) });
  console.log(`  FAIL terminal in ${currentCase} — ${error.message}`);
} finally {
  await browser?.close().catch((error) => results.push({ name: 'browser · cleanup', pass: false, detail: error.message }));
  await host?.close().catch((error) => results.push({ name: 'host · cleanup', pass: false, detail: error.message }));
  if (pageErrors.length) results.push({ name: 'no uncaught page errors', pass: false, detail: JSON.stringify(pageErrors) });
  writeFileSync(resolve(EVIDENCE, 'reader-doors.json'), JSON.stringify({ origin, results, pageErrors, lastCase: currentCase }, null, 2) + '\n');
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · evidence ${EVIDENCE}`);
process.exit(failed.length ? 1 : 0);
