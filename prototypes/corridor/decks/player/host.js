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
 *   host.take(entry)          → Promise<boolean> the corridor's one-tap save into 覚えるの札 (no chooser;
 *                                                the corridor shows its Saved toast with 元に戻す); false
 *                                                when not saved
 *   host.addToList(entry, invoker, { menu, onChange }?) → void   the corridor's list popover for a word
 *                                                already saved; with menu, Save ▾'s whole menu (its lists,
 *                                                copy, remove from review), onChange after a removal
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
 *   component?(glyph)    an available existing radical node, else kanji node, else null
 *   grammar(id, pattern)  a grammar entry by id, else by pattern
 *   open(node)            push an entry sheet
 *   taken()               the 覚えるの札 rows
 *   capture(node, label)  the corridor's one-tap save (toggleWordSave, bound to the dictionary
 *                         visit and the shared review pool); resolves true when the row is written
 *   addToList(node, label, invoker, options)  open the corridor's list popover (or Save ▾ menu) for a saved item
 *
 * A tap here is capture, never evidence: nothing in this adapter writes the observation log or
 * any schedule, and take() never enrols the word in the deck the card belongs to.
 */

const KANA_ONLY = /^[぀-ヿー]+$/;
const kataToHira = (s) => String(s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

function wordEntry(deps, token) {
  // R · reading truth: the reading this card's text gives the word for its dictionary form (an uninflected token's
  // own; an inflected surface's says nothing about it). The host's lookup answers with the entry read that way
  const own = !token.b || token.b === token.s ? token.r || '' : '';
  // the build's ref is a boot-core head; the lemma and the surface are the reader's own keys
  for (const id of [...new Set([token.ref, token.b, token.s].filter(Boolean))]) {
    if (token.k !== '語' && id === token.s && KANA_ONLY.test(id)) continue; // a bare particle is not a word entry
    const rec = deps.word(id, own);
    if (rec) {
      // an entry read otherwise (none read the text's way is at hand yet) lends the card neither its reading, its
      // English nor its number: the card shows the text's reading, and the corridor holds Save until it is known
      const readsAsText = !own || kataToHira(rec.r) === kataToHira(own);
      return {
        t: 'word',
        id,
        label: rec.head || id,
        reading: readsAsText ? rec.r || '' : own,
        gloss: readsAsText ? rec.m?.[0] || '' : '',
        ja: '',
        en: readsAsText ? (rec.m || []).slice(0, 3).join('; ') : '',
        ...(rec.jlpt ? { level: `N${String(rec.jlpt).replace(/^N/i, '')}` } : {}),
        ...(readsAsText && rec.seq ? { seq: rec.seq } : {}),
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
      if (token.k === '部品') {
        const node = deps.component?.(token.s);
        return node ? { ...node, label: token.s, token } : null;
      }
      if (token.k === '文法') return grammarEntry(deps, token) || wordEntry(deps, token);
      if (token.k === '字') return kanjiEntry(deps, token);
      if (token.k === '語') return wordEntry(deps, token) || (token.s.length === 1 ? kanjiEntry(deps, { ...token, ref: token.s }) : null);
      return null; // particles, endings, punctuation: nothing to open
    },
    open(entry) {
      if (entry?.t && entry.id) deps.open(nodeOf(entry, deps));
    },
    isTaken: taken,
    async take(entry) {
      if (!entry?.t || !entry.id) return false;
      if (taken(entry)) return true;
      return !!(await deps.capture(nodeOf(entry, deps), entry.label || entry.id));
    },
    addToList(entry, invoker, options = {}) {
      if (!entry?.t || !entry.id || !taken(entry) || typeof deps.addToList !== 'function') return;
      deps.addToList(nodeOf(entry, deps), entry.label || entry.id, invoker, options);
    },
    /** The card back's tap (the one-hand pass, contract §1): the corridor's one slip beside the tapped word.
     * frame is what the player shows for the tap (frameOf): a word of this deck (frame.word), a host entry
     * (frame.entry), or neither (a spelling the dictionary lacks: the deck's own sense, no door, no Save).
     * The deck's own word says it is already in the deck where Save would stand, and its band opens the
     * dictionary's entry when the dictionary has it. Save goes through the corridor's one path on the node,
     * the path take() wraps. english: show the English sense under the Japanese one.
     * 'opened' | 'dived' (this tap was the second on the word: the slip went into the entry) | false. */
    openSlip(frame, anchor, { english = false, onClose = null } = {}) {
      if (typeof deps.openSlip !== 'function' || !frame || !anchor) return false;
      const entry = frame.entry || (frame.word
        ? wordEntry(deps, { s: frame.word.term, ref: frame.word.term, r: frame.word.reading || '', k: '語' })
        : null);
      const node = entry ? nodeOf(entry, deps) : null;
      const look = {
        label: frame.label, reading: frame.reading || '', surface: frame.surface || frame.label,
        ...(frame.ja ? { gloss: frame.ja, glossLang: 'ja', ...(english && frame.en ? { gloss2: frame.en } : {}) }
          : frame.en ? { gloss: frame.en, glossLang: 'en' } : {}),
      };
      const before = !!deps.slipOpen?.();
      const slip = deps.openSlip(node, {
        anchor, from: 'deck', look, key: frame.key || '', onClose,
        ...(frame.word ? { note: deps.inDeckNote?.() || 'このデッキにあります' } : {}),
      });
      if (slip) return 'opened';
      return before && !deps.slipOpen?.() ? 'dived' : false;
    },
    slipOpen() {
      return !!deps.slipOpen?.();
    },
    closeSlip() {
      deps.closeSlip?.();
    },
  };
}
