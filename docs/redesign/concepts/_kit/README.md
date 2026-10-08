# Concept kit (shared by all four concepts)

- `content.json`: real content for the prototypes: 12 cards (4 each from N1, N2 and 専門, with passage, ruby, kanji parts) and 6 articles (title, paragraphs, tokens with readings, picture path).
  - Pictures live at `/prototypes/corridor/data/articles/pictures/<id>.webp` (and `-600.webp`).
  - The full decks: `/prototypes/corridor/decks/{n1,n2,senmon}/deck.json`.
- `shoot.mjs`: serves the **repo root** statically, then takes screenshots (day and night, 390×844 @2x), contact sheets, a recorded motion journey (`motion/journey.webm`) and the frame contact sheet `motion-frames.png`. See the header for the `shots.json` format.
  - Run: `PLAYWRIGHT_BROWSERS_PATH=/root/pw node docs/redesign/concepts/_kit/shoot.mjs docs/redesign/concepts/<key>`.

## Fonts: the facts that matter
`/prototypes/corridor/fonts.css` bundles exactly these:
- **Shippori Mincho B1**, weight **800 only**: the display and ink face.
- **Yuji Syuku**, 400: brush-like, for the occasional human note.
- **Kaisei Tokumin**, 800: **four glyphs only** (再 易 良 難, the grade buttons). It is not a general face.

Everything else uses the system stacks:
- serif: `"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif CJK JP", serif`
- sans: `-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans CJK JP", sans-serif`

This Linux runner has Noto Serif and Sans CJK JP installed as stand-ins for the iPhone's Hiragino, so the screenshots are close to an iPhone, not identical.
