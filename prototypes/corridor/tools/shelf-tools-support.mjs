/** The shelf's study tools sit behind one 学習ツール Tools button (glance pass, 2026-10-01): a
 * suite that walks into a room through one of its doors (#mock-link, #levels-link, …) opens that
 * panel first, as a learner does, and then presses the door itself. Opening is idempotent: an
 * open panel stays open, and the panel stays open when the learner comes back to the shelf. */
export const SHELF_TOOLS_TOGGLE = '#shelf-tools-toggle';
export const SHELF_TOOLS_PANEL = '#shelf-tools-panel';

/** Open the 学習ツール panel on the shelf the page is showing. */
export async function openShelfTools(page) {
  const toggle = page.locator(SHELF_TOOLS_TOGGLE);
  await toggle.waitFor({ state: 'visible' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.locator(SHELF_TOOLS_PANEL).waitFor({ state: 'visible' });
}

/** Close the actual panel before using the header's lookup door. */
export async function closeShelfTools(page) {
  const toggle = page.locator(SHELF_TOOLS_TOGGLE);
  await toggle.waitFor({ state: 'visible' });
  if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
  await page.locator(SHELF_TOOLS_PANEL).waitFor({ state: 'hidden' });
}

/** Open the panel, then press one of its doors. The tutor's door stands there only once a key is kept (lean pass,
 * 2026-11-22); before that a learner reaches the tutor's room, its setup, from the gate's Tutor row. */
export async function openShelfDoor(page, selector) {
  await openShelfTools(page);
  if (selector === '#ai-link' && !(await page.locator('#ai-link').count())) {
    await page.locator('#bar-gate').click();
    await page.locator('#gate-menu .bubble-sensei').click();
    await page.locator('body[data-view="ai"]').waitFor();
    return;
  }
  await page.locator(selector).click();
}
