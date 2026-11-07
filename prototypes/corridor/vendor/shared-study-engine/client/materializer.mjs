/** Materializers own their results only when constructed here from private
 * canonical inputs. Generic callbacks keep the store's defensive copy. */
import {replay,canonicalStringify,createCachedReplayJSON,previewReview,hesitationEvidence} from './replay.mjs';

const owned = new WeakSet();
export const ownsMaterializerOutput = materialize => owned.has(materialize);

// structuredClone detaches ordinary data but preserves shared-memory backing.
// Inspect only cloned graphs, so accessors or Proxies cannot conceal that fact.
function rejectSharedMemory(value){
 const pending=[value],seen=new Set();
 while(pending.length){
  const current=pending.pop();if(!current||typeof current!=='object'||seen.has(current))continue;seen.add(current);
  if(typeof SharedArrayBuffer!=='undefined'&&(current instanceof SharedArrayBuffer||ArrayBuffer.isView(current)&&current.buffer instanceof SharedArrayBuffer))throw Error('materializer-shared-memory');
  if(current instanceof Map){for(const [key,item]of current)pending.push(key,item);}
  else if(current instanceof Set){for(const item of current)pending.push(item);}
  else if(!ArrayBuffer.isView(current))for(const key of Reflect.ownKeys(current)){const descriptor=Object.getOwnPropertyDescriptor(current,key);if(Object.hasOwn(descriptor,'value'))pending.push(descriptor.value);}
 }
}

export function createCorpusMaterializer(engine,canonicalStringify){
 let preserve=null;
 const materialize=({canonical,provisional,provisionalNow})=>{const projection=engine.replay(canonical,{provisional,provisionalNow});if(preserve){for(const[key,task]of Object.entries(preserve.tasks))if(canonicalStringify(projection.tasks[key])!==canonicalStringify(task))throw Error('Existing task state changed during registry expansion');const {tasks:oldTasks,...oldRest}=preserve,{tasks:newTasks,...newRest}=projection;if(canonicalStringify(oldRest)!==canonicalStringify(newRest))throw Error('Existing learner state changed during registry expansion');}return projection;};
 materialize.preserving=async(projection,operation)=>{if(preserve)throw Error('Registry expansion already running');preserve=projection;try{return await operation();}finally{preserve=null;}};return materialize;
}

// A conservative configuration ownership test, not an event/schema acceptance
// rule. It only inspects the private structured-cloned configuration.
function plainData(value,seen=new Set()) {
 if(value===null||typeof value!=='object')return ['undefined','string','number','boolean'].includes(typeof value)||value===null;
 if(seen.has(value))return false;
 const proto=Object.getPrototypeOf(value);
 if(!Array.isArray(value)&&proto!==Object.prototype&&proto!==null)return false;
 seen.add(value);
 const safe=Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')&&plainData(value[key],seen));
 seen.delete(value);return safe;
}
const scalar = value => value===null||['undefined','string','number','boolean'].includes(typeof value);
const record = value => value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
// Match structuredClone's own enumerable-property selection, including a single
// read of a consumed accessor. Omitted content is never traversed or retained.
const fields = (value,keys) => Object.fromEntries(keys.filter(key=>Object.getOwnPropertyDescriptor(value,key)?.enumerable).map(key=>[key,value[key]]));
function compactConfig(config){
 if(!record(config))return config;
 const {registry,taskMetadata}=fields(config,['registry','taskMetadata']);
 if(!record(registry))return config;
 const tables=fields(registry,['tasks','notes','passages','examples']);
 if(!Array.isArray(tables.tasks)||Object.values(tables).some(rows=>!Array.isArray(rows)||!rows.every(record)))return config;
 const rows={
  tasks:tables.tasks.map(row=>{const task=fields(row,['taskKey','noteGuid','contractId','passageId','group','lexemeId','player']);if(record(task.player))task.player=fields(task.player,['deckId']);return task;}),
 };
 for(const [table,keys]of [['notes',['noteGuid','module']],['passages',['passageId','sourceJaSha256']],['examples',['exampleId','sourceJaSha256']]])if(Object.hasOwn(tables,table))rows[table]=tables[table].map(row=>fields(row,keys));
 const compact={...fields(config,['learner','epoch','timezone','pin']),registry:rows};
 if(taskMetadata!==undefined){
  if(!record(taskMetadata)||rows.tasks.some(row=>typeof row.taskKey!=='string'))return config;
  compact.taskMetadata=Object.fromEntries(rows.tasks.flatMap(({taskKey})=>{
   const selected=fields(taskMetadata,[taskKey]);if(!Object.hasOwn(selected,taskKey))return [];
   const meta=selected[taskKey];return [[taskKey,record(meta)?fields(meta,['contentRevision']):meta]];
  }));
 }
 return compact;
}
function qualifiedConfig(config) {
 const registry=config?.registry;
 return plainData(config)&&typeof config.learner==='string'&&Number.isSafeInteger(config.epoch??0)&&
  typeof (config.timezone??'Asia/Tokyo')==='string'&&Array.isArray(registry?.tasks)&&
  registry.tasks.every(row=>row&&['taskKey','noteGuid','contractId','passageId','group','lexemeId'].every(key=>scalar(row[key]))&&scalar(row.player?.deckId))&&
  ['notes','passages','examples'].every(key=>registry[key]===undefined||Array.isArray(registry[key])&&registry[key].every(row=>row&&
   ['noteGuid','module','passageId','exampleId','sourceJaSha256'].every(field=>scalar(row[field]))));
}

/** Snapshot configuration once; no caller-supplied engine or serializer can
 * acquire this capability. Object-valued registry metadata stays unregistered.
 * Qualified calls replay a private input snapshot. Opaque inputs, diagnostics
 * and unqualified configurations retain a defensive result copy. */
export function createCanonicalMaterializer(config,{requireScope=false}={}) {
 const snapshot=structuredClone(compactConfig(config));rejectSharedMemory(snapshot);const qualified=qualifiedConfig(snapshot);
 const guarded=createCorpusMaterializer({replay(canonical,{provisional,provisionalNow}){
  let source={canonical,provisional,provisionalNow},privateInput=false;
  try{source=structuredClone(source);privateInput=true;}catch{/* Opaque inputs retain raw replay's acceptance and the defensive result copy. */}
  if(privateInput)rejectSharedMemory(source);
  const projection=replay(source.canonical,{...snapshot,provisional:source.provisional,provisionalNow:source.provisionalNow});
  if(!qualified||!privateInput||projection.error||projection.updateRequired){const detached=structuredClone(projection);rejectSharedMemory(detached);return detached;}
  return projection;
 }},canonicalStringify);
 const materialize=input=>{
  if(requireScope&&(input.learner!==snapshot.learner||input.epoch!==(snapshot.epoch??0)))throw Error('engine-store-scope');
  return guarded(input);
 };
 materialize.preserving=guarded.preserving;
 if(qualified)owned.add(materialize);
 return Object.freeze(materialize);
}


// Inspect only structured-cloned private data. JSON must preserve values,
// array shape and object identity topology, not merely accept serialization.
function losslessJSON(value){
 const pending=[value],seen=new Set();
 while(pending.length){
  const item=pending.pop();
  if(item===null||typeof item==='string'||typeof item==='boolean')continue;
  if(typeof item==='number'){if(!Number.isFinite(item)||Object.is(item,-0))return false;continue;}
  if(typeof item!=='object'||seen.has(item))return false;
  seen.add(item);
  if(Array.isArray(item)){
   const keys=Object.keys(item);if(keys.length!==item.length)return false;
   for(let i=0;i<item.length;i++){if(keys[i]!==String(i))return false;pending.push(item[i]);}
  }else{
   if(Object.getPrototypeOf(item)!==Object.prototype)return false;
   for(const key of Object.keys(item))pending.push(item[key]);
  }
 }
 return true;
}

/** One canonical snapshot boundary and one JSON cache for store + previews.
 * Normal engine replay follows canonical materializer snapshot semantics, not
 * the generic raw engine's caller-graph contract. Clone failures use raw input
 * plus detached output; cloneable non-JSON data uses its private clone in raw
 * replay. Overlay overrides never use the JSON cache. The existing raw engine
 * and existing createCanonicalMaterializer remain unchanged.
 */
export function createCanonicalRuntime(config,{requireScope=false}={}){
 let snapshot=structuredClone(compactConfig(config));rejectSharedMemory(snapshot);
 const qualified=qualifiedConfig(snapshot),learner=snapshot?.learner,epoch=snapshot?.epoch??0,pin=snapshot?.pin;
 let configJSON=null,cached=null,configCacheFailure='config-unavailable',runtimeCacheFallback=null;
 if(qualified&&record(snapshot)&&losslessJSON(snapshot)){try{configJSON=JSON.stringify(snapshot);}catch{/* Encoding availability is not an admission rule. */}}
 if(configJSON!==null){try{cached=createCachedReplayJSON(configJSON);}catch(error){
  if(!(error instanceof RangeError)||error.message!=='config-json-too-large')throw error;
  configCacheFailure='config-budget';
  configJSON=null; // Cache ceilings must not become new runtime admission rules.
 }}
 // Keep one parsed config inside the JSON cache. Raw fallbacks parse a temporary
 // config from this fixed string; exotic configs retain their original snapshot.
 if(cached)snapshot=null;
 const rawConfig=()=>cached?JSON.parse(configJSON):snapshot;
 const detached=projection=>{const result=structuredClone(projection);rejectSharedMemory(result);return result;};
 const engine=Object.freeze({
  cacheDiagnostics:()=>runtimeCacheFallback??cached?.cacheDiagnostics?.()??Object.freeze({path:'raw',reason:configCacheFailure,phase:'config',rows:null,cachedRows:0,retainedBytes:0}),
  replay(canonical,overlay={}){
   runtimeCacheFallback=null;
   let source={canonical,overlay},privateInput=false;
   try{source=structuredClone(source);privateInput=true;}catch{/* Preserve canonical materializer's raw-input fallback. */}
   if(privateInput)rejectSharedMemory(source);
   const options=source.overlay;
   const ordinary=privateInput&&record(options)&&Object.keys(options).every(key=>['provisional','provisionalNow'].includes(key));
   if(cached&&ordinary&&Array.isArray(source.canonical)&&
      (!Object.hasOwn(options,'provisional')||Array.isArray(options.provisional))&&
      (!Object.hasOwn(options,'provisionalNow')||typeof options.provisionalNow==='number')&&losslessJSON(source)){
    const input={};let canonicalJSON,encoded=false;
    try{
     canonicalJSON=JSON.stringify(source.canonical);
     if(Object.hasOwn(options,'provisional'))input.provisionalJSON=JSON.stringify(options.provisional);
     if(Object.hasOwn(options,'provisionalNow'))input.provisionalNow=options.provisionalNow;
     encoded=true;
    }catch{/* A private graph that cannot be encoded keeps raw semantics. */}
    if(encoded)try{const projection=cached.replay(canonicalJSON,input);return projection.error||projection.updateRequired?detached(projection):projection;}catch(error){
     if(!(error instanceof RangeError)||!['canonical-json-too-large','provisional-json-too-large'].includes(error.message))throw error;
     runtimeCacheFallback=Object.freeze({...cached.cacheDiagnostics?.(),path:'raw',reason:'input-budget',phase:error.message.split('-')[0]});
     // An over-limit private snapshot keeps raw replay semantics.
    }
   }
   runtimeCacheFallback??=Object.freeze({...cached?.cacheDiagnostics?.(),path:'raw',reason:cached?'input-shape':configCacheFailure,phase:cached?'input':'config',rows:privateInput&&Array.isArray(source.canonical)?source.canonical.length:null});
   const projection=replay(source.canonical,{...rawConfig(),...options});
   return qualified&&privateInput&&!projection.error&&!projection.updateRequired?projection:detached(projection);
  },
  previewReview:(projection,data,context)=>previewReview(projection,data,{pin,...context}),
  hesitationEvidence,
 });
 const guarded=createCorpusMaterializer(engine,canonicalStringify);
 const materialize=input=>{
  if(requireScope&&(input.learner!==learner||input.epoch!==epoch))throw Error('engine-store-scope');
  return guarded(input);
 };
 materialize.preserving=guarded.preserving;
 if(qualified)owned.add(materialize);
 return Object.freeze({engine,materialize:Object.freeze(materialize)});
}
