import {createBunkiStudyAdapter} from './study-engine-adapter.mjs';
import {loadSharedContent} from './shared-study-content.mjs';
import {createSharedStudyStorage} from './shared-study-storage.mjs';
import {dayBounds,payloadHash} from './vendor/shared-study-engine/client/engine.mjs';

let runtime=null;
/** The product shell supplies an authenticated identity/storage/transport binding.
 * Existing Bunki schedules cannot be guessed into that binding. */
export function sharedStudyRuntime() {
  if (runtime) return runtime;
  const host=globalThis.bunkiSharedStudyHost;
  const preview=new URLSearchParams(globalThis.location?.search||'').get('sharedStudy')==='preview';
  if (!host && !preview) return Promise.reject(Error('shared-profile-not-bound'));
  runtime=(async()=>{
    const {content}=await loadSharedContent();
    if (host) return createBunkiStudyAdapter({...host,content});
    // Deliberately isolated preview, never a migration or a production authority.
    if(!globalThis.navigator?.locks)throw Error('shared-preview-profile-lock-required');
    return navigator.locks.request('bunki-shared-study-preview-profile-v1',async()=>{
    const key='bunki-shared-study:preview-install:v1';
    const existing=localStorage.getItem(key),installation=existing||`test-bunki-${crypto.randomUUID()}`;
    const identity={learner:'test-bunki-shared-preview',environment:'test-bunki-shared-preview',installation,mode:existing?'open':'fresh'};
    const storage=createSharedStudyStorage({databaseName:'bunki-shared-study-preview-v1'});
    const adapter=await createBunkiStudyAdapter({content,storage,identity,initialize:async({store})=>{
      if (existing) return;
      if (store.scope.learner!=='test-bunki-shared-preview'||store.scope.environment!=='test-bunki-shared-preview'||!store.scope.installation.startsWith('test-bunki-')) throw Error('preview-scope-required');
      const ts=Date.now(),event={v:4,id:'@server:1',learner:store.scope.learner,install:'@server',dseq:1,base:0,ts,epoch:0,policy:'nsrs-policy-v1',type:'permit-grant',
        data:{install:store.scope.installation,permitIds:Array.from({length:20},(_,i)=>`preview-intro-${i+1}`),...dayBounds(ts,'Asia/Tokyo')}};
      await store.reconcile({events:[{seq:1,rt:ts,authority:'server',event,bodyHash:payloadHash(event)}],head:1});
    }});
    if (!existing) localStorage.setItem(key,installation);
    return adapter;
    });
  })().catch(error=>{runtime=null;throw error;});
  return runtime;
}
