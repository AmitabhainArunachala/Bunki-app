/** Independent physical answer clearance/grade reach. Expected11px is pinned original12-1, not current output. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
export const EXTRA_NAMES = Object.freeze([
  'oracle rejects10.5px gap and clipped/occluded grading buttons',
  '320x568 returning independent fitted geometry',
  '320x568 fresh independent fitted geometry',
  '320x568 returning actual scroll then reveal',
]);
export function observeAnswerLayout() {
  const rect = (n) => {
    const r = n.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  };
  const answer = document.querySelector('.kp-answer'),
    header = document.querySelector('.kp-top-study'),
    bar = document.querySelector('.kp-grades');
  if (!answer || !header || !bar) return { missing: true };
  const visibleState = (n) => {
    let opacity = 1;
    for (let p = n; p; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity);
    const style = getComputedStyle(n);
    return { effectiveOpacity: opacity, visibility: style.visibility, display: style.display };
  };
  const parts = [...answer.children]
    .filter((n) => !n.matches('.kp-folds,.kp-ladder') && n.getClientRects().length)
    .map((n) => ({ className: n.className, ...rect(n), ...visibleState(n) }));
  const headerBox = rect(header),
    barBox = rect(bar);
  const buttons = [...bar.querySelectorAll('button.kp-grade')].map((button) => {
    const box = rect(button),
      clips = [];
    // Overflow ancestry alone does not clip a viewport-fixed descendant. Require an actual lost hit at the suspect edge.
    const ownedAt = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === button || button.contains(hit));
    };
    for (let p = button.parentElement; p; p = p.parentElement) {
      const style = getComputedStyle(p),
        r = rect(p),
        cx = (box.left + box.right) / 2,
        cy = (box.top + box.bottom) / 2;
      if (/hidden|clip|auto|scroll/.test(style.overflowX))
        for (const x of [box.left + 0.5, box.right - 0.5])
          if ((x < r.left || x > r.right) && !ownedAt(x, cy))
            clips.push({ axis: 'x', parent: p.className, x, y: cy, ...r });
      if (/hidden|clip|auto|scroll/.test(style.overflowY))
        for (const y of [box.top + 0.5, box.bottom - 0.5])
          if ((y < r.top || y > r.bottom) && !ownedAt(cx, y))
            clips.push({ axis: 'y', parent: p.className, x: cx, y, ...r });
    }
    let misses = 0;
    const failures = [];
    const square = {
      x: box.left + (box.width - 44) / 2,
      y: box.top + (box.height - 44) / 2,
      width: 44,
      height: 44,
    };
    if (box.width >= 44 && box.height >= 44)
      for (let dy = 0; dy < 44; dy++)
        for (let dx = 0; dx < 44; dx++) {
          const x = square.x + dx + 0.5,
            y = square.y + dy + 0.5,
            hit = document.elementFromPoint(x, y);
          if (!hit || (hit !== button && !button.contains(hit))) {
            misses++;
            if (failures.length < 12)
              failures.push({ x, y, id: hit?.id || null, tag: hit?.tagName || null });
          }
        }
    return {
      id: button.id,
      disabled: button.disabled,
      ...visibleState(button),
      box,
      clips,
      square,
      misses,
      failures,
      viewportContained:
        box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
    };
  });
  return {
    missing: false,
    header: headerBox,
    bar: barBox,
    parts,
    answerText: answer.textContent,
    topGap: parts.length ? Math.min(...parts.map((r) => r.top)) - headerBox.bottom : null,
    bottomGap: parts.length ? barBox.top - Math.max(...parts.map((r) => r.bottom)) : null,
    buttons,
    overflow: document.documentElement.scrollWidth - innerWidth,
    scrollY,
    inner: document.querySelector('.kp-sentence')?.scrollTop ?? null,
  };
}
export function requireGrades(g) {
  assert.equal(g.missing, false);
  assert.deepEqual(
    g.buttons.map((b) => b.id),
    ['kp-grade-again', 'kp-grade-hard', 'kp-grade-good', 'kp-grade-easy'],
  );
  for (const b of g.buttons) {
    assert(
      !b.disabled &&
        b.visibility === 'visible' &&
        b.effectiveOpacity > 0 &&
        b.viewportContained &&
        b.box.width >= 44 &&
        b.box.height >= 44 &&
        b.clips.length === 0 &&
        b.misses === 0,
      `whole reachable44px grade button ${b.id}: ${JSON.stringify(b)}`,
    );
  }
}
export function requireFitted(g) {
  try {
    requireGrades(g);
    assert(
      g.parts.every((p) => p.visibility === 'visible' && p.effectiveOpacity > 0),
      'answer remains visibly rendered',
    );
    assert(g.parts.length >= 2, 'actual term and definition remain rendered');
    assert(g.parts.some((p) => String(p.className).split(' ').includes('kp-word')));
    assert(g.parts.some((p) => String(p.className).split(' ').includes('kp-def')));
    assert(
      g.topGap >= 11 && g.bottomGap >= 11,
      `original>=11px clearance, actual ${g.topGap}/${g.bottomGap}`,
    );
    assert.equal(g.overflow, 0);
  } catch (error) {
    error.observed = g;
    throw error;
  }
}
async function detectorControls(newPage) {
  const { context, page } = await newPage('X4-extra', 320, 568);
  try {
    await page.setContent(
      `<style>html,body{margin:0}.kp-top-study{position:fixed;left:0;right:0;top:0;height:44px}.kp-answer{position:fixed;left:0;top:56px;width:320px;height:400px;display:flex;flex-direction:column}.kp-word{height:40px;flex:none}.kp-def{height:360px;flex:none}.kp-grades{position:fixed;left:0;right:0;bottom:0;height:100px;display:grid;grid-template-columns:repeat(4,1fr)}.kp-grade{height:80px;margin-top:10px;min-width:0;padding:0;border:0;border-radius:0}</style><header class="kp-top-study">Header</header><div class="kp-answer"><div class="kp-word">Term</div><div class="kp-def">Definition</div></div><div class="kp-grades">${['again', 'hard', 'good', 'easy'].map((x) => `<button class="kp-grade" id="kp-grade-${x}">${x}</button>`).join('')}</div>`,
    );
    const good = await page.evaluate(observeAnswerLayout);
    requireFitted(good);
    assert.equal(good.bottomGap, 12);
    await page.locator('.kp-answer').evaluate((n) => (n.style.transform = 'translateY(1.5px)'));
    const gap = await page.evaluate(observeAnswerLayout);
    assert.equal(gap.bottomGap, 10.5);
    assert.throws(() => requireFitted(gap));
    await page.locator('.kp-answer').evaluate((n) => n.style.removeProperty('transform'));
    await page.locator('#kp-grade-good').evaluate((n) => (n.style.transform = 'translateY(60px)'));
    const clipped = await page.evaluate(observeAnswerLayout);
    assert.equal(clipped.bottomGap, 12);
    assert.throws(() => requireGrades(clipped));
    await page.locator('#kp-grade-good').evaluate((n) => n.style.removeProperty('transform'));
    const b = good.buttons.find((x) => x.id === 'kp-grade-good').box;
    await page.evaluate((b) => {
      const cover = document.createElement('div');
      cover.style.cssText = `position:fixed;left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px;z-index:2147483000`;
      document.body.append(cover);
    }, b);
    const occluded = await page.evaluate(observeAnswerLayout);
    assert.throws(() => requireGrades(occluded));
    return { syntheticOnly: true, good, gap, clipped, occluded };
  } finally {
    await context.close();
  }
}
export async function extraLayoutRows({
  newPage,
  deckStart,
  resting,
  layoutCensus,
  originalPredicate,
  check,
  out,
}) {
  async function row(name, fn) {
    try {
      check('X4-extra', name, true, await fn());
    } catch (error) {
      check('X4-extra', name, false, { error: error.stack, observed: error.observed || null });
    }
  }
  await row(EXTRA_NAMES[0], () => detectorControls(newPage));
  for (const [name, fresh, scroll] of [
    [EXTRA_NAMES[1], false, false],
    [EXTRA_NAMES[2], true, false],
    [EXTRA_NAMES[3], false, true],
  ])
    await row(name, async () => {
      const { context, page } = await newPage('X4-extra', 320, 568);
      try {
        await deckStart(page, 'n2', {
          sittings: fresh ? 0 : 4,
          ruleSeen: !fresh,
          againCoachSeen: !fresh,
          ...(scroll ? { zoom: 'full' } : {}),
        });
        let scrollWitness = null;
        if (scroll) {
          const before = await page.evaluate(() => ({
            outer: scrollY,
            inner: document.querySelector('.kp-sentence').scrollTop,
          }));
          const p = await page.locator('.kp-sentence').boundingBox();
          const visibleTop = Math.max(p.y, 0),
            visibleBottom = Math.min(p.y + p.height, 468);
          assert(visibleBottom > visibleTop, 'scroll target is visible');
          await page.mouse.move(p.x + p.width / 2, (visibleTop + visibleBottom) / 2);
          await page.mouse.wheel(0, 160);
          await resting(page);
          const after = await page.evaluate(() => ({
            outer: scrollY,
            inner: document.querySelector('.kp-sentence').scrollTop,
          }));
          assert(
            before.outer !== after.outer || before.inner !== after.inner,
            'scroll case must actually move outer or inner reading position',
          );
          scrollWitness = { before, after };
        }
        await page.locator('#kp-reveal').click();
        await resting(page);
        const original = await page.evaluate(layoutCensus);
        original.targetCanFit =
          Math.max(
            original.target.bottom,
            original.answer.at(-1).bottom,
            original.toggle?.bottom || 0,
          ) -
            Math.min(
              original.target.top,
              original.answer[0].top,
              original.toggle?.top ?? Infinity,
            ) <=
          original.bar.top - 12 - (original.header.bottom + 12);
        const observed = await page.evaluate(observeAnswerLayout);
        if (out)
          await page.screenshot({
            path: join(
              out,
              'shots',
              `p3-extra-${fresh ? 'fresh' : scroll ? 'scroll-returning' : 'returning'}.png`,
            ),
          });
        try {
          assert(
            originalPredicate(original),
            'original X4 predicate also applies unchanged to added fitted state',
          );
          requireFitted(observed);
        } catch (error) {
          error.observed = { original, independent: observed, scrollWitness };
          throw error;
        }
        const card = await page.locator('#kp-card').getAttribute('data-card'),
          good = observed.buttons.find((b) => b.id === 'kp-grade-good');
        await page.mouse.click(good.square.x + 22, good.square.y + 22);
        await page.locator('#kp-reveal').waitFor();
        await resting(page);
        const next = await page.locator('#kp-card').getAttribute('data-card');
        assert.notEqual(next, card, 'actual grade pointer advances the live sitting');
        return {
          original,
          independent: observed,
          scrollWitness,
          gradePointer: { beforeCard: card, afterCard: next },
        };
      } finally {
        await context.close();
      }
    });
}
