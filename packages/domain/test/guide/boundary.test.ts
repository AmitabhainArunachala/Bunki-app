/**
 * The 案内人's hard boundary, enforced (Campaign E / B6; map document §4.3).
 *
 * The design document is explicit that this must be a test rather than a
 * promise:
 *
 * > A new lane owns the guide: position on the map, conversation-driven
 * > assessment, the long/short plan records, and the hard boundary in §4.3 —
 * > **enforced by a test, not by a promise.**
 *
 * The property being enforced: **no guide output can reach a path that decides
 * memory state or review timing.** That is one sentence and four separable
 * failure modes, so it is four groups of assertions with different mechanisms.
 *
 *   1. *Wiring* — no module on the evidence path or the review-timing path can
 *      reach `src/guide/` through its imports.
 *   2. *Naming* — and none of them so much as names a guide export, which is
 *      the assertion that survives someone reaching the guide through the
 *      package barrel rather than through a relative path.
 *   3. *Direction* — the guide, for its part, cannot reach the gate, the
 *      minter, the memory-state reducer or `ts-fsrs`.
 *   4. *Runtime* — a guide artefact that got as far as a decision function is
 *      recognised and refused, including after a JSON round trip, where a class
 *      or a brand would have stopped being a guarantee.
 *
 * A fifth group makes the other four worth something: the predicates are run
 * against deliberately violating synthetic sources and must report them. Without
 * it, a predicate quietly loosened into one that passes on any input would leave
 * every assertion above green.
 *
 * ## This test was watched failing before it was made to pass
 *
 * A real, temporary edit to `packages/domain/src/evidence/gate.ts` — importing
 * `proposeRoute` from this directory and calling it inside `admitToScheduler` —
 * was made, this file was run, and it failed in groups 1 and 2. The edit was
 * then reverted and never committed. The command, the diff and the verbatim
 * failure output are recorded in `docs/build-evidence/CAPSULE.md` under B6.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { admitToScheduler, type EvidenceGateContext } from '../../src/evidence/gate.ts';
import {
  GUIDE_ACTION_KINDS,
  GUIDE_ARTEFACT_KINDS,
  GuideAuthorityBoundaryError,
  assertNotGuideArtefact,
  formEstimate,
  guidePositionOn,
  openConversation,
  proposePlan,
  proposeRoute,
  type GuideEstimate,
} from '../../src/guide/index.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const DOMAIN_SRC = join(REPO_ROOT, 'packages/domain/src');
const APP_SRC = join(REPO_ROOT, 'apps/app/src');

const read = (file: string): string => readFileSync(file, 'utf8');
const rel = (file: string): string => relative(REPO_ROOT, file);

// ---------------------------------------------------------------------------
// The two sides of the boundary, named as paths
// ---------------------------------------------------------------------------

/**
 * The guide's own directories.
 *
 * Both sides of the app/kernel split, because the app half can produce a guide
 * value just as easily as the kernel half can.
 */
const GUIDE_DIRS = [join(DOMAIN_SRC, 'guide'), join(APP_SRC, 'ui/guide')];

/**
 * Every module that decides memory state or review timing, or that is on the
 * way to one.
 *
 * Listed rather than globbed, because the list *is* the claim: a reader should
 * be able to check that the evidence gate, the minter, the pinned scheduler and
 * the session planner are all on it. Each entry is asserted to exist, so a
 * rename that emptied this list fails rather than passing vacuously.
 */
const DECISION_PATH = [
  'packages/domain/src/evidence/gate.ts',
  'packages/domain/src/evidence/mint.ts',
  'packages/domain/src/evidence/index.ts',
  'packages/domain/src/reducers/memory-state.ts',
  'packages/domain/src/reducers/fsrs-pin.ts',
  'packages/domain/src/reducers/promotion.ts',
  'packages/domain/src/contracts/retrieval-contract.ts',
  'packages/domain/src/contracts/promotion-activation.ts',
  'packages/domain/src/session/plan.ts',
  'packages/domain/src/session/runtime.ts',
  'packages/domain/src/session/commands.ts',
  'packages/domain/src/session/canvas.ts',
  'packages/domain/src/graph/retrievability.ts',
  'apps/app/src/state/memory-store.ts',
  'apps/app/src/state/durable-store.ts',
  'apps/app/src/state/store.ts',
];

/** The four things the guide may never reach. */
const DECIDERS = [
  'packages/domain/src/evidence/gate.ts',
  'packages/domain/src/evidence/mint.ts',
  'packages/domain/src/reducers/memory-state.ts',
  'packages/domain/src/reducers/fsrs-pin.ts',
];

// ---------------------------------------------------------------------------
// Module graph walking
// ---------------------------------------------------------------------------

const IMPORT_PATTERN = /from\s+'([^']+)'/g;

function resolveImport(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(APP_SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Every module reachable from `entry` by a relative or `@/`-aliased import.
 *
 * Bare workspace specifiers are deliberately not followed. `@bunki/domain`
 * resolves to a barrel that re-exports every directory in the kernel, so
 * following it would make *every* module reachable from every other and the
 * wiring assertion would be unenforceable — it would fail on the day the guide
 * was first exported and never say anything true again. The naming assertion
 * below is what covers reaching the guide through the barrel, and it covers it
 * exactly: an import through a barrel still has to name what it took.
 */
function moduleGraph(entry: string): readonly string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of read(file).matchAll(IMPORT_PATTERN)) {
      const next = resolveImport(file, match[1] as string);
      if (next !== null && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen];
}

const isUnder = (file: string, dirs: readonly string[]): boolean =>
  dirs.some((dir) => file.startsWith(`${dir}/`) || file === dir);

// ---------------------------------------------------------------------------
// Guide export names, derived from the source rather than listed
// ---------------------------------------------------------------------------

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/**
 * Every identifier `src/guide/` exports.
 *
 * Derived from the source so a new guide export is covered the moment it is
 * written. A hand-maintained list is the artefact that goes stale, and this
 * project has been bitten by exactly that twice on the licence check.
 */
const guideExportNames: readonly string[] = [
  ...new Set(
    walk(join(DOMAIN_SRC, 'guide')).flatMap((file) =>
      [
        ...read(file).matchAll(
          /export\s+(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
        ),
      ].map((match) => match[1] as string),
    ),
  ),
].sort();

/** Names too generic to be evidence of anything. Excluded, and named. */
const AMBIGUOUS_EXPORTS = new Set(['GuideArtefact']);

const guideNamesToScanFor = guideExportNames.filter((name) => !AMBIGUOUS_EXPORTS.has(name));

function guideNamesIn(source: string): readonly string[] {
  const found = guideNamesToScanFor.filter((name) =>
    new RegExp(String.raw`\b${name}\b`).test(source),
  );
  // The marker itself, which is the field a wiring would have to carry even if
  // it never named a type.
  if (/\bguideArtefact\b/.test(source)) found.push('guideArtefact');
  return found;
}

/** Comments stripped: this file's subjects have to be nameable in prose. */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ---------------------------------------------------------------------------
// 0. The lists are not empty
// ---------------------------------------------------------------------------

describe('the boundary check has something to check', () => {
  it('finds every module it claims to be guarding', () => {
    for (const file of [...DECISION_PATH, ...DECIDERS]) {
      expect(existsSync(join(REPO_ROOT, file)), `${file} is missing`).toBe(true);
    }
  });

  it('derives a non-trivial set of guide export names', () => {
    expect(guideNamesToScanFor.length).toBeGreaterThan(20);
    for (const name of ['proposeRoute', 'proposePlan', 'formEstimate', 'guidePositionOn']) {
      expect(guideNamesToScanFor, name).toContain(name);
    }
  });

  it('knows where both halves of the guide live', () => {
    for (const dir of GUIDE_DIRS) {
      expect(existsSync(dir), `${rel(dir)} is missing`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 1. Wiring
// ---------------------------------------------------------------------------

describe('nothing that decides can reach the guide', () => {
  it.each(DECISION_PATH)('%s imports no guide module, transitively', (file) => {
    const graph = moduleGraph(join(REPO_ROOT, file));
    const reached = graph.filter((module) => isUnder(module, GUIDE_DIRS)).map(rel);
    expect(
      reached,
      `${file} can reach the guide. The guide narrates and routes; it never decides (map document §4.3).`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Naming
// ---------------------------------------------------------------------------

describe('nothing that decides so much as names a guide value', () => {
  it.each(DECISION_PATH)('%s names no guide export', (file) => {
    const source = stripComments(read(join(REPO_ROOT, file)));
    expect(
      guideNamesIn(source),
      `${file} names a guide export. Even through the package barrel, wiring a guide output ` +
        'into an evidence or review-timing path has to name what it took — this is that assertion.',
    ).toEqual([]);
  });

  /**
   * The whole evidence directory, not only the listed files.
   *
   * `evidence/` is the sole factory for accepted evidence (REQ-ARCH-04), so it
   * gets the stronger form: every file in it, present and future.
   */
  it('finds no guide export anywhere under packages/domain/src/evidence', () => {
    const offenders = walk(join(DOMAIN_SRC, 'evidence'))
      .filter((file) => guideNamesIn(stripComments(read(file))).length > 0)
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Direction
// ---------------------------------------------------------------------------

describe('the guide cannot reach what decides', () => {
  const guideGraph = moduleGraph(join(DOMAIN_SRC, 'guide/index.ts'));

  it.each(DECIDERS)('does not reach %s', (decider) => {
    const target = join(REPO_ROOT, decider);
    expect(guideGraph.map(rel), `the guide reaches ${decider}`).not.toContain(rel(target));
  });

  it('imports ts-fsrs nowhere in its graph', () => {
    const offenders = guideGraph
      .filter((file) => /(?:from|import|require)\s*\(?\s*['"]ts-fsrs/.test(read(file)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('mints nothing: no domain event factory is named in the guide', () => {
    const offenders = walk(join(DOMAIN_SRC, 'guide'))
      .filter((file) =>
        /\bcreateDomainEvent\b|\bmintEvidence\b|\badmitToScheduler\b|\bapplyReview\b/.test(
          stripComments(read(file)),
        ),
      )
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Runtime
// ---------------------------------------------------------------------------

const AT = '2026-07-28T09:00:00.000Z';

function sampleEstimate(): GuideEstimate {
  const conversation = openConversation([
    {
      turnId: 't1',
      targetForm: '分岐',
      excerpt: '線路はこの先で二つに分かれる。',
      seedRef: 'sen-01',
    },
  ]);
  return formEstimate(conversation, AT);
}

function sampleRoute(): ReturnType<typeof proposeRoute> {
  return proposeRoute({
    estimate: sampleEstimate(),
    candidates: [
      {
        id: 'wp-michi',
        layer: 'kodo',
        name: '道',
        targetForm: '道',
        lens: 'reading',
        note: 'the native word for a road',
      },
    ],
    recordId: 'route-1',
    title: '分かれた道',
    provenance: { author: 'guide_offline_fixture', at: AT },
  });
}

const emptyGateContext: EvidenceGateContext = {
  contracts: new Map(),
  invalidContractIds: new Set(),
  threadIndex: { byComponentId: new Map() } as unknown as EvidenceGateContext['threadIndex'],
  promotionByThread: new Map(),
  deletedThreadIds: new Set(),
  supersededEventIds: new Set(),
};

describe('a guide artefact is refused at runtime', () => {
  const route = sampleRoute();
  const plan = proposePlan({
    route,
    recordId: 'plan-1',
    title: 'the next few',
    provenance: { author: 'guide_offline_fixture', at: AT },
  });
  const estimate = sampleEstimate();
  const position = guidePositionOn(route, [], []);
  const turn = openConversation([
    {
      turnId: 't1',
      targetForm: '道',
      excerpt: 'その道を行くかどうか、まだ決めていない。',
      seedRef: 'sen-08',
    },
  ]).turns[0];

  const artefacts: readonly [string, unknown][] = [
    ['route', route],
    ['plan', plan],
    ['estimate', estimate],
    ['position', position],
    ['turn', turn],
  ];

  it('stamps every artefact with a declared kind', () => {
    for (const [name, artefact] of artefacts) {
      const kind = (artefact as { guideArtefact?: unknown }).guideArtefact;
      expect(GUIDE_ARTEFACT_KINDS, `${name} carries no declared marker`).toContain(kind);
    }
    // Every declared kind is actually produced by something, so the tuple
    // cannot grow a member nothing stamps.
    expect(
      new Set(artefacts.map(([, a]) => (a as { guideArtefact: string }).guideArtefact)),
    ).toEqual(new Set(GUIDE_ARTEFACT_KINDS));
  });

  it.each(artefacts)('refuses a %s', (_name, artefact) => {
    expect(() => assertNotGuideArtefact(artefact)).toThrow(GuideAuthorityBoundaryError);
  });

  it.each(artefacts)('refuses a %s that crossed a JSON boundary', (_name, artefact) => {
    const revived: unknown = JSON.parse(JSON.stringify(artefact));
    expect(() => assertNotGuideArtefact(revived)).toThrow(GuideAuthorityBoundaryError);
  });

  it('refuses an artefact hidden one level down in a command-shaped object', () => {
    expect(() => assertNotGuideArtefact({ kind: 'grade', payload: route })).toThrow(
      GuideAuthorityBoundaryError,
    );
    expect(() => assertNotGuideArtefact([{ ok: true }, plan])).toThrow(GuideAuthorityBoundaryError);
  });

  it('lets an ordinary value through, so the guard is not just "throw"', () => {
    expect(() => assertNotGuideArtefact({ type: 'ReviewGraded', grade: 'good' })).not.toThrow();
    expect(() => assertNotGuideArtefact(null)).not.toThrow();
    expect(() => assertNotGuideArtefact('分岐')).not.toThrow();
  });

  it.each(artefacts)('is not admitted to the scheduler as a %s', (_name, artefact) => {
    const decision = admitToScheduler(
      artefact as Parameters<typeof admitToScheduler>[0],
      emptyGateContext,
    );
    expect(decision.admitted).toBe(false);
    if (!decision.admitted) expect(decision.reason).toBe('not_evidence_class');
  });
});

// ---------------------------------------------------------------------------
// 5. The action vocabulary
// ---------------------------------------------------------------------------

describe('the guide has one verb', () => {
  it('offers exactly one kind of action, and it is to go and look', () => {
    expect(GUIDE_ACTION_KINDS).toEqual(['look_at']);
  });

  it('has no guide export whose name suggests it grades, marks or reschedules', () => {
    const forbidden = guideExportNames.filter((name) =>
      /grade|mark(?:As)?Known|schedule|due|interval|retriev|stability|mastery|level/i.test(name),
    );
    expect(forbidden).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. The scan fails the thing it is supposed to fail
// ---------------------------------------------------------------------------

describe('the boundary check catches a deliberate violation', () => {
  const VIOLATING_SOURCE = `
    import { proposeRoute } from '../guide/index.ts';
    export function admitToScheduler(event, context) {
      const route = proposeRoute({ estimate: context.estimate });
      return { admitted: route.waypoints.length > 0 };
    }
  `;

  const CLEAN_SOURCE = `
    import { activatesSkill } from '../contracts/index.ts';
    export function admitToScheduler(event, context) {
      return { admitted: activatesSkill(context.promotion, event.skill) };
    }
  `;

  it('sees the guide export named in a decision function', () => {
    expect(guideNamesIn(stripComments(VIOLATING_SOURCE))).toContain('proposeRoute');
  });

  it('sees nothing in a decision function that stays inside the boundary', () => {
    expect(guideNamesIn(stripComments(CLEAN_SOURCE))).toEqual([]);
  });

  it('sees a guide value smuggled in as a bare marker with no import', () => {
    const smuggled = `
      export function admit(event) {
        if (event.guideArtefact === 'guide_plan') return { admitted: true };
        return { admitted: false };
      }
    `;
    expect(guideNamesIn(stripComments(smuggled))).toContain('guideArtefact');
  });

  it('does not count a guide name that appears only in a comment', () => {
    const commented = `
      // proposeRoute must never be called from here.
      export function admit() { return { admitted: false }; }
    `;
    expect(guideNamesIn(stripComments(commented))).toEqual([]);
  });

  it('walks an import graph deeply enough to catch an indirection', () => {
    // The real defence against "move the read into a helper", proven on the
    // real tree: the gate's own graph is more than one file deep.
    const graph = moduleGraph(join(DOMAIN_SRC, 'evidence/gate.ts'));
    expect(graph.length).toBeGreaterThan(3);
  });
});
