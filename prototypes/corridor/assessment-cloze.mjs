/** A narrow, reproducible reformulation: fill one reviewed blank with its key,
 * then use that exact sentence in the existing source-cloze scheduler. */
import { sha256Hex } from './modules/learning-core.mjs';
import { parseTeacherContext, teacherContextCanonicalText } from './teacher-context.mjs';
import { createSentencePractice, selectSentencePractice } from './sentence-practice.mjs';

export function assessmentSourceAttribution(form) {
  if (form.provenance.kind === 'original-ai') return 'KAIRO original practice · AI authored';
  if (form.provenance.kind === 'original-human') return form.provenance.authorRef || 'Original practice';
  return form.provenance.sources?.map(source => source.sourceId || source.id || '').filter(Boolean).join(' · ') || 'Imported practice';
}

export function assessmentClozeText(item) {
  if (item.response.kind !== 'selected' || item.rights.adapt.status !== 'allowed' ||
      !['grammar-form', 'contextual-expression', 'word-formation', 'orthography'].includes(item.task)) return null;
  const answer = item.response.options.find(option => option.id === item.response.answerOptionId)?.text;
  if (!answer || answer.length > 80 || /[\r\n]/u.test(answer)) return null;
  const line = item.prompt.split('\n').at(-1);
  if (!line || line.length > 500 || !/[。！？]$/u.test(line)) return null;
  const pattern = item.task === 'orthography' ? /【[^【】]+】/gu : /（[\s\u3000]*）/gu;
  const blanks = [...line.matchAll(pattern)];
  if (blanks.length !== 1) return null;
  const match = blanks[0], start = match.index;
  return { text: line.slice(0, start) + answer + line.slice(start + match[0].length), start, end: start + answer.length };
}

export function deriveAssessmentCloze({ form, item, completedAt }) {
  if (form.rights.adapt.status !== 'allowed') return null;
  const sentence = assessmentClozeText(item);
  if (!sentence) return null;
  const raw = { version: 2, id: `teacher-context:${'0'.repeat(64)}`, sourceKind: 'assessment-item',
    sourceId: JSON.stringify({ formId: form.id, formSha256: form.sha256,
      itemId: item.id, itemRevisionId: item.revisionId, derivation: 'cloze-v2' }),
    sourceDigest: sha256Hex(sentence.text), unit: 'utf16-code-unit', start: 0, end: sentence.text.length,
    index: sentence.start, quote: sentence.text, title: form.title, attribution: assessmentSourceAttribution(form), url: null, target: null };
  const context = parseTeacherContext({ ...raw, id: `teacher-context:${sha256Hex(teacherContextCanonicalText(raw))}` });
  const seed = sha256Hex(`assessment-cloze:${context.id}`);
  const id = `${seed.slice(0, 8)}-${seed.slice(8, 12)}-4${seed.slice(13, 16)}-8${seed.slice(17, 20)}-${seed.slice(20, 32)}`;
  const at = new Date(completedAt).toISOString();
  const cloze = { context, start: sentence.start, end: sentence.end, at, id };
  const candidate = createSentencePractice({ ...cloze, modes: ['cloze'] });
  return { t: 'sentence', id: candidate.plan.id, label: sentence.text, cloze };
}

export function createAssessmentClozePractice(target, current) {
  if (target?.t !== 'sentence' || !target.cloze) throw new TypeError('assessment-cloze-target');
  const retained = selectSentencePractice(current, target.id);
  const candidate = createSentencePractice({ ...target.cloze, modes: ['cloze'], current: retained ? null : current });
  if (candidate.plan.id !== target.id || candidate.context.quote !== target.label) throw new TypeError('assessment-cloze-changed');
  if (retained) {
    if (retained.context.id !== candidate.context.id || retained.plan.kind !== candidate.plan.kind ||
        retained.plan.origin.start !== candidate.plan.origin.start || retained.plan.origin.end !== candidate.plan.origin.end)
      throw new TypeError('assessment-cloze-changed');
    // The card describes an immutable source, not an individual sitting. Keep
    // its first capture and contracts when later mistakes provide new evidence.
    return retained;
  }
  return candidate;
}
