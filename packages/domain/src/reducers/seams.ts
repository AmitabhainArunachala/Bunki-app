/**
 * The seam register (WP-02).
 *
 * WP-02's closure predicate ends where WP-06's and WP-08's begin, and the
 * boundary is easy to cross by accident — a thread reducer is one helper away
 * from deciding what is schedulable, and a promotion state machine is one
 * predicate away from being a scheduler policy. So the omissions are recorded
 * here as data rather than left as absences a later reader has to infer.
 *
 * This is also what a verifier checks against: `src/contracts/`,
 * `src/evidence/`, and `src/session/` must still be empty on this branch, and
 * `test/purity/seams-left-empty.test.ts` asserts exactly that.
 */

export interface Phase0Seam {
  /** What is missing. */
  readonly capability: string;
  /** The work package that owns it. */
  readonly owner: string;
  /** Where it lands. */
  readonly directory: string;
  /** Why WP-02 must not implement it here. */
  readonly rationale: string;
  /** Controller/spec anchors. */
  readonly anchors: readonly string[];
}

export const PHASE0_SEAMS: readonly Phase0Seam[] = Object.freeze([
  Object.freeze({
    capability: 'FSRS-6 scheduling reducer and MemoryState derivation',
    owner: 'WP-06',
    directory: 'packages/domain/src/reducers/ (fsrs-pin.ts + the wrapped reducer)',
    rationale:
      'There is exactly one scheduler implementation and nothing else computes intervals. WP-02 derives no memory state at all, so no second scheduling policy can appear here first.',
    anchors: ['controller §6.3', 'REQ-SCH-01', 'T-03'],
  }),
  Object.freeze({
    capability: 'Evidence gate: which observations may reach FSRS',
    owner: 'WP-06',
    directory: 'packages/domain/src/evidence/',
    rationale:
      "WP-02 types and validates every evidence-class family and records the observations in derived state; it never judges them. The tier-A rule, the reveal-before-recall override (T-06), the easy/userConfirmedEasy requirement (REQ-DM-07), and the lookup and exposure exclusions (T-07, T-08) are all the gate's, and the gate is the sole factory for accepted EvidenceEvents (REQ-ARCH-04).",
    anchors: ['controller §6.2', 'REQ-ARCH-04', 'T-02', 'T-05', 'T-06', 'T-07', 'T-08'],
  }),
  Object.freeze({
    capability: 'RetrievalContract entity, validation, and contract-to-thread resolution',
    owner: 'WP-06',
    directory: 'packages/domain/src/contracts/',
    rationale:
      "WP-02 owns the ContractCreated *event* schema (controller §6.1 lists it) and records a registry of created contracts during replay. The entity, its validation rules, and the resolution from contractId to the promotion-active thread the gate needs are WP-06's. See the coordination note below.",
    anchors: ['controller §6.1', 'REQ-DM-05', 'REQ-ARCH-02'],
  }),
  Object.freeze({
    capability: 'Session orchestrator (pure planner)',
    owner: 'WP-08',
    directory: 'packages/domain/src/session/',
    rationale:
      "WP-02 types SessionStarted/SessionClosed and projects open/closed session state during replay, because those are §6.1 event families. Planning — the finite plan that cannot grow during a session (T-13) — is WP-08's and the directory is left empty for it.",
    anchors: ['controller §6.4', 'REQ-SCH-04', 'T-13'],
  }),
]);

/**
 * Coordination note for WP-06, recorded where it will be read.
 *
 * `ContractCreated` implements REQ-DM-05's normative minimum exactly, which
 * gives a contract a `targetComponentId` but no direct thread link. The gate's
 * "valid, promotion-active contract" test (controller §6.2) therefore needs a
 * component→thread edge that no Phase-0 event currently records.
 *
 * WP-02 deliberately did not invent a field to close that gap: ADR-002 froze
 * the v1 field set at WP-01, and a builder widening another work package's
 * schema on its own authority is exactly the collision the orchestration spec
 * §2.4 forbids. Whoever resolves it — an ADR-002 amendment adding the edge, or
 * a WP-06 projection built from `EncounterCaptured` — should do it as a
 * decision, not as a patch.
 */
export const WP06_CONTRACT_THREAD_LINK_OPEN_QUESTION =
  'ContractCreated carries targetComponentId but no threadId; the gate needs a component-to-thread edge that no v1 event records. Resolve by ADR-002 amendment or a WP-06 projection — not by a silent schema widening.';
