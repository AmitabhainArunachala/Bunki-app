import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { admitProof, extractSiteArchive, REPOSITORY } from './receipts.mjs';

const commit = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const digest = `sha256:${'c'.repeat(64)}`;
function fixture() {
  const identity = {
    repository: REPOSITORY,
    sha: commit,
    tree,
    runId: 12,
    runAttempt: 1,
    policyDigest: 'd'.repeat(64),
  };
  const artifact = {
    id: 42,
    name: 'bunki-site-12-1',
    digest,
    producerSha: commit,
    artifactSha256: 'e'.repeat(64),
    manifestSha256: 'f'.repeat(64),
  };
  const shards = [
    { id: 'fast-1', gates: ['lint'] },
    { id: 'browser-1', gates: ['corridor'] },
  ];
  return {
    receipt: {
      schemaVersion: 1,
      kind: 'bunki-full-battery',
      status: 'passed',
      scope: 'full',
      identity,
      artifact,
      requiredNames: ['lint', 'corridor'],
      shards,
      gates: [
        { name: 'lint', status: 'passed' },
        { name: 'corridor', status: 'flaky' },
      ],
    },
    plan: { scope: 'full', identity, requiredNames: ['corridor', 'lint'], shards },
    run: {
      id: 12,
      run_attempt: 1,
      repository: { full_name: REPOSITORY },
      head_repository: { full_name: REPOSITORY },
      path: '.github/workflows/ci.yml',
      event: 'pull_request',
      status: 'completed',
      conclusion: 'success',
      head_sha: commit,
    },
    jobs: [
      'bunki / required',
      'build',
      'native',
      'battery / fast-1',
      'battery / browser-1',
      'bunki / fast',
    ].map((name) => ({ name, status: 'completed', conclusion: 'success', run_attempt: 1 })),
    proofArtifact: {
      id: 43,
      name: `bunki-proof-${tree}`,
      digest,
      expired: false,
      workflow_run: { id: 12 },
    },
    siteArtifact: { ...artifact, expired: false, workflow_run: { id: 12 } },
    producerTree: tree,
    runHeadTree: tree,
    producerParents: [],
  };
}

test('admits same-tree full successful proof, preserving original producer', () => {
  const value = fixture();
  value.plan.identity = { ...value.plan.identity, sha: '1'.repeat(40) };
  assert.equal(admitProof(value).producerSha, commit);
});

test('admits synthetic PR merge only when its parent is the API head and trees match', () => {
  const value = fixture();
  value.run.head_sha = '2'.repeat(40);
  value.producerParents = [value.run.head_sha];
  assert.equal(admitProof(value).tree, tree);
  value.producerParents = [];
  assert.throws(() => admitProof(value), /unrelated/);
});

const rejections = {
  'early fast signal': (v) => {
    v.receipt.kind = 'bunki-fast-signal';
  },
  'docs-only proof': (v) => {
    v.receipt.scope = 'docs';
  },
  'failed gate': (v) => {
    v.receipt.gates[0].status = 'failed';
  },
  'missing gate': (v) => {
    v.receipt.gates.pop();
  },
  'duplicate gate': (v) => {
    v.receipt.gates.push(v.receipt.gates[0]);
  },
  'missing native job': (v) => {
    v.jobs = v.jobs.filter((j) => j.name !== 'native');
  },
  'cancelled shard': (v) => {
    v.jobs[4].conclusion = 'cancelled';
  },
  'never-run shard': (v) => {
    v.jobs[4].conclusion = 'skipped';
  },
  'stale jobs': (v) => {
    v.jobs[4].run_attempt = 2;
  },
  'stale receipt': (v) => {
    v.run.run_attempt = 2;
  },
  'wrong source tree': (v) => {
    v.producerTree = '3'.repeat(40);
  },
  'API head differs': (v) => {
    v.runHeadTree = '3'.repeat(40);
  },
  'other workflow': (v) => {
    v.run.path = '.github/workflows/untrusted.yml';
  },
  'fork workflow': (v) => {
    v.run.head_repository.full_name = 'fork/Bunki-app';
  },
  'running producer': (v) => {
    v.run.status = 'in_progress';
  },
  'red producer': (v) => {
    v.run.conclusion = 'failure';
  },
  'no aggregate': (v) => {
    v.jobs.shift();
  },
  'expired site': (v) => {
    v.siteArtifact.expired = true;
  },
  'wrong archive digest': (v) => {
    v.siteArtifact.digest = `sha256:${'0'.repeat(64)}`;
  },
  'wrong artifact run': (v) => {
    v.siteArtifact.workflow_run.id = 13;
  },
  'missing identity digest': (v) => {
    delete v.receipt.artifact.manifestSha256;
  },
  'changed policy': (v) => {
    v.plan.identity = { ...v.plan.identity, policyDigest: '0'.repeat(64) };
  },
  'changed shard topology': (v) => {
    v.receipt.shards = [{ id: 'other', gates: ['corridor', 'lint'] }];
  },
};
for (const [name, mutate] of Object.entries(rejections))
  test(`rejects ${name}`, () => {
    const value = fixture();
    mutate(value);
    assert.throws(() => admitProof(value));
  });

test('site archive extracts bytes and refuses traversal, links, duplicate paths and unexpected files', () => {
  const base =
    process.env.CI && process.env.RUNNER_TEMP
      ? join(process.env.RUNNER_TEMP, 'ci-receipt-tests')
      : join(homedir(), '.dharma/bunki_review/2026-10-06/ci/receipt-tests');
  mkdirSync(base, { recursive: true });
  const out = mkdtempSync(join(base, 'archive-'));
  for (const kind of ['safe', 'traversal', 'symlink', 'duplicate', 'extra']) {
    const archive = join(out, `${kind}.zip`);
    execFileSync('python3', [
      '-c',
      `import io,sys,tarfile,zipfile
kind,path=sys.argv[1:]
buf=io.BytesIO()
with tarfile.open(fileobj=buf,mode='w') as t:
 m=tarfile.TarInfo('../escape' if kind=='traversal' else 'index.html'); data=b'verified bytes'; m.size=len(data)
 if kind=='symlink': m.type=tarfile.SYMTYPE; m.linkname='../escape'; m.size=0
 t.addfile(m,io.BytesIO(data))
 if kind=='duplicate': t.addfile(m,io.BytesIO(data))
with zipfile.ZipFile(path,'w') as z:
 z.writestr('site.tar',buf.getvalue())
 if kind=='extra': z.writestr('program.py','untrusted')
`,
      kind,
      archive,
    ]);
    const destination = join(out, kind);
    if (kind === 'safe') {
      extractSiteArchive(archive, destination);
      assert.equal(readFileSync(join(destination, 'index.html'), 'utf8'), 'verified bytes');
    } else assert.throws(() => extractSiteArchive(archive, destination));
  }
});
