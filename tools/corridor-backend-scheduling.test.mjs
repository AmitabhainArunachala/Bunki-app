/* global console, setTimeout, clearTimeout, queueMicrotask */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../prototypes/corridor/corridor.js', import.meta.url), 'utf8');
const dictionaryModule = readFileSync(
  new URL('../prototypes/corridor/modules/dictionary.mjs', import.meta.url),
  'utf8',
);
// A marker that moved must fail here, never silently cut to the end of the file.
const cut = (text, start, end) => {
  const from = text.indexOf(start);
  const to = from < 0 ? -1 : text.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`cut marker not found: ${from < 0 ? start : end}`);
  return text.slice(from, to);
};
const between = (start, end) => cut(source, start, end);
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
afterEach(() => vi.useRealTimers());

describe('foreground-aware article prefetch', () => {
  function harness(idle = false) {
    vi.useFakeTimers();
    const handlers = {};
    const calls = [];
    const holds = [];
    const callbacks = [];
    const document = { hidden: false };
    const environment = {
      S: { ready: true },
      D: {
        passages: [
          { id: 'a', file: 'a.json' },
          { id: 'b', file: 'b.json' },
          { id: 'archive', file: 'archive/old.json' },
        ],
      },
      document,
      console,
      navigator: { onLine: true, serviceWorker: { controller: { postMessage: vi.fn() } } },
      window: idle
        ? {
            requestIdleCallback: (callback) => {
              callbacks.push(callback);
              return callbacks.length;
            },
            cancelIdleCallback: vi.fn(),
          }
        : {},
      addEventListener: (name, callback) => {
        handlers[name] = callback;
      },
      setTimeout,
      clearTimeout,
      performance: { now: () => Date.now() },
      ensureArticle: (passage) => {
        calls.push(passage.id);
        const hold = deferred();
        holds.push(hold);
        return hold.promise;
      },
    };
    vm.runInNewContext(
      between(
        'let articlePrefetchDeparted = false;',
        '/* ------------------------------------------------------- navigation state */',
      ) + '\nprefetchArticles();',
      environment,
    );
    return { handlers, calls, holds, callbacks, document, environment };
  }

  it('pauses for interaction and hidden pages, and runs only one optional read at a time', async () => {
    const h = harness();
    h.handlers.input();
    await vi.advanceTimersByTimeAsync(800);
    expect(h.calls).toEqual([]);
    h.document.hidden = true;
    await vi.advanceTimersByTimeAsync(1100);
    expect(h.calls).toEqual([]);
    h.document.hidden = false;
    await vi.advanceTimersByTimeAsync(1001);
    expect(h.calls).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.calls).toEqual(['a']);
    h.holds[0].resolve();
    await vi.advanceTimersByTimeAsync(40);
    expect(h.calls).toEqual(['a', 'b']);
    h.holds[1].resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.calls).not.toContain('archive');
  });

  it('checks offline state again after an idle callback and resumes warming after connectivity returns', async () => {
    const h = harness(true);
    await vi.advanceTimersByTimeAsync(350);
    h.environment.navigator.onLine = false;
    h.callbacks[0]();
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.calls).toEqual([]);
    expect(h.callbacks).toHaveLength(1);
    h.environment.navigator.onLine = true;
    await vi.advanceTimersByTimeAsync(1000);
    h.callbacks[1]();
    expect(h.calls).toEqual(['a']);
    h.holds[0].resolve();
  });

  it('drops idle callbacks after departure and never cancels an in-flight shared read', async () => {
    const h = harness(true);
    await vi.advanceTimersByTimeAsync(350);
    h.handlers.beforeunload();
    h.callbacks[0]();
    expect(h.calls).toEqual([]);
    h.handlers.pageshow({ persisted: true });
    await vi.advanceTimersByTimeAsync(350);
    h.callbacks[1]();
    expect(h.calls).toEqual(['a']);
    h.handlers.pagehide();
    h.holds[0].resolve();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.calls).toEqual(['a']);
  });
});

describe('deep dictionary scheduling', () => {
  function harness() {
    vi.useFakeTimers();
    const handlers = {};
    const calls = [];
    const state = { view: 'shelf', query: '' };
    const data = {
      dictionaryMode: 'worker',
      dictionaryState: 'ready',
      dictionarySearchCache: new Map(),
      dictionarySearchPending: new Map(),
      dictionarySearchErrors: new Map(),
      dictionaryBySeq: new Map(),
      dictionaryCompleteForms: new Map(),
    };
    // The shelf as it is drawn: a query paints once (its input handler), and refreshShelfBody repaints only when
    // what it would draw changed. Here that is the query alone; the app's render token also carries the dictionary
    // state, which a composing input leaves at 'ready', so the token check stops a repaint exactly as this does.
    let painted = '';
    const context = vm.createContext({
      S: state,
      D: data,
      document: { getElementById: () => null },
      addEventListener: (name, callback) => {
        handlers[name] = callback;
      },
      setTimeout,
      clearTimeout,
      queueMicrotask,
      performance: { now: () => Date.now() },
      recordDictionaryPerformance: () => {},
      refreshShelfBody: () => {
        if (state.query.trim() === painted) return;
        painted = state.query.trim();
        context.searchResults(state.query);
      },
      // The page search's own side effect on the deep tier: its core scan asks for the full-dictionary search.
      searchResults: (value) => {
        context.requestDictionarySearch({ q: value.trim() }, []);
        return [];
      },
      dictionaryWorkerRequest: (_type, payload, generation) => {
        const hold = deferred();
        calls.push({ payload, generation, hold });
        return hold.promise;
      },
      cacheDictionaryFormRows: () => {},
      dictionaryRowBySeq: () => null,
    });
    vm.runInContext(
      cut(
        dictionaryModule,
        'function dictionaryQueryKey(query)',
        'function dictionaryQueryError(query)',
      ) +
        cut(dictionaryModule, 'function activeDictionaryQuery()', 'function readerTokenAt(') +
        between('const DICTIONARY_SEARCH_SETTLE_MS', '/** Hfix-1A (W-2, W-1)') +
        between('function refreshDictionaryBodies()', 'function searchResults(query)'),
      context,
    );
    const query = (value) => {
      state.query = value;
      painted = value.trim();
      context.value = value;
      vm.runInContext('requestDictionarySearch({ q: value }, []);', context);
    };
    return { query, handlers, calls, data, state };
  }

  it('coalesces typing into the latest query without resetting the timer on unrelated redraws', async () => {
    const h = harness();
    h.query('kai');
    await vi.advanceTimersByTimeAsync(40);
    h.query('kaisai');
    await vi.advanceTimersByTimeAsync(60);
    h.query('kaisai');
    expect(h.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(20);
    expect(h.calls.map((call) => call.payload.context.q)).toEqual(['kaisai']);
  });

  it('coalesces a short Roman prefix across a slow input turn before sending the longer query', async () => {
    const h = harness();
    h.query('ka');
    await vi.advanceTimersByTimeAsync(200);
    expect(h.calls).toEqual([]);
    h.query('kaisai');
    await vi.advanceTimersByTimeAsync(80);
    expect(h.calls.map((call) => call.payload.context.q)).toEqual(['kaisai']);
    await vi.advanceTimersByTimeAsync(320);
    expect(h.calls).toHaveLength(1);
  });

  it('still searches a short Roman query when the learner stops typing', async () => {
    const h = harness();
    h.query('ka');
    await vi.advanceTimersByTimeAsync(319);
    expect(h.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.calls.map((call) => call.payload.context.q)).toEqual(['ka']);
  });

  it('does not dispatch composition fragments or publish obsolete replies', async () => {
    const h = harness();
    const target = { matches: () => true };
    h.handlers.compositionstart({ target });
    h.query('き');
    await vi.advanceTimersByTimeAsync(500);
    expect(h.calls).toEqual([]);
    h.handlers.compositionend({ target });
    h.query('きょう');
    await vi.advanceTimersByTimeAsync(80);
    expect(h.calls).toHaveLength(1);
    h.query('あした');
    await vi.advanceTimersByTimeAsync(80);
    expect(h.calls).toHaveLength(1);
    h.calls[0].hold.resolve({
      generation: h.calls[0].generation,
      result: { results: [], compatibleCoreIds: [], formRows: [] },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.data.dictionarySearchCache.has('きょう')).toBe(false);
    expect(h.calls[1].payload.context.q).toBe('あした');
  });

  // PR #134 review, finding 1: Chromium and the iPhone's keyboard deliver the composed word's last input while
  // composition is still open, so the shelf painted that query before compositionend. A repaint stops at the
  // render-token check; composition end itself must ask for the finished word.
  it('sends the finished composed word to the full dictionary on composition end, with no further input', async () => {
    const h = harness();
    const target = { matches: () => true };
    h.handlers.compositionstart({ target });
    h.query('き');
    h.query('きょう');
    h.query('今日');
    await vi.advanceTimersByTimeAsync(500);
    expect(h.calls).toEqual([]);
    h.handlers.compositionend({ target });
    await vi.advanceTimersByTimeAsync(80);
    expect(h.calls.map((call) => call.payload.context.q)).toEqual(['今日']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.calls).toHaveLength(1);
  });

  // PR #134 review, finding 2: a composition ended by focus leaving the field (a tap elsewhere on the phone) used to
  // clear the flag only. It must send the composed word and restart a search that was queued before composing began.
  it('sends the composed word and restarts a queued search when focus leaves a composing field', async () => {
    const h = harness();
    const target = { matches: () => true };
    h.handlers.compositionstart({ target });
    h.query('にほんご');
    await vi.advanceTimersByTimeAsync(500);
    expect(h.calls).toEqual([]);
    h.handlers.focusout({ target });
    await vi.advanceTimersByTimeAsync(80);
    expect(h.calls.map((call) => call.payload.context.q)).toEqual(['にほんご']);
    // A browser that also reports compositionend after the blur adds no second request.
    h.handlers.compositionend({ target });
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.calls).toHaveLength(1);

    const queued = harness();
    queued.query('日本');
    await vi.advanceTimersByTimeAsync(10);
    queued.handlers.compositionstart({ target });
    // The settle timer fires while composing and is dropped; the word stays queued and unsent.
    await vi.advanceTimersByTimeAsync(500);
    expect(queued.calls).toEqual([]);
    queued.handlers.focusout({ target });
    await vi.advanceTimersByTimeAsync(80);
    expect(queued.calls.map((call) => call.payload.context.q)).toEqual(['日本']);

    const idle = harness();
    idle.query('日本');
    idle.handlers.focusout({ target });
    await vi.advanceTimersByTimeAsync(80);
    expect(idle.calls).toHaveLength(1);
  });
});

it('loads independent validators concurrently but admits no record before all have settled', async () => {
  const started = [];
  const holds = [];
  const load = (name) => {
    started.push(name);
    const hold = deferred();
    holds.push(hold);
    return hold.promise;
  };
  const protections = [];
  let opened = false;
  const environment = {
    window: {},
    sentencePracticeModule: null,
    sourceProcessingModule: null,
    loadImport: (name) => load(name),
    protectStore: (_ja, en) => protections.push(en),
    acquireRecordOwnership: async () => true,
    openAppRecord: async () => {
      opened = true;
    },
  };
  for (const name of [
    'Reading',
    'TeacherContext',
    'TeacherDraft',
    'SentenceDraft',
    'Feed',
    'Publisher',
    'SourceInbox',
    'Assessment',
  ])
    environment[`ensure${name}Module`] = () => load(name);
  const block = between(
    '  const validators = await Promise.allSettled([',
    '  await resumeSavedPractice();',
  ).replaceAll('import(', 'loadImport(');
  const running = vm.runInNewContext(`(async () => { ${block} })()`, environment);
  expect(started).toHaveLength(10);
  holds[0].reject(new Error('offline validator'));
  for (const hold of holds.slice(1, -1)) hold.resolve({});
  await Promise.resolve();
  expect(opened).toBe(false);
  holds.at(-1).resolve({});
  await running;
  expect(protections).toEqual([
    'The reading component could not load. Saving is paused to protect article versions. Reconnect and reload the app.',
  ]);
  expect(opened).toBe(true);
});
