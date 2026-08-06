#!/usr/bin/env node

import process from 'node:process';

import {
  firstWordCenter,
  launchDrift,
  readPrivateState,
  touchPinch,
  touchTap,
} from './red-team-harness.mjs';

const run = await launchDrift({ storage: null });
try {
  const { browser, cdp, consoleErrors, executablePath, page, pageErrors, requests } = run;
  const title = await page.title();
  const wordCount = await page.locator('.word').count();
  const center = await firstWordCenter(page);

  await touchPinch(cdp, center, 60, 220, { steps: 14 });
  await page.waitForTimeout(120);
  const depthAfterPinch = await page.locator('#depth').textContent();

  await touchTap(cdp, center.x, center.y);
  await page.waitForTimeout(120);
  const unfoldedCount = await page.locator('.word.unfolded').count();

  const lockApi = await page.evaluate(() => globalThis.__lockWord?.('過酷'));
  await page.waitForTimeout(900);
  const lockState = await readPrivateState(page, `({
    active: lockOn,
    labels: LOCK ? LOCK.items.map((item) => item.t === 'w' ? item.wr.e[0] : item.t === 'g' ? item.g.ch : item.label) : [],
    memberCount: LOCK ? LOCK.items.filter((item) => item.t !== 'g').length : 0
  })`);

  const userAgent = await page.evaluate(() => navigator.userAgent);
  const externalRequests = requests.filter((url) => !url.startsWith(run.host.origin));
  const result = {
    browserVersion: browser.version(),
    consoleErrors,
    depthAfterPinch,
    executablePath,
    externalRequests,
    lockApi,
    lockState,
    pageErrors,
    title,
    unfoldedCount,
    userAgent,
    wordCount,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (
    title !== '墨流し — Bunki Drift' ||
    wordCount < 12 ||
    depthAfterPinch?.trim() !== '' ||
    lockApi !== true ||
    lockState.active !== true ||
    lockState.memberCount < 12 ||
    pageErrors.length > 0 ||
    consoleErrors.length > 0 ||
    externalRequests.length > 0
  ) {
    process.exitCode = 1;
  }
} finally {
  await run.close();
}
