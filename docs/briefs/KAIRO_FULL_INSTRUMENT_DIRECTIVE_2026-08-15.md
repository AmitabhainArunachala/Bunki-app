# 全楽器 — the full-instrument directive (operator, 2026-08-15)

The operator's spoken directive, given identically to both coordinators
(Claude Fable and ChatGPT/codex), distilled into numbered work. This is the
gate: **no PR line moves forward until every point below is covered clearly
and fully.** The consolidated line is PR #71's branch (PR #72 merged into it).

## 0. Coordination

- Two head coordinators: **codex** and **Claude Fable**, collaborating in the
  open (PR #71 thread + committed ledgers). Each may fan out subagents
  (Claude: parallel agent fleets; codex: its own agents).
- Lane claims are posted on the PR #71 thread so nothing is done twice and
  nothing is dropped. The operator arbitrates conflicts.
- Nothing merges to `main` without the operator's word.

## 1. The full user-side review (仕上げ検分)

Review the entire app from the user side: every button, every tap, every
feature, inside and out, in all directions. Copious screenshots. Triangulate
three ways: against other applications, against common sense, against real
user experience. Produce a defect/polish ledger with evidence.

## 2. The writing room, redesigned to the operator's spec

The full-screen sheet is approved. The rest, exactly as spoken:

- The wake trigger must be **a more artistic symbol** than the three dots —
  and the controls must **open elegantly**.
- **Ten world choices from the top-right**, same position/language as the
  normal settings seal.
- **Stroke-order (numbers) toggle: bottom-right.** **Speed: bottom-left.**
  **Readings underneath.** Not crowded.
- Press stroke-order → the drawing now carries its numbers → toggle numbers
  on/off easily from one pane → click out back to plain full immersion.
- A functioning way back at every depth (the visible 戻る stays).

## 3. 覚える everywhere (the one-button list)

Top-right corner of **every screen**: one button to add the thing you are
looking at to a list. Create a new list, continue the current list, choose
among lists. (The operator's word: "oboeru — remember? one button to add to
a list.")

## 4. SRS fully wired

The full-power FSRS system (engine, revlog, optimizer, ripening, daily cap —
already prototyped in this repo) must be **completely integrated end to
end**: every capture path reaches it, every review flows through it, nothing
is a stub. The operator suspects it is not as integrated as it should be —
audit first, then close every gap found.

## 5. Articles — the corpus must grow up

- **Recover the missing authored articles**: a prior session wrote ~30
  articles that may sit unintegrated in another PR/branch. Census every
  branch; recover and wire them in. (Known already: 8 `bunki-essay-*` files
  ship in `data/articles/` but 0 appear in the shelf manifest; a 694-article
  wikinews archive sits in `data/articles/archive/`.)
- Research **Todai / Easy-Japanese-News style sourcing** and **Satori
  Reader**: how they source, grade, and present articles. Ours are "way,
  way, way too minimal."
- Target: a copious, diverse library from JLPT N5 → N1 plus graded levels.
  **Every article carries a Japanese title and an English title.**

## 6. The feature matrix (triangulation graph)

A comparison table of Bunki against the field (Satori Reader, Todaii/Easy
Japanese News, LingQ, WaniKani, Bunpro, Renshuu, Anki/Migaku, Duolingo where
relevant): list every feature they have, mark what we have, decide what we
adopt. Parity where it serves the learner — always in our style: cursive,
smart, AI-cutting-edge, never busy.

## 7. Audio

Research (reviews, comments, listening tests) the most natural-sounding
Japanese AI voices. The reader gets **at least 3 voice styles** that read
the articles aloud.

## 8. Example sentences

More, and deeper: AI-created example synthesis with a context layer —
sentences that carry real context, not isolated fragments.

## 9. The AI woven in (the integrative learning partner)

- The AI checks the reader's **edges** (e.g. the operator: strong daily
  conversation, weak N4/N3 grammar and N4/N3 kanji readings) and custom-creates
  SRS cards, study plans, and material that tests exactly that edge.
- Not a chatbot in a corner — an integrative learning partner that meets the
  student where they are, on all types of notes.
- Constitution laws hold: AI proposes; the learner confirms; FSRS schedules.

## 10. Aptitude testing

- **Mock JLPT tests** — several, at multiple levels: a hardcore, objective
  measure.
- **AI-conversation assessment** as the first and most natural aptitude
  probe.

## 11. AI memory

Every conversation remembered in a durable graph-style memory store
("Hermes-style" per the operator): model-agnostic, survives model swaps and
API changes, cross-checked against all previous conversations, with
matching algorithms that connect memory to where the reader is now.

## 12. Audience law

Built first for the operator as a single user, at their level — but never so
exclusive that beginners and intermediate learners can't live in it. It
should be able to stand alone as a product later.

## Open notes

- "Wayfinder": the operator believes this aligns ("I think pretty much") —
  reference not yet resolved in-repo; flag when found.
- Feasibility honesty: live audio TTS, live AI conversation, and the memory
  graph need runtime services and keys beyond a static Pages deploy. The
  packages/ai envelope + fallback architecture is the wiring point; phases
  must say plainly what runs live vs what ships as contracted fixtures.
