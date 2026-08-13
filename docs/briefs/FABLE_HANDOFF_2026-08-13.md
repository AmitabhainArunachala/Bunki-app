# 回廊 KAIRO — Fable session handoff (2026-08-13)

**Why this file exists.** The Fable session driving the 八彩 color rebuild
hit its usage limit mid-P1. This document preserves everything a fresh
Fable (or any) agent needs to resume the build with zero loss of
precision. Read it top to bottom, then open the two governing docs it
points to, then continue at "RESUME HERE" (§9).

**Read these three first, in order:**

1. `docs/briefs/KAIRO_GOSAI_REBUILD_SPEC_2026-08-13.md` — THE build
   contract. Status line at the bottom says LOCKED; the build is OPEN at
   P1. Eight phases, each gated. This is the law.
2. `docs/design/HASSAI_STANDARD_2026-08-13.md` — the locked eight-world
   color standard (supersedes the 五彩 GOSAI doc).
3. This file — the tacit knowledge and resume point.

---

## §1 Who the operator is, and how they work

- Sole design & product authority. Pronouns they/them. Refer to them as
  "the operator."
- **Ships by feel on the phone** (iPhone, 390×844). A design isn't done
  until they've looked at it on the phone and said so.
- **Delivery ritual:** deploy to the live GitHub Pages site, then send a
  short plain-language paragraph + the stills via SendUserFile + the live
  link. One plain paragraph, not a wall.
- **Merge nothing to `main` without their explicit word.** The whole
  build lives on ONE integration branch: `claude/app-vision-next-steps-wei73a`.
- Aesthetic north star, in their words this session: **"more real, more
  truth in the mechanism, never more decoration."** They rejected the
  early stroke renders as "cheap / still feels very digital" and only
  warmed when the ink became a real fluid simulation. They value honest
  engineering and honest reporting — tell them what failed, plainly.
- Rights integrity is fail-closed and non-negotiable (the pages-app.yml
  gate).

## §2 The design arc that led here (this session, compressed)

Operator pushed the kanji stroke-order art through five rounds:
v1 (SVG centerlines — "cheap") → v2 (animCJK true brush outlines + a
hand-built Canvas 2D ink compositor — "massively better") → v3
(bristle-level naturalism, five imaginative worlds) → v4 (a real WebGL2
fluid ink simulation — the "still feels digital" fix) → **v5 the full
D2Q9 lattice-Boltzmann fluid ink engine in WebGPU compute** (with a
tested WebGL2 fallback). Then color: 十彩 (ten nihonga palettes) → 五彩
(operator locked five) → operator asked for Hokusai options and an
AKIRA/Ghost-in-the-Shell set → a 13-world carousel → **operator locked
EIGHT (八彩)**.

Verbatim operator turning points (for tone calibration):

- "make it more natural still. More like real ink. Still feels very digital"
- "Might as well push it all the way!!"
- "Yes, do ther full build. And don't worry about the phone getting warm.
  Go all out first then we'll talk ;)"
- "we need to fully lock this into a spec that drives a build until the
  entire thing is done from end to end… if you say go you will just
  piecemeal it" → this is WHY the rebuild spec exists and why phases are
  gated. Do not piecemeal.
- "use 5 of those color themes through the app on every single surface
  possible"
- Final palette lock: "1. Keep [墨・楮紙] 2. 藍 ベロ藍・浪 [as default]"

## §3 The eight worlds (八彩) — LOCKED

One world active at a time; the chrome seal cycles them (days first, then
nights); choice persists on-device. **Every surface re-dresses completely
when the world changes.** Two structural constants never follow the
world: the dictionary sheet is always 黒漆 black lacquer, and the review
card is always warm washi.

| seal | world        | family | pairing                          | register     | [data-theme] key  | true-ink PNG (in prototypes/corridor/design/) |
| ---- | ------------ | ------ | -------------------------------- | ------------ | ----------------- | --------------------------------------------- |
| 藍   | ベロ藍・浪   | 北斎   | Prussian blue on print cream     | day, DEFAULT | `''` (id hokusai) | ink-hoku-berlin.png                           |
| 墨   | 墨・楮紙     | 五彩   | sumi on warm kōzo washi          | day          | `sumi`            | ink-sumi.png                                  |
| 赤   | 凱風快晴     | 北斎   | Red Fuji rust on dawn paper      | day          | `akafuji`         | ink-hoku-akafuji.png                          |
| 柿   | 焦茶・柿渋   | 五彩   | burnt umber on persimmon tannin  | day          | `iwa`             | ink-kaki.png                                  |
| 漆   | 胡粉・黒漆   | 五彩   | shell white on black lacquer     | night        | `rokusho`         | ink-gofun.png                                 |
| 金   | 紺紙金泥     | 五彩   | sutra gold on indigo             | night        | `yoru`            | ink-kindei.png                                |
| 浪   | 神奈川沖浪裏 | 北斎   | foam on the deep Prussian sea    | night        | `nami`            | ink-hoku-nami.png                             |
| 殻   | 攻殻・燐光   | 電脳   | phosphor green on terminal black | night        | `kaku`            | ink-cyber-ghost.png                           |

The `[data-theme]` keys are HISTORICAL names kept so saved preferences
survive; only the values changed. The default (藍) is unkeyed `:root`.
`akafuji`, `nami`, `kaku` are new keys added this session.

## §4 What is DONE and live (HEAD c527106)

- All eight worlds are wired into the REAL app: `corridor.css` token
  blocks + `corridor.js` `THEME_UI` seal cycle (藍墨赤柿漆金浪殻).
- Default world is now ベロ藍・浪 (Prussian blue on print cream).
- Battery green on the eight-world wiring: verify-corridor 116/116,
  accessibility 22/22, npm test 1645/1645, format clean.
- Deployed and confirmed live: https://amitabhainarunachala.github.io/Bunki-app/
- This is COLOR ONLY. The structural rebuild (paper, lacquer, hanko) has
  NOT started — that is P1 onward.

## §5 War-scars — tacit knowledge NOT written elsewhere (critical)

These cost real time to learn. Honor them.

**WebGPU testing in this container:**

- Container Chromium has WebGPU COMPILED OUT. You cannot test WGSL in
  Playwright/Chromium here.
- Fix already applied: `apt-get install -y mesa-vulkan-drivers vulkan-tools`
  (lavapipe CPU Vulkan) + Deno at `/root/.deno/bin/deno`. Deno runs
  WebGPU on lavapipe.
- Harness pattern (see scratchpad harness-*.ts): extract the
  `/*ENGINE-CORE:BEGIN*/ … /*ENGINE-CORE:END*/` block from the stroke-art
  HTML via regex, `import('data:text/javascript,'+encodeURIComponent(core))`,
  run against lavapipe, ASSERT physics (rho mean ≈ 1.0 ± 0.15, % pigment
  in-glyph > 0.85, zero non-finite cells), render frames to PPM →
  Pillow → PNG. Run form: `/root/.deno/bin/deno run --unstable-webgpu
--allow-all <file>`.
- WGSL gotcha: `from` is a RESERVED WORD — renamed to `src`. Watch for
  other reserved words.
- State textures are RGBA16F half-float (NOT 32F) — half-float is
  filterable/blendable everywhere WebGL2 exists incl. iOS.
- LBM stability: explicit-diffusion `D * perm` must stay UNDER 0.25 or
  the water field oscillates negative and floods the sheet solid black
  (this happened on the first run). Fields clamped non-negative.
- One SHARED GPUDevice for all sheets (a second requestDevice can poison
  the first). Per-sheet fallback must use a FRESH canvas (a claimed
  context type is claimed forever). Device-lost → swap that sheet to the
  WebGL2 engine mid-run.

**Playwright / browser harness:**

- Chromium executablePath: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
- Scratchpad static servers MUST map `'.mjs' → 'text/javascript'` or ES
  module imports fail silently (the scheduler never loads).
- Playwright's bundled ffmpeg is a STUB (no x264/gif). Build GIFs via a
  `page.screenshot` loop + Pillow assembly.
- Suite flakes: add `.dictionary-opening` settle + a ~600–800ms beat
  before tapping bottom sheets — deep-dict AND bank one-shot refreshes
  detach already-located elements. Use `set -o pipefail` (a bare `| tail`
  masks the real exit code).

**iOS input reality:**

- Activation is on CLICK, not pointerup (pointerup dies to iOS
  pointercancel in scrollable sheets). `touch-action: manipulation` on
  `.tok`. One-shot ghost-click swallow armed ONLY while pointer is down.
  Do not regress this in the rebuild — the sentence page was "completely
  dead on iPhone" before this fix.

**Accessibility / contrast (matters directly for P1):**

- The a11y suite currently walks ONLY `['hokusai', 'yoru']` (in
  verify-corridor-accessibility.mjs ~line 430). **P1 MUST extend it to
  all eight worlds** — that is an explicit P1 deliverable.
- Contrast is MEASURED, never eyeballed. Just-fixed regression: ベロ藍
  ink is lighter than sumi, so the WCAG-variant faint text measured
  4.34:1 (AA needs 4.5); lifted `.v-contrast-wcag` faint to 0.76/0.68.
  **Lesson: every light world needs its faint/line tokens re-measured,
  not assumed.** The texture "amplitude law" (spec §2 S1): paper texture
  luminance variance ≤ ±3% of `--ground` so measured ratios don't move.

**Living-ink gallery lifecycle (if P5 reuses it):**

- Ten live lattices drown a phone. Pattern: every sheet boots as a still
  image; IntersectionObserver promotes the visible sheet to a live
  engine; at most 2 live at once; on demote, snapshot the canvas to a
  still BEFORE calling stop() (stopping a GL2 sheet loses its context and
  clears the buffer — caught live by the E2E).

**Other:**

- `drift-layer.js` and `corridor-standalone.html` are GENERATED — only
  edit via `tools/build-drift-layer.mjs` / the standalone builder, never
  by hand. The Drift door's per-world pigment is P6 (through the drift
  build).
- `deno.lock` is gitignored (the harness drops it in repo root).
- Seeded-store tests: seed via `addInitScript` before first load (a
  pagehide flush clobbers in-memory state otherwise).

## §6 P1 injection points (recon done this session, verify line numbers — file moves)

- `corridor.css` `body { background: var(--ground) }` ≈ line 92 — this is
  where S1 living-paper ground hooks in (a per-world procedural texture
  as a data-URL background, amplitude-capped).
- `corridor.css` `.sheet { … background: var(--ground) … }` ≈ line 1155
  — P1 makes this ALWAYS-LACQUER via a sheet-scoped token block
  (`.sheet { --ground/--ink/--red/--ai/--line/--faint: <胡粉・黒漆 values> }`)
  so everything inside inherits lacquer regardless of active world.
- `corridor.css` `.grade` / `.grade-row` / `.g-label` / `.g-when` /
  `.grade.g-again` / `.grade.g-good` ≈ lines 3055–3095 — rebuilt as
  hanko seals (square 56px; 良 solid in world red; 易 gold-edged; 再 red
  outline; 難 quiet). Keep EN sublabels in the DOM (suites + screen
  readers select `again/hard/good/easy`).
- `corridor.css` `.theme-seal` ≈ line 1790s — the chrome seal; P1 adds a
  LONG-PRESS world picker (eight world-stones) next to the tap-cycle.
- `corridor.js` `THEME_UI` ≈ line 8815 (eight entries, verified).
- `corridor.js` grade-row build ≈ line 5918 (`el('div','grade-row')`),
  each button's label span ≈ line 5931; probe grade-row ≈ line 6553/6562.
- `corridor.js` `renderSheet` ≈ line 8594 (the bottom-sheet builder).
- `corridor.js` theme seal button build ≈ line 9151 (`'theme-seal'`) and
  ≈ 8993 (`ginga-theme-seal`); `setKairoTheme` ≈ 8842; cycle ≈ 8861.
- `corridor.js` stroke-page ink: `dataset.ink`/`strokeInk` ≈ 8245/8396.

(Verbatim code + confirmed line numbers for all of the above are in the
APPENDIX, populated by the inventory agents — see §10.)

## §7 How to run the battery (every phase gate)

**CRITICAL FIRST STEP — export the browser path.** The three core
verifiers read `process.env.CHROMIUM_PATH`; they do NOT hardcode it and
have NO npm-script alias (invoke with `node` directly). Without this the
browser-driven gates fail to find Chromium:

```
export CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

Then, in this order (verified by the harness inventory agent):

- `npm run format:check` — fast, no browser. (`prototypes/**` is
  prettier-IGNORED so corridor JS/CSS aren't reformatted; `docs/**` IS.)
- `node prototypes/corridor/tools/verify-corridor.mjs` → **116/116**.
  Self-serves an ephemeral `node:http` static server; drives touch via
  CDP at 390×844 iPhone profile; imports `chromium` from `playwright-core`
  (not `@playwright/test`). Writes `docs/prototype/verification-report.json`.
- `node prototypes/corridor/tools/verify-corridor-accessibility.mjs` →
  **22/22**. The theme loop at ~line 430 is `for (const theme of
['hokusai', 'yoru'])` — it walks ONLY 2 of the 8 worlds, and its own
  comment stalely says "all five nihonga worlds." **P1 must extend this
  array to all eight and re-measure.** Writes
  `docs/build-evidence/kairo-a05-accessibility/verification-report.json`.
- `npm test` → **1645** tests (vitest).
- `node prototypes/drift/tools/verify-storage-integrity.mjs` → **9**
  checks (drives `prototypes/drift/drift-artifact.html`; also honors
  `BUNKI_DRIFT_CHROMIUM`).
- `npm run verify:drift:fast` (=
  `node prototypes/corridor/tools/verify-drift-consistency.mjs --mode fast`).
- Deploy: dispatch `pages-app.yml` via the GitHub Actions MCP tool
  (`mcp__github__actions_run_trigger`, method run_workflow, workflow_id
  `pages-app.yml`, ref the working branch). The build's smoke step runs
  `node --check` on corridor.js/dictionary-worker.js and the fail-closed
  rights gate. Then poll
  `https://amitabhainarunachala.github.io/Bunki-app/...` until 200.
- WebGPU (only if touching the ink engine, needs lavapipe present —
  `apt-get install -y mesa-vulkan-drivers`): `/root/.deno/bin/deno run
--unstable-webgpu --allow-all <scratchpad/harness-*.ts>`. The harnesses
  read `assets-*.json` produced first by the matching
  `scratchpad/export-*.mjs`; they are not self-contained, and they live
  in the SCRATCHPAD, not the repo.
- The phase gate ALSO wants an eight-world screenshot matrix committed
  under `docs/build-evidence/gosai-rebuild/pN/`.

## §8 Parallel work outstanding (Codex)

Per `docs/briefs/CODEX_BRIEF_2026-08-12.md`, a parallel agent (Codex) was
briefed on branches `codex/native-readings-20260812`,
`codex/dict-sense-tags-20260812` (Mission 2 — JMdict sense tags, the data
that lights up the dictionary sheet's 略/語感 chips),
`codex/fsrs-optimizer-20260812`, `codex/nightly-verify-20260812`. These
land on their OWN branches and are HARVESTED into the trunk — never merge
the trunk into them. Rule: harvest, don't cross-merge. Check
`git branch -r | grep codex` for what's arrived. The dictionary sense-tag
data (Mission 2) feeds spec P3.

## §9 RESUME HERE — P1, first phase of the rebuild

P1 scope (from spec §4, do NOT exceed it — phases are gated):

1. **S1 living paper ground** — a per-world procedural paper texture
   engine (kōzo strokes / print cream grain / dawn fiber / tannin clouds
   / lacquer polish-lines / indigo+stars / sea swells / terminal), grown
   once per world+viewport, cached as a data-URL, re-grown on seal change.
   Amplitude law: luminance variance ≤ ±3% of `--ground`. The eight
   ground painters ALREADY EXIST as reference in
   `prototypes/corridor/design/gosai-carousel.html` (the `paint()` fn) and
   `gosai-worlds.html` — lift and adapt them.
2. **S2/S3/S4 structural CSS skeletons** — raised-paper cards; the
   always-lacquer sheet token block; hanko grade seals.
3. **Extended tokens** — `--paper-url`, `--sheet-*`, `--seal-*`,
   `--gold: #d9b25f`.
4. **Long-press world picker** on the chrome seal (eight world-stones).
5. **Extend the accessibility walk to all eight worlds** and re-measure;
   fix any world that fails AA by lifting its faint/line tokens.

P1 gate: full battery green (§7) with the a11y suite now covering 8
worlds + an 8-world screenshot matrix committed. Then DEPLOY and hand the
operator the link + one paragraph for their feel verdict BEFORE starting
P2. Do not start P2 while P1 is red or unreviewed.

The end-to-end visual target for the whole rebuild is
`prototypes/corridor/design/kairo-gosai.html` (operator-approved) and the
per-world detail is `gosai-worlds.html` / `gosai-strokepage.html`.

## §10 APPENDIX — verbatim inventories

Trust the line numbers here over §6's approximations if they disagree.
(Gathered 2026-08-13 at HEAD c527106. The full CSS token values live in
the file itself; this appendix gives the exact locations + the JS wiring
that is harder to find by hand.)

### A. corridor.css line-map (all confirmed present, HEAD c527106)

- **Default `:root`** (ベロ藍・浪): lines **12–46** — `--ground:#f1e9d3`,
  `--ground-2:#e9dfc2`, `--ink:#1c2f42`, `--ink-2:#4a5d70`,
  `--red:#b03a2e`, `--line:rgba(28,47,66,0.16)`,
  `--faint:rgba(28,47,66,0.42)`, plus the `--serif/--sans` and `--t-*`
  type scale and `--tap:44px`.
- **Second `:root`** (raised paper + go-colour): lines **1700–1704** —
  `--ground-0:#faf6ea`, `--ai:#2e4d6e`, `--ai-wash:rgba(46,77,110,0.08)`.
  NOTE: many rules use `var(--ground-0, <fallback>)` so they degrade if
  this block is missing.
- **World-map comment**: lines 1706–1721.
- **Seven keyed world blocks** (each re-derives every token):
  `sumi` 1722–1736 · `akafuji` 1737–1751 · `iwa` 1752–1767 ·
  `rokusho` 1768–1782 · `yoru` 1783–1800 · `nami` 1801–1815 ·
  `kaku` 1816–1830.
- **`.v-contrast-wcag`** base: lines **50–55** (`--faint` lifted to 0.76
  / `--faint-2` 0.68 — the ベロ藍 AA fix). Per-world overrides (dark
  worlds only): `yoru` 62–65 · `rokusho` 66–69 · `nami` 70–73 ·
  `kaku` 74–77. **sumi/akafuji/iwa fall through to the base** — if P1's
  paper textures shift their measured contrast, add overrides for them.
- **`body { background: var(--ground) }`**: line **92** (block 91–103;
  carries two hard-coded washi-tooth radial gradients on lines 99–102
  that are DEFAULT-WORLD ONLY and do not adapt per theme — P1's living
  paper replaces/generalizes these).
- **`.chrome`** translucent bar: `color-mix(... var(--ground) 92% ...)`
  line 122.
- **`.sheet`**: lines **1143–1162**, background token `var(--ground)` on
  line **1155** (NOT `--ground-0`). P1 makes this always-lacquer via a
  sheet-scoped token block.
- **`.stroke-page { background: var(--ground) }`**: line 2656 (block from
  2647).
- **`.grade` / `.grade-row` / `.g-label` / `.g-when` / `.grade.g-again`
  / `.grade.g-good`**: lines **3113–3152** (NOT 3055 — that range is
  `.review-face`). `.grade` is `background: transparent` today; semantic
  color is border/text only (`.g-again`→`--red` line 3146,
  `.g-good`→`--ink` line 3151). Zen variant `body.zen .grade-row` line 4121.
- **`.theme-seal`**: lines **1833–1849** (round 34px chrome control,
  `background: var(--ground-0)`; the pattern to mirror for the world
  picker).

### B. corridor.js theme wiring — VERBATIM (HEAD c527106)

`THEME_UI` at **line 8817** (eight entries confirmed):

```js
const THEME_UI = [
  { id: 'hokusai', seal: '藍' }, // ベロ藍・浪 — Prussian blue on print cream (DEFAULT)
  { id: 'sumi', seal: '墨' }, // 墨・楮紙 — sumi on kōzo
  { id: 'akafuji', seal: '赤' }, // 凱風快晴 — Red Fuji on dawn paper
  { id: 'iwa', seal: '柿' }, // 焦茶・柿渋 — umber on persimmon tannin
  { id: 'rokusho', seal: '漆' }, // 胡粉・黒漆 — shell white on lacquer
  { id: 'yoru', seal: '金' }, // 紺紙金泥 — sutra gold on indigo
  { id: 'nami', seal: '浪' }, // 神奈川沖浪裏 — foam on the deep sea
  { id: 'kaku', seal: '殻' }, // 攻殻・燐光 — phosphor on terminal black
];
```

Theme functions (lines 8827–8869): `THEME_STORE = 'kairo-theme'`;
`themeId()` reads localStorage, falls back to `yoru` if
`prefers-color-scheme: dark`, else `hokusai`; `themeIx()`;
`setKairoTheme(id)` sets `data-theme` attr (empty string for hokusai so
bare `:root` wins) + persists + calls `syncDriftTheme()`;
`syncDriftTheme()` calls `window.__DRIFT__.setTheme(themeIx())`;
`cycleKairoTheme()` = `setKairoTheme(THEME_UI[(themeIx()+1)%len].id);
render();` at **line 8864**.

Chrome seal button — **line 9156** (this is where the LONG-PRESS picker
attaches in P1):

```js
const seal = el('button', 'theme-seal', THEME_UI[themeIx()].seal);
seal.type = 'button';
seal.id = 'theme-seal';
seal.setAttribute('aria-label', tx('色の主題を変える', 'change the colour theme'));
seal.addEventListener('click', cycleKairoTheme);
chrome.append(seal);
```

The Drift-hero seal is a SECOND instance — `ginga-seal` / id
`ginga-theme-seal` at **lines 8998–9000**.

Grade-row (review) — **line 5917** (P1 rebuilds these buttons as hanko
seals; keep the EN key in the label span for suites/SR):

```js
const row = el('div', 'grade-row');
const grades = [
  ['Again', 'again', 'もう一度'],
  ['Hard', 'hard', '難しい'],
  ['Good', 'good', 'ふつう'],
  ['Easy', 'easy', '簡単'],
];
// … per grade: b = el('button', `grade g-${key}`);
//   b.append(el('span', 'g-label', tx(ja, key)));   // line 5931
//   b.append(el('span', 'g-when', when));           // line 5932 (FSRS interval)
```

Probe grade-row — **line 6553** (`el('div','grade-row probe-row')`),
label span line 6562.

`renderSheet(root)` — **line 8594** (the bottom-sheet builder; called at
9236). Stroke-page ink: `page.dataset.ink = S.strokeInk || 'sumi'` line
**8245**; the ink-picker dots set `S.strokeInk`/`page.dataset.ink` at
lines 8403–8410. NOTE: stroke-page ink currently keys off its own
`S.strokeInk`, NOT the active world — P5 wires "ink follows the world."

### C. git history (this branch, newest first)

```
c527106 八彩: the eight-world lock — wired live, default ベロ藍・浪   ← HEAD
147b308 design: 世界の回廊 — thirteen worlds in a carousel + the neon three
9dcc628 design: 北斎五景 — a Hokusai-inspired world family, option round
2e03343 design: 書の間・五彩 — one room, five worlds, on the stroke page
a88f0e2 design: 五彩・詳解 — the five worlds in full detail, no room for 誤解
cc79b0a spec: 回廊・五彩 rebuild contract — end to end, no piecemeal
f7ece24 design: 五彩 — five locked worlds wired into the corridor + end-to-end vision
6d2abd2 design: 十彩の墨 — ten nihonga colorings of the living ink
a9df76f chore: ignore deno.lock from the WGSL verification harness
a357a0f design: 墨の物理・全 — the full lattice-Boltzmann ink engine
06cc6d3 design: 生きた墨 — GPU fluid-ink blend + 回廊・極, the whole app at max
```

HEAD c527106 · 2026-08-13 10:34:28 +0000 · branch
`claude/app-vision-next-steps-wei73a`.

### D. Codex parallel branches (remote, as of handoff)

`git branch -r | grep codex` shows only OLDER branches
(kairo-a1/a2/drift/full-build from 2026-08-08/09, drift-v10 from 08-05,
plus `agent/bunki-codex-*`). The 2026-08-12 mission branches named in
`CODEX_BRIEF_2026-08-12.md` (codex/native-readings-20260812,
codex/dict-sense-tags-20260812, codex/fsrs-optimizer-20260812,
codex/nightly-verify-20260812) are **NOT yet pushed** — re-check with
`git fetch && git branch -r | grep codex` before assuming Mission 2's
sense-tag data is available for spec P3.

### E. Inventory-agent note

Five inventory agents were spawned during this handoff; the CSS-token
agent (§A source) completed cleanly. The other four dropped to transient
API "connection lost" errors during the model switch, so §B–§D were
gathered by direct file reads instead — equally authoritative, same HEAD.
