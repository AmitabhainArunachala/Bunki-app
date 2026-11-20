const MANIFEST_PATH='/audio/kore-20261103/manifest.json';
const CACHE_NAME='nihongo-kore-trial-audio-v1';
const MANIFEST_LIMIT=64*1024;
const CLIP_LIMIT=2*1024*1024;
const MEMORY_LIMIT=8*1024*1024;
const MEMORY_ENTRIES=12;
const NOTE_ID=/^nsrs-v-[a-f0-9]{12}$/;
const LOOPBACK=new Set(['localhost','127.0.0.1','[::1]']);

function browserContext(){
 const Ctor=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!Ctor)throw Error('trial-audio-context-unavailable');
 return new Ctor();
}

/** Bounded, generation-guarded playback for the Kore trial clips. */
export function createTrialAudio({
 origin=globalThis.location?.origin,
 fetch:fetchImpl=globalThis.fetch?.bind(globalThis),
 caches:cacheStorage=globalThis.caches,
 createContext=browserContext,
 audioSession=globalThis.navigator?.audioSession,
}={}){
 let base=null,manifest=null,loading=null,context=null,cacheHandle=null;
 let generation=0,disposed=false,activeToken=null,sessionClaimed=false,sessionPrevious;
 const memory=new Map();let memoryBytes=0;

 function parseOrigin(value){
  let url;
  try{url=new URL(String(value));}catch{return null;}
  const loopback=url.protocol==='http:'&&LOOPBACK.has(url.hostname);
  if(url.protocol!=='https:'&&!loopback)return null;
  if(url.username||url.password)return null;
  if(url.pathname!=='/'||url.search||url.hash)return null;
  return url;
 }

 function responseOriginOk(response){
  try{if(response?.url)return new URL(response.url).origin===base.origin;}catch{return false;}
  return true;
 }

 async function readBounded(response,limit){
  if(!response||!response.ok||response.redirected)throw Error('trial-audio-response');
  let declared=NaN;
  try{declared=Number(response.headers?.get?.('content-length'));}catch{}
  if(Number.isFinite(declared)&&declared>limit)throw Error('trial-audio-too-large');
  const reader=response.body?.getReader?.();
  if(!reader){
   const buffer=await response.arrayBuffer();
   if(buffer.byteLength>limit)throw Error('trial-audio-too-large');
   return new Uint8Array(buffer);
  }
  const chunks=[];let total=0;
  try{
   for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    if(!value)continue;
    const chunk=value instanceof Uint8Array?value:new Uint8Array(value);
    total+=chunk.byteLength;
    if(total>limit){try{await reader.cancel();}catch{}throw Error('trial-audio-too-large');}
    chunks.push(chunk);
   }
  }finally{try{reader.releaseLock();}catch{}}
  const bytes=new Uint8Array(total);let at=0;
  for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
  return bytes;
 }

 async function request(url,token,signal){
  if(!fetchImpl)throw Error('trial-audio-fetch-unavailable');
  let response;
  try{response=await fetchImpl(url,{credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',...(signal?{signal}:{})});}
  catch(error){if(token?.cancelled)return null;throw Error('trial-audio-network',{cause:error});}
  if(token?.cancelled){try{response?.body?.cancel?.()?.catch?.(()=>{});}catch{}return null;}
  if(!response||!response.ok||response.redirected||!responseOriginOk(response))throw Error('trial-audio-response');
  return response;
 }

 function validateManifest(data,manifestUrl){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('trial-audio-manifest');
  const clips=data.clips;
  if(!clips||typeof clips!=='object'||Array.isArray(clips))throw Error('trial-audio-manifest');
  const entries=Object.entries(clips);
  if(entries.length>100)throw Error('trial-audio-manifest');
  const map=new Map();
  for(const [id,clip] of entries){
   if(!NOTE_ID.test(id)||!clip||typeof clip!=='object'||Array.isArray(clip))throw Error('trial-audio-manifest');
   if(clip.word!==`${id}-w.m4a`||clip.sentence!==`${id}-s.m4a`)throw Error('trial-audio-manifest');
   map.set(id,Object.freeze({word:new URL(clip.word,manifestUrl).href,sentence:new URL(clip.sentence,manifestUrl).href}));
  }
  return map;
 }

 function parseManifest(bytes,manifestUrl){
  let data;
  try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('trial-audio-manifest');}
  return validateManifest(data,manifestUrl);
 }

 async function cachedManifest(manifestUrl){
  if(!cacheStorage)return null;
  try{
   const cache=await openCache();
   const response=await cache.match(manifestUrl);
   if(!response||!response.ok||response.redirected||!responseOriginOk(response))return null;
   return parseManifest(await readBounded(response,MANIFEST_LIMIT),manifestUrl);
  }catch{return null;}
 }

 async function rememberManifest(manifestUrl,bytes){
  if(!cacheStorage||typeof Response!=='function')return;
  try{
   const cache=await openCache();
   await cache.put(manifestUrl,new Response(bytes,{status:200,headers:{'Content-Type':'application/json'}}));
  }catch{/* Membership still loads from the network next time. */}
 }

 async function loadManifest(){
  base=parseOrigin(origin);
  if(!base)throw Error('trial-audio-origin');
  const manifestUrl=new URL(MANIFEST_PATH,base).href;
  let response;
  try{response=await request(manifestUrl,null);}
  catch(error){
   if(error?.message!=='trial-audio-network')throw error;
   const cached=await cachedManifest(manifestUrl);
   if(disposed)throw Error('trial-audio-disposed');
   if(cached)return cached;
   throw error;
  }
  if(!response)throw Error('trial-audio-response');
  const bytes=await readBounded(response,MANIFEST_LIMIT);
  if(disposed)throw Error('trial-audio-disposed');
  const map=parseManifest(bytes,manifestUrl);
  await rememberManifest(manifestUrl,bytes);
  return map;
 }

 function load(){
  if(disposed)return Promise.reject(Error('trial-audio-disposed'));
  if(manifest)return Promise.resolve(manifest);
  if(loading)return loading;
  loading=loadManifest().then(map=>{
   if(disposed)throw Error('trial-audio-disposed');
   manifest=map;return map;
  },error=>{manifest=null;loading=null;throw error;});
  return loading;
 }

 function has(noteGuid){return !disposed&&!!manifest&&manifest.has(noteGuid);}

 function ensureContext(){
  if(disposed)throw Error('trial-audio-disposed');
  if(context&&context.state!=='closed')return context;
  const created=createContext();
  if(!created||typeof created.decodeAudioData!=='function'||typeof created.createBufferSource!=='function')throw Error('trial-audio-context');
  context=created;return context;
 }

 function resumeContext(target){
  try{
   if(target.state!=='closed'){
    const resumed=target.resume?.();
    if(resumed&&typeof resumed.catch==='function')resumed.catch(()=>{});
   }
  }catch{/* The source start or decode reports an unusable context. */}
 }

 function claimSession(){
  if(sessionClaimed)return;
  try{
   if(!audioSession||typeof audioSession.type!=='string')return;
   const previous=audioSession.type;
   audioSession.type='playback';
   sessionPrevious=previous;sessionClaimed=true;
  }catch{/* Unsupported sessions keep the platform default. */}
 }

 function releaseSession(){
  if(!sessionClaimed)return;
  const previous=sessionPrevious;sessionClaimed=false;sessionPrevious=undefined;
  try{audioSession.type=previous;}catch{}
 }

 function openCache(){
  if(!cacheStorage)return Promise.reject(Error('trial-audio-cache-unavailable'));
  if(!cacheHandle)cacheHandle=Promise.resolve().then(()=>cacheStorage.open(CACHE_NAME)).catch(error=>{cacheHandle=null;throw error;});
  return cacheHandle;
 }

 function memoryGet(url){
  const hit=memory.get(url);
  if(!hit)return null;
  memory.delete(url);memory.set(url,hit);
  return hit.bytes;
 }

 function remember(url,bytes){
  if(bytes.byteLength>MEMORY_LIMIT)return;
  const old=memory.get(url);
  if(old){memoryBytes-=old.bytes.byteLength;memory.delete(url);}
  while(memory.size&&(memory.size>=MEMORY_ENTRIES||memoryBytes+bytes.byteLength>MEMORY_LIMIT)){
   const [key,value]=memory.entries().next().value;
   memory.delete(key);memoryBytes-=value.bytes.byteLength;
  }
  memory.set(url,{bytes});memoryBytes+=bytes.byteLength;
 }

 function makeToken(){
  const token={gen:++generation,cancelled:false,source:null,wake:null,controller:null};
  token.done=new Promise(resolve=>{token.finish=resolve;});
  return token;
 }

 function cancelled(token){return disposed||token.cancelled||token.gen!==generation;}

 function cancelToken(token){
  if(!token||token.cancelled)return;
  token.cancelled=true;
  try{token.controller?.abort();}catch{}
  const source=token.source;token.source=null;
  if(source){
   try{source.stop();}catch{}
   try{source.disconnect();}catch{}
  }
  try{token.finish?.();}catch{}
  try{token.wake?.();}catch{}
 }

 async function cachedClip(token,url){
  if(!cacheStorage)return null;
  try{
   const cache=await Promise.race([openCache(),token.done]);
   if(!cache||cancelled(token))return null;
   const response=await Promise.race([cache.match(url),token.done]);
   if(!response||cancelled(token))return null;
   if(!response.ok||response.redirected||!responseOriginOk(response))return null;
   const bytes=await Promise.race([readBounded(response,CLIP_LIMIT),token.done]);
   return cancelled(token)?null:bytes;
  }catch{return null;}
 }

 async function resolveClip(token,url){
  const cached=await cachedClip(token,url);
  if(cancelled(token))return null;
  if(cached)return cached;
  const remembered=memoryGet(url);
  if(cancelled(token))return null;
  if(remembered)return remembered;
  const controller=typeof AbortController==='function'?new AbortController():null;
  token.controller=controller;
  try{
   const response=await Promise.race([request(url,token,controller?.signal),token.done]);
   if(cancelled(token)||!response)return null;
   const bytes=await Promise.race([readBounded(response,CLIP_LIMIT),token.done]);
   if(cancelled(token))return null;
   remember(url,bytes);
   try{
    if(typeof Response==='function'){
     const type=response.headers?.get?.('content-type')||'audio/mp4';
     const copy=new Response(bytes,{status:200,headers:{'Content-Type':type}});
     const cache=await Promise.race([openCache(),token.done]);
     if(cache&&!cancelled(token))await Promise.race([cache.put(url,copy),token.done]);
    }
   }catch{/* Cache failures never stop study. */}
   return bytes;
  }catch(error){
   if(cancelled(token))return null;
   throw error;
  }finally{token.controller=null;}
 }

 function decodeAudio(target,buffer){
  return new Promise((resolve,reject)=>{
   let settled=false;
   const done=value=>{if(!settled){settled=true;resolve(value);}};
   const fail=error=>{if(!settled){settled=true;reject(error);}};
   try{
    const result=target.decodeAudioData(buffer,done,fail);
    if(result&&typeof result.then==='function')result.then(done,fail);
    else if(result!==undefined)done(result);
   }catch(error){fail(error);}
  });
 }

 async function playBytes(token,target,bytes){
  if(!bytes||cancelled(token))return;
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  let decoded;
  try{decoded=await Promise.race([decodeAudio(target,buffer),token.done]);}
  catch(error){if(cancelled(token))return;throw error;}
  if(!decoded||cancelled(token))return;
  const source=target.createBufferSource();
  token.source=source;
  source.buffer=decoded;
  const ended=new Promise(resolve=>{token.wake=resolve;});
  source.onended=()=>{const wake=token.wake;token.wake=null;wake?.();};
  source.connect(target.destination);
  try{source.start();}
  catch(error){token.source=null;try{source.disconnect();}catch{};if(cancelled(token))return;throw error;}
  await Promise.race([ended,token.done]);
  if(token.source===source)token.source=null;
  try{source.disconnect();}catch{}
 }

 async function run(token,noteGuid,target){
  const clip=manifest?.get(noteGuid);
  if(!clip)return;
  const word=await resolveClip(token,clip.word);
  if(cancelled(token))return;
  await playBytes(token,target,word);
  if(cancelled(token))return;
  const sentence=await resolveClip(token,clip.sentence);
  if(cancelled(token))return;
  await playBytes(token,target,sentence);
 }

 function play(noteGuid){
  if(disposed)return Promise.reject(Error('trial-audio-disposed'));
  if(!manifest||!manifest.has(noteGuid))return Promise.reject(Error('trial-audio-unavailable'));
  let target;
  try{target=ensureContext();}catch(error){return Promise.reject(error);}
  const previous=activeToken,token=makeToken();
  activeToken=token;
  if(previous)cancelToken(previous);
  claimSession();
  resumeContext(target);
  return run(token,noteGuid,target).catch(error=>{
   if(cancelled(token))return;
   throw error;
  }).finally(()=>{
   if(activeToken!==token)return;
   activeToken=null;releaseSession();
  });
 }

 function stop(){
  if(disposed)return;
  generation++;
  const token=activeToken;activeToken=null;
  if(token)cancelToken(token);
  releaseSession();
 }

 function dispose(){
  if(disposed)return Promise.resolve();
  disposed=true;generation++;
  const token=activeToken;activeToken=null;
  if(token)cancelToken(token);
  releaseSession();
  manifest=null;loading=null;cacheHandle=null;memory.clear();memoryBytes=0;
  const target=context;context=null;
  if(!target)return Promise.resolve();
  try{return Promise.resolve(target.close?.()).catch(()=>{});}catch{return Promise.resolve();}
 }

 return Object.freeze({load,has,play,stop,dispose});
}
