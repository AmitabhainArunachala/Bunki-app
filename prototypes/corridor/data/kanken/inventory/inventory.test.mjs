/* Judge for the Kanken inventory half of L6.0 (S6-R4, S6-R10, S6-AC3, S6-DD3, S2-R20, S2-DD7).
 * Run from the repository root: node --test prototypes/corridor/data/kanken/inventory/inventory.test.mjs
 * Node standard library only. Negative controls run on in-memory copies or on fixtures/, never on the real outputs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { loadInputs, buildInventory, parseJsonl, joyoMembership, teachingSet, glyphFields, GRADES_THROUGH_2, UPPER_GRADES, LEVEL_ORDER, REPO_ROOT, PATHS } from './build-inventory.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const inventory = readJson(resolve(HERE, 'inventory.json'));
const gaps = readJson(resolve(HERE, 'gaps.json'));
const reconcile = readJson(resolve(HERE, 'reconcile.json'));
const doc = readFileSync(resolve(REPO_ROOT, 'docs/kanji/KANKEN-INVENTORY.md'), 'utf8');
const inputs = loadInputs();
const fresh = buildInventory(inputs);
const rows = inputs.rows;
const course = inputs.course;
const kanji = inputs.kanjiJson.kanji;

// The contract's pinned expectation for the base file (A1). inventory.json must reach these by counting the file, never by copying them.
const EXPECTED_LEVEL_ROWS = { '10級': 80, '9級': 160, '8級': 200, '7級': 202, '6級': 193, '5級': 191, '4級': 313, '3級': 284, '準2級': 328, '2級': 185, '準1級': 858, '1級': 2675, '1/準1級': 644, '配当外': 474 };
const EXPECTED_TOTAL = 6787;
const EXPECTED_JOUYOU = 2136;
const EXPECTED_MISSING_IN_KANKEN_JSON = ['𠮟', '剝'];
const EXPECTED_ABSENT_AS_OYAJI = 32;
const EXPECTED_ABSENT_EXAMPLES = ['丗', '伜', '兒', '冉', '冓', '參', '叱', '呑', '嘘'];

const jouyouSet = () => new Set(rows.filter((r) => r.form === '親字' && GRADES_THROUGH_2.includes(r.kanken_level)).map((r) => r.glyph));
const levelGlyphs = (level) => new Set(rows.filter((r) => r.kanken_level === level && r.glyph !== '').map((r) => r.glyph));

/** Teaching-coverage consistency: gaps.json must be exactly 常用 minus the course's targets, per grade. Throws naming the glyph. */
function checkGaps(gapsValue, taught) {
  for (const grade of gapsValue.grades) {
    const expected = rows.filter((r) => r.kanken_level === grade.level && r.form === '親字').map((r) => r.glyph);
    const listed = new Set(grade.uncovered.map((u) => u.glyph));
    for (const g of expected) {
      if (taught.has(g) && listed.has(g)) throw new Error(`${grade.level}: ${g} is taught by the course but listed as a gap`);
      if (!taught.has(g) && !listed.has(g)) throw new Error(`${grade.level}: ${g} is not taught by the course yet missing from gaps.json (a reference-only entry labelled taught)`);
    }
    for (const u of grade.uncovered) {
      if (typeof u.reason !== 'string' || !u.reason.trim()) throw new Error(`${grade.level}: ${u.glyph} has no reason`);
      if (!expected.includes(u.glyph)) throw new Error(`${grade.level}: ${u.glyph} is not a 親字 of this grade`);
    }
    if (grade.uncovered_count !== grade.uncovered.length || grade.taught + grade.uncovered_count !== grade.total || grade.total !== expected.length) throw new Error(`${grade.level}: counts disagree`);
  }
}

/** Every related-teaching link must point at a course unit that really teaches `via`, related to the glyph through kanji.json parts. */
function checkRelatedTeaching(gapsValue, courseValue) {
  const units = new Map(courseValue.listUnits().map((u) => [u.id, new Set(u.targets.map((t) => t.kanji))]));
  for (const grade of gapsValue.grades) for (const u of grade.uncovered) for (const link of u.related_teaching) {
    if (!units.has(link.unit)) throw new Error(`${u.glyph}: link to unit ${link.unit} which kanji-course.js does not have (fabricated teaching link)`);
    if (!units.get(link.unit).has(link.via)) throw new Error(`${u.glyph}: unit ${link.unit} does not teach ${link.via} (fabricated teaching link)`);
    const forward = (kanji[u.glyph]?.parts || []).includes(link.via);
    const backward = (kanji[link.via]?.parts || []).includes(u.glyph);
    if (!forward && !backward) throw new Error(`${u.glyph}: no kanji.json parts relation to ${link.via} (fabricated teaching link)`);
  }
}

/** Completeness rows must account for every glyph: a missing required field cannot hide behind the entry total. */
function checkCompleteness(inventoryValue) {
  for (const c of inventoryValue.completeness) {
    if (c.glyph_entries + c.glyphless_entries !== c.entries) throw new Error(`${c.class}: glyph and glyphless entries do not sum to entries`);
    for (const f of ['reading', 'meaning', 'stroke_count', 'template']) if (c[f] > c.glyph_entries) throw new Error(`${c.class}: ${f} count exceeds glyph entries`);
    if (c.complete + c.missing.length !== c.glyph_entries) throw new Error(`${c.class}: complete (${c.complete}) + missing (${c.missing.length}) != glyph entries (${c.glyph_entries})`);
    for (const f of c.required) {
      const lacking = c.glyph_entries - c[f];
      const named = c.missing.filter((m) => m.missing.includes(f)).length;
      if (named !== lacking) throw new Error(`${c.class}: ${lacking} glyph entries lack required ${f} but ${named} are named in missing (hidden by the entry total)`);
    }
    if (c.incomplete !== c.missing.length + (c.required.length ? c.glyphless_entries : 0)) throw new Error(`${c.class}: incomplete count does not match`);
  }
}

test('A1 per-level row counts come from the file\'s own kanken_level and form fields and match the pinned expectation', () => {
  const counted = {};
  for (const r of rows) counted[r.kanken_level] = (counted[r.kanken_level] || 0) + 1;
  assert.equal(rows.length, EXPECTED_TOTAL);
  assert.equal(inventory.total_rows, rows.length);
  assert.deepEqual(Object.fromEntries(inventory.levels.map((l) => [l.level, l.rows])), counted);
  assert.deepEqual(counted, EXPECTED_LEVEL_ROWS);
  assert.equal(inventory.levels.reduce((s, l) => s + l.rows, 0), EXPECTED_TOTAL);
  assert.equal(inventory.levels_sum, EXPECTED_TOTAL);
  assert.deepEqual(inventory.levels.map((l) => l.level), LEVEL_ORDER);
  for (const l of inventory.levels) {
    const formCounts = {};
    for (const r of rows.filter((r) => r.kanken_level === l.level)) formCounts[r.form] = (formCounts[r.form] || 0) + 1;
    assert.deepEqual(l.forms, formCounts, `${l.level} forms`);
    assert.equal(l.distinct_glyphs, levelGlyphs(l.level).size, `${l.level} distinct glyphs`);
    assert.equal(l.glyphless_rows, rows.filter((r) => r.kanken_level === l.level && r.glyph === '').length);
  }
  assert.equal(inventory.distinct_glyphs_including_empty, new Set(rows.map((r) => r.glyph)).size);
  assert.equal(inventory.distinct_glyphs, new Set(rows.filter((r) => r.glyph).map((r) => r.glyph)).size);
  assert.equal(inventory.glyphless_rows, rows.filter((r) => r.glyph === '').length);
  assert.equal(inventory.sources.kanken_jsonl.path, PATHS.kankenJsonl);
});

test('committed inventory.json, gaps.json and reconcile.json equal a fresh build from the pinned inputs (derived, not edited)', () => {
  assert.deepEqual(inventory, fresh.inventory);
  assert.deepEqual(gaps, fresh.gaps);
  assert.deepEqual(reconcile, fresh.reconcile);
  for (const [key, pin] of Object.entries(inventory.sources)) assert.match(pin.sha256, /^[0-9a-f]{64}$/, key);
});

test('A2 親字 rows 10級..2級 are 2,136 distinct glyphs and match the 常用漢字表 membership (or every difference is in gaps.json)', () => {
  const set = jouyouSet();
  assert.equal(set.size, EXPECTED_JOUYOU);
  assert.equal(inventory.jouyou_rows_in_kanken, set.size);
  const joyo = joyoMembership(inputs.referenceExtra);
  assert.equal(joyo.source.name, inventory.jouyou_membership.source.name);
  assert.match(joyo.source.name, /^常用漢字表/);
  const jsonlOnly = [...set].filter((g) => !joyo.glyphs.has(g));
  const joyoOnly = [...joyo.glyphs].filter((g) => !set.has(g));
  assert.deepEqual(new Set(inventory.jouyou_membership.symmetric_difference.jsonl_only), new Set(jsonlOnly));
  assert.deepEqual(new Set(inventory.jouyou_membership.symmetric_difference.joyo_only), new Set(joyoOnly));
  const listed = new Set(gaps.jouyou_membership_gaps.map((g) => g.glyph));
  for (const g of [...jsonlOnly, ...joyoOnly]) assert.ok(listed.has(g), `${g} must be listed in gaps.json`);
  assert.ok(jsonlOnly.length + joyoOnly.length === 0 || listed.size > 0);
});

test('A3 reconciliation with kanken.json: 𠮟 and 剝 missing there; 32 glyphs absent from the jsonl as 親字 (0 under any form), each with its level; 0 level disagreements', () => {
  const kk = inputs.kankenJson.levels;
  assert.equal(Object.keys(kk).length, 2453);
  assert.equal(reconcile.kanken_json.glyphs, 2453);
  const missing = [...jouyouSet()].filter((g) => !(g in kk));
  assert.deepEqual(new Set(missing), new Set(EXPECTED_MISSING_IN_KANKEN_JSON));
  assert.deepEqual(new Set(reconcile.jsonl_oyaji_through_2kyu_missing_in_kanken_json.glyphs), new Set(EXPECTED_MISSING_IN_KANKEN_JSON));
  for (const d of reconcile.jsonl_oyaji_through_2kyu_missing_in_kanken_json.detail) {
    assert.equal(d.level, '2級');
    assert.ok(d.kanken_json_carries_same_species_variant.length >= 1, `${d.glyph}: kanken.json carries a same-species variant`);
  }
  const allGlyphs = new Set(rows.map((r) => r.glyph));
  const oyaji = new Set(rows.filter((r) => r.form === '親字').map((r) => r.glyph));
  const absentAny = Object.keys(kk).filter((g) => !allGlyphs.has(g));
  const absentOyaji = Object.keys(kk).filter((g) => !oyaji.has(g));
  assert.equal(absentAny.length, reconcile.kanken_json_absent_from_jsonl.any_form.count);
  assert.equal(absentOyaji.length, EXPECTED_ABSENT_AS_OYAJI);
  assert.equal(reconcile.kanken_json_absent_from_jsonl.as_oyaji.count, EXPECTED_ABSENT_AS_OYAJI);
  const listed = new Map(reconcile.kanken_json_absent_from_jsonl.as_oyaji.glyphs.map((g) => [g.glyph, g]));
  for (const g of EXPECTED_ABSENT_EXAMPLES) {
    assert.ok(listed.has(g), `${g} listed`);
    assert.equal(listed.get(g).kanken_json_level, kk[g].kk, `${g} carries its kanken.json level`);
    assert.ok(listed.get(g).jsonl_rows.length >= 1, `${g} names the jsonl rows that carry it under another form`);
  }
  for (const g of absentOyaji) assert.ok(listed.has(g));
  let disagreements = 0;
  for (const g of Object.keys(kk)) {
    const here = rows.filter((r) => r.glyph === g);
    if (here.length && !here.some((r) => r.kanken_level === kk[g].kk)) disagreements += 1;
  }
  assert.equal(disagreements, 0);
  assert.equal(reconcile.level_disagreements.count, 0);
  assert.equal(reconcile.level_disagreements.compared_glyphs, Object.keys(kk).filter((g) => allGlyphs.has(g)).length);
  assert.equal(reconcile.level_disagreements.oyaji_rows_only.count, 0);
  assert.equal(reconcile.rank_disagreements, 0);
});

test('A4 lookup_covered and teaching_covered stay separate; teaching derives from kanji-course.js', () => {
  const taught = teachingSet(course).glyphs;
  assert.equal(inventory.coverage.teaching_source.distinct_kanji, taught.size);
  assert.equal(inventory.coverage.teaching_source.units, course.listUnits().length);
  assert.equal(inventory.coverage.teaching_source.course_id, course.catalog().id);
  assert.deepEqual(inventory.coverage.teaching_source.counts, course.catalog().counts);
  for (const l of inventory.levels) {
    const glyphs = levelGlyphs(l.level);
    assert.equal(l.lookup_covered, [...glyphs].filter((g) => kanji[g]).length, `${l.level} lookup`);
    assert.equal(l.teaching_covered, [...glyphs].filter((g) => taught.has(g)).length, `${l.level} teaching`);
  }
  const set = jouyouSet();
  assert.equal(inventory.coverage.through_2kyu.teaching_covered, [...set].filter((g) => taught.has(g)).length);
  assert.equal(inventory.coverage.through_2kyu.lookup_covered, [...set].filter((g) => kanji[g]).length);
  assert.notEqual(inventory.coverage.through_2kyu.teaching_covered, inventory.coverage.through_2kyu.lookup_covered, 'lookup is not teaching');
  assert.ok(inventory.coverage.through_2kyu.lookup_covered > inventory.coverage.through_2kyu.teaching_covered);
  checkGaps(gaps, taught);
});

test('A4 negative control: a reference-only entry labelled taught fails', () => {
  const taught = teachingSet(course).glyphs;
  const mutant = clone(gaps);
  const grade = mutant.grades.find((g) => g.level === '2級');
  const removed = grade.uncovered.splice(0, 1)[0];
  assert.throws(() => checkGaps(mutant, taught), new RegExp(`${removed.glyph}.*labelled taught`));
  const mutant2 = clone(gaps);
  const g9 = mutant2.grades.find((g) => g.level === '9級');
  g9.uncovered.push({ glyph: '東', reason: 'planted', lookup_covered: true, template: true, related_teaching: [] });
  assert.throws(() => checkGaps(mutant2, taught), /東 is taught by the course but listed as a gap/);
});

test('A5 gaps.json lists every uncovered 10級..2級 kanji per grade with a reason; the S6-AC3 line prints real percentages', () => {
  assert.deepEqual(gaps.grades.map((g) => g.level), GRADES_THROUGH_2);
  const totalUncovered = gaps.grades.reduce((s, g) => s + g.uncovered_count, 0);
  assert.equal(gaps.through_2kyu.uncovered, totalUncovered);
  assert.equal(gaps.through_2kyu.total, EXPECTED_JOUYOU);
  assert.equal(gaps.through_2kyu.taught + gaps.through_2kyu.uncovered, gaps.through_2kyu.total);
  const line = inventory.report_lines['S6-AC3'];
  const m = /teaching coverage through 2級: (\d+)\/(\d+) \(([\d.]+)%\); 準1級: (\d+)\/(\d+) \(([\d.]+)%\); 1級: (\d+)\/(\d+) \(([\d.]+)%\)/.exec(line);
  assert.ok(m, `report line shape: ${line}`);
  assert.equal(Number(m[1]), gaps.through_2kyu.taught);
  assert.equal(Number(m[2]), EXPECTED_JOUYOU);
  assert.ok(Number(m[3]) < 100, 'honest: well under 100% at base');
  assert.equal(Number(m[3]), Math.round((Number(m[1]) / Number(m[2])) * 1000) / 10);
  for (const [level, offset] of [['準1級', 4], ['1級', 7]]) {
    const glyphs = new Set(rows.filter((r) => r.kanken_level === level && r.form === '親字' && r.glyph !== '').map((r) => r.glyph));
    assert.equal(Number(m[offset + 1]), glyphs.size, `${level} denominator from the file`);
    assert.equal(Number(m[offset]), inventory.coverage.upper[level].teaching_covered);
    assert.equal(gaps.upper[level].oyaji_glyphs, glyphs.size);
    assert.equal([...gaps.upper[level].uncovered_glyphs].length, glyphs.size - gaps.upper[level].teaching_covered);
  }
  assert.match(line, /not teaching coverage/);
  assert.equal(gaps.report_line, line);
  assert.ok(doc.includes(line), 'the Markdown report carries the same S6-AC3 line');
});

test('A10 completeness per entry class from pinned content, reported beside entry totals; entry presence alone satisfies nothing', () => {
  checkCompleteness(inventory);
  const fields = glyphFields(inputs);
  const classes = new Map(inventory.completeness.map((c) => [c.class, c]));
  for (const level of GRADES_THROUGH_2) {
    const c = classes.get(`${level}·親字`);
    assert.ok(c, `${level} 親字 class present`);
    assert.deepEqual(c.required, ['reading', 'meaning', 'template']);
    const glyphs = [...levelGlyphs(level)];
    assert.equal(c.glyph_entries, glyphs.length);
    assert.equal(c.reading, glyphs.filter((g) => fields.reading(g)).length);
    assert.equal(c.meaning, glyphs.filter((g) => fields.meaning(g)).length);
    assert.equal(c.template, glyphs.filter((g) => fields.template(g)).length);
    assert.equal(c.complete, glyphs.filter((g) => fields.reading(g) && fields.meaning(g) && fields.template(g)).length);
  }
  for (const level of UPPER_GRADES) {
    const c = classes.get(`${level}·親字`);
    assert.deepEqual(c.required, ['reading', 'meaning']);
    assert.ok(c.glyphless_entries > 0, `${level} has glyphless rows that can satisfy nothing`);
    assert.equal(c.incomplete, c.missing.length + c.glyphless_entries);
  }
  for (const c of inventory.completeness) if (!c.required.length) assert.match(c.role, /reference|outside/);
  assert.ok(inventory.completeness.some((c) => c.form === '旧字でない異体字'), 'variant classes are reported, not folded into headwords');
  assert.ok(inventory.completeness.every((c) => Number.isInteger(c.brush_outline_approved)));
});

test('A10 negative control: a missing class-required field hidden by full entry counts fails naming the class', () => {
  const mutant = clone(inventory);
  const c = mutant.completeness.find((x) => x.class === '2級·親字');
  c.reading -= 1;
  assert.throws(() => checkCompleteness(mutant), /2級·親字: 1 glyph entries lack required reading but 0 are named in missing/);
  const mutant2 = clone(inventory);
  const c2 = mutant2.completeness.find((x) => x.class === '1級·親字');
  c2.missing = [];
  assert.throws(() => checkCompleteness(mutant2), /1級·親字/);
});

test('A10 uncovered references link only to genuinely available related teaching', () => {
  checkRelatedTeaching(gaps, course);
  const withLinks = gaps.grades.flatMap((g) => g.uncovered).filter((u) => u.related_teaching.length);
  const without = gaps.grades.flatMap((g) => g.uncovered).filter((u) => !u.related_teaching.length);
  assert.ok(withLinks.length > 0 && without.length > 0);
  for (const u of without) assert.equal(u.related_teaching_note, 'no related authored teaching available');
  for (const u of gaps.grades.flatMap((g) => g.uncovered)) assert.ok(u.reason.includes('teaching gap'), `${u.glyph} names the teaching gap`);
});

test('A10 negative control: a fabricated teaching link fails', () => {
  const mutant = clone(gaps);
  const target = mutant.grades.find((g) => g.level === '10級').uncovered.find((u) => u.glyph === '円');
  assert.ok(target);
  target.related_teaching.push({ unit: 'shapes', via: '木', relation: 'component 木 of 円', source: 'kanji.json parts' });
  assert.throws(() => checkRelatedTeaching(mutant, course), /円: no kanji.json parts relation to 木 \(fabricated teaching link\)/);
  const mutant2 = clone(gaps);
  mutant2.grades[0].uncovered[0].related_teaching.push({ unit: 'no-such-unit', via: '木', relation: 'planted', source: 'planted' });
  assert.throws(() => checkRelatedTeaching(mutant2, course), /fabricated teaching link/);
});

test('S6-DD3 template gap report: every taught-path kanji has a drawable template; gaps elsewhere are listed', () => {
  const tg = inventory.template_gaps_S6_DD3;
  for (const level of GRADES_THROUGH_2) assert.equal(tg[level].without_template, 0, `${level} fully templated`);
  assert.ok(tg['配当外'].without_template > 0 || tg['1級'].without_template > 0, 'the gap report is not empty at base');
  for (const [level, v] of Object.entries(tg)) {
    assert.equal(v.with_template + v.without_template, v.glyphs);
    assert.equal([...v.missing].length, v.without_template, `${level} lists each missing glyph`);
  }
  assert.deepEqual(gaps.template_gaps_S6_DD3, tg);
});

test('negative control (fixture): kanken-without-亜.jsonl yields total 6786 and names 亜 in gaps.json and reconcile.json', () => {
  const fixturePath = resolve(HERE, 'fixtures/kanken-without-亜.jsonl');
  const realLines = readFileSync(resolve(REPO_ROOT, PATHS.kankenJsonl), 'utf8').split('\n').filter((l) => l.trim());
  const fixtureLines = readFileSync(fixturePath, 'utf8').split('\n').filter((l) => l.trim());
  const dropped = realLines.filter((l) => !fixtureLines.includes(l));
  assert.equal(dropped.length, 1, 'the fixture is the real file minus one line');
  assert.equal(JSON.parse(dropped[0]).glyph, '亜');
  assert.equal(fixtureLines.length, realLines.length - 1);
  const result = buildInventory(loadInputs({ kankenJsonlPath: fixturePath }));
  assert.equal(result.inventory.total_rows, 6786);
  assert.equal(result.inventory.jouyou_rows_in_kanken, EXPECTED_JOUYOU - 1);
  assert.deepEqual(result.inventory.jouyou_membership.symmetric_difference.joyo_only, ['亜']);
  assert.ok(result.gaps.jouyou_membership_gaps.some((g) => g.glyph === '亜' && /常用漢字表/.test(g.reason)), 'gaps.json names 亜');
  assert.deepEqual(result.reconcile.kanken_json_absent_from_jsonl.any_form.glyphs, [{ glyph: '亜', kanken_json_level: '準2級' }], 'reconcile.json names 亜');
  assert.equal(result.inventory.levels.find((l) => l.level === '準2級').rows, 327);
});

test('docs/kanji/KANKEN-INVENTORY.md is rendered from the same numbers', () => {
  for (const l of inventory.levels) {
    const row = doc.split('\n').find((line) => line.startsWith(`| ${l.level} | `));
    assert.ok(row, `${l.level} row in the report`);
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    assert.equal(Number(cells[1]), l.rows, `${l.level} rows`);
    assert.equal(Number(cells[3]), l.distinct_glyphs);
    assert.equal(Number(cells[5]), l.lookup_covered);
    assert.equal(Number(cells[6]), l.teaching_covered);
  }
  assert.ok(doc.includes(inventory.sources.kanken_jsonl.sha256));
  assert.ok(doc.includes(`**${inventory.total_rows}**`));
  assert.match(doc, /X17 recorded the pinned kanji frequency source \*\*absent\*\*/);
  assert.ok(!doc.includes('[object Object]'));
});

test('X17: the frequency source is recorded absent and the first 準1級/1級 units are a stated blocker, not a substituted count', () => {
  assert.equal(inventory.frequency_source.status, 'absent');
  assert.equal(inventory.frequency_source.node, 'X17');
  assert.match(inventory.frequency_source.consequence, /stated blocker/);
  assert.match(inventory.frequency_source.consequence, /no other count is substituted/);
  assert.deepEqual(gaps.frequency_source, inventory.frequency_source);
});
