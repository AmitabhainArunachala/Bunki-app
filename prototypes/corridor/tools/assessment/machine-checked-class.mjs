/** The machine-checked written admission class, shared by the bank builder and its verifier.
 * The browser keeps its own copy of these constants in assessment-delivery.mjs; the bank
 * verifier asserts the two stay identical. */
export const MACHINE_CHECK_ROUTE = 'machine-checked-written/1';
export const MACHINE_CHECK_POLICY = 'bunki-machine-check/1';
export const MACHINE_CHECK_LABEL = "検収前 · machine-checked, awaiting John's review";
export const MACHINE_CHECK_DECISION = /^machine-check-v1:[a-f0-9]{64}$/u;

/** Shape of a catalog entry in this class. It never widens the host-reviewed routes. */
export function isMachineCheckedEntry(entry) {
  return (
    entry?.publicationRoute === MACHINE_CHECK_ROUTE &&
    entry.mode === 'written' &&
    entry.review?.status === 'machine-checked' &&
    entry.review?.label === MACHINE_CHECK_LABEL &&
    entry.review?.acceptance === 'awaiting-john' &&
    entry.editorialAtStart?.status === 'ai-reviewed-practice' &&
    entry.editorialAtStart?.policyVersion === MACHINE_CHECK_POLICY &&
    Array.isArray(entry.editorialAtStart?.decisionRevisionIds) &&
    entry.editorialAtStart.decisionRevisionIds.length === 1 &&
    MACHINE_CHECK_DECISION.test(entry.editorialAtStart.decisionRevisionIds[0]) &&
    Array.isArray(entry.mediaAssets) &&
    entry.mediaAssets.length === 0 &&
    Number(entry.skillCounts?.listening) === 0 &&
    entry.officialScoreCalibrated === false
  );
}
