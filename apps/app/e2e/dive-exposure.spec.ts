/**
 * Flying the dive writes nothing — in a real browser, on the shipped bundle
 * (lane B2).
 *
 * ## The claim, and why a source scan cannot make it
 *
 * > Rapid clicking through the structure is EXPOSURE. Exposure is never
 * > retrieval.
 *
 * `test/dive-boundary.test.ts` proves the dive's module graph cannot *reach* a
 * write. That is a strong claim and it is not this one. A screen can hold no
 * dispatch function and still cause a write through something it renders, and a
 * scan cannot see a bundle at all. So this lane does the other half: it opens
 * the exported app, keeps a word so the durable log has something in it, reads
 * the log, flies the dive as hard as a finger can, and reads the log again.
 *
 * **The assertion is byte equality of the durable snapshot**, not a count. A
 * count would pass a run that replaced one event with another, and the failure
 * this is written against — an exposure quietly becoming evidence — is exactly
 * the shape that would.
 *
 * ## What "as hard as a finger can" means here
 *
 * Every gesture the surface has, at several depths: zoom into a component, into
 * a stroke, back out, all the way out, change the capability lens, open a
 * disclosure, and do it again. The dive is designed for a "hyper rapid pace" and
 * the whole point of the boundary is that the pace is free.
 *
 * Scope: Chromium on Expo Web, which is the only engine this environment can
 * honestly claim (REQ-GATE-03).
 */

import { expect, test, keepWord, openApp, visibleTestId } from './support/adv-harness.ts';

/** Where the web adapter keeps its snapshot (`src/state/persistence/shared.ts`). */
const SNAPSHOT_KEY = 'bunki-phase0';

/** The canonical fixture target, typed as the operator would type it. */
const TARGET = '分岐';

/** The durable snapshot, verbatim. `null` when nothing has been written yet. */
async function durableSnapshot(page: Parameters<typeof visibleTestId>[0]): Promise<string | null> {
  return page.evaluate((key) => globalThis.localStorage.getItem(key), SNAPSHOT_KEY);
}

test.describe('the dive', () => {
  test('logs nothing when it is flown', async ({ app, page }) => {
    await openApp(page, app.origin);

    // Something in the log first: an empty log is trivially unchanged, and the
    // assertion has to be able to fail.
    await keepWord(page, TARGET);
    const before = await durableSnapshot(page);
    expect(before, 'nothing was written before the dive, so the check is vacuous').not.toBeNull();
    expect((before ?? '').length).toBeGreaterThan(50);

    // Onto the character page, which is the dive stopped at L2.
    await openApp(page, app.origin, '/kanji/%E5%88%86');
    await expect(visibleTestId(page, 'screen-kanji')).toBeVisible({ timeout: 30_000 });
    await expect(visibleTestId(page, 'dive-ladder')).toBeVisible();
    await expect(visibleTestId(page, 'dive-at-surface')).toBeVisible();

    // Fly it. Every gesture the surface has, several times over.
    for (let round = 0; round < 3; round += 1) {
      const nodes = page.getByTestId(/^dive-node-/).locator('visible=true');
      const count = await nodes.count();
      expect(count, 'the dive drew no nodes, so nothing was flown').toBeGreaterThan(0);

      for (let index = 0; index < Math.min(count, 4); index += 1) {
        await nodes.nth(index).click();
        await expect(visibleTestId(page, 'dive-path')).toBeVisible();
        await visibleTestId(page, 'dive-back').click();
      }

      // Deeper, then all the way out in one gesture.
      await nodes.first().click();
      const deeper = page.getByTestId(/^dive-node-/).locator('visible=true');
      if ((await deeper.count()) > 0) await deeper.first().click();
      await visibleTestId(page, 'dive-surface').click();
      await expect(visibleTestId(page, 'dive-at-surface')).toBeVisible();

      // The lens is a display control; changing it is exposure too.
      for (const lens of ['reading', 'meaning', 'writing']) {
        await visibleTestId(page, `lens-${lens}`).click();
      }
    }

    // And the sections that unfold. Opening a disclosure is reading.
    for (const section of ['kanji-readings-toggle', 'kanji-components-toggle']) {
      const toggle = visibleTestId(page, section);
      if ((await toggle.count()) > 0) await toggle.first().click();
    }

    const after = await durableSnapshot(page);
    expect(after, 'flying the dive changed the durable event log; exposure became a write').toBe(
      before,
    );
  });

  test('always answers where you are and always offers one gesture out', async ({ app, page }) => {
    await openApp(page, app.origin, '/kanji/%E5%88%86');
    await expect(visibleTestId(page, 'screen-kanji')).toBeVisible({ timeout: 30_000 });

    // At the surface: the ladder is there and the exit is honestly absent.
    await expect(visibleTestId(page, 'dive-ladder')).toBeVisible();
    await expect(visibleTestId(page, 'dive-path')).toBeVisible();
    await expect(visibleTestId(page, 'dive-at-surface')).toBeVisible();

    // Four zooms deep, both still there, and the exit is one press.
    const origin = (await visibleTestId(page, 'dive-path').innerText()).trim();
    for (let depth = 0; depth < 4; depth += 1) {
      const nodes = page.getByTestId(/^dive-node-/).locator('visible=true');
      if ((await nodes.count()) === 0) break;
      await nodes.first().click();
      await expect(visibleTestId(page, 'dive-ladder')).toBeVisible();
      await expect(visibleTestId(page, 'dive-path')).toBeVisible();
      await expect(visibleTestId(page, 'dive-surface')).toBeVisible();
    }

    await visibleTestId(page, 'dive-surface').click();
    await expect(visibleTestId(page, 'dive-path')).toHaveText(origin);
    await expect(visibleTestId(page, 'dive-at-surface')).toBeVisible();
  });

  test('says on screen what it materialised, and it is a small part of the graph', async ({
    app,
    page,
  }) => {
    await openApp(page, app.origin, '/kanji/%E5%88%86');
    await expect(visibleTestId(page, 'screen-kanji')).toBeVisible({ timeout: 30_000 });

    const cost = (await visibleTestId(page, 'dive-cost').innerText()).replace(/\s+/g, ' ');
    const match = /materialised (\d+) nodes of the (\d+)/.exec(cost);
    expect(match, `the cost line did not read as expected: ${cost}`).not.toBeNull();

    const materialised = Number.parseInt(match?.[1] ?? '0', 10);
    const total = Number.parseInt(match?.[2] ?? '0', 10);
    expect(total, 'the indexed graph is implausibly small').toBeGreaterThan(4000);
    expect(materialised).toBeGreaterThan(0);
    expect(
      materialised / total,
      'one view materialised more than a fiftieth of the graph',
    ).toBeLessThan(0.02);
  });

  test('states which motion mode is running rather than changing quietly', async ({
    app,
    page,
  }) => {
    await openApp(page, app.origin, '/kanji/%E5%88%86');
    await expect(visibleTestId(page, 'screen-kanji')).toBeVisible({ timeout: 30_000 });
    const note = visibleTestId(page, 'dive-motion-mode');
    await expect(note).toBeVisible();
    expect((await note.innerText()).trim().length).toBeGreaterThan(20);
  });
});
