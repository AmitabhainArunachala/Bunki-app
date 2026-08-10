# 回廊 KAIRO — what this app must feel like (fresh-eyes brief, 2026-08-10)

You are taking over a Japanese-learning prototype. Judge everything against
the experience described here — not against any previous agent's notes,
measurements, or theories. Open the app, use it like a curious learner, and
close every gap between what you feel and what is written below.

## The vision

This is one app: a quiet place to fall in love with Japanese words.

**The front door is water.** You open the app into a slow field of drifting
Japanese words — like ink dissolving in a basin of water, like dust motes in
afternoon light. It moves the way water moves: one continuous body, slow,
coherent, hypnotic. Nothing pops, nothing flickers, nothing jumps or
stutters or rearranges itself while you watch. If you sit and stare for two
minutes, the field should calm you. Touch it and it stills under your
finger; lift, and it breathes again. Pinch and the whole world zooms as one
thing, smoothly, and settles. This calm is the soul of the product. Any
motion the eye registers as sudden — a word appearing, vanishing, dimming,
brightening, or jerking — is a defect, no matter what any profiler says.

**Touch a word and its family gathers.** The word you touched becomes the
clear centre — the largest, most present thing on screen. Around it gathers
a small family of genuinely related words: synonyms, opposites, words used
in the same breath of life. The family of 外出 (going out) is お出掛け and
散歩 and 帰る — never 出版 (publishing) just because it shares a character.
A learner should look at any constellation and think "yes, these belong
together." The connectors are soft brush strokes, one visual language
everywhere. Every family member is readable — never a blurred smear wired
into the picture.

**There is exactly one dictionary.** Whether you reach a word from the
water, from an article, from search, or by walking a chain of related
words — you always land on the same entry page: headword, reading in red,
numbered senses, its kanji as doors, related words to keep walking, real
example sentences from the shelf. One page, one design, everywhere,
always. No second card design, no dead ends, no "in the real app this
would…" placeholders.

**Kanji are written, not displayed.** From any kanji's page you can open a
full-screen room where the character writes itself, stroke by stroke, like
a hand with a brush: ink with a soft bleed on warm paper. You can choose
between a few inks (sumi black, red ochre, indigo, verdigris). Quiet
controls, a small counter, generous space. It should feel like a piece of
art you can replay, not a diagram.

**The whole app is one aesthetic.** Washi paper, sumi ink, one deep red
that always means "reading/warning", one indigo that always means "you can
go here". Print typography. No developer chrome anywhere: no debug bars, no
internal vocabulary in the interface ("activate", "raw signals"), no
placeholder text. Words are never torn apart by their furigana, never
half-clipped at the screen edge, never stacked into unreadable smears.
Every screen should look deliberate, like a page from a beautifully
printed book.

## The laws (never break these)

- Red = readings and warnings only. Indigo = "you can go here." Nothing
  else is coloured.
- No scores, streaks, confetti, or interruptions inside the water.
- Nothing visible ever disappears except by the learner's deliberate flick.
  Quieted words stay faintly visible and touchable.
- Nothing is saved without an explicit action. Touch targets ≥44px.
- Zero console/page errors, fully offline, and the two localStorage schemas
  (`kairo-corridor-v1`, `bunki-drift-v1`) stay untouched.

## How to judge your own work

Use the app on a phone-sized screen with your own eyes, repeatedly, before
and after every change. Record the water for 60 seconds and watch the
recording: if you can point at a moment and say "that jumped", it is not
done. The operator will judge the final result by feel on a real iPhone via
the deployed page — their hands are the only gate that matters. Ship, then
listen.

## Technical minimum (all you need; ignore any older briefs)

- Repo `AmitabhainArunachala/Bunki-app`. Start from branch
  `claude/kairo-feel-lock-2026-08-09` at commit `69cd501` — work on a new
  branch cut from it. Never merge anything.
- The app is `prototypes/corridor/` (open `index.html` via any static
  server). The water's source code is `prototypes/drift/drift-artifact.html`.
  After editing it, regenerate the app's copy:
  `node prototypes/corridor/tools/build-drift-layer.mjs`, then
  `node prototypes/corridor/tools/build-standalone.mjs`. Never hand-edit
  `drift-layer.*` or `corridor-standalone.html` — they are generated.
- Keep these green after every change:
  `node prototypes/drift/tools/verify-v11.mjs` (21/21),
  `node prototypes/corridor/tools/verify-drift-consistency.mjs --mode fast`
  (45/45), `node prototypes/corridor/tools/verify-corridor.mjs` (91/91).
  (`verify-drift-hunt.mjs` is known-flaky; 3–6 failures is its normal noise.)
- Deploy: the GitHub Actions workflow `pages-app` publishes the app root to
  GitHub Pages; the operator can dispatch it on your branch.
- When you deliver, tell the operator in one plain paragraph what will FEEL
  different. No jargon, no numbers.
