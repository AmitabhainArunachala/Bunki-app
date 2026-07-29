# ADR-000 — Admit the Bunki End-to-End Autonomous Controller

**Date:** 2026-07-29  
**Status:** Accepted for publication; effective only after human merge of G00  
**Decision owner:** John Shrader

## Context

The Product Lock is merged and binding. PR #15, the first bounded foundation
repair, was human-merged into
`main@307ddc222ee63e2b8a9b66627a2591f55493a847`.

John then instructed: “Publish G00 and start.”

The earlier controller is accurate about the whole-product vision but contains
a stale starting snapshot and a less explicit execution sequence. A final
autonomous runtime controller was drafted, adversarially hardened, and passed
separate product-completeness and autonomous-execution reviews.

## Decision

Publish
`docs/prompts/BUNKI_END_TO_END_ONE_LONG_GOAL_2026-07-29.md` through G00.

After human merge:

- it controls execution sequencing and resumability;
- the Product Lock, frozen specifications, Master Definition of Done, and
  evidence ladder remain higher authority;
- the older whole-product controller remains historical evidence;
- canonical code remains human-merged `main`;
- one writer, one active draft PR, exact-head independent review, and
  human-only merge remain mandatory; and
- implementation begins at the first ready post-bootstrap child, F02.

Selected controller input SHA-256:

`6e7449149efb0fb60c8475809f451e6faecdfeb83e830e96f26f6ca04e9bcbb7`

Initial mutable runtime-evidence bootstrap receipts:

- goal state:
  `0d1fd55d4fe9b955a8c7d605ee58474c19d9804ddbc664179a708aa91a5d73aa`
- goal ledger:
  `88ca56c1567c772f00fb50c893937809cf81720c4cf00d8749cb3e27b7e38d21`
- operator visual-reference manifest:
  `f7d3ce9a4e43350d7d465e62f4a517bcfb5ad21fc6ae468b505982281133fb22`

These three receipts prove the initial G00 bytes only. They are not entries in
the operator-lock integrity gate. The files evolve inside the active child and
are schema-, meaning-, diff-, and exact-head-reviewed with that child.

## What this does not decide

This ADR does not choose:

- an Apple team, bundle identifier, signing, or distribution path;
- production content/data licenses;
- repository distribution license;
- AI, speech, audio, hosting, retention, or budget provider;
- continuity Mode A versus Mode B;
- an unofficial transcript route;
- a release; or
- operator acceptance.

Those remain the named human gates in the controller.

## Consequences

- G00 is documentation-only and must be independently reviewed at its exact
  head.
- G00 cannot merge itself.
- The first implementation work begins only after the G00 merge is verified on
  `main`.
- PR #15’s warning truth is not misreported as durable-write recovery; F06
  remains required.
