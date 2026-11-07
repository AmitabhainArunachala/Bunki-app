#!/usr/bin/env node
/* Kanji unit manifest DRAFT builder (L6.0; S6-R10, S6-R14, S6-R15, S6-AC9).
 * Writes MANIFEST-DRAFT.md (prose + exactly one fenced block `json kanji-unit-manifest`)
 * and DRAFT.json (the sha256 of the block's canonical JSON). Everything in the block is
 * derived from pinned files: the authored course (kanji-course.js) becomes the first
 * units verbatim; the remaining 常用 kanji through 2級 are grouped per grade by radical
 * into units of roughly 10–20 kanji; readings are the official 常用漢字表 on/kun; compounds
 * are attested words of words.json; distinctions are shape neighbours through kanji.json
 * parts; writing notes carry stroke count, radical, parts and the template source.
 * The first 準1級/1級 units need the X17 frequency source; X17 recorded it absent, so
 * the draft states that blocker and holds no `kanken`-wave unit (S6-R15: never substitute).
 * The date is injected (--date), never read from a clock. This is a draft: frozen false.
 *
 *   node build-manifest-draft.mjs --date YYYY-MM-DD [--version N] [--out <dir>]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadInputs, glyphFields, joyoMembership, teachingSet, GRADES_THROUGH_2, UPPER_GRADES, REPO_ROOT, FREQUENCY_SOURCE_STATUS, sha256 } from '../../kanken/inventory/build-inventory.mjs';
import { canonicalJson, sha256Hex, INFO_STRING, extractManifest } from './extract-manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_NAME = 'kanji-unit-manifest';
export const EXTRA_PATHS = Object.freeze({
  words: 'prototypes/corridor/data/share_alike/words.json',
  radicals214: 'prototypes/corridor/data/share_alike/radicals214.json',
});
const LEVEL_CODE = { '10級': 'k10', '9級': 'k9', '8級': 'k8', '7級': 'k7', '6級': 'k6', '5級': 'k5', '4級': 'k4', '3級': 'k3', '準2級': 'kj2', '2級': 'k2' };
const TARGET_UNIT_SIZE = 15;
const byCodePoint = (a, b) => (a.codePointAt(0) - b.codePointAt(0)) || (a < b ? -1 : a > b ? 1 : 0);
const pad2 = (n) => String(n).padStart(2, '0');

export function loadDraftInputs({ root = REPO_ROOT } = {}) {
  const inputs = loadInputs({ root });
  const words = readFileSync(resolve(root, EXTRA_PATHS.words));
  const radicals = readFileSync(resolve(root, EXTRA_PATHS.radicals214));
  inputs.words = JSON.parse(words.toString('utf8'));
  inputs.radicals214 = JSON.parse(radicals.toString('utf8'));
  inputs.pins.words_json = { path: EXTRA_PATHS.words, sha256: sha256(words), bytes: words.length };
  inputs.pins.radicals214 = { path: EXTRA_PATHS.radicals214, sha256: sha256(radicals), bytes: radicals.length };
  return inputs;
}

const REVIEW_OBLIGATIONS = Object.freeze([
  {
    reviewer: 'family',
    who: 'a model family different from the author family (MF1R; graph reviewer families zhipu, moonshot, deepseek; the author family is rejected)',
    checks: ['every unit carries the S6-R14 fields', 'prerequisites resolve and are acyclic', 'every 常用 kanji through 2級 sits in exactly one unit or in gaps.json with a reason', 'readings, compounds and distinctions trace to the pinned sources named per entry'],
    certifies: 'structure, coverage and provenance only; never Japanese truth',
  },
  {
    reviewer: 'native_sample',
    who: 'a native Japanese reviewer (L6.5, S6-DD5; human:native)',
    checks: ['readings as taught', 'compound glosses and naturalness', 'distinction notes', 'writing notes and stroke templates'],
    sample_rule: 'a documented stratified sample per grade; every error found is fixed; an error rate above 5% sends the stratum back for review (S6-DD5)',
  },
]);

function sinks(units) {
  const needed = new Set(units.flatMap((u) => u.prerequisites));
  return units.filter((u) => !needed.has(u.id)).map((u) => u.id);
}

function evenChunks(items, target) {
  const n = items.length;
  if (!n) return [];
  const count = Math.max(1, Math.round(n / target));
  const base = Math.floor(n / count);
  let extra = n - base * count;
  const chunks = [];
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    chunks.push(items.slice(at, at + size));
    at += size;
  }
  return chunks;
}

/** Build the manifest object. Pure apart from the inputs given. */
export function buildManifest(inputs, { date, version = 1 }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('an injected --date YYYY-MM-DD is required; the builder never reads a clock');
  const { rows, kanjiJson, referenceExtra, words, radicals214, course, pins } = inputs;
  const fields = glyphFields(inputs);
  const joyo = joyoMembership(referenceExtra);
  const teaching = teachingSet(course);
  const catalog = course.catalog();
  const kanji = kanjiJson.kanji;
  const joyoOn = new Map(referenceExtra.joyoOn.map((r) => [r[0], r[1]]));
  const joyoKun = new Map(referenceExtra.joyoKun.map((r) => [r[0], r[1]]));
  const records = new Map(referenceExtra.kanjiRecords.map((r) => [r[0], { meanings: r[1], strokeCount: r[2], classicalRadical: r[3] }]));
  const levelOf = new Map();
  for (const r of rows) if (r.form === '親字' && GRADES_THROUGH_2.includes(r.kanken_level)) levelOf.set(r.glyph, r.kanken_level);
  const gradeIndex = (g) => GRADES_THROUGH_2.indexOf(levelOf.get(g));
  const joyoGlyphs = [...joyo.glyphs].filter((g) => levelOf.has(g));
  if (joyoGlyphs.length !== joyo.glyphs.size) throw new Error('常用漢字表 membership and the jsonl 親字 rows 10級..2級 disagree; run the inventory first');

  // Word index: attested words of words.json with a gloss and a reading.
  const wordsByKanji = new Map();
  for (const word of Object.values(words.words)) {
    if (!word.g || !word.r || !Array.isArray(word.k) || !word.k.length) continue;
    for (const k of word.k) { if (!wordsByKanji.has(k)) wordsByKanji.set(k, []); wordsByKanji.get(k).push(word); }
  }
  const compoundsFor = (g) => {
    const level = gradeIndex(g);
    const list = (wordsByKanji.get(g) || []).map((w) => ({ w, bounded: w.k.every((k) => levelOf.has(k) && gradeIndex(k) <= level), jlpt: w.jlpt == null ? 0 : w.jlpt }));
    list.sort((a, b) => (Number(b.bounded) - Number(a.bounded)) || (b.jlpt - a.jlpt) || (a.w.w.length - b.w.w.length) || (a.w.w < b.w.w ? -1 : a.w.w > b.w.w ? 1 : 0));
    return list.slice(0, 2).map(({ w, bounded }) => ({ word: w.w, reading: w.r, gloss: w.g, source: 'words.json', bounded }));
  };

  // Shape neighbours through kanji.json parts and same radical + stroke count, 常用 only.
  const partIndex = new Map();
  const radStroke = new Map();
  for (const g of joyoGlyphs) {
    const e = kanji[g]; if (!e) continue;
    for (const p of e.parts || []) { if (!partIndex.has(p)) partIndex.set(p, new Set()); partIndex.get(p).add(g); }
    const key = `${e.rad}/${e.st}`; if (!radStroke.has(key)) radStroke.set(key, new Set()); radStroke.get(key).add(g);
  }
  const distinctionsFor = (g) => {
    const e = kanji[g]; if (!e) return [];
    const score = new Map();
    for (const p of e.parts || []) for (const o of partIndex.get(p) || []) if (o !== g) score.set(o, (score.get(o) || 0) + 1);
    for (const o of radStroke.get(`${e.rad}/${e.st}`) || []) if (o !== g) score.set(o, (score.get(o) || 0) + 0.5);
    return [...score.entries()].sort((a, b) => (b[1] - a[1]) || (Math.abs((kanji[a[0]].st || 0) - e.st) - Math.abs((kanji[b[0]].st || 0) - e.st)) || byCodePoint(a[0], b[0])).slice(0, 3).map(([o]) => o);
  };
  const radicalOf = (g) => {
    const e = kanji[g];
    const n = e ? e.rad : records.get(g)?.classicalRadical;
    const r = n != null ? radicals214[String(n)] : null;
    return r ? { n: r.n, glyph: r.c, name: r.name } : null;
  };
  const strokesOf = (g) => kanji[g]?.st ?? records.get(g)?.strokeCount ?? (inputs.strokesJson.strokes[g] ? inputs.strokesJson.strokes[g].length : null);
  const keywordOf = (g) => kanji[g]?.m || records.get(g)?.meanings?.[0] || null;
  const templateCode = (g) => { const t = fields.template(g); return t ? (t.startsWith('strokes.json') ? 'strokes.json' : 'parts-graph') : null; };
  const entryFor = (g, extra = {}) => {
    const compounds = compoundsFor(g);
    const base = {
      glyph: g, level: levelOf.get(g), on: joyoOn.get(g) || [], kun: joyoKun.get(g) || [],
      keyword: keywordOf(g), keyword_source: kanji[g] ? 'kanji.json' : 'kanjiRecords',
      compounds, distinctions: distinctionsFor(g),
      writing: { strokes: strokesOf(g), radical: radicalOf(g), parts: kanji[g]?.parts || [], template: templateCode(g), brush: fields.brush(g) },
    };
    if (!compounds.length) base.compound_gap = 'no attested word with a gloss in pinned words.json; the native sample supplies one';
    if (!base.distinctions.length) base.distinction_gap = kanji[g] ? 'no 常用 shape neighbour through kanji.json parts or radical+stroke count' : 'no kanji.json entry (official form outside the lookup table); native sample names confusables';
    return { ...base, ...extra };
  };
  const unitSummaries = (entries) => ({
    readings: { source: '常用漢字表 official on/kun per kanji (entries on/kun)', on_total: entries.reduce((s, e) => s + e.on.length, 0), kun_total: entries.reduce((s, e) => s + e.kun.length, 0), without_any_official_reading: entries.filter((e) => !e.on.length && !e.kun.length).map((e) => e.glyph) },
    compounds: { source: 'attested words of words.json (JMdict lineage, CC BY-SA) with gloss and reading; grade-bounded words preferred', count: entries.reduce((s, e) => s + e.compounds.length, 0), gaps: entries.filter((e) => !e.compounds.length).map((e) => e.glyph) },
    distinctions: { rule: '常用 shape neighbours sharing a component (kanji.json parts) or the same radical and stroke count; in-unit pairs are drilled against each other as distractors', in_unit_pairs: entries.flatMap((e) => e.distinctions.filter((d) => entries.some((o) => o.glyph === d) && byCodePoint(e.glyph, d) < 0).map((d) => [e.glyph, d])), gaps: entries.filter((e) => !e.distinctions.length).map((e) => e.glyph) },
    writing: { rule: 'stroke order from the pinned KanjiVG templates (strokes.json or the parts graph); the learner compares, the app states uncertainty, nothing auto-passes (S6-R11)', sources: { 'strokes.json': 'share_alike/strokes.json KanjiVG centerlines', 'parts-graph': 'parts-graph/graph.json pinned KanjiVG member', brush: 'AnimCJK outline approved in animcjk/equivalence.json' }, templates: `${entries.filter((e) => e.writing.template).length}/${entries.length}`, without_template: entries.filter((e) => !e.writing.template).map((e) => e.glyph) },
  });
  const outcomesFor = (entries, label) => [
    `Recognise each of the ${entries.length} kanji of ${label} and give its keyword (meaning recall).`,
    'Read each kanji inside an attested word (whole-word reading), not as an isolated reading list.',
    'Tell each kanji from its listed shape neighbours.',
    'Write each kanji in stroke order and judge the attempt by self-comparison; no automatic pass.',
  ];
  const assessmentFor = (kind) => ({
    meaning: 'keyword recall over every kanji of the unit, distractors drawn from the unit and its listed distinctions',
    reading: 'whole-word reading of each listed compound; kana answers normalised as in the course',
    writing: 'optional stroke-order self-comparison per kanji; states its uncertainty; never graded automatically (S6-R11)',
    pass_rule: 'every meaning and reading item answered; reveal or skip earns no credit; missed items repair without replacing the full-unit score',
    recorded_through: 'the engine task contract (C6, S6-R12); lesson evidence only',
    source: kind,
  });

  // 1. The authored course, verbatim as the first units.
  const courseUnits = teaching.units;
  const legacyUnits = courseUnits.filter((u) => u.id !== 'shiki-shoku');
  const units = courseUnits.map((u) => {
    const entries = u.targets.map((t) => entryFor(t.kanji, {
      keyword: t.meaning, keyword_source: 'course', ...(t.displayKeyword ? { display_keyword: t.displayKeyword } : {}),
      compounds: [{ word: t.wordKey, reading: t.readings[0], gloss: t.wordMeaning, source: 'course' }, ...(t.examples || []).map((x) => ({ word: x.wordKey, reading: x.readings[0], gloss: x.wordMeaning, source: 'course-example' }))],
      distinctions: [...t.distractors],
    }));
    const levels = [...new Set(entries.map((e) => e.level))].sort((a, b) => GRADES_THROUGH_2.indexOf(a) - GRADES_THROUGH_2.indexOf(b));
    return {
      id: u.id, wave: 'wave1', status: 'authored', title: u.title, entry: u.prerequisites.length === 0,
      source: { kind: 'kanji-course.js', course_id: catalog.id, course_revision: catalog.revision, unit_revision: u.revision, sha256: pins.kanji_course.sha256 },
      levels, prerequisites: [...u.prerequisites],
      outcomes: outcomesFor(entries, `the authored unit "${u.title}"`),
      kanji: entries, ...unitSummaries(entries),
      assessment: assessmentFor('kanji-course.js prompts: meaning choice, whole-word reading, optional writing self-comparison'),
      review_obligations: REVIEW_OBLIGATIONS.map((o) => ({ ...o })),
    };
  });

  // 2. The remaining 常用 kanji per grade, grouped by radical into even units.
  const courseSinks = sinks(legacyUnits);
  let previous = null;
  const taught = teaching.glyphs;
  for (const level of GRADES_THROUGH_2) {
    const remaining = joyoGlyphs.filter((g) => levelOf.get(g) === level && !taught.has(g));
    const sortKey = (g) => [kanji[g]?.rad ?? 999, kanji[g]?.st ?? 0];
    remaining.sort((a, b) => { const [ra, sa] = sortKey(a), [rb, sb] = sortKey(b); return (ra - rb) || (sa - sb) || byCodePoint(a, b); });
    const chunks = evenChunks(remaining, TARGET_UNIT_SIZE);
    chunks.forEach((glyphs, i) => {
      const id = `${LEVEL_CODE[level]}-${pad2(i + 1)}`;
      const entries = glyphs.map((g) => entryFor(g));
      const radCount = new Map();
      for (const e of entries) if (e.writing.radical) radCount.set(e.writing.radical.n, (radCount.get(e.writing.radical.n) || 0) + 1);
      const theme = [...radCount.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] - b[0])).slice(0, 3).map(([n, count]) => ({ ...radicals214[String(n)] && { n, glyph: radicals214[String(n)].c, name: radicals214[String(n)].name }, count }));
      const prerequisites = previous ? [previous] : [...courseSinks];
      const unit = {
        id, wave: 'wave1', status: 'planned', level, title: `${level} 第${i + 1}単元 — 部首 ${theme.map((t) => `${t.glyph}（${t.name}）`).join('・')}`,
        theme: { grouping: 'radical (kanji.json rad → radicals214) within the grade, then stroke count', radicals: theme },
        entry: false, prerequisites,
        outcomes: outcomesFor(entries, `${level} unit ${i + 1}`),
        kanji: entries, ...unitSummaries(entries),
        assessment: assessmentFor('planned on the kanji-course.js pattern: meaning choice, whole-word reading, optional writing self-comparison'),
        review_obligations: REVIEW_OBLIGATIONS.map((o) => ({ ...o })),
      };
      units.push(unit);
      previous = id;
    });
  }

  // 3. The first 準1級/1級 units: blocked on X17, never substituted.
  const upperCounts = Object.fromEntries(UPPER_GRADES.map((level) => [level, new Set(rows.filter((r) => r.kanken_level === level && r.form === '親字' && r.glyph !== '').map((r) => r.glyph)).size]));
  const frequencySource = null;
  const kankenFirstUnits = {
    status: 'blocked',
    rule: 'S6-R15: per grade two units of 10 kanji, the 20 most frequent 親字 of that grade in the frequency source X17 pins (name, version, sha256), built like the units through 2級',
    blocker: `X17 recorded the pinned kanji frequency source absent (${FREQUENCY_SOURCE_STATUS.looked_up}: ${FREQUENCY_SOURCE_STATUS.finding}); the 準1級 and 1級 first units cannot be drafted and no other count is substituted`,
    unblocks_when: 'X17 records a frequency source with name, version and sha256 under /root/bunki-campaign/inputs/; then rebuild with that record and bump version',
    candidate_pool: Object.fromEntries(UPPER_GRADES.map((level) => [level, { oyaji_glyphs: upperCounts[level], units_required: 2, kanji_per_unit: 10 }])),
    kanken_units_in_this_draft: 0,
  };

  const allKanji = units.flatMap((u) => u.kanji.map((e) => e.glyph));
  const manifest = {
    manifest: MANIFEST_NAME,
    version,
    draft_date: date,
    clock: 'injected through --date; the builder reads no clock',
    frozen: false,
    freeze_date: null,
    author: 'Claude (L6.0 builder; family anthropic)',
    author_family: 'anthropic',
    spec_refs: ['S6-R4', 'S6-R10', 'S6-R14', 'S6-R15', 'S6-DD3', 'S6-AC3', 'S6-AC9', 'S2-R20', 'S2-DD7'],
    scope: 'every unit through 2級 (the 2,136 常用 kanji as the 親字 rows 10級..2級 of the Kanken fact table) plus the first 準1級 and 1級 units, which are blocked (see kanken_first_units)',
    sources: pins,
    teaching_source: { path: pins.kanji_course.path, sha256: pins.kanji_course.sha256, course_id: catalog.id, revision: catalog.revision, units: courseUnits.length, distinct_kanji: taught.size },
    waves: { wave1: 'units through 2級', kanken: 'first 準1級 and 1級 units (none in this draft: blocked)' },
    entry_fields: {
      on_kun: '常用漢字表 official readings (reference-extra joyoOn/joyoKun)',
      keyword: 'kanji.json m, reference-extra kanjiRecords, or the course target meaning (keyword_source)',
      compounds: 'word/reading/gloss from words.json (source words.json; bounded = every kanji at or below the grade) or from kanji-course.js (course, course-example)',
      distinctions: '常用 shape neighbours through kanji.json parts or the same radical and stroke count; course units keep their authored distractors',
      writing: 'strokes (kanji.json st or kanjiRecords), radical (radicals214 by kanji.json rad), parts (kanji.json), template (strokes.json | parts-graph | null), brush (AnimCJK approved)',
    },
    unit_rules: {
      entry: 'a unit with entry true is a first unit and may have no prerequisites; every other unit names at least one prerequisite unit id; the order is acyclic',
      size: 'authored course units keep their authored size; planned units hold roughly 10–20 kanji (target 15), grouped by radical within the grade',
      status: 'authored = exists in kanji-course.js; planned = drafted here from pinned data, not yet authored or natively reviewed',
      coverage: 'every 常用 kanji through 2級 appears in exactly one unit; gaps.json in kanken/inventory lists the teaching gaps of the authored course with reasons',
    },
    frequency_source: frequencySource,
    kanken_first_units: kankenFirstUnits,
    unit_count: units.length,
    kanji_count: allKanji.length,
    distinct_kanji: new Set(allKanji).size,
    units,
  };
  return manifest;
}

/** Pretty JSON that keeps each kanji entry on one line (objects at depth >= compactDepth are compact). */
export function prettyJson(value, indent = 2, compactDepth = 4, depth = 0) {
  const pad = ' '.repeat(indent * (depth + 1));
  const end = ' '.repeat(indent * depth);
  if (value === null || typeof value !== 'object' || depth >= compactDepth) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (value.every((v) => v === null || typeof v !== 'object')) return JSON.stringify(value);
    return '[\n' + value.map((v) => pad + prettyJson(v, indent, compactDepth, depth + 1)).join(',\n') + '\n' + end + ']';
  }
  const keys = Object.keys(value);
  if (!keys.length) return '{}';
  return '{\n' + keys.map((k) => pad + JSON.stringify(k) + ': ' + prettyJson(value[k], indent, compactDepth, depth + 1)).join(',\n') + '\n' + end + '}';
}

export function renderMarkdown(manifest) {
  const L = [];
  const row = (cells) => '| ' + cells.join(' | ') + ' |';
  L.push('# Kanji unit manifest — DRAFT');
  L.push('');
  L.push(`Version ${manifest.version}, draft date ${manifest.draft_date} (injected clock), **not frozen** (frozen: false, freeze_date: null). The freeze (MF1) reads the single fenced block below through \`extract-manifest.mjs\`, hashes its canonical JSON (keys sorted, UTF-8) and dates it; \`DRAFT.json\` beside this file records that hash for the draft. Nothing here certifies Japanese truth: the author family drafts, a different model family reviews structure (MF1R), and a native sample reviews content (L6.5). Spec: S6-R10, S6-R14, S6-R15, S6-AC9.`);
  L.push('');
  L.push('## How the block was built');
  L.push('');
  L.push(`- **Scope.** ${manifest.scope}.`);
  L.push(`- **Authored core.** The ${manifest.teaching_source.units} units of \`${manifest.teaching_source.path}\` (course \`${manifest.teaching_source.course_id}\` revision ${manifest.teaching_source.revision}, ${manifest.teaching_source.distinct_kanji} kanji) enter verbatim as \`status: authored\` units with their own ids, prerequisites, taught words, distractors and writing rule.`);
  L.push(`- **Planned units.** The remaining 常用 kanji are grouped per grade (10級 → 2級) by radical (\`kanji.json\` rad → \`radicals214.json\`) and stroke count, then cut into even units of roughly 15 kanji (ids \`k10-01\` … \`k2-NN\`, \`kj2\` = 準2級). The first planned unit follows every sink of the authored course; each later unit follows the previous one, so the order is a chain and acyclic.`);
  L.push('- **Readings** are the official 常用漢字表 on/kun lists (reference-extra joyoOn/joyoKun). **Compounds** are attested words of `words.json` with a gloss and reading, preferring words whose kanji are all at or below the grade; a kanji with no attested word says so (`compound_gap`). **Distinctions** are 常用 shape neighbours through `kanji.json` parts or the same radical and stroke count. **Writing** carries stroke count, radical, parts and the pinned template source (strokes.json or the parts graph, both KanjiVG), with the S6-R11 rule.');
  L.push('- **Assessment and review obligations** are stated per unit: meaning recall, whole-word reading, optional writing self-comparison; a family reviewer (different family) and a native sample (L6.5).');
  L.push(`- **First 準1級 / 1級 units: blocked.** ${manifest.kanken_first_units.blocker}. Unblocks when ${manifest.kanken_first_units.unblocks_when}.`);
  L.push('- **Deciding what the data cannot.** Theme labels are radicals, not pedagogy; unit cuts are even by count; the native sample and the family reviewer judge the grouping. Kanji without a kanji.json entry (𠮟, 剝) take readings from the official list and meanings from reference-extra kanjiRecords.');
  L.push('');
  L.push('## Unit index (derived from the block)');
  L.push('');
  L.push(row(['id', 'wave', 'status', 'grade(s)', 'kanji', 'theme / title', 'prerequisites']));
  L.push(row(['---', '---', '---', '---', '---:', '---', '---']));
  for (const u of manifest.units) L.push(row([u.id, u.wave, u.status, (u.levels || [u.level]).join(' '), String(u.kanji.length), u.title.replace(/\|/g, '／'), u.prerequisites.length ? u.prerequisites.join(', ') : (u.entry ? '(entry unit)' : '')]));
  L.push('');
  L.push(`Units ${manifest.unit_count}; kanji ${manifest.kanji_count} (${manifest.distinct_kanji} distinct); kanken-wave units ${manifest.kanken_first_units.kanken_units_in_this_draft}.`);
  L.push('');
  L.push('## The block');
  L.push('');
  L.push('```' + INFO_STRING);
  L.push(prettyJson(manifest));
  L.push('```');
  L.push('');
  return L.join('\n');
}

function parseArgs(argv) {
  const args = { date: null, version: 1, out: HERE };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--date') args.date = argv[++i];
    else if (a === '--version') args.version = Number(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  if (!Number.isInteger(args.version) || args.version < 1) throw new Error('--version must be a positive integer');
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const inputs = loadDraftInputs();
  const manifest = buildManifest(inputs, { date: args.date, version: args.version });
  const markdown = renderMarkdown(manifest);
  const extracted = extractManifest(markdown);
  if (canonicalJson(extracted.value) !== canonicalJson(manifest)) throw new Error('round trip failed: the extracted block differs from the built manifest');
  const out = resolve(args.out);
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'MANIFEST-DRAFT.md'), markdown);
  const draft = {
    schema: 'bunki.kanji-unit-manifest.draft/1',
    manifest: MANIFEST_NAME,
    manifest_path: relative(REPO_ROOT, resolve(out, 'MANIFEST-DRAFT.md')),
    block_info_string: INFO_STRING,
    extractor: relative(REPO_ROOT, resolve(HERE, 'extract-manifest.mjs')),
    version: manifest.version,
    draft_date: manifest.draft_date,
    frozen: false,
    freeze_date: null,
    author_family: manifest.author_family,
    unit_count: manifest.unit_count,
    kanji_count: manifest.kanji_count,
    distinct_kanji: manifest.distinct_kanji,
    kanken_units: manifest.kanken_first_units.kanken_units_in_this_draft,
    frequency_source: manifest.frequency_source,
    kanken_first_units_status: manifest.kanken_first_units.status,
    canonical_json: { rule: 'object keys sorted recursively, arrays in order, no whitespace, UTF-8', sha256: extracted.sha256, bytes: extracted.canonical_bytes },
    source_pins: manifest.sources,
  };
  writeFileSync(resolve(out, 'DRAFT.json'), JSON.stringify(draft, null, 2) + '\n');
  process.stdout.write(`units ${manifest.unit_count}, kanji ${manifest.kanji_count} (${manifest.distinct_kanji} distinct), block sha256 ${extracted.sha256}, markdown ${Buffer.byteLength(markdown)} bytes\n`);
}
