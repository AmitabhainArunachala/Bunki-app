# Migaki: refinement log

## Build 0 (first pass)
- Generated `js/data.js` from real repo data: JMdict subset, KANJIDIC2, KanjiVG strokes, radicals214, the 12 kit cards, the 6 kit articles and the full Ise article tokens. Also curated top-level parts, plus grammar and culture nodes tied to real card and article sentences.
- Built the five rooms, the word sheet, the card stage, the word web (FLIP re-centre), the Me book and the session close, with day and night, EN and JA.
- Shooter crashed: the popup sheet survived a hash route to Learn, so its scrim intercepted clicks. **Fix:** every route change now tears down the popup and stops the voice.

## Round 1 (looked at every shot)
- **Washi was smeared horizontal bands** (anisotropic turbulence) and read as a stain. **Fix:** a generated tile of 70 thin curved kōzo strands with bark flecks (`tools/make-washi.mjs`), at about 30% alpha.
- **The sky words collided with the date and the day's word.** **Fix:** confined the sky to an upper band above the date. Due words sit in two rows there, then fly into the train. Removed the torii (it belongs to the door, not Today).
- **The vertical passage overflowed into the meta column.** **Fix:** two columns, height tuned to 16 characters, meta rebuilt as stacked data rows.
- **Data face:** DejaVu Sans Mono was too wide and clunky. **Fix:** the stack now falls back to Noto Sans Mono CJK on the runner (SF Mono on iPhone).
- **Odd tall bars on the stage.** **Cause:** the progress ticks had class `done`, which collided with the session-close `.done` padding. **Fix:** renamed the close screen to `.closing`.
- **The night Show-answer button lost its signal fill** (the night `.btn` rule outranked `.btn.signal`). **Fix:** `:not(.signal)`.
- **The card back hid its answer below the fold.** **Fix:** the answer now polishes up *above* the passage, and the passage slides down with a FLIP (the togidashi reads better too). Kanji plates went to two columns, and the sibling door moved below the passage. The grade bar is now fixed to the stage foot.
- **Words:** centre label collided with the ring, side nodes were clipped, and the detail headword wrapped vertically. Fixed all three. The ring took the day signal.

## Round 2
- **Words leaders were invisible.** **Cause:** the container class `.edges` collided with Me's book page-edge `.edges` (absolutely positioned 5 px strip). **Fix:** renamed to `.leaders`. The plate now reads as a real technical drawing.
- **Read, Learn and Words had the same 44 px serif title**, a "pages that look the same" risk. **Fix:** Read keeps the newspaper masthead. Learn's title shrinks so the lacquer proscenium is the header. Words' title shrinks so the search field is the header.
- **Night tab bar was translucent** and text showed through. **Fix:** made it opaque.
- **The word sheet gloss could not wrap** (no spaces between items). **Fix:** wrap points added. 反復 now shows "… recursion · iteration", which the concept is about.
- **Shelf had no signal by day.** **Fix:** a Listen pill (the voice is the room's spine) straddles the lead print's edge. Train cars became 44 px doors into the web.
- **The cartouche was too tall and ran into the lead text.** **Fix:** title and subtitle now sit as two vertical columns with the seal under them.
- **The voice mark sat on the first word** (a token-index miss). **Fix:** it is placed on the 13th content word of paragraph 1, and play continues from there.

## Round 3
- **EN purity:** Kanken grades (5級, 準2級) and JMdict parts of speech leaked into EN or JA chrome. **Fix:** added `KK()` (EN shows "8" / "Pre-2") and `POS()` (JA shows 名詞・サ変). The Words source line localises.
- **The calendar was wrong.** 1 Oct 2026 is a Thursday, and 1 Sep a Tuesday. **Fix:** offsets corrected. `<i>` cells rendered italic, so they are now normal. Seals are solid vermilion stamps with an inner paper ring instead of empty boxes.
- **The ritual hid the transit line permanently** (an `!important` beat the animation). **Fix:** gated with `:not(.arrived)`.
- **The kintsugi seam crossed the reading.** **Fix:** moved between the word and the dates.
- **The sky ended in a hard edge.** **Fix:** masked to a fade. Spacing tightened so Begin sits fully above the tab bar.
- Kept the journey to 11 frames, with mid-animation holds on the arrival, the match-cut, the sheet rise and the polish band.
