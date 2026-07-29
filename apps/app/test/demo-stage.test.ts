/**
 * A loaded stage, checked against the app it is loaded into (lane L1).
 *
 * `packages/domain/test/demo/` proves the generated log is a real log. This
 * file proves the other half — that the log is about *this dictionary*, that
 * the surfaces can read it, and that loading it cannot reach the operator's own
 * data.
 *
 * The isolation claim is the one worth reading closely, because it is the one
 * that would matter if it were false. It rests on three facts, and each is
 * driven here rather than asserted:
 *
 *   1. the demo store is built with **no journal**, so a command executed
 *      against it has nowhere durable to go;
 *   2. it reports `in-memory-session-only`, so no surface can render a
 *      durability claim the store does not hold;
 *   3. `DemoBoundary` hands `AppProvider` a store exactly when a stage is
 *      loaded, and `AppProvider` opens the durable adapter exactly when it is
 *      handed none — so the two are never both open. The React half of that is
 *      a source assertion, because this repository installs no React Native
 *      test renderer; the store half is driven.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEMO_STAGES,
  componentIdForTargetKey,
  createDeterministicContext,
  type DemoStageId,
} from '@bunki/domain';
import { describe, expect, it } from 'vitest';

import { findLexemeById, passageForLexeme, seedDataset } from '../src/data/catalog.ts';
import { bootstrapSessionWorkspace } from '../src/screens/session-loop.ts';
import { demoContractIdFor, demoCorpus, passageLexemeIds } from '../src/state/demo/demo-corpus.ts';
import { buildDemoStage, type DemoStageBuild } from '../src/state/demo/demo-store.ts';
import { demoFacts, demoLensSpread, demoSittings } from '../src/state/demo/demo-summary.ts';
import { parseDemoFlags, demoEndInstant } from '../src/state/demo/demo-flags.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_DIR = resolve(APP_ROOT, 'src/state/demo');

/** A pinned day, so two runs of this suite agree to the millisecond. */
const TODAY = '2026-07-29T00:00:00.000Z';

/** Built once per stage; the heaviest is a few seconds. */
const BUILDS = new Map<DemoStageId, DemoStageBuild>();
const buildOf = (stageId: DemoStageId): DemoStageBuild => {
  const cached = BUILDS.get(stageId);
  if (cached !== undefined) return cached;
  const built = buildDemoStage(stageId, { today: TODAY });
  BUILDS.set(stageId, built);
  return built;
};

const stageIds = DEMO_STAGES.map((stage) => stage.id);
const HEAVY = 120_000;

/* ------------------------------------------------------------------ *
 * The corpus is this build's dictionary
 * ------------------------------------------------------------------ */

describe('the corpus a scripted learner draws from', () => {
  it('is real dictionary entries, not invented ones', () => {
    const corpus = demoCorpus();
    expect(corpus.length).toBeGreaterThan(1000);
    for (const target of corpus.slice(0, 50)) {
      const lexeme = findLexemeById(target.key);
      expect(lexeme, `${target.key} is not in this build's dictionary`).not.toBeNull();
      expect(lexeme?.headword).toBe(target.text);
      expect(lexeme?.reading).toBe(target.reading);
    }
  });

  it('puts the integration passage first, so a sitting always has a target', () => {
    const inPassage = passageLexemeIds();
    expect(inPassage.length).toBeGreaterThan(0);
    const first = demoCorpus().slice(0, inPassage.length);
    expect([...first].map((target) => target.key).sort()).toEqual([...inPassage].sort());
  });

  it('captures no headword twice, so no component is ever ambiguous', () => {
    // Two threads capturing one text makes the component ambiguous and the gate
    // then refuses every review on it (`thread-link.ts` fails closed, and is
    // right to). A corpus with a duplicated headword would produce a stage in
    // which a whole word silently never counted.
    const texts = demoCorpus().map((target) => target.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('is the same list on a second call', () => {
    expect(demoCorpus()).toBe(demoCorpus());
  });

  it('uses the contract ids the session already mints', () => {
    // `session-loop.ts` mints `contract-reading-<lexemeId>` and
    // `contract-meaning-<lexemeId>` for whatever target it plans over. If the
    // generator used other ids, the first sitting on a loaded stage would mint
    // a second, duplicate pair for a word that already had them.
    const target = { key: 'lex-bunki', text: '分岐', reading: 'ぶんき', senses: ['branching'] };
    expect(demoContractIdFor(target, 'orthography_to_reading')).toBe('contract-reading-lex-bunki');
    expect(demoContractIdFor(target, 'form_to_meaning')).toBe('contract-meaning-lex-bunki');
  });
});

/* ------------------------------------------------------------------ *
 * Every stage loads, and the surfaces have something to read
 * ------------------------------------------------------------------ */

describe.each(stageIds)('a loaded %s stage', (stageId) => {
  it(
    'fills the store the surfaces read',
    () => {
      const built = buildOf(stageId);
      const snapshot = built.store.getSnapshot();
      expect(snapshot.threads.length).toBeGreaterThan(0);
      expect(snapshot.eventCount).toBe(built.log.events.length);

      const derived = built.store.readDerived();
      expect(derived.contracts.length).toBeGreaterThan(0);
      expect(derived.memoryStates.length).toBeGreaterThan(0);
      expect(derived.observations.length).toBeGreaterThan(0);
      expect(derived.gateDecisions.length).toBeGreaterThan(0);
      expect(derived.sessions.length).toBeGreaterThan(0);
    },
    HEAVY,
  );

  it(
    'attaches its threads to the word pages they are about',
    () => {
      const linked = buildOf(stageId)
        .store.getSnapshot()
        .threads.filter((thread) => thread.lexemeId !== null);
      // Without this the map has no centre, the dive has no subject, and the
      // session cannot resolve a target — the link is re-derived from the
      // captured text on rehydration, so a stage whose text did not match a
      // headword would load and then show nothing.
      expect(linked.length).toBeGreaterThan(0);
    },
    HEAVY,
  );

  it(
    'gives the map a node to light: every contract names a component a capture made',
    () => {
      const built = buildOf(stageId);
      const derived = built.store.readDerived();
      const captured = new Set(
        built.store
          .readAll()
          .filter((event) => event.type === 'EncounterCaptured')
          .map((event) =>
            event.type === 'EncounterCaptured' ? componentIdForTargetKey(event.text) : '',
          ),
      );
      for (const contract of derived.contracts) {
        expect(
          captured.has(contract.targetComponentId),
          `${contract.contractId} names a component no capture instantiated`,
        ).toBe(true);
      }
    },
    HEAVY,
  );

  it(
    'gives the session something to plan',
    () => {
      // The real bootstrap, not a stand-in: it reads the store, chooses a
      // promoted thread whose entry the one shipped passage embeds, and returns
      // `null` when there is none. A stage that produced no such thread would
      // show the Session tab's empty case, which is the state this lane exists
      // to stop showing.
      const context = createDeterministicContext({ instants: TODAY, idPrefix: 'test-' });
      const bootstrap = bootstrapSessionWorkspace(buildOf(stageId).store, context);
      expect(bootstrap.error).toBeNull();
      expect(bootstrap.target).not.toBeNull();
      expect(passageForLexeme(bootstrap.target?.lexeme.id ?? '')).not.toBeNull();
    },
    HEAVY,
  );

  it(
    'adds no second contract when a sitting starts over a word it already studies',
    () => {
      const built = buildOf(stageId);
      const before = built.store.readAll().length;
      const context = createDeterministicContext({ instants: TODAY, idPrefix: 'test-' });
      const bootstrap = bootstrapSessionWorkspace(built.store, context);
      // The bootstrap appends nothing to the store by design; what it *plans*
      // is the workspace log, and the contracts it wanted are already there.
      expect(built.store.readAll().length).toBe(before);
      const contractIds = new Set(
        bootstrap.workspace.log
          .filter((event) => event.type === 'ContractCreated')
          .map((event) => (event.type === 'ContractCreated' ? event.contractId : '')),
      );
      const lexemeId = bootstrap.target?.lexeme.id ?? '';
      // Exactly one reading contract for the target, not two.
      const readingContracts = [...contractIds].filter(
        (id) => id === `contract-reading-${lexemeId}`,
      );
      expect(readingContracts).toHaveLength(1);
    },
    HEAVY,
  );

  it(
    'describes itself from its own log',
    () => {
      const built = buildOf(stageId);
      const facts = demoFacts(built.log.summary);
      expect(facts.length).toBeGreaterThan(2);
      const met = facts.find((fact) => fact.label === 'met');
      expect(met?.value).toContain(built.log.summary.threadCount.toLocaleString('en-US'));

      // The five lenses are named separately and never summed.
      const lenses = demoLensSpread(built.log.summary);
      expect(lenses.map((lens) => lens.label)).toEqual([
        'reading',
        'meaning',
        'listening',
        'production',
        'writing',
      ]);
      expect(lenses.find((lens) => lens.label === 'writing')?.value).toBe('0');

      expect(demoSittings(built.log.summary)).not.toBe('no sittings');
    },
    HEAVY,
  );
});

/* ------------------------------------------------------------------ *
 * Isolation
 * ------------------------------------------------------------------ */

describe('a loaded stage cannot reach the operator’s own data', () => {
  it('never claims to be durable', () => {
    // The one word a surface may render about this store. A demonstration that
    // said "saved on this device" would be claiming the operator's disk.
    expect(buildOf('day-3').store.durability).toBe('in-memory-session-only');
  });

  it('builds with no journal at all', () => {
    // The structural half: `createMemoryAppStore` writes durably only through
    // its `journal` callback, and this module never passes one. A scan rather
    // than a spy, because the property is "the argument is not there" and a spy
    // can only prove "it was not called on the path I ran".
    const source = readFileSync(resolve(DEMO_DIR, 'demo-store.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      ' ',
    );
    expect(source).toContain('createMemoryAppStore(');
    expect(source).not.toMatch(/\bjournal\s*:/);
  });

  it('keeps two stores’ logs entirely separate', () => {
    const first = buildDemoStage('day-3', { today: TODAY });
    const second = buildDemoStage('day-3', { today: TODAY });
    const before = second.store.readAll().length;

    first.store.execute({
      kind: 'capture',
      text: '試験',
      sourceRef: { sourceId: 'test', kind: 'manual' },
      provenance: {
        source: 'test',
        license: 'test',
        modificationStatus: 'derived',
        reviewStatus: 'unreviewed',
      },
      uncertainty: null,
    });

    expect(first.store.readAll().length).toBe(before + 1);
    expect(second.store.readAll().length).toBe(before);
  });

  it('reaches no persistence module and mints no event of its own', () => {
    const files = readdirSync(DEMO_DIR).filter((name) => ['.ts', '.tsx'].includes(extname(name)));
    expect(files.length).toBeGreaterThan(3);
    for (const name of files) {
      const source = readFileSync(join(DEMO_DIR, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(source, `${name} reaches the persistence seam`).not.toMatch(/persistence/);
      expect(source, `${name} mints an event`).not.toContain('createDomainEvent');
    }
  });

  it('hands the app a store exactly when a stage is loaded', () => {
    // The React half. `AppProvider` opens the durable adapter when it is handed
    // no store; `DemoBoundary` hands it one only in the `loaded` state, and
    // re-keys so the previous render's store is dropped rather than retained.
    const source = readFileSync(resolve(DEMO_DIR, 'demo-context.tsx'), 'utf8');
    expect(source).toMatch(/state\.kind !== 'loaded'/);
    expect(source).toMatch(/<AppProvider key="own">/);
    expect(source).toMatch(/store=\{state\.build\.store\}/);
    expect(source).toMatch(/key=\{state\.build\.stageId\}/);

    // …and the layout uses it, so this is the app's shape and not a module's.
    const layout = readFileSync(resolve(APP_ROOT, 'app/_layout.tsx'), 'utf8');
    expect(layout).toContain('DemoProvider');
    expect(layout).toContain('DemoBoundary');
  });
});

/* ------------------------------------------------------------------ *
 * Reproducibility
 * ------------------------------------------------------------------ */

describe('a stage is reproducible', () => {
  it('produces the same log twice for one pinned day', () => {
    const first = buildDemoStage('month-2', { today: TODAY });
    const second = buildDemoStage('month-2', { today: TODAY });
    expect(JSON.stringify(first.log.events)).toBe(JSON.stringify(second.log.events));
  });

  it('ends on the day it was asked to end on', () => {
    const built = buildDemoStage('day-3', { today: TODAY });
    expect(built.log.endedAt.slice(0, 10)).toBe('2026-07-29');
  });

  it('reads a stage and a pinned day out of a query string', () => {
    expect(parseDemoFlags('?demo=year-2&demoToday=2026-07-29')).toEqual({
      stageId: 'year-2',
      today: '2026-07-29',
    });
    expect(parseDemoFlags('?demo=nonsense')).toEqual({ stageId: null, today: null });
    expect(parseDemoFlags('')).toEqual({ stageId: null, today: null });
    expect(demoEndInstant({ stageId: 'day-3', today: '2026-07-29' })).toBe(TODAY);
  });
});

/* ------------------------------------------------------------------ *
 * The seed is still the seed
 * ------------------------------------------------------------------ */

describe('a stage changes nothing about the dictionary', () => {
  it('leaves the shipped passage and its lexemes where they were', () => {
    buildOf('day-3');
    expect(seedDataset.passages.length).toBeGreaterThan(0);
    for (const id of passageLexemeIds()) expect(findLexemeById(id)).not.toBeNull();
  });
});
