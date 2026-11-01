#!/usr/bin/env node
/** Generate frozen identity bindings, never infer identity from current text. */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), source = args[args.indexOf('--source') + 1];
if (!args.includes('--source') || !source) throw Error('Usage: --source /reviewed/content-directory [--check]');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const registry = read(resolve(source, 'registry.json')), catalog = read(resolve(source, 'catalog.json'));
const deckIds = ['n2', 'n1', 'senmon', 'kotoba-master'];
const packPaths = Object.fromEntries(deckIds.map(id => [id, resolve(repo, `prototypes/corridor/decks/${id}/deck.json`)]));
const cards = new Map();
for (const [id, path] of Object.entries(packPaths)) for (const word of read(path).words) for (const card of word.cards) {
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
if (seen.size !== tasks.size || bound.size !== cards.size || rows.length !== 8508 || bound.size !== 7930) throw Error('Incomplete frozen inventory');
const manifest = {format:'bunki-shared-content/v1', source:{registrySha256:hash(resolve(source,'registry.json')),catalogSha256:hash(resolve(source,'catalog.json'))},
  packs:Object.fromEntries(Object.entries(packPaths).map(([id,path])=>[id,{sha256:hash(path),cards:[...cards.keys()].filter(k=>JSON.parse(k)[0]===id).length}])),
  counts:{tasks:rows.length,vocabulary:bound.size,grammar:grammar.length}, rows, grammar, presentation};
// Canonical grammar preparation authenticates the complete frozen registry.
// These are reviewed static content artifacts, never learner records.
manifest.grammarAssets=Object.fromEntries(['registry.json','grammar.json','grammar-reviews.json'].map(name=>[name,hash(resolve(source,name))]));
for(const name of Object.keys(manifest.grammarAssets)) {
  const target=resolve(repo,'prototypes/corridor/data/shared-study',name), bytes=readFileSync(resolve(source,name));
  if(args.includes('--check')){if(!readFileSync(target).equals(bytes))throw Error(`Shared grammar asset is stale: ${name}`);}
  else {mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);}
}
const bytes = `${JSON.stringify(manifest)}\n`, destination = resolve(repo, 'prototypes/corridor/data/shared-study-content.json');
if (args.includes('--check')) {
  if (readFileSync(destination,'utf8') !== bytes) throw Error('Shared content binding is stale');
} else writeFileSync(destination, bytes);
console.log(JSON.stringify({checked:args.includes('--check'),...manifest.counts,bytes:Buffer.byteLength(bytes),source:manifest.source}));
