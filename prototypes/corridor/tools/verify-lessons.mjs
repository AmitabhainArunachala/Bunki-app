/**
 * Deterministic integrity checks for the authored Corridor lesson asset.
 *
 * The lesson file is deliberately only a web of references. This verifier
 * follows those references into the canonical article, dictionary, grammar,
 * kanji, and stroke assets and refuses stale token positions or open-ended
 * practice data.
 *
 * Usage: node prototypes/corridor/tools/verify-lessons.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(TOOL_DIR, '..');
const DATA_DIR = resolve(CORRIDOR_DIR, 'data');

const LESSON_PATH = resolve(DATA_DIR, 'original', 'lessons-v1.json');
const ARTICLE_INDEX_PATH = resolve(DATA_DIR, 'articles', 'index.json');
const DICTIONARY_PATH = resolve(DATA_DIR, 'share_alike', 'dict.json');
const WORDS_PATH = resolve(DATA_DIR, 'share_alike', 'words.json');
const KANJI_PATH = resolve(DATA_DIR, 'share_alike', 'kanji.json');
const STROKES_PATH = resolve(DATA_DIR, 'share_alike', 'strokes.json');
const CORRIDOR_JS_PATH = resolve(CORRIDOR_DIR, 'corridor.js');

const results = [];
let failures = 0;

function check(name, pass, detail = '') {
  const result = { name, pass: Boolean(pass), detail: String(detail) };
  results.push(result);
  if (!result.pass) failures += 1;
  console.log(`${result.pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function unique(values) {
  return new Set(values).size === values.length;
}

function sameJSON(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function extractArrayLiteral(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`missing ${marker}`);
  const start = source.indexOf('[', markerIndex + marker.length);
  if (start < 0) throw new Error(`missing array after ${marker}`);

  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated array after ${marker}`);
}

function readCanonicalGrammar() {
  const source = readFileSync(CORRIDOR_JS_PATH, 'utf8');
  const literal = extractArrayLiteral(source, 'const GRAMMAR =');
  return vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1_000 });
}

const asset = readJSON(LESSON_PATH);
const articleIndex = readJSON(ARTICLE_INDEX_PATH);
const dictionary = readJSON(DICTIONARY_PATH).words;
const communityWords = readJSON(WORDS_PATH).words;
const kanji = readJSON(KANJI_PATH).kanji;
const strokesAsset = readJSON(STROKES_PATH);
const strokes = strokesAsset.strokes ?? strokesAsset;
const grammar = readCanonicalGrammar();

const lesson = asset.lessons?.[0];
const articleMeta = articleIndex.articles?.find((entry) => entry.id === lesson?.articleId);
const article = articleMeta ? readJSON(resolve(DATA_DIR, 'articles', articleMeta.file)) : null;
const sourceSpans = new Map((lesson?.sourceSpans ?? []).map((span) => [span.id, span]));
const canonicalGrammar = new Map(grammar.map((entry) => [entry.id, entry]));

function tokenSurface(articleRecord, tokenStart, tokenEnd) {
  if (!articleRecord || !Number.isInteger(tokenStart) || !Number.isInteger(tokenEnd)) return null;
  if (tokenStart < 0 || tokenEnd <= tokenStart || tokenEnd > articleRecord.tokens.length) return null;
  return articleRecord.tokens.slice(tokenStart, tokenEnd).map((token) => token.s).join('');
}

function spanSurface(span) {
  return tokenSurface(article, span.tokenStart, span.tokenEnd);
}

function focusSurface(span) {
  return tokenSurface(article, span.focus?.tokenStart, span.focus?.tokenEnd);
}

function resolveContent(content) {
  if (!content || typeof content !== 'object') return null;
  if (content.kind === 'article-span') {
    const span = sourceSpans.get(content.sourceSpanId);
    return span ? spanSurface(span) : null;
  }
  if (content.kind === 'article-focus') {
    const span = sourceSpans.get(content.sourceSpanId);
    return span ? focusSurface(span) : null;
  }
  if (content.kind === 'article-tokens') {
    if (content.articleId !== article?.id) return null;
    return tokenSurface(article, content.tokenStart, content.tokenEnd);
  }
  if (content.kind === 'grammar-example') {
    return canonicalGrammar.get(content.grammarId)?.ex?.[content.exampleIndex]?.ja ?? null;
  }
  return null;
}

function resolvesTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.t === 'grammar') return canonicalGrammar.has(target.id);
  if (target.t === 'word') return Boolean(dictionary[target.id] && communityWords[target.id]);
  if (target.t === 'kanji') return Boolean(kanji[target.id]);
  return false;
}

function walk(value, visit, path = '$') {
  visit(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${path}[${index}]`));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => walk(item, visit, `${path}.${key}`));
  }
}

console.log('\n— lesson envelope');
check(
  'asset has the versioned authored lesson envelope',
  asset.schema === 'bunki-lessons-v1' &&
    asset.version === 1 &&
    asset.pool === 'original' &&
    Array.isArray(asset.sources) &&
    asset.sources.length > 0,
  `${asset.schema ?? 'missing schema'} · v${asset.version ?? '?'}`,
);
check(
  'lesson IDs are finite and unique',
  Array.isArray(asset.lessons) &&
    asset.lessons.length === 1 &&
    asset.lessons.every((entry) => typeof entry.id === 'string' && entry.id.length > 0) &&
    unique(asset.lessons.map((entry) => entry.id)),
  `${asset.lessons?.length ?? 0} authored lesson(s)`,
);
check(
  'the first path slice has the intended identity',
  lesson?.id === 'n5-kitchen-teiru' &&
    lesson?.title === '今していること・台所の音' &&
    lesson?.articleId === 'bunki-graded-n5-kitchen',
  `${lesson?.id ?? 'missing lesson'} → ${lesson?.articleId ?? 'missing article'}`,
);

console.log('\n— canonical source references');
check(
  'lesson article resolves through the canonical Reader index',
  articleMeta?.file === 'bunki-graded-n5-kitchen.json' &&
    articleMeta?.pool === 'original' &&
    articleMeta?.authorLevel === 'N5' &&
    article?.id === articleMeta.id &&
    article?.title === '台所の音',
  articleMeta ? `${articleMeta.id} · ${articleMeta.file}` : 'article not found',
);

const expectedSpans = {
  'mother-cooking-sentence': {
    tokenStart: 0,
    tokenEnd: 13,
    focusStart: 8,
    focusEnd: 12,
    surface: '夜、母が台所で料理を作っています。',
    focus: '作っています',
  },
  'learner-reading-sentence': {
    tokenStart: 13,
    tokenEnd: 29,
    focusStart: 24,
    focusEnd: 28,
    surface: '私は隣の部屋で日本語の本を読んでいます。',
    focus: '読んでいます',
  },
};
const spanChecks = Object.entries(expectedSpans).map(([id, expected]) => {
  const span = sourceSpans.get(id);
  return Boolean(
    span &&
      span.articleId === article.id &&
      span.tokenStart === expected.tokenStart &&
      span.tokenEnd === expected.tokenEnd &&
      span.focus?.tokenStart === expected.focusStart &&
      span.focus?.tokenEnd === expected.focusEnd &&
      span.focus.tokenStart >= span.tokenStart &&
      span.focus.tokenEnd <= span.tokenEnd &&
      spanSurface(span) === expected.surface &&
      focusSurface(span) === expected.focus,
  );
});
check(
  'both lesson sentences and focus spans point at exact Reader tokens',
  sourceSpans.size === 2 && spanChecks.every(Boolean),
  [...sourceSpans.values()].map((span) => `${span.id}: ${focusSurface(span)}`).join(' · '),
);

const teiru = canonicalGrammar.get('teiru');
check(
  'grammar target and resulting-state comparison resolve canonically',
  teiru?.p === '〜ている' &&
    teiru?.lv === 'N5' &&
    teiru?.ex?.[1]?.ja === '窓が開いている。',
  teiru ? `${teiru.id} · ${teiru.ex?.[1]?.ja ?? 'missing example'}` : 'teiru not found',
);

const expectedWords = {
  料理: 'りょうり',
  作る: 'つくる',
  読む: 'よむ',
  台所: 'だいどころ',
};
const wordDetails = Object.entries(expectedWords).map(([id, reading]) => ({
  id,
  ok:
    dictionary[id]?.r === reading &&
    communityWords[id]?.r === reading &&
    dictionary[id]?.jlpt === 'N5' &&
    communityWords[id]?.jlpt === 5,
}));
check(
  'all four word IDs resolve in both canonical dictionary layers',
  wordDetails.every((entry) => entry.ok),
  wordDetails.map((entry) => `${entry.id}:${entry.ok ? 'ok' : 'missing'}`).join(' · '),
);
check(
  '読 resolves to its canonical kanji and stroke rooms',
  kanji['読']?.c === '読' &&
    kanji['読']?.kun?.includes('よ.む') &&
    kanji['読']?.kk === '9級' &&
    Array.isArray(strokes['読']) &&
    strokes['読'].length === kanji['読'].st,
  `${kanji['読']?.kk ?? 'no Kanken mapping'} · ${strokes['読']?.length ?? 0} strokes`,
);

console.log('\n— targets and encounters');
const expectedTargets = [
  ['grammar-teiru', 'grammar', 'teiru', [8, 24]],
  ['word-ryouri', 'word', '料理', [6]],
  ['word-tsukuru', 'word', '作る', [8]],
  ['word-yomu', 'word', '読む', [24]],
  ['word-daidokoro', 'word', '台所', [4]],
  ['kanji-yomu', 'kanji', '読', [24]],
];
const targets = lesson?.targets ?? [];
const targetKeys = targets.map((entry) => entry.key);
check(
  'target keys are finite, unique, and in the authored order',
  unique(targetKeys) &&
    sameJSON(targetKeys, expectedTargets.map(([key]) => key)),
  targetKeys.join(' → '),
);

const targetReferencesResolve = targets.every((entry, index) => {
  const [, type, id, encounterIndices] = expectedTargets[index] ?? [];
  if (!entry || entry.target?.t !== type || entry.target?.id !== id || !resolvesTarget(entry.target)) return false;
  if (!sameJSON(entry.encounters?.map((encounter) => encounter.tokenIndex), encounterIndices)) return false;
  return entry.encounters.every((encounter) => {
    const span = sourceSpans.get(encounter.sourceSpanId);
    if (
      encounter.articleId !== article.id ||
      !span ||
      encounter.tokenIndex < span.tokenStart ||
      encounter.tokenIndex >= span.tokenEnd
    ) return false;
    const token = article.tokens[encounter.tokenIndex];
    if (type === 'word') return token.b === id;
    if (type === 'kanji') return token.s.includes(id) || token.b.includes(id);
    return type === 'grammar' && ['作る', '読む'].includes(token.b);
  });
});
check(
  'every target resolves and every encounter points at the intended token',
  targetReferencesResolve,
  targets.map((entry) => `${entry.target?.t}:${entry.target?.id}`).join(' · '),
);

const targetShapes = [];
walk(asset, (value, path) => {
  if (path.endsWith('.target') && value && typeof value === 'object' && 't' in value && 'id' in value) {
    targetShapes.push(Object.keys(value).sort().join(','));
  }
});
check(
  'canonical targets carry only type and ID rather than copied definitions',
  targetShapes.length > 0 && targetShapes.every((shape) => shape === 'id,t'),
  `${targetShapes.length} target reference(s)`,
);

console.log('\n— finite lesson flow');
const expectedStepIds = ['notice', 'grammar', 'practice', 'kanji', 'reader', 'disposition', 'closure'];
const steps = lesson?.steps ?? [];
check(
  'lesson steps form the exact finite guided sequence',
  unique(steps.map((step) => step.id)) && sameJSON(steps.map((step) => step.id), expectedStepIds),
  steps.map((step) => step.title).join(' → '),
);

const grammarStep = steps.find((step) => step.id === 'grammar');
const kanjiStep = steps.find((step) => step.id === 'kanji');
const readerStep = steps.find((step) => step.id === 'reader');
check(
  'canonical room opens resolve and return to their exact lesson steps',
  grammarStep?.open?.target?.t === 'grammar' &&
    grammarStep.open.target.id === 'teiru' &&
    grammarStep.returnStepId === 'grammar' &&
    sameJSON(kanjiStep?.open?.map((entry) => entry.room), ['entry', 'strokes']) &&
    kanjiStep.open.every((entry) => entry.target?.t === 'kanji' && entry.target.id === '読') &&
    kanjiStep.returnStepId === 'kanji' &&
    readerStep?.open?.articleId === article.id &&
    readerStep?.open?.room === 'reader' &&
    readerStep?.returnStepId === 'reader',
  'grammar · kanji/strokes · reader',
);

const prompts = steps.flatMap((step) => step.prompts ?? []);
const expectedPromptIds = [
  'kitchen-teiru-ongoing-v1',
  'kitchen-teiru-reading-v1',
  'kitchen-teiru-state-v1',
  'kitchen-kanji-yomu-v1',
];
check(
  'prompt IDs are finite, unique, and versioned',
  prompts.length === 4 &&
    unique(prompts.map((prompt) => prompt.id)) &&
    sameJSON(prompts.map((prompt) => prompt.id), expectedPromptIds),
  prompts.map((prompt) => prompt.id).join(' · '),
);

const finitePrompts = prompts.every((prompt) => {
  const choiceIds = prompt.choices?.map((choice) => choice.id) ?? [];
  return (
    prompt.kind === 'single-choice' &&
    typeof prompt.promptJa === 'string' &&
    prompt.promptJa.length > 0 &&
    choiceIds.length >= 2 &&
    choiceIds.length <= 4 &&
    unique(choiceIds) &&
    choiceIds.filter((id) => id === prompt.answerChoiceId).length === 1 &&
    prompt.choices.every((choice) =>
      typeof choice.textJa === 'string' ? choice.textJa.length > 0 : Boolean(resolveContent(choice.content))) &&
    typeof prompt.feedback?.answerJa === 'string' &&
    typeof prompt.feedback?.revisitJa === 'string' &&
    typeof prompt.evidence?.capability === 'string' &&
    resolvesTarget(prompt.evidence?.target)
  );
});
check(
  'every prompt has bounded choices, one explicit answer, feedback, and typed evidence',
  finitePrompts,
  `${prompts.length} single-choice prompt(s)`,
);

const allContentReferences = [];
for (const prompt of prompts) {
  if (prompt.context) allContentReferences.push(prompt.context);
  for (const choice of prompt.choices) if (choice.content) allContentReferences.push(choice.content);
}
check(
  'all prompt content references resolve to canonical text',
  allContentReferences.length > 0 && allContentReferences.every((content) => Boolean(resolveContent(content))),
  allContentReferences.map((content) => resolveContent(content)).join(' · '),
);

const resolvedAnswers = Object.fromEntries(
  prompts.map((prompt) => {
    const answer = prompt.choices.find((choice) => choice.id === prompt.answerChoiceId);
    return [prompt.id, answer?.textJa ?? resolveContent(answer?.content)];
  }),
);
const expectedAnswers = {
  'kitchen-teiru-ongoing-v1': '作っています',
  'kitchen-teiru-reading-v1': '今、本を読んでいる',
  'kitchen-teiru-state-v1': '窓が開いている。',
  'kitchen-kanji-yomu-v1': 'よむ',
};
check(
  'the authored answers test the intended four distinctions',
  sameJSON(resolvedAnswers, expectedAnswers),
  Object.values(resolvedAnswers).join(' · '),
);

const evidenceReferencesResolve = prompts.every((prompt) => {
  const source = prompt.evidence.source;
  if ('articleId' in source) {
    return (
      source.articleId === article.id &&
      Number.isInteger(source.tokenIndex) &&
      source.tokenIndex >= 0 &&
      source.tokenIndex < article.tokens.length
    );
  }
  if ('grammarId' in source) {
    return Boolean(canonicalGrammar.get(source.grammarId)?.ex?.[source.exampleIndex]);
  }
  return false;
});
check(
  'practice evidence cites an exact article token or grammar example',
  evidenceReferencesResolve,
  prompts.map((prompt) => `${prompt.id}:${JSON.stringify(prompt.evidence.source)}`).join(' · '),
);

console.log('\n— explicit action and claim boundaries');
const disposition = steps.find((step) => step.id === 'disposition');
check(
  'Keep and Learn are explicit, cover the lesson targets, and have no default action',
  sameJSON(disposition?.targetKeys, expectedTargets.map(([key]) => key)) &&
    sameJSON(disposition?.actions, [
      { id: 'keep', label: '残す', effect: 'thread-only' },
      { id: 'learn', label: '覚える', effect: 'thread-and-review' },
    ]) &&
    disposition?.defaultAction === null,
  disposition?.actions?.map((action) => action.label).join(' / ') ?? 'missing actions',
);
check(
  'lesson state policy makes implicit writes impossible',
  sameJSON(lesson?.statePolicy, {
    implicitWrites: false,
    practiceAnswerWrites: 'practice-evidence-only',
    keepWrites: 'thread-only',
    learnWrites: 'thread-and-review',
    closureWrites: 'visit-progress-only',
  }),
  JSON.stringify(lesson?.statePolicy ?? {}),
);

const closure = steps.find((step) => step.id === 'closure');
check(
  'closure records navigation progress only',
  closure?.kind === 'visit-closure' &&
    sameJSON(closure?.records, ['visited-steps', 'lesson-completed-at']) &&
    closure?.claim === 'navigation-progress-only',
  `${closure?.records?.join(' · ') ?? 'missing records'}`,
);

const forbiddenClaims = [];
const forbiddenClaimFields = [];
const forbiddenEnglish = /\b(?:mastery|mastered|score|scored|streak|passed?|percentage|percent|known)\b/i;
const forbiddenJapanese = /習得|マスター|得点|点数|スコア|連続記録|合格|既知|達成率/;
walk(asset, (value, path) => {
  if (typeof value === 'string' && (forbiddenEnglish.test(value) || forbiddenJapanese.test(value))) {
    forbiddenClaims.push(`${path}: ${value}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (forbiddenEnglish.test(key) || forbiddenJapanese.test(key)) {
      forbiddenClaimFields.push(`${path}.${key}`);
    }
  }
});
check(
  'lesson copy makes no mastery, pass, streak, percentage, or score claim',
  forbiddenClaims.length === 0 && forbiddenClaimFields.length === 0,
  forbiddenClaims.length || forbiddenClaimFields.length
    ? [...forbiddenClaims, ...forbiddenClaimFields].join(' · ')
    : 'no prohibited claims',
);

const nondeterministicFields = [];
const forbiddenFields = /^(?:generatedAt|updatedAt|createdAt|timestamp|shuffle|random|seed|weight)$/i;
walk(asset, (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (forbiddenFields.test(key)) nondeterministicFields.push(`${path}.${key}`);
  }
});
const firstResolution = prompts.map((prompt) =>
  prompt.choices.map((choice) => choice.textJa ?? resolveContent(choice.content)),
);
const secondResolution = prompts.map((prompt) =>
  prompt.choices.map((choice) => choice.textJa ?? resolveContent(choice.content)),
);
check(
  'lesson content is deterministic and contains no random or time-derived fields',
  nondeterministicFields.length === 0 && sameJSON(firstResolution, secondResolution),
  nondeterministicFields.length ? nondeterministicFields.join(' · ') : 'fixed prompt and choice order',
);

console.log(`\n${results.length - failures}/${results.length} lesson checks passed`);
if (failures > 0) process.exitCode = 1;
