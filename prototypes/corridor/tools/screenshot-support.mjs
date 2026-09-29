/** Full-page evidence that fits every engine's screenshot limit.
 *
 * WebKit (and Firefox) on Linux and Windows refuse an image taller or wider than
 * 32,767 device pixels: Playwright's validateScreenshotDimension throws "Cannot take
 * screenshot larger than 32767 pixels on any dimension" (Cairo's limit,
 * microsoft/playwright#16727). macOS is exempt, so a local run never shows it; CI does.
 * The shelf passed that height when this week's readings landed (7498ff17).
 *
 * A page within the limit is one ordinary full-page image at `path`. A taller page is
 * kept whole as consecutive tiles: `path`, then `-2.png`, `-3.png` … beside it. Nothing is
 * cropped away and no error is swallowed.
 */
export const SCREENSHOT_LIMIT_PX = 32767;

export async function fullPageScreenshot(page, path) {
  if (!path.endsWith('.png')) throw new Error(`Tiled evidence needs a .png path: ${path}`);
  // the same page box Playwright measures for fullPage
  const { width, height, scale } = await page.evaluate(() => {
    const { body, documentElement: root } = document;
    return {
      width: Math.max(body.scrollWidth, root.scrollWidth, body.offsetWidth, root.offsetWidth, body.clientWidth, root.clientWidth),
      height: Math.max(body.scrollHeight, root.scrollHeight, body.offsetHeight, root.offsetHeight, body.clientHeight, root.clientHeight),
      scale: window.devicePixelRatio || 1,
    };
  });
  const step = Math.floor(SCREENSHOT_LIMIT_PX / scale);
  if (width > step) throw new Error(`Page is ${width}px wide, beyond the ${SCREENSHOT_LIMIT_PX}px screenshot limit`);
  if (height <= step) {
    await page.screenshot({ path, fullPage: true });
    return { paths: [path], pageHeight: height };
  }
  const paths = [];
  for (let y = 0; y < height; y += step) {
    const tile = paths.length ? path.replace(/\.png$/u, `-${paths.length + 1}.png`) : path;
    await page.screenshot({ path: tile, fullPage: true, clip: { x: 0, y, width, height: Math.min(step, height - y) } });
    paths.push(tile);
  }
  return { paths, pageHeight: height };
}
