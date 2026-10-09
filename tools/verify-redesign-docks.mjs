/** Public UI regressions for report clearance, live import status and deck palette controls. */
/* global document, innerWidth, innerHeight, NodeFilter, requestAnimationFrame */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from '../prototypes/corridor/tools/browser-audio-silence.mjs';
import { fixture, enrichmentFixture } from '../prototypes/corridor/tools/personal-fixture.mjs';

const out = resolveCorridorEvidence();
const host = await startCorridorDev(0);
const identity = JSON.parse(readFileSync(join(host.site, 'build-identity.json'), 'utf8'));
const verifierSha256 = createHash('sha256')
  .update(readFileSync(new URL(import.meta.url)))
  .digest('hex');
const results = [];
const samples = [];
const startedAt = new Date().toISOString();
const data = await fixture();
const collection = { ...data, enrichment: await enrichmentFixture(data) };
const payload = {
  name: 'public-dock-regression.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(collection)),
};

async function measure(page, selector, index) {
  // Resolve the connected control and read its geometry in the same browser
  // turn; asynchronous grade forecasting can replace earlier DOM handles.
  return page.evaluate(
    ({ selector, index }) => {
      const node = document.querySelectorAll(selector)[index];
      const rect = (element) => {
        const r = element.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      };
      const describe = (element) =>
        element && {
          tag: element.tagName,
          id: element.id,
          classes: typeof element.className === 'string' ? element.className : '',
        };
      const overlap = (a, b) =>
        b
          ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
            Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
          : 0;
      const visible = (element) => {
        if (!element) return false;
        const r = rect(element),
          style = document.defaultView.getComputedStyle(element);
        return (
          r.width > 0 &&
          r.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0
        );
      };
      const bounds = rect(node);
      const report = document.querySelector('#bunki-report-bug');
      const reportRect = report && rect(report);
      const status = document.querySelector('.pc-status');
      const statusText = status?.textContent.trim() || '';
      const statusRect = statusText ? rect(status) : null;
      const points = [
        [0.2, 0.2],
        [0.8, 0.2],
        [0.5, 0.5],
        [0.2, 0.8],
        [0.8, 0.8],
      ].map(([x, y]) => {
        const px = bounds.left + x * bounds.width,
          py = bounds.top + y * bounds.height;
        const hit = document.elementFromPoint(px, py);
        return { x: px, y: py, owned: hit === node || node.contains(hit), hit: describe(hit) };
      });
      // Measure only rendered text inside the control, never unrelated page prose.
      const textRects = [],
        walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        for (const r of range.getClientRects())
          if (r.width && r.height)
            textRects.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
      return {
        control: describe(node),
        text: node.textContent.trim(),
        bounds,
        visible: visible(node),
        points,
        textRects,
        viewport: { width: innerWidth, height: innerHeight },
        report: report && { bounds: reportRect, visible: visible(report) },
        reportOverlap: overlap(bounds, reportRect),
        status: status && {
          role: status.getAttribute('role'),
          text: statusText,
          bounds: statusRect,
          visible: visible(status),
        },
        statusOverlap: overlap(bounds, statusRect),
      };
    },
    { selector, index },
  );
}

async function controls(
  page,
  caseInfo,
  stage,
  selector,
  { count, liveStatus = false, textInside = false, scroll = false, reportAtBottom = false } = {},
) {
  if (!liveStatus) {
    // Ordinary room stages include a finite entrance and a ResizeObserver
    // dock update. Observe their finished layout, without waiting on a pass
    // predicate. Import preview deliberately skips this settlement step.
    await page.evaluate(async () => {
      const finite = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            Number.isFinite(animation.effect?.getComputedTiming().iterations),
        );
      await Promise.all(finite.map((animation) => animation.finished.catch(() => {})));
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
  }
  const nodes = page.locator(selector);
  await nodes.first().waitFor({ state: 'visible' });
  const total = await nodes.count();
  assert(total > 0, `${stage}: targeted controls must exist`);
  if (count !== undefined) assert.equal(total, count, `${stage}: full control census`);
  for (let i = 0; i < total; i++) {
    const control = nodes.nth(i);
    // Settings can scroll below the fixed tabs while still being inside the
    // viewport. Center them through native scrolling before testing real hits.
    if (scroll)
      await control.evaluate((node) =>
        node.scrollIntoView({ block: 'center', behavior: 'instant' }),
      );
    const sample = {
      ...caseInfo,
      stage,
      selector,
      index: i,
      ...(await measure(page, selector, i)),
    };
    samples.push(sample);
    const detail = JSON.stringify(sample);
    assert(sample.visible, `${stage}: control visible: ${detail}`);
    assert(
      sample.bounds.width >= 44 && sample.bounds.height >= 44,
      `${stage}: 44px target: ${detail}`,
    );
    assert(
      sample.bounds.left >= -0.5 &&
        sample.bounds.top >= -0.5 &&
        sample.bounds.right <= sample.viewport.width + 0.5 &&
        sample.bounds.bottom <= sample.viewport.height + 0.5,
      `${stage}: target inside viewport: ${detail}`,
    );
    assert(
      sample.points.every((point) => point.owned),
      `${stage}: all five hit points belong to control: ${detail}`,
    );
    assert(sample.report?.visible, `${stage}: report button remains visible: ${detail}`);
    assert.equal(sample.reportOverlap, 0, `${stage}: zero report overlap: ${detail}`);
    if (liveStatus) {
      assert(
        sample.status?.visible && sample.status.text,
        `${stage}: live status still visible and nonempty: ${detail}`,
      );
      assert.equal(sample.status.role, 'status', `${stage}: live status retains its role`);
      assert.equal(
        sample.statusOverlap,
        0,
        `${stage}: status cannot cover import controls: ${detail}`,
      );
      assert(
        sample.status.bounds.top >= 0 && sample.status.bounds.bottom <= sample.viewport.height,
        `${stage}: status is on screen: ${detail}`,
      );
    }
    if (textInside) {
      assert(sample.textRects.length > 0, `${stage}: palette labels cannot disappear`);
      assert(
        sample.textRects.every(
          (r) =>
            r.left >= sample.bounds.left - 0.5 &&
            r.right <= sample.bounds.right + 0.5 &&
            r.top >= sample.bounds.top - 0.5 &&
            r.bottom <= sample.bounds.bottom + 0.5,
        ),
        `${stage}: rendered label stays inside button: ${detail}`,
      );
    }
    if (reportAtBottom)
      assert(
        Math.abs(sample.report.bounds.bottom - (sample.viewport.height - 12)) <= 1,
        `${stage}: sheet report uses the 12px bottom strip: ${detail}`,
      );
  }
  await page.screenshot({
    path: join(
      out,
      `${caseInfo.engine}-${caseInfo.lang}-${caseInfo.width}-${caseInfo.kind}-${stage}.png`,
    ),
    fullPage: true,
  });
}

async function journey(page, info) {
  const deck = info.kind === 'private' ? 'personal' : info.kind === 'context' ? 'context' : 'n2';
  await page.goto(`${host.origin}/?entry=shelf&ui=${info.lang}&deck=${deck}`);
  await page.evaluate(() => document.fonts.ready);
  if (info.kind === 'context') {
    await page.locator('#cd-start').click();
    await controls(page, info, 'reveal', '#cd-got', { count: 1 });
    await page.locator('#cd-got').click();
    await controls(page, info, 'grades', '.cd-dock button', { count: 4 });
    await page.locator('#cd-good').click();
    await page.locator('#cd-got').waitFor();
  } else if (info.kind === 'private') {
    await page.locator('.pc-file').setInputFiles(payload);
    // No settling delay: sample the controls while the import's live status is present.
    await controls(
      page,
      info,
      'preview-cancel',
      '[data-action="confirm-import"], [data-action="cancel-import"]',
      { count: 2, liveStatus: true },
    );
    await page.locator('[data-action="cancel-import"]').click();
    await page.locator('.pc-preview').waitFor({ state: 'hidden' });
    await page.locator('.pc-file').setInputFiles(payload);
    await controls(
      page,
      info,
      'preview-confirm',
      '[data-action="confirm-import"], [data-action="cancel-import"]',
      { count: 2, liveStatus: true },
    );
    await page.locator('[data-action="confirm-import"]').click();
    await page.locator('[data-card]').waitFor();
    await controls(page, info, 'reveal', '[data-action="reveal"]', { count: 1 });
    await page.locator('[data-action="reveal"]').click();
    await controls(page, info, 'grades', '.pc-controls [data-grade]', { count: 4 });
    await page.locator('[data-grade="3"]').click();
    await page.locator('[data-action="reveal"]').waitFor();
  } else if (info.kind === 'palette') {
    await page.locator('#kp-to-settings').click();
    await controls(page, info, 'palettes', '.kp-swatch', {
      count: 8,
      textInside: true,
      scroll: true,
    });
    await controls(page, info, 'segments', '.kp-settings [role="radio"]:not(.kp-swatch)', {
      scroll: true,
    });
    await page.locator('[data-pref="look:contrast"]').click();
    assert.equal(await page.locator('.kp').getAttribute('data-look'), 'contrast');
    await page.locator('[data-pref="mode:self"]').click();
    assert.equal(
      await page.locator('[data-pref="mode:self"]').getAttribute('aria-checked'),
      'true',
    );
  } else if (info.kind === 'rule') {
    await page.locator('#kp-start').click();
    await page.locator('#kp-reveal').click();
    await page.locator('#kp-rule-dismiss').waitFor({ state: 'visible' });
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    const sample = await page.evaluate(() => {
      const node = document.getElementById('kp-rule-dismiss');
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2,
        cy = r.top + r.height / 2;
      const effectiveBounds = {
        left: cx - 22,
        right: cx + 22,
        top: cy - 22,
        bottom: cy + 22,
        width: 44,
        height: 44,
      };
      const report = document.getElementById('bunki-report-bug');
      const b = report.getBoundingClientRect();
      const points = [
        [0, 0],
        [-21, 0],
        [21, 0],
        [0, -21],
        [0, 21],
      ].map(([dx, dy]) => {
        const hit = document.elementFromPoint(cx + dx, cy + dy);
        return {
          x: cx + dx,
          y: cy + dy,
          owned: hit === node || node.contains(hit),
          hit: hit && { tag: hit.tagName, id: hit.id },
        };
      });
      return {
        bounds: {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        },
        effectiveBounds,
        points,
        viewport: { width: innerWidth, height: innerHeight },
        report: { bounds: { left: b.left, right: b.right, top: b.top, bottom: b.bottom } },
        reportOverlap:
          Math.max(
            0,
            Math.min(effectiveBounds.right, b.right) - Math.max(effectiveBounds.left, b.left),
          ) *
          Math.max(
            0,
            Math.min(effectiveBounds.bottom, b.bottom) - Math.max(effectiveBounds.top, b.top),
          ),
      };
    });
    const observation = {
      ...info,
      stage: 'rule-touch-target',
      selector: '#kp-rule-dismiss',
      ...sample,
    };
    samples.push(observation);
    const detail = JSON.stringify(observation);
    // The established player contract deliberately paints a compact glyph;
    // the native pseudo-element hit area, rather than paint, must reach 44px.
    assert(
      sample.bounds.width > 0 &&
        sample.bounds.width < 44 &&
        sample.bounds.height > 0 &&
        sample.bounds.height < 44,
      `Rule dismiss stays painted below 44px: ${detail}`,
    );
    assert(
      sample.points.every((point) => point.owned),
      `Rule dismiss owns center and all native ±21px hit points: ${detail}`,
    );
    assert(
      sample.effectiveBounds.left >= 0 &&
        sample.effectiveBounds.right <= sample.viewport.width &&
        sample.effectiveBounds.top >= 0 &&
        sample.effectiveBounds.bottom <= sample.viewport.height,
      `Rule effective hit area remains on screen: ${detail}`,
    );
    assert.equal(
      sample.reportOverlap,
      0,
      `Rule effective hit area has zero report collision: ${detail}`,
    );
    await page.screenshot({
      path: join(out, `${info.engine}-${info.lang}-${info.width}-rule-touch-target.png`),
      fullPage: true,
    });
    await page.locator('#kp-rule-dismiss').click();
    await page.locator('#kp-rule').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#kp-rule').count(), 0, 'Real dismiss removes the rule');
    // four pads since the learner's D1 (Again · Hard · Good · Easy; CARD_CONTRACT_V2 §4 as amended 2026-10-09)
    await controls(page, info, 'grades-after-rule', '.kp-grades .kp-grade', { count: 4 });
  } else {
    await page.locator('#kp-start').click();
    await page.locator('#kp-reveal').click();
    await page.locator('#kp-grade-good').waitFor();
    await page.locator('#kp-card .kp-sentence .kp-tok:not([data-deck-word])').first().click();
    await page.locator('#kp-sheet').waitFor();
    assert.equal(
      await page.locator('#primary-tabs').isVisible(),
      false,
      'Deck dictionary sheet hides the tabs',
    );
    await controls(page, info, 'dictionary-close', '#kp-sheet-close', {
      count: 1,
      reportAtBottom: true,
    });
    await page.locator('#kp-sheet-close').click();
    await page.locator('#kp-sheet').waitFor({ state: 'hidden' });
    assert(
      await page.locator('#kp-grade-good').isVisible(),
      'Real close returns to the revealed deck answer',
    );
  }
}

try {
  for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
    const browser = await browserType.launch();
    try {
      for (const lang of ['bi', 'ja']) {
        // The 320px addition is limited to labels/segments, whose repaired wrapping is width-sensitive.
        for (const [kind, width] of [
          ['context', 390],
          ['private', 390],
          ['palette', 390],
          ['sheet', 390],
          ['palette', 320],
          ['rule', 768],
        ]) {
          const info = {
            engine,
            browserVersion: browser.version(),
            lang,
            kind,
            width,
            height: 844,
          };
          const context = await browser.newContext({
            viewport: { width, height: 844 },
            serviceWorkers: 'block',
            reducedMotion: 'reduce',
          });
          await silenceBrowserAudio(context);
          const page = await context.newPage();
          page.setDefaultTimeout(20_000);
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          const result = { ...info, passed: false, errors };
          try {
            await journey(page, info);
            assert.deepEqual(errors, [], 'No uncaught errors during the real UI journey');
            result.passed = true;
          } catch (error) {
            result.error = error.stack || String(error);
            await page
              .screenshot({
                path: join(out, `${engine}-${lang}-${width}-${kind}-failure.png`),
                fullPage: true,
              })
              .catch(() => {});
          } finally {
            await context.close();
            results.push(result);
            console.log(
              `${result.passed ? 'PASS' : 'FAIL'} ${engine}/${lang}/${width}/${kind}${result.error ? `: ${result.error}` : ''}`,
            );
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await host.close();
  const receipt = {
    suite: 'redesign-docks',
    startedAt,
    completedAt: new Date().toISOString(),
    site: host.site,
    artifactSha256: identity.artifactSha256,
    gitSha: identity.gitSha,
    verifierSha256,
    ruleGradeCensus: {
      initialNewTestAssumption: 4,
      observedPublicContract: 2,
      judgments: ['Again', 'Recalled'],
      reason:
        'The N2 read/recall player exposes two grade controls after rule dismissal. Only the new tablet census was corrected; every original case and assertion remains unchanged.',
    },
    pass: results.length === 24 && results.every((result) => result.passed),
    expectedCases: 24,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    results,
    samples,
    scope:
      'Public UI, synthetic imported collection, five-point control ownership and measured geometry; no physical-device or learner acceptance claim.',
  };
  writeFileSync(join(out, 'redesign-docks.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`REDESIGN DOCKS ${receipt.passed}/${receipt.expectedCases} passed`);
  if (!receipt.pass) process.exitCode = 1;
}
