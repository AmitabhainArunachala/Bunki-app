# Skin tokens (C 生きた本棚 + A 磨き): for the room lanes

The skin is the block `BEGIN BUNKI SKIN` … `END BUNKI SKIN` at the end of `prototypes/corridor/editorial.css`, after the Tokens v2 fence. Each room's material and light is a short "Skin frame" block at the end of its `rooms/<room>.css`.

## How to override

- **Every skin value is zero-specificity** (`:where(body:not([data-view='drift']))`). Any rule in your room file wins without `!important`:
  ```css
  html[data-room='tray'] body:not([data-view='drift']) { --color-page: …; --skin-light: …; }
  ```
- For night, use the night list, never `prefers-color-scheme`:
  `:root:is([data-theme='rokusho'], [data-theme='yoru'], [data-theme='nami'], [data-theme='hakuu'], [data-theme='kaku'])[data-room='x'] body:not([data-view='drift'])`.
- **Never repaint a world ground.** `--color-ground`, `--color-paper`, `--color-card-surface` and the `--color-zen-*` grounds are the world's own. `verify-theme-consistency` checks them, and so does the living-paper law in `verify-corridor-accessibility`. The sheet stays `--color-paper`. Change only what is derived from them.

## Colour roles

| Role | Day (default world ベロ藍・浪) | Day (other day worlds) | Night (rokusho, yoru, nami, hakuu, kaku) | Use |
|---|---|---|---|---|
| `--color-ground` | world `#f1e9d3` | world | world | body background. Never changed. |
| `--color-page` | `#f4eee1` washi | ground 58% + `#fbf8f1` | = ground | the page layer the room sits on |
| `--color-paper` | world | world | world | sheet, raised paper. Never changed. |
| `--color-surface` | `#fbf8f1` | paper 55% + `#fffdf8` | = paper | doors, cards, fields |
| `--color-surface-sunk` | ground + ink 4% | same | ground 70% + black | wells |
| `--color-ink` | `#1b1f26` sumi | world ink | world 胡粉 ink | text |
| `--color-ink-2` / `--color-label-2` | ink 82% / 74% over paper | same | ink 84% / 78% over ground | secondary text |
| `--color-muted` / `--color-quiet` | ink 74% / 70% | same | ink 74% / 68% | eyebrows, captions (≥4.5:1 kept) |
| `--color-accent` | `#1f3a5f` 藍 | world 藍 | yoru `#9db8e6`; others the world's own (gold lamp in rokusho/hakuu, pale 藍 in nami, phosphor in kaku) | structure, primary |
| `--color-signal` = `--color-seal` | world 朱 | world | world coral | **the one 朱**: seal, "this, now", wrong, readings |
| `--color-live` *(new)* | `#0b6f78` 浅葱 | same | `#5df2d6` phosphor (kaku: its own) | **one element per screen**: the live thing |
| `--color-live-wash` / `--color-live-glow` *(new)* | 12% / transparent | same | 13% / 45% | glow is night only |
| `--color-gold` / `--color-gold-wash` *(new)* | `#94702a` | same | `#e2bd6c` | earned only: kintsugi seams, saved, lanterns |
| `--color-lacquer`, `--color-lacquer-2`, `--color-lacquer-ink` *(new)* | `#141a28`, `#1d2638`, `#e9e2d2` | same | ground mixed toward black | 藍漆 frames (Learn stage, card room) |
| `--color-line` / `--color-line-soft` | ink 16% / 8% | same | ink 16% / 8% | hairlines |
| `--color-separator` | ink 13% | same | ink 15% | row separators |
| `--color-edge-strong` | ink 34% | same | ink 30% | raised edges, hairline controls |
| `--color-rule` / `--color-rule-soft` | 藍 42% / 13% | same | live 36% / 11% (Words: 40% / 12%) | ruling, the Line's track, plate grid |
| `--color-fill` / `--color-fill-strong` | 藍 6% / 11% | same | accent 10% / 18% | hover washes. Not a pill background. |
| `--color-tint-wash` | 藍 8% | same | accent 12% | selected washes |
| `--color-glass` / `--color-glass-solid` | page 94% / page | same | ground 93% / ground | chrome and the Line |
| `--color-press` | 藍 + black | same | n/a | the primary's under-edge (travel) |
| `--color-glow` | n/a | n/a | accent 42% | the emitted edge of night primaries |

## Type

| Role | Value | Use |
|---|---|---|
| `--font-headword` *(new)* | Shippori Mincho B1 → world serif | display, room titles (`main h1.view-title`, `main h2`), headwords. Weight 800 only. |
| `--font-display` | world display (Shippori B1) | as before |
| `--font-reading` | system Mincho stack | reading text, passages, the reader's title |
| `--font-ui` | system sans | chrome, labels, buttons |
| `--font-data` *(new)* | `ui-monospace, 'SF Mono', Menlo, …` | numbers and data, always with `font-variant-numeric: tabular-nums`. Utility class `.skin-data`. |
| `--font-seal` | Kaisei Tokumin (再 難 良 易 only) | JA grade pads |
| `--font-brush` | Yuji Syuku | rare human notes |

The type scale (`--type-*`, `--leading-*`) is the foundation's, unchanged, because the reader's ranges are pinned. Eyebrows are sans 11.5px, uppercase, 0.14em tracking in EN; 12px, 0.2em, no case in JA.

## Shape, depth, motion

- **Radii:** `--radius-small` 2, `--radius-seal` 3, `--radius-card` 4, `--radius-control` 6, `--radius-surface` 8, `--radius-overlay` 18. Paper is nearly square.
- **Elevation, day** (two layers, warm): `--elevation-paper`, `--elevation-card`, `--elevation-lift`, `--elevation-float`, plus `--elevation-press` for the primary's 2px under-edge. **Night:** a 1px inner light at the top edge plus a deep black drop.
- **Hairline:** `--stroke-hairline` 0.5px. **Relief:** `--stroke-relief` 1px, which `verify-relief` requires on its surfaces.
- **Motion:** `--motion-press` 90, `--motion-quick` 160, `--motion-standard` 220, `--motion-room` 280, `--motion-ma` 120 (間, the held beat), `--motion-ambient` 9000. Easings: `--ease-standard`, `--ease-enter` `cubic-bezier(.22,1,.36,1)`, `--ease-exit`, `--ease-ink` `cubic-bezier(.65,0,.35,1)`. Animate transform and opacity only, and add a reduced-motion off-switch.

## Page layers (the room's material)

`body::before` paints, top to bottom: `--skin-light`, `--skin-ground`, `--texture-washi`, then `--page`. Rooms set:

- `--skin-light`: gradients of light. Examples: dawn band, lamp, city glow from below.
- `--skin-ground`: structure. Examples: the Words grid, the Me binding, the Learn lacquer band.
- `--texture-washi`: kōzo fibre as inline data-URI SVG turbulence. It is a light fibre at night. Never use a sibling `url()`: the standalone build forbids it.

Current frames:

| Room (`data-room`) | Day | Night |
|---|---|---|
| Today (`tray`, `list`, `browse`) | washi at dawn, cool left → warm right | city from above: gold glow from below, a phosphor window |
| Read (`shelf`, `archive`, `feed`, `publisher`, `source-*`, `personal-reading`) | warm thick kōzo, window light | lantern light |
| Learn (`learn`) | darker paper, lacquer band at the top (proscenium) | deep lacquer band, a stage spot |
| Words (`search`, `kanji`, `grammar`, `word-web`, `idioms`, `reference`) | vellum over a 10/50px 罫線 grid, shadowless | phosphor blueprint grid |
| Me (`me`, `progress`, `settings`) | stab-bound book: binding holes and a gold thread down the left margin, late gold light | the same under a lamp |
| Cards (`deckplay`, `contextdeck`) | Learn's lacquer band | same |

## Shared primitives (already styled; restyle per room only if needed)

- **Primary** (`.take:not(.taken):not(.quiet)`, `.btn-primary`, `.chip.btn-primary`): solid 藍 with a 2px under-edge that presses away (`translateY(2px)`). **Night:** a ground-tinted face, an accent-light 1px edge and a glow. It is never a solid phosphor fill (gate 7).
- **Chips** (`.chip`, `.kdx-lens`, `.focus-chip`, `.filter-chip`): hairline slips with a 2px radius and a transparent face. `.on` is solid 藍 by day and a lit wash at night. There are no grey pills.
- **Secondary** (`.btn-secondary`): a 藍 hairline with 藍 text.
- **Eyebrows:** small caps. The 朱 accent rule (22×2px `::before`) is on `.eyebrow.shelf-section`, on `main section > h2.eyebrow`, and on any `main > .eyebrow.skin-ruled`.
- **Doors and cards** (`.study-door`, `.foundation-door`, plus `verify-relief`'s list): surface paper, a 1px ink edge, a two-layer shadow and 1px press travel. Foundation doors are left-aligned with a hairline chevron.
- **Registration marks:** add `.skin-reg` to any surface. It draws four トンボ corners in the background, with no extra nodes, and you can tint them with `--reg`.
- **Sheet:** the world's paper. It has a hairline top edge, an 18px top radius, a float shadow, a 36px grip and a 朱 hairline under the bar.
- **Room sign** (`main > .room-sign`, Shell-built for `tray`, `shelf`, `dojo`, `search` and `me`): it hangs at the right edge under the chrome, and the room's `main` keeps a 36px right margin for it on phones. EN rotates the word a quarter turn (`text-orientation: mixed`); JA stacks the kanji. At night it is lit gold. Only Today (date) and Learn (due) carry a datum. Do not remove it; you may restyle it in your room file.
- **The Line** (`#primary-tabs`): five stations on one hairline track, with a filled car that slides on `transform` only. Today's station carries the live due count from `todayQueue()`, as `.station-due[data-due]` painted by `::after`, so the button's text stays exactly its label. Shell-owned.
- **Entrance:** `html[data-room-entering] #app > main > *` lifts in planes. Children 1 and 2 travel 8px at 0ms, child 3 travels 11px at 20ms, and the rest travel 14px at 40ms. Each plane runs 170ms from opacity 0.01, so the whole entrance fits inside the 220ms entering beat. The sign drops 10px.
