/**
 * Scratch generator (NOT part of the app): render the real KanjiVG strokes of
 * one kanji under five distinct nihonga ink-on-washi treatments plus three
 * candidate 銀河 hero symbols, into a single phone-width HTML page the operator
 * can look at and pick from. Nothing here ships until a direction is chosen.
 *
 * Usage: node gen-nihonga-mockups.mjs  → writes to the scratchpad dir.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const OUT =
  '/tmp/claude-0/-home-user-Bunki-app/f805dde4-8a90-5781-81bf-65d3db049319/scratchpad/nihonga/mockups.html';

const strokes = JSON.parse(readFileSync(resolve(CORRIDOR, 'data', 'share_alike', 'strokes.json'), 'utf8')).strokes;
const KANJI = '語';
const paths = strokes[KANJI];

/** One <path> per stroke, given a class. */
const inkPaths = (cls) => paths.map((d) => `<path class="${cls}" d="${d}"/>`).join('');

/**
 * A treatment = a paper panel + a stroke SVG. Each treatment defines its own
 * SVG filters (paper fiber, ink bleed, dry-brush displacement) and its own
 * palette, so the five read as genuinely different moods, not filter tweaks.
 */
const treatment = ({ id, name, jp, note }) => `
  <figure class="card t-${id}">
    <div class="tile">
      <svg class="strokes" viewBox="0 0 109 109" aria-hidden="true">
        <defs>${FILTERS[id]}</defs>
        <rect class="paper" x="0" y="0" width="109" height="109"/>
        <g class="bleed" filter="url(#bleed-${id})">${inkPaths('bleed-p')}</g>
        <g class="ink" filter="url(#ink-${id})">${inkPaths('ink-p')}</g>
      </svg>
    </div>
    <figcaption><b>${jp}</b> · ${name}<span>${note}</span></figcaption>
  </figure>`;

const FILTERS = {
  sumi: `
    <filter id="paper-sumi"><feTurbulence type="fractalNoise" baseFrequency="0.014 0.02" numOctaves="3" seed="7"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0.05 0"/></filter>
    <filter id="bleed-sumi" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.9"/></filter>
    <filter id="ink-sumi"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter>`,
  kasure: `
    <filter id="paper-kasure"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.03" numOctaves="3" seed="11"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.36  0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 0.07 0"/></filter>
    <filter id="bleed-kasure" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.7"/></filter>
    <filter id="ink-kasure"><feTurbulence type="turbulence" baseFrequency="0.16 0.42" numOctaves="4" seed="8" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="4.6" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feComposite in="d" in2="n" operator="arithmetic" k1="0" k2="1.05" k3="-0.28" k4="0"/></filter>`,
  gold: `
    <filter id="paper-gold"><feTurbulence type="fractalNoise" baseFrequency="0.01 0.014" numOctaves="4" seed="3"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.7  0 0 0 0 0.62  0 0 0 0 0.36  0 0 0 0.08 0"/></filter>
    <filter id="bleed-gold" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.4"/></filter>
    <filter id="ink-gold"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="5" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4"/></filter>`,
  tanboku: `
    <filter id="paper-tanboku"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.016" numOctaves="2" seed="2"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.52  0 0 0 0.035 0"/></filter>
    <filter id="bleed-tanboku" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur stdDeviation="2.8"/></filter>
    <filter id="ink-tanboku"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="9" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.2"/></filter>`,
  shuin: `
    <filter id="paper-shuin"><feTurbulence type="fractalNoise" baseFrequency="0.016 0.022" numOctaves="3" seed="6"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.24  0 0 0 0.045 0"/></filter>
    <filter id="bleed-shuin" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="1.1"/></filter>
    <filter id="ink-shuin"><feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed="1" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter>`,
};

const TREATMENTS = [
  { id: 'sumi', jp: '墨', name: 'sumi bleed', note: 'wet black ink soaking into aged washi — deep, calm, a little bleed at every edge.' },
  { id: 'kasure', jp: '枯筆', name: 'dry brush (kasure)', note: 'a fast brush that breaks up and skips — the ink runs dry, full of movement and grain.' },
  { id: 'gold', jp: '金泥', name: 'mineral gold on indigo', note: 'luminous gold pigment on a night-indigo ground — the galaxy world, ties to 銀河.' },
  { id: 'tanboku', jp: '淡墨', name: 'pale ink wash', note: 'soft grey ink, generous space, whisper of paper — the most restrained and quiet.' },
  { id: 'shuin', jp: '朱印', name: 'framed, with seal', note: 'crisp ink on cream washi, deckle-edged and mounted, a small red seal in the corner.' },
];

/* three candidate 銀河 hero symbols (galaxy / gateway marks) */
const SYMBOLS = [
  { id: 'spiral', jp: 'spiral galaxy', svg: `<svg viewBox="0 0 48 48"><path d="M24 24 C24 15 33 12 36 18 C40 26 28 34 19 30 C9 25 12 11 24 9 C38 7 43 22 38 33" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="24" cy="24" r="1.9" fill="currentColor"/></svg>` },
  { id: 'enso', jp: 'ensō + star', svg: `<svg viewBox="0 0 48 48"><path d="M32 12 A15 15 0 1 0 36 22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="24" r="1.6" fill="currentColor"/></svg>` },
  { id: 'torii', jp: 'gate / 河', svg: `<svg viewBox="0 0 48 48"><path d="M11 16 H37 M13 21 H35 M17 21 V36 M31 21 V36" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="10" r="1.7" fill="currentColor"/></svg>` },
];

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>nihonga stroke directions</title>
<style>
  :root { --serif: "Hiragino Mincho ProN","Yu Mincho",serif; }
  * { box-sizing: border-box; }
  body { margin:0; background:#e9e4d8; color:#26241f; font-family:-apple-system,system-ui,sans-serif; padding:18px 16px 40px; }
  h1 { font-size:17px; font-weight:600; margin:4px 0 2px; }
  .sub { font-size:12.5px; color:#6b655a; margin:0 0 18px; line-height:1.5; }
  .card { margin:0 0 22px; }
  .tile { display:flex; align-items:center; justify-content:center; padding:16px; border-radius:12px; }
  svg.strokes { width:200px; height:200px; display:block; }
  .paper { opacity:0; }
  figcaption { font-size:13px; margin-top:9px; line-height:1.5; }
  figcaption b { font-family:var(--serif); font-size:16px; }
  figcaption span { display:block; color:#6b655a; font-size:12px; margin-top:2px; }

  /* ---- shared ink defaults, overridden per treatment ---- */
  .bleed-p { fill:none; stroke:#1a1712; stroke-width:9.5; stroke-linecap:round; stroke-linejoin:round; opacity:.16; }
  .ink-p   { fill:none; stroke:#161310; stroke-width:5.4; stroke-linecap:round; stroke-linejoin:round; }

  /* 墨 sumi bleed */
  .t-sumi .tile { background:#efe6d2; box-shadow: inset 0 0 40px rgba(90,72,40,.18), 0 6px 18px rgba(40,30,10,.14); }
  .t-sumi .paper { opacity:1; filter:url(#paper-sumi); mix-blend-mode:multiply; }
  .t-sumi .ink-p { stroke:#12100c; stroke-width:5.8; }
  .t-sumi .bleed-p { stroke:#241d12; opacity:.22; stroke-width:11; }

  /* 枯筆 dry brush */
  .t-kasure .tile { background:#e7ddc6; box-shadow: inset 0 0 30px rgba(90,72,40,.16), 0 5px 14px rgba(40,30,10,.12); }
  .t-kasure .paper { opacity:1; filter:url(#paper-kasure); mix-blend-mode:multiply; }
  .t-kasure .ink-p { stroke:#1b1710; stroke-width:6.2; }
  .t-kasure .bleed-p { opacity:.08; }

  /* 金泥 gold on indigo */
  .t-gold .tile { background:radial-gradient(120% 120% at 40% 25%, #22314e 0%, #131b2e 60%, #0c1120 100%); box-shadow: inset 0 0 46px rgba(0,0,0,.5), 0 8px 22px rgba(6,10,22,.5); }
  .t-gold .paper { opacity:.5; filter:url(#paper-gold); mix-blend-mode:screen; }
  .t-gold .ink-p { stroke:#dcb56e; stroke-width:5.2; }
  .t-gold .bleed-p { stroke:#e7c887; opacity:.3; stroke-width:10; }
  .t-gold figcaption, .t-gold figcaption span { }

  /* 淡墨 pale wash */
  .t-tanboku .tile { background:#f2eee4; box-shadow: inset 0 0 26px rgba(90,80,55,.1), 0 4px 12px rgba(40,30,10,.08); }
  .t-tanboku .paper { opacity:1; filter:url(#paper-tanboku); mix-blend-mode:multiply; }
  .t-tanboku .ink-p { stroke:#5c5850; stroke-width:5; }
  .t-tanboku .bleed-p { stroke:#6f6a60; opacity:.2; stroke-width:11; }

  /* 朱印 framed w/ seal */
  .t-shuin .tile { position:relative; background:#f4ecda; border:1px solid #d8cbb0; box-shadow: inset 0 0 0 6px #f4ecda, inset 0 0 0 7px #cdbf9f, 0 7px 18px rgba(40,30,10,.14); }
  .t-shuin .paper { opacity:1; filter:url(#paper-shuin); mix-blend-mode:multiply; }
  .t-shuin .ink-p { stroke:#181410; stroke-width:5.4; }
  .t-shuin .bleed-p { opacity:.12; }
  .t-shuin .tile::after { content:"語"; position:absolute; right:14px; bottom:12px; width:26px; height:26px; line-height:26px; text-align:center; font-family:var(--serif); font-size:15px; color:#fbf6ea; background:#a6362c; border-radius:5px; box-shadow:0 1px 2px rgba(0,0,0,.25); }

  .symbols { display:flex; gap:14px; margin-top:6px; }
  .sym { flex:1; text-align:center; }
  .sym .chip { display:flex; align-items:center; justify-content:center; height:96px; border-radius:14px; background:radial-gradient(120% 120% at 40% 25%, #1c2740 0%, #10162a 70%); color:#e7ddc6; box-shadow: inset 0 0 30px rgba(0,0,0,.4); }
  .sym svg { width:52px; height:52px; }
  .sym p { font-size:11.5px; color:#6b655a; margin:7px 0 0; }
  hr { border:none; border-top:1px solid #cfc7b5; margin:26px 0 20px; }
</style></head><body>
  <h1>Stroke order — nihonga directions (語)</h1>
  <p class="sub">Same real strokes, five ink-on-washi moods. Texture and depth come from actual paper-fiber and ink-bleed, not a flat digital line. Pick one (or mix — e.g. “墨 on 朱印 paper”).</p>
  ${TREATMENTS.map(treatment).join('')}
  <hr>
  <h1>銀河 — hero symbol candidates</h1>
  <p class="sub">The one mark that sits on the galaxy at rest; tap it to open the bar + bubbles.</p>
  <div class="symbols">
    ${SYMBOLS.map((s) => `<div class="sym"><div class="chip">${s.svg}</div><p>${s.jp}</p></div>`).join('')}
  </div>
</body></html>`;

writeFileSync(OUT, html);
console.log('wrote', OUT, `(${(html.length / 1024).toFixed(1)} KB, ${paths.length} strokes)`);
