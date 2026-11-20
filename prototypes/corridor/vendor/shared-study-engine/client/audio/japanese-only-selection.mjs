/** Whole Japanese prose selection only; not a recording, grant or review approval. */
import {canonicalStringify,sha256} from '../schema/event.mjs';
const POLICY='ja-whole-field-v1';
const CONTRACTS=new Set(['vocabulary.read.v1','grammar.meaning.v1','grammar.cloze.v1']);
const fail=message=>{throw new TypeError(`Japanese-only selection: ${message}`);};
const check=(ok,message)=>{if(!ok)fail(message);};
function record(value,label){
 check(value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),`${label} must be plain data`);
 for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);check(typeof key==='string'&&d.enumerable&&Object.hasOwn(d,'value'),`${label} requires data properties`);}return value;
}
function array(value,label){
 check(Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=100000&&Reflect.ownKeys(value).length===value.length+1,`${label} requires bounded dense array`);
 for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));check(d&&d.enumerable&&Object.hasOwn(d,'value'),`${label} requires array data`);}return value;
}
function text(value,label){check(typeof value==='string'&&/\S/u.test(value)&&value.length<=2000000,`${label} requires bounded text`);canonicalStringify(value);return value;}
function hash(value,label){check(typeof value==='string'&&/^[0-9a-f]{64}$/.test(value),`${label} requires SHA256`);return value;}
function freeze(value){if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
const compare=(a,b)=>a<b?-1:a>b?1:0;
function reason(field,contract){
 const language=field.language,path=field.sourcePath;
 if(language==='en')return 'excluded-english';
 if(Array.isArray(language)){array(language,'language partition');return 'excluded-mixed';}
 if(language===null)return 'excluded-unassigned';
 check(language==='ja','unknown language cannot default to Japanese');
 if(path==='pattern'||path==='formation'||/^relatedReferences\[\d+\]\.text$/.test(path))return 'excluded-notation';
 const prose=contract==='vocabulary.read.v1'?(['term','reading','ja','defJa','note'].includes(path)||/^collocations\[(0|[1-9]\d*)\]$/.test(path)):/^examples\[(0|[1-9]\d*)\]\.ja$/.test(path);
 return prose?'selected-ja-whole-field':'excluded-unsupported-prose-path';
}
/** taskKeys, when provided, is an explicit trusted request scope, not pack-derived membership. */
export function createJapaneseOnlySelection(options){
 record(options,'options');const {plan,sourceRevision,correctionLedgerRevision,taskKeys}=options;
 text(sourceRevision,'source revision');text(correctionLedgerRevision,'correction revision');record(plan,'plan');check(plan.format==='nihongo-card-speech-plan'&&plan.version===1,'current canonical plan v1 required');array(plan.tasks,'tasks');
 let scope=null;
 if(taskKeys!==undefined){array(taskKeys,'task scope');check(taskKeys.length>0,'task scope must be explicit nonempty');scope=new Set();for(const key of taskKeys){text(key,'scoped task key');check(!scope.has(key),'duplicate task scope');scope.add(key);}}
 const taskIds=new Set(),rows=[],sourceRefs=new Set(),coverage={tasks:0,fields:0,selectedPlacements:0,selectedSourceRefs:0,excludedPlacements:0,excludedByReason:{}};
 for(const task of plan.tasks){
  record(task,'task');const {taskKey,noteGuid,contractId,passageId,schedulerContentRevision,audioContentRevision}=task;
  for(const [label,value]of Object.entries({taskKey,noteGuid,contractId,passageId}))text(value,label);
  check(CONTRACTS.has(contractId)&&taskKey===JSON.stringify([noteGuid,contractId,passageId]),'task tuple mismatch');check(!taskIds.has(taskKey),'duplicate task');taskIds.add(taskKey);
  if(scope&&!scope.has(taskKey))continue;
  check(schedulerContentRevision===null||typeof schedulerContentRevision==='string'&&/\S/u.test(schedulerContentRevision),'scheduler revision required');if(schedulerContentRevision!==null)text(schedulerContentRevision,'scheduler revision');hash(audioContentRevision,'audio revision');array(task.fields,'fields');coverage.tasks++;
  const paths=new Set();
  for(const field of task.fields){
   check(rows.length<100000,'field limit exceeded');record(field,'field');const {sourcePath,sourceText,sourceHash,sourceRef}=field;text(sourcePath,'source path');check(!paths.has(sourcePath),'duplicate task field');paths.add(sourcePath);text(sourceText,'whole source');hash(sourceHash,'source hash');check(sha256(sourceText)===sourceHash,'stale source hash');
   const exampleId=field.exampleId??null;if(exampleId!==null)text(exampleId,'example id');
   check(sourceRef===canonicalStringify({kind:contractId==='vocabulary.read.v1'?'vocabulary':'grammar',noteGuid,exampleId,field:sourcePath}),'source ref mismatch');
   const why=reason(field,contractId),selected=why==='selected-ja-whole-field';
   rows.push({taskKey,noteGuid,contractId,passageId,schedulerContentRevision,audioContentRevision,sourcePath,sourceRef,sourceHash,selected,reason:why});coverage.fields++;
   if(selected){coverage.selectedPlacements++;sourceRefs.add(sourceRef);}else{coverage.excludedPlacements++;coverage.excludedByReason[why]=(coverage.excludedByReason[why]??0)+1;}
  }
 }
 if(scope)for(const key of scope)check(taskIds.has(key),'unknown scoped task');
 coverage.selectedSourceRefs=sourceRefs.size;rows.sort((a,b)=>compare(a.taskKey,b.taskKey)||compare(a.sourcePath,b.sourcePath));
 const payload={format:'nihongo-japanese-only-selection',version:1,policyId:POLICY,sourceRevision,correctionLedgerRevision,rows,coverage};return freeze({...payload,digest:sha256(canonicalStringify(payload))});
}
/** Rebuild every field of the trusted scope. A self-rehashed pack is not authority. */
export function validateJapaneseOnlySelection(manifest,options){
 record(manifest,'manifest');const expected=createJapaneseOnlySelection(options);
 // The canonical seam rejects non-JSON/scalar data; bound shape before traversing rows.
 check(Object.keys(manifest).length===Object.keys(expected).length&&Object.keys(expected).every(k=>Object.hasOwn(manifest,k)),'manifest shape mismatch');array(manifest.rows,'manifest rows');check(manifest.rows.length===expected.rows.length,'manifest inventory mismatch');
 for(const row of manifest.rows){record(row,'manifest row');check(Object.keys(row).length===11,'manifest row shape mismatch');}
 record(manifest.coverage,'coverage');record(manifest.coverage.excludedByReason,'exclusions');hash(manifest.digest,'manifest digest');
 check(canonicalStringify(manifest)===canonicalStringify(expected),'stale or unauthorized selection');return expected;
}
