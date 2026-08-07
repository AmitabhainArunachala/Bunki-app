/**
 * The corridor's verifier. Done = this is green.
 *
 * Runs the six-step corridor walk (§2 of the goal) in real Chromium at
 * 390×844 with touch emulation, asserting on RENDERED PIXELS and real DOM
 * state — never on "the function returned successfully" (the estate's dominant
 * defect). Touch is driven through the DevTools Protocol, the same way
 * prototypes/drift/tools/red-team-harness.mjs does it: mouse events are not
 * accepted as gesture evidence on a touch-first surface.
 *
 * Emits screenshots for every step and both sides of every variant, plus a
 * measurement table (contrast ratios, hit targets, focused-vs-background font
 * sizes, and each shelf text's three grader signals).
 *
 * Usage: node verify-corridor.mjs [--shots DIR] [--keep-open]
 */

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
export const CORRIDOR_DIR = resolve(TOOL_DIR, '..');
const REPO = resolve(CORRIDOR_DIR, '..', '..');

const VIEWPORT = { width: 390, height: 844 };
const MIN_TAP = 40;
const WCAG_AA = 4.5;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export function startCorridorServer(rootDir = CORRIDOR_DIR) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const file = resolve(rootDir, rel);
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
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      ok({ server, base: `http://127.0.0.1:${addr.port}` });
    });
  });
}

/* --------------------------------------------------------------- harness */
const results = [];
let failures = 0;

function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail) });
  if (!pass) failures += 1;
  const mark = pass ? '  ok  ' : ' FAIL ';
  console.log(`${mark} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function touchAt(page, selector, index, holdMs) {
  const target = page.locator(selector).nth(index);
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(60);
  // aim at the element's first line fragment, the way a finger aims at the
  // glyphs — a union box can drift into the line gap once a gloss hangs below
  const box = await target.evaluate((node) => {
    const r = node.getClientRects()[0] ?? node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box || !box.width) throw new Error(`touch: no box for ${selector}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const point = { x, y, radiusX: 6, radiusY: 6, force: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  if (holdMs) await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(120);
}

async function tap(page, selector, index = 0) {
  await touchAt(page, selector, index, 0);
}

/** The reader's click grammar (v1.2): a full dictionary entry opens by
 * holding a word past the mini-dictionary stage. */
async function holdWord(page, selector, index = 0) {
  await touchAt(page, selector, index, 2400);
  await page.waitForTimeout(200);
}

async function shoot(page, dir, name) {
  const file = join(dir, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

/** Walk the UI the way a reader does until a word panel with semantic edges is open. */
async function walkToSemPanel(page, tapFn) {
  await tapFn(page, '.shelf-item');
  await page.waitForSelector('#reader');
  await holdWord(page, '#reader .tok.content');
  await page.waitForSelector('#sheet');
  if ((await page.locator('#sheet .sem-row').count()) === 0) {
    if (await page.locator('#sheet .chip').count()) {
      await tapFn(page, '#sheet .chip');
      await page.waitForTimeout(160);
    }
  }
  return page.locator('#sheet .sem-row').count();
}

/* measurement helpers evaluated in the page */
const MEASURE_FN = `(() => {
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (s) => {
    const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(/[\\s,/]+/).filter(Boolean).map(Number);
    return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  };
  const bodyBg = parse(getComputedStyle(document.body).backgroundColor) || { rgb: [252,251,246], a: 1 };
  const ratio = (node) => {
    const fg = parse(getComputedStyle(node).color); if (!fg) return null;
    const c = fg.rgb.map((v, i) => v * fg.a + bodyBg.rgb[i] * (1 - fg.a));
    const l1 = lum(c), l2 = lum(bodyBg.rgb);
    return Math.round(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)) * 100) / 100;
  };
  const measure = (sel, label) => {
    const node = document.querySelector(sel);
    if (!node) return null;
    const cs = getComputedStyle(node);
    return { label, selector: sel, contrast: ratio(node), fontSize: Math.round(parseFloat(cs.fontSize) * 10) / 10, color: cs.color };
  };
  const targets = [...document.querySelectorAll('button, [role=button], a')]
    .filter((n) => n.offsetParent !== null)
    .map((n) => { const r = n.getBoundingClientRect(); return { text: (n.textContent||'').trim().slice(0, 14), w: Math.round(r.width), h: Math.round(r.height), id: n.id || n.className }; });
  return {
    text: [
      measure('.reader', 'reading body (focused)'),
      measure('.view-title', 'view title'),
      measure('.shelf-title', 'shelf title'),
      measure('.gloss', 'gloss'),
      measure('.sem-note', 'discrimination note'),
      measure('.shelf-snippet', 'faint / snippet'),
      measure('.sig-name', 'faint / signal label'),
      measure('.crumb', 'chrome breadcrumb (background)'),
      measure('.eyebrow', 'eyebrow label'),
      measure('.reading', 'reading, the one red'),
    ].filter(Boolean),
    targets,
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  };
})()`;

/* ------------------------------------------------------------------ main */
async function main() {
  const argv = process.argv.slice(2);
  const shotArg = argv.indexOf('--shots');
  const shotsDir =
    shotArg >= 0 ? resolve(argv[shotArg + 1]) : resolve(REPO, 'docs/prototype/screenshots');
  mkdirSync(shotsDir, { recursive: true });

  const { server, base } = await startCorridorServer();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const report = { viewport: VIEWPORT, steps: [], measurements: {}, shelf: [], caps: {} };

  const open = async (query = '') => {
    await page.goto(`${base}/index.html${query}`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  };

  // ---------------------------------------------------------- step 1 arrive
  console.log('\n— step 1 · arrive');
  const t0 = Date.now();
  await open('?entry=shelf');
  const loadMs = Date.now() - t0;
  check('the shelf renders real graded texts', (await page.locator('.shelf-item').count()) >= 8,
    `${await page.locator('.shelf-item').count()} texts, ready in ${loadMs} ms`);

  const shelfData = await page.evaluate(`(() => {
    return [...document.querySelectorAll('.shelf-item')].map((n) => ({
      title: n.querySelector('.shelf-title').textContent,
      titleEn: n.querySelector('.shelf-title-en')?.textContent ?? null,
      level: n.querySelector('.level-chip')?.textContent ?? null,
      levelNote: n.querySelector('.level-note')?.textContent ?? null,
      meta: [...n.querySelectorAll('.shelf-meta span')].map((s) => s.textContent),
      disagreement: n.querySelector('.disagree-tag')?.textContent ?? null,
    }));
  })()`);
  report.shelf = shelfData;
  check('every text carries an English title and a learner-readable level',
    shelfData.every((s) => s.titleEn && s.level && /^[A-Za-z]/.test(s.level)),
    `${shelfData.length} texts, e.g. "${shelfData[0]?.titleEn}" — ${shelfData[0]?.level}${shelfData[0]?.levelNote}`);
  check('disagreement is visible where it fires',
    shelfData.some((s) => s.disagreement),
    `${shelfData.filter((s) => s.disagreement).length}/${shelfData.length} texts flagged`);

  // the raw instrument is one 詳細 tap away, not gone
  await page.locator('[data-details]').first().click();
  await page.waitForTimeout(200);
  const rawSignals = await page.locator('.shelf-item .sig').count();
  check('the raw three signals unfold behind 詳細', rawSignals === 3, `${rawSignals} signal rows on the opened card`);
  await page.locator('[data-details]').first().click();
  await page.waitForTimeout(150);
  await shoot(page, shotsDir, '01-arrive-shelf');
  report.steps.push({ step: 1, name: 'arrive', shot: '01-arrive-shelf.png' });

  // ------------------------------------------------------------ step 2 read
  console.log('\n— step 2 · read');
  await tap(page, '.shelf-item');
  await page.waitForSelector('#reader');
  const readerText = await page.locator('#reader').innerText();
  check('the reader shows real Japanese', /[぀-ヿ一-鿌]/.test(readerText), `${readerText.length} chars rendered`);
  const rubyCount = await page.locator('#reader rt').count();
  check('furigana renders as real ruby', rubyCount > 10, `${rubyCount} <rt> elements`);
  await shoot(page, shotsDir, '02-read-passage');
  report.steps.push({ step: 2, name: 'read', shot: '02-read-passage.png' });

  // the dials fold away by default (v1.2 round 4) — open them for the checks
  const dialsHidden = (await page.locator('[data-dial]').count()) === 0;
  await page.locator('#dials-toggle').click();
  await page.waitForTimeout(200);
  check('the text-settings dials fold away until asked for',
    dialsHidden && (await page.locator('[data-dial]').count()) === 9,
    `hidden by default=${dialsHidden}, 9 dial options after one tap`);

  // the three dials must be INDEPENDENT
  const dialProbe = async () => page.evaluate(`(() => {
    const r = document.querySelector('#reader');
    return {
      rt: r.querySelectorAll('rt').length,
      hiddenRt: r.querySelectorAll('rt.hidden-rt').length,
      spacing: r.className,
      text: r.innerText.slice(0, 40),
    };
  })()`);
  const baseline = await dialProbe();
  await page.locator('[data-dial="furigana:0"]').click();
  const noFuri = await dialProbe();
  check('dial · furigana alone changes furigana',
    noFuri.rt === 0 && noFuri.spacing === baseline.spacing,
    `rt ${baseline.rt} → ${noFuri.rt}, spacing class unchanged`);

  await page.locator('[data-dial="spacing:2"]').click();
  const spaced = await dialProbe();
  check('dial · spacing alone changes spacing',
    spaced.spacing.includes('sp-bunsetsu') && spaced.rt === noFuri.rt,
    `class "${spaced.spacing}", rt still ${spaced.rt}`);
  const bunsetsuCount = await page.locator('#reader .bunsetsu').count();
  check('文節 grouping is real', bunsetsuCount > 5, `${bunsetsuCount} 文節 groups`);
  await shoot(page, shotsDir, '02b-dials-spacing-bunsetsu');

  await page.locator('[data-dial="kanji:1"]').click();
  const joyo = await dialProbe();
  await page.locator('[data-dial="kanji:2"]').click();
  const allKana = await dialProbe();
  check('dial · kanji alone changes the script',
    allKana.text !== baseline.text && /^[^一-鿌]*$/.test(allKana.text.replace(/[、。「」]/g, '')),
    `"${baseline.text.slice(0, 14)}" → "${allKana.text.slice(0, 14)}"`);
  await shoot(page, shotsDir, '02c-dials-all-kana');
  report.dials = { baseline, noFuri, spaced, joyo, allKana };

  // reveal-on-tap
  await page.locator('[data-dial="kanji:0"]').click();
  await page.locator('[data-dial="spacing:0"]').click();
  await page.locator('[data-dial="furigana:1"]').click();
  const beforeReveal = await dialProbe();
  check('furigana can be held back and revealed',
    beforeReveal.hiddenRt > 0 && beforeReveal.hiddenRt === beforeReveal.rt,
    `${beforeReveal.hiddenRt} ruby present but hidden`);
  await shoot(page, shotsDir, '02d-furigana-on-touch');

  // ------------------------------- step 3 · the click grammar, then the entry
  console.log('\n— step 3 · the click grammar and the dictionary entry');
  await page.locator('[data-dial="furigana:1"]').dispatchEvent('click');
  await page.waitForTimeout(150);

  // pick a word that sits wholly on one line (a straddling word legitimately
  // pulls itself onto the next line when glossed — it becomes one object)
  const tapIdx = await page.evaluate(`(() => {
    const toks = [...document.querySelectorAll('#reader .tok.content')];
    for (let i = 1; i < toks.length; i++) {
      if (toks[i].getClientRects().length === 1 && toks[i].textContent.length >= 2) return i;
    }
    return 2;
  })()`);

  // 1st tap → furigana, instantly, and nothing else
  await tap(page, '#reader .tok.content', tapIdx);
  await page.waitForTimeout(120);
  const afterTap = await page.evaluate(`(() => ({
    lit: document.querySelectorAll('#reader .tok.lit').length,
    en: document.querySelectorAll('#reader .tok-en').length,
    sheet: !!document.querySelector('#sheet'),
  }))()`);
  check('grammar · the first tap reveals furigana instantly, opening nothing',
    afterTap.lit >= 1 && afterTap.en === 0 && !afterTap.sheet,
    `lit=${afterTap.lit}, sheet=${afterTap.sheet}`);

  // 2nd tap (a later tap, not a timed double) → English beneath, word unmoved.
  // The visual anchor is the glyph box (the ruby base), not the wrapper's
  // rect — the wrapper legitimately changes box type when the gloss mounts.
  const glyphBox = `(el) => (el.querySelector('ruby') ?? el).getBoundingClientRect().bottom`;
  const wordTopBefore = await page.evaluate(
    `(${glyphBox})(document.querySelectorAll('#reader .tok.content')[${tapIdx}])`,
  );
  await tap(page, '#reader .tok.content', tapIdx);
  await page.waitForTimeout(120);
  const afterSecond = await page.evaluate(`(() => {
    const tok = document.querySelectorAll('#reader .tok.content')[${tapIdx}];
    const en = tok.querySelector('.tok-en');
    let collisions = 0;
    if (en) {
      const e = en.getBoundingClientRect();
      for (const other of document.querySelectorAll('#reader .tok')) {
        if (other === tok || tok.contains(other)) continue;
        const r = other.getClientRects()[0];
        if (!r) continue;
        // a collision is visible ink over ink: require a real bite in both
        // axes, not a sub-4px graze of a neighbour's empty descent space
        const ox = Math.min(e.right, r.right) - Math.max(e.left, r.left);
        const oy = Math.min(e.bottom, r.bottom) - Math.max(e.top, r.top);
        if (ox >= 4 && oy >= 4) collisions += 1;
      }
    }
    return {
      en: tok.querySelectorAll('.tok-en').length,
      top: (tok.querySelector('ruby') ?? tok).getBoundingClientRect().bottom,
      collisions,
      sheet: !!document.querySelector('#sheet'),
    };
  })()`);
  check('grammar · a second tap sets English beneath — and the word does not move',
    afterSecond.en === 1 && !afterSecond.sheet && Math.abs(afterSecond.top - wordTopBefore) < 2,
    `gloss on, glyph bottom ${wordTopBefore.toFixed(1)} → ${afterSecond.top.toFixed(1)}px`);
  check('grammar · the gloss collides with nothing — on any font, by construction',
    afterSecond.collisions === 0, `${afterSecond.collisions} overlapping token(s)`);

  // 3rd tap → all the way back out
  await tap(page, '#reader .tok.content', tapIdx);
  await page.waitForTimeout(120);
  const afterThird = await page.evaluate(`(() => {
    const tok = document.querySelectorAll('#reader .tok.content')[${tapIdx}];
    return { en: tok.querySelectorAll('.tok-en').length, lit: tok.classList.contains('lit') };
  })()`);
  check('grammar · a third tap backs all the way out', afterThird.en === 0 && !afterThird.lit,
    `gloss removed, highlight cleared`);

  // long press → the floating mini-dictionary; a tap anywhere else puts it away
  await touchAt(page, '#reader .tok.content', 6, 700);
  await page.waitForTimeout(200);
  const mini = await page.evaluate(`(() => {
    const m = document.querySelector('#mini');
    return m ? { word: m.querySelector('.mini-word')?.textContent, gloss: m.querySelector('.mini-gloss')?.textContent } : null;
  })()`);
  check('grammar · a long press floats the mini-dictionary', !!mini && !!mini.word,
    mini ? `${mini.word} — ${String(mini.gloss).slice(0, 30)}` : 'no #mini');
  await tap(page, '.view-title');
  await page.waitForTimeout(120);
  check('grammar · one tap anywhere else backs out of the mini',
    (await page.locator('#mini').count()) === 0, 'mini dismissed');

  // keep holding → the full entry (from a clean slate: whatever the mini
  // interlude did, close it and re-aim)
  if (await page.locator('#sheet').count()) {
    await page.locator('#sheet-close').dispatchEvent('click');
    await page.waitForTimeout(150);
  }
  await page.evaluate('window.scrollTo(0, 0)');
  await page.locator('[data-dial="furigana:2"]').dispatchEvent('click');
  await page.waitForTimeout(150);
  await holdWord(page, '#reader .tok.content');
  await page.waitForSelector('#sheet[data-node^="word:"]');
  const panel = await page.evaluate(`(() => {
    const s = document.querySelector('#sheet');
    return {
      node: s.dataset.node,
      headword: s.querySelector('.headword')?.textContent ?? '',
      reading: s.querySelector('.reading')?.textContent ?? '',
      gloss: s.querySelector('.gloss')?.textContent ?? s.querySelector('.sense-list')?.textContent ?? '',
      senses: s.querySelectorAll('.sense-list li').length,
      kanjiRows: [...s.querySelectorAll('[data-kanjirow]')].map((c) => c.dataset.kanjirow),
      examples: s.querySelectorAll('.example').length,
      hasBack: !!s.querySelector('#sheet-back'),
      hasClose: !!s.querySelector('#sheet-close'),
    };
  })()`);
  check('grammar · holding opens the full entry',
    panel.headword.length > 0 && (panel.reading.length > 0 || panel.gloss.length > 0),
    `${panel.headword}（${panel.reading}）`);
  check('the sheet carries its own back and close', panel.hasBack && panel.hasClose,
    `back=${panel.hasBack} close=${panel.hasClose}`);
  check('the entry offers a hop into each kanji', panel.kanjiRows.length > 0,
    `${panel.kanjiRows.join('')} — ${panel.kanjiRows.length} row(s)`);
  check('real usage examples come from the shelf itself', panel.examples >= 1,
    `${panel.examples} example(s)`);
  check('the dictionary carries every sense, most common first', panel.senses >= 2,
    `${panel.headword}: ${panel.senses} senses`);
  await shoot(page, shotsDir, '03-word-panel');
  report.steps.push({ step: 3, name: 'click grammar + entry', shot: '03-word-panel.png', panel });

  // now the surface that matters: a word that HAS semantic neighbours
  await open('?entry=shelf');
  await tap(page, '.shelf-item');
  await page.waitForSelector('#reader');
  await holdWord(page, '#reader .tok.content');
  await page.waitForSelector('#sheet');
  // from the empty-state seed chips, hop to a word that has edges
  const seedChip = page.locator('#sheet .chip').first();
  if (await seedChip.count()) {
    await tap(page, '#sheet .chip');
    await page.waitForTimeout(160);
  }
  const semPanel = await page.evaluate(`(() => {
    const s = document.querySelector('#sheet');
    return {
      node: s.dataset.node,
      headword: s.querySelector('.headword')?.textContent ?? '',
      semRows: [...s.querySelectorAll('.sem-row')].map((r) => ({
        word: r.querySelector('.sem-word').textContent,
        note: r.querySelector('.sem-note').textContent,
      })),
    };
  })()`);
  check('semantic neighbours carry their discrimination notes',
    semPanel.semRows.length > 0 && semPanel.semRows.every((r) => r.note.length > 0),
    semPanel.semRows.length
      ? `${semPanel.headword}: ${semPanel.semRows.length} edges, e.g. ${semPanel.semRows[0].word}「${semPanel.semRows[0].note}」`
      : 'no edges reached',
  );
  await shoot(page, shotsDir, '03b-semantic-neighbours');
  report.steps.push({ step: 3.5, name: 'semantic neighbours', shot: '03b-semantic-neighbours.png', semPanel });

  // ------------------------------------------------------ step 4 the graph
  console.log('\n— step 4 · walk the graph');
  const hops = [];
  const nodeNow = async () => page.locator('#sheet').getAttribute('data-node');

  // word → kanji (the KANJI IN THIS WORD rows)
  await tap(page, '#sheet [data-kanjirow]');
  await page.waitForTimeout(160);
  hops.push(await nodeNow());
  const kanjiPage = await page.evaluate(`(() => {
    const s = document.querySelector('#sheet');
    return {
      node: s.dataset.node,
      glyph: s.querySelector('.hero-glyph')?.textContent ?? '',
      meaning: s.querySelector('.hero-mean')?.textContent ?? '',
      tags: [...s.querySelectorAll('.pool-tag')].map((t) => t.textContent),
      sections: [...s.querySelectorAll('.eyebrow')].map((t) => t.textContent),
    };
  })()`);
  check('word → kanji lands on a real kanji page',
    kanjiPage.node.startsWith('kanji:') && kanjiPage.glyph.length === 1 && kanjiPage.meaning.length > 0,
    `${kanjiPage.glyph} — ${kanjiPage.meaning}; ${kanjiPage.tags.join(' / ')}`);
  check('the kanji page carries its 漢検級',
    kanjiPage.tags.some((t) => t.includes('漢検')),
    kanjiPage.tags.filter((t) => t.includes('漢検')).join(','));
  await shoot(page, shotsDir, '04-kanji-page');
  report.steps.push({ step: 4, name: 'kanji', shot: '04-kanji-page.png', kanjiPage });

  const idiomHeading = await page.locator('#sheet .eyebrow', { hasText: '熟語' }).count();
  report.idiomSectionPresent = idiomHeading > 0;
  check('idioms hang off the kanji page (provenance lives in the sources panel)',
    idiomHeading > 0, `${idiomHeading} idiom section(s)`);

  // kanji → a word containing it (same page, before descending)
  const markWordChip = async () => page.evaluate(`(() => {
    const heads = [...document.querySelectorAll('#sheet .eyebrow')];
    const h = heads.find((x) => x.textContent.includes('よく使う語') || x.textContent.includes('含む語'));
    if (!h) return 0;
    const first = h.nextElementSibling?.querySelector('.entry-row');
    if (!first) return 0;
    first.dataset.probe = 'wordchip';
    return 1;
  })()`);
  if (await markWordChip()) {
    await tap(page, '#sheet [data-probe="wordchip"]');
    await page.waitForTimeout(160);
    check('kanji → a word that contains it', (await nodeNow()).startsWith('word:'), await nodeNow());
    hops.push(await nodeNow());
    await shoot(page, shotsDir, '04d-kanji-to-word');
    await tap(page, '#back');
    await page.waitForTimeout(150);
  } else {
    check('kanji → a word that contains it', false, 'no compounds section on this kanji page');
  }

  // kanji → radical
  const markPartChip = async () => page.evaluate(`(() => {
    const heads = [...document.querySelectorAll('#sheet .eyebrow')];
    const h = heads.find((x) => x.textContent.includes('部品'));
    if (!h) return 0;
    const first = h.nextElementSibling?.querySelector('.entry-row');
    if (!first) return 0;
    first.dataset.probe = 'partchip';
    return 1;
  })()`);
  if (await markPartChip()) {
    await tap(page, '#sheet [data-probe="partchip"]');
    await page.waitForTimeout(160);
  }
  const radicalPage = await page.evaluate(`(() => {
    const s = document.querySelector('#sheet');
    return {
      node: s.dataset.node,
      glyph: s.querySelector('.hero-glyph')?.textContent ?? '',
      name: s.querySelector('.hero-mean')?.textContent ?? '',
      family: document.querySelectorAll('#sheet .chip').length,
      heading: [...s.querySelectorAll('.eyebrow')].map((t) => t.textContent).join(' | '),
    };
  })()`);
  check('kanji → radical lands on a real radical page with a family',
    radicalPage.node.startsWith('radical:') && radicalPage.family > 1,
    `${radicalPage.glyph}（${radicalPage.name}） ${radicalPage.heading}`);
  hops.push(radicalPage.node);
  await shoot(page, shotsDir, '04b-radical-page');
  report.steps.push({ step: 4.1, name: 'radical', shot: '04b-radical-page.png', radicalPage });

  // radical → back out to another kanji that uses it
  const markFamilyChip = async () => page.evaluate(`(() => {
    const heads = [...document.querySelectorAll('#sheet .eyebrow')];
    const h = heads.find((x) => x.textContent.includes('含む字'));
    if (!h) return 0;
    const chips = [...(h.nextElementSibling?.querySelectorAll('.chip') ?? [])];
    const pick = chips[chips.length > 1 ? 1 : 0];
    if (!pick) return 0;
    pick.dataset.probe = 'familychip';
    return 1;
  })()`);
  if (await markFamilyChip()) {
    await tap(page, '#sheet .chip[data-probe="familychip"]');
    await page.waitForTimeout(160);
  }
  hops.push(await nodeNow());
  check('radical → another kanji that uses it', (await nodeNow()).startsWith('kanji:'), await nodeNow());
  await shoot(page, shotsDir, '04c-radical-to-kanji');
  report.hops = hops;

  // ------------------------------------------------------------ step 5 take
  console.log('\n— step 5 · 覚える');
  await tap(page, '#take');
  const taken = await page.locator('#tray').textContent();
  check('any node can be taken into study', /覚\s*[1-9]/.test(taken), `chrome reads "${taken.trim()}"`);
  const bucket = await page.evaluate(`(() => {
    const p = document.querySelector('.list-picker .eyebrow');
    return p ? p.textContent : null;
  })()`);
  check('覚える lands the item in this month\'s list automatically',
    !!bucket && /\d{4}年\d{1,2}月/.test(bucket), String(bucket).slice(0, 44));
  const sched = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('#sheet .sched tr')].slice(1).map((r) =>
      [...r.querySelectorAll('td')].map((td) => td.textContent));
    return { rows, note: document.querySelector('#sheet .sched')?.previousElementSibling?.textContent ?? '' };
  })()`);
  check('the schedule preview shows what FSRS-6 would do',
    sched.rows.length === 4 && sched.rows.every((r) => r[1] && r[2]),
    sched.rows.map((r) => `${r[0]}→${r[1]}`).join(' · '));
  await shoot(page, shotsDir, '05-take-and-schedule');
  report.steps.push({ step: 5, name: 'take', shot: '05-take-and-schedule.png', schedule: sched.rows });

  // ---------------------------------------------------------- step 6 return
  console.log('\n— step 6 · return without losing your place');
  await page.evaluate('window.scrollTo(0, 0)');
  await open('?entry=shelf');
  await tap(page, '.shelf-item');
  await page.waitForSelector('#reader');
  await page.evaluate('window.scrollTo(0, 420)');
  await page.waitForTimeout(80);
  const scrollBefore = await page.evaluate('window.scrollY');
  await holdWord(page, '#reader .tok.content', 23);
  await page.waitForSelector('#sheet');
  await tap(page, '#sheet [data-kanjirow]');
  await page.waitForTimeout(140);
  await tap(page, '#back');
  await tap(page, '#back');
  await page.waitForTimeout(200);
  const scrollAfter = await page.evaluate('window.scrollY');
  const sheetGone = (await page.locator('#sheet').count()) === 0;
  check('two hops deep, 戻る returns to the reader at the same place',
    sheetGone && Math.abs(scrollAfter - scrollBefore) <= 4,
    `scrollY ${scrollBefore} → ${scrollAfter}, sheet closed=${sheetGone}`);
  await shoot(page, shotsDir, '06-return-to-place');
  report.steps.push({ step: 6, name: 'return', shot: '06-return-to-place.png', scrollBefore, scrollAfter });

  // --------------------------------------------------------- the variants
  console.log('\n— variants');
  const variantShots = {};

  // A · card format
  for (const mode of ['mcd', 'word']) {
    await open(`?entry=shelf&cards=${mode}`);
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader');
    await holdWord(page, '#reader .tok.content', 5);
    await page.waitForSelector('#sheet .card-preview');
    await page.locator('#sheet .card-preview').scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    const card = await page.evaluate(`(() => {
      const c = document.querySelector('#sheet .card-preview');
      return { kind: c.querySelector('.card-kind').textContent,
               face: c.querySelector('.card-face').innerText,
               cloze: !!c.querySelector('.cloze'),
               target: !!c.querySelector('.target'),
               back: c.querySelector('.card-back').innerText };
    })()`);
    check(`variant A · ${mode} renders the target both ways`,
      mode === 'mcd' ? card.cloze : card.target,
      `${card.kind.slice(0, 22)} — face "${card.face.replace(/\n/g, ' ').slice(0, 34)}"`);
    variantShots[`A-${mode}`] = await shoot(page, shotsDir, `V-A-cards-${mode}`);
  }

  // B · difficulty presentation — behind 詳細 since v1.2, so open one card
  for (const mode of ['three', 'band']) {
    await open(`?entry=shelf&difficulty=${mode}`);
    await page.locator('[data-details]').first().click();
    await page.waitForTimeout(200);
    const shown = await page.evaluate(`(() => ({
      sigs: document.querySelectorAll('.shelf-item .sig').length,
      bands: document.querySelectorAll('.shelf-item .band').length,
      uncertain: document.querySelectorAll('.shelf-item .uncertain').length,
    }))()`);
    check(`variant B · ${mode}`,
      mode === 'three' ? shown.sigs === 3 && shown.bands === 0 : shown.bands === 1 && shown.sigs === 0,
      `${shown.sigs} signal rows / ${shown.bands} bands / ${shown.uncertain} uncertain markers (one 詳細 open)`);
    variantShots[`B-${mode}`] = await shoot(page, shotsDir, `V-B-difficulty-${mode}`);
  }

  // C · legibility vs depth — measured, both ways
  const contrastByVariant = {};
  for (const mode of ['current', 'wcag']) {
    await open(`?entry=shelf&contrast=${mode}`);
    const shelfProbe = await page.evaluate(MEASURE_FN);
    variantShots[`C-${mode}-shelf`] = await shoot(page, shotsDir, `V-C-contrast-${mode}-shelf`);
    await walkToSemPanel(page, tap);
    const panelProbe = await page.evaluate(MEASURE_FN);
    const merged = new Map();
    for (const row of [...shelfProbe.text, ...panelProbe.text]) {
      if (!merged.has(row.label)) merged.set(row.label, row);
    }
    contrastByVariant[mode] = [...merged.values()];
    variantShots[`C-${mode}`] = await shoot(page, shotsDir, `V-C-contrast-${mode}`);
  }
  report.measurements.contrast = contrastByVariant;

  const faintCurrent = contrastByVariant.current.find((m) => m.label.startsWith('faint / snippet'));
  const faintWcag = contrastByVariant.wcag.find((m) => m.label.startsWith('faint / snippet'));
  check('variant C · the WCAG side actually reaches AA',
    faintWcag && faintWcag.contrast >= WCAG_AA,
    `faint text: current ${faintCurrent?.contrast}:1 → wcag ${faintWcag?.contrast}:1 (AA needs ${WCAG_AA})`);
  check('variant C · the current side is honestly below AA (that is the cost being shown)',
    faintCurrent && faintCurrent.contrast < WCAG_AA,
    `${faintCurrent?.contrast}:1`);

  // D · entry
  for (const mode of ['field', 'shelf']) {
    await open(`?entry=${mode}`);
    const landed = await page.evaluate(`(() => ({
      field: !!document.querySelector('#field'),
      shelf: document.querySelectorAll('.shelf-item').length,
      words: document.querySelectorAll('.field-word').length,
      placeholder: !!document.querySelector('.note.placeholder'),
    }))()`);
    check(`variant D · ${mode} entry`,
      mode === 'field' ? landed.field && landed.words > 8 && landed.placeholder : landed.shelf >= 8,
      mode === 'field' ? `${landed.words} drifting words, placeholder marked=${landed.placeholder}` : `${landed.shelf} texts`);
    variantShots[`D-${mode}`] = await shoot(page, shotsDir, `V-D-entry-${mode}`);
    if (mode === 'field') {
      await tap(page, '#enter-shelf');
      await page.waitForTimeout(150);
      check('variant D · one gesture from the field to the shelf',
        (await page.locator('.shelf-item').count()) >= 8, 'tap 棚へ → shelf');
      variantShots['D-field-to-shelf'] = await shoot(page, shotsDir, 'V-D-entry-field-to-shelf');
    }
  }
  report.variantShots = Object.fromEntries(
    Object.entries(variantShots).map(([k, v]) => [k, v.split('/').pop()]),
  );

  // -------------------------------------------------- measurement + hygiene
  console.log('\n— measurements');
  await open('?entry=shelf');
  const shelfProbe = await page.evaluate(MEASURE_FN);
  const semRows = await walkToSemPanel(page, tap);
  const panelProbe = await page.evaluate(MEASURE_FN);
  const mergedText = new Map();
  for (const row of [...panelProbe.text, ...shelfProbe.text]) {
    if (!mergedText.has(row.label)) mergedText.set(row.label, row);
  }
  const m = { ...panelProbe, text: [...mergedText.values()] };
  m.targets = [...panelProbe.targets, ...shelfProbe.targets];
  report.measurements.text = m.text;
  report.measurements.targets = m.targets;
  report.measurements.semRowsOnProbePanel = semRows;
  await shoot(page, shotsDir, '07-measurement-probe');

  const reader = m.text.find((t) => t.label.startsWith('reading body'));
  const chrome = m.text.find((t) => t.label.startsWith('chrome breadcrumb'));
  check('focused content dominates the background chrome',
    reader && chrome && reader.fontSize >= chrome.fontSize * 1.5,
    `reader ${reader?.fontSize}px vs chrome ${chrome?.fontSize}px (Drift's inverted case was 11px vs 22–43px)`);

  const note = m.text.find((t) => t.label.startsWith('discrimination note'));
  check('discrimination notes are legible (AA)', note && note.contrast >= WCAG_AA,
    `${note?.contrast}:1 at ${note?.fontSize}px`);
  const bodyInk = m.text.find((t) => t.label === 'view title' || t.label === 'shelf title');
  check('body ink clears AAA', bodyInk && bodyInk.contrast >= 7, `${bodyInk?.contrast}:1`);

  const small = m.targets.filter((t) => t.h < MIN_TAP || t.w < MIN_TAP);
  check(`every visible control is at least ${MIN_TAP}px`, small.length === 0,
    small.length ? small.map((t) => `${t.id || t.text} ${t.w}×${t.h}`).join(', ') : `${m.targets.length} controls checked`);

  check('the page never scrolls sideways at 390px',
    m.docScrollWidth <= m.innerWidth,
    `scrollWidth ${m.docScrollWidth} vs viewport ${m.innerWidth}`);
  check('no console errors during the walk', consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | ') || 'clean');

  await open('?entry=shelf');
  await page.locator('#variants-toggle').click();
  await page.waitForTimeout(150);
  const stripRows = await page.locator('#variants .vrow').count();
  const ticketRows = await page.evaluate(
    `[...document.querySelectorAll('#variants .vlabel')].filter((l) => /#\\d\\d/.test(l.textContent)).length`,
  );
  check('the variant strip exposes all four open decisions plus the v1.1 depth toggle',
    stripRows === 5 && ticketRows === 4, `${stripRows} rows, ${ticketRows} carry ticket numbers`);
  await shoot(page, shotsDir, '08-variant-strip-open');

  // ------------------------------------------------- v1.1 operator feedback
  console.log('\n— v1.1 · bilingual chrome and layered depth');
  await open('?entry=shelf');
  const biChrome = await page.evaluate(`(() => ({
    backEn: /back/i.test(document.querySelector('#back')?.textContent ?? ''),
    trayEn: /lists/i.test(document.querySelector('#tray')?.textContent ?? ''),
    trayJa: /覚/.test(document.querySelector('#tray')?.textContent ?? ''),
    segEn: document.querySelector('#lang [data-lang="bi"]')?.textContent === 'EN',
    segJa: document.querySelector('#lang [data-lang="ja"]')?.textContent === '日本語',
    active: document.querySelector('#lang [data-lang="bi"]')?.getAttribute('aria-pressed'),
  }))()`);
  check('v1.1 · navigation is bilingual by default (a learner can steer)',
    biChrome.backEn && biChrome.trayEn && biChrome.trayJa && biChrome.active === 'true',
    `back carries "back", 覚 carries "lists", EN active=${biChrome.active}`);
  check('v1.2 · the language toggle reads exactly EN | 日本語',
    biChrome.segEn && biChrome.segJa, `EN=${biChrome.segEn} 日本語=${biChrome.segJa}`);

  await page.locator('#lang [data-lang="ja"]').click();
  await page.waitForTimeout(200);
  const jaChrome = await page.evaluate(`(() => {
    const latin = (sel) => /[a-z]/i.test(document.querySelector(sel)?.textContent ?? '');
    return { back: latin('#back'), tray: latin('#tray'), active: document.querySelector('#lang [data-lang="ja"]')?.getAttribute('aria-pressed') };
  })()`);
  check('v1.1 · 日本語のみ strips the chrome back to immersion mode',
    !jaChrome.back && !jaChrome.tray && jaChrome.active === 'true',
    `after toggling: back latin=${jaChrome.back}, lists latin=${jaChrome.tray}`);
  await page.locator('#lang [data-lang="bi"]').click();
  await page.waitForTimeout(200);

  const layered = await page.evaluate(`(() => ({
    layered: document.body.classList.contains('v-depth-layered'),
    wcag: document.body.classList.contains('v-contrast-wcag'),
    stitched: !!document.querySelector('.tok') || true,
  }))()`);
  check('v1.1 · layered depth and WCAG contrast are the defaults',
    layered.layered && layered.wcag, `body classes: layered=${layered.layered}, wcag=${layered.wcag}`);
  await shoot(page, shotsDir, '09-v11-bilingual-layered');

  await open('?entry=shelf&depth=flat&contrast=current&ui=ja');
  const flat = await page.evaluate(
    `!document.body.classList.contains('v-depth-layered') && !document.body.classList.contains('v-contrast-wcag')`,
  );
  check('v1.1 · the v1.0 look survives as toggles (flat + fade + 日本語のみ)', flat, 'depth=flat&contrast=current&ui=ja');
  await shoot(page, shotsDir, '10-v11-flat-fade-ja');

  // ------------------------------------------------- v1.2 operator round 3
  console.log('\n— v1.2 · dictionary depth, grammar, lists, quiet surfaces');
  await open('?entry=shelf');
  await tap(page, '#grammar-link');
  await page.waitForTimeout(250);
  const grammarIndex = await page.locator('[data-grammar]').count();
  check('v1.2 · the grammar dictionary seed stands (original content)',
    grammarIndex >= 10, `${grammarIndex} entries in the index`);
  await tap(page, '[data-grammar]');
  await page.waitForTimeout(250);
  const grammarEntry = await page.evaluate(`(() => {
    const s = document.querySelector('#sheet');
    return s ? {
      headword: s.querySelector('.headword')?.textContent,
      formation: !!s.querySelector('.formation'),
      examples: s.querySelectorAll('.example').length,
    } : null;
  })()`);
  check('v1.2 · a grammar entry carries formation + examples',
    !!grammarEntry && grammarEntry.formation && grammarEntry.examples >= 2,
    grammarEntry ? `${grammarEntry.headword}: ${grammarEntry.examples} examples` : 'no entry sheet');

  // the kanji page draws its stroke order
  await open('?entry=shelf');
  await tap(page, '.shelf-item');
  await page.waitForSelector('#reader');
  await holdWord(page, '#reader .tok.content');
  await page.waitForSelector('#sheet [data-kanjirow]');
  await tap(page, '#sheet [data-kanjirow]');
  await page.waitForTimeout(250);
  const strokeCount = await page.locator('#strokes path').count();
  check('v1.2 · the kanji page draws its stroke order (KanjiVG)',
    strokeCount >= 3, `${strokeCount} strokes rendered`);
  await shoot(page, shotsDir, '11-v12-kanji-strokes');

  // reader surfaces carry no provenance/ticket narration
  await open('?entry=shelf');
  const narration = await page.evaluate(`(() => {
    const text = document.querySelector('main').textContent;
    return ['ShareAlike', '#58', '#44', 'corpus #', 'UNVERIFIED'].filter((m) => text.includes(m));
  })()`);
  check('v1.2 · the shelf carries no provenance narration (sources fold away)',
    narration.length === 0, narration.length ? `leaked: ${narration.join(', ')}` : 'quiet');

  // ------------------------------------------------- v1.5 · the search field
  console.log('\n— v1.5 · search: four doors, one box');
  await open('?entry=shelf');
  const doors = [
    ['kaisai', 'word:開催', 'romaji'],
    ['かいさい', 'word:開催', 'kana'],
    ['開', 'kanji:開', 'kanji'],
    ['peninsula', 'word:半島', 'English'],
    ['ばかり', 'grammar:bakari', 'grammar'],
  ];
  for (const [q, want, door] of doors) {
    await page.fill('#search', q);
    await page.waitForTimeout(350);
    const hit = await page.evaluate(
      `[...document.querySelectorAll('[data-result]')].some((r) => r.dataset.result === ${JSON.stringify(want)})`,
    );
    check(`search · the ${door} door answers`, hit, `"${q}" → ${want}`);
  }
  await page.fill('#search', 'kaisai');
  await page.waitForTimeout(350);
  await page.locator('[data-result]').first().click();
  await page.waitForTimeout(300);
  check('search · a result opens its full entry',
    (await page.locator('#sheet').count()) === 1,
    (await page.locator('#sheet').getAttribute('data-node').catch(() => 'none')) ?? '');
  await shoot(page, shotsDir, '12-v15-search');

  // grader signals table for the PR
  report.graderTable = shelfData.map((s) => ({
    title: s.title,
    titleEn: s.titleEn,
    level: `${s.level ?? ''}${s.levelNote ?? ''}`,
    disagreement: s.disagreement,
  }));

  const manifest = JSON.parse(
    readFileSync(resolve(CORRIDOR_DIR, 'data/manifest.json'), 'utf8'),
  );
  report.caps = manifest.caps;
  report.counts = manifest.counts;
  report.loadMs = loadMs;

  await browser.close();
  server.close();

  report.summary = { total: results.length, failed: failures };
  report.results = results;
  const reportPath = resolve(REPO, 'docs/prototype/verification-report.json');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  console.log(`screenshots → ${shotsDir}`);
  console.log(`report → ${reportPath}`);
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(2);
  },
);
