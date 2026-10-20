/**
 * Review hooks (HOOKS-SPEC r7, W2 PASS 4fae8c1b): the five approved rules on the product's srs-core, the deck engines
 * and the corridor's own code, each with negative controls that must turn their cases red —
 * prototypes/corridor/tools/verify-srs-hooks.mjs, run whole.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const VERIFIER = resolve(
  HERE,
  "../prototypes/corridor/tools/verify-srs-hooks.mjs",
);

describe("review hooks (verify-srs-hooks)", () => {
  it("passes every case, and every negative control turns its named cases red", () => {
    const out = execFileSync(process.execPath, [VERIFIER], {
      encoding: "utf8",
      timeout: 600_000,
    });
    expect(out).toMatch(/(\d+)\/\1 cases · (\d+)\/\2 controls caught · passed/);
  }, 600_000);
});
