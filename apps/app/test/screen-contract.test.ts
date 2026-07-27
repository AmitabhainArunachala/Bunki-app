/**
 * Source-level guarantees about the three screens (WP-05 closure predicate).
 *
 * These are file scans rather than renders, deliberately. Some of WP-05's
 * predicate is about what a screen must *never* contain, and a render test can
 * only prove that one code path did not produce something. A scan proves the
 * text is not in the tree at all.
 *
 * What is checked here:
 *
 *   - dictionary indices are never rendered (REQ-UI-03 — they are join keys);
 *   - the seed entry disclosure reaches both the word and kanji pages;
 *   - REQ-GATE-03's forbidden claims appear nowhere in the app;
 *   - the app never imports `@bunki/persistence` (controller §5 boundary 2),
 *     nor `ts-fsrs` (REQ-SCH-01 single scheduler);
 *   - every screen handles all four REQ-UI-09 states.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED_DIRS = ['app', 'src'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (['.ts', '.tsx'].includes(extname(full))) {
      out.push(full);
    }
  }
  return out;
}

const sourceFiles = SCANNED_DIRS.flatMap((dir) => walk(resolve(APP_ROOT, dir)));
const read = (file: string): string => readFileSync(file, 'utf8');
const rel = (file: string): string => relative(APP_ROOT, file);

/**
 * Source with comments removed.
 *
 * The prohibitions below are about what the app *does* — what it renders, what
 * it imports — and this file's own subjects have to be nameable in prose to be
 * documented at all. Scanning raw text would make every explanation of a rule a
 * violation of it, which is the sort of test that gets deleted rather than
 * fixed. Strings are preserved, so a forbidden word in rendered copy is still
 * caught.
 */
const code = (file: string): string =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const screen = (name: string): string => read(resolve(APP_ROOT, 'src/screens', name));
const captureSource = screen('capture-screen.tsx');
const wordSource = screen('word-screen.tsx');
const kanjiSource = screen('kanji-screen.tsx');

describe('the app has three screens and they are wired to routes', () => {
  it('ships exactly the screens WP-05 owns', () => {
    const screens = readdirSync(resolve(APP_ROOT, 'src/screens')).sort();
    expect(screens).toEqual(['capture-screen.tsx', 'kanji-screen.tsx', 'word-screen.tsx']);
  });

  it('routes each one', () => {
    expect(read(resolve(APP_ROOT, 'app/index.tsx'))).toContain('CaptureScreen');
    expect(read(resolve(APP_ROOT, 'app/word/[lexemeId].tsx'))).toContain('WordScreen');
    expect(read(resolve(APP_ROOT, 'app/kanji/[character].tsx'))).toContain('KanjiScreen');
  });
});

describe('dictionary indices are never rendered (REQ-UI-03)', () => {
  /**
   * The exact list REQ-UI-03 excludes. Matched case-insensitively against every
   * app source file, because the requirement is about the page, not about one
   * component.
   */
  const FORBIDDEN_INDICES = [
    'SKIP',
    'Henshall',
    'NJECD',
    'Gakken',
    'New Nelson',
    'Nelson',
    'KALD',
    'Daikanwa',
    'Morohashi',
    'Four Corner',
    'De Roo',
  ];

  it.each(FORBIDDEN_INDICES)('never renders a %s index', (indexName) => {
    // `SKIP` is matched as a whole word; the rest are matched case-insensitively
    // with flexible whitespace, so `New  Nelson` cannot slip through.
    const pattern =
      indexName === 'SKIP' ? /\bSKIP\b/ : new RegExp(indexName.replace(/\s+/g, '\\s+'), 'i');

    const offenders = sourceFiles.filter((file) => pattern.test(code(file)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('has no index field in the seed to render in the first place', async () => {
    const { seedDataset } = await import('@bunki/seed');
    for (const kanji of seedDataset.kanji) {
      const fields = Object.keys(kanji.provenance);
      expect(fields.filter((field) => /index|skip|nelson|henshall|morohashi/i.test(field))).toEqual(
        [],
      );
    }
  });
});

describe('the seed entry disclosure reaches the pages that need it', () => {
  it('renders on the word page', () => {
    expect(wordSource).toContain('SeedEntryDisclosure');
  });

  it('renders on the kanji page', () => {
    expect(kanjiSource).toContain('SeedEntryDisclosure');
  });

  it('comes from @bunki/seed rather than being retyped', () => {
    const notices = read(resolve(APP_ROOT, 'src/ui/notices.tsx'));
    expect(notices).toContain('SEED_ENTRY_DISCLOSURE');
    // The literal string must not be duplicated anywhere in the app.
    const hardcoded = sourceFiles.filter((file) =>
      read(file).includes('Readings and senses in this seed are representative'),
    );
    expect(hardcoded.map(rel)).toEqual([]);
  });

  it('shows the coverage disclosure on an empty search', () => {
    expect(captureSource).toContain('SeedCoverageDisclosure');
  });
});

describe('every screen implements all four REQ-UI-09 states', () => {
  it.each([
    ['capture', captureSource],
    ['word', wordSource],
    ['kanji', kanjiSource],
  ])('%s screen', (_name, source) => {
    expect(source).toContain('LoadingPanel');
    expect(source).toContain('ErrorPanel');
    expect(source).toContain('EmptyPanel');
  });

  it('puts the offline banner in the shell so no screen can omit it', () => {
    const shell = read(resolve(APP_ROOT, 'src/ui/screen-shell.tsx'));
    expect(shell).toContain('OfflineBanner');
    expect(shell).toContain("connectivity === 'offline'");
  });
});

describe('architectural boundaries (controller §5)', () => {
  /**
   * An import in any of its forms — `from 'x'`, `import 'x'`, `import('x')`,
   * `require('x')`.
   *
   * Matching the bare name anywhere would flag the deferred register, which has
   * to *name* `@bunki/persistence` to record that swapping it in is W4's job.
   * Naming a package in prose is not importing it; this pattern is the
   * difference.
   */
  const importsOf = (specifier: string): RegExp =>
    new RegExp(String.raw`(?:from|import|require)\s*\(?\s*['"]` + specifier, 'g');

  it('never imports @bunki/persistence', () => {
    const offenders = sourceFiles.filter((file) =>
      importsOf(String.raw`@bunki/persistence`).test(code(file)),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it('never reaches packages/persistence by a relative path either', () => {
    const offenders = sourceFiles.filter((file) =>
      /['"][^'"]*packages\/persistence/.test(code(file)),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it('never imports ts-fsrs', () => {
    const offenders = sourceFiles.filter((file) => importsOf('ts-fsrs').test(code(file)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('constructs events only through the kernel factory', () => {
    // A literal event object in the app would bypass validation and the
    // evidence gate. The only mention of a factory in apps/app is the import.
    const stateFiles = sourceFiles.filter((file) => rel(file).startsWith('src/state/'));
    const factoryUsers = stateFiles.filter((file) => code(file).includes('createDomainEvent'));
    expect(factoryUsers.map(rel)).toEqual(['src/state/memory-store.ts']);

    const screenFiles = sourceFiles.filter((file) => rel(file).startsWith('src/screens/'));
    for (const file of screenFiles) {
      expect(code(file)).not.toContain('createDomainEvent');
      // Screens dispatch commands; they never mint an event or a type literal.
      expect(code(file)).not.toMatch(/type:\s*['"]EncounterCaptured['"]/);
    }
  });

  it('holds no scheduling, grading or evidence logic', () => {
    for (const file of sourceFiles) {
      const source = code(file);
      expect(source, rel(file)).not.toMatch(/\bfsrs\b/i);
      expect(source, rel(file)).not.toMatch(/\bstability\b|\bretrievability\b|\bmemoryState\b/i);
      expect(source, rel(file)).not.toMatch(/\bschedule(d|r)?\b|\bdueAt\b|\bnextReview\b/i);
    }
  });
});

describe('claim boundaries (REQ-GATE-03)', () => {
  const FORBIDDEN_CLAIMS = [
    /scientifically\s+optimi[sz]ed/i,
    /proven\s+to\s+(improve|increase|boost)/i,
    /reduce[sd]?\s+(your\s+)?review\s+burden/i,
    /comprehension\s+\d+\s*%/i,
    /\b\d+\s*%\s+(comprehension|mastery|retention)/i,
    /guaranteed\s+(recall|retention|fluency)/i,
    /your\s+(japanese\s+)?level\s+is/i,
    /\bfluency\s+score\b/i,
  ];

  it.each(FORBIDDEN_CLAIMS)('makes no claim matching %s', (pattern) => {
    const offenders = sourceFiles.filter((file) => pattern.test(read(file)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('does not present the in-memory store as durable', () => {
    const store = read(resolve(APP_ROOT, 'src/state/store.ts'));
    expect(store).toContain('in-memory-session-only');
    // The capture screen renders the store's own note rather than a literal.
    expect(captureSource).toContain('DURABILITY_NOTES');
    expect(captureSource).not.toMatch(/saved\s+permanently|saved\s+forever|never\s+lose/i);
  });

  /**
   * Both screens once stated unconditionally that "the event log records that a
   * mark exists". That is true only for a mark chosen before Keep; a mark
   * applied afterwards writes no event at all. A sentence about the log has to
   * come from the thread, so it cannot be true on one path and false on another.
   */
  it('derives what it says about the event log rather than asserting it', () => {
    for (const [name, source] of [
      ['capture', captureSource],
      ['word', wordSource],
    ] as const) {
      expect(source, name).toContain('uncertaintyLogNote');
      // The claim must not appear as a literal in a screen — only inside the
      // branch of the helper that has established it.
      expect(source, name).not.toMatch(/log records that a mark exists/);
      expect(source, name).not.toMatch(/records that a mark exists, not which one/);
    }
    expect(read(resolve(APP_ROOT, 'src/state/store.ts'))).toContain('markedAtCapture');
  });

  it('labels the seed as a seed wherever it could be mistaken for a dictionary', () => {
    expect(wordSource).toMatch(/seed/i);
    expect(kanjiSource).toMatch(/seed/i);
    expect(captureSource).toMatch(/seed/i);
  });
});
