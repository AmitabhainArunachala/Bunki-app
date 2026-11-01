/** Bunki presentation content bound to the standalone's frozen task identities. */
export const SHARED_DECKS = Object.freeze(['n2', 'n1', 'senmon', 'kotoba-master']);
export const isSharedDeck = id => SHARED_DECKS.includes(id);

export function decodeSharedContent(binding, decks, pin) {
  if (binding?.format !== 'bunki-shared-content/v1' || !Array.isArray(binding.rows)) throw Error('shared-content-format');
  const registry = {tasks:[],notes:[],passages:[]}, catalog = [], seen = new Set(), seenNotes = new Set();
  const cards = new Map();
  for (const id of SHARED_DECKS) {
    const deck = decks[id];
    if (!deck || deck.id !== id) throw Error('shared-pack-missing');
    for (const word of deck.words) for (const card of word.cards) {
      const key = JSON.stringify([id,card.id]);
      if (cards.has(key)) throw Error('shared-pack-duplicate');
      cards.set(key,{word,card});
    }
  }
  const grammar = new Map(binding.grammar.map(entry => [entry.taskKey,entry]));
  let vocabularyIndex=0;
  for (const row of binding.rows) {
    const [noteGuid,contractId,passageId,lexemeId,module,contentRevision,deckId,wordId,cardId] = row;
    if (![6,9].includes(row.length) || typeof contentRevision !== 'string' || !/^[a-f0-9]{64}$/.test(contentRevision)) throw Error('shared-binding-row');
    const taskKey = JSON.stringify([noteGuid,contractId,passageId]);
    if (seen.has(taskKey)) throw Error('shared-task-duplicate');
    seen.add(taskKey);
    const player = deckId ? {deckId,wordId,cardId} : null;
    const task = {taskKey,noteGuid,contractId,passageId,lexemeId,player};
    registry.tasks.push(task);
    registry.passages.push({passageId,sourceJaSha256:contentRevision});
    if (!seenNotes.has(noteGuid)) { registry.notes.push({noteGuid,module}); seenNotes.add(noteGuid); }
    let fields;
    if (contractId === 'vocabulary.read.v1') {
      const hit = cards.get(JSON.stringify([deckId,cardId]));
      if (!hit || hit.word.id !== wordId || passageId !== cardId) throw Error('shared-card-identity');
      const {word,card} = hit;
      fields = {...binding.presentation[vocabularyIndex++],term:word.term,reading:word.reading,form:card.form,ja:card.ja,en:card.en,rubySegments:card.ruby};
    } else {
      fields = grammar.get(taskKey);
      if (!fields || player || !['grammar.meaning.v1','grammar.cloze.v1'].includes(contractId)) throw Error('shared-contract-unmapped');
    }
    if (![fields.ja,fields.en].every(v=>typeof v==='string'&&v.trim())) throw Error('shared-content-incomplete');
    catalog.push({...task,...fields,module,contentRevision,contentReady:true});
  }
  if (catalog.length !== binding.counts.tasks || catalog.filter(e=>e.player).length !== cards.size) throw Error('shared-inventory-mismatch');
  return {registry,catalog,pin};
}

export async function loadSharedContent({fetcher=globalThis.fetch}={}) {
  const json = async (path, expected) => {
    const response = await fetcher(new URL(path,import.meta.url));
    if (!response.ok) throw Error('shared-content-unavailable');
    const bytes = await response.arrayBuffer();
    if (expected) {
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if (digest !== expected) throw Error('shared-pack-hash-mismatch');
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  };
  const binding = await json('./data/shared-study-content.json');
  const [pin,...packs] = await Promise.all([json('./vendor/shared-study-engine/client/vendor/fsrs-pin.json'),
    ...SHARED_DECKS.map(id=>json(`./decks/${id}/deck.json`,binding.packs[id]?.sha256))]);
  return {content:decodeSharedContent(binding,Object.fromEntries(SHARED_DECKS.map((id,i)=>[id,packs[i]])),pin),binding};
}
