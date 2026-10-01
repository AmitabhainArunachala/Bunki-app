#!/usr/bin/env node
/** Machine-checked written JLPT practice tests (N1–N5).
 *
 * A separate admission class from the pinned, host-reviewed written sections in bank.mjs:
 * every item is original, authored in a manuscript under authoring/written-bank/, and kept
 * only when independent verifier model families (never the author's) chose its key blind
 * and flagged nothing. The learner sees each test as 検収前 until John's own review.
 *
 *   node written-bank.mjs validate [--draft] <manuscript.json>...
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVEL_PROFILES } from './prepare-expanded-bank-jobs.mjs';
import { answerBalanceProblems, assertAnswerBalance, formAnswerKeys } from './answer-balance.mjs';
import {
  MACHINE_CHECK_DECISION,
  MACHINE_CHECK_LABEL,
  MACHINE_CHECK_POLICY,
  MACHINE_CHECK_ROUTE,
  isMachineCheckedEntry,
} from './machine-checked-class.mjs';

export const REPOSITORY = fileURLToPath(new URL('../../../../', import.meta.url));
export const CORRIDOR = join(REPOSITORY, 'prototypes/corridor');
export const MANUSCRIPTS = fileURLToPath(new URL('./authoring/written-bank/', import.meta.url));
export const MANUSCRIPT_SCHEMA = 'bunki-written-bank-manuscript/1';

/** Per-test task allocation. Local authoring rules scaled from the official written sections
 * (LEVEL_PROFILES) — not official fixed counts. Timing is not authored here: every test runs
 * the official written papers of its level, with their official times (OFFICIAL_BLUEPRINTS):
 * N1 110, N2 105 minutes in one paper; N3 30+70, N4 25+55, N5 20+40 in two. */
export const WRITTEN_BANK_LEVELS = Object.freeze({
  N1: {
    blueprint: {
      'kanji-reading': 4, 'contextual-expression': 4, paraphrase: 3, usage: 3,
      'grammar-form': 6, 'sentence-composition': 3, 'text-grammar': 3,
      'short-reading': 3, 'mid-reading': 4, 'integrated-reading': 2, 'claim-reading': 3,
      'information-retrieval': 2,
    },
  },
  N2: {
    blueprint: {
      'kanji-reading': 3, orthography: 2, 'word-formation': 2, 'contextual-expression': 3,
      paraphrase: 3, usage: 2,
      'grammar-form': 6, 'sentence-composition': 3, 'text-grammar': 3,
      'short-reading': 3, 'mid-reading': 4, 'integrated-reading': 2, 'claim-reading': 2,
      'information-retrieval': 2,
    },
  },
  N3: {
    blueprint: {
      'kanji-reading': 4, orthography: 3, 'contextual-expression': 3, paraphrase: 2, usage: 2,
      'grammar-form': 6, 'sentence-composition': 2, 'text-grammar': 3,
      'short-reading': 3, 'mid-reading': 3, 'long-reading': 2, 'information-retrieval': 2,
    },
  },
  N4: {
    blueprint: {
      'kanji-reading': 3, orthography: 2, 'contextual-expression': 3, paraphrase: 2, usage: 1,
      'grammar-form': 6, 'sentence-composition': 2, 'text-grammar': 2,
      'short-reading': 3, 'mid-reading': 2, 'information-retrieval': 2,
    },
  },
  N5: {
    blueprint: {
      'kanji-reading': 3, orthography: 3, 'contextual-expression': 2, paraphrase: 2,
      'grammar-form': 5, 'sentence-composition': 2, 'text-grammar': 2,
      'short-reading': 3, 'mid-reading': 2, 'information-retrieval': 2,
    },
  },
});
export const LEVEL_JLPT_TAG = { N1: 1, N2: 2, N3: 3, N4: 4, N5: 5 };
const ITEM_FIELDS = new Set([
  'skill', 'task', 'prompt', 'options', 'answer', 'rationale', 'target', 'subject', 'passage',
  'passages', 'doubts',
]);
const WORD_TASKS = new Set([
  'kanji-reading', 'orthography', 'contextual-expression', 'paraphrase', 'usage',
]);
const BRACKETED = new Set(['kanji-reading', 'orthography', 'paraphrase']);
const JAPANESE = /[぀-ヿ㐀-鿿]/u;
const AVOID_THEME = /神社|神道|古事記|日本書紀|天照|鳥居|祝詞|八百万|神話/u;

const skillOf = (level, task) =>
  LEVEL_PROFILES[level].allocation.find(([skill, name]) => name === task && skill !== 'listening')?.[0];

/** Grammar and particle identities the app resolves at runtime (corridor.js GRAMMARS/PARTICLES). */
function arrayLiteral(source, name) {
  const start = source.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error(`corridor.js lacks ${name}`);
  let depth = 0;
  const open = source.indexOf('[', start);
  for (let index = open; index < source.length; index++) {
    if (source[index] === '[') depth++;
    else if (source[index] === ']' && --depth === 0)
      return new Function(`return ${source.slice(open, index + 1)}`)();
  }
  throw new Error(`Unterminated ${name}`);
}
let referencePromise;
export function referenceData() {
  return (referencePromise ??= (async () => {
    const source = await readFile(join(CORRIDOR, 'corridor.js'), 'utf8');
    const grammarV11 = JSON.parse(
      await readFile(join(CORRIDOR, 'data/original/grammar-v11.json'), 'utf8'),
    ).entries;
    const grammar = new Map(
      [...arrayLiteral(source, 'GRAMMAR'), ...grammarV11].map((row) => [row.id, row]),
    );
    const particles = new Set(arrayLiteral(source, 'PARTICLES').map((row) => row.id));
    const dictionary = JSON.parse(
      await readFile(join(CORRIDOR, 'data/share_alike/dict.json'), 'utf8'),
    ).words;
    const words = JSON.parse(
      await readFile(join(CORRIDOR, 'data/share_alike/words.json'), 'utf8'),
    ).words;
    const kanji = JSON.parse(await readFile(join(CORRIDOR, 'data/share_alike/kanji.json'), 'utf8'));
    return { grammar, particles, dictionary, words, kanji: kanji.kanji ?? kanji };
  })());
}

/** The single canonical subject an item's tested target maps to, or null for task-level. */
export function manuscriptSubject(entry) {
  if (entry.target !== undefined) return `word:${entry.target}`;
  if (entry.subject !== undefined) return entry.subject;
  return null;
}

export async function validateManuscript(manuscript, { draft = false, file = null } = {}) {
  const problems = [], warnings = [];
  const ref = await referenceData();
  const fail = (message) => problems.push(message);
  const level = manuscript?.level;
  const spec = WRITTEN_BANK_LEVELS[level];
  if (manuscript?.schema !== MANUSCRIPT_SCHEMA) fail(`schema must be ${MANUSCRIPT_SCHEMA}`);
  if (!spec) return { problems: [...problems, `unknown level ${level}`], warnings };
  if (!Number.isSafeInteger(manuscript.number) || manuscript.number < 1 || manuscript.number > 9)
    fail('number must be 1–9');
  const stem = `${level.toLowerCase()}-written-${String(manuscript.number).padStart(2, '0')}`;
  if (file && basename(file) !== `${stem}.json`) fail(`file must be named ${stem}.json`);
  if (manuscript.authorModelFamily !== 'anthropic-claude') fail('authorModelFamily must be anthropic-claude');
  if (typeof manuscript.authorModel !== 'string' || !manuscript.authorModel) fail('authorModel required');
  const passages = manuscript.passages;
  if (!passages || typeof passages !== 'object' || Array.isArray(passages)) fail('passages object required');
  const items = Array.isArray(manuscript.items) ? manuscript.items : [];
  if (!items.length) fail('items required');
  const counts = {};
  const used = new Set();
  for (const [index, entry] of items.entries()) {
    const at = `item ${index + 1}`;
    const unknown = Object.keys(entry).filter((key) => !ITEM_FIELDS.has(key));
    if (unknown.length) fail(`${at}: unknown fields ${unknown.join(', ')}`);
    counts[entry.task] = (counts[entry.task] ?? 0) + 1;
    if (!(entry.task in spec.blueprint)) fail(`${at}: task ${entry.task} is not in the ${level} blueprint`);
    if (skillOf(level, entry.task) !== entry.skill) fail(`${at}: ${entry.task} is not a ${entry.skill} task at ${level}`);
    if (typeof entry.prompt !== 'string' || !JAPANESE.test(entry.prompt)) fail(`${at}: Japanese prompt required`);
    if (
      !Array.isArray(entry.options) || entry.options.length !== 4 ||
      entry.options.some((text) => typeof text !== 'string' || !text.trim() || text !== text.trim()) ||
      new Set(entry.options).size !== 4
    )
      fail(`${at}: exactly four distinct trimmed options required`);
    if (!Number.isSafeInteger(entry.answer) || entry.answer < 0 || entry.answer > 3) fail(`${at}: answer must be 0–3`);
    const lines = typeof entry.rationale === 'string' ? entry.rationale.split('\n') : [];
    if (lines.length < 2 || !JAPANESE.test(lines[0]) ||
        (lines.at(-1).match(/[A-Za-z]+/gu) ?? []).length < 4)
      fail(`${at}: rationale needs Japanese first and one English line last`);
    if (entry.target !== undefined && entry.subject !== undefined) fail(`${at}: use target or subject, not both`);
    if (WORD_TASKS.has(entry.task) && entry.target === undefined) fail(`${at}: ${entry.task} needs its tested word as target`);
    const subject = manuscriptSubject(entry);
    if (subject !== null) {
      const cut = subject.indexOf(':');
      const kind = subject.slice(0, cut), id = subject.slice(cut + 1);
      if (kind === 'word') {
        if (!Object.hasOwn(ref.dictionary, id)) fail(`${at}: target ${id} is not a dictionary headword`);
        const tag = ref.words[id]?.jlpt;
        if (tag !== undefined && tag !== null && Math.abs(tag - LEVEL_JLPT_TAG[level]) > 1)
          warnings.push(`${at}: target ${id} is tagged N${tag}`);
      } else if (kind === 'grammar') {
        if (!ref.grammar.has(id)) fail(`${at}: grammar ${id} is not an app grammar id`);
      } else if (kind === 'particle') {
        if (!ref.particles.has(id)) fail(`${at}: particle ${id} is not an app particle id`);
      } else if (kind === 'kanji') {
        if ([...id].length !== 1) fail(`${at}: kanji subject must be one character`);
      } else fail(`${at}: subject namespace must be word, grammar, particle or kanji`);
    }
    if (BRACKETED.has(entry.task)) {
      const marks = [...(entry.prompt ?? '').matchAll(/【([^】]+)】/gu)]
        .map((match) => match[1])
        .filter((mark) => mark.trim());
      if (marks.length !== 1) fail(`${at}: ${entry.task} prompt needs exactly one 【】`);
      else if (entry.task !== 'orthography' && marks[0] !== entry.target)
        fail(`${at}: 【${marks[0]}】 differs from target ${entry.target}`);
      else if (entry.task === 'orthography' && entry.options[entry.answer] !== entry.target)
        fail(`${at}: orthography target must be the keyed spelling`);
    }
    if (entry.task === 'sentence-composition') {
      // The sentence (after the instruction line) has four blanks, written ＿＿＿, one of them ＿★＿.
      const sentence = entry.prompt.slice(entry.prompt.indexOf('\n') + 1);
      if ((sentence.match(/★/gu) ?? []).length !== 1 || (sentence.match(/＿★＿/gu) ?? []).length !== 1)
        fail(`${at}: exactly one ＿★＿ blank required`);
      if ((sentence.match(/＿＿＿|＿★＿/gu) ?? []).length !== 4) fail(`${at}: four blanks (＿＿＿ or ＿★＿) required`);
    }
    const refs = entry.passages ?? (entry.passage !== undefined ? [entry.passage] : []);
    const needsPassage = entry.skill === 'reading' || entry.task === 'text-grammar';
    if (needsPassage && !refs.length) fail(`${at}: ${entry.task} needs a passage`);
    if (!needsPassage && refs.length) fail(`${at}: ${entry.task} must not reference a passage`);
    if (entry.task === 'integrated-reading' && refs.length !== 2) fail(`${at}: integrated reading needs passages A and B`);
    for (const key of refs) {
      if (!Object.hasOwn(passages ?? {}, key)) fail(`${at}: missing passage ${key}`);
      used.add(key);
    }
    if (entry.task === 'text-grammar') {
      const gap = entry.prompt.match(/（([０-９0-9]+)）/u)?.[1];
      if (!gap || !passages?.[refs[0]]?.includes(`（${gap}）`)) fail(`${at}: text-grammar prompt gap is not in its passage`);
    }
    const text = [entry.prompt, ...(entry.options ?? []), ...refs.map((key) => passages?.[key] ?? '')].join('\n');
    if (AVOID_THEME.test(text)) warnings.push(`${at}: Shinto/Kojiki theme word`);
  }
  for (const key of Object.keys(passages ?? {})) {
    if (!used.has(key)) fail(`passage ${key} is unused`);
    if (typeof passages[key] !== 'string' || !JAPANESE.test(passages[key])) fail(`passage ${key} must be Japanese text`);
  }
  for (const [task, expected] of Object.entries(spec.blueprint)) {
    const actual = counts[task] ?? 0;
    if (draft ? actual !== expected : actual > expected) fail(`${task}: ${actual} items, blueprint ${expected}`);
  }
  for (const skill of ['vocabulary', 'grammar', 'reading'])
    if (!items.some((entry) => entry.skill === skill)) fail(`no ${skill} items`);
  return { problems, warnings };
}

/** Cross-form separation at one level: no repeated tested target, prompt or passage. */
export function assertLevelSeparation(manuscripts) {
  const problems = [];
  const seen = new Map();
  for (const manuscript of manuscripts) {
    const name = `${manuscript.level}#${manuscript.number}`;
    const keys = [
      ...manuscript.items.map((entry) => ['target', manuscriptSubject(entry)]),
      // Passage-bound prompts (reading, text-grammar) are instructions; their passages carry identity.
      ...manuscript.items.map((entry) => ['prompt', entry.passage !== undefined || entry.passages ? null : entry.prompt]),
      ...Object.values(manuscript.passages).map((text) => ['passage', text]),
    ].filter(([, value]) => value && !/^(grammar|particle):/u.test(value));
    for (const [kind, value] of keys) {
      const key = `${kind}:${value}`;
      if (seen.has(key) && seen.get(key) !== name) problems.push(`${kind} ${value.slice(0, 40)} repeats in ${seen.get(key)} and ${name}`);
      else seen.set(key, name);
    }
  }
  return problems;
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const PUBLIC_DIRECTORY = join(CORRIDOR, 'data/assessment');
export const WRITTEN_BANK_SOURCE = Object.freeze({
  id: 'bunki-original-jlpt-written-bank-20260928',
  title: 'Bunki original JLPT written tests (N1–N5), machine-checked',
  edition: '2026-09-28',
  url: null,
  location: 'prototypes/corridor/tools/assessment/authoring/written-bank/',
  sourceClass: 'original-ai',
  distribution: 'public-candidate',
  processRef: 'claude-original-jlpt-written-bank-20260928',
  rightsBasis: 'bunki-original-authoring-20260923',
});
// Not the unfilled N1 pin's source id: that pin keeps its own record for host review.
const LEGACY_N1_SOURCE = Object.freeze({
  id: 'bunki-original-n1-r3-20260925',
  title: 'Bunki original N1 written practice draft r3',
  edition: 'r3',
  url: null,
  location: 'prototypes/corridor/tools/assessment/authoring/n1-practice-originals.r3.mjs',
  sourceClass: 'original-ai',
  distribution: 'public-candidate',
  processRef: 'claude-original-n1-practice-20260925',
  rightsBasis: 'bunki-original-authoring-20260923',
});
const HOST_EVIDENCE = process.env.BUNKI_WRITTEN_BANK_EVIDENCE ??
  join(homedir(), '.dharma/bunki_review/2026-09-28/jlpt/publish');

/** The bank spec for one manuscript; the prepared form carries every value below. */
export function writtenBankSpec(manuscript, bytes) {
  const { level, number } = manuscript;
  const stem = `${level.toLowerCase()}-written-${String(number).padStart(2, '0')}`;
  return {
    stem: `kairo-original-jlpt-${stem}`,
    titleJa: `${level} 筆記テスト ${number}`,
    titleEn: `${level} written test ${number}`,
    source: WRITTEN_BANK_SOURCE,
    spec: {
      level,
      id: `kairo-original-jlpt-${stem}`,
      titleJa: `${level} 筆記テスト ${number}`,
      titleEn: `${level} written test ${number}`,
      sourceId: WRITTEN_BANK_SOURCE.id,
      processRef: WRITTEN_BANK_SOURCE.processRef,
      rightsBasis: WRITTEN_BANK_SOURCE.rightsBasis,
      blueprintId: `jlpt-${level.toLowerCase()}-facts-20260910`,
      timing: 'official',
      policyVersion: `${level.toLowerCase()}-written-bank-allocation-20260928`,
      authorModelFamily: manuscript.authorModelFamily,
      forbiddenTasks: [],
      nonOfficialTasks: {},
      items: manuscript.items,
      passages: manuscript.passages,
      status: { level, authorModelFamily: manuscript.authorModelFamily },
      manuscriptSha256: sha(bytes),
    },
  };
}

/** The r3 N1 draft keeps its own reviewed spec and exact module bytes. */
export async function legacyN1Manuscript(path) {
  const bytes = await readFile(path);
  const module = await import(`data:text/javascript;base64,${bytes.toString('base64')}`);
  const { WRITTEN_SPECS } = await import('./prepare-originals.mjs');
  const manuscript = {
    schema: MANUSCRIPT_SCHEMA,
    level: 'N1',
    number: 12,
    authorModelFamily: module.n1WrittenDraftStatus.authorModelFamily,
    authorModel: 'claude (r3 draft, 2026-09-25)',
    passages: module.n1WrittenPassages,
    items: module.n1WrittenItems,
    legacy: true,
  };
  return {
    bytes,
    manuscript,
    stem: WRITTEN_SPECS.N1.id,
    titleJa: 'N1 文字・語彙・文法・読解の練習 · 12問',
    titleEn: 'N1 written practice · 12 questions',
    source: LEGACY_N1_SOURCE,
    spec: {
      ...WRITTEN_SPECS.N1,
      items: module.n1WrittenItems,
      passages: module.n1WrittenPassages,
      status: module.n1WrittenDraftStatus,
      manuscriptSha256: sha(bytes),
    },
  };
}

const skillCountsOf = (form) =>
  Object.fromEntries(
    ['vocabulary', 'grammar', 'reading', 'listening'].map((skill) => [
      skill,
      form.items.filter((item) => item.skill === skill).length,
    ]),
  );

/** 'official-fact' when every block is an official written paper, else 'authoring-rule'. */
export function timingAuthorityOf(form) {
  const kinds = new Set(form.timingBlocks.map((block) => block.authority.kind));
  if (kinds.size !== 1) throw new Error(`${form.id}: mixed timing authority`);
  return [...kinds][0];
}

/** Build one immutable form, its media-free delivery with per-item provenance, its public
 * machine-check record and its catalog entry. Every item must already be kept. */
export async function buildWrittenBankEntry(unit, verdicts) {
  const { itemDecision, VERIFIER_FAMILIES } = await import('./machine-check.mjs');
  const { prepareWrittenOriginal } = await import('./prepare-originals.mjs');
  const { assessmentAPI, materializeWrittenSection } = await import('./bank.mjs');
  const api = await assessmentAPI();
  const { manuscript, bytes, spec } = unit;
  const decisions = manuscript.items.map((entry, index) => ({
    index,
    entry,
    decision: itemDecision(manuscript, entry, verdicts),
  }));
  const blocked = decisions.filter(({ decision }) => !['kept', 'kept-degraded'].includes(decision.status));
  if (blocked.length)
    throw new Error(
      `${unit.stem}: items not kept by the machine check: ${blocked.map(({ index, decision }) => `q${index + 1} ${decision.status}`).join(', ')}`,
    );
  const officialTiming = spec.timing === 'official' ? api.getOfficialBlueprint(spec.blueprintId) : null;
  if (spec.timing === 'official' && !officialTiming) throw new Error(`${unit.stem}: no official blueprint ${spec.blueprintId}`);
  const prepared = prepareWrittenOriginal({ ...spec, officialTiming });
  const section = await materializeWrittenSection(prepared, {
    bytes,
    items: manuscript.items,
    passages: manuscript.passages,
  });
  const { form } = section;
  const formBytes = section.files['form.json'];
  if (form.items.length !== manuscript.items.length) throw new Error(`${unit.stem}: item count changed in mapping`);
  assertAnswerBalance(form);
  const label = (family) => VERIFIER_FAMILIES.find((row) => row.family === family)?.label ?? family;
  const reviewItems = decisions.map(({ index, entry, decision }) => {
    const item = form.items[index];
    const key = item.response.options.findIndex((option) => option.id === item.response.answerOptionId) + 1;
    if (key !== entry.answer + 1) throw new Error(`${unit.stem}: key moved in mapping at q${index + 1}`);
    return {
      itemId: item.id,
      itemSha256: item.sha256,
      viewSha256: decision.view,
      key,
      status: decision.status,
      verdicts: decision.answered.map((row) => ({
        family: row.family,
        model: row.model,
        choice: row.choice,
        flags: row.flags,
        responseSha256: row.responseSha256,
      })),
    };
  });
  const families = [...new Set(reviewItems.flatMap((row) => row.verdicts.map((verdict) => verdict.family)))];
  const review = {
    schema: 'bunki-machine-check-review/1',
    form: api.artifactReference(form),
    route: MACHINE_CHECK_ROUTE,
    policy: MACHINE_CHECK_POLICY,
    status: 'machine-checked',
    acceptance: 'awaiting-john',
    label: MACHINE_CHECK_LABEL,
    rule: 'Each verifier family solved every item blind (no key, no rationale) and could flag ambiguity, no correct option or unnatural Japanese. An item is kept only when every family that answered chose the key and none flagged it: at least three families, or two when a family could not answer. The author family never verifies its own items.',
    author: { family: manuscript.authorModelFamily, model: manuscript.authorModel },
    verifierFamilies: families,
    manuscriptSha256: spec.manuscriptSha256,
    bindingSha256: sha(Buffer.from(JSON.stringify(section.binding, null, 2) + '\n')),
    items: reviewItems,
    officialScoreCalibrated: false,
  };
  const reviewSha256 = api.encodeLocalJson(review).sha256;
  const delivery = {
    schema: 'kairo-assessment-bank-delivery/1',
    form: api.artifactReference(form),
    assets: [],
    units: [],
    itemChecks: reviewItems.map((row) => ({
      itemId: row.itemId,
      author: manuscript.authorModelFamily,
      verifiers: row.verdicts.map((verdict) => label(verdict.family)),
      agreed: row.verdicts.length,
    })),
  };
  const deliverySha256 = api.encodeLocalJson(delivery).sha256;
  const entry = {
    id: form.id,
    level: manuscript.level,
    mode: 'written',
    titleJa: unit.titleJa,
    titleEn: unit.titleEn,
    questionCount: form.items.length,
    durationMinutes: form.timingBlocks.reduce((total, block) => total + block.durationMs, 0) / 60_000,
    // Only official timing is declared; an entry without it keeps its authored practice time.
    ...(timingAuthorityOf(form) === 'official-fact' ? { timingAuthority: 'official-fact' } : {}),
    skillCounts: skillCountsOf(form),
    sourceClass: 'original-ai',
    sourceIds: [unit.source.id],
    publicationRoute: MACHINE_CHECK_ROUTE,
    formPath: `forms/${unit.stem}-${form.sha256}.json`,
    formSha256: form.sha256,
    editorialAtStart: {
      status: 'ai-reviewed-practice',
      policyVersion: MACHINE_CHECK_POLICY,
      decisionRevisionIds: [`machine-check-v1:${reviewSha256}`],
    },
    deliveryPath: `delivery/${unit.stem}-${deliverySha256}.json`,
    deliverySha256,
    mediaAssets: [],
    review: {
      status: 'machine-checked',
      acceptance: 'awaiting-john',
      label: MACHINE_CHECK_LABEL,
      evidencePath: `reviews/${unit.stem}-${reviewSha256}.json`,
    },
    machineCheck: {
      authorFamily: manuscript.authorModelFamily,
      verifierFamilies: families,
      items: reviewItems.length,
      threeFamilies: reviewItems.filter((row) => row.verdicts.length >= 3).length,
      twoFamilies: reviewItems.filter((row) => row.verdicts.length === 2).length,
    },
    availability: { ready: true, reasons: [] },
    scoreMethod: 'raw-practice-results',
    officialScoreCalibrated: false,
  };
  if (!isMachineCheckedEntry(entry)) throw new Error(`${unit.stem}: entry does not match its admission class`);
  return { entry, form, formBytes, delivery, review, binding: section.binding, decisions: reviewItems };
}

const tracked = (path) => {
  try {
    execFileSync('git', ['-C', REPOSITORY, 'cat-file', '-e', `HEAD:${relative(REPOSITORY, path)}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const LEVEL_ORDER = { N1: 0, N2: 1, N3: 2, N4: 3, N5: 4 };

/** Rebuild the machine-checked entries from their manuscripts. Other catalog entries are
 * untouched. A previously committed revision moves to archivedEntries; an uncommitted
 * one is simply replaced. Default is a dry run. */
export async function publishWrittenBank(units, { publicDirectory = PUBLIC_DIRECTORY, publish = false } = {}) {
  const { loadVerdicts } = await import('./machine-check.mjs');
  const verdicts = await loadVerdicts();
  const built = [];
  for (const unit of units) built.push({ unit, ...(await buildWrittenBankEntry(unit, verdicts)) });
  built.sort((a, b) => LEVEL_ORDER[a.entry.level] - LEVEL_ORDER[b.entry.level] ||
    (a.entry.questionCount < 20) - (b.entry.questionCount < 20) || (a.entry.id < b.entry.id ? -1 : 1));
  const catalog = JSON.parse(await readFile(join(publicDirectory, 'catalog.json'), 'utf8'));
  const sources = JSON.parse(await readFile(join(publicDirectory, 'sources.json'), 'utf8'));
  const next = built.map(({ entry }) => entry);
  const keep = catalog.entries.filter((entry) => entry.publicationRoute !== MACHINE_CHECK_ROUTE);
  const archived = [...(catalog.archivedEntries ?? [])];
  const removed = [];
  for (const prior of catalog.entries.filter((entry) => entry.publicationRoute === MACHINE_CHECK_ROUTE)) {
    if (next.some((entry) => JSON.stringify(entry) === JSON.stringify(prior))) continue;
    if (tracked(join(publicDirectory, prior.formPath))) archived.push(prior);
    else removed.push(prior);
  }
  const entries = [...keep, ...next];
  const nextCatalog = {
    ...catalog,
    entries,
    archivedEntries: archived,
    revision: sha(JSON.stringify({ entries, archivedEntries: archived })),
  };
  const addedSources = [...new Set(built.map(({ unit }) => unit.source))]
    .filter((source) => !sources.sources.some((row) => row.id === source.id));
  if (publish) {
    const referenced = new Set(entries.flatMap((entry) => [entry.formPath, entry.deliveryPath, entry.review?.evidencePath]));
    for (const prior of removed)
      for (const path of [prior.formPath, prior.deliveryPath, prior.review.evidencePath])
        if (!referenced.has(path) && !tracked(join(publicDirectory, path))) await rm(join(publicDirectory, path), { force: true });
    const writeOnce = async (path, bytes) => {
      await mkdir(dirname(path), { recursive: true });
      try {
        await writeFile(path, bytes, { flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (!(await readFile(path)).equals(bytes)) throw new Error(`Immutable bank file differs: ${path}`);
      }
    };
    await mkdir(HOST_EVIDENCE, { recursive: true });
    for (const { entry, formBytes, delivery, review, binding, unit } of built) {
      await writeOnce(join(publicDirectory, entry.formPath), formBytes);
      await writeOnce(join(publicDirectory, entry.deliveryPath), Buffer.from(JSON.stringify(delivery, null, 2) + '\n'));
      await writeOnce(join(publicDirectory, entry.review.evidencePath), Buffer.from(JSON.stringify(review, null, 2) + '\n'));
      await writeFile(join(HOST_EVIDENCE, `${unit.stem}.binding.json`), JSON.stringify(binding, null, 2) + '\n');
    }
    await writeFile(join(publicDirectory, 'catalog.json'), JSON.stringify(nextCatalog, null, 2) + '\n');
    if (addedSources.length) {
      // Append as text so the registry's existing formatting is untouched.
      const text = await readFile(join(publicDirectory, 'sources.json'), 'utf8');
      const close = text.lastIndexOf('\n  ]');
      if (close < 0 || !text.slice(0, close).trimEnd().endsWith('}')) throw new Error('Unexpected sources.json layout');
      const added = addedSources.map((source) =>
        JSON.stringify(source, null, 2).split('\n').map((line) => `    ${line}`).join('\n'));
      const next = `${text.slice(0, close).trimEnd()},\n${added.join(',\n')}${text.slice(close)}`;
      JSON.parse(next);
      await writeFile(join(publicDirectory, 'sources.json'), next);
    }
  }
  return { catalog: nextCatalog, built, removed, archived: archived.length - (catalog.archivedEntries ?? []).length };
}

/** A balanced revision moves options only: the same items in the same order, each with its
 * prompt, passages, rationale, subjects and option texts unchanged, and its key text
 * byte-identical. Returns how many keys moved. */
export function assertPermutedRevision(prior, next) {
  const fail = (why) => { throw new Error(`Permuted revision ${next.id}: ${why}`); };
  if (prior.id !== next.id || prior.items.length !== next.items.length) fail('is not the same form');
  if (JSON.stringify(prior.passages.map((row) => [row.id, row.textSha256])) !==
      JSON.stringify(next.passages.map((row) => [row.id, row.textSha256])))
    fail('passages changed');
  let moved = 0;
  prior.items.forEach((before, index) => {
    const after = next.items[index];
    for (const field of ['id', 'skill', 'task', 'prompt', 'rationale', 'translatedInstruction'])
      if (before[field] !== after[field]) fail(`q${index + 1} ${field} changed`);
    for (const field of ['subjects', 'passages'])
      if (JSON.stringify(before[field].map((row) => row.id ?? row)) !== JSON.stringify(after[field].map((row) => row.id ?? row)))
        fail(`q${index + 1} ${field} changed`);
    const texts = (item) => item.response.options.map((option) => option.text);
    if (JSON.stringify([...texts(before)].sort()) !== JSON.stringify([...texts(after)].sort())) fail(`q${index + 1} options changed`);
    const key = (item) => item.response.options.find((option) => option.id === item.response.answerOptionId).text;
    if (key(before) !== key(after)) fail(`q${index + 1} key text changed`);
    if (texts(before).indexOf(key(before)) !== texts(after).indexOf(key(after))) moved++;
  });
  return moved;
}

/** Public-file verification of every machine-checked entry: no personal runtime files needed. */
export async function verifyMachineCheckedCatalog(publicDirectory = PUBLIC_DIRECTORY, catalog = null) {
  const { assessmentAPI, boundedAsset } = await import('./bank.mjs');
  const api = await assessmentAPI();
  catalog ??= JSON.parse(await readFile(join(publicDirectory, 'catalog.json'), 'utf8'));
  const sources = JSON.parse(await readFile(join(publicDirectory, 'sources.json'), 'utf8'));
  const rows = [];
  for (const entry of catalog.entries.filter((row) => row.publicationRoute === MACHINE_CHECK_ROUTE)) {
    const fail = (why) => { throw new Error(`Machine-checked entry ${entry.id}: ${why}`); };
    if (!isMachineCheckedEntry(entry) || entry.availability?.ready !== true || !/^N[1-5]$/u.test(entry.level))
      fail('does not match its admission class');
    const formBytes = await readFile(await boundedAsset(publicDirectory, entry.formPath));
    const form = api.parseFormVersion(JSON.parse(formBytes.toString('utf8')));
    if (form.id !== entry.id || form.sha256 !== entry.formSha256 || !entry.formPath.endsWith(`-${form.sha256}.json`))
      fail('form identity differs');
    if (form.exam.family !== 'jlpt' || form.exam.track !== entry.level || form.scope !== 'section-practice' ||
        form.media.length || form.items.some((item) => item.media.length || item.skill === 'listening'))
      fail('form is not a media-free written form at its level');
    if (form.items.length !== entry.questionCount ||
        JSON.stringify(skillCountsOf(form)) !== JSON.stringify(entry.skillCounts) ||
        form.timingBlocks.reduce((total, block) => total + block.durationMs, 0) !== entry.durationMinutes * 60_000)
      fail('declared counts or time differ from the form');
    // Official timing: exactly the level's written papers, in order, with their official minutes.
    const timing = timingAuthorityOf(form);
    if (timing !== (entry.timingAuthority ?? 'authoring-rule')) fail('declared timing authority differs from the form');
    if (timing === 'official-fact') {
      const blueprint = api.getOfficialBlueprint(form.blueprintId);
      const papers = blueprint?.timingBlocks.filter((fact) => fact.duration === 'fixed' && !fact.skills.includes('listening')) ?? [];
      if (blueprint?.exam.track !== entry.level || papers.length !== form.timingBlocks.length ||
          form.timingBlocks.some((block, index) => block.authority.blockId !== papers[index].id ||
            block.durationMs !== papers[index].minutes * 60_000 ||
            block.sectionIds.some((id) => !papers[index].skills.includes(form.sections.find((section) => section.id === id)?.skill))))
        fail('timing is not the official written papers of its level');
    }
    // answer-balance: flat key positions, as on the official papers.
    const { keys, tasks } = formAnswerKeys(form);
    const balance = answerBalanceProblems(keys, tasks);
    if (balance.length) fail(`answer-balance: ${balance.join('; ')}`);
    const source = sources.sources.find((row) => row.id === entry.sourceIds[0]);
    if (entry.sourceIds.length !== 1 || source?.sourceClass !== 'original-ai' || source.distribution !== 'public-candidate')
      fail('source is not a registered original');
    for (const artifact of [form, ...form.items, ...form.passages])
      if (artifact.provenance.kind !== 'original-ai' || artifact.provenance.processRef !== source.processRef ||
          artifact.provenance.sources.length !== 0 ||
          ['display', 'retain', 'sync', 'adapt'].some((operation) => artifact.rights[operation]?.status !== 'allowed' ||
            artifact.rights[operation]?.basisRef !== source.rightsBasis))
        fail(`artifact lacks original public rights: ${artifact.id}`);
    const delivery = JSON.parse(await readFile(await boundedAsset(publicDirectory, entry.deliveryPath), 'utf8'));
    if (api.encodeLocalJson(delivery).sha256 !== entry.deliverySha256 ||
        Object.keys(delivery).sort().join(',') !== 'assets,form,itemChecks,schema,units' ||
        delivery.schema !== 'kairo-assessment-bank-delivery/1' || delivery.assets.length || delivery.units.length ||
        delivery.form?.id !== form.id || delivery.form.sha256 !== form.sha256 || delivery.form.revisionId !== form.revisionId)
      fail('delivery is not the pinned media-free presentation');
    const review = JSON.parse(await readFile(await boundedAsset(publicDirectory, entry.review.evidencePath), 'utf8'));
    const reviewSha256 = api.encodeLocalJson(review).sha256;
    if (entry.editorialAtStart.decisionRevisionIds[0] !== `machine-check-v1:${reviewSha256}` ||
        !entry.review.evidencePath.endsWith(`-${reviewSha256}.json`) || !MACHINE_CHECK_DECISION.test(`machine-check-v1:${reviewSha256}`))
      fail('decision does not pin its machine-check record');
    if (review.schema !== 'bunki-machine-check-review/1' || review.route !== MACHINE_CHECK_ROUTE ||
        review.policy !== MACHINE_CHECK_POLICY || review.status !== 'machine-checked' || review.acceptance !== 'awaiting-john' ||
        review.label !== MACHINE_CHECK_LABEL || review.form?.sha256 !== form.sha256 || review.officialScoreCalibrated !== false ||
        review.items?.length !== form.items.length)
      fail('machine-check record does not match');
    const author = review.author?.family;
    if (!author || entry.machineCheck.authorFamily !== author) fail('author family is not recorded');
    form.items.forEach((item, index) => {
      const row = review.items[index];
      const check = delivery.itemChecks[index];
      const key = item.response.options.findIndex((option) => option.id === item.response.answerOptionId) + 1;
      const families = row?.verdicts?.map((verdict) => verdict.family) ?? [];
      if (row?.itemId !== item.id || row.itemSha256 !== item.sha256 || row.key !== key) fail(`q${index + 1} record does not pin the item and key`);
      if (new Set(families).size !== families.length || families.includes(author)) fail(`q${index + 1} verifier families are not independent`);
      if (families.length < 2 || (families.length < 3 && row.status !== 'kept-degraded') || (families.length >= 3 && row.status !== 'kept'))
        fail(`q${index + 1} lacks the required independent agreement`);
      if (row.verdicts.some((verdict) => verdict.choice !== key || verdict.flags.length))
        fail(`q${index + 1} has a disagreeing or flagged verdict`);
      if (check?.itemId !== item.id || check.author !== author || check.agreed !== families.length || check.verifiers.length !== families.length)
        fail(`q${index + 1} learner provenance differs from its record`);
    });
    rows.push({ entry, form, review });
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'publish' || command === 'plan') {
    const legacyAt = rest.indexOf('--legacy-n1');
    const legacy = legacyAt >= 0 ? rest.splice(legacyAt, 2)[1] : null;
    const units = [];
    for (const file of rest.filter((arg) => !arg.startsWith('--'))) {
      const bytes = await readFile(file);
      const manuscript = JSON.parse(bytes.toString('utf8'));
      const { problems } = await validateManuscript(manuscript, { file });
      if (problems.length) throw new Error(`${basename(file)}: ${problems.join('; ')}`);
      units.push({ manuscript, bytes, ...writtenBankSpec(manuscript, bytes) });
    }
    if (legacy) units.push(await legacyN1Manuscript(legacy));
    const result = await publishWrittenBank(units, { publish: command === 'publish' });
    for (const { entry } of result.built)
      console.log(`${entry.level} ${entry.id}: ${entry.questionCount} q, ${entry.durationMinutes} min, 3-family ${entry.machineCheck.threeFamilies}, 2-family ${entry.machineCheck.twoFamilies}`);
    console.log(`${command === 'publish' ? 'published' : 'dry run'}: ${result.built.length} entries; replaced ${result.removed.length}; archived ${result.archived}`);
    if (command === 'publish') {
      const rows = await verifyMachineCheckedCatalog();
      console.log(`verified ${rows.length} machine-checked entries from public files`);
    }
    process.exit(0);
  }
  if (command === 'export-legacy') {
    const unit = await legacyN1Manuscript(rest[0]);
    await writeFile(rest[1], JSON.stringify(unit.manuscript, null, 2) + '\n');
    console.log(`wrote ${rest[1]}`);
    process.exit(0);
  }
  if (command === 'verify') {
    const rows = await verifyMachineCheckedCatalog();
    console.log(`verified ${rows.length} machine-checked entries`);
    process.exit(0);
  }
  if (command !== 'validate') {
    console.error('Usage: written-bank.mjs validate [--draft] <manuscript.json>... | plan|publish <manuscript.json>... [--legacy-n1 file.mjs] | verify | export-legacy <file.mjs> <out.json>');
    process.exit(2);
  }
  const draft = rest.includes('--draft');
  const files = rest.filter((arg) => arg !== '--draft');
  const loaded = [];
  let failed = false;
  for (const file of files) {
    const manuscript = JSON.parse(await readFile(file, 'utf8'));
    loaded.push(manuscript);
    const { problems, warnings } = await validateManuscript(manuscript, { draft, file });
    console.log(`${basename(file)}: ${manuscript.items?.length ?? 0} items, ${problems.length} problems, ${warnings.length} warnings`);
    for (const line of problems) console.log(`  PROBLEM ${line}`);
    for (const line of warnings) console.log(`  warn ${line}`);
    failed ||= problems.length > 0;
  }
  const byLevel = Object.groupBy(loaded, (manuscript) => manuscript.level);
  for (const group of Object.values(byLevel))
    for (const line of assertLevelSeparation(group)) {
      console.log(`  PROBLEM ${line}`);
      failed = true;
    }
  process.exitCode = failed ? 1 : 0;
}
