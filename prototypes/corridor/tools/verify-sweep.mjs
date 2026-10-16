/**
 * S · the sweep (John, 2026-10-16 12:2x, typed by hand on the whole-app tour: "be systematic about everythign!!
 * these are amateur mistakes"). One walk over every room of the built app, in English and 日本語, in both layouts,
 * that enumerates at runtime the same classes S/INVENTORY.md lists, so an instance fixed on one screen and missed on
 * another fails here:
 *   P  provenance  — no learner-facing "Made by AI" / AI作成 / unreviewed / 未確認 / "not yet checked by a person" /
 *                    "N of M …" / 検収前 / machine-checked / "awaiting review" and kin, in text, names or tooltips;
 *                    the provenance stays in the data and the export (not walked here);
 *   C  captions    — no "goes into review" / "to review" / 復習に入ります caption beside any Save, and no
 *                    "saved to: daily review" line;
 *   K  keep        — every control that keeps a word, kanji, sentence or story is the one Save component
 *                    ([data-save-one], button.save-one, Save / 保存 · Saved ✓ / 保存済み ✓, a menu inside);
 *   B  the top bar — the reader's bar carries a labelled keep control (#chrome-keep) on the one Save path: it names
 *                    the last word touched ("Save 総理" / 「総理」を保存), never an unlabelled glyph;
 *   M  marks       — no registration / crop / corner mark anywhere, found by computed style as well as by name:
 *                    hairline crosses drawn as background layers, perpendicular hairline pseudo-elements, corner
 *                    brackets, glyph crosses;
 *   D  the deck    — the deck's study bar is a solid band in the world's deep pigment (藍 and 墨 walked), its
 *                    back, count and Remove at 4.5:1 or more on it;
 *   T  Today       — no box inside a box: the day's line carries no bordered box within it, and no + marks.
 *   N  the shelf's rows and cards (slice N, 2026-10-17: "made by AI!! do not write that", the twenty new articles) —
 *                    every card carries one level, the level its text was written for where the row has one; every
 *                    row opened in the reader shows no provenance word, one level, and its context line exactly when
 *                    the row carries one (two Aozora excerpts), under the title; no row's authoring record (who wrote
 *                    it, John's pending read) is drawn anywhere; the rows the queue lists as originals carry no review
 *                    value and no 検収前; and the newest drop leads the shelf and Today's story.
 * KAIRO_SWEEP_MODE=inventory lists every instance (and screenshots each room) without failing: S/INVENTORY.md is
 * built from that run on the base build. Negative controls, each red where it is planted and nowhere else:
 * KAIRO_SWEEP_NEGATIVE=chip re-inserts one "Made by AI" chip in ONE room (the reader); =cover cancels the page's step down
 * under a bar's drawer (the two drawers' "covers no control"); =box fills Today's cards line as a key (T, with cards).
 */
/* global window, document, getComputedStyle, NodeFilter, innerWidth, innerHeight, localStorage */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

const MODE = process.env.KAIRO_SWEEP_MODE === 'inventory' ? 'inventory' : 'verify';
const NEGATIVE = process.env.KAIRO_SWEEP_NEGATIVE || '';
const SHOTS = MODE === 'inventory' || process.env.KAIRO_SWEEP_SHOTS === '1';
const out = resolveCorridorEvidence();
mkdirSync(join(out, 'rooms'), { recursive: true });
const host = await startCorridorDev(0);
const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail: String(detail).slice(0, 2000) });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${String(detail).slice(0, 400)}` : ''}`);
};
const engines =
  process.env.KAIRO_BROWSER === 'chromium'
    ? { chromium }
    : process.env.KAIRO_BROWSER === 'webkit'
      ? { webkit }
      : { chromium, webkit };
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  // the marks some rooms draw only with motion on (Learn's トンボ snap in): the walk sees what his phone shows
  reducedMotion: 'no-preference',
  serviceWorkers: 'block',
};

/* The bridge: existing navigation functions, reached from the test (lint-ui-language's way). It replaces no markup;
 * the scan reads the page as it is drawn. */
const BRIDGE = `
window.__SWEEP__ = {
  ready: () => !!S.ready,
  view: () => S.view,
  visit: async (view) => {
    S.stack = []; S.strokes = null; S.captureOpen = false; S.navOpen = false;
    if (view === 'list') { S.lists['Sweep'] = S.lists['Sweep'] || []; S.listOpen = { name: 'Sweep', manual: true }; }
    if (view === 'probe') S.probe = { queue: [], ix: 0, right: 0, missed: [] };
    if (view === 'review') S.review = null;
    if (view === 'search') { S.searchLens = 'words'; S.navQ = ''; }
    S.view = view; render(); window.scrollTo(0, 0);
  },
  reader: async (needle) => {
    S.stack = []; S.strokes = null;
    const p = D.passages.find((x) => !x.retired && String(x.title || '').includes(needle))
      || D.passages.find((x) => !x.retired && storyVersions(x)) || D.passages.find((x) => !x.retired);
    await ensureArticle(p); openPassage(p.id); window.scrollTo(0, 0);
    return p.id;
  },
  sheet: (node) => { S.stack = []; S.strokes = null; go(node); window.scrollTo(0, 0); },
  stroke: (id) => { S.stack = []; openStrokePage(id); },
  deck: (id) => { S.stack = []; S.view = 'deckplay'; S.deckPlay = id; render(); window.scrollTo(0, 0); },
  search: (q) => { S.stack = []; S.view = 'search'; S.searchLens = 'words'; S.navQ = q; render(); window.scrollTo(0, 0); },
  layout: (id) => { setLayout(id); render(); },
  theme: (id) => setKairoTheme(id),
  lang: (id) => { S.lang = id; render(); },
  grammar: () => { S.stack = []; S.strokes = null; go({ t: 'grammar', id: GRAMMARS()[0]?.id }); window.scrollTo(0, 0); },
  idiom: () => { S.stack = []; S.strokes = null; go({ t: 'idiom', id: Object.keys(D.idioms || {})[0] }); window.scrollTo(0, 0); },
  closeLayers: () => { closeVocabularyListPopover(); removeMini(); S.stack = []; S.strokes = null; render(); },
  saved: (id) => S.taken.some((t) => t.id === id),
  // N · the shelf's rows as the page holds them (archive rows aside), the cards as drawn, Today's story, one row read
  rows: () => D.passages.filter((p) => !String(p.file || '').startsWith('archive/')).map((p) => ({
    id: p.id, review: Object.hasOwn(p, 'review') ? p.review : null, pending: !!p.pendingVerification,
    sourceLabel: p.sourceLabel || '', learnerLabel: learnerSourceLabel(p), attribution: p.attribution || '',
    title: p.title || '', titleEn: p.titleEn || '', context: p.context?.ja ?? null, authorLevel: p.authorLevel || null,
    jlpt: p.readingFacets?.jlpt || null, addedAt: p.addedAt || null,
    hidden: [p.authoring?.humanApproval, p.authoring?.writtenBy, p.authoring?.chosenBy].filter((v) => typeof v === 'string' && v),
  })),
  cards: () => [...document.querySelectorAll('#shelf-reading-results .shelf-item')].map((n) => ({
    id: n.dataset.passage, band: n.dataset.recommendation || '',
    chips: [...n.querySelectorAll('.level-chip')].map((c) => c.textContent.trim()),
    text: n.innerText + ' ' + [...n.querySelectorAll('[title], [aria-label]')].map((c) => (c.title || '') + ' ' + (c.getAttribute('aria-label') || '')).join(' '),
  })),
  todayPick: () => todayReadPick()?.passage?.id ?? null,
  day: () => shelfCurrentDay(),
  pageText: () => document.body.innerText,
  openRow: async (id) => {
    S.stack = []; S.strokes = null; closeVocabularyListPopover(); removeMini();
    const p = D.passages.find((x) => x.id === id);
    await ensureArticle(p);
    openPassage(id);
    const card = () => document.querySelector('#app main .reader-card');
    for (let i = 0; i < 200 && !(S.view === 'reader' && card()?.querySelector('h1.view-title')?.textContent === p.title); i += 1)
      await new Promise((done) => requestAnimationFrame(done));
    const c = card();
    const kids = c ? [...c.children] : [];
    const at = (sel) => kids.findIndex((k) => k.matches(sel));
    return {
      title: c?.querySelector('h1.view-title')?.textContent ?? null,
      contexts: [...document.querySelectorAll('#app main .reader-context')].map((n) => ({
        text: n.textContent, inCard: n.parentElement === c,
        // under the title group: after the h1 (and its English line), before the instrument line
        placed: at('.reader-context') > at('h1.view-title') && (at('.view-title-en') < 0 || at('.reader-context') > at('.view-title-en'))
          && at('.reader-context') < at('.reader-head'),
        boxed: (() => { const cs = getComputedStyle(n); return ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none') || !['transparent', 'rgba(0, 0, 0, 0)'].includes(cs.backgroundColor); })(),
      })),
      chips: [...document.querySelectorAll('#app main .reader-meta .level-chip')].map((n) => n.textContent.trim()),
      text: (document.querySelector('#app main')?.innerText ?? '') + ' ' + (document.querySelector('#app > .chrome')?.innerText ?? ''),
    };
  },
  // a real selection of the first occurrence of text inside a surface (the source reader keeps what is selected)
  selectIn: (sel, text) => {
    const body = document.querySelector(sel);
    const at = body.textContent.indexOf(text);
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let offset = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (at < offset + node.length) {
        const range = document.createRange();
        range.setStart(node, at - offset);
        range.setEnd(node, at - offset + text.length);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }
      offset += node.length;
    }
    return false;
  },
};`;

/* K · one behaviour (S brief §3: "same look, same behaviour, same words … never covering another control"). Before a
 * press: the controls in reach — every control in the scope whose centre the finger reaches — by a signature that
 * survives a redraw (tag, id, name, words, and its place among controls that share them). After it: the menu is open,
 * and no control that was in reach is now under the menu. A control the page moved below the glass is still one scroll
 * away, not covered. The scope is the surface the Save stands on: a card for a card's Save (a slip floats over the
 * story by nature; its menu grows the card), the page for a row's or a bar's Save. */
function reachable(scope) {
  const root = scope ? document.querySelector(scope) : document;
  if (!root) return [];
  const seen = new Map();
  const rows = [];
  for (const n of root.querySelectorAll('button, a[href], input, select, textarea, summary, [role="button"], .tok')) {
    if (n.closest('#vocabulary-list-popover, [data-bar]')) continue;
    const base = [n.tagName, n.id, n.getAttribute('aria-label') || '', (n.textContent || '').replace(/\s+/gu, ' ').trim().slice(0, 24)].join('|');
    const k = (seen.get(base) || 0) + 1;
    seen.set(base, k);
    const r = n.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (y < 0 || y >= innerHeight || x < 0 || x >= innerWidth) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit && (hit === n || n.contains(hit))) rows.push(`${base}#${k}`);
  }
  return rows;
}
function coveredBy({ before, scope }) {
  const pop = document.getElementById('vocabulary-list-popover');
  if (!pop) return { open: false };
  const want = new Set(before);
  const root = scope ? document.querySelector(scope) : document;
  const seen = new Map();
  const covered = [];
  let checked = 0, moved = 0;
  for (const n of root ? root.querySelectorAll('button, a[href], input, select, textarea, summary, [role="button"], .tok') : []) {
    if (n.closest('#vocabulary-list-popover, [data-bar]')) continue;
    const base = [n.tagName, n.id, n.getAttribute('aria-label') || '', (n.textContent || '').replace(/\s+/gu, ' ').trim().slice(0, 24)].join('|');
    const k = (seen.get(base) || 0) + 1;
    seen.set(base, k);
    if (!want.has(`${base}#${k}`)) continue;
    const r = n.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (y >= innerHeight || y < 0) { moved += 1; continue; }
    checked += 1;
    const hit = document.elementFromPoint(x, y);
    if (hit && pop.contains(hit)) covered.push(base.slice(0, 60));
  }
  const pr = pop.getBoundingClientRect();
  const place = pop.classList.contains('is-drawer') ? 'drawer' : pop.classList.contains('is-inline') ? 'inline' : 'popover';
  return { open: true, place, top: Math.round(pr.top), height: Math.round(pr.height), before: before.length, checked, moved, covered };
}

/* The scan: every class of the inventory, read off the drawn page. Defined in Node and sent as a function, so the
 * negative control and the real run read the page the same way. */
function scanPage() {
  const PROV = /made by ai|ai[- ]?(made|generated|written)|written by ai|questions made by ai|unreviewed|un-reviewed|not yet checked|checked by a person|awaiting (john'?s )?review|machine[- ]checked|human[- ]review|provisional|AI作成|AIが(書|作)|未確認|検収|人の(目|確認)|人による確認|\b\d+ of \d+ not yet/iu;
  // the review captions he named (2026-10-16: ":goes into review is excessive and 無駄"), wherever they stand
  const CAPTION = /goes into review|go(es)? to review|into review|add(ed)? to review|add only what you want to review|saved to:? (daily )?review|saved to review|復習に入|復習に(保存|追加)しました|覚えるの札|保存先/iu;
  // beside a Save, any word of review is a caption: the Save itself says enough
  const BESIDE = /review|復習/iu;
  // the names of every act that keeps a word, kanji, sentence or story (a door to a room of saved things is not one)
  const KEEP = /^(save|saved|saved ✓( ▾)?|save ▾|keep|kept|memori[sz]e|memorizing( — tap to stop)?|add to review|add to (a )?list…?|add .+ to a list|save (the|this) sentence|save link|saved · remove|remove saved link|(save|keep) \S.{0,24}|保存|保存 ▾|保存済み( ✓)?( ▾)?|覚える|覚える ✓.*|この文を保存|リンクを保存|保存済み · 外す|保存リンクを外す|リストに追加…?|「.+」をリストに追加|「.+」を保存|\S{1,12}を保存)$/iu;
  // saves of a form (a note, a key, a source's times): they keep the learner's own writing or a setting, not a learning item
  // his own writing kept as he wrote it (a note, a source he pasted, a key, his practice answers, a list's new name): not a
  // learning item, so not the one Save
  const FORM_SAVE = /^(save (note|changes|source|listening source|excerpt and time|transcript and times|and leave|on this device|my response|my understanding)|keep it|メモを保存|変更を保存|出典と一緒に保存|聞く出典として保存|抜粋と時刻を保存|字幕と時刻を保存|中断して保存|保存する|回答を保存|理解したことを保存)$/iu;
  // painted: on the glass, whatever its role for a screen reader (a mark or a chip hidden from assistive tech still shows)
  const painted = (el) => {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    // a room a page covers is inert (G1b): it is under the page, not on the glass
    if (el.closest('[hidden], [inert]')) return false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || Number(cs.opacity) === 0) return false;
      if (n === el && cs.visibility === 'hidden') return false;
    }
    return true;
  };
  const shown = painted;
  const sig = (el) => (el.id ? `#${el.id}` : '') + el.tagName.toLowerCase() + [...el.classList].slice(0, 4).map((c) => `.${c}`).join('');
  const where = (el) => {
    const path = [];
    for (let n = el; n && n !== document.body && path.length < 5; n = n.parentElement) path.unshift(sig(n));
    return path.join(' > ');
  };
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/gu, ' ').trim();
  const out = { provenance: [], captions: [], keeps: [], formSaves: [], marks: [], view: document.body.dataset.view || '' };
  // P and C: visible text, names, tooltips and placeholders
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seenP = new Set();
  const seenC = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    const text = (node.textContent || '').replace(/\s+/gu, ' ').trim();
    if (!text || !parent || parent.closest('script, style, noscript, template')) continue;
    if (!shown(parent)) continue;
    if (PROV.test(text) && !seenP.has(parent)) { seenP.add(parent); out.provenance.push({ where: where(parent), text: text.slice(0, 160) }); }
    if (CAPTION.test(text) && !seenC.has(parent)) { seenC.add(parent); out.captions.push({ where: where(parent), text: text.slice(0, 160) }); }
  }
  for (const el of document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')) {
    if (!shown(el)) continue;
    for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      if (PROV.test(value)) out.provenance.push({ where: where(el), attr, text: value.slice(0, 160) });
      if (CAPTION.test(value)) out.captions.push({ where: where(el), attr, text: value.slice(0, 160) });
    }
  }
  // K: every control named for keeping
  for (const el of document.querySelectorAll('button, [role="button"], a[href], summary')) {
    if (!shown(el)) continue;
    // a Japanese word in the text is a door to its own entry, never a control named for its meaning
    if (el.matches('.japanese-lookup-word, .tok, .today-star, [data-ui-content="learning"]') || el.closest('[data-ui-content="learning"]')) continue;
    const label = name(el);
    if (!label) continue;
    if (FORM_SAVE.test(label) || el.closest('.list-rename, .list-maker')) { out.formSaves.push({ where: where(el), text: label.slice(0, 80) }); continue; }
    if (!KEEP.test(label)) continue;
    const r = el.getBoundingClientRect();
    out.keeps.push({
      where: where(el), text: label.slice(0, 80), id: el.id || '', one: el.matches('button.save-one[data-save-one]'),
      menu: el.getAttribute('aria-haspopup') || '', pressed: el.getAttribute('aria-pressed'),
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    });
  }
  // C beside a Save: the text standing with each keep control in its own row (the control's parent), outside the control
  for (const el of document.querySelectorAll('button.save-one, #mini-take, #sheet-take, #take, .teacher-save, #chrome-keep')) {
    if (!shown(el) || !el.parentElement) continue;
    for (const sib of el.parentElement.children) {
      if (sib === el || sib.contains(el) || !shown(sib)) continue;
      const text = (sib.textContent || '').replace(/\s+/gu, ' ').trim();
      if (text && BESIDE.test(text) && !sib.matches('button, [role="button"]')) out.captions.push({ where: where(sib), text: `beside ${sig(el)}: ${text.slice(0, 120)}` });
    }
    const tip = el.getAttribute('title') || '';
    if (BESIDE.test(tip)) out.captions.push({ where: where(el), attr: 'title', text: `on ${sig(el)}: ${tip.slice(0, 120)}` });
  }
  // M: registration / crop / corner marks, by style
  const px = (v) => parseFloat(v) || 0;
  const hair = (v) => { const n = px(v); return n > 0 && n <= 1.6; };
  const short = (v) => { const n = px(v); return n > 0 && n <= 22; };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    if (!shown(el)) continue;
    const named = [...el.classList].find((c) => /(^|-)(reg|tombo|crop|corner-mark|regmark)(-|$)/iu.test(c));
    if (named) out.marks.push({ where: where(el), kind: `class .${named}` });
    const parts = {};
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      if (pseudo && (cs.content === 'none' || cs.content === 'normal' || cs.display === 'none')) continue;
      if (pseudo && /^["'][+＋✚✛✜✢]["']$/u.test(cs.content)) out.marks.push({ where: where(el), kind: `glyph ${pseudo} ${cs.content}` });
      // hairline crosses drawn as background layers: two or more layers whose size is a hairline by ≤ 22 px
      const sizes = cs.backgroundSize.split(',').map((s) => s.trim().split(/\s+/u));
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && /gradient/u.test(cs.backgroundImage)) {
        const ticks = sizes.filter(([w, h]) => (hair(w) && short(h)) || (hair(h) && short(w))).length;
        if (ticks >= 2) out.marks.push({ where: where(el), kind: `background crosses ${pseudo || ''} (${ticks} hairline layers)` });
      }
      if (pseudo && cs.position === 'absolute') {
        parts[pseudo] = { w: px(cs.width), h: px(cs.height),
          borders: ['Top', 'Right', 'Bottom', 'Left'].filter((s) => px(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none'),
          paint: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent' };
        // a corner bracket: a small box with exactly two adjacent sides drawn
        const p = parts[pseudo];
        const adjacent = p.borders.length === 2 && ['TopRight', 'RightBottom', 'BottomLeft', 'TopLeft'].some((pair) => pair === p.borders.join('') || pair === [...p.borders].reverse().join(''));
        // a chevron is a bracket turned 45°: an arrow, not a mark. A corner mark stands square in a corner of a larger surface
        const m = cs.transform && cs.transform !== 'none' ? cs.transform.match(/matrix\(([^)]+)\)/u)?.[1].split(',').map(Number) : null;
        const turned = !!m && (Math.abs(m[1]) > 0.01 || Math.abs(m[2]) > 0.01);
        const host = el.getBoundingClientRect();
        const off = { l: px(cs.left), t: px(cs.top), r: px(cs.right), b: px(cs.bottom) };
        const cornered = host.width >= 48 && host.height >= 48 && [off.l, off.r].some((v) => Math.abs(v) <= 20) && [off.t, off.b].some((v) => Math.abs(v) <= 20);
        if (short(cs.width) && short(cs.height) && adjacent && !p.paint && !turned && cornered) out.marks.push({ where: where(el), kind: `corner bracket ${pseudo}` });
      }
    }
    // two perpendicular hairline bars as ::before and ::after: a cross
    const b = parts['::before'];
    const a = parts['::after'];
    if (b && a && b.paint && a.paint && ((hair(b.w) && short(b.h) && hair(a.h) && short(a.w)) || (hair(b.h) && short(b.w) && hair(a.w) && short(a.h))))
      out.marks.push({ where: where(el), kind: 'hairline cross (::before × ::after)' });
  }
  return out;
}

/** WCAG contrast of two colours as the engine reports them — rgb()/rgba(), or WebKit's color(srgb r g b) for a mixed
 * value — the second assumed opaque. */
function contrast(a, b) {
  const rgb = (c) => {
    const nums = String(c).match(/[\d.]+/gu).map(Number);
    return /color\(srgb/u.test(String(c)) ? nums.slice(0, 3).map((v) => v * 255) : nums.slice(0, 3);
  };
  const lum = (c) => rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const inventory = [];
const summary = { P: 0, C: 0, K: 0, Kone: 0, M: 0, rooms: 0 };

/* N · the shelf's rows and cards. The provenance words are scanPage's own (checked identical below); the originals are
 * the review queue's rows of kind "original" (docs/content/feed-review-queue.json), the twenty that joined in slice N. */
const PROV_N = /made by ai|ai[- ]?(made|generated|written)|written by ai|questions made by ai|unreviewed|un-reviewed|not yet checked|checked by a person|awaiting (john'?s )?review|machine[- ]checked|human[- ]review|provisional|AI作成|AIが(書|作)|未確認|検収|人の(目|確認)|人による確認|\b\d+ of \d+ not yet/iu;
assert(scanPage.toString().includes(PROV_N.source), "N's provenance words are scanPage's own");
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ORIGINALS = JSON.parse(readFileSync(resolve(REPO, 'docs/content/feed-review-queue.json'), 'utf8'))
  .filter((row) => row.kind === 'original' && row.decision !== 'rejected').map((row) => row.id);
const levelOf = (row) => (/^N[1-5]\+?$/u.test(row.authorLevel || '') ? row.authorLevel : null) ?? row.jlpt;
async function shelfRowsAndCards(page, engine, lang) {
  const label = `${engine} ${lang} · N`;
  const rows = await page.evaluate(() => window.__SWEEP__.rows());
  const cards = await page.evaluate(() => window.__SWEEP__.cards());
  const day = await page.evaluate(() => window.__SWEEP__.day());
  const pick = await page.evaluate(() => window.__SWEEP__.todayPick());
  const shelfText = await page.evaluate(() => window.__SWEEP__.pageText());
  const byId = new Map(rows.map((row) => [row.id, row]));
  const hidden = [...new Set(rows.flatMap((row) => row.hidden))];
  // the drop in its own (index) order, as the shelf's daily rotation shows it: three of its first twelve lead
  const drop = rows.filter((row) => ORIGINALS.includes(row.id)).map((row) => row.id);
  const offset = ((Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000) * 3) % 12 + 12) % 12;
  const window12 = drop.slice(0, 12);
  const leading = [0, 1, 2].map((i) => window12[(offset + i) % window12.length]);
  const expectedLead = [...leading, ...drop.filter((id) => !leading.includes(id))];
  const grid = cards.filter((card) => !card.band).map((card) => card.id);
  const walked = [];
  for (const row of rows) {
    const seen = await page.evaluate((id) => window.__SWEEP__.openRow(id), row.id);
    walked.push({ row, seen });
  }
  await page.evaluate(() => window.__SWEEP__.visit('shelf'));
  inventory.push({ engine, lang, room: 'rows-and-cards', day, offset, pick, cards: cards.map(({ id, band, chips }) => ({ id, band, chips })),
    rows: walked.map(({ row, seen }) => ({ id: row.id, review: row.review, level: levelOf(row), chips: seen.chips, contexts: seen.contexts })) });
  if (MODE !== 'verify') return;
  check(`${label} the shelf's originals are the queue's (${ORIGINALS.length})`, drop.length === ORIGINALS.length && ORIGINALS.length > 0,
    `${drop.length} of ${ORIGINALS.length}`);
  check(`${label} the newest drop leads the shelf: its ${drop.length} cards come first, today's three (offset ${offset}) at the top`,
    JSON.stringify(grid.slice(0, drop.length)) === JSON.stringify(expectedLead), JSON.stringify({ day, grid: grid.slice(0, drop.length), expectedLead }));
  check(`${label} Today's story is the drop's first reading`, pick === drop[0], `${pick} (want ${drop[0]})`);
  const cardTrouble = cards.filter((card) => {
    const row = byId.get(card.id);
    return !row || card.chips.length !== 1 || (levelOf(row) && card.chips[0] !== levelOf(row)) || PROV_N.test(card.text);
  }).map((card) => `${card.id}:${card.chips.join('/')}`);
  check(`${label} every card (${cards.length}) carries one level — the written-for level where the row has one — and no provenance word`,
    cards.length >= rows.length - 6 && cardTrouble.length === 0, cardTrouble.slice(0, 6).join(' | '));
  const originals = drop.map((id) => byId.get(id));
  const labelled = originals.filter((row) => row.review !== null || row.pending || /検収前/u.test(row.sourceLabel) || row.learnerLabel !== row.sourceLabel ||
    PROV_N.test(`${row.sourceLabel} ${row.attribution} ${row.title} ${row.titleEn} ${row.context ?? ''}`)).map((row) => row.id);
  check(`${label} the originals carry no review value, no 検収前 and no provenance word in what the learner reads`, labelled.length === 0, labelled.join(', '));
  const rowTrouble = [];
  for (const { row, seen } of walked) {
    const problems = [];
    if (seen.title !== row.title) problems.push('not opened');
    if (seen.chips.length !== 1 || (levelOf(row) && seen.chips[0] !== levelOf(row))) problems.push(`level ${seen.chips.join('/')}`);
    if (row.context) {
      const [line] = seen.contexts;
      if (seen.contexts.length !== 1 || line.text !== row.context || !line.inCard || !line.placed || line.boxed) problems.push(`context ${JSON.stringify(seen.contexts)}`);
    } else if (seen.contexts.length) problems.push(`stray context ${JSON.stringify(seen.contexts)}`);
    const prov = seen.text.match(PROV_N);
    if (prov) problems.push(`provenance "${prov[0]}"`);
    const shown = hidden.filter((value) => seen.text.includes(value));
    if (shown.length) problems.push(`authoring drawn: ${shown.join(' / ')}`);
    if (problems.length) rowTrouble.push(`${row.id}: ${problems.join(', ')}`);
  }
  const withContext = rows.filter((row) => row.context).length;
  check(`${label} every row read (${walked.length}): one level, no provenance, no authoring drawn; the context line on the ${withContext} rows that carry it, under the title, and on no other`,
    walked.length === rows.length && withContext > 0 && rowTrouble.length === 0, rowTrouble.slice(0, 6).join(' | '));
  const onShelf = hidden.filter((value) => shelfText.includes(value));
  check(`${label} no row's authoring record is drawn on the shelf`, hidden.length > 0 && onShelf.length === 0, onShelf.join(' / '));
}
const SOURCE_TEXT = '町の図書館に着くと、窓の近くに席があった。そこで友達と会い、次に読む本を選んだ。';
try {
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch();
    try {
      for (const lang of ['bi', 'ja']) {
        const context = await browser.newContext(phone);
        await silenceBrowserAudio(context);
        const page = await context.newPage();
        page.setDefaultTimeout(25_000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/corridor.js', async (route) => {
          const response = await route.fetch();
          await route.fulfill({ response, body: `${await response.text()}\n${BRIDGE}` });
        });
        const settle = async (ms = 500) => {
          await page.waitForTimeout(ms);
          await page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity).length === 0, null, { timeout: 4000 }).catch(() => {});
        };
        const boot = async (query = '') => {
          await page.goto(`${host.origin}/index.html?ui=${lang}${query}`);
          await page.waitForFunction(() => document.body.dataset.ready === '1' && window.__SWEEP__?.ready(), null, { timeout: 90_000 });
          await settle(900);
        };
        const tap = async (selector) => {
          const target = page.locator(selector).first();
          await target.scrollIntoViewIfNeeded();
          const box = await target.boundingBox();
          if (!box) throw new Error(`no box for ${selector}`);
          await page.touchscreen.tap(box.x + box.width / 2, box.y + Math.min(box.height / 2, 30));
          await settle(450);
        };
        let shotN = 0;
        const room = async (id, act, extra = null) => {
          const label = `${engine} ${lang} · ${id}`;
          try {
            await act();
          } catch (error) {
            check(`${label} · the room opens`, false, error.message);
            return null;
          }
          if (NEGATIVE === 'chip' && id === 'reader') {
            await page.evaluate(() => {
              const chip = document.createElement('span');
              chip.className = 'status-chip';
              chip.textContent = 'Made by AI';
              (document.querySelector('.reader-meta') || document.querySelector('main')).append(chip);
            });
          }
          if (NEGATIVE === 'box' && id === 'today-cards') {
            // the negative control for T: the cards line filled as a key again (the base's look) — red here and only here
            await page.addStyleTag({ content: '#review-start { background: #1f3a5f !important; color: #fff !important; }' });
          }
          const found = await page.evaluate(scanPage);
          const more = extra ? await extra() : null;
          summary.rooms += 1;
          summary.P += found.provenance.length;
          summary.C += found.captions.length;
          summary.K += found.keeps.length;
          summary.Kone += found.keeps.filter((k) => k.one).length;
          summary.M += found.marks.length;
          let shot = null;
          if (SHOTS && engine === 'webkit') {
            shotN += 1;
            shot = join(out, 'rooms', `${String(shotN).padStart(2, '0')}-${lang}-${id}.png`);
            await page.screenshot({ path: shot });
          }
          inventory.push({ engine, lang, room: id, view: found.view, ...found, extra: more, shot });
          if (MODE === 'verify') {
            check(`${label} · P no provenance label`, found.provenance.length === 0, JSON.stringify(found.provenance));
            check(`${label} · C no review caption`, found.captions.length === 0, JSON.stringify(found.captions));
            check(`${label} · K every keep control is the one Save`, found.keeps.every((k) => k.one), JSON.stringify(found.keeps.filter((k) => !k.one)));
            check(`${label} · M no registration or corner mark`, found.marks.length === 0, JSON.stringify(found.marks));
          }
          return { found, more };
        };

        // T: Today's line read off the page — no box, none inside it; whether the cards line is there (a record with cards)
        const todayLine = () => page.evaluate(() => {
            const line = document.querySelector('#app main .today-line');
            // the paint's alpha, as either engine reports it: rgb()/rgba(), or WebKit's color(srgb r g b / a)
            const alpha = (c) => {
              const srgb = String(c).match(/color\(srgb [\d.]+ [\d.]+ [\d.]+(?: \/ ([\d.]+))?\)/u);
              if (srgb) return srgb[1] == null ? 1 : Number(srgb[1]);
              const m = String(c).match(/rgba?\(([^)]+)\)/u);
              if (!m) return 1;
              const p = m[1].split(/[ ,/]+/u).filter(Boolean);
              return p.length > 3 ? Number(p[3]) : 1;
            };
            // a box: three or more drawn sides, a lifting shadow, or a surface of its own (a filled key is a box too)
            const boxed = (n) => {
              const cs = getComputedStyle(n);
              const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none').length;
              const r = n.getBoundingClientRect();
              // a hairline or an arrow's stroke paints, but it is no surface: a box is at least 12 px each way
              return r.width >= 12 && r.height >= 12 && (sides >= 3 || (cs.boxShadow !== 'none' && !/^inset/u.test(cs.boxShadow)) || alpha(cs.backgroundColor) > 0.08);
            };
            const inner = line ? [...line.querySelectorAll('*')].filter((n) => n.getClientRects().length && boxed(n)).map((n) => n.id || n.className || n.tagName) : [];
            const stars = [...document.querySelectorAll('.today-star')].filter((n) => !n.hidden).map((n) => ({ text: n.textContent, kind: n.className, why: n.dataset.why || '' }));
            return { line: !!line, lineBoxed: line ? boxed(line) : null, innerBoxes: inner, stars, cards: !!line?.querySelector('#review-start') };
          });
        await boot('&entry=shelf');
        // Read: the shelf, a story, its card, the card's Save menu, the page, the page's sentence and foot
        await room('shelf', async () => { await page.evaluate(() => window.__SWEEP__.visit('shelf')); await settle(700); });
        await shelfRowsAndCards(page, engine, lang);
        await room('reader', async () => { await page.evaluate(() => window.__SWEEP__.reader('スタートアップ')); await settle(900); }, () => page.evaluate(() => {
          const keep = document.getElementById('chrome-keep');
          return { barKeep: keep ? { text: keep.textContent.replace(/\s+/gu, ' ').trim(), one: keep.matches('button.save-one[data-save-one]'), shown: !!keep.getClientRects().length } : null };
        }));
        const word = '総理';
        await room('reader-card', async () => { await tap(`#reader .tok[aria-label="${word}"]`); await page.locator('#mini').waitFor(); await settle(500); }, () => page.evaluate(() => {
          const keep = document.getElementById('chrome-keep');
          return { barKeep: keep ? { text: keep.textContent.replace(/\s+/gu, ' ').trim(), aria: keep.getAttribute('aria-label') || '', one: keep.matches('button.save-one[data-save-one]') } : null };
        }));
        await room('page', async () => { await tap('#mini button.mini-word'); await page.locator('#sheet').waitFor(); await settle(1000); });
        await room('page-foot', async () => { await page.evaluate(() => { const s = document.getElementById('sheet'); s.scrollTop = s.scrollHeight; }); await settle(500); });
        await room('page-inside-card', async () => {
          await page.evaluate(() => { const s = document.getElementById('sheet'); s.scrollTop = 0; });
          const inner = page.locator('#sheet .tok, #sheet .japanese-lookup-word').filter({ hasText: /\p{Script=Han}/u }).nth(1);
          await inner.scrollIntoViewIfNeeded();
          const b = await inner.boundingBox();
          await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await settle(600);
        });
        await room('reader-card-menu', async () => {
          await page.evaluate(() => window.__SWEEP__.closeLayers());
          await page.evaluate(() => window.__SWEEP__.reader('スタートアップ')); await settle(900);
          await tap(`#reader .tok[aria-label="${word}"]`); await page.locator('#mini-take').waitFor(); await settle(400);
          await tap('#mini-take'); await settle(700);
        });
        await page.evaluate(() => window.__SWEEP__.closeLayers());
        // a kanji's page, an idiom's, a grammar point's
        for (const [id, node] of [['page-kanji', { t: 'kanji', id: '海' }], ['page-grammar', null], ['page-idiom', null]]) {
          await room(id, async () => {
            if (node) await page.evaluate((n) => window.__SWEEP__.sheet(n), node);
            else if (id === 'page-grammar') await page.evaluate(() => window.__SWEEP__.grammar());
            else await page.evaluate(() => window.__SWEEP__.idiom());
            await page.locator('#sheet').waitFor(); await settle(800);
            await page.evaluate(() => { const s = document.getElementById('sheet'); s.scrollTop = s.scrollHeight; }); await settle(300);
          });
        }
        await room('stroke', async () => {
          await page.evaluate(() => window.__SWEEP__.closeLayers());
          await page.evaluate(() => window.__SWEEP__.stroke('海')); await page.locator('#stroke-page').waitFor(); await settle(900);
        });
        // Today, its sky and line; a star's card
        await room('today', async () => { await page.evaluate(() => { window.__SWEEP__.closeLayers(); window.__SWEEP__.visit('tray'); }); await settle(1100); },
          todayLine);
        await room('today-star-card', async () => {
          const star = page.locator('.today-star:not([hidden])').first();
          const b = await star.boundingBox();
          await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
          await page.locator('#mini[data-from="sky"]').waitFor(); await settle(500);
        });
        await room('universe', async () => { await page.evaluate(() => { window.__SWEEP__.closeLayers(); window.__SWEEP__.visit('drift'); }); await settle(1400); });
        // Learn, the deck's home, front and back (藍 and 墨), guided
        await room('learn', async () => { await page.evaluate(() => window.__SWEEP__.visit('dojo')); await settle(900); });
        const deckBar = () => page.evaluate(() => {
          const bar = document.querySelector('#app .kp-top-study');
          if (!bar) return null;
          const cs = getComputedStyle(bar);
          const parts = [...bar.querySelectorAll('button, .kp-count')].filter((n) => n.getClientRects().length).map((n) => ({ sig: n.id || n.className, color: getComputedStyle(n).color }));
          return { bg: cs.backgroundColor, bgImage: cs.backgroundImage, parts, theme: document.documentElement.dataset.theme || '' };
        });
        for (const theme of ['hokusai', 'sumi']) {
          await room(`deck-home-${theme}`, async () => {
            await page.evaluate((t) => { window.__SWEEP__.theme(t); window.__SWEEP__.deck('n2'); }, theme);
            await page.locator('#app .kp').waitFor(); await settle(1200);
            // a sitting left open stays open through a host repaint: its ‹ goes home
            if (await page.locator('#app .kp-study #kp-quit').count()) { await page.locator('#kp-quit').click(); await page.locator('#app .kp-home').waitFor(); await settle(800); }
          });
          await room(`deck-front-${theme}`, async () => {
            const begin = page.locator('#app .kp-home button.kp-primary, #app .kp-home .kp-begin, #app button[data-kp="begin"]').first();
            if (await begin.count()) await begin.click(); else await page.getByRole('button', { name: /Begin|始める|はじめる/u }).first().click();
            await page.locator('#app .kp-study').waitFor(); await settle(1000);
          }, deckBar);
          await room(`deck-back-${theme}`, async () => { await tap('#kp-reveal'); await settle(900); }, deckBar);
          await room(`deck-back-card-${theme}`, async () => {
            const w = page.locator('#app .kp-study .kp-tok, #app .kp-study .kp-w').filter({ hasText: /\p{Script=Han}/u }).first();
            if (await w.count()) { const b = await w.boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await settle(700); }
          });
          await page.evaluate(() => window.__SWEEP__.closeLayers());
        }
        await page.evaluate(() => window.__SWEEP__.theme('hokusai'));
        await room('guided', async () => { await page.evaluate(() => window.__SWEEP__.visit('guided')); await settle(1500); });
        // Words: search, results, kanji by shape, grammar, idioms, the word web
        await room('search', async () => { await page.evaluate(() => window.__SWEEP__.visit('search')); await settle(800); });
        await room('search-results', async () => { await page.evaluate(() => window.__SWEEP__.search('海')); await settle(1500); });
        for (const view of ['kanjidex', 'grammar', 'yoji', 'thesaurus']) await room(view, async () => { await page.evaluate((v) => window.__SWEEP__.visit(v), view); await settle(1000); });
        // lists and saved words, the reference library and an entry from it
        for (const view of ['list', 'saved', 'browse', 'levels']) await room(view, async () => { await page.evaluate((v) => window.__SWEEP__.visit(v), view); await settle(1000); });
        // Me, Settings, progress, the tests, lessons, the older rooms
        for (const view of ['me', 'settings', 'kagami', 'srs-stats', 'mock', 'tests', 'lessons', 'archive', 'feed', 'publisher', 'source-inbox', 'airead', 'sentence-practice', 'ai', 'probe', 'review'])
          await room(view, async () => { await page.evaluate((v) => window.__SWEEP__.visit(v), view); await settle(1000); });
        // a source of his own, read with text selected: what keeps the selected text (with its source) is a Save too
        const sourceSelection = async () => {
          await page.evaluate(() => window.__SWEEP__.visit('source-inbox'));
          await settle(700);
          await page.locator('#source-capture-text').fill(SOURCE_TEXT);
          await page.locator('#source-capture-save').click();
          await page.locator('#source-reader-body').waitFor();
          await settle(600);
          await page.evaluate(() => window.__SWEEP__.selectIn('#source-reader-body', '図書館'));
          await page.waitForFunction(() => document.querySelector('#source-context-save')?.disabled === false);
          await settle(300);
        };
        await room('source-reader-selection', sourceSelection);
        // the report form
        await room('report-form', async () => {
          await page.evaluate(() => window.__SWEEP__.visit('shelf'));
          await settle(600);
          await page.locator('#bunki-report-bug').click();
          await page.locator('dialog.br-sheet[open]').waitFor(); await settle(500);
        });
        await page.evaluate(() => document.querySelector('dialog.br-sheet[open]')?.close());
        if (MODE === 'verify') {
          // K · one behaviour on every kind of place a Save stands: a card (the reader's, the sky's), a row (the page's
          // sentence), a bar (the page's, the reader's) — one press keeps and opens its menu, which covers nothing in reach
          const menu = async (id, scope, prepare, save) => {
            const label = `${engine} ${lang} · K ${id}`;
            try {
              await prepare();
              const before = await page.evaluate(reachable, scope);
              if (NEGATIVE === 'cover') {
                // the negative control: the page no longer steps down for a bar's drawer — the drawer lies over the page
                await page.addStyleTag({ content: "html[data-save-drawer] :is(#app > .chrome, #sheet > .sheet-bar) { margin-bottom: 0 !important; }" });
              }
              await tap(save);
              await page.waitForSelector('#vocabulary-list-popover', { timeout: 6000 });
              await settle(500);
              const state = await page.evaluate((sel) => {
                const b = document.querySelector(sel);
                return b ? { pressed: b.getAttribute('aria-pressed'), expanded: b.getAttribute('aria-expanded'), text: b.textContent.replace(/\s+/gu, ' ').trim() } : null;
              }, save);
              const cover = await page.evaluate(coveredBy, { before, scope });
              check(`${label} · one press keeps it and opens its menu`, state?.pressed === 'true' && state.expanded === 'true' && cover.open,
                JSON.stringify({ state, place: cover.place }));
              check(`${label} · its menu covers no control that was in reach`, cover.open && cover.checked > 0 && cover.covered.length === 0,
                JSON.stringify(cover));
            } catch (error) {
              check(`${label} · one press keeps it and opens its menu`, false, error.message);
            }
            await page.keyboard.press('Escape');
            await settle(250);
            await page.evaluate(() => window.__SWEEP__.closeLayers());
            await settle(300);
          };
          const story = async (y) => {
            await page.evaluate(() => window.__SWEEP__.closeLayers());
            await page.evaluate(() => window.__SWEEP__.reader('スタートアップ'));
            await settle(900);
            await page.evaluate((top) => window.scrollTo(0, top), y);
            await settle(400);
          };
          await menu('the reader card', '#mini', async () => {
            await story(0);
            await tap('#reader .tok[aria-label="出席"]');
            await page.locator('#mini-take').waitFor();
            await settle(400);
          }, '#mini-take');
          await menu("the reader's bar", null, async () => {
            await story(260);
            await tap('#reader .tok[aria-label="官邸"]');
            await page.locator('#mini').waitFor();
            await page.keyboard.press('Escape');
            await settle(400);
          }, '#chrome-keep');
          const wordPage = async () => {
            await story(0);
            await tap('#reader .tok[aria-label="大臣"]');
            await page.locator('#mini button.mini-word').waitFor();
            await tap('#mini button.mini-word');
            await page.locator('#sheet .sheet-bar').waitFor();
            await settle(1100);
          };
          await menu("the page's bar", null, async () => {
            await wordPage();
            await page.evaluate(() => { document.getElementById('sheet').scrollTop = 300; });
            await settle(400);
          }, '#sheet-take');
          await menu("the page's sentence", '#sheet', async () => {
            await wordPage();
            await page.evaluate(() => document.querySelector('#sheet .teacher-save')?.scrollIntoView({ block: 'center' }));
            await settle(400);
          }, '#sheet .teacher-save');
          await menu("the source's selection", null, sourceSelection, '#source-context-save');
          await menu('the sky card', '#mini', async () => {
            await page.evaluate(() => { window.__SWEEP__.closeLayers(); window.__SWEEP__.visit('tray'); });
            await settle(1100);
            const star = page.locator('.today-star:not([hidden])').first();
            const b = await star.boundingBox();
            await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
            await page.locator('#mini[data-from="sky"] #mini-take').waitFor();
            await settle(500);
          }, '#mini[data-from="sky"] #mini-take');
          // T again, with cards waiting (the words the Saves above kept): the cards line is there and still no box
          await room('today-cards', async () => {
            await page.evaluate(() => { window.__SWEEP__.closeLayers(); window.__SWEEP__.visit('tray'); });
            await settle(1100);
          }, todayLine);
        }
        // the layout under test: its five places
        await page.evaluate(() => window.__SWEEP__.layout('places'));
        for (const view of ['dojo', 'shelf', 'search', 'tests', 'me']) await room(`places-${view}`, async () => { await page.evaluate((v) => window.__SWEEP__.visit(v), view); await settle(900); });
        await page.evaluate(() => window.__SWEEP__.layout('current'));
        if (MODE === 'verify') check(`${engine} ${lang} · no page errors on the walk`, errors.length === 0, errors.join(' | '));
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }

  if (MODE === 'verify') {
    // B: the reader's bar carries the labelled keep, on the one Save path
    for (const row of inventory.filter((r) => r.room === 'reader' || r.room === 'reader-card')) {
      const keep = row.extra?.barKeep;
      const label = `${row.engine} ${row.lang} · ${row.room}`;
      check(`${label} · B the bar carries the keep control, labelled in words, the one Save`,
        !!keep && keep.one && /\S{2,}/u.test(keep.text) && (row.lang === 'ja' ? /保存/u.test(keep.text) : /\bSave/u.test(keep.text)), JSON.stringify(keep));
      if (row.room === 'reader-card') check(`${label} · B it names the word last touched (総理)`, !!keep && keep.text.includes('総理'), JSON.stringify(keep));
    }
    // D: the deck's bar is a band in the world's deep pigment; its words at 4.5:1 on it
    for (const row of inventory.filter((r) => /^deck-(front|back)-(hokusai|sumi)$/u.test(r.room))) {
      const bar = row.extra;
      const label = `${row.engine} ${row.lang} · ${row.room}`;
      const solid = !!bar && /^(rgb\(|color\(srgb )/u.test(bar.bg) && !/, 0\)$| \/ 0\)$/u.test(bar.bg);
      const dark = solid && contrast(bar.bg, 'rgb(255, 255, 255)') >= 7;
      check(`${label} · D the deck's bar is a solid deep band`, solid && dark, JSON.stringify(bar));
      const low = bar && solid ? Math.min(...bar.parts.map((p) => contrast(p.color, bar.bg))) : 0;
      check(`${label} · D its back, count and Remove hold 4.5:1 on the band`, solid && bar.parts.length >= 3 && low >= 4.5, `${low.toFixed(2)}:1 ${JSON.stringify(bar?.parts)}`);
    }
    // T: Today's line is one surface, no box inside it
    for (const row of inventory.filter((r) => r.room === 'today' || r.room === 'today-cards')) {
      const t = row.extra;
      const label = row.room === 'today' ? "T Today's line is no box and holds none" : "T with cards waiting, Today's cards line is there, no box and none inside";
      check(`${row.engine} ${row.lang} · ${label}`, !!t && t.line && t.lineBoxed === false && t.innerBoxes.length === 0 && (row.room === 'today' || t.cards),
        JSON.stringify({ line: t?.lineBoxed, inner: t?.innerBoxes, cards: t?.cards }));
    }
    // the walk itself: every room was reached (a room that does not open cannot hide an instance)
    check('the walk reached every room in both languages and both engines', summary.rooms >= Object.keys(engines).length * 2 * 50, `${summary.rooms} rooms`);
  }
  const failed = checks.filter((c) => !c.pass);
  console.log(`inventory: ${summary.rooms} rooms · provenance ${summary.P} · captions ${summary.C} · keep controls ${summary.K} (one Save ${summary.Kone}) · marks ${summary.M}`);
  if (MODE === 'verify') {
    console.log(failed.length ? `SWEEP FAIL — ${failed.length} of ${checks.length}` : `SWEEP PASS — ${checks.length} checks`);
    if (failed.length) process.exitCode = 1;
  } else console.log(`SWEEP INVENTORY — ${inventory.length} room scans written`);
} finally {
  writeFileSync(join(out, 'sweep.json'), `${JSON.stringify({ mode: MODE, negative: NEGATIVE, summary, checks, inventory }, null, 1)}\n`);
  await host.close();
}
assert(MODE === 'inventory' || checks.length > 0, 'at least one check ran');
