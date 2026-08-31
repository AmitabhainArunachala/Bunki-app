# 鏡 KAGAMI — RUN_STATE

**Campaign:** `docs/prompts/BUNKI_KAGAMI_CAMPAIGN_2026-08-25.md`
**Base:** `main` @ `812a85b7` (PR #85 merged)

## Position

| PR  | Movement                                  | State  |
| --- | ----------------------------------------- | ------ |
| 一  | 台帳 — ledger taxonomy + sensei-writes    | MERGED (`8504cea4`, #86) |
| 一補 | 台帳の後始末 — review round 4 aftercare   | **IN BUILD** |
| 二  | 鏡 — the model + mirror page              | queued |
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
