/** Offline, answer-only planning. Inputs and placements are not recordings,
 * playback permission, native review, or a distributable audio manifest. */
import { createSpeechInput, bindSpeechPlacement } from './speech-input.mjs';
import { canonicalStringify, sha256 } from '../schema/event.mjs';

const VOCAB = 'vocabulary.read.v1';
const CONTRACTS = new Set([VOCAB, 'grammar.meaning.v1', 'grammar.cloze.v1']);
// Used only to exercise the frozen seam's validation when no profile is assigned.
// This profile is never emitted in the plan.
const VALIDATION_PROFILE = { providerRoute: 'validation', model: 'validation', voice: 'validation', settings: {} };
const fail = message => { throw new TypeError(message); };
const check = (ok, message) => { if (!ok) fail(message); };
const has = (value, key) => Object.hasOwn(value, key);
const nonempty = value => typeof value === 'string' && /\S/u.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);

function record(value, label) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)), `${label} must be a plain record`);
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    check(typeof key === 'string' && d.enumerable && has(d, 'value'), `${label} requires data properties`);
  }
  return value;
}

function array(value, label, limit = 100_000) {
  check(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype &&
    value.length <= limit && Reflect.ownKeys(value).length === value.length + 1, `${label} must be a bounded dense array`);
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    check(d && d.enumerable && has(d, 'value'), `${label} requires dense data properties`);
  }
  return value;
}

function text(value, label) {
  check(nonempty(value), `${label} requires nonempty text`);
  // Canonical JSON rejects malformed Unicode even for fields that remain blocked.
  canonicalStringify(value);
  check(value.length <= 2_000_000 && Array.from(value).length <= 1_000_000, `${label} exceeds the text limit`);
  return value;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function validateInput(sourceText, directives, profile = VALIDATION_PROFILE, language = 'ja') {
  return createSpeechInput({ segments: [{ language, text: sourceText, pronunciationDirectives: directives }], profile });
}

// The seam copies/bounds all relevant source reading data before it is hashed.
// In particular, no caller-owned nested object is ever frozen by this module.
function sourceSnapshot(fields, readings) {
  const source = { fields: fields.map(({ sourcePath, sourceText, exampleId = null, relatedReference = null }) =>
    ({ sourcePath, sourceText, exampleId, relatedReference })), readings };
  const copied = validateInput('source validation', [], { ...VALIDATION_PROFILE, settings: source }).profile.settings;
  return { contentRevision: sha256(canonicalStringify(copied)), readings: copied.readings };
}

function addField(fields, sourcePath, value, language, extra = {}, required = false) {
  if (!required && (value === undefined || value === null || value === '')) return;
  check(typeof value === 'string', `${sourcePath} must be text`);
  if (!required && !nonempty(value)) return;
  fields.push({ sourcePath, sourceText: text(value, sourcePath), language, ...extra });
}

function vocabularySource(entry) {
  const fields = [];
  for (const [path, language] of [['term', 'ja'], ['reading', 'ja'], ['ja', 'ja'],
    ['defJa', 'ja'], ['meaning', 'en'], ['note', null], ['en', 'en']]) {
    addField(fields, path, entry[path], entry.manual === true && path === 'meaning' ? null : language,
      {}, ['term', 'ja', 'meaning'].includes(path));
  }
  if (entry.collocations !== undefined && entry.collocations !== null) {
    array(entry.collocations, 'collocations').forEach((value, i) => addField(fields, `collocations[${i}]`, value, 'ja'));
  }
  return { fields, ...sourceSnapshot(fields, { reading: entry.reading ?? null, rubySegments: entry.rubySegments ?? null }) };
}

function grammarIndex(grammarRecords) {
  const indexed = new Map(), exampleIds = new Set();
  for (const g of array(grammarRecords, 'grammarRecords')) {
    record(g, 'grammar record');
    const guid = text(g.guid, 'grammar guid');
    check(!indexed.has(guid), 'duplicate grammar record');
    const fields = [], examples = new Map();
    for (const path of ['pattern', 'meaning', 'formation', 'nuance']) {
      addField(fields, path, g[path], path === 'meaning' ? 'en' : null,
        { pronunciationPolicy: path === 'pattern' || path === 'formation' }, true);
    }
    check(array(g.examples, 'grammar examples').length === 3, 'grammar requires exactly three examples');
    const tokens = [];
    g.examples.forEach((example, i) => {
      record(example, 'grammar example');
      const exampleId = text(example.exampleId, 'grammar exampleId');
      check(!exampleIds.has(exampleId), 'duplicate grammar exampleId');
      exampleIds.add(exampleId);
      examples.set(exampleId, example);
      addField(fields, `examples[${i}].ja`, example.ja, 'ja', { exampleId, tokenIndex: i }, true);
      addField(fields, `examples[${i}].en`, example.en, 'en', { exampleId }, true);
      tokens.push(example.tokens ?? null);
    });
    array(g.relatedReferences, 'grammar relatedReferences').forEach((ref, i) => {
      record(ref, 'grammar related reference');
      check(ref.noteGuid === null, 'unresolved grammar reference must retain noteGuid:null');
      const relatedReference = { noteGuid: null, status: text(ref.status, 'related reference status') };
      addField(fields, `relatedReferences[${i}].text`, ref.text, null,
        { pronunciationPolicy: true, relatedReference }, true);
    });
    indexed.set(guid, { fields, examples, pattern: g.pattern, meaning: g.meaning,
      ...sourceSnapshot(fields, { tokens, fieldTokens: g.fieldTokens ?? null }) });
  }
  return indexed;
}

function rawReadings(sourceText, values, kind) {
  if (values === null) return { directives: [], pending: ['missing-readings'] };
  try {
    array(values, kind);
    let utf16 = 0, codepoints = 0;
    const directives = [];
    for (const value of values) {
      let surface, reading;
      if (kind === 'ruby') {
        // Released vocabulary ruby may carry a third target marker. The marker
        // is presentation metadata, never part of pronunciation or a new clip.
        check(array(value, 'ruby segment').length >= 2, 'invalid ruby segment');
        [surface, reading] = value;
      } else {
        record(value, 'grammar token');
        ({ surface, reading } = value);
        check(value.unit === 'utf16' && value.start === utf16 &&
          integer(value.start) && integer(value.end) && value.end === utf16 + surface?.length, 'invalid token bounds');
      }
      check(typeof surface === 'string' && surface.length > 0 && sourceText.startsWith(surface, utf16), 'reading reconstruction mismatch');
      canonicalStringify(surface);
      check(reading === null || typeof reading === 'string', 'invalid source reading');
      const end = codepoints + Array.from(surface).length;
      if (reading !== null && reading !== '') {
        text(reading, 'source reading');
        directives.push({ start: codepoints, end, reading });
      }
      utf16 += surface.length;
      codepoints = end;
    }
    check(utf16 === sourceText.length, 'readings must reconstruct the entire source');
    return { directives, pending: [] };
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return { directives: [], pending: ['invalid-readings'] };
  }
}

const evidence = (directives, kind) => directives.map(d => ({ ...d, kind }));

function overlayRules(sourceText, sourceHash, entry, directives, readingEvidence, rules) {
  try {
    const points = Array.from(sourceText), corrections = [];
    for (const rule of rules) {
      record(rule.span, 'reading rule span');
      const { start, end, unit } = rule.span;
      check(rule.sourceTaskKey === entry.taskKey && rule.sourceJaSha256 === sourceHash &&
        unit === 'codepoint' && integer(start) && integer(end) && end > start && end <= points.length &&
        points.slice(start, end).join('') === rule.surface, 'stale reading rule');
      text(rule.reading, 'rule reading');
      corrections.push({ start, end, reading: rule.reading });
    }
    // Validates every matching rule, including ordering/overlap, without sorting
    // malformed rules into an apparently valid ledger.
    validateInput(sourceText, corrections);
    const combined = [], annotations = [];
    let index = 0;
    for (let r = 0; r < corrections.length; r++) {
      const corrected = corrections[r];
      while (index < directives.length && directives[index].end <= corrected.start) {
        combined.push(directives[index]); annotations.push(readingEvidence[index++]);
      }
      while (index < directives.length && directives[index].start < corrected.end) {
        const raw = directives[index++];
        check(raw.start >= corrected.start && raw.end <= corrected.end, 'rule cuts a source reading');
      }
      combined.push(corrected);
      // segmentReadings, if present in a rule, do not replace its whole reading.
      annotations.push({ ...corrected, kind: 'reviewed-rule', ruleId: text(rules[r].id, 'rule id') });
    }
    while (index < directives.length) {
      combined.push(directives[index]); annotations.push(readingEvidence[index++]);
    }
    return { directives: combined, readingEvidence: annotations, pending: [] };
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    // A source projection is also used by playback freshness checks. Retain
    // no usable expected directives after a stale rule, even for a blocked
    // field with a caller assignment; pending metadata is the only result.
    return { directives: [], readingEvidence: [], pending: ['stale-reading-rules'] };
  }
}

function languagePartition(sourceText, assignment) {
  const length = Array.from(sourceText).length;
  if (assignment === 'ja' || assignment === 'en') return [{ start: 0, end: length, language: assignment }];
  const parts = array(assignment, 'language assignment', 512);
  check(parts.length > 0, 'language assignment must not be empty');
  let end = 0;
  const result = parts.map(part => {
    record(part, 'language partition');
    check(Object.keys(part).length === 3 && integer(part.start) && integer(part.end) &&
      part.start === end && part.end > part.start && part.end <= length &&
      ['ja', 'en'].includes(part.language), 'language assignment must be an ordered complete partition');
    end = part.end;
    return { start: part.start, end, language: part.language };
  });
  check(end === length, 'language partition must cover the entire source');
  return result;
}

function splitSegments(sourceText, directives, parts) {
  const points = Array.from(sourceText);
  let index = 0;
  const segments = parts.map(part => {
    const local = [];
    while (index < directives.length && directives[index].start < part.end) {
      const d = directives[index++];
      check(d.start >= part.start && d.end <= part.end, 'pronunciation directive crosses a language segment');
      local.push({ start: d.start - part.start, end: d.end - part.start, reading: d.reading });
    }
    return { language: part.language, text: points.slice(part.start, part.end).join(''), pronunciationDirectives: local };
  });
  check(index === directives.length, 'pronunciation directive outside language partition');
  return segments;
}

function assignmentMap(assignments, label) {
  record(assignments, label);
  for (const value of Object.values(assignments)) record(value, label);
  return assignments;
}

/** Pure synchronous plan of supplied source fields, deduplicated only within
 * the supplied scope. Reading review is independent of planning readiness.
 * `language` is null, a language string, or the explicit codepoint partition.
 */
export function planCardSpeech({ catalog, grammarRecords, sourceRevision, correctionLedgerRevision,
  readingRules = [], profiles = {}, scope, languageAssignments = {}, readingAssignments = {} }) {
  text(sourceRevision, 'sourceRevision');
  text(correctionLedgerRevision, 'correctionLedgerRevision');
  record(scope, 'scope');
  const planScope = { accessScope: text(scope.accessScope, 'scope.accessScope'), licenseScope: text(scope.licenseScope, 'scope.licenseScope') };
  record(profiles, 'profiles');
  const resolvedProfiles = new Map(), profileKeys = new Map();
  for (const [language, profile] of Object.entries(profiles)) {
    check(language === 'ja' || language === 'en', 'unknown profile language');
    const copied = validateInput('profile validation', [], profile).profile;
    resolvedProfiles.set(language, copied);
    profileKeys.set(language, canonicalStringify(copied));
  }
  assignmentMap(languageAssignments, 'languageAssignments');
  assignmentMap(readingAssignments, 'readingAssignments');
  const grammar = grammarIndex(grammarRecords), rulesByGuid = new Map();
  for (const rule of array(readingRules, 'readingRules')) {
    record(rule, 'reading rule');
    const guid = text(rule.guid, 'reading rule guid');
    if (!rulesByGuid.has(guid)) rulesByGuid.set(guid, []);
    rulesByGuid.get(guid).push(rule);
  }
  const tasks = [], clips = new Map(), taskKeys = new Set();
  const summary = { tasks: 0, fields: 0, plannedInputs: 0, plannedPlacements: 0,
    pendingFields: 0, blockedFields: 0, pendingReasons: {}, fullyVoiced: false,
    recorded: null, sourceVerified: null, listeningAccepted: null, downloaded: null };
  for (const entry of array(catalog, 'catalog')) {
    record(entry, 'catalog entry');
    const { taskKey, noteGuid, contractId, passageId } = entry;
    for (const [name, value] of Object.entries({ noteGuid, contractId, passageId })) text(value, name);
    check(CONTRACTS.has(contractId), 'unknown task contract');
    check(taskKey === JSON.stringify([noteGuid, contractId, passageId]), 'task tuple mismatch');
    check(!taskKeys.has(taskKey), 'duplicate task'); taskKeys.add(taskKey);
    check(entry.contentReady === true, 'task content must be ready and accepted');
    if (entry.contentRevision !== undefined && entry.contentRevision !== null) text(entry.contentRevision, 'scheduler contentRevision');
    const isVocab = contractId === VOCAB;
    const source = isVocab ? vocabularySource(entry) : grammar.get(noteGuid);
    check(source, 'missing supplemental grammar record');
    if (!isVocab) {
      check(entry.grammarGuid === undefined || entry.grammarGuid === noteGuid, 'grammar guid mismatch');
      const selected = source.examples.get(passageId);
      check(selected && selected.ja === entry.ja && selected.en === entry.en &&
        source.pattern === entry.term && source.meaning === entry.meaning, 'grammar selected source mismatch');
    }
    const languages = has(languageAssignments, taskKey) ? languageAssignments[taskKey] : {};
    const readings = has(readingAssignments, taskKey) ? readingAssignments[taskKey] : {};
    const paths = new Set(source.fields.map(f => f.sourcePath));
    for (const path of [...Object.keys(languages), ...Object.keys(readings)]) check(paths.has(path), 'assignment has unknown sourcePath');
    const fields = [];
    for (const definition of source.fields) {
      const { sourcePath, sourceText } = definition;
      const sourceHash = sha256(sourceText), pending = new Set();
      let raw = { directives: [], pending: [] };
      if (isVocab && sourcePath === 'term') {
        if (nonempty(source.readings.reading)) raw.directives = [{ start: 0, end: Array.from(sourceText).length, reading: source.readings.reading }];
        else raw.pending.push('missing-readings');
      } else if (isVocab && sourcePath === 'ja') {
        raw = rawReadings(sourceText, source.readings.rubySegments, 'ruby');
        // A learner's contextual sentence can be an unannotated draft. Bare
        // kanji still needs a reading; no pronunciation is invented here.
        if (entry.manual === true && source.readings.rubySegments === null &&
            /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(sourceText)) raw = { directives: [], pending: [] };
      } else if (definition.tokenIndex !== undefined) raw = rawReadings(sourceText, source.readings.tokens[definition.tokenIndex], 'tokens');
      for (const reason of raw.pending) pending.add(reason);
      let directives = raw.directives;
      let readingEvidence = evidence(directives, isVocab ? 'source-unreviewed' : 'native-unreviewed');
      const rules = isVocab && sourcePath === 'ja' ? rulesByGuid.get(noteGuid) ?? [] : [];
      // Validate the raw overlap even when the caller supplies a replacement policy.
      if (rules.length) {
        const applied = overlayRules(sourceText, sourceHash, entry, directives, readingEvidence, rules);
        ({ directives, readingEvidence } = applied);
        applied.pending.forEach(reason => pending.add(reason));
      }
      if (has(readings, sourcePath)) {
        directives = validateInput(sourceText, readings[sourcePath]).segments[0].pronunciationDirectives;
        readingEvidence = evidence(directives, 'caller-assigned');
        if (rules.length) {
          const applied = overlayRules(sourceText, sourceHash, entry, directives, readingEvidence, rules);
          ({ directives, readingEvidence } = applied);
          applied.pending.forEach(reason => pending.add(reason));
        }
      } else if (definition.pronunciationPolicy) pending.add('pronunciation-unassigned');

      const language = has(languages, sourcePath) ? languages[sourcePath] : definition.language;
      const parts = language === null ? null : languagePartition(sourceText, language);
      if (!parts) pending.add('language-unassigned');
      const usedLanguages = new Set(parts?.map(p => p.language) ?? []);
      if ([...usedLanguages].some(l => !resolvedProfiles.has(l))) pending.add('profile-unassigned');
      const keys = new Set([...usedLanguages].filter(l => resolvedProfiles.has(l)).map(l => profileKeys.get(l)));
      if (keys.size > 1) pending.add('profile-conflict');

      const reviewNeeded = usedLanguages.has('ja') || definition.pronunciationPolicy || directives.length > 0;
      let covered = 0;
      const reviewed = readingEvidence.length > 0 && readingEvidence.every(d => {
        const contiguous = d.kind === 'reviewed-rule' && d.start === covered;
        covered = d.end;
        return contiguous;
      }) && covered === Array.from(sourceText).length;
      if (reviewNeeded && !reviewed) pending.add('reading-review-pending');
      const segments = parts ? splitSegments(sourceText, directives, parts) :
        [{ language: 'ja', text: sourceText, pronunciationDirectives: directives }];
      const blocked = [...pending].some(reason => reason !== 'reading-review-pending');
      // Always exercise seam bounds, including blocked fields; validation-only
      // inputs are discarded and never become clips or placements.
      const candidate = createSpeechInput({ segments, profile: blocked ? VALIDATION_PROFILE : resolvedProfiles.get(parts[0].language) });
      const sourceRef = canonicalStringify({ kind: isVocab ? 'vocabulary' : 'grammar', noteGuid,
        exampleId: definition.exampleId ?? null, field: sourcePath });
      const field = { sourcePath, sourceRef, sourceText, sourceHash, phase: 'answer',
        language: Array.isArray(language) ? parts : language, pendingReasons: [...pending], readingEvidence,
        readingReviewStatus: reviewNeeded ? (reviewed ? 'reviewed-rules' : 'pending') : null,
        speechInput: null, binding: null };
      if (definition.exampleId !== undefined) field.exampleId = definition.exampleId;
      if (definition.relatedReference) field.relatedReference = { ...definition.relatedReference };
      if (!blocked) {
        if (!clips.has(candidate.inputKey)) clips.set(candidate.inputKey, { inputKey: candidate.inputKey, scope: planScope, speechInput: candidate });
        field.speechInput = clips.get(candidate.inputKey).speechInput;
        field.binding = bindSpeechPlacement({ inputKey: candidate.inputKey,
          provenance: { sourceRef, sourceRevision, correctionLedgerRevision },
          placement: { taskKey, field: sourcePath, segment: 0, contentRevision: source.contentRevision, ...planScope } });
        summary.plannedPlacements++;
      } else summary.blockedFields++;
      summary.fields++;
      if (pending.size) summary.pendingFields++;
      for (const reason of pending) summary.pendingReasons[reason] = (summary.pendingReasons[reason] ?? 0) + 1;
      fields.push(field);
    }
    // The scheduler's historical revision can cover only JA. Audio freshness
    // instead binds every complete source field and its resolved language and
    // effective directives, regardless of whether a profile was assigned.
    // Ledger/profile identities and review labels are provenance, not speech.
    const audioContentRevision = sha256(canonicalStringify({
      format: 'nihongo-card-speech-source', version: 1,
      fields: fields.map(f => ({ sourcePath: f.sourcePath, sourceText: f.sourceText,
        exampleId: f.exampleId ?? null, language: f.language,
        pronunciationDirectives: f.readingEvidence.map(({start,end,reading}) => ({start,end,reading})),
        unresolved: f.pendingReasons.filter(reason => !['profile-unassigned','profile-conflict','reading-review-pending'].includes(reason)),
      })),
    }));
    for (const field of fields) if (field.binding) {
      field.binding = bindSpeechPlacement({ inputKey: field.binding.inputKey,
        provenance: field.binding.provenance,
        placement: { ...field.binding.placement, contentRevision: audioContentRevision } });
    }
    tasks.push({ taskKey, noteGuid, contractId, passageId,
      schedulerContentRevision: entry.contentRevision ?? null, audioContentRevision, fields });
  }
  for (const key of [...Object.keys(languageAssignments), ...Object.keys(readingAssignments)]) check(taskKeys.has(key), 'assignment has unknown taskKey');
  summary.tasks = tasks.length; summary.plannedInputs = clips.size;
  return freeze({ format: 'nihongo-card-speech-plan', version: 1, tasks, clips: [...clips.values()], summary });
}

/** Profile-independent exact source/audio freshness for one supplied task.
 * Pass the supplemental built grammar record for a grammar task. This helper
 * shares extraction, effective correction and assignment semantics with the
 * planner; it does not mutate the scheduler's contentRevision or authorize
 * playback. Missing/invalid source remains pending or fails as in the plan.
 */
export function cardSpeechSourceRevision(entry, {
  grammarRecords = [], readingRules = [], readingAssignments = {}, languageAssignments = {},
} = {}) {
  record(entry, 'catalog entry');
  assignmentMap(readingAssignments, 'readingAssignments');
  assignmentMap(languageAssignments, 'languageAssignments');
  // A single-task projection may receive the caller's complete assignment
  // maps. Only this task's assignments affect its revision; the full planner
  // still rejects keys outside its explicitly supplied catalog.
  const selected = assignments => has(assignments, entry.taskKey) ?
    { [entry.taskKey]: assignments[entry.taskKey] } : {};
  return planCardSpeech({ catalog: [entry], grammarRecords, readingRules,
    readingAssignments: selected(readingAssignments), languageAssignments: selected(languageAssignments), profiles: {},
    sourceRevision: 'source-revision-only', correctionLedgerRevision: 'identity-independent',
    scope: { accessScope: 'source-revision-only', licenseScope: 'source-revision-only' },
  }).tasks[0].audioContentRevision;
}
