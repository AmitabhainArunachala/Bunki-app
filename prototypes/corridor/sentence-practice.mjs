/** Source practice is part of the existing learner envelope. This module owns
 * validation and append-only evidence, never storage, navigation or FSRS state. */
import { createSourcePracticePlan, parseSourcePracticePlan, sourcePracticeContract,
  checkSourceCloze, gradeSourceCloze, observeSourceProduction, observeSourceListening, parseSourceListeningCue,
  createSourceKanjiReadingPlan, parseSourceKanjiReadingPlan, parseSourceKanjiReadingCue,
  checkSourceKanjiReading, gradeSourceKanjiReading,
  SOURCE_PRODUCTION_RUBRIC, SOURCE_LISTENING_RUBRIC,
  sha256Hex, parseEvent } from './modules/learning-core.mjs';
import { parseTeacherContext, teacherContextCanonicalText } from './teacher-context.mjs';
import { parseTeacherDrafts, TEACHER_DRAFT_TEXT_LIMIT } from './teacher-drafts.mjs';
import { parseSentenceDrafts, parseSentenceDraftIdentity, sameSentenceDraftIdentity,
  consumeSentenceDraft } from './sentence-drafts.mjs';

export { checkSourceCloze, checkSourceKanjiReading, SOURCE_PRODUCTION_RUBRIC, SOURCE_LISTENING_RUBRIC };
const MAX_ENTRIES = 2000, MAX_RESPONSES = 20000;
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value);
const copy = (value) => JSON.parse(JSON.stringify(value));
function insist(condition, code = 'invalid-sentence-practice') { if (!condition) throw new TypeError(code); }
function object(raw, keys) {
  insist(raw && typeof raw === 'object' && !Array.isArray(raw) && [Object.prototype, null].includes(Object.getPrototypeOf(raw)));
  const descriptors = Object.getOwnPropertyDescriptors(raw), own = Reflect.ownKeys(descriptors);
  insist(own.length === keys.length && own.every((key) => typeof key === 'string' && keys.includes(key) &&
    descriptors[key].enumerable && 'value' in descriptors[key]));
  return raw;
}
const canonical = (raw) => JSON.stringify(raw, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
const equal = (a, b) => canonical(a) === canonical(b);
function instant(at) { insist(typeof at === 'string' && new Date(at).toISOString() === at); return at; }
function contextFor(at, id) {
  instant(at); insist(uuid(id)); let counter = 0;
  return { clock: { now: () => at }, ids: { nextId: () => `${id}:${counter++}` }, random: { nextUnitInterval: () => 0 } };
}
function observedContext(event) {
  return { clock: { now: () => event.occurredAt }, ids: { nextId: () => event.eventId }, random: { nextUnitInterval: () => 0 } };
}
function checkedContext(raw) {
  const context = parseTeacherContext(raw);
  insist(context.id === `teacher-context:${sha256Hex(teacherContextCanonicalText(context))}`,
    'sentence-context-changed');
  return context;
}
function originOf(context, start, end, tokenSpan = null) {
  if (context.unit === 'token-index') {
    insist(tokenSpan?.unit === 'token-index' && tokenSpan.start === context.start && tokenSpan.end === context.end &&
      tokenSpan.index === context.index && Array.isArray(tokenSpan.surfaces) && tokenSpan.surfaces.join('') === context.quote,
    'sentence-context-changed');
  } else insist(tokenSpan === null, 'sentence-context-changed');
  return { contextRef: context.id, sourceId: context.sourceId, sourceDigest: context.sourceDigest,
    text: context.quote, ...(tokenSpan ? { tokenSpan } : { sentenceStart: context.start }),
    start, end, title: context.title, attribution: context.attribution };
}
function parseEntry(raw) {
  object(raw, ['context', 'plan']);
  const context = checkedContext(raw.context), plan = raw.plan?.kind === 'kanji-reading'
    ? parseSourceKanjiReadingPlan(raw.plan) : parseSourcePracticePlan(raw.plan);
  insist(equal(plan.origin, originOf(context, plan.origin.start, plan.origin.end, plan.origin.tokenSpan || null)), 'sentence-context-changed');
  return { context, plan };
}
function practiceContract(plan, mode) {
  if (plan?.kind !== 'kanji-reading') return sourcePracticeContract(plan, mode);
  insist(mode === 'kanji-reading', 'practice-mode-mismatch');
  return parseSourceKanjiReadingPlan(plan).contracts[0];
}
export function sentenceRecallMode(plan) {
  return plan?.kind === 'kanji-reading' ? 'kanji-reading' : 'cloze';
}
export function checkSentenceRecall(plan, response, revealed) {
  return plan?.kind === 'kanji-reading' ? checkSourceKanjiReading(plan, response, revealed)
    : checkSourceCloze(plan, response, revealed);
}
function gradeSentenceRecall(context, plan, input) {
  return plan?.kind === 'kanji-reading' ? gradeSourceKanjiReading(context, plan, input)
    : gradeSourceCloze(context, plan, input);
}
/** Source admission still belongs to the caller. Here, the exact full token
 * array and its boundaries must agree before an encounter becomes a choice. */
export function verifyBundledSentenceSource(raw, surfaces) {
  const context = checkedContext(raw);
  insist(context.sourceKind === 'bundled-passage' && Array.isArray(surfaces) &&
    surfaces.every((text) => typeof text === 'string' && !/[\uD800-\uDFFF]/u.test(text)) && context.end <= surfaces.length &&
    sha256Hex(JSON.stringify(surfaces)) === context.sourceDigest &&
    surfaces.slice(context.start, context.end).join('') === context.quote, 'sentence-context-changed');
  return context;
}
export function prepareBundledSentencePractice(raw, surfaces) {
  const context = verifyBundledSentenceSource(raw, surfaces);
  const tokens = surfaces.slice(context.start, context.end);
  const start = tokens.slice(0, context.index - context.start).join('').length;
  const end = start + tokens[context.index - context.start].length;
  const tokenSpan = { unit: 'token-index', start: context.start, end: context.end, index: context.index, surfaces: tokens };
  const origin = originOf(context, start, end, tokenSpan);
  // Refuse an unusable phrase before opening the choice; confirmation later
  // passes the complete origin through the domain contract parser.
  insist(tokens.join('') === context.quote && end > start && end - start <= 200 &&
    origin.text.slice(start, end).trim().length > 0, 'sentence-context-changed');
  return { context, start, end, tokenSpan };
}
export function prepareBundledKanjiReading(raw, passage, focusKanji) {
  insist(passage?.id === raw?.sourceId && Array.isArray(passage.tokens), 'reading-cue-unavailable');
  const prepared = prepareBundledSentencePractice(raw, passage.tokens.map(token => token.s));
  const token = passage.tokens[prepared.context.index];
  insist(token?.c === true, 'reading-cue-unavailable');
  const readingCue = parseSourceKanjiReadingCue({ version: 1, focusKanji,
    token: { s: token.s, b: token.b, r: token.r }, rubySource: passage.rubySource, reviewStatus: 'unreviewed' },
  originOf(prepared.context, prepared.start, prepared.end, prepared.tokenSpan));
  return { ...prepared, readingCue };
}
/** Historical plans remain parseable without a currently available source.
 * Prospective confirmation, response and grade must check this exact tuple. */
export function verifyCurrentKanjiReading(raw, passage) {
  const entry = parseEntry(raw);
  insist(entry.plan.kind === 'kanji-reading', 'practice-mode-mismatch');
  const current = prepareBundledKanjiReading(entry.context, passage, entry.plan.readingCue.focusKanji);
  insist(equal(current.readingCue, entry.plan.readingCue), 'reading-cue-changed');
  return entry;
}
export function createKanjiReadingPractice({ context, start, end, tokenSpan, readingCue, at, id, current = null }) {
  const checked = checkedContext(context);
  const previous = parseSentencePractice(current).entries.find(entry =>
    entry.plan.origin.text.slice(entry.plan.origin.start, entry.plan.origin.end) === checked.quote.slice(start, end));
  return parseEntry({ context: checked, plan: createSourceKanjiReadingPlan(contextFor(at, id),
    originOf(checked, start, end, tokenSpan), readingCue, previous?.plan.confirmation) });
}
export function selectBundledListeningCue(context, surfaces, catalog) {
  const prepared = prepareBundledSentencePractice(context, surfaces);
  insist(catalog?.version === 1, 'listening-cue-unavailable');
  const source = catalog.passages?.[prepared.context.sourceId];
  insist(source?.sourceDigest === prepared.context.sourceDigest && Array.isArray(source.sentences), 'listening-cue-unavailable');
  const matches = source.sentences.filter(row => row.start === context.start && row.end === context.end && row.quote === context.quote);
  insist(matches.length === 1, 'listening-cue-unavailable');
  return parseSourceListeningCue(matches[0].cue, originOf(context, prepared.start, prepared.end, prepared.tokenSpan));
}
export function createSentencePractice({ context, start, end, tokenSpan = null, modes, at, id, current = null, listeningCue }) {
  const checked = checkedContext(context);
  const previous = parseSentencePractice(current).entries.find((entry) =>
    entry.plan.origin.text.slice(entry.plan.origin.start, entry.plan.origin.end) === checked.quote.slice(start, end));
  return parseEntry({ context: checked, plan: createSourcePracticePlan(contextFor(at, id), originOf(checked, start, end, tokenSpan), modes,
    previous?.plan.confirmation, listeningCue) });
}
export function parseSentencePractice(raw) {
  if (raw == null) return { version: 1, entries: [], responses: [], grades: [] };
  object(raw, ['version', 'entries', 'responses', 'grades']); insist(raw.version === 1);
  insist(Array.isArray(raw.entries) && raw.entries.length <= MAX_ENTRIES && Array.isArray(raw.responses) &&
    raw.responses.length <= MAX_RESPONSES && Array.isArray(raw.grades) && raw.grades.length <= MAX_RESPONSES);
  const entries = raw.entries.map(parseEntry), byEntry = new Map(entries.map((entry) => [entry.plan.id, entry]));
  insist(byEntry.size === entries.length);
  const threads = new Map();
  for (const entry of entries) {
    const previous = threads.get(entry.plan.capture.threadId);
    insist(!previous || equal(entry.plan.confirmation, previous), 'source-promotion-replaced');
    threads.set(entry.plan.capture.threadId, entry.plan.confirmation);
  }
  const byResponse = new Map();
  const eventIds = new Set();
  const eventId = (event) => { insist(!eventIds.has(event.eventId), 'duplicate-practice-event'); eventIds.add(event.eventId); };
  for (const event of threads.values()) eventId(event);
  for (const entry of entries) for (const event of [entry.plan.capture, ...entry.plan.contracts]) eventId(event);
  for (const response of raw.responses) {
    object(response, ['id', 'entryId', 'mode', 'at', 'text', 'revealed', 'latencyMs', 'observation',
      ...(response.mode === 'listening' ? ['listening'] : [])]);
    insist(uuid(response.id) && !byResponse.has(response.id)); instant(response.at);
    insist(typeof response.text === 'string' && response.text.length <= 4000 &&
      Number.isSafeInteger(response.latencyMs) && response.latencyMs >= 0 && typeof response.revealed === 'boolean');
    const entry = byEntry.get(response.entryId); insist(entry);
    if (['cloze', 'kanji-reading'].includes(response.mode)) {
      practiceContract(entry.plan, response.mode);
      checkSentenceRecall(entry.plan, response.text, response.revealed); insist(response.observation === null);
    } else {
      insist(['production', 'listening'].includes(response.mode) && response.text.trim().length > 0 &&
        (response.mode === 'listening' || !response.revealed));
      // Canonical context parsing also enforces the same Unicode/prose boundary
      // on a response without requiring it to be a quote from the source.
      parseTeacherContext({ ...entry.context, quote: response.text, start: 0, end: response.text.length, index: 0 });
      const event = parseEvent(response.observation);
      eventId(event);
      const observe = response.mode === 'listening' ? observeSourceListening : observeSourceProduction;
      insist(event.type === 'ProductionObserved' && event.occurredAt === response.at &&
        equal(event, observe(observedContext(event), entry.plan, response.id)));
      if (response.mode === 'listening') {
        const playback = object(response.listening, ['audioSha256', 'completedPlays']);
        insist(playback.audioSha256 === entry.plan.listeningCue?.sha256 &&
          Number.isSafeInteger(playback.completedPlays) && playback.completedPlays > 0 && playback.completedPlays <= 1000);
      }
    }
    byResponse.set(response.id, response);
  }
  const graded = new Set(), gradeRows = new Set();
  for (const grade of raw.grades) {
    object(grade, ['responseId', 'observation', 'revlogIndex']);
    const response = byResponse.get(grade.responseId);
    insist(['cloze', 'kanji-reading'].includes(response?.mode) && !graded.has(response.id));
    insist(Number.isSafeInteger(grade.revlogIndex) && grade.revlogIndex >= 0 &&
      !gradeRows.has(grade.revlogIndex), 'sentence-grade-revlog-link');
    const event = parseEvent(grade.observation); insist(event.type === 'ReviewGraded');
    eventId(event);
    const expected = gradeSentenceRecall(observedContext(event), byEntry.get(response.entryId).plan, {
      response: response.text, revealed: response.revealed, grade: event.grade, latencyMs: response.latencyMs, responseId: response.id,
    });
    insist(equal(event, expected.observation)); graded.add(response.id); gradeRows.add(grade.revlogIndex);
  }
  return copy({ version: 1, entries, responses: raw.responses, grades: raw.grades });
}
export function selectSentencePractice(raw, id) {
  return parseSentencePractice(raw).entries.find((entry) => entry.plan.id === id) || null;
}
/** Preparing prose is a local edit, never a submission or an assessment. The
 * caller must still resolve the source and use the live draft controller. */
export function prepareSentenceQuestion(raw, { entryId, responseId, draft = null, language = 'en' }) {
  const root = parseSentencePractice(raw);
  const entry = root.entries.find((row) => row.plan.id === entryId);
  const response = root.responses.find((row) => row.id === responseId && row.entryId === entryId);
  insist(entry && ['production', 'listening'].includes(response?.mode), 'sentence-response-unavailable');
  insist(language === 'ja' || language === 'en', 'sentence-question-language');
  const previous = parseTeacherDrafts({ version: 1, entries: draft === null ? [] : [draft] }).entries[0];
  insist(!previous || previous.contextRef === entry.context.id, 'sentence-question-topic');
  const before = previous && !previous.consumed ? previous.text : '';
  const phrase = entry.plan.origin.text.slice(entry.plan.origin.start, entry.plan.origin.end);
  const question = response.mode === 'listening' ? language === 'ja'
    ? `保存した文の合成音声を聞いて、分かったことを自分の言葉で書きました。回答は未確認です。${response.revealed ? '回答を保存する前に本文を開きました。' : 'この練習中は本文を開いていません。'}\n\n${response.text}\n\n元の文の意味と比べて、理解できた点と確認が必要な点を教えてください。音声の正確さを検証したという意味ではありません。`
    : `After listening to this saved sentence’s synthetic recording, I wrote what I understood. This response is unchecked. ${response.revealed ? 'I opened the transcript before saving.' : 'I did not open the transcript during this exercise.'}\n\n${response.text}\n\nCompare my understanding with the source sentence. Explain what fits and what needs checking. This does not establish that the audio is accurate.`
    : language === 'ja'
    ? `保存した文の「${phrase}」を使って、自分の文を書きました。\n\n${response.text}\n\n意味が伝わるか、表現・文法・場面が合っているかを教えてください。直すところがあれば、理由も知りたいです。`
    : `I am practicing 「${phrase}」 from this saved sentence. Here is my own response:\n\n${response.text}\n\nPlease help me improve it. Is my meaning clear, and do the wording, grammar, and register fit? Explain any changes.`;
  // An unchanged prepared question need not be appended twice. This literal
  // comparison is only an editing convenience; it establishes no evidence.
  const alreadyIncluded = before.includes(question);
  const text = alreadyIncluded ? before : before ? `${before}\n\n${question}` : question;
  insist(text.length <= TEACHER_DRAFT_TEXT_LIMIT, 'sentence-question-too-long');
  return { context: entry.context, response, text, alreadyIncluded };
}
export function acceptSentencePractice(raw, candidate) {
  const root = parseSentencePractice(raw), entry = parseEntry(candidate);
  const existing = root.entries.find((row) => row.plan.id === entry.plan.id);
  if (existing) {
    insist(equal(existing.context, entry.context) && equal(existing.plan.origin, entry.plan.origin), 'sentence-context-changed');
    const additions = entry.plan.contracts.filter((contract) =>
      !existing.plan.contracts.some((saved) => saved.contractId === contract.contractId));
    if (existing.plan.listeningCue && entry.plan.listeningCue)
      insist(equal(existing.plan.listeningCue, entry.plan.listeningCue), 'listening-cue-changed');
    if (!additions.length) return root;
    insist(equal(existing.plan.confirmation, entry.plan.confirmation), 'source-promotion-replaced');
    // Each explicit later choice creates a contract. The original promotion
    // remains one event; a Master -> Master no-op is invalid in kernel replay.
    const merged = { ...existing, plan: { ...existing.plan,
      contracts: [...existing.plan.contracts, ...additions],
      ...(entry.plan.listeningCue ? { listeningCue: entry.plan.listeningCue } : {}) } };
    return parseSentencePractice({ ...root, entries: root.entries.map((row) => row === existing ? merged : row) });
  }
  insist(root.entries.length < MAX_ENTRIES, 'sentence-practice-capacity');
  return parseSentencePractice({ ...root, entries: [...root.entries, entry] });
}
export function appendSentenceResponse(raw, { entryId, mode, at, id, text, revealed = false, latencyMs = 0, listening }) {
  const root = parseSentencePractice(raw), entry = root.entries.find((row) => row.plan.id === entryId);
  insist(entry && !root.responses.some((response) => response.id === id));
  insist(root.responses.length < MAX_RESPONSES, 'sentence-practice-capacity');
  practiceContract(entry.plan, mode);
  const observation = mode === 'production' ? observeSourceProduction(contextFor(at, id), entry.plan, id)
    : mode === 'listening' ? observeSourceListening(contextFor(at, id), entry.plan, id) : null;
  insist(mode === 'listening' || listening === undefined);
  const response = { id, entryId, mode, at, text, revealed, latencyMs, observation,
    ...(mode === 'listening' ? { listening } : {}) };
  return parseSentencePractice({ ...root, responses: [...root.responses, response] });
}
/** Only an explicit response action calls this operation. A revision identifies
 * that submission across an uncertain acknowledgement; newer edits stay drafts. */
export function saveSentenceDraftResponse(raw, rawDrafts, { submitted: rawSubmitted, at, latencyMs = 0, listening }) {
  const submitted = parseSentenceDraftIdentity(rawSubmitted);
  const root = parseSentencePractice(raw), drafts = parseSentenceDrafts(rawDrafts);
  const entry = root.entries.find((row) => row.plan.id === submitted.entryId);
  insist(entry && submitted.text.trim().length > 0, 'sentence-response-unavailable');
  sourcePracticeContract(entry.plan, submitted.mode);
  insist(submitted.mode === 'listening' || listening === undefined);
  const revealed = submitted.mode === 'listening' && submitted.transcriptOpened;
  const collision = drafts.entries.find((row) => row.revision === submitted.revision);
  insist(!collision || sameSentenceDraftIdentity(collision, submitted), 'sentence-draft-revision-reused');
  const previous = root.responses.find((row) => row.id === submitted.revision);
  if (previous) {
    insist(previous.entryId === submitted.entryId && previous.mode === submitted.mode &&
      previous.text === submitted.text && previous.revealed === revealed, 'sentence-response-collision');
    // Retry preserves the original observation, timestamp and playback/latency
    // metadata. A later caller cannot rewrite an already saved attempt.
    return { sentencePractice: root, sentenceDrafts: consumeSentenceDraft(drafts, submitted) };
  }
  const current = drafts.entries.find((row) => row.entryId === submitted.entryId && row.mode === submitted.mode);
  insist(current && !(sameSentenceDraftIdentity(current, submitted) && current.consumed), 'sentence-draft-unavailable');
  return {
    sentencePractice: appendSentenceResponse(root, { entryId: submitted.entryId, mode: submitted.mode,
      id: submitted.revision, at, text: submitted.text, revealed, latencyMs, listening }),
    sentenceDrafts: consumeSentenceDraft(drafts, submitted),
  };
}
export function appendSentenceGrade(raw, { responseId, grade, at, id, revlogIndex }) {
  const root = parseSentencePractice(raw), response = root.responses.find((row) => row.id === responseId);
  insist(['cloze', 'kanji-reading'].includes(response?.mode) && !root.grades.some((row) => row.responseId === responseId), 'sentence-response-already-graded');
  const entry = root.entries.find((row) => row.plan.id === response.entryId);
  const result = gradeSentenceRecall(contextFor(at, id), entry.plan, {
    response: response.text, revealed: response.revealed, grade, latencyMs: response.latencyMs, responseId,
  });
  return { root: parseSentencePractice({ ...root, grades: [...root.grades, { responseId, observation: result.observation, revlogIndex }] }),
    grade: result.grade, entryId: entry.plan.id };
}
export function validateSentencePracticeRecord(record) {
  try {
    const root = parseSentencePractice(record.sentencePractice);
    const contexts = record.teacherContexts?.entries || [];
    if (!root.entries.every((entry) => contexts.some((context) => context.id === entry.context.id && equal(context, entry.context)))) return false;
    for (const item of record.taken || []) if (item.t === 'sentence') {
      const entry = root.entries.find((row) => row.plan.id === item.id);
      if (!entry || item.sourceContextRef !== entry.context.id || item.label !== entry.context.quote) return false;
      practiceContract(entry.plan, sentenceRecallMode(entry.plan));
    }
    for (const grade of root.grades) {
      const response = root.responses.find((row) => row.id === grade.responseId), row = record.revlog?.[grade.revlogIndex];
      if (!row || row[1] !== `sentence:${response.entryId}` || row[2] !== ['again', 'hard', 'good', 'easy'].indexOf(grade.observation.grade) + 1 ||
          row[0] !== Date.parse(grade.observation.occurredAt)) return false;
    }
    const revlog = record.revlog || [], undone = new Set();
    for (const [index, row] of revlog.entries()) {
      if (row[2] === 0) {
        const targetIndex = row[3], target = revlog[targetIndex];
        if (row[1]?.startsWith('sentence:') || target?.[1]?.startsWith('sentence:')) {
          if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= index ||
              row[1] !== target?.[1] || ![1, 2, 3, 4].includes(target?.[2]) || undone.has(targetIndex) ||
              !root.grades.some(grade => grade.revlogIndex === targetIndex)) return false;
          undone.add(targetIndex);
        }
      } else if (row[1]?.startsWith('sentence:') && !root.grades.some(grade => grade.revlogIndex === index)) return false;
    }
    return true;
  } catch { return false; }
}

/** A local reading choice derived from acknowledged practice, never a grade,
 * enrolment or ability estimate. Exact token form, dictionary form and reading
 * must agree; matching surface text alone does not join two homographs. */
export function recommendSentenceReadings(record, passages, { startingLevel = null, challenge = 'comfortable',
  entryId = null, limit = 1 } = {}) {
  insist(validateSentencePracticeRecord(record), 'invalid-reading-history');
  insist(Array.isArray(passages) && Number.isInteger(limit) && limit >= 1 && limit <= 6);
  const levels = ['N5', 'N4', 'N3', 'N2', 'N1'];
  insist(startingLevel === null || levels.includes(startingLevel));
  insist(['comfortable', 'stretch', 'free'].includes(challenge));
  const root = parseSentencePractice(record.sentencePractice);
  const byPassage = new Map(passages.map(p => [p.id, p]));
  insist(byPassage.size === passages.length, 'duplicate-reading-source');
  const lexicalKey = token => token?.c === true && typeof token.s === 'string' && token.s.trim() &&
    typeof token.b === 'string' && token.b.trim() && typeof token.r === 'string' && token.r.trim()
    ? JSON.stringify([token.s, token.b, token.r]) : null;
  const normalized = text => text.replace(/\s/gu, '');
  const sourceDigest = p => sha256Hex(JSON.stringify(p.tokens.map(token => token.s)));
  const groups = new Map(), entryGroups = new Map();
  for (const entry of root.entries) {
    if (entry.context.sourceKind !== 'bundled-passage') continue;
    const p = byPassage.get(entry.context.sourceId);
    if (!Array.isArray(p?.tokens)) continue;
    try { verifyBundledSentenceSource(entry.context, p.tokens.map(token => token.s)); }
    catch { continue; }
    if (entry.context.title !== p.title || entry.context.attribution !== (p.attribution || p.sourceLabel || '') ||
        entry.context.url !== (p.url || null)) continue;
    const token = p.tokens[entry.context.index], lexical = lexicalKey(token);
    if (!lexical || entry.plan.origin.text.slice(entry.plan.origin.start, entry.plan.origin.end) !== token.s) continue;
    const reading = entry.plan.kind === 'kanji-reading';
    if (reading) {
      try { verifyCurrentKanjiReading(entry, p); } catch { continue; }
    }
    // A cloze grade is never reading evidence for the sibling contract.
    const key = reading ? canonical([lexical, 'orthography_to_reading', entry.plan.readingCue]) : lexical;
    const group = groups.get(key) || { key, lexical, token, reading, entries: [], grades: [] };
    group.entries.push(entry); groups.set(key, group); entryGroups.set(entry.plan.id, group);
  }
  const responses = new Map(root.responses.map(row => [row.id, row]));
  const undone = new Set((record.revlog || []).filter(row => row[2] === 0 && row[1]?.startsWith('sentence:')).map(row => row[3]));
  for (const grade of root.grades) {
    const response = responses.get(grade.responseId), group = entryGroups.get(response.entryId);
    if (group && !undone.has(grade.revlogIndex) && grade.observation.tier === 'A') {
      group.grades.push({ ...grade, entryId: response.entryId });
    }
  }
  const timeOrder = (a, b) => a.observation.occurredAt.localeCompare(b.observation.occurredAt) ||
    a.observation.eventId.localeCompare(b.observation.eventId);
  const ranked = [...groups.values()].filter(group => !entryId || group.entries.some(entry => entry.plan.id === entryId))
    .map(group => ({ ...group, latest: group.grades.sort(timeOrder).at(-1) || null }));
  const needsSupport = group => ['again', 'hard'].includes(group.latest?.observation.grade);
  ranked.sort((a, b) => Number(needsSupport(b)) - Number(needsSupport(a)) ||
    (b.latest?.observation.occurredAt || b.entries.at(-1).plan.capture.occurredAt)
      .localeCompare(a.latest?.observation.occurredAt || a.entries.at(-1).plan.capture.occurredAt) || a.key.localeCompare(b.key));
  const preferred = levels.indexOf(startingLevel || 'N5');
  const maximum = challenge === 'free' ? 4 : Math.min(4, preferred + (challenge === 'stretch' ? 1 : 0));
  const suggestions = [];
  for (const group of ranked) {
    const from = group.entries.find(entry => entry.plan.id === group.latest?.entryId) || group.entries.at(-1);
    const evidence = group.latest ? { responseId: group.latest.responseId, eventId: group.latest.observation.eventId,
      grade: group.latest.observation.grade, at: group.latest.observation.occurredAt, modality: 'text',
      ...(group.reading ? { skill: 'orthography_to_reading', token: copy(from.plan.readingCue.token),
        rubySource: from.plan.readingCue.rubySource, reviewStatus: from.plan.readingCue.reviewStatus } : {}) } : null;
    let context = from.context, authorLevel = byPassage.get(context.sourceId)?.authorLevel || null;
    const kind = needsSupport(group) ? 'revisit' : 'new-context';
    if (kind === 'new-context') {
      const usedSources = new Set(group.entries.map(entry => entry.context.sourceId));
      const usedDigests = new Set(group.entries.map(entry => entry.context.sourceDigest));
      const usedQuotes = new Set(group.entries.map(entry => normalized(entry.context.quote)));
      const candidates = [];
      for (const p of passages) {
        const level = levels.indexOf(p.authorLevel);
        if (!Array.isArray(p.tokens) || level < 0 || level > maximum || usedSources.has(p.id) ||
            Object.hasOwn(record.readDone || {}, p.id) || String(p.file || '').startsWith('archive/')) continue;
        const digest = sourceDigest(p);
        if (usedDigests.has(digest)) continue;
        for (let index = 0; index < p.tokens.length; index++) {
          if (lexicalKey(p.tokens[index]) !== group.lexical) continue;
          let start = index, end = index + 1;
          while (start > 0 && !['。', '！', '？'].includes(p.tokens[start - 1].s)) start--;
          while (end < p.tokens.length && !['。', '！', '？'].includes(p.tokens[end - 1].s)) end++;
          const quote = p.tokens.slice(start, end).map(token => token.s).join('');
          if (usedQuotes.has(normalized(quote))) continue;
          try {
            const value = { version: 1, id: `teacher-context:${'0'.repeat(64)}`, sourceKind: 'bundled-passage', sourceId: p.id,
              sourceDigest: digest, unit: 'token-index', start, end, index, quote, title: p.title,
              attribution: p.attribution || p.sourceLabel || '', url: p.url || null, target: { type: 'word', id: group.token.b } };
            value.id = `teacher-context:${sha256Hex(teacherContextCanonicalText(value))}`;
            const checked = verifyBundledSentenceSource(value, p.tokens.map(token => token.s));
            candidates.push({ context: checked, authorLevel: p.authorLevel, distance: Math.abs(level - preferred),
              above: level > preferred, characters: Number.isFinite(p.chars) ? p.chars : p.tokens.map(token => token.s).join('').length });
          } catch { /* An unusable sentence is not a selectable source. */ }
        }
      }
      candidates.sort((a, b) => Number(a.above) - Number(b.above) || a.distance - b.distance || a.characters - b.characters ||
        a.context.sourceId.localeCompare(b.context.sourceId) || a.context.index - b.context.index);
      if (!candidates.length) continue;
      ({ context, authorLevel } = candidates[0]);
    }
    const value = { kind, word: group.token.s, fromEntryId: from.plan.id, fromContext: from.context,
      context, authorLevel, preferredLevel: startingLevel, challenge, evidence,
      ...(group.reading ? { practiceKind: 'kanji-reading' } : {}) };
    suggestions.push({ id: `sentence-reading:${sha256Hex(canonical(value))}`, ...value });
    if (suggestions.length === limit) break;
  }
  return suggestions;
}
