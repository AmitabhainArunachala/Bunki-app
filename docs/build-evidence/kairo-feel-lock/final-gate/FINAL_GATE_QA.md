# FINAL GATE — full user-journey QA

**Under test:** `prototypes/corridor/corridor-standalone.html` — the committed
operator deliverable, **8,944,600 bytes**, 40-article shelf.
**Commit:** `claude/kairo-feel-lock-2026-08-09` @ `2541170` (checked out detached; the
tree was not modified except to add this directory). The remote branch has since
advanced by one commit, `376ba6d` "operator deliverables — tunables sheet +
plain-language changelog", which adds `TUNABLES.md` and `CHANGELOG_FEEL.md` and
touches **no code and no artifact** — the deliverable under test is byte-identical
at both commits.
**Instrument:** real Chromium via `playwright-core` 1.56.0 (`/opt/pw-browsers`), CDP
touch at **390×844**, plus **320×720** and **1280×900** passes.
**Date:** 2026-08-09.

---

## Verdict

| | |
|---|---|
| journey checks | **102 / 104 passed** |
| console + page errors, all 20 stages | **0** |
| gate items fully green | **18 / 20** |
| gate items with a red check | **2** (#16, #17) — both adjudicated below |
| `verify-v11` | 20/21 · **21/21** · **21/21** (3 runs) |
| `verify-drift-consistency --mode fast` | **45/45** · **45/45** (2 runs) |
| `verify-drift-hunt` | 4 fails · 5 fails (2 runs) — inside the documented 3–6 envelope, **no new kind** |
| `verify-corridor` | **91/91** |
| `verify-corridor-accessibility` | **19/20** — the documented pre-existing headless AX-name fail |

**The gate is green on the walk and on every suite that is meant to be green.**
The two red checks are named, reproduced in isolation, and shown below to be a
harness-aim artifact (#16) and a measurement that catches article *content*
rather than chrome (#17). Neither is a defect in the deliverable. They are
reported as red because that is what the instrument recorded.

---

## Per-item verdict

| # | Gate item | Checks | Verdict | Console/page errors |
|---|---|---|---|---|
| 1 | Arrival — drift front door, field alive | 4/4 | PASS | 0 |
| 2 | Word tap → ladder → full entry (WP3 seam) → chain walk → unwind | 12/12 | PASS | 0 |
| 3 | Satellite chain (staged default) | 4/4 | PASS | 0 |
| 4 | Pan / pinch in+out / double-tap return-to-rest | 6/6 | PASS | 0 |
| 5 | Tide slider — every stop N5→N1 | 2/2 | PASS | 0 |
| 6 | All drift themes incl. 夜, hint pill legible | 3/3 | PASS | 0 |
| 7 | Shelf — 40 articles, deep scroll, 戻る restores offset (WP5) | 4/4 | PASS | 0 |
| 8 | Search — kanji / kana / romaji / English | 10/10 | PASS | 0 |
| 9 | Grammar door | 3/3 | PASS | 0 |
| 10 | WP9b article — furigana, WP1 token heights, reader ladder | 10/10 | PASS | 0 |
| 11 | The three reader dials (WP5b hint copy) | 4/4 | PASS | 0 |
| 12 | WP6 variant rows — all four combos + behaviour | 5/5 | PASS | 0 |
| 13 | Particle hold → particle page | 3/3 | PASS | 0 |
| 14 | WP8 stroke-order page + no-data fallback | 8/8 | PASS | 0 |
| 15 | 覚える → lists / cloze / FSRS pin | 5/5 | PASS | 0 |
| 16 | Reload persistence | 2/3 | **FAIL** | 0 |
| 17 | Immersion toggle EN | 日本語 | 3/4 | **FAIL** | 0 |
| 18 | Variants panel — every row, ≥44px | 3/3 | PASS | 0 |
| 19 | Reduced motion | 5/5 | PASS | 0 |
| 20 | 320px and 1280px | 6/6 | PASS | 0 |

---

## The two reds, adjudicated

### #16 — "reload: the drift judgment survives in `bunki-drift-v1`" — RED

* **Expected:** a flick on a drift word grades it, writes `bunki-drift-v1`, and the
  entry survives a reload.
* **Observed in the journey:** `flicked "null" (tray now ""); bunki-drift-v1
  pre=null post=null` — across four attempts no flick registered as a judgment,
  so there was nothing for the reload to preserve. Screenshot
  `shots/75-after-reload.png`.
* **Reproduced in isolation — and it works.** `probes/probe-drift-flick.mjs`
  (committed beside this report) drives the *same* gesture parameters on the same
  build and the judgment lands **on the first attempt**:

  ```
  start                            { tray: '', store: null, words: 64 }
  flick {steps:3, per:0, dx:120} on "量"  →  tray '済み 1',
        store '{"known":{"量":1},"unknown":{},"lk":1,"lu":0}'
  mouse flick on "材料"                  →  tray '済み 2',
        store '{"known":{"量":1,"材料":1},"unknown":{},"lk":2,"lu":0}'
  ```

* **Why the journey missed it:** the journey's word picker allows a word as close
  as 46 px to the right edge, and the flick travels 120 px — the finger leaves the
  viewport mid-gesture, so the drift layer never sees a completed flick. The
  picker was tightened to require 150 px of clear room (`final-gate-journey.mjs`,
  stage 16), but that change landed **after** the run recorded here, so this
  report does not claim it green.
* **Corroboration that persistence itself is sound:** the corridor half of the
  same stage passes — `kairo-corridor-v1` keeps the 覚える item across the reload
  (`taken 1 → 1`), and `verify-drift-consistency` writes and reads the drift store
  45/45 in both runs.
* **Honest status:** the deliverable's flick-judgment persistence is **not
  disproven and is positively demonstrated by the isolated probe**; the journey
  check for it is **red on aim** and stays red in this record.

### #17 — "日本語のみ: the shelf sheds its English chrome — no latin leaks" — RED

* **Expected:** switching the chrome to 日本語 leaves no latin chrome on the shelf.
* **Observed:** `english affordance nodes = 0`; `latin runs = 8 ["No"]`, and every
  one of them is carried by a `.shelf-snippet` element. Screenshot
  `shots/76-immersion-ja-shelf.png`.
* **What `.shelf-snippet` is:** `corridor.js:1015` —
  `item.append(el('div', 'shelf-snippet', p.snippet ?? (p.text || '').slice(0, 64)))`.
  It is the **article's own opening 64 characters**. The latin here is the source
  text's own word, not an interface label.
* **The chrome itself is clean:** English affordance nodes are **0** on the shelf
  and **0** in the reader; the reader's latin count is **0**; the reader hint reads
  `触れる＝英語 · もう一度＝全項目 · フォーカス＝長押し不要の操作`; switching back to EN
  restores **46** English affordances.
* **Honest status:** the gate item's *intent* — no latin chrome leaks — is
  **met**. The check as written also reads the article bodies the shelf is
  previewing, and those are Japanese source texts that happen to contain the
  string "No". Recorded red; cause named; no change requested of the deliverable.

---

## Suites

Run on the checked-out tree against the committed artifacts. Raw logs in
`suites/`.

| suite | run 1 | run 2 | run 3 | log |
|---|---|---|---|---|
| `prototypes/drift/tools/verify-v11.mjs` | **20/21** | **21/21** | **21/21** | `suites/v11-run{1,2,3}.txt` |
| `verify-drift-consistency.mjs --mode fast` | **45/45 · 0 violations · 0 page errors** | **45/45 · 0 violations · 0 page errors** | — | `suites/drift-fast-run{1,2}.txt` |
| `verify-drift-hunt.mjs` | **4 regressions failing** | **5 regressions failing** | — | `suites/drift-hunt-run{1,2}.txt` |
| `verify-corridor.mjs` | **91/91**, "no console errors during the walk — clean" | — | — | `suites/corridor.txt` |
| `verify-corridor-accessibility.mjs` | **19/20** | — | — | `suites/corridor-a11y.txt` |
| `wp1/measure-token-heights.mjs` (all 40 articles) | **PASS** | — | — | `suites/wp1-token-heights-40-articles.json` |

### v11 — the single-check flake, reproduced once in three runs

Run 1 failed exactly one check:

```
FAIL  4-zoom-contention: after zoom (z=2.6) arbitrable contending pairs=1,
      left standing 17 too-quiet-to-win + 10 ghost-over-ghost,
      worstContention=1 · raw worstOverlap=1 over 34 pairs of 39 words
```

Runs 2 and 3 both returned **21/21**. `ERRORS: none` in all three. One arbitrable
contending pair is the marginal case; the WP2 baseline for this check failed with
**18** pairs and the WP2 post-fix runs record **0**. This is the known intermittent
single-check flake on this machine, not a regression: `wp6/README.md:180` records
`4-zoom-contention` passing in all four variant combos.

### drift-hunt — inside the documented envelope, no new kind

The documented machine envelope is **3–6** failing regressions
(`wp7/suites.md`, `wp7/README.md`, `wp6/README.md`). Observed **4** and **5**.
Every named failure is a documented kind:

| failing check | run 1 | run 2 | documented as |
|---|---|---|---|
| `a flick judgment sticks` | FAIL | pass | flaky on both sides (`wp7/README.md`) |
| `a corpus-backed semantic member is staged` | FAIL | FAIL | pre-existing (`wp7/README.md`) |
| `a kana-only semantic word grows a … fallback constellation` | FAIL | FAIL | documented (`wp6/README.md:248`, `wp2/verifier/round3`) |
| `hub release cannot hijack a gesture` | FAIL | FAIL | pre-existing on untouched HEAD (`wp7/suites.md:18-22`) |
| `a release on a hub sun releases the constellation` | pass | FAIL | harness aims at a hub sun whose field has moved (`wp7/README.md:96`) |
| `a held finger keeps a constellation alive past the 10s fade` | pass | FAIL | reported `no open water` (`wp7/README.md:97`) |

`no page errors across the regression battery` — **ok** in both runs.
**No new failure kind appeared.**

### accessibility — the documented 19/20

```
FAIL  screen-reader tree exposes named token and non-hold action buttons
      — 496 named button(s) in the accessibility tree
```

`wp3/README.md:216-220` records this exact check failing **identically on
untouched HEAD on this machine** (the committed report was captured with real
Chrome on macOS; headless Chromium's AX names differ). Not introduced here.

### WP1 re-measured across all 40 articles

The committed WP1 evidence covers 26 articles. Because WP9b added 14, WP1's own
instrument was re-run against the current shelf:

```
articles          40
tokens measured   9521
max token height  45.14px  (で in wikinews:1403)
hit regions <44px 0
offenders >50px   0
console errors    0
RESULT            PASS
```

The journey's own reading agrees: 125 `button.tok` on the N5 article, tallest
45.14 px, zero over 50. One *non-interactive* `span.tok.plain` ("なかっ") renders
at 70 px — `getClientRects().length === 2`, i.e. an ordinary two-line wrap of a
plain text run, not the torn-token defect WP1's 50 px ceiling exists to catch.
Reported separately rather than folded into the WP1 verdict.

---

## Notes on what the walk found about the app's own grammar

Three things the brief's phrasing and the shipped build describe differently.
Recorded because a gate should say what it saw:

1. **The drift ladder's third rung carries you IN; the full entry is one step
   further.** At the 3-stage default, tap 1 = forefront + family + reading,
   tap 2 = English, tap 3 = **dive** (the depth breadcrumb takes its first level).
   The corridor's own entry sheet opens from there by tapping the dive's centre —
   which raises the drift word card carrying `この語を学ぶ →` — and that door is the
   WP3 seam. The journey walks the whole path and asserts each step
   (`04`–`06` in `shots/`).
2. **The reader's default ladder is two rungs, not three**, because the ふりがな
   dial ships on つねに: the reading is already painted, so tap 1 gives English and
   tap 2 opens the full entry — exactly what the app's own hint says
   (`activate = English · again = full entry`). The three-rung shape the brief
   names is the ふりがな-off configuration, and the journey drives that too.
3. **`S.revealed` / `S.glossed` are keyed by token index and are not cleared
   between articles**, so a token at index *n* in a new article can open already
   glossed. Noted, not filed as a gate failure — no gate item covers it.

---

## Method notes (why these measurements can fail)

* **Camera zoom** is read off the *rendered* word matrices — the camera scale is
  baked into every word's `transform` — not from an internal variable. The
  corridor build wraps its drift layer in an IIFE, so `cam` is unreachable; the
  geometry is the honest instrument anyway. Rest = 1.0000, hard zoom = 2.600.
* **Camera rotation** is the best-fit ensemble rotation (2-D Kabsch) over only
  the words present in *both* snapshots, so the field's own respawn can neither
  manufacture nor hide a twist. The twist is proven to bite (2.390 rad under a
  150° gesture) *before* the reset is asked for, so a clamp reading zero because
  nothing moved cannot pass.
* **Drift liveness** is a matched-label displacement measurement over 3 s
  (4.41 px/s mean, 64/64 words moving) and, under `prefers-reduced-motion`, over
  5 s — where it reads **0.00 px total, 0 of 64 words moved**.
* **Hint-pill legibility** composites the pill's own plaque over the field ground
  and computes the WCAG ratio per theme (worst: 緑青 at 9.57:1).
* Every gesture begins with a `touchEnd []` to clear stale touch state, as
  `verify-v11` does; without it a leftover live touch silently swallows the next
  gesture's first move.

---

## Evidence

```
docs/build-evidence/kairo-feel-lock/final-gate/
├── FINAL_GATE_QA.md                 this report
├── final-gate-journey.mjs           the 20-stage journey script
├── final-gate-journey.txt           console transcript of the recorded run
├── final-gate-results.json          machine-readable per-check results
├── shots/                           93 numbered screenshots, one per step
├── suites/
│   ├── v11-run1.txt  v11-run2.txt  v11-run3.txt
│   ├── drift-fast-run1.txt  drift-fast-run2.txt
│   ├── drift-hunt-run1.txt  drift-hunt-run2.txt
│   ├── corridor.txt  corridor-a11y.txt
│   └── wp1-token-heights-40-articles.json
└── probes/
    ├── probe-drift-flick.mjs        disproof for red #16
    ├── probe-particle-hold.mjs      the particle door under CDP touch
    └── probe-article-after-drift.mjs an article still opens after a drift trip
```

Re-run the walk with:

```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
  node docs/build-evidence/kairo-feel-lock/final-gate/final-gate-journey.mjs
```

Suite-generated churn under `docs/audits/`, `docs/prototype/` and
`docs/build-evidence/kairo-a05-accessibility/` was reverted before committing;
only this directory is added.

---

## Full per-check detail

### 1 — Arrival — drift front door, field alive

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| the deliverable is the committed 8,944,600-byte standalone | PASS | 8944600 bytes | `01-arrival-390x844.png` |
| the drift front door renders (layer active, words painted, chrome up) | PASS | layer=true words=64 theme=北斎 hint="ことばに触れて" | `01-arrival-390x844.png` |
| the field is alive — nonzero drift measured on rendered word boxes | PASS | 64/64 words moved, mean 4.41 px/s, worst 24.4 px over 3s | `01-arrival-390x844.png` |
| stage 1: zero console/page errors | PASS | 0 errors | `01-arrival-390x844.png` |

### 2 — Word tap → ladder → full entry (WP3 seam) → chain walk → unwind

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| rung 1 (3-stage default): the word comes forefront with its family and its reading | PASS | "材料" unfolded=true centre=true satellites=14 glossed=false | `02-ladder-rung1-forefront-family-reading.png` |
| rung 2: the English gloss appears on the same word | PASS | "材料" glossed=true unfolded=true | `03-ladder-rung2-english.png` |
| rung 3: the word is carried in — the dive stack takes its first level | PASS | depth breadcrumb "材料" (1 level(s)); centre="null" | `04-ladder-rung3-carried-in.png` |
| WP3 seam: the drift word card carries a real study door (not the placeholder note) | PASS | card open=true, study door=true key="材料" label="この語を学ぶ →", placeholder note="" | `05-ladder-drift-card-with-study-door.png` |
| the full entry opens through the WP3 seam — the corridor’s own #sheet | PASS | #sheet=true node="word:材料" headword="材料" driftLayerAsleep=true | `06-ladder-full-entry-wp3-seam.png` |
| WP3 entry carries senses, kanji doors and a semantic neighbourhood section | PASS | senses=6 kanjiDoors=2 semRows=0 honest-empty-note=true 覚える=true | `06-ladder-full-entry-wp3-seam.png` |
| the 意味の近く rows render with their discrimination notes | PASS | 16 sem rows on "過酷" (reached via the honest empty-note chip); e.g. ["everyday synonym, one register softer","literary variant spelling"] | `07-ladder-sem-rows.png` |
| closing the entry hands the field back with the dive level untouched | PASS | depth "材料", dive centre "材料" -> "材料" | `07-ladder-sem-rows.png` |
| the chain walk reaches depth >= 3 | PASS | depth breadcrumb "材料 › 材 › 木" = 3 levels; trail = 材料:"材料" → kanji 材:"材料 › 材" → kanji 木:"材料 › 材 › 木" | `08-chain-walk-depth.png` |
| unwinding returns fully to the surface (dive stack empty, field repopulated) | PASS | depth="" words=64 centre=null | `09-unwound-to-surface.png` |
| the constellation machinery is intact after the walk (a centre still gathers its family) | PASS | raised "材料": centre="材料" satellites=14 (the walk began on "材料") | `10-constellation-intact-after-walk.png` |
| stage 2: zero console/page errors | PASS | 0 errors | `10-constellation-intact-after-walk.png` |

### 3 — Satellite chain (staged default)

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| a constellation raises with reachable satellites | PASS | centre="材料" satellites=14 pick="人材" | `11-constellation-raised.png` |
| staged default — satellite tap 1 reveals it IN PLACE, centre unchanged | PASS | "人材" unfolded=true glossed=true; centre "材料" -> "材料" | `12-satellite-tap1-reveal-in-place.png` |
| staged default — satellite tap 2 recentres: the satellite becomes the planet | PASS | centre "材料" -> "人材", satellites=14, depth="" | `13-satellite-tap2-recentre.png` |
| stage 3: zero console/page errors | PASS | 0 errors | `13-satellite-tap2-recentre.png` |

### 4 — Pan / pinch in+out / double-tap return-to-rest

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| pan moves the field | PASS | field centroid (195,356) -> (173,642) = 286.5 px | `14-camera-panned.png` |
| pinch out (spread) zooms in | PASS | camera scale 1.000 -> 2.600 (read off the rendered word matrices) | `15-camera-pinch-in.png` |
| pinch in zooms back out | PASS | camera scale 2.600 -> 0.585 | `16-camera-pinch-out.png` |
| the twist actually registered before the reset was asked for | PASS | best-fit ensemble rotation over 58 tracked words = 2.390 rad under a 150° twist | `18-camera-return-to-rest.png` |
| double-tap on open water returns to rest: camera z -> 1 and rotation -> 0 | PASS | z 2.600 -> 1.0000 (rest was 1.0000); ensemble \|rotation\| vs the pre-twist field NaN -> 0.0092 rad over 7 tracked words; 3 double-tap attempt(s) | `18-camera-return-to-rest.png` |
| stage 4: zero console/page errors | PASS | 0 errors | `18-camera-return-to-rest.png` |

### 5 — Tide slider — every stop N5→N1

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| the tide slider hits every stop N5→N1 and repopulates the field at each | PASS | N5: 64 words, "N5 · 小1–2 · 漢検10–9級", +0 err \| N4: 64 words, "N4 · 小3–4 · 漢検8–7級", +0 err \| N3: 64 words, "N3 · 小5–6 · 漢検6–5級", +0 err \| N2: 64 words, "N2 · 中学 · 漢検4–3級", +0 err \| N1: 64 words, "N1 · 高校+ · 漢検準2–2級", +0 err | `23-tide-N1.png` |
| stage 5: zero console/page errors | PASS | 0 errors | `23-tide-N1.png` |

### 6 — All drift themes incl. 夜, hint pill legible

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| every drift theme cycles, including 夜 | PASS | cycle: 北斎 → 墨 → 岩絵具 → 緑青 → 夜 → 北斎 | `29-theme-北斎.png` |
| the hint pill stays legible (>= 4.5:1) in every theme | PASS | 北斎=13.91 墨=13.23 岩絵具=11.4 緑青=9.57 夜=15.02 北斎=13.91 | `29-theme-北斎.png` |
| stage 6: zero console/page errors | PASS | 0 errors | `29-theme-北斎.png` |

### 7 — Shelf — 40 articles, deep scroll, 戻る restores offset (WP5)

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| the shelf carries 40 articles (WP9b) | PASS | 40 shelf items | `30-shelf-top.png` |
| an article opens from deep in the shelf | PASS | "朝の市場" (bunki-graded-n4-market), 194 tokens, shelf offset was 9209 | `32-article-opened-from-deep-shelf.png` |
| WP5: 戻る restores the shelf scroll offset exactly | PASS | 9209 -> 9209 (delta 0 px) | `33-shelf-scroll-restored.png` |
| stage 7: zero console/page errors | PASS | 0 errors | `33-shelf-scroll-restored.png` |

### 8 — Search — kanji / kana / romaji / English

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| search — kanji "世" returns results | PASS | 40 hits, first "世よworld›" | `34-search-kanji-世.png` |
| search — "世": the first result opens an entry | PASS | sheet=true node="word:世" headword="世" readerTokens=0 | `35-search-kanji-世-opened.png` |
| search — kana "せかい" returns results | PASS | 10 hits, first "世界せかいthe world›" | `36-search-kana-せかい.png` |
| search — "せかい": the first result opens an entry | PASS | sheet=true node="word:世界" headword="世界" readerTokens=0 | `37-search-kana-せかい-opened.png` |
| search — romaji "sekai" returns results | PASS | 10 hits, first "世界せかいthe world›" | `38-search-romaji-sekai.png` |
| search — "sekai": the first result opens an entry | PASS | sheet=true node="word:世界" headword="世界" readerTokens=0 | `39-search-romaji-sekai-opened.png` |
| search — English "world" returns results | PASS | 40 hits, first "世界せかいthe world›" | `40-search-English-world.png` |
| search — English "world" ranks 世界 first | PASS | first hit "世界せかいthe world›" (ja part "") | `40-search-English-world.png` |
| search — "world": the first result opens an entry | PASS | sheet=true node="word:世界" headword="世界" readerTokens=0 | `41-search-English-world-opened.png` |
| stage 8: zero console/page errors | PASS | 0 errors | `33-shelf-scroll-restored.png` |

### 9 — Grammar door

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| the grammar door opens a grammar index | PASS | title "Grammar", 60 grammar rows, ばかり at row 39 | `42-grammar-index.png` |
| a grammar entry (ばかり) opens with its formation and examples | PASS | node="grammar:bakari" headword="〜ばかり" formation="動詞タ形 + ばかり／名詞 + ばかり" examples=2 | `43-grammar-entry-bakari.png` |
| stage 9: zero console/page errors | PASS | 0 errors | `43-grammar-entry-bakari.png` |

### 10 — WP9b article — furigana, WP1 token heights, reader ladder

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| a NEW WP9b article (bunki-graded-n5-*) is on the shelf | PASS | index 18, id "bunki-graded-n5-morning", title "静かな朝" | `43-grammar-entry-bakari.png` |
| the WP9b article renders its tokens with furigana | PASS | 198 tokens (79 content), 63 ruby, 63 visible rt — "静かな朝" | `44-wp9b-n5-article-open.png` |
| WP1: zero interactive tokens taller than 50px (every button.tok measured) | PASS | 125 button.tok measured, tallest 45.14px on "に", over-50 = 0 | `44-wp9b-n5-article-open.png` |
| WP1 (wider read): no non-interactive .tok run is a TORN token either | PASS | 73 plain .tok runs, tallest 70px; over-50 = 1; all of them ordinary line wraps: [{"t":"なかっ","h":70,"lines":2,"cls":"tok plain"}] | `44-wp9b-n5-article-open.png` |
| reader at the dial default (ふりがな=つねに): the reading is already on and tap 1 gives the English | PASS | hint says "activate = English · again = full entry · focus = no-hold actions"; token "起きる" rt 1 -> 1, tok-en 0 -> 1 ("to rise"), sheet=false | `45-reader-default-tap1.png` |
| reader at the dial default: tap 2 opens the full entry | PASS | sheet=true headword="起きる" | `46-reader-default-tap2-full-entry.png` |
| reader with ふりがな off: tap 1 reveals the reading only | PASS | hint "activate = reading · again = English · third = full entry · focus = no-hold actions"; untouched token "開ける" (index 4): rt 0 -> 1, tok-en 0 -> 0, sheet=false | `47-reader-3rung-tap1-reading.png` |
| reader with ふりがな off: tap 2 puts the English under the word | PASS | tok-en=1 "to open", sheet=false | `48-reader-3rung-tap2-english.png` |
| reader with ふりがな off: tap 3 opens the full entry | PASS | sheet=true | `49-reader-3rung-tap3-full-entry.png` |
| stage 10: zero console/page errors | PASS | 0 errors | `49-reader-3rung-tap3-full-entry.png` |

### 11 — The three reader dials (WP5b hint copy)

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| all three reader dials are present (漢字 / ふりがな / 分かち) | PASS | 3 dials: 漢字kanji \| ふりがなreadings \| 分かちspacing | `50-dials-open.png` |
| every dial setting cycles cleanly — max interactive token height never exceeds 50px | PASS | 9 settings driven; worst max button.tok height 45.14px; settings breaking the ceiling: 0 | `60-dials-back-to-default.png` |
| WP5b: the hint copy changes when the ふりがな dial reaches つねに | PASS | off: "activate = reading · again = English · third = full entry · focus = no-hold actions" \| always: "activate = English · again = full entry · focus = no-hold actions" | `60-dials-back-to-default.png` |
| stage 11: zero console/page errors | PASS | 0 errors | `60-dials-back-to-default.png` |

### 12 — WP6 variant rows — all four combos + behaviour

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| WP6: all four ladder × satellite combos are settable from the strip and reach the drift layer | PASS | stage3/staged→stage3/staged \| stage3/recenter→stage3/recenter \| stage4/staged→stage4/staged \| stage4/recenter→stage4/recenter | `61-wp6-combos-set.png` |
| WP6 stage4 changes the rung behaviour: rung 1 raises the family with nothing read yet | PASS | "待遇": satellites=10 centre="待遇" unfolded=false glossed=false (stage3 rung 1 had unfolded=true); words tried: ["待遇"] | `62-wp6-stage4-rung1-family-only.png` |
| WP6 recenter changes the rung behaviour: ONE satellite tap makes it the planet | PASS | tapped satellite "地形" once: centre "植民地" -> "地形" (staged needed two taps) | `63-wp6-sattap-recenter-tap1.png` |
| both WP6 rows switch back to their defaults (3-stage / staged) | PASS | {"ladder":"stage3","satTap":"staged"} | `63-wp6-sattap-recenter-tap1.png` |
| stage 12: zero console/page errors | PASS | 0 errors | `63-wp6-sattap-recenter-tap1.png` |

### 13 — Particle hold → particle page

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| the reader is standing before the particle hold | PASS | "世界自然遺産に7箇所を追加 知床半島も" (wikinews:1403) with 711 tokens; body[data-view]="reader" driftActive=false | `63-wp6-sattap-recenter-tap1.png` |
| holding a particle opens its particle page with examples | PASS | 144 particle doors in this article; held "で" → node="particle:de" headword="で　particle" role="place-of-action · means" examples=2 | `64-particle-page.png` |
| stage 13: zero console/page errors | PASS | 0 errors | `64-particle-page.png` |

### 14 — WP8 stroke-order page + no-data fallback

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| a kanji door opens a kanji sheet carrying the 筆順 door | PASS | 1 kanji rows on the word sheet; kanji sheet node="kanji:年", door strokes=6 | `65-kanji-sheet-with-stroke-door.png` |
| WP8: the stroke page opens full-screen with a counter, replay and a numbers toggle | PASS | 390×844 vs viewport 390×844; kanji=年 state=drawing motion=full; counter "3 / 6" of 6; 6 stroke paths | `66-stroke-page-open.png` |
| WP8: the strokes animate — the counter advances unaided | PASS | stroke counter 3 → 6 over 2.6s (of 6) | `67-stroke-page-animating.png` |
| WP8: replay restarts the animation from the first stroke | PASS | after replay counter dropped to 2 then climbed to 5 (was 6) | `68-stroke-page-replay.png` |
| WP8: the numbers toggle changes what is painted | PASS | data-numbers on → off; the 番号 group display inline → none, painted box true → false (6 → 0 numerals with a rendered box) | `69-stroke-page-numbers-off.png` |
| WP8: 戻る returns to the kanji sheet at its exact scroll offset | PASS | sheet=true node="kanji:年" scrollTop 120 → 120 | `70-stroke-back-restores-sheet.png` |
| WP8: a no-data kanji (丑) gives an honest fallback, not an empty frame | PASS | open=search "丑" → 2 hits, first "丑うしthe Ox (second sign of the "; landed on kanji:丑 sheetNode="kanji:丑" door.strokes="0" → page state="nodata" missing=true inkPaths=0; it says: "Stroke data not yet available." | `71-stroke-nodata-fallback-丑.png` |
| stage 14: zero console/page errors | PASS | 0 errors | `71-stroke-nodata-fallback-丑.png` |

### 15 — 覚える → lists / cloze / FSRS pin

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| 覚える takes an item from a full entry and stores it | PASS | "覚えるmemorize" → "覚える ✓memorizing" on "月"; store.taken=1, first={"t":"word","id":"月","label":"月","kind":"語","kindEn":"word","from":{"passage":"wikinews:14 | `72-memorize-taken.png` |
| the lists view shows the taken item | PASS | title "Memorizing 1 item"; 1 tray line(s) under ["2026年8月 — 1auto · monthl"]; first line "月wordin 10 min" | `73-memorize-lists-view.png` |
| a cloze / schedule preview renders in the memorize loop | PASS | cloze=false schedule=true; the line's next-due reads "in 10 min" — "リストyour listsMemorizing 1 item2026年8月 — 1auto · monthly月wordin 10 min" | `73-memorize-lists-view.png` |
| FSRS pin: no aggregate mastery score anywhere on the memorize surfaces | PASS | mastery/percentage pattern present = false | `73-memorize-lists-view.png` |
| stage 15: zero console/page errors | PASS | 0 errors | `73-memorize-lists-view.png` |

### 16 — Reload persistence

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| reload: the 覚える item survives in kairo-corridor-v1 | PASS | taken 1 → 1, first={"t":"word","id":"月","label":"月","kind":"語","kindEn":"word","from":{"passage":"w | `75-after-reload.png` |
| reload: the drift judgment survives in bunki-drift-v1 | **FAIL** | flicked "null" (tray now ""); bunki-drift-v1 pre=null post=null | `75-after-reload.png` |
| stage 16: zero console/page errors | PASS | 0 errors | `75-after-reload.png` |

### 17 — Immersion toggle EN | 日本語

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| 日本語のみ: the shelf sheds its English chrome — no latin leaks | **FAIL** | 40 items; english affordance nodes=0 []; latin runs=8 ["No"]; carried by [{"cls":"shelf-snippet","words":["No"]},{"cls":"shelf-snippet","words":["No"]},{"cls":"shelf-snippet","words":["No"]},{"cls":"shelf-snippet","words":["No"]},{"cls":"shelf-snippet","words":["No"]},{"cls":"shelf-snippet","words":["No"]}] | `76-immersion-ja-shelf.png` |
| 日本語のみ: the reader chrome carries no latin | PASS | 711 tokens; hint "触れる＝英語 · もう一度＝全項目 · フォーカス＝長押し不要の操作"; english nodes=0; latin=0 []; carried by [] | `77-immersion-ja-reader.png` |
| switching back to EN restores the bilingual chrome | PASS | 46 english affordances back | `78-immersion-back-to-EN.png` |
| stage 17: zero console/page errors | PASS | 0 errors | `78-immersion-back-to-EN.png` |

### 18 — Variants panel — every row, ≥44px

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| every variants row is present, including WP6’s F 触れの段 and G 衛星の触れ | PASS | 7 rows: A B C D E F G | `79-variants-panel-all-rows.png` |
| every variants control is at least 44px on both axes | PASS | 15 controls; 0 under 44px | `79-variants-panel-all-rows.png` |
| stage 18: zero console/page errors | PASS | 0 errors | `79-variants-panel-all-rows.png` |

### 19 — Reduced motion

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| prefers-reduced-motion: the drift field is completely still (0.00 px/s over 5s) | PASS | 0/64 words moved; total 0.00 px, worst single word 0.00 px, mean 0.000 px/s over 5s | `80-reduced-motion-arrival.png` |
| reduced motion: interactions still work — a tap still climbs the ladder | PASS | tapped "材料": unfolded=1 satellites=14 centre="材料" | `81-reduced-motion-tap-still-works.png` |
| reduced motion: the stroke page is static — nothing animates on its own | PASS | data-motion=reduced; counter 6 → 6 over 2.6s (of 6) | `82-reduced-motion-stroke-page-static.png` |
| reduced motion: the stroke page offers step-through and both directions move | PASS | prev=true next=true; counter 6 →(前の画) 5 →(次の画) 6 of 6 | `83-reduced-motion-stroke-stepped.png` |
| stage 19: zero console/page errors | PASS | 0 errors | `83-reduced-motion-stroke-stepped.png` |

### 20 — 320px and 1280px

| Check | Verdict | Measured | Evidence |
|---|---|---|---|
| 320px: no horizontal overflow on shelf / reader / sheet / search | PASS | drift 320/320 · shelf 320/320 · search 320/320 · reader 320/320 · sheet 320/320 | `88-320-sheet.png` |
| 1280px: the drift field is full-bleed | PASS | layer 1280×900 at (0,0) vs viewport 1280×900; 64 words | `89-1280-drift.png` |
| WP5d: the 1280 reader measure is 760–880px and centred | PASS | measure 788px; gutters 246 / 246 at viewport 1280 | `92-1280-reader.png` |
| 1280px desktop: a full entry opens from the reader without touch | PASS | sheet=true headword="年" | `93-1280-sheet.png` |
| 1280px: no horizontal overflow on shelf / reader / sheet / search | PASS | drift 1280/1280 · shelf 1280/1280 · search 1280/1280 · reader 1280/1280 · sheet 1280/1280 | `93-1280-sheet.png` |
| stage 20: zero console/page errors | PASS | 0 errors | `93-1280-sheet.png` |
