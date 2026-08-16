# #49 — rename BUNKI → KAIRO: the surgical change-plan (NOT executed)

**For:** operator decision sheet OD-5 (RENKAN §5.4) · **Status:** PLAN ONLY — prepared as one reviewable change, fired on your word. Provisional ruling on record: "the app is KAIRO 回廊" (`docs/prototype/KAIRO_BUILD_BRIEF.md:216`).

## Inventory (measured on the working tree, `grep -ric bunki`, node_modules/.git excluded)

**658 files, ~4,290 occurrences**: docs 247 files · prototypes 116 · apps 103 ·
packages 100 · corpus 75 · .github 4 · root misc 13.

**The punchline: the product already answers to KAIRO.** The corridor's page
title is 回廊 KAIRO (`index.html:11`), its store key is `kairo-corridor-v1`
(`corridor.js:574`), its export file is `kairo-<day>.json`, its theme/AI keys are
`kairo-theme` / `kairo-ai-key`, its test hooks are `window.__KAIRO_*`. What still
says BUNKI is the workspace plumbing, the app shell, and history.

## Category A — safe to rename now (the one reviewable change)

| What | Where |
| --- | --- |
| npm workspace names `bunki`, `@bunki/{domain,ai,persistence,export,seed,app}` → `kairo`, `@kairo/*` + every import specifier + eslint boundary rules + lockfile regeneration | root + `packages/*/package.json`, `apps/app/package.json`, ~100 source files, `eslint.config.mjs` (internal names; nothing is published to npm) |
| UI copy: route-title suffix `'Bunki 分岐'` → `'KAIRO 回廊'` | `apps/app/src/ui/route-title.tsx:50` |
| README title `# Bunki (分岐)` and body truth-pass | `README.md` (folds into T8) |
| Python package `bunki-corpus` → `kairo-corpus` + egg-info regen | `corpus/pyproject.toml:6` |
| npm scripts `bunki:web:*`, workflow names/labels, CI artifact `bunki-app-static` | root `package.json`, `.github/workflows/{bunki-v11,pages-app}.yml` |

## Category B — breaks storage or URLs: FROZEN in this change

| What | Why it is frozen |
| --- | --- |
| `localStorage` keys `bunki.persistence.web.v1` (`packages/persistence/src/web/adapter.ts:120`), store name `bunki-phase0` (`apps/app/src/state/persistence/shared.ts:12`), `bunki-theme` (`theme-context.tsx:66`), `bunki_append_batches` | Renaming a live key orphans a learner's event log — silent total data loss. Only a versioned read-old-write-new migration may touch these, and that belongs to the A1 learner-state lane, not a rename commit. (Corridor keys need nothing: already `kairo-*`.) |
| Repo name `AmitabhainArunachala/Bunki-app` + deployed Pages URL `https://amitabhainarunachala.github.io/Bunki-app/` | Repo rename is a GitHub-settings act only you can do; git remotes redirect but **Pages URLs do not** — every shared link and the phone-installed PWA scope dies. Separate decision, never a side effect. |
| Content IDs `bunki-graded-*` / `bunki-essay-*` (73 article files + shelf manifest + `TITLES_EN`) | These are identifiers, not branding: learners' captured cards reference them (`ctx.p`), provenance records name them. Renaming breaks every stored capture context. Frozen as historical IDs; new articles may use a `kairo-` prefix. |
| `parameterSetId: 'bunki-fsrs6-r090-defaults-v1'` (`fsrs-pin.ts:131`, mirrored in `data/fsrs-pin.json`) | Recorded on every derived MemoryState; the id changing is defined to MEAN the parameters changed. A rename would forge a scheduler migration that never happened. Next real parameter change mints a `kairo-*` id. |
| Export snapshot format ids / event `v:1` vocabulary | Same replay-equality law (T-03): stored strings are evidence. |

## Category C — historical docs: NEVER touched

Frozen `docs/specs/` (hash-verified — campaign §0 law), the operator lock + its
SHA256 integrity file, and every dated file under `docs/{operator,briefs,prompts,
convergence,handoffs,audits,build-evidence,adr}`. BUNKI stays in history exactly
as written; new documents are authored as KAIRO. Rewriting dated documents would
break integrity hashes and falsify the record.

## Execution order (when fired)

1. **One commit** on the campaign branch: all of Category A, mechanically, with
   the full §4 battery run green on the result (typecheck catches every missed
   `@bunki/` import; lockfile regenerated; CI proves workflows still resolve).
2. **The PR body enumerates Category B and C as deliberately frozen**, each with
   its one-line reason — the review is as much about what did not change.
3. **Separate, yours alone, any time or never:** the GitHub repo rename
   (accepting the Pages-URL break, ideally timed with a real domain), and the
   storage-key migration if A1's migration machinery ever makes it free.

**One-word meanings** — FIRE: execute step 1-2 now (storage, URLs, content IDs,
history all frozen). FIRE+REPO: the same, plus you rename the GitHub repo and we
re-point Pages, accepting that old URLs break. HOLD: nothing changes; this plan
stays on the shelf, ready.

**Decision requested:** FIRE (recommended) · FIRE+REPO · HOLD
