import {manualEntry} from '../player/manual-cards.mjs';
import {payloadHash,validateEvent} from '../schema/event.mjs';
export {createCorpusMaterializer} from '../materializer.mjs';
/** Additive factory delivery keeps the frozen release-3 base inventory visible. */
export function validateCorpusInventory(catalog,build){
 const fail=()=>{throw Error('Full corpus inventory mismatch');},integer=n=>Number.isSafeInteger(n)&&n>=0;
 if(!Array.isArray(catalog)||!build)fail();const generated=build.generatedVocabularyCount??0,basePersonal=build.basePersonalVocabularyCount??(generated===0?301:null);
 if(!integer(generated)||basePersonal!==301||build.vocabularyCount!==7930+generated||build.catalogCount!==8508+generated||build.personalVocabularyCount!==301+generated||build.grammarTasks!==578)fail();
 const vocabulary=catalog.filter(e=>e.contractId==='vocabulary.read.v1'),grammar=catalog.filter(e=>['grammar.meaning.v1','grammar.cloze.v1'].includes(e.contractId)),personal=vocabulary.filter(e=>e.module==='kotoba'),added=catalog.filter(e=>e.factoryGenerated===true);
 if(catalog.length!==build.catalogCount||vocabulary.length!==build.vocabularyCount||grammar.length!==578||personal.length!==build.personalVocabularyCount||added.length!==generated||added.some(e=>e.contractId!=='vocabulary.read.v1'||e.module!=='kotoba'||e.player?.deckId!=='kotoba-generated'))fail();
 const base=vocabulary.filter(e=>!e.factoryGenerated);if(base.length!==7930||base.filter(e=>e.module==='kotoba').length!==301)fail();
 const counts=Object.fromEntries(['n2','n1','senmon','kotoba','grammar'].map(id=>[id,catalog.filter(e=>e.module===id).length]));if(Object.keys(build.modules||{}).length!==5||Object.entries(counts).some(([id,n])=>build.modules[id]!==n)||Object.values(counts).reduce((a,b)=>a+b,0)!==catalog.length)fail();
 return Object.freeze({vocabulary:vocabulary.length,grammar:grammar.length,personal:personal.length,basePersonal,generated,total:catalog.length});
}

/** First native factory delivery uses the exact bundled base registry. Subsequent
 * delivery needs an explicit prior snapshot; never infer full rows from projection. */
export async function refreshCorpusRegistry(store,registry,catalog,{materializer,canonicalStringify,readPreviousRegistry=null,allowQAExpansion=false}={}){
 const before=await store.readState(),old=before.projection.tasks,rows=new Map(registry.tasks.map(t=>[t.taskKey,t])),entries=new Map(catalog.map(e=>[e.taskKey,e]));
 if(rows.size!==registry.tasks.length||rows.size!==entries.size||[...rows.keys()].some(k=>!entries.has(k)))throw Error('Incomplete corpus task registry');
 for(const row of registry.tasks){const e=entries.get(row.taskKey);if(!e||e.noteGuid!==row.noteGuid||e.contractId!==row.contractId||e.passageId!==row.passageId)throw Error('Catalog task identity mismatch');}
 const notes=new Map((registry.notes||[]).map(r=>[r.noteGuid,r]));
 const learnerTasks=new Set(),sourceEvents=new Map([...Object.values(before.canonical),...Object.values(before.local)].map(row=>[row.event?.id,row]));
 for(const[id,entry]of Object.entries(before.projection.manualCards??{})){
  const envelope=sourceEvents.get(id),event=envelope?.event;
  if(!event||event.type!=='manual-card'||event.learner!==before.scope.learner||!validateEvent(event).ok||envelope.bodyHash!==payloadHash(event))throw Error('Manual task lacks its immutable source event');
  const expected=manualEntry(event,Math.min(event.ts,envelope.rt??event.ts)),task=old[entry.taskKey];
  if(canonicalStringify(entry)!==canonicalStringify(expected)||!task||task.taskKey!==expected.taskKey||task.contentRevision!==expected.contentRevision||task.noteGuid!==expected.noteGuid||task.contract!==expected.contractId||task.passageId!==expected.passageId||task.module!=='kotoba'||task.group!==null||task.lexicalKey!==expected.lexemeId||rows.has(entry.taskKey))throw Error('Manual task identity changed');
  learnerTasks.add(entry.taskKey);
 }
 const bundledKeys=Object.keys(old).filter(key=>!learnerTasks.has(key));
 for(const key of bundledKeys){const task=old[key],row=rows.get(key);if(!row||task.noteGuid!==row.noteGuid||task.contract!==row.contractId||task.passageId!==row.passageId||task.lexicalKey!==(row.lexemeId||row.noteGuid)||task.group!==(row.group??null)||task.module!==(notes.get(row.noteGuid)?.module||row.player?.deckId||'grammar'))throw Error('Installed task identity changed or removed');}
 const extra=registry.tasks.filter(t=>!old[t.taskKey]);if(!extra.length)return{refreshed:false,added:0};
 if(!allowQAExpansion){
  if(extra.some(t=>t.contractId!=='vocabulary.read.v1'||entries.get(t.taskKey)?.factoryGenerated!==true||entries.get(t.taskKey)?.module!=='kotoba'||entries.get(t.taskKey)?.player?.deckId!=='kotoba-generated'||t.player?.deckId!=='kotoba-generated'))throw Error('Unknown added task identity');
  if(!readPreviousRegistry)throw Error('Exact previous registry snapshot required');const previous=await readPreviousRegistry(),previousTasks=new Map(previous?.tasks?.map(t=>[t.taskKey,t])||[]);
  if(previousTasks.size!==bundledKeys.length||bundledKeys.some(k=>!previousTasks.has(k)))throw Error('Previous registry does not describe installed identities');
  for(const[field,id]of[['tasks','taskKey'],['notes','noteGuid'],['passages','passageId'],['examples','exampleId'],['lexemes','lexemeId'],['contracts','id']]){const current=new Map((registry[field]||[]).map(r=>[r[id],r]));for(const row of previous[field]||[])if(!current.has(row[id])||canonicalStringify(row)!==canonicalStringify(current.get(row[id])))throw Error('Frozen identity row changed');const prior=new Set((previous[field]||[]).map(r=>r[id])),allowed=new Set(extra.map(r=>field==='tasks'?r.taskKey:field==='notes'?r.noteGuid:field==='passages'?r.passageId:field==='lexemes'?r.lexemeId:null));if([...current.keys()].some(key=>!prior.has(key)&&!allowed.has(key)))throw Error('Unbound added identity row');}
 }
 if(typeof materializer?.preserving!=='function')throw Error('Guarded registry materializer required');
 await materializer.preserving(before.projection,()=>store.reconcile({events:[],head:before.head}));
 const after=await store.readState();for(const field of['scope','epoch','nextDseq','locallyDurable','acknowledged','appliedSeq','head','local','canonical'])if(canonicalStringify(before[field])!==canonicalStringify(after[field]))throw Error('Registry expansion ledger invariant failed');
 return{refreshed:true,added:extra.length};
}
