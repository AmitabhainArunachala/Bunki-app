/**
 * Support for verify-reader-gloss.mjs (D11), in two parts.
 *
 * 1. Executable controls, the pattern of verify-reader-doors.mjs and verify-corridor-doors T3: a product file is
 *    fetched from the host, its bytes must equal the digest in the served build-identity.json, each literal edit must
 *    match exactly once, and the edited bytes are served in its place (serveMutation). adjudicate() then reads one
 *    control's rows against the candidate's: `killed` only when the run is exactly the schedule (every row once, the
 *    declared witnesses failing as declared, only `allowed` rows failing beside them) and the candidate passed each of
 *    those rows exactly once. Anything else is `incomplete` (setup, identity, page errors, an edit never served, rows
 *    not reached or stopped before they were observed, a schedule not established, an unclean candidate) or
 *    `contaminated` (duplicate or extra rows, an unallowed failure, witnesses failing other than as declared), never a
 *    kill.
 *
 * 2. The reader matcher's census (`node tools/reader-gloss-mutants.mjs measure`). readerChoiceMatch() and its helpers
 *    are LIFTED from corridor.js by name and run as they are, never re-typed; the rows it is given come from
 *    dictionary-worker.js's own rowsForForm(), lifted the same way, over the committed index. Every content token of
 *    every served article whose base form has no core entry is matched and compared with the first row the door
 *    opened before D11 (the worker's rows[0]). Read-only; no browser.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Sorted-key JSON, so a comparison does not depend on property order. */
export const canonical = (value) => (Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value));

/** Every occurrence, overlapping ones included. */
export const occurrences = (text, needle) => {
  const at = [];
  for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + 1)) at.push(index);
  return at;
};

/** Serve the candidate's own file with a control's literal edits, in place of the original. */
export async function serveMutation(context, { origin, manifest, control, edits }) {
  for (const file of new Set(edits.map((edit) => edit.file))) {
    const mine = edits.filter((edit) => edit.file === file);
    await context.route((url) => url.origin === origin && url.pathname === `/${file}`, async (route) => {
      try {
        const response = await route.fetch();
        const bytes = await response.body();
        const baseSha256 = sha256(bytes);
        if (baseSha256 !== manifest?.get(file)) throw new Error(`${file}: the served bytes are not the candidate's (build-identity.json)`);
        let text = bytes.toString('utf8');
        const applied = [];
        for (const edit of mine) {
          const at = occurrences(text, edit.from);
          if (at.length !== 1) throw new Error(`${file}: edit ${edit.key} matched ${at.length} times, not exactly once`);
          text = text.slice(0, at[0]) + edit.to + text.slice(at[0] + edit.from.length);
          applied.push({ key: edit.key, offset: at[0] });
        }
        const body = Buffer.from(text, 'utf8');
        // the host's length and encoding describe the original bytes: drop both for the edited body
        const headers = { ...response.headers() };
        delete headers['content-length'];
        delete headers['content-encoding'];
        control.served.push({ file, baseSha256, mutantSha256: sha256(body), applied });
        await route.fulfill({ status: response.status(), headers, body });
      } catch (error) {
        control.setupError ||= error.message;
        await route.abort().catch(() => {});
      }
    });
  }
}

/**
 * spec: { run, edits, requires, kills, allowed, witness(rowsById) → '' or why not }.
 * control: { rows, served, pageErrors, setupError, error }.
 * runRows: the schedule of every run, by name. editFile(key) → the file an edit serves.
 * candidateRows: the candidate's verdict rows (each { id, pass }).
 * Returns [verdict, reason].
 */
export function adjudicate(spec, control, { runRows, editFile, candidateRows }) {
  const expected = runRows[spec.run];
  const declared = [...spec.requires, ...spec.kills, ...spec.allowed];
  if (!expected || declared.some((id) => !expected.includes(id)) || new Set(declared).size !== declared.length || !spec.kills.length)
    return ['incomplete', 'declaration: requires, kills and allowed must be distinct rows of the run, with at least one kill'];
  if (control.setupError) return ['incomplete', `setup: ${control.setupError}`];
  if (control.error) return ['incomplete', `stopped: ${control.error}`];
  if (control.pageErrors.length) return ['incomplete', `page errors in the mutant: ${JSON.stringify(control.pageErrors)}`];
  for (const file of new Set(spec.edits.map(editFile)))
    if (!control.served.some((row) => row.file === file)) return ['incomplete', `${file}: the edited bytes were never served`];
  // the mutant can only differ from a candidate that passes the same schedule, row for row
  const unclean = expected.filter((id) => { const hits = candidateRows.filter((row) => row.id === id); return hits.length !== 1 || !hits[0].pass; });
  if (unclean.length) return ['incomplete', `the candidate does not pass these rows exactly once: ${unclean.join(', ')}`];
  const ids = control.rows.map((row) => row.id);
  const duplicated = [...new Set(ids.filter((id, at) => ids.indexOf(id) !== at))];
  const extra = [...new Set(ids.filter((id) => !expected.includes(id)))];
  if (duplicated.length || extra.length)
    return ['contaminated', `rows outside the schedule: ${[...duplicated.map((id) => `${id} (twice)`), ...extra].join(', ')}`];
  const rows = new Map(control.rows.map((row) => [row.id, row]));
  const missing = expected.filter((id) => !rows.has(id));
  if (missing.length) return ['incomplete', `never reached: ${missing.join(', ')}`];
  // a row recorded only because its block stopped on an error was never observed: that is no kill
  const unobserved = expected.filter((id) => rows.get(id).observed?.unreached);
  if (unobserved.length) return ['incomplete', `stopped before these rows were observed: ${unobserved.join(', ')}`];
  const unmet = spec.requires.filter((id) => !rows.get(id).pass);
  if (unmet.length) return ['incomplete', `the schedule was not established: ${unmet.join(', ')}`];
  const unlisted = expected.filter((id) => !spec.kills.includes(id) && !spec.allowed.includes(id) && !rows.get(id).pass);
  if (unlisted.length) return ['contaminated', `failures beside the witness that are not allowed: ${unlisted.join(', ')}`];
  const alive = spec.kills.filter((id) => rows.get(id).pass);
  if (alive.length) return ['survived', `still passing: ${alive.join(', ')}`];
  const other = spec.witness(rows);
  if (other) return ['contaminated', `the witness rows failed, but not as declared: ${other}`];
  return ['killed', spec.kills.map((id) => `${id} ${rows.get(id).detail}`).join(' | ')];
}

/* --------------------------------------------------------------------------- census */
const CORRIDOR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A function's whole declaration, found by name in a source file and cut at its matching brace. */
function lifter(src) {
  return (name) => {
    const start = src.search(new RegExp(`^(async )?function ${name}\\(`, 'm'));
    if (start < 0) throw new Error(`missing function ${name}`);
    let depth = 0;
    for (let at = src.indexOf('{', start); at < src.length; at++) {
      if (src[at] === '{') depth++;
      else if (src[at] === '}' && --depth === 0) return src.slice(start, at + 1);
    }
    throw new Error(`unbalanced function ${name}`);
  };
}
const constant = (src, name) => {
  const match = src.match(new RegExp(`^const ${name} = .*$`, 'm'));
  if (!match) throw new Error(`missing const ${name}`);
  return match[0];
};

/** readerChoiceMatch as corridor.js defines it, and rowsForForm as the dictionary worker defines it. */
export function liftReaderMatcher(dir = CORRIDOR) {
  const app = readFileSync(resolve(dir, 'corridor.js'), 'utf8');
  const worker = readFileSync(resolve(dir, 'dictionary-worker.js'), 'utf8');
  const index = JSON.parse(readFileSync(resolve(dir, 'data/share_alike/dict-v2/index.json'), 'utf8'));
  const core = JSON.parse(readFileSync(resolve(dir, 'data/share_alike/dict.json'), 'utf8')).words;
  const fromApp = lifter(app), fromWorker = lifter(worker);
  const { readerChoiceMatch } = new Function([
    ...['KATA_TO_HIRA_OFFSET', 'READER_KANJI', 'READER_KANA'].map((name) => constant(app, name)),
    ...['kataToHira', 'dictionaryReadingSummaries', 'readerReadingFits', 'readerSummaryFor', 'readerChoiceMatch'].map(fromApp),
    'return { readerChoiceMatch };'].join('\n'))();
  const { rowsForForm } = new Function('entries', 'core', [
    ...['GLOSS_MESSY', 'GLOSS_LEAD'].map((name) => constant(worker, name)),
    'let dictionaryEntries = entries; let coreWords = core; const formRowsCache = new Map();',
    ...['normalizeGloss', 'kataToHira', 'dictionaryReadingSummaries', 'dictionaryReadingSupportsForm', 'dictionaryCoreMatch',
      'formRowScore', 'rowsForForm'].map(fromWorker),
    'return { rowsForForm };'].join('\n'))(index.entries, core);
  return { readerChoiceMatch, rowsForForm, core };
}

/** One / chooser / absence for every core-miss content token, and each against the pre-D11 door's first row. */
export function measureReaderMatch(dir = CORRIDOR) {
  const { readerChoiceMatch, rowsForForm, core } = liftReaderMatcher(dir);
  const read = (path) => readFileSync(resolve(dir, path));
  const inputs = Object.fromEntries(['corridor.js', 'dictionary-worker.js', 'data/share_alike/dict-v2/index.json', 'data/share_alike/dict.json',
    'data/articles/index.json'].map((path) => [path, sha256(read(path))]));
  const classes = { one: 0, chooser: 0, offered: 0, absent: 0 };
  const vsFirstRow = { same: 0, chooserContains: 0, chooserWithout: 0, offeredContains: 0, offeredWithout: 0, different: 0, nowAbsent: 0, noRowBefore: 0 };
  const lists = { different: {}, chooserWithout: {}, offeredWithout: {}, nowAbsent: {} };
  let total = 0;
  for (const article of JSON.parse(read('data/articles/index.json')).articles) {
    JSON.parse(read(`data/articles/${article.file}`)).tokens.forEach((token, index) => {
      if (!token.c || core[token.b]) return;
      total++;
      const rows = rowsForForm(token.b || token.s);
      const match = readerChoiceMatch({ b: token.b, s: token.s, r: token.r || '' }, rows), found = match.rows;
      // a reading mismatch is offered, never opened: it is neither a one-row door nor an absence (r4)
      classes[match.mismatch ? 'offered' : found.length === 1 ? 'one' : found.length ? 'chooser' : 'absent']++;
      const first = rows[0];
      if (!first) { vsFirstRow.noRowBefore++; return; }
      const seqs = found.map((row) => row.seq);
      const bucket = match.mismatch ? (seqs.includes(String(first[0])) ? 'offeredContains' : 'offeredWithout')
        : found.length === 1 ? (seqs[0] === String(first[0]) ? 'same' : 'different')
        : found.length ? (seqs.includes(String(first[0])) ? 'chooserContains' : 'chooserWithout') : 'nowAbsent';
      vsFirstRow[bucket]++;
      if (lists[bucket]) {
        const key = `${token.b}(${token.s}/${token.r})`;
        const entry = (lists[bucket][key] ||= { tokens: 0, first: `${article.id}#${index}`,
          before: `${first[1]}/${first[2]}#${first[0]}`, now: found.map((row) => `${row.head}/${row.reading}#${row.seq}`) });
        entry.tokens++;
      }
    });
  }
  return { inputs, total, classes, vsFirstRow, lists };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === 'measure') {
  console.log(JSON.stringify(measureReaderMatch(), null, 2));
}
