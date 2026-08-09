/**
 * What does the comment actually do to the scoper? Reproduce the pristine
 * scoper exactly and feed it the comment shapes the drift source uses (and the
 * ones it does not yet use), then hand the output to a real CSS parser.
 */
import { chromium } from 'playwright-core';

const scopeSelector = (sel) => {
  const s = sel.trim();
  if (s === ':root' || s === 'body' || s === 'html' || s === 'html,body') return '#drift-layer';
  if (s === '*') return '#drift-layer, #drift-layer *';
  return s.split(',').map((part) => `#drift-layer ${part.trim()}`).join(',\n');
};
const scope = (css, strip) => {
  const raw = strip ? css.replace(/\/\*[\s\S]*?\*\//g, '') : css;
  const out = [];
  for (const m of raw.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push(`${scopeSelector(m[1])}{${m[2]}}`);
  return out.join('\n');
};

const cases = {
  'A · comment in a selector, with commas (the shape the source uses)':
    '.a{color:red}\n/* note, with, commas */\n.word.bctr{color:blue}',
  'B · comment before :root (the special case the scoper depends on)':
    '.a{color:red}\n/* the palette */\n:root{--ink:#123456}',
  'C · comment before body':
    '.a{color:red}\n/* the ground */\nbody{background:#fff}',
  'D · comment before * (the universal reset)':
    '.a{color:red}\n/* reset */\n*{box-sizing:border-box}',
  'E · comment containing a brace':
    '.a{color:red}\n/* e.g. .x { y } */\n.b{color:green}',
};

const b = await chromium.launch();
const p = await b.newPage();
await p.setContent('<html><head></head><body></body></html>');
const parse = (css) => p.evaluate((t) => {
  const s = document.createElement('style'); s.textContent = t; document.head.appendChild(s);
  const l = [...s.sheet.cssRules].map((r) => `${r.selectorText} { ${r.style.cssText} }`);
  s.remove(); return l;
}, css);

for (const [name, css] of Object.entries(cases)) {
  const before = scope(css, false), after = scope(css, true);
  console.log(`\n=== ${name} ===`);
  console.log('  pristine scoper  ->', JSON.stringify(await parse(before)));
  console.log('  WP3 scoper       ->', JSON.stringify(await parse(after)));
}
await b.close();
