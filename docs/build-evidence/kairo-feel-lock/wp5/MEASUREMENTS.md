# WP5 — corridor nav/polish · measured evidence

Base: `claude/kairo-feel-lock-2026-08-09` @ `fc7d676`.
Instrument: `wp5-probe.mjs` (this directory) — real Chromium via playwright-core,
touch context, measurements taken from `getBoundingClientRect()` and `window.scrollY`
inside the page. Raw output: `before.json` (base build) / `after.json` (this build).

Both runs report **zero console errors and zero page errors** across every viewport
and every flow (`errors: []` in both JSON files).

---

## (a) 戻る restores the shelf scroll position exactly

`window` is what scrolls — `main` has no scroll container, so `window.scrollY` is the
shelf's position. The offset is recorded on the way out and put back on the way in.

**Measurement discipline.** Playwright scrolls a target into view before clicking, so a
harness-side reading taken beforehand is *not* the offset the app sees. Every `before`
below is the page's own `window.scrollY` captured by an in-page capture-phase
`pointerdown` listener at the instant the door is pressed.

| door | flow | before → after (base) | before → after (this build) |
|---|---|---|---|
| 1 | shelf → article → 戻る | 640 → **0** ✗ | 640 → **640** ✓ exact |
| 2 | shelf → search result → entry sheet → back | 880 → 880 ✓ | 880 → **880** ✓ exact |
| 3 | shelf → 覚 lists → 戻る | 900 → **0** ✗ | 900 → **900** ✓ exact |
| 4 | reader's own place (regression guard) | 420 → 420 ✓ | 420 → **420** ✓ exact |
| 5 | shelf → reader → word sheet → kanji sheet → out of both → 戻る | 520 → **0** ✗ | 520 → **520** ✓ exact |

Door 5 is the composed chain; its deepest node was `kanji:新` (2 kanji rows), both
sheets closed, `body[data-view]` back to `shelf` on return.

Honest note: door 2 was **already correct** on the base build. A sheet is a layer over
the shelf — the browser never scrolls, so there was nothing to restore. The broken
cases were exactly the ones that **change view** (reader / lists / grammar), which is
what this change fixes.

Repo suite, step 6, unchanged: `two hops deep, 戻る returns to the reader at the same
place — scrollY 420 → 420, sheet closed=true`.

### localStorage / view state

`saveStore()` (corridor.js:260) persists **only** `{ taken, lists }`; `loadStore()`
(corridor.js:249) reads back only those two. No view state, no scroll, no dial, no
`view` field is in the `kairo-corridor-v1` schema today. `S.shelfScroll` was therefore
added to in-memory `S` only and is **not** persisted — the schema is byte-unchanged.

---

## (b) Reader hint adapts to the ふりがな dial

The ladder in `activate()` is two rungs, not three, when readings are always on:
`hasReading` is already true, so the first activation cannot reveal a reading and goes
straight to the English gloss. Verified behaviourally, not just read off the source —
at dial 2, tap 1 mounted `.tok-en` with no sheet, tap 2 opened the sheet
(`bLadderAtDial2: {afterTap1:{en:true,sheet:0}, afterTap2:{sheet:1}}`).

| lang | dial | base build hint | this build hint |
|---|---|---|---|
| EN | 0 なし | activate = reading · again = English · third = full entry · focus = no-hold actions | *(same)* |
| EN | 1 触れて | *(same as above)* | *(same)* |
| EN | 2 つねに | activate = reading · again = English · third = full entry · … ✗ | **activate = English · again = full entry · focus = no-hold actions** ✓ |
| 日本語 | 0 なし | 触れる＝ふりがな · もう一度＝英語 · 三回目＝全項目 · フォーカス＝長押し不要の操作 | *(same)* |
| 日本語 | 1 触れて | *(same as above)* | *(same)* |
| 日本語 | 2 つねに | 触れる＝ふりがな · もう一度＝英語 · 三回目＝全項目 · … ✗ | **触れる＝英語 · もう一度＝全項目 · フォーカス＝長押し不要の操作** ✓ |

The per-token `aria-label` carried the same false claim and was corrected with it:
at dial 2 its tail is now `a further activation opens the full entry; focus for more
actions` / `もう一度で全項目。フォーカスで別の操作。` (base build: `third activation …`
/ `三回目で全項目。` at every dial setting).

Screenshots: `after-b-hint-{bi,ja}-furigana{0,2}.png`, `before-b-hint-{bi,ja}-furigana2.png`.

---

## (c) Component rows never say "unnamed part"

Scan of `data/share_alike/kanji.json` (the layer the sheet reads):

- 2,582 kanji, 926 radical records, **11,159 component references**
- **3,150** of those references (28.2%) resolve to a record whose `name` is `""`
- **705** distinct nameless components (e.g. 乂 廿 王 亻 中 申 …)
- **0** of them lack a radical record entirely — every one carries `kanjiCount`

So the old fallback fired on more than a quarter of all component rows, and in every
single case there *was* something true to say. These are shape components, not Kangxi
radicals; the 漢検 table simply never named them.

Worked example — 丈 (`before-c-components-丈.png` / `after-c-components-丈.png`):

| glyph | base build label | this build label |
|---|---|---|
| 一 | いち | いち *(unchanged — a named radical)* |
| 乂 | **unnamed part** | **component — used in 76 kanji** |
| 丿 | の | の *(unchanged)* |

The row is and remains a working door: pressing the 乂 row opens `radical:乂`, whose
hero already reads `(a part with no name in the 漢検 radical table)` and whose body is
the family of 76 kanji containing the shape — exactly what the new label promises
(`after-c-component-door-乂.png`). Row geometry unchanged: `BUTTON`, 358×61 px, `›`
chevron — well over the 44 px floor.

Copy chosen: `部品 — {n} 字に使われる` / `component — used in {n} kanji`, with
`部品 — 漢検の部首表に名前がない` / `component — no name in the 漢検 radical table`
as the guard if a record ever arrives with no count.

---

## (d) Desktop reading measure

`main { max-width: 820px; margin-inline: auto }` — no media query, deliberately: below
820 px the max-width sits above the viewport and the auto margins resolve to 0, so the
phone layout cannot move. 野 and 墨流し opt out via `body[data-view]`; the drift layer
itself was not touched.

| viewport | `main` (base) | `main` (this) | `#reader` (base) | `#reader` (this) | `.sheet` (base) | `.sheet` (this) | first-80 token rects identical |
|---|---|---|---|---|---|---|---|
| 320 | 320 @ 0 | 320 @ 0 | 288 @ 16 | 288 @ 16 | 320 @ 0 | 320 @ 0 | **yes** |
| 390 | 390 @ 0 | 390 @ 0 | 358 @ 16 | 358 @ 16 | 390 @ 0 | 390 @ 0 | **yes** |
| 768 | 768 @ 0 | 768 @ 0 | 736 @ 16 | 736 @ 16 | 768 @ 0 | 768 @ 0 | **yes** |
| 1280 | 1280 @ 0 | **820 @ 230** | 1248 @ 16 | **788 @ 246** | 1280 @ 0 | **820 @ 230** | no (intended) |

Widths in px, `@` = `getBoundingClientRect().x`. At 1280: 230 + 820 + 230 = 1280 —
centred exactly. Both the column (820) and the reader box inside it (788) land in the
requested 760–880 band.

The 390 px byte-equality was measured on one article (the first shelf text), first 80
`#reader .tok` rects to 2 dp — all 80 identical between base and this build. Same for
320 and 768.

**No horizontal overflow** (`documentElement.scrollWidth > clientWidth`) at any of
320 / 390 / 768 / 1280, on the shelf, in the reader, and with an entry sheet open.

---

## Suite / lint

- `node prototypes/corridor/tools/verify-corridor.mjs` → **91/91 checks passed**
  (baseline before the change was also 91/91). Run with `--shots` into scratch;
  the `docs/prototype/screenshots` + `verification-report.json` churn the suite
  produces was reverted and is not in this commit.
- `npx eslint .` → clean (note: `prototypes/corridor/corridor.js` is covered by the
  repo's existing eslint ignore list; `corridor.css` and the rest of the tree lint clean).
- `npx prettier --check .` → `All matched files use Prettier code style!`, including
  both edited files checked explicitly.
- `node prototypes/corridor/tools/build-standalone.mjs` → builds (8.17 MB). The
  generated `corridor-standalone.html` was **not** regenerated in this commit.

## Observation outside WP5 scope (not fixed, not caused here)

For roughly 700 ms after a reader token opens its full entry, the first press of the
sheet's own 戻る is swallowed and a second press is needed. Reproduced identically on
the base build; `window.scrollY` is unaffected throughout (420 held across the whole
sequence), so it does not touch any claim above. The probe settles ~900 ms before
back-chaining for this reason.
