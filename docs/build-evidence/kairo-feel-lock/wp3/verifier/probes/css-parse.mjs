// Parse two CSS files in a REAL browser engine and compare the effective rule sets.
// Decisive test of the "comment bug silently invalidated whole rules" claim.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const files = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent('<html><head></head><body></body></html>');

const out = {};
for (const f of files) {
  const css = readFileSync(f, 'utf8');
  const rules = await p.evaluate((cssText) => {
    const s = document.createElement('style');
    s.textContent = cssText;
    document.head.appendChild(s);
    const sheet = s.sheet;
    const list = [];
    for (const r of sheet.cssRules) {
      list.push({ sel: r.selectorText ?? `@${r.type}`, decls: r.style ? r.style.cssText : '' });
    }
    s.remove();
    return list;
  }, css);
  out[f] = rules;
  console.log(`${f}: ${rules.length} rules parsed (raw text ${css.length} bytes)`);
}
await b.close();
writeFileSync('/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/css-parsed.json', JSON.stringify(out, null, 1));

// pairwise compare first two
if (files.length >= 2) {
  const [a, c] = files;
  const A = out[a], C = out[c];
  const key = (r) => r.sel + '||' + r.decls;
  const setA = A.map(key), setC = C.map(key);
  const onlyA = setA.filter((k) => !setC.includes(k));
  const onlyC = setC.filter((k) => !setA.includes(k));
  console.log(`\n--- only in ${a} (${onlyA.length}) ---`);
  onlyA.forEach((k) => console.log('  - ' + k.slice(0, 260)));
  console.log(`\n--- only in ${c} (${onlyC.length}) ---`);
  onlyC.forEach((k) => console.log('  + ' + k.slice(0, 260)));
}
