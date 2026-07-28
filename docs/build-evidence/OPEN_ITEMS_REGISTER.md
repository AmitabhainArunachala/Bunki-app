# Open items register — everything Campaign E knows it has not done

**Compiled 2026-07-28 from the lanes' own words.** Nothing here is my assessment
of their work; every entry is something a lane wrote down about itself, in
`CAPSULE.md`, under a heading like "What this lane does not claim", "What this
lane did NOT do", or "Coordination requests". A few at the end are findings I
measured directly and are marked as such.

## Why this file exists

`CAPSULE.md` is 9,823 lines and append-only, which is the right shape for
evidence and the wrong shape for a work list. The honest not-done reporting is
its most valuable content and also its least reachable: twenty-five separate
sections, none of which knows about the others, several of which describe the
*same* missing piece from two sides.

A container restart during this build destroyed three running workflows and
their verdict journals. The code survived because every lane pushed; the
in-flight reasoning did not. That is the failure mode this file guards against —
**detail is lost by being unreachable, not by being deleted.**

Line references are to `CAPSULE.md` at the commit that added this file.

---

## 1. Cross-lane coordination requests — real work, no owner

Each of these was found by a lane that could not fix it, because the fix is in
another lane's write surface. They are not deferrals of convenience.

| # | Item | Filed by | Where the fix goes |
|---|---|---|---|
| C1 | **`forcedByReveal` is structurally unreachable.** `evidence/mint.ts` computes `grade = revealedBeforeRecall ? 'again' : input.grade` *at mint*, so the submitted grade never reaches the log and the two are equal on every event this app can produce. `GateDecisionRecord.forcedByReveal` is `revealedBeforeRecall && grade !== 'again'` — always `false`. REQ-DM-07 describes the opposite design. Either the correction moves to the gate so the submitted grade survives, or the field goes; today it is a field that cannot be true. | B5 (L7694) | `packages/domain/src/evidence/` (WP-06) |
| C2 | **`assertNotGuideArtefact` is exported and tested but never called.** The guard exists in `guide/boundary.ts`; the gate does not invoke it. Two lines: import it, call it beside `assertNotCandidate(event)` in `admitToScheduler`. Doing so **inverts** the boundary test's wiring assertion for `gate.ts`, which is why it is a request rather than an edit. | B6 (L8357) | `packages/domain/src/evidence/gate.ts` |
| C3 | **No evidence-class event carries a `sessionId`.** The rejoin criterion supports `requireSeparateSessions`, which groups on it; the fallback treats each `null` sitting as its own, so "on two different days" would be satisfiable by two answers a minute apart. B5 therefore never requests the option and says so on screen (`SEPARATE_SITTINGS_NOT_AVAILABLE`). | B5 (L7755) | event catalog — ADR-level |
| C4 | **A second door to `/journey` from the session screen.** The right moment to offer a branch is the moment of the miss. `/journey` currently hangs off the shell, defensible on its own terms but worse than a door at the miss. | B5 (L7755) | `src/screens/session-screen.tsx` |
| C5 | **A fork cannot be declared at `/guide`.** The only declarer is `latestStumble` over the session workspace, provided inside the `(session)` route group. `GuideScreen` takes `declaredBranches` as a prop and the route passes none. | B6 (L8357) | route composition |

---

## 2. Built, but honestly incomplete

| # | Item | Stated by |
|---|---|---|
| G1 | **The fractal dive's L4 (collocations) is EMPTY** — "not thin — empty, everywhere, in every build this repository can produce." Reported with a reason wherever it would have been drawn. | B2 (L8435) |
| G2 | **L5 is dictionary-paired examples, not real encounters.** It stays that way until something emits an `encounter` node. The design document's L5 remains unbuilt; only the false caption was fixed. | B2 (L9123) |
| G3 | **街道 and 鉄道 era layers are empty.** ~9.8% of the corpus is placeable, all 古道, by a reading-type rule. No rule for the other two exists that would not be a guess. A map showing a well-populated Edo or rail layer would be a fabrication. | A2′ + seed measurement |
| G4 | **The guide's records are not durable.** They live in screen state, are not exported, and do not survive a reload. Making them durable needs a new event family in the frozen v1 catalog — ADR-level. | B6 (L8380) |
| G5 | **Journey routing does not survive leaving the screen.** The branch is durable (re-derived from the ledger); the routing — probe answers, chosen road — is React state. Disclosed on screen as `ROUTING_IS_NOT_STORED`. | B5 (L8086) |
| G6 | **No memory bands on the journey screen.** Deriving one needs another lane's projection, and `screen-contract.test.ts` structurally forbids `apps/app` naming the fields. The screen shows the capability lens and no band rather than a band it could not compute honestly. | B5 (L8086) |
| G7 | **The quiet-opportunity shelf is never pinned.** `setPinned` exists in the domain; no control reaches it, so an untaken road decays on a ten-day half-life with no way to keep it. | B5 (L8086) |
| G8 | **Only the newest branch point gets a fork.** Older ones are listed under a disclosure with no way to switch to them. | B5 (L8086) |
| G9 | **No curated cultural corpus.** The kanji note is derived from KANJIDIC2 and JMdict and asserts no etymology. The design document's 駅 and 奥さん readings have real sources and **none of them is in this build** — putting them in would be a claim with no provenance. | B2 (L8435) |

---

## 3. Defects outside every lane's surface

Nobody owned these, so nobody fixed them. They were reported rather than
repaired, which is correct behaviour and also how a defect survives a campaign.

| # | Item |
|---|---|
| D1 | **React #418** on two routes owned by two different lanes. Cause not established. |
| D2 | **Exported bytes carry an empty `<title>` on every route** — `<title data-rh="true"></title>`. The *hydrated* title is correct and the a11y e2e checks the hydrated one, so the runtime half works and the static-bytes half does not in this export mode. This is the exact defect `src/ui/route-title.tsx` documents as closed. |
| D3 | **Two `test.fail` known defects** (T4-1b, T3-3) still annotated as expected failures. |

---

## 4. Measurement gaps — what no evidence in this repository covers

Stated by nearly every lane, in nearly the same words, which is itself the
finding: the whole build has one engine and no device.

- **No phone, ever.** Every millisecond in the repository is this Linux
  container's wall clock at desktop width. The dive's 230 ms index "would be
  slower on a phone; how much slower is a guess and is written as one."
- **One engine.** Chromium on Linux. No Safari, no Firefox, no device, no
  screen reader — the screenshots and the e2e suite are the same browser.
- **No live model was called.** The web export holds no API key by construction,
  so every AI exchange in every screenshot and e2e run took the labelled
  `offline-fallback` route. The live route is untested.
- **The dive's frame rate is not measured.**

---

## 5. Found by direct measurement, 2026-07-28, not by a lane

These are mine, from driving the merged branch in Chromium. The first is why the
integration pass exists.

| # | Item | Evidence |
|---|---|---|
| M1 | **309px horizontal overflow on every route at iPhone width.** `scrollWidth=699` vs `clientWidth=390` on `/`, `/map`, `/guide`, `/journey`, `/read`, `/session`. Three lanes each added a shell destination without seeing the others; the shell holds seven. Nothing in the suite measures layout width, which is why seven lanes shipped it. | measured 390×844 |
| M2 | **The map is empty on first open** — "0 of 0 contracts have evidence behind them." Honest, and the first thing a new user sees on the surface meant to be the emotional centre. | `/map`, fresh browser |
| M3 | **The EDRDG notice renders as a large boxed block at the top of several screens**, dominating pages it should sit quietly beneath. §3 requires it on screen; it does not require it to be the hero. | `/`, `/map`, `/word/...` |
| M4 | **The shell holds seven entries and the IA is undesigned.** Three lanes each wrote a defensible argument for exactly one addition; all three hold alone and none survives being applied three times. Recorded in `navigation-reachability.test.ts` as an open item rather than settled in a merge. | merge resolution |

---

## 6. Outside Campaign E entirely — in the master DoD, not yet started

From `BUNKI_MASTER_DEFINITION_OF_DONE_2026-07-27.md` §2. Listed so the gap
between "Campaign E is done" and "DONE" is never implied away.

- **Anki warm-start import** (C3) — TSV, then collection/history through the
  quarantine + mapping report.
- **Firehose first connectors** (C4) — rights-aware Source Router modes only.
- **Observatory v1** (C4) — global knowledge view with capability lenses.
- **Voice conversation and listening probes** (C5).
- **Probes inside the dive** (fractal-dive Wave C3) — deliberately deferred so
  the exposure/retrieval boundary could be proven before anything could grade.
- **iPhone-native build** — the master DoD requires iPhone-native + web; only
  web exists.
- **The deep-engagement week** (§3) — seven consecutive days of real use, which
  is the actual acceptance test and cannot be run by an agent.

## 7. Decisions still owed by the operator

- **OD-09 / licence.** CC BY-SA 4.0 share-alike applies to the EDRDG-derived
  fields. What that implies for this project's own licence is unresolved and was
  deferred as "decide later".
- **Codex 5.6 verification pass.** Packet and prompt are written
  (`CODEX_VERIFICATION_PACKET.md`, `CODEX_HANDOFF_PROMPT.md`); the pass has not
  been run. It clears master-DoD item 11.
- **Whether the dive replaces the flat kanji page.** I decided *replace* under
  the autonomy grant and B2 built it that way; it is reversible and should be
  confirmed.
- **Katakana headwords in the corpus.** `selectLexemes` filters on
  `entry.hasKanji`, so there are zero katakana entries and the loanword signal is
  1 record in 3,000. Admitting them would populate the modern stratum and would
  change the composition of all 3,000 records.
