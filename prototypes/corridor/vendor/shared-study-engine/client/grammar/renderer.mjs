/** Grammar presentation only. All enrollment, timing, grades and capture effects
 * belong to the shared host/backend. Prepare once before starting an attempt. */
import { reviewObjectHash, validateCoverageBinding } from '../content/translation-coverage.mjs';
import { splitSourceRuby } from '../player/ruby-segments.mjs';

const MEANING = 'grammar.meaning.v1';
const CLOZE = 'grammar.cloze.v1';
const preparedRecords = new WeakMap();
const require = (ok, message) => { if (!ok) throw new Error(message); };

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

function validateTokens(text, tokens) {
  require(Array.isArray(tokens), 'Missing source token spans');
  let pos = 0;
  for (const token of tokens) {
    require(token.surface && token.unit === 'utf16' && token.start === pos &&
      token.end === pos + token.surface.length &&
      (token.reading === null || typeof token.reading === 'string'), 'Invalid token span');
    pos = token.end;
  }
  require(tokens.map(t => t.surface).join('') === text && pos === text.length,
    'Tokens must reconstruct complete source');
}

function validateExample(example) {
  const {ja, en, cloze, targetSpan: span, sourceCodepointSpan: codepoints} = example;
  require(typeof ja === 'string' && ja.trim() && typeof en === 'string' && en.trim() &&
    typeof cloze === 'string' && cloze.trim() && cloze !== ja, 'Missing full grammar example');
  require(ja.split(cloze).length === 2 && span?.unit === 'utf16' &&
    Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 &&
    span.end <= ja.length && span.end > span.start &&
    ja.slice(span.start, span.end) === cloze, 'Invalid actual inflected target span');
  require(codepoints?.unit === 'unicode-codepoint' &&
    Number.isInteger(codepoints.start) && Number.isInteger(codepoints.end) &&
    codepoints.start >= 0 && codepoints.end > codepoints.start &&
    Array.from(ja).slice(codepoints.start, codepoints.end).join('') === cloze &&
    Array.from(ja.slice(0, span.start)).length === codepoints.start,
    'Invalid source codepoint span');
  validateTokens(ja, example.tokens);
}

/** identityRegistry/reviewIndex are supplied by the authenticated, hash-checked
 * shared content loader. This function does not fetch or write anything. */
export async function prepareGrammarModule(input, {identityRegistry, reviewIndex, qaMode = false} = {}) {
  require(input?.format === 'nihongo-grammar-module' && input.version === 1,
    'Unsupported grammar module');
  require(qaMode || (!input.qaOnly && input.distributionStatus === 'translation-verified'),
    'QA-only grammar cannot be installed for study');
  require(identityRegistry?.format === 'nihongo-identity-registry' && identityRegistry.version === 1,
    'Frozen identity registry required');
  require(input.identityRegistrySha256 === await reviewObjectHash(identityRegistry),
    'Grammar identity registry hash mismatch');
  require(input.readingSource?.kind === 'machine-reading' &&
    input.readingSource.reviewStatus === 'native-unreviewed', 'Machine readings must be source-labelled');
  const module = structuredClone(input);
  const ids = new Set();
  const examples = new Set();
  const tasks = new Map();
  const registeredTasks = identityRegistry.tasks.filter(t =>
    t.contractId === MEANING || t.contractId === CLOZE);
  require(new Set(registeredTasks.map(t => t.taskKey)).size === registeredTasks.length,
    'Duplicate frozen grammar task');
  require(module.tasks.length === registeredTasks.length, 'Missing or extra grammar task');
  for (const task of module.tasks) {
    const frozen = registeredTasks.find(t => t.taskKey === task.taskKey);
    require(frozen && Object.keys(frozen).length === Object.keys(task).length &&
      Object.keys(frozen).every(k => JSON.stringify(frozen[k]) === JSON.stringify(task[k])),
    'Grammar task differs from frozen descriptor');
    require(!tasks.has(task.taskKey), 'Duplicate task key');
    tasks.set(task.taskKey, task);
  }
  const frozenExampleIds = new Set(identityRegistry.examples.map(e => e.exampleId));
  for (const record of module.records) {
    require(!ids.has(record.guid), 'Duplicate grammar record');
    ids.add(record.guid);
    require(record.moduleId === 'grammar' && record.pattern && record.meaning &&
      record.formation && record.nuance && record.source &&
      record.contentRevision && ['N2', 'N1'].includes(record.level), 'Missing grammar content/provenance');
    require(record.examples.length === 3, 'Grammar needs three complete examples');
    require(record.relatedReferences.length === record.similar.length &&
      record.relatedReferences.every((ref, i) => ref.status === 'text-only' &&
        ref.noteGuid === null && ref.text === record.similar[i]), 'Unresolved related patterns must stay text');
    for (const field of ['pattern', 'meaning', 'formation', 'nuance']) {
      validateTokens(record[field], record.fieldTokens[field]);
    }
    for (const example of record.examples) {
      require(!examples.has(example.exampleId) && frozenExampleIds.has(example.exampleId) &&
        example.exampleId.startsWith(`${record.guid}:example:`), 'Invalid frozen example identity');
      examples.add(example.exampleId);
      validateExample(example);
      const coverage = await validateCoverageBinding(example.englishBinding, {
        ja: example.ja, en: example.en, expectedGuid: example.exampleId,
        reviewIndex, requireVerified: !qaMode,
      });
      require(coverage.ok, `Full-English binding rejected for ${example.exampleId}: ${coverage.errors.join('; ')}`);
    }
    const own = [...tasks.values()].filter(t => t.noteGuid === record.guid);
    require(own.length === 2 && new Set(own.map(t => t.contractId)).size === 2,
      'Meaning and Recall must have independent task keys');
    for (const task of own) {
      const slot = task.contractId === MEANING ? 1 : 2;
      require(task.taskKey === JSON.stringify([record.guid, task.contractId, task.passageId]) &&
        task.passageId === `${record.guid}:example:${slot}` &&
        record.examples.some(e => e.exampleId === task.passageId), 'Retrieval task/example mismatch');
    }
    preparedRecords.set(record, {tasks: new Map(own.map(t => [t.taskKey, t])),
      readingSource: module.readingSource, contentLabel: module.contentLabel, qaMode});
  }
  require(ids.size === identityRegistry.notes.filter(n => n.kind === 'grammar').length &&
    examples.size === frozenExampleIds.size && module.counts.records === ids.size &&
    module.counts.examples === examples.size && module.counts.tasks === tasks.size,
  'Grammar module inventory mismatch');
  for (const task of tasks.values()) require(ids.has(task.noteGuid), 'Unmapped grammar task');
  return freeze(module);
}

function resolve(record, task) {
  const prepared = preparedRecords.get(record);
  const frozen = prepared?.tasks.get(task?.taskKey);
  require(frozen === task, 'Render only prepared immutable task/record pairs');
  return {prepared, example: record.examples.find(e => e.exampleId === task.passageId)};
}

function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function gapText(example) {
  return example.ja.slice(0, example.targetSpan.start) + '［　　］' +
    example.ja.slice(example.targetSpan.end);
}

/** Executable front invariant, also usable by independent mutant tests. No
 * solution-bearing back node is constructed or parked hidden on the front. */
export function assertGrammarFrontIntegrity(root, record, task) {
  const {example} = resolve(record, task);
  const expected = task.contractId === MEANING ? record.pattern + example.ja : example.en + gapText(example);
  require(root.textContent === expected, 'Front answer leak or altered cue');
  require(!root.querySelector('ruby,rt,button,a,input,textarea,select,details,[hidden]'),
    'Front cannot contain readings, lookup or concealed answer controls');
  for (const node of [root, ...root.querySelectorAll('*')]) {
    require([...node.attributes].every(a => ['class', 'lang'].includes(a.name)),
      'Front answer-bearing attributes forbidden');
  }
  return true;
}

export function renderGrammarFront(document, record, task) {
  const {example} = resolve(record, task);
  const root = element(document, 'section', 'grammar-front');
  if (task.contractId === MEANING) {
    root.append(element(document, 'h2', 'grammar-pattern', record.pattern));
    const passage = element(document, 'p', 'passage');
    passage.lang = 'ja';
    passage.append(document.createTextNode(example.ja.slice(0, example.targetSpan.start)),
      element(document, 'mark', 'grammar-target', example.cloze),
      document.createTextNode(example.ja.slice(example.targetSpan.end)));
    root.append(passage);
  } else {
    root.append(element(document, 'p', 'grammar-cue', example.en));
    const passage = element(document, 'p', 'passage', gapText(example));
    passage.lang = 'ja';
    root.append(passage);
  }
  assertGrammarFrontIntegrity(root, record, task);
  return root;
}

function tokenBase(document, token, targetSpan) {
  const fragment = document.createDocumentFragment();
  if (targetSpan && token.end > targetSpan.start && token.start < targetSpan.end) {
    const a = Math.max(0, targetSpan.start - token.start);
    const b = Math.min(token.surface.length, targetSpan.end - token.start);
    fragment.append(document.createTextNode(token.surface.slice(0, a)),
      element(document, 'mark', 'grammar-target', token.surface.slice(a, b)),
      document.createTextNode(token.surface.slice(b)));
  } else fragment.append(document.createTextNode(token.surface));
  return fragment;
}

function appendTokens(document, parent, tokens, origin, onCapture, targetSpan) {
  for (const token of tokens) {
    const node = document.createDocumentFragment();
    const split = splitSourceRuby(token.surface, token.reading || '');
    for (const part of split.segments) {
      const base = tokenBase(document, {...part, start: token.start + part.start, end: token.start + part.end}, targetSpan);
      if (part.reading) {
        const ruby = document.createElement('ruby');
        ruby.dataset.rubyAlignment = split.status;
        if (split.reason) ruby.dataset.rubyFallback = split.reason;
        ruby.append(base, element(document, 'rt', '', part.reading));
        node.append(ruby);
      } else node.append(base);
    }
    if (typeof onCapture === 'function' && /[ぁ-ヿ一-鿿㐀-䶿]/u.test(token.surface)) {
      const button = element(document, 'button', 'grammar-lookup');
      button.type = 'button';
      button.append(node);
      button.addEventListener('click', event => {
        event.stopPropagation();
        onCapture(freeze({...origin, where: origin.field, kind: 'capture-intent', surface: token.surface,
          reading: token.reading, readingStatus: token.reading ? 'machine-unreviewed' : 'unavailable',
          span: {start: token.start, end: token.end, unit: 'utf16'}}));
      });
      parent.append(button);
    } else parent.append(node);
  }
}

export function renderGrammarBack(document, record, task, {onCapture} = {}) {
  const {prepared, example: selected} = resolve(record, task);
  const root = element(document, 'section', 'grammar-back');
  const origin = {moduleId: 'grammar', noteGuid: record.guid, taskKey: task.taskKey,
    contractId: task.contractId, passageId: task.passageId, contentRevision: record.contentRevision};
  for (const [field, tag, cls] of [['pattern', 'h2', 'grammar-pattern'], ['meaning', 'p', 'meaning'],
    ['formation', 'p', 'grammar-formation'], ['nuance', 'p', 'grammar-nuance']]) {
    const node = element(document, tag, cls);
    appendTokens(document, node, record.fieldTokens[field],
      {...origin, field, context: record[field]}, onCapture);
    root.append(node);
  }
  const related = element(document, 'ul', 'grammar-related');
  for (const reference of record.relatedReferences) {
    related.append(element(document, 'li', '', reference.text));
  }
  root.append(related);
  const ordered = [selected, ...record.examples.filter(e => e !== selected)];
  for (const example of ordered) {
    const block = element(document, 'section', 'grammar-example');
    const ja = element(document, 'p', 'passage');
    ja.lang = 'ja';
    appendTokens(document, ja, example.tokens,
      {...origin, field: 'example', exampleId: example.exampleId, context: example.ja},
      onCapture, example.targetSpan);
    const translation = element(document, 'details', 'grammar-translation');
    translation.append(element(document, 'summary', '', '英訳（全文）'),
      element(document, 'p', 'en', example.en));
    block.append(ja, translation);
    root.append(block);
  }
  root.append(element(document, 'p', 'grammar-source', `${prepared.contentLabel} · ${record.level} · ${record.source}`),
    element(document, 'p', 'grammar-reading-source',
      `ふりがな：機械生成・未確認 (${prepared.readingSource.tool} ${prepared.readingSource.version})`));
  if (record.audit?.length) root.append(element(document, 'p', 'grammar-audit',
    `AI修正履歴：${record.audit.map(a => `${a.by} ${a.key}`).join(' · ')}`));
  if (prepared.qaMode) root.append(element(document, 'p', 'grammar-qa-warning', 'QA専用：配信不可'));
  return root;
}
