import { describe, expect, it } from 'vitest';

import { SCAFFOLD_NOTICE } from '../src/state/scaffold.ts';

describe('@bunki/app scaffold (WP-01)', () => {
  it('states that nothing is implemented yet rather than implying capability', () => {
    expect(SCAFFOLD_NOTICE).toMatch(/no learning features are implemented yet/i);
  });

  it('makes no efficacy or optimisation claim (REQ-GATE-03)', () => {
    expect(SCAFFOLD_NOTICE).not.toMatch(/optimi[sz]ed|scientific|proven|mastery|retention/i);
  });
});
