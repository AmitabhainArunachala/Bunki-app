/** Copy verify-drift-hunt.mjs and instrument ONLY the flick-judgment test,
 *  using DOM-only measurements (no page internals), so the copy behaves
 *  identically otherwise. */
import fs from 'node:fs';
const SRC='/home/user/Bunki-app/.claude/worktrees/agent-aa8fa572d39c96ca3/prototypes/corridor/tools/verify-drift-hunt.mjs';
const DST='/home/user/Bunki-app/.claude/worktrees/agent-aa8fa572d39c96ca3/prototypes/corridor/tools/hunt-instrumented.mjs';
let s=fs.readFileSync(SRC,'utf8');

const from = `await T('touchStart', [[w.x, w.y]]);
await T('touchMove', [[w.x + 65, w.y]]);
await T('touchMove', [[w.x + 130, w.y]]);
await T('touchEnd', []);
await page.waitForTimeout(1200);
const graded = await page.evaluate(world);`;

const to = `const rectOf = (label) => \`(() => {
  const el = [...document.querySelectorAll('#drift-layer .word')].find((n) => (n.querySelector('.base')?.textContent ?? '') === \${JSON.stringify(label)});
  if (!el) return { exists:false };
  const r = el.getBoundingClientRect();
  return { exists:true, cx:r.left+r.width/2, cy:r.top+r.height/2, w:r.width, h:r.height,
           op:parseFloat(getComputedStyle(el).opacity), pe:getComputedStyle(el).pointerEvents };
})()\`;
const __pre = await page.evaluate(rectOf(w.w));
const __trayPre = (await page.evaluate(world)).tray;
const __t0 = Date.now();
await T('touchStart', [[w.x, w.y]]);
const __tDown = Date.now();
const __atPress = await page.evaluate(rectOf(w.w));
const __topAt = await page.evaluate(\`(() => {
  const e = document.elementFromPoint(\${w.x}, \${w.y});
  if (!e) return 'null';
  const wd = e.closest && e.closest('#drift-layer .word');
  return wd ? 'word:' + (wd.querySelector('.base')?.textContent ?? '?') : (e.id ? '#'+e.id : e.tagName+'.'+String(e.className||'').slice(0,24));
})()\`);
await T('touchMove', [[w.x + 65, w.y]]);
await T('touchMove', [[w.x + 130, w.y]]);
const __tMoves = Date.now();
await T('touchEnd', []);
const __tUp = Date.now();
await page.waitForTimeout(1200);
const graded = await page.evaluate(world);
{
  const gap = __atPress.exists ? Math.hypot(__atPress.cx - w.x, __atPress.cy - w.y) : null;
  const inBox = __atPress.exists ? (Math.abs(__atPress.cx - w.x) <= __atPress.w/2 && Math.abs(__atPress.cy - w.y) <= __atPress.h/2) : null;
  console.log('FLICK-DIAG ' + JSON.stringify({
    word: w.w, aim: { x: +w.x.toFixed(1), y: +w.y.toFixed(1) },
    preRect: __pre.exists ? { cx:+__pre.cx.toFixed(1), cy:+__pre.cy.toFixed(1), w:+__pre.w.toFixed(0), h:+__pre.h.toFixed(0), op:+__pre.op.toFixed(3), pe:__pre.pe } : null,
    atPressRect: __atPress.exists ? { cx:+__atPress.cx.toFixed(1), cy:+__atPress.cy.toFixed(1), op:+__atPress.op.toFixed(3), pe:__atPress.pe } : null,
    aimGapPx: gap==null?null:+gap.toFixed(2),
    pressInsideWordBox: inBox,
    topElementAtAim: __topAt,
    trayPre: __trayPre, trayPost: graded.tray,
    heldMsWallClock: __tUp - __tDown, downDispatchMs: __tDown - __t0, movesMs: __tMoves - __tDown,
    FLICK_THRESHOLD_330: (__tUp - __tDown) < 330 ? 'under' : 'OVER',
    speedPxPerMs: +(130/Math.max(1,__tUp-__tDown)).toFixed(3), speedGate045: (130/Math.max(1,__tUp-__tDown))>0.45 ? 'pass':'fail',
    GRADED: graded.tray !== __trayPre && graded.tray !== ''
  }));
}`;

if (s.indexOf(from) < 0) { console.log('ANCHOR NOT FOUND'); process.exit(1); }
if (s.indexOf(from) !== s.lastIndexOf(from)) { console.log('ANCHOR NOT UNIQUE'); process.exit(1); }
s = s.replace(from, to);
fs.writeFileSync(DST, s);
console.log('wrote ' + DST);
