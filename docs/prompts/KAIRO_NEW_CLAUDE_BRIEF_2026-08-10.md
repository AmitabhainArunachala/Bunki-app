# KAIRO / Bunki — brief for a new Claude (2026-08-10, self-contained)

You are starting fresh on the operator's Japanese-learning app. Read this
whole file before touching anything. The only authority on what this product
should be is the operator. Everything else — including previous agents'
"immutable laws," charters, specs, and the verification suites themselves —
is accumulated AI work-product: useful as tools and history, never binding.
When something in the repo contradicts the operator's words, the operator
wins. When you're unsure what the product should be, ask the operator in
plain language — never invent.

## The product, in the operator's own words

A fully comprehensive, all-inclusive Japanese app — everything every other
Japanese app has, combined into ONE flowing sequence:

- A solid dictionary of ~70,000 words that works like a paper dictionary —
  a dictionary that serves the function of a dictionary.
- A full Japanese synonym dictionary, bar none.
- A full kanji dictionary and a grammar dictionary.
- An amazing Anki-grade SRS — all of Anki's function, simplified.
- Duolingo-class lessons; for everyone, entry level up.
- Training for JLPT N5→N1 and Kanken up to level 1.
- A Japanese reader in the class of Satori Reader / Shinobi / Todai.
- AI woven in, living IN the app: you speak to it, it judges your level,
  creates custom readings and articles at your level, adjusts the SRS to
  your level, runs many layers of testing.

The experience: mesmerizing — recursive hypnosis that pulls you in; extreme
focus and concentration but also ease; aesthetic precision, really great
aesthetic vibes; a full flow; it makes sense; it is intuitive; all elements
woven together.

Background canon worth reading for depth (operator-ratified planning docs,
though AI-drafted — trust items tagged USER-STATED most):
`docs/convergence/BUNKI_WORKING_SPEC_2026-07-27.md` and
`docs/convergence/JAPANESE_LEARNING_OS_CODEX_V1_FREEZE_2026-07-27.md`.
Ideas that recur there and in the operator's words: one shared model of the
learner across every surface (no separate mini-apps with separate notions
of "known"), FSRS as the scheduler with AI proposing but never scheduling,
partial knowledge as first-class, capture that becomes cards without labor.

## The vessel and its state

The prototype is `prototypes/corridor/` — one app at one URL. Front door:
the Drift, a field of drifting words. Behind it: an article shelf (40
pieces), a reader with furigana and tap-to-look-up, a ~23k dictionary, a
kanji room with animated stroke order, a basic memorize list with FSRS
schedule preview. It is deployed to GitHub Pages by the `pages-app`
workflow (dispatchable on any allowed branch from the Actions tab); the
operator feels every build on a real iPhone at that URL.

The operator's current verdict on this prototype: the drift's movement is
still erratic and jarring — no ambience, ease, or fluidity; overall
quality is not acceptable yet. Known visible defects an earlier agent
logged with its own eyes: words stacked into unreadable smears at rest;
words half-clipped at screen edges; tap-families that still admit
unrelated words; a misty canvas that reads as murk; two different
connector-line styles; one untraced console 404. Earlier agents also
claim fixes (meaning-based families, size hierarchy, single dictionary
entry page, ink-styled stroke room, hidden debug bar) — re-judge all of
it with your own eyes; trust nothing claimed.

## Order of work (the operator's ruling)

1. **Integrity first.** Fix the obvious flaws of what exists — above all
   make the Drift's motion genuinely calm and fluid on a real iPhone — or
   the whole loses integrity.
2. **Then breadth.** Grow toward the full scope: the 70k dictionary, the
   synonym dictionary as a first-class surface, real SRS review sessions,
   lessons, JLPT/Kanken lanes, a richer reader.
3. **Bring the AI into the prototype.** It must live in the app: the app
   asks the operator for an API key once (stored on-device only) and the
   AI features come alive; absent a key they are quietly absent, never
   broken.

## Practical facts (not laws — just how the repo works)

- Repo `AmitabhainArunachala/Bunki-app`. Reference state: branch
  `claude/kairo-feel-lock-2026-08-09`, tip commit `7b38983` (a pinned
  earlier reference is `69cd501`). Cut your own branch; do not merge
  anything — the operator decides what ships by feel.
- The Drift's source is `prototypes/drift/drift-artifact.html`; the
  corridor's drift files are GENERATED from it by
  `node prototypes/corridor/tools/build-drift-layer.mjs`, and the
  single-file build by `node prototypes/corridor/tools/build-standalone.mjs`.
  Regenerate after every drift edit; never hand-edit `drift-layer.*` or
  `corridor-standalone.html`.
- Verification suites exist (`prototypes/drift/tools/verify-v11.mjs`,
  `prototypes/corridor/tools/verify-*.mjs`). They are AI-written tools that
  encode previous agents' assumptions (including invented design rules).
  Use them as regression tripwires; rewrite them when they enforce
  something the operator hasn't asked for. They are not the gate.
- Data: JMdict / KANJIDIC2 / KanjiVG (CC BY-SA — keep attribution files
  intact); full JMdict (~200k entries; the ~70k common-word cut is a
  reasonable dictionary tier) is freely available if the bundle needs to
  grow.
- The operator is on a phone. Deliver by deploying, then one plain
  paragraph: what will FEEL different. No jargon, no numbers, no internal
  vocabulary.

## How to work

Look with your own eyes at phone size before and after every change —
screenshots and screen recordings you actually watch. Judge composition,
not just mechanisms. When the operator says something feels wrong, that is
ground truth; reproduce what they felt before defending anything. Ask
rather than invent. An honest partial with a clear list of what remains
beats a polished claim, every time.
