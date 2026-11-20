/** Synthetic transport evidence for admission unit tests only; never a gate producer. */
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './verification-admission.mjs';
import { batteryGates } from '../verify-release-gates.mjs';
import { supplementalGates } from './supplemental.mjs';
import { gateEvidenceDeclaration, RELEASE_GROUPS } from './gate-evidence.mjs';
import { commandChecks, commandCheckEvidence } from './command-check-contracts.mjs';
import { frameworkGateRoster } from './framework-rosters.mjs';

const ROOT = fileURLToPath(new globalThis.URL('../..', import.meta.url));
let descriptors;
const obligations = new Map();

/** The declared transported proof kind and obligation shape for one planned gate. */
export function syntheticProof(name) {
  if (obligations.has(name)) return globalThis.structuredClone(obligations.get(name));
  descriptors ??= new Map(
    [...batteryGates('/synthetic', {}), ...supplementalGates('/synthetic')].map((g) => [g.name, g]),
  );
  const gate = descriptors.get(name);
  if (!gate) throw new Error(`Synthetic evidence for an unplanned gate: ${name}`);
  const { kind, ...declaration } = gateEvidenceDeclaration(gate, ROOT, '/synthetic');
  let obligation;
  if (kind === 'command-check') {
    const planned = commandCheckEvidence(gate, ROOT);
    obligation = {
      ...planned,
      kind: commandChecks[name].kind,
      completed: true,
      processExitCode: 0,
    };
  } else if (kind === 'adapter')
    obligation = {
      adapter: declaration.name,
      expectedCases: [`${name}/synthetic`],
      observedCases: [`${name}/synthetic`],
    };
  else if (kind === 'retained-report') obligation = { type: gate.report.type };
  else if (kind === 'node-test')
    obligation = {
      files: declaration.files.map((file) => relative(ROOT, resolve(ROOT, file))),
      tests: declaration.files.length,
    };
  else if (kind === 'framework') {
    const roster = frameworkGateRoster(name);
    obligation = {
      framework: roster.framework,
      gate: name,
      scope: 'file-level',
      tests: roster.files.length,
      files: roster.files,
      filesSha256: digest(JSON.stringify(roster.files)),
      universeSha256: digest(JSON.stringify(roster.universe.files)),
    };
  } else if (kind === 'python') obligation = { kind: 'python' };
  else if (kind === 'release-runner') obligation = { groups: RELEASE_GROUPS };
  else if (kind === 'reference-core')
    obligation = {
      expectedCases: JSON.parse(
        readFileSync(resolve(ROOT, 'scripts/ci/vh-reference-case-roster.json'), 'utf8'),
      ),
    };
  else if (kind === 'official-content')
    obligation = { scope: 'full repository plus planted fixture controls', files: 1 };
  else if (kind === 'word-grammar')
    obligation = {
      fullAcceptance: true,
      controlsVerified: true,
      unverifiedControls: [],
      expectedControls: ['synthetic-control'],
      observedControls: ['synthetic-control'],
      expectedWalks: ['synthetic-walk'],
      observedWalks: ['synthetic-walk'],
      expectedCandidates: ['synthetic-candidate'],
      observedCandidates: ['synthetic-candidate'],
    };
  else throw new Error(`No synthetic transport shape for ${name} (${kind})`);
  obligations.set(name, { kind, obligation });
  return globalThis.structuredClone({ kind, obligation });
}

export function syntheticEvidence(name, gitSha, artifactSha256, proof = syntheticProof(name)) {
  const runId = `synthetic-${name}`;
  const evidenceReceipt = {
    schemaVersion: 1,
    kind: 'bunki-gate-evidence',
    name,
    runId,
    gitSha,
    artifactSha256,
    fullAcceptance: true,
    proof: {
      ...proof,
      receipts: [{ path: `/synthetic/${name}.json`, sha256: '1'.repeat(64), bytes: 100 }],
    },
  };
  return { runId, evidenceReceipt, evidenceReceiptSha256: digest(JSON.stringify(evidenceReceipt)) };
}

export function isolateFixtureGit(parent) {
  const prior = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = [parent, prior].filter(Boolean).join(':');
  return () => {
    if (prior === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = prior;
  };
}
