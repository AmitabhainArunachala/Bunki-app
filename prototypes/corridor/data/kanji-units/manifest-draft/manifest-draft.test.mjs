/* Judge for the kanji unit manifest DRAFT half of L6.0 (S6-R10, S6-R14, S6-R15, S6-AC9).
 * Run from the repository root: node --test prototypes/corridor/data/kanji-units/manifest-draft/manifest-draft.test.mjs
 * Node standard library only. Negative controls run on in-memory copies or on temporary files outside the repo.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { extractManifest, fencedBlocks, canonicalJson, sha256Hex, INFO_STRING, ExtractError } from './extract-manifest.mjs';
import { validateManifest, cycleMembers } from './manifest-schema.mjs';
import { loadDraftInputs, buildManifest } from './build-manifest-draft.mjs';
import { joyoMembership, teachingSet, GRADES_THROUGH_2, REPO_ROOT } from '../../kanken/inventory/build-inventory.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(HERE, 'MANIFEST-DRAFT.md');
const EXTRACTOR = resolve(HERE, 'extract-manifest.mjs');
const markdown = readFileSync(MANIFEST_PATH, 'utf8');
const draft = JSON.parse(readFileSync(resolve(HERE, 'DRAFT.json'), 'utf8'));
const gaps = JSON.parse(readFileSync(resolve(HERE, '../../kanken/inventory/gaps.json'), 'utf8'));
const extracted = extractManifest(markdown);
const manifest = extracted.value;
const inputs = loadDraftInputs();
const course = inputs.course;
const kanji = inputs.kanjiJson.kanji;
const clone = (value) => JSON.parse(JSON.stringify(value));
const block = () => { const b = fencedBlocks(markdown).find((x) => x.info === INFO_STRING); return markdown.split(/\r?\n/).slice(b.start, b.end + 1).join('\n'); };
const runExtractor = (text) => {
  const dir = mkdtempSync(join(tmpdir(), 'l6-manifest-'));
  const file = join(dir, 'MUTANT.md');
  writeFileSync(file, text);
  return spawnSync(process.execPath, [EXTRACTOR, file, '--hash'], { encoding: 'utf8' });
};
const jouyou = new Set(inputs.rows.filter((r) => r.form === '親字' && GRADES_THROUGH_2.includes(r.kanken_level)).map((r) => r.glyph));

/** DRAFT.json must record the sha256 of the block's canonical JSON for this exact content and version. */
function checkDraftHash(value, draftValue) {
  const canonical = canonicalJson(value);
  const hash = sha256Hex(canonical);
  if (hash !== draftValue.canonical_json.sha256) throw new Error(`DRAFT.json sha256 ${draftValue.canonical_json.sha256} does not match the block's canonical JSON ${hash} (content changed without a new version and hash)`);
  if (value.version !== draftValue.version) throw new Error('DRAFT.json version differs from the block');
  if (value.draft_date !== draftValue.draft_date) throw new Error('DRAFT.json draft_date differs from the block');
  return hash;
}

/** Every reading, keyword, compound, distinction and template in the block traces to its pinned source. Throws naming the item. */
function checkProvenance(value) {
  const joyoOn = new Map(inputs.referenceExtra.joyoOn.map((r) => [r[0], r[1]]));
  const joyoKun = new Map(inputs.referenceExtra.joyoKun.map((r) => [r[0], r[1]]));
  const records = new Map(inputs.referenceExtra.kanjiRecords.map((r) => [r[0], r[1]]));
  const words = inputs.words.words;
  const courseUnits = new Map(course.listUnits().map((u) => [u.id, u]));
  const strokes = inputs.strokesJson.strokes;
  const graph = new Set(inputs.partsGraph.parts.filter((p) => Array.isArray(p.paths) && p.paths.length).map((p) => p.literal));
  for (const unit of value.units) {
    const courseUnit = unit.status === 'authored' ? courseUnits.get(unit.id) : null;
    if (unit.status === 'authored' && !courseUnit) throw new Error(`${unit.id}: claims authored but kanji-course.js has no such unit`);
    for (const e of unit.kanji) {
      const g = e.glyph;
      if (JSON.stringify(e.on) !== JSON.stringify(joyoOn.get(g) || []) || JSON.stringify(e.kun) !== JSON.stringify(joyoKun.get(g) || [])) throw new Error(`${unit.id} ${g}: on/kun differ from the 常用漢字表 lists`);
      const target = courseUnit ? courseUnit.targets.find((t) => t.kanji === g) : null;
      if (courseUnit && !target) throw new Error(`${unit.id} ${g}: not a target of the authored unit`);
      if (e.keyword_source === 'kanji.json' && e.keyword !== kanji[g]?.m) throw new Error(`${unit.id} ${g}: keyword differs from kanji.json`);
      if (e.keyword_source === 'kanjiRecords' && e.keyword !== records.get(g)?.[0]) throw new Error(`${unit.id} ${g}: keyword differs from kanjiRecords`);
      if (e.keyword_source === 'course' && e.keyword !== target?.meaning) throw new Error(`${unit.id} ${g}: keyword differs from the course target`);
      if (!['kanji.json', 'kanjiRecords', 'course'].includes(e.keyword_source)) throw new Error(`${unit.id} ${g}: unknown keyword source`);
      for (const c of e.compounds) {
        if (c.source === 'words.json') {
          const w = words[c.word];
          if (!w || w.r !== c.reading || w.g !== c.gloss || !w.k.includes(g)) throw new Error(`${unit.id} ${g}: compound ${c.word}（${c.reading}） is not attested in words.json (fabricated compound)`);
        } else if (c.source === 'course') {
          if (!target || target.wordKey !== c.word || target.readings[0] !== c.reading || target.wordMeaning !== c.gloss) throw new Error(`${unit.id} ${g}: compound ${c.word} is not the course target word`);
        } else if (c.source === 'course-example') {
          if (!target || !(target.examples || []).some((x) => x.wordKey === c.word && x.readings[0] === c.reading && x.wordMeaning === c.gloss)) throw new Error(`${unit.id} ${g}: compound ${c.word} is not a course example`);
        } else throw new Error(`${unit.id} ${g}: unknown compound source ${c.source}`);
      }
      if (courseUnit) {
        if (JSON.stringify(e.distinctions) !== JSON.stringify(target.distractors)) throw new Error(`${unit.id} ${g}: distinctions differ from the authored distractors`);
      } else for (const d of e.distinctions) {
        if (d === g || !jouyou.has(d)) throw new Error(`${unit.id} ${g}: distinction ${d} is not another 常用 kanji`);
        const a = kanji[g], b = kanji[d];
        const shared = a && b && ((a.parts || []).some((p) => (b.parts || []).includes(p)) || (a.rad === b.rad && a.st === b.st));
        if (!shared) throw new Error(`${unit.id} ${g}: distinction ${d} shares no kanji.json part or radical+stroke count`);
      }
      const w = e.writing;
      if (w.template === 'strokes.json' && !(Array.isArray(strokes[g]) && strokes[g].length)) throw new Error(`${unit.id} ${g}: template strokes.json claimed but absent`);
      if (w.template === 'parts-graph' && !graph.has(g)) throw new Error(`${unit.id} ${g}: template parts-graph claimed but absent`);
      if (w.template === null && (strokes[g] || graph.has(g))) throw new Error(`${unit.id} ${g}: a template exists but none is recorded`);
      if (![null, 'strokes.json', 'parts-graph'].includes(w.template)) throw new Error(`${unit.id} ${g}: unknown template source`);
      if (kanji[g] && w.strokes !== kanji[g].st) throw new Error(`${unit.id} ${g}: stroke count differs from kanji.json`);
      if (kanji[g] && JSON.stringify(w.parts) !== JSON.stringify(kanji[g].parts)) throw new Error(`${unit.id} ${g}: parts differ from kanji.json`);
    }
    if (courseUnit) {
      if (JSON.stringify(unit.kanji.map((e) => e.glyph)) !== JSON.stringify(courseUnit.targets.map((t) => t.kanji))) throw new Error(`${unit.id}: kanji differ from the authored unit`);
      if (JSON.stringify(unit.prerequisites) !== JSON.stringify(courseUnit.prerequisites)) throw new Error(`${unit.id}: prerequisites differ from the authored unit`);
      if (unit.source?.unit_revision !== courseUnit.revision) throw new Error(`${unit.id}: unit revision differs from the authored unit`);
    }
  }
}

test('A6 exactly one fenced block with info string json kanji-unit-manifest; it parses; version is an integer; draft_date is an ISO date from the injected clock; DRAFT.json carries the sha256 of its canonical JSON', () => {
  const blocks = fencedBlocks(markdown);
  assert.equal(blocks.filter((b) => b.info === INFO_STRING).length, 1);
  assert.equal(blocks.length, 1, 'the draft keeps no other fenced block, so the freeze cannot pick a wrong one');
  assert.ok(Number.isInteger(manifest.version) && manifest.version >= 1);
  assert.match(manifest.draft_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(manifest.draft_date + 'T00:00:00Z').toISOString().slice(0, 10), manifest.draft_date);
  assert.match(manifest.clock, /injected/);
  assert.ok(Array.isArray(manifest.units) && manifest.units.length > 0);
  assert.equal(manifest.frozen, false);
  assert.equal(manifest.freeze_date, null);
  assert.equal(draft.frozen, false);
  assert.equal(draft.block_info_string, INFO_STRING);
  assert.equal(draft.manifest_path, 'prototypes/corridor/data/kanji-units/manifest-draft/MANIFEST-DRAFT.md');
  assert.equal(draft.canonical_json.rule, 'object keys sorted recursively, arrays in order, no whitespace, UTF-8');
  assert.equal(checkDraftHash(manifest, draft), extracted.sha256);
  assert.equal(draft.canonical_json.bytes, extracted.canonical_bytes);
  assert.equal(draft.unit_count, manifest.units.length);
  assert.equal(draft.kanji_count, manifest.units.reduce((s, u) => s + u.kanji.length, 0));
  const canonical = canonicalJson(manifest);
  assert.equal(canonical, canonicalJson(JSON.parse(canonical)), 'canonical form is a fixed point');
  assert.ok(canonical.indexOf('"author"') < canonical.indexOf('"units"'), 'keys are sorted');
  const cli = spawnSync(process.execPath, [EXTRACTOR, MANIFEST_PATH, '--hash'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout.trim(), draft.canonical_json.sha256);
});

test('A6 negative controls: zero blocks, two blocks or invalid JSON make the extractor throw and the CLI exit non-zero', () => {
  const theBlock = block();
  const two = markdown + '\n' + theBlock + '\n';
  const none = markdown.replace('```' + INFO_STRING, '```json something-else');
  const invalid = markdown.replace('```' + INFO_STRING + '\n{', '```' + INFO_STRING + '\n{ not json');
  for (const [name, text, code] of [['two blocks', two, 'many-blocks'], ['zero blocks', none, 'no-block'], ['invalid JSON', invalid, 'invalid-json']]) {
    assert.throws(() => extractManifest(text), (error) => error instanceof ExtractError && error.code === code, name);
    const cli = runExtractor(text);
    assert.notEqual(cli.status, 0, `${name}: CLI exit`);
    assert.match(cli.stderr, /extract-manifest:/);
  }
  const unterminated = markdown.slice(0, markdown.lastIndexOf('```'));
  assert.throws(() => extractManifest(unterminated), (error) => error instanceof ExtractError);
});

test('A6 negative control: changing one unit without changing version and hash fails the check', () => {
  const mutant = clone(manifest);
  mutant.units[20].outcomes[0] += ' (changed)';
  assert.throws(() => checkDraftHash(mutant, draft), /does not match the block's canonical JSON/);
  const mutant2 = clone(manifest);
  mutant2.units[20].kanji[0].compounds = [];
  mutant2.units[20].kanji[0].compound_gap = 'planted';
  assert.throws(() => checkDraftHash(mutant2, draft), /does not match/);
  const bumped = clone(manifest);
  bumped.version += 1;
  assert.throws(() => checkDraftHash(bumped, draft), /does not match/);
});

test('A7 every unit lists id, wave, outcomes, prerequisites, kanji, readings, compounds, distinctions, writing, assessment and review obligations (family reviewer + native sample); prerequisites are acyclic', () => {
  assert.deepEqual(validateManifest(manifest), []);
  for (const u of manifest.units) {
    assert.equal(u.wave, 'wave1');
    assert.ok(u.prerequisites.length > 0 || u.entry === true, `${u.id}: a first unit or has prerequisites`);
    assert.ok(u.review_obligations.some((o) => o.reviewer === 'family') && u.review_obligations.some((o) => o.reviewer === 'native_sample'));
    assert.ok(u.review_obligations.find((o) => o.reviewer === 'native_sample').sample_rule.includes('5%'));
    assert.ok(u.outcomes.length >= 3);
    assert.match(u.assessment.writing, /self-comparison/);
    assert.match(u.assessment.writing, /never graded automatically|no automatic/);
  }
  assert.deepEqual(cycleMembers(manifest.units), []);
  const entries = manifest.units.filter((u) => u.entry === true).map((u) => u.id);
  assert.deepEqual(entries, course.listUnits().filter((u) => u.prerequisites.length === 0).map((u) => u.id), 'the only entry units are the authored course\'s own entry units');
  const ids = new Set(manifest.units.map((u) => u.id));
  const order = new Map(manifest.units.map((u, i) => [u.id, i]));
  for (const u of manifest.units) for (const p of u.prerequisites) { assert.ok(ids.has(p)); assert.ok(order.get(p) < order.get(u.id), `${u.id}: prerequisite ${p} is declared earlier`); }
  const planned = manifest.units.filter((u) => u.status === 'planned');
  assert.ok(planned.length > 0);
  for (const u of planned) assert.ok(u.kanji.length >= 10 && u.kanji.length <= 20, `${u.id}: ${u.kanji.length} kanji is roughly 10–20`);
});

test('A7 negative controls (graph controls on in-memory copies): a unit with no assessment, no review obligation, no wave marker, empty prerequisites on a non-first unit, a cycle, or a kanji in two units fails naming the unit', () => {
  const planted = manifest.units.find((u) => u.id === 'kj2-03').id;
  const without = (mutate) => { const m = clone(manifest); mutate(m, m.units.find((u) => u.id === planted)); return validateManifest(m); };
  let errors = without((m, u) => { delete u.assessment; });
  assert.ok(errors.some((e) => e.startsWith(`${planted}: `) && /assessment/.test(e)), JSON.stringify(errors));
  errors = without((m, u) => { delete u.review_obligations; });
  assert.ok(errors.some((e) => e.startsWith(`${planted}: `) && /review obligations/.test(e)));
  errors = without((m, u) => { u.review_obligations = u.review_obligations.filter((o) => o.reviewer !== 'native_sample'); });
  assert.ok(errors.some((e) => e.startsWith(`${planted}: `) && /native sample/.test(e)));
  errors = without((m, u) => { delete u.wave; });
  assert.ok(errors.some((e) => e.startsWith(`${planted}: `) && /wave marker/.test(e)));
  errors = without((m, u) => { u.prerequisites = []; });
  assert.ok(errors.some((e) => e.startsWith(`${planted}: `) && /not marked entry/.test(e)));
  errors = without((m, u) => { u.prerequisites = ['kj2-04']; });
  assert.ok(errors.some((e) => /not acyclic/.test(e) && e.includes(planted) && e.includes('kj2-04')));
  errors = without((m, u) => { u.outcomes = []; });
  assert.ok(errors.some((e) => e.startsWith(`${planted}: `) && /outcomes/.test(e)));
  errors = without((m, u) => { u.kanji.push(clone(m.units[0].kanji[0])); });
  assert.ok(errors.some((e) => e.includes(`${m0()} and ${planted}`) || /appears in two units/.test(e)));
  errors = without((m, u) => { u.prerequisites = ['nowhere']; });
  assert.ok(errors.some((e) => e.startsWith(`${planted}: `) && /not a unit id/.test(e)));
  const bad = clone(manifest); bad.version = '1'; assert.ok(validateManifest(bad).some((e) => /version must be a positive integer/.test(e)));
  const bad2 = clone(manifest); bad2.draft_date = '2026-13-01'; assert.ok(validateManifest(bad2).some((e) => /draft_date/.test(e)));
  function m0() { return manifest.units[0].id; }
});

test('A8 every 常用 kanji 10級..2級 appears in exactly one unit of the block or in gaps.json with a reason; no kanji appears in two units (set check)', () => {
  const owner = new Map();
  for (const u of manifest.units) for (const e of u.kanji) {
    assert.ok(!owner.has(e.glyph), `${e.glyph} appears in ${owner.get(e.glyph)} and ${u.id}`);
    owner.set(e.glyph, u.id);
    assert.ok(jouyou.has(e.glyph), `${u.id} ${e.glyph}: a wave1 unit holds only 常用 kanji through 2級`);
    assert.equal(e.level, inputs.rows.find((r) => r.glyph === e.glyph && r.form === '親字' && GRADES_THROUGH_2.includes(r.kanken_level)).kanken_level, `${e.glyph}: level is the graded 親字 row (芸 also has a 1級 元の芸 headword row)`);
  }
  const inGaps = new Map(gaps.grades.flatMap((g) => g.uncovered).map((u) => [u.glyph, u.reason]));
  for (const g of jouyou) assert.ok(owner.has(g) || (inGaps.has(g) && inGaps.get(g).trim()), `${g}: in a unit or in gaps.json with a reason`);
  assert.equal(owner.size, jouyou.size, 'this draft places every 常用 kanji through 2級 in a unit');
  assert.equal(manifest.kanji_count, jouyou.size);
  assert.equal(manifest.distinct_kanji, jouyou.size);
  const taught = teachingSet(course).glyphs;
  for (const g of taught) assert.equal(manifest.units.find((u) => u.id === owner.get(g)).status, 'authored', `${g} is in an authored unit`);
  assert.equal(joyoMembership(inputs.referenceExtra).glyphs.size, jouyou.size);
});

test('A9 X17: the frequency source is recorded absent, so the first 準1級/1級 units are a stated blocker with zero kanken-wave units; a substituted count fails', () => {
  assert.equal(manifest.frequency_source, null);
  assert.equal(manifest.kanken_first_units.status, 'blocked');
  assert.match(manifest.kanken_first_units.blocker, /X17/);
  assert.match(manifest.kanken_first_units.blocker, /no other count is substituted/);
  assert.match(manifest.kanken_first_units.rule, /two units of 10 kanji/);
  assert.equal(manifest.units.filter((u) => u.wave === 'kanken').length, 0);
  assert.equal(manifest.kanken_first_units.kanken_units_in_this_draft, 0);
  assert.equal(draft.kanken_first_units_status, 'blocked');
  assert.equal(draft.frequency_source, null);
  for (const grade of ['準1級', '1級']) assert.deepEqual(manifest.kanken_first_units.candidate_pool[grade].units_required, 2);
  assert.ok(markdown.includes('First 準1級 / 1級 units: blocked'));
  const mutant = clone(manifest);
  const fake = clone(mutant.units.find((u) => u.id === 'k2-01'));
  fake.id = 'kanken-j1-01'; fake.wave = 'kanken'; fake.level = '準1級'; fake.prerequisites = ['k2-01']; fake.kanji = fake.kanji.slice(0, 10);
  mutant.units.push(fake); mutant.unit_count += 1;
  const errors = validateManifest(mutant);
  assert.ok(errors.some((e) => e.startsWith('kanken-j1-01: ') && /no frequency source is recorded/.test(e)), JSON.stringify(errors));
  const mutant2 = clone(manifest);
  mutant2.frequency_source = { name: 'planted', version: '1' };
  assert.ok(validateManifest(mutant2).some((e) => /name, version and a 64-hex sha256/.test(e)));
  const mutant3 = clone(manifest);
  mutant3.kanken_first_units.status = 'drafted';
  assert.ok(validateManifest(mutant3).some((e) => /status blocked/.test(e)));
});

test('provenance: readings are the 常用漢字表 lists, compounds are attested, distinctions share a sourced part, templates exist, authored units equal the course', () => {
  checkProvenance(manifest);
  const authored = manifest.units.filter((u) => u.status === 'authored');
  assert.deepEqual(authored.map((u) => u.id), course.listUnits().map((u) => u.id));
  assert.equal(manifest.teaching_source.distinct_kanji, teachingSet(course).glyphs.size);
  assert.equal(manifest.teaching_source.units, course.listUnits().length);
  assert.equal(manifest.teaching_source.course_id, course.catalog().id);
  const compoundGaps = manifest.units.reduce((s, u) => s + u.compounds.gaps.length, 0);
  assert.ok(compoundGaps > 0, 'the draft names the kanji with no attested compound instead of inventing one');
  for (const u of manifest.units) {
    assert.deepEqual(u.compounds.gaps, u.kanji.filter((e) => !e.compounds.length).map((e) => e.glyph));
    assert.deepEqual(u.writing.without_template, u.kanji.filter((e) => !e.writing.template).map((e) => e.glyph));
    for (const e of u.kanji) if (!e.compounds.length) assert.match(e.compound_gap, /native sample/);
  }
});

test('provenance negative control: a fabricated compound or a wrong reading list fails naming the item', () => {
  const mutant = clone(manifest);
  const e = mutant.units.find((u) => u.id === 'kj2-03').kanji[0];
  e.compounds.push({ word: '剰余金', reading: 'じょうよきん', gloss: 'surplus funds', source: 'words.json', bounded: true });
  assert.throws(() => checkProvenance(mutant), /kj2-03 剰: compound 剰余金（じょうよきん） is not attested in words.json \(fabricated compound\)/);
  const mutant2 = clone(manifest);
  mutant2.units.find((u) => u.id === 'kj2-03').kanji[0].on = ['ジョウ', 'セイ'];
  assert.throws(() => checkProvenance(mutant2), /kj2-03 剰: on\/kun differ from the 常用漢字表 lists/);
  const mutant3 = clone(manifest);
  mutant3.units.find((u) => u.id === 'kj2-03').kanji[0].distinctions = ['一'];
  assert.throws(() => checkProvenance(mutant3), /distinction 一 shares no kanji.json part/);
  const mutant4 = clone(manifest);
  mutant4.units[0].status = 'planned'; mutant4.units[0].id = 'renamed';
  for (const u of mutant4.units) u.prerequisites = u.prerequisites.map((p) => (p === 'shapes' ? 'renamed' : p));
  const mutant5 = clone(manifest);
  mutant5.units[0].kanji[0].writing.template = null;
  assert.throws(() => checkProvenance(mutant5), /a template exists but none is recorded/);
});

test('the block equals a fresh build from the pinned inputs with the same injected date and version (generated, never hand-typed)', () => {
  const rebuilt = buildManifest(inputs, { date: manifest.draft_date, version: manifest.version });
  assert.equal(canonicalJson(rebuilt), extracted.canonical);
  assert.throws(() => buildManifest(inputs, { date: undefined }), /injected --date/);
});
