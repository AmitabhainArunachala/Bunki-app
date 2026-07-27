/**
 * The web build's event store: the provisional web adapter (WP-10).
 *
 * Metro resolves `./platform-store.native.ts` on iOS and Android and this file
 * everywhere else. That split is why neither `expo-sqlite` nor `react-native`
 * appears anywhere in `src/state/`: the platform choice is made by module
 * resolution instead of by a `Platform.OS` branch, so the web bundle never
 * contains a native database and the state layer stays importable by a plain
 * Node test runner. The alternative — one file that imports `Platform` and
 * branches — pulled React Native into every module that touches the store and
 * broke the unit suite, which is how this shape was arrived at rather than
 * chosen in the abstract.
 *
 * Provisional is the load-bearing word here and it travels with the store:
 * `runtimeLabel` is `web-provisional`, the about surface renders
 * {@link PROVISIONAL_WEB_ADAPTER_NOTICE} verbatim, and no web result is ever
 * reported as native persistence (REQ-ARCH-05, P0-CAP-15).
 */

import { ProvisionalWebEventStore, type SnapshotStore } from '@bunki/persistence';

import { STORE_NAME, type OpenAppEventStoreOptions, type OpenedAppEventStore } from './shared.ts';

/**
 * `globalThis.localStorage`, or an in-memory stand-in when the browser refuses
 * it.
 *
 * Private-mode Safari and a blocked-cookies profile both throw on *access*, not
 * on use, which is why this is a `try` around a round trip rather than a feature
 * test. Falling back to memory keeps the app running; it also means the session
 * is not durable, so the fallback is reported rather than swallowed — see
 * `OpenedAppEventStore.snapshotAvailable`.
 */
function resolveWebSnapshotStore(): { store: SnapshotStore; available: boolean } {
  try {
    const storage = globalThis.localStorage as SnapshotStore | undefined;
    if (storage === undefined || storage === null) {
      return { store: memorySnapshot(), available: false };
    }
    const probe = `${STORE_NAME}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return { store: storage, available: true };
  } catch {
    return { store: memorySnapshot(), available: false };
  }
}

function memorySnapshot(): SnapshotStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

export function openPlatformEventStore(options: OpenAppEventStoreOptions): OpenedAppEventStore {
  const resolved =
    options.snapshotStore === undefined
      ? resolveWebSnapshotStore()
      : { store: options.snapshotStore, available: true };

  return {
    store: ProvisionalWebEventStore.open({
      appVersions: options.appVersions,
      clock: options.clock,
      snapshotKey: options.snapshotKey ?? STORE_NAME,
      snapshotStore: resolved.store,
    }),
    runtimeLabel: 'web-provisional',
    snapshotAvailable: resolved.available,
  };
}
