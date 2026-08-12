# WP9b — the shelf grows from 26 to 40 articles

> Historical receipt: this document records the WP9b expansion as it was
> verified. The current canonical `prototypes/corridor/tools/build_articles.py`
> now owns these same 14 records and reading overrides directly, and the
> historical `build_wp9b_articles.py` command is only a compatibility
> delegator. Current shelf/standalone counts are recorded by the later native
> readings evidence, not by the snapshots below.

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

### Level-ladder honesty — complete inversion audit

An earlier revision of this document disclosed one inversion and missed
others. This is the exhaustive audit, recomputed after the relabel in §8b.
jreadability: **higher = easier**.

Per band (the 14 WP9b articles):

| band | n | mean | min | max | spread |
|---|---|---|---|---|---|
| N5 | 3 | 5.01 | 4.74 | 5.44 | 0.70 |
| N4 | 3 | 4.09 | 3.82 | 4.46 | 0.65 |
| N3 | 2 | 3.50 | 3.05 | 3.94 | 0.89 |
| N2 | 4 | 2.99 | 2.62 | 3.18 | 0.55 |
| N1 | 2 | 2.23 | 2.19 | 2.26 | 0.07 |

Band means are strictly monotone (5.01 > 4.09 > 3.50 > 2.99 > 2.23). Before
the relabel they were nearly flat across the middle (N3 3.20 vs N2 3.12).

**Every remaining cross-band inversion — all four:**

| labelled easier | jread | measures harder than | jread | gap |
|---|---|---|---|---|
| N4 `bunki-graded-n4-letter` | 3.82 | N3 `bunki-graded-n3-river` | 3.94 | 0.12 |
| N3 `bunki-graded-n3-radio` | 3.05 | N2 `bunki-essay-n2-notebook` | 3.07 | 0.02 |
| N3 `bunki-graded-n3-radio` | 3.05 | N2 `bunki-essay-n2-translation` | 3.10 | 0.05 |
| N3 `bunki-graded-n3-radio` | 3.05 | N2 `bunki-essay-n2-rain` | 3.18 | 0.13 |

All four are **adjacent-band and ≤0.13 apart**; there is no inversion spanning
two or more bands.

**Why `bunki-graded-n3-radio` was NOT relabelled** (the coordinator asked for
argument rather than silent compliance). It is 0.02 from `notebook` — inside
the noise of a sentence-shape formula, not evidence of a band error. Its
grammar inventory is upper-N3: 〜たまま, 〜ことにしていた, 〜らしい,
〜(よ)うとすると, with only 〜わけではない and かえって reaching into N2. The
`handwriting` relabel rested on **two independent signals agreeing** —
measurement (2.62, harder than *every* N2 and inside reach of the N1 pair at
2.19–2.26) *and* register (a cleft with an embedded comparative,
「分かったのは…ことよりも…ことだった」). Neither holds for `radio`.
Relabelling on a 0.02 formula gap would be exactly the averaging-of-signals
the #42 law forbids: jreadability measures sentence shape, not grammar
inventory, and it does not get a casting vote over the other signals.

The pre-existing 26 show the same overlap — e.g. `wikinews:6460` at 4.23
measures easier than `real-hojoki` at 3.95 despite being news prose.

## 4. Per-article table

All 14: `pool: original` · `licence: Bunki original` · `source:
bunki-wp9b-reading-catalog` · `attribution: Bunki original text` ·
`rubySource: tokenizer` · NINJAL pair unavailable-with-reason.

| slug | title | lane | author level | jread | band | JLPT cov | content tok | chars | bytes |
|---|---|---|---|---|---|---|---|---|---|
| `bunki-graded-n5-station` | 駅で待つ時間 | graded | N5 | 4.74 | 初級後半 | 77.6% | 67 | 255 | 16,822 |
| `bunki-graded-n5-kitchen` | 台所の音 | graded | N5 | 4.86 | 初級後半 | 68.9% | 61 | 244 | 15,652 |
| `bunki-graded-n5-neighbour` | となりの部屋の人 | graded | N5 | 5.44 | 初級後半 | 67.9% | 56 | 244 | 15,907 |
| `bunki-graded-n4-letter` | 引き出しの中の手紙 | graded | N4 | 3.82 | 中級前半 | 61.4% | 83 | 310 | 20,315 |
| `bunki-graded-n4-market` | 朝の市場 | graded | N4 | 4.00 | 中級前半 | 67.6% | 71 | 281 | 18,634 |
| `bunki-graded-n4-bicycle` | 自転車をなくした日 | graded | N4 | 4.46 | 中級前半 | 63.5% | 74 | 288 | 18,974 |
| `bunki-graded-n3-river` | 川沿いの道 | graded | N3 | 3.94 | 中級前半 | 63.0% | 92 | 313 | 20,037 |
| `bunki-graded-n3-radio` | 深夜のラジオ | graded | N3 | 3.05 | 中級後半 | 55.2% | 87 | 313 | 19,209 |
| `bunki-essay-n2-handwriting` | 手で書くということ | essay | **N2** | 2.62 | 中級後半 | 65.2% | 89 | 303 | 19,411 |
| `bunki-essay-n2-notebook` | 余白のためのノート | essay | N2 | 3.07 | 中級後半 | 54.1% | 122 | 417 | 25,940 |
| `bunki-essay-n2-rain` | 雨の日の速度 | essay | N2 | 3.18 | 中級後半 | 65.2% | 132 | 428 | 27,043 |
| `bunki-essay-n2-translation` | 訳せない言葉について | essay | N2 | 3.10 | 中級後半 | 62.8% | 129 | 481 | 29,580 |
| `bunki-essay-n1-memory` | 忘却を前提とした設計 | essay | N1 | 2.26 | 上級前半 | 53.9% | 193 | 628 | 37,510 |
| `bunki-essay-n1-city` | 都市の匿名性と言語 | essay | N1 | 2.19 | 上級前半 | 60.9% | 179 | 624 | 38,089 |

`bunki-essay-n2-handwriting` was `bunki-graded-n3-handwriting` until the fix
round in §9. Grading is unchanged by both the relabel and the reading repairs.

## 5. Measured numbers

| quantity | value |
|---|---|
| articles on the shelf | 26 → **40** |
| new article JSON, summed | **323,123 bytes** |
| `index.json` growth | 53,444 → 81,066 (**+27,622**) |
| total committed data delta | **+350,745 bytes** |
| standalone before (26 articles) | **8,576,961 bytes** (8.18 MiB) |
| standalone after (40 articles) | **8,923,858 bytes** (8.51 MiB) |
| standalone delta | **+346,897 bytes** |
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

**`verify-wp9b-articles.mjs` → 123/123, zero errors.** Log:
`verify-wp9b-articles.txt`; machine-readable result:
`wp9b-article-verification.json`. It serves `prototypes/corridor/` over plain
HTTP and drives real Chromium at 390×844 with CDP touch. For each of the 14 it
asserts: the shelf row exists, the tap triggers a **200 on
`data/articles/<slug>.json`** (the same per-file lazy path the served build
uses), tokens and `<rt>` furigana render, paragraph breaks survive, a held word
opens the mini-dictionary with a real reading + gloss, and a longer hold opens
the full entry. Since the fix round it also asserts **every repaired homograph
on the rendered ruby** — including that 何度 keeps なん in the same article
where 何が/何を became なに. Console errors, page exceptions, failed requests
and non-2xx responses were collected across the whole run: **0**.

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

## 8. Fix round (post-verification)

The WP9b verifier confirmed the work and raised two qualifications. Both are
addressed here; neither was addressed by hand-editing article JSON.

### 8a. Reading overrides — 2 reported, 7 found

`build_articles.py` has **no** reading-override mechanism, so one was added in
`build_wp9b_articles.py` (`READING_OVERRIDES` + `apply_reading_overrides`).
It is deliberately not a global replace. Each rule names the article, the
surface, the reading it **expects to be replacing**, an optional adjacent-token
anchor, and the **exact count** of tokens it must match — any drift raises
`SystemExit`. Only `r` (reading) and `f` (furigana pairs) are written; `s`,
`b`, `p`, `c` are untouched, so jreadability (computed on the text) and the
JLPT-lexicon signal (computed on base forms) are provably unaffected —
confirmed by field-level diff: **every changed article shows
`fields=['f','r']` and no grading delta.**

The hook is reachable only for the 14 WP9b texts (keyed through a text→id map
that holds nothing else), which is what structurally protects the other 26.

Because the verifier found two errors I had missed, I re-audited **all 595
distinct token readings** across my 14 articles rather than fixing only what
was reported. That surfaced 5 further error types:

| # | article | surface | was | now | n | why |
|---|---|---|---|---|---|---|
| 1 | `n2-handwriting` | 数 | すう | かず | 1 | *reported.* Bare noun 数 is かず |
| 2 | `n1-memory` | 縁 | えん | ふち | 1 | *reported.* 「忘却の縁」 = edge, ふち |
| 3 | `n5-station` | 七 | なな | しち | 1 | **found.** 七時 = しちじ, in an N5 clock text |
| 4 | `n5-neighbour` | 一日 | ついたち | いちにち | 1 | **found.** "a day", not the 1st of the month |
| 5 | `n4-market` | 市場 | しじょう | いちば | 2 | **found.** A market with fishmongers is いちば |
| 6 | `n4-market` | 十 | じゅう | じゅっ | 1 | **found.** 十個 = じゅっこ, not じゅうこ |
| 7 | `n2-translation` | 四 | よん | よっ | 1 | **found.** 四つ = よっつ, not よんつ |
| 8 | `n1-memory` | 何 | なん | なに | 4 | **found.** 何が/何を = なにが・なにを |
| 9 | ×5 articles | 日本 | にっぽん | にほん | 5 | **found.** 日本語 = にほんご |

**17 token repairs across 9 of the 14 articles.**

Two things worth flagging about #8 and #9:

- **#8 is why the hook is context-keyed.** The same article contains 何度,
  which is correctly なんど and must not be touched. The rule anchors on a
  following が/を. It also caught a mistake of mine: I declared `count: 3`, the
  guard refused the build (`matched 4 tokens, expected 3`), and the fourth
  instance was real. The mechanism failed loudly rather than silently
  under-applying.
- **#9 leaves the shelf internally inconsistent, deliberately.** 日本 occurs
  23 times in the pre-existing 26 articles, also as にっぽん. I fixed only my
  5 — 日本語 is the single most learner-critical word on the shelf and にほんご
  is effectively universal — so the shelf now reads にほんご in 5 articles and
  にっぽんご elsewhere. The real fix belongs at the tokeniser layer for all 40
  and is **not** mine to land in a data-only work package.

**Not fixed, on purpose: 私 → わたくし** (27 occurrences in mine, 16 in the
pre-existing 26). Unlike the above, わたくし is a *valid formal reading*, not
an error, and my texts are in polite or literary register. The line drawn is:
repair readings that are **wrong in context**; leave readings that are merely
**more formal than intended**. Disclosed rather than silently changed.

### 8b. Relabel — `n3-handwriting` → `bunki-essay-n2-handwriting`

Accepted, on both grounds the coordinator gave. Measurement: 2.62 is harder
than every N2 essay (3.07–3.18) and within reach of the N1 pair (2.19–2.26).
Register: the closing sentence is a cleft with an embedded comparative
(「三か月続けて分かったのは、書ける字が増えたことよりも、字を見る目が変わった
ことだった」), which is N2 syntax, and the piece is reflective first-person
prose — the essay lane, not the graded lane.

**What the schema allows** (asked for explicitly): the article record has no
`note`/annotation field — its keys are `id, title, text, source, sourceLabel,
pool, licence, attribution, url, date, rubySource, authorLevel, lane, file,
tokens, paras, grading, truncated`. So the choice was a correct slug or a new
schema field for one article. I renamed, because the old slug asserted both
`graded` and `n3` and both had become false — a lying identifier is precisely
what this campaign audits. **Index ordering is unaffected**: the record keeps
its position in `originals.jsonl`, so only the row's own fields change.

Changed fields: `id`, `file`, `authorLevel` (N3→N2), `lane` (graded→essay),
`sourceLabel` (段階別読み物 · Bunki → 随筆 · Bunki). `grading` unchanged.

### 8c. Diff manifest and determinism proof

| set | count | result |
|---|---|---|
| pre-existing 26 article files | 26 | **byte-identical** |
| my articles unchanged | 5 | `n1-city`, `n2-notebook`, `n2-rain`, `n3-river`, `n4-bicycle` |
| my articles changed (readings only) | 8 | `n5-station`, `n5-kitchen`, `n5-neighbour`, `n4-letter`, `n4-market`, `n3-radio`, `n2-translation`, `n1-memory` |
| renamed + relabelled + reading fix | 1 | `bunki-graded-n3-handwriting` → `bunki-essay-n2-handwriting` |
| `index.json` | 1 | 14 WP9b rows updated; the 26 pre-existing rows untouched |

**Three-run determinism re-proof.** The build was run three times into
separate directories and every one of the 41 files hashed identically:

```
tree sha256 over all 41 files, concatenated in name order:
  run1  844b69b6bf334864e3e79138fa65d05093b20d9c56d8af161446265916f06810
  run2  844b69b6bf334864e3e79138fa65d05093b20d9c56d8af161446265916f06810
  run3  844b69b6bf334864e3e79138fa65d05093b20d9c56d8af161446265916f06810
files differing across the three runs: []
```

Post-fix suites: **verify-corridor 91/91**, **verify-wp9b-articles 123/123**,
zero console/page errors.

## 9. Risks and open items

- **The committed `prototypes/corridor/corridor-standalone.html` is now stale**
  — it still embeds 26 articles and the pre-WP9b `corridor.js`. It was
  deliberately not regenerated (the brief forbids committing it). Whoever lands
  the campaign must regenerate it; the measured post-regeneration size is
  8,923,858 bytes.
- **Homograph readings are a shelf-wide substrate problem, only partly fixed.**
  The override hook in §8a repairs 17 tokens in the 14 WP9b articles. The same
  UniDic failure class is live in the pre-existing 26 (日本 ×23 as にっぽん,
  私 ×16 as わたくし) and is untouched here. Two consequences to own: the shelf
  now reads 日本語 as にほんご in 5 articles and にっぽんご in the rest, and
  私 reads わたくし everywhere including my 14. The durable fix is a shared
  override table applied to all 40 in `build_articles.py` — out of scope for a
  data-only package, and it deserves a named ticket rather than a footnote.
- **The reading audit was manual and is not a regression test.** I read all
  595 distinct token readings across my 14 articles once. The override rules
  are self-guarding — they fail the build if their context or count drifts —
  but nothing detects a *new* homograph error in a *new* article. A reading
  audit step belongs in the pipeline before the shelf grows again.
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
