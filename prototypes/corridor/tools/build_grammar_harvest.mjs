/**
 * Harvest sites-v11's grammar patterns into a corridor data asset — #36
 * continues. The source (app/lib/grammar.ts) is original in-repo content
 * authored for bunki-sites-v11: 50 patterns with meaning, formation, an
 * example with translation, detection cues, and register/contrast/pitfall
 * notes. Emitted to data/original/grammar-v11.json; the corridor merges it
 * with its own authored GRAMMAR at boot (corridor entries win on duplicate
 * patterns).
 *
 * Usage: node build_grammar_harvest.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const SRC = resolve(CORRIDOR, '..', 'bunki-sites-v11', 'app', 'lib', 'grammar.ts');

const ts = readFileSync(SRC, 'utf8');
const start = ts.indexOf('BASE_GRAMMAR_PATTERNS: readonly GrammarPattern[] = [');
if (start < 0) throw new Error('BASE_GRAMMAR_PATTERNS not found');
const open = ts.indexOf('[', ts.indexOf('= [', start));
let depth = 0;
let end = -1;
for (let i = open; i < ts.length; i++) {
  if (ts[i] === '[') depth += 1;
  else if (ts[i] === ']') {
    depth -= 1;
    if (depth === 0) {
      end = i;
      break;
    }
  }
}
const literal = ts.slice(open, end + 1);
// the array literal is plain data — evaluate it in this build script only
const patterns = new Function(`return ${literal};`)();

const entries = patterns.map((p) => {
  const note = [
    p.register ? `Register: ${p.register}` : null,
    p.contrast ? `Contrast: ${p.contrast}` : null,
    p.pitfall ? `Pitfall: ${p.pitfall}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    id: p.id,
    p: p.pattern,
    lv: p.level,
    mEn: p.meaning,
    mJa: '',
    form: p.formation,
    ex: [{ ja: p.example, en: p.translation }],
    note: note || undefined,
    cues: p.cues,
  };
});

const out = {
  pool: 'original',
  sources: [
    {
      name: 'bunki-sites-v11 grammar patterns',
      licence: 'operator-owned (OD-09)',
      attribution: 'authored in-repo for bunki-sites-v11; harvested per #36',
      url: 'https://github.com/AmitabhainArunachala/Bunki-app',
    },
  ],
  entries,
};

const outPath = resolve(CORRIDOR, 'data', 'original', 'grammar-v11.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out));
console.log(`grammar-v11.json: ${entries.length} harvested patterns`);
