# Sites v11 — Local Rendered-Browser Evidence, Round 1 (2026-07-30)

- **Executor:** Claude; **rig:** `prototypes/bunki-sites-v11/vite.config.harness.mts`
  + `harness/` (client-only mount of the real `BunkiPhase2` component, real CSS,
  real public assets, API routes stubbed to the app's designed offline fallback).
- **Browser:** Playwright + Chromium, iPhone viewport 390×844, touch, DPR 3.
- **Scope caveat:** client-side behavior only. Live-feed import, teacher, and
  cloud sync were stubbed; the deployed site remains network-blocked from this
  environment, so deployed-HTML claims (e.g. viewport meta) stay unverified.

## Confirmed findings (each reproduced in a real rendered browser)

1. **Snapshot binary assets are corrupted.** Every `public/kuromoji/*.dat.gz`
   and `public/kotobako-static.json` in the snapshot begins `0x59 0xAA …`
   instead of valid gzip/JSON. kuromoji fails with
   `invalid file signature: 89,170`; the dictionary fetch fails JSON parse and
   the reader dead-ends in a blank "Retry" error card. Pristine equivalents
   exist in npm packages (`kuromoji/dict/*.dat.gz`, 0x1f8b; `kotobako-data/`
   7.7 MB valid JSON) — the harness serves those and everything works.
   **Consequence: any rebuild/redeploy from this snapshot ships a broken
   tokenizer and dictionary.** The Sites→GitHub export mangled binaries; the
   snapshot needs re-export or asset regeneration from the npm sources.
2. **Browser/back gesture exits the app.** `history.pushState`/`popstate`
   appear nowhere in the 5,834-line component; all navigation is React state.
   Playwright `goBack()` from deep in the app lands on `about:blank`. On iOS
   the edge-swipe is Back — this alone explains "Back works inconsistently."
3. **Reader blocks all text behind tokenizer boot.** "Preparing
   morphology-aware reading…" gates the entire article; with slow or failed
   language-tool loads the learner sees an empty page or an error card with no
   text at all. With healthy assets kuromoji builds in ~1.5 s locally.
4. **Overlap/clipping on mobile reproduced:** "Open review" CTA measured at
   y=889 under a 844px viewport (hidden below the fixed tab bar); shelf
   headline clips under the sticky header while scrolling; the capture FAB
   overlaps footer attribution text.
5. **Immerse cold-start is a configuration wall + filter trap:** first
   viewport is difficulty/length/filter controls plus a slogan; with live
   feeds empty at N2 the shelf shows "0 articles" and advises switching to
   N1+ — no built-in reading is reachable from the default state.
6. **Onboarding modal covers the tab bar** (`p2-modal-backdrop` intercepts
   taps while the nav renders beneath it) until the final "Enter Bunki" step.

## Confirmed strengths (same rig)

- The Zen reader, once language tools load, is excellent on iPhone: balanced
  margins (measured 11px/11px), serif Japanese at comfortable measure, the
  4-tap word ladder (reading → meaning → full dictionary → memorize) with
  honest per-token aria-labels, kanji drill-down from the word panel, and a
  working in-reader Back control.
- Today is calm and single-action; empty states are honest ("0 articles from
  0 active domains… shown honestly").
- Onboarding is personalized, humble about placement, and pretty.

## Repro

```bash
cd prototypes/bunki-sites-v11
npm ci
./node_modules/.bin/vite --config vite.config.harness.mts   # port 5199
# Playwright scripts: session scratchpad pw/tour2.mjs, pw/tour3.mjs (to be
# formalized into apps' e2e suite in the repair phase)
```
