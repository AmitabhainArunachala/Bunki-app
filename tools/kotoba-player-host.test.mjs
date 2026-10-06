/**
 * 集中道場 deck player: the host lexicon adapter (prototypes/corridor/decks/player/host.js).
 *
 * The corridor builds it from closures over its own lexicon and 覚える store; here the
 * closures are fakes, so the adapter's own rules are pinned: which token kinds resolve to
 * which entry, that a particle resolves to nothing, that take() is the corridor's one-tap save
 * into 覚えるの札 (no chooser, no list argument, never a second write for a saved row), that
 * addToList() hands a saved item to the corridor's list popover, and that open() hands the
 * corridor its own node.
 */
import { describe, expect, it } from 'vitest';

import { createHost } from '../prototypes/corridor/decks/player/host.js';

function fakeCorridor() {
  const store = { taken: [], captures: 0, popovers: [] };
  const opened = [];
  const dict = {
    減る: { head: '減る', r: 'へる', m: ['to decrease'], jlpt: 3 },
    人口: { head: '人口', r: 'じんこう', m: ['population'] },
  };
  const grammar = [{ id: 'teiru', p: '〜ている', lv: 'N5', mEn: 'ongoing', mJa: '継続' }];
  const norm = (p) => p.replace(/[〜～\s]/g, '');
  const deps = {
    word: (id) => dict[id] || null,
    kanji: (g) => ({ 館: { on: ['カン'], kun: ['やかた'], m: 'Building' } })[g] || null,
    grammar: (id, p) =>
      grammar.find((g) => g.id === id) || grammar.find((g) => p && norm(g.p) === norm(p)) || null,
    open: (node) => opened.push(node),
    taken: () => store.taken,
    async capture(node, label) {
      store.captures += 1;
      store.taken = [...store.taken, { t: node.t, id: node.id, label }];
      return true;
    },
    addToList(node, label, invoker) {
      store.popovers.push({ t: node.t, id: node.id, label, invoker });
    },
  };
  return { host: createHost(deps), store, opened };
}

const tok = (s, b, r, k, ref, p) => ({
  s,
  b: b || s,
  r: r || '',
  k,
  ref: ref || null,
  at: 0,
  ...(p ? { p } : {}),
});

describe('host adapter', () => {
  it('lookup: 語 by ref then lemma, 字 from the kanji table, 文法 by id or pattern; other is null', () => {
    const { host } = fakeCorridor();
    const word = host.lookup(tok('減り', '減る', 'へり', '語', '減る'));
    expect(word).toMatchObject({
      t: 'word',
      id: '減る',
      label: '減る',
      reading: 'へる',
      gloss: 'to decrease',
      level: 'N3',
    });
    expect(host.lookup(tok('減っ', '減る', 'へっ', '語', null))).toMatchObject({
      t: 'word',
      id: '減る',
    });
    expect(host.lookup(tok('館', '', 'かん', '字', '館'))).toMatchObject({
      t: 'kanji',
      id: '館',
      reading: 'かん',
      gloss: 'building',
    });
    expect(host.lookup(tok('いる', '', '', '文法', 'n5-teiru', '〜ている'))).toMatchObject({
      t: 'grammar',
      id: 'teiru',
      label: '〜ている',
    });
    // what the deck player's entry sheet shows: the Japanese the corridor holds, English apart
    expect(host.lookup(tok('人口', '', 'じんこう', '語', '人口'))).toMatchObject({
      ja: '',
      en: 'population',
    });
    expect(host.lookup(tok('館', '', 'かん', '字', '館'))).toMatchObject({
      ja: '音 カン　訓 やかた',
      en: 'building',
    });
    expect(host.lookup(tok('いる', '', '', '文法', 'teiru'))).toMatchObject({
      ja: '継続',
      en: 'ongoing',
    });
    expect(host.lookup(tok('が', '', '', 'other'))).toBeNull();
    expect(host.lookup(tok('無い語', '', 'ないご', '語', null))).toBeNull();
    expect(host.lookup(null)).toBeNull();
  });

  it('take: one tap through the corridor save into 覚えるの札; isTaken follows; a saved row is not written again', async () => {
    const { host, store } = fakeCorridor();
    const word = host.lookup(tok('人口', '', 'じんこう', '語', '人口'));
    expect(host.lists).toBeUndefined();
    expect(host.isTaken(word)).toBe(false);
    host.addToList(word, 'invoker');
    expect(store.popovers).toEqual([]);
    await expect(host.take(word)).resolves.toBe(true);
    expect(host.isTaken(word)).toBe(true);
    await expect(host.take(word)).resolves.toBe(true);
    expect(store.captures).toBe(1);
    expect(store.taken).toEqual([{ t: 'word', id: '人口', label: '人口' }]);
    host.addToList(word, 'invoker');
    expect(store.popovers).toEqual([{ t: 'word', id: '人口', label: '人口', invoker: 'invoker' }]);
    await expect(host.take(null)).resolves.toBe(false);
  });

  it('open: hands the corridor its own node — the word with its reading, the grammar point under the corridor id', () => {
    const { host, opened } = fakeCorridor();
    host.open(host.lookup(tok('減り', '減る', 'へり', '語', '減る')));
    host.open({ t: 'grammar', id: 'n5-teiru', label: '〜ている' });
    host.open(null);
    expect(opened).toEqual([
      { t: 'word', id: '減る', reading: 'へる' },
      { t: 'grammar', id: 'teiru' },
    ]);
  });
});
