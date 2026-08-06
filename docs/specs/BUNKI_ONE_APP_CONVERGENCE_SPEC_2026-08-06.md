# One App — Drift ⇄ study-screen convergence

- **Status:** ACTIVE — operator directive 2026-08-06: "we want the full truly
  seamless experience," following "Drift and Bunki are both [not] separate
  things at all," captured before build (anti-loss policy).
- **Problem:** the shell is unified (Drift is the site root, the study app at
  `/app/`), but the two carry different data: the study app resolves an
  internal `lexemeId` against the 16-word Phase-0 seed, while Drift holds the
  6,687-word JLPT lexicon by headword. A tap on a Drift word has nowhere to
  land.

## 1. The Drift tier (data)

A second, honest lexical tier inside the app — NOT fake seed entries. The
seed's per-field provenance discipline stays intact; the Drift tier carries
one uniform disclosure instead, because that is the truth of its data:

- `apps/app/src/data/generated/drift-words.json` — 6,687+
  `[headword, reading, gloss, level]`, generated from
  `prototypes/drift/data/wbig.json` by
  `apps/app/scripts/generate-drift-lexicon.mjs`.
- `apps/app/src/data/generated/drift-kanji.json` — `KINFO`
  (on/kun/meaning/strokes) + `KRAD` (components), generated from
  `prototypes/drift/data/radk.json` (KanjiVG + KANJIDIC2-derived, the
  authoritative rebuild of PR #26).
- `apps/app/src/data/drift-lexicon.ts` — lookups: `findDriftWord(headword)`,
  `driftWordsUsingKanji(char)` (capped), `driftKanjiInfo(char)`,
  `driftKanjiComponents(char)`, plus `DRIFT_TIER_DISCLOSURE`.

Resolution order everywhere: **seed first** (richer, curated), Drift tier as
fallback. Seed ids (`lex-…`) and headwords cannot collide.

## 2. Routes and screens

- `/word/[lexemeId]`: if `findLexemeById` misses, decode the param as a
  headword and try `findDriftWord`. Hit → `DriftWordScreen`: disclosure
  banner, headword + reading (mincho), gloss, JLPT level (pigment chip),
  constituent-kanji chips → `/kanji/<char>`, related words that literally
  share a kanji (capped, labeled as exactly that relation), back.
- `/kanji/[character]`: if the seed misses, `driftKanjiInfo` hit →
  `DriftKanjiScreen`: hero glyph (pig1), on/kun readings, meaning, stroke
  count, component chips → `/kanji/<comp>`, words using it (capped) →
  `/word/<headword>`, disclosure. No stroke-order animation — the Drift tier
  ships no per-stroke SVG, and the section says so rather than hiding.

## 3. The tap (Drift → app)

Drift's word card gains a 「学ぶ →」 action that navigates to
`app/word/<encodeURIComponent(headword)>` — rendered ONLY when
`window.__BUNKI_APP_BASE` is defined. The Pages wrapper sets it; the
standalone claude.ai artifact does not, so the artifact never shows a link
that would 404 there.

## 4. The way back (app → Drift)

On web, when the app is served under a base path (the Pages build), the
masthead gains a quiet 「墨流し」 link back to the universe (`../`). Native
and root-served builds don't render it.

## 5. Deep links on a static host

GitHub Pages serves ONE site-root 404. It cannot serve `/app/`'s own
fallback, so deep links use the standard SPA-on-Pages trick: the root 404
stores the full requested path in `sessionStorage` and replaces to `app/`;
`+html.tsx` restores it with `history.replaceState` before the bundle boots,
so expo-router wakes up on the deep route. The URL the learner sees never
changes.

## 6. Verification

- Unit: drift-lexicon lookups (hit/miss/cap/no-self), disclosure non-empty,
  generated files in sync with the generator (hash or count check).
- Full suite green; lint/format/typecheck clean.
- Pages simulation (exact path model): tap a word in Drift → that word's
  study screen; kanji chip → kanji page (incl. non-seed kanji); refresh on
  `/app/word/<word>` → same screen after the 404 trick; 墨流し → back in
  the universe. Zero console errors.

## 7. Not in this round

- Drift-tier entries in the capture-screen search (seed-only for now).
- SRS/grade sync between Drift's swipe grades and the app's threads.
- Stroke-order animation for non-seed kanji.
