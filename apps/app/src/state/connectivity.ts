/**
 * Connectivity, honestly scoped (WP-05, REQ-UI-09 offline state).
 *
 * On the web this is `navigator.onLine` plus its two events, which is what the
 * Phase-0 target runtime (Expo Web, REQ-ARCH-01) actually exposes.
 *
 * On native it is **unknown**, and the type says so rather than defaulting to
 * `true`. Reporting "online" on a device where nothing was measured would be
 * exactly the kind of unmeasured claim REQ-GATE-03 forbids, and a real network
 * observer there is `expo-network`/NetInfo — a dependency outside WP-00's
 * verified register and outside this work package. The UI renders no
 * connectivity banner at all when the status is unknown.
 *
 * The observer is a plain subscribe/get pair with no React in it, so the state
 * machine is testable without a renderer; `useConnectivity` in
 * `connectivity-context.tsx` is the thin binding.
 */

export type ConnectivityStatus = 'online' | 'offline' | 'unknown';

export interface ConnectivityObserver {
  readonly get: () => ConnectivityStatus;
  readonly subscribe: (listener: (status: ConnectivityStatus) => void) => () => void;
}

/** A fixed status. Used on platforms with no observer, and in tests. */
export function createStaticConnectivity(status: ConnectivityStatus): ConnectivityObserver {
  return {
    get: () => status,
    subscribe: () => () => undefined,
  };
}

/** The browser surface this module needs, named so a test can supply a fake. */
export interface OnlineSource {
  readonly onLine: boolean;
  addEventListener(type: 'online' | 'offline', listener: () => void): void;
  removeEventListener(type: 'online' | 'offline', listener: () => void): void;
}

export function createBrowserConnectivity(source: OnlineSource): ConnectivityObserver {
  const read = (): ConnectivityStatus => (source.onLine ? 'online' : 'offline');

  return {
    get: read,
    subscribe: (listener) => {
      const notify = (): void => listener(read());
      source.addEventListener('online', notify);
      source.addEventListener('offline', notify);
      return () => {
        source.removeEventListener('online', notify);
        source.removeEventListener('offline', notify);
      };
    },
  };
}

/**
 * The observer for the current runtime: browser events where they exist,
 * `unknown` everywhere else.
 */
export function createRuntimeConnectivity(
  globals: {
    navigator?: unknown;
    addEventListener?: unknown;
    removeEventListener?: unknown;
  } = globalThis,
): ConnectivityObserver {
  const nav = globals.navigator;
  const hasOnLine =
    typeof nav === 'object' &&
    nav !== null &&
    typeof (nav as { onLine?: unknown }).onLine === 'boolean';
  const hasEvents =
    typeof globals.addEventListener === 'function' &&
    typeof globals.removeEventListener === 'function';

  if (!hasOnLine || !hasEvents) return createStaticConnectivity('unknown');

  const target = globals as unknown as {
    navigator: { onLine: boolean };
    addEventListener: OnlineSource['addEventListener'];
    removeEventListener: OnlineSource['removeEventListener'];
  };

  return createBrowserConnectivity({
    get onLine() {
      return target.navigator.onLine;
    },
    addEventListener: (type, listener) => target.addEventListener(type, listener),
    removeEventListener: (type, listener) => target.removeEventListener(type, listener),
  });
}
