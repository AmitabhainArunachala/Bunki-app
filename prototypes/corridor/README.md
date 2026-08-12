# 回廊 KAIRO — the corridor prototype

**An instrument for making decisions, not a product.** One continuous corridor
you walk on a phone (390×844), built so the open Wayfinder tickets can be
settled by looking rather than by argument. Deliberately disposable: nothing in
`apps/app` or `packages/*` was refactored to accommodate it.

Live at `/corridor/` on the Pages site.

## The walk

1. **Arrive** — a shelf of real graded texts, each showing its difficulty
   honestly: three signals, never averaged, disagreement visible where it fires.
2. **Read** — real Japanese with real furigana. Three *independent* three-way
   Satori dials (kanji · furigana · spacing), plus reveal-on-touch.
3. **Tap any word** — reading, meaning, and the semantic neighbours with their
   discrimination notes (過酷 → 厳しい *"everyday synonym, one register softer"*).
4. **Walk the graph** — word → kanji → radical → kanji → word → idiom. One tap
   per hop, every node a real page.
5. **Take it** — from any node, with a read-only FSRS-6 schedule preview under
   `packages/domain`'s pinned parameters.
6. **Return** — back to the reader at the same scroll position.

## The variants (§3 of the brief, plus v1.1 operator feedback)

Switch them in the 変異 strip at the bottom, or by query string:

| ticket | key | options (first = default) |
| --- | --- | --- |
| #38 card format | `cards` | `mcd` · `word` |
| #43 difficulty presentation | `difficulty` | `three` · `band` |
| #47 legibility vs depth | `contrast` | `wcag` · `current` |
| #37 entry | `entry` | `field` · `shelf` (default `shelf`) |
| v1.1 depth | `depth` | `layered` · `flat` |

`?entry=shelf&cards=word&difficulty=band&contrast=current` — and `?dials=0,2,1`
for the reader dials (kanji, furigana, spacing).

**v1.1 (operator feedback, 2026-08-07).** Navigation chrome is bilingual by
default — a learner must be able to steer the app before they can read
Japanese. `?ui=ja` (or the EN｜日本語 toggle in the chrome) switches to
日本語のみ, the opt-in immersion chrome; content is always Japanese. The same
feedback round flipped the defaults to WCAG-AA contrast and a layered depth
treatment (ground / card / sheet elevation, 藍 indigo for "tappable", 弁柄
red reserved for readings and warnings); the v1.0 look survives as
`?depth=flat&contrast=current&ui=ja`.

**v1.2 (operator round 3, 2026-08-07).** The Renzo baseline lands, and the
first act of the #36 harvest: the sites-v11 kotobako dictionary rides in as
`data/share_alike/dict.json` (22,934 words, every JMdict sense most-common
first) and `strokes.json` (2,136 KanjiVG stroke-path sets, drawn on the
kanji page). Word entries carry senses / kanji-in-word rows / real examples
from the shelf; kanji pages carry 音訓, stroke order, components, and glossed
compounds. The reader now uses a staged activation grammar: first activation
reveals the reading, second reveals the English gloss, and third carries the
word into its full named entry. Keyboard, switch, and screen-reader users get
the same sequence plus discoverable quick-look and full-entry controls on
focus, without a hold gesture. Particles remain inert under pointer activation
but expose an explicit full-entry alternative to assistive input. 取る became
覚える; items land in an automatic monthly list (the operator's Renzo habit)
plus named lists, persisted in localStorage. A 12-entry original-content
grammar dictionary seeds the DoJG-class index (文法 on the shelf). Reader
surfaces carry no provenance narration — 出典 folds away at the shelf foot;
sheets carry their own ← 戻る／✕ (the "NO BACK OPTION" fix), and a
synthesized-click swallow stops hold-opens from teleporting a node deeper.
Rebuild the dictionary assets with `node tools/build_dictionary.mjs`.

## Running it locally

```sh
CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node prototypes/corridor/tools/verify-corridor.mjs   # 91 checks + screenshots
CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node prototypes/corridor/tools/verify-corridor-accessibility.mjs
CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node prototypes/corridor/tools/verify-corridor-performance.mjs
PYTHONPATH=corpus/src .venv/bin/python \
  prototypes/corridor/tools/verify-native-readings.py --rebuild
CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node prototypes/corridor/tools/verify-native-readings.mjs
python3 -m http.server -d prototypes/corridor 8080     # then open http://127.0.0.1:8080/
```

The performance verifier is a local diagnostic and receipt generator. Its
production thresholds remain explicitly `unproven`; in particular, it does
not claim that warm lookup is below 100 ms. Rebuild and commit the standalone
artifact separately when its generated Drift inputs are owned by the release
lane.

## The article pipeline (Phase 1 of the build brief)

The shelf flows through **`tools/build_articles.py`** — the batch command
that turns every rights-clean text into one article JSON (tokens, furigana,
paragraph starts, level signals, provenance) plus a light `data/articles/
index.json` the corridor boots from. Articles load lazily per file and are
prefetched in the same generic background queue; adding an article to the
shelf is adding a file. Sources are all in-repo: the corpus samples
(wikinews · aozora · やさしい日本語, full-length — the 520-char excerpt cap is
gone), the 8 v11 reading-catalog texts (5 Bunki originals, pool `original`; 3
public-domain classics), the 14 WP9b Bunki originals, and the 30 native Bunki
originals in `docs/content/bunki-originals-zoka-sanjin.jsonl`.

Those 30 use the same five-field source shape, normalizer, shelf rows, lazy
article files, `renderReader()` path, and runtime provenance as the earlier
Bunki originals. Video inspiration and claim-level evidence stay outside the
runtime in `docs/content/bunki-originals-zoka-sanjin.editorial.json`; a video
is never promoted silently into historical or scientific authority. The
sidecar's human-review status is a publication gate, not UI state.

Level signals per article, stored separately, never averaged: jreadability
(live), JLPT-lexicon coverage + band vector (live, substrate
`open-anki-jlpt-decks/wbig-6687`, unofficial), and the NINJAL pair. The
default reproducible build does not download or consult a gitignored NINJAL
cache: the pair is recorded as `unavailable` with its reason and rendered
未測定. **Every signal shown is true of the exact text displayed**; the
verifier enforces it. This keeps a clean checkout byte-identical instead of
allowing ambient local data to change grading receipts.
The first 40 generated files retain their historical unavailable receipt
verbatim as part of the byte-preservation contract; newly built entries carry
the current `UnavailableByBuildPolicy` receipt.

Shared graph growth is monotonic as well. The dictionary keeps the exact PR
#69 word-record prefix and all first-40 lookup projections, then appends only
vocabulary unique to later shelf records. Semantic edges and the capped
900-idiom set remain stable, so rebuilding after a shelf append cannot evict
or rewrite a dictionary path used by an existing reader. New lemma readings
are derived from the lemma itself, never copied from an inflected surface.

## Rebuilding the data

The corpus branches (PRs #52–#58) are merged on this branch since Phase 1 —
no cross-branch checkouts needed. With the grader's runtime installed:

```sh
python3 -m venv .venv && .venv/bin/pip install --upgrade setuptools wheel
.venv/bin/pip install fugashi unidic-lite jreadability==1.1.5

PYTHONPATH=corpus/src .venv/bin/python prototypes/corridor/tools/build_articles.py
PYTHONPATH=corpus/src .venv/bin/python prototypes/corridor/tools/build_corridor.py
node prototypes/corridor/tools/build-radicals.mjs
node prototypes/corridor/tools/build_fsrs_pin.mjs
node prototypes/corridor/tools/build-standalone.mjs
```

Debian's patched setuptools cannot build `unidic-lite`'s sdist
(`AttributeError: install_layout`); a plain venv with upstream setuptools can.

## Licence pools

`data/proprietary_safe/` and `data/share_alike/` are separate bundles and are
never merged into one record set (corpus #41/#51). The prototype loads both, so
**the deployed artifact itself is ShareAlike** — every ShareAlike node is marked
in the UI and the boundary is stated on the shelf rather than crossed silently.
