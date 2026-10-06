import { sha256Hex } from '@bunki/ai/hash';
import {
  artifactReference,
  beginAttempt,
  checkpointAttempt,
  createEditorialDecision,
  createFormVersion,
  createItemVersion,
  createMediaVersion,
  createPassageVersion,
  EDITORIAL_ASPECTS,
  getOfficialBlueprint,
  unknownAssessmentRights,
  type AssessmentAttempt,
  type AttemptFact,
  type FormPayload,
  type FormVersion,
  type ItemPayload,
  type ItemVersion,
} from '../src/index.ts';

export type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
export function clone<T>(value: T): Mutable<T> {
  return JSON.parse(JSON.stringify(value)) as Mutable<T>;
}
export const NOW = '2026-09-10T00:00:00.000Z';
export const provenance = {
  kind: 'original-human' as const,
  authorRef: 'fixture-author',
  processRef: null,
  sources: [],
};
export const rights = {
  ...unknownAssessmentRights(),
  display: {
    status: 'allowed' as const,
    basisRef: 'fixture-original',
    policyVersion: 'fixture-rights/v1',
  },
  retain: {
    status: 'allowed' as const,
    basisRef: 'fixture-original',
    policyVersion: 'fixture-rights/v1',
  },
};
export function payloadOf<T extends { readonly revisionId: string; readonly sha256: string }>(
  version: T,
) {
  const { revisionId: _revisionId, sha256: _sha256, ...payload } = clone(version);
  return payload;
}
export function item(id = 'item:木', patch: Partial<ItemPayload> = {}): ItemVersion {
  return createItemVersion({
    format: 'kairo-assessment-item',
    v: 1,
    id,
    provenance,
    rights,
    skill: 'grammar',
    task: 'fixture-choice',
    prompt: '駅で電車を待ちます。',
    translatedInstruction: null,
    rationale: 'Synthetic contract fixture, not teaching content.',
    passages: [],
    media: [],
    subjects: [],
    response: {
      kind: 'selected',
      options: [
        { id: 'a', text: '待ちます' },
        { id: 'b', text: '待った' },
      ],
      answerOptionId: 'a',
    },
    ...patch,
  });
}
export function form(
  items: readonly ItemVersion[] = [item()],
  patch: Partial<FormPayload> = {},
): FormVersion {
  const skills = [...new Set(items.map((entry) => entry.skill))];
  const sections = skills.map((skill) => ({
    id: `section:${skill}`,
    title: skill,
    skill,
    itemIds: items.filter((entry) => entry.skill === skill).map((entry) => entry.id),
  }));
  return createFormVersion({
    format: 'kairo-assessment-form',
    v: 1,
    id: 'form:fixture',
    provenance,
    rights,
    title: 'Synthetic assessment contract fixture',
    exam: { family: 'jlpt', track: 'N5' },
    scope: 'short-practice',
    blueprintId: null,
    items,
    passages: [],
    media: [],
    sections,
    timingBlocks: sections.map((section) => ({
      id: `block:${section.skill}`,
      sectionIds: [section.id],
      durationMs: 60_000,
      clock: 'active-only',
      authority: { kind: 'authoring-rule', ruleId: 'fixture/v1' },
    })),
    authoring: { policyVersion: 'fixture/v1', countsAre: 'authoring-rules', requirements: [] },
    ...patch,
  });
}

/** Deliberately tiny synthetic coverage fixture: never an actual reviewed exam. */
export function fullForm(): FormVersion {
  const blueprint = getOfficialBlueprint('jlpt-n5-facts-20260910')!;
  const text = '駅の図書室は九時に開きます。';
  const passage = createPassageVersion({
    format: 'kairo-assessment-passage',
    v: 1,
    id: 'passage:fixture',
    provenance,
    rights,
    title: null,
    text,
    textSha256: sha256Hex(text),
    language: 'ja',
    locationUnit: 'utf16-code-unit',
  });
  const audio = createMediaVersion({
    format: 'kairo-assessment-media',
    v: 1,
    id: 'audio:fixture',
    provenance,
    rights,
    kind: 'audio',
    assetId: 'fixture:non-playable',
    bytesSha256: sha256Hex('synthetic-not-audio'),
    mimeType: 'audio/mp4',
    durationMs: 1000,
    transcript: text,
    transcriptSha256: sha256Hex(text),
    speakers: ['speaker:fixture'],
  });
  const items = [
    item('item:vocabulary', { skill: 'vocabulary' }),
    item('item:composition', { skill: 'grammar', task: 'sentence-composition' }),
    item('item:text-grammar', { skill: 'grammar', task: 'text-grammar' }),
    item('item:reading', {
      skill: 'reading',
      task: 'information-retrieval',
      passages: [artifactReference(passage)],
    }),
    item('item:listening', { skill: 'listening', media: [artifactReference(audio)] }),
  ];
  return form(items, {
    scope: 'full-candidate',
    blueprintId: blueprint.id,
    passages: [passage],
    media: [audio],
    timingBlocks: blueprint.timingBlocks.map((block) => ({
      id: `block:${block.id}`,
      sectionIds: block.skills.map((skill) => `section:${skill}`),
      durationMs: block.minutes * 60_000,
      clock: 'elapsed-including-interruptions',
      authority: { kind: 'official-fact', blueprintId: blueprint.id, blockId: block.id },
    })),
    authoring: {
      policyVersion: 'synthetic-coverage/v1',
      countsAre: 'authoring-rules',
      requirements: blueprint.knownRequiredTasks.map((task) => ({ task, minimumItems: 1 })),
    },
  });
}
export const authority = {
  kind: 'host-verified-review-authority',
  policyVersion: 'fixture-authority/v1',
  checklistVersion: 'fixture-checklist/v1',
  reviewerIds: ['fixture-reviewer'],
} as const;
export function decision(
  subject: FormVersion,
  verdict: 'approve' | 'reject' | 'review' = 'approve',
  id = 'review:fixture',
) {
  return createEditorialDecision({
    format: 'kairo-assessment-editorial-decision',
    v: 1,
    id,
    subject: artifactReference(subject),
    reviewer: { kind: 'human', id: 'fixture-reviewer' },
    checklistVersion: authority.checklistVersion,
    decidedAt: NOW,
    verdict,
    aspects: EDITORIAL_ASPECTS.map((aspect) => ({
      aspect,
      result: 'pass',
      note: 'Synthetic authority boundary fixture. Not a real editorial decision.',
      evidenceRefs: [],
    })),
  });
}
export function start(subject = form(), mode: 'practice' | 'timed' = 'practice', reviewed = false) {
  return beginAttempt(subject, {
    attemptId: 'attempt:fixture-one',
    scope: { accountId: 'fixture-account', learnerId: 'fixture-learner' },
    mode,
    priorExposure: 'none-reported',
    editorialAtStart: reviewed
      ? {
          status: 'reviewed',
          authorityPolicyVersion: authority.policyVersion,
          decisionRevisionIds: [decision(subject).revisionId],
        }
      : { status: 'unreviewed', authorityPolicyVersion: null, decisionRevisionIds: [] },
    startedAt: NOW,
    clockStatus: 'continuous',
  });
}
export function factBase(subject: FormVersion, selected: ItemVersion, id: string, elapsedMs = 100) {
  const section = subject.sections.find((entry) => entry.itemIds.includes(selected.id))!;
  const block = subject.timingBlocks.find((entry) => entry.sectionIds.includes(section.id))!;
  return {
    id,
    recordedAt: NOW,
    timingBlockId: block.id,
    elapsedMs,
    item: { ...artifactReference(selected), kind: 'item' as const },
  };
}
export function answerFacts(
  subject: FormVersion,
  selected: ItemVersion,
  stem = 'fact',
  elapsedMs = 100,
): AttemptFact[] {
  const response = selected.response;
  return [
    {
      ...factBase(subject, selected, `${stem}:exposed`, elapsedMs),
      kind: 'exposure',
      content: 'prompt',
    },
    {
      ...factBase(subject, selected, `${stem}:answered`, elapsedMs),
      kind: 'response',
      response:
        response.kind === 'selected'
          ? { kind: 'selected', optionId: response.answerOptionId }
          : response.kind === 'ordered'
            ? { kind: 'ordered', tokenIds: response.answerOrder }
            : {
                kind: 'written',
                text: response.marking.kind === 'exact' ? response.marking.accepted[0]! : '回答',
              },
    },
  ];
}
export function checkpointCommand(
  previous: AssessmentAttempt,
  facts: readonly AttemptFact[] = [],
  status: AssessmentAttempt['status'] = 'in-progress',
) {
  return {
    expectedRevisionId: previous.revisionId,
    recordedAt: NOW,
    cursor: previous.cursor,
    timings: previous.timings.map((timing) => ({
      ...timing,
      elapsedMs: Math.max(
        timing.elapsedMs,
        ...facts
          .filter((fact) => fact.timingBlockId === timing.blockId)
          .map((fact) => fact.elapsedMs),
      ),
      activeMs: Math.max(
        timing.activeMs,
        ...facts
          .filter((fact) => fact.timingBlockId === timing.blockId)
          .map((fact) => fact.elapsedMs),
      ),
    })),
    clockStatus: previous.clockStatus,
    facts,
    status,
  };
}
export function complete(subject: FormVersion, initial = start(subject)) {
  let attempt = initial;
  for (const [blockIndex, block] of subject.timingBlocks.entries()) {
    const items = subject.items.filter((selected) => {
      const section = subject.sections.find((entry) => entry.itemIds.includes(selected.id))!;
      return block.sectionIds.includes(section.id);
    });
    const facts: AttemptFact[] = [];
    for (const selected of items) {
      for (const media of selected.media.filter((reference) =>
        subject.media.some((asset) => asset.id === reference.id && asset.kind === 'audio'),
      ))
        facts.push({
          ...factBase(subject, selected, `${selected.id}:audio-start`, 0),
          kind: 'audio',
          action: 'start',
          positionMs: 0,
          media: { ...media, kind: 'media' },
        });
    }
    facts.push(...items.flatMap((selected) => answerFacts(subject, selected, selected.id)));
    for (const selected of items) {
      for (const media of selected.media.filter((reference) =>
        subject.media.some((asset) => asset.id === reference.id && asset.kind === 'audio'),
      ))
        facts.push({
          ...factBase(subject, selected, `${selected.id}:audio-ended`, 1000),
          kind: 'audio',
          action: 'ended',
          positionMs: 1000,
          media: { ...media, kind: 'media' },
        });
    }
    const command = checkpointCommand(
      attempt,
      facts,
      blockIndex === subject.timingBlocks.length - 1 ? 'submitted' : 'in-progress',
    );
    command.cursor = { timingBlockId: block.id, itemId: items[0]!.id };
    attempt = checkpointAttempt(subject, attempt, command);
  }
  return attempt;
}
