/** Real browser controls for the verifier's passive observation, never product mutations. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { observeGuidedMomentPhases } from './guided-moment-observation.mjs';

const evidence = resolveCorridorEvidence();
const product = readFileSync(new URL('../guided-moments.mjs', import.meta.url), 'utf8');
const rows = [];
const faultSource = (kind) => {
  if (!['missing-impact', 'missing-resolve', 'never-overlap'].includes(kind)) return product;
  const phase = kind === 'missing-impact' ? 'impact' : 'resolve';
  const needle = `() => scene.root.classList.add('samurai-effect--${phase}')`;
  assert.equal(product.split(needle).length, 2, 'Negative-control anchor must be unique');
  return product.replace(
    needle,
    kind === 'never-overlap'
      ? "() => { scene.root.classList.remove('samurai-effect--impact'); scene.root.classList.add('samurai-effect--resolve'); }"
      : '() => {}',
  );
};

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: observe real moment phases despite screenshot latency and reject absent overlap`, async (t) => {
    const browser = await engine.launch();
    try {
      for (const kind of [
        'normal-delayed-screenshot',
        'missing-impact',
        'missing-resolve',
        'disconnected',
        'never-overlap',
        'never-mounted',
      ]) {
        await t.test(kind, async () => {
          const page = await browser.newPage({
            viewport: { width: 390, height: 844 },
            reducedMotion: 'no-preference',
          });
          try {
            await page.setContent(
              '<!doctype html><body><main id="app"><button>Answer</button></main></body>',
            );
            const module = `data:text/javascript;base64,${Buffer.from(faultSource(kind)).toString('base64')}`;
            await page.evaluate(async (url) => {
              const { createMoments } = await import(url);
              window.controlMoments = createMoments();
            }, module);
            const observation = await page.evaluateHandle(observeGuidedMomentPhases);
            if (kind !== 'never-mounted') {
              assert.equal(
                await page.evaluate(() => window.controlMoments.play({ outcome: 'incorrect' })),
                true,
              );
              await page.locator('.samurai-effect').waitFor({ timeout: 3_000 });
            }
            if (kind === 'disconnected') {
              await page.evaluate(() => {
                const root = document.querySelector('.samurai-effect');
                root.remove();
                root.classList.add('samurai-effect--impact', 'samurai-effect--resolve');
              });
            }
            if (kind === 'normal-delayed-screenshot') {
              // The real normal lifecycle lasts 2950ms. A delayed screenshot return
              // erases the old live predicate but must not erase an observed phase.
              const slowScreenshot = async () => {
                await page.screenshot({ path: join(evidence, `${name}-normal.png`) });
                await delay(3_250);
              };
              await slowScreenshot();
              assert.equal(
                await page.locator('.samurai-effect--impact.samurai-effect--resolve').count(),
                0,
                'The original screenshot-then-live-sample must miss the completed phase',
              );
            }
            await page.locator('.samurai-effect').waitFor({ state: 'detached', timeout: 5_000 });
            const result = await observation.evaluate((value) => value.finish());
            await observation.dispose();
            rows.push({ browser: name, kind, ...result });
            assert.equal(result.pass, kind === 'normal-delayed-screenshot', JSON.stringify(result));
            if (kind === 'normal-delayed-screenshot') {
              assert(
                result.transitions.some(
                  (row) => row.connected && row.overlays === 1 && row.impact && row.resolve,
                ),
              );
              assert.equal(result.ended, true);
            }
          } finally {
            await page.close();
          }
        });
      }
    } finally {
      await browser.close();
      writeFileSync(join(evidence, 'controls.json'), JSON.stringify(rows, null, 2) + '\n');
    }
  });
}
