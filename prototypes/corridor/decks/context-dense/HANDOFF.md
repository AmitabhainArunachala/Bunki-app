# Context deck — start here

The deck is already on `origin/main`. A local `main` from before 2026-10-01 will not have it.

```bash
git fetch origin main
git checkout -B context-deck origin/main
```

Open the phone page (no local server):

https://amitabhainarunachala.github.io/Bunki-app/decks/context-dense/standalone.html

Files for a visual redo. Edit these two only unless the cards themselves must change:

- `prototypes/corridor/decks/context-dense/mount.js`
- `prototypes/corridor/decks/context-dense/context-deck.css`

Cards, scheduler, and tests:

- `deck.json` — the 323 cards the page loads
- `engine.js` — FSRS, cloze position, validation
- `engine.test.js` — must stay green
- `cards/` — authored paragraphs

Merged PRs: #105, #106, #107.
Branch that carried the work: `cursor/context-dense-srs-deck-15c1`.
