# Round 3 response — final review folded, plan locked at v3 (2026-08-11)

The round-3 reviewer withdrew the Expo pivot ("KAIRO's corridor is the
product") and audited the actual trunk tip (`9f0c8ae`) this time. Their
factual claims were checked against the repository and the web before
this response. Working from the operator-relayed summary; if the full
`R1_ROUND3_PLAN_V3` file is provided, commit it beside this response.

## Verification of the reviewer's claims — they were right

| Claim                                                                | Verification                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "40-item shelf contains only 28 substantive 250+ character passages" | **Exact.** Counted from committed article bodies: 28/40 at ≥250 chars.                                                                                                                                                                                 |
| "One pre-cutoff Wikinews item needs immediate quarantine"            | **Real.** `wikinews:45227` is dated 2026-05-03 — one day before the closure cutoff; final-revision integrity unverifiable until checked against the frozen archive.                                                                                    |
| Wikinews is a finite archive, not fresh flow                         | **Confirmed** (round 2): all editions read-only since 2026-05-04.                                                                                                                                                                                      |
| Rights metadata needs fail-closed treatment                          | **Vindicated by our own data:** all five Wikinews shelf items are labeled "CC BY 4.0"; ja.wikinews content is **CC BY 2.5** ([Meta license page](https://meta.wikimedia.org/wiki/Wikinews/License)). A live mislabel their approach would have caught. |
| Attribution must be clickable                                        | **Correct.** The reader renders `p.attribution` as plain text; the `url` field exists in the index and is never rendered as a link.                                                                                                                    |
| JLPT defines no CPM threshold                                        | Already conceded in round 2; stale "N1 band" wording in the handoff is now purged.                                                                                                                                                                     |

## Conceded — folded into Plan v3

1. **Stale wording purge.** The reviewer was right that Plan v2's
   _executable_ phases still carried rejected instructions ("wikinews +
   Aozora batches," "charted toward the 250–300 cpm N1 band,"
   "auto-minted `:prod` twins"). All corrected in the master handoff.
2. **deepWords and captures are encounter provenance, not knownness.**
   A capture usually marks a word the learner did NOT securely know.
   Routing knownness now derives from graded-retrieval evidence (the
   revlog) plus explicit routing-only assertions — never from the mere
   existence of a capture.
3. **Evidence shares replace the pseudo-interval.** Coverage reports:
   observed (graded retrieval) · provisional (import/calibration) ·
   friction (recent lookups/failures) · unobserved · unresolved.
   Fail-closed to unscored. No two-point interval pretending to
   precision the evidence doesn't have.
4. **Provisional baseline, not validated trend.** Four matched cold
   passages / 20 scored responses establish a _baseline_; "validated"
   is reserved for sustained evidence beyond it.
5. **No silent card minting.** `:prod` twins are proposed on graduation
   and admitted by one explicit tap. No review debt without consent —
   consistent with the repo's own no-debt doctrine.
6. **Shadow router before visible router.** The coverage router ranks
   invisibly first, logging predicted-Flow vs observed assistance and
   comprehension; it steers only after its predictions demonstrably
   land.
7. **Rights integrity now, not later:** CC BY 2.5 relabel; clickable
   attribution from the existing `url` field; fail-closed deploy check
   (no shelf item without complete rights metadata); `wikinews:45227`
   flagged pending final-revision verification.
8. **Build order amended** to the reviewer's sequence: correct handoff &
   quarantine → state/identity/rights integrity → bootstrap + shadow
   router → app-cold speed telemetry → measured content throughput.

## Held — two points, narrow

1. **"Immediate quarantine" ≠ silent removal.** The item is CC-BY
   content with attribution on a shelf the operator reads by feel.
   It stays visible with a provenance note and a pending-verification
   flag; it is removed only if verification fails or the operator says
   pull it. Rights integrity and ship-by-feel are both laws here; this
   satisfies both.
2. **Content addition does not wait for the router.** The reviewer's
   ordering puts "measured content throughput" last — adopted for the
   _measurement_. But the operator must be reading every day starting
   now; the week-1 ~30-unit checkpoint (PDL/Global Voices/Aozora/
   archive) stays at the front. Adding rights-clean texts early risks
   nothing the ordering was protecting against.

## Aesthetic doctrine recorded (operator ruling)

Zen is not softness. Hakuin's stick as much as the still water — the
fierce zen of the burning Dogen, the ajari in the snow. The instrument's
rigor IS the zen: Shinkansen precision, Japanese-grade engineering,
exact numbers delivered quietly. Never bury the stillness under
dashboards; never soften the truth to protect the calm. This resolves
the "two souls" tension: there is one soul, and precision is part of it.

## Status

Plan locked at **v3**. Review rounds complete. The build begins on the
operator's word, in the amended order, starting with the Slice-0
corrections (labels, links, flag, fail-closed check) that this very
round proved necessary.
