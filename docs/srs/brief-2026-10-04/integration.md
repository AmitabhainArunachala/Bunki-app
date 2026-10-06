# Learner brief 2026-10-04 — integration and feasibility

What the brief's five asks touch, what exists, what must be built, what it costs, and what should not be built as asked. Line numbers are this branch's; the private player is byte-identical to `origin/main`.

## 0. The ground as it stands

- **Deck player** (`prototypes/corridor/decks/player/mount.js`, 929 lines; `engine.js`, 318).
  Renders `bunki-cloze-deck` v1 (kotoba-mcd, kotoba-mine). A card is `ruby: [[surface,
reading, marker?], …]`; marker 1 = target, 2 = rest of the host word, 3 = repeat. There is
  no lemma, no dictionary id, no grammar id on a card. `sentenceNodes()` (mount.js:150–193)
  already does furigana for all / tap / none and already refuses taps on the target before
  reveal (`front: true`). `answerBlock()` (mount.js:453–474) shows term → reading → POS →
  English gloss (or behind 英語 when `gloss: 'tap'`) → `kanjiAnatomy()` (`word.kanji[].c/m/
parts/st`) → `defJa` → translation behind `<details>` → source → tip. Ledger:
  `localStorage['bunki-cloze:<deckId>']`. The player receives only `{deckId, storage,
onLeave}` (corridor.js:10759); `corridor.js` exports nothing, so `lookup()`,
  `commitCapture()` and `go()` are unreachable from it today.
- **Standalone** `decks/kotoba-mine/release/study.html` inlines engine + mount + ts-fsrs +
  deck.json (`build.py:813–839`). No dictionary, no corridor, no `S`.
- **Corridor dictionary path.** `lookup(id, seq, reading, gloss)` (corridor.js:1501): boot
  core `D.dict` (22,934 heads; `{r, m[], p, jlpt?, k[]}`), then the lazily opened JMdict
  tier (`data/share_alike/dict-v2/index.json` + 16 shards, 69,996 entries, layout
  `[seq, head, …, englishGlosses, …]` — English only, no 国語 definitions), then
  `S.deepWords` snapshots. A reader tap goes token → `showMini()` (3760) → `go({t, id})` (2693) → `renderSheet()` (14916).
- **Save chooser.** `takeButton()` (9248) opens `renderTakeChooser()` (9391): 覚えるの札 always,
  any of `S.lists` plus a new name, nothing written until 保存する, then `commitCapture()`
  (9183) builds the `S.taken` row (`{t, id, label, kind, from, ts, started, ctx?, entrySeq?}`),
  the `S.deepWords` snapshot for a deep-tier word and the `S.lists[name]` rows, and commits them together through `commitStorePatch()` (1355). `NODE_KIND` (9115) admits word, kanji, grammar, particle and more.
- **Private player** (`decks/personal/mount.mjs`, `engine.mjs`, `store.mjs`). Four task
  identities per lesson (meaning, reading, grammar, apply), each its own FSRS card; ledger in
  IndexedDB `bunki-personal-collections-v1` with a revision-checked transaction; its own
  HTML-string renderer, English-first chrome, no furigana, no dictionary.

- **Line pins.** `residual-storage-callers.json` pins six `saveStore();` lines
  (1425, 2622, 2676, 2828, 3685, 16384) and `verify-corridor-storage-integrity.mjs:1838–1860`
  asserts them against the live file. Any insertion above a pin turns the suite red until the JSON is recomputed in the same PR. Edits inside `decks/**` touch no pin.
- **Data for a richer back** (all committed, all generatable offline):
  - `share_alike/kanji.json`: 2,582 kanji `{on, kun, m, st, parts[], rad}`; 2,223 have
    `parts`; 926 radicals each list their member kanji. Kanji family = kanji sharing a part
    is a pure join.
  - `drift/data/radk.json`: `RADK` (radical → kanji), `KRAD` (kanji → radicals); the same join, wider glyph coverage.
  - `drift/data/sem.json`: 82 hand-written `word → [[neighbour, 'syn'|'fam', why]]` rows:
    the right **shape** for synonyms, not a source.
  - `original/grammar-v11.json`: 24 points `{id, p, lv, mEn, mJa:'', form, ex[], cues[]}`;
    the corridor's own `GRAMMAR` (corridor.js:163–384) has 244 ids with `mJa`. `cues` make
    offline detection in a passage possible.
  - `reference-extra.json`: `kanjiLevels` (1,979 glyphs), `kanken` bands; `D.dict` has `jlpt` on 5,156 heads.

## 1. The five asks

### A1. Front side untouchable — already true; cheap to make a rule

Exists: `front: true` renders the target as plain text with no listener (mount.js:166–169); A04 makes it a rule. Build: one vitest assertion that no `kp-tapword`/`ruby` sits inside `.kp-target` before
reveal in either deck. **PR-A (½ day).** Accept: test red if a target becomes tappable.

### A2. After reveal: furigana everywhere, tap-to-define, 覚える — the real work

Furigana after reveal already happens (`ruby: 'all'` once `ui.revealed`). To build, in order:

1. **Lemma on the card (data, offline).** The deck build tokenises with fugashi + UniDic
   (`decks/kotoba-mine/README.md:11`) and already holds `base` per token; `_ordered()`
   (build.py:250) throws it away when it cuts ruby segments. Emit a per-card `tok` array:
   `[segIndex, lemma, kind, ref]` where kind ∈ word | kanji | grammar and ref is a `D.dict`
   head, a glyph, or a grammar id (matched by `cues`). `validateDeck()` ignores unknown
   fields, so v1 decks stay valid; freeze-ids are untouched (A25). Measured: 23,295 of 31,316
   kanji-bearing ruby segments already match a core head by surface; the rest are inflected
   verbs and adjectives, which the lemma fixes. 143/323 MCD headwords are not in the core
   dict and need `seq` recorded for the deep tier.
2. **A host bridge, not an import.** The player cannot import corridor.js. Extend the render
   options to `{deckId, storage, onLeave, host?}` with `host = {lookup, open, isTaken, take}`;
   the corridor passes closures over `lookup`, `go`, `S.taken`, and a new
   `openTakeChooser(node)` that sets `S.takePick/S.listMenuFor` and pushes the entry sheet as
   `showMini()`'s seal does (3775–3783). Without `host` the player shows furigana only. Same
   idea as `window.bunkiDriftJudgment` (1452), passed explicitly.
3. **The tap, after reveal only.** In `sentenceNodes()` when `ui.revealed`, a segment with a
   `tok` row becomes a button that opens the corridor's entry sheet via `host.open(node)`.
   The sheet already carries `takeButton` → `renderTakeChooser` → `commitCapture`, so "add to a 覚える list like the rest of the app" is **free once the sheet opens**: same lists, rows, guarded commit and `S.deepWords` snapshot. A `from:
{deck, cardId}` provenance field on the node is a one-line extension of `commitCapture`'s
   `from`
4. **The sheet over the deck view.** `renderSheet()` renders when `S.stack` is non-empty;
   the deck view is painted by `renderDeckPlay()` inside the same `render()`. Opening a sheet
   re-renders the corridor and so `deckPlayer.render()`; mount.js keeps `ui` (position,
   revealed) in module state and handles `sameDeck`, so the card survives. Check that the
   re-mount keeps swipe and scroll.

Risks:

- **Scope leak onto grades.** A tap on the back is assistance; it must write an obslog
  `['tap', key, 3, cardId]` row (S26) and never touch the FSRS ledger. The host bridge
  must expose only `lookup/open/take`, never `grade`.
- **Standalone `study.html` gets none of this.** It has no dictionary (3 MB core, 70k tier)
  and no `S`. Decide now: standalone keeps furigana-only (document it in the deck's
  `method` text), or the build inlines a trimmed per-deck gloss map (`tok` refs → `{r, m}`)
  so tap shows a mini definition but no 覚える. The second is cheap (the lemma set is known at build time); the list write needs the corridor.
- **Two ledgers, one word.** A word taken from a deck card lands in `S.taken` while the
  deck keeps its `bunki-cloze` schedule (by design, 10668; S40.6 forbids dual writes). Say
  so on the chooser: 「覚えるの札に入ります — このデッキの予定は変わりません」.
- **Line pins.** Items 2–4 add lines to corridor.js (bridge closures, one new function).
  Recompute `residual-storage-callers.json` in the same PR, or place the new code below
  line 16384 (the last pin) — the verifier only compares positions of `saveStore();` lines.

**PR-B1 (data, 1 day):** `tok` on both decks, verifier counts unmatched segments, zero for
targets. **PR-B2 (bridge + tap, 2 days):** host option, reveal-gated tap, obslog row,
pins recomputed. Accept: tap a non-target word on the back → entry sheet → 保存する → the
word is in `S.taken` and the chosen list, with `from.deck`; the FSRS record of the card is
unchanged; front taps still do nothing. **PR-B3 (standalone, ½ day):** gloss map or the
documented absence.

### A3. Japanese dictionary entry, synonyms, kanji family, grammar — half exists, half has no source

- **Kanji family**: cheap. Offline join over `kanji.json.parts` (fallback `radk.KRAD`)
  gives, per target kanji, siblings sharing a part, filtered to glyphs that occur in the
  deck or `D.dict` heads, ranked by `kr`. Add `word.kanji[i].fam: [glyph, …]` (≤6) and
  render it inside `kanjiAnatomy()`. **PR-C1 (1 day).** Accept: every family glyph exists in
  `kanji.json`; the target's own glyph is excluded.
- **Grammar on the back**: cheap for matched points. `tok` rows of kind `grammar` (from
  `cues`) render as one line with a tap to the grammar sheet. 244 + 24 points exist; the
  N2/N1 plan merges them. **Inside PR-B2.**
- **Japanese dictionary entry**: not cheap, and the data is not there. `dict-v2` is JMdict:
  English glosses, cross-refs, antonyms — no 国語 definitions. The card's `defJa` (hand
  written, one sentence) is the only Japanese definition in the repo. A real J-J entry needs a
  licensed source (none committed) or authored text per sense (the N2/N1 build already plans
  per-sense glosses, S20). **Do not build a J-J "dictionary" layer now**; keep `defJa`,
  rename the back slot 語釈, and let the N2/N1 schema v2 `Sense.definition` field carry
  longer Japanese text when it is written.
- **Synonyms**: no source at scale. `sem.json` has 82 entries; JMdict has `xref`/`ant`
  rows (`senseTagRows`) that are usable as "see also", not synonyms. Honest option: emit `xref` offline for the 180 core-dict headwords (**PR-C2, ½ day**) and author synonyms only in the N2/N1 editorial pass (S05). A list generated from English-gloss overlap would be wrong often enough to harm.

### A4. Subtle colouring by level and kind — cheap, mostly CSS

Exists: `kp-pos-*` tints the target by POS (player.css:236–239), `--kp-topic` tints the
left edge by group, `kp-lv1..3` by sibling level, eight `data-look` themes. Missing: level
(N-band) and item kind (語/字/文法/表現). Data: `D.dict[head].jlpt` for 5,156 heads,
`reference-extra.kanjiLevels` for glyphs; emit `word.level = {label, derivation}` offline
exactly as PLAN §1.2 specifies (never the string "JLPT N2 word"). Render as one chip plus a
`data-level` attribute; one hue per band at low saturation. A20 requires each (token,
surface) contrast pair to pass, so the colour lands on the chip and a 2-px edge, not on
text. **PR-D (1 day).** Accept: contrast check in `verify-kotoba-mine.mjs` passes on all
eight themes; a card with no level shows no chip.

### A5. One experience across player, private collection, N2/N1 — converge, do not add

A fourth renderer is the wrong answer; the private player already diverges on every axis
(innerHTML, English chrome, four tasks, IndexedDB, no furigana). Two routes:

- **Route 1 — port the private format into the player.** `bunki-cloze-deck` v1 cannot
  express four tasks per lesson; schema v2 (S39, retrieval contracts with `taskKind`) can.
  The N2/N1 plan already targets v2 and the deck player (PLAN §0, PR 5/12). So: v2 adapter
  in `engine.js`, a `kind: 'meaning'|'reading'|'grammar'|'apply'` contract, the personal
  collection imported as a v2 deck, and the IndexedDB ledger migrated per S40 (export bytes,
  checksum, legacy baseline, receipt). The personal UI then becomes a deck chooser plus the
  file picker. **PR-E1 schema adapter (3 days), PR-E2 personal import + migration (3 days).**
- **Route 2 — share only the card back.** Extract `answerBlock()` + the new tap layer into
  `decks/shared/card-back.js` and call it from both players. Cheaper (1 day) but leaves two engines and two ledgers, and the "same 覚える" promise half kept.

Recommend Route 1, after B2 and D so the ported back inherits them. Context-dense waits for decision D1; it is a different card type, not a rival renderer.

## 2. Costs, in order

| PR  | Scope                                                 | Effort | Depends on |
| --- | ----------------------------------------------------- | ------ | ---------- |
| A   | front-side lock test                                  | ½ d    | —          |
| B1  | `tok` lemma/ref rows on both decks (offline)          | 1 d    | —          |
| C1  | kanji family from `parts`/`KRAD` (offline)            | 1 d    | —          |
| D   | level + kind chips and tints                          | 1 d    | —          |
| B2  | host bridge, reveal-gated tap, sheet, obslog, pins    | 2 d    | B1         |
| B3  | standalone gloss map or documented absence            | ½ d    | B1         |
| C2  | JMdict xref "see also" rows                           | ½ d    | B1         |
| E1  | schema v2 adapter with task kinds                     | 3 d    | B2         |
| E2  | personal collection as a v2 deck; IndexedDB migration | 3 d    | E1         |

## 3. What to say to the learner

Cheap and worth doing first: A, B1, C1, D. Expensive but the heart of the ask: B2, then
E1/E2. Should not be done as asked: a J-J dictionary layer (no source; keep and grow
`defJa`), generated synonyms (no source; emit `xref` and author the rest), and a fourth
player for the richer back (converge on the deck player through schema v2). The English
tension (PR #116 vs this brief) is already a setting: `gloss: 'show'|'tap'`; the resolution
is to make the deck default a recorded learner decision (A01 style), not to pick.
