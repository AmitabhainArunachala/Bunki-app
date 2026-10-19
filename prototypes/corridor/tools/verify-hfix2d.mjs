#!/usr/bin/env node
/** Hfix-2d · the word page's parts of speech and kanji keywords in 日本語 and plain English, plus Guided's
 * start box (X-17, X-18, X-3b). Real WebKit 390×844 touch + Chromium 1440×900, browser.version() logged.
 *
 *   P   the seven packet words in both modes: each .sense-pos line is the plain form for the sense's own
 *       tags — JA: the school terms (名詞, 動詞（五段・他動詞）, 動詞（一段・他動詞）, する動詞（他動詞）,
 *       い形容詞, な形容詞, 副詞); EN: one plain line, no parentheses, no romaji ("godan verb, transitive").
 *   K   the word page's kanji rows: in 日本語 a keyword that exists only in English is replaced by the
 *       kanji's own reading (or left out); in EN the keyword stays. Label surfaces (.sense-pos, the rows'
 *       .row-main, .eyebrow) carry no Latin in 日本語 mode beyond the licence identifiers.
 *   G   Guided's start box stays seated: the begin control is inside the first viewport at 390; the field
 *       preview fills the box (no tall empty stretch); on the Mac the arrival keeps the phone's measure.
 *
 * Usage: KAIRO_SITE_DIR=<built site> KAIRO_ARTIFACT_SHA256=<sha> KAIRO_EXPECT_GITSHA=<sha> \
 *          KAIRO_BROWSER=all|webkit|chromium node prototypes/corridor/tools/verify-hfix2d.mjs
 * Controls (page.route, no disk copies): --control pos-revert (base's tag join → P red), --control
 * keyword-revert (English keyword in 日本語 → K red), --control preview-removed (G red).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

const CONTROL = process.argv.includes('--control') ? process.argv[process.argv.indexOf('--control') + 1] : null;
const CONTROLS = new Set(['pos-revert', 'keyword-revert', 'preview-removed', 'baseline-label']);
if (CONTROL && !CONTROLS.has(CONTROL)) throw new Error(`unknown control ${CONTROL}`);
const ENGINES = process.env.KAIRO_BROWSER === 'webkit' ? { webkit } : process.env.KAIRO_BROWSER === 'chromium' ? { chromium } : { webkit, chromium };
const out = resolveCorridorEvidence();
const shots = join(out, 'shots');
mkdirSync(shots, { recursive: true });
const host = await startCorridorDev(0);
const ORIGIN = host.origin;

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const WORDS = [
  { q: '書く', ja: ['動詞（五段・他動詞）'], en: ['godan verb, transitive'], jaCount: 1, enCount: 1, row: { ja: ['か（く）'], en: ['Write'] } },
  { q: '食べる', ja: ['動詞（一段・他動詞）'], en: ['ichidan verb, transitive'], jaCount: 1, enCount: 1, row: { ja: ['た（べる）'], en: ['Eat'] } },
  { q: '勉強', ja: ['名詞', '名詞 · する動詞（他動詞）', '名詞 · する動詞（自動詞）', '名詞 · する動詞（自動詞・他動詞）'],
    en: ['noun', 'noun · suru verb, transitive', 'noun · suru verb, intransitive', 'noun · suru verb, intransitive and transitive'],
    jaCount: 4, enCount: 4, row: { ja: ['ベン', 'キョウ'], en: ['Exertion', 'Strong'] } },
  { q: '高い', ja: ['い形容詞'], en: ['i-adjective'], jaCount: 1, enCount: 1, row: { ja: ['たか（い）'], en: ['Tall'] } },
  { q: '静か', ja: ['な形容詞'], en: ['na-adjective'], jaCount: 1, enCount: 1, row: { ja: ['しず（か）'], en: ['Quiet'] } },
  { q: '本', ja: ['名詞', '接頭辞', '助数詞'], en: ['noun', 'prefix', 'counter'], jaCount: 3, enCount: 3,
    usage: { ja: ['〔スポーツ〕', '〔武道〕'], en: ['sports', 'martial arts'] }, row: { ja: ['ホン'], en: ['Book'] } },
  { q: 'ため', ja: ['名詞 · 副詞'], en: ['noun · adverb'], jaCount: 1, enCount: 1,
    usage: { ja: ['〔ふつうかなで書く〕'], en: ['usually written in kana'] }, entryWide: true, row: { ja: ['ため'], en: ['Do'] } },
  { q: '来る', ja: ['動詞（カ変・自動詞）', '補助動詞（カ変）'], en: ['kuru verb, intransitive', 'kuru subsidiary verb'], row: { ja: ['く（る）'], en: ['Come'] } },
  { q: '見る', ja: ['動詞（一段・他動詞）', '補助動詞（一段）'], en: ['ichidan verb, transitive', 'ichidan subsidiary verb'], row: { ja: ['み（る）'], en: ['See'] } },
  { q: 'ゆっくり', ja: ['副詞', '副詞（と） · する動詞', '副詞 · する動詞'], en: ['adverb', 'to-adverb · suru verb', 'adverb · suru verb'],
    usage: { ja: ['〔擬音語・擬態語〕'], en: ['onomatopoeic or mimetic word'] }, row: { ja: [], en: [] } },
];
const JA_PLAIN = /^[ぁ-ゖァ-ヶー一-鿯々〇〻（）・·０-９ ]+$/u; // no Latin on a JA label: kana, kanji, parens, ・/·, spaces, full-width digits
const EN_PLAIN = /^[a-z][a-z ·,'-]*$/u; // one plain English line, no parentheses, no romaji tags
const ROMAJI = /futsuumeishi|keiyoushi|tokubetsu|jisho|verb \(/iu; // the defect signatures: full entity names, a parenthesised verb class

async function session(browserType, { width, height, ui }) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 500, hasTouch: width < 500,
    serviceWorkers: 'block', reducedMotion: 'no-preference', locale: 'ja-JP' });
  await silenceBrowserAudio(context);
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort()));
  if (CONTROL === 'pos-revert') {
    await context.route('**/corridor.js', async (route) => {
      const text = await (await route.fetch()).text();
      const edited = text.replace('const pos = posLine(partOfSpeech);', 'const pos = partOfSpeech.map(dictionaryTag).join(\' · \');');
      if (edited === text) throw new Error('pos-revert anchor missing');
      return route.fulfill({ body: edited, contentType: 'text/javascript' });
    });
  }
  if (CONTROL === 'keyword-revert') {
    await context.route('**/corridor.js', async (route) => {
      const text = await (await route.fetch()).text();
      const anchor = "const keyword = S.lang === 'ja' ? inWord[charIndex] : D.kanji[c].m;";
      const edited = text.replace(anchor, 'const keyword = D.kanji[c].m;');
      if (edited === text) throw new Error('keyword-revert anchor missing');
      return route.fulfill({ body: edited, contentType: 'text/javascript' });
    });
  }
  if (CONTROL === 'preview-removed' || CONTROL === 'baseline-label') {
    await context.route('**/guided-session.css', async (route) => {
      const text = await (await route.fetch()).text();
      const extra = CONTROL === 'preview-removed'
        ? '\n.gs-arrival > :not(.gs-intro) { display: none !important; }'
        : '\n.gs-button { align-items: baseline !important; }';
      return route.fulfill({ body: `${text}${extra}`, contentType: 'text/css' });
    });
  }
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error).slice(0, 200)));
  return { browser, context, page, pageErrors, close: () => browser.close() };
}

async function wordFacts(page, word, ui) {
  await page.goto(`${ORIGIN}/index.html?entry=drift&room=shelf&ui=${ui}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60_000 });
  await page.locator('#chrome-search').click();
  await page.locator('#nav-search-input').fill(word);
  await page.locator('.nav-search-row').first().waitFor({ timeout: 15_000 });
  await page.locator('.nav-search-row').first().click();
  await page.locator('#sheet').waitFor({ timeout: 15_000 });
  // the full source senses arrive with the detail shard; the core summary shows until then
  await page.locator('#sheet .dictionary-senses').first().waitFor({ timeout: 15_000 }).catch(() => {});
  await sleep(600);
  return page.evaluate(() => ({
    pos: [...document.querySelectorAll('#sheet .sense-pos')].map((n) => n.textContent.trim()),
    usage: [...document.querySelectorAll('#sheet .sense-usage')].map((n) => n.textContent.trim()),
    rows: [...document.querySelectorAll('#sheet [data-kanjirow]')].map((n) => ({ glyph: n.dataset.kanjirow, main: n.querySelector('.row-main')?.textContent.trim() ?? '' })),
    labels: [...document.querySelectorAll('#sheet .eyebrow, #sheet .sense-pos, #sheet .sense-usage, #sheet [data-kanjirow] .row-main')].map((n) => n.textContent.trim()),
  }));
}

async function wordRows(engine, browserType, word) {
  for (const ui of ['ja', 'bi']) {
    const s = await session(browserType, { width: 390, height: 844, ui });
    const facts = await wordFacts(s.page, word.q, ui).catch((error) => ({ error: String(error?.message || error).split('\n')[0] }));
    const lang = ui === 'ja' ? 'ja' : 'en';
    if (facts.error) { check(`P · ${engine} · ${word.q} · ${lang} · the word page opens`, false, facts.error); await s.close(); continue; }
    const want = word[lang];
    if (want) {
      check(`P · ${engine} · ${word.q} · ${lang} · parts of speech in the plain ${lang === 'ja' ? 'school terms' : 'one-line English'}`,
        JSON.stringify([...new Set(facts.pos)].sort()) === JSON.stringify([...want].sort()), facts.pos);
      const wantCount = word[`${lang}Count`];
      if (wantCount) check(`P · ${engine} · ${word.q} · ${lang} · a sense's line prints only when it changes (${wantCount})`,
        facts.pos.length === wantCount, facts.pos);
      for (const line of facts.pos)
        check(`P · ${engine} · ${word.q} · ${lang} · the pos line holds parts of speech only ("${line.slice(0, 30)}")`,
          lang === 'ja' ? !/スポーツ|武道|ふつうかな|通常|丁寧語|擬音語/u.test(line) : !/sports|martial|usually written|polite|onomatopoeic|mimetic/iu.test(line), line);
    }
    if (word.usage) {
      const wantUsage = word.usage[lang];
      const bare = (line) => wantUsage.map((u) => u.replace(/[〔〕]/gu, '')).find((u) => line === u || line === `〔${u}〕` || line.includes(u));
      const matched = [...new Set(facts.usage.map(bare).filter(Boolean))];
      check(`U · ${engine} · ${word.q} · ${lang} · the usage tags sit beside their sense as quiet tags${word.entryWide ? ', once at the entry' : ''}`,
        JSON.stringify(matched.sort()) === JSON.stringify([...wantUsage].map((u) => u.replace(/[〔〕]/gu, '')).sort()) &&
          (lang !== 'ja' || wantUsage.every((u) => facts.usage.includes(u))),
        facts.usage);
      if (word.entryWide) check(`U · ${engine} · ${word.q} · ${lang} · the entry-wide tag shows exactly once`,
        facts.usage.filter(bare).length === 1, facts.usage);
    }
    for (const line of facts.pos) {
      if (lang === 'ja') check(`P · ${engine} · ${word.q} · ja · no Latin in "${line.slice(0, 24)}"`, JA_PLAIN.test(line), line);
      else check(`P · ${engine} · ${word.q} · en · plain, no romaji in "${line.slice(0, 28)}"`, EN_PLAIN.test(line) && !ROMAJI.test(line), line);
    }
    const wantRows = word.row[lang];
    if (wantRows.length || facts.rows.length) {
      check(`K · ${engine} · ${word.q} · ${lang} · the kanji rows read ${lang === 'ja' ? 'the kanji’s own readings (or nothing)' : 'the English keyword'}`,
        JSON.stringify(facts.rows.map((r) => r.main)) === JSON.stringify(wantRows), facts.rows);
      if (lang === 'ja') for (const row of facts.rows) check(`K · ${engine} · ${word.q} · ja · no Latin beside ${row.glyph}`, !/[A-Za-z]/u.test(row.main), row.main);
    }
    if (lang === 'ja') {
      const latin = facts.labels.flatMap((line) => line.match(/[A-Za-z][A-Za-z0-9-]{1,}/gu) || []).filter((token) => !/^(JMdict|EDRDG|CC|BY|SA|JLPT|N[1-5]|Kodansha)$/u.test(token));
      check(`K · ${engine} · ${word.q} · ja · the label surfaces carry no English`, latin.length === 0, latin.slice(0, 8));
    }
    check(`P · ${engine} · ${word.q} · ${lang} · no page error`, s.pageErrors.length === 0, s.pageErrors);
    await s.close();
  }
}

async function guidedRows(engine, browserType) {
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const s = await session(browserType, { width, height, ui: 'ja' });
    const { page } = s;
    try {
      await page.goto(`${ORIGIN}/index.html?ui=ja`);
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60_000 });
      await page.locator('button:has-text("本棚")').first().click();
      await sleep(600);
      if (await page.locator('#tab-learn').count()) await page.locator('#tab-learn').click();
      else await page.locator('button:has-text("学ぶ")').first().click();
      await sleep(600);
      await page.locator('[data-study-door="guided"]').first().click().catch(() => page.locator('button:has-text("案内つき")').first().click());
      await sleep(1500);
      const g = await page.evaluate(() => {
        const box = document.querySelector('.gs-arrival')?.getBoundingClientRect();
        const btn = document.querySelector('.gs-arrival .gs-actions button');
        const begin = btn?.getBoundingClientRect();
        const label = btn?.querySelector('span')?.getBoundingClientRect() || [...(btn?.childNodes || [])].find((n) => n.nodeType === 3 && n.textContent.trim())?.getBoundingClientRect?.();
        const intro = document.querySelector('.gs-intro')?.getBoundingClientRect();
        const meta = document.querySelector('.gs-meta')?.getBoundingClientRect();
        const rest = [...document.querySelectorAll('.gs-arrival > *')].filter((n) => !n.classList.contains('gs-intro'))
          .map((n) => n.getBoundingClientRect()).filter((b) => b && b.height > 0);
        let above = null, below = null;
        if (btn && label) { above = Math.round((label.top - begin.top) * 10) / 10; below = Math.round((begin.bottom - label.bottom) * 10) / 10; }
        return { iw: innerWidth, vh: innerHeight, box: box && { top: Math.round(box.top), h: Math.round(box.height), w: Math.round(box.width) },
          begin: begin && { top: Math.round(begin.top), bottom: Math.round(begin.bottom) }, above, below,
          introH: intro && Math.round(intro.height), metaBottom: meta && Math.round(meta.bottom),
          restH: rest.length ? Math.round(Math.max(...rest.map((b) => b.height))) : 0, restCount: rest.length };
      });
      const seated = g.begin && g.begin.bottom <= Math.min(g.vh, 844) && g.begin.top >= 0;
      check(`G · ${engine} · ${width} · the begin control sits inside the first viewport`, !!seated, g);
      check(`G · ${engine} · ${width} · the begin label is centred in its 48 px button (|above − below| ≤ 3 px)`,
        g.above !== null && g.below !== null && g.above >= 0 && Math.abs(g.above - g.below) <= 3, { above: g.above, below: g.below });
      check(`G · ${engine} · ${width} · the box is filled, not a tall empty stretch (its own content past the intro)`,
        !!g.box && g.restCount >= 1 && g.restH >= 100 && g.metaBottom && g.metaBottom <= (g.box.top + g.box.h) + 2, g);
      if (width === 1440) check(`G · ${engine} · mac · the arrival keeps the phone's measure`, !!g.box && g.box.w >= 300 && g.box.w <= 980, g.box);
      check(`G · ${engine} · ${width} · no page error`, s.pageErrors.length === 0, s.pageErrors);
      await page.screenshot({ path: join(shots, `${engine}-G-${width}.png`) });
    } catch (error) { check(`G · ${engine} · ${width} · the walk ran`, false, String(error?.message || error).split('\n')[0]); }
    await s.close();
  }
}

for (const [engine, browserType] of Object.entries(ENGINES)) {
  const probe = await browserType.launch();
  console.log(`\n— ${engine} ${probe.version()}${CONTROL ? ` · CONTROL ${CONTROL}` : ''}`);
  await probe.close();
  for (const word of WORDS) await wordRows(engine, browserType, word);
  await guidedRows(engine, browserType);
}

const identity = JSON.parse(readFileSync(join(host.site, 'build-identity.json'), 'utf8'));
const expectSha = process.env.KAIRO_EXPECT_GITSHA;
if (expectSha) {
  const ok = identity.gitSha === expectSha;
  checks.push({ name: 'identity · the served site is the expected commit', pass: ok, detail: `${identity.gitSha} ${ok ? '===' : '!=='} ${expectSha}` });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} identity · the served site is the expected commit  — ${identity.gitSha}`);
}
writeFileSync(join(out, 'verification-report.json'), `${JSON.stringify({ suite: 'hfix2d', site: host.site, control: CONTROL, engines: Object.keys(ENGINES), identity, checks }, null, 2)}\n`);
const failedAll = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failedAll.length}/${checks.length} checks passed${CONTROL ? ` (control ${CONTROL}: the rows above must be red where it bites)` : ''}`);
await host.close?.();
process.exitCode = failedAll.length ? 1 : 0;
