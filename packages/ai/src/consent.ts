/**
 * The Phase-0 privacy boundary, enforced before any transport call
 * (WP-07; controller §15, OD-08 default, REQ-ARCH-07).
 *
 * OD-08's Phase-0 default is one sentence: **only seeded fixture content may be
 * sent to the AI provider.** Everything about how that is enforced here follows
 * from one observation — a privacy rule that lives in a code review is a rule
 * that holds until the first hurried change. So it is a value: a policy object
 * the runtime consults, whose default denies anything it was not shown.
 *
 * Two properties matter more than the mechanism:
 *
 * **It fails closed.** An empty allowlist permits nothing. A caller that
 * forgets to supply the seeded corpus does not get "no restriction", it gets a
 * `content_not_permitted` fallback — the same visible, labelled outcome as
 * being offline. A privacy control whose failure mode is silent permission is
 * not a control.
 *
 * **It runs before the request is built, not before it is sent.** The check
 * takes the context, not the assembled HTTP body, so there is no window in
 * which un-consented text exists inside a request object that some later code
 * path might log.
 *
 * Widening this is an operator act, recorded verbatim in the capsule
 * (controller WP-12's trial rule), never a code change made because a test
 * needed it.
 */

import { AiContentNotPermittedError } from './errors.ts';
import type { AiThreadContext } from './envelope.ts';
import { FALLBACK_EXCERPTS, FALLBACK_TARGET_FORMS } from './fallback/fixtures.ts';

export interface AiContentPolicy {
  /** Named in reports and in the capsule, so the active policy is legible. */
  readonly name: string;
  /**
   * @throws AiContentNotPermittedError if this context may not leave the device.
   */
  readonly assertPermitted: (context: AiThreadContext) => void;
}

const fold = (text: string): string => text.trim().normalize('NFKC');

export interface SeededFixturePolicyOptions {
  /** Written forms that may be asked about. */
  readonly targetForms: readonly string[];
  /** Excerpts that may be sent. Exact text, NFKC-folded and trimmed. */
  readonly excerpts: readonly string[];
  readonly name?: string | undefined;
}

/**
 * The OD-08 default policy: an allowlist of seeded forms and seeded excerpts.
 *
 * Exact text rather than a heuristic. "Looks like it came from the seed" is the
 * kind of check that passes for a learner's own sentence that happens to share
 * a word, which is the exact failure this exists to prevent.
 */
export function createSeededFixturePolicy(options: SeededFixturePolicyOptions): AiContentPolicy {
  const forms = new Set(options.targetForms.map(fold));
  const excerpts = new Set(options.excerpts.map(fold));

  return {
    name: options.name ?? 'seeded-fixture-allowlist',
    assertPermitted(context) {
      if (context.contentClass !== 'seeded-fixture') {
        throw new AiContentNotPermittedError(
          `contentClass ${JSON.stringify(context.contentClass)} is not permitted`,
        );
      }
      if (!forms.has(fold(context.targetForm))) {
        throw new AiContentNotPermittedError('the target form is not a seeded form');
      }
      if (!excerpts.has(fold(context.excerpt))) {
        throw new AiContentNotPermittedError('the excerpt is not seeded text');
      }
    },
  };
}

/**
 * The policy used when the host injects none.
 *
 * Scoped to the forms and excerpts this package's own fallback fixtures cover —
 * the smallest allowlist that still lets the Phase-0 loop run, and one that
 * cannot silently grow, because growing it means editing the fixtures. A host
 * with the full seed available (the app) supplies a wider one built from
 * `@bunki/seed`.
 *
 * Note what the error messages above never contain: the rejected text. A
 * privacy control that logged what it refused would be the leak it prevents.
 */
export const DEFAULT_CONTENT_POLICY: AiContentPolicy = createSeededFixturePolicy({
  targetForms: FALLBACK_TARGET_FORMS,
  excerpts: FALLBACK_EXCERPTS,
  name: 'seeded-fixture-allowlist(fallback-fixtures)',
});

/** A policy that permits nothing. The failure mode a missing policy must have. */
export const DENY_ALL_CONTENT_POLICY: AiContentPolicy = {
  name: 'deny-all',
  assertPermitted() {
    throw new AiContentNotPermittedError('no content policy is configured');
  },
};
