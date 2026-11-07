import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const voice = readFileSync(new URL('../device-voice.mjs', import.meta.url), 'utf8');
const scope = 'https://bunki.test/';
async function install({failVoice=false}={}) {
 const events=new Map(), store=new Map();let online=true;
 const key=q=>typeof q==='string'?q:q.url;
 const cache={
  async addAll(requests){
   const rows=await Promise.all(requests.map(async r=>[key(r),await fetcher(r)]));
   if(rows.some(([,r])=>!r.ok))throw Error('required boot asset unavailable');
   for(const [k,v] of rows)store.set(k,v);
  },
  async match(q){return store.get(key(q))?.clone();},
  async put(q,r){store.set(key(q),r.clone());}
 };
 async function fetcher(req){
  if(!online)throw Error('offline');
  const u=key(req);
  if(u===scope+'device-voice.mjs')return new Response(voice,{status:failVoice?503:200});
  return new Response('fixture asset');
 }
 runInNewContext(source,{
  self:{registration:{scope},location:{origin:'https://bunki.test'},addEventListener:(type,f)=>events.set(type,f)},
  caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},
  Request,Response,URL,fetch:fetcher,console,TextEncoder,TextDecoder,
 });
 let installed;events.get('install')({waitUntil:p=>{installed=p;}});await installed;
 online=false;
 return async path=>{
  let response;const waits=[];
  events.get('fetch')({request:new Request(scope+path),respondWith:p=>{response=p;},waitUntil:p=>waits.push(p)});
  const r=await response;await Promise.all(waits);return r;
 };
}
const read=await install();
const response=await read('device-voice.mjs');
assert.equal(response.status,200,'first offline launch must have the imported voice module');
assert.equal(await response.text(),voice,'offline bytes must be the installed voice module');
await assert.rejects(install({failVoice:true}),/required boot asset unavailable/);
console.log('PASS: first offline module request succeeds; missing required voice bytes reject installation');
