import {mountStudyApp} from '../../vendor/shared-study-engine/client/app/app.mjs';
import * as grammar from '../../vendor/shared-study-engine/client/grammar/renderer.mjs';
import {loadOfflineDictionary} from '../../vendor/shared-study-engine/client/app/dictionary-loader.mjs';
import {prepareOfflineDictionary} from '../../vendor/shared-study-engine/client/player/dictionary.mjs';
import {bindStudyPresentation} from '../../shared-study-presentation.mjs';
import {moduleForSharedDeck,sharedDictionaryBuild} from '../../shared-study-content.mjs';

const root=document.querySelector('#app');
const json=async(path,hash)=>{
  const response=await fetch(new URL(path,import.meta.url));if(!response.ok)throw Error('shared-ui-content-unavailable');
  const bytes=await response.arrayBuffer();
  if(hash){const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==hash)throw Error('shared-ui-content-hash');}
  return JSON.parse(new TextDecoder().decode(bytes));
};
try {
  const adapter=window.frameElement?.bunkiStudyPort?.adapter;
  if(!adapter)throw Error('shared-host-frame-binding-required');
  const binding=await json('../../data/shared-study-content.json');
  if(!/^[a-f0-9]{64}$/.test(binding.dictionary?.buildSha256??''))throw Error('shared-dictionary-binding-required');
  const [registry,module,reviews,themes,build]=await Promise.all([
    ...['registry.json','grammar.json','grammar-reviews.json'].map(name=>json(`../../data/shared-study/${name}`,binding.grammarAssets[name])),
    json('../../vendor/shared-study-engine/themes/tokens.json'),
    json('../../data/shared-study/BUILD.json',binding.dictionary.buildSha256),
  ]);
  // The canonical preparer validates every frozen example, cloze target, reading
  // span and translation binding. No Bunki reimplementation of grammar faces.
  const prepared=await grammar.prepareGrammarModule(module,{identityRegistry:registry,reviewIndex:reviews,qaMode:false});
  const records=new Map(prepared.records.map(r=>[r.guid,r])),tasks=new Map(prepared.tasks.map(t=>[t.taskKey,t]));
  // Canonical source planning validates plain records/arrays in this realm.
  // Keep exact frozen source bytes, then attach grammar's local WeakMap records.
  const catalog=structuredClone(adapter.catalog).map(entry=>entry.module==='grammar'?{...entry,grammarRecord:records.get(entry.noteGuid),grammarTask:tasks.get(entry.taskKey)}:entry);
  // Only this explicitly bound shared frame loads the full dictionary. The
  // existing stamped SW verifies and lazily caches its compressed asset.
  const dictionary=await prepareOfflineDictionary(await loadOfflineDictionary({build:sharedDictionaryBuild(binding,build),base:new URL('../../data/shared-study/',import.meta.url).href}),catalog);
  const params=new URLSearchParams(location.search),prefix='bunki-shared-study:appearance:';
  const preferences={getItem:key=>key==='nihongo.interface-language.v1'?localStorage.getItem(prefix+key)||params.get('ui'):localStorage.getItem(prefix+key),setItem:(key,value)=>localStorage.setItem(prefix+key,value)};
  const corpus={release3FullCorpus:true,vocabularyCount:binding.counts.vocabulary,grammarTasks:binding.counts.grammar,personalVocabularyCount:catalog.filter(e=>e.module==='kotoba').length};
  const backend=bindStudyPresentation(adapter.backend,catalog);
  const initialModule=moduleForSharedDeck(params.get('deck'));
  const audioPort=window.frameElement.bunkiStudyPort.audio;
  const platform=audioPort?{...adapter.platform,audio:{protocol:audioPort.protocol,release:structuredClone(audioPort.release),
    resources:{async read(ref,{signal}={}) {
      if(signal?.aborted)throw new DOMException('Audio read aborted','AbortError');
      const bytes=await audioPort.read(ref,{signal});
      if(signal?.aborted)throw new DOMException('Audio read aborted','AbortError');
      if(!ArrayBuffer.isView(bytes)||Object.prototype.toString.call(bytes)!=='[object Uint8Array]'||bytes.byteLength>2*1024*1024)
        throw Error('shared-audio-byte-resource-required');
      // Copy only the returned view, never padding outside byteOffset/length.
      return new Uint8Array(bytes);
    },packState:packId=>audioPort.packState(packId)}}}:adapter.platform;
  const app=mountStudyApp(root,{backend,catalog,themes,grammar,dictionary,preferences,platform,now:adapter.now,initialModule,corpus});
  if(params.get('start')==='1')root.querySelector('[data-start]')?.click();
  window.bunkiSharedStudy=Object.freeze({app,backend:adapter.backend,store:adapter.store,catalog,dictionary});
  window.addEventListener('pagehide',()=>app.dispose(),{once:true});
} catch(error) {root.replaceChildren();const p=document.createElement('p');p.setAttribute('role','alert');p.textContent=`Shared study could not open: ${error.message}`;root.append(p);}
