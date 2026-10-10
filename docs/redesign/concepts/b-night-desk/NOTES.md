# Night Desk: refinement log

## Build 1
- Generated `js/data.js` from real repo data: the AI essay's full tokens and sentence cues, its audio paths, glosses, kanji and radicals, deck sizes and the kit cards. Chose the AI essay because its woodblock is literally a lamp-lit desk by a window and the essay is about memory. That chose 記憶 as the day's word. Its web reaches 推進's card passage (土地の記憶), 〜わけではない (in two articles) and 古事記 (記 = record), each verified in the texts.
- Built five rooms, the card front, back and session end, the sheet, the FLIP web and the Me ledger. Night uses lamp, city and rain layers, a lit kanban and a phosphor plate.

## Round 1 (after the first shoot)
- Today: the headword wrapped into a column, the traces crossed the strokes, and the route and button fell below the fold. Fixes: `nowrap`, display 76 px, a tighter plate, traces leave from the meaning label rather than the box, the HUD shortened, and global HUD tracking cut from .07 to .035em (the DejaVu mono ran far too wide).
- Card back: the answer sat below a 13-line passage, so a screenshot showed no answer. Restructured it with an answer band above the card (term, reading, defJa, the two kanji with parts) and the shared-part bracket drawn in light under 隹. The passage drops to 17.5 px.
- Fixed literal "null" nodes (native `append(null)`) in the card room and the web detail.
- The settings segment no longer uses primary styling (one primary per screen).
- Applied the lead's VISION update (§3 alive, §4 cyber, checks 22–25):
  - a mono data face;
  - New today on the shelf;
  - a tomorrow peek on Today and the session-end Next door (the pull);
  - a haptic tick on grade;
  - the micro-response list in SPEC.

## Round 2
- The article now opens on the print and then glides to the remembered line ("back to the exact line"). The screenshot keeps the hero; the journey shows the glide.
- EN purity: Kanken levels read "Kanken 9" in EN instead of 9級. JA purity: the part labels (say/self/heart/idea) were English in JA mode; they now show the radical's Japanese name (げん, おのれ, こころ). The English meaning row is hidden in JA. "Bunki 書き下ろし" became 書き下ろし.
- Me: moved the kintsugi seams above the calendar so the signature is above the fold, and added right padding so the kanban doesn't touch the numbers.
- JA kanban made smaller, and the Today plate given a right margin for it.

## Round 3
- A headless lint over 14 routes × 2 languages found 0 EN-chrome kana/kanji and 0 JA-chrome English after wrapping learned glyphs in `lang=ja` (the 隹 in "shared part", 記 in the 古事記 gloss).
- Target sizes: card kanji went 40 → 44 and crumbs to a 44 minimum. The passage door keeps inline text size with a `::after` hit extension.
- Grep check: transitions and keyframes animate only transform and opacity; every ambient loop is ≥6 s.

## Open
- See SPEC self-critique: a day window on Today, a second ring on the web, and the grade dock overlapping the passage.
