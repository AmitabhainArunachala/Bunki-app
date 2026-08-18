# Campaign workflows

Multi-agent instruments that outlive the session that authored them. Each file
is a self-contained workflow script (`export const meta = {...}` then the body);
run one by name:

```
Workflow({ name: 'renkan-e3-double-dry' })
```

## renkan-e3-double-dry

The 連環 RENKAN closing gate for §1 T5 ("ledger zero"). Eight HUNT lenses —
srs-wiring, dead-ends-navigation, data-licence-integrity, a11y,
reader-experience, writing-room, ai-surfaces, performance-console — each driving
the served corridor with playwright at 390x844, every finding adversarially
confirmed by an independent agent before it counts, and a second full round run
only if the first comes back with zero confirmed findings.

The rule it enforces: **two consecutive dry rounds, or it is not done.** A round
that finds something is a round worked, not a round passed; the gate returns
`{dry: false, round: 'A', confirmed: [...]}` and stops, because there is no
point hunting round B on a head that is about to change.

Hunters are read-only (scratchpad only for scripts and screenshots) and are
briefed on the campaign's own prior ledgers — `triage-round1.json`,
`hunts-round2.json`, `RUN_STATE.md`, `DECISION_SHEET.md` — so that re-filing a
known, fixed, or operator-deferred item counts as a false positive. An honest
empty is the desired terminal state; suppressing a real defect to look dry is
the one failure mode the brief names out loud.

Name the tree it judges. Pass the head SHA as args:

```
Workflow({ name: 'renkan-e3-double-dry', args: { head: '<sha>' } })
```

A campaign that fixes what it finds moves the head under its own verifiers.
Round B's confirmations all carried the same caveat — _the fix landed while I
was verifying_ — which makes a verdict hard to read and burns the run. Named,
hunters and verifiers both work one stated commit, and verifiers check it out
into a scratch worktree instead of trusting a working tree that is moving.

Concurrency follows the host: the fleet is capped at `min(16, cpus - 2)`, so on
a small runner the eight lenses walk in pairs and a full two-round gate is a
multi-hour instrument, not a minutes-long one.
