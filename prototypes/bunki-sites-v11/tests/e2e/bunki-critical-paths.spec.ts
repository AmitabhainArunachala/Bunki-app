import { expect, test, type Locator, type Page } from "@playwright/test";

const mockLocalState = async (page: Page): Promise<void> => {
  await page.route("**/api/state**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        state: null,
        revision: 0,
        localOnly: true,
        hasState: false,
        syncScope: null,
      }),
    });
  });
  await page.route("**/api/reading-feed", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "live-e2e",
            title: "テスト用の読みやすい記事",
            url: "https://www.nippon.com/ja/test",
            summary:
              "これは出版社のフィードに含まれるテスト用の記事本文です。読者が安心して操作を確認できるように、十分な長さの日本語を用意しています。".repeat(
                8,
              ),
            publishedAt: "2026-07-30T00:00:00.000Z",
            sourceName: "E2E Publisher",
            level: "N2",
            lane: "news",
            domain: "www.nippon.com",
            readerStatus: "publisher-feed-text",
          },
        ],
        sources: [
          {
            id: "e2e",
            name: "E2E Publisher",
            homepage: "https://www.nippon.com/ja/",
            domain: "www.nippon.com",
            lane: "news",
            level: "N2",
            articleCount: 1,
            available: true,
          },
        ],
      }),
    });
  });
  await page.route("**/api/article-import", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        title: "テスト用の読みやすい記事",
        text: "山道を歩いていると、同じ言葉が違う景色の中で何度も現れます。分からなかった表現も、文脈と一緒に読み直すと少しずつ自分の言葉になります。".repeat(
          14,
        ),
      }),
    });
  });
};

const finishOnboarding = async (page: Page): Promise<void> => {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^N2/ }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog
    .getByRole("button", {
      name: /N2.*内容は理解できたものの/,
    })
    .click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "News" }).click();
  await dialog.getByRole("button", { name: "Build my path" }).click();
  await dialog.getByRole("button", { name: "Enter Bunki" }).click();
  await expect(dialog).toBeHidden();
};

const openImmersionShelf = async (page: Page): Promise<void> => {
  const mobileButton = page
    .locator(".p2-mobile-nav button")
    .filter({ hasText: "Immerse" });
  if (await mobileButton.isVisible()) {
    await mobileButton.click();
    return;
  }
  await page
    .locator(".p2-sidebar nav")
    .getByRole("button", { name: /Immerse/ })
    .click();
};

test.beforeEach(async ({ page }) => {
  await mockLocalState(page);
  await page.goto("/");
  await expect(page.locator(".p2-app.ready")).toBeVisible();
  await finishOnboarding(page);
});

test("built-in card opens a centered Zen reader and Back restores the shelf", async ({
  page,
}) => {
  await openImmersionShelf(page);
  await page.getByRole("button", { name: /Read 山を歩きながら考えたこと/ }).click();

  await expect(page.locator(".p2-reader")).toContainText("山道を長く歩いていると");
  await expect(page.locator(".p2-zen-back")).toBeVisible();
  await expect(page.locator(".p2-zen-dock")).toBeVisible();

  const geometry = await page.locator(".p2-reader").evaluate((reader) => {
    const rect = reader.getBoundingClientRect();
    return {
      left: rect.left,
      right: window.innerWidth - rect.right,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(Math.abs(geometry.left - geometry.right)).toBeLessThanOrEqual(2);
  expect(geometry.overflow).toBeLessThanOrEqual(0);

  await page.locator(".p2-zen-back").click();
  await expect(page.getByRole("heading", { name: "Pick up where you left off" })).toBeVisible();
});

test("a live card imports a non-empty body and its explicit Back works", async ({
  page,
}) => {
  await openImmersionShelf(page);
  await page.getByRole("button", { name: /Read テスト用の読みやすい記事/ }).click();
  await expect(page.locator(".p2-reader")).toContainText("山道を歩いていると");
  await expect(page.locator(".p2-reader").getByText("テスト用の読みやすい記事")).toHaveCount(0);
  await page.locator(".p2-zen-back").click();
  await expect(page.getByTestId("live-library")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Read テスト用の読みやすい記事/ }),
  ).toBeVisible();
});

test("Zen appearance opens and collapses without moving the article", async ({
  page,
}) => {
  await openImmersionShelf(page);
  await page.getByRole("button", { name: /Read 山を歩きながら考えたこと/ }).click();
  await page.locator(".p2-zen-dock").click();
  await expect(page.getByRole("complementary", { name: "Reading appearance" })).toBeVisible();
  await page.getByRole("button", { name: "Close reading appearance" }).click();
  await expect(page.getByRole("complementary", { name: "Reading appearance" })).toBeHidden();
  await expect(page.locator(".p2-reader")).toContainText("山道を長く歩いていると");
});

test("browser Back returns from reader instead of leaving Bunki", async ({
  page,
}) => {
  await openImmersionShelf(page);
  await page.getByRole("button", { name: /Read 山を歩きながら考えたこと/ }).click();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Pick up where you left off" })).toBeVisible();
  await expect(page.locator(".p2-app.ready")).toBeVisible();
});

test("a reader word opens its full entry and each kanji one layer deeper", async (
  { page },
  testInfo,
) => {
  test.setTimeout(60_000);
  const sentence =
    "山道を長く歩いていると、考えを言葉にする速度が少しずつ落ちていく。";
  const activate = async (target: Locator): Promise<void> => {
    if (testInfo.project.name.startsWith("mobile-")) {
      await target.tap();
    } else {
      await target.click();
    }
  };

  await openImmersionShelf(page);
  await page
    .getByRole("button", { name: /Read 山を歩きながら考えたこと/ })
    .click();

  const occurrence = page
    .locator(".p2-sentence")
    .filter({ hasText: sentence })
    .first();
  const word = occurrence.getByRole("button", {
    name: /^言葉\. Tap one:/,
  });
  await expect(word).toBeVisible({ timeout: 20_000 });

  await activate(word);
  await expect(word).toHaveClass(/\bdepth-1\b/);
  await expect(word.locator("rt")).toHaveText("ことば");
  await activate(word);
  await expect(word).toHaveClass(/\bdepth-2\b/);
  await expect(word.locator(".p2-word-peek")).toContainText("language");
  await activate(word);

  const detail = page.getByRole("dialog", {
    name: "Word detail for 言葉",
  });
  await expect(detail).toBeVisible();
  await expect(
    detail.getByRole("heading", { name: "言葉", exact: true }),
  ).toBeVisible();
  await expect(detail.locator(".p2-sheet-context")).toContainText(sentence);
  await expect(
    detail.getByRole("button", { name: "Open 言 kanji from 言葉" }),
  ).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Open 葉 kanji from 言葉" }),
  ).toBeVisible();

  await activate(
    detail.getByRole("button", {
      name: "Open full word entry for 言葉",
    }),
  );
  await expect(
    page.getByRole("heading", { name: "言葉", exact: true }),
  ).toBeVisible();
  const dictionaryBack = page
    .getByRole("button")
    .filter({ hasText: "Back to source word" })
    .filter({ hasText: "言葉" });
  await expect(dictionaryBack).toBeVisible();
  await activate(dictionaryBack);

  const restoredFromDictionary = page.getByRole("dialog", {
    name: "Word detail for 言葉",
  });
  await expect(restoredFromDictionary).toBeVisible();
  await activate(
    restoredFromDictionary.getByRole("button", {
      name: "Open 言 kanji from 言葉",
    }),
  );

  await expect(restoredFromDictionary).toBeHidden();
  await expect(page.locator(".p2-app")).toHaveClass(/\bkanji-focus\b/);
  const kanji = page.locator(".p2-kanji-main");
  await expect(
    kanji.getByRole("heading", { name: "言", exact: true }),
  ).toBeVisible();
  await expect(kanji.getByText("say · word", { exact: true })).toBeVisible();
  await expect(kanji.getByText("ゲン、ゴン", { exact: true })).toBeVisible();
  await expect(
    kanji.getByRole("button", { name: "Replay stroke order for 言" }),
  ).toBeVisible();

  const kanjiBack = page.locator(".p2-kanji-reader-return");
  await expect(kanjiBack).toContainText("Back to source word");
  await expect(kanjiBack).toContainText("言葉");
  await activate(kanjiBack);

  const restoredFromKanji = page.getByRole("dialog", {
    name: "Word detail for 言葉",
  });
  await expect(restoredFromKanji).toBeVisible();
  await expect(word).toHaveClass(/\bdepth-3\b/);
  await expect(restoredFromKanji.locator(".p2-sheet-context")).toContainText(
    sentence,
  );
  await activate(
    restoredFromKanji.getByRole("button", {
      name: "Close word detail",
    }),
  );
  await expect(restoredFromKanji).toBeHidden();
  await expect(page.getByTestId("reader-article")).toContainText(sentence);
});
