/**
 * The kernel reaches for nothing ambient (WP-02; REQ-ARCH-02, REQ-DM-04.4).
 *
 * `eslint.config.mjs` (WP-01) already forbids *importing* React, Expo, Node
 * builtins, or a sibling package from `packages/domain/src`. That closes the
 * import surface and leaves the globals open: `Date.now()`, `Math.random()`,
 * and `crypto.randomUUID()` need no import, so no import rule can see them, and
 * any one of them would make two replays of one log disagree.
 *
 * This suite closes that gap by reading the source. It is a source scan rather
 * than a runtime spy because a spy only catches the paths a test happens to
 * execute, and the risk here is a helper added later on a path nobody covers.
 *
 * `eslint.config.mjs` is WP-01's surface, so WP-02 could not add an equivalent
 * `no-restricted-globals` rule there without writing outside its own work
 * package (orchestration spec §2.4). The scan is the in-surface equivalent and
 * is strictly wider: it catches member expressions a globals rule would miss.
 * If a later WP moves this into lint, this file should be deleted, not kept in
 * parallel.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_ROOT = join(PACKAGE_ROOT, 'src');

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
  });
}

/**
 * Comment text is stripped before scanning.
 *
 * Not a loophole — the point of the scan is what the code *does*, and this file
 * plus several source headers discuss `Date.now()` by name precisely because it
 * is forbidden. A scanner that flagged its own rationale would have to be
 * silenced, and a silenced scanner catches nothing.
 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

interface ForbiddenPattern {
  readonly label: string;
  readonly pattern: RegExp;
  readonly instead: string;
}

const FORBIDDEN: readonly ForbiddenPattern[] = [
  { label: 'Date.now()', pattern: /\bDate\s*\.\s*now\b/, instead: 'context.clock.now()' },
  {
    label: 'new Date(...)',
    pattern: /\bnew\s+Date\b/,
    instead: 'the canonical IsoInstant string helpers',
  },
  {
    label: 'Date.parse / Date.UTC',
    pattern: /\bDate\s*\.\s*(parse|UTC)\b/,
    instead: 'isValidIsoInstant / compareInstants',
  },
  {
    label: 'Math.random()',
    pattern: /\bMath\s*\.\s*random\b/,
    instead: 'context.random.nextUnitInterval()',
  },
  { label: 'crypto', pattern: /\bcrypto\s*\./, instead: 'context.ids.nextId(kind)' },
  {
    label: 'performance.now()',
    pattern: /\bperformance\s*\.\s*now\b/,
    instead: 'an injected clock',
  },
  {
    label: 'process',
    pattern: /\bprocess\s*\.\s*(env|argv|platform|hrtime|cwd)\b/,
    instead: 'an explicit argument',
  },
  { label: 'globalThis', pattern: /\bglobalThis\b/, instead: 'an explicit argument' },
  { label: 'require()', pattern: /\brequire\s*\(/, instead: 'a static import' },
  { label: 'dynamic import()', pattern: /(^|[^.\w])import\s*\(/, instead: 'a static import' },
  { label: 'fetch()', pattern: /\bfetch\s*\(/, instead: 'a port injected by the caller' },
  {
    label: 'setTimeout / setInterval',
    pattern: /\bset(Timeout|Interval)\s*\(/,
    instead: 'a pure function',
  },
];

const files = sourceFiles(SRC_ROOT);

describe('@bunki/domain reaches for nothing ambient', () => {
  it('has sources to scan (a scan over zero files proves nothing)', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(FORBIDDEN.map((entry) => [entry.label, entry] as const))(
    'never calls %s anywhere under src/',
    (_label, forbidden) => {
      const offenders = files
        .filter((path) => forbidden.pattern.test(code(path)))
        .map((path) => relative(PACKAGE_ROOT, path));

      expect(
        offenders,
        `${forbidden.label} is ambient and would break deterministic replay (T-03). Use ${forbidden.instead}.`,
      ).toEqual([]);
    },
  );

  it('imports only zod and its own relative modules', () => {
    // The import boundary is lint-enforced (ADR-001); this asserts the positive
    // form, which is easier to read in a review than a list of what is banned:
    // one third-party dependency, everything else local.
    const specifiers = new Set<string>();
    files.forEach((path) => {
      const source = code(path);
      const pattern = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g;
      let match = pattern.exec(source);
      while (match !== null) {
        if (match[1] !== undefined) specifiers.add(match[1]);
        match = pattern.exec(source);
      }
    });

    const bare = [...specifiers].filter((specifier) => !specifier.startsWith('.')).sort();
    expect(bare).toEqual(['zod']);
  });

  it('declares zod as an exact pinned dependency', () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.['zod']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('the injection seam is the only way time and identity enter', () => {
  it('routes every envelope stamp through DomainContext', () => {
    // The factory is the one place that mints eventId/occurredAt. If a second
    // place appears, this assertion is where the review conversation starts.
    const factories = code(join(SRC_ROOT, 'events', 'factories.ts'));
    expect(factories).toMatch(/context\.ids\.nextId\('event'\)/);
    expect(factories).toMatch(/context\.clock\.now\(\)/);

    const minters = files.filter((path) => /\bclock\s*\.\s*now\s*\(/.test(code(path)));
    expect(minters.map((path) => relative(PACKAGE_ROOT, path))).toEqual([
      'src/events/factories.ts',
    ]);
  });
});
