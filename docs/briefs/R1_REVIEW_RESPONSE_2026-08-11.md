# R1 review response — round 2 of the content/reading debate (2026-08-11)

An external reviewer delivered a full build spec ("R1 — Reading Flow",
baseline `5e5075d`). This file is the concede/hold/synthesize response,
per the refinement loop in the master handoff §6. Verdicts first.

## Verified facts that change the plan

**1. Wikinews is dead as a fresh pipe — the reviewer is right, I was
wrong.** The Wikimedia board closed all 31 Wikinews editions; every
edition has been read-only since **2026-05-04**. My claim that the
wikinews pipeline could supply "20–40 fresh newsprint articles a week,
forever" does not survive. The archive (CC-BY, static, large) remains
legally ingestable and register-appropriate; it becomes an archival pool,
isolated by license, not a flow. Conceded in full.

**2. The review audited a stale repository.** Its baseline `5e5075d` is
`main` — the 2026-08-07 merge, before this session existed. Verified on
the actual trunk (`claude/app-vision-next-steps-wei73a`):

| Spec's claim (about "KAIRO corridor") | Trunk reality                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| "only 11 committed passages"          | 40 articles in `data/articles/index.json`                                                                                 |
| "no learner-state write path"         | Full FSRS-6 write path (`srsStore`), proven numerically in the SRS audit                                                  |
| "no scheduler write"                  | Scheduler writes on every grade; append-only revlog with revocations                                                      |
| "1,506/1,506 tests"                   | 1,645/1,645 on the trunk                                                                                                  |
| (unmentioned)                         | 70k JMdict tier, storage quarantine, daily caps, fuzz, content-blind `type:id[:direction]` keys — all landed this session |

The spec's engineering criticisms of the _old_ corridor were largely fair
for `main`. They are not descriptions of the trunk.

## Conceded — adopted into Plan v2

1. **98% is a routing prior, not a sufficiency guarantee.** Kremmel et
   al. tested 98% directly and did not find it sufficient for their
   comprehension criterion. The router labels _Flow candidates_ and then
   validates its own predictions against observed assistance and
   comprehension. The sentence "98% personal coverage IS graded
   material" is retracted; replaced by "personalized easy-reading
   candidate, pending behavioral validation."
2. **Band split.** Supported Study ≈ 95–98%, Intensive/Decode ≈ 90–95%
   (deliberate struggle work, never the default reader). Bands rank, not
   block; the learner can always override, and overrides are logged as
   router feedback.
3. **The full CPM/timing contract.** Cold / practiced / assisted /
   raw kept structurally separate; practiced never enters the cold
   trend; explicit Start after render; backgrounding pauses; any lookup
   or fresh furigana marks the run assisted; live speed hidden; passage
   removed before comprehension probes; 80% comprehension floor as a
   _product rule_; no "validated trend" before ≥4 matched cold passages
   and ≥20 scored responses. Grapheme counting rules (NFC, exclude ruby,
   both punctuation variants, versioned) adopted as written.
4. **250–300 CPM is a provisional personal training zone**, never an
   official N1 requirement. JLPT evidence establishes a 110-minute
   combined section, nothing more precise.
5. **Knowledge bootstrap before routing.** A coverage router over a thin
   known-set is fiction. Adopt: Anki/known-list import (routing
   assertions only — never FSRS state), plus a short contextual
   calibration mode. The corridor's mature cards + capture history +
   deepWords are the third input. All imports are routing-only tiers;
   only real graded retrieval touches the scheduler — which is already
   this repo's doctrine.
6. **Coverage honesty mechanics.** OOV and unresolved tokens stay in the
   denominator; report confirmed–possible intervals, not fake decimals;
   fail closed to "unscored"; kana-form vs kanji-form knowledge are
   different facts; sense/homograph identity matters (the corridor
   already records `entrySeq` + `cueReading` on deep captures — extend
   that provenance, not a new namespace bureaucracy, in this phase).
7. **sites-v11 warnings.** Port the kuromoji tokenizer and BYOT
   interaction; do NOT port its coverage math (OOV dropped from
   denominators, 45% "learning" credit, sentence-level mass confidence
   updates). Named and avoided.
8. **Content portfolio and SLOs.** Fresh flow from: Japanese government
   PDL pages (labeled 「公的発表」, official source, not journalism),
   Global Voices JA (attribute author + translator), Aozora, Wikinews
   _archive_ (isolated pool), BYOT, and reviewed adaptations. Week-1
   checkpoint ~30 fully-attributed units; sustainable 8–12 reviewed
   units/week; "300 by October" demoted from acceptance gate to
   trajectory. The real SLO is _eligible choices per mode per day_.
9. **Rights labeling.** Every shelf item carries source class, license,
   attribution, original/adapted/generated status; link-only sources
   store metadata only; generated text is analyzer-scored, visibly
   labeled, and never called authentic. (Proportionate to a single-user
   app now; the full registry/kill-switch machinery is product-phase.)
10. **Exposure semantics** (reaffirmed, already law here): no-tap is
    censored weak evidence; "understood the sentence" grades no token;
    completion, exposure, and AI inference never write FSRS.

## Held — with evidence

**1. The vessel verdict is rejected as written.** The spec directs the
build into `apps/app` + `packages/*` and calls the corridor "disposable."
That re-litigates a standing operator ruling — recorded in this repo
(pages-app.yml: the corridor became "the whole product… operator
direction, 2026-08-10 — 'one comprehensive full prototype'") and
reaffirmed this session when the operator chose PR #69's feel as the
trunk. The ruling's factual basis also holds: the _felt product_ — the
galaxy, reader, dictionary, dojo, zen review, and now the evidence log —
lives in the corridor and is used daily; the Expo app has an excellent
kernel and no product around it. The "no parallel state models" principle
is correct and cuts the other way: the corridor is now the live state
model; resurrecting the Expo path creates the second one. What we take
from the canonical kernel is its _contracts_ (typed evidence tiers,
replayability, gate discipline) — several of which the corridor absorbed
this session (append-only log with revocations, quarantine, content-blind
keys, no-grade-from-exposure). Only the operator can reverse the vessel
ruling, and this document does not.

**2. The 6–8 week horizon and team-scale ceremony are re-scoped, not
adopted.** ADR-003/migration 004/LexemeId namespaces/editorial
queues/share extensions are the right shape for a staffed product and the
wrong sequencing for a solo operator who needs to be reading, with honest
telemetry, this week. R1's _non-negotiables_ (evidence integrity,
cold/practiced separation, rights labels, analyzer honesty, bootstrap)
are kept and implemented as corridor-native increments; the
identity-namespace and registry machinery are deferred to the product
phase with their requirements recorded here.

**3. "The corridor has known grader defects / irreproducible corpora" —
partially stale.** The 質問/海water grader-adjacent data defects were
found and fixed this session; the committed shelf is reproducible from
committed data; pipeline manifests are adopted as Phase-B hygiene.

## Net effect on the build plan (Plan v2)

- Phase A gains the **bootstrap** (Anki/known-list import + calibration,
  routing-only) and the router-validation loop.
- Phase B's fresh-flow leg becomes **PDL + Global Voices + Aozora +
  Wikinews archive + BYOT**; kuromoji ported without sites-v11's
  coverage math; coverage reported as intervals with OOV honesty.
- Phase C adopts the **full CPM contract** (cold/practiced/assisted,
  probes, floors, minimum evidence before trends).
- The 300-article acceptance gate is removed; SLO = eligible choices/day
  and 8–12 reviewed units/week.
- One decision surfaced to the operator: **confirm the vessel** (standing
  ruling: corridor) or adopt the spec's Expo pivot. Everything above is
  vessel-independent except where it lands.

## Sources

- [Wikinews: Closure of Wikinews](https://en.wikinews.org/wiki/Wikinews:Closure_of_Wikinews) · [Signpost special report, 2026-05-22](https://signpost.news/2026-05-22/Special_report) · [AlternativeTo coverage](https://alternativeto.net/news/2026/5/wikimedia-foundation-closes-all-wikinews-editions-after-21-years/)
- [Kremmel et al. 2023, Language Learning — replication of Hu & Nation](https://onlinelibrary.wiley.com/doi/10.1111/lang.12622)
- Trunk verification: `git merge-base --is-ancestor 5e5075d origin/main` ✓; 40 articles in `data/articles/index.json`; `srsStore`/`srsLogReview` present; suites 1,645/1,645 — this session's audits.
