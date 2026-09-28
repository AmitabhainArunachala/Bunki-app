/**
 * PR #77's unmerged UI fixes, re-proved on the fused build (2026-09-28).
 *
 * claude/renkan-round-b-2026-08-18 (PR #77) was never merged, and corridor.js
 * roughly doubled after it. Each probe here reproduces one of that branch's
 * findings in real Chromium on one staged artifact. A fix was ported only
 * where its probe failed on the fused head; the probes of findings that head
 * already answered stay as regression guards. Every probe drives the app's
 * own controls; the only stand-ins are a seeded legacy envelope (the app's
 * migration input) and a stubbed tutor provider.
 *
 * KAIRO_SITE_DIR / KAIRO_ARTIFACT_SHA256 / KAIRO_EVIDENCE_DIR as the other suites.
 * Usage: node verify-pr77-ports.mjs [--only probe,probe]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright-core';
import { CORRIDOR_DIR, startCorridorServer } from './verify-corridor.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';

const OUT = resolveCorridorEvidence();
const VIEWPORT = { width: 390, height: 844 };
const PROVIDER = 'https://pr77-provider.invalid';
const only = (() => {
  const at = process.argv.indexOf('--only');
  return at > 0 ? new Set(String(process.argv[at + 1] || '').split(',').filter(Boolean)) : null;
})();

const results = [];
let failures = 0;
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail) });
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
}

/* ------------------------------------------------------------- fixtures */
const DAY = 86400000;
function card(state, lapses = 0) {
  const due = new Date(Date.now() - DAY).toISOString();
  const last = new Date(Date.now() - 3 * DAY).toISOString();
  return { due, last_review: last, stability: 5, difficulty: 5, elapsed_days: 2, scheduled_days: 2,
    reps: 4 + lapses, lapses, learning_steps: 0, state };
}
/** A legacy envelope — the app's own migration input, never a native write. */
function envelope({ words = ['学校', '電話', '先生', '時間', '天気'], leech = null } = {}) {
  const srs = {};
  for (const w of words) srs[`word:${w}`] = card(2, w === leech ? 8 : 0);
  return {
    v: 1,
    taken: words.map((w, i) => ({ t: 'word', id: w, label: w, ts: 1755000000000 + i, started: 1755000000000 + i })),
    srs,
  };
}
const PROVIDER_CONFIG = { v: 1, baseUrl: PROVIDER, model: 'pr77-probe', credential: { origin: PROVIDER, key: 'pr77-probe-key-never-real' } };

let browser;
let base;
const pageErrors = [];

/** One isolated learner: a fresh context, its own storage, its own stub. */
async function learner({ seed = null, tutor = false, reducedMotion = false, initScript = null } = {}) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    serviceWorkers: 'block',
  });
  await silenceBrowserAudio(context);
  const stub = { mode: 'ok', delay: 0, calls: 0 };
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.origin !== PROVIDER) return route.abort();
    stub.calls += 1;
    const system = String(route.request().postDataJSON()?.system || '');
    if (stub.delay) await new Promise((done) => setTimeout(done, stub.delay));
    try {
      if (stub.mode === 'fail') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"type":"overloaded"}}' });
        return;
      }
      let text = `stub reply ${stub.calls}`;
      if (system.includes('Output ONLY a JSON array')) {
        text = JSON.stringify([1, 2, 3, 4, 5].map((n) => ({ q: `問${n}`, opts: ['a', 'b', 'c', 'd'], right: 0, why: `because ${n}` })));
      } else if (system.includes('reading passage')) {
        text = '朝、学校（がっこう）へ行く。犬（いぬ）と猫（ねこ）を見た。天気（てんき）がいい。友だちと帰る。\n札：犬、猫';
      }
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }) });
    } catch {
      /* the page moved on before the stub answered */
    }
  });
  await context.addInitScript(({ seedJson, providerJson }) => {
    try {
      if (sessionStorage.getItem('pr77-seeded')) return;
      sessionStorage.setItem('pr77-seeded', '1');
      if (seedJson) localStorage.setItem('kairo-corridor-v1', seedJson);
      if (providerJson) localStorage.setItem('kairo-ai-provider-v1', providerJson);
    } catch { /* storage refused: the probe will say so */ }
  }, { seedJson: seed ? JSON.stringify(seed) : null, providerJson: tutor ? JSON.stringify(PROVIDER_CONFIG) : null });
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { context, page, stub };
}

async function open(page, query = '?entry=shelf') {
  await page.goto(`${base}/index.html${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
}
const crumbOf = (page) => page.evaluate(() => document.querySelector('.crumb')?.getAttribute('title') || '');
const settle = (page, ms = 250) => page.waitForTimeout(ms);
/** A repaint the learner can cause at any moment: the interface language, there and back. */
async function repaint(page) {
  for (const lang of ['ja', 'bi']) {
    await page.evaluate((id) => document.querySelector(`#lang button[data-lang="${id}"]`)?.click(), lang);
    await settle(page, 120);
  }
}

/* --------------------------------------------------------------- probes */
const PROBES = {};

/* ea8252a9 — boot stripped the walk sentinel's marker and left its entry
 * standing, so the first device Back after any reload did nothing at all. */
PROBES['eaten-back'] = async () => {
  const { context, page } = await learner();
  await open(page);
  await page.locator('button.shelf-open').first().click();
  await page.waitForSelector('.reader');
  await settle(page, 300);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  await settle(page, 500);
  const before = await page.evaluate(() => ({ view: document.body.dataset.view, length: history.length }));
  await page.goBack().catch(() => null);
  await settle(page, 700);
  const after = await page.evaluate(() => ({
    ready: document.body?.dataset?.ready ?? null, view: document.body?.dataset?.view ?? null, url: location.href,
  })).catch(() => ({ ready: null, view: null, url: null }));
  const answered = after.ready !== '1' || after.view !== before.view;
  check('ea8252a9 · the first Back after a reload is answered, not eaten', answered, JSON.stringify({ before, after }));
  await context.close();
};

/* ea8252a9 — the tutor's quiz wore 本棚 › 小テスト while its only door, and
 * the room its 戻る reopens, is the lists tray. */
PROBES['quiz-crumb'] = async () => {
  const { context, page } = await learner({ seed: envelope(), tutor: true });
  await open(page);
  await page.click('#tray');
  await page.click('#aiq-start');
  await page.waitForSelector('.aiq-q');
  const crumb = await crumbOf(page);
  await page.click('#back');
  await settle(page);
  const backTo = await page.evaluate(() => document.body.dataset.view);
  check('ea8252a9 · the quiz crumb names the lists tray its 戻る reopens',
    /リスト|lists/.test(crumb) && backTo === 'tray', JSON.stringify({ crumb, backTo }));
  await context.close();
};

/* d9f0b984 — the crumb names the room 戻る reopens: a plain review's said
 * 本棚 › 復習 while 戻る opened the tray, and the tray said 本棚 whichever
 * room it was opened from. */
PROBES['crumb-origin'] = async () => {
  const { context, page } = await learner({ seed: envelope() });
  await open(page, '');
  await page.waitForSelector('#home-review');
  await page.click('#home-review');
  await page.waitForSelector('#review-start');
  const trayCrumb = await crumbOf(page);
  await page.click('#back');
  await settle(page);
  const trayBack = await page.evaluate(() => document.body.dataset.view);
  check('d9f0b984 · the tray opened from the galaxy names the galaxy, where its 戻る goes',
    /^(銀河|galaxy)/.test(trayCrumb) && trayBack === 'drift', JSON.stringify({ trayCrumb, trayBack }));

  await open(page);
  await page.click('#tray');
  await page.click('#review-start');
  for (let i = 0; i < 8 && !(await page.locator('.close-doors').count()); i += 1) {
    await page.click('#reveal');
    await page.click('.grade.g-good');
    await settle(page, 200);
  }
  await page.waitForSelector('.close-doors');
  const reviewCrumb = await crumbOf(page);
  await page.click('#back');
  await settle(page);
  const reviewBack = await page.evaluate(() => document.body.dataset.view);
  check('d9f0b984 · a plain review names the lists tray its 戻る reopens',
    /(リスト|lists).*(復習|review)/.test(reviewCrumb) && reviewBack === 'tray', JSON.stringify({ reviewCrumb, reviewBack }));
  await context.close();
};

/** Open one shelf row by id, through its own card (the news door when it sits behind one). */
async function openRow(page, id) {
  const card = page.locator(`[data-passage="${id}"] button.shelf-open`).first();
  if (!(await card.count())) {
    const news = page.locator('button.grammar-link', { hasText: /news readings|ニュースをすべて/ }).first();
    if (await news.count()) await news.click();
  }
  await page.locator(`[data-passage="${id}"] button.shelf-open`).first().click();
  await page.waitForSelector('.reader');
  await settle(page, 300);
  return page.evaluate(() => ({
    eyebrow: document.querySelector('main .eyebrow')?.textContent || '',
    notes: [...document.querySelectorAll('main .note')].map((n) => n.textContent.trim()),
  }));
}

/* d9f0b984 — rows wearing 検収前 offered no reason: the reason block was gated
 * on pendingVerification, which few of them carry. */
PROBES['review-reason'] = async () => {
  const { context, page } = await learner();
  await open(page, '?entry=shelf&ui=bi');
  const freeze = /archive froze/;
  const human = await openRow(page, 'env:press-press_05591');
  check('d9f0b984 · a row marked 検収前 for human review says so, and not with another source\'s story',
    /検収前/.test(human.eyebrow) && human.notes.some((n) => /review/i.test(n) && !freeze.test(n)) && !human.notes.some((n) => freeze.test(n)),
    JSON.stringify(human).slice(0, 400));
  await page.click('#back');
  const rights = await openRow(page, 'yasashii:1');
  check('d9f0b984 · a row held for its rights names that reason, not the Wikinews archive freeze',
    /検収前/.test(rights.eyebrow) && rights.notes.some((n) => /terms|rights|licen/i.test(n)) && !rights.notes.some((n) => freeze.test(n)),
    JSON.stringify(rights).slice(0, 400));
  await page.click('#back');
  const approved = await openRow(page, 'bunki-graded-n3-zoka-sanjin-morning');
  check('d9f0b984 · an approved row carries no pending note (negative control)',
    !/検収前/.test(approved.eyebrow) && !approved.notes.some((n) => /pending/i.test(n)),
    JSON.stringify(approved).slice(0, 300));
  await context.close();
};

/* f7cd297c — the sources fold that claims to state everything omitted UniDic
 * and fugashi, though every reading and part-of-speech tag passes through them. */
PROBES['unidic-credit'] = async () => {
  const { context, page } = await learner();
  await open(page, '?entry=shelf&ui=bi');
  await page.locator('button', { hasText: /sources & licences|出典と licence/ }).first().click();
  await settle(page);
  const fold = await page.evaluate(() => [...document.querySelectorAll('main .note')].map((n) => n.textContent).join(' '));
  const at = fold.indexOf('UniDic');
  check('f7cd297c · the sources fold credits UniDic and fugashi',
    /UniDic/.test(fold) && /fugashi/.test(fold), at < 0 ? `no UniDic in ${fold.length} chars of the fold` : fold.slice(at, at + 160));
  await context.close();
};

/* 1398bc2c — grammatical affixes (第, 中, 国, 日…) were announced as proper
 * names because the name door was blind to part of speech. */
const WIKINEWS_1403 = JSON.parse(readFileSync(resolve(CORRIDOR_DIR, 'data/articles/wikinews-1403.json'), 'utf8'));
PROBES['affix-name'] = async () => {
  const { context, page } = await learner();
  await open(page, '?entry=shelf&ui=bi');
  await openRow(page, 'wikinews:1403');
  const affixes = WIKINEWS_1403.tokens.flatMap((token, index) => (['接尾辞', '接頭辞'].includes(token.p) && /[一-鿌]/.test(token.s) ? [index] : [])).slice(0, 12);
  const labels = await page.evaluate((indexes) => indexes.map((i) => {
    const node = document.querySelector(`.reader [data-index="${i}"]`);
    return { i, text: node?.textContent || null, label: node?.getAttribute('aria-label') || '' };
  }), affixes);
  check('1398bc2c · no grammatical affix is announced as a proper name',
    labels.length > 0 && labels.every((row) => !/名前|\bname\b/i.test(row.label)),
    JSON.stringify(labels.slice(0, 4)));
  await context.close();
};

/* 1398bc2c — the 文節 rule was blind to part of speech: it shattered dates
 * ([2005] [年7] [月14…]) and split 第29回; PR #77 also found it moving with the
 * ふりがな dial. Both dials must leave the same phrases. */
async function phrasesAt(page, dials) {
  await open(page, `?entry=shelf&ui=bi&dials=${dials}`);
  await openRow(page, 'wikinews:1403');
  const groups = await page.evaluate(() => [...document.querySelectorAll('.reader .bunsetsu')].slice(0, 16)
    .map((group) => [...group.querySelectorAll('[data-index]')].map((node) => Number(node.dataset.index))));
  return groups.map((indexes) => indexes.map((i) => WIKINEWS_1403.tokens[i]?.s ?? '?').join(''));
}
PROBES['bunsetsu'] = async () => {
  const { context, page } = await learner();
  const tap = await phrasesAt(page, '0,1,2');
  const always = await phrasesAt(page, '0,2,2');
  check('1398bc2c · the 文節 phrases do not move with the ふりがな dial',
    tap.length > 0 && JSON.stringify(tap) === JSON.stringify(always), `${tap.slice(0, 6).join(' | ')} ⇄ ${always.slice(0, 6).join(' | ')}`);
  const whole = ['2005年', '7月', '14日、'];
  check('1398bc2c · a date holds together as its own phrases: 2005年 · 7月 · 14日、',
    whole.every((phrase) => tap.includes(phrase)), tap.slice(0, 5).join(' | '));
  check('1398bc2c · 開催中の and 第29回 each stay whole',
    tap.some((p) => p.startsWith('第29回')) && tap.some((p) => p.includes('開催中の')), tap.slice(4, 10).join(' | '));
  await context.close();
};

async function openKanjiSheet(page, kanji) {
  await page.fill('#search', kanji);
  await page.locator(`[data-result="kanji:${kanji}"]`).first().click();
  await page.waitForSelector('#sheet');
  await page.waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'), null, { timeout: 8000 }).catch(() => {});
  await settle(page, 400);
}

/* d9f0b984 — catalog doors on kanji sheets were 20px pills 7px apart, 21px
 * effective, under WCAG 2.5.8. */
PROBES['catalog-doors'] = async () => {
  const { context, page } = await learner();
  await open(page, '?entry=shelf&ui=bi');
  await openKanjiSheet(page, '森');
  const boxes = await page.evaluate(() => [...document.querySelectorAll('#sheet .cat-chip')].map((n) => {
    const r = n.getBoundingClientRect();
    return { t: n.textContent.trim().slice(0, 12), x: r.x, y: r.y, w: Math.round(r.width), h: Math.round(r.height) };
  }));
  const overlap = boxes.some((a, i) => boxes.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  check('d9f0b984 · every catalog door on a kanji sheet is a 44px target, none overlapping',
    boxes.length > 0 && boxes.every((b) => b.w >= 44 && b.h >= 44) && !overlap,
    JSON.stringify(boxes.map((b) => `${b.t} ${b.w}×${b.h}`)));
  await context.close();
};

const CONTRAST_FN = `(node) => {
  const parse = (s) => {
    const values = s.match(/-?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?/gi)?.map(Number) ?? [];
    if (values.length < 3) return null;
    const scale = /^color\\(\\s*srgb/i.test(s) ? 255 : 1;
    return { rgb: values.slice(0, 3).map((v) => Math.max(0, Math.min(255, v * scale))), a: values[3] ?? 1 };
  };
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  let bg = null;
  let opacity = 1;
  for (let n = node; n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (!bg) opacity *= Number(cs.opacity);
    const colour = parse(cs.backgroundColor);
    if (!bg && colour && colour.a >= 0.9) { bg = colour; break; }
  }
  bg ||= parse(getComputedStyle(document.body).backgroundColor) || { rgb: [252, 251, 246], a: 1 };
  const fg = parse(getComputedStyle(node).color);
  const a = fg.a * opacity;
  const seen = fg.rgb.map((v, i) => v * a + bg.rgb[i] * (1 - a));
  const l1 = lum(seen), l2 = lum(bg.rgb);
  return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
}`;
const WORLDS = ['sumi', 'shu', 'iwa', 'rokusho', 'yoru', 'hokusai', 'akafuji', 'nami', 'keyblock', 'hakuu', 'kaku'];

/* d9f0b984 — the half of the EN / 日本語 toggle you are not in sat far under
 * 4.5:1: the language you are not in was near-invisible on every screen. */
PROBES['lang-contrast'] = async () => {
  const { context, page } = await learner();
  const seen = [];
  for (const world of WORLDS) {
    await open(page, '?entry=shelf&ui=bi');
    await page.evaluate((id) => localStorage.setItem('kairo-theme', id), world);
    await open(page, '?entry=shelf&ui=bi');
    seen.push([world, await page.evaluate(`(${CONTRAST_FN})(document.querySelector('#lang button[aria-pressed="false"]'))`)]);
  }
  check('d9f0b984 · the language you are not in reads at 4.5:1 in every world',
    seen.every(([, ratio]) => ratio >= 4.5), seen.map(([world, ratio]) => `${world} ${ratio}`).join(' · '));
  await context.close();
};

/* f7cd297c — the review room's × and … were faint at 0.55 opacity, under
 * 4.5:1; a control a learner must find in order to leave is not decoration. */
PROBES['review-exit-contrast'] = async () => {
  const { context, page } = await learner({ seed: envelope() });
  const seen = [];
  for (const world of WORLDS) {
    await open(page);
    await page.evaluate((id) => localStorage.setItem('kairo-theme', id), world);
    await open(page);
    await page.click('#tray');
    await page.click('#review-start');
    await page.waitForSelector('body.zen .zen-exit');
    const ratios = await page.evaluate(`(() => ['.zen-exit', '.zen-more'].map((sel) => (${CONTRAST_FN})(document.querySelector(sel))))()`);
    seen.push([world, Math.min(...ratios)]);
  }
  check('f7cd297c · the review room\'s × and … read at 4.5:1 in every world',
    seen.every(([, ratio]) => ratio >= 4.5), seen.map(([world, ratio]) => `${world} ${ratio}`).join(' · '));
  await context.close();
};

/* 617cd72f — waking the galaxy by a whole render tore elements out from under
 * whoever was holding them; visibility must drive the drift's seam alone. */
PROBES['wake-no-teardown'] = async () => {
  const { context, page } = await learner();
  const flip = (hidden) => page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { get: () => (h ? 'hidden' : 'visible'), configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => h, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await open(page, '');
  await page.waitForSelector('#drift-layer.active');
  await page.evaluate(() => { window.__pr77Held = [...document.querySelectorAll('#app button')].slice(0, 6); });
  await flip(true);
  const asleep = await page.evaluate(() => !document.querySelector('#drift-layer')?.classList.contains('active'));
  await flip(false);
  await settle(page, 200);
  const galaxy = await page.evaluate(() => ({
    held: window.__pr77Held.length, attached: window.__pr77Held.every((n) => n.isConnected),
    awake: !!document.querySelector('#drift-layer')?.classList.contains('active'),
  }));
  await open(page);
  await page.locator('button.shelf-open').first().click();
  await page.waitForSelector('.reader .tok');
  await settle(page, 800);
  const hold = () => page.evaluate(() => { window.__pr77Held = [...document.querySelectorAll('#app button')].slice(0, 12); });
  const held = () => page.evaluate(() => ({ held: window.__pr77Held.length, attached: window.__pr77Held.every((n) => n.isConnected) }));
  await hold();
  await flip(true);
  await flip(false);
  await settle(page, 200);
  const room = await held();
  // the control: a real repaint DOES detach what was held, so the probe can see a teardown
  await hold();
  await repaint(page);
  const control = await held();
  check('617cd72f · hiding and showing the page sleeps and wakes the galaxy, and tears no room apart',
    asleep && galaxy.awake && galaxy.held > 0 && galaxy.attached && room.held > 0 && room.attached && !control.attached,
    JSON.stringify({ asleep, galaxy, room, repaintControl: control }));
  await context.close();
};

/** Every recorded lesson of a chip group: exactly one pressed, the rest said not to be. */
const oneOfPressed = (rows) => rows.length > 1 && rows.filter((r) => r === 'true').length === 1 && rows.every((r) => r === 'true' || r === 'false');

/* 007479d0 (+ f7cd297c's 文法 filter) — chip groups carried their selection
 * only in a CSS class: 部品, the block lengths, the drill modes, 文法's
 * levels; and the chosen-radical row is a remove control that never said so. */
PROBES['chip-state'] = async () => {
  const { context, page } = await learner({ seed: envelope() });
  await open(page, '?entry=shelf&ui=bi');
  await page.click('#kanjidex-link');
  const part = page.locator('#kdx-partgrid .kdx-part:not([disabled])').first();
  const partText = (await part.textContent()).trim();
  await part.click();
  await settle(page);
  const kdx = await page.evaluate((text) => {
    const grid = [...document.querySelectorAll('#kdx-partgrid .kdx-part')];
    const pressed = grid.find((n) => n.textContent.trim() === text);
    const other = grid.find((n) => n !== pressed && !n.disabled);
    const chosen = document.querySelector('.kdx-chosen .kdx-part');
    return { text, pressed: pressed?.getAttribute('aria-pressed') ?? null, other: other?.getAttribute('aria-pressed') ?? null,
      chosen: chosen?.getAttribute('aria-label') || chosen?.textContent || '',
      lenses: [...document.querySelectorAll('main .kdx-lens')].map((n) => n.getAttribute('aria-pressed')) };
  }, partText);
  check('007479d0 · a chosen 部品 says it is chosen, and the rest say they are not',
    kdx.pressed === 'true' && kdx.other === 'false', JSON.stringify(kdx));
  check('007479d0 · the chosen-radical row names itself a remove control',
    /remove|外す/.test(kdx.chosen), JSON.stringify(kdx.chosen));
  check('007479d0 · 字引\'s lenses state which one is chosen', oneOfPressed(kdx.lenses), JSON.stringify(kdx.lenses));

  await open(page, '?entry=shelf&ui=bi');
  await page.click('#grammar-link');
  await page.waitForSelector('[data-glevel]');
  const levels = await page.evaluate(() => [...document.querySelectorAll('[data-glevel]')].map((n) => n.getAttribute('aria-pressed')));
  check('f7cd297c · 文法\'s level filter states which level it is showing', oneOfPressed(levels), JSON.stringify(levels));

  await open(page, '');
  await page.click('.nav-symbol');
  await page.click('.nav-dojo');
  await page.waitForSelector('.focus-chip');
  const dojo = await page.evaluate(() => ({
    minutes: [...document.querySelectorAll('.focus-chip')].map((n) => n.getAttribute('aria-pressed')),
    modes: [...document.querySelectorAll('.focus-mode')].map((n) => n.getAttribute('aria-pressed')),
  }));
  check('007479d0 · the block lengths and the drill modes state which one is chosen',
    oneOfPressed(dojo.minutes) && oneOfPressed(dojo.modes), JSON.stringify(dojo));
  await context.close();
};

/* 1398bc2c — filter chips in 字引, 文法 and the dojo lobby carry no id and no
 * data-action, so every press dropped the keyboard to <body>. */
PROBES['chip-focus'] = async () => {
  const { context, page } = await learner({ seed: envelope() });
  const pressKeeps = async (selector, index) => {
    const chip = page.locator(selector).nth(index);
    const text = (await chip.textContent()).trim();
    await chip.focus();
    await page.keyboard.press('Enter');
    await settle(page, 300);
    return page.evaluate(({ selector, text }) => {
      const node = document.activeElement;
      return { text, landed: node === document.body ? 'body' : `${node.className} "${node.textContent.trim().slice(0, 16)}"`,
        kept: node !== document.body && node.matches(selector) && node.textContent.trim() === text };
    }, { selector, text });
  };
  await open(page, '?entry=shelf&ui=bi');
  await page.click('#kanjidex-link');
  const part = await pressKeeps('#kdx-partgrid .kdx-part:not([disabled])', 2);
  await open(page, '?entry=shelf&ui=bi');
  await page.click('#grammar-link');
  const level = await pressKeeps('[data-glevel]', 3);
  await open(page, '');
  await page.click('.nav-symbol');
  await page.click('.nav-dojo');
  const minutes = await pressKeeps('.focus-chip', 1);
  check('1398bc2c · pressing a filter chip keeps the keyboard on it (字引 · 文法 · the dojo lobby)',
    part.kept && level.kept && minutes.kept, JSON.stringify({ part, level, minutes }));
  await context.close();
};

/* d9f0b984 — both modal rooms open with focus on their own container, which
 * the trap never treated as inside: one Shift+Tab walked out, and Escape,
 * bound to the room, went dead with it. */
PROBES['focus-trap'] = async () => {
  const { context, page } = await learner();
  await open(page, '?entry=shelf&ui=bi');
  await page.fill('#search', '学校');
  await page.locator('[data-result="word:学校"]').first().click();
  await page.waitForSelector('#sheet .headword');
  await settle(page, 500);
  await page.locator('#sheet .headword').click();
  const sheetFrom = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  await page.keyboard.press('Shift+Tab');
  const sheet = await page.evaluate(() => ({ inside: !!document.getElementById('sheet')?.contains(document.activeElement),
    at: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName }));
  check('d9f0b984 · Shift+Tab from the sheet itself stays inside the sheet', sheet.inside, JSON.stringify({ from: sheetFrom, ...sheet }));

  await open(page, '?entry=shelf&ui=bi');
  await openKanjiSheet(page, '森');
  await page.click('#strokes-door');
  await page.waitForSelector('#stroke-page');
  await page.waitForFunction(() => document.activeElement?.id === 'stroke-page', null, { timeout: 5000 }).catch(() => {});
  const roomFrom = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  await page.keyboard.press('Shift+Tab');
  const room = await page.evaluate(() => ({ inside: !!document.getElementById('stroke-page')?.contains(document.activeElement),
    at: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName }));
  await page.keyboard.press('Escape');
  await settle(page, 400);
  const closed = (await page.locator('#stroke-page').count()) === 0;
  check('d9f0b984 · Shift+Tab from the writing room itself stays inside, and Escape still answers',
    room.inside && closed, JSON.stringify({ from: roomFrom, ...room, escapeClosed: closed }));
  await context.close();
};

async function reachSummary(page) {
  await page.click('#tray');
  await page.click('#review-start');
  for (let i = 0; i < 12 && !(await page.locator('.close-doors').count()); i += 1) {
    await page.click('#reveal');
    await page.click('.grade.g-good');
    await settle(page, 200);
  }
  await page.waitForSelector('.close-doors');
}

/* d9f0b984 — 考え中 lived in a closure on the coach (and the reading room):
 * a repaint killed the spinner, re-armed the door and lost the arriving reply. */
PROBES['thinking-durable'] = async () => {
  const { context, page, stub } = await learner({ seed: envelope(), tutor: true });
  await open(page);
  await reachSummary(page);
  stub.delay = 2500;
  await page.click('#ai-coach');
  await settle(page, 300);
  await repaint(page);
  const during = await page.evaluate(() => ({ door: document.querySelector('#ai-coach')?.disabled ?? null,
    said: document.querySelector('.ai-answer')?.textContent || '' }));
  await page.waitForFunction(() => /stub reply/.test(document.querySelector('.ai-answer')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const after = await page.evaluate(() => document.querySelector('.ai-answer')?.textContent || '');
  check('d9f0b984 · the coach keeps 考え中 and a sealed door across a repaint, and the reply still lands',
    during.door === true && /考え中|thinking/.test(during.said) && /stub reply/.test(after), JSON.stringify({ during, after }));

  stub.delay = 0;
  await open(page, '?entry=shelf&ui=bi');
  await page.click('#airead-link');
  await page.waitForSelector('#airead-make');
  stub.delay = 2500;
  await page.click('#airead-make');
  await settle(page, 300);
  await repaint(page);
  const writing = await page.evaluate(() => ({ door: document.querySelector('#airead-make')?.disabled ?? null,
    note: [...document.querySelectorAll('main .airead-note, main [role="status"]')].map((n) => n.textContent).join(' ') }));
  const landed = await page.waitForSelector('.airead-body', { timeout: 10000 }).then(() => true, () => false);
  check('d9f0b984 · the reading room keeps its writing state across a repaint, and the reading lands',
    writing.door === true && /書いている|Writing/.test(writing.note) && landed, JSON.stringify({ writing, landed }));
  await context.close();
};

/* 007479d0 — a failure is not an assistant turn and is never archived, so a
 * repaint mid-request replaced "could not answer just now" with silence. */
PROBES['failure-line'] = async () => {
  const { context, page, stub } = await learner({ seed: envelope(), tutor: true });
  await open(page, '?entry=shelf&ui=bi');
  await page.fill('#search', '学校');
  await page.locator('[data-result="word:学校"]').first().click();
  await page.waitForSelector('#sheet .ai-ask');
  await settle(page, 500);
  stub.mode = 'fail';
  stub.delay = 1500;
  const ask = async (label, box, withRepaint) => {
    await page.locator('#sheet .ai-ask', { hasText: label }).click();
    await settle(page, 300);
    if (withRepaint) await repaint(page);
    await settle(page, 2600);
    return page.evaluate((sel) => document.querySelector(sel)?.textContent || '', box);
  };
  const plain = await ask('ask the tutor', '#sheet .ai-answer', false);
  const tutor = await ask('ask the tutor', '#sheet .ai-answer', true);
  const examples = await ask('write examples', '#sheet .ai-examples', true);
  check('007479d0 · control: with no repaint the tutor\'s failure line shows', /could not answer/.test(plain), plain.slice(0, 120));
  check('007479d0 · the tutor\'s failure line survives a repaint on both sheet surfaces',
    /could not answer/.test(tutor) && /could not write examples/.test(examples), JSON.stringify({ tutor, examples }).slice(0, 300));
  // the same settle carries a REPLY that lands after the sheet was rebuilt (round B, 3df6ed8f)
  stub.mode = 'ok';
  const reply = await ask('ask the tutor', '#sheet .ai-answer', true);
  check('3df6ed8f · a tutor reply that lands after a repaint still shows on the sheet', /stub reply/.test(reply), reply.slice(0, 120));
  await context.close();
};

/* 007479d0 — ゆっくり governs the living ink's speed; the SVG diagram the room
 * falls back to had no speed term, and under reduced motion nothing moves at
 * all — yet the corner stood reporting itself pressed. */
const NO_LIVING_INK = () => {
  Object.defineProperty(globalThis.Navigator.prototype, 'gpu', { get: () => undefined, configurable: true });
  const canvas = globalThis.HTMLCanvasElement.prototype;
  const getContext = canvas.getContext;
  canvas.getContext = function (type, ...rest) {
    return /webgl|webgpu/i.test(String(type)) ? null : getContext.call(this, type, ...rest);
  };
};
async function openWritingRoom(page) {
  await open(page, '?entry=shelf&ui=bi');
  await openKanjiSheet(page, '森');
  await page.click('#strokes-door');
  await page.waitForSelector('#stroke-page');
}
PROBES['speed-corner'] = async () => {
  const fallback = await learner({ initScript: NO_LIVING_INK });
  const page = fallback.page;
  await openWritingRoom(page);
  await page.waitForFunction(() => document.getElementById('stroke-page')?.dataset.inkReady === 'fallback', null, { timeout: 15000 });
  const writeOnce = () => page.evaluate(() => new Promise((done) => {
    const room = document.getElementById('stroke-page');
    const t0 = performance.now();
    room.querySelector('.stroke-stage').click();
    const poll = () => (room.dataset.state === 'done' ? done(Math.round(performance.now() - t0)) : requestAnimationFrame(poll));
    requestAnimationFrame(poll);
  }));
  const corner = await page.locator('#stroke-speed').count();
  let pace = null;
  if (corner) {
    const normal = await writeOnce();
    await page.click('#stroke-speed');
    const slow = await writeOnce();
    pace = { normal, slow, pressed: await page.locator('#stroke-speed').getAttribute('aria-pressed') };
  }
  check('007479d0 · with no living ink, ゆっくり either governs the writing or is not offered',
    !corner || (pace.pressed === 'true' && pace.slow >= pace.normal * 1.3), JSON.stringify({ living: 'fallback', corner, pace }));
  await fallback.context.close();

  const still = await learner({ reducedMotion: true });
  await openWritingRoom(still.page);
  await still.page.waitForFunction(() => document.getElementById('stroke-page')?.dataset.living === 'still', null, { timeout: 15000 });
  const offered = await still.page.evaluate(() => ({ corner: !!document.getElementById('stroke-speed'),
    slider: !!document.getElementById('stroke-speed-range'), living: document.getElementById('stroke-page')?.dataset.living }));
  check('007479d0 · under reduced motion, where nothing is written over time, no ゆっくり is offered',
    !offered.corner && !offered.slider, JSON.stringify(offered));
  await still.context.close();
};

/* f7cd297c — 休ませる on the session summary never joined the session
 * history, so ひとつ戻す took back something else and left the card asleep. */
PROBES['summary-rest'] = async () => {
  const { context, page } = await learner({ seed: envelope({ words: ['学校', '電話', '先生'], leech: '先生' }) });
  await open(page);
  await reachSummary(page);
  const rest = page.locator('[data-leech-rest="先生"]');
  const listed = await rest.count();
  const before = await readAppRecord(page);
  if (listed) {
    await rest.click();
    await waitForAppRecord(page, (record) => !!record.suspended?.['word:先生'], { description: 'the summary rest' });
    await page.locator('.review-undo').click();
    await settle(page, 600);
  }
  const after = await readAppRecord(page);
  const onSummary = (await page.locator('.close-doors').count()) > 0;
  const gradesKept = JSON.stringify(before.srs) === JSON.stringify(after.srs);
  check('f7cd297c · ひとつ戻す after a summary 休ませる wakes that card, and only that',
    listed === 1 && !after.suspended?.['word:先生'] && onSummary && gradesKept,
    JSON.stringify({ listed, suspended: Object.keys(after.suspended || {}), onSummary, gradesKept }));
  await context.close();
};

/* ------------------------------------------------ the fusion review (2026-09-28)
 * Defects a review of the fused branch found in these ports and their neighbours, each
 * probed the same way: it fails on the build before its fix and passes after. */

/* joyo-dial-marks — 362b6bd5 judged 々, 〆 and ヶ as kanji. The 漢検 table carries none of
 * them, so 常用まで read them as rare and turned 人々 into ひとびと. */
PROBES['joyo-marks'] = async () => {
  const { context, page } = await learner();
  const tokensIn = async (id, indexes) => {
    await open(page, '?entry=shelf&ui=bi&dials=1,0,0');
    await openRow(page, id);
    return page.evaluate((list) => Object.fromEntries(list.map((i) =>
      [i, document.querySelector(`.reader [data-index="${i}"]`)?.textContent ?? null])), indexes);
  };
  const gokajo = await tokensIn('real-gokajo', [54, 68, 78, 135]);
  const radio = await tokensIn('govonline:article-202609-radio-3739', [72, 194]);
  const city = await tokensIn('bunki-essay-n1-city', [32]);
  const kept = [gokajo[135], radio[72], radio[194], city[32]];
  check('joyo-dial-marks · with 常用まで on, 人々 · 国々 · 様々 · 日々 keep their kanji',
    JSON.stringify(kept) === JSON.stringify(['人々', '国々', '様々', '日々']), JSON.stringify(kept));
  check('joyo-dial-marks · control: the rare 綸, 迄 and 倦 are still replaced by their readings',
    gokajo[54] === 'けいりん' && gokajo[68] === 'まで' && gokajo[78] === 'う', JSON.stringify(gokajo));
  await context.close();
};

const PROBE_ORDER = Object.keys(PROBES);

async function main() {
  const served = await startCorridorServer();
  base = served.base;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const identity = JSON.parse(readFileSync(resolve(CORRIDOR_DIR, 'build-identity.json'), 'utf8'));
  console.log(`artifact ${identity.artifactSha256} · ${identity.gitSha}${identity.sourceDirty ? ' (dirty)' : ''}`);
  for (const id of PROBE_ORDER) {
    if (only && !only.has(id)) continue;
    console.log(`\n— ${id}`);
    try {
      await PROBES[id]();
    } catch (error) {
      check(`${id} · the probe ran to its end`, false, String(error?.message || error).split('\n')[0]);
    }
  }
  check('the probes leave no page errors', pageErrors.length === 0, pageErrors.slice(0, 4).join(' | ') || 'clean');
  await browser.close();
  served.server.close();
  const report = { artifactSha256: identity.artifactSha256, gitSha: identity.gitSha, sourceDirty: identity.sourceDirty,
    site: CORRIDOR_DIR, only: only ? [...only] : null, summary: { total: results.length, failed: failures }, results };
  writeFileSync(resolve(OUT, 'pr77-ports.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  console.log(`report → ${resolve(OUT, 'pr77-ports.json')}`);
  return failures ? 1 : 0;
}

main().then((code) => process.exit(code), (error) => {
  console.error(error);
  process.exit(2);
});
