#!/usr/bin/env node
/* Kanken inventory builder (L6.0, S6-R4/S6-R10/S6-AC3, S2-R20/S2-DD7).
 * Counts the 6,787-row Kanken fact table by its own fields, reconciles it with
 * kanken.json and the 常用漢字表 membership, separates lookup coverage from
 * teaching coverage (teaching = authored units of kanji-course.js only), and
 * reports reading / meaning / stroke-template completeness per entry class.
 * Node standard library only. No clock inside the JSON outputs; the optional
 * --date is written into the Markdown report header alone.
 *
 *   node prototypes/corridor/data/kanken/inventory/build-inventory.mjs \
 *     [--kanken <jsonl>] [--out <dir>] [--doc <markdown path>] [--date YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../../../../..');
export const GRADES_THROUGH_2 = ['10級', '9級', '8級', '7級', '6級', '5級', '4級', '3級', '準2級', '2級'];
export const UPPER_GRADES = ['準1級', '1級'];
export const LEVEL_ORDER = [...GRADES_THROUGH_2, ...UPPER_GRADES, '1/準1級', '配当外'];
export const FORM_ORDER = ['親字', '旧字', '旧字でない異体字', '元字'];
export const PATHS = Object.freeze({
  kankenJsonl: 'corpus/datasets/kanji/kanken.jsonl',
  kankenJson: 'prototypes/corridor/data/proprietary_safe/kanken.json',
  kanjiJson: 'prototypes/corridor/data/share_alike/kanji.json',
  referenceExtra: 'prototypes/corridor/data/share_alike/reference-extra.json',
  strokesJson: 'prototypes/corridor/data/share_alike/strokes.json',
  partsGraph: 'prototypes/corridor/data/parts-graph/graph.json',
  animcjkEquivalence: 'prototypes/corridor/data/share_alike/animcjk/equivalence.json',
  kanjiCourse: 'prototypes/corridor/kanji-course.js',
});
export const JOYO_SOURCE_NAME = '常用漢字表（内閣告示第2号、2010年11月30日）';
export const FREQUENCY_SOURCE_STATUS = Object.freeze({
  status: 'absent',
  node: 'X17',
  looked_up: '/root/bunki-campaign/inputs/ on agni, read-only, 2026-11-07',
  finding: 'no pinned kanji frequency file and no sha256 recorded (no *freq* file; SELECTION.md and MANIFEST.json do not mention a frequency source)',
  consequence: 'the first 準1級 and 1級 units (S6-R15) are a stated blocker; no other count is substituted',
});

export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const byCodePoint = (a, b) => (a.codePointAt(0) - b.codePointAt(0)) || (a < b ? -1 : a > b ? 1 : 0);
const sortedSet = (set) => [...set].sort(byCodePoint);

function readPinned(root, rel) {
  const abs = resolve(root, rel);
  const bytes = readFileSync(abs);
  return { abs, rel, bytes, pin: { path: rel, sha256: sha256(bytes), bytes: bytes.length } };
}

export function parseJsonl(text) {
  return text.split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line));
}

/** Load every pinned input. `kankenJsonlPath` may point at a fixture (absolute or repo-relative). */
export function loadInputs({ root = REPO_ROOT, kankenJsonlPath = PATHS.kankenJsonl } = {}) {
  const kankenAbs = isAbsolute(kankenJsonlPath) ? kankenJsonlPath : resolve(root, kankenJsonlPath);
  const kankenBytes = readFileSync(kankenAbs);
  const kankenRel = relative(root, kankenAbs);
  const files = {};
  for (const [key, rel] of Object.entries(PATHS)) if (key !== 'kankenJsonl') files[key] = readPinned(root, rel);
  const require = createRequire(import.meta.url);
  const course = require(files.kanjiCourse.abs);
  return {
    pins: {
      kanken_jsonl: { path: kankenRel.startsWith('..') ? kankenAbs : kankenRel, sha256: sha256(kankenBytes), bytes: kankenBytes.length },
      kanken_json: files.kankenJson.pin,
      kanji_json: files.kanjiJson.pin,
      reference_extra: files.referenceExtra.pin,
      strokes_json: files.strokesJson.pin,
      parts_graph: files.partsGraph.pin,
      animcjk_equivalence: files.animcjkEquivalence.pin,
      kanji_course: files.kanjiCourse.pin,
    },
    rows: parseJsonl(kankenBytes.toString('utf8')),
    kankenJson: JSON.parse(files.kankenJson.bytes.toString('utf8')),
    kanjiJson: JSON.parse(files.kanjiJson.bytes.toString('utf8')),
    referenceExtra: JSON.parse(files.referenceExtra.bytes.toString('utf8')),
    strokesJson: JSON.parse(files.strokesJson.bytes.toString('utf8')),
    partsGraph: JSON.parse(files.partsGraph.bytes.toString('utf8')),
    animcjk: JSON.parse(files.animcjkEquivalence.bytes.toString('utf8')),
    course,
  };
}

/** The 常用漢字表 membership: glyphs of the joyoOn/joyoKun lists, which name their source. */
export function joyoMembership(referenceExtra) {
  const source = (referenceExtra.sources || []).find((s) => typeof s.name === 'string' && s.name.startsWith('常用漢字表'));
  if (!source) throw new Error('reference-extra.json names no 常用漢字表 source');
  const on = new Set(referenceExtra.joyoOn.map((row) => row[0]));
  const kun = new Set(referenceExtra.joyoKun.map((row) => row[0]));
  if (on.size !== kun.size || [...on].some((g) => !kun.has(g))) throw new Error('joyoOn and joyoKun disagree on membership');
  return { glyphs: on, source: { name: source.name, url: source.url, pageSha256: source.pageSha256, fetchedAt: source.fetchedAt } };
}

/** Distinct kanji the authored course teaches, derived from kanji-course.js (never typed). */
export function teachingSet(course) {
  const units = course.listUnits();
  const map = new Map();
  for (const unit of units) for (const target of unit.targets) {
    if (!map.has(target.kanji)) map.set(target.kanji, []);
    map.get(target.kanji).push(unit.id);
  }
  return { units, map, glyphs: new Set(map.keys()) };
}

/** Per-glyph field presence from pinned content: which source supplies a reading, meaning, stroke count or drawable template. */
export function glyphFields(inputs) {
  const { kanjiJson, referenceExtra, strokesJson, partsGraph, animcjk } = inputs;
  const kanji = kanjiJson.kanji;
  const joyoOn = new Map(referenceExtra.joyoOn.map((r) => [r[0], r[1]]));
  const joyoKun = new Map(referenceExtra.joyoKun.map((r) => [r[0], r[1]]));
  const meta = new Map(referenceExtra.kanjiMetadata.map((r) => [r[0], { on: r[1], kun: r[2], meanings: r[3], strokeCount: r[4] }]));
  const readings = new Map(referenceExtra.kanjiReadings.map((r) => [r[0], { on: r[1], kun: r[2] }]));
  const records = new Map(referenceExtra.kanjiRecords.map((r) => [r[0], { meanings: r[1], strokeCount: r[2] }]));
  const facts = new Map(referenceExtra.kanjiFacts.map((r) => [r[0], r[1]]));
  const parts = new Map(partsGraph.parts.filter((p) => Array.isArray(p.paths) && p.paths.length).map((p) => [p.literal, p]));
  const brush = new Set(animcjk.approved || []);
  const nonEmpty = (arr) => Array.isArray(arr) && arr.length > 0;
  return {
    reading(g) {
      if (nonEmpty(joyoOn.get(g)) || nonEmpty(joyoKun.get(g))) return '常用漢字表 official on/kun';
      const k = kanji[g]; if (k && (nonEmpty(k.on) || nonEmpty(k.kun))) return 'kanji.json on/kun';
      const m = meta.get(g); if (m && (nonEmpty(m.on) || nonEmpty(m.kun))) return 'reference-extra kanjiMetadata';
      const r = readings.get(g); if (r && (nonEmpty(r.on) || nonEmpty(r.kun))) return 'reference-extra kanjiReadings (KANJIDIC2)';
      return null;
    },
    meaning(g) {
      const k = kanji[g]; if (k && typeof k.m === 'string' && k.m.trim()) return 'kanji.json m';
      const rec = records.get(g); if (rec && nonEmpty(rec.meanings)) return 'reference-extra kanjiRecords';
      const m = meta.get(g); if (m && nonEmpty(m.meanings)) return 'reference-extra kanjiMetadata';
      const f = facts.get(g); if (nonEmpty(f)) return 'reference-extra kanjiFacts (KANJIDIC2)';
      return null;
    },
    strokeCount(g) {
      const k = kanji[g]; if (k && Number.isInteger(k.st) && k.st > 0) return 'kanji.json st';
      const rec = records.get(g); if (rec && Number.isInteger(rec.strokeCount)) return 'reference-extra kanjiRecords';
      const m = meta.get(g); if (m && Number.isInteger(m.strokeCount)) return 'reference-extra kanjiMetadata';
      if (nonEmpty(strokesJson.strokes[g])) return 'strokes.json path count';
      if (parts.has(g)) return 'parts-graph KanjiVG path count';
      return null;
    },
    template(g) {
      if (nonEmpty(strokesJson.strokes[g])) return 'strokes.json (KanjiVG centerlines)';
      if (parts.has(g)) return 'parts-graph/graph.json (pinned KanjiVG 70a0b7a member)';
      return null;
    },
    brush(g) { return brush.has(g); },
    lookup(g) { return Boolean(kanji[g]); },
    kanji,
  };
}

function requiredFields(level, form) {
  if (form !== '親字') return [];
  if (GRADES_THROUGH_2.includes(level)) return ['reading', 'meaning', 'template'];
  if (UPPER_GRADES.includes(level)) return ['reading', 'meaning'];
  return [];
}

function classRole(level, form) {
  if (form === '親字' && GRADES_THROUGH_2.includes(level)) return 'teaching path through 2級 (reading, meaning and a drawable template required)';
  if (form === '親字' && UPPER_GRADES.includes(level)) return 'upper-grade headword (reading and meaning required; template reported for the S6-DD3 gap report)';
  if (form === '親字') return 'headword outside the graded path (reference only)';
  return `${form} (reference-only form; presence reported, nothing required)`;
}

/** Build inventory.json, gaps.json and reconcile.json values from loaded inputs. Pure. */
export function buildInventory(inputs) {
  const { rows, kankenJson, pins, referenceExtra, course } = inputs;
  const fields = glyphFields(inputs);
  const joyo = joyoMembership(referenceExtra);
  const teaching = teachingSet(course);
  const catalog = course.catalog();

  const levelsSeen = new Set(rows.map((r) => r.kanken_level));
  const formsSeen = new Set(rows.map((r) => r.form));
  for (const level of levelsSeen) if (!LEVEL_ORDER.includes(level)) throw new Error(`unknown kanken_level in file: ${level}`);
  for (const form of formsSeen) if (!FORM_ORDER.includes(form)) throw new Error(`unknown form in file: ${form}`);

  const glyphRows = new Map();
  for (const r of rows) {
    if (!glyphRows.has(r.glyph)) glyphRows.set(r.glyph, []);
    glyphRows.get(r.glyph).push(r);
  }
  const allGlyphs = new Set(rows.map((r) => r.glyph));
  const nonEmptyGlyphs = new Set(rows.filter((r) => r.glyph !== '').map((r) => r.glyph));

  const levels = LEVEL_ORDER.filter((l) => levelsSeen.has(l)).map((level) => {
    const levelRows = rows.filter((r) => r.kanken_level === level);
    const forms = {};
    for (const form of FORM_ORDER) {
      const n = levelRows.filter((r) => r.form === form).length;
      if (n) forms[form] = n;
    }
    const glyphs = new Set(levelRows.filter((r) => r.glyph !== '').map((r) => r.glyph));
    const oyaji = new Set(levelRows.filter((r) => r.form === '親字' && r.glyph !== '').map((r) => r.glyph));
    const lookup = [...glyphs].filter((g) => fields.lookup(g));
    const taught = [...glyphs].filter((g) => teaching.glyphs.has(g));
    const template = [...glyphs].filter((g) => fields.template(g));
    return {
      level,
      rows: levelRows.length,
      forms,
      oyaji_rows: forms['親字'] || 0,
      distinct_glyphs: glyphs.size,
      distinct_oyaji_glyphs: oyaji.size,
      glyphless_rows: levelRows.filter((r) => r.glyph === '').length,
      lookup_covered: lookup.length,
      teaching_covered: taught.length,
      teaching_coverage_pct: pct(taught.length, glyphs.size),
      template_covered: template.length,
    };
  });
  const levelsSum = levels.reduce((sum, l) => sum + l.rows, 0);

  // A2: 親字 rows 10級..2級 against the 常用漢字表 membership.
  const jouyouInKanken = new Set(rows.filter((r) => r.form === '親字' && GRADES_THROUGH_2.includes(r.kanken_level)).map((r) => r.glyph));
  const jsonlOnly = sortedSet(new Set([...jouyouInKanken].filter((g) => !joyo.glyphs.has(g))));
  const joyoOnly = sortedSet(new Set([...joyo.glyphs].filter((g) => !jouyouInKanken.has(g))));

  // Coverage through 2級 and the honest upper-grade lines.
  const grade = (g) => { const r = (glyphRows.get(g) || []).find((row) => row.form === '親字'); return r ? r.kanken_level : null; };
  const taughtThrough2 = [...jouyouInKanken].filter((g) => teaching.glyphs.has(g));
  const lookupThrough2 = [...jouyouInKanken].filter((g) => fields.lookup(g));
  const upper = {};
  for (const level of UPPER_GRADES) {
    const glyphs = new Set(rows.filter((r) => r.kanken_level === level && r.form === '親字' && r.glyph !== '').map((r) => r.glyph));
    const taught = [...glyphs].filter((g) => teaching.glyphs.has(g));
    upper[level] = {
      oyaji_rows: rows.filter((r) => r.kanken_level === level && r.form === '親字').length,
      oyaji_glyphs: glyphs.size,
      glyphless_oyaji_rows: rows.filter((r) => r.kanken_level === level && r.form === '親字' && r.glyph === '').length,
      teaching_covered: taught.length,
      teaching_coverage_pct: pct(taught.length, glyphs.size),
      lookup_covered: [...glyphs].filter((g) => fields.lookup(g)).length,
      uncovered_glyphs: sortedSet(new Set([...glyphs].filter((g) => !teaching.glyphs.has(g)))).join(''),
    };
  }
  const coverage = {
    rule: 'teaching_covered = the glyph is a target of an authored unit in kanji-course.js; lookup_covered = the glyph has an entry in share_alike/kanji.json. Lookup is never counted as taught.',
    teaching_source: { path: pins.kanji_course.path, sha256: pins.kanji_course.sha256, course_id: catalog.id, revision: catalog.revision, units: teaching.units.length, distinct_kanji: teaching.glyphs.size, counts: catalog.counts },
    through_2kyu: { kanji: jouyouInKanken.size, teaching_covered: taughtThrough2.length, teaching_coverage_pct: pct(taughtThrough2.length, jouyouInKanken.size), lookup_covered: lookupThrough2.length, lookup_coverage_pct: pct(lookupThrough2.length, jouyouInKanken.size) },
    upper,
  };
  const reportLine = `teaching coverage through 2級: ${taughtThrough2.length}/${jouyouInKanken.size} (${coverage.through_2kyu.teaching_coverage_pct}%); 準1級: ${upper['準1級'].teaching_covered}/${upper['準1級'].oyaji_glyphs} (${upper['準1級'].teaching_coverage_pct}%); 1級: ${upper['1級'].teaching_covered}/${upper['1級'].oyaji_glyphs} (${upper['1級'].teaching_coverage_pct}%). Lookup coverage through 2級 is ${lookupThrough2.length}/${jouyouInKanken.size} and is not teaching coverage.`;

  // A10: completeness per entry class (level × form).
  const completeness = [];
  for (const level of LEVEL_ORDER.filter((l) => levelsSeen.has(l))) for (const form of FORM_ORDER) {
    const classRows = rows.filter((r) => r.kanken_level === level && r.form === form);
    if (!classRows.length) continue;
    const required = requiredFields(level, form);
    const glyphs = sortedSet(new Set(classRows.filter((r) => r.glyph !== '').map((r) => r.glyph)));
    const glyphless = classRows.filter((r) => r.glyph === '');
    const have = { reading: 0, meaning: 0, stroke_count: 0, template: 0, brush_outline_approved: 0 };
    const missing = [];
    let complete = 0;
    for (const g of glyphs) {
      const got = { reading: fields.reading(g), meaning: fields.meaning(g), stroke_count: fields.strokeCount(g), template: fields.template(g) };
      for (const key of Object.keys(got)) if (got[key]) have[key] += 1;
      if (fields.brush(g)) have.brush_outline_approved += 1;
      const lacking = required.filter((key) => !got[key]);
      if (lacking.length) missing.push({ glyph: g, missing: lacking });
      else complete += 1;
    }
    completeness.push({
      class: `${level}·${form}`, level, form, role: classRole(level, form),
      entries: classRows.length, glyph_entries: glyphs.length, glyphless_entries: glyphless.length,
      reading: have.reading, meaning: have.meaning, stroke_count: have.stroke_count, template: have.template, brush_outline_approved: have.brush_outline_approved,
      required, complete, incomplete: missing.length + (required.length ? glyphless.length : 0),
      missing, glyphless_entry_ids: required.length ? glyphless.map((r) => r.entry_id) : [],
      note: required.length ? 'complete counts glyphs with every required field present in pinned content; a glyphless row has no literal identity and can satisfy none' : 'reference-only class: presence reported, nothing required',
    });
  }

  // S6-DD3: strokes and a drawable template for every inventory glyph, or the gap report.
  const templateGaps = {};
  for (const level of LEVEL_ORDER.filter((l) => levelsSeen.has(l))) {
    const glyphs = sortedSet(new Set(rows.filter((r) => r.kanken_level === level && r.glyph !== '').map((r) => r.glyph)));
    const lacking = glyphs.filter((g) => !fields.template(g));
    templateGaps[level] = { glyphs: glyphs.length, with_template: glyphs.length - lacking.length, without_template: lacking.length, missing: lacking.join('') };
  }

  // gaps.json: every 10級..2級 kanji with teaching_covered false, per grade, with a reason and only genuine related teaching.
  const relatedTeaching = (g) => {
    const entry = fields.kanji[g];
    const links = [];
    if (entry) {
      for (const part of entry.parts || []) if (teaching.glyphs.has(part)) {
        for (const unitId of teaching.map.get(part)) links.push({ unit: unitId, via: part, relation: `component ${part} of ${g}`, source: 'kanji.json parts' });
      }
      for (const taught of teaching.glyphs) {
        const te = fields.kanji[taught];
        if (te && (te.parts || []).includes(g)) for (const unitId of teaching.map.get(taught)) links.push({ unit: unitId, via: taught, relation: `${g} is a component of ${taught}`, source: 'kanji.json parts' });
      }
    }
    const seen = new Set();
    return links.filter((l) => { const key = l.unit + '|' + l.via; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 3);
  };
  const gapGrades = GRADES_THROUGH_2.map((level) => {
    const glyphs = rows.filter((r) => r.kanken_level === level && r.form === '親字').map((r) => r.glyph);
    const uncovered = glyphs.filter((g) => !teaching.glyphs.has(g)).map((g) => {
      const links = relatedTeaching(g);
      return {
        glyph: g,
        reason: 'no authored unit in kanji-course.js teaches this kanji (teaching gap; lookup entry alone is not teaching)',
        lookup_covered: fields.lookup(g),
        template: fields.template(g) !== null,
        related_teaching: links,
        ...(links.length ? {} : { related_teaching_note: 'no related authored teaching available' }),
      };
    });
    return { level, total: glyphs.length, taught: glyphs.length - uncovered.length, uncovered_count: uncovered.length, uncovered };
  });
  const jouyouMembershipGaps = [
    ...joyoOnly.map((g) => ({ glyph: g, side: 'joyo_only', reason: `in ${JOYO_SOURCE_NAME} but no 親字 row 10級..2級 in ${pins.kanken_jsonl.path}` })),
    ...jsonlOnly.map((g) => ({ glyph: g, side: 'jsonl_only', reason: `親字 row 10級..2級 in ${pins.kanken_jsonl.path} but not in ${JOYO_SOURCE_NAME}` })),
  ];

  // reconcile.json: kanken.json (2,453 glyph levels) against the jsonl.
  const kk = kankenJson.levels;
  const kkGlyphs = Object.keys(kk).sort(byCodePoint);
  const kkPerLevel = {};
  for (const g of kkGlyphs) kkPerLevel[kk[g].kk] = (kkPerLevel[kk[g].kk] || 0) + 1;
  const oyajiGlyphs = new Set(rows.filter((r) => r.form === '親字').map((r) => r.glyph));
  const speciesOf = (g) => new Set((glyphRows.get(g) || []).map((r) => r.species_id));
  const missingInKankenJson = sortedSet(new Set([...jouyouInKanken].filter((g) => !(g in kk)))).map((g) => {
    const row = glyphRows.get(g).find((r) => r.form === '親字');
    const species = speciesOf(g);
    const variants = rows.filter((r) => species.has(r.species_id) && r.glyph !== g && r.glyph !== '' && r.glyph in kk).map((r) => ({ glyph: r.glyph, form: r.form, kanken_level: r.kanken_level, kanken_json_level: kk[r.glyph].kk }));
    return { glyph: g, level: row.kanken_level, entry_id: row.entry_id, species_id: row.species_id, kanken_json_carries_same_species_variant: variants };
  });
  const absentAnyForm = kkGlyphs.filter((g) => !allGlyphs.has(g)).map((g) => ({ glyph: g, kanken_json_level: kk[g].kk }));
  const absentAsOyaji = kkGlyphs.filter((g) => !oyajiGlyphs.has(g)).map((g) => ({
    glyph: g, kanken_json_level: kk[g].kk,
    jsonl_rows: (glyphRows.get(g) || []).map((r) => ({ entry_id: r.entry_id, form: r.form, kanken_level: r.kanken_level })),
  }));
  const levelDisagreements = [];
  const oyajiLevelDisagreements = [];
  let compared = 0; let comparedOyaji = 0; let rankDisagreements = 0;
  for (const g of kkGlyphs) {
    const grs = glyphRows.get(g);
    if (!grs) continue;
    compared += 1;
    const levelsHere = new Set(grs.map((r) => r.kanken_level));
    if (!levelsHere.has(kk[g].kk)) levelDisagreements.push({ glyph: g, kanken_json_level: kk[g].kk, jsonl_levels: [...levelsHere] });
    if (!grs.some((r) => r.kanken_rank === kk[g].kr)) rankDisagreements += 1;
    const oy = grs.filter((r) => r.form === '親字');
    if (oy.length) {
      comparedOyaji += 1;
      if (!oy.some((r) => r.kanken_level === kk[g].kk)) oyajiLevelDisagreements.push({ glyph: g, kanken_json_level: kk[g].kk, jsonl_oyaji_levels: oy.map((r) => r.kanken_level) });
    }
  }
  const duplicates = [...glyphRows.entries()].filter(([g, rs]) => g !== '' && rs.length > 1).map(([g, rs]) => ({ glyph: g, rows: rs.map((r) => ({ entry_id: r.entry_id, species_id: r.species_id, form: r.form, kanken_level: r.kanken_level })) }));

  const inventory = {
    schema: 'bunki.kanken.inventory/1',
    spec_refs: ['S6-R4', 'S6-R10', 'S6-AC3', 'S6-DD3', 'S2-R2', 'S2-R20', 'S2-DD7'],
    sources: pins,
    counting_rule: 'rows are counted by each row\'s own kanken_level and form fields; distinct glyph sets exclude the empty glyph string unless stated',
    total_rows: rows.length,
    distinct_glyphs_including_empty: allGlyphs.size,
    distinct_glyphs: nonEmptyGlyphs.size,
    glyphless_rows: rows.filter((r) => r.glyph === '').length,
    glyphless_rows_with_image: rows.filter((r) => r.glyph === '' && r.glyph_image_url).length,
    levels,
    levels_sum: levelsSum,
    forms: Object.fromEntries(FORM_ORDER.filter((f) => formsSeen.has(f)).map((f) => [f, rows.filter((r) => r.form === f).length])),
    jouyou_rows_in_kanken: jouyouInKanken.size,
    jouyou_membership: { source: joyo.source, size: joyo.glyphs.size, symmetric_difference: { jsonl_only: jsonlOnly, joyo_only: joyoOnly }, listed_in_gaps: jouyouMembershipGaps.length === jsonlOnly.length + joyoOnly.length },
    duplicate_glyphs: duplicates,
    coverage,
    report_lines: { 'S6-AC3': reportLine },
    completeness,
    template_gaps_S6_DD3: templateGaps,
    frequency_source: FREQUENCY_SOURCE_STATUS,
  };
  const gaps = {
    schema: 'bunki.kanken.gaps/1',
    spec_refs: ['S6-R10', 'S6-AC3', 'S6-AC2'],
    teaching_source: coverage.teaching_source,
    rule: 'a kanji is a teaching gap unless it is a target of an authored unit in kanji-course.js; related_teaching links only to units that really teach a kanji related to it through kanji.json parts',
    through_2kyu: { total: jouyouInKanken.size, taught: taughtThrough2.length, uncovered: jouyouInKanken.size - taughtThrough2.length, teaching_coverage_pct: coverage.through_2kyu.teaching_coverage_pct },
    report_line: reportLine,
    grades: gapGrades,
    upper,
    jouyou_membership_gaps: jouyouMembershipGaps,
    template_gaps_S6_DD3: templateGaps,
    glyphless_rows: inventory.glyphless_rows,
    frequency_source: FREQUENCY_SOURCE_STATUS,
  };
  const reconcile = {
    schema: 'bunki.kanken.reconcile/1',
    spec_refs: ['S6-R4', 'S6-OI1'],
    kanken_jsonl: { ...pins.kanken_jsonl, rows: rows.length },
    kanken_json: { ...pins.kanken_json, glyphs: kkGlyphs.length, per_level: kkPerLevel, sources: kankenJson.sources },
    jsonl_oyaji_through_2kyu_missing_in_kanken_json: { count: missingInKankenJson.length, glyphs: missingInKankenJson.map((m) => m.glyph), detail: missingInKankenJson },
    kanken_json_absent_from_jsonl: {
      reading: 'two readings of "absent": (any_form) no row of any form carries the glyph; (as_oyaji) no 親字 row carries it, although a 旧字 or 旧字でない異体字 row may',
      any_form: { count: absentAnyForm.length, glyphs: absentAnyForm },
      as_oyaji: { count: absentAsOyaji.length, glyphs: absentAsOyaji },
    },
    level_disagreements: { compared_glyphs: compared, count: levelDisagreements.length, glyphs: levelDisagreements, oyaji_rows_only: { compared_glyphs: comparedOyaji, count: oyajiLevelDisagreements.length, glyphs: oyajiLevelDisagreements } },
    rank_disagreements: rankDisagreements,
    duplicate_glyphs_in_jsonl: duplicates,
  };
  return { inventory, gaps, reconcile };
}

const stable = (value) => JSON.stringify(value, null, 2) + '\n';

/** Human report for docs/kanji/KANKEN-INVENTORY.md, rendered from the computed values. */
export function renderDoc({ inventory, gaps, reconcile }, { date = null } = {}) {
  const L = [];
  const row = (cells) => '| ' + cells.join(' | ') + ' |';
  L.push('# Kanken inventory (6,787-row fact table)');
  L.push('');
  L.push(`Generated by \`prototypes/corridor/data/kanken/inventory/build-inventory.mjs\`${date ? ` on ${date} (injected clock)` : ''}; numbers come from the pinned files named below, never from a typed table. Machine-readable twins: \`inventory.json\`, \`gaps.json\`, \`reconcile.json\` in the same folder; judge: \`inventory.test.mjs\`. Spec: S6-R4, S6-R10, S6-AC3, S6-DD3, S2-R20, S2-DD7.`);
  L.push('');
  L.push('## Pinned inputs');
  L.push('');
  L.push(row(['input', 'path', 'sha256', 'bytes']));
  L.push(row(['---', '---', '---', '---']));
  for (const [key, pin] of Object.entries(inventory.sources)) L.push(row([key, `\`${pin.path}\``, `\`${pin.sha256}\``, String(pin.bytes)]));
  L.push('');
  L.push('## Rows per level (counted by each row\'s own `kanken_level` and `form`)');
  L.push('');
  L.push(`Total rows **${inventory.total_rows}** (levels sum ${inventory.levels_sum}); distinct glyphs ${inventory.distinct_glyphs} (${inventory.distinct_glyphs_including_empty} counting the empty string once); glyphless rows ${inventory.glyphless_rows} (${inventory.glyphless_rows_with_image} carry an image URL instead of a literal). Forms: ${Object.entries(inventory.forms).map(([f, n]) => `${f} ${n}`).join(', ')}.`);
  L.push('');
  L.push(row(['level', 'rows', 'forms', 'distinct glyphs', 'glyphless rows', 'lookup covered', 'teaching covered', 'teaching %', 'template']));
  L.push(row(['---', '---:', '---', '---:', '---:', '---:', '---:', '---:', '---:']));
  for (const l of inventory.levels) L.push(row([l.level, String(l.rows), Object.entries(l.forms).map(([f, n]) => `${f} ${n}`).join(', '), String(l.distinct_glyphs), String(l.glyphless_rows), String(l.lookup_covered), String(l.teaching_covered), `${l.teaching_coverage_pct}%`, String(l.template_covered)]));
  L.push('');
  L.push('Lookup covered = the glyph has an entry in `share_alike/kanji.json`. Teaching covered = the glyph is a target of an authored unit in `kanji-course.js`. The two are never merged.');
  L.push('');
  L.push('## 常用漢字表 membership (親字 rows 10級..2級)');
  L.push('');
  const jm = inventory.jouyou_membership;
  L.push(`親字 rows 10級..2級 form **${inventory.jouyou_rows_in_kanken}** distinct glyphs. ${jm.source.name} membership (page sha256 \`${jm.source.pageSha256}\`) has ${jm.size}. Symmetric difference: jsonl-only ${JSON.stringify(jm.symmetric_difference.jsonl_only)}, 常用-only ${JSON.stringify(jm.symmetric_difference.joyo_only)}${gaps.jouyou_membership_gaps.length ? ` (each listed in gaps.json)` : ' (empty)'}.`);
  L.push('');
  L.push('## Reconciliation with `proprietary_safe/kanken.json`');
  L.push('');
  L.push(`kanken.json assigns **${reconcile.kanken_json.glyphs}** glyphs (${Object.entries(reconcile.kanken_json.per_level).sort((a, b) => LEVEL_ORDER.indexOf(a[0]) - LEVEL_ORDER.indexOf(b[0])).map(([k, v]) => `${k} ${v}`).join(', ')}).`);
  L.push('');
  const miss = reconcile.jsonl_oyaji_through_2kyu_missing_in_kanken_json;
  L.push(`(a) 10級..2級 親字 glyphs the jsonl has and kanken.json lacks: **${miss.count}** — ${miss.detail.map((m) => `${m.glyph} (${m.level}, ${m.entry_id}; kanken.json carries the same-species variant ${m.kanken_json_carries_same_species_variant.map((v) => `${v.glyph} as ${v.kanken_json_level}`).join(', ') || 'none'})`).join('; ') || 'none'}.`);
  L.push('');
  const abs = reconcile.kanken_json_absent_from_jsonl;
  L.push(`(b) kanken.json glyphs absent from the jsonl: **${abs.any_form.count}** under any form; **${abs.as_oyaji.count}** absent as 親字 (they appear only as 旧字 or 旧字でない異体字 rows): ${abs.as_oyaji.glyphs.map((g) => `${g.glyph}:${g.kanken_json_level}`).join(' ')}.`);
  L.push('');
  L.push(`(c) level disagreements for glyphs present in both: **${reconcile.level_disagreements.count}** of ${reconcile.level_disagreements.compared_glyphs} compared (親字 rows only: ${reconcile.level_disagreements.oyaji_rows_only.count} of ${reconcile.level_disagreements.oyaji_rows_only.compared_glyphs}); rank disagreements ${reconcile.rank_disagreements}.`);
  L.push('');
  L.push(`Glyphs with more than one row in the jsonl: ${reconcile.duplicate_glyphs_in_jsonl.map((d) => `${d.glyph} (${d.rows.map((r) => `${r.form}/${r.kanken_level}`).join(', ')})`).join('; ')}.`);
  L.push('');
  L.push('## Coverage (S6-AC3 report line)');
  L.push('');
  L.push(`> ${inventory.report_lines['S6-AC3']}`);
  L.push('');
  L.push(`Teaching source: \`${inventory.coverage.teaching_source.path}\` (course \`${inventory.coverage.teaching_source.course_id}\` revision ${inventory.coverage.teaching_source.revision}, ${inventory.coverage.teaching_source.units} units, ${inventory.coverage.teaching_source.distinct_kanji} distinct kanji, derived from \`listUnits()\`). Per-grade gaps with reasons and only genuine related teaching: \`gaps.json\`.`);
  L.push('');
  L.push(row(['grade', 'kanji', 'taught', 'uncovered']));
  L.push(row(['---', '---:', '---:', '---:']));
  for (const g of gaps.grades) L.push(row([g.level, String(g.total), String(g.taught), String(g.uncovered_count)]));
  for (const level of UPPER_GRADES) L.push(row([level, String(gaps.upper[level].oyaji_glyphs), String(gaps.upper[level].teaching_covered), String(gaps.upper[level].oyaji_glyphs - gaps.upper[level].teaching_covered)]));
  L.push('');
  L.push('## Completeness per entry class (S2-R20, S6-AC3)');
  L.push('');
  L.push('Reading, meaning, stroke count and a drawable stroke template are counted from pinned content per glyph; entry presence alone satisfies nothing. Required fields differ by class; a glyphless row has no literal identity and can satisfy no field.');
  L.push('');
  L.push(row(['class', 'entries', 'glyph entries', 'glyphless', 'reading', 'meaning', 'stroke count', 'template', 'brush approved', 'required', 'complete', 'incomplete']));
  L.push(row(['---', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---', '---:', '---:']));
  for (const c of inventory.completeness) L.push(row([c.class, String(c.entries), String(c.glyph_entries), String(c.glyphless_entries), String(c.reading), String(c.meaning), String(c.stroke_count), String(c.template), String(c.brush_outline_approved), c.required.join('+') || '—', String(c.complete), String(c.incomplete)]));
  L.push('');
  const tg = inventory.template_gaps_S6_DD3;
  L.push(`Template gaps (S6-DD3): ${Object.entries(tg).filter(([, v]) => v.without_template).map(([k, v]) => `${k} ${v.without_template}/${v.glyphs}${v.without_template <= 12 ? ` (${v.missing})` : ''}`).join('; ') || 'none'}; plus ${inventory.glyphless_rows} glyphless rows with no literal to draw.`);
  L.push('');
  L.push('## Frequency source (X17) and the first 準1級 / 1級 units');
  L.push('');
  const fq = inventory.frequency_source;
  L.push(`**Blocker.** ${fq.node} recorded the pinned kanji frequency source **${fq.status}**: ${fq.finding} (${fq.looked_up}). Consequence: ${fq.consequence}. The manifest draft carries this blocker verbatim and holds zero \`kanken\`-wave units.`);
  L.push('');
  L.push('## Rebuild');
  L.push('');
  L.push('```sh');
  L.push('node prototypes/corridor/data/kanken/inventory/build-inventory.mjs --doc docs/kanji/KANKEN-INVENTORY.md --date YYYY-MM-DD');
  L.push('node --test prototypes/corridor/data/kanken/inventory/inventory.test.mjs');
  L.push('```');
  L.push('');
  return L.join('\n');
}

function parseArgs(argv) {
  const args = { kanken: PATHS.kankenJsonl, out: HERE, doc: null, date: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--kanken') args.kanken = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--doc') args.doc = argv[++i];
    else if (a === '--date') args.date = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error('--date must be YYYY-MM-DD');
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const result = buildInventory(loadInputs({ kankenJsonlPath: args.kanken }));
  const out = resolve(args.out);
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'inventory.json'), stable(result.inventory));
  writeFileSync(resolve(out, 'gaps.json'), stable(result.gaps));
  writeFileSync(resolve(out, 'reconcile.json'), stable(result.reconcile));
  if (args.doc) writeFileSync(resolve(args.doc), renderDoc(result, { date: args.date }));
  process.stdout.write(`${result.inventory.report_lines['S6-AC3']}\nrows ${result.inventory.total_rows}; wrote ${relative(process.cwd(), out)}/{inventory,gaps,reconcile}.json${args.doc ? ` and ${args.doc}` : ''}\n`);
}
