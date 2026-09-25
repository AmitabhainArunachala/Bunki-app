/** Exact-question retrieval, separate from lexical knowledge and test scores.
 * This module has no storage, clock, network or scheduler. Hosts admit sources,
 * verify cached media bytes, and commit each returned grade with its FSRS row.
 * Historical validation never requires a source that may since be deleted. */
import { parseFormVersion, parseItemVersion, parsePassageVersion, parseMediaVersion,
  createAiReviewPresentation } from './modules/assessment-core.mjs';
import { encodeLocalJson } from './modules/record-core.mjs';

export const ASSESSMENT_QUESTION_POLICY = 'assessment-question/1';
const FORMAT = 'kairo-assessment-question-practice';
const PLAN_FORMAT = 'kairo-assessment-question-plan';
const MAX_PLANS = 2000, MAX_RESPONSES = 20000;
const GRADES = ['again', 'hard', 'good', 'easy'];
const digest = value => encodeLocalJson(value).sha256;
const copy = value => JSON.parse(encodeLocalJson(value).text);
const same = (a, b) => digest(a) === digest(b);
const mediaProofs = new WeakSet();
const fail = reason => { throw new TypeError(`Assessment question: ${reason}`); };
const insist = (condition, reason) => { if (!condition) fail(reason); };
function fields(raw, required, optional = []) {
  insist(raw && typeof raw === 'object' && !Array.isArray(raw) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(raw)), 'invalid-object');
  const descriptors = Object.getOwnPropertyDescriptors(raw), keys = Reflect.ownKeys(descriptors);
  insist(required.every(key => keys.includes(key)) && keys.every(key => typeof key === 'string' &&
    [...required, ...optional].includes(key) && descriptors[key].enumerable && 'value' in descriptors[key]), 'invalid-fields');
  return raw;
}
function id(value) {
  insist(typeof value === 'string' && value.length > 0 && value.length <= 200 &&
    ![...value].some(c => c.codePointAt(0) < 32 || c.codePointAt(0) === 127), 'invalid-id');
  return value;
}
function instant(value) {
  insist(typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value, 'invalid-instant'); return value;
}
function reference(value, kind) {
  fields(value, ['kind', 'id', 'revisionId', 'sha256']);
  insist(value.kind === kind && /^[a-f0-9]{64}$/u.test(value.sha256), 'invalid-reference');
  id(value.id); id(value.revisionId); return copy(value);
}
const ref = (value, kind) => ({ kind, id: value.id, revisionId: value.revisionId, sha256: value.sha256 });
function editorial(value) {
  fields(value, ['status', 'policyVersion', 'decisionRevisionIds']);
  insist(['ai-reviewed-practice', 'ai-reviewed-full'].includes(value.status) &&
    Array.isArray(value.decisionRevisionIds) && value.decisionRevisionIds.length > 0 &&
    value.decisionRevisionIds.length <= 1000 && new Set(value.decisionRevisionIds).size === value.decisionRevisionIds.length,
  'review-required');
  id(value.policyVersion); value.decisionRevisionIds.forEach(id); return copy(value);
}
const permitted = value => ['display', 'retain'].every(operation => value.rights?.[operation]?.status === 'allowed');
function capsule(form, item, presentation) {
  if (!item.media.length) return null;
  insist(presentation, 'presentation-required');
  fields(presentation, ['delivery', 'reviewedSha256']);
  const verified = createAiReviewPresentation(form, presentation.delivery);
  insist(presentation.reviewedSha256 === verified.deliverySha256, 'presentation-not-reviewed');
  return { deliverySha256: verified.deliverySha256,
    units: verified.delivery.units.filter(unit => unit.itemIds.includes(item.id)),
    assets: verified.delivery.assets.filter(asset => item.media.some(mediaRef =>
      form.media.find(media => same(ref(media, 'media'), mediaRef))?.assetId === asset.assetId)) };
}
function parseCapsule(value, item, media) {
  if (!media.length) { insist(value === null, 'unexpected-presentation'); return null; }
  fields(value, ['deliverySha256', 'units', 'assets']);
  insist(/^[a-f0-9]{64}$/u.test(value.deliverySha256) && Array.isArray(value.units) &&
    value.units.length <= 256 && Array.isArray(value.assets) && value.assets.length === media.length, 'invalid-presentation');
  const assets = new Set(), units = new Set(), audio = new Set();
  for (const asset of value.assets) {
    fields(asset, ['assetId', 'path', 'bytesSha256', 'mimeType']);
    const source = media.find(row => row.assetId === asset.assetId);
    insist(source && !assets.has(asset.assetId) && source.bytesSha256 === asset.bytesSha256 && source.mimeType === asset.mimeType &&
      typeof asset.path === 'string' && asset.path.length <= 1000 && /^[a-zA-Z0-9_./-]+$/u.test(asset.path) &&
      !asset.path.split('/').some(part => !part || part === '.' || part === '..'), 'invalid-presentation-asset');
    assets.add(asset.assetId);
  }
  for (const unit of value.units) {
    fields(unit, ['id', 'kind', 'itemIds', 'media', 'printedOptions', 'stimulusPlayCount'], ['voiceRoles']);
    id(unit.id); reference(unit.media, 'media');
    insist(!units.has(unit.id) && !audio.has(unit.media.sha256) && ['example', 'question'].includes(unit.kind) &&
      Array.isArray(unit.itemIds) && unit.itemIds.includes(item.id) && unit.itemIds.length <= 1000 &&
      new Set(unit.itemIds).size === unit.itemIds.length && unit.itemIds.every(value => { id(value); return true; }) &&
      media.some(row => row.kind === 'audio' && same(ref(row, 'media'), unit.media)) &&
      typeof unit.printedOptions === 'boolean' && unit.stimulusPlayCount === 1, 'invalid-presentation-unit');
    if (unit.voiceRoles !== undefined) {
      insist(unit.voiceRoles && typeof unit.voiceRoles === 'object' && !Array.isArray(unit.voiceRoles) &&
        Object.entries(unit.voiceRoles).length <= 32 && Object.entries(unit.voiceRoles).every(([key, role]) => {
          id(key); return typeof role === 'string' && role.length > 0 && role.length <= 100;
        }), 'invalid-voice-roles');
    }
    units.add(unit.id); audio.add(unit.media.sha256);
  }
  insist(media.filter(row => row.kind === 'audio').every(row => audio.has(row.sha256)) &&
    (item.skill !== 'listening' || value.units.some(unit => unit.kind === 'question')), 'missing-question-audio');
  return copy(value);
}
function presentationIdentity(item, passages, media, presentation) {
  return digest({ item: ref(item, 'item'), passages: passages.map(row => ref(row, 'passage')),
    media: media.map(row => ref(row, 'media')), presentation });
}
function planId(form, item, presentationSha256) {
  return `assessment-question:${digest([ASSESSMENT_QUESTION_POLICY, form, ref(item, 'item'), presentationSha256])}`;
}

/** Caller has already selected an eligible completed result. Missing admission
 * is a real unavailable card, never permission to turn a transcript into audio. */
export function deriveAssessmentQuestion({ form: rawForm, item: rawItem, editorialAtStart, completedAt, presentation = null }) {
  if (!['ai-reviewed-practice', 'ai-reviewed-full'].includes(editorialAtStart?.status)) return null;
  const form = parseFormVersion(rawForm), item = form.items.find(row => row.id === rawItem?.id);
  insist(item && same(item, rawItem), 'item-not-in-form');
  if (item.response.kind === 'written' && item.response.marking.kind === 'manual') return null;
  const passages = item.passages.map(itemRef => form.passages.find(row => same(ref(row, 'passage'), itemRef)));
  const media = item.media.map(itemRef => form.media.find(row => same(ref(row, 'media'), itemRef)));
  if (![form, item, ...passages, ...media].every(permitted)) return null;
  if (media.length && !presentation) return null;
  if (media.some(row => row.kind === 'audio') && editorialAtStart.status !== 'ai-reviewed-full') return null;
  const reviewed = editorial(editorialAtStart), presented = capsule(form, item, presentation);
  const presentationSha256 = presentationIdentity(item, passages, media, presented);
  const plan = { format: PLAN_FORMAT, v: 1, policy: ASSESSMENT_QUESTION_POLICY,
    id: planId(ref(form, 'form'), item, presentationSha256), form: ref(form, 'form'),
    title: form.title, item, passages, media, presentation: presented, presentationSha256,
    editorialAtCreation: reviewed, createdAt: new Date(completedAt).toISOString() };
  const parsed = parseAssessmentQuestionPlan(plan);
  return { t: 'question', id: parsed.id, label: item.prompt, question: parsed };
}

export function parseAssessmentQuestionPlan(raw) {
  fields(raw, ['format', 'v', 'policy', 'id', 'form', 'title', 'item', 'passages', 'media', 'presentation',
    'presentationSha256', 'editorialAtCreation', 'createdAt']);
  insist(raw.format === PLAN_FORMAT && raw.v === 1 && raw.policy === ASSESSMENT_QUESTION_POLICY &&
    typeof raw.title === 'string' && raw.title.length > 0 && raw.title.length <= 500 &&
    Array.isArray(raw.passages) && raw.passages.length <= 8 && Array.isArray(raw.media) && raw.media.length <= 8,
  'invalid-plan');
  const form = reference(raw.form, 'form'), item = parseItemVersion(raw.item);
  const passages = raw.passages.map(parsePassageVersion), media = raw.media.map(parseMediaVersion);
  insist(same(item.passages, passages.map(row => ref(row, 'passage'))) &&
    same(item.media, media.map(row => ref(row, 'media'))) &&
    !(item.response.kind === 'written' && item.response.marking.kind === 'manual') &&
    [item, ...passages, ...media].every(permitted), 'invalid-plan-source');
  const review = editorial(raw.editorialAtCreation);
  insist(!media.some(row => row.kind === 'audio') || review.status === 'ai-reviewed-full', 'native-audio-review-required');
  const presentation = parseCapsule(raw.presentation, item, media);
  const presentationSha256 = presentationIdentity(item, passages, media, presentation);
  insist(raw.presentationSha256 === presentationSha256 && raw.id === planId(form, item, presentationSha256), 'plan-binding-changed');
  instant(raw.createdAt);
  return copy(raw);
}

/** Exact retained form binding is distinct from live admission. Imports and
 * historical follow-up validation can use this after a source was hidden;
 * prospective answers must additionally use assertAssessmentQuestionSource. */
export function assertAssessmentQuestionForm(rawPlan, rawForm) {
  const plan = parseAssessmentQuestionPlan(rawPlan), form = parseFormVersion(rawForm);
  const item = form.items.find(row => row.id === plan.item.id);
  insist(same(plan.form, ref(form, 'form')) && plan.title === form.title && item && same(item, plan.item) &&
    same(plan.passages, item.passages.map(itemRef => form.passages.find(row => same(ref(row, 'passage'), itemRef)))) &&
    same(plan.media, item.media.map(itemRef => form.media.find(row => same(ref(row, 'media'), itemRef)))) &&
    permitted(form), 'source-changed');
  return plan;
}

/** Historical bytes parse even after deletion. Every prospective response and
 * grade separately needs the host's currently visible, exactly admitted form. */
export function assertAssessmentQuestionSource(rawPlan, source) {
  insist(source?.visible === true, 'source-unavailable');
  const plan = assertAssessmentQuestionForm(rawPlan, source.form);
  const item = source.form?.items?.find(row => row.id === plan.item.id);
  const target = deriveAssessmentQuestion({ form: source.form, item,
    editorialAtStart: source.editorialAtStart, completedAt: plan.createdAt, presentation: source.presentation || null });
  insist(target && target.id === plan.id && same(target.question.form, plan.form) &&
    same(target.question.item, plan.item) && same(target.question.passages, plan.passages) &&
    same(target.question.media, plan.media) && same(target.question.presentation, plan.presentation), 'source-changed-or-unreviewed');
  if (plan.media.length) insist(mediaProofs.has(source.mediaProof) && source.mediaProof.planId === plan.id,
    'verified-media-required');
  return plan;
}

/** Pure byte verification. Loading from the admitted offline cache belongs to
 * the host; a JSON object claiming a digest cannot substitute for these bytes. */
export async function verifyAssessmentQuestionMedia(rawPlan, assets) {
  const plan = parseAssessmentQuestionPlan(rawPlan);
  insist(Array.isArray(assets) && assets.length === plan.media.length, 'media-bytes-required');
  const verifiedMedia = [];
  for (const media of plan.media) {
    const matches = assets.filter(asset => asset?.assetId === media.assetId);
    insist(matches.length === 1 && matches[0].mimeType === media.mimeType, 'media-bytes-changed');
    const input = matches[0].bytes;
    insist(input instanceof ArrayBuffer || ArrayBuffer.isView(input), 'media-bytes-required');
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    insist(bytes.byteLength > 0 && bytes.byteLength <= 100_000_000, 'media-byte-budget');
    const sha = [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    insist(sha === media.bytesSha256, 'media-bytes-changed');
    verifiedMedia.push(Object.freeze({ assetId: media.assetId, bytesSha256: sha }));
  }
  const proof = Object.freeze({ planId: plan.id, verifiedMedia: Object.freeze(verifiedMedia) });
  mediaProofs.add(proof); return proof;
}

/** Front projection contains no key, rationale, transcript or unprinted
 * spoken options. Repetition is item recall, not a new proficiency result. */
export function questionReviewFace(rawPlan, { revealed = false } = {}) {
  const plan = parseAssessmentQuestionPlan(rawPlan), item = plan.item;
  const response = copy(item.response);
  const printedOptions = !plan.presentation?.units.some(unit => unit.kind === 'question' && !unit.printedOptions);
  if (!revealed) {
    delete response.answerOptionId; delete response.answerOrder; delete response.marking;
    if (!printedOptions && response.options) response.options = response.options.map(option => ({ id: option.id }));
  }
  const media = plan.media.map(row => {
    const value = copy(row);
    if (!revealed) { delete value.transcript; delete value.transcriptSha256; if (value.kind === 'image') delete value.alt; }
    return value;
  });
  return { id: plan.id, title: plan.title, skill: item.skill, task: item.task,
    prompt: item.prompt, translatedInstruction: item.translatedInstruction, response,
    passages: copy(plan.passages), media, units: copy(plan.presentation?.units || []), printedOptions,
    ...(revealed ? { rationale: item.rationale } : {}), practiceKind: 'question-recall', priorExposure: 'reported' };
}

function answer(plan, raw) {
  const spec = plan.item.response;
  if (spec.kind === 'selected') {
    fields(raw, ['kind', 'optionId']);
    insist(raw.kind === 'selected' && spec.options.some(option => option.id === raw.optionId), 'invalid-response');
    return raw.optionId === spec.answerOptionId;
  }
  if (spec.kind === 'ordered') {
    fields(raw, ['kind', 'tokenIds']);
    insist(raw.kind === 'ordered' && Array.isArray(raw.tokenIds) && raw.tokenIds.length === spec.tokens.length &&
      new Set(raw.tokenIds).size === raw.tokenIds.length && raw.tokenIds.every(value => spec.tokens.some(token => token.id === value)), 'invalid-response');
    return same(raw.tokenIds, spec.answerOrder);
  }
  fields(raw, ['kind', 'text']);
  insist(raw.kind === 'written' && typeof raw.text === 'string' && raw.text.length <= spec.maxChars &&
    raw.text.trim().length > 0 && spec.marking.kind === 'exact', 'invalid-response');
  return spec.marking.accepted.includes(raw.text);
}
function checkedMediaEvidence(plan, raw, revealed) {
  fields(raw, ['verifiedMedia', 'audio']);
  insist(same(raw.verifiedMedia, plan.media.map(media => ({ assetId: media.assetId, bytesSha256: media.bytesSha256 }))) &&
    Array.isArray(raw.audio) && raw.audio.length === plan.media.filter(media => media.kind === 'audio').length, 'invalid-media-evidence');
  const ids = new Set();
  for (const audio of raw.audio) {
    fields(audio, ['assetId', 'startedPlays', 'completedPlays', 'interrupted', 'transcriptOpened']);
    insist(!ids.has(audio.assetId) && plan.media.some(media => media.kind === 'audio' && media.assetId === audio.assetId) &&
      Number.isSafeInteger(audio.completedPlays) && audio.completedPlays >= 0 && audio.completedPlays <= 1000 &&
      Number.isSafeInteger(audio.startedPlays) && audio.startedPlays >= audio.completedPlays && audio.startedPlays <= 1000 &&
      typeof audio.interrupted === 'boolean' && typeof audio.transcriptOpened === 'boolean' &&
      (audio.completedPlays > 0 || revealed || audio.interrupted), 'audio-not-heard');
    ids.add(audio.assetId);
  }
  return raw;
}
function checkedResponse(plan, row) {
  fields(row, ['id', 'planId', 'response', 'revealed', 'at', 'latencyMs', 'mediaEvidence']);
  id(row.id); instant(row.at);
  insist(row.planId === plan.id && typeof row.revealed === 'boolean' && Number.isSafeInteger(row.latencyMs) &&
    row.latencyMs >= 0 && row.latencyMs <= 604_800_000, 'invalid-response');
  // “I don't know” reveals without inventing a selected option. An unanswered
  // front is not a submitted retrieval and can never receive a success grade.
  insist(row.response !== null || row.revealed, 'response-required');
  const correct = row.response === null ? false : answer(plan, row.response);
  const media = checkedMediaEvidence(plan, row.mediaEvidence, row.revealed);
  return { correct, mustRepeat: !correct || row.revealed || media.audio.some(audio => audio.transcriptOpened ||
    audio.interrupted || audio.startedPlays !== 1 || audio.completedPlays !== 1) };
}
/** The review UI uses the same judgment as the transaction; it must never
 * offer a successful grade for an already revealed or assisted response. */
export function checkAssessmentQuestionResponse(rawPlan, rawResponse) {
  return checkedResponse(parseAssessmentQuestionPlan(rawPlan), rawResponse);
}
export function parseAssessmentQuestionPractice(raw) {
  if (raw == null) return { format: FORMAT, v: 1, plans: [], responses: [], grades: [] };
  fields(raw, ['format', 'v', 'plans', 'responses', 'grades']);
  insist(raw.format === FORMAT && raw.v === 1 && Array.isArray(raw.plans) && raw.plans.length <= MAX_PLANS &&
    Array.isArray(raw.responses) && raw.responses.length <= MAX_RESPONSES &&
    Array.isArray(raw.grades) && raw.grades.length <= MAX_RESPONSES, 'invalid-root');
  const plans = raw.plans.map(parseAssessmentQuestionPlan), byPlan = new Map(plans.map(plan => [plan.id, plan]));
  insist(byPlan.size === plans.length, 'duplicate-plan');
  const responses = new Map();
  for (const row of raw.responses) {
    const plan = byPlan.get(row?.planId); insist(plan && !responses.has(row.id), 'duplicate-or-missing-response');
    const checked = checkedResponse(plan, row); responses.set(row.id, { row, checked });
  }
  const graded = new Set(), ids = new Set(), rows = new Set();
  for (const grade of raw.grades) {
    fields(grade, ['id', 'responseId', 'planId', 'at', 'grade', 'revlogIndex']);
    id(grade.id); instant(grade.at);
    const response = responses.get(grade.responseId);
    insist(response && response.row.planId === grade.planId && !graded.has(grade.responseId) && !ids.has(grade.id) &&
      GRADES.includes(grade.grade) && (!response.checked.mustRepeat || grade.grade === 'again') &&
      Number.isSafeInteger(grade.revlogIndex) && grade.revlogIndex >= 0 && !rows.has(grade.revlogIndex), 'invalid-grade');
    graded.add(grade.responseId); ids.add(grade.id); rows.add(grade.revlogIndex);
  }
  return copy(raw);
}
export function selectAssessmentQuestionPractice(raw, planId) {
  return parseAssessmentQuestionPractice(raw).plans.find(plan => plan.id === planId) || null;
}
export function acceptAssessmentQuestionPractice(raw, rawPlan) {
  const root = parseAssessmentQuestionPractice(raw), plan = parseAssessmentQuestionPlan(rawPlan);
  const existing = root.plans.find(row => row.id === plan.id);
  if (existing) {
    const content = row => { const value = copy(row); delete value.createdAt; delete value.editorialAtCreation; return value; };
    insist(same(content(existing), content(plan)), 'plan-replaced'); return root;
  }
  return parseAssessmentQuestionPractice({ ...root, plans: [...root.plans, plan] });
}
export function appendAssessmentQuestionResponse(raw, input, source) {
  fields(input, ['id', 'planId', 'response', 'revealed', 'at', 'latencyMs'], ['audio']);
  const root = parseAssessmentQuestionPractice(raw), plan = root.plans.find(row => row.id === input.planId);
  insist(plan, 'missing-plan'); assertAssessmentQuestionSource(plan, source);
  const row = { id: input.id, planId: input.planId, response: input.response, revealed: input.revealed,
    at: input.at, latencyMs: input.latencyMs,
    mediaEvidence: { verifiedMedia: plan.media.length ? source.mediaProof.verifiedMedia : [], audio: input.audio || [] } };
  checkedResponse(plan, row);
  const previous = root.responses.find(response => response.id === row.id);
  if (previous) { insist(same(previous, row), 'response-id-reused'); return root; }
  return parseAssessmentQuestionPractice({ ...root, responses: [...root.responses, row] });
}
export function appendAssessmentQuestionGrade(raw, input, source) {
  fields(input, ['responseId', 'grade', 'at', 'id', 'revlogIndex']);
  const root = parseAssessmentQuestionPractice(raw), response = root.responses.find(row => row.id === input.responseId);
  insist(response && GRADES.includes(input.grade), 'response-required');
  const plan = root.plans.find(row => row.id === response.planId);
  assertAssessmentQuestionSource(plan, source);
  const checked = checkedResponse(plan, response), grade = checked.mustRepeat ? 'again' : input.grade;
  const row = { id: input.id, responseId: response.id, planId: plan.id, at: input.at, grade, revlogIndex: input.revlogIndex };
  const previous = root.grades.find(entry => entry.responseId === response.id || entry.id === input.id);
  if (previous) {
    insist(same(previous, row), 'response-already-graded');
    return { root, grade: previous.grade, planId: plan.id, alreadyGraded: true };
  }
  return { root: parseAssessmentQuestionPractice({ ...root, grades: [...root.grades, row] }),
    grade, planId: plan.id, alreadyGraded: false };
}

/** Sidecar grades are inseparable from their actual schedule journal rows.
 * Deleted sources/plans remain historical evidence and need no network lookup. */
export function validateAssessmentQuestionRecord(record) {
  try {
    const root = parseAssessmentQuestionPractice(record.assessmentQuestionPractice);
    for (const item of record.taken || []) if (item.t === 'question') {
      const plan = root.plans.find(row => row.id === item.id);
      if (!plan || item.label !== plan.item.prompt) return false;
    }
    const revlog = record.revlog || [], byIndex = new Map(root.grades.map(grade => [grade.revlogIndex, grade]));
    for (const grade of root.grades) {
      const row = revlog[grade.revlogIndex];
      if (!row || row[0] !== Date.parse(grade.at) || row[1] !== `question:${grade.planId}` ||
        row[2] !== GRADES.indexOf(grade.grade) + 1) return false;
    }
    const undone = new Set();
    for (const [index, row] of revlog.entries()) {
      if (row[2] === 0) {
        const previous = revlog[row[3]];
        if (row[1]?.startsWith('question:') || previous?.[1]?.startsWith('question:')) {
          if (!Number.isSafeInteger(row[3]) || row[3] < 0 || row[3] >= index || row[1] !== previous?.[1] ||
            !byIndex.has(row[3]) || undone.has(row[3])) return false;
          undone.add(row[3]);
        }
      } else if (row[1]?.startsWith('question:') && !byIndex.has(index)) return false;
    }
    return true;
  } catch { return false; }
}
