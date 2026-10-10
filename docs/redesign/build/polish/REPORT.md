# Polish lane: the shell, quieted

The lead wrote this from the lane's hand-back, because the lane's Write call was blocked.

Branch `claude/redesign-lane-polish` (cf500067, b8d5f2be, e474d34e), cut at `de88104e` and merged.

## What changed
1. **Top chrome.** It is now one quiet line: `‹ Back` (shown only where back is possible), then a cluster: 藍 seal · `EN 日本語` · search · Learn · bookmark N.
   - **Language switch:** two plain words; the active one is underlined in 朱. Both keep 44px.
   - **`#chrome-dojo`:** now a scholar's-cap icon. Its screen-reader name is the tab's, `Learn` / `学ぶ`. It keeps `aria-current` in the dojo, where it turns 朱.
   - **`#tray`:** a bookmark with its count. The text stays `Lists N` / `覚 N`, kept in a visually hidden `.tray-word`.
   - **Back below 361px:** shows only its chevron.
2. **Report-a-problem.** On tabbed screens it sits in a reserved 54px slot at the end of the tab bar, as a 17px muted glyph, so it never covers room content. Sheets, review and the stroke room keep their positions.
3. **Words.** The plate now starts at about 344px, down from 437px. The hint is hidden while idle and serves as the field's `aria-describedby`.
4. **Read.** The lead woodblock starts at about 334px, down from 378px, through spacing alone.

No verifier was edited, and no pinned id, class or text changed.

## Verifiers (Chromium)
- **Pass:** storage-integrity, foundation, docks (12/12), dojo-door, accessibility, relief, theme-consistency, design-reader-shelf, `lint --core-only` (0 issues), verify-corridor (259/259 on the final run).
- **corridor-doors:** the inherited T13 failure.
- **Lead follow-up:** report-entries R5 waits for '読み探査'.

## Open
- The shelf offers three searches. `#search` is pinned by many verifiers.
- At 320px the reader chrome wraps `#tray` to a second row, as it did before.
