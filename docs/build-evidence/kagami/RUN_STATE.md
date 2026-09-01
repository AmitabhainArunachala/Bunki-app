# 鏡 KAGAMI — RUN_STATE

**Campaign:** `docs/prompts/BUNKI_KAGAMI_CAMPAIGN_2026-08-25.md`
**Base:** `main` @ `812a85b7` (PR #85 merged)

## Position

| PR  | Movement                                  | State  |
| --- | ----------------------------------------- | ------ |
| 一  | 台帳 — ledger taxonomy + sensei-writes    | MERGED (`8504cea4`, #86) |
| 一補 | 台帳の後始末 — review rounds 4–9 aftercare | MERGED (`f4cf1b88`, #88) |
| 七  | 模試 — the mock room + 25 papers          | MERGED (`f4cf1b88`, #88) |
| 二  | 鏡 — the model + mirror page              | **IN BUILD** |
| 三  | 先生の目 — sensei-reads + placement       | queued |
| 四  | 潮 — drift 自                             | queued |
| 五  | 札の文 — multi-sentence cards + mining    | queued |
| 六  | 棚 — shelf at the band                    | queued |
| 七  | 模試 — mock Stage 1 DIAGNOSTIC            | queued |

## 一補 — what and why

Devin's fourth review round landed minutes before #86 merged; all three findings
were confirmed against main and fixed in 一補: (1) a record write the device
refuses no longer strands a destroyed archive — the crossing holds rollback
material and puts the conversations back; (2) a stale tab freezes (storage-event
`staleTab` law: alert up, writes refused, reload to continue) instead of
clobbering the record another tab wrote — two live tabs are single-writer now,
by design; (3) the `aiEvidenceIncomplete` marker rides the envelope through
import (storeExtras seam), so a declared evidence loss stays declared forever.
Devin also holds 6 dashboard-only flags ("not posted by settings") — unreadable
from here; the operator can paste them if they want them addressed.

## 七 模試 — brought forward on the operator's word (2026-08-31)

The campaign typed movement 七 as a Stage-1 diagnostic only, with authored item
banks (¥1M–6M) left on the decision sheet. The operator's word replaced that:
**five traditional papers per JLPT level**, plus a scaffold for custom sets
(gap-filling, 中学歴史-style scenarios, a reading-list test, YouTube recall).
So the banks were built rather than bought — `tools/build-mock-sets.mjs`
generates 25 papers / 425 items deterministically from the repo's own
rights-cleared assets (the graded word list, the 45k attested-sentence bank,
the CC-licensed shelf), and every right answer is what the corpus actually
says. No real JLPT item is reproduced; each set ships 検収前.

Built and NOT built, on purpose: 漢字読み · 表記 · 文脈規定 · 文法形式の判断
(form) · 読解 (主旨 + passage cloze) all ship. **Particle cloze was built and
removed** — the corpus can prove a particle is unattested after a word, but
unattested is not ungrammatical (「午後に」/「午後まで」 are both real), and an
item with two defensible answers is a broken item. Particles wait for a real
grammar-point bank. Listening waits on the voice decision (TENOHIRA PR 五).

Still to come (模試 PR 二): the custom composer — sets drafted from the
learner model's weak edges, a scenario prompt, the learner's own read
articles, or a pasted transcript. It needs 鏡 (movement 二) to know the gaps,
so the mirror comes first.

## 二 鏡 — what the mirror is and is not

`learnerModel(S)` is pure, versioned and derived: same store ⇒ byte-same model,
nothing persisted, nothing scheduled. It reads only rows carrying an explicit
right/wrong judgment — probe · lesson · dojo · mock · sensei · real reviews (a
revocation names the row it undoes, so an undone grade is not counted). Taps and
reveals land on nodes as encounters and stay off the bands: friction is not a
verdict.

Four bands, never averaged: 語彙 · 読み · 文の形 · 自分で使う. Each renders as
per-level counts with its own provenance line (measured vs observed) — a band
resting only on mined rows says so. `KAGAMI_MIN_SEEN` (4) is the floor below
which the model declines to speak of a level at all.

Three traps, all hit and all fixed here. A level is spelled three ways in this
repo — the boot dictionary writes `"N5"`, the graded word list the papers are
built from writes `5`, and a grammar point writes its own again — so
`kagamiLevel` normalizes all three and `kagamiLevelOf` resolves grammar keys
through `GRAMMARS()` (without either, cells come out empty and the band cannot
form an edge). "Disagreement" means an easier level FAILING under a harder one
PASSING — flagging the ordinary shape (clear N5, miss N4) was a bug the phone
screenshot caught. And a subject with no JLPT tag at all — kanji, radicals,
idioms, particles — lands in a `級外` cell that counts but clears nothing,
rather than being credited to a level the record cannot support.
verify-kagami pins every one of these.

Still to come: movement 三 retires `aiLevelGuess()` at its nine call sites in
favour of model queries, and 模試 PR 二's custom composer reads the frontier.

## Notes for the resuming session

- The chat placement session of 2026-08-25 is the reference transcript for the
  observation taxonomy: reading nodes (歩→ほ), confusion edges (歩↔足), sense
  nodes (によって depending-on), form nodes (potential 答えられません),
  receptive/productive split (~one band).
- Sensei-mined observation subjects are restricted to word/kanji in v1 —
  grammar-point subject matching (AI names → deck ids) is deferred until a
  reliable mapping exists; grammar evidence still lands via the quiz/lesson
  kinds that exist.
- Mock Stage 2 (authored item banks, ¥1M–6M) stays typed on the decision
  sheet — operator's call, outside this campaign.
- The 設定 dial to disable mining is deferred until the operator asks; cost is
  ~sub-cent per exchange.
