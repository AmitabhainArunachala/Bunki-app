# Sites v11 Recovery — Reconciliation Note + Environment Blocker (2026-07-30)

- **Governing brief:** `docs/handoffs/BUNKI_SITES_V11_INTERACTION_REDESIGN_HANDOFF_2026-07-30.md` (PR #19)
- **Executor:** Claude (claude.ai/code remote session)
- **Work branch:** `claude/sites-v11-interaction-recovery`
- **Status:** BLOCKED on source recovery. No interaction verification is claimed.
  No Playwright evidence exists yet and none is fabricated, per the brief's
  "Do not invent a Playwright success."

## 1. Reconciliation note (which source governs, and why)

Two histories exist, as the brief states:

1. **GitHub monorepo** `AmitabhainArunachala/Bunki-app`, main `b42eb31` — Expo
   Phase-0 vertical slice + domain/FSRS/persistence packages. Verified present.
2. **Bunki Sites v11 prototype**, source commit `4ab7d293dc5c89a4b55f44995e6225fe1a2e0440`,
   checkpoint 11, deployed at `bunki-living-japanese.amitabha1982.chatgpt.site`,
   history held only in the Site's own git. Verified **absent** from GitHub (see §2).

**Decision: the Sites v11 experience governs the interaction-recovery work.**
Basis: operator verdict (2026-07-30, direct instruction to this executor): the
Sites v11 app is "the best thing I've seen so far," while prior monorepo/agent
output was judged unusable as a product experience. The monorepo remains the
canonical storage location and keeps its history; v11's source will be brought
in on this branch (preserved verbatim first, then repaired). No parallel third
implementation will be created. Whether/how monorepo packages later back the
v11 surface is deferred until the interaction gate is green.

**Design constraint recorded:** the operator has a newer design direction from a
separate design session. The recovery must preserve the current v11 visual
design and fix interaction, composition, and clarity only, per the brief.
Earlier design canon (docs/convergence spec §8 / V2 REQ-UI-08) is explicitly
**not** to be imposed during this phase.

## 2. Recovery attempts, with receipts

All commands run 2026-07-30 in the claude.ai remote environment (outbound HTTPS
via policy-enforcing agent proxy):

1. `git ls-remote origin` — enumerated all refs: 33 branches + PR refs #1–#19.
   No ref name or content indicates Sites source.
2. `git fetch origin 4ab7d293dc5c89a4b55f44995e6225fe1a2e0440` →
   `fatal: remote error: upload-pack: not our ref` — the Sites commit is not an
   object in the GitHub repository.
3. Content grep of candidate branches (`agent/bunki-lived-in`,
   `agent/bunki-whole-product-lock-2026-07-29`, `agent/bunki-real-dictionary-v3`,
   `agent/bunki-g00-end-to-end-controller`) for `Immerse|Coach|Find the edge`
   → no hits. The five-tab experience exists in no fetched branch.
4. `curl -I https://bunki-living-japanese.amitabha1982.chatgpt.site/` →
   `curl: (56) CONNECT tunnel failed, response 403`. Proxy status log confirms:
   `connect_rejected — gateway answered 403 to CONNECT (policy denial)` for
   `bunki-living-japanese.amitabha1982.chatgpt.site:443`. The domain is outside
   this environment's network allowlist.
5. `https://web.archive.org/...` → same CONNECT 403 (also outside allowlist).
6. Sites lifecycle tooling (`sites edit --slug bunki-living-japanese`): no Sites
   skill or CLI exists in this environment's toolset. The lifecycle belongs to
   the environment that created the Site.

Conclusion: from inside this environment, the exact v11 source is unreachable
by repository, by network, and by tooling.

## 3. Unblock paths (either suffices; A is preferred, both is ideal)

- **A (preferred): operator supplies the exact v11 source.** Export the Site's
  git repository at `4ab7d29` (zip including `.git` history if possible) and
  upload it to the executor session — the same workflow already used for the
  Codex v1 freeze zip. This enables the full local loop: serve v11 locally,
  run the complete Playwright evidence matrix (390×844, 375×667, 768×1024,
  1440×900), reproduce the operator's failures, repair, and re-verify — all
  against the exact tested source.
- **B (supplementary): allow the deployment domain.** Add
  `bunki-living-japanese.amitabha1982.chatgpt.site` (or `*.chatgpt.site`) to
  this claude.ai environment's allowed network domains. This enables the
  live-deployment evidence matrix and failure reproduction, but not editing —
  path A is still required to repair.

## 4. Queued behind unblock (per brief §Work sequencing)

1. Preserve untouched v11 source verbatim on this branch (freeze commit).
2. Local serve + full interaction inventory of every visible control (5 tabs).
3. Reproduce operator failures: article opening, reader imbalance, Back/history,
   mobile overlap, "Find the edge" confusion. Screenshot + console/network logs.
4. Freeze P0/P1 list; repair journeys A–F in brief order.
5. Full browser evidence matrix; only then unit/type/build checks.
6. Hand back for operator testing + deployment via the Sites lifecycle owner.
   No self-merge; no deployment overwrite.
