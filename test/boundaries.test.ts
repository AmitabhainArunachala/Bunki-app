import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Executable proof of the controller §5 boundaries (WP-01, ADR-001).
 *
 * V1's verification of the first WP-01 build found that the boundaries were
 * enforced only against bare specifiers in static syntax: a deep relative path
 * and a dynamic `import()` both walked straight through. The fix is in
 * `eslint.config.mjs`; this file is what stops the hole from reopening.
 *
 * These cases run the *real* `eslint.config.mjs` — not a fixture copy — over
 * synthetic source text at synthetic paths, so a future edit that weakens a
 * boundary fails CI here rather than being discovered by a verifier three
 * waves later.
 *
 * Negative controls matter as much as the positives: a rule that rejects
 * everything proves nothing, so each boundary also asserts the legitimate
 * import it must keep allowing.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOUNDARY_RULES = new Set(['no-restricted-imports', 'bunki/package-boundaries']);

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: REPO_ROOT });
});

/** Lints `code` as if it lived at `path`, returning the boundary rule ids that fired. */
async function boundaryErrors(path: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(REPO_ROOT, path) });
  return (result?.messages ?? [])
    .filter((m) => m.severity === 2 && m.ruleId != null && BOUNDARY_RULES.has(m.ruleId))
    .map((m) => m.ruleId as string);
}

const DOMAIN = 'packages/domain/src/__probe__.ts';
const DOMAIN_JS = 'packages/domain/src/__probe__.js';
const APP = 'apps/app/src/state/__probe__.ts';
const EXPORT_PKG = 'packages/export/src/__probe__.ts';

describe('B1 — @bunki/domain purity (controller §5, REQ-ARCH-02)', () => {
  it.each([
    ['static platform import', `import 'react-native';`],
    ['static Node builtin', `import 'node:fs';`],
    ['static sibling package', `import '@bunki/persistence';`],
    ['sibling subpath', `import '@bunki/persistence/src/port';`],
    ['re-export from a sibling', `export * from '@bunki/persistence';`],
    // The two forms V1 proved were open at 3879866.
    ['deep relative path via packages/', `import '../../../packages/persistence/src/index.ts';`],
    ['sibling-relative path', `import '../../persistence/src/index.ts';`],
    ['dynamic import of a platform', `export const p = () => import('react-native');`],
    ['dynamic import of a sibling', `export const p = () => import('@bunki/persistence');`],
    [
      'dynamic import of a relative path',
      `export const p = () => import('../../persistence/src/index.ts');`,
    ],
  ])('rejects %s', async (_label, code) => {
    expect(await boundaryErrors(DOMAIN, code)).not.toHaveLength(0);
  });

  it('rejects require() in a .js file, where the TypeScript require ban is off', async () => {
    expect(
      await boundaryErrors(
        DOMAIN_JS,
        `const rn = require('react-native');\nmodule.exports = rn;\n`,
      ),
    ).not.toHaveLength(0);
  });

  it('allows ts-fsrs — the one legitimate scheduler call site (REQ-SCH-01)', async () => {
    expect(await boundaryErrors(DOMAIN, `import 'ts-fsrs';`)).toHaveLength(0);
  });

  it('rejects a bare Node builtin without the node: prefix', async () => {
    expect(await boundaryErrors(DOMAIN, `import 'fs';`)).not.toHaveLength(0);
  });

  /**
   * Regression guard. Import patterns are matched with gitignore semantics, so
   * an unanchored `events` pattern matches `./events/index.ts` as well as the
   * Node builtin — and controller §5 mandates `packages/domain/src/events/`.
   * Unanchored, WP-02's very first intra-package import would have been a lint
   * error. These are the §5 domain subdirectories that collide with a builtin.
   */
  it.each([
    './events/index.ts',
    '../events/schema.ts',
    './contracts/path.ts',
    '../replay/stream.ts',
  ])('allows the intra-package path %s', async (specifier) => {
    expect(await boundaryErrors(DOMAIN, `import '${specifier}';`)).toHaveLength(0);
  });
});

describe('B2 — apps/app cannot reach the persistence write path (gate-bypass hole)', () => {
  it.each([
    ['static package import', `import '@bunki/persistence';`],
    ['deep relative path', `import '../../../../packages/persistence/src/index.ts';`],
    ['dynamic package import', `export const p = () => import('@bunki/persistence');`],
    [
      'dynamic deep relative path',
      `export const p = () => import('../../../../packages/persistence/src/index.ts');`,
    ],
  ])('rejects %s', async (_label, code) => {
    expect(await boundaryErrors(APP, code)).not.toHaveLength(0);
  });

  it('allows @bunki/domain — appends must flow through the command handler', async () => {
    expect(await boundaryErrors(APP, `import '@bunki/domain';`)).toHaveLength(0);
  });

  /**
   * WP-10 narrowed the ban instead of dropping it, so the narrowing itself has
   * to be a tested boundary: one directory may name the package, and every
   * neighbour of that directory still may not.
   *
   * The negative cases are the ones that matter. A `files`/`ignores` pattern
   * that accidentally matched `apps/app/src/state/**` — or that matched by
   * substring, so `.../state/persistence-helper.ts` slipped in — would leave the
   * gate-bypass hole open while the config still *read* as narrow.
   */
  describe('the WP-10 seam is exactly one directory', () => {
    it.each([
      ['the seam index', 'apps/app/src/state/persistence/index.ts'],
      ['its shared types', 'apps/app/src/state/persistence/shared.ts'],
      ['the web platform store', 'apps/app/src/state/persistence/platform-store.ts'],
      ['the native platform store', 'apps/app/src/state/persistence/platform-store.native.ts'],
    ])('allows @bunki/persistence in %s', async (_label, path) => {
      expect(await boundaryErrors(path, `import '@bunki/persistence';`)).toHaveLength(0);
    });

    it.each([
      ['the store beside it', 'apps/app/src/state/durable-store.ts'],
      ['a similarly-named sibling', 'apps/app/src/state/persistence-helper.ts'],
      ['a screen', 'apps/app/src/screens/capture-screen.tsx'],
      ['a route', 'apps/app/app/index.tsx'],
      ['a test', 'apps/app/test/persistence-boundary.test.ts'],
    ])('still rejects @bunki/persistence in %s', async (_label, path) => {
      expect(await boundaryErrors(path, `import '@bunki/persistence';`)).not.toHaveLength(0);
    });

    it('still rejects ts-fsrs inside the seam', async () => {
      expect(
        await boundaryErrors('apps/app/src/state/persistence/index.ts', `import 'ts-fsrs';`),
      ).not.toHaveLength(0);
    });
  });
});

describe('B3 — one scheduler implementation (REQ-SCH-01)', () => {
  it.each([
    ['apps/app static', APP, `import 'ts-fsrs';`],
    ['apps/app dynamic', APP, `export const p = () => import('ts-fsrs');`],
    ['other package static', EXPORT_PKG, `import 'ts-fsrs';`],
    ['other package dynamic', EXPORT_PKG, `export const p = () => import('ts-fsrs');`],
  ])('rejects ts-fsrs: %s', async (_label, path, code) => {
    expect(await boundaryErrors(path, code)).not.toHaveLength(0);
  });
});
