# Living Shelf: refinement log

## Build 0 (first pass)
- Generated `js/data.js` from real data only (`tools/gen-data.py`):
  - 2,000 deck words;
  - 1,220 kanji (KANJIDIC2/KanjiVG-derived);
  - 642 parts;
  - KanjiVG strokes;
  - passages found in other cards.
- Found the concept's hook in that data: 推, 進 and 権 all carry 隹 (the short-tailed bird). That made 推進 the day's word.
- Built nine routes, five rooms with their own materials, the tab bar, the spine labels, EN/JA and day/night.

## Round 1: what the first shots showed, and the fixes
- **Today.** The sky ended in a hard band at 470 px. Sky words collided with "Today's word" because the avoidance boxes were guessed. **Fix:** the sky is full-height, and words are placed after render against the measured rects of the title, spine and day word. I added a roof horizon that lights up at night (the city through the paper), plus the reading and "Follow the bird" as one verb.
- **Article.** 落ちる broke into "落 … ちる" across a full line, with "。" starting the next line. Cause: a class collision (`.deck` from Learn made the token `display:grid`). **Fix:** renamed the class to `.known`, made tokens inline-block, and grouped closing punctuation with the word before it (kinsoku). I also added a ground backing under the sticky voice bar, so ruby no longer peeks out below it.
- **Read.** Spines were 170 px wide because the image's intrinsic width won. **Fix:** fixed widths and `min-width:0`. I also fixed the copy: 反復 is in the Fields deck, not tonight's cards.
- **Words.** Leaders crossed the centre glyph; side chips ran off the plate edges; siblings overlapped; marks were truncated. **Fixes:**
  - leaders now start at the ring edge (r 72);
  - nodes are clamped to the plate;
  - siblings sit on alternating radii;
  - the 3×2 data-mark grid holds 6 real marks.
- **Global.** Spine labels reached into heroes. **Fix:** capped them at 150 px with compact data.
- **Brief update** (VISION §3/§4, checks 22–25). **Fix:** added `#/learn/done`, a cleared surface, a tally, the words rising, and one next door ("Read it now") with tomorrow half-shown. I listed at least 3 micro-responses per room in SPEC.

## Round 2
- The Learn card back's progress ticks rendered as blocks (`.done` collided with the new session-end room). **Fix:** renamed it to `.finish`.
- The session-end rising words overlapped each other and the tally. **Fix:** a deterministic 3-column grid in a bounded band.
- The front card had a dead lower third. **Fix:** a quiet data foot (chars, source, times seen), removed on reveal.
- KanjiVG lists sub-components (隹 ⊃ 亻), so 推 showed a spurious "person". **Fix:** dropped any part already contained in another listed part (推 = 扌+隹, 復 = 彳+复).
- **Me.** The hanko grid was a wall of vermilion blocks that broke "one signal". **Fix:** small rotated seal outlines with a centre dot, fixed 18 px cells, and the signal reserved for today's cell. I moved "Came home" (the signature) above the fold.
- Spine titles wrapped into three columns. **Fix:** one tategaki column with ellipsis.
- Night: kanji nodes got an opaque blueprint fill, so wires no longer show through the glyph.

## Round 3: motion
- The re-centring frame was blank mid-cut. The whole room re-rendered with an entrance fade, and the chosen glyph was hidden. **Fix:** `recentre()` now swaps only the plate, trail and entry, and the room never blinks. The chosen node keeps its glyph and drops its box, so the flying glyph is visible.
- The Today → web match-cut clone was invisible because the cloned spans restarted their ink-in animation from opacity 0. **Fix:** clones carry `animation:none`.
- Kun readings now show as お(す), not KANJIDIC's お.す.

## Still open (see SPEC self-critique)
- Sky density for beginners.
- Paging for very large part families.
- Real night prints.
- Premium preview and paywall.
- Sound and haptics.
