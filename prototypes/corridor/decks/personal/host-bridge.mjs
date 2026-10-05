/** Private reader adapter. Text stays in this document; only packaged Bunki
 * assets are loaded. The host owns sheets, capture, lists and learner writes. */
export function createHostBridge(host) {
  let opening;
  const allowed = options => typeof options?.canInteract === 'function' && options.canInteract() === true;
  const requireAccess = options => {
    if (!allowed(options)) throw new Error('Reveal the answer before opening the dictionary.');
  };
  async function ready(options) {
    requireAccess(options);
    opening ||= host.load().catch(error => { opening = null; throw error; });
    await opening;
    requireAccess(options);
  }
  const normal = value => String(value || '').replace(/[〜～\s（）()]/g, '');
  function grammarNode(value) {
    const key = normal(value);
    const entry = host.grammars().find(g => g.id === value || normal(g.p) === key ||
      String(g.p).split(/[／/]/).some(part => normal(part) === key));
    return entry ? {t:'grammar',id:entry.id} : null;
  }
  function nodeFor(surface, lemma = surface) {
    const particle = host.particles().find(p => p.p === surface);
    if (particle && lemma === surface) return {t:'particle',id:particle.id};
    if (host.lookup(lemma)) return {t:'word',id:lemma};
    if (lemma !== surface && host.lookup(surface)) return {t:'word',id:surface};
    if ([...surface].length === 1 && host.kanji(surface)) return {t:'kanji',id:surface};
    // Unknown forms still have an honest host entry and the local full-index
    // lookup. Do not manufacture a reading or claim morphological certainty.
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(surface)
      ? {t:'word',id:lemma} : null;
  }
  return {
    async prepareLesson(lesson, options) {
      await ready(options);
      const text = String(lesson.ja || '');
      const authored = Array.isArray(lesson.segments) && lesson.segments.map(s => s.text).join('') === text;
      const raw = authored ? lesson.segments : typeof Intl.Segmenter === 'function'
        ? [...new Intl.Segmenter('ja',{granularity:'word'}).segment(text)].map(s => ({text:s.segment}))
        : [...text].map(text => ({text}));
      let offset = 0;
      const segments = raw.map(part => {
        const surface = part.text, start = offset;
        offset += surface.length;
        const base = part.lemma || host.baseFor(surface) || surface;
        let node = nodeFor(surface,base);
        if (node?.t === 'word' && node.id === surface && part.reading) node = {...node,reading:part.reading};
        return {text:surface,surface,start,end:offset,base,kind:node?.t || 'text',node,
          ...(part.reading ? {reading:part.reading} : {}),
          resolved: !!(node && (node.t !== 'word' || host.lookup(node.id)))};
      });
      const grammar = [];
      const focus = grammarNode(lesson.grammar);
      if (focus) grammar.push({label:lesson.grammar,node:focus});
      // Pattern matches are navigation suggestions, not an automatic grammar
      // assessment. Prefer the curated focus and never rewrite its explanation.
      for (const g of host.grammars()) {
        for (const part of String(g.p).split(/[／/]/)) {
          const literal = normal(part);
          if (literal.length < 2 || !text.includes(literal) || grammar.some(x => x.node.id === g.id)) continue;
          grammar.push({label:g.p,node:{t:'grammar',id:g.id}});
        }
      }
      const kanji = [...new Set([...text].filter(c => host.kanji(c)))].map(label => ({label,node:{t:'kanji',id:label}}));
      const unresolved = segments.filter(s => s.node?.t === 'word' && !s.resolved).length;
      return {segments,grammar,kanji,coverage:{unresolved,authored},notice: authored
        ? 'Readings follow the reviewed paragraph. Dictionary entries open on this device.'
        : 'Word boundaries use this device’s segmenter. Some forms may need a dictionary search; readings are not guessed.'};
    },
    async lookup(input, options) {
      await ready(options);
      let node = input?.t ? {...input} : input?.kind === 'grammar' ? grammarNode(input.grammarKey || input.text)
        : input?.kind === 'kanji' ? {t:'kanji',id:input.text} : nodeFor(input?.text || '',input?.lemma || input?.text || '');
      if (!node) throw new Error('This grammar pattern is not in Bunki’s packaged dictionary. The paragraph explanation remains available.');
      // Only canonical entry identity crosses into the shared learner store.
      // Neither the private paragraph nor its reviewed answer is persisted there.
      node = {t:node.t,id:node.id,...(node.reading ? {reading:node.reading} : {})};
      requireAccess(options);
      return host.open(node,options);
    },
    close() { host.close(); },
  };
}
