import { useEffect, useRef } from "react";

/**
 * Layered Back contract (interaction-recovery handoff §C).
 *
 * A single controller owns the relationship between open UI layers and the
 * browser history stack, so hardware/browser Back (and the iOS edge swipe)
 * closes the topmost open layer instead of exiting the app — while in-app
 * close controls and browser Back never fight.
 *
 * Why one controller instead of one hook per layer: a single tap often
 * changes several layers at once (opening the kanji page simultaneously
 * closes the word panel and the reader). Per-layer history calls race in that
 * shared commit. Here we compute the desired history depth ONCE per render
 * and reconcile with a single push or a single `go`, which is order- and
 * batch-safe.
 */

export interface BackLayer {
  /** Stable identifier. */
  readonly key: string;
  /** Whether this layer is currently open. */
  readonly isOpen: boolean;
  /** Close just this layer (leave deeper/shallower layers untouched). */
  readonly close: () => void;
}

export function useBackStack(layers: readonly BackLayer[]): void {
  // Highest index = topmost/most-nested layer, closed first on Back.
  const openKeysRef = useRef<string[]>([]);
  const closersRef = useRef<Map<string, () => void>>(new Map());
  const pushedRef = useRef(0);
  const suppressRef = useRef(0);

  const openKeys = layers.filter((l) => l.isOpen).map((l) => l.key);
  openKeysRef.current = openKeys;
  const closers = new Map<string, () => void>();
  for (const l of layers) closers.set(l.key, l.close);
  closersRef.current = closers;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = (): void => {
      if (suppressRef.current > 0) {
        suppressRef.current -= 1;
        return;
      }
      // The user popped one of our sentinel entries: close the topmost layer.
      if (pushedRef.current > 0) pushedRef.current -= 1;
      const keys = openKeysRef.current;
      const topKey = keys[keys.length - 1];
      if (topKey) closersRef.current.get(topKey)?.();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const desired = openKeys.length;
    if (desired > pushedRef.current) {
      const n = desired - pushedRef.current;
      for (let i = 0; i < n; i += 1) {
        window.history.pushState({ bunkiDepth: pushedRef.current + i + 1 }, "");
      }
      pushedRef.current = desired;
    } else if (desired < pushedRef.current) {
      // Closed by an in-app control: silently consume the surplus sentinels so
      // a later browser Back does not land on a stale, empty entry.
      const n = pushedRef.current - desired;
      suppressRef.current += n;
      pushedRef.current = desired;
      window.history.go(-n);
    }
    // Depend on the joined key list so re-runs happen exactly when the set of
    // open layers changes.
  }, [openKeys.join("|")]);
}
