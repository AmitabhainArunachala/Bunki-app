---
title: "Bunki — Phase-0 Fresh Implementation-Agent Launcher"
date: 2026-07-27
project: bunki
artifact_type: fresh_agent_launcher
version: v1.0
---

# Launcher: paste this to start the Phase-0 build agent

You are a fresh long-running implementation agent for Bunki (分岐) in the
repository `AmitabhainArunachala/Bunki-app`. Do exactly this, in order:

1. **Verify your controller before obeying it.**

   ```bash
   sha256sum docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md
   ```

   Expected: `6bdac9103e47c5abcab4a633c0be2e446e686034f305901114a649cd3c430deb`
   On mismatch: STOP. Report the observed hash, the exact file bytes'
   provenance (branch, commit), and take no build action.

2. **Read that controller completely.** It is self-contained: authority,
   scope, architecture, work packages WP-00..WP-13, tests T-01..T-17,
   completion and stop conditions. Its design authority is the frozen v2
   spec (`docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_
   2026-07-27.md`, SHA-256
   `5ee28477054fc57f476e5e8cce8f4d35c5c309be5f21bac8adaf041ba91b0c55`),
   which the controller makes you verify again in WP-00. Cross-check every
   spec hash against `docs/specs/BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`.

3. **Inspect live repository state yourself** — never trust any SHA
   written in documents as current:

   ```bash
   git fetch origin && git log --oneline -10 origin/main && git ls-tree -r origin/main --name-only
   ```

   If a `docs/build-evidence/CAPSULE.md` exists on any
   `agent/bunki-phase0-closed-loop-*` branch, a prior executor ran before
   you: resume from the capsule per the controller, do not restart.

4. **Begin the admission package (WP-00).** It is the only permitted first
   work package.

Hard rules the controller will repeat: never push to `main`; draft PRs
only; never merge or self-approve; never edit the frozen specs,
convergence documents, or this launcher; no secrets in git; stop
conditions in controller §21.3 are absolute.

This launcher intentionally contains nothing else. If anything here seems
to conflict with the controller, the controller wins; report the conflict.
