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
| 1 arrive        | 11 texts, 33 signal rows, 8 disagreement tags; ready in min 137 / median 189 / max 212 ms over 7 cold loads (localhost, excludes network)                                        |
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

## 6. Deployment — live

**https://amitabhainarunachala.github.io/Bunki-app/corridor/**

Deployed from `main` after #59 was merged
([run 31147490047](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/31147490047)).
Alongside the existing root and `/app/`, both unchanged.

### It was blocked first, and the block is worth recording

`pages-app.yml` was extended to publish `prototypes/corridor/` at `/corridor/`
and dispatched against `claude/kairo-corridor`
([run 31129378848](https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/31129378848)).
It failed **in 1 second with zero steps executed** — the job never started. That
is the signature of the `github-pages` environment's deployment-branch policy
(default: default branch only), not a build failure. Nothing in the workflow
change was at fault.

I did not work around it by pushing to `main`; the brief said draft PRs only.
Merging resolved it without any setting change, because `main` is what the
policy was waiting for. **If a future prototype needs to deploy from a branch,
that policy is the thing to change** — add the branch under Settings →
Environments → `github-pages` → Deployment branches.

Second-order note for anyone estimating turnaround: the successful run sat
**queued for 23 minutes** (04:27:48 → 04:51:10 UTC) before a runner picked it
up, then published in about 70 seconds. Runner congestion, not the build.

### What was verified about the deployed artifact

All 13 published files were fetched from Pages with `curl` and compared against
merged `main`: **13/13 byte-identical**, with the content types the app needs
(`.mjs` as `text/javascript`, `.json` as `application/json`). The full check set
was then run against those exact published bytes: **38/38**.

⚠️ **A limit on that claim.** Chromium in the build container cannot reach the
public internet — `example.com` and the Pages URL both fail with
`ERR_CONNECTION_RESET`, via Playwright's `proxy` option and via
`--proxy-server`, with the egress proxy logging zero relay attempts. `curl`
works; the browser does not. So the checks ran against the **published bytes
served locally**, not a live browser session against `github.io`. The bytes are
proven identical and the URL is proven to serve 200 with correct types, but
end-to-end CDN behaviour was not exercised from here.

Mirroring is easy to get wrong in a way that fakes a pass: the first mirror pass
missed `data/coverage.json`, `data/fsrs-pin.json` and `data/manifest.json`
because only the two pool subdirectories were enumerated. The page then hung at
"ready" forever. If you repeat this, enumerate `data/` recursively and serve
`.mjs` as `text/javascript` — `python3 -m http.server` does not, and strict MIME
checking silently blocks the module.

### Offline fallback

`prototypes/corridor/corridor-standalone.html` is a single self-contained file —
all CSS, JS, ts-fsrs and 1.8 MB of data inlined, no network at all. Verified
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
