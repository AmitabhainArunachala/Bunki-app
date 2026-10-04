# Aesthetics and interaction — design spec for the SRS card

Answer to the learner's brief of 2026-10-04 ("10x the aesthetic feel"), written against
`STANDARD.md` §8 + A04/A05/A20, REVIEW F34–F42/F45, `player/player.css`, `player/mount.js`,
`corridor.css` and main's `personal.css`. Judged on screenshots of the shipped
`study-mcd.html` and `study.html` at 390×844 in 墨 and 白 (`scratchpad/brief-shots/`).

## 1. What exists today

- The skeleton is right: one column, chips, passage, one reveal control, two sticky grade
  buttons. Keep it.
- The back is a stack of nine things of similar weight: chips, passage, divider, term,
  **green 18px bold English gloss**, two kanji tiles whose meanings are English, Japanese
  definition, 英訳 toggle, source, amber tip (also English). English is the loudest thing
  on the back.
- The front shows a dotted underline under every kanji word (tap-for-furigana). It reads as clutter
  and as "editable".
- Colour already carries five meanings at once: accent = target, POS recolours the target,
  topic hue on the left edge (computed from an HSL wheel, never measured), level 1–3 on
  the same edge, state on a chip. Adding "level" and "unique grammar" as hues makes seven.
- `paint()` calls `replaceChildren()` on the whole screen for every tap, so there is no
  reveal transition and the passage re-lays out each time. The swipe transform is inline
  JS and ignores `prefers-reduced-motion` (S37).
- The chip `Tatoeba 3/1` (card.lv 3 of 1 card) is a labelling bug.
- The deck schema has **no level field** (`words[]`: id, group, term, reading, meaning,
  defJa, pos, kanji, cards, tip). Level colouring has nothing to key on yet.
- Washi and sakura textures are painted on `.kp-card`, i.e. under the ruby (S34 forbids).

## 2. "Does it need to be written in Rust?" — no

The player's JS costs under a millisecond per interaction.
What the learner feels as slowness is (a) the whole-screen rebuild on reveal, (b) layout of
a 200-character ruby passage being redone, (c) nothing animating on the compositor, and
(d) first-load fetching of `deck.json` and the FSRS module (A22). None of this is CPU-bound
in the language; it is DOM churn and missing design. Rust/WASM would still hand the DOM to
the same layout engine, add a bundle and a startup cost, and lose inspectability. The only
rewrite with a user-visible gain is a native Swift app (120 Hz ProMotion, haptics, no
Safari storage eviction), and that is a packaging decision, not an aesthetics one. Do §5 and §10 first; measure on an iPhone
before revisiting.

## 3. Colour semantics

Rule: one hue axis per surface, each hue always paired with text or shape (S34).

| Surface                    | Carries                        | Token                                           |
| -------------------------- | ------------------------------ | ----------------------------------------------- |
| Target word / blank / term | **accent** (the asked thing)   | `--kp-accent` (alias of today's `--kp-cyan`)    |
| Target word only, back     | POS (existing registry)        | `--kp-noun … --kp-sound`                        |
| Card left edge + kind chip | **item kind**: 語 / 字 / 文法  | `--kp-kind-go`, `--kp-kind-ji`, `--kp-kind-bun` |
| Grade buttons, state chips | state: again / good / learning | `--kp-red`, `--kp-green`, `--kp-amber`          |
| Everything else            | nothing                        | `--kp-ink`, `--kp-ink-2`, `--kp-line`           |

- **Item kind is the hue the learner asked for** ("unique words, unique grammar points
  each subtly different"). Proposed: 語 = accent, 字 = amber-shifted accent, 文法 = violet
  (`#a58bff` dark / `#5f46c9` light). It replaces the level-1–3 edge and the topic edge on
  the card. Topic hue stays on the home list only, and must come from the S34 registry, not
  the HSL wheel.
- **Level (N1/N2/at-my-level) gets no hue.** It is a monochrome chip `N1` in
  `--kp-ink-2` on `--kp-panel-2`, shown only once `words[].level` exists in the schema.
  "At my level" is learner-relative and belongs to the scheduler's state chip, not a
  colour. A fourth hue axis would fail the "nothing overwhelming" test and the CVD test.
- **Task type** (穴埋め / 読んで / 4択) is text in the chip row, never a hue.
- **English is never coloured.** Today's green gloss borrows the "good" state colour.
- `--kp-accent-wash` stays at ≤14% alpha; it is the only tinted surface behind text, and
  A20 says that pair is measured, not the raw panel.

Contrast retune (A20): the review's 4.13:1 gloss figure is the composited value; the raw
panel value is 5.77. Keep both in the matrix. Proposed light retune that passes 7:1 for
passage and ≥6.5:1 for every token on a 12% tint: `--kp-ink-2: #27343f` (12.7),
`--kp-mute: #4f5d6a` (6.8), `--kp-green: #075e36` (7.9 on white, 6.5 on the good button).
Washi and sakura move their textures to the page background and re-measure.

## 4. Typography and spacing for passages with ruby

- `--kp-read: clamp(22px, 6.2vw, 26px)`, `line-height: 2.0` comfortable; the 30px cap is
  too big for 190-character passages (F40). Sans stays (`--kp-jp`); the corridor's serif
  is for reading, the dojo is for recall.
- Ruby: `rt { font-size: 0.5em; line-height: 1.1; }` → 12px at 24px (S36). Today's 0.45em
  gives 10.9px. Add `ruby-align: center` from the reader so readings overhang instead of
  prying 拡張 apart. `line-break: strict; overflow-wrap: anywhere` already present.
- Target: `--kp-accent` + `font-weight: 700` + a 2px underline; the underline is the
  shape pairing for CVD users.
- Card padding `18px`; chips row 23px; hint 15px/1.5 in `--kp-ink-2`; answer block gap
  `10px`; term 30px (not 34); reading 17px; defJa 17px/1.6; English 15px/1.5 `--kp-ink-2`
  regular weight.
- Back order (resolves PR #116 vs this brief): term + reading + POS badge → **defJa** →
  English gloss, small and grey, still visible by default (`gloss: show`) → 英訳 details →
  kanji row → source → tip. The learner's "click and work a little" is honoured by weight
  and position, and by the existing `gloss: tap` setting; the earlier decision to show
  English stays true.

## 5. Motion: what "zooming" means at 60 Hz

A 60 Hz phone has 16.7 ms per frame. Only `transform` and `opacity` animate on the
compositor; the passage must never be rebuilt during an animation.

- **Reveal** (the one transition that matters): the card node is kept. The blank's wash
  fades out and the target text fades in (opacity 160 ms, `cubic-bezier(0.2,0,0,1)`); all
  `rt` fade from 0 to 1 over 180 ms, 40 ms after the target; the answer block enters with
  opacity + `translateY(6px→0)` 180 ms. The grade bar does not animate. Nothing
  changes height while animating: reserve the answer's space with `min-height` on the
  card, or let it extend below the fold where the eye is not.
- **Advance** ("the spaceship"): the queue moves, not the learner. On grade, the current
  card slides out `translateX(±24px)` + opacity 140 ms in the grade's direction, the next
  card is already mounted underneath and comes up `scale(0.98→1)` 180 ms. The progress
  rail (`--kp-progress`) ticks per card with a 120 ms width transition and a 2px accent
  pip at the cursor. That is the whole "zoom".
- **Swipe**: follow the finger (`translateX(dx) rotate(dx/40deg)` as today) but set
  `data-swipe` after 40px and change the edge colour, never the background.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` removes every transform
  and the progress transition; opacity fades are capped at 100 ms; swipe follow is
  disabled in JS (`matchMedia` check in `attachSwipe`), buttons do the work (S37).
- No breathing, parallax or texture motion; static texture only on `.kp`, never on
  `.kp-card`.

## 6. Button set and placement

- Default: two buttons, `もう一度` (1fr) / `思い出せた` (1.2fr), 64px high, sticky with
  `env(safe-area-inset-bottom)`, as today. The method text, keyboard map and bar describe
  the same set (A05).
- Optional four (`grades: four`): `難しい` and `簡単` at 0.8fr with the plain guidance
  "難しい＝思い出せたが時間がかかった". Never a default.
- Interval labels stay in `--kp-ink-2` 12px monospace, uncoloured.
- `答えを見る` is the one reveal control; the whole card also taps. Remove the duplicated
  `タップして答えを見る` line after the first three sittings (prefs `sittings` counter).
- Swipe hint shown for the first three sittings only, then removed;
- Undo: a 44px `↶` in the top bar during study and on the done screen (F37).

## 7. Tap-to-define, back only

- Front: **no per-word affordance.** `.kp-tapword` dotted underline is removed from the
  front. Non-target furigana (A04) is one quiet chip `ふりがな` in the chip row; a tap shows
  all non-target readings and logs `assist: furigana`. The target span is never tappable
  before reveal.
- Back: every content token (`.kp-tok`, kanji word or marked grammar point) is a
  `role="button"` with a 1px dotted bottom border in `--kp-line` at full line width; the
  affordance is uniform, so it reads as "this layer is live". Tap opens
  `.kp-pop`, a sheet anchored under the word: reading, defJa, `英` toggle for the English,
  and one 44px row `覚えるリストに追加` wired to the corridor's existing memorize list.
  The term itself opens the same sheet with the kanji anatomy (today's `.kp-kj` tiles
  move here).
- Grammar points come from a `card.grammar[]` span list once the content pipeline marks
  them; until then only kanji words are tokens.

## 8. Density

`.kp[data-density="compact|comfortable"]`, prefs key `density`, default comfortable.

| Token           | comfortable             | compact                  |
| --------------- | ----------------------- | ------------------------ |
| `--kp-read`     | 24px / 2.0              | 22px / 1.85              |
| `--kp-card-pad` | 18px                    | 14px                     |
| chips           | kind·source·topic·state | kind·state (rest on tap) |
| kanji row       | collapsed               | collapsed                |
| tip, source     | shown                   | behind `詳細`            |

Compact also moves a 44px **answer strip** (term · reading · defJa, one line, ellipsised)
into the sticky bar when `.kp-term` is above the viewport (F40), so the grade decision never
needs a scroll back.

## 9. Remove

1. `VISUAL_TIPS` on the home screen (memory claims without a study, S28/F41).
2. Topic HSL wheel on the card edge; the level 1–3 edge; both replaced by item kind.
3. Dotted underlines on the front.
4. The green bold English gloss (becomes grey, small, below defJa).
5. Amber tip bar (plain `--kp-ink-2` paragraph labelled 注).
6. Permanent swipe hint and `タップして答えを見る`.
7. Card-surface textures in 和紙 and 桜.
8. Status chip `初めて` in accent colour (collides with the target); use `--kp-ink-2`.
9. The `3/1` level chip.
10. `--kp-depth` 30px shadows on dark themes (one 1px inset line is enough).

## 10. Implementation list (small PRs)

Each PR: `prettier --check`, the Playwright matrix `tools/card-matrix.mjs` (2 decks × 8
themes × front/back × 390 and 320 px, plus 200% zoom for 墨/白, written to
`docs/srs/brief-2026-10-04/shots/`), and `tools/contrast-matrix.mjs` computing every
(token, surface) pair from the CSS variables, failing under 4.5 (7 for `--kp-read`).
Motion PRs add `page.emulateMedia({ reducedMotion: 'reduce' })` and assert no element has a
non-identity `transform` or a `transition-duration` above 100 ms.

1. **Tokens + contrast** — retune 白/和紙/桜 per §3, add `--kp-accent` alias, move textures
   to `.kp`. Verify: contrast matrix all green; screenshots. (S)
2. **Back hierarchy** — reorder per §4, demote English, fix `3/1`. Verify: screenshots,
   axe on the back. (S)
3. **Reveal without rebuild** — `reveal()` appends to the existing card instead of
   `paint()`; rt opacity; answer fade. Verify: reduced-motion check; DOM node identity
   assertion before/after reveal. (M)
4. **Sticky answer strip + four-button option** (F40, A05). Verify: longest-card
   screenshot (km-298-m02) shows term and grade bar without scroll. (M)
5. **Front cleanup + ふりがな chip** (A04 logging). Verify: no `.kp-tapword` in front DOM;
   assistance event recorded. (S)
6. **Item-kind edge, topic registry on home only** (F41). Verify: 8-theme matrix; CVD
   simulation screenshots (`page.emulateVisionDeficiency`). (S)
7. **Back tokens + `.kp-pop` + memorize hook**. Verify: tap opens sheet, keyboard reachable,
   never grades (F34 tests reused). (M)
8. **Density preference**. Verify: both densities in matrix. (S)
9. **Advance motion + progress rail**; swipe reduced-motion guard. Verify: reduced-motion
   check; 60 Hz trace shows only composite layers. (M)
10. **Level chip** — schema `words[].level`, build step from JLPT lists; chip only. (M, needs
    content work)
11. **Remove list** items 1, 5, 6, 10. (XS)

## 11. Disagreements with the brief

- **Level should not be a colour.** No data field, a learner-relative notion, and the
  seventh hue on a card that already fails "subtle". Text chip only.
- **"Zooming" is not a visual effect to add.** The futuristic feel comes from removing
  motionless rebuilds and clutter, then adding one directional transition. A spaceship
  interior is dark, quiet and consistent: the 墨 theme done well.
