# RENKAN C1 — end-to-end reader demonstration

**SHA:** `10c440c006bec111617c19279b81ea2e99fc7a67`  ·  **tree:** `115b3a0b813787ca5ee18af715aecf5a54036270`  ·  **branch:** `claude/renkan-one-push-2026-08-16`
**Date:** 2026-08-16
**Serve:** `python3 -m http.server 8907` from `prototypes/corridor` (static, unmodified tree)
**Driver:** playwright-core → headless Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), mobile emulation 390×844 dpr3 touch, plus a 320×568 spot check
**Learner state:** cold open (empty store); every stage builds on the state the walk itself created
**Result:** 19/20 stages PASS · 85/86 assertions PASS (1 FAIL)

## What was demonstrated (each stage screenshotted, DOM-asserted in walk-log.json)

1. Cold-open shelf — category sections, EN titles under `?ui=bi`, 検収前 marks on unapproved cards.
2. Approved lane — `wikinews:1403` opens its full body, exact title match, attribution + licence, back restores shelf scroll.
3. Flagship 検収前 reading — `bunki-graded-n3-zoka-sanjin-morning` (造化三神に出会う朝), full 703-token body, provenance carried into the reader.
4–6. The three dials — 漢字 (all-kana proven on 図書→としょ), ふりがな (つねに/触れて), 分かち (文節/語の間/なし).
7. The progressive tap ladder on 「朝」 — furigana → gloss → plain, the circle closes.
8. Long-press quick look on 「結論」 — mini dictionary with reading, gloss, 覚 seal, full-entry door.
9. The full dictionary entry (sheet) with its own 覚 seal.
10. 戻る restores the article at the same scroll position (≤20px).
11. 覚える from the top-right — word captured **with its sentence** (`ctx {p,i,scope}`); scope stages 語だけ/この文/段落ごと proven to commit.
12. The tray — the captured item counted, review offered.
13–14. Declared-recall review — the captured sentence asks as a cloze; 思い出した/まだ gate the reveal; all four grades open after 思い出した.
15. The answer face's ▹ sentence door — opens the sentence page with its source label; **see finding below**.
16. 良 (Good) — the new card enters its learning step (due +10min), the session pulls the re-inserted pass early (learn-ahead) and closes when the card graduates; one revlog row per grade (12-field shape, rating 3, monotonic instants, future due), FSRS state + day stats persisted.
17. Export door — the `v:1` envelope produced and key-asserted; `lastExportTs` stamped.
18. Device Back — sentinel-armed, walks one level at a time (tray → its article → shelf, scroll restored), consumed at home.
19. Reload mid-article — bookmark persisted (900ms debounce), shelf shows 途中, reopening restores the position ≤20px and the same sentence.
20. 320×568 spot check — shelf and reader, no horizontal overflow.

## Honest failures / findings

- **15 review-sentence-door** — a door from the review answer face to the FULL article exists: PRODUCT GAP (recorded honestly): the ▹ door opens the sentence on its own page with its source label, but no control walks on to the full article body (rubric §9.5 "Review answer snapshot returns to the source sentence and article" — only the sentence half exists)
- **07 tap-ladder** (INFO finding, stage itself passed) — FINDING · overlapping 44px hit regions: the geometric center of narrow token 0「朝」resolves to its DOM-later neighbour (BUTTON.tok plain particle); the tap landed at fx=0.35 instead. Adjacent expanded hit regions overlap and the later token wins — a center-tap on a one-kanji word can fall on the following (inert) particle.

## What was NOT demonstrated (honesty labels)

- **No audio.** The corridor reader has no audio implementation (rubric §3.4); there is no audio stage to walk and none is claimed.
- **Web-verified only.** Headless Chromium mobile emulation on a local static server — not a physical iPhone, not Safari/WebKit, not a deployed URL. The URL↔SHA receipt here binds a *local* serve of this exact tree, not a public deployment.
- **No comprehension questions, sharing, offline, or VoiceOver stages** — those rubric surfaces are not in this walk's scope (§9.8 items 5, 10, 12, 13, 15 remain open).
- The walk exercises one learner journey deterministically; it is a demonstration of the loop, not a coverage battery (the battery is `docs/build-evidence/renkan/battery-*`).

## The claim this evidence supports

> On SHA `10c440c006bec111617c19279b81ea2e99fc7a67` (local static serve of `prototypes/corridor`, headless mobile Chromium 390×844), the complete reader loop — shelf → article → dials → tap ladder → quick look → full entry → 覚える capture with sentence context → tray → declared-recall review → Good grade with revlog → device-Back walk → reload-resume → v:1 export — was executed end-to-end and DOM-asserted, 85/86 assertions passing; web-verified only, no audio, no physical device.

## Reproduce

```bash
node docs/build-evidence/renkan/reader-demo/walk-demo.mjs
```

Outputs land in `docs/build-evidence/renkan/reader-demo/<head-sha>/` (this directory): numbered stage screenshots, `walk-log.json` (coordinate, per-assertion PASS/FAIL with detail, console/network records), and this README.
