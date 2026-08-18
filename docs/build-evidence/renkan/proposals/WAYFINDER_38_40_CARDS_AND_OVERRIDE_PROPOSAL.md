# Wayfinder #38 + #40 — card formats, and what a human may override (proposal)

**For:** operator decision sheet OD-4b (RENKAN §5.4) · **Status:** PROPOSAL — nothing here is executed.

## #38 — what exists today

| Format | Reality | Where |
| --- | --- | --- |
| Recognition reveal card | SHIPPED — front: written form; reveal: reading + senses + up to 2 real corpus sentences ("a card never opens onto zero examples where the corpus holds any") | `corridor.js:6588-6623`, `reviewBack :6391` |
| MCD cloze context card | SHIPPED — a capture-chosen context (この文 / 段落) outranks everything and shows every time; otherwise every other repetition draws a corpus sentence with the word blanked | `:6567-6586`; context picker `:6039-6062`; variant A of ticket #38 `:148-156` |
| Per-list scoped review | SHIPPED — filtered-deck style: same cards, same schedule, narrower door | `:6375-6388` |
| Focus dojo (集中道場) | SHIPPED — timed drill; a drill on a never-captured card writes observation evidence only: no FSRS state, no revlog, no new-card slot burned | `:6858`, guard `:6695-6704` |
| Yomi probe (読み探査) | SHIPPED — self-graded "could you read it" on never-captured compounds; evidence, never scheduling | `:7037+` |
| Reading (on/kun) · production · sentence-mined cards | NOT REAL — keyspace reserved (`kanji:海:on`, `word:安堵:prod`, `sent:…#n`), engine is key-blind and needs no change, but the card types do not exist | `:6186-6193`; `docs/audits/SRS_AUDIT_2026-08-11.md` §5 |
| Domain kernel contracts | Meaning/reading as distinct contracts (T-05); only tier-A `ReviewGraded` on a promotion-active contract schedules; B/C/D evidence is recorded, never scheduled | `learn-contracts.ts`, ADR-002 |

Known gap, already marked in the UI: a word taken from a kanji page has no source
sentence, so its MCD face is a placeholder (`KAIRO_PROTOTYPE_LOG.md:185,209`).

## #38 — what ships, and who chooses

**Ship: recognition + MCD cloze, as one card with two faces — and the learner
chooses at capture, never mid-review.**

- MCD context cloze is **first-class, not a variant experiment**. This is the
  AJATT/MCD lineage the product descends from and the shape of your own 209-card
  deck: massive context does the asking, the blank holds the word's place.
- **Who chooses:** the existing capture-time context picker (語だけ / この文 /
  段落) is the whole choice surface. Proposed default flips to **この文** when the
  word was taken from a real passage (MCD-first), 語だけ otherwise — AI may propose
  a context, the learner confirms, FSRS schedules. No card-format options screen.
- Reading/production/sentence-mined families: **post-campaign**, behind the
  reserved facet keyspace, each arriving with its own proposal. Shipping them now
  without authored fronts would be card-shaped stubs.
- Dojo, probe, per-list review ship as they are — they already honor "exposure is
  not mastery" by writing evidence, not schedule.

## #40 — scheduler override policy

**The learner already owns, and keeps:** the four honest grades; undo (a `g=0`
revocation row beside the judgment — the log never rewrites, `:6804-6849`);
休ませる rest/suspend (`:6629-6641`); un-take with FSRS history preserved so a
re-take resumes, never resets (`:6008-6017`).

**Become learner-visible settings (with safe bounds):**

| Knob | Today | Proposed |
| --- | --- | --- |
| Daily new cap | hardcoded 20 (`NEW_PER_DAY`, `:6301`) | setting, default 20, bounds 0-50 |
| Session time budget | corridor presets 5/10/20/40 (`:6858`); app default hardcoded 12 (`session-screen.tsx:83`) | learner's number everywhere (T7), presets + custom, bounds 1-90 min |

**Stay fixed (not settings, and why):**

- **Desired retention 0.90** — REQ-SCH-02 is explicit: priority controls, never a
  raw retention dial; values near 1.0 explode workload (`fsrs-pin.ts:57-64`).
- **FSRS weights / parameter set** — updated only by the optimizer from real
  revlog evidence (T7), landing as a proposal with a new `parameterSetId`, never
  as a user slider.
- **T-06 reveal-forces-again** — a learner who saw the answer did not recall it,
  whatever they then press (ADR-002). Honesty is not a preference.
- **Leech threshold 6** (`:6308`) — 苦手 is surfaced, never auto-hidden; the
  learner's power over a leech is rest, which they already hold. A threshold dial
  adds a knob without adding a right.
- **Determinism pin** — one scheduler, pinned version, replay-equal state.

**One conflict to rule on inside the package:** the corridor runs FSRS interval
**fuzz ON** by default (`corridor.js:1943`) while the kernel pins **fuzz OFF**
because any scheduler randomness breaks replay equality (`fsrs-pin.ts:83-90`).
Recommendation: **fuzz off** at the A1 unification, with interval spreading — if
ever wanted — done in session planning where it changes presentation, not recorded
memory. This gets its own short ADR either way (campaign lane A3).

**One-word meanings** — ADOPT: everything above as written (MCD-first default, two
learner knobs, fixed list fixed, fuzz off by ADR). TRIM: ship formats as they
behave today (word-first default), zero new settings, fuzz ADR only. DEFER: no
ruling; campaign changes nothing learner-visible and documents the gaps.

**Decision requested:** ADOPT (recommended) · TRIM · DEFER
