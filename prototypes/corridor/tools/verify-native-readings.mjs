/**
 * Browser acceptance for every one of the 30 added native 本棚 readings.
 *
 * This drives the real served corridor at 390×844 with touch input. Each
 * article is opened from its ordinary `.shelf-item`, then exercises its own
 * JSON load, reader/ruby/paragraphs, text settings, quick look, full entry,
 * completion, bookmark, Back, shelf scroll return, and article-position
 * restoration. No representative-only shortcut and no alternate reader.
 *
 * Usage:
 *   CHROMIUM_PATH=/path/to/chromium node tools/verify-native-readings.mjs
 *   node tools/verify-native-readings.mjs --shots DIR --report FILE
 */

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const REPO = resolve(CORRIDOR, '..', '..');
const VIEWPORT = { width: 390, height: 844 };
const SOURCE = resolve(REPO, 'docs/content/bunki-originals-zoka-sanjin.jsonl');
const DEFAULT_EVIDENCE = resolve(
  REPO,
  'docs/build-evidence/kairo-feel-lock/native-readings',
);
const REFERENCE_SHELF = resolve(REPO, 'docs/prototype/screenshots/14-phase1-shelf-v11.png');
const REFERENCE_READER = resolve(REPO, 'docs/prototype/screenshots/16-phase1-v11-article.png');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
};
const VERIFY_FONTS = {
  '/__verify-fonts/serif.ttf': process.env.VERIFY_SERIF_FONT,
  '/__verify-fonts/sans.ttf': process.env.VERIFY_SANS_FONT,
};

const argValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? resolve(process.argv[index + 1]) : fallback;
};
const shotsDir = argValue('--shots', resolve(DEFAULT_EVIDENCE, 'screenshots'));
const reportPath = argValue(
  '--report',
  resolve(DEFAULT_EVIDENCE, 'browser-verification.json'),
);

const authored = readFileSync(SOURCE, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map(JSON.parse);
const IDS = authored.map((record) => record.id);
const SHOT_IDS = new Set([
  'bunki-graded-n3-zoka-sanjin-morning',
  'bunki-essay-n2-silent-amenominakanushi',
  'bunki-essay-n1-prayer-reality',
]);

const fileSha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function startServer(rootDir) {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const verifyFont = VERIFY_FONTS[pathname];
    if (verifyFont && existsSync(verifyFont)) {
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'font/ttf',
      });
      response.end(readFileSync(verifyFont));
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = resolve(rootDir, relative);
    if (!file.startsWith(rootDir) || !existsSync(file)) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    response.end(readFileSync(file));
  });
  return new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      accept({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function touchAt(page, locator, holdMs = 0) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(35);
  const box = await locator.evaluate((node) => {
    const rect = node.getClientRects()[0] ?? node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (!box?.width || !box?.height) throw new Error('touch target has no rendered box');
  const point = {
    x: box.x + box.width / 2,
    y: box.y + Math.min(box.height / 2, 20),
    radiusX: 6,
    radiusY: 6,
    force: 1,
  };
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  if (holdMs) await page.waitForTimeout(holdMs);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await page.waitForTimeout(90);
}

async function settleReader(page) {
  await page.waitForSelector('#reader .tok', { timeout: 20_000 });
  await page.evaluate(() => {
    window.__nativeReadingTokenCount = -1;
  });
  await page.waitForFunction(
    () => {
      const count = document.querySelectorAll('#reader .tok').length;
      if (count > 0 && count === window.__nativeReadingTokenCount) return true;
      window.__nativeReadingTokenCount = count;
      return false;
    },
    null,
    { polling: 180, timeout: 15_000 },
  );
}

async function openQuickLook(page, preferredIndex = 0) {
  const tokens = page.locator('#reader .tok.content');
  const count = await tokens.count();
  const candidates = [preferredIndex, 0, 1, 2].filter(
    (value, index, values) => value < count && values.indexOf(value) === index,
  );
  for (const index of candidates) {
    await touchAt(page, tokens.nth(index), 560);
    const quick = await page.evaluate(() => {
      const mini = document.getElementById('mini');
      if (!mini) return null;
      return {
        word: mini.querySelector('.mini-word')?.textContent ?? '',
        reading: mini.querySelector('.mini-reading')?.textContent ?? '',
        gloss: mini.querySelector('.mini-gloss')?.textContent ?? '',
      };
    });
    if (quick?.word && quick.gloss && !/語釈なし|no gloss/.test(quick.gloss)) {
      return quick;
    }
    await page.evaluate(() => document.getElementById('mini')?.remove());
  }
  return null;
}

function expectedBaseText(record) {
  return record.tokens.map((token) => token.s).join('');
}

async function renderedBaseText(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#reader .tok')]
      .map((token) => {
        const row = token.querySelector('.tok-word') ?? token;
        const clone = row.cloneNode(true);
        clone.querySelectorAll('rt, .tok-en').forEach((node) => node.remove());
        return clone.textContent ?? '';
      })
      .join(''),
  );
}

const results = [];
const failures = [];
function check(name, pass, detail = '', articleId = null) {
  const row = { name, pass: !!pass, detail: String(detail), articleId };
  results.push(row);
  if (!pass) failures.push(row);
  console.log(`${pass ? ' ok ' : 'FAIL'}  ${articleId ? `${articleId} · ` : ''}${name}${detail ? ` — ${detail}` : ''}`);
}

mkdirSync(shotsDir, { recursive: true });
mkdirSync(dirname(reportPath), { recursive: true });

const index = JSON.parse(readFileSync(resolve(CORRIDOR, 'data/articles/index.json'), 'utf8'));
const rows = new Map(index.articles.map((record) => [record.id, record]));
const bodies = new Map(
  IDS.map((id) => {
    const row = rows.get(id);
    return [id, JSON.parse(readFileSync(resolve(CORRIDOR, 'data/articles', row.file), 'utf8'))];
  }),
);
const wordLayer = JSON.parse(
  readFileSync(resolve(CORRIDOR, 'data/share_alike/words.json'), 'utf8'),
).words;
const dictionaryLayer = JSON.parse(
  readFileSync(resolve(CORRIDOR, 'data/share_alike/dict.json'), 'utf8'),
).words;
const quickTokenIndex = new Map(
  [...bodies].map(([id, body]) => {
    let contentIndex = -1;
    let preferred = 0;
    for (const token of body.tokens) {
      if (!token.c) continue;
      contentIndex += 1;
      if (dictionaryLayer[token.b]?.m?.length || wordLayer[token.b]?.g) {
        preferred = contentIndex;
        break;
      }
    }
    return [id, preferred];
  }),
);

const executablePath = process.env.CHROMIUM_PATH || undefined;
const { server, base } = await startServer(CORRIDOR);
let browser;
try {
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    screen: VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  const noise = [];
  const responses = new Map();
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      noise.push({ kind: `console.${message.type()}`, text: message.text() });
    }
  });
  page.on('pageerror', (error) => noise.push({ kind: 'pageerror', text: String(error) }));
  page.on('requestfailed', (request) =>
    noise.push({
      kind: 'requestfailed',
      text: `${request.url()} ${request.failure()?.errorText ?? ''}`,
    }),
  );
  page.on('response', (response) => {
    responses.set(new URL(response.url()).pathname, response.status());
    if (response.status() >= 400) {
      noise.push({ kind: 'http', text: `${response.url()} → ${response.status()}` });
    }
  });

  await page.goto(`${base}/index.html?entry=shelf&ui=ja&cachebust=${Date.now()}`, {
    waitUntil: 'load',
  });
  await page.waitForFunction(
    () =>
      document.body.dataset.ready === '1' &&
      document.querySelectorAll('.shelf-item').length === 70,
    null,
    { timeout: 30_000 },
  );
  // Minimal CI Chromium images often ship without CJK fonts. These optional
  // test-only files satisfy font names already present in the product's native
  // stack; they neither alter corridor source nor introduce a visual theme.
  if (VERIFY_FONTS['/__verify-fonts/serif.ttf'] && VERIFY_FONTS['/__verify-fonts/sans.ttf']) {
    await page.addStyleTag({
      content: `
        @font-face { font-family: 'Noto Serif JP'; src: url('/__verify-fonts/serif.ttf') format('truetype'); font-weight: 400; }
        @font-face { font-family: 'Noto Sans JP'; src: url('/__verify-fonts/sans.ttf') format('truetype'); font-weight: 400; }
      `,
    });
    await page.evaluate(() => document.fonts.ready);
  }

  check('the one native shelf contains exactly 70 entries', (await page.locator('.shelf-item').count()) === 70);
  const existingStyle = await page.locator('[data-passage="bunki-graded-n3-river"]').evaluate((node) => {
    const style = getComputedStyle(node);
    const title = getComputedStyle(node.querySelector('.shelf-title'));
    const snippet = getComputedStyle(node.querySelector('.shelf-snippet'));
    return {
      className: node.className,
      background: style.backgroundColor,
      border: style.border,
      radius: style.borderRadius,
      titleFamily: title.fontFamily,
      titleSize: title.fontSize,
      snippetClamp: snippet.webkitLineClamp,
    };
  });

  // A shelf screenshot at the boundary between the preserved 40 and additions.
  await page.locator(`[data-passage="${IDS[0]}"]`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(shotsDir, 'shelf-first-added.png') });

  const articleResults = [];
  for (const [position, id] of IDS.entries()) {
    const row = rows.get(id);
    const body = bodies.get(id);
    const authoredRecord = authored[position];
    const beforeNoise = noise.length;
    const item = page.locator(`[data-passage="${id}"]`);
    const shelfState = await item.evaluate((node) => {
      const style = getComputedStyle(node);
      const title = node.querySelector('.shelf-title');
      const snippet = node.querySelector('.shelf-snippet');
      const titleStyle = getComputedStyle(title);
      const snippetStyle = getComputedStyle(snippet);
      return {
        className: node.className,
        title: title?.textContent ?? '',
        source: node.querySelector('.shelf-meta span')?.textContent ?? '',
        licence: [...node.querySelectorAll('.shelf-meta .pool-tag')].map((n) => n.textContent),
        snippet: snippet?.textContent ?? '',
        level: node.querySelector('.level-chip')?.textContent ?? '',
        background: style.backgroundColor,
        border: style.border,
        radius: style.borderRadius,
        titleFamily: titleStyle.fontFamily,
        titleSize: titleStyle.fontSize,
        snippetClamp: snippetStyle.webkitLineClamp,
        forbidden: !!node.querySelector('.draft-tag, [class*="editorial"], [class*="pack"]'),
      };
    });
    const nativeStyle = [
      'className',
      'background',
      'border',
      'radius',
      'titleFamily',
      'titleSize',
      'snippetClamp',
    ].every((key) => shelfState[key] === existingStyle[key]);
    await item.scrollIntoViewIfNeeded();
    await page.waitForTimeout(35);
    const shelfY = await page.evaluate(() => window.scrollY);
    const responsePath = `/data/articles/${row.file}`;

    await touchAt(page, item);
    await settleReader(page);
    await page.waitForTimeout(80);

    const readerShape = await page.evaluate(() => {
      const reader = document.getElementById('reader');
      const style = getComputedStyle(reader);
      return {
        title: document.querySelector('.view-title')?.textContent ?? '',
        source: document.querySelector('main .eyebrow')?.textContent ?? '',
        level: document.querySelector('main .level-chip')?.textContent ?? '',
        tokens: reader?.querySelectorAll('.tok').length ?? 0,
        ruby: reader?.querySelectorAll('ruby rt').length ?? 0,
        paragraphs: reader?.querySelectorAll('.para-break').length ?? 0,
        fontFamily: style.fontFamily,
        lineHeight: style.lineHeight,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    const baseText = await renderedBaseText(page);

    // The same folded settings control exists and changes the real reader.
    if ((await page.locator('.dials').count()) === 0) {
      await touchAt(page, page.locator('#dials-toggle'));
    }
    const dialCount = await page.locator('.dials [data-dial]').count();
    await touchAt(page, page.locator('[data-dial="furigana:2"]'));
    const settingsChanged =
      (await page.locator('[data-dial="furigana:2"]').getAttribute('aria-pressed')) === 'true';

    const quick = await openQuickLook(page, quickTokenIndex.get(id));
    let fullEntry = null;
    if (quick) {
      await touchAt(page, page.locator('#mini .mini-entry'));
      await page.waitForSelector('#sheet .headword', { timeout: 6_000 });
      fullEntry = await page.evaluate(() => ({
        headword: document.querySelector('#sheet .headword')?.textContent ?? '',
        reading: document.querySelector('#sheet .reading')?.textContent ?? '',
        text: document.getElementById('sheet')?.innerText.slice(0, 120) ?? '',
      }));
      // openFull swallows the release click for 700 ms so a long press cannot
      // teleport into the new sheet. Respect the same real-user guard before
      // touching the sheet's own Back control.
      await page.waitForTimeout(720);
      await touchAt(page, page.locator('#sheet-back'));
      await page.waitForSelector('#reader .tok');
    }

    // Completion and exact per-article bookmark are both persisted. Back must
    // return to this shelf location, then reopening must restore the reader.
    await touchAt(page, page.locator('#read-fin'));
    await page.waitForSelector('#read-fin.finished');
    await page.evaluate(() =>
      window.scrollTo(0, Math.min(620, document.body.scrollHeight - innerHeight)),
    );
    await page.waitForTimeout(80);
    const intendedPosition = await page.evaluate(() => Math.round(window.scrollY));
    await touchAt(page, page.locator('#back'));
    await page.waitForSelector(`[data-passage="${id}"]`);
    const returnedShelfY = await page.evaluate(() => window.scrollY);
    const persisted = await page.evaluate((articleId) => {
      const state = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
      return {
        position: state.readerPos?.[articleId] ?? null,
        done: !!state.readDone?.[articleId],
      };
    }, id);
    const completionTag = await page
      .locator(`[data-passage="${id}"] .read-tag`)
      .textContent()
      .catch(() => '');

    await touchAt(page, page.locator(`[data-passage="${id}"]`));
    await settleReader(page);
    await page.waitForTimeout(120);
    const restoredPosition = await page.evaluate(() => Math.round(window.scrollY));

    if (SHOT_IDS.has(id)) {
      await page.screenshot({
        path: join(shotsDir, `${id}-reader.png`),
        fullPage: false,
      });
    }

    const ownFileLoaded = responses.get(responsePath) === 200;
    const pass =
      nativeStyle &&
      !shelfState.forbidden &&
      shelfState.title === row.title &&
      shelfState.source === row.sourceLabel &&
      shelfState.licence.includes('Bunki original') &&
      shelfState.snippet === row.snippet &&
      shelfState.level === row.grading.signals.jreadability.band &&
      readerShape.title === row.title &&
      readerShape.source === row.sourceLabel &&
      readerShape.level === row.grading.signals.jreadability.band &&
      readerShape.tokens === body.tokens.length &&
      readerShape.ruby > 0 &&
      readerShape.paragraphs === body.paras.length &&
      /serif|Mincho|明朝/i.test(readerShape.fontFamily) &&
      parseFloat(readerShape.lineHeight) > 24 &&
      readerShape.overflow <= 0 &&
      baseText === expectedBaseText(body) &&
      dialCount === 9 &&
      settingsChanged &&
      !!quick?.word &&
      !!quick?.gloss &&
      !!fullEntry?.headword &&
      persisted.done &&
      persisted.position === intendedPosition &&
      /読了/.test(completionTag) &&
      Math.abs(returnedShelfY - shelfY) <= 4 &&
      Math.abs(restoredPosition - intendedPosition) <= 4 &&
      ownFileLoaded &&
      noise.length === beforeNoise;

    const detail = `${readerShape.tokens} tokens · ${readerShape.ruby} ruby · ${body.paras.length + 1} paragraphs · bookmark ${intendedPosition}→${restoredPosition}`;
    check('native shelf/reader/lookup/settings/completion/bookmark contract', pass, detail, id);
    articleResults.push({
      id,
      pass,
      shelfState,
      readerShape,
      quick,
      fullEntry,
      ownFileLoaded,
      intendedPosition,
      persistedPosition: persisted.position,
      restoredPosition,
      shelfY,
      returnedShelfY,
      newNoise: noise.slice(beforeNoise),
    });

    await touchAt(page, page.locator('#back'));
    await page.waitForSelector(`[data-passage="${id}"]`);
  }

  check(
    'all 30 article files were served independently',
    IDS.every((id) => responses.get(`/data/articles/${rows.get(id).file}`) === 200),
  );
  check(
    'no request, console, or page errors across the run',
    noise.length === 0,
    noise.slice(0, 8).map((entry) => `${entry.kind}: ${entry.text}`).join(' | '),
  );
  check(
    'all completion and bookmark state survives localStorage',
    await page.evaluate(
      (ids) => {
        const state = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
        return ids.every(
          (id) => state.readDone?.[id] && Number.isFinite(state.readerPos?.[id]),
        );
      },
      IDS,
    ),
  );

  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: 'native-bunki-readings-browser-verification',
        viewport: VIEWPORT,
        touchEmulation: true,
        browser: await browser.version(),
        completedAt: new Date().toISOString(),
        artifactHashes: {
          source: fileSha256(SOURCE),
          editorial: fileSha256(
            resolve(REPO, 'docs/content/bunki-originals-zoka-sanjin.editorial.json'),
          ),
          index: fileSha256(resolve(CORRIDOR, 'data/articles/index.json')),
          manifest: fileSha256(resolve(CORRIDOR, 'data/manifest.json')),
          corridorJs: fileSha256(resolve(CORRIDOR, 'corridor.js')),
          corridorCss: fileSha256(resolve(CORRIDOR, 'corridor.css')),
          standalone: fileSha256(resolve(CORRIDOR, 'corridor-standalone.html')),
          words: fileSha256(resolve(CORRIDOR, 'data/share_alike/words.json')),
          idioms: fileSha256(resolve(CORRIDOR, 'data/share_alike/idioms.json')),
          sem: fileSha256(resolve(CORRIDOR, 'data/proprietary_safe/sem.json')),
          articleFiles: Object.fromEntries(
            IDS.map((id) => [id, fileSha256(resolve(CORRIDOR, 'data/articles', rows.get(id).file))]),
          ),
        },
        visualReferenceEvidence: {
          method: 'native computed-style equality plus retained comparison screenshots; manual visual inspection remains non-pixel-diff',
          references: {
            shelf: { path: 'docs/prototype/screenshots/14-phase1-shelf-v11.png', sha256: fileSha256(REFERENCE_SHELF) },
            reader: { path: 'docs/prototype/screenshots/16-phase1-v11-article.png', sha256: fileSha256(REFERENCE_READER) },
          },
          captures: {
            shelf: { path: 'screenshots/shelf-first-added.png', sha256: fileSha256(join(shotsDir, 'shelf-first-added.png')) },
            n3Reader: {
              path: 'screenshots/bunki-graded-n3-zoka-sanjin-morning-reader.png',
              sha256: fileSha256(join(shotsDir, 'bunki-graded-n3-zoka-sanjin-morning-reader.png')),
            },
            n2Reader: {
              path: 'screenshots/bunki-essay-n2-silent-amenominakanushi-reader.png',
              sha256: fileSha256(join(shotsDir, 'bunki-essay-n2-silent-amenominakanushi-reader.png')),
            },
            n1Reader: {
              path: 'screenshots/bunki-essay-n1-prayer-reality-reader.png',
              sha256: fileSha256(join(shotsDir, 'bunki-essay-n1-prayer-reality-reader.png')),
            },
          },
        },
        articles: articleResults,
        noise,
        results,
        failures: failures.map((row) => row.name),
      },
      null,
      2,
    )}\n`,
  );
  await context.close();
} catch (error) {
  failures.push({ name: 'browser harness', pass: false, detail: String(error) });
  console.error(error);
} finally {
  if (browser) await browser.close();
  server.close();
}

console.log(`\n${results.length - failures.length}/${results.length} browser checks passed`);
console.log(`screenshots → ${shotsDir}`);
console.log(`report → ${reportPath}`);
process.exit(failures.length ? 1 : 0);
