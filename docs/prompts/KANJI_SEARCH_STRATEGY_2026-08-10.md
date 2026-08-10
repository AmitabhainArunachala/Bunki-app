# Finding a kanji you can see but can't read — search strategy for KAIRO

Status: **proposal / research brief** for operator ratification (2026-08-10). Prompted
by the operator's Kodansha Kanji Learner's Dictionary (KKLD) screenshots and the
question: "look up all the possible search methodologies, incl. hand-drawing;
is this clear in the wayfinder/vision docs or do we need to add it? If we need
to add it, strategize the best way."

Sources at the bottom. Research done by three parallel passes over KKLD/SKIP,
Jisho, and eight apps (Kanji Study, imiwa?, Yomiwa, Shirabe Jisho, Takoboto,
Nihongo, WaniKani, Google Lens) plus lookup pedagogy. Several primary pages
(Tofugu, edrdg, kanji.org) were egress-blocked, so some detail is from search
digests of those pages; the taxonomy is cross-corroborated.

---

## 1. Verdict: is it in the docs?

**Partially — so yes, we should add it as a first-class plan.**

- The vision codex (`JAPANESE_LEARNING_OS_CODEX_V1_FREEZE`) _gestures_ at two of
  the nine methods: **handwriting** is named but explicitly **deferred**
  ("only when the learner activates it"; "deferred until the user's desired
  role for writing is known"), and **camera/OCR** is filed under **"Later"**
  with voice and listening probes. Radical / component / phonetic
  decomposition is specified.
- What is **not** specified anywhere as a concrete search suite: **SKIP**,
  **multi-radical (component-intersection) lookup**, **by-frequency / by-grade
  / by-reading browsing**, and the **camera** path as an actual feature. The
  current corridor only ships text (kanji·kana·romaji·English) + a single
  `字引` that combines **one component + total stroke count**.

So the KKLD-class lookup the operator is showing is a genuine gap. This doc is
the plan to close it.

---

## 2. The full taxonomy — 9 ways to find a kanji

Ranked roughly by modern real-world value. "KAIRO today" = what the corridor
already has. "Data on hand" = whether we can build it with what's already in
the bundle.

| #   | Method                                                                             | Reading needed? | For whom                                                           | KAIRO today                     | Data on hand                                 |
| --- | ---------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------ | ------------------------------- | -------------------------------------------- |
| 1   | **Camera / OCR** (point at text)                                                   | no              | everyone; the 2020s default                                        | ✗                               | ✗ (needs an OCR engine)                      |
| 2   | **Multi-radical** (tap any components you see; intersect; grey out the impossible) | no              | beginner→intermediate default at a keyboard                        | partial (single component only) | **✓ (D.radicals: component→kanji)**          |
| 3   | **Handwriting / draw** (stroke-order-tolerant)                                     | no              | decorative/handwritten forms; offline; the operator asked for this | ✗                               | **✓ (KanjiVG stroke paths in strokes.json)** |
| 4   | **Reading (on/kun, romaji)**                                                       | yes             | confirming/producing a known reading                               | partial (mixed text box)        | **✓ (k.on / k.kun)**                         |
| 5   | **Meaning / English**                                                              | no              | reverse lookup / production                                        | partial (text box)              | **✓ (k.m)**                                  |
| 6   | **SKIP** (shape pattern 1–4 + segment stroke counts)                               | no              | KKLD users; systematic shape index                                 | ✗                               | ✗ (needs SKIP codes from KANJIDIC2)          |
| 7   | **By frequency / grade / JLPT browse**                                             | —               | study sequencing, not glyph lookup                                 | partial (JLPT/漢検 lanes exist) | mostly ✓ (grade/JLPT; freq missing)          |
| 8   | **Stroke-count browse**                                                            | no              | last-resort disambiguator                                          | **✓ (in 字引)**                 | ✓                                            |
| 9   | **Single Kangxi radical** ("which radical is _the_ radical?")                      | no              | legacy/paper                                                       | n/a                             | ✓ but **de-prioritize**                      |

**The pedagogy verdict** (what to lead with):

- **OCR is now the dominant real-world method** — lowest effort, whole
  passages at once. But it's the heaviest to build offline and the _least
  calm_ interaction, and the codex already parks it under "Later."
- **Multi-radical is the #1 structural method** and the one learners actually
  use at a keyboard. It removes the classic "which radical is the radical?"
  failure — you match _any_ parts you can see and the set collapses. Jisho's
  single biggest, most-cited frustration is that its radical grid is
  _stroke-sorted and unlabeled_; the whole community wrote userscripts to add
  a searchable radical box. **We can beat Jisho here for free.**
- **Handwriting is now a fallback, not a headline** (one major app removed it
  in 2025) — but it's exactly the case OCR fails on (calligraphy, signs,
  tattoos), it works offline, and the operator explicitly wants it. Modern
  recognizers are **stroke-order- and stroke-number-tolerant**, so the bar to
  a delightful version is low, and **we already ship the KanjiVG stroke data
  it needs.**
- **Single-canonical-radical indexing and raw stroke-count browsing are the
  two to de-emphasize** — their defining failure modes (wrong radical,
  miscounting) are what every newer method was built to remove.
- Best practice (and accessibility best practice): offer the modes as
  **co-equal, switchable inputs**, not a hierarchy. Type + draw + component +
  reading covers the beginner→advanced gradient and motor-accessibility at
  once.

**App landscape in one line:** text + single-radical + stroke count are
table-stakes; apps differentiate on (a) handwriting recognition _quality_
(Yomiwa, Shirabe lead), (b) whether they have camera OCR at all (Yomiwa,
Nihongo), and (c) loved power features — SKIP (imiwa?), wildcard (Shirabe),
auto-clipboard (Takoboto), faceted "stack the filters" search (Kanji Study).

---

## 3. Strategy for KAIRO

### The shape of it: one door, several lenses

Fold everything into the existing **`字引` "find a kanji by its shape"** as one
calm surface with switchable lenses — not scattered features. A quiet row of
modes at the top (部品 · 手書き · 画数 · 音訓 · 意味 · SKIP), each swapping the
body below, every hit opening the same kanji entry as everywhere else. This
matches the KKLD tab model the operator screenshotted (By SKIP / frequency /
grade) while staying in the corridor's paper aesthetic.

### Build order (highest value / lowest cost first)

**Phase A — the two free wins (no new data, uses what we ship):**

1. **Multi-radical component picker.** Upgrade `字引` from single-component to
   _select several_ components; intersect (`D.radicals[c].kanji`), and **grey
   out components that can no longer co-occur** with the current selection —
   the move that makes it fast and forgiving. Add a small **name/reading filter
   over the component grid** (the thing Jisho users had to hack in). This is
   the single biggest lookup win and it's buildable today.
2. **Handwriting / draw-to-find.** A canvas that matches ink against the
   **KanjiVG stroke templates already in `strokes.json`**, stroke-order- and
   stroke-count-tolerant, re-ranking candidates as you draw. Offline, open
   data, and exactly what the operator asked for. (Reference open engines:
   KanjiCanvas / Ctegaki, both KanjiVG-based, MIT.)

**Phase B — reading/meaning/browse (small data, mostly on hand):** 3. **Reading (音・訓) and Meaning (英) kanji lenses** built from `k.on`/`k.kun`/
`k.m` — direct kanji lookup, not just word text. 4. **By grade / JLPT / frequency browser** like KKLD's tabs. Grade/JLPT we
have; **frequency rank** needs to come in from KANJIDIC2 (CC BY-SA — keep
attribution).

**Phase C — the heavier, later pieces:** 5. **SKIP browser + `字引` SKIP lens.** Requires importing **SKIP codes** from
KANJIDIC2. Worth it because the operator likes it and it's a rare
differentiator, but it's classification-ambiguous for beginners, so pair it
with cross-referencing (list a kanji under the codes users are likely to
mis-guess), exactly as Halpern does. 6. **Camera / OCR.** The dominant modern method but the heaviest offline lift
for a web app (a JS OCR like tesseract-jpn or KanjiTomo-class engine, or a
cloud call). The codex already marks OCR "Later"; keep it last, and when it
lands, route recognized characters straight into the same kanji entry.

### Data & licence notes

- Multi-radical and handwriting need **nothing new** — `D.radicals` and KanjiVG
  are already bundled.
- SKIP codes + frequency come from **KANJIDIC2 (CC BY-SA)** — same licence pool
  as our existing kanji data; keep the attribution intact. (EDRDG's own host is
  egress-blocked in the build sandbox, like JMdict — the file would need to be
  dropped into the repo, same unblock path as the 70k dictionary.)
- Camera OCR is the only piece needing a genuinely new, heavy dependency.

### What I'd de-scope

Single-canonical-radical indexing (the "which radical?" trap) and a raw
total-stroke-count _primary_ browse. Keep stroke count only as a **secondary
filter** inside the component picker, where it earns its place.

---

## 4. Recommendation in one paragraph

Build the two free wins first — a **forgiving multi-radical component picker
with a searchable grid** (beating Jisho's most-hated screen) and a
**stroke-tolerant handwriting canvas over the KanjiVG data we already ship**.
Both are buildable now with zero new dependencies, both are exactly the
"see-it-but-can't-read-it" paths the operator's KKLD screenshots are about, and
both fit the corridor's calm. Then layer reading/meaning/grade/frequency
browsing, then SKIP (needs a KANJIDIC2 import), and keep **camera OCR last** —
it's the modern default but the heaviest offline lift, and the codex already
parks it under "Later." Present them as co-equal switchable lenses on the one
`字引` surface, so the beginner→advanced range and accessibility are covered by
the same design.

---

## Sources

SKIP / KKLD: kanji.org iKKLD; edrdg.org/wwwjdic/SKIP; nihongo.monash.edu/SKIP;
kanji.sljfaq.org/help/skip-help; en.wikipedia.org/wiki/The_Kodansha_Kanji_Learner's_Dictionary.
Jisho: jisho.org/docs; tofugu.com Jisho review; tofugu.com/japanese/look-up-kanji;
WaniKani "Jisho Radical Search" userscript thread; github.com/LiquidFire/jisho-quick-radicals.
Multi-radical / KRADFILE: edrdg.org/krad/kradinf; kanji.sljfaq.org/mr.
Handwriting engines: asdfjkl.github.io/kanjicanvas; github.com/asdfjkl/ctegaki-lib;
japandict.com/kanjidraw; blog.kanjiverse.com/handwriting-recognition.
Camera OCR: kanjitomo.net; Yomiwa (App Store id670931120); Google Lens/Word Lens coverage.
Apps: kanjistudyapp.com; apps.apple.com imiwa id288499125; Shirabe id1005203380;
takoboto.jp; nihongo-app.com; wanikani.com; tofugu radicals/mnemonic guide.
Pedagogy/accessibility: tofugu.com/japanese/kanji-radicals-mnemonic-method;
stepupjapanese.com "how did you learn kanji"; accessibility multimodal-input literature.
