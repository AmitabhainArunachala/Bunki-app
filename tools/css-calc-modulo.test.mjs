// A `%` between operands inside calc() is not CSS (mod() is the function), so the whole
// declaration is dropped by the browser. Percent units (`50%`) are fine; a spaced `%` is not.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../prototypes/corridor') + '/';
const SKIP = new Set(['design', 'vendor', 'node_modules', 'data', 'releases']);

function sheets(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...sheets(full));
    else if (name.endsWith('.css')) found.push(full);
  }
  return found;
}

function calcBodies(text) {
  const bodies = [];
  for (let at = text.indexOf('calc('); at !== -1; at = text.indexOf('calc(', at + 5)) {
    let depth = 0;
    let end = at + 4;
    for (; end < text.length; end += 1) {
      if (text[end] === '(') depth += 1;
      else if (text[end] === ')' && --depth === 0) break;
    }
    bodies.push(text.slice(at, end + 1));
  }
  return bodies;
}

describe('corridor stylesheets', () => {
  it('never use a spaced % operator inside calc()', () => {
    const bad = [];
    for (const file of sheets(ROOT)) {
      for (const body of calcBodies(readFileSync(file, 'utf8'))) {
        if (/\s%\s/.test(body)) bad.push(`${file.slice(ROOT.length)}: ${body}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
