import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:4173";

// One full warm visit before any project runs: a cold dev server pays its
// module transforms and the ~18 MB tokenizer dictionary download exactly
// once, here, instead of inside the first tests' 8-second assertion windows
// (where it failed chromium's reader mount and webkit's app-ready check).
export default async function globalSetup(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.locator(".p2-app.ready").waitFor({ timeout: 180_000 });
  await Promise.all([
    page.request.get(`${BASE}/kuromoji/base.dat.gz`),
    page.request.get(`${BASE}/kotobako-static.json`),
  ]).catch(() => undefined);
  await browser.close();
}
