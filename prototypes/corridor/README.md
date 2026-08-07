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
Japanese. `?ui=ja` (or the EN button in the chrome) switches to 日本語のみ, the
opt-in immersion chrome; content is always Japanese. The same feedback round
flipped the defaults to WCAG-AA contrast and a layered depth treatment
(ground / card / sheet elevation, 藍 indigo for "tappable", 弁柄 red reserved
for readings and warnings); the v1.0 look survives as
`?depth=flat&contrast=current&ui=ja`.

## Running it locally

```sh
node prototypes/corridor/tools/verify-corridor.mjs     # the verifier: 42 checks + the screenshot set
python3 -m http.server -d prototypes/corridor 8080     # then open http://127.0.0.1:8080/
```

## Rebuilding the data

`prototypes/corridor/data/**` is committed so the surface is static. To rebuild
it you need the corpus branches checked out (PRs #52–#58 are **closed but not
merged** — their branches are alive) and the grader's runtime:

```sh
git checkout origin/corpus/01-wikinews -- corpus/samples/wikinews
git checkout origin/corpus/02-aozora   -- corpus/samples/aozora
git checkout origin/corpus/04-kanji-data -- corpus/datasets/kanji
git checkout origin/corpus/05-jmdict-idioms -- corpus/datasets/jmdict_idioms
git checkout origin/corpus/06-yasashii-nihongo -- corpus/samples/yasashii
git checkout origin/corpus/07-grader -- corpus/src/corpus/grading

python3 -m venv .venv && .venv/bin/pip install fugashi unidic-lite jreadability
mkdir -p corpus/data/ninjal && curl -o corpus/data/ninjal/rokusyutaisyo.csv \
  https://mmsrv.ninjal.ac.jp/brfvep/rokusyutaisyo.csv   # sha256 pinned in ninjal/PROVENANCE.yml

CORPUS_DATA_DIR=$PWD/corpus/data .venv/bin/python prototypes/corridor/tools/build_corridor.py
node prototypes/corridor/tools/build_fsrs_pin.mjs
```

Debian's patched setuptools cannot build `unidic-lite`'s sdist
(`AttributeError: install_layout`); a plain venv with upstream setuptools can.

## Licence pools

`data/proprietary_safe/` and `data/share_alike/` are separate bundles and are
never merged into one record set (corpus #41/#51). The prototype loads both, so
**the deployed artifact itself is ShareAlike** — every ShareAlike node is marked
in the UI and the boundary is stated on the shelf rather than crossed silently.
