/**
 * Scratch generator (NOT part of the app): FIVE MORE nihonga stroke-order
 * directions, distinct from the first set (墨/枯筆/金泥/淡墨/朱印), rendered at
 * the full-screen writing-square size on the real strokes of 遇. Two are built
 * for the dark 夜 world the operator was viewing. Nothing ships until picked.
 *
 * Usage: node gen-nihonga-mockups-2.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const OUT =
  '/tmp/claude-0/-home-user-Bunki-app/f805dde4-8a90-5781-81bf-65d3db049319/scratchpad/nihonga/mockups2.html';

const strokes = JSON.parse(readFileSync(resolve(CORRIDOR, 'data', 'share_alike', 'strokes.json'), 'utf8')).strokes;
const KANJI = '遇';
const paths = strokes[KANJI];
const inkPaths = (cls) => paths.map((d) => `<path class="${cls}" d="${d}"/>`).join('');

const FILTERS = {
  kumo: `
    <filter id="paper-kumo"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.05" numOctaves="4" seed="12"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.34  0 0 0 0 0.2  0 0 0 0.06 0"/></filter>
    <filter id="bleed-kumo" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.7"/></filter>
    <filter id="ink-kumo"><feGaussianBlur stdDeviation="0.5" result="s"/><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n"/>
      <feDisplacementMap in="s" in2="n" scale="1.7"/></filter>`,
  kinbyobu: `
    <filter id="paper-kinbyobu"><feTurbulence type="turbulence" baseFrequency="0.04 0.045" numOctaves="5" seed="9"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.4  0 0 0 0 0.12  0 0 0 0.06 0"/></filter>
    <filter id="bleed-kinbyobu" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.8"/></filter>
    <filter id="ink-kinbyobu"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="2" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.5"/></filter>`,
  aizuri: `
    <filter id="paper-aizuri"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.016" numOctaves="3" seed="6"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.18  0 0 0 0 0.3  0 0 0 0 0.45  0 0 0 0.05 0"/></filter>
    <filter id="bleed-aizuri" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="2"/></filter>
    <filter id="ink-aizuri"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4"/></filter>`,
  celadon: `
    <filter id="paper-celadon"><feTurbulence type="fractalNoise" baseFrequency="0.009 0.012" numOctaves="2" seed="3"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.36  0 0 0 0 0.3  0 0 0 0.04 0"/></filter>
    <filter id="bleed-celadon" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.6"/></filter>
    <filter id="ink-celadon"><feGaussianBlur stdDeviation="0.6"/></filter>`,
  takuhon: `
    <filter id="paper-takuhon"><feTurbulence type="turbulence" baseFrequency="0.03 0.035" numOctaves="5" seed="15"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0"/></filter>
    <filter id="bleed-takuhon" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="1.2"/></filter>
    <filter id="ink-takuhon"><feTurbulence type="turbulence" baseFrequency="0.2 0.5" numOctaves="4" seed="8" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/></filter>`,
};

const TREATMENTS = [
  { id: 'kumo', jp: '雲肌', name: 'cloud-fiber washi', note: 'thick handmade paper with long visible fibers; soft-edged sumi that sinks in.' },
  { id: 'kinbyobu', jp: '金屏風', name: 'ink on gold screen', note: 'dark ink laid on a gold-leaf ground with fine craquelure — a folding-screen richness.' },
  { id: 'aizuri', jp: '藍摺', name: 'indigo print (aizuri)', note: 'one-color indigo, ink and paper both blue — the calm of an aizuri-e ukiyo print.' },
  { id: 'celadon', jp: '雨過天青', name: 'celadon glaze', note: 'porcelain celadon ground, ink a shade deeper — quiet, glazed, almost wet.' },
  { id: 'takuhon', jp: '拓本', name: 'stone rubbing (for 夜)', note: 'white strokes lifted from dark inked stone — made for the night world.' },
];

const treatment = ({ id, jp, name, note }) => `
  <figure class="card t-${id}">
    <div class="stage">
      <svg class="strokes" viewBox="0 0 109 109" aria-hidden="true">
        <defs>${FILTERS[id]}</defs>
        <rect class="paper" x="0" y="0" width="109" height="109"/>
        <g class="bleed" filter="url(#bleed-${id})">${inkPaths('bleed-p')}</g>
        <g class="ink" filter="url(#ink-${id})">${inkPaths('ink-p')}</g>
      </svg>
    </div>
    <figcaption><b>${jp}</b> · ${name}<span>${note}</span></figcaption>
  </figure>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>nihonga — five more (遇)</title>
<style>
  :root { --serif: "Hiragino Mincho ProN","Yu Mincho",serif; }
  * { box-sizing: border-box; }
  body { margin:0; background:#e9e4d8; color:#26241f; font-family:-apple-system,system-ui,sans-serif; padding:18px 16px 40px; }
  h1 { font-size:17px; font-weight:600; margin:4px 0 2px; }
  .sub { font-size:12.5px; color:#6b655a; margin:0 0 18px; line-height:1.5; }
  .card { margin:0 0 24px; }
  .stage { padding:18px; border-radius:12px; box-shadow: 0 6px 18px rgba(40,30,10,.14); }
  svg.strokes { width:100%; height:auto; aspect-ratio:1; display:block; }
  .paper { opacity:0; }
  figcaption { font-size:13px; margin-top:10px; line-height:1.5; }
  figcaption b { font-family:var(--serif); font-size:16px; }
  figcaption span { display:block; color:#6b655a; font-size:12px; margin-top:2px; }

  .bleed-p { fill:none; stroke:#161310; stroke-width:9.5; stroke-linecap:round; stroke-linejoin:round; opacity:.16; }
  .ink-p   { fill:none; stroke:#161310; stroke-width:5.6; stroke-linecap:round; stroke-linejoin:round; }

  /* 雲肌 */
  .t-kumo .stage { background:#efe4ce; }
  .t-kumo .paper { opacity:1; filter:url(#paper-kumo); mix-blend-mode:multiply; }
  .t-kumo .ink-p { stroke:#20190f; }
  .t-kumo .bleed-p { stroke:#2c2213; opacity:.2; }

  /* 金屏風 */
  .t-kinbyobu .stage { background:radial-gradient(130% 130% at 30% 20%, #e8cc7f 0%, #c8a24e 55%, #a9812f 100%); box-shadow: inset 0 0 40px rgba(120,85,20,.35), 0 6px 18px rgba(60,40,10,.28); }
  .t-kinbyobu .paper { opacity:.7; filter:url(#paper-kinbyobu); mix-blend-mode:multiply; }
  .t-kinbyobu .ink-p { stroke:#14100a; stroke-width:5.4; }
  .t-kinbyobu .bleed-p { stroke:#14100a; opacity:.12; }

  /* 藍摺 */
  .t-aizuri .stage { background:#dbe4ee; box-shadow: inset 0 0 30px rgba(40,60,90,.14), 0 6px 16px rgba(30,45,70,.16); }
  .t-aizuri .paper { opacity:1; filter:url(#paper-aizuri); mix-blend-mode:multiply; }
  .t-aizuri .ink-p { stroke:#26456f; }
  .t-aizuri .bleed-p { stroke:#2e4d6e; opacity:.26; }

  /* 雨過天青 celadon */
  .t-celadon .stage { background:radial-gradient(120% 120% at 35% 25%, #cfe3d3, #aecbb6 70%, #9cbaa6 100%); box-shadow: inset 0 0 34px rgba(40,80,60,.2), 0 6px 16px rgba(30,60,45,.18); }
  .t-celadon .paper { opacity:1; filter:url(#paper-celadon); mix-blend-mode:multiply; }
  .t-celadon .ink-p { stroke:#254c3c; stroke-width:5.4; }
  .t-celadon .bleed-p { stroke:#2f5e49; opacity:.22; }

  /* 拓本 stone rubbing (dark) */
  .t-takuhon .stage { background:#211d1a; box-shadow: inset 0 0 46px rgba(0,0,0,.6), 0 8px 22px rgba(0,0,0,.5); }
  .t-takuhon .paper { opacity:.85; filter:url(#paper-takuhon); mix-blend-mode:screen; }
  .t-takuhon .ink-p { stroke:#efe9dd; stroke-width:5.4; }
  .t-takuhon .bleed-p { stroke:#000; opacity:.4; stroke-width:11; }
</style></head><body>
  <h1>Stroke order — five more directions (遇)</h1>
  <p class="sub">Rendered at the full-screen writing size, on the real 遇 strokes. Distinct from the first five. The last, 拓本, is built for the 夜 (night) world you were in.</p>
  ${TREATMENTS.map(treatment).join('')}
</body></html>`;

writeFileSync(OUT, html);
console.log('wrote', OUT, `(${paths.length} strokes)`);
