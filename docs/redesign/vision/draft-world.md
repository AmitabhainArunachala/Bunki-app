# Bunki, the world lens: paper, signal, night

One lens of the 10-08 vision. It answers one part of THE BRIEF: what Bunki looks, moves and feels like on a 390×844 phone. The engine and the journey are other lenses (`draft-engine.md`, `draft-journey.md`); this one assumes them and builds the room they happen in.

Sources: `JOHN_10-08_VERBATIM.md` (V), `bank-look.md` (LOOK), `bank-founding.md` (FOUND), `bank-learning.md` (LEARN), `../research/INSPO.md` (INSPO), and the reference sheets in `../reference/`. His words are quoted exactly, typos kept. Anything not in quotation marks is my design reading, not his.

---

## 0. The claim

He asked for three Japans at once:

> I want to feel a mixture between ancient japan and cutting edge tech japan and cyberpunk beautiufl createve hyper detail oreinted japan. (V msg 1)

and named how they meet:

> cyberpunk meets washi (V msg 5)

The world lens turns that into one rule: **paper is the ground, signal is the instrument, night is the city.** Ancient Japan is the material everything is printed on. Tech Japan is the precision layer drawn on top of it: hairlines, registration, annotation, numerals. Cyberpunk Japan is what that same paper becomes when the light goes out and the city glows through it. No screen is "the ancient screen" or "the cyber screen". Every screen holds all three, in fixed proportions, the way a woodblock print holds a key block, colour blocks and a seal.

This is not a new direction. In August he said "ancient Japan meets anime meets outer space meets obsidian graph meets additive AI study app" (LOOK §1, 08-05, T2) and, in intent, "1600 Japan on a 2335 device" (LOOK §1, 08-20, T3). He chose one electric world, 殻 攻殻・燐光, from the three cyber worlds he was shown, and it was later dropped without a word of his (FOUND §3.2). The cyber stratum this lens builds is that choice coming home, as a layer fused with washi, not as a neon skin.

What today looks like (`../reference/`): a pale washi-blue word sky that he has defended ("the opening page is not the problem. that is cool and intuitive and perfeclty fine", LOOK §12); a shelf of shin-hanga woodblocks he chose; a reader where the picture is a thin strip and the chrome is grey pills; a navy-and-gold card that "feels like two products" beside the cream app (LOOK §4, agent note); a gallery of rooms (`sol-foundation-contacts-01.png`) that are, in his word, the same page again and again. The vibe to keep is the sky, the woodblocks, the Mincho, the 藍. What is missing is relief, line and light.

---

## 1. The three strata

### 1.1 Ancient: the ground (≈70% of every screen)

**Materials.**
- **Washi** (楮紙 kōzo paper). A real scanned fibre texture, not noise. Two scales of fibre (long kōzo strands at ~3% luminance, fine pulp at ~1.5%), so it "survive[s] a phone screenshot" (the August law, LOOK §3). Paper is never flat hex.
- **Sumi** (墨). Ink is the text colour and the key line. It has a body: at display sizes, glyph edges carry a 0.5 px soft bleed into the fibre (an SVG displacement filter baked once into a bitmap mask, not computed live).
- **藍 indigo.** His default world since 08-13 ("藍 ベロ藍・浪 [as default]", LOOK §4). Indigo is the colour of structure: rules, links, the selected state.
- **朱 vermilion.** One red per world (the 08-12 standard). Vermilion means *this, now*: the seal, the target word, the wrong answer.
- **漆 lacquer.** Used as a *frame*, never as a whole page. He rejected the always-lacquer sheet as "too dark, no other theme options, too hard to read" (LOOK §3). Lacquer lives in thin bands: a tab bar, a card edge, the rim of a seal.
- **金箔 gold leaf.** The rarest material. Gold appears only where something was earned or repaired (the kintsugi seam from INSPO §2.2; a word that survives a month). Gold leaf is drawn as a flat field with a tiny, slow specular slide, never as a gradient button.

**Type** (only what is bundled, plus system stacks):
- **Shippori Mincho B1**: the voice of Japanese content. Headlines, reading text, card targets, kanji display. Real weights only, no faux bold.
- **Kaisei Tokumin**: the editorial display face. Room names, article cartouches, the one large word on Today. Its slightly heavier, older cut gives the magazine "pop" he asked for ("like readign a newspaper or magazine!!!", LOOK §11) without a new font.
- **Yuji Syuku**: the hand. Used sparingly, as a human trace: the sensei's marginal note, a hand-written date on a finished article, the label under a seal. Never for UI controls and never pretending to be live brush.
- **System sans** (`-apple-system, "Hiragino Sans", "Noto Sans JP", system-ui`): all chrome in English mode and Japanese mode alike, so buttons are crisp and native.
- **System mono** (`ui-monospace, "SF Mono", Menlo`): the tech stratum's numerals and annotations only, `font-variant-numeric: tabular-nums`.

The type rule that ends "English setting showing japanese buttons" (V msg 1): chrome is in the UI language, always; Japanese in English mode appears only as *content* (words, sentences, kanji) or as a non-interactive room glyph beside an English label.

### 1.2 Tech: the instrument (≈25%)

The precision layer is printing-shop and transit-map discipline, drawn in hairlines over the paper. It is how "the lines cleaner, the details sharper" (V msg 1) becomes real.

**Line.**
- **Hairlines**: 0.5 px at 3× (1.5 device px), in 藍 at 40% or sumi at 25%. Every division between purposes is a hairline, not a grey fill. This is the answer to "it all blends together, no reader knwos what is what!!!" (LOOK §2): relief by line, not by boxes.
- **罫線 (keisen)**: genkō-yōshi and ledger rules. The reader's column has a faint 罫線 grid under the text at 4%, visible only at the margin, the way a manuscript sheet shows its ruling at the edge.
- **Registration marks** (トンボ): small crosshair corner marks on the cards and on the article hero. They say "this was made precisely, for print". On a tap, they snap 2 px inward: the card has been registered.
- **Technical annotation**: tiny mono labels in the margin, Ghost in the Shell HUD and Akira blueprint plate style, but true. `N1 · 財政 · 14画 · seen 3× · last 09-28`. Every annotation is real data from the learner record; a decorative fake coordinate is banned. INSPO §2.9 calls this "data as texture"; the rule here is *data as texture, and only data*.
- **Leader lines**: when a kanji is opened, thin indigo leaders run from each component to its label, exactly like a callout on an Akira mechanical plate. They are drawn, not faded in (§2.3).

**Numerals.** Counts, intervals and dates are mono tabular figures, small, right-aligned on a hairline. "exact numbers delivered quietly" is from the August doctrine (LOOK §1, 08-11, T3).

**Controls.** Physical, two-layer buttons (face plus a 1 px lacquer lip), 2 px travel on press, 120 ms return. This answers "buttons still feel antiquated and not sharp, not crisp or clear" (LOOK §2 #23).

### 1.3 Cyberpunk: the city (≈5% by day, the whole atmosphere by night)

Cyberpunk in this world is a **light source, not a colour scheme**. It is the city glowing *through* the paper, the way a shōji panel shows a street at night.

- **Signal light**: one cyan-teal (`--signal`, close to 浅葱 asagi by day, a phosphor teal by night; the 殻 world's descendant). It marks exactly one thing per screen: the live element (the card being answered, the word being heard, the next stop). One per screen is a hard rule.
- **Glow** is optical, not decorative: ≤6 px blur, ≤25% opacity, only on the signal element and only at night.
- **Kanban edge**: each room's name runs vertically down the right margin in Kaisei Tokumin at 11 px, letter-spaced, like a 縦看板 sign on a building. By day it is printed ink; by night its strokes are lit from behind.
- **Rain and reflection** exist only in the night state of the woodblock heroes: the same print, darkened, with lantern points lit and a 2-layer rain at 3% (INSPO §2.3). The woodblock *becomes* the night city. That is the bridge from Hasui to Ōtomo.

### 1.4 Light: day and night

- **Day = paper in morning light.** Warm white washi, light falling from the upper left. A very soft vignette at the bottom right (2% darker), so the page has a direction. Shadows are paper shadows: two-layer, short, warm (`0 1px 0 ink/6%, 0 6px 18px ink/5%`).
- **Night = the 藍 room with a city glow.** The ground is indigo washi (not black), lit from below-right by a faint teal and vermilion city glow at 4–6%. Text is 胡粉 shell-white at high contrast; the night legibility law stands (small text is lifted, never sunk; LOOK §5). The lacquer frames turn from black-red to deep 藍.
- Night follows the system setting, or the seal. The world (藍, 墨, 赤 …) is his and stays the same in every room (the 08-20 law, "one theme everywhere"); what changes between rooms is material and light *within* that world (§3).

### 1.5 How they meet on one screen without kitsch

Take the reader at 390×844 by day. Paper fills the screen (ancient). The headline is Kaisei Tokumin; the text is Shippori Mincho at 18/2.0 (ancient). A hairline separates the hero from the text; registration marks sit at the hero's corners; a mono line under the title reads `N1 · 1,420字 · 7 min · 未知 12` (tech). One word, the word being read aloud, carries the signal underline (cyberpunk). That is all. Three strata, one each of their strongest gesture, and nothing else.

The proportion rule, from INSPO's warning that "if more than ~1 in 5 elements is 'Japanese-themed ornament', it's costume": **Japanese comes from structure (paper, type, ruling, seal), not stickers; tech comes from truth (real numbers, real lines), not decoration; cyberpunk comes from one light, not from colour.**

### 1.6 Sound and haptics (optional, off by default, one toggle)

- Haptics: a single light tick (`navigator.vibrate(8)` where supported; iOS PWAs mostly ignore it, so nothing depends on it) on grade, on save, on the scroll-wheel detents he asked for ("we want haptic feedback for eery scroll", LOOK §6).
- Sound: three sounds, each ≤150 ms: a wood *tock* (grade), a paper slide (open), a struck bowl (a month-old word kept). Interface sound never plays over a voice.

---

## 2. Motion as a discipline

He asked for "the engaging soothing crisp and eep detialed recrusive animation of masters" (V msg 5) and named the 80s–90s anime directors as the bar (V msg 9). Read as craft, those masters share a grammar: hand-built layers moving at different speeds, frames *held* until they mean something, and cuts that link one context to another. That grammar is buildable with transform and opacity alone.

### 2.1 The rules
- **Only `transform` and `opacity`** animate. No layout, no filter, no blur animation. Pre-render any bleed or glow as a bitmap layer and fade it.
- **Timing tokens**: `tick 90ms` (press), `crisp 160ms` (chrome), `settle 280ms` (sheets, cards), `breath 480ms` (room change), `ink 720ms` (a word becoming a kanji), `ma 240–400ms` (the held pause; §2.2).
- **Easing**: `crisp` = `cubic-bezier(.2,.8,.2,1)`; `settle` = `cubic-bezier(.22,1,.36,1)`; ink draws = `cubic-bezier(.65,0,.35,1)` (fast in the middle, slow at both ends, like a brush entering and leaving paper).
- **Speed** matches his own verdicts: the Drift "a bit too fast" and "erratic and jarring" (LOOK §6) are the two failures. Nothing in chrome is slower than 280 ms; nothing ambient is faster than 6 s per cycle.
- **Reduced motion**: every transition collapses to a 120 ms crossfade; parallax stops; held frames stay (stillness is native to this world); the ink-bleed shows its final frame. Nothing is lost but travel. Ambient motion pauses on `visibilitychange`.
- **Pass test for any screen**: name its one signal, its one 間, its one true annotation. If any is missing or doubled, it is not done.

### 2.2 The five techniques
1. **Hand-layered parallax** (the multiplane camera of Miyazaki, the depth plates of Akira). Each woodblock hero is cut into 3 layers (sky, mid, foreground), drawn once. On scroll they move at 0.2× / 0.5× / 1.0×, capped at 12 px travel. Never a 3D tilt; it is paper sliding over paper.
2. **The held frame** (Dezaki's postcard memories, Oshii's long holds). At the moment of meaning, motion *stops*: the answer is revealed, and for 320 ms nothing moves before the grade row rises. The hold is the reward.
3. **The ink-bleed** (his "only warmed when the ink became a real fluid simulation", LOOK §3). A pre-rendered 12-frame bleed mask, scaled and faded under a glyph as it appears. Used only for target words and new kanji. The full fluid engine stays where it earns its heat (the stroke room, the sky), not on every surface.
4. **The 間 pause.** Between "you were wrong" and "here is why", 240 ms of nothing. Between finishing an article and seeing what you gained, 400 ms of paper with only the seal. Ma is a timed token, not a vibe.
5. **The cel highlight** (the hard-edged sheen on 80s cel paint). On a target word and on gold leaf, a single hard-edged diagonal highlight slides across once (`translateX`, 420 ms) when it first appears. Once only per appearance.

### 2.3 The match-cut: word → kanji → part → passage
Kon Satoshi cut from one reality to another on a shared shape. Bunki's recursion is the same move: the *same glyph* carries you between contexts, so you never feel you changed page.

- **Word → kanji** (720 ms): tap 財政 in a sentence. The two glyphs lift in place (scale 1→1.04, 90 ms), the sentence dims to 30%, then 財 alone slides and scales to display size at the top of a rising sheet. It is the same glyph from the same pixel origin (View Transitions with a shared name; a FLIP fallback).
- **Kanji → part** (480 ms): leader lines draw from 貝 and 才 to their labels (stroke-dashoffset is not allowed, so each leader is a thin bar scaled on X from its origin). The component brightens in signal; the rest of the kanji drops to 40%.
- **Part → family** (480 ms): 貝 slides to the centre and its family (財, 貨, 買, 費, 資 …) fans out on a 罫線 grid, the words the learner has met first in ink, the rest in hairline outline.
- **Back** is the same cut in reverse, landing in the exact sentence, the exact scroll position. "NOTHING DISAPPEARS" (FOUND §3.1, 08-08, T3).

---

## 3. Five rooms, one family

The five tabs are Today 今日 · Read 読む · Learn 学ぶ · Words 辞書 · Me 私. His complaint is double: rooms that "look the same with no differnetiatno" (V msg 1), and a world that must not change scheme when you move ("opened a dictionary paper and the scheme changed completely", LOOK §4). The resolution: **the world (palette) is constant; each room has its own material, light, gesture and motion.** One family, five rooms.

| Room | Material | Light | Signature gesture | Signature motion |
|---|---|---|---|---|
| **Today 今日** | The word sky over thin washi (kept) | Dawn: a slow horizontal light band, cool left to warm right; at night the sky becomes the city seen from above | One verb, one large word, then the sky | Today's due words rise out of the field into a single line, like a train arriving |
| **Read 読む** | Thick kōzo, magazine-weight; woodblock heroes full-bleed | Morning window light from the upper left; night = the print's own lantern-lit night | Tap any word; long-press to save | Hand-layered parallax on the hero; the voice line moves word by word in signal |
| **Learn 学ぶ** | Lacquer frame holding a washi card (the 09-23 "B+A": paper ground, lacquer stage, washi card, LOOK §10) | Stage light: the card is lit, the frame is dark | Answer, hold, grade | The held frame and the 間 pause; the card registers (トンボ snap) on grade |
| **Words 辞書** | Drafting vellum over a 罫線 grid; Akira blueprint plate | Even, shadowless, technical | Open anything into its parts | The match-cut (§2.3); leader lines |
| **Me 私** | A folded orihon book / record ledger of hanko stamps | Late afternoon, low and gold | Turn a page of your own record | Seals stamp in (scale 1.12→1, 160 ms) as the page opens; kintsugi seams close in gold |

### Today 今日
His one defended surface. The sky stays; what it gains is meaning and one clear door. At the top, the date in Kaisei Tokumin and a mono line (`12 due · 1 article · 4 min`). In the centre, the one next thing, set as a single huge word or headline, with one verb under it (Read / Review). Behind, the sky of *his* words: due words brighter, missed ones drifting back, as he asked ("missed answers appear more in … the floating world first drfit page", LEARN spine #10). Night: the sky darkens to 藍 and the words become lit windows of a city seen from above.

### Read 読む
The magazine. Full-bleed woodblock heroes (not a cropped strip), cartouche titles in Kaisei Tokumin, the N-level as a vermilion seal, filters folded behind one hairline control instead of two rows of grey pills. In the article, the hero shrinks with parallax as you scroll and stays as a 64 px band, the woodblock still visible. Text is Mincho 18/2.0 with ruby at 50% and a line gap that never collides. The listening line is the room's signal: the spoken word carries the one cyan underline.

### Learn 学ぶ
The dojo, rebuilt as a stage, not a list. A lacquer proscenium holds one washi card at a time; everything else ("strewn togther", V msg 1) lives behind one door. This also heals the cream-to-navy break: the card is washi in every world, and the lacquer frame takes the world's darkest tone, so it is one product with a stage.

### Words 辞書
The technical plate. Every entry is a blueprint: the kanji large at top, components called out with leaders, readings in mono tables, the family on a grid. This is where the Akira/Ghost in the Shell line lives most clearly, and it is legible because it is drawn on light vellum, not on black.

### Me 私
The record as a crafted object. Days read are hanko stamps in an ichimatsu grid; words that broke and were relearned carry gold seams. The settings sit at the end of the book, plain, with the language switch as the first row.

---

## 4. What each master would demand

These are not endorsements. They are the standards each one would apply, turned into design consequences.

**道元 Dōgen.** Practice and realisation are one act; every act is whole (正法眼蔵). A review is not a means to N1; it is the thing itself. Consequence: no screen is a waiting room. No loading spinners (the enso is drawn only when a session completes); no "almost there" copy; the card that is in front of you gets the whole screen and the whole light. Washing the bowl: the end of a session is a finished, cleared surface, not a scrap pile of stats ("a scrap pile, not a close" was an August verdict, LOOK §8, T3).

**宮本武蔵 Musashi.** "Do nothing which is of no use" (the 五輪書's ninth precept). Consequence: every element must defend its pixels. One signal per screen. No redundant button ("just above the :full entry: button it is redudant", LOOK §8). The grade row is two or four physical pads, nothing beside them. The tab bar is five words. If a hairline does the work of a box, the box goes.

**芭蕉 Bashō.** 不易流行: the unchanging within the ever-changing. Consequence: the frame never moves (the five rooms, the seal, the type), and the content always does (new articles, new contexts, new cards, "if the exact same pattern appears in 28 cards that:s not a good sign", V msg 0). And the haiku cut, 切れ: every screen has one turn, one place where the attention is cut and redirected. On a card, it is the 間 pause before the answer.

**白隠 Hakuin.** The brush, the koan, ferocious compassion; "zen is not softness. Hakuin's stick as much as the still water" (LOOK §1, 08-11, T3). Consequence: being wrong lands. He asked for exactly this: "it needs to be clear, precisse, and crispt and EASILY UNDERSTANABLE, though elegant when an answer is wrong" (LEARN J13). A wrong answer is a single vermilion slash across the card (one 160 ms stroke, a pre-drawn shape scaled on its axis), a held frame, then the why. And Hakuin's own brush is the warning: Yuji Syuku is a hand, not a fake brush; a live brush only where it is real ink.

**大友克洋 Ōtomo.** Hyper-detail at architectural scale, mechanical plates, and the red capsule against concrete. Consequence: the Words room is drawn like a production plate: true callouts, true measurements, small type that rewards a long look. Detail is dense at the margins and absent at the centre. Vermilion as the single saturated object in a grey-indigo field.

**押井守 Oshii.** Stillness, rain, long holds, the HUD that is quiet and exact. Consequence: the held frame (§2.2), the night state of the woodblocks, and annotation that is true and small. The ghost layer: in the reader, words you already own are plain ink and words you do not yet own carry a faint hairline outline. The machine sees what you know; it does not shout it.

**宮崎駿 Miyazaki (and 高畑勲 Takahata).** Weight, air and the hand. Things have mass; wind moves things. Consequence: cards have paper weight (a 280 ms settle with a tiny overshoot of 1.5 px, no bounce); sheets rise from where you touched; the sky moves like air, not like particles. Takahata's lesson: the empty margin of a drawing is part of it. The reader keeps 24 px gutters and a ragged-right column.

**今敏 Kon Satoshi.** The match-cut between realities. Consequence: the word → kanji → part → passage transition (§2.3) is the signature of the whole app. No hard page loads between rooms; every move carries one shared shape across.

**りんたろう Rintaro.** Cosmic scale and the train through the stars (Galaxy Express 999). Consequence: Today's due words arrive as a line, a train of words entering the station; a finished month opens the sky wide, the field pulling back to show every word you have met as a constellation. Used twice a month, never daily.

**川尻善昭 Kawajiri.** Hard light, deep shadow, silhouettes in a single colour. Consequence: the night state is genuinely dark-lit, not grey: deep 藍, one city glow, the seal and the target word lit. And the samurai: the wrong-answer moment he loves ("i LOVE IT!! so creative!!", LEARN J11) is staged as a Kawajiri paper-theatre silhouette, one cut of light, one slash. Whether it shows "blood, or paper theatre" is still his open call (LOOK §6); this lens builds paper theatre and leaves the switch to him.

---

## 5. Anti-patterns

- **Kitsch neon.** Magenta-cyan everywhere, glow on text, rain on every screen. One signal, one room at night, true light only.
- **Sakura wallpaper and costume Japan.** Cherry blossoms, Great Wave tiles, rising-sun rays, geisha, katana cursors, "Konnichiwa!". INSPO Part 5 lists them; this world has none.
- **Fake brush.** Brush fonts for Latin, brush-stroke dividers, SVG "ink" swooshes. Ink is either real (the fluid engine, a scanned stroke) or absent.
- **Glassmorphism soup.** Frosted blur panels stacked on blur. Paper is opaque; layers are separated by hairlines and paper shadow. `backdrop-filter` is permitted once: the tab bar at night.
- **Gamified confetti.** No confetti, no points rain, no owl. A real fact, quietly stated ("you read 1,420 characters of N1 without help"), plus a seal. He said "Gamified is not the right word" (LOOK §1, 08-05).
- **Fake data.** HUD coordinates, hex strings, timestamps that mean nothing. Every annotation is the learner's own record.
- **The grey-pill wall.** Filter rows, tool grids, tip boxes before content. Content first; controls fold.
- **The two-products jump.** A room that changes the world's palette. Material and light change; the world does not.

---

## 6. The tears moments

Each is where beauty and meaning meet: the beauty is earned by something true about the learner.

1. **The kanji unfolds into its life.** In a card, tap 財. It lifts out of the sentence, opens into 貝 and 才 on leader lines, 貝 fans out into its family on the grid, and the last frame is the *article where you first met 財政*, its woodblock hero sliding in behind, your old highlight still there. Then back to the card, the same pixel. The recursion of the language, felt in one gesture.

2. **The word you lost comes home.** A word you failed in September appears in today's sky, slightly brighter. Tap it: it carries you to a new sentence in a new article. When you get it right a month later, the hairline crack beside it in Me closes in gold leaf with a single cel highlight. Failure becomes ornament (INSPO §2.2).

3. **Reading by ear.** You read an N1 article while Kore reads it aloud; the signal underline travels word by word, the hero's lanterns slowly lighting as the paragraphs pass. At the last sentence the voice stops, 400 ms of paper, then a seal stamps: `1,420字 · 未知 3`. The first full article without help is stated once, in Mincho, and never repeated as a badge.

4. **Dusk.** Open Bunki at 18:00 and the woodblock on Read has turned from its day print to its night print, rain on, windows lit; the same place you read this morning, now the city. The ancient print and the cyberpunk city are revealed to be one picture.

5. **The cut.** A wrong answer: one vermilion slash, a held frame, 240 ms of ma, then the precise why in one line, and the correct form inked in. Clear, crisp, elegant, exactly his test. The paper samurai appears only on a streak of misses, as a rare event, so it stays a moment and never becomes a mechanic.

6. **The month opens.** On the first of the month the Today sky pulls back, Rintaro-wide, and shows every word you have met as a lit constellation, the month's new ones drawn in with a train-line connecting the articles they came from. One screen, shareable, no numbers on it but one.

7. **The radical you already knew.** Learning a new kanji, its component lights up and a small mono note says `貝 · known from 7 words`. The family you built shows up uninvited. This is the "compounding each other explontially" (V msg 0) made visible.

8. **Your book.** In Me, turn the pages of your own year: hanko for days read, gold seams for words recovered, woodblock thumbnails of articles finished, the sensei's notes in Yuji Syuku in the margin. It is the one place that is quiet and gold, and it is entirely yours.

---

*This lens is a proposal. The strata, the rooms and the tears moments are my reading of his words; the only places he has ruled are the ones cited.*
