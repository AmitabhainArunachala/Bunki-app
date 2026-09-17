import { sha256Hex } from '@bunki/ai/hash';
import { describe, expect, it } from 'vitest';
import {
  AssessmentValidationError,
  createFormVersion,
  createItemVersion,
  createMediaVersion,
  createPassageVersion,
  getOfficialBlueprint,
  inspectFormStructure,
  OFFICIAL_BLUEPRINTS,
  parseFormVersion,
  parseItemVersion,
  parseMediaVersion,
  parsePassageVersion,
} from '../src/index.ts';
import { clone, form, fullForm, item, payloadOf, provenance, rights } from './fixtures.ts';

describe('immutable assessment content', () => {
  it('keeps Japanese identities and owns immutable input data', () => {
    const payload = payloadOf(item());
    const version = createItemVersion(payload);
    payload.prompt = 'changed by caller';
    expect(version.prompt).toBe('駅で電車を待ちます。');
    expect(version.id).toBe('item:木');
    expect(Object.isFrozen(version.response)).toBe(true);
    expect(parseItemVersion(JSON.parse(JSON.stringify(version)))).toEqual(version);
  });
  it('canonical identity is stable under object property ordering, but preserves text distinctions', () => {
    const payload = payloadOf(item());
    expect(
      createItemVersion(Object.fromEntries(Object.entries(payload).reverse())).revisionId,
    ).toBe(item().revisionId);
    expect(item('item:木', { prompt: 'が' }).revisionId).not.toBe(
      item('item:木', { prompt: 'か\u3099' }).revisionId,
    );
  });
  it.each(['prompt', 'rationale', 'task'] as const)(
    'rejects a changed %s under an old item revision',
    (field) => {
      const changed = clone(item());
      changed[field] = 'changed';
      expect(() => parseItemVersion(changed)).toThrowError(AssessmentValidationError);
    },
  );
  it('includes answer keys, options and rights in immutable revision identity', () => {
    const before = item();
    const key = payloadOf(before);
    if (key.response.kind === 'selected') key.response.answerOptionId = 'b';
    expect(createItemVersion(key).revisionId).not.toBe(before.revisionId);
    const claim = payloadOf(before);
    claim.rights.sync = { status: 'allowed', basisRef: 'new-basis', policyVersion: 'v2' };
    expect(createItemVersion(claim).revisionId).not.toBe(before.revisionId);
  });
  it('refuses keys outside the option list and duplicate option identities', () => {
    const payload = payloadOf(item());
    if (payload.response.kind !== 'selected') throw new Error('fixture');
    payload.response.answerOptionId = 'absent';
    expect(() => createItemVersion(payload)).toThrow();
    payload.response.answerOptionId = 'a';
    payload.response.options[1]!.id = 'a';
    expect(() => createItemVersion(payload)).toThrow();
  });
  it('retains structurally representable duplicate text but blocks it from passing release inspection', () => {
    const selected = item('duplicate-text', {
      response: {
        kind: 'selected',
        options: [
          { id: 'a', text: '同じ' },
          { id: 'b', text: '同じ' },
        ],
        answerOptionId: 'a',
      },
    });
    expect(inspectFormStructure(form([selected])).problems).toContain(
      'duplicate-choice-text:duplicate-text',
    );
  });
  it('requires origin references without treating those references as review or rights authority', () => {
    expect(() =>
      item('missing-human', {
        provenance: { kind: 'original-human', authorRef: null, processRef: null, sources: [] },
      }),
    ).toThrow();
    expect(() =>
      item('missing-ai', {
        provenance: { kind: 'original-ai', authorRef: null, processRef: null, sources: [] },
      }),
    ).toThrow();
    expect(() =>
      item('missing-license', {
        provenance: { kind: 'licensed-adaptation', authorRef: null, processRef: null, sources: [] },
      }),
    ).toThrow();
  });
  it('requires an exact ordered answer permutation, without inferring language correctness', () => {
    const ordered = item('ordered', {
      response: {
        kind: 'ordered',
        tokens: [
          { id: 'a', text: '駅へ' },
          { id: 'b', text: '行く' },
        ],
        answerOrder: ['a', 'b'],
      },
    });
    expect(parseItemVersion(ordered)).toEqual(ordered);
    const payload = payloadOf(ordered);
    if (payload.response.kind !== 'ordered') throw new Error('fixture');
    payload.response.answerOrder = ['a', 'a'];
    expect(() => createItemVersion(payload)).toThrow();
    payload.response.answerOrder = ['a'];
    expect(() => createItemVersion(payload)).toThrow();
  });
  it('enforces explicit written answer bounds and marking mode', () => {
    expect(() =>
      item('written', {
        response: {
          kind: 'written',
          maxChars: 1,
          marking: { kind: 'exact', accepted: ['回答'], normalization: 'none' },
        },
      }),
    ).toThrow();
    expect(
      item('written', {
        response: {
          kind: 'written',
          maxChars: 10,
          marking: { kind: 'manual', rubric: 'A human marks this response.' },
        },
      }).response.kind,
    ).toBe('written');
  });
  it('pins passage text independently and rejects changed body bytes', () => {
    const passage = createPassageVersion({
      format: 'kairo-assessment-passage',
      v: 1,
      id: 'p',
      provenance,
      rights,
      title: null,
      text: '日本語',
      textSha256: sha256Hex('日本語'),
      language: 'ja',
      locationUnit: 'utf16-code-unit',
    });
    const changed = clone(passage);
    changed.text = '日本';
    expect(() => parsePassageVersion(changed)).toThrow();
    changed.textSha256 = sha256Hex(changed.text);
    expect(() => parsePassageVersion(changed)).toThrow();
  });
  it('pins media duration, transcript and byte claim, without claiming the asset was fetched', () => {
    const media = fullForm().media[0]!;
    const changed = clone(media);
    changed.bytesSha256 = 'a'.repeat(64);
    expect(() => parseMediaVersion(changed)).toThrow();
    if (media.kind !== 'audio') throw new Error('audio fixture');
    const payload = payloadOf(media);
    payload.transcriptSha256 = null;
    expect(() => createMediaVersion(payload)).toThrow();
  });
  it('requires listening items to reference an exact packaged media revision', () => {
    expect(() => form([item('listening', { skill: 'listening' })])).toThrow();
    const payload = payloadOf(fullForm());
    const media = payload.media[0]!;
    if (media.kind !== 'audio') throw new Error('audio fixture');
    media.durationMs += 1;
    expect(() => createFormVersion(payload)).toThrow();
  });
  it('requires item and timing partitions, exact stimulus references, and no orphan assets', () => {
    const subject = fullForm();
    const duplicate = payloadOf(subject);
    duplicate.sections[0]!.itemIds.push(duplicate.sections[0]!.itemIds[0]!);
    expect(() => createFormVersion(duplicate)).toThrow();
    const missing = payloadOf(subject);
    missing.timingBlocks.pop();
    expect(() => createFormVersion(missing)).toThrow();
    const swapped = payloadOf(subject);
    swapped.items[3]!.passages[0]!.sha256 = 'f'.repeat(64);
    expect(() => createFormVersion(swapped)).toThrow();
    const orphan = payloadOf(subject);
    orphan.passages.push({ ...orphan.passages[0]!, id: 'orphan' });
    expect(() => createFormVersion(orphan)).toThrow();
    expect(parseFormVersion(subject)).toEqual(subject);
  });
  it.each([
    [
      'unknown-field',
      (raw: Record<string, unknown>) => {
        raw['approved'] = true;
      },
    ],
    [
      'undefined',
      (raw: Record<string, unknown>) => {
        raw['prompt'] = undefined;
      },
    ],
    [
      'non-finite',
      (raw: Record<string, unknown>) => {
        raw['v'] = NaN;
      },
    ],
    [
      'lone-surrogate',
      (raw: Record<string, unknown>) => {
        raw['prompt'] = '\ud800';
      },
    ],
    [
      'cycle',
      (raw: Record<string, unknown>) => {
        raw['loop'] = raw;
      },
    ],
    [
      'oversized',
      (raw: Record<string, unknown>) => {
        raw['prompt'] = 'あ'.repeat(2_000_001);
      },
    ],
  ] as const)('rejects %s before it becomes a content identity', (_name, mutate) => {
    const payload: Record<string, unknown> = payloadOf(item());
    mutate(payload);
    expect(() => createItemVersion(payload)).toThrowError(AssessmentValidationError);
  });
  it('does not execute accessors or accept non-JSON objects', () => {
    let getterCalls = 0;
    const payload = payloadOf(item());
    Object.defineProperty(payload, 'prompt', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'private';
      },
    });
    expect(() => createItemVersion(payload)).toThrow();
    expect(getterCalls).toBe(0);
    expect(() => createItemVersion(new Date())).toThrow();
  });
});

describe('official facts versus authored coverage', () => {
  it('records all five JLPT timing shapes and explicitly variable listening durations', () => {
    expect(
      OFFICIAL_BLUEPRINTS.filter((entry) => entry.exam.family === 'jlpt').map((entry) =>
        entry.timingBlocks.map((block) => block.minutes),
      ),
    ).toEqual([
      [20, 40, 30],
      [25, 55, 35],
      [30, 70, 40],
      [105, 50],
      [110, 55],
    ]);
    expect(
      OFFICIAL_BLUEPRINTS.every(
        (entry) => entry.timingBlocks.at(-1)?.duration === 'nominal-listening',
      ),
    ).toBe(true);
    expect(OFFICIAL_BLUEPRINTS.every((entry) => entry.fixedUniversalItemCount === null)).toBe(true);
    expect(getOfficialBlueprint('jlpt-n1-facts-20260910')?.forbiddenTasks).toEqual(['orthography']);
  });
  it('records distinct J.TEST tracks and written-response requirements without inventing item counts', () => {
    const jtest = OFFICIAL_BLUEPRINTS.filter((entry) => entry.exam.family === 'jtest');
    expect(
      jtest.map((entry) => [
        entry.exam.track,
        entry.timingBlocks.map((block) => block.minutes),
        entry.officialMaximum,
        entry.writtenResponseRequired,
      ]),
    ).toEqual([
      ['A-C', [80, 45], 1000, true],
      ['D-E', [70, 35], 700, true],
      ['F-G', [60, 25], 350, false],
    ]);
    expect(
      jtest.every((entry) => entry.areasPerHalf === 4 && entry.breakBetweenHalves === 'none'),
    ).toBe(true);
  });
  it('refuses to describe arbitrary authoring durations as official fixed facts', () => {
    const payload = payloadOf(fullForm());
    payload.timingBlocks[0]!.durationMs = 1;
    expect(() => createFormVersion(payload)).toThrow();
    payload.timingBlocks[0]!.authority = { kind: 'authoring-rule', ruleId: 'fixture-shortened/v1' };
    const subject = createFormVersion(payload);
    expect(inspectFormStructure(subject).problems).toContain('timing-block-coverage');
  });
  it('accepts nominal listening variation as authored media timing, still requiring editorial timing review', () => {
    const payload = payloadOf(fullForm());
    payload.timingBlocks[2]!.durationMs += 3000;
    const inspection = inspectFormStructure(createFormVersion(payload));
    expect(inspection.passesKnownChecks).toBe(true);
    expect(inspection.completeOfficialCoverage).toBe('requires-editorial-review');
  });
  it('passing a tiny synthetic structural fixture cannot establish linguistic correctness or complete coverage', () => {
    expect(inspectFormStructure(fullForm())).toEqual({
      passesKnownChecks: true,
      problems: [],
      linguisticCorrectness: 'not-established',
      completeOfficialCoverage: 'requires-editorial-review',
    });
    const payload = payloadOf(fullForm());
    payload.authoring.requirements[0]!.minimumItems = 4;
    expect(inspectFormStructure(createFormVersion(payload)).problems).toContain(
      'authoring-count:sentence-composition',
    );
  });
  it('does not upgrade short practice to full by relabeling its scope', () => {
    const payload = payloadOf(form());
    payload.scope = 'full-candidate';
    expect(inspectFormStructure(createFormVersion(payload)).problems).toEqual(
      expect.arrayContaining([
        'missing-blueprint',
        'missing-authoring-coverage-plan',
        'full-form-clock-policy',
      ]),
    );
  });
});
