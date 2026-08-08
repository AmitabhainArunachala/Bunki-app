/**
 * Substrate-neutral interaction semantics (KAIRO A0.5).
 *
 * Input modality is deliberately outside the action. It is provenance on the
 * envelope, so a renderer cannot make the same action mean something stronger
 * when it came from a pointer, keyboard, switch, screen reader, or automation.
 * This reducer owns presentation/navigation intent only. In particular,
 * `judgment.nominate` may request a future probe; it has no memory or FSRS
 * authority.
 */

export const INTERACTION_MODALITIES = [
  'pointer',
  'keyboard',
  'switch',
  'screenReader',
  'programmatic',
] as const;

export type InteractionModality = (typeof INTERACTION_MODALITIES)[number];

export const INTERACTION_ACTION_KINDS = [
  'target.activate',
  'quickLook.open',
  'entry.open',
  'selection.move',
  'constellation.lock',
  'tide.set',
  'judgment.nominate',
  'navigation.back',
  'layer.dismiss',
] as const;

export type InteractionActionKind = (typeof INTERACTION_ACTION_KINDS)[number];

export const INTERACTION_TARGET_KINDS = [
  'word',
  'kanji',
  'radical',
  'idiom',
  'grammar',
  'particle',
  'passage',
  'ui',
] as const;

export type InteractionTargetKind = (typeof INTERACTION_TARGET_KINDS)[number];

export interface InteractionTarget {
  readonly kind: InteractionTargetKind;
  readonly id: string;
}

export type SelectionDirection = 'next' | 'previous' | 'first' | 'last';
export type TideLevel = 1 | 2 | 3 | 4 | 5;
export type JudgmentNomination = 'again' | 'hard' | 'good' | 'easy';
export type InteractionLayerKind = 'quickLook' | 'entry' | 'constellation';

export type InteractionAction =
  | { readonly kind: 'target.activate'; readonly target: InteractionTarget }
  | { readonly kind: 'quickLook.open'; readonly target: InteractionTarget }
  | { readonly kind: 'entry.open'; readonly target: InteractionTarget }
  | {
      readonly kind: 'selection.move';
      readonly direction: SelectionDirection;
      readonly itemCount: number;
    }
  | { readonly kind: 'constellation.lock'; readonly target: InteractionTarget }
  | { readonly kind: 'tide.set'; readonly level: TideLevel }
  | {
      readonly kind: 'judgment.nominate';
      readonly target: InteractionTarget;
      readonly judgment: JudgmentNomination;
    }
  | { readonly kind: 'navigation.back' }
  | { readonly kind: 'layer.dismiss'; readonly layer?: InteractionLayerKind };

export interface InteractionProvenance {
  readonly modality: InteractionModality;
  /** Optional renderer-local identifier; never consulted by the reducer. */
  readonly sourceId?: string;
}

export interface InteractionEnvelope<A extends InteractionAction = InteractionAction> {
  readonly action: A;
  readonly provenance: InteractionProvenance;
}

export interface InteractionLayer {
  readonly kind: InteractionLayerKind;
  readonly target: InteractionTarget | null;
}

export interface InteractionState {
  readonly reveal: {
    readonly target: InteractionTarget;
    readonly stage: 'reading' | 'gloss';
  } | null;
  readonly quickLookTarget: InteractionTarget | null;
  readonly entryPath: readonly InteractionTarget[];
  readonly selectedIndex: number | null;
  readonly constellationTarget: InteractionTarget | null;
  readonly tideLevel: TideLevel;
  readonly nomination: {
    readonly target: InteractionTarget;
    readonly judgment: JudgmentNomination;
  } | null;
  readonly layers: readonly InteractionLayer[];
}

/**
 * Effects are intentionally a closed, low-authority vocabulary. There is no
 * FSRS or memory-update member to cast to: learning evidence must travel
 * through RetrievalContract + evidence-gate semantics elsewhere in domain.
 */
export type InteractionEffect =
  | {
      readonly authority: 'navigation';
      readonly kind: 'entry.opened';
      readonly target: InteractionTarget;
    }
  | {
      readonly authority: 'presentation';
      readonly kind: 'quickLook.opened' | 'constellation.locked';
      readonly target: InteractionTarget;
    }
  | {
      readonly authority: 'probe_nomination';
      readonly kind: 'probe.nominated';
      readonly target: InteractionTarget;
      readonly judgment: JudgmentNomination;
    };

export interface InteractionTransition {
  readonly state: InteractionState;
  readonly effects: readonly InteractionEffect[];
}

function freezeTarget(target: InteractionTarget): InteractionTarget {
  return Object.freeze({ ...target });
}

function freezeState(state: InteractionState): InteractionState {
  return Object.freeze({
    ...state,
    reveal:
      state.reveal === null
        ? null
        : Object.freeze({ target: freezeTarget(state.reveal.target), stage: state.reveal.stage }),
    quickLookTarget: state.quickLookTarget === null ? null : freezeTarget(state.quickLookTarget),
    entryPath: Object.freeze(state.entryPath.map(freezeTarget)),
    constellationTarget:
      state.constellationTarget === null ? null : freezeTarget(state.constellationTarget),
    nomination:
      state.nomination === null
        ? null
        : Object.freeze({
            target: freezeTarget(state.nomination.target),
            judgment: state.nomination.judgment,
          }),
    layers: Object.freeze(
      state.layers.map((layer) =>
        Object.freeze({
          kind: layer.kind,
          target: layer.target === null ? null : freezeTarget(layer.target),
        }),
      ),
    ),
  });
}

function freezeEffect(effect: InteractionEffect): InteractionEffect {
  return Object.freeze({ ...effect, target: freezeTarget(effect.target) });
}

function freezeTransition(transition: InteractionTransition): InteractionTransition {
  return Object.freeze({
    state: freezeState(transition.state),
    effects: Object.freeze(transition.effects.map(freezeEffect)),
  });
}

export function initialInteractionState(): InteractionState {
  return freezeState({
    reveal: null,
    quickLookTarget: null,
    entryPath: [],
    selectedIndex: null,
    constellationTarget: null,
    tideLevel: 1,
    nomination: null,
    layers: [],
  });
}

function sameTarget(left: InteractionTarget | null, right: InteractionTarget): boolean {
  return left?.kind === right.kind && left.id === right.id;
}

function withoutLayer(
  layers: readonly InteractionLayer[],
  kind: InteractionLayerKind,
): readonly InteractionLayer[] {
  return layers.filter((layer) => layer.kind !== kind);
}

function openEntry(state: InteractionState, target: InteractionTarget): InteractionTransition {
  const top = state.entryPath[state.entryPath.length - 1];
  const entryPath = sameTarget(top ?? null, target)
    ? state.entryPath
    : [...state.entryPath, target];
  const layersWithoutTransient = withoutLayer(withoutLayer(state.layers, 'quickLook'), 'entry');
  return {
    state: {
      ...state,
      quickLookTarget: null,
      entryPath,
      layers: [...layersWithoutTransient, { kind: 'entry', target }],
    },
    effects: [{ authority: 'navigation', kind: 'entry.opened', target }],
  };
}

function moveSelection(
  selectedIndex: number | null,
  direction: SelectionDirection,
  itemCount: number,
): number | null {
  if (!Number.isInteger(itemCount) || itemCount < 1) return null;
  if (direction === 'first') return 0;
  if (direction === 'last') return itemCount - 1;
  if (selectedIndex === null) return direction === 'previous' ? itemCount - 1 : 0;
  if (direction === 'next') return (selectedIndex + 1) % itemCount;
  return (selectedIndex - 1 + itemCount) % itemCount;
}

function dismissLayer(state: InteractionState, requested?: InteractionLayerKind): InteractionState {
  const layer = requested ?? state.layers[state.layers.length - 1]?.kind;
  if (layer === undefined) return state;
  if (layer === 'quickLook') {
    return {
      ...state,
      quickLookTarget: null,
      layers: withoutLayer(state.layers, 'quickLook'),
    };
  }
  if (layer === 'entry') {
    return { ...state, entryPath: [], layers: withoutLayer(state.layers, 'entry') };
  }
  return {
    ...state,
    constellationTarget: null,
    layers: withoutLayer(state.layers, 'constellation'),
  };
}

function reduceInteractionValue(
  state: InteractionState,
  envelope: InteractionEnvelope,
): InteractionTransition {
  const action = envelope.action;
  switch (action.kind) {
    case 'target.activate': {
      // Reading rhythm is law: a particle's ordinary activation stays inert;
      // its adjacent/direct `entry.open` affordance is the accessible door.
      if (action.target.kind === 'particle') return { state, effects: [] };
      if (!sameTarget(state.reveal?.target ?? null, action.target)) {
        return {
          state: { ...state, reveal: { target: action.target, stage: 'reading' } },
          effects: [],
        };
      }
      if (state.reveal?.stage === 'reading') {
        return {
          state: { ...state, reveal: { target: action.target, stage: 'gloss' } },
          effects: [],
        };
      }
      return openEntry(state, action.target);
    }
    case 'quickLook.open': {
      const layers = withoutLayer(state.layers, 'quickLook');
      return {
        state: {
          ...state,
          quickLookTarget: action.target,
          layers: [...layers, { kind: 'quickLook', target: action.target }],
        },
        effects: [{ authority: 'presentation', kind: 'quickLook.opened', target: action.target }],
      };
    }
    case 'entry.open':
      return openEntry(state, action.target);
    case 'selection.move':
      return {
        state: {
          ...state,
          selectedIndex: moveSelection(state.selectedIndex, action.direction, action.itemCount),
        },
        effects: [],
      };
    case 'constellation.lock': {
      const layers = withoutLayer(state.layers, 'constellation');
      return {
        state: {
          ...state,
          constellationTarget: action.target,
          layers: [...layers, { kind: 'constellation', target: action.target }],
        },
        effects: [
          { authority: 'presentation', kind: 'constellation.locked', target: action.target },
        ],
      };
    }
    case 'tide.set':
      return { state: { ...state, tideLevel: action.level }, effects: [] };
    case 'judgment.nominate':
      return {
        state: {
          ...state,
          nomination: { target: action.target, judgment: action.judgment },
        },
        effects: [
          {
            authority: 'probe_nomination',
            kind: 'probe.nominated',
            target: action.target,
            judgment: action.judgment,
          },
        ],
      };
    case 'navigation.back': {
      if (state.entryPath.length > 1) {
        const entryPath = state.entryPath.slice(0, -1);
        const target = entryPath[entryPath.length - 1] ?? null;
        return {
          state: {
            ...state,
            entryPath,
            layers: state.layers.map((layer) =>
              layer.kind === 'entry' ? { kind: 'entry', target } : layer,
            ),
          },
          effects: [],
        };
      }
      return { state: dismissLayer(state), effects: [] };
    }
    case 'layer.dismiss':
      return { state: dismissLayer(state, action.layer), effects: [] };
  }
}

/** Reduce one explicit interaction. `envelope.provenance` is never branched on. */
export function reduceInteraction(
  state: InteractionState,
  envelope: InteractionEnvelope,
): InteractionTransition {
  return freezeTransition(reduceInteractionValue(state, envelope));
}
