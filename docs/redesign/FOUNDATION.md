# Bunki redesign foundation

The foundation lets a chosen concept change room materials and chrome through tokens, CSS and markup while using the existing learning and navigation paths. Work remains on `claude/redesign-20261008`; no merge to main is authorized by this handoff.

[BASELINE.md](BASELINE.md) records F1 against clean commit `2ba2967f36b9ee80030ebb088e2c75cc6503c138`: 11 of 14 processes passed. Doors already failed at T13/T14, relief had 13 missing edge/shadow/accent checks, and six day worlds used the wrong sheet paper. Compare final results with that baseline. [AFTER.md](AFTER.md) records the final complete rerun against its pinned artifact: 13 of 14 pass, with only the inherited doors fixture failure remaining. Deliberate verifier changes belong in [VERIFIER_CHANGES.md](VERIFIER_CHANGES.md); keep storage, SRS, ledger, offline, deck-front concealment, hit-size, contrast and overflow assertions intact.

## Tokens and room styling

`prototypes/corridor/editorial.css` ends with the fenced **BUNKI DESIGN TOKENS V2** block. Change named role values: `--color-*`, `--font-*`, `--type-*`, `--leading-*`, `--weight-*`, `--space-*`, `--radius-*`, `--elevation-*`, `--motion-*` and `--ease-*`. The compatibility bridge maps existing variables such as `--ink`, `--t-read`, `--s2`, `--raised-shadow` and `--dur` to those roles. Root `--world-*` snapshots preserve theme pigments without creating alias cycles. Override the roles on **body**, where the aliases resolve; a value inherited only from html can be superseded by the body's defaults.

```css
/* Example concept values; keep the final token fence at the end of the file. */
body:not([data-view='drift']) {
  --color-surface: #fffaf0;
  --color-ink: #242a25;
  --color-accent: #315a58;
  --color-line: #bbb5a6;
  --radius-surface: 12px;
  --motion-standard: 200ms;
}

html[data-room='reader'] body:not([data-view='drift']) {
  --color-page: #f4efe4;
  --color-paper: #f8f3e9;
  --type-reading: 24px;
  --space-4: 18px;
}
```

Defaults have zero specificity, so these scoped values can win without `!important`. Sheets, recall cards and zen surfaces also expose `--color-sheet-*`, `--color-card-*` and `--color-zen-*`. Keep raised surfaces' border plus shadow, the 44px hit minimum and reduced-motion behavior. Use the bundled Shippori Mincho B1, Yuji Syuku and Kaisei Tokumin or existing system stacks; font/network/asset-manifest changes need separate work. The token bridge alone preserved computed appearance in 96 baseline theme/view/width combinations; the foundation's separate relief, sheet-paper and navigation repairs intentionally change their own surfaces.

## One active interface language

`S.lang === 'bi'` is the existing EN state; `'ja'` selects Japanese. `tx(ja, en)` requires an explicit English value and throws when it is missing in EN. `withEn(node, en)` replaces the node's Japanese text with English; it selects one label instead of appending a subtitle. `biLabel(tag, cls, ja, en)` emits one active label inside the retained `.l-ja` span. These rules apply to visible chrome and aria labels, titles and placeholders.

```js
const heading = el('h2', 'eyebrow', tx('文法', 'Grammar'));
const door = biLabel('button', 'chip', '文へ戻る', 'return to the sentence');
door.setAttribute('aria-label', tx('元の文へ戻る', 'Return to the original sentence'));
// For an existing Japanese-only text node:
withEn(el('span', 'label', '解説'), 'Explanation');
```

Do not wrap an already translated node in `withEn(node, null)`; that throws and can abort room rendering. Apply `withEn` before appending content children because it replaces `textContent`. Keep learned Japanese spellings, readings, sentences, choices and source titles in their original language.

The browser lint excludes precise learning nodes, including `[data-ui-content='learning']`. Put that marker on the learned span, with `lang='ja'` where appropriate, rather than a surrounding chrome container. For a control or aria label that embeds a learned word, `data-ui-content-value='日本'` declares that exact content; `|` separates multiple values. Only those values or their lexical fragments are excluded, and the remaining interface wording is still checked. Existing named seals/world glyphs and the 日本語 language option have specific named-mark allowances. Extend these narrowly when adding real learning content; do not exempt an entire room.

## Navigation and room identity

`PRIMARY_TABS` in `corridor.js` is the single label/routing table. `buildPrimaryTabs()` appends one bar after the existing chrome, using the existing view/render, return-frame and search paths.

| Tab | Entry view | Active family |
| --- | --- | --- |
| Today / 今日 | `tray` | Lists, browse, review and quiz |
| Read / 読む | `shelf` | Shelf, reader, archive and source reading |
| Learn / 学ぶ | `dojo` | Decks, JLPT, guided, lessons, probe and tutor |
| Words / 辞書 | `search` | Search, kanji, grammar, idioms and word web |
| Me / 私 | `me` | Progress, personal collections and settings |

`S.variants.nav` defaults to `'tabs'`; `?nav=legacy` selects the retained doors, and `?variants=1` exposes the comparison control. Existing IDs/classes such as `#back`, `#chrome-dojo`, `.bubble-shelf`, `#ginga-symbol` and shelf link IDs stay available. Learn groups its existing controls into guided, decks and focus sections. Personal collections use their existing full-document mount; primary-tab routes retain the selected `ui` locale.

The bar is hidden on drift/entry, zen review/probe, entry-sheet/stroke stacks and modal dialog layers or the vocabulary-list sheet. `--nav-clearance` is `60px + env(safe-area-inset-bottom)` while tabs are visible, and zero otherwise. Sheet layers keep the underlying page clearance stable to prevent opening a word popup from shifting the article. The app reserves that clearance; variants, grade/context docks, reader play bar, tutor controls, reports and toasts are positioned above it. On phones, the reader reserves its existing capture door as a 44px +/✓ control with the full localized aria label; the level remains in the article metadata. Selecting a word cannot add a header row. The existing store-alert ownership/docking remains active. Keep these clearances and real pointer targets when changing tab height or dock layout.

`stampRegister()` sets `html[data-room]` from `ROOM_IDS` for stable room identity. Views keep their name except the following mappings:

| View | `data-room` |
| --- | --- |
| `drift` | `door` |
| `dojo` | `learn` |
| `mock` | `jlpt` |
| `kanjidex` | `kanji` |
| `personaldeck` | `personal` |
| `kagami`, `srs-stats` | `progress` |
| `ai`, `aiquiz` | `tutor`, `quiz` |
| `levels`, `thesaurus`, `yoji` | `reference`, `word-web`, `idioms` |
| `airead` | `personal-reading` |

`data-register` remains the stage-sensitive material (`attempt`, `threshold`, `results`, `jlpt`, `tutor`, `shelf`, `review`, `hall`, `door`). Keep it for existing stage CSS, along with numeric `--stage` and `data-answered`; use `data-room` for a concept's room identity. `data-room-entering` is stamped only when the room or material changes, removed after 220ms, and cleared on same-room rerenders so grades/saves/ticks do not replay entrance motion.

## Checks and external evidence

Build and test one immutable artifact per process. Runtime output stays under `~/.dharma`, outside the checkout. Build from a clean tree for checks that require clean commit identity.

```sh
BUNKI_RUN="$HOME/.dharma/bunki_review/2026-10-08/redesign/sol/handoff"
node scripts/build-corridor-site.mjs --out "$BUNKI_RUN/site"
export KAIRO_SITE_DIR="$BUNKI_RUN/site"
export KAIRO_ARTIFACT_SHA256="$(node -p 'require(process.env.KAIRO_SITE_DIR + "/build-identity.json").artifactSha256')"
export KAIRO_EXPECT_GITSHA="$(git rev-parse HEAD)"
export KAIRO_EVIDENCE_DIR="$BUNKI_RUN/language"
node tools/lint-ui-language.mjs --screenshots --both-languages
export KAIRO_EVIDENCE_DIR="$BUNKI_RUN/shell"
node tools/verify-redesign-foundation.mjs
```

The language tour renders the real rooms, active questions/answers, search lenses, sheets/details, deck players and personal import/study surfaces at 390×844; it checks EN chrome, room stamps, tab visibility and renderer errors. `--core-only` is an optional reduced tour. The shell verifier runs Chromium and WebKit at 320/390/768px in both languages; `KAIRO_BROWSER=chromium` narrows it to Chromium. Rerun the F1 subset listed in `BASELINE.md` as well; these new checks supplement it.

The generated room gallery is `<KAIRO_EVIDENCE_DIR>/ui-language/index.html`, with adjacent screenshots and `report.json` naming its artifact. The current candidate tour is at `~/.dharma/bunki_review/2026-10-08/redesign/sol/final-v9-language-settled/ui-language/index.html`; inspect the gallery and report for the candidate being reviewed. Baseline logs are in `sol/baseline`, and subsequent verifier logs/receipts are in `sol/after-v9` under that same external root.

Keep the record/storage boundaries in `corridor.js`, `data/fsrs-pin.json`, card IDs, `bunki-cloze:*` keys, `decks/n2n1/source/**` and `drift-layer.*` unchanged during concept styling. The front-door word sky retains its own appearance and behavior.
