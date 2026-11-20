import {sha256} from '../schema/event.mjs';
import {passageReadingRules} from './passage-reading-rules.mjs';

const byGuid=new Map();
for(const rule of passageReadingRules){const rows=byGuid.get(rule.guid)??[];rows.push(rule);byGuid.set(rule.guid,rows);}

/** Exact reviewed passage evidence, separate from dictionary headword readings.
 * A partial lookup receives the complete approved span; never a guessed slice. */
export function passageReadingEvidence(entry,info){
 const rules=byGuid.get(entry?.noteGuid),span=info?.span,text=entry?.ja;
 if(!rules||info?.location!=='passage'||info.source?.context!==text||typeof text!=='string'||
    span?.unit!=='utf16-code-unit'||!Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||
    span.start<0||span.end<=span.start||span.end>text.length||text.slice(span.start,span.end)!==info.surface)return Object.freeze([]);
 const digest=sha256(text),points=[...text],result=[];
 for(const rule of rules){
  if(entry.taskKey!==rule.sourceTaskKey||digest!==rule.sourceJaSha256||points.slice(rule.span.start,rule.span.end).join('')!==rule.surface)continue;
  const start=points.slice(0,rule.span.start).join('').length,end=start+rule.surface.length;
  if(span.start>=end||span.end<=start)continue;
  result.push(Object.freeze({ruleId:rule.id,surface:rule.surface,reading:rule.reading,
   span:Object.freeze({start,end,unit:'utf16-code-unit'}),
   relation:span.start===start&&span.end===end?'exact':span.start>=start&&span.end<=end?'within':'overlap'}));
 }
 return Object.freeze(result);
}

/** The original lexical entry is unchanged; only the popup's display copy loses
 * its unlabelled reading when reviewed passage evidence is shown separately. */
export function lookupReadingPresentation(entry,info,lexicalEntry,{lexicalSource=null}={}){
 const passageReadings=passageReadingEvidence(entry,info);
 return Object.freeze({passageReadings,lexicalSource,headwordReading:passageReadings.length&&['card','dictionary'].includes(lexicalSource)?lexicalEntry?.reading||null:null,
  displayEntry:passageReadings.length?Object.freeze({...lexicalEntry,reading:''}):lexicalEntry});
}


/** Display-only preference; lookup capture/target semantics remain with the host.
 * A crossing token is not inside the reviewed word and must keep its old lookup. */
export function reviewedDictionaryEntry(entry,info,dictionary){
 const proofs=passageReadingEvidence(entry,info).filter(proof=>proof.relation==='exact'||proof.relation==='within');
 if(proofs.length!==1||typeof dictionary?.resolveExact!=='function')return null;
 const result=dictionary.resolveExact(proofs[0].surface,proofs[0].reading);
 return result?.kind==='dictionary'?result:null;
}


/** A new explicit familiarity action names the displayed reviewed compound.
 * The original automatic lookup remains unchanged, with its own immutable event.
 * Keep that original tap in source metadata, while the action span is the exact
 * whole occurrence the learner chose. No schedule command is constructed here. */
export function reviewedActionCapture(entry,info,dictionary,catalog,capture){
 const resolved=reviewedDictionaryEntry(entry,info,dictionary);
 if(!resolved)return null;
 const [proof]=passageReadingEvidence(entry,info).filter(proof=>proof.relation==='exact'||proof.relation==='within');
 const kana=text=>text.normalize('NFKC').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
 const targets=new Map((catalog??[]).filter(card=>card.contractId==='vocabulary.read.v1'&&
  [card.term,card.form].includes(proof.surface)&&typeof card.reading==='string'&&kana(card.reading)===kana(proof.reading))
  .map(card=>[card.taskKey,card]));
 const target=targets.size===1?[...targets.values()][0]:null;
 return Object.freeze({...capture,surface:proof.surface,span:proof.span,lemma:resolved.lemma,reading:resolved.reading,
  targetTaskKey:target?.taskKey??null,
  resolution:Object.freeze({status:'reviewed-dictionary-exact',source:resolved.source,ruleId:proof.ruleId}),
  source:Object.freeze({...structuredClone(info.source),context:entry.ja,field:'passage',
   tap:Object.freeze({surface:info.surface,span:Object.freeze({...info.span})})})});
}
