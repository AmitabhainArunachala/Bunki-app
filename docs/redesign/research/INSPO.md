# Bunki redesign: inspiration research (2026-10-08)

Brief in one line: ancient Japan x cutting-edge tech Japan x hyper-detailed cyberpunk Japan, quick, punchy, clean, one clear way through, no two rooms alike, no weeb.
Evidence labels: [WEB] = from this session's web searches (sources at the end); [KNOW] = my own knowledge, not re-verified today; hex values are starting points, check them on screen.

---
## PART 1. Language-app research

### 1.1 What the best apps do (and the lesson for Bunki)

| App | Engagement mechanism | Why it works | What it gets wrong | Steal for Bunki |
|---|---|---|---|---|
| Duolingo | Streak (loss aversion; a long streak becomes identity), leagues, quests, mascot, first lesson BEFORE signup, fake "building your course" screen [WEB] | Value in under 60 s; commitment before account | Retention over learning: people keep 1,000-day streaks with little language; burnout; dark patterns (pushy reminders, energy paywall) [WEB] | First-lesson-before-anything. A streak that is a *record of reading*, not a debt. No guilt notifications, no energy meter. |
| Satori Reader | Graded stories, tap-any-word furigana/grammar notes, audio, same vocabulary recurring across stories [WEB] | Repetition feels like familiarity, not drilling | Limited once you want native text; modest visual world [WEB] | The reader is the heart. Bunki already has reader + woodblocks: make it the best-looking reading surface in the genre. |
| WaniKani | Radical -> kanji -> vocab path, mnemonics, level-ups, a visible ladder [WEB] | Strong sense of progress and guardrails | Review pile-ups (the "queue of dread"), rigid, kanji only [KNOW] | A visible ladder that unlocks, but with a capped daily pile and a "pause without penalty". |
| Bunpro | Grammar points with sentence SRS, JLPT-ordered [WEB] | Clear syllabus; usage-focused | Dense, text-heavy, spreadsheet feel [KNOW] | Grammar shown as pattern-in-context cards, one point per screen. |
| Renshuu | Flexible, broad (vocab/kanji/grammar/games), light-to-heavy modes [WEB] | Adapts to busy days | Breadth = drift into "pleasant distractions"; dated UI [WEB] | Keep ONE recommended next action on home; hide the rest behind a door. |
| Migaku | Native video/web: one-tap lookups, save to cards [WEB] | Speed of lookup; real content | Setup discipline; tool-like, not a place [WEB] | One-tap popup (already shipped) must be instant, <100 ms, with a gentle spring. |
| Clozemaster | Cloze sentences at volume, score/streak/leaderboards [WEB] | Huge volume fast | Home page overload (timeline+score+streak+rank) that users ignore [WEB] | Anti-lesson: one number, one verb, per screen. |
| LingQ / Kanji Study / Anki | LingQ: import anything, count "known words"; Kanji Study: stroke order + clean iOS feel; Anki: the SRS floor [KNOW] | Ownership of content; craft; reliability | LingQ cluttered; Anki ugly and joyless [KNOW] | Known-words count as a hero number; stroke-order animation as a ritual; Anki-grade scheduling hidden under beauty. |

### 1.2 Cross-cutting engagement principles that are not cheap
1. **Value before commitment.** First meaningful read/card in seconds, no account wall. [WEB]
2. **One next action.** The home screen answers "what do I do now?" with a single large, obvious thing, and everything else is one tap away.
3. **Progress you can see and love, not just a bar.** Make progress a place that grows (a map, a garden of 家紋, a night-city skyline filling with lit windows, a scroll that unrolls). Cheap = points and confetti. Not cheap = your own world visibly accrues.
4. **Streak as record, not threat.** Show "days read" like a pressed-flower calendar or hanko-stamp grid. Offer a quiet "rest day" token. Never shame.
5. **Variable, honest reward.** A satisfying sound/haptic and a tiny visual bloom on correct answers; occasional "you just read a whole page of N2 without help" moments grounded in a real fact. [KNOW] (Rewards tied to true achievements avoid streak-creep.) [WEB: streak creep]
6. **Micro-interactions carry personality**: word chips settle with a spring, kanji ink-in on reveal, card flips with paper weight.
7. **Learning > retention.** Measure "words you can now read in a real article", not minutes in app.

### 1.3 What the competition gets wrong that Bunki can win on
- Apps are either toy (Duolingo) or tool (Anki/Migaku/Bunpro). None is a *place* with atmosphere and a point of view. Bunki can be the first beautiful, adult one.
- Navigation bloat: many entry points, same-looking list screens. Bunki fix: five rooms, each with its own colour, texture, layout grammar.
- Mixed language UI (his explicit complaint). Rule: UI language setting is absolute. English mode = English labels, Japanese appears only as *content* or as small decorative kanji labels with an English label always present. Japanese mode = fully Japanese chrome. Never a mix by accident.

---
## PART 2. Visual culture synthesis

Design thesis: **"The paper lantern city."** Washi, sumi and woodblock at the base (calm, warm, textured, empty on purpose), with a thin, precise layer of signage-grade tech (hairlines, tiny mono numerals, vermilion and cyan signal accents, transit-map logic) on top. Ancient = ground. Tech = signal. Cyberpunk = night mode and the detail layer, never the default shout.

### 2.1 間 (ma) and 余白 (yohaku) / Kenya Hara's emptiness / Muji
- Concept: Hara distinguishes simplicity (removes to clarify) from emptiness (removes to *invite*). White space is part of function. [WEB]
- Use: one idea per screen; 24-32 px gutters, 48-64 px between sections; hero element gets at least 40% empty space around it.
- Colour: paper white `#FBFAF5` (生成り) / `#F5F0E8` washi [WEB: shironeri]; ink `#2C2C2C` (墨) [WEB].
- Motion: slow, low-amplitude. 240-360 ms ease-out; things arrive like breath, not bounce.
- Where: home (one verb), reader (generous margins and leading), card front (one word, huge, centred), empty states (a single stroke/kamon + one line).
- Muji lesson: no-brand confidence. Few type sizes, no ornaments for ornament's sake, one accent per screen.

### 2.2 侘寂 wabi-sabi and 金継ぎ kintsugi
- Imperfection as beauty; repair made visible with gold. 
- Use for **errors and lapses**: a missed day or wrong card is shown as a hairline crack that gets *gold-filled* when you re-learn it (SVG path, `#C9A227` -> `#E6B422`). Re-learning a leech word = kintsugi animation. This is the app's emotional signature: failure becomes ornament.
- Textures: subtle paper grain (2-3% noise), slight tonal unevenness in card surfaces. Not skeuomorphic wood or torn paper.
- Where: Review mistakes list, "weak words" shelf (a shelf of cracked bowls that gold-fill as they strengthen), lapse recovery on home.

### 2.3 Shin-hanga and ukiyo-e (KEEP the article woodblocks)
- Traits: flat colour fields, bold key line, gradient bokashi skies, tiny cartouche titles, margin whitespace; Hasui/Yoshida night scenes, rain, lantern reflection.
- Palette: Prussian/ai blue `#165E83` [KNOW 藍色], sky bokashi `#BFD8E0 -> #F3E3C3`, vermilion seal `#C8161D`, ochre `#C79A3A`, pine `#316745`.
- Use: article hero images stay. Add a *consistent frame treatment*: thin key-line border, cartouche (a small tag in the corner with the article title in Mincho, vertical if short), image bleeds to the card edge, with soft bokashi gradient fade into the page.
- Use woodblock night-rain scenes as the **dark-mode atmosphere**: the same print, darkened, lantern accents lit. This connects ancient to neon.
- Motion: parallax of 2-3 layers (sky, mid, foreground) at 8-12 px on scroll/tilt; rain streaks at 3% opacity in dark mode only.

### 2.4 家紋 kamon (crests)
- Circular monochrome emblems, one colour, geometric, scalable; they are logos with 1,000 years of heritage.
- Use as **the app's identity system and progress system**: each room has a kamon (shelf = 藤 wisteria or 本, dojo = 桔梗 or crossed-swords-free geometric like 三つ巴, tests = 雷/稲妻 or 桐, collections = 菊/梅鉢). Level-up = unlock a new crest; the personal crest on profile is assembled from your milestones.
- Draw as 1.5 px strokes in a 64x64 grid so they read at 24 px and at 240 px. Fill with ink or vermilion only.
- Avoid: using real clan crests of living families or the Tokugawa aoi, the Imperial chrysanthemum (十六八重表菊 is legally/culturally loaded). Invent original geometric crests in the kamon grammar.

### 2.5 和柄 wagara patterns
| Pattern | What it is | Use in Bunki |
|---|---|---|
| 麻の葉 asanoha | hemp-leaf six-point star lattice | Background of "growth" surfaces: new-learner onboarding, level-up sheet. Auto-tile as SVG at 4-6% opacity. |
| 青海波 seigaiha | concentric waves | Progress: wave fill rising for "today's goal". Section divider. Home hero ground in blue. |
| 七宝 shippō | interlocking circles ("seven treasures") | "Connections" (word families, related words); circles overlap to show relationships, ties to the recursive theme. |
| 市松 ichimatsu | checkerboard | Calendar/streak grid; tests answer sheets; hover/pressed states. Subtle two-tone `#EFE8D8 / #F7F2E6`. |
| 亀甲 kikkō, 鱗 uroko | hexagon turtle shell, triangles | Dark/tech mode: reads as circuit hex-grid. Perfect bridge to cyberpunk. |
| 立涌 tatewaku | rising wavy lines | Vertical dividers; "rising" animations. |
- Colour tip: patterns never above 8% opacity behind text. Pattern is atmosphere, not decoration on buttons.
- The recursive idea: seigaiha, asanoha, shippō all tile themselves; pattern-in-pattern. Use the *same pattern at three scales* in one screen to state "recursion".

### 2.6 Sumi-e and brush
- Ink wash gradient, one stroke, enso circle, dry-brush edge.
- Use: the **enso** as the loading and "session complete" ring (stroke-dasharray animation, imperfect gap at the end). Kanji stroke-order animation (KanjiVG data, CC BY-SA, attribute) drawn with a tapered brush stroke. Section headers get a single brush underline.
- Colours: `#1B1B1B` ink with 8-90% alpha steps for wash; paper `#FBFAF5`.
- Motion: 400-700 ms path draw with ease-in-out; velocity varies (fast in, slow out) to feel like a brush.

### 2.7 Japanese typography
- **Pairing**: Mincho for literature/reading/headlines (Noto Serif JP / Shippori Mincho / Zen Old Mincho [WEB: Zen Old Mincho on GitHub]); Gothic/sans for UI (Noto Sans JP / Zen Kaku Gothic New / BIZ UDPGothic). Keep Latin in a matched face: Newsreader or Source Serif for Latin serif, Inter/Geist for UI, JetBrains Mono / IBM Plex Mono for numerals and tiny labels.
- Sizes: Japanese glyphs look larger than Latin at equal px, so set Latin 5-10% bigger or JP 10-15% smaller when mixed. [WEB]
- Line-height: JP body 1.8-2.0; Latin 1.5. Letter-spacing JP +0.02 to +0.06em on body; tighten large display kana with `font-feature-settings: "palt"` (proportional alternates) on headings only, not body. [KNOW]
- `font-kerning: normal; line-break: strict; word-break: auto-phrase` (Chrome supports `auto-phrase` for JP phrase-wrapping) [KNOW]; `text-spacing-trim: trim-start` where supported. `hanging-punctuation` for Safari.
- **Vertical text** (`writing-mode: vertical-rl; text-orientation: mixed`) in editorial and ornamental places: article cartouche titles, section kanji labels, side rails, quotes. Works for heritage signalling. [WEB] Don't use for core reading UI on phone; offer a reader toggle "縦書き" since Satori-adjacent readers like it. Digits inside vertical text: `text-combine-upright: digits 2`.
- Ruby: furigana sized 50% of base, rt colour at 60% ink, never collide with line above (increase line-height to 2.1 when ruby shown). Reveal-gated furigana per his earlier ask.
- Type scale (suggested, phone): display 44/1.1 Mincho 600; title 28/1.25; body JP 17/1.9; UI label 13/1.3 Gothic 600 +0.04em; micro-mono 10.5/1.2 uppercase tracking +0.12em.
- Details that look *expensive*: tabular numerals on all counts; consistent optical alignment of kana to baseline; no faux bold on Mincho (load real weights).

### 2.8 Transit and signage design
- Tokyo transit: each line has a colour applied everywhere with absolute consistency (map, platform, train, app); station numbering (G09, M15) turns names into addresses; bilingual signs with Japanese primary + romaji/English secondary, pictograms, arrows. [WEB]
- Steal: **each room gets a line colour and a code**, like a metro map. Home = ○, Shelf (reading) = S, Dojo (drills) = D, Tests = T, Collections = C. A top-of-screen *line strip* shows where you are on the "Bunki Line" with next/previous stops. Navigation then feels like a city you know, not a menu.
- Suggested line colours (lean on real Tokyo logic, not copies): Reading `#1F6FB5` (blue), Drill `#D8402F` (vermilion), Tests `#F2B01E` (amber), Collections `#2E9E6B` (green), Home `#2C2C2C` (ink). Keep AA contrast on paper.
- Station-style header: `S 03` mono code + Japanese name large + English small. That solves the "English setting shows Japanese buttons" problem structurally: small code + one language label for the *current UI language* + the other language only as a faint subtitle.
- Pictograms: one icon family, 1.75 px stroke, 24 px grid, rounded joins; never mix filled and outline.
- Departure board (発車標) motif for "today's queue": row of items with time-style numerals, LED-dot font for counts. A tiny flap/roll animation (split-flap) when numbers change.

### 2.9 Cyberpunk Japan: Akira, Ghost in the Shell, Shinjuku, kanban
- Akira (1988): red/black, saturated vermilion capsule-red `#E50914`-ish, hand-painted urban grit, huge scale, kanji on walls. GITS (1995): cool teal/green HUD, thin wireframes, cyber-brain data overlays, philosophical stillness. Tokyo neon: colour-shifted light sources toward cyan, magenta, violet [WEB]; kanban (看板) vertical stacked signs, mixed typefaces, rain reflections. [KNOW]
- Principles to take: **thin precise overlays on calm imagery**; data as texture (tiny coordinates, hex codes, timestamps); light as the only saturated element; reflections in wet surfaces; scale contrast (huge kanji vs tiny mono).
- Dark mode palette ("Shinjuku Rain"): bg `#0B0F1A` (night indigo-black), surface `#121A2B`, hairline `#26324A`, text `#E9E6DC`, signal cyan `#2FE6D2` (use at 100% only for ONE element per screen), neon vermilion `#FF4A3D`, magenta accent `#E83E8C` rare, gold `#E6B422`. Glow: 0-6 px blur, 25% opacity max. (His earlier canon for another project said NO neon; here, *restrained* light accents on dark only. Decide with John.)
- Signage motifs: vertical stacked kanji strips along screen edge (縦看板) as the room label; a thin LED ticker line at the very top for "today: 12 new / 34 review" in mono; a flickering-on (neon tube ignition, 3 frames) when entering dark mode or unlocking.
- Detail layer ideas (hyper-detail without clutter): registration marks and crop marks in card corners (print-shop precision), micro-labels "N2 / ID 0412 / 2026-10-08", hairline grids visible at 3% on hover, tiny hanko stamp in the corner of finished articles.
- Ghost in the Shell, recursion tie-in: the "ghost" in the shell; show the reader's *own* known-words as a ghost layer: known words are normal, unknown words faintly outlined in cyan wireframe. One tap shows the whole sentence's structure as a parse tree.

### 2.10 teamLab
- Principles: borderless continuity, art that responds to your presence, no signposts, no two visits the same. [WEB]
- Use: one **living ambient background** on the home screen (flowers/koi/word-particles from the word sky he already likes: "opening word-sky front door is perfectly fine") that reacts to touch and time of day, and changes with the words you know. Words you reviewed today bloom; words you've forgotten wilt.
- Keep it performant: canvas/WebGL at <= 30 fps, pause when hidden, `prefers-reduced-motion` fallback = static still.
- Colours: black ground, saturated flower hues (`#FF5E7E`, `#7CF4C4`, `#F7D154`, `#8A7CFF`) used only inside this living surface.
- Continuity: when you tap a word in an article it *lifts* into the sky, and when you open the sky and tap a star you land back in its sentence. Shared-element transitions between rooms (View Transitions API) give flow instead of page loads.

### 2.11 1980s Japanese tech design
- Sony Trinitron/Walkman, Casio (F-91W, G-Shock), Yamaha DX7 LCD, Famicom, Roland TR-808 buttons, Nintendo Game & Watch: grey/cream plastic, red/blue/yellow primary accents, LCD seven-segment, tactile pill buttons, small caps labels on hardware, tight rounded rectangles.
- Use: LCD-style numerals for streak/counts (`DSEG7` font or custom), the 808's row of coloured step buttons as the *review rating row* (Again / Hard / Good / Easy as four tactile coloured pads with a labelled strip beneath), cassette-label cartouches. Cream plastic `#E9E4D4`, Walkman orange `#F26A1B`, Casio blue `#2A5CAA`, LCD green-grey `#C7D2B5` with ink `#2B3326`.
- These answer "buttons feel antiquated": make buttons **physical**: 2-layer (face + lip) with 2 px travel on press, soft inner highlight, 120 ms spring return, plus optional haptic.

### 2.12 Modern Japanese UI: LINE, Nintendo, others
- LINE: stickers/emoji as expressive micro-moments, big rounded bubbles, clear colour (green) identity, strong reaction feedback. Nintendo: instant, bouncy, characterful menu sounds, large focus targets, a "selected" state that wiggles; Switch UI = flat tiles, big type, a clear cursor. Rakuten/Mercari: dense but organised. 
- Use: Bunki's own stamp/sticker reactions on saved sentences (a hanko "良" "覚" "難" tap-stamps, vermilion `#C8161D`, with a 90 ms squash). Selection state with a small ink-bleed highlight. Big tile grid for rooms. Sound: soft wood-block "tock", shamisen pluck for success, tiny bell for streak; all off by default with a visible toggle, <= 150 ms.
- Remember: Nintendo-level feel comes from **latency and sound/haptic sync**, not graphics.

---
## PART 3. Where it goes in the app (room by room)

| Room | Identity | Layout grammar | Signature moment |
|---|---|---|---|
| Home (front door) | Keep word-sky. Overlay: one huge verb "Read today's passage" + 3 small stops below (Review n, Test, Explore) | Centered, 60% empty, living sky | Words you reviewed bloom; tap sky star -> sentence |
| Shelf / reading | Washi paper, Mincho, woodblock hero with cartouche, ichimatsu-free; calm | Magazine: large lead, 2-col grid of article cards on tablet, single column phone | Tap a word -> lifts, popup springs; vertical-text toggle |
| Dojo / drills | Dark-leaning "training hall": ink, seigaiha, vermilion pads | **Not everything at once**: one tile per drill type in a 2x2, each opens a focused full-screen; progress as a rising wave | 808-style rating pads, enso on completion |
| Tests | Amber transit line, exam-paper look (grid answer sheet, ichimatsu) | Clinical, quiet, timer as station-clock | Result = departure board with scores flipping in |
| Collections | Green line, shelves of cracked/gold-filled bowls = weak/strong words, shippō for word families | Gallery | Kintsugi fill when a word stabilizes |
| Settings | Muji: white, lists only | Plain | Language switch is the first row; changing it immediately swaps all chrome |
| Onboarding | First passage before signup; "building your reading" fake-craft screen as a brush-drawn enso | Single question per screen | Choose level with a sample sentence, not a label |

### Cross-app systems
1. **Line strip nav** (bottom bar, 5 stops with codes), colour-coded; active stop expands to its label (iOS-smooth 280 ms).
2. **Language rule**: `uiLang` governs all chrome. Decorative kanji allowed only as non-interactive texture. Test: every button label in English mode matches `/[A-Za-z]/` and contains no kana/kanji; mirror for JP mode.
3. **Button system**: primary = ink pill with lip; secondary = hairline; destructive never red-filled by default. Pressed travel 2 px.
4. **Motion tokens**: `--ease-out: cubic-bezier(.22,1,.36,1)`, durations 120 / 240 / 400 / 700 ms; spring for chips.
5. **Haptics/sound**: `navigator.vibrate(8)` on key actions where supported; Web Audio for 3 tiny sounds.
6. **Differentiation rule**: no two rooms share header treatment, accent colour, and layout. Each has one different "furniture" (pattern, ground colour, layout).

---
## PART 4. Palettes (tokens to start from)

Light "Washi":
- paper `#FBFAF5`, paper-2 `#F3EEE0`, ink `#1E1E1C`, ink-2 `#5A5750`, hairline `#E3DCCB`
- shu (vermilion) `#D9381E` / seal `#C8161D`, ai (indigo) `#165E83`, asagi `#00A3AF` (tech cyan, light), yamabuki `#F8B500` (amber), matsu `#316745`, kin (gold) `#C9A227`, fuji (wisteria) `#7A6FB0`

Dark "Shinjuku Rain": see 2.9.

Hex values for the traditional-named colours are from memory of the NIPPON COLORS set [KNOW] and should be eyeballed; the generic names/values for ai, sumi, shironeri also appeared in search results [WEB].

---
## PART 5. Weeb clichés to avoid (use common sense)
- Cherry blossom everywhere, rising-sun flag/ray motifs (politically loaded), red circle on white as a decorative default.
- Anime-girl mascots, chibi, sparkles, "kawaii" stickers, "ninja/samurai" gamification, katana cursors, "Konnichiwa!" greetings, "Sensei" badges overused.
- Fake-Japanese fonts (brush "chop suey" styles for Latin), random katakana as texture that means nothing, wrongly-ordered or nonsense kanji, "Japanese-looking" decorative kanji that spell gibberish. Every kanji shown must be correct and relevant.
- Mixing Chinese/Korean glyph variants (set `lang="ja"` everywhere to get JP glyph forms).
- Imperial chrysanthemum, Tokugawa crest, Rising Sun, Buddhist swastika (卍 map symbol) misused, Shinto/Buddhist iconography as decoration, geisha/oiran cliché imagery, Hokusai's Great Wave on every surface (we already have a shin-hanga set; don't repeat the wave print).
- Neon pink cyberpunk "Blade Runner 2049 pastiche" with rain and a hologram geisha. Cyberpunk lives in the *detail layer* and the dark mode, restrained.
- Streak guilt, owl-style passive aggression, "Don't lose your streak!!!" push spam. [WEB: dark patterns]
- Overuse: if more than ~1 in 5 elements is "Japanese-themed ornament", it's costume. The Japanese should come from structure (type, space, system), not stickers.

---
## PART 6. Quick wins ranked (impact / effort)
1. One-verb home + five-stop line-strip nav (high / medium).
2. Language-mode purity + audit test (high / low).
3. Reader typography overhaul (Mincho, ruby sizing, line-height, vertical toggle) (high / medium).
4. Physical button system + rating pads (medium-high / low).
5. Room differentiation (colour, pattern, header) (high / medium).
6. Kintsugi weak-word shelf, enso complete ring, kamon progress (signature / medium).
7. Shared-element/View Transitions between rooms; reduced-motion fallbacks (medium / medium).
8. Dark "Shinjuku Rain" theme using the same woodblocks (medium / medium).
9. First-passage-before-account onboarding (high if new users matter / medium).

## Sources
- Duolingo gamification and critique: https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo ; https://dev.to/pocket_linguist/why-duolingos-gamification-works-and-when-it-doesnt-1d4 ; https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification ; https://yukaichou.com/gamification-study/master-the-art-of-streak-design-for-short-term-engagement-and-long-term-success/
- Duolingo onboarding: https://goodux.appcues.com/blog/duolingo-user-onboarding ; https://www.appcues.com/blog/gradual-engagement-mobile-app-first-screen
- Japanese app comparison: https://languavibe.com/best-japanese-reading-apps/ ; https://immit.co/blog/best-app-for-learning-japanese-in-2026-an-honest-comparison ; https://www.tofugu.com/reviews/satori-reader/
- Clozemaster UX: https://www.fluentu.com/blog/reviews/clozemaster/
- Traditional colours: https://color-term.com/traditional-color-of-japan/ ; https://hueatlas.com/color-palettes/japanese-color-palette/
- Kenya Hara/Muji: https://blakecrosley.com/blog/design-philosophy-kenya-hara ; https://www.designboom.com/design/kenya-hara-designing-design/
- Japanese typography: https://www.aqworks.com/blog/perfect-japanese-typography ; https://www.utsubo.com/blog/japanese-web-design-style-guide ; https://github.com/googlefonts/zen-oldmincho ; https://tategaki.github.io/en/
- Cyberpunk anime: https://animifyai.com/en/blog/cyberpunk-anime-aesthetic-guide/
- teamLab: https://www.designboom.com/art/teamlab-borderless-continuity-evolving-worlds-perception-interview/ ; https://www.tokyoweekender.com/art_and_culture/design/teamlab-borderless/
- Tokyo wayfinding: https://welovedaily.net/article/tokyo-wayfinding-design-train-stations-masterclass
