/**
 * `src/state/demo/` — the demonstration layer (lane L1).
 *
 * It answers one question the rest of the app could not: *what does this look
 * like with a learner in it?* Loading a stage swaps the store every surface
 * reads for one built over a generated log; returning drops it. Nothing here
 * writes to the operator's own data, and `demo-store.ts` argues why that is a
 * property of the code rather than of anyone's care.
 *
 * The barrel deliberately does not re-export the banner. That lives in
 * `src/ui/demo/` with the rest of the presentation, so a state module cannot
 * acquire a React Native import by being imported.
 */

export * from './demo-corpus.ts';
export * from './demo-flags.ts';
export * from './demo-store.ts';
export * from './demo-summary.ts';
export * from './demo-context.tsx';
