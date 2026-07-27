/**
 * App-wide wiring (WP-05; durable since WP-10).
 *
 * One provider builds the things every screen needs and nothing else: the
 * `AppStore` (with its injected `DomainContext`), the connectivity observer, the
 * evidence-harness flags, the diagnostic ring, and the AI runtime the candidate
 * panel dispatches through. Constructing them here — once, at the root — rather
 * than per screen is what keeps the store a single event log and keeps
 * `src/state` the only place `apps/app` touches the domain command flow.
 *
 * `useSyncExternalStore` binds React to the store's own subscription rather than
 * mirroring state into a `useState`, so a screen cannot render a snapshot the
 * store has already moved past.
 *
 * ## Why the provider has a boot state now
 *
 * Opening the durable log is asynchronous (controller §7's port is async because
 * REQ-ARCH-05 keeps IndexedDB on the table). The alternative to a boot state is
 * to render an empty app and fill it in when the read resolves, which would give
 * every reload a visible flash of "you have captured nothing" and — worse — a
 * window in which a capture could be applied to a store that is about to be
 * replaced by the rehydrated one. Rendering nothing for one microtask is the
 * smaller cost and the one with no correctness question attached.
 *
 * A store passed in by a test or the screenshot harness skips all of it: that
 * path is fully synchronous, exactly as it was before this file grew a durable
 * one.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { appVersionsForBuild } from '@bunki/export';

import type { AiRouteRing, AiRuntime } from '@bunki/ai';

// From the module, not the slice's barrel: `../candidate/index.ts` re-exports
// `candidate-panel.tsx`, which imports React Native — and `src/state/` is
// imported by the unit suite, which runs in plain Node and cannot parse React
// Native's Flow sources. Keeping the state layer free of platform imports is
// what lets the command flow be tested without a renderer at all.
import {
  createCandidateRouteRing,
  createCandidateRuntime,
} from '../candidate/candidate-runtime.ts';
import { findLexemeByHeadword } from '../data/catalog.ts';
import {
  createElapsedCounter,
  createObservabilityRing,
  type ObservabilityRing,
} from '../observability/index.ts';
import { createDurableAppStore, type DurableAppStore, type WriteState } from './durable-store.ts';
import { createMemoryAppStore } from './memory-store.ts';
import {
  createRuntimeConnectivity,
  type ConnectivityObserver,
  type ConnectivityStatus,
} from './connectivity.ts';
import { readDebugFlags, type DebugFlags } from './debug-flags.ts';
import {
  PROVISIONAL_WEB_ADAPTER_NOTICE,
  RUNTIME_LABEL_DISCLOSURE,
  type RuntimeLabel,
} from './persistence/index.ts';
import { createRuntimeContext } from './runtime.ts';
import type { AppSnapshot, AppStore } from './store.ts';

/**
 * What the app can say about where its bytes are (WP-10).
 *
 * Rendered by the about/debug surface. `runtimeLabel` is the adapter's own
 * vocabulary — `web-provisional` / `native` / `ci-substitute` — and the app
 * never paraphrases it into something stronger (REQ-ARCH-05, P0-CAP-15).
 * `null` on the injected-store path, where there is no adapter to describe and
 * inventing one would be the about screen making a durability claim about a test
 * double.
 */
export interface StorageFacts {
  readonly runtimeLabel: RuntimeLabel;
  /**
   * `@bunki/persistence`'s own sentence for this runtime, carried rather than
   * re-imported so no screen has to reach into the seam directory to render the
   * disclosure — and so nothing can paraphrase it on the way.
   */
  readonly disclosure: string;
  /** The provisional-web notice, or `null` when this is not that adapter. */
  readonly provisionalNotice: string | null;
  readonly snapshotAvailable: boolean;
  readonly getWriteState: () => WriteState;
  readonly subscribeWriteState: (listener: () => void) => () => void;
}

interface AppContextValue {
  readonly store: AppStore;
  readonly connectivity: ConnectivityObserver;
  readonly flags: DebugFlags;
  readonly ring: ObservabilityRing;
  readonly aiRuntime: AiRuntime;
  readonly aiRoutes: AiRouteRing;
  readonly storage: StorageFacts | null;
}

const AppContext = createContext<AppContextValue | null>(null);

export interface AppProviderProps {
  readonly children: ReactNode;
  /** Injected by tests and by the screenshot harness; the app opens its own. */
  readonly store?: AppStore | undefined;
  readonly connectivity?: ConnectivityObserver | undefined;
  readonly flags?: DebugFlags | undefined;
  readonly ring?: ObservabilityRing | undefined;
}

interface Ambient {
  readonly connectivity: ConnectivityObserver;
  readonly flags: DebugFlags;
  readonly ring: ObservabilityRing;
  readonly aiRoutes: AiRouteRing;
}

export function AppProvider({
  children,
  store,
  connectivity,
  flags,
  ring,
}: AppProviderProps): ReactNode {
  // Memoised on the *injected values*, never on the props object: a `[props]`
  // dependency is a new identity every render, which would rebuild the ring and
  // re-run the store-opening effect on each pass. The store's whole value is
  // being one event log for the app's lifetime.
  //
  // The ring is built before the store because the store takes it as its
  // observer. Constructing them in the other order would mean either a mutable
  // back-reference or a store that starts unobserved — and a diagnostic buffer
  // that misses the first commands of a session is missing exactly the ones a
  // cold-start latency question is about (§12).
  const ambient = useMemo<Ambient>(
    () => ({
      connectivity: connectivity ?? createRuntimeConnectivity(),
      flags: flags ?? readDebugFlags(),
      ring: ring ?? createObservabilityRing(),
      aiRoutes: createCandidateRouteRing(),
    }),
    [connectivity, flags, ring],
  );

  const injected = useMemo<AppContextValue | null>(() => {
    if (store === undefined) return null;
    const context = createRuntimeContext();
    return {
      store,
      ...ambient,
      aiRuntime: createCandidateRuntime({ context, telemetry: ambient.aiRoutes }),
      storage: null,
    };
  }, [store, ambient]);

  const [opened, setOpened] = useState<AppContextValue | null>(null);

  useEffect(() => {
    if (store !== undefined) return undefined;
    let live = true;
    const context = createRuntimeContext();
    const elapsedMs = createElapsedCounter();

    void createDurableAppStore({
      appVersions: appVersionsForBuild(),
      clock: context.clock,
      context,
      elapsedMs,
      observer: ambient.ring.commandObserver,
      // Headword-exact only. A fuzzier match would re-attach a rehydrated
      // thread to a *different* word than the one the learner opened, which is
      // a worse outcome than the link being absent.
      resolveLexemeId: (text) => findLexemeByHeadword(text)?.id ?? null,
    })
      .then((durable: DurableAppStore) => {
        if (!live) return;
        setOpened({
          store: durable.store,
          ...ambient,
          aiRuntime: createCandidateRuntime({ context, telemetry: ambient.aiRoutes }),
          storage: {
            disclosure: RUNTIME_LABEL_DISCLOSURE[durable.runtimeLabel],
            getWriteState: durable.getWriteState,
            provisionalNotice:
              durable.runtimeLabel === 'web-provisional' ? PROVISIONAL_WEB_ADAPTER_NOTICE : null,
            runtimeLabel: durable.runtimeLabel,
            snapshotAvailable: durable.snapshotAvailable,
            subscribeWriteState: durable.subscribeWriteState,
          },
        });
      })
      .catch((cause: unknown) => {
        if (!live) return;
        // A store that cannot open is not a store the app may pretend to have.
        // It falls back to a session-only one *and says so* through the same
        // durability label every surface already renders — the alternative is an
        // app that looks durable and is not, which is the one failure mode this
        // whole work package exists to remove.
        console.warn('[bunki] durable store unavailable; falling back to session-only', cause);
        setOpened({
          store: createMemoryAppStore({
            context,
            elapsedMs,
            observer: ambient.ring.commandObserver,
          }),
          ...ambient,
          aiRuntime: createCandidateRuntime({ context, telemetry: ambient.aiRoutes }),
          storage: null,
        });
      });

    return () => {
      live = false;
    };
  }, [store, ambient]);

  const value = injected ?? opened;
  if (value === null) return null;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function useAppContext(): AppContextValue {
  const value = useContext(AppContext);
  if (value === null) {
    throw new Error(
      'useAppContext() was called outside <AppProvider>. Wrap the route in app/_layout.',
    );
  }
  return value;
}

export function useAppStore(): AppStore {
  return useAppContext().store;
}

export function useDebugFlags(): DebugFlags {
  return useAppContext().flags;
}

/** The session's diagnostic buffer (WP-09, controller §12). */
export function useObservabilityRing(): ObservabilityRing {
  return useAppContext().ring;
}

/** The bounded AI path's runtime (WP-07), built once above the screens. */
export function useAiRuntime(): AiRuntime {
  return useAppContext().aiRuntime;
}

/** Route metadata for the AI path (WP-07 request 2; controller §12). */
export function useAiRoutes(): AiRouteRing {
  return useAppContext().aiRoutes;
}

/** Where this build's bytes live, or `null` on an injected store (WP-10). */
export function useStorageFacts(): StorageFacts | null {
  return useAppContext().storage;
}

/** The durable write state, subscribed. `null` when there is no adapter. */
export function useWriteState(): WriteState | null {
  const storage = useStorageFacts();
  const subscribe = useCallback(
    (listener: () => void) => storage?.subscribeWriteState(listener) ?? (() => undefined),
    [storage],
  );
  const read = useCallback((): WriteState | null => storage?.getWriteState() ?? null, [storage]);
  return useSyncExternalStore(subscribe, read, read);
}

export function useAppSnapshot(): AppSnapshot {
  const store = useAppStore();
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  return useSyncExternalStore(subscribe, store.getSnapshot, store.getSnapshot);
}

export function useConnectivity(): ConnectivityStatus {
  const { connectivity } = useAppContext();
  const [status, setStatus] = useState<ConnectivityStatus>(() => connectivity.get());

  useEffect(() => {
    // Re-read on subscribe: the status can change between the initial render
    // and the effect, and a stale "online" banner is worse than none.
    setStatus(connectivity.get());
    return connectivity.subscribe(setStatus);
  }, [connectivity]);

  return status;
}
