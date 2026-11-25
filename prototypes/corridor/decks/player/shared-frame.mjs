import {mountStudyApp} from '../../vendor/shared-study-engine/client/app/app.mjs';
import * as grammar from '../../vendor/shared-study-engine/client/grammar/renderer.mjs';
import {loadOfflineDictionary} from '../../vendor/shared-study-engine/client/app/dictionary-loader.mjs';
import {prepareOfflineDictionary} from '../../vendor/shared-study-engine/client/player/dictionary.mjs';
import {bindStudyPresentation,bindSharedStudyViewport} from '../../shared-study-presentation.mjs';
import {moduleForSharedDeck,sharedDictionaryBuild} from '../../shared-study-content.mjs';

const root=document.querySelector('#app');
const params=new URLSearchParams(location.search);
const english=params.get('ui')==='en';
const opening=root.querySelector('[role="status"]');
function openingStatus(ja,en) {
  if(opening)opening.textContent=english?en:ja;
}
const json=async(path,hash,withDigest=false)=>{
  const response=await fetch(new URL(path,import.meta.url));if(!response.ok)throw Error('shared-ui-content-unavailable');
  const bytes=await response.arrayBuffer();
  let digest;
  if(hash || withDigest){digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(hash && digest!==hash)throw Error('shared-ui-content-hash');}
  const value=JSON.parse(new TextDecoder().decode(bytes));
  return withDigest?{value,sha256:digest}:value;
};
try {
  const port=window.frameElement?.bunkiStudyPort;
  const adapter=port?.adapter;
  if(!adapter)throw Error('shared-host-frame-binding-required');
  openingStatus('学習教材を開いています…','Opening study materials…');
  const binding=structuredClone(port.binding);
  if(!/^[a-f0-9]{64}$/.test(binding?.dictionary?.buildSha256??''))throw Error('shared-dictionary-binding-required');
  // Read the small pinned resources together. Keep the 163 MB dictionary
  // decode out of grammar preparation's peak memory window.
  const [registry,module,reviews,themes,{value:build,sha256:buildSha256}]=await Promise.all([
    ...['registry.json','grammar.json','grammar-reviews.json'].map(name=>json(`../../data/shared-study/${name}`,binding.grammarAssets[name])),
    json('../../vendor/shared-study-engine/themes/tokens.json'),
    json('../../data/shared-study/BUILD.json',binding.dictionary.buildSha256,true),
  ]);
  const prepared=await grammar.prepareGrammarModule(module,{identityRegistry:registry,reviewIndex:reviews,qaMode:false});
  // Hand the authenticated BUILD and canonical grammar records to the parent
  // observer without waiting for startup or a scan. Setup failure must leave
  // mount and grades usable; this frame never owns another observer.
  try { adapter.ensureAudioPreparation?.({build,grammarRecords:prepared.records})?.catch?.(()=>{}); } catch {}
  let packHost=null,audioDownloadFailure=false;
  const packsConfigured=typeof adapter.ensureAudioPacks==='function';
  if(packsConfigured) {
    try { packHost=await adapter.ensureAudioPacks({build,buildSha256,registry,grammarRecords:prepared.records}); }
    catch { audioDownloadFailure=true; }
  }
  const records=new Map(prepared.records.map(r=>[r.guid,r])),tasks=new Map(prepared.tasks.map(t=>[t.taskKey,t]));
  // Canonical source planning validates plain records/arrays in this realm.
  // Keep exact frozen source bytes, then attach grammar's local WeakMap records.
  const catalog=structuredClone(adapter.catalog).map(entry=>entry.module==='grammar'?{...entry,grammarRecord:records.get(entry.noteGuid),grammarTask:tasks.get(entry.taskKey)}:entry);
  // Only this explicitly bound shared frame loads the full dictionary. The
  // existing stamped SW verifies and lazily caches its compressed asset.
  openingStatus('辞書を開いています…','Opening the study dictionary…');
  const dictionaryInput=await loadOfflineDictionary({
    build:sharedDictionaryBuild(binding,build),base:new URL('../../data/shared-study/',import.meta.url).href,
  });
  openingStatus('例文と辞書の対応を確認しています…','Checking dictionary entries against the study passages…');
  const dictionary=await prepareOfflineDictionary(dictionaryInput,catalog);
  const prefix='bunki-shared-study:appearance:';
  const initialAppearance=typeof port.readAppearance==='function'?port.readAppearance():null;
  let sessionLanguage=initialAppearance?.language||params.get('ui')||null;
  let sessionTheme=initialAppearance?.baseTheme||null;
  const preferences={
    getItem:key=>{
      if(key==='nihongo.interface-language.v1')return sessionLanguage||localStorage.getItem(prefix+key);
      if(key==='nihongo.qa.appearance.v1')return sessionTheme||localStorage.getItem(prefix+key);
      return localStorage.getItem(prefix+key);
    },
    setItem:(key,value)=>{
      if(key==='nihongo.interface-language.v1')sessionLanguage=value;
      if(key==='nihongo.qa.appearance.v1')sessionTheme=value;
      localStorage.setItem(prefix+key,value);
    },
  };
  const corpus={release3FullCorpus:true,vocabularyCount:binding.counts.vocabulary,grammarTasks:binding.counts.grammar,personalVocabularyCount:catalog.filter(e=>e.module==='kotoba').length};
  const backend=bindStudyPresentation(adapter.backend,catalog);
  const initialModule=moduleForSharedDeck(params.get('deck'));
  const audioPort=packsConfigured?(packHost?.audio?{
    protocol:packHost.audio.protocol,release:packHost.audio.release,
    read:(...args)=>packHost.audio.resources.read(...args),
    packState:(...args)=>packHost.audio.resources.packState(...args)}:null):port.audio;
  const audioDownloads=packHost?.audioDownloads;
  const basePlatform=packsConfigured?{...adapter.platform,audio:null,
    audioDownloads:audioDownloads?{...audioDownloads,async readSource({taskKeys,signal}={}) {
      // Allocate only the returned source projection in this realm; keep the signal live.
      return structuredClone(await audioDownloads.readSource({taskKeys,signal}));
    }}:audioDownloads,audioDownloadFailure}:adapter.platform;
  const platform=audioPort?{...basePlatform,audio:{protocol:audioPort.protocol,release:structuredClone(audioPort.release),
    resources:{async read(ref,{signal}={}) {
      if(signal?.aborted)throw new DOMException('Audio read aborted','AbortError');
      const bytes=await audioPort.read(ref,{signal});
      if(signal?.aborted)throw new DOMException('Audio read aborted','AbortError');
      if(!ArrayBuffer.isView(bytes)||Object.prototype.toString.call(bytes)!=='[object Uint8Array]'||bytes.byteLength>2*1024*1024)
        throw Error('shared-audio-byte-resource-required');
      // Copy only the returned view, never padding outside byteOffset/length.
      return new Uint8Array(bytes);
    },packState:packId=>audioPort.packState(packId)}}}:basePlatform;
  // ENGINE-ONE.6: Bridge Bunki's paired voice client into window.nihongoSpeak BEFORE mountStudyApp reads it.
  // When unpaired, voicePort is absent so window.nihongoSpeak stays undefined and the screen stays 100% silent.
  const voicePort=port.voice&&typeof port.voice.speak==='function'?port.voice:null;
  if(voicePort){
    Object.defineProperty(window,'nihongoSpeak',{
      value:Object.freeze({
        web:true,
        speak:(target,speechInput)=>voicePort.speak(target,structuredClone(speechInput)),
        forget:(target,speechInput)=>voicePort.forget?.(target,structuredClone(speechInput)),
      }),
      writable:false,
      configurable:true,
    });
  }
  // Bunki's origin serves none of Nihongo Study's Kore trial clips. A canonical screen whose host gives it no
  // voice looks for their manifest on its page origin at every mount. Naming an origin that is none keeps that
  // screen silent and asks the network nothing; a host that brings a voice never reaches the trial player.
  const app=mountStudyApp(root,{backend,catalog,themes,grammar,dictionary,preferences,platform:{audioOrigin:'about:blank',...platform,embedded:true},now:adapter.now,initialModule,corpus});
  function applyHostAppearance(next,{syncLanguage=false}={}) {
    if(!next||!document.documentElement?.style)return;
    const base=themes?.themes?.[next.baseTheme];
    if(base?.tokens){
      for(const [key,value] of Object.entries(base.tokens))document.documentElement.style.setProperty(`--${key}`,value);
      document.documentElement.dataset.theme=next.baseTheme;
      document.documentElement.style.colorScheme=base.scheme;
      sessionTheme=next.baseTheme;
    }
    if(next.tokens){
      for(const [key,value] of Object.entries(next.tokens)){
        if(typeof value==='string'&&value)document.documentElement.style.setProperty(`--${key}`,value);
      }
    }
    if(next.look)document.documentElement.dataset.bunkiTheme=next.look;
    if(syncLanguage&&next.language&&next.language!==sessionLanguage){
      sessionLanguage=next.language;
      const cur=app.read?.();
      if(cur&&cur.interfaceLanguage!==next.language){
        const applySelect=()=>{
          const select=root.querySelector('select[data-interface-language]');
          if(!select)return false;
          select.value=next.language;
          select.dispatchEvent(new Event('change',{bubbles:true}));
          return true;
        };
        if(!applySelect()&&cur.screen!=='study'&&cur.screen!=='finish'&&!cur.busy&&!cur.current){
          const prev=cur.screen;
          app.navigate?.('settings');
          applySelect();
          if(prev&&prev!=='settings')app.navigate?.(prev);
        }
      }
    }
  }
  applyHostAppearance(initialAppearance);
  const disposeAppearance=typeof port.subscribeAppearance==='function'?port.subscribeAppearance(next=>applyHostAppearance(next,{syncLanguage:true})):()=>{};
  const disposeViewport=bindSharedStudyViewport({app,root,onCardStart:port.onCardStart});
  // Rotating changes the parent header and the trial copy's line wrapping. Seat
  // the same card below the new header without remounting its reading surface.
  let frameWidth = window.innerWidth;
  const onResize = () => {
    if (window.innerWidth === frameWidth) return;
    frameWidth = window.innerWidth;
    if (app.read().screen === 'study') port.onCardStart?.();
  };
  window.addEventListener('resize', onResize);
  if(params.get('start')==='1')root.querySelector('[data-start]')?.click();
  window.bunkiSharedStudy=Object.freeze({app,backend:adapter.backend,store:adapter.store,catalog,dictionary});
  function onPagehide(event) {
    if (event?.persisted === true) return;
    window.removeEventListener('pagehide', onPagehide);
    disposeAppearance();
    voicePort?.abortAll?.();
    window.removeEventListener('resize', onResize);
    disposeViewport();
    app.dispose();
  }
  window.addEventListener('pagehide', onPagehide);
} catch(error) {
  root.replaceChildren();
  const message=document.createElement('p');
  message.setAttribute('role','alert');
  message.textContent=english?'Study materials could not be opened.':'学習教材を開けませんでした。';
  root.append(message);
  if(window.frameElement?.bunkiStudyPort?.adapter) {
    const retry=document.createElement('button');
    retry.type='button';
    retry.textContent=english?'Try opening again':'もう一度開く';
    retry.onclick=()=>location.reload();
    root.append(retry);
  }
  const details=document.createElement('details'),label=document.createElement('summary'),reason=document.createElement('p');
  label.textContent=english?'Technical details':'詳細';
  reason.textContent=String(error?.message||error);
  details.append(label,reason);root.append(details);
}
