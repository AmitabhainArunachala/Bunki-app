/**
 * The deck player's front, pinned at the unit level (CARD_CONTRACT_V2 §2, STANDARD A26/A37):
 * sentenceNodes(card, { front: true }) — what studyScreen puts on every front — yields the
 * passage and nothing else. No reading (no <ruby>, no <rt>, no reading text), no English or
 * other added text, no button, link or listener, for every card of both shipped decks, in
 * 読んで思い出す (the target marked) and in 穴埋め (the target blanked). The back's 焦点 groups
 * (clamp) keep every sentence and its order.
 *
 * mount.js runs in a browser; here it gets a few-line stand-in for document (createElement,
 * createTextNode, append), and the vendored ts-fsrs with the pinned parameters as its globals.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import * as fsrsApi from '../prototypes/corridor/vendor/ts-fsrs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '../prototypes/corridor');
const readJson = (rel) => JSON.parse(readFileSync(resolve(CORRIDOR, rel), 'utf8'));

class Text {
  constructor(data) {
    this.nodeType = 3;
    this.data = String(data);
  }
  get textContent() {
    return this.data;
  }
}
class Element {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.className = '';
    this.dataset = {};
    this.attributes = {};
    this.listeners = 0;
  }
  /** as the DOM does: a node appended here leaves its old parent */
  #adopt(kids) {
    return kids.map((k) => {
      const node = typeof k === 'string' ? new Text(k) : k;
      if (node.parentNode)
        node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
      node.parentNode = this;
      return node;
    });
  }
  append(...kids) {
    this.childNodes.push(...this.#adopt(kids));
  }
  prepend(...kids) {
    this.childNodes.unshift(...this.#adopt(kids));
  }
  get children() {
    return this.childNodes.filter((n) => n.nodeType === 1);
  }
  get textContent() {
    return this.childNodes.map((n) => n.textContent).join('');
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  addEventListener() {
    this.listeners++;
  }
  /** this element and every element under it */
  all() {
    return [this, ...this.children.flatMap((n) => n.all())];
  }
}

let sentenceNodes;
beforeAll(async () => {
  globalThis.window = {
    __TSFSRS__: fsrsApi,
    __CORRIDOR_BUNDLE__: { 'fsrs-pin': readJson('data/fsrs-pin.json') },
  };
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => new Text(text),
  };
  ({ sentenceNodes } = await import('../prototypes/corridor/decks/player/mount.js'));
});

const decks = [readJson('decks/kotoba-mcd/deck.json'), readJson('decks/kotoba-mine/deck.json')];
const cards = decks.flatMap((d) => d.words.flatMap((w) => w.cards.map((c) => ({ deck: d.id, c }))));

/** what a front may say: the passage, the target either as written or as a blank */
function frontProblems(node, card, blank) {
  const out = [];
  const els = node.all();
  const tags = new Set(els.map((n) => n.tagName));
  for (const tag of ['RUBY', 'RT', 'RP', 'BUTTON', 'A', 'INPUT', 'DETAILS'])
    if (tags.has(tag)) out.push(`has <${tag.toLowerCase()}>`);
  if (els.some((n) => n.listeners)) out.push('has a listener');
  if (els.some((n) => n.attributes.role || n.attributes.tabindex != null || n.attributes.href))
    out.push('has a tap target');
  if (els.some((n) => n.lang && n.lang !== 'ja')) out.push('has non-Japanese text');
  if (els.some((n) => /kp-(ctx|more|tapword)/.test(n.className))) out.push('has a back-only part');
  const text = node.textContent;
  if (!blank && text !== card.ja) out.push(`text is not the passage: ${text.slice(0, 30)}`);
  if (blank) {
    // the passage's own text, with each marked segment a blank: full-width spaces, or on a 字
    // card its 〔reading〕
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const want = card.ruby
      .map((seg) =>
        seg.length > 2 && (seg[2] === 1 || seg[2] === 3) ? '(?:　+|〔[ぁ-ゖー]+〕)' : esc(seg[0]),
      )
      .join('');
    if (!new RegExp(`^${want}$`).test(text))
      out.push(`text is not the blanked passage: ${text.slice(0, 30)}`);
  }
  return out;
}

describe('kotoba player: the front is the passage and nothing else (unit pin)', () => {
  it('covers both shipped decks', () => {
    expect(decks.map((d) => d.id)).toEqual(['kotoba-mcd', 'kotoba-mine']);
    expect(cards.length).toBeGreaterThan(1900);
  });

  for (const [label, blank] of [
    ['読んで思い出す (target marked)', false],
    ['穴埋め (target blanked)', true],
  ]) {
    it(`${label}: no reading, no English or other added text, no button or link, every card`, () => {
      const bad = [];
      for (const { deck, c } of cards) {
        const node = sentenceNodes(c, { front: true, blank, split: !!c.type });
        const problems = frontProblems(node, c, blank);
        if (problems.length) bad.push(`${deck} ${c.id}: ${problems.join('; ')}`);
      }
      expect(bad.slice(0, 5)).toEqual([]);
    });
  }

  it('front: true wins over a ruby or clamp option passed with it', () => {
    const { c } = cards.find((x) => x.c.type === 'word' && x.c.ruby.some((seg) => seg[1]));
    const node = sentenceNodes(c, { front: true, ruby: 'all', clamp: true, split: true });
    expect(frontProblems(node, c, false)).toEqual([]);
  });

  it('the back reads every kanji, and its 焦点 groups keep every sentence in order around the target', () => {
    const bad = [];
    for (const { c } of cards.filter((x) => x.c.type)) {
      const node = sentenceNodes(c, { split: true, clamp: true });
      const sentences = node.all().filter((n) => n.className === 'kp-s');
      const plain = sentences.map(strip).join('');
      const focus = sentences.filter((n) => n.dataset.focus);
      const groups = node.children
        .filter((n) => n.className === 'kp-ctx')
        .map((n) => n.dataset.side);
      if (plain !== c.ja || focus.length !== 1 || !node.all().some((n) => n.tagName === 'RT'))
        bad.push(`${c.id}: ${plain.slice(0, 30)}`);
      if (sentences.length > 1 && !groups.length) bad.push(`${c.id}: no groups`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

/** a node's text without its readings */
function strip(n) {
  return n.childNodes
    .map((k) => (k.nodeType === 3 ? k.data : k.tagName === 'RT' ? '' : strip(k)))
    .join('');
}
