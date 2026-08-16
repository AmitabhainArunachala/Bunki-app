# 回廊・五彩 REBUILD SPEC — the build contract (2026-08-13)

**What this is.** The operator locked five nihonga worlds from the
living-ink design round and ordered a full end-to-end rebuild: _"use 5 of
those color themes through the app on every single surface possible"_ —
and, explicitly, **no piecemeal**: one spec drives the build until the
entire corridor is done. This document is that contract. Every phase
executes against it; nothing ships outside it; the build is not finished
until §7 is true.

**Authority.** Operator is sole design authority. This spec was derived
from the real code (surface inventory generated from `corridor.js` view
and render functions, 2026-08-13) and from the locked standard
`docs/design/GOSAI_STANDARD_2026-08-12.md`. The end-to-end look it builds
toward is `design/kairo-gosai.html` (the operator-approved vision).

---

## §1 The five worlds

One world is active at a time, chosen by the seal in the chrome and
persisted on-device. **Every surface re-dresses completely when the world
changes.** (The vision page showed different rooms in different worlds
for illustration; in the app, the active world governs everything.)

**AMENDED 2026-08-13 (operator lock): the palette is EIGHT worlds — 八彩.**
The operator re-picked from the thirteen-world carousel ("keep 墨・楮紙;
default 藍 ベロ藍・浪"). The authoritative table lives in
`docs/design/HASSAI_STANDARD_2026-08-13.md`; summary:

| seal | world        | ground            | ink               | red (the one) | go-colour             |
| ---- | ------------ | ----------------- | ----------------- | ------------- | --------------------- |
| 藍   | ベロ藍・浪   | print cream       | Prussian blue     | 蔓朱 #b03a2e  | ベロ藍 blue — DEFAULT |
| 墨   | 墨・楮紙     | warm kōzo washi   | sumi              | 朱 #a02a1e    | 藍 indigo             |
| 赤   | 凱風快晴     | dawn paper        | Fuji rust         | 朱 #a03a20    | 空 sky blue           |
| 柿   | 焦茶・柿渋   | persimmon tannin  | burnt umber       | 深朱 #7e2410  | 藍 textile            |
| 漆   | 胡粉・黒漆   | black lacquer     | gofun shell-white | 朱燈 #e0796b  | 金 gold               |
| 金   | 紺紙金泥     | indigo (紺紙)     | parchment white   | 朱燈 #ef8079  | 金 gold               |
| 浪   | 神奈川沖浪裏 | deep Prussian sea | wave foam         | 朱燈 #e08a6e  | 飛沫 spindrift        |
| 殻   | 攻殻・燐光   | terminal black    | phosphor white    | 警朱 #ff6b4a  | 燐光 phosphor         |

Every "five worlds" elsewhere in this spec now reads "eight worlds"; the
screenshot matrices are ×8. With eight worlds, the seal ALSO gains a
long-press picker (the eight world-stones, P1 mechanic) so cycling never
feels like a chore. Token values: live in `corridor.css` (§ HASSAI
worlds). Structural tokens added by P1: `--paper-url` (per-world ground
texture), `--sheet-*` (lacquer constants), `--seal-*` (hanko constants),
`--gold: #d9b25f`.

## §2 Global structures (applied on every surface, all five worlds)

- **S1 living paper ground.** The app background is procedurally grown
  paper, not flat hex: per-world fiber texture (kōzo strokes / shell
  fine-grain / tannin clouds / lacquer polish-lines / indigo fibers +
  faint stars), generated once per world+viewport, cached as data-URL,
  re-grown on seal change. **Amplitude law:** texture luminance variance
  ≤ ±3% of `--ground` so measured contrast ratios are unchanged — the
  accessibility verifier stays authoritative.
- **S2 raised paper.** Cards (`article cards, review face, probe card,
lesson cards`) sit on `--ground-0` with a fine grain and one soft
  shadow; never borderless flat rectangles.
- **S3 the lacquer sheet.** EVERY bottom sheet (`.sheet` — dictionary
  entry, kanji node, radical, idiom, particle, sentence room, grammar
  node, conjugation, homographs, relations, pickers) is 胡粉・黒漆 in all
  five worlds — the dictionary's native dress. Sheet-scoped token block
  (`.sheet { --ground/--ink/--red/--ai/--line/--faint … }`) so everything
  inside inherits lacquer automatically; gold hairline rules; grip and
  `戻る` unchanged in behaviour. Night-lift faints inside the sheet.
- **S4 hanko controls.** The four grades become seals — 再・難・良・易,
  square, 56px, EN sublabels kept (`again/hard/good/easy` remain in the
  DOM for suites and screen readers); 良 pressed solid in the world's
  red, 易 gold-edged, 再 red outline, 難 quiet. Capture (`捕`) and other
  primary reds take the same seal grammar. Interval labels stay.
- **S5 type & chrome law.** Unchanged from the standing law: focused
  content dominates; chrome ≤ 13px; Mincho for content; the tap circle,
  hold grammar, and every interaction stay byte-identical in behaviour.
- **S6 one red per world** does all semantic work. **S7 gold** is the
  go-colour on the two dark worlds. (Both already wired.)

## §3 Surface inventory (from the code) and what each receives

Views (`S.view`): `drift · entry · tray · shelf · reader · archive ·
dojo · levels · lessons · grammar · kanjidex · thesaurus · yoji · ai ·
airead · aiquiz · probe · review`.

| surface                                                                   | structures                                      | notes                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 玄関 drift door                                                           | S1(星), gold title, world-matched pigment pools | via `build-drift-layer.mjs` ONLY (generated file) — P6                                                                                                                                        |
| entry / tray                                                              | S1 S2 S4(doors)                                 | the four doors as quiet seals                                                                                                                                                                 |
| 書架 shelf + shelf body                                                   | S1 S2                                           | pool chips in world red                                                                                                                                                                       |
| 読む reader                                                               | S1                                              | ruby in world red; legend row; no layout change                                                                                                                                               |
| 文 sentence room (`renderSentenceNode`)                                   | S3                                              | opens as lacquer sheet; 捕 seal                                                                                                                                                               |
| 新聞アーカイブ                                                            | S1 S2                                           | year rules in world red; tannin identity strongest in 柿 world                                                                                                                                |
| 辞書 sheet + details/relations/homographs/conjugation                     | S3                                              | pitch line over kana in gold; sense tag chips gold-edged (data from Codex M2 when harvested)                                                                                                  |
| kanji node + `renderStrokePage`                                           | S3 + 書の間 door                                | stroke page gains the living-ink engine (stroke-art-v5) as an in-app room; engine runs only while visible (十彩 lifecycle law); ink follows world (sumi worlds → 墨, dark worlds → 金泥) — P5 |
| kanjidex (grid/parts/strokes/text/draw)                                   | S1 S2                                           | draw canvas ink follows world                                                                                                                                                                 |
| 復習 review: start, question face, answer face, wait, undo, schedule, zen | S1 S2 S4                                        | hanko grades; zen keeps its stillness (S4 shrinks, never disappears); schedule table on raised paper                                                                                          |
| 読み探査 probe + dojo                                                     | S1 S2                                           | choice tiles as quiet seals, picked = pressed red                                                                                                                                             |
| lessons / levels / catalog / lanes / signals                              | S1 S2                                           | measured-signal chips keep their honesty                                                                                                                                                      |
| grammar / thesaurus / yoji + their nodes                                  | S1, nodes S3                                    |                                                                                                                                                                                               |
| AI tutor (setup/chat/quiz/coach/examples/reading)                         | S1 S2                                           | tutor bubbles = raised paper; quiz choices = probe grammar                                                                                                                                    |
| context/list pickers (`renderContextPicker`, `renderListPicker`)          | S3                                              | scope chips: active = pressed 朱 seal                                                                                                                                                         |
| capture flow (`take`)                                                     | S4                                              | 捕 seal                                                                                                                                                                                       |
| settings/dials + export (`renderPortRow`) + stats                         | S1 S2                                           | five world stones (current ringed in red); export/import as paper buttons                                                                                                                     |
| variants strip, dictionary-retry, error/empty states                      | S1                                              | every state themed — **no surface left unthemed is the whole point**                                                                                                                          |
| standalone (`corridor-standalone.html`)                                   | all                                             | REGENERATED by its builder after P7; never hand-edited                                                                                                                                        |

## §4 Phases and gates — the anti-piecemeal law

Execution is strictly phase-ordered. A phase is DONE only when every
surface in it passes its gate **in all five worlds**; then it deploys for
the operator's feel verdict. No cherry-picking across phases; no phase
starts while the previous is red. Failures found later reopen the phase,
not a side patch.

- **P1 foundations** — texture engine (S1), card/sheet/seal structural CSS
  (S2·S3·S4 skeletons), extended tokens; a11y walk EXTENDED to all five
  worlds (today it measures two).
- **P2 the reading world** — tray, shelf, reader, archive, sentence room.
- **P3 the dictionary** — lacquer sheet + every node renderer inside it +
  pickers.
- **P4 the desk** — review faces, hanko grades, zen, wait/undo/schedule,
  probe/dojo.
- **P5 the writing room** — kanjidex, stroke page, living-ink 書の間
  (stroke-art-v5 engine in-app, visibility-gated).
- **P6 the door** — Drift worlds through `build-drift-layer.mjs` +
  entry/tray polish; drift suites green.
- **P7 the rest of the house** — lessons/levels/grammar/yoji/thesaurus/AI
  suite/settings/export/errors/empties; standalone regenerated.
- **P8 the walk** — full battery + performance suite + a 5-world × key-surface
  screenshot matrix + one continuous end-to-end walk (door → shelf →
  reader → sentence → dictionary → kanji → 書の間 → capture → review →
  probe → archive → settings) recorded and deployed; operator feel pass;
  then the trunk→main decision.

**Gate (every phase):** verify-corridor 116 · accessibility (extended)
· `npm test` 1645 · storage 9 · drift-fast · `format:check` · screenshot
matrix (phase surfaces × 5 worlds, 390×844) committed to
`docs/build-evidence/gosai-rebuild/pN/` · deployed live link.

## §5 Invariants (violating any of these is a build failure)

1. Behaviour is untouchable: tap circle, holds, capture scopes, FSRS
   math, revlog/obslog schemas, storage keys, rights metadata.
2. `drift-layer.js` and `corridor-standalone.html` only via their builders.
3. Texture amplitude law (§2 S1) — measured contrast never degrades.
4. Perf: textures cached (no per-frame cost), ink engine only while its
   room is visible; the reading loop stays 60fps on the operator's phone.
5. Suites may be EXTENDED, never weakened, to pass a phase.

## §6 Decision log

- Five worlds through every surface, one active at a time via the seal —
  operator, 2026-08-13.
- The dictionary sheet is lacquer in ALL worlds (the vision's strongest
  read) — spec decision, operator may override on feel.
- 群青・金地 reserved as a completion/celebration accent only.

## §7 Definition of done

Every surface in §3, in every world in §1, carries S1–S7; all §4 gates
green; the P8 end-to-end walk deployed; the operator has walked it on
the phone and given the feel verdict. Until all of that is true, this
build is OPEN and the next session picks up at the first unfinished
phase — this file is the hand-off.

**Status: LOCKED 2026-08-13 — the operator answered the two open gates
("1. Keep 2. 藍 ベロ藍・浪"), fixing the palette at eight worlds with
ベロ藍・浪 as the default. The eight are wired into the live corridor
(tokens + seal cycle, battery green). The build is OPEN at P1.**

**AMENDED 2026-08-14 — P1 foundations executed, deployed, battery green
(evidence: `docs/build-evidence/gosai-rebuild/p1/`). On the operator's
review the build was REDIRECTED to 全墨: the ground under every surface
becomes the LIVE fluid-ink engine and the world options are one tap away
everywhere. The redirect contract is
`docs/briefs/KAIRO_INK_REDIRECT_2026-08-14.md`; its phases Z1–Z4 run
first, then this spec's P2–P8 surface walk continues on the living
ground. The build is OPEN at Z1→Z2.**
