# Sites v11 — P0 Interaction Repairs, Round 1 (2026-07-30)

Handoff journeys A (article→reader), B (reader composition), C (Back/history).
No visual restyle — interaction, composition, and reliability only, per the
operator's binding design constraint. Evidence via Playwright + Chromium at
iPhone 390×844 (touch, DPR 3) against the local harness.

## Fixes in this commit

1. **Layered Back contract** (`app/lib/history-layers.ts`, new).
   A single `useBackStack` controller maps open UI layers (menu, capture,
   staged packet, reader, kanji drill-down, word panel) to browser-history
   entries. Hardware/browser Back and the iOS edge swipe now close the topmost
   open layer instead of exiting the app. One controller reconciles history
   depth once per render (single push or single `go`), so a tap that changes
   several layers at once — opening the kanji page closes the word panel and
   the reader — no longer races. In-app close controls consume their own
   history entry, so in-app Back and browser Back never fight.
   - **Before:** browser/edge Back from anywhere → `about:blank` (app exited).
   - **After (measured):** Back from kanji page → reader restored (`true`);
     Back again → reading shelf restored, still in app (`true`); browser Back
     with capture modal open → modal closes, still in app (`true`).

2. **Reader no longer holds text hostage to the tokenizer**
   (`app/components/bunki-phase2.tsx`). The full-screen
   "Preparing morphology-aware reading…" gate that replaced the entire article
   is now a slim non-blocking status line above the always-rendered text; the
   error state is likewise non-blocking. Sentences already fall back to raw
   `sentence.text` until tokens arrive, so the article is readable immediately
   and upgrades to the tap-to-look-up ladder when language tools finish (or
   stays readable if they fail).
   - **Before:** blank page + spinner, or a lone "Retry" error card, no text.
   - **After (measured):** Japanese text visible ~1–3 s after open; word
     tokens become interactive a moment later; text never disappears behind a
     loader.

3. **Mobile overlap / safe area** (`app/phase2.css`). `.p2-page` gains
   bottom padding of `96px + safe-area-inset-bottom` on mobile so content
   clears the fixed bottom nav.
   - **Before:** "Open review" CTA rendered below the viewport under the nav.
   - **After (measured):** CTA bottom clears nav top (`clear: true`).

4. **Viewport guard** (`app/layout.tsx` `export const viewport`, plus a
   runtime belt-and-suspenders effect). Guarantees
   `width=device-width, viewport-fit=cover` even if the deployed head is
   missing it — the suspected cause of the global "shrunken / left-tilted"
   look on iPhone. (Deployed-page confirmation still pending network access.)

## Verification

- `history-layers.ts` introduces **zero** new TypeScript errors: pristine
  snapshot and patched tree both report the same 36 pre-existing errors
  (all `cloudflare:workers` build-only types and prior review-card
  `possibly-undefined` at lines unrelated to this change).
- Journey evidence: session scratchpad `pw/tour4.mjs`; screenshots in
  `docs/build-evidence/sites-v11-p0/` (reader-immediate, kanji page,
  back→reader, back→shelf).
- Console 503s during the run are the harness's intentionally-stubbed API
  routes, not app defects.

## Still open (next rounds)

- Immerse cold-start "content-first" reorder + guaranteed built-in shelf.
- "Find the edge" plain-language redesign (handoff §D).
- 30-article / 10-domain live-import matrix (needs deployment-domain network
  access or run against live source).
- Tablet 768×1024 and desktop 1440×900 viewport passes.
- Formalize `pw/tour4.mjs` into the app's committed e2e suite.
