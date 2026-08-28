# CN SWEEP findings ledger — 2026-08-28

Branch `review/cn-sweep-20260828`, base `claude/live-tweaks-20260827` @ merge-base `9926057b`.
One row per finding; each row lands in the same commit as its fix. FLAG rows have commit `—`.

| id | class | sev | area | location | finding | action | verification | commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-000 | FIX | P3 | sweep | gate-baseline.txt | baseline gate recorded before any change | ran §6 gate, saved output | lint/format/typecheck/test/node --check all exit 0; battery: per-gate results recorded | 8b388d90 |
| F-001 | FLAG | P2 | env | battery (corridor, corridor-a11y, writing-room, corridor-ai, e2e, native-readings, drift-fast) | Playwright chromium_headless_shell missing in this environment; browser gates could not run at baseline | attempting `npx playwright install chromium` (cache only, no repo change); whatever stays unrunnable is reported as SKIPPED, never claimed green | `browserType.launch: Executable doesn't exist` in /tmp/cn-sweep-battery-baseline/*.log | — |
| F-002 | FLAG | P2 | env | corpus-pytest | 18 collection errors at baseline — python deps missing in env | none (environment; corpus venv not part of this sweep) | `1 skipped, 18 errors in 0.26s` in corpus-pytest.log | — |
| F-003 | FIX | P1 | corridor-tools | docs/build-evidence/reading-r5-learning-loop-r5-20260815/residual-storage-callers.json | storage-integrity gate red at baseline: lineAfterPatch values stale after 19a132db (caller 13627→13978, bypasses 4881→4988, 4947→5054) | updated the three stale line numbers; surfaces/operations unchanged | `node prototypes/corridor/tools/verify-corridor-storage-integrity.mjs` exit 0, status PASS | <pending> |
