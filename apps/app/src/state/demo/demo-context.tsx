/**
 * The demonstration layer, above everything (lane L1).
 *
 * Two components, and the split between them is the isolation argument made
 * structural rather than careful:
 *
 *   - {@link DemoProvider} holds *which* stage is loaded, and builds it. It
 *     holds no store and touches no persistence.
 *   - {@link DemoBoundary} decides which store the rest of the app gets. With
 *     no stage loaded it renders `AppProvider` with no store, which is the path
 *     that opens the durable adapter; with a stage loaded it renders
 *     `AppProvider` *with* the stage's store, which is the path that opens
 *     nothing. The two are never both open, because they are two renders of one
 *     provider and only one of them exists at a time.
 *
 * `key={stageId}` is load-bearing. Without it, switching from the operator's own
 * data to a stage would leave the durable store the previous render had already
 * opened alive in a closed-over variable — never written to, but alive, and the
 * claim in `demo-store.ts` would be one word weaker than it says. Re-keying
 * remounts, which drops it.
 *
 * ## The build is deferred on purpose
 *
 * Generating a two-year learner and folding it into derived state is seconds of
 * work — measured, in `packages/domain/src/demo/generate.ts`. Doing it inside
 * the press handler would freeze the frame that was supposed to say "building",
 * so the state moves to `building` first and the work starts on the next task.
 * The banner therefore always paints its progress before the work begins, which
 * is the difference between a progress state and a lie about one.
 *
 * ## Nothing here persists a choice
 *
 * A reload returns the operator to their own data. That is the safe direction:
 * the failure mode this whole surface guards against is losing track of whether
 * what you are looking at is yours, and a demonstration that survived a reload
 * is a demonstration that can be forgotten about. The banner says so in words,
 * and `?demo=` in the URL is the way to ask for one deliberately.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { DemoStageId } from '@bunki/domain';

import { createElapsedCounter } from '../../observability/index.ts';
import { AppProvider } from '../app-context.tsx';
import { buildDemoStage, type DemoStageBuild } from './demo-store.ts';
import { demoEndInstant, readDemoFlags, type DemoFlags } from './demo-flags.ts';

/** What the demonstration layer is doing right now. */
export type DemoState =
  /** The operator's own data. The durable store is open; nothing is simulated. */
  | { readonly kind: 'own' }
  /** A stage is being generated. The operator's own store is still the one in use. */
  | { readonly kind: 'building'; readonly stageId: DemoStageId }
  /** A stage is loaded. Every surface in the app is reading it. */
  | { readonly kind: 'loaded'; readonly build: DemoStageBuild }
  /** A stage failed to build. The operator's own data is untouched. */
  | { readonly kind: 'failed'; readonly stageId: DemoStageId; readonly message: string };

export interface DemoContextValue {
  readonly state: DemoState;
  /** Build and load a stage. Idempotent for the stage already loaded. */
  readonly load: (stageId: DemoStageId) => void;
  /** Drop the stage and go back to the operator's own durable data. */
  readonly returnToOwnData: () => void;
  /**
   * Whether the strip's panel is expanded.
   *
   * It lives up here, above `AppProvider`, and that is not tidiness. Changing
   * stage re-keys the provider, which remounts everything under it — including
   * the strip. Held in the strip's own `useState`, the panel therefore snapped
   * shut the instant a stage landed, taking the stage's facts and the other
   * three choices with it, and leaving the learner looking at a surface that
   * had silently changed underneath them. Above the boundary it survives the
   * remount, which is the behaviour: you press Month 8, and the panel is still
   * open showing you what Month 8 is.
   */
  readonly panelOpen: boolean;
  readonly setPanelOpen: (open: boolean) => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export interface DemoProviderProps {
  readonly children: ReactNode;
  /** Injected by tests and by the screenshot harness; the app reads the URL. */
  readonly flags?: DemoFlags | undefined;
  /** Injected so a test can build a stage without waiting for a timer. */
  readonly defer?: ((run: () => void) => void) | undefined;
}

/** The default deferral: next task, so the building state paints first. */
const nextTask = (run: () => void): void => {
  setTimeout(run, 0);
};

export function DemoProvider({ children, flags, defer }: DemoProviderProps): ReactNode {
  const resolvedFlags = useMemo(() => flags ?? readDemoFlags(), [flags]);
  const run = defer ?? nextTask;

  const [state, setState] = useState<DemoState>(() =>
    resolvedFlags.stageId === null
      ? { kind: 'own' }
      : { kind: 'building', stageId: resolvedFlags.stageId },
  );

  /**
   * Which build is current, so a slow build that was superseded cannot land.
   *
   * A learner who presses Month 8 and then Year 2 before the first finishes
   * must end on Year 2, not on whichever generator returned last. The token is
   * a ref rather than state because the check happens inside the deferred task,
   * after the render that changed it.
   */
  const token = useRef(0);

  const build = useCallback(
    (stageId: DemoStageId) => {
      token.current += 1;
      const mine = token.current;
      setState({ kind: 'building', stageId });
      run(() => {
        if (token.current !== mine) return;
        try {
          const built = buildDemoStage(stageId, {
            today: demoEndInstant(resolvedFlags),
            elapsedMs: createElapsedCounter(),
          });
          if (token.current !== mine) return;
          setState({ kind: 'loaded', build: built });
        } catch (cause: unknown) {
          if (token.current !== mine) return;
          // A stage that will not build is a defect in this lane, and the
          // operator's own data is what they fall back to — never a half-built
          // store, and never a silent return to `own` that would leave them
          // wondering whether the button worked.
          setState({
            kind: 'failed',
            stageId,
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      });
    },
    [resolvedFlags, run],
  );

  // The URL's stage, once, at startup.
  const startup = resolvedFlags.stageId;
  useEffect(() => {
    if (startup !== null) build(startup);
  }, [startup, build]);

  const [panelOpen, setPanelOpen] = useState(false);

  const value = useMemo<DemoContextValue>(
    () => ({
      state,
      panelOpen,
      setPanelOpen,
      load: (stageId) => {
        if (state.kind === 'loaded' && state.build.stageId === stageId) return;
        if (state.kind === 'building' && state.stageId === stageId) return;
        build(stageId);
      },
      returnToOwnData: () => {
        token.current += 1;
        setState({ kind: 'own' });
      },
    }),
    [state, build, panelOpen],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (value === null) {
    throw new Error('useDemo() was called outside <DemoProvider>. Wrap the tree in app/_layout.');
  }
  return value;
}

/** The loaded stage, or `null`. The one thing most callers need. */
export function useLoadedStage(): DemoStageBuild | null {
  const { state } = useDemo();
  return state.kind === 'loaded' ? state.build : null;
}

/**
 * Give the app either the operator's store or the stage's — never both.
 *
 * `AppProvider` opens the durable adapter exactly when it is handed no store
 * (`state/app-context.tsx`), so passing one is what closes that door. The
 * `key` forces a remount on every change of stage, which is what drops the
 * store the previous render was holding.
 */
export function DemoBoundary({ children }: { readonly children: ReactNode }): ReactNode {
  const { state } = useDemo();
  if (state.kind !== 'loaded') {
    // `own`, `building` and `failed` all mean: the operator's own durable data.
    // Nothing is simulated yet during a build, so there is nothing to isolate.
    return <AppProvider key="own">{children}</AppProvider>;
  }
  return (
    <AppProvider key={state.build.stageId} store={state.build.store}>
      {children}
    </AppProvider>
  );
}
