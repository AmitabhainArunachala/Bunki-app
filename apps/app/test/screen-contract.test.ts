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
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const code = (file: string): string => stripComments(read(file));

const screen = (name: string): string => read(resolve(APP_ROOT, 'src/screens', name));
const captureSource = screen('capture-screen.tsx');
const wordSource = screen('word-screen.tsx');
const kanjiSource = screen('kanji-screen.tsx');

/**
 * Which work package owns each file in `src/screens/`.
 *
 * WP-05 pinned this directory to an exact three-element list. That was right
 * while one builder owned every screen and wrong the moment three did: B7
 * recorded (WP-07 coordination request 3) that adding a fourth entry would mean
 * editing another builder's test mid-wave, and moved its slice to
 * `src/candidate/` to avoid it; B8 hit the same wall with its session and canvas
 * screens. WP-09 widened it once for the wave; WP-10 now merges all three lanes
 * into one branch, so for the first time the table can be exhaustive again.
 *
 * It is checked in both directions. Every file present must be registered, so a
 * screen cannot arrive unowned and undocumented; and every registered file must
 * be present, so a lane that was dropped in a merge is a failed test rather than
 * a quietly missing feature. `_helper` marks a non-screen module that lives here
 * because the surface lock puts it here.
 */
const SCREEN_OWNERS: Readonly<Record<string, string>> = {
  'capture-screen.tsx': 'WP-05',
  'word-screen.tsx': 'WP-05',
  'kanji-screen.tsx': 'WP-05',
  'evidence-inspector-screen.tsx': 'WP-09',
  'inspector-debug-screen.tsx': 'WP-09',
  'evidence-chain.ts': 'WP-09 (_helper: pure chain projection, not a screen)',
  'session-screen.tsx': 'WP-08',
  'canvas-screen.tsx': 'WP-08',
  'session-repair-screen.tsx': 'WP-08',
  'canvas-cloze.ts': 'WP-08 (_helper: cloze planning, not a screen)',
  'canvas-passage.ts': 'WP-08 (_helper: passage segmentation, not a screen)',
  'session-loop.ts': 'WP-08 (_helper: workspace hook, not a screen)',
  'session-timing.ts': 'WP-08 (_helper: latency measurement, not a screen)',
  'session-workspace.tsx': 'WP-08 (_helper: workspace provider, not a screen)',
};

const screenFileNames = readdirSync(resolve(APP_ROOT, 'src/screens')).sort();

describe('every screen file has a recorded owner and a route', () => {
  it('registers every file in src/screens', () => {
    const unregistered = screenFileNames.filter(
      (name) => !Object.prototype.hasOwnProperty.call(SCREEN_OWNERS, name),
    );
    expect(
      unregistered,
      'add the file to SCREEN_OWNERS with the WP that owns it, or move it out of src/screens',
    ).toEqual([]);
  });

  /**
   * The merge check, stated as an equality rather than a containment.
   *
   * WP-10 merged WP-07's, WP-08's and WP-09's lanes into one line, and the
   * failure mode of that merge is a lane silently losing a file. An exhaustive
   * `toEqual` is the assertion that notices; `arrayContaining` would have passed
   * on a branch that had quietly dropped the canvas.
   */
  it('ships every screen all three W4 lanes contributed', () => {
    expect(screenFileNames).toEqual(Object.keys(SCREEN_OWNERS).sort());
  });

  /**
   * Every owned screen is rendered by a route.
   *
   * The `_helper` convention in `SCREEN_OWNERS` is what makes this checkable
   * without a second list: a module that is not a screen says so in its owner
   * string, and everything else must appear in some route file's source. The
   * *reachability* of those routes — that a learner can actually arrive at one
   * without typing a URL — is a stronger property and has its own file,
   * `test/navigation-reachability.test.ts`, driven by `src/ui/navigation.ts`.
   */
  it('renders every screen from some route file', () => {
    const routeSources = walk(resolve(APP_ROOT, 'app')).map(read).join('\n');
    const unrouted = Object.entries(SCREEN_OWNERS)
      .filter(([, owner]) => !owner.includes('_helper'))
      .map(([name]) => name)
      .filter((name) => {
        const component = componentNameOf(name);
        return !routeSources.includes(component);
      });
    expect(unrouted, 'each screen needs a route file under apps/app/app/').toEqual([]);
  });
});

/** `evidence-inspector-screen.tsx` → `EvidenceInspectorScreen`. */
function componentNameOf(fileName: string): string {
  return fileName
    .replace(/\.tsx?$/, '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

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

  it('renders on the search screen, which displays JMdict fields too', () => {
    // §3 of the EDRDG licence statement asks for the acknowledgement on *each*
    // screen display of words from the files, and a search result row is a
    // reading, senses and a part of speech. This screen shipped with only the
    // coverage disclosure, which renders exactly when nothing matched — the one
    // state in which no licensed word is on screen.
    expect(captureSource).toContain('SeedEntryDisclosure');
  });
});

/** The three panels that stand for a *screen state* (REQ-UI-09). */
const STATE_PANELS = ['LoadingPanel', 'ErrorPanel', 'EmptyPanel'] as const;

const SCREEN_SOURCES: ReadonlyArray<readonly [string, string]> = [
  ['capture', captureSource],
  ['word', wordSource],
  ['kanji', kanjiSource],
  ['evidence inspector', screen('evidence-inspector-screen.tsx')],
  ['inspector debug', screen('inspector-debug-screen.tsx')],
];

describe('every screen implements all four REQ-UI-09 states', () => {
  it.each(SCREEN_SOURCES)('%s screen defines all three panels', (_name, source) => {
    for (const panel of STATE_PANELS) {
      expect(source).toContain(panel);
    }
  });

  /**
   * Defining the states is not the requirement — *being in one of them* is.
   *
   * This assertion used to check only that each panel's name appeared in the
   * file, which a screen can satisfy while rendering two of them at once. The
   * diagnostics screen did exactly that: on the empty state it returned a
   * fragment holding `LoadingPanel` **and** `EmptyPanel`, so `/debug` with no
   * records put an `accessibilityRole="progressbar"` inside a polite live
   * region beside "Nothing recorded yet." — a screen reader announcing work
   * permanently in progress on a screen that had already finished. The name
   * scan passed the whole time, and the screenshot filed as evidence that the
   * four states were met is the one that shows both panels stacked.
   *
   * Two structural checks replace it. Neither can be satisfied by a comment.
   */
  it.each(SCREEN_SOURCES)('%s screen renders no two state panels at once', (_name, source) => {
    const body = stripComments(source);

    // (a) Every loading panel is dominated by a test for the loading state.
    // `resolveViewState` returns one member of a closed union, so a panel
    // guarded this way cannot coexist with another. A screen with more loading
    // panels than loading guards is rendering one unconditionally — which is
    // the defect above, where the file consulted no state at all.
    const loadingPanels = body.match(/<LoadingPanel\b/g) ?? [];
    const loadingGuards = body.match(/state\.kind === 'loading'/g) ?? [];
    expect(
      loadingGuards.length,
      "every <LoadingPanel /> must sit behind a `state.kind === 'loading'` test",
    ).toBeGreaterThanOrEqual(loadingPanels.length);

    // (b) No JSX fragment holds two different state panels. Siblings in a
    // fragment render together by definition, which is the exact shape the
    // defect took: <><LoadingPanel …/><EmptyPanel …/></>.
    for (const match of body.matchAll(/<>([\s\S]*?)<\/>/g)) {
      const inner = match[1] ?? '';
      const together = STATE_PANELS.filter((panel) => inner.includes(`<${panel}`));
      expect(
        together.length,
        `these state panels share one JSX fragment and would render together: ${together.join(', ')}`,
      ).toBeLessThanOrEqual(1);
    }
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

  /**
   * The WP-10 seam: one directory names `@bunki/persistence`, and nothing else
   * does.
   *
   * The rule controller §5 states is about appends, not about the word
   * "persistence": the UI must not be able to reach past the domain command
   * handler to the event store. WP-05 kept that with a blanket ban because the
   * app had no durable store; WP-10 has one, so the ban is narrowed to a named
   * directory instead of dropped. The assertion is written as an exact set
   * rather than a "starts with" filter so that widening the seam is a visible
   * edit to this list.
   */
  const PERSISTENCE_SEAM = 'src/state/persistence/';

  it('imports @bunki/persistence only inside the state seam', () => {
    const importers = sourceFiles
      .filter((file) => importsOf(String.raw`@bunki/persistence`).test(code(file)))
      .map(rel)
      .sort();
    expect(importers).toEqual([
      'src/state/persistence/index.ts',
      'src/state/persistence/platform-store.native.ts',
      'src/state/persistence/platform-store.ts',
      'src/state/persistence/shared.ts',
    ]);
    for (const importer of importers) {
      expect(importer.startsWith(PERSISTENCE_SEAM)).toBe(true);
    }
  });

  /**
   * The seam hands out no adapter class.
   *
   * Re-exporting `ProvisionalWebEventStore` or `SqliteEventStore` would make the
   * narrowing cosmetic — anything could open its own store from the app's own
   * module. What leaves the seam is one factory, plus labels and disclosure
   * strings.
   */
  it('re-exports no adapter class from the seam', () => {
    const seam = code(resolve(APP_ROOT, 'src/state/persistence/index.ts'));
    for (const forbidden of ['ProvisionalWebEventStore', 'SqliteEventStore']) {
      expect(seam, `${forbidden} must not leave the seam`).not.toMatch(
        new RegExp(String.raw`export\s+(?:type\s+)?\{[^}]*\b${forbidden}\b`, 's'),
      );
    }
  });

  /**
   * …and the seam's own factory does not travel either.
   *
   * `openAppEventStore` returns a live `EventStore`, so a screen that could
   * import it could append past the command handler — which is the exact hole
   * controller §5's rule exists to close, reopened one level in. The lint rule
   * cannot express "this app directory may import that app directory", so the
   * containment is asserted here: only `src/state/` reaches the seam, and every
   * screen goes through `AppStore`.
   */
  it('is reached only from src/state/', () => {
    const importers = sourceFiles
      .filter((file) => /['"][^'"]*\bpersistence\/(?:index|shared|platform-store)/.test(code(file)))
      .map(rel)
      .filter((file) => !file.startsWith('src/state/persistence/'))
      .sort();
    expect(importers).toEqual(['src/state/app-context.tsx', 'src/state/durable-store.ts']);
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
