/**
 * The Speak room says her line (B4, speech lane, 2026-11-11). Her line is said through the app's one voice seam before
 * the room listens; with no voice the room carries on without sound and shows the plain line once. Nothing is said on a
 * page he is not looking at: a line that arrives while the page is hidden waits, and is said when the page is shown
 * again only if the room and its talk are still the ones showing (otherwise it stays on the page, with its listen mark).
 *
 * The written tutor, the coach and the word page's tutor do not speak by themselves in this package (the coordinator's
 * narrowing of 2026-11-11): their replies speak on a tap of their listen marks, as on the base.
 *
 * These tests run the room's own functions, lifted from speak.js, with a stand-in host. No test makes a sound.
 */
/* global setTimeout, URL */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { japaneseSentences } from '../prototypes/corridor/modules/voice-layer.mjs';

/** The Speak room's own functions, lifted from speak.js and run with a stand-in host. */
function room({
  sayLine,
  lineSentences = (text) => japaneseSentences(text),
  hidden = false,
  current = () => true,
} = {}) {
  const source = readFileSync(new URL('../prototypes/corridor/speak.js', import.meta.url), 'utf8');
  const ast = ts.createSourceFile(
    'speak.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const lift = (name) => {
    const found = [];
    const visit = (node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(node);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    expect(found).toHaveLength(1);
    return source.slice(found[0].getStart(ast), found[0].end);
  };
  const events = [];
  const painted = [];
  // the page as the browser reports it: hidden or shown, and the event it sends when that changes
  const seen = new Set();
  const document = {
    hidden,
    addEventListener: (type, listener) => {
      if (type === 'visibilitychange') seen.add(listener);
    },
    removeEventListener: (type, listener) => {
      if (type === 'visibilitychange') seen.delete(listener);
    },
  };
  const show = () => {
    document.hidden = false;
    events.push('shown');
    for (const listener of [...seen]) listener();
  };
  const sandbox = {
    Promise,
    String,
    document,
    st: { playToken: 0, phase: 'rest', playing: null, session: { id: 'speak-test-1', lines: [] } },
    els: { body: null },
    host: {
      isCurrent: current,
      stopAudio: () => events.push('stopAudio'),
      lineSentences,
      ...(sayLine
        ? {
            sayLine: (request) => {
              events.push(
                `say ${request.sentences.map((s) => s.text).join('')} as ${request.conversation}`,
              );
              return sayLine(request);
            },
          }
        : {}),
      stopLine: () => events.push('stopLine'),
    },
    setPhase: (phase) => {
      sandbox.st.phase = phase;
      events.push(`phase ${phase}`);
    },
    autoListenAllowed: () => true,
    startListening: () => {
      events.push('listen');
    },
    paintLineState: (line) => painted.push({ index: line.index, silent: line.silent }),
    t: (ja, en) => en,
  };
  vm.createContext(sandbox);
  // whenShown is the room's own wait for a hidden page (absent from a room that does not wait)
  const names = /function whenShown\(/u.test(source)
    ? ['voiceLine', 'whenShown', 'playLine', 'speakThenListen']
    : ['voiceLine', 'playLine', 'speakThenListen'];
  vm.runInContext(names.map(lift).join(';\n'), sandbox);
  return { sandbox, events, painted, show };
}

describe('nothing is said on a page he is not looking at', () => {
  it('(1) her line that arrives while the page is hidden asks nothing and says nothing; shown again, it is said, then the room listens', async () => {
    let requests = 0;
    const { sandbox, events, show } = room({
      hidden: true,
      sayLine: async () => {
        requests += 1;
        return { state: 'done', code: null, line: '' };
      },
    });
    const outcome = sandbox.speakThenListen({ index: 1, text: 'それはよかったですね。' });
    await new Promise((done) => setTimeout(done, 20));
    expect(requests).toBe(0);
    expect(events).not.toContain('phase speaking');
    expect(events).not.toContain('listen');
    show();
    expect(await outcome).toBe('done');
    expect(requests).toBe(1);
    expect(events.indexOf('shown')).toBeLessThan(events.indexOf('phase speaking'));
    expect(events.at(-1)).toBe('listen');
  });

  it('(1) if the room or its talk is no longer the one showing when the page comes back, nothing is said (her line stays tappable)', async () => {
    let requests = 0;
    let current = true;
    const { sandbox, events, show } = room({
      hidden: true,
      current: () => current,
      sayLine: async () => {
        requests += 1;
        return { state: 'done', code: null, line: '' };
      },
    });
    const outcome = sandbox.speakThenListen({ index: 1, text: 'それはよかったですね。' });
    await new Promise((done) => setTimeout(done, 20));
    current = false; // he left the room while the page was hidden
    show();
    expect(await outcome).toBe('stopped');
    expect(requests).toBe(0);
    expect(events).not.toContain('phase speaking');
  });
});

describe('B4: the Speak room says her line before it listens', () => {
  it('(j) voiceLine yields her line’s Japanese, and nothing of the provider’s own', () => {
    const { sandbox } = room();
    const line = { text: '今日はどんな一日でしたか。' };
    expect(sandbox.voiceLine(line).map((s) => s.text)).toEqual(['今日はどんな一日でしたか。']);
    expect(line.voice).toEqual([]);
    expect(sandbox.voiceLine({ text: 'English only' })).toEqual([]);
  });

  it('(j) her line is said through the seam first, and only then does the room listen', async () => {
    let finish;
    const { sandbox, events } = room({
      sayLine: () =>
        new Promise((done) => {
          finish = done;
        }),
    });
    const line = { index: 0, text: '今日はどんな一日でしたか。' };
    const outcome = sandbox.speakThenListen(line);
    await new Promise((done) => setTimeout(done, 5));
    expect(events).toEqual([
      'stopAudio',
      'phase speaking',
      'say 今日はどんな一日でしたか。 as speak-test-1',
    ]);
    expect(events).not.toContain('listen');
    finish({ state: 'done', code: null, line: '' });
    expect(await outcome).toBe('done');
    expect(events.slice(-2)).toEqual(['phase rest', 'listen']);
  });

  it('(j) with the voice refused the room carries on without sound, and shows the plain line once', async () => {
    const plain = 'No voice here. Pair the voice server in Settings, Writing and voice.';
    const { sandbox, events, painted } = room({
      sayLine: async () => ({ state: 'error', code: 'not-paired', line: plain }),
    });
    expect(await sandbox.speakThenListen({ index: 0, text: '今日はどんな一日でしたか。' })).toBe(
      'silent',
    );
    expect(events.at(-1)).toBe('listen');
    expect(await sandbox.speakThenListen({ index: 2, text: 'それはよかったですね。' })).toBe(
      'silent',
    );
    expect(events.filter((event) => event === 'listen')).toHaveLength(2);
    expect(painted).toEqual([{ index: 0, silent: plain }]);
  });

  it('(l) without the voice layer (the single-file build) her line is silent and the room listens as before', async () => {
    const { sandbox, events } = room({ lineSentences: undefined });
    delete sandbox.host.lineSentences;
    expect(await sandbox.speakThenListen({ index: 0, text: '今日はどんな一日でしたか。' })).toBe(
      'silent',
    );
    expect(events.at(-1)).toBe('listen');
    expect(events.some((event) => event.startsWith('say '))).toBe(false);
  });

  it('(j) the plain line is one the screen shows: no stylesheet hides it under a line that has its listen mark', () => {
    const source = readFileSync(
      new URL('../prototypes/corridor/speak.js', import.meta.url),
      'utf8',
    );
    const ast = ts.createSourceFile(
      'speak.js',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    let found = null;
    const visit = (node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'silentNote') found = node;
      ts.forEachChild(node, visit);
    };
    visit(ast);
    expect(found).not.toBe(null);
    const made = [];
    const sandbox = {
      t: (ja, en) => en,
      el: (tag, cls, text) => {
        const node = {
          tag,
          className: cls,
          textContent: text,
          attrs: {},
          setAttribute(name, value) {
            this.attrs[name] = value;
          },
        };
        made.push(node);
        return node;
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(source.slice(found.getStart(ast), found.end), sandbox);
    const note = sandbox.silentNote({
      silent: 'No voice here. Pair the voice server in Settings, Writing and voice.',
    });
    expect(note.textContent).toMatch(/^No voice here/u);
    expect(note.attrs.role).toBe('status');
    // every rule that hides a note in the room's line, in the stylesheets the app loads after the room's own
    const sheets = ['tighten.css', 'depth.css', 'rooms/speak.css'].map((name) =>
      readFileSync(new URL(`../prototypes/corridor/${name}`, import.meta.url), 'utf8'),
    );
    const hidden = sheets.flatMap((css) =>
      [...css.matchAll(/([^{}]+)\{[^}]*display:\s*none/gu)].map((match) => match[1]),
    );
    for (const cls of note.className.split(/\s+/u).filter((name) => name !== 'speak-note'))
      expect(hidden.filter((selector) => selector.includes(`.${cls}`))).toEqual([]);
  });
});
