/**
 * The loading / error / empty / offline ladder (REQ-UI-09).
 *
 * The precedence is the whole point: a screen that reports "empty" while it is
 * still loading, or "empty" when the lookup actually failed, tells the user
 * something false about their data.
 */

import { describe, expect, it } from 'vitest';

import {
  createBrowserConnectivity,
  createRuntimeConnectivity,
  createStaticConnectivity,
  type OnlineSource,
} from '../src/state/connectivity.ts';
import { NO_DEBUG_FLAGS, parseDebugFlags, readDebugFlags } from '../src/state/debug-flags.ts';
import {
  LOADING_NOTE,
  OFFLINE_CAPABILITY_NOTE,
  resolveViewState,
} from '../src/state/view-state.ts';

describe('state precedence', () => {
  it('reports loading even when data and error are both absent', () => {
    expect(
      resolveViewState({ loading: true, error: null, data: null, emptyMessage: 'none' }).kind,
    ).toBe('loading');
  });

  it('reports loading even when stale data is still held', () => {
    expect(
      resolveViewState({ loading: true, error: null, data: ['stale'], emptyMessage: 'none' }).kind,
    ).toBe('loading');
  });

  it('prefers error over empty — "we do not know" is not "there is nothing"', () => {
    const state = resolveViewState({
      loading: false,
      error: 'Lookup failed.',
      data: null,
      emptyMessage: 'No match.',
    });
    expect(state.kind).toBe('error');
    if (state.kind === 'error') expect(state.message).toBe('Lookup failed.');
  });

  it('reports empty only for a resolved lookup with no result', () => {
    const state = resolveViewState({
      loading: false,
      error: null,
      data: null,
      emptyMessage: 'No match.',
      emptyDetail: 'The seed holds sixteen words.',
    });
    expect(state.kind).toBe('empty');
    if (state.kind === 'empty') expect(state.detail).toBe('The seed holds sixteen words.');
  });

  it('reports ready with the data untouched', () => {
    const data = { id: 'lex-bunki' };
    const state = resolveViewState({ loading: false, error: null, data, emptyMessage: 'none' });
    expect(state.kind).toBe('ready');
    if (state.kind === 'ready') expect(state.data).toBe(data);
  });

  it('omits optional detail rather than setting it to undefined', () => {
    const state = resolveViewState({ loading: false, error: null, data: null, emptyMessage: 'x' });
    expect('detail' in state).toBe(false);
  });
});

describe('the honesty of the state copy', () => {
  it('says what still works when offline instead of only that the network is gone', () => {
    expect(OFFLINE_CAPABILITY_NOTE).toMatch(/offline/i);
    expect(OFFLINE_CAPABILITY_NOTE).toMatch(/search|capture|keep/i);
    expect(OFFLINE_CAPABILITY_NOTE).toMatch(/on this device/i);
  });

  it('does not promise anything about durability in the loading note', () => {
    expect(LOADING_NOTE).not.toMatch(/saved|durable|synced/i);
  });
});

describe('connectivity', () => {
  function fakeSource(): OnlineSource & { flip: (online: boolean) => void } {
    const listeners = new Map<string, Set<() => void>>();
    let online = true;
    return {
      get onLine() {
        return online;
      },
      addEventListener(type, listener) {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener(type, listener) {
        listeners.get(type)?.delete(listener);
      },
      flip(next: boolean) {
        online = next;
        for (const listener of listeners.get(next ? 'online' : 'offline') ?? []) listener();
      },
    };
  }

  it('reports the browser status and follows its events', () => {
    const source = fakeSource();
    const observer = createBrowserConnectivity(source);
    const seen: string[] = [];
    const unsubscribe = observer.subscribe((status) => seen.push(status));

    expect(observer.get()).toBe('online');
    source.flip(false);
    expect(observer.get()).toBe('offline');
    source.flip(true);

    expect(seen).toEqual(['offline', 'online']);
    unsubscribe();
    source.flip(false);
    expect(seen).toEqual(['offline', 'online']);
  });

  it('reports "unknown" rather than assuming online where no observer exists', () => {
    expect(createRuntimeConnectivity({}).get()).toBe('unknown');
    expect(createRuntimeConnectivity({ navigator: {} }).get()).toBe('unknown');
    expect(createStaticConnectivity('unknown').get()).toBe('unknown');
  });

  it('uses the browser observer when the globals are complete', () => {
    const observer = createRuntimeConnectivity({
      navigator: { onLine: false },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    expect(observer.get()).toBe('offline');
  });
});

describe('evidence-harness flags', () => {
  it('are inert without a query string', () => {
    expect(parseDebugFlags('')).toEqual(NO_DEBUG_FLAGS);
    expect(readDebugFlags(undefined)).toEqual(NO_DEBUG_FLAGS);
    expect(readDebugFlags({})).toEqual(NO_DEBUG_FLAGS);
  });

  it('parses each flag', () => {
    const flags = parseDebugFlags('?lag=900&fail=1&scheme=dark&strokes=all');
    expect(flags).toEqual({
      lagMs: 900,
      forceFailure: true,
      forcedScheme: 'dark',
      strokesRevealed: true,
    });
  });

  it('caps the lag so a stray URL cannot wedge a screen', () => {
    expect(parseDebugFlags('?lag=999999').lagMs).toBe(10_000);
    expect(parseDebugFlags('?lag=-5').lagMs).toBe(0);
    expect(parseDebugFlags('?lag=abc').lagMs).toBe(0);
  });

  it('ignores an unrecognised scheme rather than guessing', () => {
    expect(parseDebugFlags('?scheme=sepia').forcedScheme).toBeNull();
  });
});
