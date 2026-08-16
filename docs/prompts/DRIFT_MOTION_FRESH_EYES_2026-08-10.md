# KAIRO / Bunki — the one prototype (master brief, 2026-08-10)

You are taking over the operator's Japanese-learning product. This brief is
the operator's own vision, extracted from their frozen specs
(`docs/convergence/BUNKI_WORKING_SPEC_2026-07-27.md`,
`docs/convergence/JAPANESE_LEARNING_OS_CODEX_V1_FREEZE_2026-07-27.md` — read
both in full before any edit) and their direct words. Nothing here is an
agent's invention.

## What this product is

**One continuous system, fully comprehensive.** Everything every other
Japanese app has, woven into one flowing sequence sharing one learning state:

- A real dictionary that behaves like a paper dictionary — ~70,000 words,
  a dictionary that serves the function of a dictionary.
- A full synonym dictionary of Japanese, first-class, bar none.
- A full kanji dictionary and a grammar dictionary.
- An Anki-grade SRS, simplified — the full power without the labor.
- Lessons (Duolingo-class approachability, entry level upward).
- Training lanes for JLPT N5→N1 and Kanken up to 1級.
- A graded reader in the class of Satori Reader / Shinobi / Todai.
- An AI layer living IN the app: you speak with it, it judges your level,
  writes custom readings and articles at your level, tunes the SRS, and runs
  layered testing. (The app asks for an API key once, stored only on the
  user's device; without a key the AI features are quietly absent — never
  broken.)

These are never adjacent mini-apps: dictionary, kanji, mining, SRS,
immersion, and conversation share ONE model of what the learner knows. The
disease this product kills is state fragmentation. The promise, in the
operator's frozen words: _"Nothing meaningful you encounter is lost; not
everything becomes homework; what does become practice returns in the right
form, context, and intensity."_

**The experience bar, in the operator's words:** mesmerizing — recursive
hypnosis that pulls you in; extreme focus and concentration, but also ease;
aesthetic precision; a full flow; it makes sense; it is intuitive.

## The vessel

`prototypes/corridor/` IS the prototype — one app at one URL. Its front door
is the Drift: a slow field of words that must move like one body of water
(nothing pops, flickers, jumps, or rearranges while you watch; touch stills
it; pinch zooms the whole world as one). Behind it: shelf → reader →
dictionary → kanji rooms → memorize loop. One canonical dictionary entry
page everywhere. One aesthetic: washi and sumi, red = readings/warnings
only, indigo = "you can go here", print typography, no developer chrome.

## Order of work (operator's ruling: depth AND breadth, integrity first)

**1. Kill the obvious flaws of what exists — integrity throughout, or the
whole loses it.** Known-open ledger, verified by eyes at the pinned commit:
drift motion still reads erratic/jarring on a real iPhone (suspects: the
650ms visible word-churn timer, arbiter opacity flips, real-device
rendering, iOS pinch double-zoom — but re-diagnose fresh); words stacked
into unreadable smears at rest; words half-clipped at screen edges;
constellation families still admit strangers via crude gloss matching; the
misty canvas reads as murk, not ink-in-water; connector strokes are two
visual languages (unify on the curved brush); one untraced console 404.
Re-verify with your own eyes what an earlier agent claims fixed: meaning-
first families, satellite size hierarchy, one-dictionary routing, ink-on-
washi stroke room, hidden dev bar, humanized copy, ruby not tearing words.

**2. Build the missing pillars into the same vessel.** Real 70k dictionary
(current bundle is ~23k), the synonym dictionary as a first-class surface,
working SRS review sessions (FSRS is the one scheduler; AI never
schedules), lessons, JLPT/Kanken training lanes, reader growth.

**3. Bring the AI in.** Conversation, level judgment, custom readings,
SRS tuning, layered testing — key-in-browser for the prototype; AI
proposes, deterministic systems dispose; every AI judgment about the
learner cites its evidence.

## Laws (from the frozen spec — never break)

Red = readings/warnings only; indigo = "you can go here." No scores,
streaks, confetti, interruptions in the water. Nothing visible disappears
except by deliberate flick; quieted words stay perceptible and touchable.
Nothing saved without explicit action; saving is not a promise to memorize.
Partial knowledge is first-class — never known/unknown. Fast capture, no
lookup ever waits on AI. Touch targets ≥44px. Zero console/page errors.
localStorage schemas `kairo-corridor-v1` / `bunki-drift-v1` stay compatible.

## How to judge your work

Use the app on a phone-sized screen with your own eyes before and after
every change; record the water for 60 seconds and watch it — if you can
point at a moment and say "that jumped," it is not done. The operator
judges on a real iPhone via the deployed page; their hands are the only
gate. Ship, then listen. An honest partial with a ledger beats a polished
claim.

## Technical minimum

- Repo `AmitabhainArunachala/Bunki-app`. Start from branch
  `claude/kairo-feel-lock-2026-08-09` (pinned reference commit `69cd501`);
  work on a new branch cut from its tip. Never merge — the operator locks
  by feel.
- The app: `prototypes/corridor/` (serve the directory, open `index.html`).
  The Drift's source: `prototypes/drift/drift-artifact.html`. After editing
  it: `node prototypes/corridor/tools/build-drift-layer.mjs` then
  `node prototypes/corridor/tools/build-standalone.mjs`. Never hand-edit
  `drift-layer.*` or `corridor-standalone.html` (generated).
- Keep green: `node prototypes/drift/tools/verify-v11.mjs` (21/21),
  `node prototypes/corridor/tools/verify-drift-consistency.mjs --mode fast`
  (45/45), `node prototypes/corridor/tools/verify-corridor.mjs` (91/91).
  `verify-drift-hunt.mjs` is known-flaky (3–6 fails is machine noise).
- Deploy: GitHub Actions workflow `pages-app` publishes the app root to
  GitHub Pages; the operator can dispatch it on your branch from the
  Actions tab.
- Data licensing: JMdict/KANJIDIC2/KanjiVG are CC BY-SA (keep attribution);
  provenance-free canonical data is prohibited by the spec.
- Deliver with one plain paragraph: what will FEEL different. No jargon,
  no numbers.
