# Drift (墨流し) — the living-universe opening surface

Drift is the Bunki opening surface: the full JLPT lexicon (6,687 words)
floating as a navigable universe — nihonga pigment on washi ground, real
fluid dynamics under the finger, and an Obsidian-style force-directed
constellation lock for exploring word families.

The design contract lives in
`docs/convergence/BUNKI_DESIGN_LANGUAGE_SESSION2_2026-08-05.md` (§8 is the
Drift session log, v3 → v10, one section per operator feedback round). That
doc is the source of truth; this README only orients.

## Viewing

- Published (same URL across all versions):
  https://claude.ai/code/artifact/c1aa874c-126b-44b2-98bd-9f3d0e769ea3
  (private artifact — viewer must be signed in to claude.ai).
- Locally: `drift-artifact.html` is artifact body content (no
  doctype/html/head wrapper — it begins at `<title>`). Wrap and serve:

  ```bash
  printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"></head><body>' > /tmp/drift.html
  cat drift-artifact.html >> /tmp/drift.html
  printf '</body></html>' >> /tmp/drift.html
  python3 -m http.server 8917 -d /tmp   # open http://127.0.0.1:8917/drift.html
  ```

  Best on a touch device or with touch emulation; the gesture grammar is
  touch-first.

## Gesture grammar (v10)

- **tap** — unfold (furigana + gloss) + tap-bloom: ~14 related words swim
  in (decays after 12 s idle).
- **double-tap** — magnification dive: word becomes a planet with orbit
  rings (component kanji, particles, sibling words, radical chips).
- **long-press (430 ms)** — constellation lock: force-directed family graph
  (synonyms, kanji kin, collocations, themes) that reorganizes the viewed
  universe, persists after release, and chains — long-press any member to
  re-center. Typed edges: synonym / family / collocation / theme, each its
  own pigment. Water-tap releases.
- **swipe right / left** — persistent grade (known / unknown), stored in
  `localStorage` key `bunki-drift-v1`; the word acts out the judgment.
- **pinch** — pure camera zoom (0.34–2.6×) + twist rotate. Never opens a
  word.
- **pan** — swim; the drag stirs a real Stam stable-fluids simulation that
  everything (words, ink, motes) advects through.
- Left edge — level tide slider, N5 → N1 blended with school grades and
  Kanken, plus adaptive 自 mode.

## Files

- `drift-artifact.html` — the entire prototype, single self-contained file
  (all data embedded; no network requests at runtime).
- `data/wbig.json` — 6,687 JLPT words `[word, reading, gloss, level]`,
  built from the open-anki-jlpt-decks N5–N1 CSVs.
- `data/radk.json` — `RADK` (592 radical → kanji families), `KRAD`
  (kanji → components), `KINFO` (kanji → [on, kun, meaning, strokes]).
- `data/strokes.json` — stroke-order paths + number anchors for 114 chars.
- `data/sem.json` — the semantic tier pilot: 27 words × ~10–16
  LLM-authored typed relations `[word, syn|fam|col|thm|reg|ant, note]`.
  This is the seed of the LLM-as-relation-engine layer (design doc §8.11);
  the production plan is a batch pass over the full lexicon.
- `tools/fetch_strokes.py` — fetches KanjiVG SVGs and emits
  `strokes.json` (caches SVGs beside itself; cache not committed).
- `tools/build_radk.py` — builds `radk.json` from KanjiVG `kvg:element`
  component annotations + a kanji readings/meanings dataset
  (`kanji.json` from github.com/davidluzgouveia/kanji-data; 5 MB, not
  committed — download beside the script to rebuild).

Attribution: stroke and component data derive from KanjiVG
(kanjivg.tagaini.net, CC BY-SA 3.0).
