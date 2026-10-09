/** Reach the entry's visible Close without changing its navigation semantics.
 * First depth uses #sheet-back; nested Close remains the real close-all door. */
export async function entryCloseSelector(page) {
  await page.locator('#sheet').waitFor({ state: 'visible' });
  if (await page.locator('#sheet-close').isVisible()) return '#sheet-close';
  await page.locator('#sheet-back').waitFor({ state: 'visible' });
  return '#sheet-back';
}
