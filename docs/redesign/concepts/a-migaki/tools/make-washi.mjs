// Generates css/washi-fibre.svg: a 480px tile of long kōzo strands (deterministic), drawn once, never animated.
import { writeFileSync } from 'node:fs';
let s = 11; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const N = 70, T = 480; let paths = '';
for (let i = 0; i < N; i++) {
  const x = r() * T, y = r() * T, a = r() * Math.PI * 2, L = 30 + r() * 120;
  const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
  const cx = (x + x2) / 2 + (r() - .5) * 40, cy = (y + y2) / 2 + (r() - .5) * 40;
  const w = (.35 + r() * .55).toFixed(2), o = (.18 + r() * .3).toFixed(2);
  const d = `M${x.toFixed(1)} ${y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  // draw wrapped copies so the tile repeats seamlessly
  for (const [dx, dy] of [[0, 0], [-T, 0], [T, 0], [0, -T], [0, T]]) paths += `<path transform="translate(${dx} ${dy})" d="${d}" stroke-width="${w}" opacity="${o}"/>`;
}
// small inclusions (bark flecks)
for (let i = 0; i < 26; i++) paths += `<circle cx="${(r() * T).toFixed(1)}" cy="${(r() * T).toFixed(1)}" r="${(.4 + r() * .9).toFixed(2)}" opacity="${(.15 + r() * .25).toFixed(2)}"/>`;
writeFileSync(new URL('../css/washi-fibre.svg', import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}"><g fill="none" stroke="#6b5a3e" stroke-linecap="round">${paths}</g><g fill="#6b5a3e">${''}</g></svg>`);
console.log('ok');
