/**
 * The stroke brush actually draws — sampled in a browser, not asserted in a
 * docblock (lane B2, repair round).
 *
 * ## Why this test exists
 *
 * `StrokeOrder` has two modes. The reveal shows stroke N whole; the brush
 * animates a dash offset from the path's length down to zero so the stroke
 * appears to be written. The character page opts into the brush.
 *
 * For the whole of this lane's first pass it did not. `InkDraw` seeds its
 * animated value from `drawing` on first render, and the canvas mounted it only
 * once a stroke was *already* written — so it started at offset zero and then
 * animated zero to zero. Three separate docblocks said the strokes were "written
 * with the brush", the code compiled, every unit test passed, and the observable
 * behaviour was identical to the reveal it was supposed to replace.
 *
 * Nothing short of watching real frames could have caught that, which is why
 * this is an E2E and not a unit test. It samples `stroke-dashoffset` on every
 * stroke path inside a `requestAnimationFrame` loop and asserts that at least
 * one frame catches a stroke **part-drawn** — an offset that is neither the
 * full path length (not started) nor zero (finished). A partial offset can only
 * exist if a real interpolation is running.
 *
 * ## What it deliberately does not assert
 *
 * Not a duration, not a frame count, not an easing curve. Those are timing
 * facts about a shared CI machine and would flake. The claim under test is
 * binary and is the one that was false: does the offset ever take an
 * intermediate value.
 *
 * Scope: Chromium on Expo Web, which is the only engine this environment can
 * honestly claim (REQ-GATE-03).
 */

import { expect, test, visibleTestId } from './support/adv-harness.ts';

/** 森 — twelve strokes, so the sequence runs long enough to be sampled. */
const TWELVE_STROKE_KANJI = '/kanji/%E6%A3%AE';

/**
 * Collect every distinct dash-offset vector over ~3s of animation frames.
 *
 * Written as a string rather than a closure because the surrounding file is
 * linted as Node source, where `document` and `requestAnimationFrame` do not
 * exist. A `-` cell is a path with no `stroke-dashoffset` attribute at all —
 * the static ghost underlay, which never carries one.
 */
const SAMPLE_DASH_OFFSETS = `new Promise((done) => {
  const seen = new Set();
  const start = performance.now();
  let frames = 0;
  const tick = () => {
    frames += 1;
    const svg = document.querySelector('[data-testid="kanji-strokes"] svg');
    if (svg !== null) {
      seen.add([...svg.querySelectorAll('path')]
        .map((path) => {
          const raw = path.getAttribute('stroke-dashoffset');
          if (raw === null) return '-';
          const value = Number(raw);
          return Number.isFinite(value) ? String(Math.round(value)) : '-';
        })
        .join(','));
    }
    if (performance.now() - start < 3000) requestAnimationFrame(tick);
    else done({ frames, vectors: [...seen] });
  };
  requestAnimationFrame(tick);
})`;

interface DashSample {
  readonly frames: number;
  readonly vectors: readonly string[];
}

/** Cells that are neither "no attribute" nor "finished". */
function partDrawnCells(vectors: readonly string[]): readonly string[] {
  return vectors.flatMap((vector) =>
    vector.split(',').filter((cell) => cell !== '-' && cell !== '0'),
  );
}

test.describe('stroke order', () => {
  test('draws each stroke rather than revealing it whole', async ({ app, browser }) => {
    /*
      An explicit context rather than `test.use({ reducedMotion })`: the harness
      exports a `test` extended with a worker-scoped `app` fixture, and Playwright
      types `use` against the base options of *that* object. The setting matters
      more than the spelling — under `reduce` the duration is zero by design and
      this test would be asserting the opposite of what it means to.
    */
    const context = await browser.newContext({ reducedMotion: 'no-preference' });
    const page = await context.newPage();
    try {
      await page.goto(`${app.origin}${TWELVE_STROKE_KANJI}`, { waitUntil: 'domcontentloaded' });
      await expect(visibleTestId(page, 'screen-kanji')).toBeVisible({ timeout: 45_000 });
      await expect(visibleTestId(page, 'kanji-strokes')).toBeVisible({ timeout: 30_000 });

      const sample = (await page.evaluate(SAMPLE_DASH_OFFSETS)) as DashSample;

      // The sampler has to have run, or the assertion below is vacuous.
      expect(sample.frames, 'no animation frames were sampled').toBeGreaterThan(30);
      expect(
        sample.vectors.length,
        'the dash offsets never changed at all, so nothing was animating',
      ).toBeGreaterThan(1);

      const partDrawn = partDrawnCells(sample.vectors);
      expect(
        partDrawn.length,
        'every sampled frame had each stroke either absent or complete: the brush is ' +
          'not interpolating, it is the discrete reveal wearing its name. ' +
          `Sampled ${String(sample.frames)} frames, ${String(sample.vectors.length)} distinct ` +
          `vectors, first three: ${JSON.stringify(sample.vectors.slice(0, 3))}`,
      ).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test('lands every stroke complete under reduced motion', async ({ app, browser }) => {
    // The other half of the convergence claim: reduced motion is a duration of
    // zero, not a second rendering path, so the finished character is identical.
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    try {
      await page.goto(`${app.origin}${TWELVE_STROKE_KANJI}`, { waitUntil: 'domcontentloaded' });
      await expect(visibleTestId(page, 'screen-kanji')).toBeVisible({ timeout: 45_000 });
      await visibleTestId(page, 'stroke-show-all').click();

      const offsets = (await page.evaluate(`(() => {
        const svg = document.querySelector('[data-testid="kanji-strokes"] svg');
        if (svg === null) return [];
        return [...svg.querySelectorAll('path')]
          .map((path) => path.getAttribute('stroke-dashoffset'))
          .filter((raw) => raw !== null)
          .map((raw) => Math.round(Number(raw)));
      })()`)) as readonly number[];

      expect(offsets.length, 'no drawn stroke paths were found').toBeGreaterThan(0);
      expect(
        offsets.every((offset) => offset === 0),
        `offsets were ${JSON.stringify(offsets)}`,
      ).toBe(true);
    } finally {
      await context.close();
    }
  });
});
