/**
 * App-wide wiring (WP-05).
 *
 * One provider builds the three things every screen needs and nothing else: the
 * `AppStore` (with its injected `DomainContext`), the connectivity observer, and
 * the evidence-harness flags. Constructing them here — once, at the root —
 * rather than per screen is what keeps the store a single event log and keeps
 * `src/state` the only place `apps/app` touches the domain command flow.
 *
 * `useSyncExternalStore` binds React to the store's own subscription rather than
 * mirroring state into a `useState`, so a screen cannot render a snapshot the
 * store has already moved past.
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

import { createMemoryAppStore } from './memory-store.ts';
import {
  createRuntimeConnectivity,
  type ConnectivityObserver,
  type ConnectivityStatus,
} from './connectivity.ts';
import { readDebugFlags, type DebugFlags } from './debug-flags.ts';
import { createRuntimeContext } from './runtime.ts';
import type { AppSnapshot, AppStore } from './store.ts';

interface AppContextValue {
  readonly store: AppStore;
  readonly connectivity: ConnectivityObserver;
  readonly flags: DebugFlags;
}

const AppContext = createContext<AppContextValue | null>(null);

export interface AppProviderProps {
  readonly children: ReactNode;
  /** Injected by tests and by the screenshot harness; the app builds its own. */
  readonly store?: AppStore | undefined;
  readonly connectivity?: ConnectivityObserver | undefined;
  readonly flags?: DebugFlags | undefined;
}

export function AppProvider({ children, store, connectivity, flags }: AppProviderProps): ReactNode {
  const value = useMemo<AppContextValue>(
    () => ({
      store: store ?? createMemoryAppStore({ context: createRuntimeContext() }),
      connectivity: connectivity ?? createRuntimeConnectivity(),
      flags: flags ?? readDebugFlags(),
    }),
    [store, connectivity, flags],
  );
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
