/** Proposed additional navigation witness. DOM reads and native Playwright actions only. */
import assert from 'node:assert/strict';
export async function actionable(control) {
  assert.equal(await control.count(), 1, 'Exactly one current control required');
  assert(await control.isVisible(), 'Control must be visible');
  assert(await control.isEnabled(), 'Control must be enabled');
  const witness = await control.evaluate((node) => {
    const r = node.getBoundingClientRect(),
      x = r.left + r.width / 2,
      y = r.top + r.height / 2;
    const target = document.elementFromPoint(x, y);
    return {
      id: node.id,
      role: node.getAttribute('role'),
      width: r.width,
      height: r.height,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      inert: !!node.closest('[inert]'),
      owned: target === node || node.contains(target),
    };
  });
  assert(
    witness.width > 0 &&
      witness.height > 0 &&
      witness.inViewport &&
      !witness.inert &&
      witness.owned,
    'Native control must own a visible in-viewport point',
  );
  return witness;
}
export async function activate(page, control, mode = 'click') {
  const witness = await actionable(control);
  assert(['click', 'Enter', 'Space'].includes(mode));
  if (mode === 'click') await control.click();
  else {
    await control.focus();
    assert(
      await control.evaluate((node) => document.activeElement === node),
      'Native keyboard focus required',
    );
    await page.keyboard.press(mode);
  }
  return { ...witness, mode };
}
export async function expectView(page, view) {
  await page.waitForFunction((expected) => document.body.dataset.view === expected, view);
  assert.equal(await page.locator('body').getAttribute('data-view'), view);
}
export async function currentGate(page) {
  // Pick current layer; never click an inert room's gate through an open sheet.
  if (await page.locator('#sheet').isVisible()) return page.locator('#sheet-gate');
  if (await page.locator('#bar-gate').isVisible()) return page.locator('#bar-gate');
  return page.locator('#ginga-symbol');
}
/** Explicit route authority; places Review means dojo, never Today's tray. */
export function todayGateRoute(openerId, layout = 'current') {
  assert.equal(
    layout,
    'current',
    'Today/tray helper requires current layout; places Review is dojo',
  );
  assert(
    ['ginga-symbol', 'bar-gate', 'sheet-gate'].includes(openerId),
    'Known native gate required',
  );
  return openerId === 'ginga-symbol'
    ? {
        menu: '#app > .nav-bar.gate-panel',
        destination: '#app > .nav-bar.gate-panel #nav-review',
        layer: 'first-screen',
      }
    : { menu: '#gate-menu', destination: '#gate-menu #nav-review', layer: 'room-or-sheet' };
}
export async function openToday(page, { mode = 'click', via = 'tab', layout = 'current' } = {}) {
  assert.equal(
    layout,
    'current',
    'Today/tray helper requires current layout; places Review is dojo',
  );
  assert(['tab', 'gate'].includes(via));
  if (via === 'tab') {
    await activate(page, page.locator('#tab-today:visible, #home-review:visible'), mode);
  } else {
    const gate = await currentGate(page);
    const route = todayGateRoute(await gate.getAttribute('id'), layout);
    await activate(page, gate, mode);
    const menu = page.locator(route.menu);
    assert.equal(await menu.count(), 1, 'Exactly one current gate panel required');
    assert(await menu.isVisible(), 'Current gate panel must actually open');
    await activate(page, page.locator(route.destination), mode);
    assert.equal(await menu.count(), 0, 'Gate must close on destination');
  }
  await expectView(page, 'tray');
}
export async function setLanguage(page, target, { mode = 'click' } = {}) {
  assert(['ja', 'bi'].includes(target));
  let control = page.locator('#lang button[data-lang]');
  await actionable(control);
  const before = await control.getAttribute('data-lang');
  assert(['ja', 'bi', 'en'].includes(before));
  if ((before === 'ja') !== (target === 'ja')) await activate(page, control, mode);
  control = page.locator('#lang button[data-lang]');
  await actionable(control);
  const after = await control.getAttribute('data-lang');
  assert.equal(
    after === 'ja',
    target === 'ja',
    'Current-state toggle must reach requested rendered language',
  );
  assert.match(await control.getAttribute('aria-label'), target === 'ja' ? /English/ : /日本語/);
}
export async function assertBack(page, { view, focusId, mode = 'click' }) {
  assert(view && focusId, 'Caller must freeze exact return room and invoker');
  await activate(page, page.locator('#back'), mode);
  await expectView(page, view);
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    focusId,
    'Back must restore the original invoker focus',
  );
}
export async function retainedText(page, selector, expected) {
  assert(
    typeof expected === 'string' && expected.trim().length > 0,
    'Retention witness requires a meaningful nonempty original draft',
  );
  const field = page.locator(selector);
  assert.equal(await field.count(), 1);
  assert.equal(
    await field.inputValue(),
    expected,
    'Original draft must survive navigation unchanged',
  );
}
