/**
 * The port contract suite, executed by the **provisional web** adapter (WP-03).
 *
 * Same suite, same assertions, different storage — which is the point of writing
 * the suite once in `src/contract/`. Where this adapter differs from the SQLite
 * one is in *how* it stores, never in what an append means: the idempotency
 * semantics, the replay-before-commit gate, the purge, and the stream indexing
 * all come from the same shared modules.
 *
 * The `web-provisional` label in every test name is the honesty requirement
 * (REQ-ARCH-05, P0-CAP-15): web persistence results are never reported as native
 * persistence. T-16 passing here is `T-16-web` and nothing more.
 */

import { afterAll, beforeEach, describe, it } from 'vitest';

import { PORT_CONTRACT_CASES, contractCaseName } from '../src/index.ts';
import { createWebProvisionalHarness } from './harness.ts';

const harness = createWebProvisionalHarness();

describe(`port contract suite — ${harness.name}`, () => {
  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    await harness.dispose();
  });

  PORT_CONTRACT_CASES.forEach((testCase) => {
    it(contractCaseName(harness, testCase), async () => {
      await testCase.run(harness);
    });
  });
});
