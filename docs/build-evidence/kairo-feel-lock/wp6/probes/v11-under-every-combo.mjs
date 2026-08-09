/**
 * WP6 — run the whole v11 coherence suite under each of the four tap-ladder
 * combinations, not just the shipped one.
 *
 * The extra rung in "stage4" changes reveal PACING: the ghost arbiter now sees
 * a word that is forward and blooming but not yet read, a state the field never
 * produced before. verify-v11 is the instrument that measures exactly that —
 * presence floors, reachability, ghost residual, reading contention, chrome
 * keep-out — so the honest check is to run all 21 of its checks under every
 * combination rather than argue the pacing does not matter.
 *
 * verify-v11 serves its --src file inline with no query string, so the settings
 * cannot be handed in through the URL seam. This writes four scratch copies of
 * the drift source with the two initial values rewritten, runs verify-v11
 * against each, and reports the four totals. The scratch copies are throwaway:
 * nothing here edits the tree.
 *
 * Usage: node v11-under-every-combo.mjs [--out FILE] [--scratch DIR]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../../..');
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const SRC = resolve(REPO, 'prototypes/drift/drift-artifact.html');
const V11 = resolve(REPO, 'prototypes/drift/tools/verify-v11.mjs');
const OUT = arg('--out', `${process.env.TMPDIR || '/tmp'}/wp6-v11-combos.json`);
const SCRATCH = arg('--scratch', fs.mkdtempSync(resolve(os.tmpdir(), 'wp6-v11-')));

const src = fs.readFileSync(SRC, 'utf8');
const LAD = 'let V_LADDER="stage3";';
const SAT = 'let V_SATTAP="staged";';
for (const [needle, what] of [
  [LAD, 'V_LADDER'],
  [SAT, 'V_SATTAP'],
]) {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error(`${what} initial value not found exactly once (found ${n}) — the source moved`);
}

const rows = [];
let port = 8961;
for (const ladder of ['stage3', 'stage4']) {
  for (const satTap of ['staged', 'recenter']) {
    const tag = `${ladder}+${satTap}`;
    const file = resolve(SCRATCH, `drift-${tag}.html`);
    fs.writeFileSync(
      file,
      src.replace(LAD, `let V_LADDER="${ladder}";`).replace(SAT, `let V_SATTAP="${satTap}";`),
    );
    const json = resolve(SCRATCH, `v11-${tag}.json`);
    let out = '';
    let code = 0;
    try {
      out = execFileSync(
        process.execPath,
        [V11, '--src', file, '--out', json, '--label', tag, '--port', String(port++)],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      );
    } catch (e) {
      out = `${e.stdout || ''}${e.stderr || ''}`;
      code = e.status == null ? 1 : e.status;
    }
    const m = out.match(/(\d+)\/(\d+) checks passed/);
    const fails = out
      .split('\n')
      .filter((l) => l.startsWith('FAIL'))
      .map((l) => l.slice(0, 180));
    const errLine = (out.match(/^ERRORS: .*$/m) || ['ERRORS: (not reported)'])[0];
    const row = {
      combo: tag,
      passed: m ? +m[1] : null,
      total: m ? +m[2] : null,
      exit: code,
      errors: errLine,
      fails,
      results: fs.existsSync(json) ? JSON.parse(fs.readFileSync(json, 'utf8')).results : null,
    };
    rows.push(row);
    console.log(
      `${row.passed === row.total && row.total ? 'PASS' : 'FAIL'}  v11 under ${tag}: ${row.passed}/${row.total} · ${errLine}` +
        (fails.length ? `\n      ${fails.join('\n      ')}` : ''),
    );
  }
}

const allGreen = rows.every((r) => r.total && r.passed === r.total);
console.log(`\n${rows.filter((r) => r.total && r.passed === r.total).length}/${rows.length} combinations at full v11`);
fs.writeFileSync(
  OUT,
  JSON.stringify({ src: SRC, at: new Date().toISOString(), scratch: SCRATCH, rows }, null, 2),
);
console.log(`results -> ${OUT}`);
process.exit(allGreen ? 0 : 1);
