/** Extract the actual search functions, then exercise real immutable corpus
 * data in a bounded VM. No copied search algorithm or application-state hook.
 * Usage: KAIRO_ARTIFACT_SHA256=<pin> node tools/test-search-fallback.mjs
 *   --site <built site> --evidence-out <fresh external directory>
 *   [--baseline-site <prior immutable site>]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { parse } from 'acorn';

const argument = (name, fallback) => {
  const at = process.argv.indexOf(name);
  if (at < 0) return fallback;
  assert.ok(process.argv[at + 1] && !process.argv[at + 1].startsWith('--'), `${name} needs a value`);
  return process.argv[at + 1];
};
const siteArg = argument('--site', process.env.KAIRO_SITE_DIR), outArg = argument('--evidence-out', process.env.KAIRO_SEARCH_EVIDENCE);
assert.ok(siteArg && outArg, 'Provide an immutable --site and fresh external --evidence-out');
const site = resolve(siteArg), out = resolve(outArg), repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
assert.ok(out !== repository && !out.startsWith(repository + sep), 'Evidence must remain outside the repository');
assert.ok(!existsSync(out), 'Preserve earlier evidence; choose a fresh directory');
mkdirSync(out, { recursive: true });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
const readJson = (root, path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const identity = readJson(site, 'build-identity.json');
assert.match(process.env.KAIRO_ARTIFACT_SHA256 || '', /^[0-9a-f]{64}$/u);
assert.equal(identity.artifactSha256, process.env.KAIRO_ARTIFACT_SHA256, 'Candidate must match its explicitly supplied artifact pin');
const inputPaths = ['corridor.js', 'data/share_alike/words.json', 'data/share_alike/dict.json',
  'data/share_alike/kanji.json', 'data/share_alike/dict-v2/index.json', 'data/original/grammar-v11.json'];
const inputs = inputPaths.map((path) => {
  const bytes = readFileSync(resolve(site, path)), expected = identity.files.find((entry) => entry.path === path);
  assert.equal(sha(bytes), expected?.sha256, `Changed candidate input ${path}`);
  return { path, bytes: bytes.length, sha256: expected.sha256 };
});
const functions = new Set(['GRAMMARS', 'mergeGrammar', 'buildSearchIndex', 'searchResults', 'dictionarySearchContext', 'requestDictionarySearch',
  'kataToHira', 'hiraToKata', 'normalizeGloss', 'dictionaryCoreMatch', 'dictionaryReadingSummaries', 'dictionaryGlossSummary', 'dictionaryReadingSupportsForm',
  // D23: search folds an identical numbered row into the core row only while the core sheet offers its door
  'searchRowShownByCore', 'dictionaryHomographChoices', 'dictionaryRowsForForm']);
// introduced by that D23 change: required of the candidate, absent from an older --baseline-site source
const sinceD23 = new Set(['searchRowShownByCore', 'dictionaryHomographChoices']);
const variables = new Set(['GRAMMAR', 'PARTICLES', 'searchIndex', 'KATA_TO_HIRA_OFFSET', 'ROMAJI', 'GLOSS_MESSY', 'GLOSS_LEAD', 'JLPT_RANK', 'jlptRank']);
function extract(source, baseline = false) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const selected = [], found = new Set();
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' && functions.has(node.id.name)) {
      selected.push({ name: node.id.name, line: node.loc.start.line, text: source.slice(node.start, node.end) }); found.add(node.id.name);
    } else if (node.type === 'VariableDeclaration') {
      for (const entry of node.declarations) if (entry.id.type === 'Identifier' && variables.has(entry.id.name)) {
        selected.push({ name: entry.id.name, line: entry.loc.start.line, text: `${node.kind} ${source.slice(entry.start, entry.end)};` }); found.add(entry.id.name);
      }
    }
  }
  for (const name of [...functions, ...variables]) assert.ok(found.has(name) || (baseline && sinceD23.has(name)), `Missing actual source binding ${name}`);
  return selected;
}
const words = readJson(site, 'data/share_alike/words.json').words, dict = readJson(site, 'data/share_alike/dict.json').words;
const compact = readJson(site, 'data/share_alike/dict-v2/index.json');
const kanji = readJson(site, 'data/share_alike/kanji.json').kanji, grammar = readJson(site, 'data/original/grammar-v11.json').entries;
const fallback = Object.entries(words).filter(([form]) => !Object.hasOwn(dict, form));
const writtenForms = new Set(compact.entries.flatMap((row) => row[4]));
const fallbackWithoutDeep = fallback.filter(([form]) => !writtenForms.has(form));
const beforeDataSha256 = sha(JSON.stringify({ words, dict, kanji, grammar, compact }));
function actualSource(root, name) {
  const source = readFileSync(resolve(root, 'corridor.js'), 'utf8'), extracted = extract(source, name === 'baseline');
  const program = extracted.map((entry) => entry.text).join('\n\n');
  writeFileSync(resolve(out, `${name}-extracted-source.js`), program);
  // the form-row caches installDictionaryIndex gives every loaded index (dictionaryRowsForForm fills them)
  const D = { words, dict, kanji, dictionaryMode: 'inline', dictionaryIndex: null, dictionaryByForm: new Map(), dictionaryCompleteForms: new Set(),
    dictionaryBySeq: new Map() }, context = vm.createContext({ D, grammar });
  vm.runInContext(`${program}\nD.grammar=mergeGrammar(grammar); this.api={index(){buildSearchIndex(); return searchIndex;},search:searchResults,` +
    `choices(form){return dictionaryHomographChoices(form).map(({row,summary,enabledOnCore})=>({seq:String(row[0]),reading:summary[0],enabledOnCore}));}};`,
  context, { timeout: 3000 });
  const invoke = (expression, query = '') => {
    context.query = query;
    return clone(vm.runInContext(expression, context, { timeout: 5000 }));
  };
  return { sourceSha256: sha(source), extracted: extracted.map(({ name: binding, line, text }) => ({ name: binding, line, sha256: sha(text) })),
    index: () => invoke('api.index()'), search: (query, deep = false) => { D.dictionaryIndex = deep ? compact : null; return invoke('api.search(query)', query); },
    // the entry doors the seq-less core sheet renders for a form, from the actual dictionaryHomographChoices
    choices: (form) => { D.dictionaryIndex = compact; return invoke('api.choices(query)', form); } };
}
const actual = actualSource(site, 'candidate'), baselineArg = argument('--baseline-site');
let baseline = null, baselineIdentity = null;
if (baselineArg) {
  const baselineSite = resolve(baselineArg); baselineIdentity = readJson(baselineSite, 'build-identity.json');
  // Data parity is required: differences between runs must be source behavior,
  // not a hidden corpus substitution under the old source functions.
  for (const entry of inputs.filter((entry) => entry.path !== 'corridor.js')) assert.equal(sha(readFileSync(resolve(baselineSite, entry.path))), entry.sha256, `Baseline corpus differs: ${entry.path}`);
  assert.equal(sha(readFileSync(resolve(baselineSite, 'corridor.js'))), baselineIdentity.files.find((entry) => entry.path === 'corridor.js')?.sha256);
  baseline = actualSource(baselineSite, 'baseline');
}
const rows = actual.index(), checks = [];
const check = (name, run) => {
  try { const detail = run(); checks.push({ name, pass: true, detail }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, pass: false, error: String(error.stack || error) }); console.error(`FAIL ${name}: ${error.message}`); }
};
const visible = (entries) => entries.map(({ t, id, seq, w, r, g, core }) => ({ t, id, seq: seq ? String(seq) : null, w, r, g, core: !!core }));
const immediateWords = rows.filter((row) => row.t === 'word');
const byForm = new Map();
for (const row of immediateWords) byForm.set(row.id, [...(byForm.get(row.id) || []), row]);
const missing = fallback.filter(([form]) => !byForm.has(form)).map(([form]) => form);
writeFileSync(resolve(out, 'fallback-inventory.json'), `${JSON.stringify({ sourceWords: Object.keys(words).length, dictionaryWords: Object.keys(dict).length,
  fallbacks: fallback.length, fallbacksWithoutWrittenDeepCounterpart: fallbackWithoutDeep.length, indexed: immediateWords.length, missing,
  fallbackRows: fallback.map(([form, record]) => ({ form, reading: record.r, gloss: record.g, jlpt: record.jlpt, actual: visible(byForm.get(form) || []) })) }, null, 2)}\n`);

check('every graded words-only entry is indexed exactly once with its complete fallback reading and gloss', () => {
  assert.equal(missing.length, 0, `Missing ${missing.length}/${fallback.length} graded fallback words; first: ${missing.slice(0, 8).join('、')}`);
  for (const [form, record] of fallback) {
    const entries = byForm.get(form); assert.equal(entries.length, 1, form);
    assert.equal(entries[0].r, record.r || '', `Exact reading for ${form}`); assert.equal(entries[0].g, record.g || '', `Complete glossary string for ${form}`);
    assert.equal(entries[0].id, form); assert.equal(entries[0].w, form);
  }
  return { checked: fallback.length };
});
check('existing dictionary entries keep their identity, reading, primary gloss and index order without shadows', () => {
  const forms = Object.keys(dict);
  assert.deepEqual(immediateWords.slice(0, forms.length).map((entry) => entry.id), forms);
  for (const form of forms) {
    const entries = byForm.get(form); assert.equal(entries.length, 1, form);
    assert.equal(entries[0].r, dict[form].r || ''); assert.equal(entries[0].g, dict[form].m?.[0] || '');
  }
  assert.equal(byForm.get('生')[0].r, 'なま'); assert.equal(words['生'].r, 'せい');
  return { checked: forms.length, conflictingSourceExample: { form: '生', dictionaryReading: 'なま', gradedReading: 'せい' } };
});
check('graded numeric JLPT values keep their intended search tie ranks', () => {
  for (const [form, record] of fallback) {
    const level = Number(String(record.jlpt).replace(/^N/iu, ''));
    if (Number.isInteger(level) && level >= 1 && level <= 5) assert.equal(byForm.get(form)?.[0].j, 5 - level, form);
  }
  return { checked: fallback.length };
});
check('fallback entries with no deep written counterpart remain present without loading the optional dictionary', () => {
  assert.ok(fallbackWithoutDeep.some(([form]) => form === '原典'));
  for (const [form] of fallbackWithoutDeep) assert.ok(byForm.has(form), form);
  return { checked: fallbackWithoutDeep.length, fixture: words['原典'] };
});
check('written, kana, romaji and whole glossary searches return the exact fallback while deep data is unavailable', () => {
  const outputs = {};
  for (const query of ['原典', 'げんてん', 'genten', 'original, source']) {
    const result = actual.search(query).find((entry) => entry.t === 'word' && entry.id === '原典');
    assert.ok(result, query); assert.equal(result.r, 'げんてん'); assert.equal(result.g, 'original, source'); assert.ok(!result.seq);
    outputs[query] = visible([result])[0];
  }
  return outputs;
});
check('both 生物 homographs stay reachable beside the restored core row; an identical numbered row is shown once, as the core row', () => {
  // D23: the scored core row is never dropped. 1379430 displays exactly as the core row (生物・せいぶつ・living thing) and
  // the core sheet offers its door, so it is shown once, as the core row in its rank; 1379440 なまもの keeps its numbered row.
  const hits = actual.search('生物', true), exact = hits.filter((entry) => entry.w === '生物');
  assert.deepEqual(exact.map((entry) => [entry.seq ? String(entry.seq) : null, entry.r, !!entry.core]), [[null, 'せいぶつ', true], ['1379440', 'なまもの', false]]);
  const doors = actual.choices('生物').map(({ seq, reading, enabledOnCore }) => [seq, reading, enabledOnCore]);
  for (const door of [['1379430', 'せいぶつ', true], ['1379440', 'なまもの', true]]) assert.ok(doors.some((entry) => entry.join() === door.join()), door.join());
  const raw = actual.search('raw food', true)[0]; assert.equal(String(raw.seq), '1379440'); assert.equal(raw.r, 'なまもの');
  return { written: visible(exact), coreSheetDoors: doors, glossFirst: visible([raw])[0] };
});
check('fallback without a deep counterpart survives the ready deep tier with unchanged identity', () => {
  const immediate = actual.search('原典').find((entry) => entry.id === '原典');
  assert.ok(immediate);
  const loaded = actual.search('原典', true).find((entry) => entry.id === '原典');
  assert.deepEqual(visible([loaded]), visible([immediate])); return visible([loaded]);
});
if (baseline) {
  check('the pinned R3 source reproduces the missing fallback against the same corpus', () => {
    assert.ok(!baseline.index().some((row) => row.t === 'word' && row.id === '原典'));
    assert.ok(!baseline.search('原典', true).some((row) => row.t === 'word' && row.id === '原典'));
    return { baselineArtifactSha256: baselineIdentity.artifactSha256, sourceSha256: baseline.sourceSha256, absent: 'word:原典' };
  });
  check('existing exact deep homograph identities and readings match the actual R3 search behavior', () => {
    // D23: a numbered row the R3 search showed is still shown, or it is shown once as the restored core row, whose
    // display it matches byte for byte, while the core sheet offers its exact entry and reading as an enabled door
    const output = {};
    for (const query of ['生物', '上手', '学校']) {
      const select = (hits) => visible(hits.filter((entry) => entry.w === query && entry.seq));
      const prior = select(baseline.search(query, true)), hits = actual.search(query, true), current = select(hits);
      const core = visible(hits.filter((entry) => entry.core && entry.id === query))[0];
      const doors = actual.choices(query);
      assert.ok(prior.length);
      for (const row of prior) {
        if (current.some((entry) => JSON.stringify(entry) === JSON.stringify(row))) continue;
        assert.ok(core && [core.w, core.r, core.g].join() === [row.w, row.r, row.g].join(), `${query} ${row.seq}: folded only into an identical core row`);
        assert.ok(doors.some((door) => door.seq === row.seq && door.reading === row.r && door.enabledOnCore), `${query} ${row.seq}: its door stays`);
      }
      assert.ok(current.every((entry) => prior.some((row) => JSON.stringify(row) === JSON.stringify(entry))), `${query}: no new numbered row`);
      output[query] = { current, core };
    }
    return output;
  });
}
check('actual search leaves the input corpus unchanged and repeated immediate indexing stable', () => {
  assert.equal(sha(JSON.stringify({ words, dict, kanji, grammar, compact })), beforeDataSha256);
  assert.deepEqual(actual.index(), rows); return { inputSha256: beforeDataSha256 };
});
const pass = checks.every((entry) => entry.pass);
writeFileSync(resolve(out, 'receipt.json'), `${JSON.stringify({ package: 'PI-SEARCH-FALLBACK-08', suite: 'actual-source-search-fallback', pass,
  site, artifactSha256: identity.artifactSha256, sourceAssetSha256: identity.sourceAssetSha256,
  verifierSha256: sha(readFileSync(fileURLToPath(import.meta.url))), sourceSha256: actual.sourceSha256, inputs, extractedBindings: actual.extracted,
  baseline: baseline ? { site: resolve(baselineArg), artifactSha256: baselineIdentity.artifactSha256, sourceSha256: baseline.sourceSha256 } : null,
  checks, limits: { sourceInitMs: 3000, eachQueryMs: 5000 },
  scope: 'AST-extracted actual functions with real pinned corpus; immediate and inline deep tiers. Worker transport and UI are separate browser verification.',
  state: 'No browser, provider, active app state or repository runtime mutation.' }, null, 2)}\n`);
console.log(JSON.stringify({ pass, checks: checks.length, passed: checks.filter((entry) => entry.pass).length, out }));
if (!pass) process.exitCode = 1;
