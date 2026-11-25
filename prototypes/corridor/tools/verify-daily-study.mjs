// Replay a learner's real deck choice, one grade, reload and return on a staged site.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

async function dailyStudy(browser, engine, origin, out) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  try {
    await silenceBrowserAudio(context);
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const record = () => page.evaluate(() => localStorage.getItem('bunki-cloze:n1'));
    const openToday = async () => {
      await page.goto(origin + '/?ui=bi');
      await page.locator('#home-review').waitFor();
      const intro = page.getByRole('button', { name: 'OK', exact: true });
      if (await intro.isVisible()) await intro.click();
      await page.locator('#home-review').click();
    };
    await openToday();
    const study = page.locator('.today-deck-door');
    assert.match(await study.innerText(), /Choose a study deck/);
    await study.click();
    await page.locator('button[data-deck="n1"]').click();
    await page.locator('#kp-start').click();
    const first = await page.locator('#kp-card').getAttribute('data-card');
    await page.locator('#kp-reveal').click();
    await page.locator('#kp-grade-good').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('bunki-cloze:n1'))?.log?.length === 1);
    const saved = await record();
    assert.deepEqual(JSON.parse(saved).log[0].slice(0, 2), [first, 3]);

    await openToday();
    await page.locator('.today-deck-door[data-stage-deck="n1"]').waitFor();
    assert.match(await study.innerText(), /Continue studying/);
    assert.equal(await record(), saved);
    const positions = [];
    for (const [width, height] of [[390, 844], [844, 390], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => document.fonts.ready);
      const box = await study.boundingBox();
      assert(box && box.y >= 0 && box.y + box.height < height && box.height >= 44);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(await page.locator('.today-then-title').innerText(), 'The current reading remains accessible');
      await page.screenshot({ path: join(out, `today-${engine}-${width}x${height}.png`) });
      positions.push({ width, height, button: box });
    }

    await study.click();
    const followingCard = await page.locator('#kp-card').getAttribute('data-card');
    assert.notEqual(followingCard, first);
    assert(await page.locator('#kp-reveal').isVisible());
    assert.equal(await record(), saved, 'Resuming cannot grade or alter the ledger');
    await openToday();
    await page.locator('#tab-learn').click();
    await page.locator('.learn-go-deck[data-stage-deck="n1"]').waitFor();
    assert.match(await page.locator('.learn-go-deck').innerText(), /Continue/);
    assert.equal(await record(), saved);
    return { first, followingCard, gradeCount: JSON.parse(saved).log.length, positions };
  } finally {
    await context.close();
  }
}

const host = await startCorridorDev(0);
try {
  const out = resolveCorridorEvidence();
  await mkdir(out, { recursive: true });
  const engines = { chromium, webkit };
  for (const name of process.env.KAIRO_BROWSER ? [process.env.KAIRO_BROWSER] : Object.keys(engines)) {
    assert(Object.hasOwn(engines, name), 'KAIRO_BROWSER must name chromium or webkit');
    const browser = await engines[name].launch();
    try {
      const result = await dailyStudy(browser, name, host.origin, out);
      await writeFile(join(out, `daily-study-${name}.json`), JSON.stringify(result, null, 2) + '\n');
      console.log(`${name}: Today and Learn returned to N1 after one persisted grade.`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await host.close();
}
