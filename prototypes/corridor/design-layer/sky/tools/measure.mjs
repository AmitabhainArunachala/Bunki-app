import { chromium } from '/Users/dhyana/worktrees/Bunki-app/integrate-candidate_20261110/node_modules/playwright/index.mjs';
import fs from 'node:fs';
// mean colour of boxes of a picture: node measure.mjs <image> <fx0,fy0,fx1,fy1> [more boxes]   (fractions of width and height)
const [img, ...boxes] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage();
const data = 'data:image/jpeg;base64,' + fs.readFileSync(img).toString('base64');
const out = await p.evaluate(async ({ data, boxes }) => { const im = new Image(); im.src = data; await im.decode(); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  return boxes.map((bx) => { const [a, b2, c2, d] = bx.split(',').map(Number), X = Math.round(a * c.width), Y = Math.round(b2 * c.height), W = Math.max(1, Math.round((c2 - a) * c.width)), H = Math.max(1, Math.round((d - b2) * c.height)), q = x.getImageData(X, Y, W, H).data; let r = 0, g = 0, bl = 0; const n = q.length / 4; for (let i = 0; i < q.length; i += 4) { r += q[i]; g += q[i + 1]; bl += q[i + 2]; } return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)].join(' '); }); }, { data, boxes });
console.log(img.split('/').slice(-2).join('/'), out.join('  |  ')); await b.close();
