# Words room and the word web: lane report (written by the lead from the lane's hand-back; the lane's Write call was blocked)

Branch `claude/redesign-lane-words`, final commit `ce22b274` (code `d6f38c7e`), merged.

## API
`window.openWordWeb(term, {type: 'word'|'kanji'|'part', invoker})`

- **From any room:** opens the word-web room, centred on `term`, and 戻る returns to the caller.
- **On Words or in the web room:** re-centres the web in place.
- **Before data loads:** returns `false` until the dictionary data has loaded.

The full contract is at the top of the `BEGIN/END WORD WEB` block, right after `renderThesaurus` in corridor.js.

## Before → after
- **Words tab:**
  - The search field keeps every pinned id and placeholder.
  - On phones, the 11 lenses sit on one strip that scrolls sideways.
  - The web sits below, for a default word: the walk in progress, else the last word looked up, else the newest saved word that isn't due today, else a day's word that isn't in your words.
  - The four doors stay as a 2×2 index.
  - The web hides while search results, a finder lens or the SKIP wheel are open.
- **The plate:**
  - **Centre:** the word, with one tick per real stroke.
  - **Ring:** its kanji, with stroke counts.
  - **Above:** their parts, from `D.kanji[c].parts`.
  - **Live:** a part shared by two kanji is the plate's one live element.
  - **Below:** siblings and `D.sem` words.
  - **Side cards:** a real passage, and a linked grammar point.
- **Re-centre:**
  - Tapping any node flies its glyph to the centre in about 250ms, and the walk stays lit: "Your walk: 逆境 — 推進 — 推 — 隹".
  - Word → kanji → part takes 2 taps.
  - A re-centre takes 9–18ms including style and layout.
- **Detail plate:**
  - At least five real data marks.
  - On a part: "40 kanji share this part · N already in your words", plus the family grid.
  - On a word: a "推 and 進 share one part: 隹 · follow it →" door.
- **Passages:** a passage returns to that article at that line, and 戻る comes back to the web.

## Verifiers (final build, Chromium)
- **Pass:** storage-integrity, relief, search-lenses, search-fallback, redesign-foundation, reference-connections, shelf-search, skip-standalone, theme-consistency, corridor-accessibility, lint-ui-language --core-only, experience, record-live, journey.
- **Pass on rerun:** skip-ui, verify-corridor.
- **verify-pr77-ports:** 52/56. The Skin baseline fails the same 4.
- **Pins:** no pinned id or label changed.

## Honest limits
- On a phone, the plate starts about 440px down, under the search card.
- Passage cards depend on which articles have been fetched.
- There is no culture data in memory, so none is shown.
- The leader lines are straight, so in a crowded plate one can run behind a caption.
