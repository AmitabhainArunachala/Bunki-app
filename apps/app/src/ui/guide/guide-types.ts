/**
 * The two shapes the guide surface adds on top of the kernel's (Campaign E / B6).
 *
 * Both are display-only. A turn prompt gains a reading and a gloss so the
 * learner is answering about a word they can actually see; the kernel's own
 * `GuidePrompt` deliberately holds only what may leave the device (OD-08), and
 * widening it would put display text inside the value the content policy
 * checks.
 */

import type { GuidePrompt } from '@bunki/domain';

export interface GuidePromptWithId extends GuidePrompt {
  readonly turnId: string;
  /** The seed's reading for the form. Display only; never sent anywhere. */
  readonly reading: string;
  /** One or two senses. Display only. */
  readonly gloss: string;
}

/** The kernel's prompt, extracted from the display one. What may be sent. */
export function sendableOf(prompt: GuidePromptWithId): GuidePrompt & { readonly turnId: string } {
  return {
    turnId: prompt.turnId,
    targetForm: prompt.targetForm,
    excerpt: prompt.excerpt,
    seedRef: prompt.seedRef,
  };
}
