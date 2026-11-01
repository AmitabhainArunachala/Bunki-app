/** Materializers own their results only when constructed here from private
 * canonical inputs. Generic callbacks keep the store's defensive copy. */
import {replay,canonicalStringify} from './replay.mjs';

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
