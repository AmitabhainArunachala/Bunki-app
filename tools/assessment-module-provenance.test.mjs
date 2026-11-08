import { Buffer } from 'node:buffer';
import { afterEach, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCompiledModuleInventory } from '../prototypes/corridor/tools/compiled-module-inventory.mjs';
const roots = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'compiled-inventory-'));
  roots.push(root);
  mkdirSync(join(root, 'modules'));
  const names = ['modules/assessment-core.mjs', 'modules/record-core.mjs'];
  const files = names.map((path) => {
    const bytes = Buffer.from(`export const path = ${JSON.stringify(path)};`);
    writeFileSync(join(root, path), bytes);
    return { path, bytes: bytes.length, sha256: hash(bytes) };
  });
  const modules = names.map((path) => ({
    path,
    compiler: { name: 'esbuild', version: 'fixture' },
    inputs: [{ path: 'source.ts', sha256: hash('source') }],
  }));
  const authored = Buffer.from('export function authoredSeam() {}');
  writeFileSync(join(root, 'modules/authored.mjs'), authored);
  files.push({ path: 'modules/authored.mjs', bytes: authored.length, sha256: hash(authored) });
  return { root, names, identity: { files, modules } };
}
test('compiled provenance stays exact while authored seams need no compiler record', () => {
  const f = fixture();
  const loaded = readCompiledModuleInventory(f.root, f.identity, f.names);
  expect(loaded.map((row) => row.path)).toEqual(f.names);
  for (const row of loaded) {
    expect(row.compiler).toEqual(f.identity.modules.find((m) => m.path === row.path).compiler);
    expect(row.inputs).toEqual(f.identity.modules.find((m) => m.path === row.path).inputs);
    expect(hash(row.bytes)).toBe(f.identity.files.find((m) => m.path === row.path).sha256);
  }
});
test('every required core needs unique compiler provenance and a manifest entry', () => {
  for (const required of fixture().names) {
    let f = fixture();
    f.identity.modules = f.identity.modules.filter((m) => m.path !== required);
    expect(() => readCompiledModuleInventory(f.root, f.identity, f.names)).toThrow();
    f = fixture();
    f.identity.files = f.identity.files.filter((m) => m.path !== required);
    expect(() => readCompiledModuleInventory(f.root, f.identity, f.names)).toThrow();
  }
  const f = fixture();
  f.identity.modules.push(f.identity.modules[0]);
  expect(() => readCompiledModuleInventory(f.root, f.identity, f.names)).toThrow();
});
test('altered or missing compiled bytes and escaping identities fail before execution', () => {
  let f = fixture();
  writeFileSync(join(f.root, f.names[0]), 'export const altered = true;');
  expect(() => readCompiledModuleInventory(f.root, f.identity, f.names)).toThrow();
  f = fixture();
  rmSync(join(f.root, f.names[0]));
  expect(() => readCompiledModuleInventory(f.root, f.identity, f.names)).toThrow();
  f = fixture();
  f.identity.modules[0].path = '../outside.mjs';
  expect(() => readCompiledModuleInventory(f.root, f.identity, f.names)).toThrow();
});
