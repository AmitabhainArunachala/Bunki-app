# WP9b — the shelf grows from 26 to 40 articles

Data-only expansion of the corridor's in-file article shelf. Every new article
flows through the existing Phase-1 batch command
(`prototypes/corridor/tools/build_articles.py`) — same tokeniser, same
three-signal grader, same record and index schema. Nothing was hand-written
into a `data/articles/*.json` file.

**Result: 40 articles on the shelf (26 existing, byte-for-byte unchanged, plus
14 new).**

---

## 1. Mix achieved — and why it is not the mix that was asked for

Asked for: wikinews mirror + Aozora + the original graded/essay lane.
Achieved: **14/14 original lane.** Zero new mirror articles.

This is a hard environmental limit, not a shortcut:

| lane | wanted | got | why |
|---|---|---|---|
| ja.wikinews mirror | some | **0** | `ja.wikinews.org:443` and `dumps.wikimedia.org:443` are refused by this session's egress policy (gateway answers **403 to CONNECT**). |
| 青空文庫 (Aozora) | some | **0** | `www.aozora.gr.jp:443` refused the same way. |
| Bunki original graded/essay | some | **14** | authored here, carried with honest `pool: original` provenance. |

Verbatim from `http://127.0.0.1:39773/__agentproxy/status` during this run:

```
{"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial
  or upstream failure)","host":"ja.wikinews.org:443"}
{"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial
  or upstream failure)","host":"www.aozora.gr.jp:443"}
{"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial
  or upstream failure)","host":"dumps.wikimedia.org:443"}
```

The proxy README is explicit that a 403/407 is an organization policy denial
and must be reported, not routed around. It was not routed around.

**The in-repo fallback was checked first and is exhausted.** `corpus/samples/`
carries exactly the records the shelf already uses — 5 wikinews, 3 aozora,
10 yasashii — plus `corpus/samples/snow/sample.jsonl`. There is not one spare
mirror record to promote. SNOW was rejected on the merits rather than used:
its 10 rows are isolated *sentences* with empty titles (T15/T23 simplification
pairs), and stitching sentences into an "article" would manufacture a document
that does not exist upstream.

**No article was written from memory and stamped with a mirror provenance.**
The 14 texts here are original, and they say so in every provenance field:
`pool: original`, `licence: Bunki original`, `source:
bunki-wp9b-reading-catalog`, `attribution: Bunki original text`.

## 2. Exact pipeline commands

Environment (once):

```
cd corpus && uv venv && uv pip install -e ".[dev,grading]"
```
→ `jreadability==1.1.5`, `fugashi`, `unidic-lite==1.0.8` (UniDic 2.1.2 lineage).

Determinism check — the unmodified pipeline against the committed 26:

```
corpus/.venv/bin/python prototypes/corridor/tools/build_articles.py --out <scratch>
diff -r prototypes/corridor/data/articles <scratch>
```
→ **identical**. The pipeline reproduces every committed byte in this
environment, so the extension below cannot silently rewrite existing articles.

The shelf build (this produced all 40 article files **and** `index.json`):

```
corpus/.venv/bin/python docs/build-evidence/kairo-feel-lock/wp9b/build_wp9b_articles.py
```

`build_wp9b_articles.py` imports `build_articles` and appends 14 entries to its
`collect_articles()`. It reimplements nothing: tokenisation, furigana
alignment, grading, serialisation and index assembly are the unchanged
functions in `build_articles.py` / `build_corridor.py` / `corpus.grading`. Its
input is `originals.jsonl` (the 14 texts, committed beside it).

Re-verified after the extension: all 26 pre-existing article files are
byte-identical, and all 26 pre-existing `index.json` rows are unchanged — the
only index changes are 14 appended rows and one appended entry under
`sources.original`.

## 3. Grading method — measured, never asserted

Each article carries the same three-signal block as the other 26, computed on
the exact text displayed:

- **jreadability** — `jreadability 1.1.5` over fugashi/unidic-lite. Score and
  band are the library's own; the substrate string names the pin
  (`jreadability-1.1.5/unidic-2.1.2`).
- **jlpt_lexicon** — live coverage + band vector over content tokens against
  the 6,687-word JLPT-tagged lexicon already shipped in
  `prototypes/drift/data/wbig.json` (substrate `open-anki-jlpt-decks/wbig-6687`).
  Explicitly **not** official JLPT.
- **lexical_coverage + tmr (NINJAL pair)** — recorded as **unavailable, with
  the reason**, exactly as for the existing 26: `mmsrv.ninjal.ac.jp` is blocked
  by the same egress policy. `ninjalLive: 0` for all 40. The absence is shown;
  no number was invented.

`authorLevel` (N5…N1) is an **authoring target, not a measurement**, and is
stored beside the measured signals rather than mixed into them — the #42 law
(three signals, never averaged) is untouched.

**Honest note on the level ladder.** The measured means fall monotonically
across the author-stated bands — N5 5.01, N4 4.09, N3 3.20, N2 3.12, N1 2.23
(jreadability; higher = easier) — but individual articles overlap, and one
does so visibly: `bunki-graded-n3-handwriting` measures 2.62, *harder* than
all three N2 essays (3.07–3.18). That disagreement is surfaced here rather
than resolved by relabelling the text. The existing 26 show the same kind of
overlap (e.g. `wikinews:6460` at 4.23 measures easier than `real-hojoki` at
3.95 despite being news).

## 4. Per-article table

All 14: `pool: original` · `licence: Bunki original` · `source:
bunki-wp9b-reading-catalog` · `attribution: Bunki original text` ·
`rubySource: tokenizer` · NINJAL pair unavailable-with-reason.

| slug | title | lane | author level | jread | band | JLPT cov | content tok | chars | bytes |
|---|---|---|---|---|---|---|---|---|---|
| `bunki-graded-n5-station` | 駅で待つ時間 | graded | N5 | 4.74 | 初級後半 | 77.6% | 67 | 255 | 16,822 |
| `bunki-graded-n5-kitchen` | 台所の音 | graded | N5 | 4.86 | 初級後半 | 68.9% | 61 | 244 | 15,658 |
| `bunki-graded-n5-neighbour` | となりの部屋の人 | graded | N5 | 5.44 | 初級後半 | 67.9% | 56 | 244 | 15,913 |
| `bunki-graded-n4-letter` | 引き出しの中の手紙 | graded | N4 | 3.82 | 中級前半 | 61.4% | 83 | 310 | 20,321 |
| `bunki-graded-n4-market` | 朝の市場 | graded | N4 | 4.00 | 中級前半 | 67.6% | 71 | 281 | 18,646 |
| `bunki-graded-n4-bicycle` | 自転車をなくした日 | graded | N4 | 4.46 | 中級前半 | 63.5% | 74 | 288 | 18,974 |
| `bunki-graded-n3-river` | 川沿いの道 | graded | N3 | 3.94 | 中級前半 | 63.0% | 92 | 313 | 20,037 |
| `bunki-graded-n3-radio` | 深夜のラジオ | graded | N3 | 3.05 | 中級後半 | 55.2% | 87 | 313 | 19,215 |
| `bunki-graded-n3-handwriting` | 手で書くということ | graded | N3 | 2.62 | 中級後半 | 65.2% | 89 | 303 | 19,426 |
| `bunki-essay-n2-notebook` | 余白のためのノート | essay | N2 | 3.07 | 中級後半 | 54.1% | 122 | 417 | 25,940 |
| `bunki-essay-n2-rain` | 雨の日の速度 | essay | N2 | 3.18 | 中級後半 | 65.2% | 132 | 428 | 27,043 |
| `bunki-essay-n2-translation` | 訳せない言葉について | essay | N2 | 3.10 | 中級後半 | 62.8% | 129 | 481 | 29,586 |
| `bunki-essay-n1-memory` | 忘却を前提とした設計 | essay | N1 | 2.26 | 上級前半 | 53.9% | 193 | 628 | 37,510 |
| `bunki-essay-n1-city` | 都市の匿名性と言語 | essay | N1 | 2.19 | 上級前半 | 60.9% | 179 | 624 | 38,089 |

## 5. Measured numbers

| quantity | value |
|---|---|
| articles on the shelf | 26 → **40** |
| new article JSON, summed | **323,180 bytes** |
| `index.json` growth | 53,444 → 81,081 (**+27,637**) |
| total committed data delta | **+350,817 bytes** |
| standalone before (26 articles) | **8,576,961 bytes** (8.18 MiB) |
| standalone after (40 articles) | **8,923,932 bytes** (8.51 MiB) |
| standalone delta | **+346,971 bytes** |
| budget | ≤ 12 MB — **pass**, ~3.1 MB headroom |

Standalone measured by a local scratch build, never committed:

```
node prototypes/corridor/tools/build-standalone.mjs /tmp/.../scratch-wp9b.html
```

## 6. Acceptance evidence

**`verify-corridor.mjs` → 91/91.** Full log: `verify-corridor.txt`. No check
hardcodes the article count; the two count-sensitive checks read the shelf
dynamically ("the shelf renders real graded texts" ≥ 8; "Phase 1 · all 8
parked v11 texts stand on the shelf") and both still pass at 40.

**`verify-wp9b-articles.mjs` → 114/114, zero errors.** Log:
`verify-wp9b-articles.txt`; machine-readable result:
`wp9b-article-verification.json`. It serves `prototypes/corridor/` over plain
HTTP and drives real Chromium at 390×844 with CDP touch. For each of the 14 it
asserts: the shelf row exists, the tap triggers a **200 on
`data/articles/<slug>.json`** (the same per-file lazy path the served build
uses), tokens and `<rt>` furigana render, paragraph breaks survive, a held word
opens the mini-dictionary with a real reading + gloss, and a longer hold opens
the full entry. Console errors, page exceptions, failed requests and non-2xx
responses were collected across the whole run: **0**.

Screenshots (`screenshots/`) for 3 new articles across levels — reader,
mini-dictionary, full entry:
`bunki-graded-n5-station`, `bunki-graded-n3-river`, `bunki-essay-n1-memory`.

## 7. Scope deviation — one app-code line block, declared

The brief said data-only. One change outside `data/articles/` was necessary:
**14 entries appended to `TITLES_EN` in `prototypes/corridor/corridor.js`.**

`verify-corridor.mjs` asserts *"every text carries an English title and a
learner-readable level"* against every rendered `.shelf-item`, and the English
titles live in a literal map in `corridor.js`. With 14 untitled articles the
verifier went **90/91**. The options were an authored English title per new
article, or a knowingly-red verifier; gaming the check was not one. The edit
adds map entries only — no logic, no behaviour change for the existing 26.

## 8. Risks and open items

- **The committed `prototypes/corridor/corridor-standalone.html` is now stale**
  — it still embeds 26 articles and the pre-WP9b `corridor.js`. It was
  deliberately not regenerated (the brief forbids committing it). Whoever lands
  the campaign must regenerate it; the measured post-regeneration size is
  8,923,932 bytes.
- **Other generated layers may also be stale.** `build_corridor.py` consumes
  the shelf to build downstream data (drift layer, manifest). It was not re-run,
  so those layers still reflect 26 articles. `verify-corridor.mjs` is green at
  40 regardless, but a regeneration pass is the clean follow-up.
- **The mirror lanes remain the real gap.** The shelf is now 19/40 original
  content, up from 5/26. Re-running `build_wp9b_articles.py` from an
  environment where `dumps.wikimedia.org` and `www.aozora.gr.jp` resolve — and
  extending `corpus/samples/*/sample.jsonl` with more upstream records — is the
  way to rebalance it. That is a corpus-fetch job, not a corridor job.
- **The NINJAL pair is still unavailable** for all 40 articles, unchanged from
  before this work package.
