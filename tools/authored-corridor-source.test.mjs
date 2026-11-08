import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { readAuthoredCorridor } from '../prototypes/corridor/tools/authored-corridor-source.mjs';

function fixture(files, run) {
  const root = mkdtempSync(join(tmpdir(), 'bunki-authored-source-'));
  try {
    for (const [path, source] of Object.entries(files)) {
      const target = join(root, path);
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, source);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const base = {
  'corridor.js':
    "import { reading } from './modules/seat.mjs';\nconst offset = 2;\nfunction answer() { return reading() + offset; }\nexport { offset, answer };\n",
  'modules/seat.mjs':
    "import { offset } from '../corridor.js';\nimport { value } from './value.mjs';\nfunction reading() { return value() + offset; }\nexport { reading };\n",
  'modules/value.mjs': 'function value() { return 38; }\nexport { value };\n',
};
describe('actual authored declaration source across G3 seams', () => {
  it('executes imported transitive declarations and records exact file identities without duplicating the corridor cycle', () =>
    fixture(base, (root) => {
      const result = readAuthoredCorridor(root);
      expect(vm.runInNewContext(result.source + '\nanswer()')).toBe(42);
      expect(result.files.map((row) => row.path).sort()).toEqual(Object.keys(base).sort());
      for (const row of result.files)
        expect(row.sha256).toBe(createHash('sha256').update(base[row.path]).digest('hex'));
    }));
  it('a changed module body changes executed behavior and its source identity', () =>
    fixture(base, (root) => {
      const before = readAuthoredCorridor(root);
      writeFileSync(
        join(root, 'modules/value.mjs'),
        'function value() { return 1; }\nexport { value };\n',
      );
      const after = readAuthoredCorridor(root);
      expect(vm.runInNewContext(after.source + '\nanswer()')).toBe(5);
      expect(after.files.find((row) => row.path === 'modules/value.mjs').sha256).not.toBe(
        before.files.find((row) => row.path === 'modules/value.mjs').sha256,
      );
    }));
  it('missing imported authored source cannot silently fall back to a copied definition', () =>
    fixture({ 'corridor.js': base['corridor.js'] }, (root) => {
      expect(() => readAuthoredCorridor(root)).toThrow();
    }));
  it('conflicting declaration ownership is refused', () =>
    fixture(
      {
        ...base,
        'modules/value.mjs':
          'function value() { return 38; }\nfunction answer() { return 0; }\nexport { value };\n',
      },
      (root) => {
        expect(() => readAuthoredCorridor(root)).toThrow();
      },
    ));
  it('an authored-module import cannot escape its selected source root', () =>
    fixture(
      { 'corridor.js': "import './modules/../../outside.mjs';\nfunction answer() { return 0; }\n" },
      (root) => {
        expect(() => readAuthoredCorridor(root)).toThrow();
      },
    ));
});

it('symlink targets cannot escape the authored root or modules boundary', () =>
  fixture(base, (root) => {
    const external = mkdtempSync(join(tmpdir(), 'bunki-external-source-'));
    try {
      const outside = join(external, 'outside.mjs');
      writeFileSync(outside, 'function value() { return 38; }\nexport { value };\n');
      unlinkSync(join(root, 'modules/value.mjs'));
      symlinkSync(outside, join(root, 'modules/value.mjs'));
      expect(() => readAuthoredCorridor(root)).toThrow();
      unlinkSync(join(root, 'corridor.js'));
      symlinkSync(outside, join(root, 'corridor.js'));
      expect(() => readAuthoredCorridor(root)).toThrow();
    } finally {
      rmSync(external, { recursive: true, force: true });
    }
  }));
it('unsupported anonymous or expression defaults cannot silently lose authored source', () => {
  for (const source of [
    'export default function () { return 1; }',
    'export default class {}',
    'export default { value: 1 };',
  ]) {
    fixture({ ...base, 'modules/value.mjs': source }, (root) =>
      expect(() => readAuthoredCorridor(root)).toThrow(),
    );
  }
});

it('named export aliases cannot make a lift execute a different function than ESM', async () => {
  const source = 'function reading() { return 42; } function other() { return 0; } export { other as reading };';
  const actual = await import('data:text/javascript,' + encodeURIComponent(source));
  expect(actual.reading()).toBe(0);
  fixture({ ...base, 'modules/seat.mjs': source }, (root) => {
    expect(() => readAuthoredCorridor(root)).toThrow(/Unsupported.*export/i);
  });
});
it('rejects local and forwarded export aliases while retaining same-name exports', () => {
  for (const source of [
    'function value() { return 38; } export { value as renamed };',
    "export { value as reading } from './value.mjs';",
    "export { value as 'reading' } from './value.mjs';",
  ]) fixture({ ...base, 'modules/seat.mjs': source }, (root) => {
    expect(() => readAuthoredCorridor(root)).toThrow(/Unsupported.*export/i);
  });
  fixture(base, (root) => {
    expect(vm.runInNewContext(readAuthoredCorridor(root).source + '\nanswer()')).toBe(42);
  });
});
