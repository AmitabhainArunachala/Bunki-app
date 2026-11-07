/** L3B.0 judge: the beginner unit manifest draft, its schema, its sequence document and the fenced block MF2 reads.
 * Assertions A1–A7 of contract L3B.0 run against the real files; the negative controls run the same checks on
 * in-memory mutants (never written to disk) and must go red naming the planted fault.
 * Run from the repo root: node --test prototypes/corridor/tools/beginner-manifest.test.mjs */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { entryId, taskId } from '../contracts/identity/identity.mjs';

// the G9 modality vocabulary; identity.mjs keeps its MODALITIES set private, so the list is restated here and
// cross-checked below: taskId accepts each of these and refuses anything else
const MODALITIES = ['recognition', 'recall', 'production', 'listening', 'reading', 'writing', 'speaking'];

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(corridor, '..', '..');
const DRAFT = resolve(corridor, 'data/beginner/manifest-draft');
const paths = {
  units: resolve(DRAFT, 'units.json'),
  schema: resolve(DRAFT, 'unit.schema.json'),
  manifestMd: resolve(DRAFT, 'MANIFEST.md'),
  sequenceMd: resolve(repo, 'docs/curriculum/BEGINNER-SEQUENCE.md'),
  index: resolve(corridor, 'data/share_alike/dict-v2/index.json'),
};
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const PHASES = ['kana-and-sound', 'survival-phrases', 'situation-words', 'guided-reading'];

// ---------------------------------------------------------------- a small JSON-schema validator (draft-07 subset)
function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}
function validate(schema, value, root = schema, path = '$', errors = []) {
  const fail = (msg) => { errors.push(`${path}: ${msg}`); return errors; };
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], root);
    if (!target) return fail(`unresolvable $ref ${schema.$ref}`);
    return validate(target, value, root, path, errors);
  }
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) return fail(`expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) return fail(`${JSON.stringify(value)} not in ${JSON.stringify(schema.enum)}`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const t = typeOf(value);
    if (!types.includes(t) && !(types.includes('number') && t === 'integer')) return fail(`expected ${types.join('|')}, got ${t}`);
  }
  if (schema.not) {
    const inner = validate(schema.not, value, root, path, []);
    if (inner.length === 0) return fail(`matches forbidden schema ${JSON.stringify(schema.not)}`);
  }
  if (schema.oneOf) {
    const results = schema.oneOf.map((s) => validate(s, value, root, path, []));
    const ok = results.filter((r) => r.length === 0).length;
    if (ok !== 1) return fail(`oneOf matched ${ok} branches; nearest: ${results.sort((a, b) => a.length - b.length)[0].slice(0, 3).join('; ')}`);
  }
  const t = typeOf(value);
  if (t === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) fail(`shorter than ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) fail(`${JSON.stringify(value)} does not match ${schema.pattern}`);
  }
  if (t === 'integer' || t === 'number') {
    if (schema.minimum != null && value < schema.minimum) fail(`${value} < minimum ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) fail(`${value} > maximum ${schema.maximum}`);
  }
  if (t === 'array') {
    if (schema.minItems != null && value.length < schema.minItems) fail(`length ${value.length} < minItems ${schema.minItems}`);
    if (schema.maxItems != null && value.length > schema.maxItems) fail(`length ${value.length} > maxItems ${schema.maxItems}`);
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, root, `${path}[${i}]`, errors));
  }
  if (t === 'object') {
    for (const k of schema.required || []) if (!(k in value)) fail(`missing required ${k}`);
    for (const [k, sub] of Object.entries(schema.properties || {})) if (k in value) validate(sub, value[k], root, `${path}.${k}`, errors);
    if (schema.additionalProperties === false) for (const k of Object.keys(value)) if (!(k in (schema.properties || {}))) fail(`unexpected property ${k}`);
  }
  return errors;
}

// ---------------------------------------------------------------- the checks (pure; throw with a message naming the fault)
/** A2: schema validation, unit by unit so that a failing unit is named */
function checkSchema(manifest, schema) {
  const unitSchema = { $ref: '#/$defs/unit' };
  for (const [i, unit] of (manifest.units || []).entries()) {
    const errors = validate(unitSchema, unit, schema, `units[${i}]`);
    if (errors.length) throw new Error(`schema: unit ${unit?.id ?? i} invalid: ${errors.slice(0, 4).join('; ')}`);
  }
  const headerOnly = { ...manifest, units: manifest.units?.length ? [manifest.units[0]] : [] };
  const errors = validate(schema, headerOnly, schema, '$');
  if (errors.length) throw new Error(`schema: manifest invalid: ${errors.slice(0, 4).join('; ')}`);
}
/** A1: phase order read from units.json */
function checkPhaseOrder(manifest) {
  const seen = new Set();
  let last = -1;
  for (const u of manifest.units) {
    const p = PHASES.indexOf(u.phase);
    if (p < 0) throw new Error(`phase order: unit ${u.id} has unknown phase ${u.phase}`);
    if (p < last) throw new Error(`phase order: unit ${u.id} (${u.phase}) comes after a ${PHASES[last]} unit`);
    last = p;
    seen.add(u.phase);
  }
  for (const p of PHASES) if (!seen.has(p)) throw new Error(`phase order: no ${p} unit`);
  assert.deepEqual(manifest.phase_order, PHASES, 'phase_order header');
}
/** A2: prerequisites resolve to EARLIER units; empty only for the first */
function checkPrerequisites(manifest) {
  const before = new Set();
  manifest.units.forEach((u, i) => {
    if (i === 0) {
      if (u.prerequisites.length) throw new Error(`prerequisites: first unit ${u.id} must have none`);
    } else if (!u.prerequisites.length) throw new Error(`prerequisites: unit ${u.id} has none`);
    for (const p of u.prerequisites) {
      if (p === u.id) throw new Error(`prerequisites: unit ${u.id} requires itself`);
      if (!before.has(p)) throw new Error(`prerequisites: unit ${u.id} requires ${p}, which is not an earlier unit`);
    }
    before.add(u.id);
  });
  const ids = manifest.units.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length, 'unit ids unique');
  manifest.units.forEach((u, i) => assert.equal(u.order, i + 1, `unit ${u.id} order`));
}
/** A2: every obligation and assessment names a check type and covers item ids of its unit (or a situation label) */
function checkCoverage(manifest) {
  for (const u of manifest.units) {
    const itemIds = new Set(u.items.map((i) => i.id));
    const okId = (id) => itemIds.has(id) || /^situation:[a-z0-9-]+$/.test(id);
    if (!u.review_obligations.length) throw new Error(`coverage: unit ${u.id} has no review_obligations`);
    if (!u.assessments.length) throw new Error(`coverage: unit ${u.id} has no assessments`);
    for (const o of u.review_obligations) for (const c of o.covers) if (!okId(c)) throw new Error(`coverage: unit ${u.id} obligation ${o.type} covers unknown id ${c}`);
    for (const a of u.assessments) {
      if (!MODALITIES.includes(a.check)) throw new Error(`coverage: unit ${u.id} assessment check ${a.check} is not a G9 modality`);
      for (const c of a.covers) if (!okId(c)) throw new Error(`coverage: unit ${u.id} assessment ${a.check} covers unknown id ${c}`);
    }
    const nativeCovered = new Set(u.review_obligations.filter((o) => o.type === 'native-read').flatMap((o) => o.covers));
    if (u.phase === 'survival-phrases') {
      for (const i of u.items) if (!nativeCovered.has(i.id)) throw new Error(`coverage: phrase ${i.id} in ${u.id} has no native-read obligation`);
      if (!nativeCovered.has(`situation:${u.situation}`)) throw new Error(`coverage: situation label ${u.situation} of ${u.id} has no native-read obligation`);
    }
    if (u.phase === 'situation-words') {
      for (const s of [u.situation, ...(u.situations_included || [])]) if (!nativeCovered.has(`situation:${s}`)) throw new Error(`coverage: situation label ${s} of ${u.id} has no native-read obligation`);
    }
  }
}
/** items follow the G9 identity contract and carry audio SLOTS, never clip ids */
function checkItems(manifest) {
  for (const u of manifest.units) {
    for (const i of u.items) {
      if (i.kind === 'word') assert.equal(i.id, entryId({ seq: i.seq, spelling: i.spelling, reading: i.reading }), `word id in ${u.id} is the G9 entryId`);
      if (i.kind === 'phrase' && i.entry_id) assert.match(i.entry_id, /^entry:\d+:.+\|.+$/, `phrase ${i.id} entry_id`);
      const s = i.audio_slot;
      if (!s) throw new Error(`audio: item ${i.id} in ${u.id} has no audio slot`);
      if (s.filled !== false || s.clip !== null) throw new Error(`audio: item ${i.id} in ${u.id} carries a clip, the draft admits slots only`);
      assert.equal(s.id, `slot:audio:${u.id}:${i.id}`, `slot id rule for ${i.id}`);
    }
  }
  for (const u of manifest.units.filter((x) => x.phase === 'survival-phrases')) for (const i of u.items) assert.equal(i.kind, 'phrase', `${u.id} holds phrases`);
}
/** A3: >= 500 distinct ent_seq with rank and situation from the named, pinned source; ranks non-decreasing within the tolerance band */
function checkWords(manifest) {
  const wordUnits = manifest.units.filter((u) => u.phase === 'situation-words');
  const words = wordUnits.flatMap((u) => u.items);
  const seqs = new Set(words.map((w) => w.seq));
  if (seqs.size < 500) throw new Error(`words: ${seqs.size} distinct ent_seq, need >= 500`);
  for (const w of words) {
    if (!Number.isInteger(w.rank) || w.rank < 1) throw new Error(`words: ${w.id} has no frequency rank`);
    if (!w.situation) throw new Error(`words: ${w.id} has no situation id`);
    if (!manifest.word_selection.situations[w.situation]) throw new Error(`words: ${w.id} situation ${w.situation} is not in the taxonomy`);
  }
  const fs = manifest.frequency_source;
  assert.ok(fs.name && fs.version, 'frequency source named and version-pinned');
  assert.match(fs.pinned_inputs.combined_sha256, /^[0-9a-f]{64}$/, 'frequency source pinned by sha256');
  const T = manifest.word_selection.tolerance.ranks;
  const band = manifest.word_selection.band_slots;
  const ranks = words.map((w) => w.rank);
  let runningMax = 0;
  ranks.forEach((r, i) => {
    if (r < runningMax - T) throw new Error(`words: slot ${i + 1} (rank ${r}) is more than ${T} ranks below the running maximum ${runningMax}`);
    runningMax = Math.max(runningMax, r);
  });
  for (let b = 1; b * band < ranks.length; b++) {
    const earlierMax = Math.max(...ranks.slice(0, b * band));
    const laterMin = Math.min(...ranks.slice(b * band));
    if (laterMin <= earlierMax) throw new Error(`words: band ${b + 1} starts at rank ${laterMin}, not above band ${b}'s maximum ${earlierMax}`);
  }
  return { distinct: seqs.size, slots: words.length, maxRank: Math.max(...ranks) };
}
/** A4: every ent_seq resolves in the shipped dict-v2 index or is flagged missing-at-base */
function checkResolution(manifest, indexSeqs) {
  const flagged = [], wrong = [];
  const check = (w, where) => {
    const inIndex = indexSeqs.has(w.seq);
    if (inIndex && w.missing_at_base) wrong.push(`${w.id} is in the index but flagged missing-at-base`);
    if (!inIndex && !w.missing_at_base) wrong.push(`${w.id} is not in the index and not flagged missing-at-base`);
    if (!inIndex && w.missing_at_base) flagged.push({ where, id: w.id, seq: w.seq });
  };
  for (const u of manifest.units.filter((x) => x.phase === 'situation-words')) for (const w of u.items) check(w, 'first_500');
  for (const w of manifest.words_next_500) check(w, 'words_next_500');
  if (wrong.length) throw new Error(`resolution: ${wrong.slice(0, 3).join('; ')}`);
  const listed = new Set(manifest.missing_at_base.map((m) => m.seq));
  for (const f of flagged) if (!listed.has(f.seq)) throw new Error(`resolution: ${f.id} flagged on the item but absent from the missing_at_base list`);
  return flagged;
}
/** A5: versioned, dated, draft marker, no freeze date, no hash */
function checkHeader(manifest) {
  assert.equal(manifest.manifest, 'beginner');
  assert.ok(Number.isInteger(manifest.version) && manifest.version >= 1, 'version is an integer >= 1');
  assert.match(manifest.drafted_at, /^\d{4}-\d{2}-\d{2}$/, 'drafted_at is an ISO date');
  assert.ok(!Number.isNaN(Date.parse(manifest.drafted_at)), 'drafted_at parses');
  assert.equal(manifest.frozen, false, 'draft marker frozen:false');
  assert.equal(manifest.freeze_date, null, 'no freeze date');
  assert.ok(!('hash' in manifest), 'no hash: MF2 alone sets it');
  assert.equal(manifest.unit_count, manifest.units.length, 'unit_count matches');
}
/** A6: words_next_500, positions 501–1000, each planned or built */
function checkNext500(manifest) {
  const rows = manifest.words_next_500;
  assert.equal(rows.length, 500, 'exactly 500 rows');
  const first = new Set(manifest.units.filter((u) => u.phase === 'situation-words').flatMap((u) => u.items.map((i) => i.seq)));
  rows.forEach((r, i) => {
    assert.equal(r.position, 501 + i, `position ${501 + i}`);
    if (!['planned', 'built'].includes(r.status)) throw new Error(`next500: ${r.id} status ${r.status}`);
    assert.equal(r.id, entryId({ seq: r.seq, spelling: r.spelling, reading: r.reading }), `next500 id ${r.id} is the G9 entryId`);
    if (first.has(r.seq)) throw new Error(`next500: ${r.id} is already in the first 500`);
  });
  assert.equal(new Set(rows.map((r) => r.seq)).size, 500, 'next 500 distinct');
}
/** A7: exactly one fenced ```json block, labelled manifest, parses, deep-equals units.json */
function extractBlock(md) {
  const fences = [...md.matchAll(/^```([^\n]*)\n([\s\S]*?)\n```[ \t]*$/gmu)];
  const json = fences.filter((m) => m[1].trim().split(/\s+/)[0] === 'json');
  if (json.length === 0) throw new Error('fenced block: MANIFEST.md has no ```json block');
  if (json.length > 1) throw new Error(`fenced block: MANIFEST.md has ${json.length} json blocks, expected exactly one`);
  if (json[0][1].trim() !== 'json manifest') throw new Error(`fenced block: info string is ${JSON.stringify(json[0][1])}, expected "json manifest"`);
  let parsed;
  try { parsed = JSON.parse(json[0][2]); } catch (e) { throw new Error(`fenced block: does not parse: ${e.message}`); }
  return parsed;
}
function deepDiff(a, b, path = '$') {
  if (a === b) return null;
  const ta = typeOf(a), tb = typeOf(b);
  if (ta !== tb) return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  if (ta === 'array') {
    if (a.length !== b.length) return `${path}: length ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) { const d = deepDiff(a[i], b[i], `${path}[${i}]`); if (d) return d; }
    return null;
  }
  if (ta === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a)) return `${path}.${k}: missing in units.json`;
      if (!(k in b)) return `${path}.${k}: missing in the fenced block`;
      const d = deepDiff(a[k], b[k], `${path}.${k}`); if (d) return d;
    }
    return null;
  }
  return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
}
function checkBlockEquals(unitsJson, md) {
  const block = extractBlock(md);
  const d = deepDiff(unitsJson, block);
  if (d) throw new Error(`fenced block differs from units.json at ${d}`);
}
/** A1: the sequence document lists the unit order of units.json and states the tolerance band and grouping rule */
function checkSequenceDoc(manifest, doc) {
  const docIds = [...new Set([...doc.matchAll(/unit:beginner:(?:kana|phrases|words|reading):[a-z0-9-]+/g)].map((m) => m[0]))];
  assert.deepEqual(docIds, manifest.units.map((u) => u.id), 'BEGINNER-SEQUENCE.md names the units in the manifest order');
  for (const key of ['tolerance', 'grouping']) {
    const statement = manifest.word_selection[key].statement;
    if (!doc.includes(statement)) throw new Error(`sequence doc: the ${key} statement of units.json is not written in BEGINNER-SEQUENCE.md`);
  }
  if (!doc.includes(manifest.frequency_source.pinned_inputs.combined_sha256)) throw new Error('sequence doc: frequency source sha256 not written');
  if (!doc.includes(manifest.frequency_source.name)) throw new Error('sequence doc: frequency source name not written');
}

// ---------------------------------------------------------------- the real files
const manifest = readJson(paths.units);
const schema = readJson(paths.schema);
const manifestMd = readFileSync(paths.manifestMd, 'utf8');
const sequenceMd = readFileSync(paths.sequenceMd, 'utf8');
const indexSeqs = new Set(readJson(paths.index).entries.map((r) => r[0]));

test('A1 phase order: kana-and-sound, survival-phrases (audio slots), situation-words, guided-reading; sequence doc agrees', (t) => {
  assert.ok(existsSync(paths.sequenceMd), 'docs/curriculum/BEGINNER-SEQUENCE.md exists');
  checkPhaseOrder(manifest);
  checkItems(manifest);
  checkSequenceDoc(manifest, sequenceMd);
  const counts = Object.fromEntries(PHASES.map((p) => [p, manifest.units.filter((u) => u.phase === p).length]));
  t.diagnostic(`units by phase: ${JSON.stringify(counts)}`);
});

test('A2 every unit: id, phase, can-do outcomes, prerequisites to earlier units, review obligations and assessments with check types and covered ids', (t) => {
  checkSchema(manifest, schema);
  checkPrerequisites(manifest);
  checkCoverage(manifest);
  t.diagnostic(`${manifest.units.length} units validated against unit.schema.json`);
});

test('A3 word units: >= 500 distinct ent_seq, each with rank from the pinned frequency source and a situation; ranks non-decreasing within the tolerance band', (t) => {
  const r = checkWords(manifest);
  t.diagnostic(`distinct ent_seq ${r.distinct} in ${r.slots} slots, highest rank ${r.maxRank}, tolerance ${manifest.word_selection.tolerance.ranks} ranks, observed max dip ${manifest.word_selection.tolerance.observed_max_dip}`);
  t.diagnostic(`frequency source: ${manifest.frequency_source.name} (${manifest.frequency_source.pinned_inputs.combined_sha256.slice(0, 16)}…)`);
});

test('A4 every ent_seq resolves in the shipped dict-v2 index or is flagged missing-at-base (count printed)', (t) => {
  assert.equal(indexSeqs.size, 70181, 'dict-v2 index breadth at base');
  const flagged = checkResolution(manifest, indexSeqs);
  const first = flagged.filter((f) => f.where === 'first_500').length;
  const next = flagged.filter((f) => f.where === 'words_next_500').length;
  const line = `missing-at-base flagged for L2.1: ${flagged.length} (first 500: ${first}; next 500: ${next}) → ${flagged.map((f) => f.id).join(', ') || 'none'}`;
  t.diagnostic(line);
  console.log(line);
});

test('the assessment check vocabulary is the identity contract\'s modality set', () => {
  const base = { entry: 'entry:1:a|b', reading: 'reading:a|b', sense: 'entry:1:a|b#s1' };
  for (const m of MODALITIES) assert.doesNotThrow(() => taskId({ ...base, modality: m }), `${m} is a G9 modality`);
  assert.throws(() => taskId({ ...base, modality: 'quiz' }), /modality is required/);
  assert.deepEqual(manifest.identity_contract.assessment_check_vocabulary, MODALITIES, 'header restates the vocabulary');
});

test('A5 header: version >= 1, ISO drafted_at, frozen:false, no freeze date, no hash', () => {
  checkHeader(manifest);
});

test('A6 words_next_500: positions 501–1000, each marked planned or built', (t) => {
  checkNext500(manifest);
  const built = manifest.words_next_500.filter((r) => r.status === 'built').length;
  t.diagnostic(`next 500: ${built} built, ${500 - built} planned`);
});

test('A7 MANIFEST.md: exactly one fenced json block labelled manifest, parses, deep-equals units.json', () => {
  checkBlockEquals(manifest, manifestMd);
});

// ---------------------------------------------------------------- negative controls on in-memory mutants
const wordUnitIndex = manifest.units.findIndex((u) => u.phase === 'situation-words');

test('negative control: a unit with assessments[] emptied goes red naming the unit id', () => {
  const m = clone(manifest);
  const victim = m.units[wordUnitIndex + 1];
  victim.assessments = [];
  assert.throws(() => checkSchema(m, schema), new RegExp(`unit ${victim.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} invalid.*assessments`));
  assert.throws(() => checkCoverage(m), new RegExp(victim.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('negative control: a prerequisite that does not resolve goes red', () => {
  const m = clone(manifest);
  m.units[3].prerequisites = ['unit:beginner:kana:99-does-not-exist'];
  assert.throws(() => checkPrerequisites(m), /requires unit:beginner:kana:99-does-not-exist, which is not an earlier unit/);
  const later = clone(manifest);
  later.units[2].prerequisites = [manifest.units[5].id];
  assert.throws(() => checkPrerequisites(later), /not an earlier unit/);
});

test('negative control: an outcome changed in the fenced block goes red naming the difference', () => {
  const original = manifest.units[0].outcomes[0];
  const mutated = manifestMd.replace(JSON.stringify(original), JSON.stringify('I cannot read anything yet.'));
  assert.notEqual(mutated, manifestMd, 'the plant changed the block');
  assert.throws(() => checkBlockEquals(manifest, mutated), /fenced block differs from units.json at \$\.units\[0\]\.outcomes\[0\]: .*I can .* vs .*I cannot/);
});

test('negative control: a block that differs by one header field goes red naming the field', () => {
  const mutated = manifestMd.replace('"frozen": false', '"frozen": true');
  assert.throws(() => checkBlockEquals(manifest, mutated), /\$\.frozen: false vs true/);
});

test('negative control: fence removed goes red', () => {
  const noFence = manifestMd.replace('```json manifest\n', '').replace(/\n```[ \t]*\n?$/u, '\n');
  assert.throws(() => checkBlockEquals(manifest, noFence), /no ```json block/);
});

test('negative control: two json blocks, or a block that does not parse, go red', () => {
  assert.throws(() => checkBlockEquals(manifest, `${manifestMd}\n\`\`\`json\n{"second": true}\n\`\`\`\n`), /2 json blocks/);
  assert.throws(() => checkBlockEquals(manifest, manifestMd.replace('"manifest": "beginner",', '"manifest": "beginner",,')), /does not parse/);
});

test('negative control: a guided-reading unit placed before a word unit breaks the phase order', () => {
  const m = clone(manifest);
  const reading = m.units.findIndex((u) => u.phase === 'guided-reading');
  const [moved] = m.units.splice(reading, 1);
  m.units.splice(wordUnitIndex, 0, moved);
  assert.throws(() => checkPhaseOrder(m), /phase order: .*situation-words.*after a guided-reading unit/);
});

test('negative control: a clip id in an audio slot, a word id off the identity contract, or a word without a rank go red', () => {
  const m = clone(manifest);
  m.units[wordUnitIndex].items[0].audio_slot.clip = 'clip:kore:0001';
  assert.throws(() => checkItems(m), /carries a clip/);
  const m2 = clone(manifest);
  m2.units[wordUnitIndex].items[0].id = 'word:1157170';
  assert.throws(() => checkItems(m2), /G9 entryId/);
  const m3 = clone(manifest);
  m3.units[wordUnitIndex].items[0].rank = null;
  assert.throws(() => checkWords(m3), /has no frequency rank/);
});

test('negative control: an ent_seq absent from the index and not flagged goes red; a flagged one that is present goes red', () => {
  const m = clone(manifest);
  m.units[wordUnitIndex].items[0].seq = '9999999';
  m.units[wordUnitIndex].items[0].missing_at_base = false;
  assert.throws(() => checkResolution(m, indexSeqs), /not in the index and not flagged/);
  const m2 = clone(manifest);
  m2.units[wordUnitIndex].items[1].missing_at_base = true;
  assert.throws(() => checkResolution(m2, indexSeqs), /in the index but flagged/);
});

test('negative control: a frozen header, a freeze date or a hash in the draft goes red', () => {
  assert.throws(() => checkHeader({ ...clone(manifest), frozen: true }), /frozen:false/);
  assert.throws(() => checkHeader({ ...clone(manifest), freeze_date: '2026-11-08' }), /no freeze date/);
  assert.throws(() => checkHeader({ ...clone(manifest), hash: 'deadbeef' }), /no hash/);
  assert.throws(() => checkSchema({ ...clone(manifest), hash: 'deadbeef' }, schema), /forbidden schema/);
});

test('negative control: a word placed a whole band too early breaks the tolerance band', () => {
  const m = clone(manifest);
  const units = m.units.filter((u) => u.phase === 'situation-words');
  const last = units[units.length - 1];
  const early = units[0].items[0];
  last.items.push({ ...clone(early), rank: 1 });
  assert.throws(() => checkWords(m), /ranks below the running maximum/);
});
