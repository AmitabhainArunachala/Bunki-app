---
title: "Bunki — Handoff prompt for Codex: independent analysis and audit"
date: 2026-07-28
project: bunki
artifact_type: agent_handoff_prompt
next_agent: Codex 5.6
prepared_by: Claude Opus 5 (Conductor of the Campaign-C1 build fleet)
subject: "AmitabhainArunachala/Bunki-app @ main"
companion: docs/build-evidence/CODEX_VERIFICATION_PACKET.md
---

# Paste everything below the line into Codex

---

You are auditing a codebase you did not write, produced by a fleet of Claude
agents over roughly thirty hours. You are not its author and not its advocate.
Your job is to find what is wrong with it — including, especially, the places
where its own documentation claims more than the code delivers.

**Repository:** `AmitabhainArunachala/Bunki-app`
**Branch:** `main`
**Also review (unmerged):** `agent/bunki-real-dictionary` — the licensed
dictionary import, which has open findings and is *not* part of the merged
build.

## What this project is

Bunki (分岐) is a personal Japanese learning system for one operator, John
Shrader. Its thesis is that existing tools fragment the learner's state across
a dictionary, an SRS deck, a kanji app, and immersion, so that "do I know 玉?"
has five contradictory answers. Bunki keeps one evidence-backed thread per
encounter.

The design came out of an unusual process: you (Codex) and Claude independently
froze v1 designs, exchanged a structured convergence diff, and merged into a
converged v2 specification. **Your own frozen v1 and your item-by-item
convergence response are in `docs/convergence/` — you are auditing the
implementation of a design you co-authored.** That is deliberate. You know what
was promised.

## Read these first, from the repo, not from any summary

1. `docs/build-evidence/CODEX_VERIFICATION_PACKET.md` — your checklist.
   Follow it item by item; it defines the bootstrap, the command set, the
   fourteen verification items, and the report format.
2. `docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md` —
   the build contract the code was supposed to satisfy.
3. `docs/specs/BUNKI_PHASE0_DEFINITION_OF_DONE_2026-07-27.md` — §2 is a
   twelve-item list of ways a build like this fails while looking finished.
   Treat it as an accusation to test, not a checklist to bless.
4. `docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md` —
   the converged design authority, with the decision ledger.

## What the build claims, so you know what to attack

- One closed learning loop works end to end: capture an encounter → durable
  thread → labelled AI candidate → explicit promotion → a stable
  `RetrievalContract` → scored review → contextual reuse → finite session →
  evidence inspector → export that replays to identical state.
- The **evidence gate** in `packages/domain/src/evidence` is the *sole* factory
  for accepted evidence. AI output, UI code, and the persistence layer cannot
  create it. Five named negative assertions protect this: no FSRS before
  promotion, a reading miss cannot erase known meaning, reveal-before-recall
  grades `Again`, a lookup grades nothing, passive exposure never reaches FSRS.
- FSRS-6 is version-pinned behind the domain's own reducer; nothing else
  computes intervals.
- Persistence is real (SQLite native / labelled-provisional web), with
  migrations whose rollbacks are proven by schema fingerprint and a
  tombstone-then-purge path verified against raw storage bytes.
- Every runtime claim is supposed to be labelled: native is UNVERIFIED, CI
  SQLite is `ci-substitute`, latency numbers are web-only.

## Known history — use it, don't be reassured by it

Each builder was shadowed by a separate verifier, and those verifiers caught
real defects, several of which were *honesty* failures rather than crashes:

- a canvas that hard-coded `targetWasHidden: true`, so it would record
  "recalled unaided" while the word was visible on screen;
- a session that recorded every completion as an abandonment, 16 times out of
  16, while the domain believed otherwise;
- screens that existed in code with no navigation path to them;
- an evidence inspector labelling the learner's real evidence as
  demonstration-button output;
- `latencyMs: 0` hard-coded and reported as measurement;
- a builder's own report claiming a clean typecheck that a stale dependency
  symlink had masked.

**The fact that a same-vendor verifier passed something is not evidence that it
is correct.** You are here because correlated reviewers share blind spots. Look
hardest where the documentation sounds most confident.

## Rules

- **Do not fix, merge, or approve anything.** Your deliverable is a report.
- **Verify by execution and observation, never by reading a claim.** If a
  document says a guard exists, try to get past the guard. The packet §3.3
  names four bypasses to attempt; invent more.
- Where you cannot verify something — no device, no API key, no network —
  return `NOT-VERIFIABLE` with the reason. Never guess, and never soften a
  finding because the build looks thorough.
- Be specific: file, line, reproduction command, expected versus observed.

## Three questions the operator specifically wants your judgement on

1. **Has this reached "engineering-done (web)"** as the definition of done
   describes it? State it plainly at the top of your report, yes or no.
2. **The share-alike question.** JMdict, KANJIDIC2 and KanjiVG are all
   CC BY-SA. The repository currently has **no licence** (deliberately deferred
   as operator decision OD-09). What does distributing this app with that data
   require of the app's own licence, and what should the operator do before
   shipping it to anyone? This is the one question where you are asked for
   analysis rather than verification — mark it clearly as such.
3. **What would you do differently?** You co-designed this system. Now that
   an implementation exists, name the decisions from the converged v2 that the
   code has shown to be wrong, expensive, or unnecessary. Be blunt; the
   operator would rather cut something now than defend it later.

## Deliverable

Produce `docs/build-evidence/CODEX_VERIFICATION_REPORT.md` in the format the
packet §4 defines: the exact SHA you reviewed, verbatim command results, the
per-item verdict table, findings as P0/P1/P2 with reproduction commands, and an
explicit statement of what you did **not** check.

Open it as a draft pull request, or hand the file to the operator to commit.
Do not merge it yourself.
