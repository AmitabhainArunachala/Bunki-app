import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
// FULL #4 source-only freezer successor; import has no execution or writes.
import { currentFootprintPins, requireFootprintApproval } from './tools/footprint-support.mjs';
export { currentFootprintPins, requireFootprintApproval };
export const SUCCESSOR_TOOLS = fileURLToPath(new URL('./tools/', import.meta.url)).replace(/\/$/, '');
export function validateFreezeBinding(binding) {
  assert.equal(binding?.kind, 'bunki-full4-freeze-binding');
  assert.equal(binding.status, 'released-for-freeze', 'FULL4 freeze binding is pending');
  assert(/^[a-f0-9]{40}$/.test(binding.head), 'full source head required');
  assert(/^[a-f0-9]{64}$/.test(binding.artifact), 'fresh artifact required');
  for (const key of ['worktree', 'site', 'contract', 'sourceProjection', 'outputDirectory'])
    assert(typeof binding[key] === 'string' && binding[key].startsWith('/'), key + ' binding required');
  assert.equal(binding.tools, SUCCESSOR_TOOLS, 'successor tools route required');
  const contract = JSON.parse(readFileSync(binding.contract, 'utf8'));
  assert.equal(contract.sourceHead, binding.head); assert.equal(contract.artifactSha256, binding.artifact);
  // Current native sources must match policy before any descriptor/output work.
  return currentFootprintPins(SUCCESSOR_TOOLS, binding.worktree);
}
export async function freezeDescriptors(binding) {
  validateFreezeBinding(binding);
const P=binding.outputDirectory;
const E='/Users/dhyana/.dharma/bunki_review/2026-10-15/juncture/one-hand';
const W=binding.worktree, site=binding.site;
const json=p=>JSON.parse(readFileSync(p,'utf8')); const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const c=json(binding.contract);
const projection=json(binding.sourceProjection);
const load=p=>import(pathToFileURL(join(W,p)).href);
const {acceptanceEnvironment,NARROWING_ENV}=await load('scripts/ci/verification-admission.mjs');
const clean=acceptanceEnvironment(process.env);
for(const k of [...NARROWING_ENV,'KAIRO_BROWSER','PERSONAL_HOST_BROWSER','KAIRO_GATE_RUN_ID','KAIRO_BATTERY_TIMEOUT_MS','KAIRO_IDB_BROWSERS'])delete clean[k];
for(const k of Object.keys(process.env))if(!(k in clean))delete process.env[k];Object.assign(process.env,clean);
const python='/Users/dhyana/.dharma/bunki_review/2026-10-11/r6-gates/python-venv/bin';
process.env.PATH='/opt/homebrew/Cellar/node@22/22.23.3/bin:'+python+':'+process.env.PATH;
process.env.VH_TEST_PYTHON=join(python,'python');process.env.KAIRO_CORPUS_PYTHON=join(python,'python');
const {batteryGates}=await load('scripts/verify-release-gates.mjs');const {supplementalGates}=await load('scripts/ci/supplemental.mjs');const {gateForShard}=await load('scripts/ci/battery.mjs');
const {descriptorDigest}=await import(pathToFileURL(join(E,'FULL/tools/full-support.mjs')).href);
const env={KAIRO_SITE_DIR:site,KAIRO_ARTIFACT_SHA256:c.artifactSha256,KAIRO_VERIFIED_ARTIFACT_SHA256:c.artifactSha256};
const out=join(P,'__descriptor_paths_only__');
const raw=[...batteryGates(out,{...process.env,...env}),...supplementalGates(out)];
const gates=raw.map(g=>gateForShard(g,{id:g.name,gates:[g.name]},env));
assert.equal(gates.length,216);assert.deepEqual(gates.map(g=>g.name),[...c.roster.canonicalNames,...c.roster.supplementalNames]);
for(const g of gates)assert.equal(descriptorDigest(g,out),c.descriptorSha256[g.name],g.name);
for(const k of ['roster','streams','perGate','dependencies','globallyExclusive','sourcePins'])assert.deepEqual(c[k],projection[k],k);
for(const [p,h]of Object.entries(c.sourcePins))assert.equal(hash(join(W,p)),h,p);
const pins=currentFootprintPins(SUCCESSOR_TOOLS,W);assert.deepEqual(pins,projection.footprint.pins);
const footprint={kind:'bunki-full-footprint-review',status:'pending',reviewer:null,reviewedAt:null,sourceHead:c.sourceHead,artifactSha256:c.artifactSha256,pins,retentionMode:'keep-all',scope:'keep-all-no-deletion'};
assert.throws(()=>requireFootprintApproval(footprint,{pins,head:c.sourceHead,artifact:c.artifactSha256}),/Independent W2 footprint approval required/);
const review={status:'pending',reviewer:null,reviewedAt:null,contractSha256:hash(binding.contract),sourceHead:c.sourceHead,artifactSha256:c.artifactSha256,resolvedRequirements:[],footprint};
writeFileSync(join(P,'contract-review.PENDING.json'),JSON.stringify(review,null,2)+'\n',{flag:'wx'});
const descriptors=gates.map(g=>({name:g.name,descriptor:JSON.parse(JSON.stringify(g).replaceAll(out,'<ATTEMPT_OUT>'))}));
writeFileSync(join(P,'descriptors.CANDIDATE.json'),JSON.stringify(descriptors,null,2)+'\n',{flag:'wx'});
writeFileSync(join(P,'FREEZE-CHECKS.json'),JSON.stringify({status:'candidate-bindings-checked-not-approved',gates:216,streams:Object.fromEntries(Object.entries(c.streams).map(([k,v])=>[k,v.length])),sourcePins:Object.keys(c.sourcePins).length,descriptorDigestsMatched:216,sourceProjectionEqual:['roster','streams','perGate','dependencies','globallyExclusive','sourcePins'],footprintCurrentPins:pins,pendingApprovalRejected:true,reviewRequirements:c.reviewRequired,artifact:c.artifactSha256,head:c.sourceHead},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({gates:gates.length,pins:Object.keys(c.sourcePins).length,requirements:c.reviewRequired.length,contractSha256:hash(binding.contract),descriptorsSha256:hash(join(P,'descriptors.CANDIDATE.json')),pendingReviewSha256:hash(join(P,'contract-review.PENDING.json')),approved:false}));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  assert.equal(process.argv.length, 3, 'explicit reviewed freeze binding required');
  await freezeDescriptors(JSON.parse(readFileSync(process.argv[2], 'utf8')));
}
