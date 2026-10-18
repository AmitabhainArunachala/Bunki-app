/** Synthetic transport evidence for admission unit tests only; never a gate producer. */
import { digest } from './verification-admission.mjs';
export function syntheticEvidence(name, gitSha, artifactSha256) {
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
      kind: 'retained-report',
      receipts: [{ path: `/synthetic/${name}.json`, sha256: '1'.repeat(64), bytes: 100 }],
      obligation: { synthetic: true },
    },
  };
  return { runId, evidenceReceipt, evidenceReceiptSha256: digest(JSON.stringify(evidenceReceipt)) };
}
