# Review brief: Bunki's SRS deck strategy and build (for Codex)

You are reviewing the **whole SRS strategy and implementation** in the Bunki app repository
(`AmitabhainArunachala/Bunki-app`). The output becomes the **standing standard for every SRS
deck Bunki ships from now on**. That covers card design, sentence and passage sourcing,
writing rules, scheduling, visual design, Anki parity, testing and deployment.

The work so far moved fast and changed direction several times. Your job is to:

1. audit what exists;
2. judge it against the learner's goals and the best evidence on SRS and immersion learning;
3. find every defect, inconsistency and missed opportunity;
4. hand back one integrated, enforceable standard, plus a prioritised fix list.

Be blunt and specific. Cite file paths and line numbers. Don't praise.

---

## 1. Who this is for, and what they asked for

The learner mined **323 Japanese words** from their own reading with the _Japanese_ iOS
dictionary app (`decks/kotoba-mine/source/raw-export.txt`). The words are:

- mostly N2–N1 news, economics, technology and academic vocabulary;
- some rare and literary words (軈, 放逸, 費え);
- some slang and onomatopoeia (ガチ, ビンビン, ぎいぎい);
- some set phrases (礎を築く, 電卓を叩く);
- some single kanji (率, 割, 纏, 稽).

Their requirements, in their own words where possible. Treat all of these as hard requirements.

1. A **context-dense, high-level, high-quality deck in the style of AJATT** and other leading
   SRS methods. It should be grounded in **deep research into context-rich immersion learning**
   from the Japanese-study and Anki communities, with **massive cloze deletion** and
   **intensive context/immersion SRS** as the stated focus.
2. **Do deep research before writing rules.** The learner was angry when rules were written
   first, and again when the shipped deck "showed zero reflection of the research".
3. **Mine real sentences from the real internet**: articles, blogs, websites, "go wide and
   deep". Write originals only where mining fails. Then, later: **also write good,
   high-quality, context-rich, dense, natural, proper Japanese** passages.
4. **No fixed count** of sentences per word.
5. **Clean, sharp, futuristic, professional** look. User-friendly and fast. Strong contrast,
   colour coding. A **real SRS experience, not chunky paragraphs**. Quick swipes and choices.
   **No jargon, no AI-sounding wording, no confusing, out-of-context, abstract or truncated
   examples.** Every example must stand on its own.
6. Usable **inside Bunki** (under 集中道場's SRS section, with a deck chooser), as a **real
   Anki deck**, and as a **simple standalone study page**.
7. 覚える (memorise) must show **a list chooser**, so the learner knows where a word is saved.
8. Keep **both deck styles side by side** (single-sentence and MCD) "until we figure out the
   best approach".
9. **Different colour themes** for each deck, and **every tip and tool for memorising
   visually**: colour, depth, texture, shape.
10. **A simple definition of the target word must be visible on the answer.** The learner
    noticed it was hidden behind a tap and asked why. It is now shown; see PR #116.

Recurring complaints to design against:

- Doing work before research.
- Invented sentences presented as if real.
- Confusing or abbreviated examples.
- Hiding useful information on principle.
- Shipping something that doesn't reflect the stated method.
- Wasting the learner's time and tokens.

---

## 2. What exists now (read all of it)

### Research (done; please check it as well)

- `docs/srs/research/report-sentence-mining-deck-design.md`: the synthesised report. It covers:
  - AJATT and Khatzumoto's MCDs;
  - Tatsumoto's TSC/1T;
  - Refold, Kaishi, Lapis and JPMN;
  - GDEX (good dictionary example) selection, Japanese readability, and open corpora and
    their licences;
  - contexts per word;
  - cloze vs. recognition vs. production;
  - FSRS with Again/Good grading.
- `docs/srs/research/notes-*.md`: the underlying research notes, with sources.
- **Known tension:** the report recommended Tatsumoto-style recognition cards over cloze. The
  learner explicitly wanted MCD/massive cloze. Both now exist as separate decks. Judge whether
  the research was used properly, and where each style should be the default.

### Decks in the app (both built from the same 323 words)

| Deck            | id            | Built file                                        | Style                                                               | Default theme |
| --------------- | ------------- | ------------------------------------------------- | ------------------------------------------------------------------- | ------------- |
| 言葉の鉱脈・MCD | `kotoba-mcd`  | `prototypes/corridor/decks/kotoba-mcd/deck.json`  | massive-context cloze: 943 passages → 1,597 cards (943 語 + 654 字) | 藍 (`ai`)     |
| 言葉の鉱脈・文  | `kotoba-mine` | `prototypes/corridor/decks/kotoba-mine/deck.json` | one real sentence per card, word marked, read and recall: 503 cards | 墨 (`dark`)   |

- 文脈札 (`prototypes/corridor/decks/context-dense/`) is an older, separate context deck with
  its own engine. Review whether it should follow the same standard or be retired.
- 覚えるの札 is the corridor's own word queue (`S.taken`, `S.lists`); 覚える writes into it
  through the save chooser (`renderTakeChooser` in `prototypes/corridor/corridor.js`).

### Content pipeline (`decks/kotoba-mine/`)

- **Mining**, into the git-ignored `mining/`:
  - `tools/mine_local.py`: Tanaka/SNOW bank, Wikinews archive, Aozora samples.
  - Tatoeba pairs.
  - `tools/mine_corpora.py`, using open corpora mirrored on GitHub:
    - livedoor news (CC BY-ND);
    - Japanese Wikinews (real rows only);
    - Wikipedia text: KFTT, JaQuAD, JSQuAD, WAC;
    - UD Japanese GSD;
    - WRIME (NC-ND).
  - `tools/mine_aozora.py`: Aozora Bunko.
  - Web mining through Firecrawl, about 2,200 lines (`mining/web/<n>.json`; brief at
    `mining/WEB_MINING.md`).
- **Sentence ranking:** `tools/rank.py`, GDEX-style.
  - Hard filters drop:
    - fragments;
    - lines opening with a connective, particle or conjunction;
    - classical grammar (via the parser's 文語 conjugation tags);
    - old kana;
    - bullets and captions;
    - lines over 70 characters.
  - The remaining lines get a multiplicative score:
    - length;
    - unknown words, by wordfreq and the JLPT list;
    - non-jōyō kanji;
    - proper nouns;
    - frame typicality;
    - source prior.
- **Human-style review pass:** `source/REVIEW_MINED.md` → `source/review/*.json`, then
  `tools/export_mined.py` → `source/mined.json`. The single-sentence deck is built from this.
- **MCD passages:**
  - `tools/mine_passages.py` mines 2–4 sentence windows from full texts (9,252 candidates).
  - `tools/rank_passages.py` ranks them.
  - `tools/mcd_sheet.py` makes one sheet per writer.
  - Writers follow `source/REVIEW_MCD.md`: choose up to 2 real passages, write 1–2 originals,
    order them, translate. Output goes to `source/mcd/*.json`.
  - `tools/export_mcd.py` → `source/mcd.json`.
  - Current totals: 454 real and 489 written passages.
- **Build:** `tools/build.py` builds both decks: `deck.json`, Anki `.apkg`, `.tsv` and an
  offline `release/study*.html`.
  - Furigana comes from the corridor tokeniser (fugashi + UniDic + the repo's reading
    overrides).
  - Per-kanji readings come from `align()`.
  - Kanji anatomy comes from `prototypes/corridor/data/share_alike/kanji.json`.
  - MCD cards: a 語 card blanks the word, with the Japanese definition as hint. 字 cards blank
    one kanji, with its reading as hint; they come from the first passage only.
- **Meanings and Japanese definitions:** `source/v2/*.json`, written earlier. Check that they
  are accurate and match the learner's gloss in `entries.json`.
- **Older artefacts:** `source/BRIEF_V2.md`, `source/REVIEW_V2.md`, `tools/check_v2.py`. These
  are rules from before the research, and some may contradict the current approach.

### Player and scheduling (`prototypes/corridor/decks/player/`)

- **`engine.js`:** the `bunki-cloze-deck` v1 format, FSRS-6 via ts-fsrs 5.4.1, and the pinned
  weights in `prototypes/corridor/data/fsrs-pin.json` (retention 0.9; learning steps 1m and
  10m; relearning step 10m).
  - Siblings: a word's next card opens when the previous one reaches `deck.unlockDays` of
    stability (14 for 文, 3 for MCD), or after 3 lapses.
  - At most one card per word per day.
  - Leech threshold: 6 lapses.
  - Each deck keeps its own ledger, `bunki-cloze:<deckId>`.
- **`mount.js`:**
  - **Modes:** 読んで思い出す (read and recall), 穴埋め (cloze) and 4択 (four choices).
  - **Settings are per deck:** `bunki-cloze:prefs:v3:<deckId>`, with defaults from
    `deck.defaults`.
  - **Visual layer:**
    - eight themes;
    - the target word coloured by part of speech;
    - a topic hue on the card edge;
    - kanji anatomy on the back;
    - a 見て覚えるコツ panel and a このデッキのしくみ panel.
  - **Answer side:** the English gloss is shown under the word (PR #116), and the passage
    translation sits behind a 英訳 tap.
  - **Interaction:** swipe, keys 1–4 / Space / U, undo, backup and restore.
- **`player.css`:** the themes use CSS variables.
- **Anki templates:** `decks/kotoba-mine/tools/anki/` (MCD) and `tools/anki-sentence/`.

### Integration and deploy

- **`corridor.js`:**
  - `DOJO_DECKS`;
  - `?deck=mcd` and `?deck=kotoba` deep links;
  - the save chooser;
  - `commitCapture`.
- **Pinned line numbers:** `docs/build-evidence/reading-r5-learning-loop-r5-20260815/residual-storage-callers.json`
  pins line numbers in `corridor.js`. Edits must not shift them, or they must be re-pinned.
- **`.github/workflows/pages-app.yml`:** checks, copies and smoke-tests the player and both
  decks.
- **`prototypes/corridor/sw.js`:** the service worker precache; the current version is
  `kairo-v10-gloss`.
- **Verifiers:**
  - `prototypes/corridor/tools/verify-kotoba-mine.mjs`: 20 checks covering data and a real
    browser.
  - `verify-corridor.mjs`: the whole-app walk.
  - `verify-corridor-storage-integrity.mjs`, `verify-feed`, `verify-mock`, `verify-kagami`.
  - `npm run format:check`, `npm run lint`, `npm test`.

### History, to understand how we got here (PRs #110, #111, #114, #115, #116)

1. **v1:** paragraph-style cards ("chunky"). Rejected.
2. **v2:** three AI-written sentences per word, at rising levels, as cloze. Rejected: invented,
   formulaic, not researched.
3. **Research, then mining, then single real sentences** (#114, "文"). Rejected as showing no
   MCD or immersion research.
4. **MCD rebuild with real and written passages** (#115). Kept, alongside 文.
5. **English gloss made visible** (#116).

---

## 3. What to review

Work through every area. For each finding, give: **severity** (blocker / major / minor /
nit), **evidence** (file:line, a data sample, or a citation), **why it matters for this
learner**, and **the exact fix**.

### A. Pedagogy and method fidelity

- Does the MCD deck really follow Khatzumoto's MCD? Check:
  - context size;
  - one unknown per card;
  - the cloze granularity: whole word vs. kanji vs. kana chunk vs. particle;
  - hints that make the answer unique without giving it away.
- Are 語 and 字 the right card types? Should there also be:
  - partner-word (collocation) gaps;
  - particle gaps;
  - reading cards (kanji shown, recall the reading);
  - production cards gated behind recognition?
  - Which belong in the default set, and which should be optional?
- Does the 文 deck follow Tatsumoto's TSC/1T properly? Check:
  - the target is highlighted;
  - there are no readings on the front;
  - the meaning is on the back.
- **Sentences per word.** Is 1–3 for 文 and 2–4 for MCD right? Should the count scale with
  frequency, polysemy (one passage per sense), and register (literary, slang, technical)?
- **Ordering.** Should a written "clear" passage come first (i+1), or a real one? Check the
  sibling unlock intervals (14 vs. 3 days) and the one-card-per-word-per-day rule against
  the evidence.
- **Hints.** Is the Japanese-definition hint on 語 cards good, or does it leak the answer or
  use words harder than the target? Should the hint be English, Japanese, or a picture?
- **Grading and scheduling.**
  - Is Again/Good guidance followed?
  - Should 難しい and 簡単 be hidden?
  - Are the learning steps right for cloze?
  - Check leech handling (6 lapses, sibling unlock after 3) and whether a leech should swap
    in a new passage.
  - Check FSRS parameters per deck. Should cloze and recognition decks use different target
    retention?
- **Immersion loop.** How should these decks connect to Bunki's reader, the 覚える flow and
  future mining from the learner's own reading? Design the standard pipeline: "word met
  while reading → card in the right deck".

### B. Content quality (sample at least 60 words across all 12 topics, including the hard cases)

- **Real passages.** Check each one for:
  - it stands on its own;
  - the sense matches the learner's gloss;
  - the gap has a unique answer in context;
  - no typos (several were found and dropped already);
  - no proper-noun overload;
  - suitability (some literary or old-style lines remain);
  - correct `form`, `site`, `url` and licence.
- **Written passages** (489; labelled 書き下ろし). Check:
  - naturalness: would a native editor publish this?
  - factual claims, e.g. the 訴額 thresholds, the Imperial House Law, laundry symbols and
    statistics;
  - variety across a word's passages;
  - "AI tone";
  - that each uses the word exactly once, in the gloss sense.
- **Translations:** accurate, natural, consistent.
- **Meanings and Japanese definitions** in `source/v2`: accurate, simple, and not harder than
  the word.
- **Furigana and readings.** Check:
  - target readings (`build.py` `_ordered_for`);
  - per-kanji `align()` splits (rendaku, sokuon, jukujikun, and guessed kanji such as 讃=さぬ);
  - compound-internal targets (稽 in 滑稽);
  - words with no 字 cards (追い上げる, 攪拌, 俯瞰, 神奈川県, 行方不明).
- **Hard cases.** Check that each is handled sensibly:
  - single-kanji entries (率, 割, 余, 犯, 纏, 稽, 風, 淵, 軈);
  - spelling variants (撹拌/攪拌, そうそうたる, ガチ);
  - polysemous words (なお, 夕べ, 忍び);
  - words that are really dictionary labels (係助).
- **Licensing.** Check the per-source handling:
  - livedoor ND: verbatim only;
  - WRIME NC-ND;
  - web quotations;
  - Wikipedia and Wikinews attribution.
  - Is it acceptable for a deck published on GitHub Pages? Propose the rule for future decks.

### C. Pipeline and data engineering

- **Reproducibility:** `mining/` is git-ignored and was partly built by agents through
  Firecrawl. What must be committed, cached or scripted so that a future deck can be rebuilt
  deterministically?
- **Agent and LLM steps:** the review and writing passes are human-in-the-loop LLM work.
  Specify the guardrails:
  - schemas;
  - validators: `export_mcd.py` checks form-in-text and no-spaces; what else is needed?
  - second-pass verification of written passages;
  - fact checks;
  - a duplicate and near-duplicate check across words.
- **Rankers.** Check `rank.py` and `rank_passages.py`: filters, scoring weights, false matches
  (率直 for 率, な＋お for なお, 〜ごと for ごとく, 〜がち for ガチ), and the variant table.
  Propose lemma-based matching.
- **Build.** Check `build.py`'s two-deck spec (`DECKS`), the ruby builder's robustness
  (`_cover`), the `deck.json` schema, and the version/format fields. Is `bunki-cloze-deck`
  v1 adequate? Define v2 if not, with migration.
- **Generalising.** Turn this into a **reusable deck factory**: any word list → mined + written
  passages → both deck styles → app, Anki and HTML. Specify the folder layout, config and
  CLI.

### D. Player, UX and visual design

- **Card faces in all three modes and on both decks.** Check:
  - information order and hierarchy on the answer side: word, gloss, kanji, definition,
    translation, source, tip;
  - tap targets, swipe thresholds, keyboard support;
  - undo;
  - progress feedback;
  - the done screen;
  - the empty and first-run states.
- **Themes.** Check:
  - contrast (WCAG AA for all text, AAA for the passage);
  - that colour meanings stay consistent across themes;
  - the part-of-speech palette's distinctness, including for colour-blind users;
  - that the topic hue doesn't fight the part-of-speech colour;
  - that texture never reduces legibility;
  - dark and light parity;
  - the high-contrast theme;
  - reduced motion.
- **Visual-memory features.** Judge whether they help memory or are decoration:
  - kanji anatomy (meanings are English and lower-case; parts are flattened by a heuristic);
  - part-of-speech colours;
  - topic hues;
  - the tips panel.
  - What else is worth adding? For example: stroke order, mnemonic fields, images, audio and
    pitch accent, and spatial layout.
- **Language and tone.** No jargon and no AI wording in any UI string (Japanese and
  English). Check every string in `mount.js` and the method and tips panels.
- **Mobile.** iPhone Safari home-screen use, service-worker update behaviour (the learner had
  to force-reload), offline use, and storage limits.

### E. Anki parity

- Do both `.apkg` files carry the same information and visual system as the app? Check:
  - field names and model and deck IDs, for stable re-import;
  - note sort order;
  - tags;
  - furigana syntax;
  - the cloze front vs. the native Anki cloze note type;
  - night mode;
  - AnkiMobile and AnkiDroid rendering.
- Should Anki use native `{{cloze}}`, or the current custom blank? Decide, and set the standard.

### F. Testing, CI and deploy

- **`verify-kotoba-mine.mjs`:** does it test what matters (content invariants, both decks,
  every mode, every theme's contrast, per-deck preferences, unlock rules), or only the happy
  path? Propose the missing checks.
- **Flaky walk:** the whole-corridor walk had a navigation race, now handled by a retry in
  `open()`. Are there other flaky patterns?
- **Workflow coverage:** do the Pages workflow and the smoke paths cover every deck file?
  How should a new deck register itself without hand-editing four places (`corridor.js`,
  `sw.js`, `pages-app.yml`, the verifier)?
- **Service worker:** the cache-version discipline, and how learners actually get updates.

### G. Consistency, debt and dead ends

- Remove or reconcile what is left over from rejected approaches:
  - `BRIEF_V2.md`, `REVIEW_V2.md`, `check_v2.py`;
  - the three-sentence `sentences` arrays in `source/v2`;
  - the `--preview` path;
  - stale README sections;
  - 文脈札 (`context-dense`).
- List every place that hard-codes a deck ID, a count or a rule that should come from config.

---

## 4. What to deliver

1. **Executive verdict** (≤ 1 page): is the strategy right? What are the top 5 risks, and what
   are the top 5 highest-leverage changes?
2. **Findings table:** every finding, with severity, area, evidence, fix and effort.
3. **`docs/srs/STANDARD.md`:** the integrated standard every future Bunki SRS deck must meet.
   It must be concrete and testable, and cover:
   - **Method:** which card types, when, and why, with citations to the research docs.
   - **Sourcing:** source tiers, filters, ranking, licence rules, the minimum share of real
     text, and when and how to write originals (with a writing style guide and banned
     patterns).
   - **Per word:** how many contexts and card types, and how that varies with frequency,
     polysemy, register, single kanji and set phrases.
   - **Card anatomy:** front and back for each card type and mode. Exactly what is shown,
     hidden or behind a tap, and in what order (gloss visible by default).
   - **Scheduling:** FSRS settings, grading, unlock and sibling rules, leeches.
   - **Visual system:** themes, colour semantics, part-of-speech palette, topic hues,
     typography, contrast thresholds, texture limits, kanji anatomy, motion.
   - **Copy:** UI wording rules in Japanese and English.
   - **Data:** the deck schema (versioned), IDs, migration, per-deck preferences and ledgers.
   - **Pipeline:** the deck-factory layout and commands, LLM guardrails and validators,
     reproducibility.
   - **Anki:** the note types and parity rules.
   - **Quality gates:** the automated checks a deck must pass before merge, and a manual
     review checklist (native read-through, sampling rate).
   - **Registration:** how a new deck is added to Bunki in one place.
4. **A prioritised fix plan** for the two current decks, as small PR-sized steps with
   acceptance checks. For each, mark whether it needs the learner's decision.
5. **Open questions for the learner:** only real decisions, each with your recommendation.

---

## 5. Ground rules

- **Read before judging.** Run the builds and verifiers yourself:
  - `pip install fugashi unidic-lite==1.0.8 genanki wordfreq`
  - `python3 decks/kotoba-mine/tools/build.py`
  - `node prototypes/corridor/tools/verify-kotoba-mine.mjs`
  - `npm run format:check && npm run lint && npm test`
- **Look at real cards.** Open `decks/kotoba-mine/release/study-mcd.html` and `study.html` at
  phone width (390×844) and screenshot each mode and theme.
- **Evidence over opinion.** Mark which recommendations rest on research (cite
  `docs/srs/research/*` or a primary source) and which are judgement.
- **Respect the learner's explicit choices** (MCD focus, both decks for now, gloss visible).
  Challenge them only with evidence, and phrase the challenge as a question for them.
- **Don't change the learner's existing progress:**
  - keep the card IDs of `kotoba-mine` stable;
  - keep the ledger keys `bunki-cloze:<deckId>` stable;
  - define migrations for any schema change.
- **Repo conventions:**
  - keep `corridor.js` storage-ledger line pins valid;
  - run prettier on everything you touch;
  - put no model names in commits or PR text.
- **Code changes:** if you make any, keep them in small PRs, each with passing gates. The
  main deliverable is the review and `STANDARD.md`.
