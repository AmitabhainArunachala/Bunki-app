# Settlement diagnostics step 1

Authorized by lead 1206, W2 0725 and window 4 0916/0942. External successor source only.

Only footprint-support.mjs changes versus frozen keep-all r2; settlement-diagnostics.test.mjs is new. Other tools/policy remain byte-identical. Adapter retains bounded decoded-text observations, explicit command errors/signals, six-way classifications, full-result closure predicate, PID count plus capped sample and per-command elapsed times. Entire returned JSON is capped at 24 KiB. Spawn options are unchanged.

Seven focused Node tests cover 196 frozen-predicate combinations, both command axes, huge escaped/Unicode output, 5,000 matching processes, the real finalizer's closure serialization boundary, and five required mutants (lsof-only closure, stderr suppression, changed encoding, missing status→1, thrown invocation→1). These are synthetic command observations, not native execution or completed RS1–RS5/dispatch proof.

Next: step 2 must use progress.settlementBlock (operator stop remains separate), mark settlement attempted before await, preserve the first ledger on summary/serialization/write failure, assert structured causes in the lifted harness and time closureCheck beside settlementWallSeconds. Step 3 carries full connected controls/link regressions and freezer/launcher/preflight routing to this tools directory with a real-import old-pin control. All seven lead amendments remain binding.

Source is saved as an independent Git source snapshot in Bunki's existing object store on codex/runner-settlement-20261025. No new repository or worktree, no app ref change, no push. Runtime logs and receipts stay outside the committed tree. Frozen external sources and old receipts stay unchanged.
