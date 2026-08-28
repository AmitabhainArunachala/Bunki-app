# CN SWEEP — review me first

Sweep packet: `docs/handoffs/CN_SWEEP_PACKET_2026-08-28.md`. Ledger: `FINDINGS.md` (same directory).

- **Base sha:** `9926057b` (merge-base with `claude/live-tweaks-20260827`)
- **Head sha:** see `git log --oneline` — the close-out commit `[F-999]` is the tip; the last code-touching commit is `c97da019`
- **Total commits on the branch:** 26 (25 findings + this close-out)

## Counts by class × severity

| class | P0 | P1 | P2 | P3 | total |
| --- | --- | --- | --- | --- | --- |
| FIX | 0 | 9 | 7 | 5 | 21 |
| PROP | 0 | 0 | 0 | 0 | 0 |
| FLAG | 0 | 3 | 16 | 20 | 39 |

(60 ledger rows F-000..F-059; F-000 is the baseline record.)

## Top 5 riskiest changes

1. **`890d88b8` — F-048, verify-corridor.mjs repair.** The battery's corridor gate was rewritten in five places (thesaurus path replaces removed seed chips, study-fold/drawer opening, reader measurement probe, visualViewport touch compensation). Risk: a verifier that passes while testing the wrong thing. 60-second check: `node prototypes/corridor/tools/verify-corridor.mjs` — expect `224/224 checks passed`; then read the step-3.5/step-4 screenshots it writes (`docs/prototype/screenshots/03b-*.png`, `04-*.png`) and confirm they show a word sheet with 意味の近く rows and a kanji page (revert the report/screenshot churn afterwards with `git checkout -- docs/`).
2. **`7cf5b6c0` — F-018, dead CSS/JS removal.** ~130 lines of corridor.css and the strokePaletteFocus microtask branch deleted. Risk: a selector was actually produced by a path the grep missed. Check: `node prototypes/corridor/tools/verify-corridor.mjs` is green (it exercises the stroke page), and `grep -c "stroke-palette\|drift-door\|stroke-close\|variants-bar\|stroke-number-choice\|stroke-title-glyph" prototypes/corridor/corridor.js prototypes/corridor/index.html prototypes/corridor/drift-layer.js` prints 0 for each file.
3. **`31ca9eb4` — F-011, back() learns the list view.** New branch in the central navigation function. Risk: misrouting Back from other views. Check: the branch is guarded by `S.view === 'list'` and placed after the stack pop; `node --check` plus the verify-corridor run (which walks back/forward across sheets) covers it.
4. **`f0f7652e` — F-012, sheet-search door nulls `S.dialogInvoker`.** Touches focus restoration. Risk: the invoker no longer restores when it should. Check: open a search result sheet, tap the sheet's magnifier — keyboard should stay up on the search page; then open a sheet from the reader and dismiss it with the chrome back — focus should still return to the reader token (that path is untouched).
5. **`48653992` — F-015, drift hide() clears the long-press timer.** One line in the drift layer's sleep path. Risk: a pending lock silently cancelled on a legitimate hide. Check: press-hold a drift word until the constellation locks, leave via device Back, return — no phantom lock; and a normal long-press while the layer is awake still locks (verify-drift-hunt's lock tests pass: "a long-press keeps the word it locks onto" is ok in the recorded run).

## PROP commits (revert menu)

None. Every change is FIX or FLAG; no behavior-changing judgment calls were committed.

## FLAG items needing an operator decision

- **F-006** — bunki-desktop hardcoded `/Users/dhyana/Bunki-app` paths; packaged build ships no snapshot despite the comment/README claim.
- **F-020** — ephemeral fold keys (`S.listMenuFor`/`S.studyOpen`) never reset on navigation: stale-open on revisit. "Fold stays as you left it" vs reset — design call.
- **F-022** — dojo undo rows (`r[3]===0`) still counted as practice by the study fold and encounter trail.
- **F-026** — uncommented `.nav-bar { position: relative; }` override (corridor.css:603) stacked on the fixed rule at :448; geometry is now the accident of two rules.
- **F-037** — 7 committed orphan `archive/wikinews-*.json` bodies keep `reading-r0-audit.mjs` red; `data/` is frozen, so re-index vs prune is yours.
- **F-040** — pages-preview.yml shares `concurrency.group: pages` + the `github-pages` environment with the live corridor site; a push to `claude/sites-v11-interaction-recovery` (alive on the remote) clobbers the production deploy.
- **F-050** — verify-journey drives the frozen `corridor-standalone.html`; it goes green only after a standalone rebuild (forbidden in this sweep) now that F-049 restored the data-* seam in live source.
- **F-051** — verify-drift-hunt: 4 gesture FAILs here, A/B-cleared of F-015 and of the touch-offset issue; re-run on your machine to separate environment from regression.
- **F-054** — purge falsifies its derived-state-identity invariant (live replay repro in the ledger). Kernel-semantics decision.
- **F-055** — deferred register entry (+ its pinning test) records WP-10's persistence swap-in as undone.
- **F-056** — observability ring's promised WP-10 direct AI_ROUTE_FIELDS comparison never landed; drift is silent.
- **F-057** — ADR-001 was never amended for the eslint persistence-seam exemption it governs.
- **F-058** — capture-screen.tsx:693 reads the ambient wall clock despite runtime.ts's only-place claim.

Environment notes: F-001 (Playwright chromium missing at baseline) resolved itself — the browser cache is present now, so gate-final ran the browser gates for real. F-002 (corpus pytest deps missing) stands.

## gate-baseline vs gate-final

| gate | baseline | final |
| --- | --- | --- |
| npm run lint | exit 0 | exit 0 |
| npm run format:check | exit 0 | exit 0 |
| npm run typecheck | exit 0 | exit 0 |
| npm run test | exit 0 (1710 tests) | exit 0 (1710 tests) |
| node --check ×6 | ok | ok |
| boundary guard | 0 | 0 |
| storage-integrity | **red** (stale pins) | **PASS, 39 checks** (F-003, F-047) |
| verify-corridor | not runnable (no browser) | **224/224** (F-048; browser cache appeared) |
| battery (overall) | browser gates blocked (F-001) | see gate-final.txt battery section |

Gate-final is strictly better than gate-baseline: the two red gates at baseline are green, and the browser battery actually ran.

## Re-verify everything (copy-paste)

```bash
git checkout review/cn-sweep-20260828
npm install
npm run lint && npm run format:check && npm run typecheck && npm run test
for f in corridor.js corridor-ink.js dictionary-worker.js sw.js drift-layer.js; do
  node --check "prototypes/corridor/$f" || echo "FAIL $f"
done
node --check prototypes/bunki-desktop/main.cjs
node prototypes/corridor/tools/verify-corridor-storage-integrity.mjs   # PASS, 39 checks
node prototypes/corridor/tools/verify-corridor.mjs                     # 224/224 checks passed
bash docs/build-evidence/renkan/battery.sh /tmp/cn-sweep-reverify
git diff --name-only $(git merge-base HEAD claude/live-tweaks-20260827)..HEAD -- \
  docs/specs prototypes/corridor/data prototypes/corridor/vendor prototypes/corridor/fonts \
  prototypes/corridor/audio prototypes/corridor/corridor-standalone.html \
  prototypes/drift/drift-artifact.html packages/seed | wc -l           # must print 0
# the verifiers rewrite tracked evidence as a side effect; drop that churn after reviewing:
git checkout -- docs/
```
