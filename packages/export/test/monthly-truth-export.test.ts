/** A2: the monthly projection is recoverable from the exported raw log. */

import { canonicalJson, deriveMonthlyTruth } from '@bunki/domain';
import { representativeLog } from '@bunki/persistence';
import { describe, expect, it } from 'vitest';

import { buildExportEnvelope, parseExportEnvelope, serializeExportEnvelope } from '../src/index.ts';

describe('monthly truth export boundary', () => {
  it('re-derives byte-equivalent monthly truth after JSON serialisation', () => {
    const events = representativeLog();
    const before = deriveMonthlyTruth(events, '2026-07');
    const envelope = buildExportEnvelope({
      events,
      generatedAt: '2026-07-31T23:59:59.999Z',
      appVersions: { domain: '@bunki/domain@0.0.0', fsrs: 'ts-fsrs@5.4.1' },
    });

    const bytes = serializeExportEnvelope(envelope);
    const restored = parseExportEnvelope(JSON.parse(bytes));
    const after = deriveMonthlyTruth(restored.events, '2026-07');

    // The envelope carries raw events, not a monthly summary that could drift
    // or flatten the separate capability and non-retrieval categories.
    expect(restored.events).toEqual(events);
    expect(canonicalJson(after)).toBe(canonicalJson(before));
    expect(after.capabilities.map((lens) => lens.id)).toEqual(
      before.capabilities.map((lens) => lens.id),
    );
    expect(after.nonRetrievalSignals.ai).toEqual(before.nonRetrievalSignals.ai);
  });
});
