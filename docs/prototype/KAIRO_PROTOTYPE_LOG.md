# 回廊 KAIRO — corridor prototype log

**Run:** cloud agent, 2026-08-07. Branch `claude/kairo-corridor`.
**Verifier:** `prototypes/corridor/tools/verify-corridor.mjs` — **38/38 checks green**,
real Chromium at 390×844 with CDP touch emulation.
**Screenshots:** `docs/prototype/screenshots/` (18 files, all at phone size).
**Machine-readable results:** `docs/prototype/verification-report.json`.

---

## 0. What was found before anything was built

**PRs #52–#58 are CLOSED, not merged.** GitHub auto-closed them when their base
branch `corpus/00-skeleton-provenance` was deleted on #51's merge. Only #51 is on
`main`. The seven branches are alive and hold the work; nothing is lost, but
**seven of last night's eight PRs are not in anyone's review queue any more.**
That is the single most important thing in this log — filed on #32.

Second: the large corpora themselves (4,094 wikinews / 10,246 aozora / 85,000
SNOW / 99,474 graded texts) are **not in the repo** — `corpus/.gitignore` excludes
`data/`, so those live only on the machine that built them. What _is_ committed:

| asset                   | committed?               | size   |
| ----------------------- | ------------------------ | ------ |
| kanken kanji fact table | ✅ 6,787 rows            | 2.2 MB |
| JMdict idiom layer      | ✅ 4,198                 | 971 KB |
| wikinews                | sample only, 5 articles  | 15 KB  |
| aozora                  | sample only, 3 works     | 31 KB  |
| やさしい日本語 glossary | sample only, ~25 entries | 4.6 KB |
| SNOW T15/T23            | sample only              | 3.2 KB |
| the three-signal grader | ✅ code, no output       | —      |

So the corridor's shelf is **11 passages**, not 14,000. Everything on it is real;
the ceiling is what was committed, not what was built.

---

## 1. The grader really ran

`unidic-lite` will not build under Debian's patched setuptools
(`AttributeError: install_layout`); a plain venv with upstream setuptools builds
it fine. The NINJAL substrate downloaded from its pinned URL and its **sha256
matched the value recorded in `ninjal/PROVENANCE.yml` exactly**
(`80f190ab…02607af`). So `corpus.grading.grade()` ran unmodified over the exact
text shown on screen.

### Measurement table — the three signals, per shelf text

`n` is content tokens — the denominator every signal is computed over. It is in
this table because it decides how much weight each row can carry, and three rows
cannot carry any.

| text                                          |   n | jreadability  | 語彙カバー率 | OOV   | TMR (core) | disagreement |
| --------------------------------------------- | --: | ------------- | ------------ | ----- | ---------- | ------------ |
| 世界自然遺産に7箇所を追加 知床半島も          | 135 | 2.42 上級前半 | 63.7%        | 36.3% | 57.0%      | —            |
| マリナーズ・イチロー選手 現役通算2500安打達成 |  86 | 4.23 中級前半 | 67.4%        | 32.6% | 41.9%      | gap 1        |
| JRおおさか東線部分開業                        | 133 | 1.94 上級前半 | 69.9%        | 30.1% | 49.6%      | —            |
| 信楽高原鐵道列車衝突事故…大阪地裁が認定       | 114 | 1.32 上級後半 | 71.1%        | 28.9% | 49.1%      | —            |
| ウィキニュース、21年の歴史に幕を閉じる        | 133 | 3.37 中級後半 | 67.7%        | 32.3% | 48.9%      | gap 1        |
| 野ばら（小川未明）                            | 145 | 4.52 初級後半 | 86.9%        | 13.1% | 22.1%      | **gap 2**    |
| ごん狐（新美南吉）                            | 125 | 4.27 中級前半 | 88.8%        | 11.2% | 24.8%      | gap 1        |
| やまなし（宮沢賢治）                          | 106 | 4.80 初級後半 | 85.8%        | 14.2% | 23.6%      | **gap 2**    |
| 育児休業                                      |   7 | 4.04 中級前半 | 100.0%       | 0.0%  | 0.0%       | gap 1        |
| 育児休業給付金                                |  13 | 5.72 初級前半 | 69.2%        | 30.8% | 46.2%      | **gap 2**    |
| 遺族基礎年金                                  |  15 | 3.58 中級前半 | 80.0%        | 20.0% | 20.0%      | gap 1        |

8 of 11 texts flag disagreement. Two separate things are wrong with that number.

**First: the three ISA glossary rows are n = 7, 13 and 15.** A glossary entry is
one sentence. Every percentage on those rows moves in steps of 7–14 points, so
none of them supports a conclusion about anything. They stay on the shelf because
they are the only committed corpus carrying **source ruby**, which is what they
are there to demonstrate — but their grades should be read as noise.

**Second: the gap-2 flags are an artifact of the reference distribution.** 野ばら
has 86.9% coverage and 22.1% core-TMR — _easy_ numbers, and jreadability agrees
(初級後半). All three signals say easy. The ordinal still reads
`{jread 0, coverage 2, tmr 2}` because the SNOW T15 reference is saturated: its
committed `lexical_coverage.edges` are literally `[1.0, 1.0]`, so anything short
of perfect coverage bins as maximally hard. #58 recorded the saturation as an
open question; the corridor is the first place it shows as a wrong answer on
screen, in red, on a children's story. Filed on #43.

### What the adequately-sized rows actually say

On the eight texts with n = 86–145, jreadability and coverage largely **agree**:
news is harder on both (jread 1.3–4.2, OOV 29–36%), aozora easier on both
(jread 4.3–4.8, OOV 11–14%). No sign inversion at this sample size.

The sharp case is a pair, not a single text:

|                       |   n | jreadability      | OOV       |
| --------------------- | --: | ----------------- | --------- |
| 野ばら                | 145 | **4.52** 初級後半 | **13.1%** |
| マリナーズ・イチロー… |  86 | **4.23** 中級前半 | **32.6%** |

**jreadability separates these two by 0.29 — call it identical — while the
vocabulary load differs by 2.5×.** A learner who can read 野ばら comfortably will
hit an unknown word every third content token in the baseball article. That is
sentence-length-and-POS being blind to lexis, on samples big enough to mean
something, and it is the argument on this shelf for never showing one number.

**Correction to an earlier draft of this log and of PR #59:** I first led with
育児休業給付金 (jread 5.72, OOV 30.8%) as the headline case. At n = 13 it cannot
bear that weight, and the pair above replaces it.

---

## 2. Measurement table — legibility and hierarchy (variant C, #47)

Measured by the verifier from `getComputedStyle`, alpha composited over the
washi ground, WCAG 2.x relative-luminance formula. Not eyeballed.

| element                 | px  | current fade | WCAG variant |
| ----------------------- | --- | ------------ | ------------ |
| reading body (focused)  | 21  | 17.22:1      | 17.22:1      |
| view title              | 22  | 17.22:1      | 17.22:1      |
| shelf title             | 19  | 17.22:1      | 17.22:1      |
| **discrimination note** | 13  | **9.52:1**   | 9.52:1       |
| reading, the one red    | 15  | 7.17:1       | 7.17:1       |
| gloss                   | 15  | **2.67:1**   | **6.05:1**   |
| shelf snippet           | 14  | **2.67:1**   | **6.05:1**   |
| signal label            | 12  | **2.67:1**   | **6.05:1**   |
| chrome breadcrumb       | 13  | **2.67:1**   | **6.05:1**   |
| eyebrow label           | 12  | **2.67:1**   | **6.05:1**   |

**This is the actual cost of the depth-by-fade aesthetic: 2.67:1.** AA needs
4.5:1. Drift's `--faint` alpha of .42 puts every secondary label at roughly
_half_ the required contrast. The WCAG variant raises alpha to .68 and lands at
6.05:1 — comfortably AA, and to my eye it loses very little of the depth.
Screenshots of both are in the PR; that is the choice to make by looking.

**Hierarchy** (the Drift red-team's inverted case was 11px labels against 22–43px
background words): reading body **21px** vs chrome **13px** — a 1.6× ratio in
the right direction. Focused content is the largest type on every screen.

**Hit targets:** every visible control ≥ 40px in both dimensions; the verifier
enumerates all of them and fails on any miss. Three real failures were caught
and fixed during the run (an inline 原典 link at 28×14, the variant strip's
toggle at 59×30, and its segment buttons at 126×34).

**Layout:** `document.scrollWidth` 390 == viewport 390. No horizontal scroll.
No console errors across the whole walk.

---

## 3. The walk

Every step verified against rendered DOM, not against a function returning
successfully.

| step            | evidence                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 arrive        | 11 texts, 33 signal rows, 8 disagreement tags, ready in ~210 ms                                                                                                                  |
| 2 read          | 900 chars, **130 `<rt>` elements** of real ruby                                                                                                                                  |
| 2 dials         | each axis moves only its own thing: furigana 130→0 rt with spacing class unchanged; spacing → 136 文節 groups with rt unchanged; kanji → 「2005年7月14日」→「2005ねん7がつ14か」 |
| 2 reveal        | 130 ruby present but `opacity:0`, revealed on touch                                                                                                                              |
| 3 tap a word    | panel opens with headword + reading                                                                                                                                              |
| 3 semantic      | 過酷 → **16 edges with notes**, e.g. 厳しい「everyday synonym, one register softer」                                                                                             |
| 4 word→kanji    | 過 — Overdo, 12画, 漢検 6級                                                                                                                                                      |
| 4 kanji→word    | 経過                                                                                                                                                                             |
| 4 kanji→radical | 咼, family of 4                                                                                                                                                                  |
| 4 radical→kanji | back out to 過                                                                                                                                                                   |
| 4 idioms        | present on the kanji page, tagged ShareAlike                                                                                                                                     |
| 5 take          | tray 取 1; FSRS-6 もう一度 1分 / 難しい 6分 / ふつう 10分 / 簡単 8日                                                                                                             |
| 6 return        | two hops deep, 戻る → scrollY 420 → 420, sheet closed                                                                                                                            |

The FSRS numbers are real: the four initial stabilities the page prints
(0.21 / 1.29 / 2.31 / 8.30) are `FSRS_WEIGHTS[0..3]` from
`packages/domain/src/reducers/fsrs-pin.ts` verbatim. `build_fsrs_pin.mjs` reads
that file, and `--check` fails the build if the emitted JSON ever drifts from it.

---

## 4. Decision queue — questions filed, not silently answered

| #   | question                                                                                                                                                                                     | where |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 32  | PRs #52–#58 are closed-not-merged; seven branches are out of the review queue                                                                                                                | #32   |
| 32  | The bulk corpora are gitignored — the committed shelf ceiling is 11 texts                                                                                                                    | #32   |
| 41  | The corridor loads both licence pools, so the deployed artifact is ShareAlike. Kept as separate bundles and marked in the UI rather than merged — is that the right reading of the boundary? | #41   |
| 43  | Coverage/TMR ordinals are unusable against the saturated SNOW reference; the aozora gap-2 flags are artifacts                                                                                | #43   |
| 43  | UniDic surface readings are wrong for counters after numerals (14日 → か). Source ruby has no such problem — evidence for preferring ruby-carrying corpora                                   | #43   |
| 47  | The fade costs 2.67:1 against 4.5:1 required. Both rendered                                                                                                                                  | #47   |
| 38  | MCD needs a source sentence; a word taken from a kanji page has none. Marked as placeholder in the UI                                                                                        | #38   |
| 37  | The entry "field" is a minimal placeholder, NOT Drift — #46's physics untouched                                                                                                              | #37   |
| 35  | No node/edge types were invented. Used: passage, word, kanji, radical, idiom                                                                                                                 | —     |

---

## 5. Honest coverage — what works, what is faked, what is placeholder

**Real, verified, not mocked**

- All 11 passages: real text from the committed samples, excerpted at sentence
  boundaries, with attribution and licence on screen.
- All three difficulty signals: the actual grader, the actual substrate.
- Furigana: source ruby where the corpus carries it (ISA glossary), pinned
  UniDic readings elsewhere — each labelled on the passage.
- 2,582 kanji, 926 components, 7,217 words, 900 idioms, 82 semantic heads.
- FSRS-6 preview: real ts-fsrs 5.4.1 under the domain kernel's pinned parameters.
- 漢検級 on every kanji that has one, from the CC0 fact table.

**Placeholder, marked as such in the UI**

- The entry field (variant D) — a minimal drifting field to compare _where you
  land_, not a Drift rewrite. Drift's lock physics and gesture grammar (#46) were
  not touched.
- The MCD card when a word is reached from a kanji page rather than from text.

**Absent, and the UI says so where you would notice**

- 283 distinct content tokens on the shelf have no gloss (they are outside the
  6,687-word lexicon). The panel still opens and still connects — it says the
  gloss is missing rather than showing an empty box.
- Semantic edges exist for 82 words (~1.2%). Words without them get an explicit
  empty state plus seeds into words that have them, rather than a dead panel.
- Kanji with no word in the lexicon (e.g. 咼) say so and continue via components.

**Declared caps** (in `data/manifest.json`, and printed in the UI where they bite)

- passage excerpt 520 chars · kanji→words shown 60 · radical→kanji shown 80 ·
  idioms 900 kept of 1,796 candidates from 4,198 in source.

**Not attempted** — sites-v11 harvest (#36), Anki import (#39), the generation
engine (#42), any scheduler write path, any mainstream Japanese news.

---

## 6. Deployment — blocked, and why

⚠️ **The Pages deploy from this branch is blocked by an environment protection
rule.** `pages-app.yml` was extended to publish `prototypes/corridor/` at
`/corridor/`, and dispatched against `claude/kairo-corridor`
([run 31129378848](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/31129378848)).
It failed **in 1 second with zero steps executed** — the job never started. That
is the signature of the `github-pages` environment's deployment-branch policy
(default: default branch only), not a build failure. Nothing in the workflow
change is at fault, and the corridor's own build is verified green.

I did not work around it by pushing to `main` — the brief says draft PRs only,
never merges.

**Two ways to open it:**

1. **One setting, then re-run.** Settings → Environments → `github-pages` →
   Deployment branches → add `claude/kairo-corridor` (or "All branches"), then
   re-run the workflow. `/corridor/` appears alongside the existing root and
   `/app/`. Merging the PR also does it, with no setting change.

2. **Right now, no settings.** `prototypes/corridor/corridor-standalone.html` is
   a single self-contained file — all CSS, JS, ts-fsrs and 1.8 MB of data
   inlined, no network at all. Download it from the PR and open it. Verified
   working from `file://` in Chromium: 11 texts, 33 signals, FSRS live.

Local:

```sh
node prototypes/corridor/tools/verify-corridor.mjs   # 38 checks + the screenshots
python3 -m http.server -d prototypes/corridor 8080   # then http://127.0.0.1:8080/
```

---

## 7. Notes for whoever picks this up

- The prototype is disposable by design. Nothing in `apps/app` or `packages/*`
  was refactored for it; the only shared touchpoint is `build_fsrs_pin.mjs`
  _reading_ the domain pin (never writing it).
- Screenshots were taken on a Linux runner. Noto Serif CJK JP was installed so
  they render in mincho; on iOS the stack resolves to Hiragino Mincho ProN, which
  is closer to the reference apps than what the runner shows.
- The verifier is the contract. If a change breaks the walk, it goes red on the
  specific step, with the DOM state that failed.

---

## 8. Phase 1 — the corpus pipeline revived (2026-08-08)

**Run:** cloud agent, branch `claude/kairo-prototype-phase-1-4hdre6`, base = PR #62
head (v1.8.2). **Verifier: 82/82 green** (was 71), real Chromium, Noto CJK,
390×844. Corpus unit tier: **185 passed** from a fresh editable install.

### 8.1 The revival itself

All seven closed PRs (#52–#58) still had living branches. Each was based
exactly on the merged corpus/00 skeleton, so all seven merged **clean, with
history and zero conflicts**: wikinews, aozora, SNOW, kanji fact table, JMdict
idioms, やさしい日本語, and the three-signal grader are now ON this branch —
nothing rebuilt, nothing lost. The `pyproject.toml` three-way overlap
(dev-deps / yasashii extra / package-data) merged textually without a single
conflict marker.

### 8.2 The wall this environment adds — and what was done about it

This runner's egress policy allows **GitHub and package registries, nothing
else**. Verified by probe: mmsrv.ninjal.ac.jp, dumps.wikimedia.org,
aozora.gr.jp, huggingface.co, archive.org — all `CONNECT 403`. Two of the
three shelf signals (語彙カバー率, TMR) need the NINJAL substrate download, so
in THIS environment they are **unmeasurable**. The previous round's numbers
were measured on 520-char excerpts; the shelf now shows full texts, so those
numbers are not true of what is displayed and were **not carried forward**
(they remain in §1 and in git history).

The law applied: **every signal shown is true of the exact text displayed.**

- `build_articles.py` computes what is computable here (jreadability + a new
  live lexical signal, below) and records the NINJAL pair as
  `unavailable` **with the reason string**, never a stale or faked number.
- The UI renders the pair as 「国語研語彙 — 未測定」 with a dashed, empty
  track (a bar would be a fake reading). A verifier check enforces
  "measured or marked 未測定 — never faked".
- Run the same command where mmsrv.ninjal.ac.jp is reachable and the pair
  fills in shelf-wide, sha256-pinned as before. One command, no code change.

### 8.3 The JLPT-lexicon signal (new, live, in-repo substrate)

Because "never use jreadability alone" is written into the grader itself, the
shelf needed a second live signal. The corridor already ships a 6,687-word
JLPT-tagged lexicon (`prototypes/drift/data/wbig.json`, open-anki-jlpt-decks
lineage). `jlpt_signal()` computes content-token coverage + an N5–N1/OOV band
vector against it, base-form matching only (the NINJAL matcher's homophone
conservatism, kept). Substrate named `open-anki-jlpt-decks/wbig-6687` in every
emission; the sources panel carries its ShareAlike row; the hint says
"unofficial list" — never presented as official JLPT.

### 8.4 The shelf: 11 excerpts → 26 full articles, loaded lazily

`build_articles.py` (the Phase-1 batch command) turns every rights-clean text
into one article JSON: tokens, furigana, paragraph starts, level signals,
provenance. The corridor boots from a light `index.json` (signals + metadata,
no tokens), fetches each article file on first open, and quietly prefetches
the rest. The 520-char excerpt cap is **gone** — ごん狐 ships whole (4,934
chars, paragraphs intact, verified to its closing sentence). Todai-scale is
now a data problem: adding an article is adding a file.

On it: 5 wikinews (full), 3 aozora (full), 10 やさしい日本語 entries, and
**the 8 parked v11 texts** — the Phase 1 definition of done.

### 8.5 Measurement — authored level vs the two live signals (v11 texts)

| text                     | authored | jreadability  | JLPT coverage |
| ------------------------ | -------- | ------------- | ------------- |
| 静かな朝                 | N5       | 4.82 初級後半 | 64.6%         |
| 雨の日の古本屋           | N4       | 4.10 中級前半 | 75.5%         |
| 知らない町を歩く         | N3       | 3.23 中級後半 | 62.9%         |
| 山を歩きながら考えたこと | N2       | 2.50 中級後半 | 58.2%         |
| AI時代の知識と判断       | N1       | 2.00 上級前半 | 56.4%         |
| 五箇条の御誓文           | N1       | 2.18 上級前半 | 47.8%         |
| 方丈記 · 冒頭            | N1+      | 3.95 中級前半 | 42.0%         |
| 徒然草 · 序段            | N1+      | 3.58 中級前半 | 36.5%         |

jreadability tracks the authored ladder **monotonically** across the five
originals (4.82 → 2.00) — the pipeline and the authoring agree. Then the
classics break it, in exactly the direction the three-signal design predicts:
方丈記 reads 中級前半 by sentence shape while its JLPT coverage (42.0%) is the
worst on the shelf outside 徒然草 — sentence-form easy, lexis hard, register
invisible to both. One number would have lied; two disagreeing signals tell
the truth. (This is §1's 野ばら/イチロー case, reproduced on classical text.)

### 8.6 Defects seen with my own eyes, filed honestly

- 七時 renders ruby ななじ (UniDic numeral+counter reading; しちじ is the
  common clock reading), 私 renders わたくし. Same class as §4's 14日→か,
  already filed on #43: tokenizer readings for numerals/counters are the weak
  point; ruby-carrying corpora don't have the problem.
- News texts show "~1 in 2 words beyond the JLPT lists" — true against a
  6,687-word learner lexicon (news carries names, geography, institutions),
  but the phrase reads heavier than the NINJAL "1 in 3". The hint explains
  the substrate; if the operator finds it noisy, the phrasing is one string.
- The disagreement flag currently fires nowhere: it needs ≥2 ordinal-capable
  signals and only jreadability has a published scale here. The verifier now
  asserts the invariant (flag ⇒ ≥2 ordinals) instead of asserting flags
  exist. Flags return with the NINJAL pair.

### 8.7 Not attempted, said plainly

SNOW/aozora/wikinews upstream expansion (egress-blocked here), semantic-tier
growth, grammar-in-reader detection (Phase 5), Drift fusion (Phase 2), any
scheduler write. The corpus `data/` dir stays gitignored; nothing bulk was
committed.

---

## 9. Phase 2, first segment — Drift becomes the front door (2026-08-08)

**Verifier: 86/86 green** (+4). Opening the app with no query now lands in the
real 墨流し universe — the corridor prototype's placeholder "field" is
superseded by the actual Drift, physics and all.

### 9.1 The fusion mechanism (no fork, no iframe, no seam)

`tools/build-drift-layer.mjs` extracts the red-team-hardened
`prototypes/drift/drift-artifact.html` (which stays **byte-untouched** as the
source of truth) into a corridor entry layer at build time:

- CSS scoped under `#drift-layer` (the file has no at-rules; `:root`/`body`
  rules collapse onto the layer, so drift's `--ink`/`--ground` never collide
  with the corridor's).
- The script wrapped and **gated**: 11 exact-string patches, each asserted to
  match exactly once — if drift's source changes shape, the build fails
  loudly instead of emitting a silently-broken fusion. The six window-level
  gesture listeners, both `setInterval`s and the rAF loop all sleep while the
  layer is hidden (`window.__DRIFT__.show()/hide()` is the whole seam;
  frame-dt is clamped upstream, so resume is safe).
- One real id collision found and renamed (`tray` → `drift-tray`; corridor's
  覚 button owns `#tray`), with counts asserted so a drift rename cannot
  silently bring the collision back.

### 9.2 The walk segment, verified

Boot → the living universe (64 DOM words adrift over the constellation
field), **corridor chrome riding above it** — 戻る/EN|日本語/覚 remain one
navigation fabric. One indigo door (本棚, palette law: 藍 = you can go here)
→ the 26-article shelf; 戻る → the universe again, exactly where physics
left it. `?entry=shelf` still boots straight to the shelf; the old
placeholder survives as `?entry=field`（札の野・旧）. While any other view is
open the layer is `display:none` and every drift listener early-returns —
measured zero console errors across the whole 86-check walk.

Occlusion corrections landed after looking at the first screenshot: drift's
brand, 北斎 theme toggle, counters and hint step inside the visible band
between corridor chrome and variant strip (presentation only; no physics
touched).

### 9.3 Honest costs and the next slices

- The layer embeds drift's own copies of wbig/radk/strokes/sem (~0.7 MB;
  standalone 7.37 → 8.11 MB, artifact cap 16 MB). Dedup path: feed the
  corridor's richer bundles (2,136 stroke sets vs drift's 114) through the
  `__DRIFT__` seam — a later slice, after the walk is whole.
- Next segment: a drifting word's committed card hands off into the
  corridor's full dictionary entry (word → 覚える → list, without leaving
  the app) — then the Drift grades and the corridor lists start feeding the
  same Phase 3 scheduler.

---

## 10. The bloom becomes a constellation you can hold (2026-08-08, operator round)

Operator, on-device: bloom satellites "nearly out of sight," threads faint,
and dragging the pressed word tore it off its own tethers — the constellation
stayed anchored to where the word USED to be while the glyph walked away,
then snapped back on release. Three orders, all landed in drift's source
(`drift-artifact.html` — the corridor layer regenerates from it):

1. **The relief.** The bloom is now its own layer over the receded field
   (dim 0.35 → 0.30): the pressed word turns the theme's accent (朱 in 北斎),
   satellites take 藍 pig2 (pale ultramarine on dark themes) at ~0.95
   presence, threads are gold at 0.5/1.5px. And the root cause of
   "nearly out of sight": most satellites existed only as 11px canvas labels
   — they now **materialize as real DOM words** on bloom (the same cure the
   red-team applied to the lock) and dissolve back on release.
2. **The tether.** The constellation re-anchors every frame to the word's
   LIVE position — drag included. On release the drag **commits to world
   space** (screen→world through the camera's rotation and zoom), so the
   word keeps its new place and the family settles around it. Measured:
   centre dragged 83–111px, mean tether 150→159px, spring-back 5px (wander).
3. **The clock.** Fade is now 10s of **inactivity**, not a flat 12s timer —
   any touch resets it. Measured: activity at t=8s kept the bloom alive at
   t=13s (the old code died at 12s); cleared by 19.5s. A water tap still
   releases immediately.

Ridden along: the fused layer's theme vars now land on `#drift-layer`
instead of `document.documentElement` — cycling drift's 夜 theme can no
longer repaint the corridor's shelf (a latent fusion leak caught in recon).

Verifier 86 → **90**: relief colour-family check (three distinct colours,
satellite floor scaled to the tapped word's kanji productivity),
drag-carries-the-constellation-and-sticks, water-tap release. Known niggle,
filed honestly: ring satellites can overlap each other at similar angles
(no label collision resolution yet — 飛び出す/出勤 touched in the round's
screenshot).
