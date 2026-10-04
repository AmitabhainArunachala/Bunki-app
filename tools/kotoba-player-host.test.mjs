/**
 * 集中道場 deck player: the host lexicon adapter (prototypes/corridor/decks/player/host.js).
 *
 * The corridor builds it from closures over its own lexicon and 覚える store; here the
 * closures are fakes, so the adapter's own rules are pinned: which token kinds resolve to
 * which entry, that a particle resolves to nothing, that take() always lands in 覚えるの札
 * and adds a named list only on top of it, and that open() hands the corridor its own node.
 */
import { describe, expect, it } from 'vitest';

import { TAKEN_LIST, createHost } from '../prototypes/corridor/decks/player/host.js';

function fakeCorridor() {
  const store = { taken: [], lists: { 経済: [] } };
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
    named: () => store.lists,
    capture(node, label, lists) {
      store.taken = [...store.taken, { t: node.t, id: node.id, label }];
      for (const n of lists)
        store.lists[n] = [...(store.lists[n] || []), { t: node.t, id: node.id }];
      return true;
    },
    addToList(node, label, name) {
      store.lists[name] = [...(store.lists[name] || []), { t: node.t, id: node.id }];
      return true;
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

  it('take: 覚えるの札 always, a named list on top; isTaken follows; a second take only adds the list', () => {
    const { host, store } = fakeCorridor();
    const word = host.lookup(tok('人口', '', 'じんこう', '語', '人口'));
    expect(host.lists()[0]).toEqual({ id: TAKEN_LIST, label: '覚えるの札', size: 0, always: true });
    expect(host.isTaken(word)).toBe(false);
    expect(host.take(word)).toBe(true);
    expect(host.isTaken(word)).toBe(true);
    expect(store.lists.経済).toEqual([]);
    expect(host.take(word, '経済')).toBe(true);
    expect(store.taken).toHaveLength(1);
    expect(store.lists.経済).toEqual([{ t: 'word', id: '人口' }]);
    expect(host.lists().map((l) => `${l.id}=${l.size}`)).toEqual([`${TAKEN_LIST}=1`, '経済=1']);
    expect(host.take(null)).toBe(false);
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
