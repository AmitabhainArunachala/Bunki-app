/**
 * The evidence gate (WP-06; controller §6.2, REQ-ARCH-04).
 *
 * The sole factory for evidence-class events (`mint.ts`) and the sole judge of
 * which of them may change memory state (`gate.ts`). Nothing else in the
 * product constructs an `EvidenceEvent`, and nothing else decides what counts.
 */

export * from './gate.ts';
export * from './mint.ts';
