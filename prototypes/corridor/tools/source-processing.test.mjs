import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

assert(process.env.KAIRO_SITE_DIR, 'Supply a staged KAIRO_SITE_DIR');
const site = resolve(process.env.KAIRO_SITE_DIR), path = 'source-processing.mjs';
const manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json')));
assert.equal(createHash('sha256').update(readFileSync(resolve(site, path))).digest('hex'), manifest.files.find((f) => f.path === path)?.sha256);
const { createSourceProcessingApprovals, parseSourceProcessingScope } = await import(pathToFileURL(resolve(site, path)));
const sourceId = '29ee89c1-bca0-4c99-8579-137f4c226b06';
const scope = { sourceKind: 'personal-reading', sourceId, sourceDigest: 'a'.repeat(64),
  baseUrl: 'https://synthetic-tutor.example/compatible', model: 'synthetic-tutor', providerConfigId: randomUUID() };
const now = '2026-09-13T00:00:00.000Z';
const copy = (value) => JSON.parse(JSON.stringify(value));
function fixture() {
  const values = new Map(); let current = true, writable = true;
  const options = { storage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { if (!writable) throw new Error('quota'); values.set(key, value); },
  }, installationText: 'synthetic installation A', databaseName: 'synthetic database', assertCurrent: () => current };
  return { values, options, open: (extra = {}) => createSourceProcessingApprovals({ ...options, ...extra }),
    denyWrites: () => { writable = false; }, restoreWrites: () => { writable = true; }, revokeOwner: () => { current = false; } };
}
test('a source identity, digest or serialized lease grants nothing without explicit device approval', () => {
  const f = fixture(), a = f.open();
  assert.equal(a.status(scope), 'approval-required');
  assert.throws(() => a.issue(scope), /source-approval-required/u);
  for (const value of [{}, scope, { approved: true }, null]) assert.throws(() => a.assertLease(value, scope));
  assert.equal(f.values.size, 0);
});
test('approval survives controller restart on the same installation and issues fresh opaque leases', () => {
  const f = fixture(), a = f.open(), revision = randomUUID();
  const entry = a.allow(scope, revision, now), lease = a.issue(scope);
  assert(Object.isFrozen(entry.scope)); assert(Object.isFrozen(lease)); assert.deepEqual(copy(lease), {});
  assert.equal(a.assertLease(lease, scope), true);
  const restarted = f.open(); assert.equal(restarted.status(scope), 'approved');
  assert.throws(() => restarted.assertLease(lease, scope));
  assert.equal(restarted.assertLease(restarted.issue(scope), scope), true);
  assert.equal(JSON.stringify([...f.values]).includes('credential'), false);
});
test('source version, source identity, provider path, model and configuration changes each require approval', () => {
  const a = fixture().open(); a.allow(scope, randomUUID(), now); const lease = a.issue(scope);
  for (const patch of [{ sourceDigest: 'b'.repeat(64) }, { sourceId: randomUUID() },
    { baseUrl: 'https://synthetic-tutor.example/other' }, { model: 'other-synthetic-model' }, { providerConfigId: randomUUID() }]) {
    const changed = { ...scope, ...patch };
    assert.equal(a.status(changed), 'approval-required');
    assert.throws(() => a.assertLease(lease, changed));
  }
});
test('revocation invalidates existing and derived leases and persists after restart', () => {
  const f = fixture(), a = f.open(); a.allow(scope, randomUUID(), now); const lease = a.issue(scope);
  a.revoke(sourceId);
  assert.throws(() => a.assertLease(lease, scope), /source-approval-changed/u);
  assert.equal(a.status(scope), 'approval-required'); assert.equal(f.open().status(scope), 'approval-required');
  a.allow(scope, randomUUID(), now);
  assert.throws(() => a.assertLease(lease, scope), /source-approval-changed/u);
});
test('approving a new version replaces only that source and cannot restore an old lease', () => {
  const a = fixture().open(), other = { ...scope, sourceId: randomUUID() };
  a.allow(scope, randomUUID(), now); a.allow(other, randomUUID(), now);
  const lease = a.issue(scope), otherLease = a.issue(other), changed = { ...scope, sourceDigest: 'c'.repeat(64) };
  a.allow(changed, randomUUID(), now);
  assert.throws(() => a.assertLease(lease, scope)); assert.equal(a.assertLease(otherLease, other), true);
  a.revoke(sourceId); assert.equal(a.assertLease(otherLease, other), true);
});
test('foreign or malformed bytes fail closed without overwrite, including an attempted allow or revoke', () => {
  for (const bad of ['{broken', 'null', JSON.stringify({ version: 1, installation: 'foreign', entries: [] }),
    JSON.stringify({ version: 2, installation: 'synthetic installation A', entries: [] })]) {
    const f = fixture(), a = f.open(); f.values.set(a.key, bad);
    for (const action of [() => a.status(scope), () => a.issue(scope), () => a.allow(scope, randomUUID(), now), () => a.revoke(sourceId)])
      assert.throws(action);
    assert.equal(f.values.get(a.key), bad);
  }
});
test('copied device approval cannot authorize a different record installation', () => {
  const f = fixture(), a = f.open(); a.allow(scope, randomUUID(), now);
  const before = [...f.values], foreign = f.open({ installationText: 'synthetic installation B' });
  assert.throws(() => foreign.status(scope)); assert.throws(() => foreign.allow(scope, randomUUID(), now));
  assert.deepEqual([...f.values], before);
});
test('ownership loss invalidates read, allow, revoke and old request leases while preserving bytes', () => {
  const f = fixture(), a = f.open(); a.allow(scope, randomUUID(), now); const lease = a.issue(scope), before = [...f.values];
  f.revokeOwner();
  for (const action of [() => a.status(scope), () => a.allow(scope, randomUUID(), now), () => a.revoke(sourceId), () => a.assertLease(lease, scope)])
    assert.throws(action, /source-approval-owner-changed/u);
  assert.deepEqual([...f.values], before);
});
test('failed approval writes preserve the previous permission and never return a successful approval', () => {
  const f = fixture(), a = f.open(); a.allow(scope, randomUUID(), now); const before = [...f.values]; f.denyWrites();
  const changed = { ...scope, sourceDigest: 'b'.repeat(64) };
  assert.throws(() => a.allow(changed, randomUUID(), now), /quota/u);
  assert.equal(a.status(changed), 'approval-required'); assert.deepEqual([...f.values], before);
});
test('failed revocation stops leases before disk I/O and supports explicit retry without claiming persistence', () => {
  const f = fixture(); let a, lease, stoppedBeforeWrite = false;
  a = f.open({ onChange: () => { if (lease) { assert.throws(() => a.assertLease(lease, scope)); stoppedBeforeWrite = true; } } });
  a.allow(scope, randomUUID(), now); lease = a.issue(scope); const before = [...f.values]; f.denyWrites();
  assert.throws(() => a.revoke(sourceId), /quota/u); assert(stoppedBeforeWrite);
  assert.equal(a.status(scope), 'revocation-pending'); assert.throws(() => a.issue(scope));
  assert.deepEqual([...f.values], before);
  assert.equal(f.open().status(scope), 'approved', 'Failed persistence is explicitly observable, not reported as durable revocation');
  f.restoreWrites(); a.revoke(sourceId); assert.equal(f.open().status(scope), 'approval-required');
});
test('external approval removal or revision changes invalidate an already issued lease', () => {
  const f = fixture(), a = f.open(); a.allow(scope, randomUUID(), now); const lease = a.issue(scope);
  f.open().allow(scope, randomUUID(), now); assert.throws(() => a.assertLease(lease, scope));
  const newer = a.issue(scope); f.values.delete(a.key); assert.throws(() => a.assertLease(newer, scope));
});
test('closed scope refuses portable operation upgrades, accessors, invalid destinations and unbounded inputs', () => {
  for (const patch of [{ sourceKind: 'publisher-reading' }, { sourceId: 'claim' }, { sourceDigest: 'not-a-digest' },
    { baseUrl: 'http://synthetic-tutor.example' }, { baseUrl: 'https://user:secret@synthetic-tutor.example' },
    { baseUrl: 'https://synthetic-tutor.example?token=synthetic' }, { baseUrl: 'https://synthetic-tutor.example/#x' },
    { model: 'x'.repeat(201) }, { model: '\ud800' }, { providerConfigId: 'claim' }, { operation: 'ai-transform' }])
    assert.throws(() => parseSourceProcessingScope({ ...scope, ...patch }));
  let touched = false;
  const accessor = { ...scope, get model() { touched = true; return 'synthetic'; } };
  assert.throws(() => parseSourceProcessingScope(accessor)); assert.equal(touched, false);
});
