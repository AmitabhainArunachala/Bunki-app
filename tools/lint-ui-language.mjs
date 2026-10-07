/** Exercise real room renderers in a built artifact. The test route bridge
 * exposes existing navigation functions; it does not replace any UI markup. */
/* global window, document, NodeFilter, getComputedStyle */
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import console from 'node:console';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { resolveCorridorSite, resolveCorridorEvidence } from '../scripts/resolve-corridor-site.mjs';
import { fixture, enrichmentFixture } from '../prototypes/corridor/tools/personal-fixture.mjs';

export const ROOMS = ['drift', 'shelf', 'reader', 'entry', 'tray', 'list', 'browse', 'srs-stats',
  'review', 'probe', 'archive', 'dojo', 'levels', 'ai', 'aiquiz', 'lessons', 'mock',
  'kagami', 'thesaurus', 'airead', 'feed', 'publisher', 'source-inbox', 'source-reader',
  'sentence-practice', 'kanjidex', 'yoji', 'grammar', 'guided', 'search', 'me', 'settings'];
const ROOM_STAMPS = { drift: 'door', entry: 'entry', shelf: 'shelf', reader: 'reader',
  tray: 'tray', list: 'list', browse: 'browse', 'srs-stats': 'progress', review: 'review',
  probe: 'probe', archive: 'archive', dojo: 'learn', deckplay: 'deckplay', contextdeck: 'contextdeck',
  personaldeck: 'personal', aiquiz: 'quiz', levels: 'reference', ai: 'tutor', lessons: 'lessons',
  mock: 'jlpt', kagami: 'progress', thesaurus: 'word-web', airead: 'personal-reading',
  feed: 'feed', publisher: 'publisher', 'source-inbox': 'source-inbox', 'source-reader': 'source-reader',
  'sentence-practice': 'sentence-practice', kanjidex: 'kanji', yoji: 'idioms', grammar: 'grammar',
  guided: 'guided', search: 'search', me: 'me', settings: 'settings' };
const site = resolveCorridorSite(), out = path.join(resolveCorridorEvidence(), 'ui-language');
const screenshots = process.argv.includes('--screenshots');
const japaneseTour = process.argv.includes('--both-languages');
const coreOnly = process.argv.includes('--core-only');
await mkdir(out, { recursive: true });
const contentTypes = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(site, '.' + (url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
    if (!file.startsWith(site + path.sep)) { res.writeHead(403); res.end(); return; }
    res.setHeader('Content-Type', contentTypes[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

// All changes below are transient navigation state in the test's browser.
const bridge = `
window.__BUNKI_LANGUAGE_TOUR__ = {
  ready: () => S.ready,
  visit: async (view) => {
    S.stack = []; S.strokes = null; S.captureOpen = false; S.navOpen = false;
    if (view === 'reader') {
      const article = D.passages.find(p => !p.retired && storyVersions(p)) || D.passages.find(p => !p.retired) || D.passages[0];
      if (!article) throw new Error('No reader article available');
      await ensureArticle(article); openPassage(article.id); return;
    }
    if (view === 'list') { S.lists['Language tour'] = []; S.listOpen = { name: 'Language tour', manual: true }; }
    if (view === 'probe') S.probe = {queue:[],ix:0,right:0,missed:[]};
    if (view === 'review') S.review = null;
    if (view === 'search') { S.searchLens = 'words'; S.navQ = ''; }
    S.view = view; render(); window.scrollTo(0, 0);
  },
  sheet: (kind) => {
    const nodes = { word: {t:'word',id:'日本'}, kanji:{t:'kanji',id:'日'},
      radical:{t:'radical',id:'日'}, idiom:{t:'idiom',id:Object.keys(D.idioms || {})[0]},
      grammar:{t:'grammar',id:GRAMMARS()[0]?.id},
      particle:{t:'particle',id:PARTICLES[0]?.id} };
    const node = nodes[kind]; if (!node?.id) throw new Error('Missing sheet fixture: ' + kind);
    S.stack=[]; S.strokes=null; go(node); window.scrollTo(0, 0);
  },
  frontNav: () => { S.view='drift'; S.stack=[]; S.navOpen=true; render(); },
  variants: () => { S.view='shelf'; S.stack=[]; S.variantsBar=true; S.debugOpen=true; render(); },
  mirrorEvidence: () => { S.view='kagami'; S.stack=[];
    S.obslog=[...(S.obslog||[]),[Date.now(),'dojo','word:日本',3]]; render(); },
  active: (kind, revealed=false) => {
    S.stack=[]; S.focus=null;
    if(kind==='review') { S.view='review'; S.review={queue:[{t:'word',id:'日本',label:'日本'}],ix:0,revealed,declared:null,done:{again:0,hard:0,good:0,easy:0},history:[]}; }
    if(kind==='probe') { S.view='probe'; S.probe={queue:[{w:'日本',r:'にほん',m:['Japan'],rt:'熟',band:'10級'}],ix:0,right:0,missed:[],minted:0,revealed}; }
    if(kind==='lesson') { S.view='lessons'; startLesson(lessonPlan('word','N5')[0]); if(revealed) S.lessonRun.phase='quiz'; }
    render(); window.scrollTo(0,0);
  },
  searchLens: (lens) => { S.stack = []; S.view='search'; S.searchLens=lens;
    S.navQ = lens === 'skip' ? 'skip:1-*-*' : ''; render(); },
};`;

async function prepare(page, query = '') {
  await page.route('**/corridor.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + bridge });
  });
  await page.goto(`${origin}/?ui=bi&entry=shelf${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__BUNKI_LANGUAGE_TOUR__?.ready(), { timeout: 90_000 });
}

/** These selectors identify Japanese being studied, not chrome containers.
 * A button around a passage still has its non-content text checked. */
export async function inspectChrome(page) {
  return page.evaluate(() => {
    const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
    const learning = [
      '[data-ui-content=learning]', '.tok', '.row-glyph', '.lesson-row .row-main', '.kagami-row .row-main', '.kagami-pair', '.row-word', '.row-reading', 'button[data-grammar] .row-gloss', '.grammar-form', '.grammar-meaning', '.grammar-related-content', '.grammar-note', '.example-ja', '.formation', '.reading', '.on', '.dictionary-forms', '.headword', '.thes-word', '.thes-reading', '.shelf-title', '.story-title', '.story-snippet', '.story-lede',
      '.story-picture-word', '.review-front', '.review-reading', '.mock-q', '.mock-question',
      '.lesson-option', '.grammar-head', '.grammar-g', '.word-head', '.kanji-head',
      '.radical-head', '.idiom-head', '.kdx-glyph', '.kdx-char', '.part-chip', '.radical-chip',
      '.sem-word', '.sem-note', '.rad-glyph', '.rad-name', '.yoji-word', '.skip-hit-glyph', '.t-kanji .big', '.t-idiom .big', '.t-idiom .sub', '.reference-entry-title',
      '.kp-word', '.kp-s', '.kp-passage', '.kp-definition', '.kp-w', '.kp-token', '.kp-tok', '.kp-target',
      '.cd-toc-word', '.cd-front', '.cd-backline', '.cd-gloss', '.cd-readings', '.cd-plate', '.pc-japanese', '.pc-token',
      '.pc-tile > strong[lang=ja]', '.pc-tile > span[lang=ja]', '.pc-answer h3[lang=ja]',
      '.pc-quick-answer h3[lang=ja]', '.pc-relation h4[lang=ja]', '.gs-question', 
      '.gs-word-form', '.gs-sentence', '.gs-reading', '.gs-personal-line', '.gs-sheet p.gs-instruction[lang=ja]', '.gs-completed', '.gs-teaching > p', '.gs-example > p[lang=ja]', '.gs-target > span',
    ].join(',');
    const namedMarks = '.theme-seal, #ginga-theme-seal, .world-stone, button[data-lang="ja"], #lang-ja, .lang-opt.ja, .reader-source, .gs-brand-mark';
    const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    const selector = el => el.id ? '#' + el.id : el.tagName.toLowerCase() +
      [...el.classList].slice(0, 3).map(c => '.' + c).join('');
    const issues = [], inspected = [];
    const chromeText = 'button, [role=button], nav, h1, h2, h3, h4, h5, h6, label, legend, summary, select, .eyebrow, .card-kind, .chip, .level-chip, .gs-eyebrow, .gs-bar-name, .gs-gap-line, .gs-row-number, .gs-gap-tag, .pc-eyebrow, .pc-kicker, .kp-chip, .kp-kicker, .vlabel, #variants .measure, .kagami-level, .kagami-obs, .kagami-read, .kagami-prov, .kagami-thin, .exam-skill, .exam-official-label, .exam-daimon-name, .exam-score-note, .exam-bookmark-note';
    const nodes = [...document.querySelectorAll(chromeText + ',button, [role=button], nav, h1, h2, h3, h4, h5, h6, label, legend, summary, [aria-label], [title], input[placeholder], textarea[placeholder], select')];
    for (const el of nodes) {
      if (!visible(el)) continue;
      inspected.push(selector(el));
      // Text nodes under an explicit exercise selector remain Japanese. Other
      // descendants (including ordinary labels inside those buttons) do not.
      let text = '';
      const textElement = el.matches(chromeText);
      const contentValues = (el.closest('[data-ui-content-value]')?.dataset.uiContentValue || '').split('|').filter(Boolean);
      // Proper source attribution is a named mark; no interface labels qualify.
      if (el.closest('.reader-source, .article-facts')) contentValues.push('ウィキニュース');
      if (el.closest('.article-facts')) contentValues.push('政府広報オンライン');
      // Lookup buttons may split one declared learned phrase into several
      // lexical fragments. Permit only fragments of that exact declared value.
      const withoutContent = value => contentValues.reduce((text, content) => text.split(content).join(''), value)
        .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu, text =>
          contentValues.some(content => content.includes(text)) ? '' : text);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode, parent = node.parentElement;
        if (!visible(parent) || parent.closest('[aria-hidden="true"]') || parent.closest(learning) || parent.closest(namedMarks)) continue;
        text += node.textContent;
      }
      if (textElement && cjk.test(withoutContent(text))) issues.push({ selector: selector(el), ancestry: [el.parentElement,el.parentElement?.parentElement,el.parentElement?.parentElement?.parentElement].filter(Boolean).map(selector), kind: 'text', text: text.trim().slice(0, 250) });
      for (const attr of ['aria-label', 'title', 'placeholder']) {
        const value = el.getAttribute(attr);
        if (value && cjk.test(withoutContent(value)) && !el.matches(learning)) issues.push({ selector: selector(el), kind: attr, text: value });
      }
    }
    return { issues, inspected: inspected.length };
  });
}

const results = [], errors = [];
const escapeHtml = value => String(value).replace(/[&<>"']/gu, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
async function writeGallery() {
  if (!screenshots) return;
  const cards = results.map(result => {
    const file = `${result.room}-${result.language === 'EN' ? 'en' : 'ja'}.png`;
    return `<article><a href="${escapeHtml(file)}"><img loading="lazy" src="${escapeHtml(file)}" width="390" height="844" alt="${escapeHtml(result.room)} in ${escapeHtml(result.language)}"><span>${escapeHtml(result.room)} · ${escapeHtml(result.language)}</span></a><small>${escapeHtml(result.view)} → ${escapeHtml(result.shell.stamp)}</small></article>`;
  }).join('\n');
  await writeFile(path.join(out,'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bunki foundation room tour</title><style>body{margin:0;padding:24px;font:16px system-ui;color:#24241f;background:#f1eee7}h1{font-size:26px}p{overflow-wrap:anywhere}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(195px,1fr));gap:20px}article{background:#fff;padding:10px;border:1px solid #bcb8af;border-radius:8px}a{display:block;color:inherit;text-decoration:none}img{display:block;width:100%;height:auto}span,small{display:block;margin-top:8px}small{color:#57574f}</style><h1>Bunki redesign foundation · room tour</h1><p>${results.length} screenshots at 390 × 844. Open any image to inspect it at full size. English chrome and Japanese learning content are checked separately.</p><p>Artifact: ${escapeHtml(site)}<br>SHA-256: ${escapeHtml(process.env.KAIRO_ARTIFACT_SHA256 || 'not pinned')}<br><a href="report.json">DOM language findings, room stamps and tab checks</a></p><main>${cards}</main></html>\n`);
}
const browser = await chromium.launch({ headless: true,
  ...(process.env.KAIRO_CHROMIUM ? { executablePath: process.env.KAIRO_CHROMIUM } : {}) });
async function record(page, room, language) {
  // Fonts and asynchronous room modules settle before inspecting the real DOM.
  await page.waitForTimeout(650);
  const error = await page.locator('[data-room-error]').count();
  const result = language === 'bi' ? await inspectChrome(page) : { issues: [], inspected: 0 };
  const shell = await page.evaluate(() => ({ view: document.body.dataset.view,
    stamp: document.documentElement.dataset.room, tabs: document.querySelectorAll('#primary-tabs').length,
    activeTabs: [...document.querySelectorAll('#primary-tabs')].filter(el => el.getClientRects().length &&
      getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert], [aria-hidden="true"]')).length,
    quiet: ['drift', 'entry'].includes(document.body.dataset.view) || document.body.classList.contains('zen') || !!document.querySelector('#sheet, #stroke-page') }));
  const contractIssues = [];
  if (!ROOM_STAMPS[shell.view] || shell.stamp !== ROOM_STAMPS[shell.view]) contractIssues.push(`Room stamp ${shell.stamp} for ${shell.view}`);
  if (shell.activeTabs !== (shell.quiet ? 0 : 1) || (!shell.quiet && shell.tabs !== 1)) contractIssues.push(`Expected ${shell.quiet ? 0 : 1} active tab bar, found ${shell.activeTabs} (${shell.tabs} mounted)`);
  results.push({ room, language: language === 'bi' ? 'EN' : '日本語', view: shell.view, error, shell, contractIssues, ...result });
  await writeFile(path.join(out, 'report.json'), JSON.stringify({artifact:site,results,errors,issues:results.flatMap(r=>r.issues.map(i=>({room:r.room,...i})))},null,2)+'\n');
  if (screenshots) await page.screenshot({ path: path.join(out, `${room}-${language === 'bi' ? 'en' : 'ja'}.png`), fullPage: false });
}
try {
  for (const language of japaneseTour ? ['bi', 'ja'] : ['bi']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await prepare(page);
    if (language === 'ja') await page.locator('[data-lang=ja]').first().click();
    for (const room of ROOMS) {
      await page.evaluate(view => window.__BUNKI_LANGUAGE_TOUR__.visit(view), room);
      await record(page, room, language);
    }
    await page.evaluate(()=>window.__BUNKI_LANGUAGE_TOUR__.frontNav());
    await record(page,'front-navigation',language);
    await page.locator('#ginga-theme-seal').click();
    await record(page, 'world-picker', language);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__BUNKI_LANGUAGE_TOUR__.mirrorEvidence());
    await record(page, 'mirror-with-evidence', language);
    for (const kind of ['review','probe','lesson']) for (const revealed of [false,true]) {
      await page.evaluate(({kind,revealed})=>window.__BUNKI_LANGUAGE_TOUR__.active(kind,revealed),{kind,revealed});
      await record(page, `${kind}-${revealed?'answer':'question'}`,language);
    }
    await page.evaluate(()=>window.__BUNKI_LANGUAGE_TOUR__.visit('guided'));
    await page.locator('.guided-room [data-action=setup]').first().click();
    await record(page,'guided-setup',language);
    await page.locator('.guided-room [data-action=start]').first().click();
    await record(page,'guided-question',language);
    await page.locator('.guided-room [data-action=explain]').first().click();
    await record(page,'guided-explanation',language);
    await page.locator('.guided-room [data-action=question]').first().click();
    await page.locator('.gs-choice input').first().check();
    await page.locator('.guided-room [data-action=check]').click();
    await record(page, 'guided-answer', language);
    await page.locator('.guided-room [data-action=flag]').click();
    await page.locator('.gs-progress [data-index="2"]').click();
    await record(page, 'guided-grammar-question', language);
    await page.locator('.guided-room [data-action=explain]').first().click();
    await record(page, 'guided-grammar-explanation', language);
    await page.locator('.gs-branch-links [data-action=branch]').first().click();
    await record(page, 'guided-branch', language);
    await page.locator('.guided-room [data-action=close-branch]').click();
    await page.locator('.gs-word').first().click();
    await record(page, 'guided-word', language);
    await page.locator('.guided-room [data-action=close-word]').first().click();
    await page.locator('.gs-progress [data-index="5"]').click();
    await page.locator('.gs-choice input').first().check();
    await page.locator('.guided-room [data-action=check]').click();
    await page.locator('.guided-room [data-action=next]').click();
    await record(page, 'guided-summary', language);
    await page.locator('.guided-room [data-action=finish]').click();
    await page.locator('.gs-results').waitFor();
    await record(page, 'guided-results', language);
    for (const view of ['learn', 'field', 'sensei', 'about']) {
      await page.locator(`.gs-bar [data-view=${view}]`).click();
      await record(page, `guided-${view}`, language);
    }
    await page.evaluate(()=>window.__BUNKI_LANGUAGE_TOUR__.visit('mock'));
    await page.locator('[data-exam-start]').first().click();
    await record(page,'mock-confirm',language);
    await page.locator('#exam-practice-start').click();
    await page.locator('[data-exam-option]').first().waitFor({timeout:60000});
    await record(page,'mock-question',language);
    for (const lens of ['skip', 'parts', 'radical', 'draw', 'reading', 'meaning', 'strokes', 'freq', 'level', 'kkld']) {
      await page.evaluate(lens => window.__BUNKI_LANGUAGE_TOUR__.searchLens(lens), lens);
      await record(page, `search-${lens}`, language);
    }
    await page.evaluate(() => window.__BUNKI_LANGUAGE_TOUR__.visit('shelf'));
    await page.locator('#shelf-tools-toggle').click();
    await record(page, 'shelf-tools', language);
    for (const kind of ['word', 'kanji', 'radical', 'idiom', 'grammar', 'particle']) {
      await page.evaluate(kind => window.__BUNKI_LANGUAGE_TOUR__.sheet(kind), kind);
      await record(page, `sheet-${kind}`, language);
      for (const summary of await page.locator('#sheet details > summary').all()) if(await summary.isVisible()) await summary.click();
      await record(page, `sheet-${kind}-details`,language);
    }
    await page.evaluate(() => window.__BUNKI_LANGUAGE_TOUR__.sheet('word'));
    await page.locator('#sheet-take').click();
    await page.locator('#new-list').waitFor();
    await page.locator('#sheet .list-picker').scrollIntoViewIfNeeded();
    await record(page, 'word-save-destinations', language);
    await page.locator('#new-list').click();
    await page.locator('#sheet .list-maker-field').scrollIntoViewIfNeeded();
    await record(page, 'word-new-list', language);
    await page.evaluate(() => window.__BUNKI_LANGUAGE_TOUR__.variants());
    await record(page, 'variants', language);
    await context.close();
    for (const deck of coreOnly ? [] : ['n2', 'n1', 'senmon', 'kotoba', 'mcd', 'context']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await prepare(p, `&deck=${deck}`);
      if (language === 'ja') await p.locator('[data-lang=ja]').first().click();
      await p.locator(deck === 'context' ? '.cd-room' : '.kp').waitFor({ timeout: 60_000 });
      await record(p, `deck-${deck}`, language);
      if(deck==='context') {
        await p.locator('#cd-start').click(); await record(p,`deck-${deck}-question`,language);
        await p.locator('#cd-got').click(); await record(p,`deck-${deck}-answer`,language);
      } else {
        await p.locator('#kp-start').click(); await record(p,`deck-${deck}-question`,language);
        await p.locator('#kp-reveal').click(); await record(p,`deck-${deck}-answer`,language);
        await p.locator('#kp-quit').click(); await p.locator('#kp-to-settings').click();
        await record(p,`deck-${deck}-settings`,language);
      }
      await ctx.close();
    }
    if (coreOnly) continue;
    const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const pp = await pc.newPage();
    pp.on('pageerror', e => errors.push(e.message));
    await pp.goto(`${origin}/?deck=personal&ui=${language}`);
    await pp.locator('.pc-file').waitFor({ state: 'attached', timeout: 90_000 });
    await record(pp, 'personal-home', language);
    const data = await fixture(), enriched = await enrichmentFixture(data);
    await pp.locator('.pc-file').setInputFiles({ name: 'language-tour.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...data, enrichment: enriched })) });
    await record(pp, 'personal-import-preview', language);
    await pp.locator('[data-action=confirm-import]').click();
    await pp.locator('[data-card]').waitFor();
    await record(pp, 'personal-study', language);
    await pp.locator('[data-action=reveal]').click();
    await record(pp, 'personal-answer', language);
    await pp.locator('.pc-context .pc-token').filter({ hasText: data.lessons[0].term }).first().click();
    await pp.locator('#sheet').waitFor();
    await record(pp, 'personal-dictionary', language);
    await pp.locator('.personal-dictionary-meaning > summary').click();
    await record(pp, 'personal-dictionary-meanings', language);
    await pp.locator('#sheet-close').click();
    for (const screen of ['read', 'connections', 'settings']) {
      await pp.locator(`[data-screen=${screen}]`).first().click();
      await record(pp, `personal-${screen}`, language);
    }
    await pc.close();
  }
  const issues = results.flatMap(r => r.issues.map(i => ({ room: r.room, ...i })));
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ artifact: site, results, errors, issues }, null, 2) + '\n');
  console.log(JSON.stringify({ visits: results.length, chromeInspections: results.reduce((sum,r) => sum+r.inspected,0), issues: issues.length, roomErrors: results.filter(r=>r.error).map(r=>r.room), shellIssues: results.filter(r=>r.contractIssues.length).map(r=>({room:r.room,issues:r.contractIssues})), out }, null, 2));
  assert.equal(issues.length, 0, `${issues.length} English chrome language leaks; see ${path.join(out,'report.json')}`);
  assert.equal(results.filter(r=>r.error).length, 0, 'The language tour must render every room successfully');
  assert.equal(errors.length, 0, `Uncaught page errors: ${errors.join('; ')}`);
  assert.equal(results.filter(r=>r.contractIssues.length).length, 0, 'Every room must retain its stamp and tab visibility contract');
} finally { await writeGallery(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
