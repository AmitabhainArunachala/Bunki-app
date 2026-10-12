# D 白紙 Hakushi: Bunki from scratch

This is Track B of the 10-08 redesign, the "from scratch" comparison ("heck, if you need ot rewrite it from scratch you can do that but show me both"). It keeps only the energy and the content: the real cards, articles, woodblock pictures, decks, the five destinations and the learning loop. Everything else is new: layout, navigation, type, colour, interaction and motion.

The prototype is self-contained: vanilla HTML, CSS and JS modules, with no build step, no CDN and no network requests outside the repo.

## Open it

The page must be served from the **repo root**, because it links `/prototypes/corridor/fonts.css` and the real pictures in `/prototypes/corridor/data/articles/pictures/`.

```sh
cd /home/user/Bunki-app            # repo root
python3 -m http.server 8000        # or any static server
# then open, at phone width (390×844 in devtools):
http://localhost:8000/docs/redesign/concepts/d-hakushi/index.html#/today
```

| Route | Screen |
|---|---|
| `#/today` | Today: the day's word and today's line |
| `#/read` | Read: the shelf |
| `#/read/article` | An open article with furigana and the voice line |
| `#/read/popup` | The same article with the word slip open on 反復 |
| `#/learn` | Learn: cards, focus, tests and guided, one row each |
| `#/learn/front` | A card front (inert, with no readings and no English) |
| `#/learn/back` | The card back: readings, definition, anatomy and grades |
| `#/words` or `#/words/<word, kanji or part>` | The word web, e.g. `#/words/進` or `#/words/隹` |
| `#/me` | Me: your year, four horizons, words mended in gold, settings |

URL switches:

- `?theme=night` gives the night state.
- `?lang=ja` gives Japanese chrome.
- `?still` turns motion off for static captures.

You can combine them, e.g. `index.html?lang=ja&theme=night#/learn/back`. Me → Settings also switches them.

## Evidence

- `shots/*-day.png`, `shots/*-night.png`, `shots/sheet-day.png`, `shots/sheet-night.png`: every screen at 390×844 @2x.
- `motion/journey.webm` and `motion-frames.png`: the recorded journey (Today → day's word → web → 進 → 隹 → Read → article → 反復 → Keep → Learn → front → reveal).
- To re-shoot: `PLAYWRIGHT_BROWSERS_PATH=/root/pw node docs/redesign/concepts/_kit/shoot.mjs docs/redesign/concepts/d-hakushi`

## Files

- `index.html`: the shell
- `css/tokens.css`: Tokens v2, day and night, plus per-room material
- `css/base.css`: the shared pieces: the plate, the hanging sign, the Line, controls and registration marks
- `css/rooms/*.css` and `css/slip.css`: one stylesheet per room, plus the word slip
- `js/app.js`: router, the Line, and the multiplane room change
- `js/ui.js`: `el()`, ruby, springs and the match-cut
- `js/i18n.js`: every chrome string in EN and JA
- `js/data.js`: data loading, the demo learner record, component glosses and notes
- `js/slip.js`: the one word slip
- `js/rooms/*.js`: one module per room
- `data/index.json` and `data/articles.json`: generated from the real decks and articles by `tools/build-index.mjs` (run it from the repo root)

Design and build notes are in `SPEC.md`; the refinement log is in `NOTES.md`.
