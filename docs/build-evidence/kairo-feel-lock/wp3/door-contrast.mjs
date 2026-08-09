/**
 * The study door's legibility, in all five pigment worlds.
 *
 * The door is `#card .study { color: var(--ink); border: 1px solid var(--pig2) }`
 * on the card's plaque. The label is ink because ink is the only value that
 * clears 4.5:1 in all five worlds — the same footing as the hint pill verify-v11
 * already measures — while the pigment rim carries the "you can go here"
 * signal. 朱 (--accent) is untouched: red stays readings-only. This script
 * prints the pigment alternatives too, so the choice can be re-checked.
 *
 * Read straight out of the drift source's own THEMES table, so it cannot drift
 * away from what the app paints.
 *
 * Usage: node door-contrast.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../../prototypes/drift/drift-artifact.html');
const src = readFileSync(SRC, 'utf8');

const block = src.slice(src.indexOf('const THEMES=['), src.indexOf('const PARTS') + 0);
const themes = [
  ...block.matchAll(
    /\{name:"([^"]+)",ground:"([^"]+)",ink:"([^"]+)"[\s\S]*?pig1:"([^"]+)",pig2:"([^"]+)",accent:"([^"]+)",plaque:"([^"]+)"/g,
  ),
].map((m) => ({ name: m[1], ground: m[2], ink: m[3], pig1: m[4], pig2: m[5], plaque: m[7] }));
if (themes.length !== 5) throw new Error(`expected 5 themes, parsed ${themes.length}`);

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgba = (s) => {
  const n = s.match(/-?[\d.]+/g).map(Number);
  return { rgb: n.slice(0, 3), a: n[3] ?? 1 };
};
const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
const lin = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

console.log('theme    plaque over ground   LABEL ink   AA(4.5)   (rim pig2)   (pig1)');
let worst = Infinity;
for (const t of themes) {
  const bgc = rgba(t.plaque);
  const bg = over(bgc.rgb, bgc.a, hex(t.ground));
  const r = ratio(hex(t.ink), bg);
  worst = Math.min(worst, r);
  console.log(
    `${t.name.padEnd(6)} rgb(${bg.map((c) => Math.round(c)).join(',')})`.padEnd(28) +
      `${r.toFixed(2)}`.padStart(8) +
      `${r >= 4.5 ? '    pass' : '    FAIL'}` +
      `${ratio(hex(t.pig2), bg).toFixed(2)}`.padStart(13) +
      `${ratio(hex(t.pig1), bg).toFixed(2)}`.padStart(11),
  );
}
console.log(`\nworst world for the label: ${worst.toFixed(2)}:1 (AA normal text needs 4.5)`);
