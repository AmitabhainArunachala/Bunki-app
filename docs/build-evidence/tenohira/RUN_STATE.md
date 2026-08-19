# 掌 TENOHIRA — RUN_STATE

**Campaign:** `docs/prompts/KAIRO_TENOHIRA_CAMPAIGN_2026-08-19.md`
**Base:** `main` @ `ae1d901` (RENKAN #74 + KAIRO-next #76 merged 2026-08-19)

## Position

| PR  | State       | Branch / evidence                                                       |
| --- | ----------- | ----------------------------------------------------------------------- |
| 一  | **IN PR**   | `claude/bunki-kairo-pr76-review-qa1qnh` · battery in `tenohira/pr-ichi/` |
| 二  | next        | —                                                                       |
| 三  | queued      | —                                                                       |
| 四  | queued      | —                                                                       |
| 五  | queued      | voice research done (operator artifact, 2026-08-19); shootout unrun     |
| 六  | queued      | awaits mockup approval round                                            |

## Next command

When PR 一 merges: branch fresh from `main`, build PR 二 (§2 of the spec) —
essentials-first word sheet + the lesson lane as the father's front door.
Convicting probes for the fold behavior go into `verify-corridor.mjs`.

## Notes for the resuming session

- Decision 8 (per-learner English default) needed **no code**: `S.lang` lives
  in the per-device store and fresh devices default to `bi`. Recorded here so
  nobody "implements" it again.
- The corridor suite counts **216** after the kanjidex probe;
  `kairo-next/RUN_STATE.md`'s "215/215" predates that commit (addendum there).
- The ひとこと friction-note door (PR 一) writes `[ts, 'note', 'op', text]`
  obslog rows through the guarded store boundary; notes ride the export.
  Weekly triage of those notes is §3 of the spec.
- The E3 double-dry instrument (T5/OD-19) remains unbuilt — it is a standing
  debt, not forgotten.

## Resequencing (operator escalation, 2026-08-19)

The operator asked repeatedly for the voice and for better articles; the
順路 had them at 五 and 三. Their word outranks the sequence: **聞く (the
interim reader voice) shipped immediately** on PR 一's branch — the device's
best Japanese voice, marked 仮の声・検収前 on its face, article read-along
only (word-level audio stays absent until PR 五's judged voice) — and **the
feed (PR 三) is the very next work**, before the word page. PR 二 slides to
third. The judged-voice shootout (PR 五) is unchanged and still the law for
anything that teaches pitch.
