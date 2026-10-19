/**
 * Phase 2 — extract the Drift universe from prototypes/drift/drift-artifact.html
 * (the red-team-hardened source of truth, which stays byte-untouched) into a
 * corridor entry layer: scoped CSS, a markup fragment, and the script wrapped
 * with a visibility gate so the universe fully sleeps while other corridor
 * views are open.
 *
 * Every patch below is an EXACT-STRING replacement asserted to occur exactly
 * once. If drift-artifact.html changes shape, this build fails loudly instead
 * of emitting a silently-broken fusion — honest coupling, not a fork.
 *
 * Outputs (committed, like the data bundles):
 *   drift-layer.css   — drift's styles scoped under #drift-layer
 *   drift-layer.html  — the layer's inner markup fragment
 *   drift-layer.js    — the gated script exposing window.__DRIFT__
 *
 * Usage: node build-drift-layer.mjs [--check]
 *   --check  write nothing; exit 1 if the committed outputs differ from a rebuild
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVocabulary, CLIP_CAP, looksClipped } from './gloss-text.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const SRC = resolve(CORRIDOR, '..', 'drift', 'drift-artifact.html');

const src = readFileSync(SRC, 'utf8');

const slice = (after, before, label) => {
  const a = src.indexOf(after);
  if (a < 0) throw new Error(`anchor not found: ${label} start "${after.slice(0, 40)}"`);
  const b = src.indexOf(before, a + after.length);
  if (b < 0) throw new Error(`anchor not found: ${label} end "${before.slice(0, 40)}"`);
  return src.slice(a + after.length, b);
};

/* ------------------------------------------------------------------ css */
// Comments are stripped BEFORE scoping. The scoper treats everything between
// `}` and `{` as the selector list and splits it on commas — a `/* ... */` that
// carries a comma there would be sliced into several invalid selectors, and an
// invalid selector kills its whole rule, silently. Stripping first means the
// drift source may comment its CSS the way it comments everything else.
let rawCss = slice('<style>', '</style>', 'style block').replace(/\/\*[\s\S]*?\*\//g, '');
// The donor stays frozen. Presentation state changes land immediately; only
// transform and opacity interpolate in the fused app (VISION §10.2 check 6).
// Exact-once anchors pin the known donor declarations; the final policy
// guard also rejects any new interpolated property after extraction.
const cssPatch = (from, to, label) => {
  const first = rawCss.indexOf(from);
  if (first < 0 || rawCss.indexOf(from, first + from.length) >= 0)
    throw new Error(`CSS anchor missing or ambiguous (${label})`);
  rawCss = rawCss.slice(0, first) + to + rawCss.slice(first + from.length);
};
cssPatch('transition:background-color 1.2s', 'transition:none', 'world colour');
// the card's rise takes the house's curve (the one set on :root; the drift layer sits in body and inherits it)
cssPatch('transition:transform .5s cubic-bezier(.2,.8,.2,1)', 'transition:transform .5s var(--ease-standard)', 'card rise curve');
cssPatch('transition:filter .9s', 'transition:none', 'word sharpness');
cssPatch('transition:opacity .4s,width .25s', 'transition:opacity .4s', 'level rail');
cssPatch('transition:background .25s,width .25s,box-shadow .25s', 'transition:none', 'level track');
cssPatch('transition:width .25s,height .25s,left .25s,margin .25s,background .25s,box-shadow .25s', 'transition:none', 'level handle');
cssPatch('transition:opacity .3s,left .25s,font-size .25s', 'transition:opacity .3s', 'level information');

// The four radii of the house (one hand, slice D): control 6 · card 4 · overlay 18 · seal 3, read from the
// tokens on :root; the sky's pills and plaques are controls and cards like every other, and the card that
// rises from the word is an overlay. The round things (the symbol, the level handle) stay round.
cssPatch('border-radius:6px;padding:2px 7px;background:var(--plaque)}', 'border-radius:var(--radius-control);padding:2px 7px;background:var(--plaque)}', 'plaque chip radius');
cssPatch('background:#B13A2F;color:#FFF8EE;border-radius:3px;', 'background:#B13A2F;color:#FFF8EE;border-radius:var(--radius-seal);', 'level seal radius');
cssPatch('border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-family:inherit;cursor:pointer}', 'border:1px solid var(--line);border-radius:var(--radius-control);padding:6px 14px;font-family:inherit;cursor:pointer}', 'plaque button radius');
cssPatch('background:var(--plaque);border:1px solid var(--line);border-radius:999px;', 'background:var(--plaque);border:1px solid var(--line);border-radius:var(--radius-control);', 'plaque pill radius');
cssPatch('border:1px solid var(--line);border-radius:14px;', 'border:1px solid var(--line);border-radius:var(--radius-overlay);', 'card radius');
cssPatch('#card .row div{flex:1;border:1px solid var(--line);border-radius:10px;', '#card .row div{flex:1;border:1px solid var(--line);border-radius:var(--radius-card);', 'card row radius');
cssPatch('background:none;border:1px solid var(--line);border-radius:999px;padding:3px 9px;', 'background:none;border:1px solid var(--line);border-radius:var(--radius-control);padding:3px 9px;', 'level pill radius');
cssPatch('background:none;border:1px solid var(--line);border-radius:999px;', 'background:none;border:1px solid var(--line);border-radius:var(--radius-control);', 'card button radius');
cssPatch('border:1px solid var(--line);border-radius:8px;color:var(--ink)}', 'border:1px solid var(--line);border-radius:var(--radius-control);color:var(--ink)}', 'card door radius');
cssPatch('border-radius:2px;transition:none}', 'border-radius:var(--radius-seal);transition:none}', 'level track radius');
cssPatch('background:var(--plaque);border:1px solid var(--line);border-radius:8px;padding:5px 10px;', 'background:var(--plaque);border:1px solid var(--line);border-radius:var(--radius-control);padding:5px 10px;', 'level plaque radius');
cssPatch('border-radius:999px}', 'border-radius:var(--radius-control)}', 'level button radius');
cssPatch('border:1px solid var(--line);border-radius:999px;padding:8px 15px;cursor:pointer;font-family:inherit}', 'border:1px solid var(--line);border-radius:var(--radius-control);padding:8px 15px;cursor:pointer;font-family:inherit}', 'radical door radius');
// The touched word's one mark (family H, slice D): a hairline underline in the reading's colour under the
// word whose reading is shown, no fill — the same mark the reader, the deck and the guided session wear.
cssPatch('.word.unfolded .yomi{opacity:1}', '.word.unfolded .yomi{opacity:1}\n  .word.unfolded .base{box-shadow:inset 0 calc(0px - var(--stroke-hairline, 0.5px)) 0 var(--color-reading)}', 'touched word mark');

// Bundled text faces precede native fallbacks in the fused layer. Preserve the
// donor's reading/italic roles and all metrics without changing the donor.
cssPatch('font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif',
  'font-family:"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif', 'bundled Japanese reading');
cssPatch('font-size:.4em;font-style:italic;font-family:Georgia,serif',
  'font-size:.4em;font-style:italic;font-family:"Noto Serif","Noto Serif JP",Georgia,serif', 'bundled word gloss');
cssPatch('display:block;font-size:11px;font-family:Georgia,serif;font-style:italic',
  'display:block;font-size:11px;font-family:"Noto Serif","Noto Serif JP",Georgia,serif;font-style:italic', 'bundled part gloss');
cssPatch('#card .gloss{font-family:Georgia,serif',
  '#card .gloss{font-family:"Noto Serif","Noto Serif JP",Georgia,serif', 'bundled card gloss');
cssPatch('font-size:11px;color:var(--faint);font-family:Georgia,serif;font-style:italic',
  'font-size:11px;color:var(--faint);font-family:"Noto Serif","Noto Serif JP",Georgia,serif;font-style:italic', 'bundled card kanji gloss');
cssPatch('font-family:Georgia,serif;font-style:italic}',
  'font-family:"Noto Serif","Noto Serif JP",Georgia,serif;font-style:italic}', 'bundled card note');
cssPatch('font-size:12px;color:var(--faint);font-family:Georgia,serif;font-style:italic',
  'font-size:12px;color:var(--faint);font-family:"Noto Serif","Noto Serif JP",Georgia,serif;font-style:italic', 'bundled radical gloss');

// F-4: the frozen donor reads the house's existing type ladder from rooms/motion.css.
// Each selector and size is asserted once; no local numeric ladder or fallback is emitted.
const typeSize = (selector, before, token) => {
  const normal = value => value.split(',').map(part => part.trim()).join(',');
  const rules = [...rawCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(rule => normal(rule[1]) === normal(selector));
  if (rules.length !== 1) throw new Error(`CSS type rule missing or ambiguous: ${selector}`);
  const rule = rules[0], sizes = [...rule[2].matchAll(/\bfont-size\s*:\s*([^;]+)/g)];
  if (sizes.length !== 1 || sizes[0][1].trim() !== before)
    throw new Error(`CSS type size changed: ${selector}`);
  cssPatch(rule[0], rule[0].replace(sizes[0][0], `font-size:var(${token})`), `type ${selector}`);
};
typeSize(".word .yomi", ".44em", "--type-label");
typeSize(".word .gloss", ".4em", "--type-label");
typeSize(".glyph .g", "36px", "--type-hero");
typeSize(".glyph.center small", "8px", "--type-label");
typeSize(".glyph.comp .g", "24px", "--type-section");
typeSize(".glyph small,.part small", "11px", "--type-label");
typeSize(".part .pch", "19px", "--type-lead");
typeSize("#brand", "13px", "--type-label");
typeSize("#seal", "11px", "--type-caption");
typeSize("#depth", "12px", "--type-caption");
typeSize("#theme", "12px", "--type-caption");
typeSize("#tray", "12px", "--type-caption");
typeSize("#hint", "12px", "--type-caption");
typeSize("#card .yomi", "13px", "--type-label");
typeSize("#card h1", "42px", "--type-headword");
typeSize("#card .gloss", "15px", "--type-control");
typeSize("#card .row .k", "24px", "--type-section");
typeSize("#card .row .kg", "11px", "--type-label");
typeSize("#card .note", "11px", "--type-label");
typeSize("#card .bt", "12px", "--type-caption");
typeSize("#card .rhead", "11px", "--type-caption");
typeSize("#card .rrow .rk", "22px", "--type-seal");
typeSize("#card .rrow .rr", "12px", "--type-caption");
typeSize("#card .rrow .rr i", "11px", "--type-caption");
typeSize("#card .rds", "13px", "--type-label");
typeSize("#lvlLabels", "10px", "--type-caption");
typeSize("#lvl.hot #lvlLabels", "13px", "--type-label");
typeSize("#lvlInfo", "11px", "--type-caption");
typeSize("#card .rrow .rm", "12px", "--type-label");
typeSize("#card .study", "13px", "--type-label");
typeSize("#card .rhead .radq", "10px", "--type-caption");
typeSize("#radoc h2", "26px", "--type-section");
typeSize("#radoc .sub", "12px", "--type-caption");
typeSize("#radoc p", "15px", "--type-control");
typeSize("#radoc .rex .rc", "34px", "--type-display");
typeSize("#radoc .rex .rt", "13px", "--type-label");
typeSize("#radoc .x", "13px", "--type-label");

// Scope every rule under #drift-layer. The file has no at-rules (verified
// below); selectors are :root / * / html,body / body / canvas / #id / .class.
if (/@(keyframes|media|font-face|import)/.test(rawCss)) {
  throw new Error('drift CSS grew at-rules — the scoper below no longer holds, revisit');
}
const scopeSelector = (sel) => {
  const s = sel.trim();
  if (s === ':root' || s === 'body' || s === 'html' || s === 'html,body')
    return '#drift-layer';
  if (s === '*') return '#drift-layer, #drift-layer *';
  return s
    .split(',')
    .map((part) => `#drift-layer ${part.trim()}`)
    .join(',\n');
};
const scopedRules = [];
const seen = new Set();
for (const m of rawCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const scoped = scopeSelector(m[1]);
  // html,body / body / :root all collapse onto #drift-layer — merge, keep order
  if (scoped === '#drift-layer' && seen.has('#drift-layer')) {
    scopedRules.push(`#drift-layer{${m[2]}}`);
    continue;
  }
  seen.add(scoped.split(',')[0].trim());
  scopedRules.push(`${scoped}{${m[2]}}`);
}
const css = `/* GENERATED by tools/build-drift-layer.mjs from prototypes/drift/drift-artifact.html
 * — do not edit by hand; edit the drift source or the extractor. */

/* The layer itself: full viewport, beneath the corridor chrome (z 20+),
 * shown only while the drift entry is the active view. */
#drift-layer {
  position: fixed;
  inset: 0;
  z-index: 15;
  display: none;
  overflow: hidden;
}
#drift-layer.active {
  display: block;
}

${scopedRules.join('\n')}

/* Hosted in the corridor the drift keeps no chrome of its own (the one top bar, slice E): its brand, depth
 * crumb, theme toggle and counters are not drawn — the house's bar and seal stand for them; the hint (the
 * invitation) stays, re-voiced by corridor.js. The 72 px push that cleared the old bar is gone with them. */
#drift-layer :is(#brand, #depth, #theme, #drift-tray) { display: none; }
#drift-layer #card { bottom: 64px; max-height: calc(100vh - 190px); overflow-y: auto; }
/* the card's study door is full-width in the standalone; in the fusion the
 * corridor's own 本棚 door is fixed over the card's bottom-right corner
 * (94x56 at right:16px / bottom:76px), so the door stops short of it rather
 * than putting two doors under one finger */
#drift-layer #card .study { width: auto; margin-right: 96px; }
/* the radical explainer is a modal: it must clear the corridor chrome band
 * so its own close button is reachable (the hunt found the X hit-testing
 * to the corridor's 覚 button, which navigated the whole app away) */
#drift-layer #radoc { top: 60px; padding-top: 62px; }
#drift-layer #radoc .x { top: calc(72px + env(safe-area-inset-top)); z-index: 12; }

/* Round 4 (T1, "clean it up a lot"): crisp ink. A word is drawn sharp, never smudged by its own
 * 1px shadow; only the words that carry meaning (fragile, the bloom's centre and satellites) keep
 * a soft halo. The paper grain is quieter. The level rail keeps the donor's rest: its scale shows
 * only while a finger is on it (round 4 review: labels at rest were clutter). Presentation only. */
#drift-layer .word .base,
#drift-layer .glyph .g { text-shadow: none; }
#drift-layer .word.fragile .base { text-shadow: 0 0 9px var(--halo); }
#drift-layer .word.bctr .base { text-shadow: 0 0 9px var(--bloomHalo); }
#drift-layer .word.bsat .base { text-shadow: 0 0 6px color-mix(in srgb, var(--bloomHalo) 50%, transparent); }
#drift-layer .word:focus-visible,
#drift-layer #lvl:focus-visible {
  outline: 2px solid var(--pig1);
  outline-offset: 6px;
  border-radius: var(--radius-card);
}
#drift-layer #lvl:focus-visible #lvlLabels,
#drift-layer #lvl:focus-visible #lvlInfo { opacity: 1; }
#drift-layer #grain { opacity: calc(var(--grainOp) * 0.45); }
/* the explainer carries both languages and shows the interface's own (round 4 review: the
 * English setting showed Japanese buttons, and 日本語 showed English prose) */
body:not(.ui-bi) #drift-layer [data-l='en'],
body.ui-bi #drift-layer [data-l='ja'] { display: none; }


/* Active constellation glyphs sit above the free field, below existing
 * word satellites (5), centres (6) and component plaques (7). */
#drift-layer.active #sky > .glyph.hosted-constellation-glyph:not(.comp):not(.center) {
  z-index: 2;
}

/* Native hit regions: preserve field doors through transparent caption/rt
   space. The actual ruby base (or unannotated .g) retains native handlers. */
#drift-layer.active #sky > .glyph.hosted-constellation-glyph:not(.comp):not(.center),
#drift-layer.active #sky > .glyph.hosted-constellation-glyph:not(.comp):not(.center) > .g {
  pointer-events: none;
}
#drift-layer.active #sky > .glyph.hosted-constellation-glyph:not(.comp):not(.center) > .g > ruby.drift-reading,
#drift-layer.active #sky > .glyph.hosted-constellation-glyph:not(.comp):not(.center) > .g:not(:has(> ruby.drift-reading)),
#drift-layer.active #sky > .glyph.hosted-constellation-glyph.unfolded:not(.comp):not(.center) > small {
  pointer-events: auto;
}
#drift-layer.active #sky > .glyph.hosted-constellation-glyph:not(.comp):not(.center) > .g:not(:has(> ruby.drift-reading)) {
  width: fit-content;
  margin-inline: auto;
}
#drift-layer.active #sky > .glyph.hosted-constellation-glyph:not(.comp):not(.center) > .g > ruby.drift-reading > rt {
  pointer-events: none;
}
body[data-furigana='1'] #drift-layer.active #sky > .glyph.hosted-constellation-glyph.hosted-reading-shown:not(.comp):not(.center) > .g > ruby.drift-reading > rt,
body[data-furigana='2'] #drift-layer.active #sky > .glyph.hosted-constellation-glyph:not(.comp):not(.center) > .g > ruby.drift-reading > rt {
  pointer-events: auto;
}
/* G3: hosted glyphs keep native reading markup at rest, including before their first tap, and the hosted sky follows
   the same reading dial as prose. A sibling gloss/particle caption is never part of the ruby. (F's merge moved these
   here from editorial.css; G6's merge leaves a reading's size to the one ruby, half its word, as the sky emits no literal
   size: G3's .45em is now .5em.) */
body[data-furigana] #drift-layer .drift-reading rt { line-height: 1; opacity: 0; }
body[data-furigana='1'] #drift-layer .hosted-reading-shown .drift-reading rt,
body[data-furigana='2'] #drift-layer .drift-reading rt { opacity: 1; }

/* Interface arrivals stay short and still when motion is reduced. The card
 * occupies its final position throughout its fade; direct field gestures
 * and the separate teaching renderer retain their own geometry. */
@media (prefers-reduced-motion: reduce) {
  #drift-layer #veil,
  #drift-layer #hint,
  #drift-layer #lvl,
  #drift-layer #lvlLabels,
  #drift-layer #lvlInfo,
  #drift-layer #depth,
  #drift-layer #radoc,
  #drift-layer .word .yomi,
  #drift-layer .word .gloss,
  #drift-layer .glyph small,
  #drift-layer .part small { transition: opacity 80ms; }
  #drift-layer #card {
    transform: none;
    opacity: 0;
    pointer-events: none;
    transition: opacity 80ms;
  }
  #drift-layer #card.open { opacity: 1; pointer-events: auto; }
}
`;

/* -------------------------------------------------------------- markup */
let markup = slice('</style>\n', '<script>', 'markup fragment').trim();
// Round 4 review (T1): markup patches are exact-once too, so a reshaped donor fails the build.
const markupPatch = (from, to, label) => {
  const first = markup.indexOf(from);
  if (first < 0 || markup.indexOf(from, first + 1) >= 0) throw new Error(`markup anchor missing or ambiguous (${label})`);
  markup = markup.slice(0, first) + to + markup.slice(first + from.length);
};
markupPatch('<button class="x" id="radocX">閉じる ×</button><div class="wrap">\n<h2>部首 — radicals</h2>',
  '<button class="x" id="radocX"><span data-l="ja">閉じる ×</span><span data-l="en">Close ×</span></button><div class="wrap">' +
  '<div data-l="en">\n<h2>Radicals</h2>', 'the explainer: English half');
markupPatch("travel to it and keep exploring.</p>\n</div></div>",
  "travel to it and keep exploring.</p>\n</div>" +
  '<div data-l="ja" lang="ja">\n<h2>部首</h2><div class="sub">漢字が分けられる形</div>' +
  '<p>どの漢字も、くり返し現れる小さな形でできている。そのうち一つが、その字の<b>部首</b>に選ばれる。辞書は漢字を部首で分けて並べる。英語の辞書が単語を最初の文字で並べるのと同じだ。古典の部首（康熙部首）は <b>214</b> あり、部首を見分けられるようになると、画数の壁が、なじみの部品の組み合わせに変わる。</p>' +
  '<p>部首はしばしば意味を運ぶ。さんずい「氵」は水にかかわる字に、木へん「木」は木や植物にかかわる字に多い。部首は索引であり、手がかりでもある。</p>' +
  '<p><b>部首と部品のちがい。</b>一つの漢字には部品がいくつも含まれるが、正式な部首は一つだけだ。この辞書はその区別を守り、古典の部首番号があるときだけ「部首」と書き、それ以外は「この字を含む」と書く。こちらは、ゆるやかだが正直な仲間の集まりだ。</p>' +
  '<div class="rex"><span class="rc">氵</span><span class="rt"><b>水</b>（さんずい）· 海 · 泳 · 池 · 河</span></div>' +
  '<div class="rex"><span class="rc">木</span><span class="rt"><b>木</b>（きへん）· 林 · 森 · 柱 · 校</span></div>' +
  '<div class="rex"><span class="rc">言</span><span class="rt"><b>ことば</b>（ごんべん）· 語 · 話 · 読 · 記</span></div>' +
  '<p style="color:var(--faint);font-size:13px">部首の仲間の一覧にある字をタップすると、その字へ移って、さらにたどれる。</p>\n</div></div></div>',
  'the explainer: Japanese half');

/* -------------------------------------------------------------- script */
let js = slice('<script>\n', '\n</script>', 'script block');

// Corridor and drift both use the DOM id "tray" (corridor: the 覚 chrome
// button; drift: the 拾った/済み counter). Duplicate ids make getElementById
// nondeterministic across the fused document, so drift's becomes drift-tray
// in all three emissions. Counts asserted so a drift rename cannot silently
// bring the collision back.
const renameId = (name, to) => {
  const inMarkup = (markup.match(new RegExp(`id="${name}"`, 'g')) || []).length;
  if (inMarkup !== 1) throw new Error(`expected exactly one id="${name}" in markup, found ${inMarkup}`);
  markup = markup.replace(`id="${name}"`, `id="${to}"`);
  js = js.replaceAll(`getElementById("${name}")`, `getElementById("${to}")`);
};

let patchCount = 0;
const patch = (from, to, label) => {
  const first = js.indexOf(from);
  if (first < 0) throw new Error(`patch anchor missing (${label})`);
  if (js.indexOf(from, first + 1) >= 0) throw new Error(`patch anchor ambiguous (${label})`);
  js = js.slice(0, first) + to + js.slice(first + from.length);
  patchCount += 1;
};
const patchSection = (start, end, replacement, label) => {
  const a = js.indexOf(start), b = js.indexOf(end, a + start.length);
  if (a < 0 || b < 0 || js.indexOf(start, a + start.length) >= 0 || js.indexOf(end, b + end.length) >= 0)
    throw new Error(`section anchor missing or ambiguous (${label})`);
  patch(js.slice(a, b), replacement, label);
};

// Keep the frozen design source intact while emitting explicit control flow
// and removing unused bindings from the shipped layer. These patches preserve
// behavior; the normal Drift browser verifier still checks the generated code.
patch('window.bunkiDriftDepth&&window.bunkiDriftDepth(stack.length);',
  'if(window.bunkiDriftDepth)window.bunkiDriftDepth(stack.length);', 'explicit host depth callback');
patch('}catch(err){/* a query string never blocks the field */}',
  '}catch{/* a query string never blocks the field */}', 'unused query catch binding');
patch('const NB=9, blobs=[], stains=[];', 'const NB=9, blobs=[];', 'unused stains array');
patch('}}catch(err){', '}}catch{', 'unused record catch binding');
patch('}catch(err){\n    setHint(', '}catch{\n    setHint(', 'unused save catch binding');
patch('let pg=null,L;', 'let pg,L;', 'branch-assigned layout parent');
patch('pts.forEach((p,i)=>{i?fctx.lineTo(p.x,p.y):fctx.moveTo(p.x,p.y);});',
  'pts.forEach((p,i)=>{if(i)fctx.lineTo(p.x,p.y);else fctx.moveTo(p.x,p.y);});', 'explicit trail drawing');
patch('let ack=false;', 'let ack;', 'branch-assigned acknowledgement');
patch('if(wr.lk){}', 'if(wr.lk){/* Locked words keep their anchored position. */}', 'intentional locked position');

// Canvas rasterization cannot use font-display's later swap: a hub sprite
// would retain the first fallback pixels forever. Wait per label before
// drawing it, without pausing the field or changing its gesture/physics loop.
patch('const TAU=Math.PI*2;', `const TAU=Math.PI*2;
const canvasLabelsReady=new Set(),canvasLabelsLoading=new Set(),canvasLabelsRetryAt=new Map();
const canvasFontRepairs=new Map();
const fontName=value=>value.replace(/["']/g,"").trim();
const fontRange=value=>value.replace(/\\s/g,"").toUpperCase().replace(/U\\+0+([0-9A-F])/g,"U+$1").replace(/-0+([0-9A-F])/g,"-$1");
function fontRangeCovers(range,text){
  return [...text].some(character=>range.split(",").some(part=>{
    const bounds=part.trim().replace(/^U\\+/i,"").split("-");
    const low=parseInt(bounds[0].replace(/\\?/g,"0"),16);
    const high=parseInt((bounds[1]||bounds[0]).replace(/\\?/g,"F"),16);
    return character.codePointAt(0)>=low&&character.codePointAt(0)<=high;
  }));
}
async function loadBundledFont(font,text){
  try{return await document.fonts.load(font,text);}catch(error){
    // An errored CSS FontFace cannot be retried by FontFaceSet.load alone.
    // Recreate only the failed, matching bundled declarations, then install
    // their loaded faces. This works for local URLs and standalone data URLs.
    const failed=[...document.fonts].filter(face=>face.status==="error");
    const repairs=[];
    for(const sheet of document.styleSheets){
      let rules;try{rules=sheet.cssRules;}catch{continue;}
      for(const rule of rules){
        if(rule.type!==5)continue;
        const style=rule.style,family=fontName(style.fontFamily);
        if(!font.includes('"'+family+'"')||!fontRangeCovers(style.unicodeRange,text)||
          !failed.some(face=>fontName(face.family)===family&&fontRange(face.unicodeRange)===fontRange(style.unicodeRange)&&face.weight===style.fontWeight))continue;
        const key=family+":"+style.fontWeight+":"+fontRange(style.unicodeRange);
        if(!canvasFontRepairs.has(key)){
          const source=style.getPropertyValue("src").replace(/url\\((['"]?)([^'")]+)\\1\\)/g,(_match,_quote,url)=>'url("'+new URL(url,sheet.href||document.baseURI).href+'")');
          const face=new window.FontFace(family,source,{style:style.fontStyle,weight:style.fontWeight,unicodeRange:style.unicodeRange,display:"block"});
          const loading=face.load().then(loaded=>{
            document.fonts.add(loaded);
            // The failed CSS-connected face remains in FontFaceSet even
            // after an equivalent loaded face is added. Retire just its
            // declaration after the replacement is ready, using identity
            // rather than an index that another completed repair may shift.
            const index=[...sheet.cssRules].indexOf(rule);
            if(index>=0)sheet.deleteRule(index);
            return loaded;
          });
          canvasFontRepairs.set(key,loading);
          loading.catch(()=>{canvasFontRepairs.delete(key);});
        }
        repairs.push(canvasFontRepairs.get(key));
      }
    }
    if(!repairs.length)throw error;
    await Promise.all(repairs);
    return document.fonts.load(font,text);
  }
}
function canvasLabelReady(text){
  if(canvasLabelsReady.has(text))return true;
  if(!canvasLabelsLoading.has(text)&&document.fonts&&performance.now()>=(canvasLabelsRetryAt.get(text)||0)){
    canvasLabelsLoading.add(text);
    loadBundledFont('13px "Noto Serif JP"',text).then(faces=>{
      if(faces.length&&document.fonts.check('13px "Noto Serif JP"',text))canvasLabelsReady.add(text);
    }).catch(()=>{/* Keep unready labels out of the raster, never cache fallback ink. */})
      .finally(()=>{canvasLabelsLoading.delete(text);canvasLabelsRetryAt.set(text,performance.now()+3000);});
  }
  return false;
}
addEventListener("online",()=>{canvasLabelsRetryAt.clear();});
if(navigator.serviceWorker){
  navigator.serviceWorker.addEventListener("controllerchange",()=>{canvasLabelsRetryAt.clear();});
  navigator.serviceWorker.ready.then(()=>{canvasLabelsRetryAt.clear();}).catch(()=>{});
}`, 'canvas bundled face readiness');
for(const size of [13,84,11])patch(
  `${size}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`,
  `${size}px "Noto Serif JP"`, `bundled canvas face ${size}px`);
patch('fctx.fillText(p.lb,p.x,p.y-10);',
  'if(canvasLabelReady(p.lb))fctx.fillText(p.lb,p.x,p.y-10);', 'trail font ready before raster');
patch('if(!sp2){\n      sp2=document.createElement("canvas");',
  'if(!sp2){\n      if(!canvasLabelReady(h))continue;\n      sp2=document.createElement("canvas");', 'hub font ready before sprite cache');
patch('fctx.fillText(wr.e[0],wr.sx,wr.sy-8);',
  'if(canvasLabelReady(wr.e[0]))fctx.fillText(wr.e[0],wr.sx,wr.sy-8);', 'focus font ready before raster');
patch('transform .95s cubic-bezier(.3,.6,.4,1), opacity .95s, color .3s',
  'transform .95s cubic-bezier(.3,.6,.4,1), opacity .95s', 'grade only transform and opacity');
patch('p2.style.transition="stroke-dashoffset "+d2+"ms ease-out";\n        p2.style.strokeDashoffset="0";',
  'p2.style.transition="opacity "+d2+"ms ease-out";\n        p2.style.strokeDashoffset="0";\n        p2.style.opacity="1";', 'stroke preview opacity reveal');
patch('p.style.strokeDashoffset=L;',
  'p.style.strokeDashoffset="0";\n      p.style.opacity="0";', 'stroke preview starts as hidden complete path');
patch('p2._num.style.transition="opacity .5s";',
  'p2._num.style.transition=reduced?"opacity 80ms":"opacity .5s";', 'stroke preview number reduced fade');

// 1 · wrap + gate flag + self-mount. The markup is injected before any of the
// script's parse-time getElementById calls run, so load order is one line in
// index.html; the layer starts asleep and window.__DRIFT__ wakes it.
patch(
  '"use strict";',
  '(function () {\n"use strict";\n' +
    'const __layer = document.createElement("div");\n' +
    '__layer.id = "drift-layer";\n' +
    '__layer.inert = true;\n' +
    '__layer.dataset.recordState = "loading";\n' +
    `__layer.innerHTML = ${'__MARKUP_JSON__'};\n` +
    'document.body.prepend(__layer);\n' +
    'let DRIFT_ON = false;\nlet rafOn = false;\n' +
    "// G6: the host owns the scale chain. Drift retains only its own live scene.\nlet scaleBridge=null,scaleBusy=false,scaleBlocked=false,scaleHandConsumed=false,scaleConsumedAt=0,scaleDrain=false;\nlet scaleArticle=null,scaleLayer=null,scaleProjectionKey='',scaleWorldKey='';\nlet scaleSceneGeneration=0;\nconst scaleStars=new Map(),scaleNodeIds=new WeakMap();\nlet scaleNodeSerial=0;\nconst scalePhysicalPointers=new Map();\n" +
    'let recordBridge=null,recordGeneration=0,recordView=null,recordReady=false,recordRead=null,recordCodec=null;\n' +
    'const recordPending=new Set();\nlet recordCueIntent=null,recordCueRun=null;',
  'IIFE head + gate flag',
);

// 1b · theme vars land on the LAYER, not the document root — cycling drift's
// nihonga themes must never repaint the corridor's own chrome and shelf
patch(
  'const rootStyle=document.documentElement.style;',
  'const rootStyle=__layer.style;',
  'theme vars scoped to layer',
);

// 2 · the six window-level listeners sleep while the layer is hidden
patch(
  'addEventListener("pointerup",e=>{\n  if(lvlDrag){',
  'addEventListener("pointerup",e=>{\n  if(!DRIFT_ON)return;\n  if(lvlDrag){',
  'gate lvl pointerup',
);
patch(
  'addEventListener("keydown",e=>{ if(e.key==="Escape") closeRadoc(); });',
  'addEventListener("keydown",e=>{ if(!DRIFT_ON||e.key!=="Escape")return; const slip=window.__BUNKI_OPEN_SLIP; if(slip&&typeof slip.isOpen==="function"&&slip.isOpen()){slip.close();return;} closeRadoc(); });',
  'gate keydown; Escape puts the slip away first',
);
patch(
  'addEventListener("pointerdown",e=>{\n  if(e.isPrimary&&touches.size){touches.clear();pinch=null;}',
  'addEventListener("pointerdown",e=>{\n  if(!DRIFT_ON||recordPending.size)return;\n  if(e.isPrimary&&touches.size){touches.clear();pinch=null;}',
  'gate pointerdown',
);
patch(
  'addEventListener("pointermove",e=>{\n  const t2=touches.get(e.pointerId);',
  'addEventListener("pointermove",e=>{\n  if(!DRIFT_ON)return;\n  const t2=touches.get(e.pointerId);',
  'gate pointermove',
);
patch(
  'addEventListener("pointercancel",cancelPointer,{passive:true});',
  'addEventListener("pointercancel",e=>{if(DRIFT_ON)cancelPointer(e);},{passive:true});',
  'gate pointercancel',
);
patch(
  'addEventListener("pointerup",e=>{\n  const owner=e.pointerId===gestureId;',
  'addEventListener("pointerup",e=>{\n  if(!DRIFT_ON)return;\n  const owner=e.pointerId===gestureId;',
  'gate main pointerup',
);

// A spawned word is the same door for a keyboard as for a pointer. Resolve
// its current node at activation time so recycling, departure and hidden
// layers cannot leave a stale keyboard action. tapNode owns every rung.
patch(
  '  nodes.push(n); nodeOf.set(el,n);\n  return n;\n}\nfunction spawnGlyph',
  '  nodes.push(n); nodeOf.set(el,n);\n' +
    '  el.setAttribute("role","button");el.tabIndex=-1;\n' +
    '  el.dataset.uiContent="learning";el.querySelector(".base").lang="ja";el.querySelector(".yomi").lang="ja";el.querySelector(".gloss").lang="en";\n' +
    '  el.addEventListener("keydown",e=>{\n' +
    '    if(e.key!=="Enter"&&e.key!==" ")return;\n' +
    '    e.preventDefault();e.stopPropagation();\n' +
    '    const node=nodeOf.get(el);\n' +
    '    if(e.repeat||!DRIFT_ON||!node||node.gone||node.removed||!el.isConnected)return;\n' +
    '    tapNode(node);\n' +
    '  });\n' +
    '  return n;\n}\nfunction spawnGlyph',
  'word keyboard activation shares the pointer tap ladder',
);

// The keyboard order follows the renderer's final rounded opacity, including
// the existing viewport/chrome dissolve. No paint or gesture calculation changes.
patch(
  '    const opStr=outOp.toFixed(3);\n    if(n._lop!==opStr){n._lop=opStr;n.el.style.opacity=opStr;}',
  '    const opStr=outOp.toFixed(3);\n' +
    '    if(n.kind==="word"){const tab=DRIFT_ON&&!n.gone&&!n.removed&&n.el.isConnected&&Number(opStr)>0?0:-1;if(n.el.tabIndex!==tab)n.el.tabIndex=tab;}\n' +
    '    if(n._lop!==opStr){n._lop=opStr;n.el.style.opacity=opStr;}',
  'word Tab eligibility follows actual painted presence',
);

// 2b · hidden-layer tab discipline: the radical explainer rests at opacity:0
// + pointer-events:none, which hides it from fingers but NOT from the Tab
// key — in the fused document its 閉じる × was the drift home's FIRST tab
// stop, an invisible control before any real one (R3-B hunt). `inert` while
// closed removes focusability. Explicit hidden/aria-hidden also keep the
// closed prose out of accessibility snapshots; opening restores visibility
// and close/Escape return focus to the invoking control. The original
// preserved artwork remains byte-untouched.
patch(
  'const radoc=document.getElementById("radoc");',
  'const radoc=document.getElementById("radoc");let radocReturnFocus=null;radoc.inert=true;radoc.hidden=true;radoc.setAttribute("aria-hidden","true");radoc.setAttribute("role","dialog");radoc.setAttribute("aria-label",uiT("部首","Radicals"));radoc.addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();closeRadoc();}});',
  'radoc rests inert',
);
patch(
  'function openRadoc(){ radoc.classList.add("open"); }',
  'function openRadoc(){ radocReturnFocus=document.activeElement;radoc.setAttribute("aria-label",uiT("部首","Radicals"));radoc.hidden=false;radoc.inert=false;radoc.setAttribute("aria-hidden","false");radoc.classList.add("open");document.getElementById("radocX").focus(); }',
  'radoc wakes focusable',
);
patch(
  'function closeRadoc(){ radoc.classList.remove("open"); }',
  'function closeRadoc(){ radoc.classList.remove("open");radoc.inert=true;radoc.hidden=true;radoc.setAttribute("aria-hidden","true");if(radocReturnFocus?.isConnected)radocReturnFocus.focus();radocReturnFocus=null; }',
  'radoc close returns inert',
);

// The generated Corridor layer is always hosted, including before the host
// finishes booting. Only the untouched standalone donor may use legacy LS.
// The host owns the reducer and transaction; this layer sends an intent and
// publishes a committed projection, never a locally edited candidate store.
patchSection('const DRIFT_STORE_KEY="bunki-drift-v1";', 'let seq=0,gathered=',
  'let store={known:{},unknown:{},lk:0,lu:0};\n', 'hosted boot has no legacy storage access');
patchSection('function grade(n,dir){', '  n.gone=true; n.frozen=true;',
  'function grade(n,dir){\n  if(n.gone||recordPending.size||recordCueRun)return;\n  void hostedGrade(n,dir);\n}\nfunction finishGrade(n,dir,wasCenter){\n',
  'departure follows confirmed host receipt');
patch('  if(dir>0){settled++;bloom(n);} else {gathered++;sink(n);}',
  '  if(dir>0)bloom(n);else sink(n);', 'committed host counters are authoritative');
// Reduced-motion judgments keep the rendered word at its current position
// and crossfade briefly. The confirmed receipt, counters, recycling and
// constellation callbacks retain their existing ordering and predicates.
patch('  if(dir>0)bloom(n);else sink(n);',
  '  if(!reduced){if(dir>0)bloom(n);else sink(n);}', 'reduced grade has no particle departure');
patch('  ripples.push({x,y,r:big?10:4,alpha:big?0.5:0.32,sp:big?4.5:2.6,echo:false});',
  '  if(!reduced)ripples.push({x,y,r:big?10:4,alpha:big?0.5:0.32,sp:big?4.5:2.6,echo:false});',
  'reduced gesture has no decorative ripple while fluid input stays intact');
patch('  el.style.transition="transform .95s cubic-bezier(.3,.6,.4,1), opacity .95s";\n  if(dir>0){',
  '  if(reduced){\n    el.style.transition="opacity 80ms";\n  } else {\n  el.style.transition="transform .95s cubic-bezier(.3,.6,.4,1), opacity .95s";\n  if(dir>0){',
  'reduced grade crossfades at its rendered position');
patch('  el.style.opacity="0";\n  removeNode(n,1000);',
  '  }\n  el.style.opacity="0";\n  removeNode(n,reduced?120:1000);', 'retire reduced grade after the short fade');
patchSection("// The front door's one first-touch cue.", '\n// ---- radical explainer ----',
  '// The first answered node touch retires this invitation through the host.\n' +
  'if(!store.cue)hint.classList.add("first-cue");\n' +
  'function cueRetire(n,gesture){\n  if(store.cue)return;\n  void hostedCue(n,gesture);\n}\n',
  'first answered touch retires the cue through the durable host');
patch('  cueRetire();   // a held word is a first touch answered, same as a tap',
  '  cueRetire(n,"hold");   // retain the identity of the answered gesture', 'cue hold gesture identity');
patch('  cueRetire();   // a word answered the finger: the first-touch cue has served',
  '  cueRetire(n,"tap");   // retain the identity of the answered gesture', 'cue tap gesture identity');

// Compressing a polar ring against the phone edge can put one held word's
// body over another's centre. Keep the donor targets and camera grammar, then
// separate only colliding held bodies inside the same chrome boundaries.
patch(
  '      for(const wr of FOCUS) if(!wr.lk&&wr.bR){\n        const bt=ringTarget(ax,ay,wr.bAng,wr.bR);\n        wr.hx=bt.x-wr.wx;\n        wr.hy=bt.y-wr.wy;\n      }',
  '      layoutHeldRing(ax,ay);',
  'held ring hit ownership at compressed edges',
);
// The record queue may outlive a gesture. Recycling or changing constellations
// must not dispose of a word while its durable outcome is still unknown.
for (const name of ['refreshActive()', 'clearBloom(keep)', 'collapseUnfold()', 'surface()', 'tideChange()', 'diveWord(n)', 'diveKanji(g)', 'divePart(p)', 'diveFromList(ch)', 'bloomFocus(n)', 'constellationLock(n)']) {
  patch(`function ${name}{`, `function ${name}{\n  if(recordPending.size)return;`, `pending judgment preserves ${name}`);
}
patch('function removeNode(n,delay){\n  const el=n.el;\n  setTimeout(function(){',
  'function removeNode(n,delay){\n  const el=n.el;\n  if(n.kind==="word")el.tabIndex=-1;\n  setTimeout(function(){\n    if(n.recordPending)return;', 'pending node cannot be removed by a prior timer');
patch('function tapNode(n){', 'function tapNode(n){\n  if(recordPending.size){setHint("判断を保存しています。");return;}', 'pending judgment keeps taps from rebuilding the field');

// The one-hand pass (contract §1, 2026-10-15): where the sky handed a word straight to the host's entry
// sheet — the ladder's end, a tap on the dive's centre (openCard) — it now opens the host's one slip beside
// the centre (word · reading · meaning · Save ▾ · kanji band); the slip's band opens the entry, and so does
// the same centre again while its slip stands. The sky's own rungs under that — the furigana, the gloss, the
// bloom and its chain walk, the dive — are untouched: a slip at the first rung covered the family the bloom
// spreads around the word (drift-consistency's edge-bloom and sat-flick cases). A dive puts any slip away.
// The standalone donor keeps its card.
patch(
  '  card.classList.remove("open"); clearBloom(n); collapseUnfold();\n  const lvl=beginLevel(n);',
  '  slipAway();   // the word dives: the slip goes with the scene it stood in\n  card.classList.remove("open"); clearBloom(n); collapseUnfold();\n  const lvl=beginLevel(n);',
  'one-hand: a dive puts the slip away',
);
patch(
  '    if(n.kind==="word"&&hook.has("word",n.w)){hook.open("word",n.w);return;}\n    if(n.kind==="glyph"&&n.ch&&hook.has("kanji",n.ch)){hook.open("kanji",n.ch);return;}',
  '    if(n.kind==="word"&&hook.has("word",n.w)){if(!slipFor(n))hook.open("word",n.w);return;}\n    if(n.kind==="glyph"&&n.ch&&hook.has("kanji",n.ch)){if(!slipFor(n))hook.open("kanji",n.ch);return;}',
  'one-hand: a dive\'s centre opens its slip, the slip\'s band (or the centre again) the entry',
);
patch('lvlEl.addEventListener("pointerdown",e=>{\n  e.stopPropagation();',
  'lvlEl.addEventListener("pointerdown",e=>{\n  if(recordPending.size)return;\n  e.stopPropagation();', 'pending judgment preserves the level tide');
patch('      const nd=wr.node;\n      if(nd&&(nd===focusN||nd.hlDom)) continue;',
  '      const nd=wr.node;\n      if(nd&&nd.recordIntent)continue;\n      if(nd&&(nd===focusN||nd.hlDom)) continue;', 'unconfirmed judgment stays available after failure');

// Missed practice answers raise a word's visibility in the field. This is a
// bounded preference only: no known/unknown judgment and no FSRS write.
patch(
  'cam.x=WR.w/2; cam.y=WR.h/2; cam.z=1; cam.rot=0;\n}\nfunction rePri(){',
  `cam.x=WR.w/2; cam.y=WR.h/2; cam.z=1; cam.rot=0;
}
let practicePriorities=new Map();
function setPracticePriorities(projection){
  const next=new Map();
  if(projection?.authority==="practice-only"&&Array.isArray(projection.targets)){
    for(const target of projection.targets.slice(0,128)){
      if(target.suppressed||typeof target.subject!=="string"||!target.subject.startsWith("word:")||
        !Number.isFinite(target.misses)||target.misses<=0)continue;
      const word=target.subject.slice(5);
      if(!WORDIX[word])continue;
      // A bounded visibility preference, never a known/unknown judgment or
      // an FSRS change. Existing level bands and spatial context still lead.
      next.set(word,Math.min(2.4,1+target.misses*.35));
    }
  }
  practicePriorities=next;rePri();
}
function rePri(){`,
  'practice priorities setter',
);
patch(
  '(e[3]==="f"?0.8:0);',
  '(e[3]==="f"?0.8:0)+(practicePriorities.get(e[0])||0);',
  'practice priorities join the standing priority',
);

// Round 4 (T1, the operator 2026-10-08: "a whole explorable UNIVERSE of japanse words … i think we
// could clean it up a lot"). The universe stays whole and explorable; what changes is only how it is
// drawn. Quieter paper (no age spots, fewer fibres and specks, a lighter vignette), pigment pools and
// the wave band down to a whisper and one fine line, every unseen word a fine point instead of a grey
// square, the word web and the hub suns faint, no word drawn too small to read, the night's red pool
// turned to 藍, and the ground taken from the host's own world so the door and Today stand on one
// paper. No gesture, physics, record or judgment path is touched; every anchor is exact-once.
patch('  for(let i=0;i<240;i++){', '  for(let i=0;i<90;i++){', 'r4 fewer paper fibres');
patch('const la=th.dark?.028:.05;', 'const la=th.dark?.014:.022;', 'r4 fainter laid lines');
patch('for(let i=0;i<2600;i++){', 'for(let i=0;i<600;i++){', 'r4 fewer grain specks');
patch('for(let i=0;i<26;i++){', 'for(let i=0;i<8;i++){', 'r4 fewer heavy kozo strands');
patch('for(let i=0;i<46;i++){', 'for(let i=0;i<0;i++){', 'r4 no foxing spots');
patch('g.addColorStop(0,shade(th.ground,f,th.dark?.22:.5));', 'g.addColorStop(0,shade(th.ground,f,th.dark?.14:.26));', 'r4 gentler mottling');

// Hfix-2b · H2-1 (Grok's H2 walk: the sky cuts words at its edges on phone, iPad and laptop).
// The donor's law is "nothing is ever half-guillotined by the viewport", but its guard was
// written for free-drifting WORDS only, and three exclusions kept it away from the very nodes
// the walk caught:
//   · kind — a glyph and a part were never covered at all, and a glyph renders at hero type:
//     the largest, most legible ink in the field (日 cut at the right edge on the iPad).
//   · mode — spawnGlyph and spawnPart both start in "orbit", which the guard excluded, so no
//     glyph could EVER dissolve however far off the glass its orbit carried it.
//   · hlDom — a bloom's satellites sit at top=0.95, and layoutHeldRing's clamp is applied to
//     the ring's target, not to the orbit and fluid drift that keep moving afterwards.
// The law now covers every rendered node, with no exception at all — including the focused word.
// Exempting focusN was tried and measured: drag the field after a tap and the focused word rides
// to the rim at 0.97 opacity and is sliced there, which is the very thing the law forbids. The
// camera centres focusN on a tap, so in ordinary use it is nowhere near an edge; when the learner
// carries it there anyway, it dissolves like everything else.
patch('    if(n.kind==="word"&&(n.mode==="free"||n.mode==="glide")&&n!==focusN&&!n.hlDom){\n'
  + '      const zf=(n.fpx||14)*n.s*cam.z;\n'
  + '      const ehw=n.w.length*zf*0.55, ehh=zf*0.62;',
  '    {\n'
  + '      const zf=(n.fpx||14)*n.s*cam.z;\n'
  + '      const zs2=(n.mode==="free"||n.mode==="glide")?cam.z:1;\n'
  + '      // A character count times the font box is right for a word and badly wrong for a\n'
  + '      // glyph (hero type above its own gloss line); measuring the wrong box only moves the\n'
  + '      // cut instead of removing it. So the node\'s OWN untransformed box is read and kept,\n'
  + '      // and only for a node that has come within reach of an edge — a few reads on\n'
  + '      // approach, never a per-frame layout pass. The class list is the cache key because\n'
  + '      // it is exactly what changes when the box does: a hosted reading mounts its ruby\n'
  + '      // (hosted-reading-shown) long after spawn, and a word taken into a constellation\n'
  + '      // grows as bsat. A zero is never cached, so a node measured before it is laid out\n'
  + '      // simply falls back to the estimate and is measured again next frame.\n'
  + '      const text=(n.kind==="word"?n.w:n.ch)||"";\n'
  + '      let ehw=Math.max(1,[...text].length)*zf*0.55, ehh=zf*0.62;\n'
  + '      if(n.boxKey!==n.el.className&&n.el.isConnected&&Math.min(n.x,vw()-n.x,n.y,vh()-n.y)<220){\n'
  + '        const bw=n.el.offsetWidth, bh=n.el.offsetHeight;\n'
  + '        if(bw>0&&bh>0){n.boxW=bw;n.boxH=bh;n.boxKey=n.el.className;}\n'
  + '      }\n'
  + '      if(n.boxW>0){ehw=Math.max(ehw,n.boxW*n.s*zs2/2); ehh=Math.max(ehh,n.boxH*n.s*zs2/2);}',
  'Hfix-2b H2-1 every rendered node dissolves at the glass edge, not only free words');
// Hfix-2b · H2-1, the lead's ruling (MISSION/inbox/0238): a faint sliver at the rim is still a
// cut-off look, so no word may show PARTLY at the glass edge. The donor's dissolve ran across the
// rim — ef=(dE+34)/68, squared — so a box that just met the rim still drew at 25% and one half
// over it at ~6%. One constant moves: the band's outer end, from 34px past the rim to the rim
// itself. A node keeps full ink until its box is 34px from the rim, eases out over those 34px
// (still squared), and is at opacity 0 the moment its box touches the rim.
patch('        const ef=dE<=-34?0:(dE+34)/68;',
  '        const ef=dE<=0?0:dE/34;',
  'Hfix-2b H2-1 the edge dissolve ends at the rim: a box that touches it draws at opacity 0');
// Hfix-2b r2 · H2-1 under a held drag (Grok's critique of 927996ae). Two holes in the box the fade
// judged, both measured on a tapped word dragged to the rim:
//   · WHERE — the fade read n.x/n.y, but the paint translates n.x+dragX, n.y+dragY. With the finger
//     down the word and its reading kept ~0.97 ink 12-33 px past the rim. The fade now reads the
//     painted centre, the same two sums the transform below uses.
//   · WHAT — a revealed reading sits above the word's own box and a revealed gloss below it, both
//     centred on it. They are the word the learner sees, so they are now part of its box: above
//     (eUp) and below (eDn) are kept apart because the two lines are not symmetric. A line counts
//     when its class shows it (unfolded/glossed, or furigana always-on), or when it is drawn at all.
//     The cache key adds the furigana setting, since that alone can show a reading.
patch('      if(n.boxKey!==n.el.className&&n.el.isConnected&&Math.min(n.x,vw()-n.x,n.y,vh()-n.y)<220){\n'
  + '        const bw=n.el.offsetWidth, bh=n.el.offsetHeight;\n'
  + '        if(bw>0&&bh>0){n.boxW=bw;n.boxH=bh;n.boxKey=n.el.className;}\n'
  + '      }\n'
  + '      if(n.boxW>0){ehw=Math.max(ehw,n.boxW*n.s*zs2/2); ehh=Math.max(ehh,n.boxH*n.s*zs2/2);}\n'
  + '      let dE=Math.min(n.x-ehw,vw()-n.x-ehw,n.y-ehh,vh()-n.y-ehh);',
  '      const pcx=n.x+n.dragX, pcy=n.y+n.dragY;\n'
  + '      const furi=document.body.dataset.furigana||"", boxKey=n.el.className+"|"+furi;\n'
  + '      if(n.boxKey!==boxKey&&n.el.isConnected&&Math.min(pcx,vw()-pcx,pcy,vh()-pcy)<220){\n'
  + '        const bw=n.el.offsetWidth, bh=n.el.offsetHeight;\n'
  + '        if(bw>0&&bh>0){\n'
  + '          const cl=n.el.classList, lod=cl.contains("lod");\n'
  + '          const yo=n.el.querySelector(":scope > .yomi"), gl=n.el.querySelector(":scope > .gloss");\n'
  + '          const shown=(el,byClass)=>!!el&&!lod&&(byClass||Number(getComputedStyle(el).opacity)>0);\n'
  + '          const ys=shown(yo,furi!=="0"&&(cl.contains("unfolded")||cl.contains("glossed")||furi==="2"));\n'
  + '          const gs=shown(gl,cl.contains("glossed"));\n'
  + '          n.boxW=Math.max(bw,ys?yo.offsetWidth:0,gs?gl.offsetWidth:0);\n'
  + '          n.boxUp=bh/2+(ys?yo.offsetHeight:0); n.boxDn=bh/2+(gs?gl.offsetHeight:0);\n'
  + '          n.boxKey=boxKey;\n'
  + '        }\n'
  + '      }\n'
  + '      let eUp=ehh, eDn=ehh;\n'
  + '      if(n.boxW>0){const k=n.s*zs2; ehw=Math.max(ehw,n.boxW*k/2); eUp=Math.max(ehh,n.boxUp*k); eDn=Math.max(ehh,n.boxDn*k);}\n'
  + '      let dE=Math.min(pcx-ehw,vw()-pcx-ehw,pcy-eUp,vh()-pcy-eDn);',
  'Hfix-2b r2 H2-1 the fade judges the painted box: the drag, and a revealed reading and gloss');
patch('        const dx=Math.max(c.x-(n.x+ehw),(n.x-ehw)-(c.x+c.w));\n'
  + '        const dy=Math.max(c.y-(n.y+ehh),(n.y-ehh)-(c.y+c.h));',
  '        const dx=Math.max(c.x-(pcx+ehw),(pcx-ehw)-(c.x+c.w));\n'
  + '        const dy=Math.max(c.y-(pcy+eDn),(pcy-eUp)-(c.y+c.h));',
  'Hfix-2b r2 H2-1 host chrome is judged against the same painted box');
patch('vg.addColorStop(1,th.dark?"rgba(0,0,0,.5)":rgba(th.ink,.14));', 'vg.addColorStop(1,th.dark?"rgba(0,0,0,.36)":rgba(th.ink,.07));', 'r4 lighter vignette');
patch('ictx.globalAlpha=Math.min(.3,th.blobA*b.a);', 'ictx.globalAlpha=th.dark?Math.min(.09,th.blobA*b.a*.4):Math.min(.2,th.blobA*b.a*.8);', 'r4 pools a whisper by night, a cool mist by day');
patch('pool:["#1E50A2","#1E50A2","#165E83","#165E83","#EB6101"]', 'pool:["#1E50A2","#1E50A2","#165E83","#165E83","#6E87A6"]', 'r4 the day mist stays cool (北斎)');
patch('pool:["#595857","#9FA0A0","#595857","#7D7D7D","#EB6101"]', 'pool:["#595857","#9FA0A0","#595857","#7D7D7D","#9FA0A0"]', 'r4 the day mist stays cool (墨)');
patch('const passes=[[mind()*0.13,.05,th.pig1],[mind()*0.055,.07,th.pig1],[3,.12,th.pig2]];',
  'const passes=[[1.2,th.dark?.2:.14,th.pig2]];', 'r4 the wave band one fine line');
patch('const r2=Math.max(1,1.9*cam.z), rr=r2*2;', 'const r2=Math.max(0.7,1.1*cam.z), rr=r2*2;', 'r4 unseen words as fine points');
patch('draw(eB,0.067*dimF); draw(eD,0.038*dimF);', 'draw(eB,0.03*dimF); draw(eD,0.016*dimF);', 'r4 the word web faint');
patch('lctx.strokeStyle=rgba(th.pig1,(cz<0.7?0.05:0.032)*(FOCUS.length?0.4:1));',
  'lctx.strokeStyle=rgba(th.pig1,(cz<0.7?0.026:0.015)*(FOCUS.length?0.4:1));', 'r4 the kanji mesh faint');
patch('const hubA=cam.z<0.8?0.20:0.10;', 'const hubA=cam.z<0.8?0.1:0.05;', 'r4 hub suns faint');
patch('const z=fragile?[1,1.22][i%2]:[0.66,0.84,1,1.18][i%4];', 'const z=fragile?[1,1.22][i%2]:[0.8,0.9,1,1.15][i%4];', 'r4 no word too small to read');
patch('pool:["#113285","#113285","#4C6CB3","#4C6CB3","#E2041B"]', 'pool:["#113285","#113285","#4C6CB3","#4C6CB3","#2B4C8F"]', 'r4 the night pool in 藍');
patch('themeIx=ix; const t=THEMES[ix];', 'themeIx=ix; const t=THEMES[ix]; adoptHostGround(t);', 'r4 the ground and inks, guarded');

// Round 4 review (T1, fix 4): the universe's own card speaks the interface language, and its
// prototype notes ("実物では…") become true sentences in both languages.
patch("const label='この'+(kind==='word'?'語':'字')+'を学ぶ →';", "const label=uiT('全項目','Full entry');", 'one door label everywhere: 全項目 · Full entry (one hand, slice E)');
patch("studyHtml('word',n.w,'実物では、ここから完全な辞書へ — in the real app this opens the full entry.')",
  "studyHtml('word',n.w,uiT('この語の全項目は、まだない。','No full entry for this word yet.'))", 'r4 a word without an entry says so');
patch('\'</div><div class="note">実物では、ここから助詞ページへ — opens the full particle page.</div>\'',
  '\'</div><div class="note">\'+uiT(\'助詞のページは、まだない。\',\'Particles have no page of their own yet.\')+\'</div>\'', 'r4 a particle says so');
patch("studyHtml('kanji',n.ch,'実物では、ここから漢字ページへ — opens the full kanji page.')",
  "studyHtml('kanji',n.ch,uiT('この字の漢字ページは、まだない。','No kanji page for this character yet.'))", 'r4 a kanji without a page says so');
patch("(num?(\"部首 \"+num+\"：この部首をもつ \"):\"この字を含む \")+\n      fam.length+'字 <button class=\"radq\" id=\"radQ\">部首とは？</button></div>'",
  "(num?uiT(\"部首 \"+num+\"：この部首をもつ \"+fam.length+\"字\",\"Radical \"+num+\" · \"+fam.length+\" kanji have it\"):uiT(\"この字を含む \"+fam.length+\"字\",fam.length+\" kanji contain it\"))+\n      ' <button class=\"radq\" id=\"radQ\">'+uiT('部首とは？','What is a radical?')+'</button></div>'", 'r4 the family head');
patch("(num?(' · 部首 '+num):\"\")", "(num?(uiT(' · 部首 ',' · radical ')+num):\"\")", 'r4 the radical number');
patch("'<button class=\"bt\" id=\"strokeBtn\">もう一度</button>'", "'<button class=\"bt\" id=\"strokeBtn\">'+uiT('もう一度','Replay')+'</button>'", 'r4 replay the strokes');
patch('(words.length?("appears in "+words.length+" words here"):\n        (fam?("builds "+fam.length+" kanji"):("builds "+kin.length+" kanji here")))',
  '(words.length?uiT("ここでは "+words.length+" 語に出てくる","appears in "+words.length+" words here"):\n        (fam?uiT(fam.length+" 字の部品になる","builds "+fam.length+" kanji"):uiT("ここでは "+kin.length+" 字の部品になる","builds "+kin.length+" kanji here")))', 'r4 the kanji line');

// Round 4 review (T1, fix 5): the level rail keeps no promise it cannot keep. 自 is not measured
// yet, so it says so; releasing on it keeps the current level and the handle returns to it. Each
// stop's line speaks the interface language.
patch(`const STOPS=[
 {k:"自",info:"あなたに合わせる — adapts to you"},
 {k:"N1",lv:1,info:"N1 · 高校+ · 漢検準2–2級"},
 {k:"N2",lv:2,info:"N2 · 中学 · 漢検4–3級"},
 {k:"N3",lv:3,info:"N3 · 小5–6 · 漢検6–5級"},
 {k:"N4",lv:4,info:"N4 · 小3–4 · 漢検8–7級"},
 {k:"N5",lv:5,info:"N5 · 小1–2 · 漢検10–9級"}];`, `const STOPS=[
 {k:"自",info:"自 · あなたの段階は、まだ測っていない",en:"auto · your level isn't measured yet"},
 {k:"N1",lv:1,info:"N1 · 高校+ · 漢検準2–2級",en:"N1 · high school+ · Kanken pre-2 to 2"},
 {k:"N2",lv:2,info:"N2 · 中学 · 漢検4–3級",en:"N2 · junior high · Kanken 4 to 3"},
 {k:"N3",lv:3,info:"N3 · 小5–6 · 漢検6–5級",en:"N3 · grades 5–6 · Kanken 6 to 5"},
 {k:"N4",lv:4,info:"N4 · 小3–4 · 漢検8–7級",en:"N4 · grades 3–4 · Kanken 8 to 7"},
 {k:"N5",lv:5,info:"N5 · 小1–2 · 漢検10–9級",en:"N5 · grades 1–2 · Kanken 10 to 9"}];`, 'r4 the rail speaks both languages');
patch(`  lvlInfo.textContent=s.info;
  if(commit){
    if(s.lv&&s.lv!==level){level=s.lv;tideChange();}
    if(!s.lv) setHint("実物では、AI評価・SRS・模試から現在地を推定");
  }`, `  lvlInfo.textContent=uiT(s.info,s.en||s.info);
  if(lvlLabels.firstChild) lvlLabels.firstChild.textContent=uiT("自","auto");
  if(commit){
    if(s.lv&&s.lv!==level){level=s.lv;tideChange();}
    if(!s.lv){
      setHint(uiT("段階はまだ測っていない。N1〜N5 から選ぶ。","Your level isn't measured yet. Choose N1 to N5."));
      lvlSet(Math.max(0,STOPS.findIndex(x=>x.lv===level)),false);
    }
  }`, 'r4 auto keeps its word');

// The rail's visible text and accessible value share the existing stop
// selection. Host language can settle after parse-time setup, so refresh
// that presentation without committing another tide or learner record.
patch('let lvlHotTimer=0;',
  'let lvlHotTimer=0,lvlIx=3;\n' +
  'lvlEl.tabIndex=0;lvlEl.setAttribute("role","slider");\n' +
  'lvlEl.setAttribute("aria-orientation","vertical");\n' +
  'lvlEl.setAttribute("aria-valuemin","0");lvlEl.setAttribute("aria-valuemax",String(STOPS.length-1));',
  'level rail exposes slider semantics');
patch('  const s=STOPS[ix];\n  lvlHandle.style.top=',
  '  const s=STOPS[ix];lvlIx=ix;\n' +
  '  lvlEl.setAttribute("aria-label",uiT("学習段階","Learning level")+" · "+uiT(s.info,s.en||s.info));\n' +
  '  lvlEl.setAttribute("aria-valuenow",String(ix));\n' +
  '  lvlEl.setAttribute("aria-valuetext",uiT(s.info,s.en||s.info));\n' +
  '  lvlHandle.style.top=', 'level rail announces the actual selected stop');
patch('lvlLabels.firstChild.textContent=uiT("自","auto");',
  'lvlLabels.firstChild.textContent=uiT("自","Auto");', 'plain English level rail label');
patch('lvlSet(3,false);\n\n// ---- hint ----',
  'lvlSet(3,false);\n' +
  'lvlEl.addEventListener("keydown",e=>{\n' +
  '  const step={ArrowUp:-1,ArrowLeft:-1,ArrowDown:1,ArrowRight:1}[e.key];\n' +
  '  if(step===undefined&&e.key!=="Home"&&e.key!=="End")return;\n' +
  '  e.preventDefault();e.stopPropagation();\n' +
  '  if(!DRIFT_ON||recordPending.size)return;\n' +
  '  const next=e.key==="Home"?0:e.key==="End"?STOPS.length-1:clamp(lvlIx+step,0,STOPS.length-1);\n' +
  '  lvlEl.classList.add("hot");clearTimeout(lvlHotTimer);lvlSet(next,true);\n' +
  '  lvlHotTimer=setTimeout(()=>lvlEl.classList.remove("hot"),1600);\n' +
  '});\n' +
  'new MutationObserver(()=>lvlSet(lvlIx,false)).observe(document.body,{attributes:true,attributeFilter:["class"]});\n\n' +
  '// ---- hint ----', 'level keyboard and settled host language share lvlSet');

// 3 · the frame loop parks itself while hidden (dt is clamped, resume is safe)
patch(
  '  drawTrail(t);\n  requestAnimationFrame(frame);\n}',
  '  drawTrail(t);\n  if(DRIFT_ON){requestAnimationFrame(frame);}else{rafOn=false;}\n}',
  'frame loop gate',
);
patch(
  'setInterval(refreshActive,650);',
  'setInterval(function(){if(DRIFT_ON)refreshActive();},650);',
  'gate refreshActive interval',
);
// boot: do not start the loop until the layer first shows (the boot call sits
// at column 0; the in-loop call is indented and already rewritten above)
patch(
  '\nrequestAnimationFrame(frame);',
  '\nif(DRIFT_ON){rafOn=true;requestAnimationFrame(frame);}',
  'boot rAF deferred',
);

// G3: preserve the accepted hosted reading/stage/page adapter in generated output.
// Exact-once anchors leave the frozen standalone donor and its own grammar intact.
patch(
  '  nodes.push(n); nodeOf.set(el,n);\n  return n;\n}\nfunction spawnPart(ch,x,y){',
  '  nodes.push(n); nodeOf.set(el,n);\n  mountHostedNodeReading(n);\n  return n;\n}\nfunction spawnPart(ch,x,y){',
  'G3 resting hosted glyph reading',
);
patch(
  '  nodes.push(n); nodeOf.set(el,n);\n  return n;\n}\n// ---- the vault-field: a world plane of galaxies, seen through a camera ----',
  '  nodes.push(n); nodeOf.set(el,n);\n  mountHostedNodeReading(n);\n  return n;\n}\n// ---- the vault-field: a world plane of galaxies, seen through a camera ----',
  'G3 resting hosted particle reading',
);
patch(
  '  cueRetire(n,"tap");   // retain the identity of the answered gesture\n  const lvl=stack[stack.length-1];',
  '  cueRetire(n,"tap");   // retain the identity of the answered gesture\n' +
  '  // Hosted occurrences use the app\'s ladder before the standalone field\'s\n' +
  '  // private rung counter. Cue retirement keeps its existing durable path;\n' +
  '  // the lookup does not await it, duplicate it, or turn it into a grade.\n' +
  '  if(hostedSlip(n,{bloom:true})!==false)return;\n' +
  '  const lvl=stack[stack.length-1];',
  'G3 ordinary hosted taps use the shared ladder',
);

// A satellite promoted by the hosted first tap stays where it was touched.
// Its old constellation offset belongs to that old parent, not a return trip
// for the new centre. Fold the rendered location into its world anchor first.
patch(
  'function bloomFocus(n){\n  if(recordPending.size)return;\n  clearBloom(n.el?n:undefined);',
  'function bloomFocus(n){\n  if(recordPending.size)return;\n' +
    '  const promoted=n.wref&&n.el?.classList.contains("bsat")?s2wl(n.x,n.y):null;\n' +
    '  clearBloom(n.el?n:undefined);\n' +
    '  if(promoted){\n' +
    '    const wr=n.wref;\n' +
    '    n.wx=wr.wx=promoted.x;n.wy=wr.wy=promoted.y;\n' +
    '    wr.ox=wr.oy=wr.hx=wr.hy=wr.px=wr.py=0;wr.ret=false;\n' +
    '  }',
  'hosted satellite promotion keeps its displayed world anchor',
);

// Active constellation glyphs retain native hit ownership above free words.
// Remove the marker on every release, including a kept/relocked glyph.
patch('focusN.el.classList.remove("bctr"); focusN.top=focusN.baseOp;',
  'focusN.el.classList.remove("bctr","hosted-constellation-glyph"); focusN.top=focusN.baseOp;',
  'clear constellation glyph centre marker');
patch('  for(const g of LOCKG){\n    if(g===keep)',
  '  for(const g of LOCKG){\n    g.el.classList.remove("hosted-constellation-glyph");\n    if(g===keep)',
  'clear constellation glyph satellite marker');
patch('  if(n.el){n.el.classList.add("bctr"); n.top=Math.max(n.top,0.97);}',
  '  if(n.el){n.el.classList.add("bctr"); n.top=Math.max(n.top,0.97); if(n.kind==="glyph")n.el.classList.add("hosted-constellation-glyph");}',
  'mark active constellation glyph centre');
patch('    LOCKG.push(g); pinOf[c]=g; g.hlDom=true;',
  '    LOCKG.push(g); pinOf[c]=g; g.hlDom=true;\n    g.el.classList.add("hosted-constellation-glyph");',
  'mark active constellation glyph satellite');

// A receipt is evidence only for its exact command and current local scope.
// Lazy reuse of the controller codec prevents a second Drift schema here.
js += `
// Round 4 review (T1): the universe speaks the interface language the corridor set on <body>.
function uiT(ja,en){return document.body&&document.body.classList.contains("ui-bi")?en:ja;}
// The one-hand pass (contract §1): the host's one slip, asked for the way the entry door is asked for —
//   window.__BUNKI_OPEN_SLIP = { has(kind,key), open(kind,key,options), isOpen(anchor), close() }
// Ordinary hosted taps share its reading → stage → page visit. Held/dive-centre
// callers retain slipFor's idempotent stage request. Standalone keeps its own
// field grammar; camera, pinch, lock and flick handlers do not pass through here.
function slipHost(kind,key){
  const h=typeof window!=="undefined"&&window.__BUNKI_OPEN_SLIP;
  if(!h||typeof h.open!=="function") return null;
  if(typeof h.has==="function"&&!h.has(kind,key)) return null;
  return h;
}
function slipAway(){
  const h=typeof window!=="undefined"&&window.__BUNKI_OPEN_SLIP;
  // A reading-only visit has no popup yet, but must fold when its scene leaves.
  if(h&&typeof h.close==="function") h.close();
}
function mountHostedNodeReading(n,reading){
  if(n.kind!=="glyph"&&n.kind!=="part")return null;
  const kind=n.kind==="glyph"?"kanji":"particle";
  const h=slipHost(kind,n.ch);
  if(!h)return null; // standalone retains its own unannotated field
  reading=reading||h.reading?.(kind,n.ch)||"";
  const kana=s=>String(s).replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
  if(!reading||kana(reading)===kana(n.ch))return null;
  const base=n.el.querySelector(n.kind==="glyph"?".g":".pch");
  if(!base)return null;
  let ruby=base.querySelector(":scope > ruby.drift-reading");
  if(!ruby){
    ruby=document.createElement("ruby");ruby.className="drift-reading";ruby.lang="ja";
    ruby.append(...base.childNodes);
    const rt=document.createElement("rt");rt.textContent=reading;ruby.append(rt);base.append(ruby);
  }
  n.r=reading;
  return ruby;
}
function hostedSlip(n,{redo=false,bloom=false}={}){
  const kind=n.kind==="word"?"word":n.kind==="glyph"?"kanji":n.kind==="part"?"particle":null;
  const key=kind==="word"?n.w:n.ch;
  const h=kind&&key?slipHost(kind,key):null;
  if(!h||!n.el||!n.el.isConnected) return false;
  if(bloom&&n.kind==="word"&&!n.el.dataset.ladderRung&&stack.length===0&&!lockOn){
    bloomFocus(n); // keep the existing family response, without an extra tap rung
    bloomLast=performance.now();
  }
  const clearReveal=()=>{
    n.el.classList.remove("unfolded","glossed","hosted-reading-shown");
    if(unfolded===n)unfolded=null;
  };
  const reveal=reading=>{
    if(n.kind==="word"){
      collapseUnfold();
      n.el.classList.add("unfolded");n.el.classList.remove("glossed");unfolded=n;
    }else if(reading){
      // Reuse the resting annotation; its caption remains a sibling.
      if(mountHostedNodeReading(n,reading))n.el.classList.add("hosted-reading-shown");
    }
    return clearReveal;
  };
  const readingVisible=()=>{
    const reading=n.el.querySelector(n.kind==="word"?".yomi":"ruby rt");
    if(!reading?.textContent.trim())return false;
    const s=getComputedStyle(reading);
    return reading.getClientRects().length>0&&s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)>0;
  };
  const look={surface:key,label:key,reading:n.r||"",gloss:n.g||""};
  return h.open(kind,key,{anchor:n.el,redo,look,reveal,clearReveal,readingVisible,
    onClose:reason=>{if(reason!=="dive")clearReveal();}});
}
function slipFor(n){
  const kind=n.kind==="word"?"word":n.kind==="glyph"?"kanji":n.kind==="part"?"particle":null;
  const key=kind==="word"?n.w:n.ch;
  const h=kind&&key?slipHost(kind,key):null;
  if(!h||!n.el||!n.el.isConnected)return false;
  if(typeof h.isOpen==="function"&&h.isOpen(n.el)) return false;
  const result=hostedSlip(n,{redo:true});
  return result==="opened"||result==="reading";
}
// Round 4 review (T1, fix 2): by day the universe keeps a sky of its own (the donor's own cool
// ground), and by night it stands on the host world's ground only when every word ink keeps its
// contrast there: at least 3:1, and never below the donor's own lowest ink where that is under
// 4.5:1. Any ink still under 3:1 on its ground is deepened toward the palette's ink until it holds.
function lumaOf(h){const c=rgbOf(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});return .2126*c[0]+.7152*c[1]+.0722*c[2];}
function contrastOf(a,b){const x=lumaOf(a),y=lumaOf(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function lowestInk(inks,g){return Math.min.apply(null,inks.map(c=>contrastOf(c,g)));}
function mixHex(a,b,f){const x=rgbOf(a),y=rgbOf(b);return "#"+x.map((v,i)=>Math.round(v+(y[i]-v)*f).toString(16).padStart(2,"0")).join("");}
function hostGround(){
  try{
    const g=getComputedStyle(document.documentElement).getPropertyValue("--ground").trim();
    return /^#[0-9a-f]{6}$/i.test(g)?g.toLowerCase():null;
  }catch{return null;}
}
function groundFor(t){
  const base=t.base||t;
  if(!base.dark)return base.ground;
  const h=hostGround();
  if(!h)return base.ground;
  const floor=Math.max(3,Math.min(lowestInk(base.wcol,base.ground),4.5));
  return lowestInk(base.wcol,h)>=floor?h:base.ground;
}
function inkFloor(c,g,toward){
  let out=c;
  for(let i=1;i<=20&&contrastOf(out,g)<3;i+=1)out=mixHex(c,toward,i*.05);
  return out;
}
function adoptHostGround(t){
  if(!t.base)t.base={ground:t.ground,plaque:t.plaque,wcol:t.wcol.slice(),dark:t.dark};
  const g=groundFor(t);
  t.ground=g;
  t.plaque=g===t.base.ground?t.base.plaque:rgba(g,t.dark?.93:.92);
  t.wcol=t.base.wcol.map(c=>inkFloor(c,g,t.ink));
}
function layoutHeldRing(ax,ay){
  const measure=n=>{
    const scale=Math.max(n.s||1,n.ts||1)*cam.z;
    const angle=Math.max(Math.abs(n.cr||0),Math.abs(n.rot||0))*Math.PI/180;
    const c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
    const w=n.el.offsetWidth,h=n.el.offsetHeight;
    return {hw:(w*c+h*s)*scale/2+2,hh:(w*s+h*c)*scale/2+2};
  };
  const origin=w2s(ax,ay);
  const centre={x:origin.x,y:origin.y,...measure(focusN),fixed:true};
  const bodies=[centre];
  for(const wr of FOCUS){
    const n=wr.node;
    if(wr.lk||!wr.bR||!n||n.gone||n.removed)continue;
    const raw=ringTarget(ax,ay,wr.bAng,wr.bR),at=w2s(raw.x,raw.y);
    const body={wr,x:at.x,y:at.y,...measure(n)};
    body.left=RING_EDGE_W+body.hw;body.right=vw()-RING_EDGE_E-body.hw;
    body.top=RING_EDGE_TOP+body.hh;body.bottom=vh()-RING_EDGE_BOT-body.hh;
    // A body wider than the available band still keeps its own centre on
    // the glass; no member is hidden, discarded, or silently made smaller.
    if(body.left>body.right)body.left=body.right=(RING_EDGE_W+vw()-RING_EDGE_E)/2;
    if(body.top>body.bottom)body.top=body.bottom=(RING_EDGE_TOP+vh()-RING_EDGE_BOT)/2;
    body.x=clamp(body.x,body.left,body.right);body.y=clamp(body.y,body.top,body.bottom);
    bodies.push(body);
  }
  const separate=(a,b,axis,amount)=>{
    const positive=b[axis]>=a[axis],sign=positive?1:-1;
    const low=axis==="x"?"left":"top",high=axis==="x"?"right":"bottom";
    const roomA=a.fixed?0:Math.max(0,positive?a[axis]-a[low]:a[high]-a[axis]);
    const roomB=b.fixed?0:Math.max(0,positive?b[high]-b[axis]:b[axis]-b[low]);
    if(roomA+roomB<amount)return false;
    let moveA=Math.min(roomA,amount/2),moveB=amount-moveA;
    if(moveB>roomB){moveA+=moveB-roomB;moveB=roomB;}
    a[axis]-=sign*moveA;b[axis]+=sign*moveB;
    return true;
  };
  // At most fourteen satellites participate. Repeated local separation
  // resolves chains of neighbours while leaving already-clear targets alone.
  for(let pass=0;pass<32;pass++){
    let changed=false;
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
      const a=bodies[i],b=bodies[j];
      const dx=a.hw+b.hw-Math.abs(a.x-b.x),dy=a.hh+b.hh-Math.abs(a.y-b.y);
      if(dx<=0||dy<=0)continue;
      const moved=dx<dy?(separate(a,b,"x",dx+0.25)||separate(a,b,"y",dy+0.25)):
        (separate(a,b,"y",dy+0.25)||separate(a,b,"x",dx+0.25));
      changed=moved||changed;
    }
    if(!changed)break;
  }
  for(const body of bodies)if(body.wr){
    const at=s2wl(body.x,body.y);
    body.wr.hx=at.x-body.wr.wx;body.wr.hy=at.y-body.wr.wy;
  }
}
function recordCurrent(bridge,generation,scopeId){
  return bridge===recordBridge&&generation===recordGeneration&&bridge.isCurrent(scopeId)===true;
}
async function checkedRecordView(raw){
  if(!raw||raw.status!=="active"||typeof raw.scopeId!=="string"||!raw.scopeId.length||raw.scopeId.length>200||
    !Number.isSafeInteger(raw.revision)||raw.revision<0)throw new Error("record-unavailable");
  recordCodec=recordCodec||import("./record-controller.mjs");
  const {parseDriftState}=await recordCodec;
  return Object.freeze({status:"active",scopeId:raw.scopeId,revision:raw.revision,driftState:parseDriftState(raw.driftState)});
}
function publishRecord(view,bridge,generation){
  if(!recordCurrent(bridge,generation,view.scopeId))throw new Error("record-owner-changed");
  if(recordView&&recordView.scopeId===view.scopeId){
    if(view.revision<recordView.revision)throw new Error("record-stale-projection");
    if(view.revision===recordView.revision&&JSON.stringify(view.driftState)!==JSON.stringify(recordView.driftState))
      throw new Error("record-projection-conflict");
  }
  const firstScope=!recordView||recordView.scopeId!==view.scopeId;
  recordView=view;recordReady=true;
  store=JSON.parse(JSON.stringify(view.driftState.store));
  settled=store.lk;gathered=store.lu;
  __layer.dataset.recordState="active";
  updateTray();rePri();
  if(firstScope){
    hint.classList.toggle("first-cue",!store.cue);
    for(const n of nodes)if(!n.recordPending)delete n.recordIntent;
    // The initial field may have been built before hosted hydration. Rebuild
    // only on a scope handoff; routine commits preserve the encountered field.
    tideChange();
  }
}
function unavailableRecord(bridge,generation){
  if(bridge!==recordBridge||generation!==recordGeneration)return;
  recordReady=false;__layer.dataset.recordState="recovery-required";
  setHint("判断を確認できません。ことばを残しています。再読み込みしてください。");
}
function refreshRecord(){
  if(!recordBridge)return Promise.resolve({status:"loading"});
  if(recordRead)return recordRead;
  const bridge=recordBridge,generation=recordGeneration;
  const run=(async()=>{
    try{
      const view=await checkedRecordView(await bridge.read());
      // A background read may have captured the previous durable revision
      // before a gesture committed. Its late arrival cannot demote the newer
      // projection. Acknowledgments still require publishRecord's strict check.
      if(recordReady&&recordView&&view.scopeId===recordView.scopeId&&view.revision<recordView.revision&&
        recordCurrent(bridge,generation,view.scopeId))return recordView;
      publishRecord(view,bridge,generation);
      return view;
    }catch{
      unavailableRecord(bridge,generation);
      return {status:"recovery-required"};
    }
  })();
  recordRead=run;
  void run.finally(()=>{if(recordRead===run)recordRead=null;});
  return run;
}
function hostedCue(n,gesture){
  if(recordCueRun)return recordCueRun;
  const bridge=recordBridge,generation=recordGeneration;
  if(!bridge||!recordView){setHint("学びの記録を読み込んでいます。続く場合は再読み込みしてください。");return Promise.resolve(false);}
  const kind=n.kind,key=kind==="word"?n.w:n.ch;
  if(!["word","glyph","kanji","part"].includes(kind)||typeof key!=="string"||!key.length||!["tap","hold"].includes(gesture))
    return Promise.resolve(false);
  if(recordCueIntent&&recordCueIntent.scopeId!==recordView.scopeId)return Promise.resolve(false);
  if(!recordCueIntent)recordCueIntent=Object.freeze({version:1,changeId:crypto.randomUUID(),occurredAt:new Date().toISOString(),scopeId:recordView.scopeId,kind,key,gesture});
  const intent=recordCueIntent;
  hint.classList.remove("first-cue");
  __layer.dataset.recordCuePending=intent.changeId;
  const run=(async()=>{
    try{
      if(!recordReady){
        const refreshed=await refreshRecord();
        if(refreshed.status!=="active")throw new Error("record-unavailable");
      }
      if(!recordCurrent(bridge,generation,intent.scopeId))throw new Error("record-owner-changed");
      const raw=await bridge.retireCue(intent);
      if(!raw||!raw.receipt||raw.receipt.changeId!==intent.changeId||!["committed","duplicate"].includes(raw.receipt.outcome))
        throw new Error("record-receipt-mismatch");
      const view=await checkedRecordView(raw);
      if(view.scopeId!==intent.scopeId||view.driftState.store.cue!==1)throw new Error("record-cue-mismatch");
      publishRecord(view,bridge,generation);
      if(!recordCurrent(bridge,generation,intent.scopeId))throw new Error("record-owner-changed");
      hint.classList.remove("first-cue");
      recordCueIntent=null;
      return true;
    }catch{
      unavailableRecord(bridge,generation);
      if(bridge===recordBridge&&generation===recordGeneration)hint.classList.add("first-cue");
      return false;
    }finally{
      if(bridge===recordBridge&&generation===recordGeneration)delete __layer.dataset.recordCuePending;
    }
  })();
  recordCueRun=run;
  void run.finally(()=>{if(recordCueRun===run)recordCueRun=null;});
  return run;
}
async function hostedGrade(n,dir){
  const bridge=recordBridge,generation=recordGeneration;
  if(!bridge||!recordView){setHint("学びの記録を読み込んでいます。続く場合は再読み込みしてください。");return;}
  if(dir!==1&&dir!==-1)return;
  const kind=n.kind,key=kind==="word"?n.w:n.ch;
  if(!["word","glyph","kanji","part"].includes(kind)||typeof key!=="string"||!key.length)return;
  let intent=n.recordIntent;
  if(intent&&(intent.scopeId!==recordView.scopeId||intent.kind!==kind||intent.key!==key||intent.direction!==dir)){
    setHint("前の判断を確認するには、もう一度同じ方向に払ってください。");return;
  }
  if(!intent){
    intent=Object.freeze({version:1,changeId:crypto.randomUUID(),occurredAt:new Date().toISOString(),scopeId:recordView.scopeId,kind,key,direction:dir});
    n.recordIntent=intent;
  }
  const frozen=!!n.frozen;
  n.recordPending=true;n.frozen=true;recordPending.add(n);
  n.el.setAttribute("aria-busy","true");n.el.dataset.recordPending=intent.changeId;
  setHint("判断を保存しています。");
  try{
    if(!recordReady){
      const refreshed=await refreshRecord();
      if(refreshed.status!=="active")throw new Error("record-unavailable");
    }
    if(!recordCurrent(bridge,generation,intent.scopeId))throw new Error("record-owner-changed");
    const raw=await bridge.commit(intent);
    if(!raw||!raw.receipt||raw.receipt.changeId!==intent.changeId||!["committed","duplicate"].includes(raw.receipt.outcome))
      throw new Error("record-receipt-mismatch");
    const view=await checkedRecordView(raw);
    if(view.scopeId!==intent.scopeId)throw new Error("record-scope-mismatch");
    publishRecord(view,bridge,generation);
    if(!recordCurrent(bridge,generation,intent.scopeId))throw new Error("record-owner-changed");
    n.recordPending=false;recordPending.delete(n);
    n.el.removeAttribute("aria-busy");delete n.el.dataset.recordPending;
    const lvl=stack[stack.length-1],wasCenter=lvl&&lvl.center===n;
    finishGrade(n,dir,wasCenter);
    delete n.recordIntent;
  }catch{
    unavailableRecord(bridge,generation);
  }finally{
    if(n.recordPending){n.recordPending=false;n.frozen=frozen;recordPending.delete(n);}
    n.el.removeAttribute("aria-busy");delete n.el.dataset.recordPending;
  }
}
function setRecordBridge(bridge){
  if(!bridge||bridge.version!==1||typeof bridge.read!=="function"||typeof bridge.commit!=="function"||typeof bridge.retireCue!=="function"||typeof bridge.isCurrent!=="function")
    return Promise.reject(new Error("record-bridge-required"));
  if(bridge!==recordBridge&&recordPending.size)return Promise.reject(new Error("record-judgment-pending"));
  if(bridge!==recordBridge&&recordCueRun)return Promise.reject(new Error("record-cue-pending"));
  if(bridge!==recordBridge){
    recordBridge=bridge;recordGeneration++;recordView=null;recordReady=false;recordRead=null;recordCueIntent=null;
    __layer.dataset.recordState="loading";
  }
  return refreshRecord();
}
`;

// G6 · the scale bridge extends the generated host, never the frozen donor.
patch("  if(!DRIFT_ON||recordPending.size)return;\n  if(e.isPrimary&&touches.size){touches.clear();pinch=null;}",
  "  if(!skyPointerAllowed(e))return;\n  const scaleReady=scaleSceneReady();\n  const sourceTap=!scaleReady&&canNavigate()&&scaleBridge?.beginSourceTap?.(e.target);\n  if(!scaleReady&&!sourceTap){\n    // Rejected sky fingers stay physical members until every one lifts, even\n    // if a pending record acknowledges or a stage closes while they are down.\n    if(scaleBridge){\n      scalePhysicalPointers.set(e.pointerId,e.pointerType);\n      scaleDrain=true;\n      if(touches.size)touches.set(e.pointerId,{x:e.clientX,y:e.clientY});\n      blockScaleHand();\n    }\n    return;\n  }\n  if(scaleBridge){\n    scalePhysicalPointers.set(e.pointerId,e.pointerType);\n    if(scaleDrain){scaleBlocked=true;return;}\n  }\n  if(!touches.size){scaleConsumedAt=0;scaleHandConsumed=false;}", "G6 pointer origins belong to the visible sky only");
patch("  touches.set(e.pointerId,{x:e.clientX,y:e.clientY});",
  "  touches.set(e.pointerId,{x:e.clientX,y:e.clientY,sourceTap:sourceTap||null});\n  if(scaleBridge&&scaleBlocked)return;", "G6 cancelled hand stays cancelled until all pointers leave");
patch("  if(touches.size===2){\n    rebasePinch();",
  "  if(touches.size===2){\n    if(scaleBridge&&[...touches.values()].some(t=>t.sourceTap)){blockScaleHand();return;}\n    if(scaleBridge){scaleHandConsumed=true;scaleConsumedAt=performance.now();}\n    rebasePinch();", "G6 every two-pointer hand consumes its compatibility click");
patch("  const t2=touches.get(e.pointerId);",
  "  const t2=touches.get(e.pointerId);\n  if(t2?.sourceTap){\n    if(!sourceTapReady(t2)||Math.abs(e.clientX-px)>8||Math.abs(e.clientY-py)>8)blockScaleHand();\n    return; // A stage continuation has no drag, pan or judgment authority.\n  }\n  if(scaleBridge&&t2&&!scaleSceneReady()){blockScaleHand();return;}", "G6 a hosted overlay cancels an already tracked hand");
patch("  const owner=e.pointerId===gestureId;",
  "  const tracked=touches.get(e.pointerId);\n  if(scaleBridge&&tracked&&(tracked.sourceTap?\n      (!sourceTapReady(tracked,e.target)||Math.abs(e.clientX-px)>8||Math.abs(e.clientY-py)>8):!scaleSceneReady())){cancelPointer(e);return;}\n  const owner=e.pointerId===gestureId;", "G6 an admitted hand cannot finish behind a hosted overlay or pending record");
patch("      if(pn===tn&&!moved&&touches.size===1&&!tn.gone){",
  "      if(pn===tn&&!moved&&touches.size===1&&!tn.gone&&(!scaleBridge||scaleSceneReady())){", "G6 long press preserves current scene admission");
patch("  if(pn&&pn.gone) pn=null;",
  "  if(pn&&pn.gone) pn=null;\n  if(sourceTap&&pn?.el!==sourceTap.anchor){blockScaleHand();return;}", "G6 source continuation belongs to its exact live occurrence");
patch('  if(pn&&(pn.kind==="word"||pn.kind==="glyph")&&stack.length===0){',
  '  if(!sourceTap&&pn&&(pn.kind==="word"||pn.kind==="glyph")&&stack.length===0){', "G6 source continuation never arms a hold");
patch("function rebasePinch(){\n  if(touches.size!==2)",
  "function rebasePinch(){\n  if(scaleBridge&&scaleBlocked){pinch=null;return;}\n  if(touches.size!==2)", "G6 no pinch rebasing after third pointer");
patch("  if(touches.size>2){\n    pinch=null;",
  "  if(touches.size>2){\n    if(scaleBridge)scaleBlocked=true;\n    pinch=null;", "G6 third pointer cancels whole hand");
patch("    const mid={x:(v[0].x+v[1].x)/2,y:(v[0].y+v[1].y)/2};",
  "    const mid={x:(v[0].x+v[1].x)/2,y:(v[0].y+v[1].y)/2};\n    if(scalePinchMove(d,mid))return;", "G6 one scale crossing with the actual sky midpoint");
patch("  if(!touches.delete(e.pointerId)) return false;\n  if(FOCUS.length)",
  "  if(!touches.delete(e.pointerId)) return false;\n  if(scaleBridge&&scaleHandConsumed)scaleConsumedAt=performance.now();\n  if(!touches.size){scaleBlocked=false;scaleHandConsumed=false;}\n  if(FOCUS.length)", "G6 release cancelled hand only when empty");
patch("function cancelPointer(e){",
  "function cancelPointer(e){\n  if(scaleBridge){\n    if(!touches.delete(e.pointerId))return;\n    const consumed=scaleHandConsumed||touches.size>0;\n    blockScaleHand();scaleBlocked=touches.size>0;scaleHandConsumed=scaleBlocked&&consumed;\n    return;\n  }", "G6 cancelled owned pointer cannot promote a remainder");
patch("function buildWorld(){",
  "function buildWorld(){\n  scaleSceneGeneration++;", "G6 retained sky place pins actual world generation");
patch("  drawTrail(t);\n  if(DRIFT_ON)",
  "  drawTrail(t);\n  drawScaleStars();\n  if(DRIFT_ON)", "G6 star projection follows the real camera");
patch("driftState:parseDriftState(raw.driftState)});",
  "driftState:parseDriftState(raw.driftState),keptWords:checkedKeptWords(raw.keptWords)});", "G6 validate immutable kept projection");
patch("if(view.revision===recordView.revision&&JSON.stringify(view.driftState)!==JSON.stringify(recordView.driftState))",
  "if(view.revision===recordView.revision&&(JSON.stringify(view.driftState)!==JSON.stringify(recordView.driftState)||JSON.stringify(view.keptWords)!==JSON.stringify(recordView.keptWords)))", "G6 reject conflicting projection at same revision");
patch("  recordView=view;recordReady=true;",
  "  recordView=view;recordReady=true;\n  paintScaleStars();", "G6 publish kept points only after committed record view");
patch("  recordReady=false;__layer.dataset.recordState=\"recovery-required\";",
  "  recordReady=false;__layer.dataset.recordState=\"recovery-required\";\n  paintScaleStars();", "G6 retire unconfirmed record projection");

js += `
function canNavigate(){return !recordPending.size&&!recordCueRun;}
function scaleSceneReady(){
  return DRIFT_ON&&canNavigate()&&(!scaleBridge||scaleBridge.canStep()===true);
}
function skyPointerAllowed(e){
  const target=e.target;
  return DRIFT_ON&&target instanceof Element&&__layer.contains(target)&&
    !hostChrome(target)&&!target.closest('#card,#radoc,#lvl,.scale-star');
}
function sourceTapReady(tracked,target){
  const lease=tracked?.sourceTap;
  return DRIFT_ON&&canNavigate()&&!scaleBlocked&&touches.size===1&&Date.now()-pt<430&&
    !!lease&&typeof lease.isCurrent==='function'&&lease.isCurrent()===true&&
    !!pn&&!pn.gone&&pn.el===lease.anchor&&
    (!target||target===lease.anchor||lease.anchor.contains(target));
}
function clearScalePointers(){
  // A scene can sleep while its physical hand is still on the glass.
  if(scalePhysicalPointers.size){scaleDrain=true;scaleConsumedAt=performance.now();}
  clearTimeout(lpTimer);lpFired=false;
  if(pn){pn.dragX=0;pn.dragY=0;}
  pn=null;touches.clear();pinch=null;gestureActive=false;gestureId=null;moved=false;scaleBlocked=scaleDrain;scaleHandConsumed=scaleDrain;
  cam.vx=0;cam.vy=0;
}
function releaseScaleDrain(){
  if(scalePhysicalPointers.size||!scaleDrain)return;
  scaleDrain=false;scaleBlocked=false;scaleHandConsumed=false;scaleConsumedAt=performance.now();
}
function drainScalePointer(event){
  // Passive observation only: foreign text/chrome pointers are never acquired.
  if(scalePhysicalPointers.delete(event.pointerId))releaseScaleDrain();
}
function retireScalePointers(ids){
  if(!ids.length)return;
  const live=ids.some(id=>touches.has(id));
  for(const id of ids)scalePhysicalPointers.delete(id);
  if(live)clearScalePointers();
  releaseScaleDrain();
}
function scaleTouchesLifted(event){
  if(!event.isTrusted||event.touches.length)return;
  retireScalePointers([...scalePhysicalPointers].filter(([,type])=>type==='touch').map(([id])=>id));
}
function scaleMouseReleased(event){
  if(event.isTrusted&&event.pointerType==='mouse'&&scalePhysicalPointers.get(event.pointerId)==='mouse'&&
    (event.type==='pointerdown'||event.buttons===0))retireScalePointers([event.pointerId]);
}
function interruptScaleHand(event){
  if(!scaleBridge)return;
  if(event.type==='blur'?event.target===window:document.visibilityState==='hidden')clearScalePointers();
}
function requestScaleStep(direction,target){
  if(!scaleBridge||scaleBusy||!scaleSceneReady()||scaleBridge.canStep(direction,target)!==true)return false;
  scaleBusy=true;
  let result;
  try{result=scaleBridge.step(direction,target);}
  catch(error){scaleBusy=false;throw error;}
  if(result&&typeof result.then==='function'){
    // A second control cannot race a host transition that is still settling.
    return Promise.resolve(result).then(value=>value!==false,error=>{
      console.error('Scale transition failed',error);
      setHint(uiT('移動できませんでした。もう一度試してください。','Could not move. Please try again.'));
      return false;
    }).finally(()=>{scaleBusy=false;});
  }
  scaleBusy=false;return result!==false;
}
function blockScaleHand(){
  scaleBlocked=true;scaleHandConsumed=true;scaleConsumedAt=performance.now();
  pinch=null;clearTimeout(lpTimer);lpFired=false;
  if(pn){pn.dragX=0;pn.dragY=0;}
  pn=null;gestureActive=false;gestureId=null;moved=false;
}
function scalePinchMove(distance,mid){
  if(!scaleBridge)return false;
  if(scaleBlocked||pinch.fired)return true;
  const ratio=distance/pinch.d0;
  const direction=ratio>1.28?'in':ratio<0.74?'out':null;
  if(!direction)return true;
  // One crossing, even when the host refuses it. A new intent needs a new hand.
  pinch.fired=true;scaleConsumedAt=performance.now();
  gestureId=null;gestureActive=false;clearTimeout(lpTimer);
  if(stack.length&&direction==='in'){
    if(scaleSceneReady()&&!scaleBusy)pinchDive(mid);
    return true;
  }
  requestScaleStep(direction,scaleArticle?{articleId:scaleArticle.articleId}:undefined);
  return true;
}
function setScaleBridge(bridge){
  if(!bridge||typeof bridge.canStep!=='function'||typeof bridge.step!=='function')throw new Error('scale-bridge-required');
  if(!canNavigate())return false;
  clearScalePointers();scaleBridge=bridge;paintScaleStars();return true;
}
function scenePath(){
  if(stack.length>64||stack.some(level=>!level.center?.el?.isConnected||level.center.gone||level.center.removed))return null;
  return stack.map(level=>{
    const n=level.center;
    if(!scaleNodeIds.has(n))scaleNodeIds.set(n,++scaleNodeSerial);
    const retained=scaleNodeIds.get(n);
    return n.kind==='word'?['word',n.w,n.r||'',n.g||'',retained]:[n.kind,n.ch,!!n.comp,retained];
  });
}
function capturePlace(){
  if(!canNavigate())return null;
  const path=scenePath();if(!path)return null;
  return Object.freeze({version:1,scopeId:recordView?.scopeId||null,generation:recordGeneration,
    sceneGeneration:scaleSceneGeneration,path:JSON.stringify(path),
    world:Object.freeze({width:WR.w,height:WR.h}),camera:Object.freeze({x:cam.x,y:cam.y,z:cam.z,rot:cam.rot})});
}
function restorePlace(place){
  const path=scenePath();
  if(!path||!canNavigate()||!place||place.version!==1||place.scopeId!==(recordView?.scopeId||null)||
    place.generation!==recordGeneration||place.sceneGeneration!==scaleSceneGeneration||place.path!==JSON.stringify(path)||
    place.world?.width!==WR.w||place.world?.height!==WR.h)return false;
  const c=place.camera;
  if(!c||!['x','y','z','rot'].every(key=>Number.isFinite(c[key]))||c.z<0.34||c.z>2.6||Math.abs(c.rot)>Math.PI||
    c.x<0||c.x>WR.w||c.y<0||c.y>WR.h)return false;
  clearScalePointers();Object.assign(cam,{x:c.x,y:c.y,z:c.z,rot:c.rot});camT=null;camClamp();hostDepth();paintScaleStars();return true;
}
function focusArticle(article){
  if(article===null){scaleArticle=null;paintScaleStars();return true;}
  if(!article||typeof article.articleId!=='string'||!article.articleId||typeof article.title!=='string')return false;
  // Hfix-1A · the title's words (the app's one word rule, jaWords), when they spell the title: its caption breaks only between them
  const words=Array.isArray(article.words)&&article.words.every(w=>typeof w==='string')&&article.words.join('')===article.title?article.words.slice():null;
  if(scaleArticle?.articleId!==article.articleId||article.reveal===true){
    // The star is anchored in the retained camera's world, never in a donor word.
    const p=s2wl(vw()/2,vh()*0.34);
    scaleArticle={articleId:article.articleId,title:article.title,words,x:p.x,y:p.y};
  }else{scaleArticle.title=article.title;scaleArticle.words=words;}
  paintScaleStars();return true;
}
function checkedKeptWords(rows){
  if(rows===undefined)return []; // older bridge consumers have no kept projection
  if(!Array.isArray(rows))throw new Error('kept-projection-invalid');
  const seen=new Set();
  return rows.map(row=>{
    if(!row||typeof row.key!=='string'||seen.has(row.key)||typeof row.id!=='string'||!row.id||
      typeof row.label!=='string'||typeof row.reading!=='string'||!['available','mismatch','unavailable'].includes(row.status))
      throw new Error('kept-projection-invalid');
    // Hfix-2b · X-1 — \`why\` is the star's own reason. A host that does not send one is not
    // broken, it is older: the field is optional and absent means "nothing recorded", never a
    // refused projection. A \`why\` of the wrong type IS a broken projection and is refused.
    if(row.why!==undefined&&typeof row.why!=='string')throw new Error('kept-projection-invalid');
    seen.add(row.key);
    return Object.freeze({key:row.key,id:row.id,label:row.label,reading:row.reading,status:row.status,
      why:typeof row.why==='string'?row.why:''});
  });
}
function scaleHash(key){let h=2166136261;for(const ch of key)h=Math.imul(h^ch.codePointAt(0),16777619)>>>0;return h;}
/** Hfix-2b · X-12 — where a kept word sits.
 *
 * The old seat was WR.w*(0.12+hash*0.76): a uniform scatter across 76% of a world 3.2 viewports
 * wide, while the opening camera sees ONE viewport at its centre. A given word therefore had
 * about a one-in-six chance of falling in the opening view, so with a handful of kept words the
 * sky reliably opened with none of them on glass and one only wandered in after a drag — exactly
 * what D2 reported.
 *
 * Seats now grow outward from the camera's home on a golden-angle spiral: the nearest few are
 * always inside the opening window, and the rest spread into the wider world as the shelf grows.
 * Deterministic, so the same shelf seats the same way every time, and the collision pass still
 * nudges any two that crowd. */
const KEPT_ANGLE=Math.PI*(3-Math.sqrt(5));
function keptSeat(index){
  // the opening window, less the margin drawScaleStars already treats as off-glass
  const halfW=Math.max(80,vw()/2-60),halfH=Math.max(80,(vh()-180)/2);
  const unit=Math.min(halfW,halfH)/2;
  const r=unit*Math.sqrt(index+0.6),a=index*KEPT_ANGLE;
  return {x:clamp(WR.w/2+r*Math.cos(a),40,Math.max(40,WR.w-40)),
          y:clamp(WR.h/2+r*Math.sin(a),40,Math.max(40,WR.h-40))};
}
function paintScaleStars(){
  if(!scaleBridge)return;
  const rows=recordReady?recordView?.keptWords||[]:[];
  scaleWorldKey=WR.w+','+WR.h;
  const signature=JSON.stringify([scaleArticle,recordView?.scopeId,rows,WR.w,WR.h,document.body.classList.contains('ui-bi')]);
  if(signature!==scaleProjectionKey){
    scaleProjectionKey=signature;
    if(!scaleLayer){
      scaleLayer=document.createElement('div');scaleLayer.className='scale-stars';
      sky.insertBefore(scaleLayer,sky.firstChild);
    }
    scaleLayer.setAttribute('aria-label',uiT('読んだ星と残した言葉','Your article and kept words'));
    const next=new Set();
    const mount=(key,label,attrs,x,y,action)=>{
      next.add(key);let star=scaleStars.get(key);
      if(!star){star=document.createElement('button');star.type='button';star.className='scale-star';star.addEventListener('click',()=>star.scaleActivate?.());scaleStars.set(key,star);scaleLayer.append(star);bindScaleStarPress(star);}
      star.replaceChildren();
      const caption=document.createElement('span');caption.className='scale-star-caption';
      star.append(caption);star.title=label;star.scaleFullSize=null;scaleLayoutDirty=true;
      if(attrs.articleId&&attrs.words){
        // Hfix-1A (round 1: 知床 broken across lines, H-nami-04, H-rokusho-11): a line ends only between two of its words
        caption.classList.add('is-words');
        attrs.words.forEach((word,i)=>{if(i)caption.append(document.createElement('wbr'));caption.append(document.createTextNode(word));});
      }else if(attrs.articleId){
        for(const part of label.split(/([0-9０-９]+)/u)){
          if(/^[0-9０-９]+$/u.test(part)){const number=document.createElement('span');number.className='scale-star-number';number.textContent=part;caption.append(number);}
          else caption.append(document.createTextNode(part));
        }
      }
      if(!attrs.articleId)caption.textContent=label;
      // Hfix-2b · X-1 — the star says why it is there, in Today's sky's own words and from the
      // same recorded sources. A word with no recorded reason says nothing: no line, nothing
      // added to its name, no empty parenthesis. It never pretends to have a reason.
      const why=typeof attrs.why==='string'?attrs.why.trim():'';
      if(why){const line=document.createElement('span');line.className='scale-star-why';line.textContent=why;caption.append(line);}
      const name=attrs.articleId?uiT('読み物の棚へ：','Article shelf: ')+label:uiT('残した言葉：','Kept word: ')+label;
      star.setAttribute('aria-label',why?name+' · '+why:name);
      if(why)star.dataset.why=why;else delete star.dataset.why;
      star.title=why?label+' · '+why:label;
      if(attrs.articleId)star.dataset.articleId=attrs.articleId;else star.dataset.keptKey=attrs.keptKey;
      star.classList.toggle('scale-star-article',!!attrs.articleId);star.classList.toggle('scale-star-kept',!attrs.articleId);
      star.scaleActivate=action;star.scaleX=x;star.scaleY=y;
    };
    if(scaleArticle)mount('article:'+scaleArticle.articleId,scaleArticle.title,{articleId:scaleArticle.articleId,words:scaleArticle.words},scaleArticle.x,scaleArticle.y,()=>requestScaleStep('in',{articleId:scaleArticle.articleId}));
    rows.forEach((row,index)=>{
      const seat=keptSeat(index);
      mount('kept:'+row.key,row.label,{keptKey:row.key,why:row.why},seat.x,seat.y,
        ()=>requestScaleStep('word',{wordKey:row.key}));
    });
    for(const [key,star]of scaleStars)if(!next.has(key)){star.remove();scaleStars.delete(key);}
  }
  drawScaleStars();
}
let scaleLayoutAt=-Infinity,scaleLayoutDirty=true,scaleMetricsKey='',scaleRail=null;
const SCALE_LAYOUT_MS=250,SCALE_CELL=64;
// Bundled font shards can finish after the sky first becomes visible.
document.fonts?.addEventListener?.('loadingdone',()=>{scaleMetricsKey='';});
const scalePressedStars=new Set();
function bindScaleStarPress(star){
  star.scalePressIds=new Set();
  star.addEventListener('pointerdown',event=>{star.scalePressIds.add(event.pointerId);scalePressedStars.add(star);},{passive:true});
  star.addEventListener('blur',()=>{scaleLayoutDirty=true;});
}
function releaseScaleStarPress(event){
  for(const star of scalePressedStars){
    if(!star.scalePressIds.delete(event.pointerId)||star.scalePressIds.size)continue;
    scalePressedStars.delete(star);scaleLayoutDirty=true;
  }
}
addEventListener('pointerup',releaseScaleStarPress,{capture:true,passive:true});
addEventListener('pointercancel',releaseScaleStarPress,{capture:true,passive:true});
function scaleBox(x,y,w,h){return {left:x-w/2,top:y-h/2,right:x+w/2,bottom:y+h/2,width:w,height:h};}
function scaleCells(box){
  const cells=[];
  for(let x=Math.max(0,Math.floor(box.left/SCALE_CELL));x<=Math.min(Math.floor(vw()/SCALE_CELL),Math.floor(box.right/SCALE_CELL));x++)
    for(let y=Math.max(0,Math.floor(box.top/SCALE_CELL));y<=Math.min(Math.floor(vh()/SCALE_CELL),Math.floor(box.bottom/SCALE_CELL));y++)cells.push(x+','+y);
  return cells;
}
function occupyScaleBox(grid,box){for(const key of scaleCells(box)){let cell=grid.get(key);if(!cell){cell=[];grid.set(key,cell);}cell.push(box);}}
function scaleOverlap(grid,box){
  let area=0;const seen=new Set();
  for(const key of scaleCells(box))for(const other of grid.get(key)||[]){
    if(seen.has(other))continue;seen.add(other);
    const w=Math.min(box.right,other.right)-Math.max(box.left,other.left),h=Math.min(box.bottom,other.bottom)-Math.max(box.top,other.top);
    if(w>0&&h>0)area+=w*h;
  }
  return area;
}
function scaleRailHit(box,rail=scaleRail){
  return !!rail&&box.left<rail.right&&box.right>rail.left&&box.top<rail.bottom&&box.bottom>rail.top;
}
function scaleFitPoint(point,w,h){
  const top=116+h/2,bottom=vh()-100-h/2;
  let x=Math.max(16+w/2,Math.min(vw()-16-w/2,point.x)),y=Math.max(top,Math.min(bottom,point.y));
  const rail=scaleRail;
  if(scaleRailHit(scaleBox(x,y,w,h),rail)){
    if(rail.right+w/2<=vw()-16-w/2)x=rail.right+w/2;
    else{
      const above=rail.top-h/2,below=rail.bottom+h/2;
      const room=[above,below].filter(edge=>edge>=top&&edge<=bottom);
      if(room.length)y=room.reduce((best,edge)=>Math.abs(edge-y)<Math.abs(best-y)?edge:best);
    }
  }
  return {x,y};
}
function readScaleRail(){
  if(!lvlEl.isConnected||!lvlEl.getClientRects().length)return null;
  const style=getComputedStyle(lvlEl);
  if(style.display==='none'||style.visibility==='hidden'||style.pointerEvents==='none'||Number(style.opacity)<=0)return null;
  const r=lvlEl.getBoundingClientRect();
  if(r.width<1||r.height<1||r.right<=0||r.left>=vw()||r.bottom<=0||r.top>=vh())return null;
  // A focused or held star keeps its screen position across viewport changes.
  // Reserve the visible rail's hot column for the full height so the moving
  // vertical rail cannot cross that fixed target when browser chrome resizes.
  return {left:r.left-6,top:-6,right:Math.max(r.right,r.left+56)+6,bottom:vh()+6};
}
function placeScaleStar(point,full,grid,previous){
  let least=null,attempts=0;
  for(const compact of [false,true]){
    const w=compact?44:full.width,h=compact?44:full.height;
    if(w>vw()-32||h>vh()-216)continue;
    const candidates=[];
    // Reuse a clear placement before considering a different projected offset.
    if(previous&&previous.compact===compact)candidates.push({x:point.x+previous.dx,y:point.y+previous.dy});
    candidates.push(point);
    for(const radius of [32,64,96,144,208,288,384,512])for(let i=0;i<12;i++)candidates.push({x:point.x+radius*Math.cos(i*Math.PI/6),y:point.y+radius*Math.sin(i*Math.PI/6)});
    for(const candidate of candidates){
      const p=scaleFitPoint(candidate,w,h),box=scaleBox(p.x,p.y,w,h);attempts++;
      if(scaleRailHit(box))continue;
      const area=scaleOverlap(grid,box);
      const choice={dx:p.x-point.x,dy:p.y-point.y,width:w,height:h,compact,crowded:area>0,box,attempts};
      if(!area)return choice;
      if(compact&&(!least||area<least.area))least={...choice,area};
    }
  }
  // Fully packed: retain a bounded real keyboard-operable button. Native ink
  // keeps pointer priority; this does not promise an empty pointer target.
  if(least)return {...least,attempts};
  const p=scaleFitPoint(point,44,44),box=scaleBox(p.x,p.y,44,44);
  return {dx:p.x-point.x,dy:p.y-point.y,width:44,height:44,compact:true,crowded:true,blocked:scaleRailHit(box),box,attempts};
}
function drawScaleStars(){
  if(scaleBridge&&scaleWorldKey!==WR.w+','+WR.h){paintScaleStars();return;}
  if(!DRIFT_ON||__layer.inert){scaleMetricsKey='';return;}
  const metricsKey=[vw(),vh(),themeIx].join(',');
  if(metricsKey!==scaleMetricsKey){
    scaleMetricsKey=metricsKey;scaleLayoutDirty=true;
    for(const star of scaleStars.values())star.scaleFullSize=null;
  }
  const now=performance.now(),projected=[];
  for(const star of scaleStars.values()){
    const p=w2s(star.scaleX,star.scaleY);
    const visible=!stack.length&&p.x>=30&&p.x<=vw()-30&&p.y>=80&&p.y<=vh()-100;
    if(visible&&!star.scaleProjectedVisible&&!star.scaleFullSize)scaleLayoutDirty=true;
    star.scaleProjectedVisible=visible;
    const fixed=visible&&star.scaleRenderPosition&&(star.scalePressIds?.size||document.activeElement===star)?star.scaleRenderPosition:null;
    projected.push({star,p,visible,fixed});
  }
  const active=projected.filter(row=>row.visible);
  const snapshot=scaleLayoutDirty||now-scaleLayoutAt>=SCALE_LAYOUT_MS;
  if(snapshot){
    // Prepare all new measurements together, then read the whole batch before
    // any placement write. No native-node layout reads occur between snapshots.
    for(const {star}of active)if(!star.scaleFullSize){star.hidden=false;star.classList.remove('is-compact');star.scaleRenderKey='';}
    const grid=new Map();
    scaleRail=readScaleRail();
    for(const n of nodes){
      if(n.gone||n.removed||!n.el.isConnected||Number(n._lop||n.el.style.opacity||1)<=0)continue;
      const r=n.el.getBoundingClientRect();
      if(r.width&&r.height&&r.right>0&&r.left<vw()&&r.bottom>0&&r.top<vh())occupyScaleBox(grid,{left:r.left-6,top:r.top-6,right:r.right+6,bottom:r.bottom+6});
    }
    // Canvas hub doors have native hit disks even when no DOM ink occupies
    // them. Reserve the exact native radius by arithmetic, without layout reads.
    const hubRadius=Math.max(34,46*cam.z*0.7);
    for(const h of HUBS){
      const anchor=HUBPOS[h];if(!anchor)continue;
      const p=w2s(anchor.x,anchor.y);
      if(p.x+hubRadius>0&&p.x-hubRadius<vw()&&p.y+hubRadius>0&&p.y-hubRadius<vh())occupyScaleBox(grid,scaleBox(p.x,p.y,hubRadius*2,hubRadius*2));
    }
    for(const r of hostRects)occupyScaleBox(grid,{left:r.x,top:r.y,right:r.x+r.w,bottom:r.y+r.h});
    for(const {star}of active)if(!star.scaleFullSize){
      const width=star.offsetWidth,height=star.offsetHeight;
      if(width>0&&height>0)star.scaleFullSize={width,height};
    }
    for(const {star,p,fixed}of active){
      if(!star.scaleFullSize){star.scalePlan=null;continue;}
      if(fixed&&star.scalePlan){occupyScaleBox(grid,scaleBox(fixed.x,fixed.y,star.scalePlan.width,star.scalePlan.height));continue;}
      star.scalePlan=placeScaleStar(p,star.scaleFullSize,grid,star.scalePlan);
      occupyScaleBox(grid,star.scalePlan.box);
    }
    scaleLayoutAt=now;scaleLayoutDirty=false;
  }
  for(const {star,p,visible,fixed}of projected){
    if(!visible){if(star.scaleRenderKey!=='hidden'){star.hidden=true;star.scaleRenderKey='hidden';}continue;}
    if(!star.scalePlan||!star.scaleFullSize){star.hidden=true;continue;}
    const plan=star.scalePlan,placed=fixed||scaleFitPoint({x:p.x+plan.dx,y:p.y+plan.dy},plan.width,plan.height);
    // The compact caption is visual only; the full accessible name remains on
    // the same focusable button. Its whole box stays inside the viewport.
    const cw=Math.min(210,vw()-32),ch=Math.min(120,Math.max(44,star.scaleFullSize.height));
    const captionX=Math.max(16,Math.min(vw()-16-cw,placed.x-cw/2));
    const captionY=placed.y+22+ch<=vh()-16?placed.y+22:Math.max(16,placed.y-22-ch);
    const renderKey=[placed.x,placed.y,plan.compact,plan.crowded,captionX,captionY,cw,ch].join(',');
    if(star.scaleRenderKey===renderKey)continue;
    star.scaleRenderKey=renderKey;star.scaleRenderPosition=placed;star.hidden=false;
    star.classList.toggle('is-compact',plan.compact);
    star.dataset.scalePlacement=plan.blocked||scaleRailHit(scaleBox(placed.x,placed.y,plan.width,plan.height))?'blocked':plan.crowded?'crowded':plan.compact?'compact':'clear';
    star.style.transform='translate('+placed.x+'px,'+placed.y+'px) translate(-50%,-50%)';
    star.style.setProperty('--scale-caption-left',(captionX-(placed.x-22))+'px');
    star.style.setProperty('--scale-caption-top',(captionY-(placed.y-22))+'px');
    star.style.setProperty('--scale-caption-width',cw+'px');
    star.style.setProperty('--scale-caption-height',ch+'px');
  }
}

// Observe terminal events even when a newly opened control stops bubbling.
// No pointer capture, preventDefault or propagation changes are involved.
addEventListener('pointerup',drainScalePointer,{capture:true,passive:true});
addEventListener('pointercancel',drainScalePointer,{capture:true,passive:true});
addEventListener('touchend',scaleTouchesLifted,{capture:true,passive:true});
addEventListener('touchcancel',scaleTouchesLifted,{capture:true,passive:true});
addEventListener('pointermove',scaleMouseReleased,{capture:true,passive:true});
addEventListener('pointerdown',scaleMouseReleased,{capture:true,passive:true});
addEventListener('blur',interruptScaleHand);
document.addEventListener('visibilitychange',interruptScaleHand);
__layer.addEventListener('click',event=>{
  if(event.detail>0&&scaleConsumedAt&&performance.now()-scaleConsumedAt<600){event.preventDefault();event.stopImmediatePropagation();scaleConsumedAt=0;}
},{capture:true});
`;

// 4 · the public seam the corridor drives
js += `
window.__DRIFT__ = {
  loadBundledFont,
  setRecordBridge,
  refreshRecord,
  setPracticePriorities,
  setScaleBridge, canNavigate, capturePlace, restorePlace, focusArticle,
  show() {
    if(recordBridge)void refreshRecord();
    DRIFT_ON = true;
    __layer.inert = false;
    document.getElementById('drift-layer').classList.add('active');
    sizeCanvases();
    if (!rafOn) { rafOn = true; requestAnimationFrame(frame); }
  },
  hide() {
    clearScalePointers();
    DRIFT_ON = false;
    __layer.inert = true;
    document.getElementById('drift-layer').classList.remove('active');
  },
  // the corridor drives the shared nihonga world from its chrome seal; the
  // drift keeps its own five-theme palette in step (0..4, north-star order).
  // Two night worlds share one drift palette (yoru and kaku are both 夜), so a
  // changed ground re-applies it too; by day the ground is the donor's own
  setTheme(ix) {
    if (typeof ix !== 'number' || ix < 0 || ix >= THEMES.length) return;
    if (ix !== themeIx || groundFor(THEMES[ix]) !== THEMES[ix].ground) applyTheme(ix);
  },
};
})();
`;

renameId('tray', 'drift-tray');
const cssOut = (css + `
/* The article and kept words are real targets in the retained sky. */
/* Inside sky's stacking context, all native ink keeps its hit plane. */
#drift-layer .scale-stars { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
#drift-layer .word, #drift-layer .glyph, #drift-layer .part { z-index: 1; }
#drift-layer .scale-star { position: absolute; left: 0; top: 0; max-width: 210px; min-width: 44px; min-height: 44px; padding: 8px 14px; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: var(--type-label); line-height: 1.5; text-align: center; cursor: pointer; pointer-events: auto; }
#drift-layer .scale-star[hidden] { display: none; }
#drift-layer .scale-star-number { white-space: nowrap; }
#drift-layer .scale-star-caption { display: block; overflow-wrap: anywhere; }
#drift-layer .scale-star-caption.is-words { word-break: keep-all; overflow-wrap: break-word; line-break: strict; }
#drift-layer .scale-star.is-compact { width: 44px; height: 44px; min-height: 44px; max-width: 44px; padding: 0; display: grid; place-items: center; }
#drift-layer .scale-star.is-compact .scale-star-caption { position: absolute; box-sizing: border-box; left: var(--scale-caption-left); top: var(--scale-caption-top); width: var(--scale-caption-width); max-height: var(--scale-caption-height); overflow: auto; padding: 8px; border: 1px solid var(--line); background: var(--ground); visibility: hidden; pointer-events: none; }
#drift-layer .scale-star.is-compact:is(:hover,:focus-visible) .scale-star-caption { visibility: visible; }
#drift-layer .scale-star::before { content: '✦'; display: block; font-size: var(--type-seal); line-height: 1; }
/* Hfix-2b · X-12 — a kept word is a LIT STAR in the sky's own ink. It was \`・\` in --verm, a
   vermilion the sky owns nowhere else: a small red dot reads as an error mark, not as his word
   kept. The mark is now an open star against the article's filled one, drawn in the world's ink
   and lit by that world's own halo, so it carries light in all five themes including 夜. */
#drift-layer .scale-star-kept { color: var(--ink); }
#drift-layer .scale-star-kept::before { content: '✧'; font-size: var(--type-title);
  text-shadow: 0 0 7px var(--halo), 0 0 2px var(--halo); }
#drift-layer .scale-star-why { display: block; margin-top: 2px; font-size: var(--type-caption);
  line-height: 1.35; color: var(--faint); }
#drift-layer .scale-star.is-compact .scale-star-why { margin-top: 4px; }
#drift-layer .scale-star:focus-visible { outline: 1px solid currentColor; outline-offset: 2px; border-radius: 4px; }
/* Hfix-2b r2 · H2-1 — a revealed gloss is part of the word, so the glass-edge fade counts it. On one
   nowrap line a whole gloss (KH1-3 restored them) ran to ~700px, wider than a phone's glass, so a
   glossed word could never stand wholly inside it. The gloss now wraps, no wider than the old
   32-character line was, and keeps every word of its text. */
#drift-layer .word .gloss { white-space: normal; width: max-content; max-width: 16em; }
/* The scale thread shares the world's bar ink and keeps every ancestor in reach. */
`).replace(/#tray\b/g, '#drift-tray');

// The hosted sky emits shared type steps only. A new literal requires an explicit role mapping.
if (/\bfont-size\s*:\s*[\d.]+(?:px|rem|em)\b/.test(cssOut))
  throw new Error('literal font-size in extracted Drift CSS; map it to the shared F type ladder');

// splice the markup into the mount snippet; guard the one sequence that can
// end an inline <script> early when the standalone build embeds this file
js = js.replace('__MARKUP_JSON__', JSON.stringify(markup));
// Audit both extracted CSS and JS-created transitions. A new donor property
// must fail the generator even when it was not one of the exact patch anchors.
const transitionParts = (value) => value.split(/,(?![^()]*\))/).map((part) => part.trim());
const checkTransitions = (value, label) => {
  for (const part of transitionParts(value)) {
    const property = part.split(/\s+/)[0];
    if (!['transform', 'opacity', 'none'].includes(property))
      throw new Error(`non-compositor transition in ${label}: ${part}`);
  }
};
for (const match of cssOut.matchAll(/\btransition(?:-property)?\s*:\s*([^;}]+)/g))
  checkTransitions(match[1], 'extracted CSS');
for (const match of js.matchAll(/\.style\.transition\s*=\s*([^;]+);/g)) {
  const literals = [...match[1].matchAll(/(["'])(.*?)\1/g)].map((literal) => literal[2]);
  if (!literals.length) throw new Error('JS transition has no auditable property');
  checkTransitions(literals.join(''), 'extracted JS');
}
if (js.includes('</script')) {
  throw new Error('emitted js contains "</script" — standalone embedding would truncate');
}

/* --------------------------------------------------------------- glosses
 * Hfix-2b r2 · KH1-3. The legacy extractor cut every WBIG gloss at exactly 32 characters. fugu's
 * repair (tools/repair-drift-glosses.mjs) restored 466 of them, but it only touched a row its
 * detector called clipped, and that detector defaults to WHOLE when it has no evidence: a tail
 * like "pleasantl" or "conscio" is a prefix of no word the corpus spells out, and a tail of "a"
 * or "i" ("look a", "rich i") is accepted as a word. Sixteen cut glosses were served (Grok, 0610).
 * At the cap the cut could have landed anywhere, so a 32-character row is taken as cut unless it
 * proves otherwise, and the 466's own rule settles it:
 *   1. the dictionary's gloss (data/share_alike/words.json) when that is whole — not itself at
 *      the cap and not structurally cut. Complete beats long.
 *   2. else the row stands only if it ends on a known whole word of three letters or more;
 *   3. else it is cut honestly at a sense boundary ("; ", then ", "), else at a word boundary,
 *      and says so with "…".
 * It runs on the emitted literal, so the served file cannot carry a cap-cut gloss whatever the
 * donor holds. */
const WBIG_AT = [...js.matchAll(/const WBIG=(\[.*\]);/g)];
if (WBIG_AT.length !== 1) throw new Error(`expected exactly one WBIG literal, found ${WBIG_AT.length}`);
const glossPass = { atCap: 0, dictionary: 0, kept: 0, cut: 0 };
{
  const rows = JSON.parse(WBIG_AT[0][1]);
  const doc = JSON.parse(readFileSync(resolve(CORRIDOR, 'data/share_alike/words.json'), 'utf8'));
  const dict = doc.words || doc;
  const vocabulary = buildVocabulary(rows.map((row) => (Array.isArray(row) ? row[2] : '')),
    Object.values(dict).map((rec) => rec?.g || ''));
  const norm = (s) => String(s ?? '').trim().replace(/\s+/gu, ' ');
  const structural = (s) => /[\s([,;]$/u.test(s)
    || (s.match(/\(/gu) || []).length > (s.match(/\)/gu) || []).length;
  const endsOnWord = (s) => {
    const m = /([A-Za-z][A-Za-z'-]*)[)"'’.!?]*$/u.exec(s);
    return !!m && m[1].length >= 3 && vocabulary.words.has(m[1].toLowerCase());
  };
  const honestCut = (s) => {
    const trim = (v) => v.replace(/[\s,;([-]+$/u, '');
    for (const sep of ['; ', ', ', ' ']) {
      for (let i = s.lastIndexOf(sep); i > 0; i = s.lastIndexOf(sep, i - 1)) {
        const head = trim(s.slice(0, i));
        if (head && !structural(head)) return `${head}…`;
      }
    }
    throw new Error(`no honest cut for the gloss "${s}"`);
  };
  const out = rows.map((row) => {
    if (!Array.isArray(row) || typeof row[2] !== 'string' || row[2].length !== CLIP_CAP) return row;
    glossPass.atCap += 1;
    const whole = norm(dict[row[0]]?.g);
    let next;
    if (whole && whole.length !== CLIP_CAP && !structural(whole) && !looksClipped(whole)) {
      next = whole; glossPass.dictionary += 1;
    } else if (!structural(row[2]) && endsOnWord(row[2])) {
      next = row[2]; glossPass.kept += 1;
    } else {
      next = honestCut(row[2]); glossPass.cut += 1;
    }
    if (next === row[2]) return row;
    const copy = row.slice(); copy[2] = next; return copy;
  });
  js = js.slice(0, WBIG_AT[0].index) + `const WBIG=${JSON.stringify(out)};`
    + js.slice(WBIG_AT[0].index + WBIG_AT[0][0].length);
}

const header = `/* GENERATED by tools/build-drift-layer.mjs from prototypes/drift/drift-artifact.html
 * (${patchCount} exact-string gate patches applied — see the extractor for the list).
 * Do not edit by hand; edit the drift source or the extractor. */
`;

const outputs = [
  ['drift-layer.css', cssOut],
  ['drift-layer.js', header + js],
];
if (process.argv.includes('--check')) {
  const stale = outputs.filter(([name, text]) => readFileSync(resolve(CORRIDOR, name), 'utf8') !== text);
  if (stale.length) {
    console.error(`stale generated drift layer: ${stale.map(([name]) => name).join(', ')} — run node tools/build-drift-layer.mjs`);
    process.exit(1);
  }
  console.log(`drift-layer: committed output matches the extractor (${patchCount} patches)`);
  console.log(`drift-layer: WBIG glosses at the ${CLIP_CAP}-character cap ${glossPass.atCap}: dictionary ${glossPass.dictionary}, kept ${glossPass.kept}, cut honestly ${glossPass.cut}`);
  process.exit(0);
}
console.log(`drift-layer: WBIG glosses at the ${CLIP_CAP}-character cap ${glossPass.atCap}: dictionary ${glossPass.dictionary}, kept ${glossPass.kept}, cut honestly ${glossPass.cut}`);
for (const [name, text] of outputs) writeFileSync(resolve(CORRIDOR, name), text);
console.log(
  `drift-layer: css ${(css.length / 1024).toFixed(0)} KB · markup ${(markup.length / 1024).toFixed(1)} KB · js ${(js.length / 1024).toFixed(0)} KB · ${patchCount} patches, all asserted unique`,
);
