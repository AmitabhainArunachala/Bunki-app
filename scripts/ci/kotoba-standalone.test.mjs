import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'acorn';
import { chromium } from 'playwright-core';
const root = resolve('.');
const python = process.env.BUNKI_CANONICAL_PYTHON || 'python3';
const pins = [
  {
    path: 'decks/kotoba-mine/release/study.html',
    deckId: 'kotoba-mine',
    deckHash: 'b4a17ba4485be4ed1f25ebd24883c4faea331501c6111f0ca2cc6d65a6b0ea8e',
    glossHash: 'c1f8fe807a1ce1c52c303564a468950a320067946877001749580ab9e471ca48',
    pinHash: '86d5e80e04df281692d70edb34afc3ff5e7afba33e960ec0951d80566d57cdc3',
    cards: 503,
  },
  {
    path: 'decks/kotoba-mine/release/study-mcd.html',
    deckId: 'kotoba-mcd',
    deckHash: '6b80d10f4bf8f61dff72db881d6a3d1d21e230a698aaf40d099f92b477c10f43',
    glossHash: '8d36b53579765c26cc17e5609cd00a6611689f5918318e0ff0e3dfdc51123f0b',
    pinHash: '86d5e80e04df281692d70edb34afc3ff5e7afba33e960ec0951d80566d57cdc3',
    cards: 2435,
  },
  {
    path: 'decks/kotoba-mine/release/public/study.html',
    deckId: 'kotoba-mine',
    deckHash: 'f075c037e67e7f79e6752c551e754fd7891cff5ac2428b39f7e2a495aa96fff6',
    glossHash: '145e1ca3150d1b525b0a742404203b72482f3e098e8dd225f0a38c47883fdfc6',
    pinHash: '86d5e80e04df281692d70edb34afc3ff5e7afba33e960ec0951d80566d57cdc3',
    cards: 88,
  },
  {
    path: 'decks/kotoba-mine/release/public/study-mcd.html',
    deckId: 'kotoba-mcd',
    deckHash: '9b285df1de7993dfe3d27c990cf7872c843845f4b29b0aeb6a770107169dc596',
    glossHash: '1a05a487b6584d885bcc08b47f816c9978249e7e91a9a9545f45a1c64beeb72b',
    pinHash: '86d5e80e04df281692d70edb34afc3ff5e7afba33e960ec0951d80566d57cdc3',
    cards: 2003,
  },
];
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function payload(text, key) {
  const marker = `'${key}': `;
  const at = text.indexOf(marker, text.indexOf('window.__CORRIDOR_BUNDLE__ = {'));
  assert(at >= 0, key);
  let quoted = false,
    escape = false,
    depth = 0;
  for (let i = at + marker.length; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && !--depth)
      return JSON.parse(text.slice(at + marker.length, i + 1));
  }
  throw Error(key);
}
const buildCode = `import sys,json\nfrom pathlib import Path\nsys.path.insert(0,str(Path(sys.argv[1])/'decks/kotoba-mine/tools'))\nimport build\nplan=json.loads(Path(sys.argv[2]).read_text())\nif plan.get('corridor'): build.CORRIDOR=Path(plan['corridor'])\nfor row in plan['pages']:\n build.build_study(row['deck'],Path(row['out']),row['gloss'])\n`;
function runBuild(directory, pages, corridor) {
  const plan = join(directory, 'plan.json');
  writeFileSync(plan, JSON.stringify({ pages, corridor }));
  return spawnSync(python, ['-c', buildCode, root, plan], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 2 * 1024 * 1024,
  });
}
function published(pin) {
  const text = readFileSync(join(root, pin.path), 'utf8');
  const deck = payload(text, 'decks/kotoba-mine'),
    gloss = payload(text, 'decks/kotoba-mine/gloss');
  assert.equal(hash(deck), pin.deckHash);
  assert.equal(hash(gloss), pin.glossHash);
  assert.equal(hash(payload(text, 'fsrs-pin')), pin.pinHash);
  assert.equal(deck.words.flatMap((w) => w.cards).length, pin.cards);
  return { text, deck, gloss };
}
function assertClosed(page) {
  const scripts = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  const ast = parse(scripts[0][1], {
    ecmaVersion: 'latest',
    sourceType: 'module',
  });
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    assert(
      !['ImportDeclaration', 'ImportExpression', 'ExportAllDeclaration'].includes(node.type),
      `unclosed module: ${node.type}`,
    );
    if (node.type === 'ExportNamedDeclaration') assert.equal(node.source, null);
    for (const value of Object.values(node))
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
  }
  visit(ast);
  assert(!/<script\b[^>]*\bsrc=/.test(page));
  assert(
    !/@import|url\(\s*["']?(?!data:)[a-z]+:/i.test(
      page.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] || '',
    ),
  );
}
function fixture(directory) {
  const target = join(directory, 'corridor');
  for (const rel of [
    'decks/player/mount.js',
    'decks/player/engine.js',
    'decks/player/player.css',
    'decks/player/shared-mount.mjs',
    'srs-core.mjs',
    'shared-study-content.mjs',
    'vendor/ts-fsrs.mjs',
    'data/fsrs-pin.json',
    'fonts.css',
    'fonts',
    'rooms/motion.css',
  ]) {
    const out = join(target, rel);
    mkdirSync(dirname(out), { recursive: true });
    cpSync(join(root, 'prototypes/corridor', rel), out, { recursive: true });
  }
  return target;
}

test('four generated standalone pages preserve all published payloads and close every module', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kotoba-export-'));
  try {
    const pages = pins.map((pin, i) => ({
      ...published(pin),
      out: join(directory, `${i}.html`),
    }));
    const result = runBuild(directory, pages);
    assert.equal(result.status, 0, result.stderr);
    for (let i = 0; i < pins.length; i++) {
      const text = readFileSync(pages[i].out, 'utf8');
      assertClosed(text);
      assert.equal(hash(payload(text, 'decks/kotoba-mine')), pins[i].deckHash);
      assert.equal(hash(payload(text, 'decks/kotoba-mine/gloss')), pins[i].glossHash);
      assert.equal(hash(payload(text, 'fsrs-pin')), pins[i].pinHash);
      assert.equal(text, pages[i].text, `${pins[i].path} must be regenerated exactly`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const kind of ['missing', 'unknown-static', 'unknown-dynamic'])
  test(`standalone builder refuses ${kind} authored module`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'kotoba-import-negative-'));
    try {
      const corridor = fixture(directory);
      if (kind === 'missing') rmSync(join(corridor, 'decks/player/engine.js'));
      else {
        const mount = join(corridor, 'decks/player/mount.js');
        writeFileSync(join(corridor, 'decks/player/unexpected.mjs'), 'export const value=1;\n');
        writeFileSync(
          mount,
          (kind === 'unknown-static'
            ? "import './unexpected.mjs';\n"
            : "const unexpected = () => import('./unexpected.mjs');\n") +
            readFileSync(mount, 'utf8'),
        );
      }
      const { deck, gloss } = published(pins[0]);
      const out = join(directory, 'page.html');
      const result = runBuild(directory, [{ deck, gloss, out }], corridor);
      assert.notEqual(result.status, 0, `must refuse ${kind}`);
      assert(!existsSync(out), 'must fail before publishing partial output');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

test('all four real offline pages reveal, grade, undo, reload and refuse shared mode without writes', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const pin of pins) {
      const context = await browser.newContext({
        offline: true,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const errors = [],
        requests = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('request', (r) => {
        if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url());
      });
      const url = pathToFileURL(join(root, pin.path)).href;
      await page.goto(url);
      await page.locator('#kp-start').click();
      await page.locator('#kp-reveal').waitFor();
      const key = `bunki-cloze:${pin.deckId}`;
      for (const [grade, rating] of [
        ['again', 1],
        ['hard', 2],
        ['good', 3],
        ['easy', 4],
      ]) {
        const card = await page.locator('[data-card]').first().getAttribute('data-card');
        if (await page.locator('#kp-reveal').count()) await page.locator('#kp-reveal').click();
        await page.locator(`#kp-grade-${grade}`).click();
        await page.waitForFunction(
          (key) =>
            JSON.parse(globalThis.localStorage.getItem(key) || '{"log":[]}').log.length === 1,
          key,
        );
        const saved = await page.evaluate(
          (key) => JSON.parse(globalThis.localStorage.getItem(key)),
          key,
        );
        assert.equal(saved.log[0][0], card);
        assert.equal(saved.log[0][1], rating);
        await page.locator('#kp-undo').click();
        await page.waitForFunction(
          (key) => JSON.parse(globalThis.localStorage.getItem(key)).log.length === 0,
          key,
        );
        assert.equal(await page.locator('[data-card]').first().getAttribute('data-card'), card);
      }
      if (await page.locator('#kp-reveal').count()) await page.locator('#kp-reveal').click();
      await page.locator('#kp-grade-good').click();
      await page.waitForFunction(
        (key) => JSON.parse(globalThis.localStorage.getItem(key)).log.length === 1,
        key,
      );
      const persisted = await page.evaluate((key) => globalThis.localStorage.getItem(key), key);
      await page.reload();
      await page.locator('#kp-start').waitFor();
      assert.equal(
        await page.evaluate((key) => globalThis.localStorage.getItem(key), key),
        persisted,
      );
      assert(
        (await page.evaluate(() => Object.keys(globalThis.localStorage))).every(
          (key) => key.startsWith('bunki-cloze:') || key === 'bunki-srs:answered-today',
        ),
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(requests, []);
      await context.close();
      for (const mode of ['query', 'host']) {
        const blocked = await browser.newContext({ offline: true });
        if (mode === 'host')
          await blocked.addInitScript(() => {
            globalThis.bunkiSharedStudyHost = {};
          });
        const tab = await blocked.newPage();
        const failures = [];
        tab.on('pageerror', (e) => failures.push(e.message));
        await tab.goto(url + (mode === 'query' ? '?sharedStudy=preview' : ''));
        await tab.waitForFunction(
          () =>
            globalThis.document.body.innerText.includes('standalone') ||
            globalThis.document.body.innerText.includes('Standalone'),
        );
        assert.equal(await tab.locator('#kp-start,#kp-reveal,[id^="kp-grade-"]').count(), 0);
        assert.equal(await tab.evaluate(() => globalThis.localStorage.length), 0);
        assert.deepEqual(failures, []);
        await blocked.close();
      }
    }
  } finally {
    await browser.close();
  }
});
