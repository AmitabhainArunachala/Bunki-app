/** Pure frozen-content binding builder. Production inventory counts stay pinned;
 * small reviewed source excerpts can exercise this same builder in CI. */
export function buildSharedStudyBinding({registry,catalog,packs,source,grammarAssets,expected={tasks:8508,vocabulary:7930}}) {
const cards = new Map();
for (const [id, pack] of Object.entries(packs)) for (const word of pack.deck.words) for (const card of word.cards) {
  const key = JSON.stringify([id, card.id]);
  if (cards.has(key)) throw Error('Duplicate pack identity');
  cards.set(key, {word, card});
}
const tasks = new Map(registry.tasks.map(t => [t.taskKey, t]));
const notes = new Map(registry.notes.map(n => [n.noteGuid, n]));
const passages = new Map([...registry.passages.map(p => [p.passageId, p]), ...registry.examples.map(p => [p.exampleId, p])]);
const seen = new Set(), bound = new Set(), rows = [], grammar = [], presentation = [];
for (const entry of catalog) {
  const task = tasks.get(entry.taskKey), passage = passages.get(entry.passageId);
  if (!task || seen.has(entry.taskKey) || entry.taskKey !== JSON.stringify([entry.noteGuid, entry.contractId, entry.passageId]) ||
      ['noteGuid', 'contractId', 'passageId'].some(k => task[k] !== entry[k]) || entry.contentRevision !== passage?.sourceJaSha256) throw Error('Frozen task or content revision mismatch');
  seen.add(entry.taskKey);
  const module = notes.get(task.noteGuid)?.module || task.player?.deckId || 'grammar';
  if (module !== entry.module || task.group !== undefined) throw Error('Unmapped module/group policy');
  const binding = task.player;
  if (entry.contractId === 'vocabulary.read.v1') {
    if (JSON.stringify(binding) !== JSON.stringify(entry.player)) throw Error('Changed player identity');
    const key = JSON.stringify([binding.deckId, binding.cardId]), hit = cards.get(key);
    if (!hit || bound.has(key) || hit.word.id !== binding.wordId) throw Error('Missing or duplicate frozen pack card');
    for (const [field, value] of Object.entries({ja: hit.card.ja, en: hit.card.en, form: hit.card.form, term: hit.word.term, reading: hit.word.reading})) {
      if (entry[field] !== value) throw Error(`Pack content differs: ${key} ${field}`);
    }
    bound.add(key);
    // Carry all canonical card details that are not already supplied by the
    // adopted pack. This includes usage, word class and provenance; no dictionary.
    if(JSON.stringify(entry.rubySegments)!==JSON.stringify(hit.card.ruby))throw Error('Canonical passage readings differ from pack');
    presentation.push(Object.fromEntries(Object.entries(entry).filter(([key])=>['meaning','defJa','pos','posClass','note','source','collocations','theme','kanji'].includes(key))));
  } else {
    if (!['grammar.meaning.v1', 'grammar.cloze.v1'].includes(entry.contractId) || binding !== null) throw Error('Unsupported contract binding');
    const span = passage.clozeSpan;
    if (span?.unit !== 'unicode-codepoint' || [...entry.ja].slice(span.start,span.end).join('') !== entry.form) throw Error('Frozen grammar target mismatch');
    grammar.push({...Object.fromEntries(['taskKey','term','form','reading','meaning','defJa','ja','en','grammarGuid'].map(k => [k, entry[k] ?? ''])),targetSpan:span});
  }
  // Tuple fields are documented by the decoder; no task identity is re-hashed.
  rows.push([task.noteGuid, task.contractId, task.passageId, task.lexemeId, module, passage.sourceJaSha256,
    ...(binding ? [binding.deckId, binding.wordId, binding.cardId] : [])]);
}
if (seen.size !== tasks.size || bound.size !== cards.size || rows.length !== expected.tasks || bound.size !== expected.vocabulary) throw Error('Incomplete frozen inventory');
const manifest = {format:'bunki-shared-content/v1', source,
  packs:Object.fromEntries(Object.entries(packs).map(([id,pack])=>[id,{sha256:pack.sha256,cards:[...cards.keys()].filter(k=>JSON.parse(k)[0]===id).length}])),
  counts:{tasks:rows.length,vocabulary:bound.size,grammar:grammar.length}, rows, grammar, presentation};
manifest.grammarAssets=grammarAssets;
return manifest;
}
