import { describe, expect, it } from 'vitest';

import { canonicalJson, replay } from '../../src/index.ts';
import { DEMO_STAGES, generateScriptedLearner, type DemoTarget } from '../../src/demo/index.ts';

function corpus(size: number): readonly DemoTarget[] {
  const out: DemoTarget[] = [];
  for (let index = 0; index < size; index += 1) {
    out.push({
      key: `lex-${index}`,
      text: `語${index}`,
      reading: `ご${index}`,
      senses: [`sense ${index}`],
    });
  }
  return out;
}

describe('smoke', () => {
  it.each(DEMO_STAGES.map((stage) => [stage.id, stage] as const))(
    '%s generates and replays',
    (_id, stage) => {
      const t0 = Date.now();
      const log = generateScriptedLearner({
        script: stage,
        corpus: corpus(stage.corpusBudget),
        startDay: '2024-01-01T00:00:00.000Z',
        idPrefix: `demo-${stage.id}`,
        contractIdFor: (target, skill) => `contract-${skill}-${target.key}`,
      });
      const t1 = Date.now();
      const state = replay(log.events);
      const t2 = Date.now();
      console.log(
        `${stage.id}: events=${log.summary.eventCount} threads=${log.summary.threadCount} contracts=${log.summary.contractCount} ` +
          `bySkill=${JSON.stringify(log.summary.contractsBySkill)} reviews=${log.summary.reviewCount} ` +
          `admitted=${log.summary.admittedReviewCount} refused=${log.summary.refusedReviewCount} ` +
          `reasons=${JSON.stringify(log.summary.refusalsByReason)} lapses=${log.summary.lapseCount} ` +
          `sessions=${JSON.stringify(log.summary.sessionCounts)} corrections=${log.summary.correctionCount} ` +
          `metOnce=${log.summary.metOnceCount} marks=${log.summary.uncertaintyMarkCount} ` +
          `exposures=${log.summary.exposureCount} lookups=${log.summary.lookupCount} ` +
          `production=${log.summary.productionObservedCount} exports=${log.summary.exportCount} ` +
          `gen=${t1 - t0}ms replay=${t2 - t1}ms`,
      );
      expect(state.appliedEventCount).toBe(log.events.length);
      expect(canonicalJson(state.memoryStates)).toBe(canonicalJson(log.memoryStates));
    },
    600_000,
  );
});
