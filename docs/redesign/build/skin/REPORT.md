# Skin and Shell lane: report

Branch `claude/redesign-20261008`. Built: C 生きた本棚 with A 磨き's craft, applied as the shared skin, the shell and each room's frame. The room lanes build on top of this. Read [TOKENS.md](TOKENS.md) for the roles and how to override them.

## What changed

- **Skin (`editorial.css`, the new `BEGIN/END BUNKI SKIN` block after the Tokens v2 fence).** Every value is zero-specificity, so any room rule wins without `!important`.
  - **Day:** washi page with an inline data-URI kōzo-fibre texture, sumi ink in the default world, 藍 structure, and the world's 朱 as the one seal/signal. A new `--color-live` 浅葱 role is for the single live mark per screen.
  - **Night (rokusho, yoru, nami, hakuu, kaku):** each world keeps its own ground and paper. Light is emitted rather than filled: lit edges, a city glow from below, phosphor `--color-live`, and lantern `--color-gold`. yoru's accent becomes 藍-light `#9db8e6`; kaku's live colour is its own phosphor.
  - **New roles:** `--color-live*`, `--color-gold*`, `--color-lacquer*`, `--color-press`, `--color-glow`, `--font-data`, `--font-headword`, `--motion-ma`, `--ease-ink`, `--texture-washi`, `--skin-light`, `--skin-ground`.
  - **Primitives:**
    - primary buttons: solid 藍 with 2px press travel by day; at night a lit edge plus glow, never a solid phosphor fill;
    - chips, lenses, filters and fields: hairline paper slips, with no grey pills;
    - eyebrows: small caps with the 朱 rule;
    - doors and cards: relief kept (1px edge and a two-layer shadow), left-aligned, with a hairline chevron;
    - `.skin-reg`: registration marks;
    - the sheet: hairline edge, 18px radius, 朱 rule under the bar;
    - room titles: Shippori B1 800;
    - data: system mono, tabular figures.
  - On phones the room sits on the washi instead of inside a white card. The reader is unchanged.
- **Shell.**
  - **The Line** (`buildPrimaryTabs` plus the nav-shell CSS): five stations on one hairline track. A filled square car slides between stations with a `transform` animation from the previous station, and is off under reduced motion. Today's station shows the live due count from `todayQueue()`, the same truth as the galaxy's 復習 N. The count is painted from `data-due` by `::after`, so each button's text is still exactly its label. The aria-label is `Today · N due` / `今日 · 復習 N`. Hit areas stay 44px, `--nav-clearance` is unchanged, and the bar still hides on sheets.
  - **Chrome:** quieter. It is glass in the page tone on a hairline. 道場 is a small-caps label (Shippori in JA). The world seal is a 朱 square seal, the language segment is hairline, and the `#tray` count is mono. All ids are unchanged.
- **Room sign (縦看板).** `buildRoomSign()` adds an `aria-hidden` sign to Today, Read, Learn, Words and Me. EN rotates the word; JA stacks the kanji. It is lit gold at night. Today carries the date and Learn the live due count. Phones keep a 36px right margin for it. The shelf keeps its full measure, because its title block is pinned to one-line notes; only its look-up field steps aside, and the sign is shortened there.
- **Room frames (`rooms/*.css`, one short block each).**
  - Today: dawn washi; at night, city glow from below.
  - Read: warm kōzo; at night, lantern light.
  - Learn: a lacquer proscenium band.
  - Words: a 10/50px 罫線 drafting grid; at night, a phosphor blueprint.
  - Me: stab-binding holes and a gold thread; at night, a lamp.
  - Cards: Learn's band.
- **Entrance** (`register.css`): the room lifts in planes like a multiplane cel, within the 220ms `data-room-entering` beat. It starts at opacity 0.01 and is off under reduced motion.
- **Docks (the coordinator's CI note).** The private import's confirm and cancel buttons now stand one per line on phones, capped at `100vw − 120px`, so they can never reach the report rail's column at any engine's text width. `verify-redesign-docks` was not changed.

No verifier was edited, and `VERIFIER_CHANGES.md` has no new rows. Storage, records, the SRS, `drift-layer.*` and the front-door sky were not touched.

## Verifiers

All runs used a clean committed tree in a worktree at `d49b2ea0`, built to `~/.dharma/skin/site-v2`, with Chromium only (there is no WebKit in this container).

| Verifier | Result |
|---|---|
| verify-theme-consistency | PASS |
| verify-relief | PASS |
| verify-corridor-accessibility | PASS |
| verify-dojo-door | PASS |
| verify-experience | PASS |
| verify-design-reader-shelf | PASS. The first run failed M1-title-block-390: the 未確認 note wrapped once the shelf lost width to the sign. Fixed by the shelf-specific margin. |
| verify-redesign-foundation (Chromium) | PASS |
| verify-redesign-docks | Chromium 12/12 PASS. The WebKit half cannot launch here (`webkit-2359` missing). The WebKit preview-confirm overlap is fixed by construction; CI must confirm it. |
| verify-corridor-storage-integrity | PASS |
| lint-ui-language --core-only | PASS |

Logs are in `/root/.dharma/skin/logs/v2-*.log` and evidence in `/root/.dharma/skin/evidence/v2/`.

## Evidence

`before-*.png` were taken from HEAD `115c35a4`, before any skin change. `after-*.png` are from the clean build. Both sets cover the five rooms, day (default world) and night (夜 yoru), EN and JA, at 390×844 @2x. Intermediate iterations were compared against the concept C/A shots. Fixes made along the way:

- the white card was replaced by washi;
- the chips were made hairline;
- the sign was moved from a float, which pushed the shelf search down and broke 禁則 beside it, to absolute in a kept margin;
- Me at night was given its own ground;
- study doors were padded;
- the glass was made denser.

## Placeholders and open work for the room lanes

- The Today ambient sky of the learner's own words is the Today lane's. The skin supports it through `--skin-light` and `--skin-ground` on `tray`.
- Room content is still each room's existing markup: the C hero layouts, the shelf spines, the Learn stage, the word plate and the Me book. Each room lane builds these on the frames.
- `--color-live` (浅葱, one per screen) is defined but not yet placed. Each room picks its one live element.
- On wide screens (≥521px) the sign hangs at the viewport edge beside the centred page. This was not tuned for desktop.
- The Read lane's second search field (`.shelf-reading-search`) and `.list-review` still use the older capsule.
