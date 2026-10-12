# Judge 2: the Tokyo product designer

Lens: typesetting (約物, ruby, 禁則, tategaki), grid, colour discipline, motion, and whether it reads as Japan to Japanese eyes. I judged the full-resolution 390×844 shots.

| | Beauty | Clarity | Engagement | Japan depth | Buildability | Vision fidelity | **Total /60** |
|---|---|---|---|---|---|---|---|
| **A 磨き Migaki** | 8 | 7 | 7 | 8 | 9 | 8 | **47** |
| **B 夜の文机 Night Desk** | 7 | 7 | 6 | 7 | 8 | 7 | **42** |
| **C 生きた本棚 Living Shelf** | 8 | 7 | 9 | 8 | 7 | 8 | **47** |
| **D 白紙 Hakushi** | 8 | 9 | 7 | 9 | 5 | 7 | **45** |

**My pick to build: A 磨き**, with C's engine of wonder grafted in (details at the end). A and C tie; A wins on typesetting, night print and port cost.

## Faults all four share (fix these whatever wins)

1. **Ruby spreads its base text.** Every card back shows 「標　準　語」 and 「習　得」 with gaps, because Chromium widens the base to fit a long reading. A Japanese reader sees broken typesetting. Fix it with per-character mono-ruby (ひょう・じゅん・ご on 標・準・語), or with `ruby-overhang`/jukugo ruby where it is supported,
2. **Ruby is too small.** It sits at about 10.5 CSS px over 17–19 px text. Set ruby to 11 px or more, reading text to 18 px or more, and keep a line-height of at least 2.1 on ruby lines (A's 2.2 is right).
3. **Upright-stacked Latin.** A ("T/O/D/A/Y", "M/E") and D ("T/o/d/a/y", mixed case, the worst) stack Roman letters upright to look like tategaki. In EN, set Latin sideways, as B and C do. In JA, the sign is kanji (今日, 十月八日 as in B-ja).
4. **The mono-caps tic.** "DAY 214 · 12 DUE · 1 STORY" in tracked uppercase monospace is everywhere. It reads as Western techwear. Keep tabular figures, cut tracking to ≤0.04em, and never set kanji in the mono stack (widths jitter in A learn-ja, B today-ja).
5. **Hanko with Latin.** B's done screen stamps a rotated red **DONE** seal, D's popup stamps **KEPT**, and A's Me calendar seals carry Arabic digits. A seal carries a glyph: 了, 済, 覚, or the day's kanji. A Latin word in a 朱 square is the clearest "Japan from abroad" moment here.
6. **Line breaks (分かち書き / 禁則).** C Read 「産霊・自然・反復——伊勢の｜時間」 and D article 「——伊勢｜の時間」 break inside a phrase. Use BudouX or `word-break: auto-phrase` on every Japanese title. B Today starts a line with 「·」 ("· SENTENCE 3/13"), which is a 行頭禁則 failure in either script.

## A 磨き Migaki: 8 / 7 / 7 / 8 / 9 / 8

The most *typeset* concept. The Today hero is a real composition: 研ぐ at about 92 px Shippori with とぐ ruby set vertically to its right, the passage 「包丁を研ぐ職人は…」 in true 縦書き with a correct vertical 「…」, a hairline rule between the columns, and stroke, parts and Kanken data in a left column. The Read cartouche (`read-night`) is a proper 短冊: main title in the right column, 伊勢の時間 as the left sub-column, N1 in a 朱 seal at the foot. Lanterns are lit in the night Ise print; this is the best night state in the four and the nearest any concept gets to Hasui meeting Ōtomo. Today stacks a sky band, a date, the word, a passage, meta, a chip train, a transit line and a button; the concept's own critique admits Musashi would cut. The chip row 推進…しめた runs to the screen edge with no 16 px gutter. A ghost sky word sits behind "Thursday". On `words-night` the leader lines strike through "CONJECTURE" and "ADVANCE", the CULTURE card bleeds past the plate's right edge, and 推薦's gloss truncates to "recommenda…". On `back-day`, "RECALL 87%" orphans "87%" onto its own line. At night the primary buttons are solid phosphor fills (Begin, Listen, Start the sitting). VISION §4 says cyberpunk is "emitted light… never as a fill".

**Graft:** (1) the tategaki passage beside the day's word on Today; (2) the lit-lantern night woodblock with the 短冊 cartouche; (3) the Kaisei Tokumin 再難良易 grade glyphs, plus the togidashi polish-band reveal.
**Worst:** (1) Today is overloaded, with seven stacked strata; (2) the phosphor used as a button fill at night; (3) the leader and label collisions and edge bleed on the Words plate.

## B 夜の文机 Night Desk: 7 / 7 / 6 / 7 / 8 / 7

The idea is the clearest teaching diagram in the set: on Today, 記憶 descends into 記 and 憶, then into 言 己 忄 意 with labels (say, self, heart, idea), drawn as a printed plate with registration marks. The 推/進 card back joins the shared 隹 of both kanji with a light bracket, which is a good, exact moment. B-ja's vertical sign 「今日・十月八日」 in kanji numerals is the only fully correct tategaki date in the set. Elsewhere the craft is weakest. The day screens are uniformly beige plate-on-beige: John's "everything blends" verdict would land again. On `back-day` the grade dock sits directly over the passage with no scrim, and the translucent tab bar shows ghost text ("ONE PART") through it. On `words-night` the context callout runs off the right edge, and 「…もきた。」 collides with the 〜わけではない node. The 文机 promise never becomes a material: no wood, no desk edge, no lamp falloff on paper.

**Graft:** (1) the word → kanji → parts descent plate on Today (better pedagogy than any sky); (2) the light bracket on a shared part on the card back; (3) the kanji-numeral vertical date sign in JA.
**Worst:** (1) day mode is flat beige, with weak room identity by thumbnail; (2) the grade dock and tab bar overlap text with no scrim; (3) the "DONE" Latin hanko.

## C 生きた本棚 Living Shelf: 8 / 7 / 9 / 8 / 7 / 8

The most *alive* concept, and the one that best answers "keep the vibe". The word sky is kept and given a job. Today centres 推進 in heavy Mincho over the learner's words, each due word dotted in 朱. One sentence of wonder follows: "A small bird, 隹, hides inside both kanji." Then one verb. A Hakuin line. The Words plate (`words-night`) is the richest in the set: 隹 at the apex, 扌 and 辶 at the corners, siblings in a ring, real card sentences as side nodes, a legend, and a data table with exact strokes (22) and the shared part. The Read shelf of standing spines, with heights from real lengths and vertical titles, is a genuinely Japanese object. Problems: about 80 sky words is noise. The 朱 dots *under* the words read like misplaced 傍点, which go above (yokogaki) or to the right (tategaki). The spines are cut by the tab bar at 390 px, so 「都市の」 and 「造化三神」 are clipped mid-glyph, and the AI時代 spine image is a half-blank tile. The Read title breaks as 「伊勢の｜時間」. In JA the spine 「今日 10·08」 sets Arabic digits sideways inside a vertical label; use 縦中横 or kanji. The card back's corner-bracket marks 「研ぐ」 collide with the ruby above them.

**Graft:** (1) the one-sentence hook plus single verb ("A small bird hides inside both kanji · Follow the bird"); (2) the spine shelf on Read, below the hero; (3) the Words plate structure (parts at the corners, siblings in a ring, side nodes from real cards, legend, data table) and the "The surface is clear." session end.
**Worst:** (1) sky density and the 傍点 placement; (2) shelf spines clipped at the fold and a broken spine image; (3) title wrapping and 縦中横 errors.

## D 白紙 Hakushi: 8 / 9 / 7 / 9 / 5 / 7

The most authentically Japanese *system*, and the clearest to use. 推 and 進 sit in 田字格 practice squares with stroke counts and すいしん vertical beside them;, which every Japanese child knows. Today is a JR-style timetable. The nav is a line with five stations, and 縦看板 hanging signs mark each room. Words is an orthogonal circuit plate: four parts on top, two kanji, the word in a double frame, readings on every sibling, and GRAMMAR and CULTURE terminals. The most legible web in the set. The Read cartouche over the rain print is excellent. But the hanging sign is set as "T o d a y" in mixed-case upright Latin, which undoes the 看板 in EN. The station-nav "38" badge sits on the track like a strikethrough ("–38"). Dotted leaders cross "hand" and "walk, road". It drops the sky and is the hardest to port.

**Graft:** (1) the 田字格 squares for the day's word and kanji tiles; (2) the orthogonal circuit layout for the night Words plate, with readings on every sibling node; (3) 縦看板 room signs in JA (kanji, lit at night), plus the timetable "Today's line" with per-stop minutes.
**Worst:** (1) upright mixed-case Latin signs; (2) the station nav is novel but costs clarity, and its badge collides with the track; (3) it loses the sky and the warm ground, so its fidelity to "keep the vibe" is low.

## The pick: build A 磨き, and graft these

A has the best-set type, the truest night, real 短冊 and tategaki, and the cleanest token port. Its two failures (too much on Today, too little wonder) are fixable by grafts:

1. **Today, rebuilt by subtraction (from C and B).** Keep A's tategaki hero (word + vertical passage). Replace the meta column and chip train with C's one-sentence hook and single verb. Put B's descent plate (word → kanji → parts) behind that verb, as the first frame of the walk, not on Today itself. Cap the sky at the learner's own words (at most 40, C's own fix) and confine it to the top band.
2. **Read:** keep A's lantern-lit cartouche hero. Below the fold, use C's spine shelf instead of the thumbnail list, with spines fully visible at 390 px, titles phrase-wrapped, and kanji-numeral counts.
3. **Words:** D's orthogonal circuit for structure (no crossings, labels never struck through), C's ring of siblings and real-card side nodes, A's KanjiVG stroke writing and match-cut walk 研ぐ→研→石→磨. Add D's 田字格 tiles for single kanji.
4. **Learn:** A's stage and togidashi reveal, B's light bracket on the shared part, A's 再難良易 pads, with a solid scrim under the dock. The session end uses C's "The surface is clear.", with a seal that carries a glyph (了 or the day's kanji), never "DONE" or "KEPT".
5. **Night colour discipline:** the phosphor is light, not fill. Primary buttons at night become cream washi with a phosphor rim and a glow (B and C already do this). Exactly one emitted element per screen.
6. **Typesetting pass across the whole app:** mono-ruby or overhang ruby at 11 px or more; BudouX phrase breaking on all Japanese headings; 行頭/行末禁則 for 「·」 and 「—」; EN vertical signs set sideways, JA signs in kanji with 縦中横 or kanji numerals; tracked caps cut to 0.04em or less; no mono stack on kanji; 傍点 above or to the right only; a 16 px gutter on every row (A's chip train).
7. **Me:** A's ledger; seals carry the day's kanji; C's dated "came home" kintsugi lines.

If John weights "ALIVE" above all, C is the alternative base (graft A's night print, tategaki and grade glyphs, accept a heavier port).
