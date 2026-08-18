export const meta = {
  name: 'renkan-e3-double-dry',
  description:
    'RENKAN E3: all eight HUNT lenses, two consecutive full-fleet rounds; zero fresh confirmed findings closes T5',
  phases: [
    { title: 'Hunt-A', detail: 'eight lenses, round one' },
    { title: 'Verify-A', detail: 'adversarial confirmation of round-one findings' },
    { title: 'Hunt-B', detail: 'eight lenses, round two (only if A is dry)' },
    { title: 'Verify-B', detail: 'adversarial confirmation of round-two findings' },
  ],
};

const REPO = '/home/user/Bunki-app';
/* The head this gate is walking. Pass it as args — `Workflow({ name:
 * 'renkan-e3-double-dry', args: { head: '<sha>' } })` — because a campaign
 * that fixes what it finds MOVES the head under its own verifiers: round B's
 * confirmations all had to caveat that the fix landed mid-verification, which
 * makes a verdict hard to read and wastes the run. Named here, hunters and
 * verifiers both work one stated commit and say so. */
const HEAD = (typeof args === 'object' && args && args.head) || 'the current campaign head';
const HUNT_SCHEMA = {
  type: 'object',
  required: ['lens', 'findings'],
  properties: {
    lens: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'severity', 'evidence', 'repro'],
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'polish'] },
          evidence: { type: 'string' },
          anchors: { type: 'string' },
          repro: { type: 'string' },
        },
      },
    },
    coverage: { type: 'string' },
  },
};
const VERDICT_SCHEMA = {
  type: 'object',
  required: ['confirmed', 'reason'],
  properties: {
    confirmed: { type: 'boolean' },
    reason: { type: 'string' },
    severity: { type: 'string' },
  },
};

const LENSES = [
  {
    lens: 'srs-wiring',
    brief:
      'Every grading/capture/observation path: capture scopes land with ctx; declared-recall gates reveals (まだ forces Again); drill-only dojo writes obslog not FSRS; drift flicks land in obslog with rollback; no orphaned FSRS state; daily caps honest; ペース settings rule the queue; fitted params drive the scheduler when valid; export envelope round-trips. Seed stores, grade, reload, assert bytes.',
  },
  {
    lens: 'dead-ends-navigation',
    brief:
      'Every surface has a context-restoring way back: device Back walks one level everywhere (sentinel); sheets/dives/review/archive/lessons/tray/AI rooms; crumbs name true origins; nav-search survives round-trips; keyboard Tab order sane on every surface; no hidden tabbable nodes; ?entry variants honest.',
  },
  {
    lens: 'data-licence-integrity',
    brief:
      'Pools separated (NC/ND absent everywhere; share-alike confined); every article row carries provenance/licence/titleEn/titleEnSource; 検収前 visible wherever review pending; queue covers every pending row; nothing self-approved; reading-override lexicon applied (checker report zero open); archive-index and index consistent with bodies on disk; no stringified null/None anywhere learner-facing.',
  },
  {
    lens: 'a11y',
    brief:
      'Beyond the a11y verifier: walk with keyboard only and with CDP accessibility tree — labels on every control, contrast on the current head across three worlds (sumi, rokusho, hakuu), touch targets ≥44 effective, focus visible and restored after sheet close, aria-pressed/roles truthful (覚える seals, declared-recall buttons, ペース fold), no keyboard trap.',
  },
  {
    lens: 'reader-experience',
    brief:
      'Read like a demanding learner at 390x844: furigana truth on name compounds (spot-check the fixed articles render lexicon ruby), dials coherent, quick-look vs full entry, capture from top-right, position/finish state after reload, archive usability, EN titles in bi mode, difficulty subtitles vary truthfully per card, glossary rows honest.',
  },
  {
    lens: 'writing-room',
    brief:
      'The quiet room contract (constitution §6): kanji-only dormant state, ⋯ wake, ten worlds in exact public order, readings complete, 筆順 numbers on first-splat sync, Escape sleep/exit, edge-back sentinel, reduced-motion honest still, no chrome leaks, speed law (1.1 public / 0.7 internal not public), stroke-less glyphs honest.',
  },
  {
    lens: 'ai-surfaces',
    brief:
      'All six AI surfaces with a stubbed provider: 10s abort → quiet bilingual failure everywhere, no stuck 考え中; every exchange lands in the IndexedDB archive (all six surfaces); chat renders full durable history; quiz survives reload if landed (check current truth); provider/model seam honored; no surface writes S.srs; degradation without a key is silent absence, not breakage.',
  },
  {
    lens: 'performance-console',
    brief:
      'Console clean on every navigation across all surfaces and 3+ world switches; no failed requests; no non-local origins (except configured AI endpoint); localStorage size after a heavy walk (quota headroom); long-task profile on nav (note the accepted full-render cost honestly — only NEW regressions are findings); standalone boots.',
  },
];

const huntPrompt = (
  h,
  round,
) => `You are an E3 HUNT agent (lens: ${h.lens}, dry-run round ${round}) for the RENKAN campaign closing gate. Repo ${REPO}, at ${HEAD} — walk that tree and name it in your coverage, so a finding stays readable if the branch moves under you. READ-ONLY (scratchpad only for scripts/screenshots).
Serve prototypes/corridor locally (python3 -m http.server) and drive it with playwright-core + chromium (/opt/pw-browsers/chromium), 390x844 touch emulation. ${h.brief}
THE BAR IS HIGH: this is the double-dry closing gate. A finding must be REAL, REPRODUCIBLE (exact steps + DOM/console evidence), NEW on this head (check docs/build-evidence/renkan/triage-round1.json, hunts-round2.json, and RUN_STATE.md — re-filing anything known, fixed, deferred-with-rationale, or on the decision sheet is a false positive), and matter to a learner. Cosmetic taste is not a finding. When genuinely dry, return an empty findings array with your coverage statement — an honest empty is the desired terminal state, but NEVER suppress a real defect to look dry.
Return findings ≤6, severity honest, coverage = what you walked and what you did not reach.`;

phase('Hunt-A');
const roundA = (
  await parallel(
    LENSES.map(
      (h) => () =>
        agent(huntPrompt(h, 1), {
          label: `huntA:${h.lens}`,
          phase: 'Hunt-A',
          schema: HUNT_SCHEMA,
          effort: 'high',
        }),
    ),
  )
).filter(Boolean);

const verify = (f, lens, tag) =>
  agent(
    `E3 confirmation for a closing-gate hunt finding (lens ${lens}). Repo ${REPO}, at ${HEAD} — the tree the hunter walked. Finding: ${JSON.stringify(f)}.
Adversarially confirm or refute: (1) reproduce it EXACTLY per the repro at ${HEAD} — check that commit out into a scratch worktree rather than trusting the working tree, which the campaign's own landings move while you verify; (2) check it is genuinely NEW — not in triage-round1.json / hunts-round2.json / RUN_STATE dispositions / DECISION_SHEET.md rows; (3) check it matters to a learner (not taste). confirmed=true ONLY if all three hold with evidence. READ-ONLY.`,
    {
      label: `${tag}:${f.title.slice(0, 40)}`,
      phase: tag === 'verifyA' ? 'Verify-A' : 'Verify-B',
      schema: VERDICT_SCHEMA,
      effort: 'high',
    },
  );

phase('Verify-A');
const findingsA = roundA.flatMap((r) => r.findings.map((f) => ({ ...f, lens: r.lens })));
log(`round A: ${findingsA.length} raw findings across ${roundA.length} lenses`);
const confirmedA = [];
if (findingsA.length) {
  const verdictsA = await parallel(
    findingsA.map((f) => () => verify(f, f.lens, 'verifyA').then((v) => ({ f, v }))),
  );
  for (const row of verdictsA.filter(Boolean))
    if (row.v && row.v.confirmed) confirmedA.push({ ...row.f, reason: row.v.reason });
}
log(`round A confirmed: ${confirmedA.length}`);
if (confirmedA.length) {
  return {
    dry: false,
    round: 'A',
    confirmed: confirmedA,
    coverage: roundA.map((r) => ({ lens: r.lens, coverage: r.coverage })),
  };
}

phase('Hunt-B');
const roundB = (
  await parallel(
    LENSES.map(
      (h) => () =>
        agent(huntPrompt(h, 2), {
          label: `huntB:${h.lens}`,
          phase: 'Hunt-B',
          schema: HUNT_SCHEMA,
          effort: 'high',
        }),
    ),
  )
).filter(Boolean);

phase('Verify-B');
const findingsB = roundB.flatMap((r) => r.findings.map((f) => ({ ...f, lens: r.lens })));
log(`round B: ${findingsB.length} raw findings`);
const confirmedB = [];
if (findingsB.length) {
  const verdictsB = await parallel(
    findingsB.map((f) => () => verify(f, f.lens, 'verifyB').then((v) => ({ f, v }))),
  );
  for (const row of verdictsB.filter(Boolean))
    if (row.v && row.v.confirmed) confirmedB.push({ ...row.f, reason: row.v.reason });
}
log(`round B confirmed: ${confirmedB.length}`);
return {
  dry: confirmedB.length === 0,
  round: 'B',
  confirmed: confirmedB,
  coverageA: roundA.map((r) => ({ lens: r.lens, coverage: r.coverage })),
  coverageB: roundB.map((r) => ({ lens: r.lens, coverage: r.coverage })),
};
