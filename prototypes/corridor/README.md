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
compounds. The reader speaks Drift's click grammar — tap = furigana,
double-tap = English beneath, long-press = floating mini-dictionary, keep
holding = full entry. 取る became 覚える; items land in an automatic monthly
list (the operator's Renzo habit) plus named lists, persisted in
localStorage. A 12-entry original-content grammar dictionary seeds the
DoJG-class index (文法 on the shelf). Reader surfaces carry no provenance
narration — 出典 folds away at the shelf foot; sheets carry their own
← 戻る／✕ (the "NO BACK OPTION" fix), and a synthesized-click swallow stops
hold-opens from teleporting a node deeper. Rebuild the dictionary assets
with `node tools/build_dictionary.mjs`.

## Running it locally

```sh
node prototypes/corridor/tools/verify-corridor.mjs     # the verifier: 82 checks + the screenshot set
python3 -m http.server -d prototypes/corridor 8080     # then open http://127.0.0.1:8080/
```

## The article pipeline (Phase 1 of the build brief)

The shelf flows through **`tools/build_articles.py`** — the batch command
that turns every rights-clean text into one article JSON (tokens, furigana,
paragraph starts, level signals, provenance) plus a light `data/articles/
index.json` the corridor boots from. Articles load lazily per file and are
prefetched in the background; adding an article to the shelf is adding a
file. Sources are all in-repo: the corpus samples (wikinews · aozora ·
やさしい日本語, full-length — the 520-char excerpt cap is gone) and the 8
v11 reading-catalog texts (5 Bunki originals, pool `original`; 3
public-domain classics).

Level signals per article, stored separately, never averaged: jreadability
(live), JLPT-lexicon coverage + band vector (live, substrate
`open-anki-jlpt-decks/wbig-6687`, unofficial), and the NINJAL pair — measured
when the pinned substrate is reachable from the build environment, otherwise
recorded as `unavailable` with the reason and rendered 未測定. **Every signal
shown is true of the exact text displayed**; the verifier enforces it.

## Rebuilding the data

The corpus branches (PRs #52–#58) are merged on this branch since Phase 1 —
no cross-branch checkouts needed. With the grader's runtime installed:

```sh
python3 -m venv .venv && .venv/bin/pip install --upgrade setuptools wheel
.venv/bin/pip install fugashi unidic-lite jreadability==1.1.5
# optional — fills in the NINJAL signal pair (sha256 pinned in ninjal/PROVENANCE.yml):
mkdir -p corpus/data/ninjal && curl -o corpus/data/ninjal/rokusyutaisyo.csv \
  https://mmsrv.ninjal.ac.jp/brfvep/rokusyutaisyo.csv

PYTHONPATH=corpus/src .venv/bin/python prototypes/corridor/tools/build_articles.py
PYTHONPATH=corpus/src .venv/bin/python prototypes/corridor/tools/build_corridor.py
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
