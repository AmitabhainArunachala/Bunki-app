/**
 * The tutor and the coach speak their replies (B4, speech lane, 2026-11-11). In a conversation the tutor talks: with
 * the 声 switch on, a reply of the written tutor or the coach is said once when it arrives, through the voice seam only,
 * reading only its Japanese; with the switch off only a tap on its listen mark speaks. In the Speak room her line is
 * said before the room listens; with no voice the room carries on without sound and shows the plain line once. A reply
 * that arrives while another is being said waits its turn; leaving the screen stops it.
 *
 * These tests hold the parts with plain inputs (modules/voice-replies.mjs, and the room's own functions lifted from
 * speak.js). The whole path, a reply from a local stand-in for /v1/messages through the app's own reply code to the
 * stand-in voice server, is proved in a muted browser by the lane's proof. No test makes a sound.
 */
/* global setTimeout, URL */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { japaneseSentences } from '../prototypes/corridor/modules/voice-layer.mjs';
import {
  createArrivals,
  createReplyQueue,
  serveReplies,
} from '../prototypes/corridor/modules/voice-replies.mjs';

/** Replies written for these tests in the shape a tutor really answers: Japanese and English mixed, markdown, and more
 * than one paragraph (the lane wrote them; no model was asked). */
const REPLIES = Object.freeze([
  '**のに** joins two clauses when the result is unexpected.\n\n例えば：「雨が降っているのに、出かけました。」 It was raining, yet I went out.\n\n- 頑張ったのに、試験に落ちた。 (I tried hard, but failed the exam.)\n\nTry one of your own!',
  'Good question. **ばかり** after the た-form means "just did":\n\n1. 今起きたばかりです。 — I just woke up.\n2. 日本に来たばかりの頃は、何も分からなかった。\n\nUse it for something that feels recent.',
]);

describe('B4: a reply is said once, by itself, only with the switch on', () => {
  it('(h) only the Japanese of a mixed, marked-up reply of several paragraphs is read; the English is left unread', () => {
    for (const reply of REPLIES) {
      const said = japaneseSentences(reply).map((sentence) => sentence.text);
      expect(said.length).toBeGreaterThanOrEqual(2);
      for (const text of said) expect(text).not.toMatch(/[-A-Za-z*#]/u);
    }
    expect(japaneseSentences(REPLIES[0]).map((s) => s.text)).toContain(
      '頑張ったのに、試験に落ちた。',
    );
    expect(japaneseSentences(REPLIES[1]).map((s) => s.text)).toContain('今起きたばかりです。');
  });

  it('(h) a reply that has just arrived is handed over once when its mark stands; drawn again, it is not', () => {
    let clock = 0;
    const arrivals = createArrivals({ now: () => clock });
    const queued = [];
    arrivals.arrived(REPLIES[0]);
    // the chat as drawn: an older reply, and the new one (whitespace as the page shows it)
    const shown = [
      { text: 'もう一つの答え。', item: 'old' },
      { text: ` ${REPLIES[0].replace(/\n/gu, ' \n')} `, item: 'new' },
    ];
    expect(
      serveReplies({ shown, arrivals, bySelf: () => true, push: (item) => queued.push(item) }),
    ).toBe(1);
    expect(queued).toEqual(['new']);
    // the log drawn again (a refresh, the next question sent): the reply is not said a second time
    expect(
      serveReplies({ shown, arrivals, bySelf: () => true, push: (item) => queued.push(item) }),
    ).toBe(0);
    expect(queued).toEqual(['new']);
    // a reply never matched on the screen is forgotten after a few seconds, so a later visit does not say it
    arrivals.arrived(REPLIES[1]);
    clock += 30000;
    expect(
      serveReplies({
        shown: [{ text: REPLIES[1], item: 'late' }],
        arrivals,
        bySelf: () => true,
        push: (item) => queued.push(item),
      }),
    ).toBe(0);
  });

  it('(i) with the 声 switch off nothing is handed over: only his tap on the mark speaks', () => {
    const arrivals = createArrivals();
    const queued = [];
    arrivals.arrived(REPLIES[1]);
    expect(
      serveReplies({
        shown: [{ text: REPLIES[1], item: 'reply' }],
        arrivals,
        bySelf: () => false,
        push: (item) => queued.push(item),
      }),
    ).toBe(0);
    expect(queued).toEqual([]);
    // the arrival is used up: turning the switch on later does not say an old reply
    expect(
      serveReplies({
        shown: [{ text: REPLIES[1], item: 'reply' }],
        arrivals,
        bySelf: () => true,
        push: (item) => queued.push(item),
      }),
    ).toBe(0);
    // control: the next reply, with the switch on, is handed over
    arrivals.arrived(REPLIES[0]);
    expect(
      serveReplies({
        shown: [{ text: REPLIES[0], item: 'next' }],
        arrivals,
        bySelf: () => true,
        push: (item) => queued.push(item),
      }),
    ).toBe(1);
    expect(queued).toEqual(['next']);
  });
});

describe('B4: one reply at a time, in order', () => {
  /** A queue whose reads end when the test says. */
  const rig = () => {
    const log = [];
    const reads = [];
    const queue = createReplyQueue({
      start: (item, done) => {
        if (item.refuse) return false;
        if (reads.some((read) => !read.ended)) log.push(`OVERLAP ${item.name}`);
        const read = {
          item,
          ended: false,
          end: (state = 'done') => {
            read.ended = true;
            log.push(`end ${item.name} ${state}`);
            done(state);
          },
        };
        reads.push(read);
        log.push(`start ${item.name}`);
        return true;
      },
    });
    const current = () => reads.find((read) => !read.ended);
    return { queue, log, reads, current };
  };

  it('(k) two replies in quick succession are said in order, never over each other', () => {
    const r = rig();
    r.queue.push({ name: 'one' });
    r.queue.push({ name: 'two' });
    expect(r.log).toEqual(['start one']);
    expect(r.queue.waiting).toBe(1);
    r.current().end('done');
    expect(r.log).toEqual(['start one', 'end one done', 'start two']);
    r.current().end('done');
    expect(r.log).not.toContain('OVERLAP two');
    expect(r.queue.speaking).toBe(false);
  });

  it('(k) a reply with no voice to be had is passed over, and the next one is said', () => {
    const r = rig();
    r.queue.push({ name: 'one', refuse: true });
    r.queue.push({ name: 'two' });
    r.queue.push({ name: 'three' });
    expect(r.log).toEqual(['start two']);
    r.current().end('done');
    expect(r.log).toEqual(['start two', 'end two done', 'start three']);
  });

  it('leaving the screen (or his tap on something else) stops the reply, and the waiting ones go with it', () => {
    const r = rig();
    r.queue.push({ name: 'one' });
    r.queue.push({ name: 'two' });
    r.queue.push({ name: 'three' });
    r.current().end('stopped');
    expect(r.log).toEqual(['start one', 'end one stopped']);
    expect(r.queue.waiting).toBe(0);
    // a reply whose screen has gone before its turn is not said
    r.queue.push({ name: 'four', live: () => false });
    expect(r.log).toEqual(['start one', 'end one stopped']);
  });

  it('a reply that ends in silence (the server refusing) lets the next one try', () => {
    const r = rig();
    r.queue.push({ name: 'one' });
    r.queue.push({ name: 'two' });
    r.current().end('error');
    expect(r.log).toEqual(['start one', 'end one error', 'start two']);
  });
});

/** The Speak room's own functions, lifted from speak.js and run with a stand-in host. */
function room({ sayLine, lineSentences = (text) => japaneseSentences(text) } = {}) {
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
  const sandbox = {
    Promise,
    String,
    st: { playToken: 0, phase: 'rest', playing: null, session: { id: 'speak-test-1', lines: [] } },
    els: { body: null },
    host: {
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
  vm.runInContext(['voiceLine', 'playLine', 'speakThenListen'].map(lift).join(';\n'), sandbox);
  return { sandbox, events, painted };
}

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
});
