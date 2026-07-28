/**
 * Exposure is never retrieval — proved against the code, not asserted (lane B2).
 *
 * ## The rule
 *
 * > Rapid clicking through the structure is EXPOSURE. Exposure is never
 * > retrieval.
 *
 * If tapping around the dive wrote to the scheduler we would have built the
 * Duolingo failure with better graphics: low-effort recall producing the
 * illusion of mastery, which the round-2 research documents at scale. The whole
 * build has been defending against exactly this, and this lane is the one that
 * makes the boundary checkable before Wave C3 puts probes on the same surface.
 *
 * ## What is checked, in three independent ways
 *
 * 1. **The dive's module graph cannot reach a write.** Every module the kanji
 *    screen and `src/ui/dive/` can reach is walked, and none of them may import
 *    the store's command surface, the evidence gate, the scheduler, or the
 *    persistence seam. This is the same transitive-module-graph technique
 *    `edrdg-acknowledgement.test.ts` uses, and for the same reason: a per-file
 *    check is defeated — accidentally, which is how it happens — by moving one
 *    call into a helper.
 *
 *    **The walk stops at `src/state/`, and that is not a loophole — it is where
 *    the boundary actually is.** The first version of this scan walked straight
 *    through, and it could not pass: reading the snapshot means importing
 *    `state/app-context.tsx`, which imports the store, which imports the durable
 *    seam and `createDomainEvent`. Every screen in the app is in that position,
 *    because a screen that displays state has to reach the module that holds it.
 *    So "unreachable module" is the wrong rule and would have had to be silenced.
 *    The right rule — the one controller §5 actually states — is about *which
 *    binding is taken across the seam*: a surface may take the reads and may not
 *    take the writes. That is what {@link STATE_READS} pins, exhaustively, so
 *    widening it is a visible edit rather than a quiet capability.
 *
 * 2. **The navigation vocabulary has no member that could write.** The dive's
 *    action union is read out of its source and pinned to exactly three
 *    navigation actions, so a fourth arrives as a failing test rather than as a
 *    quiet capability.
 *
 * 3. **Driving every gesture produces state and nothing else.** The reducer is
 *    run through the whole vocabulary at every depth and the only thing it
 *    returns is a `DiveState`. There is no effect channel to inspect because
 *    there is no effect channel.
 *
 * A fourth check lives in the browser: `e2e/dive-exposure.spec.ts` walks the
 * dive on the shipped bundle and asserts the durable event log is byte-identical
 * afterwards. A source scan cannot make that claim and this file does not try to.
 *
 * ## This scan was demonstrated failing before it passed
 *
 * The honesty rules here are explicit that a test which has never failed proves
 * nothing. A deliberate violation — one import of the app store's command
 * surface, added to `src/ui/dive/dive-state.ts` — was introduced, this suite was
 * run and reported it by name, and the violation was then reverted. The run is
 * recorded in `docs/build-evidence/CAPSULE.md`. `describe('the scan fails the
 * thing it is supposed to fail')` below keeps that property live by running the
 * predicate over a synthetic offender on every run.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  beginDive,
  canSurface,
  centreOf,
  depthOf,
  diveReducer,
  flightDirection,
  type DiveAction,
  type DiveState,
  type DiveStop,
} from '../src/ui/dive/dive-state.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(file, 'utf8');
const rel = (file: string): string => relative(APP_ROOT, file);

/* ------------------------------------------------------------------ *
 * 1. The module graph
 * ------------------------------------------------------------------ */

/**
 * Every name that would let a surface change what the learner knows.
 *
 * Three families, and each is here because it is a real door:
 *
 *   - **the store's command surface** — `dispatch`, `useAppStore`, and every
 *     command kind. A screen that could reach one could append an event.
 *   - **the evidence gate and the scheduler** — the domain's own factories. The
 *     gate is the sole factory for accepted evidence (REQ-ARCH-04) and the
 *     pinned reducer is the sole scheduler (REQ-SCH-01).
 *   - **the persistence seam** — `openAppEventStore` and the adapters, which
 *     would let a surface write past the command handler entirely.
 *
 * Matched as *imported bindings* rather than as substrings, so a docblock that
 * has to name `admitEvidence` in order to say it is forbidden is not itself a
 * violation. That distinction is what keeps this test from being one somebody
 * silences.
 */
const FORBIDDEN_BINDINGS: readonly string[] = [
  // The store's write surface.
  'useAppStore',
  'useDispatch',
  'AppCommand',
  'CaptureCommand',
  'PromoteCommand',
  'MarkUncertaintyCommand',
  'AttachCandidateCommand',
  'AcceptCandidateCommand',
  'SeedEvidenceDemonstrationCommand',
  'CorrectEvidenceCommand',
  'RecordExportCommand',
  // The domain's factories.
  'admitEvidence',
  'evidenceGate',
  'createDomainEvent',
  'memoryStateReducer',
  'applyReview',
  'scheduleNext',
  // The persistence seam.
  'openAppEventStore',
  'ProvisionalWebEventStore',
  'SqliteEventStore',
];

/** Modules that are a write surface by their whole nature, imported or not. */
const FORBIDDEN_MODULES: readonly string[] = ['@bunki/persistence', 'ts-fsrs'];

/**
 * The bindings a surface may take across the `src/state/` seam.
 *
 * Every one of them is a read, and each is here for a stated reason rather than
 * because it happened to be in the way:
 *
 *   - `useAppSnapshot` hands out an immutable projection of the store.
 *   - `useDebugFlags` hands out the URL's own render flags.
 *   - `useLookup` is the four-state resolver every screen uses (REQ-UI-09); it
 *     holds `useState` over a `resolve()` the caller supplies and touches no
 *     store.
 *   - `useConnectivity` reads the online/offline status the shell's banner needs.
 *   - `OFFLINE_CAPABILITY_NOTE` is a string constant.
 *
 * Everything else that leaves that directory — the store handle, the command
 * types, the durable factory — is a write surface or a way to reach one, and a
 * dive module that took one fails below.
 *
 * Type-only bindings are admitted whatever they are named: a type is erased
 * before anything runs, so `import type { AppSnapshot }` is a shape, not a door.
 */
const STATE_READS: readonly string[] = [
  'useAppSnapshot',
  'useDebugFlags',
  'useLookup',
  'useConnectivity',
  'OFFLINE_CAPABILITY_NOTE',
];

/** Where the read/write seam is. The walk stops here; see the header. */
const STATE_BOUNDARY = 'src/state/';

interface ImportBinding {
  readonly name: string;
  readonly typeOnly: boolean;
}

interface ImportRecord {
  readonly specifier: string;
  readonly bindings: readonly ImportBinding[];
}

const IMPORT_STATEMENT = /import\s+(type\s+)?([^;]*?)\s*from\s+'([^']+)'/g;

/**
 * A dynamic `import('…')` or `await import("…")`.
 *
 * The scan was static-only, and the claim made for it in the capsule was not:
 * "walks the kanji screen's whole module graph and fails if any of it can reach
 * a command, the evidence gate, the scheduler or the persistence seam". A dive
 * module could take the store's entire write surface through
 * `await import('../../state/app-context.tsx')` and both the reachability
 * assertion and the seam assertion stayed green, as did eslint. No violation was
 * ever present; the hole was in the guard, and this repository has already had
 * to close this exact class once — see the commit "Fix P1: close deep-path and
 * dynamic-import boundary bypasses".
 *
 * The lookbehind excludes TSDoc's `{@link import('./x.ts').y}`, which is a
 * *type* reference in a comment and appears in this codebase (`scale/levels.ts`
 * uses it). Matching it would fail the scan on a docblock.
 */
const DYNAMIC_IMPORT = /(?<!@link\s)\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * The binding name recorded for a dynamic import.
 *
 * Deliberately not a real identifier and deliberately not in `STATE_READS`: a
 * dynamic import hands over the **whole module namespace**, so there is no
 * version of it that is an allowlisted read of one hook. Naming it this way
 * makes the failure message say what happened.
 */
const DYNAMIC_BINDING = 'the whole module, dynamically';

/**
 * The named bindings and the specifier of every import in a file, static or
 * dynamic.
 */
function importsOf(source: string): readonly ImportRecord[] {
  const out: ImportRecord[] = [];
  for (const match of source.matchAll(DYNAMIC_IMPORT)) {
    out.push({
      specifier: match[1] ?? '',
      bindings: [{ name: DYNAMIC_BINDING, typeOnly: false }],
    });
  }
  for (const match of source.matchAll(IMPORT_STATEMENT)) {
    const wholeClauseIsType = match[1] !== undefined;
    const clause = match[2] ?? '';
    const specifier = match[3] ?? '';
    const braced = /\{([^}]*)\}/.exec(clause);
    const bindings = (braced?.[1] ?? clause)
      .split(',')
      .map((raw): ImportBinding | null => {
        const trimmed = raw.trim();
        if (trimmed === '') return null;
        const typeOnly = wholeClauseIsType || trimmed.startsWith('type ');
        const name = trimmed
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
          ?.trim();
        return name === undefined || name === '' ? null : { name, typeOnly };
      })
      .filter((binding): binding is ImportBinding => binding !== null);
    out.push({ specifier, bindings });
  }
  return out;
}

function resolveImport(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(APP_ROOT, 'src', specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (!existsSync(candidate)) continue;
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      /* a directory; try the next shape */
    }
  }
  return null;
}

/**
 * Every module inside `apps/app` reachable from `entry`, up to the state seam.
 *
 * A file under `src/state/` is *recorded* as reached and not walked into: it is
 * the boundary, and what matters about it is which of its exports crossed, which
 * {@link crossingsInto} checks separately. Walking through it would make the
 * scan report the store's own internals on every screen in the app.
 */
function moduleGraph(entry: string): readonly string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    if (rel(file).startsWith(STATE_BOUNDARY)) continue;
    for (const record of importsOf(read(file))) {
      const next = resolveImport(file, record.specifier);
      if (next !== null && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen].sort();
}

/** Every binding a file takes across the state seam, with how it took it. */
function crossingsInto(file: string, source: string): readonly Violation[] {
  const found: Violation[] = [];
  for (const record of importsOf(source)) {
    const target = resolveImport(resolve(APP_ROOT, file), record.specifier);
    if (target === null || !rel(target).startsWith(STATE_BOUNDARY)) continue;
    for (const binding of record.bindings) {
      if (binding.typeOnly) continue;
      if (STATE_READS.includes(binding.name)) continue;
      found.push({
        file,
        reason: `takes { ${binding.name} } across the state seam from '${record.specifier}'`,
      });
    }
  }
  return found;
}

export interface Violation {
  readonly file: string;
  readonly reason: string;
}

/** Every forbidden reach in one file. The predicate, isolated so it is testable. */
function violationsIn(file: string, source: string): readonly Violation[] {
  const found: Violation[] = [];
  for (const record of importsOf(source)) {
    if (FORBIDDEN_MODULES.some((module) => record.specifier.startsWith(module))) {
      found.push({ file, reason: `imports ${record.specifier}` });
    }
    for (const binding of record.bindings) {
      if (FORBIDDEN_BINDINGS.includes(binding.name)) {
        found.push({ file, reason: `imports { ${binding.name} } from '${record.specifier}'` });
      }
    }
  }
  return found;
}

const DIVE_ENTRY = resolve(APP_ROOT, 'src/screens/kanji-screen.tsx');
const diveGraph = moduleGraph(DIVE_ENTRY);

describe('the dive cannot reach a write, anywhere in its module graph', () => {
  it('has a graph big enough that the scan means something', () => {
    // A scan over one file, or over zero, is the failure mode a module-graph
    // check is most prone to.
    expect(diveGraph.length).toBeGreaterThan(15);
    expect(diveGraph.map(rel)).toContain('src/ui/dive/dive-state.ts');
    expect(diveGraph.map(rel)).toContain('src/ui/dive/dive-canvas.tsx');
    expect(diveGraph.map(rel)).toContain('src/ui/dive/scale-source.ts');
  });

  it('reaches no command, no evidence factory and no scheduler', () => {
    const violations = diveGraph
      .filter((file) => !rel(file).startsWith(STATE_BOUNDARY))
      .flatMap((file) => violationsIn(rel(file), read(file)));
    expect(
      violations.map((violation) => `${violation.file}: ${violation.reason}`),
      'a dive interaction can reach a write path; flight is exposure and exposure is never retrieval',
    ).toEqual([]);
  });

  it('takes only reads across the state seam', () => {
    const crossings = diveGraph
      .filter((file) => !rel(file).startsWith(STATE_BOUNDARY))
      .flatMap((file) => crossingsInto(rel(file), read(file)));
    expect(
      crossings.map((crossing) => `${crossing.file}: ${crossing.reason}`),
      'the dive took a value out of src/state/ that is not one of the two reads',
    ).toEqual([]);
  });

  it('actually crosses the seam, so the check above is not vacuous', () => {
    // The screen does read the snapshot — it has to, to draw a mark at all — so
    // there is a real crossing for the allowlist to be about.
    const screen = read(DIVE_ENTRY);
    const seamImports = importsOf(screen).filter((record) => record.specifier.includes('state/'));
    expect(seamImports.length).toBeGreaterThan(0);
    expect(seamImports.flatMap((record) => record.bindings.map((b) => b.name))).toContain(
      'useAppSnapshot',
    );
  });

  it('holds no dispatch function on the screen itself', () => {
    const screen = read(DIVE_ENTRY);
    // `useAppSnapshot` is a *read*. `useAppStore` is the write surface, and the
    // screen does not hold it.
    expect(screen).toContain('useAppSnapshot');
    expect(screen).not.toContain('useAppStore');
  });

  it('never names a command kind in any dive module', () => {
    const diveFiles = diveGraph.filter((file) => rel(file).startsWith('src/ui/dive/'));
    expect(diveFiles.length).toBeGreaterThan(5);
    for (const file of diveFiles) {
      const body = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const kind of ['capture', 'promote', 'markUncertainty', 'correctEvidence']) {
        expect(body, `${rel(file)} names the command kind '${kind}'`).not.toMatch(
          new RegExp(`kind:\\s*'${kind}'`),
        );
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2. The vocabulary
 * ------------------------------------------------------------------ */

describe('the dive vocabulary has no member that could write', () => {
  const stateSource = read(resolve(APP_ROOT, 'src/ui/dive/dive-state.ts'));

  it('declares exactly three actions, all navigation', () => {
    const kinds = [...stateSource.matchAll(/readonly kind:\s*'([a-z]+)'/g)].map(
      (match) => match[1],
    );
    expect(
      kinds.sort(),
      'a fourth dive action arrived; if it grades anything it belongs behind the evidence gate',
    ).toEqual(['back', 'surface', 'zoom']);
  });

  it('returns a state and nothing else', () => {
    // A reducer that returned `[state, effects]` would be the shape a write
    // could arrive in. The signature is pinned so that change is visible.
    expect(stateSource).toMatch(/export function diveReducer\([^)]*\): DiveState \{/s);
  });
});

/* ------------------------------------------------------------------ *
 * 3. Driving every gesture
 * ------------------------------------------------------------------ */

const stop = (id: string, level: DiveStop['level'], label = id): DiveStop => ({
  id,
  level,
  label,
});

describe('driving the whole vocabulary produces state and nothing else', () => {
  const origin = stop('kanji:森', 'kanji', '森');

  it('starts at the surface with the origin as the centre', () => {
    const state = beginDive(origin);
    expect(state.path).toEqual([origin]);
    expect(centreOf(state)).toEqual(origin);
    expect(depthOf(state)).toBe(0);
    expect(canSurface(state)).toBe(false);
  });

  it('zooms in and records the way it came', () => {
    let state = beginDive(origin);
    state = diveReducer(state, { kind: 'zoom', to: stop('component:木', 'component', '木') });
    state = diveReducer(state, {
      kind: 'zoom',
      to: stop('scale-stroke:1:kanji:木', 'stroke', '1/4'),
    });
    expect(state.path.map((entry) => entry.label)).toEqual(['森', '木', '1/4']);
    expect(depthOf(state)).toBe(2);
  });

  it('offers one gesture all the way back out, at any depth', () => {
    let state = beginDive(origin);
    for (const next of [
      stop('lex-shinrin', 'word', '森林'),
      stop('kanji:林', 'kanji', '林'),
      stop('component:木', 'component', '木'),
      stop('scale-stroke:2:kanji:木', 'stroke', '2/4'),
    ]) {
      state = diveReducer(state, { kind: 'zoom', to: next });
    }
    expect(depthOf(state)).toBe(4);
    expect(canSurface(state)).toBe(true);
    const surfaced = diveReducer(state, { kind: 'surface' });
    expect(surfaced.path).toEqual([origin]);
    expect(depthOf(surfaced)).toBe(0);
  });

  it('winds the path back rather than growing it when a node is revisited', () => {
    // 森 → 木 → 森 → 木 is ten seconds of a finger, and a path that recorded
    // every step of it would be an unbounded breadcrumb of two nodes.
    let state = beginDive(origin);
    const ki = stop('kanji:木', 'kanji', '木');
    for (let round = 0; round < 20; round += 1) {
      state = diveReducer(state, { kind: 'zoom', to: ki });
      state = diveReducer(state, { kind: 'zoom', to: origin });
    }
    expect(state.path).toEqual([origin]);
    expect(new Set(state.path.map((entry) => entry.id)).size).toBe(state.path.length);
  });

  it('is a no-op at the surface rather than an error', () => {
    const state = beginDive(origin);
    expect(diveReducer(state, { kind: 'back' })).toBe(state);
    expect(diveReducer(state, { kind: 'surface' })).toBe(state);
  });

  it('produces only a state, for every action at every depth', () => {
    const actions: readonly DiveAction[] = [
      { kind: 'zoom', to: stop('lex-shinrin', 'word', '森林') },
      { kind: 'zoom', to: stop('kanji:林', 'kanji', '林') },
      { kind: 'back' },
      { kind: 'zoom', to: stop('component:木', 'component', '木') },
      { kind: 'surface' },
      { kind: 'back' },
    ];
    let state: DiveState = beginDive(origin);
    for (const action of actions) {
      const next: DiveState = diveReducer(state, action);
      // The only shape a `DiveState` has. Anything a write could ride out on —
      // an effect list, a command, a callback — would be an extra key.
      expect(Object.keys(next).sort()).toEqual(['origin', 'path']);
      expect(next.path.length).toBeGreaterThan(0);
      state = next;
    }
  });

  it('reads the flight direction off the scale, not off the history', () => {
    const depths = {
      stroke: 0,
      component: 1,
      kanji: 2,
      word: 3,
      collocation: 4,
      sentence: 5,
    } as const;
    expect(flightDirection('word', 'kanji', depths)).toBe('in');
    expect(flightDirection('kanji', 'word', depths)).toBe('out');
    expect(flightDirection('kanji', 'kanji', depths)).toBeNull();
    expect(flightDirection(null, 'kanji', depths)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 4. The scan fails the thing it is supposed to fail
 * ------------------------------------------------------------------ */

describe('the scan fails the thing it is supposed to fail', () => {
  /**
   * The exact violation that was introduced, run, and reverted.
   *
   * Without this, the predicate could be quietly loosened to something that
   * passes on any input and every assertion above would still be green — which
   * is the failure mode a source scan is most prone to and the one this
   * repository has been caught by before.
   */
  const OFFENDING_MODULE = `
    import { useAppStore } from '../../state/app-context.tsx';
    export function zoom() { useAppStore().dispatch({ kind: 'promote', threadId: 't' }); }
  `;

  it('names an import of the store’s command surface', () => {
    const found = violationsIn('src/ui/dive/offender.ts', OFFENDING_MODULE);
    expect(found.map((violation) => violation.reason)).toContain(
      "imports { useAppStore } from '../../state/app-context.tsx'",
    );
  });

  it('names a value taken across the state seam that is not a read', () => {
    const found = crossingsInto('src/ui/dive/offender.ts', OFFENDING_MODULE);
    expect(found.map((violation) => violation.reason)).toContain(
      "takes { useAppStore } across the state seam from '../../state/app-context.tsx'",
    );
  });

  it('admits the reads a dive legitimately takes across the seam', () => {
    const fine = "import { useAppSnapshot, useDebugFlags } from '../../state/app-context.tsx';";
    expect(crossingsInto('src/ui/dive/fine.ts', fine)).toEqual([]);
  });

  it('admits a type taken across the seam, because a type is erased', () => {
    const fine = "import type { AppSnapshot, ThreadView } from '../../state/store.ts';";
    expect(crossingsInto('src/ui/dive/fine.ts', fine)).toEqual([]);
  });

  it('names an import of the persistence seam', () => {
    const found = violationsIn(
      'src/ui/dive/offender.ts',
      "import { openAppEventStore } from '@bunki/persistence';",
    );
    expect(found.length).toBeGreaterThan(0);
  });

  it('names an import of the scheduler', () => {
    const found = violationsIn('src/ui/dive/offender.ts', "import { applyReview } from 'ts-fsrs';");
    expect(found.length).toBeGreaterThan(0);
  });

  it('does not flag a docblock that has to name what it forbids', () => {
    // This very file names `useAppStore` in prose. A predicate that matched
    // substrings would report itself, and a test that reports itself is a test
    // somebody silences.
    const prose = `
      /** Nothing here may reach useAppStore or admitEvidence. */
      import { diveAt } from '@bunki/domain';
    `;
    expect(violationsIn('src/ui/dive/fine.ts', prose)).toEqual([]);
  });

  it('does not flag the reads a dive legitimately makes', () => {
    const fine = `
      import { useAppSnapshot } from '../../state/app-context.tsx';
      import { diveAt, diagnoseInterior } from '@bunki/domain';
      import { seedDataset } from '../../data/catalog.ts';
    `;
    expect(violationsIn('src/ui/dive/fine.ts', fine)).toEqual([]);
  });

  /* ---------------------------------------------------------------- *
   * The three shapes an import can take, and the one that got through
   * ---------------------------------------------------------------- */

  /**
   * The static and namespace forms were always caught. The dynamic one was not,
   * and this repository has closed that same class once before. All three are
   * pinned here so the next loosening has to delete a named test.
   */
  const EVASIONS = [
    {
      shape: 'static',
      source: "import { useAppStore } from '../../state/app-context.tsx';",
    },
    {
      shape: 'namespace',
      source: "import * as context from '../../state/app-context.tsx';",
    },
    {
      shape: 'dynamic',
      source: `
        export async function evade(): Promise<unknown> {
          const mod = await import('../../state/app-context.tsx');
          return mod.useAppStore();
        }
      `,
    },
    {
      shape: 'dynamic, double-quoted',
      source: 'const mod = await import("../../state/app-context.tsx");',
    },
  ] as const;

  it.each(EVASIONS)('catches the $shape reach across the state seam', ({ source }) => {
    const found = crossingsInto('src/ui/dive/offender.ts', source);
    expect(
      found.map((violation) => violation.reason),
      'a dive module reached the store this way and the scan did not notice',
    ).not.toEqual([]);
  });

  it('catches a dynamic import of a forbidden module', () => {
    const found = violationsIn('src/ui/dive/offender.ts', "const fsrs = await import('ts-fsrs');");
    expect(found.length).toBeGreaterThan(0);
  });

  it('follows a dynamic import when it walks the module graph', () => {
    // The reachability half. A module reached only dynamically was invisible to
    // the walk, so its own violations were never scanned either.
    const specifiers = importsOf("const m = await import('./dive-state.ts');").map(
      (record) => record.specifier,
    );
    expect(specifiers).toContain('./dive-state.ts');
  });

  it('does not flag TSDoc that links to a module by import type', () => {
    // `{@link import('./levels.ts').isRetrievalTarget}` is a *type* reference in
    // a comment, and the domain uses exactly this form. Matching it would fail
    // the scan on a docblock, which is how a guard gets switched off.
    const prose = `
      /** See {@link import('../../state/app-context.tsx').useAppStore} for the write surface. */
      import { diveAt } from '@bunki/domain';
    `;
    expect(violationsIn('src/ui/dive/fine.ts', prose)).toEqual([]);
    expect(crossingsInto('src/ui/dive/fine.ts', prose)).toEqual([]);
  });
});
