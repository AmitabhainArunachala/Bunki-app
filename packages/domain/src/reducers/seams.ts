/**
 * The seam register (WP-02, updated by WP-06).
 *
 * WP-02's closure predicate ended where WP-06's and WP-08's began, and the
 * boundary is easy to cross by accident — a thread reducer is one helper away
 * from deciding what is schedulable, and a promotion state machine is one
 * predicate away from being a scheduler policy. So the omissions were recorded
 * here as data rather than left as absences a later reader has to infer.
 *
 * WP-06 has now closed three of the four. They stay in the register with their
 * status flipped rather than being deleted: the register is the honest account
 * of where the kernel's edges are, and an entry that says "closed, here, by
 * this WP" tells a verifier more than a missing entry does.
 * `test/purity/seams-left-empty.test.ts` checks the register against the tree.
 */

export type SeamStatus = 'open' | 'closed';

export interface Phase0Seam {
  /** What was missing. */
  readonly capability: string;
  /** The work package that owns it. */
  readonly owner: string;
  /** Where it lands. */
  readonly directory: string;
  /** Whether the owning WP has delivered it. */
  readonly status: SeamStatus;
  /** Why the earlier WP must not have implemented it. */
  readonly rationale: string;
  /** Controller/spec anchors. */
  readonly anchors: readonly string[];
}

export const PHASE0_SEAMS: readonly Phase0Seam[] = Object.freeze([
  Object.freeze({
    capability: 'FSRS-6 scheduling reducer and MemoryState derivation',
    owner: 'WP-06',
    directory: 'packages/domain/src/reducers/ (fsrs-pin.ts + memory-state.ts)',
    status: 'closed' as SeamStatus,
    rationale:
      'There is exactly one scheduler implementation and nothing else computes intervals. WP-02 derived no memory state at all, so no second scheduling policy could appear there first; WP-06 wrapped ts-fsrs 5.4.1 (FSRS-6) behind this kernel’s own MemoryState so a version bump is an explicit, replay-tested migration.',
    anchors: ['controller §6.3', 'REQ-SCH-01', 'REQ-SCH-02', 'T-03'],
  }),
  Object.freeze({
    capability: 'Evidence gate: which observations may reach FSRS',
    owner: 'WP-06',
    directory: 'packages/domain/src/evidence/',
    status: 'closed' as SeamStatus,
    rationale:
      "WP-02 typed and validated every evidence-class family and recorded the observations in derived state; it never judged them. The tier-A rule, the reveal-before-recall override (T-06), the easy/userConfirmedEasy requirement (REQ-DM-07), and the lookup and exposure exclusions (T-07, T-08) are all the gate's, and the gate is the sole factory for accepted EvidenceEvents (REQ-ARCH-04).",
    anchors: ['controller §6.2', 'REQ-ARCH-04', 'T-02', 'T-05', 'T-06', 'T-07', 'T-08'],
  }),
  Object.freeze({
    capability: 'RetrievalContract entity, validation, and contract-to-thread resolution',
    owner: 'WP-06',
    directory: 'packages/domain/src/contracts/',
    status: 'closed' as SeamStatus,
    rationale:
      "WP-02 owned the ContractCreated *event* schema (controller §6.1 lists it) and recorded a registry of created contracts during replay. The entity, its validation rules, and the resolution from contractId to the promotion-active thread the gate needs were WP-06's. See the resolution note below.",
    anchors: ['controller §6.1', 'REQ-DM-05', 'REQ-DM-09', 'REQ-ARCH-02'],
  }),
  Object.freeze({
    capability: 'Session orchestrator (pure planner)',
    owner: 'WP-08',
    directory: 'packages/domain/src/session/',
    status: 'open' as SeamStatus,
    rationale:
      "WP-02 types SessionStarted/SessionClosed and projects open/closed session state during replay, because those are §6.1 event families. Planning — the finite plan that cannot grow during a session (T-13) — is WP-08's and the directory is left empty for it. WP-06 did not touch it.",
    anchors: ['controller §6.4', 'REQ-SCH-04', 'T-13'],
  }),
]);

/**
 * The question WP-02 raised, and how WP-06 answered it.
 *
 * WP-02's note read: `ContractCreated` implements REQ-DM-05's normative minimum
 * exactly, which gives a contract a `targetComponentId` but no direct thread
 * link, so the gate's "valid, promotion-active contract" test (controller §6.2)
 * needs a component→thread edge that no Phase-0 event records. It refused to
 * invent a field, and asked for a decision rather than a patch.
 *
 * The Conductor's W2 disposition chose the projection: WP-06 derives the edge
 * from `EncounterCaptured`, with **no ADR-002 schema change**. Sparse
 * instantiation (REQ-LM-01/A12) makes that sound — in Phase 0 the only thing
 * that instantiates a KnowledgeComponent is a capture — so a component id is
 * canonically `"kc:" + the captured target`, and the thread comes with it.
 * See `src/contracts/component-identity.ts` for the full argument and for what
 * the choice costs (a contract naming an uncaptured component can never be
 * scheduled, by design, and the gate says so by name).
 */
export const WP06_CONTRACT_THREAD_LINK_RESOLUTION =
  'RESOLVED (WP-06, Conductor W2 disposition): the contract-to-thread edge is a projection from EncounterCaptured — componentId = "kc:" + the captured target key (span slice, or the whole text when unspanned) — implemented in src/contracts/component-identity.ts and src/contracts/thread-link.ts. No ADR-002 schema change, no new event, no new field.';
