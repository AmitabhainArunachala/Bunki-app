/**
 * A source scan for the thing REQ-LM-03 and REQ-UI-07 forbid
 * (Campaign E / A2).
 *
 * `retrievability.test.ts` proves that the projections this suite *calls* emit
 * no collapsed number. That is a claim about the paths a test happens to
 * execute. This file reads `src/graph/` and `src/journey/` as text, so a helper
 * added later on a path nobody covers is caught too — the same reasoning, and
 * the same method, as `test/purity/no-ambient-nondeterminism.test.ts`.
 *
 * It also re-pins, from this directory's side, the two boundaries the
 * projections could plausibly want to cross: minting evidence, and writing
 * memory state. A map that could do either would stop being a projection.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/** Comments are stripped: this file's own rationale names every banned word. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Both projection surfaces. A directory added later must be added here too. */
const PROJECTION_DIRECTORIES = ['src/graph', 'src/journey'];

const files = PROJECTION_DIRECTORIES.flatMap((directory) =>
  sourceFiles(join(PACKAGE_ROOT, directory)),
);

describe('the projections declare no collapsed scalar', () => {
  it('has sources to scan', () => {
    expect(files.length).toBeGreaterThanOrEqual(PROJECTION_DIRECTORIES.length * 5);
  });

  /**
   * Identifier names, not prose. `mastery` in a sentence explaining why there is
   * no mastery score is exactly the comment this scan strips; `masteryScore` as
   * a property is the defect.
   */
  const FORBIDDEN_IDENTIFIERS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
    { label: 'mastery', pattern: /\bmastery[A-Za-z]*\s*[:?=(]/ },
    { label: 'proficiency', pattern: /\bproficiency[A-Za-z]*\s*[:?=(]/ },
    { label: 'overallScore / overall*', pattern: /\boverall[A-Za-z]*\s*[:?=(]/ },
    { label: 'comprehensionPercent', pattern: /\bcomprehension[A-Za-z]*\s*[:?=(]/ },
    { label: 'jlptLevel', pattern: /\bjlpt[A-Za-z]*\s*[:?=(]/i },
    { label: 'brightness', pattern: /\bbrightness[A-Za-z]*\s*[:?=(]/ },
    { label: 'knowledgeScore / *Score', pattern: /\b[A-Za-z]*[Ss]core\s*[:?=(]/ },
    { label: 'levelClaim / *Level', pattern: /\b[A-Za-z]*[Ll]evel\s*[:?=(]/ },
  ];

  it.each(FORBIDDEN_IDENTIFIERS.map((entry) => [entry.label, entry] as const))(
    'declares no identifier resembling %s',
    (_label, forbidden) => {
      const offenders = files
        .filter((path) => forbidden.pattern.test(code(path)))
        .map((path) => relative(PACKAGE_ROOT, path));
      expect(
        offenders,
        `REQ-LM-03 forbids a global scalar and REQ-UI-07 forbids collapsing the capability lenses into one light.`,
      ).toEqual([]);
    },
  );

  it('never averages across lenses', () => {
    const offenders = files
      .filter((path) => /\/\s*CAPABILITY_LENSES\.length|reduce\([^)]*lens/i.test(code(path)))
      .map((path) => relative(PACKAGE_ROOT, path));
    expect(offenders).toEqual([]);
  });
});

describe('the projections read and never write', () => {
  it('mints no event and calls no evidence factory', () => {
    const banned = [
      /\bmintEvidence\w*\(/,
      /\bmakeEvent\w*\(/,
      /\badmitToScheduler\(/,
      /from\s+['"][^'"]*\/evidence\//,
      /from\s+['"][^'"]*\/events\/factories/,
    ];
    files.forEach((path) => {
      const source = code(path);
      banned.forEach((pattern) => {
        expect(
          pattern.test(source),
          `${relative(PACKAGE_ROOT, path)} matches ${String(pattern)}`,
        ).toBe(false);
      });
    });
  });

  it('imports no scheduler of its own (REQ-SCH-01)', () => {
    files.forEach((path) => {
      expect(code(path), relative(PACKAGE_ROOT, path)).not.toMatch(/from\s+['"]ts-fsrs['"]/);
    });
  });

  /**
   * `retrievability.ts` *calls* the pinned reducer to rebuild history for the
   * scrubber — that is reuse of the one scheduler, and it is exactly what keeps
   * the replayed timeline identical to replay's own answer. What it must not do
   * is construct a memory state from anything else, so this pins the call sites
   * by name and by file.
   */
  it('folds memory state only through the pinned reducer, and only in one file', () => {
    const callers = files
      .filter((path) => /\bapplyAdmittedReview\(|\binitialMemoryState\(/.test(code(path)))
      .map((path) => relative(PACKAGE_ROOT, path))
      .sort();
    expect(callers).toEqual(['src/graph/retrievability.ts']);
  });

  it('reaches for nothing ambient', () => {
    const ambient: readonly RegExp[] = [
      /\bDate\s*\.\s*now\b/,
      /\bnew\s+Date\b/,
      /\bDate\s*\.\s*(parse|UTC)\b/,
      /\bMath\s*\.\s*random\b/,
      /\bperformance\s*\.\s*now\b/,
      /\bglobalThis\b/,
      /\bprocess\s*\.\s*(env|argv|platform|hrtime|cwd)\b/,
      /\bfetch\s*\(/,
      /\bset(Timeout|Interval)\s*\(/,
    ];
    files.forEach((path) => {
      const source = code(path);
      ambient.forEach((pattern) => {
        expect(
          pattern.test(source),
          `${relative(PACKAGE_ROOT, path)} matches ${String(pattern)} — a projection that read the ambient clock would make the map differ between two renders of one log`,
        ).toBe(false);
      });
    });
  });
});
