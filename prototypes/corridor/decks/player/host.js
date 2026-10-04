/**
 * 集中道場 deck player — the host lexicon adapter (learning-design §3, integration §1 A2).
 *
 * The player cannot reach into corridor.js (its lexicon, entry sheets and 覚える store are
 * module-private), so the corridor builds one adapter from closures over its own functions
 * and passes it as render(main, { host }). The standalone study pages pass none: their
 * adapter is null, and they show furigana only.
 *
 *   const host = createHost(deps);
 *   host.lookup(token)        → entry | null    a decoded card token (engine cardTokens)
 *   host.open(entry)          → void            the corridor's own entry sheet
 *   host.isTaken(entry)       → boolean         already in 覚えるの札
 *   host.take(entry, listId)  → boolean         覚えるの札 (TAKEN_LIST) or a named list; false when not saved
 *   host.lists()              → [{ id, label, size, always? }]
 *
 * An entry is { t: 'word' | 'kanji' | 'grammar', id, label, reading, gloss, ja, en, level?, seq?, token }:
 * t and id are the corridor's node, so open() and take() address the same row its reader does.
 * ja is the Japanese the corridor holds for it (a kanji's 音・訓, a grammar point's 意味; '' for a
 * word: its dictionary is JMdict, English only) and en its English (the first senses, a kanji's
 * meaning, a grammar point's mEn); the deck player's entry sheet shows ja and keeps en behind a tap.
 * open() also takes a bare node { t, id, label? } (the back's 文法 links pass one).
 *
 * deps, all from the corridor:
 *   word(id, reading)     its lookup(): the boot core, the opened deep tier, the 覚える snapshots
 *   kanji(glyph)          a kanji.json record
 *   grammar(id, pattern)  a grammar entry by id, else by pattern
 *   open(node)            push an entry sheet
 *   taken()               the 覚えるの札 rows
 *   named()               the named lists, { name: rows }
 *   capture(node, label, lists)   the guarded commit 保存する runs (always 覚えるの札, plus lists)
 *   addToList(node, label, name)  put an already-taken item on a named list
 *
 * A tap here is capture, never evidence: nothing in this adapter writes the observation log or
 * any schedule, and take() never enrols the word in the deck the card belongs to.
 */

/** the id lists() gives 覚えるの札, which every take() writes to */
export const TAKEN_LIST = '@taken';

const KANA_ONLY = /^[぀-ヿー]+$/;
const kataToHira = (s) => String(s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

function wordEntry(deps, token) {
  // the build's ref is a boot-core head; the lemma and the surface are the reader's own keys
  for (const id of [...new Set([token.ref, token.b, token.s].filter(Boolean))]) {
    if (token.k !== '語' && id === token.s && KANA_ONLY.test(id)) continue; // a bare particle is not a word entry
    const rec = deps.word(id, token.r || '');
    if (rec) {
      return {
        t: 'word',
        id,
        label: rec.head || id,
        reading: rec.r || '',
        gloss: rec.m?.[0] || '',
        ja: '',
        en: (rec.m || []).slice(0, 3).join('; '),
        ...(rec.jlpt ? { level: `N${String(rec.jlpt).replace(/^N/i, '')}` } : {}),
        ...(rec.seq ? { seq: rec.seq } : {}),
        token,
      };
    }
  }
  return null;
}

function kanjiEntry(deps, token) {
  const glyph = token.ref || token.s;
  const rec = deps.kanji(glyph);
  if (!rec) return null;
  const reading = token.r || kataToHira(rec.on?.[0]) || (rec.kun?.[0] || '').split('.')[0];
  const on = (rec.on || []).slice(0, 3).join('・');
  const kun = (rec.kun || []).slice(0, 3).map((k) => String(k).replace('.', '-')).join('・');
  const ja = [on && `音 ${on}`, kun && `訓 ${kun}`].filter(Boolean).join('　');
  return { t: 'kanji', id: glyph, label: glyph, reading, gloss: String(rec.m || '').toLowerCase(), ja, en: String(rec.m || '').toLowerCase(), token };
}

function grammarEntry(deps, token) {
  const g = deps.grammar(token.ref, token.p || '');
  if (!g) return null;
  const ja = [g.mJa, g.form].filter(Boolean).join('　');
  return { t: 'grammar', id: g.id, label: g.p || g.id, reading: '', gloss: g.mJa || g.mEn || '', ja, en: g.mEn || '', ...(g.lv ? { level: g.lv } : {}), token };
}

function nodeOf(entry, deps) {
  if (entry.t === 'grammar') {
    // a deck names grammar-v11 ids; the corridor may hold the same pattern under its own id
    const g = deps.grammar(entry.id, entry.label || '');
    return { t: 'grammar', id: g?.id || entry.id };
  }
  if (entry.t !== 'word') return { t: entry.t, id: entry.id };
  return { t: 'word', id: entry.id, ...(entry.seq ? { seq: entry.seq } : {}), ...(entry.reading ? { reading: entry.reading } : {}) };
}

export function createHost(deps) {
  const taken = (entry) => (deps.taken() || []).some((row) => row.t === entry?.t && row.id === entry?.id);
  return {
    name: 'corridor',
    lookup(token) {
      if (!token?.s) return null;
      if (token.k === '文法') return grammarEntry(deps, token) || wordEntry(deps, token);
      if (token.k === '字') return kanjiEntry(deps, token);
      if (token.k === '語') return wordEntry(deps, token) || (token.s.length === 1 ? kanjiEntry(deps, { ...token, ref: token.s }) : null);
      return null; // particles, endings, punctuation: nothing to open
    },
    open(entry) {
      if (entry?.t && entry.id) deps.open(nodeOf(entry, deps));
    },
    isTaken: taken,
    take(entry, listId = TAKEN_LIST) {
      if (!entry?.t || !entry.id) return false;
      const lists = listId && listId !== TAKEN_LIST ? [String(listId)] : [];
      if (!taken(entry)) return !!deps.capture(nodeOf(entry, deps), entry.label || entry.id, lists);
      return lists.length ? !!deps.addToList(nodeOf(entry, deps), entry.label || entry.id, lists[0]) : true;
    },
    lists() {
      const named = deps.named() || {};
      return [
        { id: TAKEN_LIST, label: '覚えるの札', size: (deps.taken() || []).length, always: true },
        ...Object.keys(named).map((name) => ({ id: name, label: name, size: (named[name] || []).length })),
      ];
    },
  };
}
