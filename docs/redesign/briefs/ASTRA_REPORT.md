# ASTRA report — 2026-10-08

Cards live on your phone: **0 of 2,000**. All three public deck URLs returned HTTP 404 during this session. Nothing was merged or deployed.

Content, local verification, commit and push are complete. The independent shipping gate could not finish because of its configured reviewer's weekly quota. Current-head GitHub CI remains pending/in progress; no CI or gate pass is claimed.

## Delivered content

| Deck | Accepted targets/cards |
| --- | ---: |
| N2・文章で覚える | 358 |
| N1・文章で覚える | 666 |
| 専門・五つの分野 | 976 |
| Total | **2,000** |

Every one of the top 2,000 non-linked targets, sorted stably by descending `priority`, has an accepted passage. No missing targets or duplicate terms remain. The inherited two coverage batches had assignments but no drafts. Their work is complete.

Astra/Codex directly authored 210 final passages: 144 missing-target cards, 52 diversity replacements, and 14 editorial replacements prompted by a deterministic 20-card inherited spot-read. No external writer model generated these passages. DeepSeek V4 Pro independently judged every accepted new card through `process_batch.py`. Each new passage has 4–5 sentences, 180–248 Japanese characters, matching English sentence count, a real supplied N2/N1 grammar pattern, and 1–3 genuine declared weave words. Failed candidates and permitted rewrites remain in the source journal/draft trail.

The spot-read found concrete quality problems, including unsupported expert consensus, an invented news scene, simplistic neuroscience and automatic learning-gain claims. Fourteen fresh replacements address them; six sampled cards were retained. See [spot-read assessment](../spot-read-assessment.json), [original sample](../spot-read-20.json), and [final new-content audit](../CONTENT_CONTRACT_AUDIT.md).

## Diversity and lineage

The audit cap was not changed: 0.006 of the deck, now 12 cards per habit. Final output:

```text
grammar coverage: 104 of 125 N2/N1 patterns used at least once
2000 cards; cap per habit 12; habits over the cap: 0; cards to rewrite: 0 (0%)
```

`source/rewrite-queue.json` is empty. The grammar count is the audit's detectable-core coverage, not a claim that a full grammar deck was completed. The deck has all six registers and 20 wider-interest passages alongside the five principal topics.

One diversity candidate, 主導権, failed its permitted rewrite and was dropped. Its original accepted card remains; other successful replacements brought that opening under the unchanged cap. New coverage candidates whose first attempts failed were written afresh in separate batches, with earlier failures preserved.

`process_batch.py --writer gpt-6-astra` now records the actual new author in both source cards and journal receipts; its legacy default remains unchanged. The judge prompt explicitly includes the writer's `other` topic and six valid register codes. One judge incorrectly rejected 語 as an invalid code; after the prompt clarified the existing schema, the unchanged rewritten 宣教師 card was rejudged and passed. Both receipts remain.

Corrected uncarded source readings: 光 `～こう` → `ひかり` for standalone light, and 蒸す `ふす` → `むす`. The corresponding accepted cards and batch assignments match.

All 2,000 accepted records pass mechanics and have corresponding draft text and passing editor/facts receipts. Some inherited current drafts had displaced the actual accepted versions: the original wf-033/wf-035/wf-039 drafts were recovered from commits `7fd28ef7`, `5c2140aa`, and `c846f007`, with accepted cards and receipts co-committed at `a14fbbd3`. See [historical provenance](../provenance/README.md). Legacy journals are term-keyed and lack request hashes; this is historical artifact correspondence, not cryptographic request binding.

## Build and checks

- `build_n2n1.py`: 2,000 cards built; all six deck/token JSON files byte-identical on a repeat build.
- `verify-n2n1-decks.mjs`: PASS, six Chromium tours at 390×844 (three decks × 藍/和紙), including first use, reveal, furigana, Japanese definitions, English folds, tap-to-define, cached tokens and offline reopen.
- All six back screenshots personally inspected. Text, ruby, target highlighting and folds render in both themes; the existing fixed grade controls remain scrollable as tested.
- `vitest`: 207/207 tests across six files passed.
- `verify-corridor-storage-integrity.mjs`: 26 checks passed.
- `verify-kotoba-mine.mjs`: all checks green.
- All 1,790 unchanged passage IDs and all prior word IDs retained. Sixty-six intentionally replaced passages get their normal new content-derived IDs; no old ID was renamed or reused. See [identity verification](../identity-verification.json).
- FSRS pin, `corridor.js` (including line pins), and player engine remain byte-identical. PRs #122/#123 were not modified.

Clean site build: commit `44bc4d69b97b8d7a4ed17d9c0ce7a0849aace739`; artifact SHA-256 `6e03211234270682e98b86741cf69adfad0f7d61db59e3228f322e2dd53ba922`. [Build identity](../build-site.json), [tour receipt](../tour/n2n1-tour.json), [source checks](../source-verification.json), [contract checks](../content-contract-audit-reviewed.json), [unit log](../vitest.log).

Changed areas: `decks/n2n1/source/**`; judge topic/register clarification; processor writer attribution; rebuilt `prototypes/corridor/decks/{n2,n1,senmon}/{deck,tokens}.json`. No app wiring or service-worker policy changes in this turn.

## Fact-check references

New passages avoid invented dates, statistics and reports. Examples of primary references consulted:

- Japanese beautifying expressions: [Agency for Cultural Affairs](https://www.bunka.go.jp/seisaku/kokugo_nihongo/kokugo_shisaku/keigo/chapter2/detail.html).
- Comparative advantage and opportunity cost: [IMF teaching example](https://www.imf.org/external/pubs/ft/fandd/2016/12/obstfeld.htm).
- Saltwater freezing: [NOAA](https://oceanservice.noaa.gov/facts/oceanfreeze.html).
- Shinto/Buddhist historical interaction: [Kokugakuin University](https://d-museum.kokugakuin.ac.jp/bts/detail/?id=3941).
- Kojiki narrative and interpretation: [Kokugakuin University's text project](https://kojiki.kokugakuin.ac.jp/kojiki/%E5%A4%A9%E5%9C%B0%E5%88%9D%E7%99%BA/).
- Inherited historical checks: [UNESCO Silk Roads](https://www.unesco.org/en/silk-roads/about-silk-roads?hub=196704), [Foreign Affairs publication/debate](https://www.foreignaffairs.com/anthologies/2010-06-16/clash-civilizations-debate), [Library of Congress wartime leaflet](https://www.loc.gov/item/2008676387/).
- Further lane sources and editorial evidence: [diversity lane](../diversity-lane/LANE_REPORT.md), [fact checks](../diversity-lane/fact-checks.md), [wf031 audit](../wf031-language-audit.json).

## Delivery

AXI run `01M4BJFZ325EEWBPNASXFSP17X` reached terminal **failed** during review: the configured Claude process exited after reporting `You've hit your weekly limit · resets Oct 9 at 2am (Asia/Tokyo)`. This is a provider quota block, not a completed review verdict. No gate pass is claimed. It made no changes, reported no completed findings, and returned branch ownership as `user_owned`, head unchanged at `44bc4d69`. No sync/recovery was required. No retries against the known exhausted quota, daemon/config changes, initialization, hooks or `--yes` were used.

The standing shipping rule requires a terminal outcome and disclosure when the gate cannot run; this failed outcome is recorded without treating it as permission or approval. The user's explicit normal-push authorization remains the authority for delivery. All task-specific local checks above passed. See [AXI terminal status](../axi-terminal-status.txt), [review failure log](../axi-review.log), and [full run output](../axi-run.log).

Normal push completed: `5c48a91f` → `44bc4d69` on `origin/claude/n2n1-decks-20261007`. Commits: `83fce03a`, `1b6b0682`, `44bc4d69`. [PR #124](https://github.com/AmitabhainArunachala/Bunki-app/pull/124) remains draft; title/body updated with final counts, actual checks, and gate limitation. Remote PR head verified exactly `44bc4d69b97b8d7a4ed17d9c0ce7a0849aace739`.

At 2026-10-07T16:26:22.748497+00:00, current-head GitHub workflows were pending/in progress. [Required CI](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37651684908) was pending; [Corridor gate](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/37651684856) was running. Job metadata was inspected; no current-head completed failure logs were available to diagnose. [CI runs](../ci-runs.json), [Corridor jobs](../ci-corridor-jobs.json), [required CI jobs](../ci-required-jobs.json). The AXI test/document/lint stages did not run after its reviewer failed; the independently executed local checks are enumerated above. Production deployment and merge remain outside this delivery.

No merge, force push, history rewrite, hook/daemon change, or unrelated PR update was performed.


Worktree lifecycle: after confirming a clean worktree and successful normal push, removed `/Users/dhyana/worktrees/Bunki-app/n2n1_20261007` with `git worktree remove`, per the standing estate rule. No force was used and the local branch ref remains at `44bc4d69`; remote branch, immutable site, receipts, screenshots and this report are retained.
