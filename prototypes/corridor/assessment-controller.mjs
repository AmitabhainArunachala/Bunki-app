/** Pure Corridor adapter. The host supplies identity/time and commits a proposed
 * library before advancing UI state. This module never reads or writes storage. */
import {
  adaptLegacySet,
  artifactReference,
  assertExactReference,
  assertItemResponse,
  assessAttemptAdmission,
  beginAttempt,
  checkpointAttempt,
  parseAttempt,
  parseLegacyEvidence,
  parseLegacySetAdaptation,
  preserveLegacyRun,
  preserveLegacySummary,
  scoreAttempt,
} from './modules/assessment-core.mjs';
import { encodeLocalJson, inputHashOf, recordOperationSchema } from './modules/record-core.mjs';

export const ASSESSMENT_LIBRARY_FORMAT = 'kairo-assessment-library';
export const ASSESSMENT_LIBRARY_VERSION = 1;
export const ASSESSMENT_LIBRARY_LIMITS = Object.freeze({
  forms: 512,
  attempts: 5000,
  legacyEvidence: 5000,
  jsonNodes: 500_000,
  jsonCharacters: 24_000_000,
  jsonDepth: 32,
});

export class AssessmentControllerError extends Error {
  constructor(code, path = '') {
    super(`Assessment controller ${code}${path ? ` at ${path}` : ''}`);
    this.name = 'AssessmentControllerError';
    this.code = code;
  }
}
const fail = (code, path) => {
  throw new AssessmentControllerError(code, path);
};
const ownedLibraries = new WeakSet();
const measured = new WeakMap();
const projected = new WeakMap();

function record(raw, required, optional = []) {
  if (
    raw === null ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw)) ||
    Object.getOwnPropertySymbols(raw).length
  )
    fail('invalid-input', 'object');
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  const keys = Object.keys(descriptors);
  if (
    keys.length > required.length + optional.length ||
    required.some((key) => !Object.hasOwn(descriptors, key)) ||
    keys.some((key) => !required.includes(key) && !optional.includes(key))
  )
    fail('invalid-input', 'fields');
  if (keys.some((key) => !('value' in descriptors[key]) || !descriptors[key].enumerable))
    fail('invalid-input', 'accessor');
  return raw;
}
function wellFormed(text) {
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
function id(value, path, max = 200) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > max ||
    !wellFormed(value) ||
    /\s/u.test(value) ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    fail('invalid-input', path);
  return value;
}
function scopeValue(raw) {
  record(raw, ['accountId', 'learnerId']);
  return Object.freeze({
    accountId: id(raw.accountId, 'scope.accountId'),
    learnerId: id(raw.learnerId, 'scope.learnerId'),
  });
}
function matchesScope(a, b) {
  return a.accountId === b.accountId && a.learnerId === b.learnerId;
}
function checkScope(library, raw) {
  const scope = scopeValue(raw);
  if (!matchesScope(library.scope, scope)) fail('scope-mismatch');
}
function instant(now) {
  if (typeof now !== 'string' && typeof now !== 'number') fail('invalid-input', 'now');
  if (typeof now === 'number' && (!Number.isSafeInteger(now) || Object.is(now, -0)))
    fail('invalid-input', 'now');
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) fail('invalid-input', 'now');
  const value = date.toISOString();
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    (typeof now === 'string' && now !== value)
  )
    fail('invalid-input', 'now');
  return value;
}
function duration(value, path) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 604_800_000 || Object.is(value, -0))
    fail('invalid-input', path);
  return value;
}

/** Reject non-JSON data before invoking any shared parser. Cached costs are used
 * only for outputs privately constructed from already validated immutable data. */
function measureJson(value, trusted = false) {
  const ancestors = new Set();
  function visit(child, depth) {
    if (depth > ASSESSMENT_LIBRARY_LIMITS.jsonDepth) fail('library-capacity', 'jsonDepth');
    if (trusted && child !== null && typeof child === 'object' && measured.has(child)) {
      const size = measured.get(child);
      if (depth + size.depth > ASSESSMENT_LIBRARY_LIMITS.jsonDepth)
        fail('library-capacity', 'jsonDepth');
      return size;
    }
    let size = { nodes: 1, characters: 0, depth: 0 };
    if (typeof child === 'string') {
      if (!wellFormed(child)) fail('invalid-input', 'jsonText');
      size.characters = child.length;
    } else if (typeof child === 'number') {
      if (!Number.isFinite(child) || Object.is(child, -0)) fail('invalid-input', 'jsonNumber');
    } else if (child !== null && typeof child === 'object') {
      if (
        ancestors.has(child) ||
        (!Array.isArray(child) &&
          ![Object.prototype, null].includes(Object.getPrototypeOf(child))) ||
        Object.getOwnPropertySymbols(child).length
      )
        fail('invalid-input', 'jsonObject');
      ancestors.add(child);
      const descriptors = Object.getOwnPropertyDescriptors(child);
      const keys = Object.keys(descriptors);
      if (keys.length > 20_000 || (Array.isArray(child) && keys.length !== child.length + 1))
        fail('invalid-input', 'jsonArray');
      for (const key of keys) {
        if (Array.isArray(child) && key === 'length') continue;
        const descriptor = descriptors[key];
        if (
          !('value' in descriptor) ||
          !descriptor.enumerable ||
          !wellFormed(key) ||
          (Array.isArray(child) && !/^(0|[1-9][0-9]*)$/u.test(key))
        )
          fail('invalid-input', 'jsonProperty');
        const nested = visit(descriptor.value, depth + 1);
        size.nodes += nested.nodes;
        size.characters += key.length + nested.characters;
        size.depth = Math.max(size.depth, nested.depth + 1);
        if (
          size.nodes > ASSESSMENT_LIBRARY_LIMITS.jsonNodes ||
          size.characters > ASSESSMENT_LIBRARY_LIMITS.jsonCharacters
        )
          fail('library-capacity', 'jsonBudget');
      }
      ancestors.delete(child);
      if (trusted) measured.set(child, size);
    } else if (child !== null && typeof child !== 'boolean') fail('invalid-input', 'jsonValue');
    if (size.characters > ASSESSMENT_LIBRARY_LIMITS.jsonCharacters)
      fail('library-capacity', 'jsonBudget');
    return size;
  }
  return visit(value, 0);
}
function array(raw, name, maximum) {
  if (!Array.isArray(raw) || raw.length > maximum) fail('library-capacity', name);
  return raw;
}
function unique(values, name) {
  if (new Set(values).size !== values.length) fail('duplicate-identity', name);
}
function makeLibrary({ scope, forms, attempts, activeAttemptId, legacyEvidence }) {
  array(forms, 'forms', ASSESSMENT_LIBRARY_LIMITS.forms);
  array(attempts, 'attempts', ASSESSMENT_LIBRARY_LIMITS.attempts);
  array(legacyEvidence, 'legacyEvidence', ASSESSMENT_LIBRARY_LIMITS.legacyEvidence);
  const library = Object.freeze({
    format: ASSESSMENT_LIBRARY_FORMAT,
    v: ASSESSMENT_LIBRARY_VERSION,
    scope,
    forms: Object.freeze(forms),
    attempts: Object.freeze(attempts),
    activeAttemptId,
    legacyEvidence: Object.freeze(legacyEvidence),
  });
  measureJson(library, true);
  ownedLibraries.add(library);
  return library;
}

export function createLibrary(raw) {
  record(raw, ['scope']);
  return makeLibrary({
    scope: scopeValue(raw.scope),
    forms: [],
    attempts: [],
    activeAttemptId: null,
    legacyEvidence: [],
  });
}

export function parseLibrary(raw, options = {}) {
  record(options, [], ['scope']);
  if (ownedLibraries.has(raw)) {
    if (Object.hasOwn(options, 'scope')) checkScope(raw, options.scope);
    return raw;
  }
  measureJson(raw);
  record(raw, ['format', 'v', 'scope', 'forms', 'attempts', 'activeAttemptId', 'legacyEvidence']);
  if (raw.format !== ASSESSMENT_LIBRARY_FORMAT || raw.v !== ASSESSMENT_LIBRARY_VERSION)
    fail('unsupported-library');
  const scope = scopeValue(raw.scope);
  if (Object.hasOwn(options, 'scope') && !matchesScope(scope, scopeValue(options.scope)))
    fail('scope-mismatch');
  const forms = array(raw.forms, 'forms', ASSESSMENT_LIBRARY_LIMITS.forms).map(
    parseLegacySetAdaptation,
  );
  unique(
    forms.map((entry) => entry.form.revisionId),
    'forms',
  );
  const byRevision = new Map(forms.map((entry) => [entry.form.revisionId, entry]));
  const attempts = array(raw.attempts, 'attempts', ASSESSMENT_LIBRARY_LIMITS.attempts).map(
    (entry) => {
      const wrapper = byRevision.get(entry?.form?.revisionId);
      if (!wrapper) fail('missing-form-revision');
      const attempt = parseAttempt(wrapper.form, entry);
      if (!matchesScope(scope, attempt.scope)) fail('scope-mismatch');
      if (attempt.mode !== 'practice' || attempt.editorialAtStart.status !== 'unreviewed')
        fail('unsupported-attempt-policy');
      return attempt;
    },
  );
  unique(
    attempts.map((attempt) => attempt.attemptId),
    'attempts',
  );
  const activeAttemptId =
    raw.activeAttemptId === null ? null : id(raw.activeAttemptId, 'activeAttemptId');
  if (
    activeAttemptId !== null &&
    !attempts.some((attempt) => attempt.attemptId === activeAttemptId)
  )
    fail('missing-active-attempt');
  const running = attempts.filter((attempt) => attempt.status === 'in-progress');
  if (running.length > 1 || (running.length === 1 && running[0].attemptId !== activeAttemptId))
    fail('inactive-unfinished-attempt');
  const legacyEvidence = array(
    raw.legacyEvidence,
    'legacyEvidence',
    ASSESSMENT_LIBRARY_LIMITS.legacyEvidence,
  ).map((entry) => {
    const evidence = parseLegacyEvidence(entry);
    if (!['summary', 'run'].includes(evidence.kind)) fail('unsupported-legacy-evidence');
    return evidence;
  });
  unique(
    legacyEvidence.map((entry) => entry.evidenceId),
    'legacyEvidence',
  );
  return makeLibrary({ scope, forms, attempts, activeAttemptId, legacyEvidence });
}

export function libraryCounts(raw) {
  const library = parseLibrary(raw);
  return Object.freeze({
    forms: library.forms.length,
    attempts: library.attempts.length,
    submitted: library.attempts.filter((attempt) => attempt.status === 'submitted').length,
    abandoned: library.attempts.filter((attempt) => attempt.status === 'abandoned').length,
    inProgress: library.attempts.filter((attempt) => attempt.status === 'in-progress').length,
    legacySummaries: library.legacyEvidence.filter((entry) => entry.kind === 'summary').length,
    legacyRuns: library.legacyEvidence.filter((entry) => entry.kind === 'run').length,
  });
}

export function importLegacyHistory(raw, options) {
  const library = parseLibrary(raw);
  record(options, ['scope'], ['mockRun', 'mockDone']);
  checkScope(library, options.scope);
  const pending = [];
  if (options.mockRun !== null && options.mockRun !== undefined)
    pending.push(preserveLegacyRun(options.mockRun));
  const summaries = options.mockDone ?? {};
  measureJson(summaries);
  if (summaries === null || typeof summaries !== 'object' || Array.isArray(summaries))
    fail('invalid-input', 'mockDone');
  for (const [setId, summary] of Object.entries(summaries))
    pending.push(preserveLegacySummary(setId, summary));
  const existing = new Set(library.legacyEvidence.map((entry) => entry.evidenceId));
  const additions = pending.filter((entry) => {
    if (existing.has(entry.evidenceId)) return false;
    existing.add(entry.evidenceId);
    return true;
  });
  return additions.length
    ? makeLibrary({ ...library, legacyEvidence: [...library.legacyEvidence, ...additions] })
    : library;
}

export function startLegacyPractice(raw, rawSet, options) {
  const library = parseLibrary(raw);
  record(options, ['scope', 'attemptId', 'now']);
  checkScope(library, options.scope);
  const attemptId = id(options.attemptId, 'attemptId');
  const now = instant(options.now);
  const incoming = adaptLegacySet(rawSet);
  const wrapper =
    library.forms.find((entry) => entry.form.revisionId === incoming.form.revisionId) ?? incoming;
  const existing = library.attempts.find((attempt) => attempt.attemptId === attemptId);
  if (existing) {
    if (existing.form.revisionId === wrapper.form.revisionId && existing.startedAt === now)
      return library;
    fail('duplicate-identity', 'attemptId');
  }
  if (library.attempts.some((attempt) => attempt.status === 'in-progress'))
    fail('unfinished-attempt-exists');
  const attempt = beginAttempt(wrapper.form, {
    attemptId,
    scope: library.scope,
    mode: 'practice',
    priorExposure: 'unknown',
    editorialAtStart: {
      status: 'unreviewed',
      authorityPolicyVersion: null,
      decisionRevisionIds: [],
    },
    startedAt: now,
    clockStatus: 'continuous',
  });
  return makeLibrary({
    ...library,
    forms: wrapper === incoming ? [...library.forms, wrapper] : library.forms,
    attempts: [...library.attempts, attempt],
    activeAttemptId: attemptId,
  });
}

const COMMAND_FIELDS = [
  'scope',
  'attemptId',
  'expectedRevisionId',
  'commandId',
  'now',
  'elapsedDeltaMs',
];
function activeCommand(raw, options, extra = [], optional = []) {
  const library = parseLibrary(raw);
  record(options, [...COMMAND_FIELDS, ...extra], ['activeDeltaMs', ...optional]);
  checkScope(library, options.scope);
  const attemptId = id(options.attemptId, 'attemptId');
  const expected = id(options.expectedRevisionId, 'expectedRevisionId');
  const commandId = id(options.commandId, 'commandId', 160);
  const attempt = library.attempts.find((entry) => entry.attemptId === attemptId);
  if (!attempt || library.activeAttemptId !== attemptId) fail('inactive-attempt');
  if (attempt.revisionId !== expected) fail('stale-checkpoint');
  if (attempt.status !== 'in-progress') fail('attempt-finalized');
  const wrapper = library.forms.find((entry) => entry.form.revisionId === attempt.form.revisionId);
  const elapsed = duration(options.elapsedDeltaMs, 'elapsedDeltaMs');
  const active = duration(options.activeDeltaMs ?? elapsed, 'activeDeltaMs');
  if (active > elapsed) fail('invalid-input', 'activeDeltaMs');
  const timings = attempt.timings.map((timing) =>
    timing.blockId === attempt.cursor.timingBlockId
      ? {
          ...timing,
          elapsedMs: duration(timing.elapsedMs + elapsed, 'elapsedMs'),
          activeMs: duration(timing.activeMs + active, 'activeMs'),
        }
      : timing,
  );
  return { library, attempt, wrapper, commandId, now: instant(options.now), timings };
}
function replaceAttempt(context, attempt) {
  return makeLibrary({
    ...context.library,
    attempts: context.library.attempts.map((entry) =>
      entry.attemptId === attempt.attemptId ? attempt : entry,
    ),
  });
}
function blockFor(form, itemId) {
  const section = form.sections.find((entry) => entry.itemIds.includes(itemId));
  const block = form.timingBlocks.find((entry) => section && entry.sectionIds.includes(section.id));
  if (!block) fail('missing-item');
  return block.id;
}
function itemFact(context, item, suffix) {
  const blockId = blockFor(context.wrapper.form, item.id);
  return {
    id: `${context.commandId}:${suffix}`,
    recordedAt: context.now,
    timingBlockId: blockId,
    elapsedMs: context.timings.find((timing) => timing.blockId === blockId).elapsedMs,
    item: { ...artifactReference(item), kind: 'item' },
  };
}
function checkpoint(
  context,
  {
    cursor = context.attempt.cursor,
    facts = [],
    status = 'in-progress',
    clockStatus = context.attempt.clockStatus,
  } = {},
) {
  const next = checkpointAttempt(context.wrapper.form, context.attempt, {
    expectedRevisionId: context.attempt.revisionId,
    recordedAt: context.now,
    cursor,
    timings: context.timings,
    clockStatus,
    facts,
    status,
  });
  return replaceAttempt(context, next);
}

export function answerPractice(raw, options) {
  const context = activeCommand(raw, options, ['choiceIndex']);
  const item = context.wrapper.form.items.find(
    (entry) => entry.id === context.attempt.cursor.itemId,
  );
  if (
    !item ||
    item.response.kind !== 'selected' ||
    !Number.isInteger(options.choiceIndex) ||
    options.choiceIndex < 0 ||
    options.choiceIndex >= item.response.options.length
  )
    fail('invalid-input', 'choiceIndex');
  const alreadyExposed = context.attempt.facts.some(
    (fact) => fact.kind === 'exposure' && fact.content === 'prompt' && fact.item.id === item.id,
  );
  return checkpoint(context, {
    facts: [
      ...(alreadyExposed
        ? []
        : [{ ...itemFact(context, item, 'shown'), kind: 'exposure', content: 'prompt' }]),
      {
        ...itemFact(context, item, 'response'),
        kind: 'response',
        response: { kind: 'selected', optionId: item.response.options[options.choiceIndex].id },
      },
    ],
  });
}

export function movePractice(raw, options) {
  const context = activeCommand(raw, options, ['index']);
  const items = context.wrapper.form.sections.flatMap((section) => section.itemIds);
  if (!Number.isInteger(options.index) || options.index < 0 || options.index >= items.length)
    fail('invalid-input', 'index');
  const item = context.wrapper.form.items.find((entry) => entry.id === items[options.index]);
  return checkpoint(context, {
    cursor: { itemId: item.id, timingBlockId: blockFor(context.wrapper.form, item.id) },
    facts: [{ ...itemFact(context, item, 'shown'), kind: 'exposure', content: 'prompt' }],
  });
}

export function submitPractice(raw, options) {
  const context = activeCommand(raw, options);
  if (context.attempt.answers.some((answer) => answer.response.kind === 'unanswered'))
    fail('unanswered-items');
  return checkpoint(context, { status: 'submitted' });
}

export function abandonPractice(raw, options) {
  const context = activeCommand(raw, options);
  return checkpoint(context, { status: 'abandoned' });
}

/** A proposal only: the owned record host must atomically persist the complete
 * library, this minimal intent and its command receipt. Scope is an existing
 * local ownership prerequisite, never inferred from a historical library. */
function terminalPracticeReference(library, terminal) {
  if (!terminal || !['submitted', 'abandoned'].includes(terminal.status)) fail('attempt-not-finalized');
  const wrapper = library.forms.find((entry) => entry.form.revisionId === terminal.form.revisionId);
  if (!wrapper) fail('missing-form-revision');
  // parseLibrary/parseAttempt verify every answer's exact pinned item reference.
  // Ordered/text responses need a separate admitted adapter; never stringify.
  const answers = terminal.answers.map((answer) => {
    const item = wrapper.form.items.find((entry) => entry.id === answer.item.id);
    if (!item || item.response.kind !== 'selected' || !['selected', 'unanswered'].includes(answer.response.kind))
      fail('unsupported-sync-response');
    return { itemId: item.id, itemVersionId: item.revisionId,
      response: answer.response.kind === 'selected' ? { kind: 'choice', optionId: answer.response.optionId } : { kind: 'no-response' } };
  });
  if (answers.length > 1000) fail('library-capacity', 'syncAnswers');
  const elapsedMs = terminal.timings.reduce((total, timing) => total + timing.elapsedMs, 0);
  if (!Number.isSafeInteger(elapsedMs)) fail('invalid-input', 'elapsedMs');
  return { kind: 'exam.attempt', attemptId: terminal.attemptId, generation: null,
    form: { formId: wrapper.form.id, versionId: wrapper.form.revisionId, sha256: wrapper.form.sha256 },
    outcome: terminal.status, startedAt: terminal.startedAt, endedAt: terminal.endedAt, elapsedMs,
    interruptionCount: terminal.facts.filter((fact) => fact.kind === 'interruption').length, answers };
}

export function finalizePractice(raw, options) {
  record(options, [...COMMAND_FIELDS, 'form', 'outcome', 'dismiss'], ['activeDeltaMs']);
  record(options.form, ['formId', 'versionId', 'sha256']);
  if (!['submitted', 'abandoned'].includes(options.outcome) || typeof options.dismiss !== 'boolean')
    fail('invalid-input', 'finalization');
  const library = parseLibrary(raw, { scope: options.scope });
  const attempt = library.attempts.find((entry) => entry.attemptId === options.attemptId);
  const wrapper = library.forms.find((entry) => entry.form.revisionId === attempt?.form.revisionId);
  if (!wrapper || options.form.formId !== wrapper.form.id ||
    options.form.versionId !== wrapper.form.revisionId || options.form.sha256 !== wrapper.form.sha256)
    fail('form-mismatch');
  const { outcome, dismiss } = options;
  const command = { ...options }; delete command.form; delete command.outcome; delete command.dismiss;
  let next = outcome === 'submitted' ? submitPractice(library, command) : abandonPractice(library, command);
  const terminal = next.attempts.find((entry) => entry.attemptId === attempt.attemptId);
  const intent = { payload: terminalPracticeReference(next, terminal), dependencies: [] };
  if (dismiss) next = dismissPractice(next, { scope: next.scope, attemptId: terminal.attemptId, expectedRevisionId: terminal.revisionId });
  return Object.freeze({ library: next, attemptRevisionId: terminal.revisionId, intent });
}

export function interruptPractice(raw, options) {
  const context = activeCommand(raw, options, ['reason']);
  if (
    ![
      'background',
      'process-stop',
      'device-change',
      'clock-discontinuity',
      'user-pause',
      'network',
    ].includes(options.reason)
  )
    fail('invalid-input', 'reason');
  const clockStatus =
    context.attempt.clockStatus === 'unverified' ||
    ['process-stop', 'device-change', 'clock-discontinuity'].includes(options.reason)
      ? 'unverified'
      : 'interrupted';
  return checkpoint(context, {
    clockStatus,
    facts: [
      {
        id: `${context.commandId}:interrupted`,
        recordedAt: context.now,
        timingBlockId: context.attempt.cursor.timingBlockId,
        elapsedMs: context.timings.find(
          (timing) => timing.blockId === context.attempt.cursor.timingBlockId,
        ).elapsedMs,
        kind: 'interruption',
        reason: options.reason,
      },
    ],
  });
}

export function resumePractice(raw, options) {
  record(
    options,
    ['scope', 'attemptId', 'expectedRevisionId', 'commandId', 'now'],
    ['elapsedDeltaMs', 'activeDeltaMs'],
  );
  return interruptPractice(raw, {
    ...options,
    elapsedDeltaMs: options.elapsedDeltaMs ?? 0,
    activeDeltaMs: options.activeDeltaMs ?? 0,
    reason: 'process-stop',
  });
}

export function recordPracticeAssistance(raw, options) {
  const context = activeCommand(raw, options, ['assistance']);
  if (!['dictionary', 'hint', 'translation', 'tutor', 'external'].includes(options.assistance))
    fail('invalid-input', 'assistance');
  const item = context.wrapper.form.items.find(
    (entry) => entry.id === context.attempt.cursor.itemId,
  );
  if (!item) fail('missing-item');
  return checkpoint(context, {
    facts: [
      {
        ...itemFact(context, item, 'assistance'),
        kind: 'assistance',
        assistance: options.assistance,
      },
    ],
  });
}

export function dismissPractice(raw, options) {
  const library = parseLibrary(raw);
  record(options, ['scope', 'attemptId', 'expectedRevisionId']);
  checkScope(library, options.scope);
  const attempt = library.attempts.find(
    (entry) => entry.attemptId === id(options.attemptId, 'attemptId'),
  );
  if (!attempt || library.activeAttemptId !== attempt.attemptId) fail('inactive-attempt');
  if (attempt.revisionId !== id(options.expectedRevisionId, 'expectedRevisionId'))
    fail('stale-checkpoint');
  if (attempt.status === 'in-progress') fail('attempt-not-finalized');
  return makeLibrary({ ...library, activeAttemptId: null });
}

/** Compatibility projection, never stored in place of the complete attempt. */
export function selectPractice(raw, attemptId) {
  const library = parseLibrary(raw);
  const selectedId = attemptId ?? library.activeAttemptId;
  if (selectedId === null) return null;
  id(selectedId, 'attemptId');
  const attempt = library.attempts.find((entry) => entry.attemptId === selectedId);
  if (!attempt) fail('missing-attempt');
  if (projected.has(attempt)) return projected.get(attempt);
  const wrapper = library.forms.find((entry) => entry.form.revisionId === attempt.form.revisionId);
  const form = wrapper.form;
  const source = wrapper.original;
  const ids = form.sections.flatMap((section) => section.itemIds);
  let ordinal = 0;
  const flat = source.sections.flatMap((section) =>
    section.items.map((item) => {
      const itemId = ids[ordinal++];
      const normalized = form.items.find((entry) => entry.id === itemId);
      return Object.freeze({
        section,
        item,
        itemId,
        itemVersionId: normalized.revisionId,
        timingBlockId: blockFor(form, itemId),
      });
    }),
  );
  const answers = ids.map((itemId) => {
    const answer = attempt.answers.find((entry) => entry.item.id === itemId);
    const item = form.items.find((entry) => entry.id === itemId);
    return answer.response.kind === 'unanswered'
      ? null
      : item.response.options.findIndex((option) => option.id === answer.response.optionId);
  });
  const run = {
    setId: source.setId,
    level: source.level,
    ix: attempt.status === 'submitted' ? ids.length : ids.indexOf(attempt.cursor.itemId),
    answers: Object.freeze(answers),
    ts: Date.parse(attempt.startedAt),
  };
  if (attempt.status === 'submitted') run.done = Date.parse(attempt.endedAt);
  const result = Object.freeze({
    attemptId: attempt.attemptId,
    expectedRevisionId: attempt.revisionId,
    formRevisionId: form.revisionId,
    label: wrapper.label,
    status: attempt.status,
    set: Object.freeze({
      ...source,
      title: Object.freeze({ ja: `${source.level} 短い練習 · 未レビュー`, en: wrapper.label }),
      approved: false,
    }),
    flat: Object.freeze(flat),
    run: Object.freeze(run),
    attempt,
    score: attempt.status === 'submitted' ? scoreAttempt(form, attempt) : null,
    admission: assessAttemptAdmission(form, attempt),
    clockStatus: attempt.clockStatus,
    elapsedMs: attempt.timings.reduce((total, timing) => total + timing.elapsedMs, 0),
    activeMs: attempt.timings.reduce((total, timing) => total + timing.activeMs, 0),
  });
  projected.set(attempt, result);
  return result;
}

// Display adapters accept published JSON views, not account or assessment
// authority. The host and live UI owner remain responsible for their freshness.
function checkedExamPayload(raw) {
  measureJson(raw);
  const parsed = recordOperationSchema.safeParse(raw);
  if (!parsed.success || parsed.data.kind !== 'exam.attempt') fail('invalid-response-history');
  return encodeLocalJson(parsed.data).value;
}
function responseContent(payload) {
  const value = { ...payload }; delete value.generation;
  return encodeLocalJson(value).text;
}
export function localPracticeReference(raw, attemptId) {
  const library = parseLibrary(raw);
  const attempt = library.attempts.find((entry) => entry.attemptId === attemptId);
  if (!attempt || attempt.status === 'in-progress') return null;
  try { return checkedExamPayload(terminalPracticeReference(library, attempt)); }
  catch (error) { if (error.code === 'unsupported-sync-response') return null; throw error; }
}
/** Keep richer local attempts; received tombstones cannot delete their roots.
 * Equal terminal data is one sitting, while distinct data stays explicit. */
export function receivedPracticeHistory(raw, rawViews, options = {}) {
  record(options, [], ['scope']);
  const library = raw == null ? null : parseLibrary(raw);
  measureJson(rawViews); array(rawViews, 'examAttemptViews', ASSESSMENT_LIBRARY_LIMITS.attempts);
  unique(rawViews.map((view) => view.attemptId), 'examAttemptViews');
  const sameScope = library && options.scope && matchesScope(library.scope, scopeValue(options.scope));
  const locals = new Map((library?.attempts || []).map((attempt) => [attempt.attemptId, attempt]));
  const localRows = new Map((library?.attempts || []).filter((attempt) => attempt.status !== 'in-progress')
    .slice().reverse().map((attempt) => [attempt.attemptId, { kind: 'local', attemptId: attempt.attemptId,
      receivedMatches: [], conflict: false, localOnly: true }]));
  const received = [], hiddenIds = [];
  for (const view of rawViews) {
    record(view, ['attemptId', 'headAttempts', 'projection']); id(view.attemptId, 'attemptId');
    if (view.projection?.target?.kind !== 'exam-attempt' || view.projection.target.id !== view.attemptId ||
        typeof view.projection.requiresChoice !== 'boolean') fail('invalid-response-history');
    array(view.headAttempts, 'headAttempts', ASSESSMENT_LIBRARY_LIMITS.attempts);
    const heads = view.headAttempts.map((head) => {
      record(head, ['payloadSha256', 'payload', 'operationRefs']);
      const payload = checkedExamPayload(head.payload);
      if (payload.attemptId !== view.attemptId || inputHashOf(payload) !== head.payloadSha256 ||
          !Array.isArray(head.operationRefs) || !head.operationRefs.length) fail('invalid-response-history');
      return { ...head, payload };
    });
    unique(heads.map((head) => head.payloadSha256), 'headAttempts');
    if (!heads.length) { hiddenIds.push(view.attemptId); continue; }
    const local = sameScope && locals.get(view.attemptId);
    const localPayload = local ? localPracticeReference(library, local.attemptId) : null;
    const matched = localPayload ? heads.filter((head) => responseContent(head.payload) === responseContent(localPayload)) : [];
    const conflict = view.projection.requiresChoice || heads.length > 1 || !!local && matched.length !== heads.length;
    const localRow = localRows.get(view.attemptId);
    if (localRow && sameScope) {
      localRow.receivedMatches = matched.map((head) => head.payloadSha256);
      localRow.localOnly = !matched.length; localRow.conflict = conflict;
    }
    for (const head of heads) {
      if (matched.includes(head)) continue;
      received.push({ kind: 'received', attemptId: view.attemptId, payloadSha256: head.payloadSha256,
        payload: head.payload, conflict, operationRefs: head.operationRefs });
    }
  }
  return encodeLocalJson({ entries: [...localRows.values(), ...received], hiddenIds }).value;
}
/** A catalog ID is a local allowlist decision; never derive a fetch path by
 * stripping a prefix from a received form identifier. */
export function receivedPracticeSetId(raw, catalog) {
  const payload = checkedExamPayload(raw);
  if (!Array.isArray(catalog)) return null;
  const matches = catalog.filter((entry) => entry && typeof entry.setId === 'string' &&
    /^n[1-5]-[0-9]{2}$/u.test(entry.setId) && `legacy-form:${entry.setId}` === payload.form.formId);
  return matches.length === 1 ? matches[0].setId : null;
}
/** Exact available question labels only. No full attempt, answer key, score or
 * editorial/admission facts are created from a portable response. */
export function resolveReceivedPractice(raw, options = {}) {
  const payload = checkedExamPayload(raw);
  record(options, [], ['library', 'scope', 'set']);
  const wanted = { kind: 'form', id: payload.form.formId, revisionId: payload.form.versionId, sha256: payload.form.sha256 };
  let form = null;
  if (options.library != null && options.scope) {
    try {
      const library = parseLibrary(options.library, { scope: options.scope });
      form = library.forms.find((entry) => entry.form.id === wanted.id &&
        entry.form.revisionId === wanted.revisionId && entry.form.sha256 === wanted.sha256)?.form || null;
    } catch (error) { if (error.code !== 'scope-mismatch') throw error; }
  }
  if (!form && options.set != null) {
    try { const candidate = adaptLegacySet(options.set).form; assertExactReference(wanted, candidate); form = candidate; }
    catch { /* A changed or malformed catalog version supplies no labels. */ }
  }
  if (form) assertExactReference(wanted, form);
  const answers = payload.answers.map((answer) => {
    const base = { ...answer, status: form ? 'invalid-reference' : 'missing-version', prompt: null,
      translatedInstruction: null, passages: [], options: [], selectedText: null };
    const item = form?.items.find((entry) => entry.id === answer.itemId && entry.revisionId === answer.itemVersionId);
    if (!item) return base;
    const normalized = answer.response.kind === 'choice' ? { kind: 'selected', optionId: answer.response.optionId }
      : answer.response.kind === 'text' ? { kind: 'written', text: answer.response.text } : { kind: 'unanswered' };
    try { assertItemResponse(item, normalized); }
    catch { return { ...base, status: 'unsupported-response' }; }
    return { ...base, status: 'available', prompt: item.prompt, translatedInstruction: item.translatedInstruction,
      passages: item.passages.map((ref) => {
        const passage = form.passages.find((entry) => entry.id === ref.id); assertExactReference(ref, passage);
        return { text: passage.text, provenance: passage.provenance };
      }),
      options: item.response.kind === 'selected' ? item.response.options.map(({ id: optionId, text }) => ({ id: optionId, text })) : [],
      selectedText: answer.response.kind === 'choice' ? item.response.options.find((option) => option.id === answer.response.optionId).text : null };
  });
  return encodeLocalJson({ status: form ? 'available' : 'missing-version', title: form?.title || null,
    form: payload.form, answers }).value;
}
