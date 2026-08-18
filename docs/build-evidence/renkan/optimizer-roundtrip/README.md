# R3-D · FSRS optimizer round-trip — the loop back in (terminal T7)

**Claim.** FSRS parameters are updatable from real review history: an
export-shaped store goes through `tools/fsrs-optimize.mjs`, the produced
parameter file enters the corridor through its own quiet 読み込む door, and
the live scheduler then grades with the learner's fitted weights — provably,
not narratively.

## The loop, exactly as demonstrated

1. **Fixture store** — `tools/fixtures/fsrs/synthetic-retention-085.json`
   (committed since R0): the real corridor export envelope
   `{v:1,taken,srs,revlog,obslog}` with 625 revlog rows over 100 cards,
   500 usable long-term outcomes (≥ the optimizer's 400 gate).
2. **Fit** —
   `node tools/fsrs-optimize.mjs tools/fixtures/fsrs/synthetic-retention-085.json \
    --candidate-out candidate-fsrs-pin.json --report-out fsrs-dry-run.json`
   (exit 0). Outputs committed here. Log loss 0.42029737 → 0.41994976;
   20/21 weights moved off the pinned defaults.
3. **Import** — `walk.mjs` drives real Chromium (390×844) against the served
   corridor: seeds one due card (stability 5, difficulty 5, last graded ten
   days earlier), feeds `candidate-fsrs-pin.json` to the `読み込む` file
   input on the tray, and lets the app reboot on the committed store.
4. **Proof of force** — the walk grades the card Good in the real review
   flow, then independently replays the press on the vendored
   `ts-fsrs@5.4.1` in Node from the revlog's raw press instant, under BOTH
   weight sets:
   - stored stability = custom-weights prediction to 8 dp (measured Δ = 0);
   - stored interval/due = custom prediction exactly (25 d);
   - default-weights prediction is a DIFFERENT schedule (24 d) — the card
     state was chosen so the two sets disagree; the walk cannot pass by
     coincidence.

Determinism is asserted first: a fresh optimizer run inside the walk must
reproduce the committed candidate **byte for byte** before anything else is
trusted.

## Files

| file | what |
| --- | --- |
| `walk.mjs` | the end-to-end walk (rerunnable: `node docs/build-evidence/renkan/optimizer-roundtrip/walk.mjs`) |
| `walk-output.json` | the run's numbers: stored vs custom vs default predictions, revlog row, 12/12 PASS |
| `candidate-fsrs-pin.json` | the optimizer's candidate parameter file (the import door's input; also read by `verify-corridor.mjs`'s R3-D probe) |
| `fsrs-dry-run.json` | the optimizer's full dry-run report (loss + calibration before/after) |
| `shot-1-imported-footer.png` | entry footer after import: `FSRS-6 · tuned from your record` |
| `shot-2-graded.png` | the session after the graded card |

## What guards this from reverting

- `prototypes/corridor/tools/verify-corridor-storage-integrity.mjs` —
  `learner-fsrs-params-fail-closed-gate` (wrong length / NaN / out-of-bounds
  → ignored, defaults rule, no quarantine; bounds table held equal to the
  optimizer's `PARAMETER_BOUNDS`) and
  `ignored-params-note-is-one-quiet-deduped-obslog-row`.
- `prototypes/corridor/tools/verify-corridor.mjs` — the R3-D browser block
  re-walks the import + grade + dual replay compactly on every battery run,
  using the committed candidate here as its parameter file.

Constitution held: importing parameters touches `srsPrefs.fsrs` only — no
cards minted, no review debt, no revlog rewrites. AI/optimizer proposes; the
learner imports; FSRS schedules.
