# Verification record

Audited source: `d01dda7c2d3b312cae5ff1bec709ecae56e48ec4`.
Review date: 2026-10-04. Tests used isolated scratch browser profiles and Anki
collections; no learner's live progress was opened or altered.

## Repository checks

| Command / operation                                                    | Outcome                      | Evidence and scope                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                               | Pass                         | Repository lockfile dependencies installed.                                                                                                                                                                                                                                         |
| `python3 -m pip install fugashi unidic-lite==1.0.8 genanki wordfreq`   | Pass                         | Required build tools installed. Except UniDic, the current project command does not pin Python versions; reproducibility finding F27/F28 remains.                                                                                                                                   |
| `python3 decks/kotoba-mine/tools/build.py`                             | Pass                         | [Build log](evidence/logs/build.log). Both built JSONs and standalone HTMLs unchanged. APKG bytes changed from generation timestamps; generated changes were restored after import testing.                                                                                         |
| `npm run format:check`                                                 | Pass on audited source       | [Log](evidence/logs/format.log). New review documents additionally formatted and checked before delivery.                                                                                                                                                                           |
| `npm run lint`                                                         | Pass                         | [Log](evidence/logs/lint.log).                                                                                                                                                                                                                                                      |
| `npm test`                                                             | Pass: 100 files, 1,710 tests | [Log](evidence/logs/unit-tests.log). Vitest excludes prototypes, so this does not cover most player defects.                                                                                                                                                                        |
| `node prototypes/corridor/tools/verify-kotoba-mine.mjs`                | Pass: 20/20                  | [Log](evidence/logs/verify-kotoba.log). Existing checks are useful but do not test failure paths found here.                                                                                                                                                                        |
| `node prototypes/corridor/tools/verify-corridor-storage-integrity.mjs` | Pass: 41 checks              | [Log](evidence/logs/verify-storage.log). Initial run lacked pinned historical base in shallow clone; fetched `ac880aff052991b230dfdd9b7f39267ae764a05f`, then passed. Browser/device portion reports NOT_RUN.                                                                       |
| `node prototypes/corridor/tools/verify-corridor.mjs`                   | **225/226; exit 1**          | [Full log](evidence/logs/verify-corridor.log). Failure: “bloom · dragging the centre carries the whole constellation — and sticks”; center moved35px, mean tether142→143px. Not rerun until green or misreported as pass. This broad non-deck interaction needs separate diagnosis. |
| Scheduler and pipeline reproductions                                   | Defects reproduced           | [Scheduler output](evidence/results/scheduler-repros.txt), [pipeline output](evidence/results/pipeline-repros.json); root reran portable scripts independently.                                                                                                                     |

`verify-feed`, `verify-mock` and `verify-kagami` were inventoried as adjacent
verifiers, not run: no changes to those surfaces were made, and repeating unrelated
tests would not resolve the demonstrated deck risks. The required build/deck/npm
commands and additional corridor/storage checks above did run.

## Content scope

- [Sampling CSV](evidence/content-sampling.csv): 73 distinct words, all12 topics,
  321 reviewed source records =209 MCD passages +112 sentence records. Each selected
  word includes all its shipped sentence and passage records, not only originals.
- Full-corpus scans measured counts, repeated target forms, duplicate strings,
  source categories and missing provenance. Twelve MCD repeated-answer leaks were
  identified. A limited similarity screen is not an exhaustive semantic-duplicate test.
- [Detailed audit](CONTENT_AUDIT.md) identifies exact word/passage/card IDs, source
  file/lines, readings, gloss/sense problems and fact/source checks.
- Source license metadata was treated as an assertion. Selected owner-controlled
  sources were checked; every quote was not independently traced upstream.
- No native-editor certification, complete legal clearance or all-claims fact
  certification is claimed. A sampled language pass means no additional critical
  defect found under this review, not proof of perfection.

## Browser and visual evidence

Environment: Chromium141, Playwright1.56, Linux, viewport390×844, scale1.
Production HTML and CSS were used. Initial Japanese tofu was an environment font
failure; Noto Sans CJK JP was installed and the entire final matrix was recaptured.
No product font/CSS changes were made to manufacture a pass.

Both release files were opened: `study.html` and `study-mcd.html`.
**2 decks ×3 modes ×8 themes ×2 faces =96 screenshots.** The specialist inspected
all twelve eight-theme contact sheets. The integrated review also inspected a clean
MCD answer sheet and longest-card capture. The committed sheets preserve all96
views; full-size individual matrix PNGs remain scratch artifacts and are reproducible.

| Deck / mode      | Front contact sheet                                              | Back contact sheet                                             |
| ---------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| MCD / read       | [front](evidence/screenshots/sheet-kotoba-mcd-read-front.jpg)    | [back](evidence/screenshots/sheet-kotoba-mcd-read-back.jpg)    |
| MCD / self-cloze | [front](evidence/screenshots/sheet-kotoba-mcd-self-front.jpg)    | [back](evidence/screenshots/sheet-kotoba-mcd-self-back.jpg)    |
| MCD / choice     | [front](evidence/screenshots/sheet-kotoba-mcd-choice-front.jpg)  | [back](evidence/screenshots/sheet-kotoba-mcd-choice-back.jpg)  |
| 文 / read        | [front](evidence/screenshots/sheet-kotoba-mine-read-front.jpg)   | [back](evidence/screenshots/sheet-kotoba-mine-read-back.jpg)   |
| 文 / self-cloze  | [front](evidence/screenshots/sheet-kotoba-mine-self-front.jpg)   | [back](evidence/screenshots/sheet-kotoba-mine-self-back.jpg)   |
| 文 / choice      | [front](evidence/screenshots/sheet-kotoba-mine-choice-front.jpg) | [back](evidence/screenshots/sheet-kotoba-mine-choice-back.jpg) |

The matrix uses first-word 財政, so it is not a visual review of all2,100 cards.
[Matrix JSON](evidence/results/matrix-results.json) contains measurements and axe
results. [POS contrast JSON](evidence/results/pos-contrast.json) separately checks
all six foreground categories against theme base panels; textured worst-pixel
contrast still needs targeted verification after token changes.

Additional evidence:

- [Longest MCD answer](evidence/screenshots/longest-mcd-back.png): scrolling cost,
  not horizontal clipping or complete inaccessibility.
- [Malformed restore](evidence/screenshots/invalid-backup-restore.png),
  [failed save](evidence/screenshots/storage-failure.png),
  [final-card undo absence](evidence/screenshots/done-no-undo.png),
  [invalid kanji choices](evidence/screenshots/kanji-choice-front.png).
- [Repro results](evidence/results/repro-results.json) and
  [extra layout/settings results](evidence/results/extra-results.json).

The offline experiment initially used Playwright's offline switch alone; service
worker requests still succeeded, so that result was inadequate. The final repro
cuts the local server's sockets after fresh worker installation. Importing the
player then fails on missing `ts-fsrs.mjs`; pin fetch fails too. This establishes
the cold-cache dependency defect, not all hosting or native-browser behaviors.

## Actual Anki tests

Both APKGs were unzipped and their SQLite models, note/card IDs, fields, tags,
presets and templates inspected. Anki Python/backend26.9.3 then imported the actual
packages into temporary collections, rendered questions/answers with real filters,
and reimported unchanged packages. A second experiment updated a Meaning field
under the same GUID with a newer modification timestamp and reimported again.

Counts stayed **503 and1,597**. Note/card identity and a seeded review state
(interval30days, due500, reps7) survived; changed Meaning applied without duplicate
notes. [Import summary](evidence/results/anki-runtime-summary.json) and
[changed reimport results](evidence/results/anki-changed-reimport-results.json).
This is same-schema update evidence. It does not prove every future schema change
or all revlog/user-field merge cases; those are proposed acceptance gates.

Actual backend-rendered HTML was checked at390×844 in Chromium for both decks,
front/back, light/nightMode: eight captures under `evidence/screenshots/anki-*`.
[Anki browser results](evidence/results/anki-browser-results.json) records AA
failures on light backs. A working backend furigana filter and successful import
must not be described as broken merely because native cloze might aid future editing.

**Not verified:** AnkiMobile, AnkiDroid, iPhone Safari, installed home-screen update
lifecycle, VoiceOver/TalkBack, real file-open storage behavior, production hosting
upgrade/rollback. Chromium phone width is not physical-device evidence.

## Reproduce the targeted defects

Scripts under [evidence/scripts](evidence/scripts/) run from the repository root.
Use a dedicated, empty scratch output directory. They use temporary browser/Anki
data, not a real profile or collection. The Python Anki import script intentionally
removes only its named scratch collections; never point it at personal collections.

```bash
node docs/srs/review-2026-10-04/evidence/scripts/scheduler-repros.mjs
python3 docs/srs/review-2026-10-04/evidence/scripts/pipeline-repros.py
mkdir -p /tmp/bunki-srs-review-evidence
export REVIEW_EVIDENCE_OUT=/tmp/bunki-srs-review-evidence
node docs/srs/review-2026-10-04/evidence/scripts/repro-player.mjs
node docs/srs/review-2026-10-04/evidence/scripts/review-player.mjs
node docs/srs/review-2026-10-04/evidence/scripts/review-extra.mjs
python3 docs/srs/review-2026-10-04/evidence/scripts/repro-anki.py
python3 docs/srs/review-2026-10-04/evidence/scripts/reimport-change.py
node docs/srs/review-2026-10-04/evidence/scripts/review-anki.mjs
```

Requirements: repository npm dependencies, Playwright Chromium, Japanese font
fallback, required Python build packages and `anki==26.9.3` for Anki tests.
These are diagnostic reproductions of the audited implementation. Some print
observations rather than assert pass/fail; convert each into a focused regression
test in the fixing PR. Do not treat a successful script exit as a clean product.
