/** Independent sheet pointer/keyboard oracle. Browser execution is coordinator gated; no app state patching. */
import assert from 'node:assert/strict';
export const WIDTHS = Object.freeze([320, 390, 768, 1280]);
export const CASE_NAMES = Object.freeze([
  'sheet-controls oracle detects lost pseudo reach, edge interception and gate interception',
  ...WIDTHS.flatMap((width) =>
    ['search pointer', 'metadata pointer', 'keyboard Enter and Space'].map(
      (name) => `sheet-controls ${width}px ${name}`,
    ),
  ),
]);
// Executed in the browser against one actual target; no production geometry helper is consulted.
export function sampleHitGrid(element) {
  const bounds = (rectangle) => ({
    x: rectangle.left,
    y: rectangle.top,
    width: rectangle.width,
    height: rectangle.height,
  });
  const describe = (node) =>
    node
      ? {
          tag: node.tagName,
          id: node.id || null,
          button: node.closest?.('button')?.id || null,
          referenceDoor: node.closest?.('[data-reference-door]')?.dataset.referenceDoor || null,
        }
      : null;
  const rect = element.getBoundingClientRect(),
    candidates = [{ kind: 'element', ...bounds(rect) }],
    issues = [];
  for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
    const transform = getComputedStyle(ancestor).transform;
    if (transform !== 'none') {
      const m = new DOMMatrixReadOnly(transform);
      if (m.a !== 1 || m.b !== 0 || m.c !== 0 || m.d !== 1)
        issues.push('scaled/rotated target geometry requires a separately reviewed mapper');
    }
  }
  const length = (value, basis) =>
    value === 'auto'
      ? null
      : /^-?[\d.]+%$/.test(value)
        ? (parseFloat(value) * basis) / 100
        : /^-?[\d.]+px$/.test(value) || value === '0'
          ? parseFloat(value)
          : null;
  for (const pseudo of ['::before', '::after']) {
    const style = getComputedStyle(element, pseudo);
    if (
      style.content === 'none' ||
      style.content === 'normal' ||
      style.display === 'none' ||
      style.position !== 'absolute'
    )
      continue;
    let block = element;
    if (getComputedStyle(block).position === 'static') {
      block = block.parentElement;
      while (block && getComputedStyle(block).position === 'static') block = block.parentElement;
    }
    if (!block) {
      issues.push(`${pseudo} has an unsupported initial containing block`);
      continue;
    }
    const box = block.getBoundingClientRect(),
      blockStyle = getComputedStyle(block);
    const borderLeft = parseFloat(blockStyle.borderLeftWidth) || 0,
      borderTop = parseFloat(blockStyle.borderTopWidth) || 0;
    const widthBasis = block.clientWidth,
      heightBasis = block.clientHeight;
    const left = length(style.left, widthBasis),
      top = length(style.top, heightBasis),
      right = length(style.right, widthBasis),
      bottom = length(style.bottom, heightBasis);
    let width = length(style.width, widthBasis),
      height = length(style.height, heightBasis);
    if (width == null && left != null && right != null) width = widthBasis - left - right;
    if (height == null && top != null && bottom != null) height = heightBasis - top - bottom;
    if (
      width == null ||
      height == null ||
      (left == null && right == null) ||
      (top == null && bottom == null)
    ) {
      issues.push(`${pseudo} has unresolved CSSOM dimensions`);
      continue;
    }
    if (style.boxSizing !== 'border-box') {
      width +=
        (parseFloat(style.paddingLeft) || 0) +
        (parseFloat(style.paddingRight) || 0) +
        (parseFloat(style.borderLeftWidth) || 0) +
        (parseFloat(style.borderRightWidth) || 0);
      height +=
        (parseFloat(style.paddingTop) || 0) +
        (parseFloat(style.paddingBottom) || 0) +
        (parseFloat(style.borderTopWidth) || 0) +
        (parseFloat(style.borderBottomWidth) || 0);
    }
    const x =
      box.left +
      borderLeft +
      (left ?? widthBasis - right - width) +
      (parseFloat(style.marginLeft) || 0);
    const y =
      box.top +
      borderTop +
      (top ?? heightBasis - bottom - height) +
      (parseFloat(style.marginTop) || 0);
    const origins = style.transformOrigin.split(' '),
      ox = length(origins[0], width) ?? width / 2,
      oy = length(origins[1], height) ?? height / 2;
    const matrix =
      style.transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(style.transform);
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ].map(([a, b]) => new DOMPoint(a - ox, b - oy).matrixTransform(matrix));
    const xs = corners.map((point) => point.x + x + ox),
      ys = corners.map((point) => point.y + y + oy);
    candidates.push({
      kind: pseudo,
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      pointerEvents: style.pointerEvents,
    });
  }
  const sampled = candidates
    .filter((box) => box.width >= 44 - 0.01 && box.height >= 44 - 0.01)
    .map((box) => {
      const square = {
        x: box.x + (box.width - 44) / 2,
        y: box.y + (box.height - 44) / 2,
        width: 44,
        height: 44,
      };
      let misses = 0;
      const failures = [];
      for (let dy = 0; dy < 44; dy++)
        for (let dx = 0; dx < 44; dx++) {
          const x = square.x + dx + 0.5,
            y = square.y + dy + 0.5,
            hit = document.elementFromPoint(x, y);
          if (!hit || (hit !== element && !element.contains(hit))) {
            misses++;
            if (failures.length < 24) failures.push({ x, y, hit: describe(hit) });
          }
        }
      return { kind: box.kind, square, samples: 1936, misses, failures };
    });
  const passing = sampled.find((grid) => !grid.misses);
  return {
    pass:
      !!passing &&
      !issues.length &&
      element.isConnected &&
      !element.disabled &&
      getComputedStyle(element).visibility !== 'hidden',
    target: describe(element),
    layout: bounds(rect),
    candidates,
    sampled,
    selected: passing?.square || null,
    issues,
    centerHit: describe(
      document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2),
    ),
  };
}
export const measurements = [];
export async function measureHitGrid(locator) {
  await locator.scrollIntoViewIfNeeded();
  return locator.evaluate(sampleHitGrid);
}
export async function requireHitGrid(page, locator, label = 'actual interactive target') {
  const result = await measureHitGrid(locator);
  measurements.push({ label, ...result });
  assert(
    result.pass,
    `${label}: no fully owned44x44 CSS-pixel hit square: ${JSON.stringify(result)}`,
  );
  return { ...result.selected, evidence: result };
}
async function proveDetector(context) {
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>#target{position:relative;margin:80px;width:24px;height:24px;min-width:0;min-height:0;padding:0;border:0;border-radius:0;background:transparent}#target::before{content:'';position:absolute;inset:-10px}</style><button id="target">T</button>`,
    );
    const target = page.locator('#target');
    const good = await measureHitGrid(target);
    assert(good.pass, 'a real24px face with44px pseudo reach is accepted');
    await target.evaluate((button) => {
      window.clicks = 0;
      button.addEventListener('click', () => window.clicks++);
    });
    await page.mouse.click(good.selected.x + 0.5, good.selected.y + 0.5);
    assert.equal(
      await page.evaluate(() => window.clicks),
      1,
      'expanded edge receives actual pointer',
    );
    await target.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    assert.equal(
      await page.evaluate(() => window.clicks),
      3,
      'native keyboard activation on expanded target',
    );
    const css = await page.addStyleTag({
      content: '#target::before{pointer-events:none!important}',
    });
    const lost = await measureHitGrid(target);
    assert(
      !lost.pass && lost.sampled.some((grid) => grid.misses > 0),
      'losing pseudo pointer reach must reject despite same declared44px bounds',
    );
    await css.evaluate((node) => node.remove());
    const edge = await page.evaluate(({ x, y }) => {
      const block = document.createElement('div');
      block.id = 'edge-interceptor';
      block.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:2px;height:44px;z-index:2147483000;pointer-events:auto`;
      document.body.append(block);
      return block.id;
    }, good.selected);
    const clipped = await measureHitGrid(target);
    assert(!clipped.pass, 'edge-only obstruction must reject');
    assert.equal(clipped.centerHit.id, 'target', 'center remains healthy in edge negative');
    await page.locator('#' + edge).evaluate((node) => node.remove());
    await page.evaluate(({ x, y }) => {
      const gate = document.createElement('button');
      gate.id = 'sheet-gate';
      gate.innerHTML = '<svg width="44" height="44"><rect width="44" height="44"/></svg>';
      gate.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:44px;height:44px;min-width:0;min-height:0;padding:0;border:0;z-index:2147483000`;
      document.body.append(gate);
    }, good.selected);
    const intercepted = await measureHitGrid(target);
    assert(
      !intercepted.pass &&
        intercepted.sampled.some((grid) =>
          grid.failures.some((f) => f.hit?.button === 'sheet-gate'),
        ),
      'gate subtree interception must reject',
    );
    measurements.push({
      label: 'detector-negative-controls',
      syntheticOnly: true,
      good,
      lost,
      clipped,
      intercepted,
    });
  } finally {
    await page.close();
  }
}
async function exactCollection(page, id, catalog) {
  const collection = catalog.collections.find((item) => item.id === id);
  assert(collection, 'expected immutable catalog collection');
  const level = collection.level,
    englishLevel =
      level === 'unknown'
        ? 'No level given'
        : level === '配当外'
          ? 'Outside assigned grades'
          : String(level).includes('級')
            ? `Grade ${String(level).replaceAll('準', 'pre-').replaceAll('級', '')}`
            : level;
  const names =
    collection.family === 'kanken'
      ? [`漢検 · ${level}`, `Kanji Kentei · ${englishLevel}`]
      : [
          `JLPT · ${level} · ${collection.kind === 'kanji' ? '漢字' : '語彙'}`,
          `JLPT · ${englishLevel} · ${collection.kind === 'kanji' ? 'Kanji' : 'Vocabulary'}`,
        ];
  assert(
    names.includes(await page.locator('#reference-title').innerText()),
    `exact catalog destination ${id}`,
  );
}
export async function registerSheetControls({
  page,
  context,
  check,
  entry,
  nodeIs,
  stable,
  catalog,
}) {
  await check(CASE_NAMES[0], () => proveDetector(context), 'sheet-controls');
  for (const width of WIDTHS) {
    await check(
      `sheet-controls ${width}px search pointer`,
      async () => {
        await page.setViewportSize({ width, height: 844 });
        await entry();
        await page.click('[data-kanjirow="学"]');
        await nodeIs('kanji:学');
        await stable();
        const search = page.locator('#sheet-search');
        const hit = await requireHitGrid(page, search, 'sheet search');
        await page.mouse.click(hit.x + 0.5, hit.y + 0.5);
        await page.waitForFunction(() => document.activeElement?.id === 'nav-search-input');
        assert.equal(await page.locator('#gate-menu').count(), 0, 'search does not open gate menu');
        assert.equal(
          await page.locator('body').getAttribute('data-view'),
          'search',
          'real search destination',
        );
        await page.click('#back');
        await nodeIs('kanji:学');
        const gate = page.locator('#sheet-gate');
        const gateHit = await requireHitGrid(page, gate, 'independent centered gate');
        const gateBox = await gate.boundingBox();
        assert(
          Math.abs(gateBox.x + gateBox.width / 2 - width / 2) <= 1,
          'accepted centered torii remains centered',
        );
        await page.mouse.click(gateHit.x + 22, gateHit.y + 22);
        await page.locator('#gate-menu').waitFor();
        await page.keyboard.press('Escape');
        await nodeIs('kanji:学');
        await page.waitForFunction(() => document.activeElement?.id === 'sheet-gate');
      },
      'sheet-controls',
    );
    await check(
      `sheet-controls ${width}px metadata pointer`,
      async () => {
        await page.setViewportSize({ width, height: 844 });
        await entry();
        await page.click('[data-kanjirow="学"]');
        for (const prefix of ['kanken:', 'jlpt-kanji:']) {
          const chip = page.locator(`[data-reference-door^="${prefix}"]`),
            id = await chip.getAttribute('data-reference-door'),
            label = await chip.textContent();
          const hit = await requireHitGrid(page, chip, `metadata ${prefix}`);
          await page.mouse.click(hit.x + 43.5, hit.y + 43.5);
          await page.waitForSelector('#reference-library[data-view="collection"]');
          await exactCollection(page, id, catalog);
          await page.click('#reference-back');
          await nodeIs('kanji:学');
          assert.equal(
            await page.evaluate(() => document.activeElement.textContent),
            label,
            'same metadata return focus',
          );
        }
      },
      'sheet-controls',
    );
    await check(
      `sheet-controls ${width}px keyboard Enter and Space`,
      async () => {
        await page.setViewportSize({ width, height: 844 });
        for (const key of ['Enter', 'Space']) {
          await entry();
          await page.click('[data-kanjirow="学"]');
          const search = page.locator('#sheet-search');
          await requireHitGrid(page, search, 'keyboard-reachable search');
          await search.focus();
          await page.keyboard.press(key);
          await page.waitForFunction(() => document.activeElement?.id === 'nav-search-input');
          assert.equal(await page.locator('#gate-menu').count(), 0);
          assert.equal(await page.locator('body').getAttribute('data-view'), 'search');
          await page.click('#back');
          await nodeIs('kanji:学');
          for (const prefix of ['kanken:', 'jlpt-kanji:']) {
            const chip = page.locator(`[data-reference-door^="${prefix}"]`),
              id = await chip.getAttribute('data-reference-door'),
              label = await chip.textContent();
            await chip.focus();
            await page.keyboard.press(key);
            await page.waitForSelector('#reference-library[data-view="collection"]');
            await exactCollection(page, id, catalog);
            await page.click('#reference-back');
            await nodeIs('kanji:学');
            assert.equal(await page.evaluate(() => document.activeElement.textContent), label);
          }
          const gate = page.locator('#sheet-gate');
          await gate.focus();
          await page.keyboard.press(key);
          await page.locator('#gate-menu').waitFor();
          await page.keyboard.press('Escape');
          await nodeIs('kanji:学');
          await page.waitForFunction(() => document.activeElement?.id === 'sheet-gate');
        }
      },
      'sheet-controls',
    );
  }
}
