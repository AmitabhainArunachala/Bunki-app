/** G3 judge: corridor.js is cut into seams by pure moves — every top-level function of the integration base
 * is present, unchanged by normalised source text, either still in corridor.js or in exactly one seam module;
 * eleven named seams exist and each holds at least one moved function; corridor.js shrank by at least the lines
 * moved and imports each seam with a relative ES import.
 *
 * Pinned by the contract (campaign/contracts/G3.json, assertions [0]–[2]); the worker may not edit this file or
 * seams-baseline.json. The baseline was generated from the integration base's corridor.js with
 * `node verify-seams.mjs --write-baseline <corridor.js> <out.json>` and records, per top-level function
 * declaration, the sha256 of its whitespace-normalised source text and its line span. Exit 0 = pass; any other
 * exit names the failing functions and seams. Assertions [3]–[5] (the existing verifiers, packaging, offline boot)
 * are the rest of the contract's command, not this file.
 *
 * Negative control (run by the TESTS_SOUND reviewer, not here): flip one comparison inside one moved function in
 * a scratch copy → this judge must name that function and exit 2. Authored by the Bunki lead 2026-11-06. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');                       // prototypes/corridor
const MODULES = HERE;                                       // prototypes/corridor/modules
const BASELINE = join(HERE, 'seams-baseline.json');
const SEAMS = ['dictionary', 'word-entry', 'capture', 'study-host', 'return', 'worlds', 'voice', 'learner', 'drift', 'library', 'teacher'];

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const normalise = (text) => text.replace(/\s+/gu, ' ').trim();

/** top-level function declarations of one file: name → { hash, lines } */
function topLevelFunctions(path) {
  const source = readFileSync(path, 'utf8');
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const out = new Map();
  for (const node of sf.statements) {
    if (!ts.isFunctionDeclaration(node) || !node.name) continue;
    const name = node.name.text;
    const text = node.getText(sf);
    const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    if (out.has(name)) throw new Error(`${relative(CORRIDOR, path)}: duplicate top-level function ${name}`);
    out.set(name, { hash: sha256(normalise(text)), lines: end - start + 1 });
  }
  return { functions: out, lineCount: source.split('\n').length };
}

function listSeamFiles() {
  if (!existsSync(MODULES)) return new Map();
  const files = new Map();                                  // seam → [absolute .mjs/.js paths]
  for (const seam of SEAMS) {
    const asFile = ['.mjs', '.js'].map((ext) => join(MODULES, `${seam}${ext}`)).find(existsSync);
    const asDir = join(MODULES, seam);
    const found = [];
    if (asFile) found.push(asFile);
    if (existsSync(asDir) && statSync(asDir).isDirectory()) {
      const walk = (dir) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (/\.(mjs|js)$/u.test(name)) found.push(p); } };
      walk(asDir);
    }
    if (found.length) files.set(seam, found);
  }
  return files;
}

function main(argv) {
  if (argv[0] === '--write-baseline') {
    const [, corridorPath, outPath] = argv;
    const { functions, lineCount } = topLevelFunctions(resolve(corridorPath));
    const doc = { schema: 'bunki.g3.seams-baseline/1', corridor: 'prototypes/corridor/corridor.js', lineCount, functionCount: functions.size,
      functions: Object.fromEntries([...functions].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) };
    writeFileSync(resolve(outPath), JSON.stringify(doc, null, 1) + '\n');
    console.log(`baseline: ${functions.size} top-level functions, ${lineCount} lines → ${outPath}`);
    return 0;
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  if (baseline.schema !== 'bunki.g3.seams-baseline/1') throw new Error('seams-baseline.json: unknown schema');
  const corridorPath = join(CORRIDOR, 'corridor.js');
  const now = topLevelFunctions(corridorPath);
  const seamFiles = listSeamFiles();
  const where = new Map();                                  // function → [locations]
  for (const [name] of now.functions) where.set(name, [...(where.get(name) || []), 'corridor.js']);
  const moved = new Map();                                  // seam → Set(function names)
  const seamFunctions = new Map();                          // function → { hash, lines } from the seam that holds it
  for (const [seam, paths] of seamFiles) {
    for (const p of paths) {
      const { functions } = topLevelFunctions(p);
      for (const [name, info] of functions) {
        where.set(name, [...(where.get(name) || []), relative(CORRIDOR, p)]);
        seamFunctions.set(name, info);
        if (baseline.functions[name]) moved.set(seam, (moved.get(seam) || new Set()).add(name));
      }
    }
  }
  const problems = [];
  // [0] every base function present exactly once, unchanged by normalised text
  let movedLines = 0;
  for (const [name, base] of Object.entries(baseline.functions)) {
    const locs = where.get(name) || [];
    if (locs.length === 0) { problems.push(`MISSING ${name} (was ${base.lines} lines in corridor.js)`); continue; }
    if (locs.length > 1) { problems.push(`DUPLICATED ${name} in ${locs.join(', ')} (a move leaves one copy)`); continue; }
    const info = locs[0] === 'corridor.js' ? now.functions.get(name) : seamFunctions.get(name);
    if (info.hash !== base.hash) problems.push(`CHANGED ${name} in ${locs[0]} (normalised source differs from the base)`);
    else if (locs[0] !== 'corridor.js') movedLines += base.lines;
  }
  // [1] eleven seams, each holding at least one moved function
  for (const seam of SEAMS) {
    if (!seamFiles.has(seam)) problems.push(`SEAM ${seam}: no modules/${seam}.mjs and no modules/${seam}/ directory`);
    else if (!(moved.get(seam) || new Set()).size) problems.push(`SEAM ${seam}: holds no function moved from the base corridor.js`);
  }
  // [2] corridor.js shrank by at least the moved lines and imports each seam relatively
  const corridorText = readFileSync(corridorPath, 'utf8');
  if (now.lineCount > baseline.lineCount - movedLines) problems.push(`LINES corridor.js has ${now.lineCount} lines; the base had ${baseline.lineCount} and ${movedLines} lines moved, so at most ${baseline.lineCount - movedLines} are allowed`);
  for (const seam of SEAMS) {
    const re = new RegExp(`^\\s*import\\b[^;]*?from\\s+['"]\\./modules/${seam}(?:/[^'"]*|\\.m?js)?['"]`, 'mu');
    if (!re.test(corridorText)) problems.push(`IMPORT corridor.js has no relative ES import of ./modules/${seam}`);
  }
  const summary = `seams: ${[...moved].map(([s, f]) => `${s}=${f.size}`).join(' ')} · moved ${movedLines} lines · corridor.js ${baseline.lineCount} → ${now.lineCount} · base functions ${Object.keys(baseline.functions).length}`;
  if (problems.length) { console.error(`verify-seams: FAIL\n  ${problems.slice(0, 60).join('\n  ')}${problems.length > 60 ? `\n  … ${problems.length - 60} more` : ''}\n  ${summary}`); return 2; }
  console.log(`verify-seams: PASS · ${summary}`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
