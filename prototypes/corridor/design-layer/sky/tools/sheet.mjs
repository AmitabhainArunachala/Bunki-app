import { chromium } from '/Users/dhyana/worktrees/Bunki-app/integrate-candidate_20261110/node_modules/playwright/index.mjs';
import fs from 'node:fs';
// contact sheet: node sheet.mjs <dir> <suffix e.g. -1-rest> <out.jpg> [cols] [cellW]
const [dir, suffix, out, cols = '4', cellW = '860'] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith(suffix + '.jpg')).sort();
const order = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'keyblock', 'rokusho', 'yoru', 'nami', 'hakuu', 'kaku'];
files.sort((a, b) => order.findIndex((o) => a.includes(o)) - order.findIndex((o) => b.includes(o)));
const html = '<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(' + cols + ',' + cellW + 'px);gap:6px;padding:6px;font:16px sans-serif;color:#fff">' + files.map((f) => '<div style="position:relative"><img src="file://' + dir + '/' + f + '" style="width:100%;display:block"><span style="position:absolute;left:8px;top:6px;background:#000a;padding:2px 6px">' + f.replace(suffix + '.jpg', '').replace('look-', '') + '</span></div>').join('') + '</body>';
const b = await chromium.launch({ args: ['--mute-audio', '--allow-file-access-from-files'] }); const p = await b.newPage({ viewport: { width: Number(cols) * (Number(cellW) + 6) + 6, height: 800 } });
fs.writeFileSync(out + '.html', html); await p.goto('file://' + out + '.html'); await p.waitForTimeout(800);
await p.screenshot({ path: out, type: 'jpeg', quality: 85, fullPage: true }); await b.close(); console.log('sheet', out, files.length);
