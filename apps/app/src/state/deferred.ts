/**
 * Work this package deliberately did not do, recorded where it cannot be lost
 * (WP-05).
 *
 * Each entry names the thing, why WP-05 stopped short of it, who owns it, and
 * what closing it will require. `test/deferred.test.ts` asserts the register is
 * non-empty and fully populated, so an entry cannot be quietly emptied to make
 * a report look cleaner; the intent is that a later wave deletes an entry only
 * when it has actually done the work.
 */

export interface DeferredItem {
  readonly id: string;
  readonly title: string;
  /** Why it is not done here. */
  readonly reason: string;
  /** The work package that closes it. */
  readonly owner: string;
  /** What closing it concretely requires. */
  readonly closesWith: string;
}

export const DEFERRED_INTEGRATION: readonly DeferredItem[] = [
  {
    id: 'WP05-D1',
    title: 'Swap the in-memory AppStore for @bunki/persistence',
    reason:
      'WP-03 builds @bunki/persistence in a parallel lane and apps/app is lint-forbidden from importing it (controller §5, eslint boundary 2). Screens are written against the AppStore seam in src/state/store.ts instead, with an in-memory implementation behind it.',
    owner: 'W4 integration (WP-03 adapter + WP-05 screens)',
    closesWith:
      'Replace createMemoryAppStore with an implementation that routes appends through the domain command handler to EventStorePort, keeping the synchronous local acknowledgment ahead of the durable write (REQ-UI-01), then re-label durability as device-local and re-run T-01.',
  },
  {
    id: 'WP05-D2',
    title:
      'A mark made before Keep loses only its dimension; a mark made after Keep reaches the event log in no form at all',
    reason:
      'REQ-UI-01 specifies a five-way one-gesture mark (meaning · reading · use · kanji · not sure) that "remains editable". The frozen v1 schema records EncounterCaptured.uncertaintyMark as `true | absent` only (controller §6.1, ADR-002), and it records it on the *captured event* — so a mark chosen before Keep puts the fact of a mark in the log and leaves the dimension out, while a mark applied or changed after Keep writes nothing: markUncertainty emits no event, because the v1 schema has no family for amending a mark and inventing one in the app would be a schema change made in the wrong package. Clearing a mark after Keep likewise cannot retract the uncertaintyMark already on the captured event. Both halves are ADR-002 amendments, which are escalations and not app-side edits.',
    owner: 'Conductor — ADR-002 amendment decision, then WP-02/WP-06 schema owner',
    closesWith:
      'An ADR-002 decision covering both halves: an amendment widening uncertaintyMark to the five-value enum, and an amendment giving a post-capture mark an event family of its own — or an explicit ruling that a mark is a capture-time-only fact and everything after it stays app-local. Until then the UI collects the dimension, keeps the annotation beside the log in AppStore, and says on screen which of the two cases the learner is actually in — see uncertaintyLogNote in src/state/store.ts.',
  },
  {
    id: 'WP05-D3',
    title: 'Word-page layers 2 and 3 are thin, and kanji layers 2 and 3 are absent',
    reason:
      'REQ-UI-02/03 layer 2–3 content is pitch accent, frequency and JLPT labels, reading families, sourced phonetic/semantic patterns, and full JMdict/KANJIDIC2 fields. The Phase-0 seed has none of it: no licensed dictionary source could be retrieved (ORCHESTRATION_LOG operator action; seed LICENSES.md D-1/D-2). Controller §19 WP-05 excludes "any layer-2/3 content the seed cannot support honestly".',
    owner: 'Operator (network policy for EDRDG/Tatoeba) then WP-04 source pass',
    closesWith:
      'Licensed source data in packages/seed with per-field provenance; the layer sections already render from the dataset, so they fill in without a screen change.',
  },
  {
    id: 'WP05-D4',
    title: 'Native connectivity is unobserved',
    reason:
      'The offline state reads navigator.onLine on the web (the Phase-0 target runtime, REQ-ARCH-01). On native no observer exists without expo-network/NetInfo, which is outside WP-00’s verified dependency register.',
    owner: 'WP-11 native checkpoint',
    closesWith:
      'A verified network dependency added to the register, or a device-measured decision that the banner is unnecessary. Until then connectivity reports "unknown" on native and the banner does not render.',
  },
  {
    id: 'WP05-D5',
    title: 'Audio for Layer 0 readings',
    reason:
      'REQ-UI-02 Layer 0 includes "audio when local". The seed ships no audio and controller §2 excludes audio capture; no pronunciation asset could be licence-verified in this build session.',
    owner: 'WP-04 source pass / later phase',
    closesWith:
      'A licence-verified local audio asset set in packages/seed with per-field provenance.',
  },
];

export const DEFERRED_BY_ID: Readonly<Record<string, DeferredItem>> = Object.fromEntries(
  DEFERRED_INTEGRATION.map((item) => [item.id, item]),
);
