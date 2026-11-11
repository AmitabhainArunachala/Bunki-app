/**
 * The ear (B2, 2026-11-11): one gesture that speaks any Japanese on any screen of Bunki.
 *
 *  a. its state machine, transition by transition, as the behaviour table names them (off, armed, held on, speaking,
 *     no voice), with a second tap stopping the voice, arming while a voice speaks, and one request per rest;
 *  b. how it finds the unit that speaks, on small hand-built DOM fixtures: a sentence in running text, a button row, a
 *     web node, a galaxy word, a kana reading the element carries, and text with no Japanese ignored;
 *  c. with the ear off and no Option key, its click handler touches nothing.
 *
 * Nothing here makes a sound or reaches a server: `speak` is a recording fake.
 */
import { describe, expect, it } from 'vitest';

import {
  EAR_CSS,
  createEarMachine,
  earClick,
  earLabel,
  findUnit,
  noVoiceLine,
  rangeText,
} from '../prototypes/corridor/modules/ear.mjs';

/* ------------------------------------------------------------------ a fake clock and a fake voice */
function rig({ cannot = () => null } = {}) {
  let clock = 0;
  const timers = [];
  const calls = { speak: [], stops: [] };
  const handles = [];
  const machine = createEarMachine({
    speak: (unit, done) => {
      const handle = {
        unit,
        done,
        stopped: false,
        stop() {
          this.stopped = true;
          calls.stops.push(unit.key);
          done('stopped', null);
        },
      };
      calls.speak.push(unit);
      handles.push(handle);
      return handle;
    },
    cannot,
    schedule: (fn, ms) => {
      const timer = { at: clock + ms, fn, live: true };
      timers.push(timer);
      return timer;
    },
    cancel: (timer) => {
      if (timer) timer.live = false;
    },
  });
  const advance = (ms) => {
    clock += ms;
    for (const timer of timers.filter((t) => t.live && t.at <= clock)) {
      timer.live = false;
      timer.fn();
    }
  };
  return { machine, calls, handles, advance };
}
const unit = (key, text = key) => ({
  key,
  kind: 'element',
  sentences: [{ text }],
  voiceKey: `word:${key}`,
});
const A = unit('雨');
const B = unit('晴れ');

describe('a. the ear’s state machine', () => {
  it('rests off; one tap arms it, another tap rests it', () => {
    const { machine } = rig();
    expect(machine.display()).toBe('off');
    machine.tapEar();
    expect(machine.display()).toBe('armed');
    machine.tapEar();
    expect(machine.display()).toBe('off');
  });

  it('armed: the next tap on Japanese speaks it, does nothing else, and the ear goes off', () => {
    const { machine, calls, handles } = rig();
    machine.tapEar();
    expect(machine.click({ unit: A, pointer: 'mouse' })).toBe('consume');
    expect(calls.speak.map((u) => u.key)).toEqual(['雨']);
    expect(machine.mode()).toBe('off');
    expect(machine.display()).toBe('speaking');
    handles[0].done('done', null);
    expect(machine.display()).toBe('off');
    // the ear went off: the tap after that is the app's own
    expect(machine.click({ unit: B, pointer: 'mouse' })).toBe('pass');
    expect(calls.speak).toHaveLength(1);
  });

  it('armed: a tap on something with no Japanese is the app’s, and the ear stays armed', () => {
    const { machine, calls } = rig();
    machine.tapEar();
    expect(machine.click({ unit: null, pointer: 'touch' })).toBe('pass');
    expect(machine.display()).toBe('armed');
    expect(calls.speak).toHaveLength(0);
  });

  it('held on (a long press): on a phone every tap on Japanese speaks it, until the ear is tapped off', () => {
    const { machine, calls, handles } = rig();
    machine.holdEar();
    expect(machine.display()).toBe('held');
    expect(machine.click({ unit: A, pointer: 'touch' })).toBe('consume');
    handles[0].done('done', null);
    expect(machine.display()).toBe('held');
    expect(machine.click({ unit: B, pointer: 'touch' })).toBe('consume');
    expect(calls.speak.map((u) => u.key)).toEqual(['雨', '晴れ']);
    handles[1].done('done', null);
    machine.tapEar();
    expect(machine.display()).toBe('off');
    expect(machine.click({ unit: A, pointer: 'touch' })).toBe('pass');
    expect(calls.speak).toHaveLength(2);
  });

  it('a long press holds it on from armed too', () => {
    const { machine } = rig();
    machine.tapEar();
    machine.holdEar();
    expect(machine.display()).toBe('held');
  });

  it('held on, on the Mac: clicks behave as usual; resting the pointer 0.4 s on Japanese speaks it', () => {
    const { machine, calls, advance } = rig();
    machine.holdEar();
    expect(machine.click({ unit: A, pointer: 'mouse' })).toBe('pass');
    expect(calls.speak).toHaveLength(0);
    machine.hover({ unit: A, pointer: 'mouse' });
    advance(399);
    expect(calls.speak).toHaveLength(0);
    advance(1);
    expect(calls.speak.map((u) => u.key)).toEqual(['雨']);
  });

  it('one request per rest: moving within the same unit does not ask again', () => {
    const { machine, calls, handles, advance } = rig();
    machine.holdEar();
    machine.hover({ unit: A, pointer: 'mouse' });
    advance(400);
    for (let i = 0; i < 10; i += 1) {
      machine.hover({ unit: unit('雨'), pointer: 'mouse' });
      advance(500);
    }
    expect(calls.speak).toHaveLength(1);
    handles[0].done('done', null);
    for (let i = 0; i < 5; i += 1) {
      machine.hover({ unit: A, pointer: 'mouse' });
      advance(500);
    }
    expect(calls.speak).toHaveLength(1);
    // leaving the unit and resting on it again is a new rest
    machine.hover({ unit: null, pointer: 'mouse' });
    machine.hover({ unit: A, pointer: 'mouse' });
    advance(400);
    expect(calls.speak).toHaveLength(2);
  });

  it('a pass across a unit shorter than the rest asks nothing', () => {
    const { machine, calls, advance } = rig();
    machine.holdEar();
    machine.hover({ unit: A, pointer: 'mouse' });
    advance(300);
    machine.hover({ unit: B, pointer: 'mouse' });
    advance(300);
    machine.hover({ unit: null, pointer: 'mouse' });
    advance(2000);
    expect(calls.speak).toHaveLength(0);
  });

  it('held on, on the Mac: a click during a rest is the app’s, and that rest then asks nothing', () => {
    const { machine, calls, advance } = rig();
    machine.holdEar();
    machine.hover({ unit: A, pointer: 'mouse' });
    advance(200);
    expect(machine.click({ unit: A, pointer: 'mouse' })).toBe('pass');
    advance(2000);
    machine.hover({ unit: A, pointer: 'mouse' });
    advance(2000);
    expect(calls.speak).toHaveLength(0);
  });

  it('a new rest cancels a request still in flight', () => {
    const { machine, calls, handles, advance } = rig();
    machine.holdEar();
    machine.hover({ unit: A, pointer: 'mouse' });
    advance(400);
    machine.hover({ unit: B, pointer: 'mouse' });
    advance(400);
    expect(handles[0].stopped).toBe(true);
    expect(calls.speak.map((u) => u.key)).toEqual(['雨', '晴れ']);
    expect(machine.speaking()).toBe('晴れ');
  });

  it('the rest is the Mac’s: a finger never rests, and a rest asks nothing unless the ear is held on', () => {
    const { machine, calls, advance } = rig();
    machine.holdEar();
    machine.hover({ unit: A, pointer: 'touch' });
    advance(1000);
    machine.tapEar();
    machine.hover({ unit: A, pointer: 'mouse' });
    advance(1000);
    machine.tapEar();
    machine.tapEar();
    machine.hover({ unit: A, pointer: 'mouse' });
    advance(1000);
    expect(calls.speak).toHaveLength(0);
  });

  it('speaking: a second tap on the same unit stops it, and does nothing else', () => {
    const { machine, calls, handles } = rig();
    machine.tapEar();
    machine.click({ unit: A, pointer: 'touch' });
    expect(machine.click({ unit: unit('雨'), pointer: 'touch' })).toBe('consume');
    expect(handles[0].stopped).toBe(true);
    expect(calls.speak).toHaveLength(1);
    expect(machine.display()).toBe('off');
  });

  it('held on: a second tap on the unit being read stops it; the ear stays held on', () => {
    const { machine, handles } = rig();
    machine.holdEar();
    machine.click({ unit: A, pointer: 'touch' });
    expect(machine.click({ unit: A, pointer: 'touch' })).toBe('consume');
    expect(handles[0].stopped).toBe(true);
    expect(machine.display()).toBe('held');
  });

  it('arming while a voice speaks: the mark shows armed, and the next tap stops that voice and speaks the new unit', () => {
    const { machine, calls, handles } = rig();
    machine.tapEar();
    machine.click({ unit: A, pointer: 'mouse' });
    expect(machine.display()).toBe('speaking');
    machine.tapEar();
    expect(machine.display()).toBe('armed');
    expect(machine.voice()).toBe(true);
    expect(machine.click({ unit: B, pointer: 'mouse' })).toBe('consume');
    expect(handles[0].stopped).toBe(true);
    expect(calls.speak.map((u) => u.key)).toEqual(['雨', '晴れ']);
    expect(machine.display()).toBe('speaking');
  });

  it('held on while a voice speaks: the next tap stops it and speaks the new unit (one sound at a time)', () => {
    const { machine, calls, handles } = rig();
    machine.holdEar();
    machine.click({ unit: A, pointer: 'touch' });
    machine.click({ unit: B, pointer: 'touch' });
    expect(handles[0].stopped).toBe(true);
    expect(handles[1].stopped).toBe(false);
    expect(calls.speak.map((u) => u.key)).toEqual(['雨', '晴れ']);
  });

  it('an end that belongs to an earlier read does not end the one speaking now', () => {
    const { machine, handles } = rig();
    machine.holdEar();
    machine.click({ unit: A, pointer: 'touch' });
    machine.click({ unit: B, pointer: 'touch' });
    handles[0].done('done', null);
    expect(machine.speaking()).toBe('晴れ');
    expect(machine.display()).toBe('speaking');
  });

  it('no voice: nothing is requested, the mark is struck with the reason for about four seconds, then rests off', () => {
    const { machine, calls, advance } = rig({ cannot: () => 'not-paired' });
    machine.tapEar();
    expect(machine.click({ unit: A, pointer: 'touch' })).toBe('consume');
    expect(calls.speak).toHaveLength(0);
    expect(machine.display()).toBe('novoice');
    expect(machine.reason()).toBe('not-paired');
    advance(3999);
    expect(machine.display()).toBe('novoice');
    advance(1);
    expect(machine.display()).toBe('off');
  });

  it('no voice while held on: struck, then off', () => {
    const { machine, advance } = rig({ cannot: () => 'offline' });
    machine.holdEar();
    machine.click({ unit: A, pointer: 'touch' });
    expect(machine.display()).toBe('novoice');
    advance(4000);
    expect(machine.display()).toBe('off');
  });

  it('a read the server refuses (today’s budget used) ends struck, with its reason', () => {
    const { machine, handles } = rig();
    machine.tapEar();
    machine.click({ unit: A, pointer: 'touch' });
    handles[0].done('error', 'day-budget');
    expect(machine.display()).toBe('novoice');
    expect(machine.reason()).toBe('day-budget');
  });

  it('a read with nothing Japanese to say ends quietly, not struck', () => {
    const { machine, handles } = rig();
    machine.tapEar();
    machine.click({ unit: A, pointer: 'touch' });
    handles[0].done('error', 'nothing-to-say');
    expect(machine.display()).toBe('off');
  });

  it('a tap on the struck ear arms it again', () => {
    const { machine } = rig({ cannot: () => 'offline' });
    machine.tapEar();
    machine.click({ unit: A, pointer: 'touch' });
    machine.tapEar();
    expect(machine.display()).toBe('armed');
  });

  it('off: Option-click on Japanese speaks it (the Mac), and a plain click is the app’s own', () => {
    const { machine, calls } = rig();
    expect(machine.click({ unit: A, pointer: 'mouse', alt: false })).toBe('pass');
    expect(calls.speak).toHaveLength(0);
    expect(machine.click({ unit: A, pointer: 'mouse', alt: true })).toBe('consume');
    expect(calls.speak.map((u) => u.key)).toEqual(['雨']);
    expect(machine.mode()).toBe('off');
  });

  it('the 読む chip speaks a selection whatever the ear’s state', () => {
    const { machine, calls } = rig();
    machine.speakNow(unit('雨が降る。風が吹く。'));
    expect(calls.speak).toHaveLength(1);
    expect(machine.display()).toBe('speaking');
  });

  it('stop ends the read the ear started (the screen changed)', () => {
    const { machine, handles } = rig();
    machine.holdEar();
    machine.click({ unit: A, pointer: 'touch' });
    machine.stop();
    expect(handles[0].stopped).toBe(true);
    expect(machine.display()).toBe('held');
  });
});

/* ------------------------------------------------------------------ small DOM fixtures */
const text = (value) => ({ nodeType: 3, nodeValue: value, parentNode: null });
function h(tag, attrs = {}, ...kids) {
  const classes = String(attrs.class || '')
    .split(/\s+/)
    .filter(Boolean);
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    className: classes.join(' '),
    hidden: !!attrs.hidden,
    style: { display: attrs.display || '' },
    classList: { contains: (name) => classes.includes(name) },
    getAttribute: (name) =>
      name in attrs && name !== 'class' && name !== 'display' ? String(attrs[name]) : null,
    childNodes: [],
    parentNode: null,
  };
  for (const kid of kids) {
    const child = typeof kid === 'string' ? text(kid) : kid;
    child.parentNode = node;
    node.childNodes.push(child);
  }
  return node;
}
const page = (...kids) => h('body', {}, h('main', {}, ...kids));
const textIn = (element, value) => {
  const stack = [element];
  while (stack.length) {
    const node = stack.shift();
    if (node.nodeType === 3 && node.nodeValue.includes(value)) return node;
    if (node.childNodes) stack.unshift(...node.childNodes);
  }
  throw new Error(`no text ${value}`);
};
const said = (u) => u.sentences.map((s) => s.text);
const context = { view: 'words' };

describe('b. the unit that speaks', () => {
  it('in running text, the sentence under the pointer', () => {
    const p = h('p', {}, '今日は雨が降っている。明日は晴れるでしょう。');
    page(p);
    const node = p.childNodes[0];
    const second = findUnit(node, { offset: 14, context });
    expect(second.kind).toBe('sentence');
    expect(said(second)).toEqual(['明日は晴れるでしょう。']);
    expect(second.range).toMatchObject({
      startNode: node,
      startOffset: 11,
      endNode: node,
      endOffset: 22,
    });
    const first = findUnit(node, { offset: 2, context });
    expect(said(first)).toEqual(['今日は雨が降っている。']);
    expect(first.key).not.toBe(second.key);
    expect(findUnit(node, { offset: 4, context }).key).toBe(first.key);
  });

  it('a sentence that runs across the reader’s word spans is one unit, its readings above the words left out', () => {
    const p = h(
      'p',
      { class: 'reader-prose' },
      h('span', { class: 'tok content' }, '自動車'),
      h('span', { class: 'tok plain' }, '、'),
      h('span', { class: 'tok content' }, h('ruby', {}, '産業', h('rt', {}, 'さんぎょう'))),
      h('span', { class: 'tok plain' }, 'が'),
      // the reader's word spans are inline-flex boxes (seen in the built app): still words of one sentence
      h(
        'span',
        { class: 'token-door' },
        h(
          'span',
          { class: 'tok content', role: 'presentation', display: 'inline-flex' },
          // a flex item is blockified: the word's own span computes as display: block
          h('span', { class: 'tok-word', display: 'block' }, '伸びる'),
        ),
      ),
      h('span', { class: 'tok plain' }, '。'),
      h('span', { class: 'tok annotation', 'data-reader-annotation': 'true' }, '（のびる）'),
      h('span', { class: 'tok content' }, '次'),
      h('span', { class: 'tok plain' }, 'の文。'),
    );
    page(h('div', { id: 'reader' }, p));
    const target = textIn(p, '伸びる');
    const u = findUnit(target, {
      offset: 1,
      context: { ...context, articleOf: () => 'wikinews:1403' },
    });
    expect(u.kind).toBe('sentence');
    expect(said(u)).toEqual(['自動車、産業が伸びる。']);
    expect(u.voiceKey).toBe('article:wikinews:1403');
    expect(u.range.startNode).toBe(textIn(p, '自動車'));
    expect(u.range.endNode).toBe(textIn(p, '。'));
    // a tap on a reading above a word is the sentence that word stands in
    expect(said(findUnit(textIn(p, 'さんぎょう'), { offset: 0, context }))).toEqual([
      '自動車、産業が伸びる。',
    ]);
  });

  it('a link inside running text is part of its sentence', () => {
    const p = h('p', {}, '詳しくは', h('a', { href: '#x' }, '辞書'), 'を見てください。');
    page(p);
    const u = findUnit(textIn(p, '辞書'), { offset: 0, context });
    expect(u.kind).toBe('sentence');
    expect(said(u)).toEqual(['詳しくは辞書を見てください。']);
  });

  it('on a search row, the row: its word as the key, its kana reading as the text', () => {
    const row = h(
      'button',
      { class: 'nav-search-row', type: 'button' },
      h('span', { class: 'nsr-glyph' }, '門戸'),
      h(
        'span',
        { class: 'nsr-stack' },
        h('span', { class: 'nsr-read' }, 'もんこ'),
        h('span', { class: 'nsr-gloss' }, 'door'),
      ),
    );
    page(h('div', { class: 'search-page-results' }, row));
    for (const where of ['門戸', 'もんこ', 'door']) {
      const u = findUnit(textIn(row, where), { offset: 0, context });
      expect(u.kind).toBe('element');
      expect(u.element).toBe(row);
      expect(said(u)).toEqual(['もんこ']);
      expect(u.voiceKey).toBe('word:門戸');
    }
  });

  it('a kanji row’s several readings are read one after another', () => {
    const row = h(
      'button',
      { class: 'nav-search-row' },
      h('span', { class: 'nsr-glyph' }, '門'),
      h(
        'span',
        { class: 'nsr-stack' },
        h(
          'span',
          { class: 'nsr-read ja-flow' },
          h('span', { class: 'ja-unit' }, 'モン・'),
          h('span', { class: 'ja-unit' }, 'かど・'),
          'と',
        ),
        h('span', { class: 'nsr-gloss' }, 'Gate'),
      ),
    );
    page(row);
    const u = findUnit(textIn(row, '門'), { context });
    expect(said(u)).toEqual(['モン、かど、と']);
    expect(u.voiceKey).toBe('word:門');
  });

  it('on a compound row, the word without its gloss, sent as its reading', () => {
    const row = h(
      'button',
      { class: 'entry-row compound' },
      h(
        'span',
        { class: 'row-stack' },
        h(
          'span',
          { class: 'row-word' },
          '専',
          h('span', { class: 'row-self' }, '門'),
          h('span', { class: 'row-reading' }, 'せんもん'),
        ),
        h('span', { class: 'row-gloss' }, 'speciality'),
      ),
      h('span', { class: 'row-go' }, '›'),
    );
    page(h('div', { class: 'entry-rows' }, row));
    const u = findUnit(textIn(row, '専'), { context });
    expect(u.element).toBe(row);
    expect(said(u)).toEqual(['せんもん']);
    expect(u.voiceKey).toBe('word:専門');
  });

  it('a web node: its Japanese, with no reading to send', () => {
    const node = h(
      'button',
      { class: 'ww-node ww-n-word', 'data-ww-key': '専門' },
      h(
        'span',
        { class: 'ww-nb' },
        h('span', { class: 'ww-g', lang: 'ja' }, '専', h('b', {}, '門')),
        h('span', { class: 'ww-st', 'aria-hidden': 'true' }, '8'),
      ),
      h('span', { class: 'ww-cap' }, 'speciality'),
    );
    page(h('div', { class: 'ww-nodes' }, node));
    const u = findUnit(textIn(node, '門'), { context });
    expect(u.kind).toBe('element');
    expect(u.element).toBe(node);
    expect(said(u)).toEqual(['専門']);
    expect(u.voiceKey).toBe('word:専門');
  });

  it('a galaxy word (a div that is a button): its reading', () => {
    const word = h(
      'div',
      { class: 'word', role: 'button' },
      h('span', { class: 'yomi', lang: 'ja' }, 'たんなる'),
      h('span', { class: 'base', lang: 'ja' }, '単なる'),
      h('span', { class: 'gloss', lang: 'en' }, 'mere, simple'),
    );
    page(h('div', { id: 'sky' }, word));
    const u = findUnit(textIn(word, '単なる'), { context });
    expect(u.element).toBe(word);
    expect(said(u)).toEqual(['たんなる']);
    expect(u.voiceKey).toBe('word:単なる');
  });

  it('a kana reading the element carries as an attribute is the text sent', () => {
    const label = h('button', { 'data-reading': 'きかい' }, '機械');
    page(label);
    const u = findUnit(textIn(label, '機械'), { context });
    expect(said(u)).toEqual(['きかい']);
    expect(u.voiceKey).toBe('word:機械');
  });

  it('a “reading” that is not kana is not taken as the reading', () => {
    const row = h(
      'button',
      {},
      h('span', { class: 'row-word' }, '門'),
      h('span', { class: 'row-reading' }, '門 gate'),
    );
    page(row);
    expect(said(findUnit(textIn(row, '門'), { context }))).toEqual(['門門']);
  });

  it('a label or heading is its own unit, read as it stands', () => {
    const heading = h('h2', { class: 'headword' }, '方法');
    page(heading);
    const u = findUnit(textIn(heading, '方法'), { context });
    expect(said(u)).toEqual(['方法']);
  });

  it('a button that draws its Japanese as SVG text is that button; SVG text loose on the page is no unit', () => {
    const button = h(
      'button',
      { id: 'card-say' },
      h(
        'svg',
        { display: 'inline' },
        h('title', {}, 'speaker'),
        h('text', { display: 'inline' }, '音'),
      ),
    );
    const loose = h('svg', { display: 'inline' }, h('text', { display: 'inline' }, '絵の中の言葉'));
    const body = page(button);
    loose.parentNode = body;
    body.childNodes.push(loose);
    const u = findUnit(textIn(button, '音'), { context });
    expect(u.element).toBe(button);
    expect(said(u)).toEqual(['音']);
    expect(findUnit(textIn(loose, '絵'), { context })).toBe(null);
  });

  it('spaces the page puts between Japanese words are not read', () => {
    const p = h(
      'p',
      {},
      h('span', {}, '自動車 '),
      '、 ',
      h('span', {}, '産業 機械'),
      ' と AI のデータセンター。',
    );
    page(p);
    expect(said(findUnit(textIn(p, '産業'), { offset: 0, context }))).toEqual([
      '自動車、産業機械とAIのデータセンター。',
    ]);
  });

  it('a row that mixes English and one kanji says the kanji', () => {
    const row = h(
      'button',
      { class: 'mini-kanji-row' },
      '産 Products ',
      h('span', {}, 'サン · うむ'),
    );
    page(row);
    expect(said(findUnit(textIn(row, '産'), { context }))).toEqual(['サン', 'うむ']);
  });

  it('text with no Japanese is ignored', () => {
    const p = h('p', {}, 'Begin 15 new N2 cards.');
    const button = h('button', {}, 'Save');
    page(p, button);
    expect(findUnit(p.childNodes[0], { offset: 3, context })).toBe(null);
    expect(findUnit(button.childNodes[0], { context })).toBe(null);
    const mixed = h('p', {}, 'Good session. 「機械」は「きかい」と読みます。 Review it tomorrow.');
    page(mixed);
    expect(findUnit(mixed.childNodes[0], { offset: 2, context })).toBe(null);
    expect(said(findUnit(mixed.childNodes[0], { offset: 20, context }))).toEqual([
      '「機械」は「きかい」と読みます。',
    ]);
  });

  it('the ear’s own marks, a field being typed in and text outside any block are never units', () => {
    const own = h('button', { 'data-ear-own': '' }, '耳');
    const field = h('textarea', {}, '日本語の文。');
    const editable = h('div', { contenteditable: 'true' }, h('p', {}, '日本語の文。'));
    const body = page(own, field, editable);
    const loose = text('迷子の文。');
    loose.parentNode = body;
    body.childNodes.push(loose);
    expect(findUnit(own.childNodes[0], { context })).toBe(null);
    expect(findUnit(field.childNodes[0], { context })).toBe(null);
    expect(findUnit(textIn(editable, '日本語'), { offset: 0, context })).toBe(null);
    expect(findUnit(loose, { offset: 0, context })).toBe(null);
  });

  it('keys: a listen mark’s own key first, so a sentence its mark has spoken is a free replay', () => {
    const p = h('p', { class: 'example-ja', 'data-voice-host': 'example' }, '雨の日は本を読む。');
    page(p);
    const u = findUnit(p.childNodes[0], {
      offset: 1,
      context: { ...context, keyFor: () => 'word:雨' },
    });
    expect(u.voiceKey).toBe('word:雨');
  });

  it('keys: other text has one stable key per screen and text', () => {
    const p = h('p', {}, '一つ目の文。二つ目の文。');
    const q = h('p', {}, 'ほかの段落の文。');
    page(p, q);
    const one = findUnit(p.childNodes[0], { offset: 1, context: { view: 'today' } });
    const again = findUnit(p.childNodes[0], { offset: 1, context: { view: 'today' } });
    const two = findUnit(p.childNodes[0], { offset: 8, context: { view: 'today' } });
    const other = findUnit(q.childNodes[0], { offset: 1, context: { view: 'today' } });
    const elsewhere = findUnit(p.childNodes[0], { offset: 1, context: { view: 'learn' } });
    expect(one.voiceKey).toMatch(/^word:ear\.today\.[0-9a-z]+$/);
    expect(again.voiceKey).toBe(one.voiceKey);
    expect(two.voiceKey).toBe(one.voiceKey); // one paragraph keeps one narrator
    expect(other.voiceKey).not.toBe(one.voiceKey);
    expect(elsewhere.voiceKey).not.toBe(one.voiceKey);
  });
});

/* ------------------------------------------------------------------ c. off is inert */
describe('nothing typed leaves the device', () => {
  it('a field inside a label that is the unit is never part of what is sent', () => {
    const label = h(
      'label',
      {},
      'メモ',
      h('span', { contenteditable: 'true' }, '下書きの文'),
      h('textarea', {}, '書きかけの返事'),
      h('select', {}, h('option', {}, '選んだ語')),
      h('input', { value: '入力した語' }),
    );
    page(label);
    const u = findUnit(textIn(label, 'メモ'), { context });
    expect(u.element).toBe(label);
    expect(said(u).join('')).toBe('メモ');
  });

  it('a field inside a paragraph is never part of its sentence', () => {
    const p = h(
      'p',
      {},
      '説明の文は',
      h('span', { contenteditable: 'plaintext-only' }, '私の下書き'),
      'ここで終わる。',
    );
    page(p);
    const u = findUnit(textIn(p, '説明'), { offset: 1, context });
    expect(said(u)).toEqual(['説明の文はここで終わる。']);
    expect(u.text).not.toMatch(/下書き/);
  });

  it('a list of suggestions (datalist options) is never read', () => {
    const p = h('p', {}, '候補：', h('datalist', {}, h('option', {}, '私の検索語')), '三つ。');
    page(p);
    expect(said(findUnit(textIn(p, '候補'), { offset: 0, context })).join('')).not.toMatch(
      /検索語/,
    );
  });

  it('tapping inside a field finds no unit, and nor does tapping text inside a field’s own label part', () => {
    const editable = h('div', { contenteditable: '' }, h('span', {}, '入力中'));
    page(editable);
    expect(findUnit(textIn(editable, '入力中'), { context })).toBe(null);
  });

  it('a selection read by the 読む chip leaves out a field it runs across', () => {
    const p = h(
      'p',
      {},
      '前の文。',
      h('span', { contenteditable: 'true' }, '下書き。'),
      '後の文。',
    );
    page(p);
    const range = {
      commonAncestorContainer: p,
      startContainer: textIn(p, '前の文'),
      startOffset: 0,
      endContainer: textIn(p, '後の文'),
      endOffset: 4,
      intersectsNode: () => true,
    };
    expect(rangeText(range)).toBe('前の文。後の文。');
  });

  it('what the learner wrote, shown as text, speaks on a tap and never from a resting pointer', () => {
    const mine = h('p', { class: 'chat-turn me' }, '昨日は雨でした。');
    const theirs = h('p', { class: 'chat-turn tutor' }, 'そうでしたか。');
    const said2 = h(
      'li',
      { class: 'speak-line', 'data-who': 'me' },
      h('span', { class: 'speak-said' }, '行きました。'),
    );
    const note = h('p', { class: 'record-note-segment' }, '覚えにくい語。');
    const marked = h('p', { 'data-ear-typed': '' }, '自分の文。');
    page(mine, theirs, said2, note, marked);
    for (const node of [mine, said2, note, marked])
      expect(findUnit(textIn(node, '。'), { offset: 0, context }).typed).toBe(true);
    expect(findUnit(textIn(theirs, 'そう'), { offset: 0, context }).typed).toBeFalsy();
    const { machine, calls, advance } = rig();
    const typed = { ...unit('昨日'), typed: true };
    machine.holdEar();
    machine.hover({ unit: typed, pointer: 'mouse' });
    advance(2000);
    expect(calls.speak).toHaveLength(0);
    expect(machine.click({ unit: typed, pointer: 'touch' })).toBe('consume');
    expect(calls.speak).toHaveLength(1);
  });
});

describe('the app’s own controls are never read as text', () => {
  it('a listen mark inside a sentence is masked, and the sentence’s place still lines up', () => {
    const p = h(
      'p',
      {},
      '雨が',
      h('button', { class: 'play-mark voice-say' }, '音'),
      '降っている。',
      h('button', {}, '聞く'),
      '晴れた。',
    );
    page(p);
    const u = findUnit(textIn(p, '降って'), { offset: 2, context });
    expect(said(u)).toEqual(['雨が降っている。']);
    expect(u.range).toMatchObject({
      startNode: textIn(p, '雨が'),
      startOffset: 0,
      endNode: textIn(p, '降って'),
      endOffset: 6,
    });
    const next = findUnit(textIn(p, '晴れた'), { offset: 0, context });
    expect(said(next)).toEqual(['晴れた。']);
    expect(next.range).toMatchObject({
      startNode: textIn(p, '晴れた'),
      startOffset: 0,
      endOffset: 4,
    });
  });

  it('a button inside a row is masked from the row’s word', () => {
    const word = h(
      'div',
      { class: 'word', role: 'button' },
      h('span', { class: 'base' }, '単なる'),
      h('button', { class: 'kp-listen' }, '音'),
    );
    page(word);
    const u = findUnit(textIn(word, '単なる'), { context });
    expect(said(u)).toEqual(['単なる']);
    expect(u.voiceKey).toBe('word:単なる');
  });

  it('the study card’s word: its reading, not the 音 button the voice layer puts beside it', () => {
    const card = h(
      'div',
      { class: 'kp-word' },
      h('span', { class: 'kp-term' }, '高学歴'),
      h('span', { class: 'kp-reading' }, 'こうがくれき'),
      h('span', { class: 'kp-pitch' }, '3'),
      h('span', { class: 'kp-badge' }, 'noun'),
      h('button', { id: 'kp-listen-word', class: 'kp-zoom-btn kp-listen' }, '音'),
    );
    page(card);
    for (const where of ['高学歴', 'こうがくれき']) {
      const u = findUnit(textIn(card, where), { offset: 0, context });
      expect(said(u)).toEqual(['こうがくれき']);
      expect(u.voiceKey).toBe('word:高学歴');
    }
  });

  it('a control tapped inside running text reads the sentence around it, without the control', () => {
    const p = h('p', {}, '今日は', h('button', { class: 'voice-say' }, '聞く'), '雨が降る。');
    page(p);
    expect(said(findUnit(textIn(p, '聞く'), { offset: 0, context }))).toEqual(['今日は雨が降る。']);
  });
});

describe('c. with the ear off and no Option key, a click is the app’s own', () => {
  const watched = (fields) => {
    const reads = [];
    const event = new Proxy(fields, {
      get(target, name) {
        reads.push(String(name));
        const value = target[name];
        if (typeof value === 'function')
          return () => {
            throw new Error(`the handler called ${String(name)}`);
          };
        return value;
      },
    });
    return { event, reads };
  };
  const quietMachine = () => {
    const machine = createEarMachine({
      speak: () => {
        throw new Error('spoke');
      },
      cannot: () => {
        throw new Error('asked');
      },
    });
    return new Proxy(machine, {
      get(target, name) {
        if (['display', 'mode', 'speaking', 'voice', 'reason'].includes(name)) return target[name];
        return () => {
          throw new Error(`the handler moved the ear: ${String(name)}`);
        };
      },
    });
  };
  it('reads only the Option key, finds no unit, prevents nothing, stops nothing', () => {
    const { event, reads } = watched({
      altKey: false,
      target: {},
      clientX: 10,
      clientY: 10,
      detail: 1,
      pointerType: 'mouse',
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {},
    });
    const verdict = earClick(event, {
      machine: quietMachine(),
      unitAt: () => {
        throw new Error('looked for a unit');
      },
      press: null,
      now: 0,
    });
    expect(verdict).toBe('pass');
    expect(reads).toEqual(['altKey']);
  });
  it('armed, a long press (the reader’s hold that saves a word) stays the app’s', () => {
    const machine = createEarMachine({
      speak: () => {
        throw new Error('spoke');
      },
      cannot: () => null,
    });
    machine.tapEar();
    const verdict = earClick(
      { altKey: false, target: {}, clientX: 5, clientY: 5, detail: 1, pointerType: 'touch' },
      { machine, unitAt: () => A, press: { at: 0, x: 5, y: 5, pointerType: 'touch' }, now: 650 },
    );
    expect(verdict).toBe('pass');
    expect(machine.display()).toBe('armed');
  });
  it('armed, a short tap on Japanese is the ear’s', () => {
    const spoken = [];
    const machine = createEarMachine({
      speak: (u) => {
        spoken.push(u.key);
        return { stop() {} };
      },
      cannot: () => null,
    });
    machine.tapEar();
    const verdict = earClick(
      { altKey: false, target: {}, clientX: 5, clientY: 5, detail: 1, pointerType: 'touch' },
      { machine, unitAt: () => A, press: { at: 0, x: 5, y: 5, pointerType: 'touch' }, now: 120 },
    );
    expect(verdict).toBe('consume');
    expect(spoken).toEqual(['雨']);
  });
});

describe('the mark’s words and look', () => {
  const ja = (j) => j;
  const en = (_j, e) => e;
  it('a name for assistive tools that says the state, in the interface language', () => {
    expect(earLabel('off', null, en)).toBe('ear: off');
    expect(earLabel('armed', null, en)).toBe('ear: armed for the next tap');
    expect(earLabel('held', null, en)).toBe('ear: on');
    expect(earLabel('speaking', null, en)).toBe('ear: speaking');
    expect(earLabel('novoice', 'not-paired', en)).toBe('ear: no voice, not paired');
    expect(earLabel('off', null, ja)).toMatch(/^耳/);
  });
  it('the no-voice line names the three reasons in plain words, in both languages', () => {
    expect(noVoiceLine('not-paired', ja)).toBe('声はまだつないでいません');
    expect(noVoiceLine('not-paired', en)).toMatch(/not paired/i);
    expect(noVoiceLine('offline', en)).toMatch(/no connection/i);
    expect(noVoiceLine('network-failed', en)).toMatch(/no connection/i);
    expect(noVoiceLine('day-budget', en)).toMatch(/today’s .*budget.* used up/i);
    expect(noVoiceLine('budget-exhausted', en)).toMatch(/budget.* used up/i);
  });
  it('colours come from the look; the text marks never move the layout', () => {
    expect(EAR_CSS).toMatch(/\.ear-mark/);
    expect(EAR_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(EAR_CSS).not.toMatch(/rgba?\(/i);
    const unitRules = EAR_CSS.split('}').filter((rule) => /data-ear-unit|::highlight/.test(rule));
    expect(unitRules.length).toBeGreaterThan(0);
    for (const rule of unitRules)
      expect(rule).not.toMatch(
        /(^|[;{\s])(padding|border|margin|font-size|line-height|letter-spacing|width|height)\s*:/,
      );
    expect(EAR_CSS).toMatch(/prefers-reduced-motion/);
  });
});
