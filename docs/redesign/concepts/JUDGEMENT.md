# Judgement: four concepts, four judges

The four judges each looked at every concept's day and night contact sheets, its motion frames, full-resolution screens and SPEC. Their full write-ups are in `judges/`:

1. `1-john.md`: John's lens, from his 431 quotes since August.
2. `2-tokyo-designer.md`: a top Tokyo product designer.
3. `3-growth-learning.md`: a growth and learning-science lead.
4. `4-bar-panel.md`: THE BAR panel, 道元 · 宮本武蔵 · 芭蕉 · 白隠 · 大友克洋 · 押井守 · 宮崎駿 · 今敏.

Each judge scored each concept 0–10 on six axes: beauty, clarity, engagement, Japan depth, buildability and fidelity to VISION.md.

## Scores (total out of 60, per judge)

| Concept | John | Tokyo designer | Growth & learning | BAR panel | **Sum /240** | Picks |
|---|---|---|---|---|---|---|
| A 磨き Migaki | 46.5 | 47 | 47 | 47 | **187.5** | designer, panel |
| B 夜の文机 Night Desk | 45 | 42 | 46 | 40 | **173** | – |
| **C 生きた本棚 Living Shelf** | **49.5** | 47 | **49** | 46 | **191.5** | **John, growth** |
| D 白紙 Hakushi | 41 | 45 | 39 | 38 | **163** | – (from scratch) |

## The choice: build **C 生きた本棚 Living Shelf**, polished with A's craft

C wins on the sum and on two picks, and ties A with the designer. A and C are close, and the judges explain why:

- **C is the only concept that keeps the word sky he defended and makes it the Today room** ("keep the vibe but upgrade it 1200000%"). Its signature puts the recursion of the language on the first screen: 推進 → "A small bird, 隹, hides inside both kanji" → the bird's 40-kanji family, 21 already yours. Every judge named it the best single moment, the most shareable, and the one most likely to bring tears.
- **C has the strongest daily loop and session close.** Today reads as a clear line: 12 cards · 1 article · 1 question. The session ends with "The surface is clear.", the lost words return "in ten minutes, in new sentences", and one next door is offered.
- **A has the better craft:** typesetting, the only truly lit night print, the Me book (gold seams, seal calendar, a line copied by hand), and the cheapest port. So the build takes C's structure and life and **A's polish**.

## Grafts into the build

| From | What | Why (judge) |
|---|---|---|
| A | Typesetting discipline, the night woodblock (lanterns lit, rain), the Me book (gold "mended" seams, seal calendar, the copied line), the localised Kanken/part-of-speech labels in EN and JA | designer, panel, John |
| A | The "togidashi" polish reveal on the card back: a band crosses the card and the readings appear where it passes | John, panel |
| B | Light that traces meaning: the day's word → its kanji → their parts; the bracket of light joining a shared part (隹) on the card back; the voiced scan-line in the reader; "Resume at sentence N" | all four |
| B | Night Words as a phosphor plate | John |
| D | The five-station tab bar ("the Line"), with the due count on Today | John, panel |
| D | "Today's line": 3 stops, honest minutes | John, growth |
| D | 田字格 practice squares behind the day's word; the night skyline of lit windows; "characters read unaided" as Me's lead figure | designer, panel, growth |
| C (own fix) | The shelf: keep the living spines, but full titles must also be readable (no titles cut mid-phrase) | John, designer |

## Fixes required whatever won

These are build gates.

1. **The word of the day must never be a card due today.** All four concepts leaked an answer before review. The deep dive into the day's word comes *after* the cards, as the reward. (growth)
2. **Every kanji part comes from real data.** D listed 亻 in 推, 進 and 復. No hand-picked parts. (panel)
3. **Honest numbers:** grade intervals come from the real FSRS scheduler; time estimates come from real timings, not fixed per-card guesses; no sample learner data in the real app. (growth, panel)
4. **Ruby:** at least 11px; base text must not be stretched under long readings where avoidable (標　準　語). (designer)
5. **Vertical room signs:** Latin letters are never stacked upright. In EN, rotate the word or set it horizontally; in JA, use kanji 縦看板. (designer)
6. **Seals carry a glyph,** never Latin words (DONE, KEPT). (designer)
7. **Night primaries:** light is emitted (an edge, a glow) and never a solid phosphor fill (VISION §4). (designer)
8. **Japanese titles never break mid-phrase,** and no line starts with forbidden 約物 (禁則). (designer)
9. **Four grade buttons stay.** The growth judge suggested two by default, but four honest buttons are a behavioural pin in the real app's verifiers and part of the FSRS contract. Recorded as an open question for John.
10. **The wrong-answer samurai** that John asked for repeatedly appears in no concept. The build keeps the existing samurai moments. A vermilion slash on Again is the agreed graft, and his open question (paper or blood) stays open.

## 白紙 Hakushi

The fresh-eyed design judges respected it, with the best clarity (9 from the designer). It also breaks "not from scratch though!" (message 3) and would need a near-total rebuild. It stays as a full standalone prototype in its own draft PR, so John can compare, as he asked ("show me both").

## Not designed in any concept (open work, recorded for the PR)

- A first-day experience (the growth judge proposes a 90-second flow).
- A premium preview and paywall, shown with taste.
- Share frames.
- Real audio wired into every card.
