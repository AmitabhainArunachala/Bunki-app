import { readFileSync, readdirSync } from 'node:fs';
import { sha256Hex } from '@bunki/ai/hash';
import {
  adaptLegacySet,
  createEditorialDecision,
  createMediaVersion,
  EDITORIAL_ASPECTS,
  evaluateReleaseReview,
  parseMediaVersion,
} from '../src/index.ts';
import {
  authority,
  complete,
  decision,
  form,
  fullForm,
  item,
  payloadOf,
  start,
} from './fixtures.ts';

/** Captured with the unchanged constructors before introducing image metadata. */
export function mediaCompatibilityObservations() {
  const subject = fullForm();
  const audio = subject.media[0]!;
  const values: [string, unknown][] = [
    ['item', item()],
    ['practice-form', form()],
    ['full-form', subject],
    ...subject.items.map((value, index): [string, unknown] => [`full-item-${index}`, value]),
    ...subject.passages.map((value, index): [string, unknown] => [`full-passage-${index}`, value]),
    ['audio', audio],
    ['audio-round-trip', parseMediaVersion(JSON.parse(JSON.stringify(audio)))],
    [
      'audio-no-transcript',
      createMediaVersion({ ...payloadOf(audio), transcript: null, transcriptSha256: null }),
    ],
    [
      'audio-opaque-locator-legacy',
      createMediaVersion({ ...payloadOf(audio), assetId: 'legacy/locator' }),
    ],
    ['seven-aspects-export', EDITORIAL_ASPECTS],
    ['practice-start', start()],
    ['practice-complete', complete(form())],
    ['full-complete', complete(subject, start(subject, 'timed', true))],
  ];
  for (const selected of [form(), subject]) {
    for (const verdict of ['approve', 'reject', 'review'] as const) {
      const recorded = decision(selected, verdict);
      values.push([`${selected.scope}-${verdict}`, recorded]);
      values.push([
        `${selected.scope}-${verdict}-observation`,
        evaluateReleaseReview(selected, [recorded], authority),
      ]);
    }
    const payload = payloadOf(decision(selected));
    values.push([
      `${selected.scope}-reordered-decision`,
      createEditorialDecision({ ...payload, aspects: [...payload.aspects].reverse() }),
    ]);
    values.push([
      `${selected.scope}-audio-na-decision`,
      createEditorialDecision({
        ...payload,
        aspects: payload.aspects.map((entry) => ({
          ...entry,
          result: entry.aspect === 'audio' ? 'not-applicable' : entry.result,
        })),
      }),
    ]);
  }
  const directory = new URL('../../../prototypes/corridor/data/mock/sets/', import.meta.url);
  for (const name of readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()) {
    values.push([
      `legacy-${name}`,
      adaptLegacySet(JSON.parse(readFileSync(new URL(name, directory), 'utf8'))),
    ]);
  }
  return values.map(([name, value]) => ({
    name,
    serializedSha256: sha256Hex(JSON.stringify(value)),
  }));
}
