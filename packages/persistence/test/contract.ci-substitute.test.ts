/**
 * The port contract suite, executed by the **ci-substitute** driver (WP-03).
 *
 * Read the label in every test name literally. These runs execute the same
 * adapter code and the same SQL that a device executes, through `node:sqlite`
 * instead of `expo-sqlite`, because CI has no native runtime (controller §7).
 *
 * A green run here is evidence that the SQL is valid, the transactions are
 * atomic, the idempotency semantics match `@bunki/domain`'s, the purge removes
 * bytes, and the store survives a close/reopen. It is **not** evidence about
 * iOS, about `expo-sqlite`, or about a device — native verification is WP-11's
 * claim and only WP-11's (P0-CAP-15). Nothing in this file may be reported as
 * native persistence.
 */

import { afterAll, beforeEach, describe, it } from 'vitest';

import { PORT_CONTRACT_CASES, contractCaseName } from '../src/index.ts';
import { createSqliteCiSubstituteHarness } from './harness.ts';

const harness = createSqliteCiSubstituteHarness();

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
