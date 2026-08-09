import fs from 'node:fs';
const A = '/home/user/Bunki-app/.claude/worktrees/agent-aa8fa572d39c96ca3/prototypes/drift/drift-artifact.html';
const OUT = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/mut';
fs.mkdirSync(OUT, { recursive: true });
const src = fs.readFileSync(A, 'utf8');
const muts = [
  ['M1-lowfloor',
    'const floorOp=Math.max(GHOST_ABS,minEff===Infinity?GHOST_ABS:minEff);',
    'const floorOp=0.03;'],
  ['M2-penone',
    '    n.el.style.opacity=outOp.toFixed(3);',
    '    if(n.kind==="word"&&!n.gone)n.el.style.pointerEvents=(n.collide<0.5?"none":"");\n    n.el.style.opacity=outOp.toFixed(3);'],
  ['M3-faintghost',
    'const GHOST_ABS=0.30, GHOST_REL=0.45, CONTEND_MAX=0.53;',
    'const GHOST_ABS=0.30, GHOST_REL=0.06, CONTEND_MAX=0.53;'],
  ['M4-norot',
    '      cam.rot=clamp(cam.rot+da,-Math.PI,Math.PI);',
    '      cam.rot=0;'],
  ['M5-noarb',
    '\nfunction resolveCollisions(){\n  refreshChromeRects();',
    '\nfunction resolveCollisions(){\n  if(1){for(const n of nodes) if(n.kind==="word") n.collideTarget=1; return;}\n  refreshChromeRects();'],
  ['M6-hintfaint',
    'text-align:center;font-size:12px;letter-spacing:.14em;color:var(--ink);\n    background:var(--plaque);border:1px solid var(--line);border-radius:999px;',
    'text-align:center;font-size:12px;letter-spacing:.14em;color:var(--faint);\n    background:none;border:none;'],
];
for (const [name, from, to] of muts) {
  const i = src.indexOf(from);
  if (i < 0) { console.log(`!! ${name}: ANCHOR NOT FOUND`); continue; }
  if (src.indexOf(from, i + 1) >= 0) { console.log(`!! ${name}: anchor not unique`); continue; }
  fs.writeFileSync(`${OUT}/${name}.html`, src.slice(0, i) + to + src.slice(i + from.length));
  console.log(`ok ${name}`);
}
