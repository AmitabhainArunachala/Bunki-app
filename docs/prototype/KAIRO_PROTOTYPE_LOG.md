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
`data/`, so those live only on the machine that built them. What *is* committed:

| asset | committed? | size |
| --- | --- | --- |
| kanken kanji fact table | ✅ 6,787 rows | 2.2 MB |
| JMdict idiom layer | ✅ 4,198 | 971 KB |
| wikinews | sample only, 5 articles | 15 KB |
| aozora | sample only, 3 works | 31 KB |
| やさしい日本語 glossary | sample only, ~25 entries | 4.6 KB |
| SNOW T15/T23 | sample only | 3.2 KB |
| the three-signal grader | ✅ code, no output | — |

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

| text | jreadability | 語彙カバー率 | TMR (core) | disagreement |
| --- | --- | --- | --- | --- |
| 世界自然遺産に7箇所を追加 知床半島も | 2.42 上級前半 | 63.7% | 57.0% | — |
| マリナーズ・イチロー選手 現役通算2500安打達成 | 4.23 中級前半 | 67.4% | 41.9% | gap 1 |
| JRおおさか東線部分開業 | 1.94 上級前半 | 69.9% | 49.6% | — |
| 信楽高原鐵道列車衝突事故…大阪地裁が認定 | 1.32 上級後半 | 71.1% | 49.1% | — |
| ウィキニュース、21年の歴史に幕を閉じる | 3.37 中級後半 | 67.7% | 48.9% | gap 1 |
| 野ばら（小川未明） | 4.52 初級後半 | 86.9% | 22.1% | **gap 2** |
| ごん狐（新美南吉） | 4.27 中級前半 | 88.8% | 24.8% | gap 1 |
| やまなし（宮沢賢治） | 4.80 初級後半 | 85.8% | 23.6% | **gap 2** |
| 育児休業 | 4.04 中級前半 | 100.0% | 0.0% | gap 1 |
| 育児休業給付金 | 5.72 初級前半 | 69.2% | 46.2% | **gap 2** |
| 遺族基礎年金 | 3.58 中級前半 | 80.0% | 20.0% | gap 1 |

8 of 11 texts flag disagreement.

**But read the gap-2 rows carefully before believing them.** 野ばら has 86.9%
coverage and 22.1% core-TMR — those are *easy* numbers in absolute terms, and
jreadability agrees (初級後半). The ordinal still comes out "hard" because the
SNOW T15 reference distribution is saturated: >2/3 of its sentences have
coverage exactly 1.0, so the tercile edges are [1.0, 1.0] and anything below
perfect coverage bins as maximally hard. **The gap-2 flags on the aozora texts
are an artifact of the reference distribution, not a real disagreement between
signals.** #58 documented this saturation as an open question; the corridor is
the first place it is visible as a wrong answer on screen. Filed on #43.

The genuine, non-artifactual finding is the opposite direction: the news texts
score 1.3–2.4 on jreadability (上級 = hard) while their coverage sits at 64–71%,
and the ISA glossary entry 育児休業給付金 scores **5.72 初級前半 — the "easiest"
text on the shelf — while 30.8% of its content tokens are outside the 6,103-word
substrate entirely.** That is jreadability's sentence-length-and-POS formula
being blind to vocabulary, exactly the failure #58 measured. It is the clearest
single argument on the shelf for never showing one number.

---

## 2. Measurement table — legibility and hierarchy (variant C, #47)

Measured by the verifier from `getComputedStyle`, alpha composited over the
washi ground, WCAG 2.x relative-luminance formula. Not eyeballed.

| element | px | current fade | WCAG variant |
| --- | --- | --- | --- |
| reading body (focused) | 21 | 17.22:1 | 17.22:1 |
| view title | 22 | 17.22:1 | 17.22:1 |
| shelf title | 19 | 17.22:1 | 17.22:1 |
| **discrimination note** | 13 | **9.52:1** | 9.52:1 |
| reading, the one red | 15 | 7.17:1 | 7.17:1 |
| gloss | 15 | **2.67:1** | **6.05:1** |
| shelf snippet | 14 | **2.67:1** | **6.05:1** |
| signal label | 12 | **2.67:1** | **6.05:1** |
| chrome breadcrumb | 13 | **2.67:1** | **6.05:1** |
| eyebrow label | 12 | **2.67:1** | **6.05:1** |

**This is the actual cost of the depth-by-fade aesthetic: 2.67:1.** AA needs
4.5:1. Drift's `--faint` alpha of .42 puts every secondary label at roughly
*half* the required contrast. The WCAG variant raises alpha to .68 and lands at
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

| step | evidence |
| --- | --- |
| 1 arrive | 11 texts, 33 signal rows, 8 disagreement tags, ready in ~210 ms |
| 2 read | 900 chars, **130 `<rt>` elements** of real ruby |
| 2 dials | each axis moves only its own thing: furigana 130→0 rt with spacing class unchanged; spacing → 136 文節 groups with rt unchanged; kanji → 「2005年7月14日」→「2005ねん7がつ14か」 |
| 2 reveal | 130 ruby present but `opacity:0`, revealed on touch |
| 3 tap a word | panel opens with headword + reading |
| 3 semantic | 過酷 → **16 edges with notes**, e.g. 厳しい「everyday synonym, one register softer」 |
| 4 word→kanji | 過 — Overdo, 12画, 漢検 6級 |
| 4 kanji→word | 経過 |
| 4 kanji→radical | 咼, family of 4 |
| 4 radical→kanji | back out to 過 |
| 4 idioms | present on the kanji page, tagged ShareAlike |
| 5 take | tray 取 1; FSRS-6 もう一度 1分 / 難しい 6分 / ふつう 10分 / 簡単 8日 |
| 6 return | two hops deep, 戻る → scrollY 420 → 420, sheet closed |

The FSRS numbers are real: the four initial stabilities the page prints
(0.21 / 1.29 / 2.31 / 8.30) are `FSRS_WEIGHTS[0..3]` from
`packages/domain/src/reducers/fsrs-pin.ts` verbatim. `build_fsrs_pin.mjs` reads
that file, and `--check` fails the build if the emitted JSON ever drifts from it.

---

## 4. Decision queue — questions filed, not silently answered

| # | question | where |
| --- | --- | --- |
| 32 | PRs #52–#58 are closed-not-merged; seven branches are out of the review queue | #32 |
| 32 | The bulk corpora are gitignored — the committed shelf ceiling is 11 texts | #32 |
| 41 | The corridor loads both licence pools, so the deployed artifact is ShareAlike. Kept as separate bundles and marked in the UI rather than merged — is that the right reading of the boundary? | #41 |
| 43 | Coverage/TMR ordinals are unusable against the saturated SNOW reference; the aozora gap-2 flags are artifacts | #43 |
| 43 | UniDic surface readings are wrong for counters after numerals (14日 → か). Source ruby has no such problem — evidence for preferring ruby-carrying corpora | #43 |
| 47 | The fade costs 2.67:1 against 4.5:1 required. Both rendered | #47 |
| 38 | MCD needs a source sentence; a word taken from a kanji page has none. Marked as placeholder in the UI | #38 |
| 37 | The entry "field" is a minimal placeholder, NOT Drift — #46's physics untouched | #37 |
| 35 | No node/edge types were invented. Used: passage, word, kanji, radical, idiom | — |

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
- The entry field (variant D) — a minimal drifting field to compare *where you
  land*, not a Drift rewrite. Drift's lock physics and gesture grammar (#46) were
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
  *reading* the domain pin (never writing it).
- Screenshots were taken on a Linux runner. Noto Serif CJK JP was installed so
  they render in mincho; on iOS the stack resolves to Hiragino Mincho ProN, which
  is closer to the reference apps than what the runner shows.
- The verifier is the contract. If a change breaks the walk, it goes red on the
  specific step, with the DOM state that failed.
