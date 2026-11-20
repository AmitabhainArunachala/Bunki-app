/** Dedicated browser audio cache. Transaction completion is the acknowledgement.
 * Strict durability is requested where supported. Browser eviction/OS persistence
 * is host policy; accounting includes conservative logical overhead, not measured
 * browser-engine physical pages. No learner journal or authority is stored here. */
const LIMIT=512*1024*1024, MAX_RESOURCE=2*1024*1024, enc=new TextEncoder();
const canonical=v=>{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';};
const fail=m=>{throw new Error(m);};
const text=(v,max=2048)=>typeof v==='string'&&v.length>0&&enc.encode(v).length<=max||fail('Invalid text');
function ref(r){if(!r||typeof r!=='object')fail('Invalid ref');text(r.key);if(!/^[a-f0-9]{64}$/.test(r.sha256)||!Number.isSafeInteger(r.bytes)||r.bytes<1||r.bytes>MAX_RESOURCE)fail('Invalid resource identity');return {key:r.key,sha256:r.sha256,bytes:r.bytes};}
function binding(b){if(!b?.namespace)fail('Invalid binding');const n=b.namespace;for(const k of ['environment','learner','installation'])text(n[k],256);if(!Number.isSafeInteger(n.epoch)||n.epoch<0)fail('Invalid epoch');for(const k of ['releaseId','projectionId','contentRelease'])text(b[k],512);return {namespace:{environment:n.environment,learner:n.learner,installation:n.installation,epoch:n.epoch},releaseId:b.releaseId,projectionId:b.projectionId,contentRelease:b.contentRelease,root:ref(b.root)};}
const aborted=s=>{if(s?.aborted)throw s.reason??new DOMException('Aborted','AbortError');};
const overhead=v=>512+enc.encode(canonical(v)).length*2;
const hex=buf=>Array.from(new Uint8Array(buf),x=>x.toString(16).padStart(2,'0')).join('');
function marker(b,m){if(m?.format!=='nsrs-installed-audio-pack/v1')fail('Invalid marker format');text(m.packId,256);if(canonical(binding(m.binding))!==canonical(b))fail('Marker binding mismatch');if(!Array.isArray(m.refs)||m.refs.length<1||m.refs.length>4096)fail('Invalid refs');const refs=m.refs.map(ref),keys=new Set();let sum=0;for(const r of refs){if(keys.has(r.key))fail('Duplicate resource key');keys.add(r.key);sum+=r.bytes;}if(sum>68*1024*1024)fail('Snapshot too large');if(!refs.some(r=>canonical(r)===canonical(b.root)))fail('Root missing');return {format:m.format,binding:b,packId:m.packId,refs};}
export function createAudioPackIndexedDBStore({databaseName='nsrs-audio-pack-byte-store-v1'}={}){
 text(databaseName,256);let pending=null;
 const open=()=>pending??=(new Promise((resolve,reject)=>{const req=indexedDB.open(databaseName,1);req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('resources',{keyPath:'id'});db.createObjectStore('markers',{keyPath:'id'});db.createObjectStore('accounting');};req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Audio database blocked'));req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();pending=null;};resolve(db);};})).catch(e=>{pending=null;throw e;});
 async function transaction(mode,signal,work){aborted(signal);const db=await open();aborted(signal);return new Promise((resolve,reject)=>{let tx;try{tx=db.transaction(['resources','markers','accounting'],mode,mode==='readwrite'?{durability:'strict'}:undefined);}catch(e){if(e?.name==='TypeError')tx=db.transaction(['resources','markers','accounting'],mode);else return reject(e);}let result,error;const stop=()=>{error=signal?.reason??new DOMException('Aborted','AbortError');try{tx.abort();}catch{}};const cleanup=()=>signal?.removeEventListener('abort',stop);tx.oncomplete=()=>{cleanup();resolve(result);};tx.onabort=()=>{cleanup();reject(error??tx.error??Error('Transaction aborted'));};tx.onerror=()=>{};signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted){stop();return;}const guarded=fn=>(...args)=>{try{aborted(signal);fn(...args);}catch(e){error=e;try{tx.abort();}catch{}}};const get=(store,key,cb)=>{const req=tx.objectStore(store).get(key);req.onsuccess=guarded(()=>cb(req.result));};try{work({tx,get,guarded,set:v=>{result=v;}});}catch(e){error=e;try{tx.abort();}catch{}}});}
 const bkey=b=>canonical(b),rkey=(b,r)=>canonical([bkey(b),r.key]),mkey=(b,id)=>canonical([bkey(b),id]);
 return {
 async listPacks(input,{signal}={}){const b=binding(input),key=bkey(b);return transaction('readonly',signal,({tx,guarded,set})=>{const req=tx.objectStore('markers').getAll();req.onsuccess=guarded(()=>{const rows=req.result.filter(r=>r.bindingKey===key);if(rows.length>64)fail('Marker capacity exceeded');set(rows.map(r=>r.marker.packId).sort());});});},
 async readPack(input,packId,{signal}={}){const b=binding(input);text(packId,256);return transaction('readonly',signal,({get,set})=>get('markers',mkey(b,packId),row=>set(row?structuredClone(row.marker):null)));},
 async readResource(input,identity,{signal}={}){const b=binding(input),r=ref(identity);return transaction('readonly',signal,({get,set})=>get('resources',rkey(b,r),row=>set(row&&canonical(row.ref)===canonical(r)?new Uint8Array(row.data):null)));},
 async stageResource(input,identity,value,{signal,quotaBytes=LIMIT}={}){
 const b=binding(input),r=ref(identity);if(!(value instanceof Uint8Array)||value.byteLength!==r.bytes)fail('Exact bytes required');const data=value.slice();if(!Number.isSafeInteger(quotaBytes)||quotaBytes<1||quotaBytes>LIMIT)fail('Invalid quota');aborted(signal);if(hex(await crypto.subtle.digest('SHA-256',data))!==r.sha256)fail('Hash mismatch');aborted(signal);
 const row={id:rkey(b,r),bindingKey:bkey(b),ref:r,data},cost=data.byteLength+overhead({id:rkey(b,r),bindingKey:bkey(b),ref:r});row.cost=cost;
 return transaction('readwrite',signal,({tx,get})=>get('resources',row.id,old=>{
  if(old&&(old.id!==row.id||old.bindingKey!==row.bindingKey||canonical(old.ref)!==canonical(r)||old.cost!==cost))fail('Resource conflict');
  get('accounting','used',used=>{
   used??=0;
   if(!Number.isSafeInteger(used)||used<0||(old&&used<cost))fail('Accounting corrupt');
   const next=used+(old?0:cost);
   if(next>quotaBytes||next>LIMIT)fail('Quota exceeded');
   if(old)tx.objectStore('resources').put(row);
   else{tx.objectStore('resources').add(row);tx.objectStore('accounting').put(next,'used');}
  });
 }));
 },
 async commitPack(input,value,{signal}={}){
 const b=binding(input),m=marker(b,value),key=bkey(b),id=mkey(b,m.packId),cost=overhead({id,bindingKey:key,marker:m});aborted(signal);
 return transaction('readwrite',signal,({tx,get,guarded})=>get('markers',id,old=>{if(old){if(canonical(old.marker)!==canonical(m))fail('Marker conflict');return;}const req=tx.objectStore('markers').getAll();req.onsuccess=guarded(()=>{if(req.result.filter(r=>r.bindingKey===key).length>=64)fail('Marker capacity exceeded');let i=0;const next=()=>{if(i===m.refs.length){get('accounting','used',used=>{used??=0;if(!Number.isSafeInteger(used)||used<0)fail('Accounting corrupt');if(used+cost>LIMIT)fail('Quota exceeded');tx.objectStore('markers').add({id,bindingKey:key,marker:m,cost});tx.objectStore('accounting').put(used+cost,'used');});return;}const r=m.refs[i++];get('resources',rkey(b,r),row=>{if(!row||canonical(row.ref)!==canonical(r)||row.data.byteLength!==r.bytes)fail('Resource not durable');next();});};next();});}));
 },
 async invalidatePack(input,packId,{signal}={}){const b=binding(input);text(packId,256);return transaction('readwrite',signal,({tx,get})=>get('markers',mkey(b,packId),row=>{if(!row)return;get('accounting','used',used=>{if(!Number.isSafeInteger(used)||used<row.cost)fail('Accounting corrupt');tx.objectStore('markers').delete(row.id);tx.objectStore('accounting').put(used-row.cost,'used');});}));},
 async close(){const p=pending;pending=null;if(p)(await p).close();}
 };
}
