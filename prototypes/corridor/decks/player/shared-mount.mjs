/** Host the exact canonical study UI in a same-origin frame. No second player,
 * admission policy, or legacy-ledger writer is implemented in this module. */
import {sharedStudyRuntime} from '../../shared-study-runtime.mjs';
let serial=0;
const element=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};

export function renderSharedFence(main,{english=true,onLeave}={}) {
  const p=element('p',english?'This practice contract is not mapped to shared study. Its existing history is preserved; grading is unavailable here.':'この練習は共通の学習にまだ対応していません。記録は保持され、ここでは採点しません。');
  main.append(p);if(onLeave){const back=element('button',english?'Back':'戻る');back.type='button';back.onclick=onLeave;main.append(back);}
}

export async function render(main,{deckId,english=true,onLeave,autoStart}={}) {
  const request=++serial,root=element('section');root.dataset.sharedStudy='loading';main.append(root);
  root.append(element('p',english?'Opening shared study…':'共通の学習を開いています…'));
  let adapter;
  try {adapter=await sharedStudyRuntime();}
  catch(error){
    if(request!==serial||!root.isConnected)return;root.dataset.sharedStudy='blocked';root.replaceChildren();
    root.append(element('p',english?'Your previous deck history is preserved. Shared study needs a connected learner profile before grading.':'これまでの記録は保持されています。共通の学習には学習者プロフィールの接続が必要です。'));
    root.append(element('p',String(error.message)));
    if(error.message==='shared-profile-not-bound'){
      const link=element('a',english?'Open isolated study preview':'記録を分けて学習を試す'),url=new URL(location.href);
      url.searchParams.set('deck',deckId);url.searchParams.set('sharedStudy','preview');link.href=url.href;root.append(link);
    }
    if(onLeave){const back=element('button',english?'Back':'戻る');back.onclick=onLeave;root.append(back);}return;
  }
  if(request!==serial||!root.isConnected)return;root.replaceChildren();root.dataset.sharedStudy='ready';
  const back=element('button',english?'Back to Bunki':'Bunkiに戻る');back.type='button';back.onclick=onLeave;root.append(back);
  if(adapter.identity.environment==='test-bunki-shared-preview')root.append(element('p',english?'Trial copy. Your real study record stays as it is.':'試しの写し。実際の学習記録はそのままです。'));
  const frame=element('iframe');frame.title=english?'Shared study':'共通の学習';frame.dataset.sharedStudyFrame='';
  frame.style.cssText='display:block;width:100%;height:calc(100dvh - 9rem);min-height:38rem;border:0';
  const url=new URL('./shared-frame.html',import.meta.url);url.searchParams.set('deck',deckId);url.searchParams.set('ui',english?'en':'ja');if(autoStart)url.searchParams.set('start','1');
  // The child receives the already bound backend, never credentials or a new
  // independent learner identity. This port is same-origin and frame-specific.
  // The same-origin child has a distinct JS realm. Preserve the host resource
  // authority, but clone data descriptors in the realm that validates them.
  // Callbacks and AbortSignal retain their original identity across this port.
  const capability=adapter.platform.audio;
  const audio=capability?Object.freeze({protocol:capability.protocol,release:structuredClone(capability.release),
    async read(ref,{signal}={}) {
      if(signal?.aborted)throw new DOMException('Audio read aborted','AbortError');
      const bytes=await capability.resources.read(structuredClone(ref),{signal});
      if(signal?.aborted)throw new DOMException('Audio read aborted','AbortError');
      return bytes;
    },packState:packId=>capability.resources.packState(packId)}):null;
  const onCardStart=()=>{
    if(request!==serial||!root.isConnected||!frame.isConnected||frame.parentNode!==root)return;
    const chromeBottom=Math.max(0,document.querySelector('.chrome')?.getBoundingClientRect().bottom??0);
    const target=window.scrollY+frame.getBoundingClientRect().top-chromeBottom;
    window.scrollTo({top:Math.max(0,target),behavior:'instant'});
  };
  frame.bunkiStudyPort=Object.freeze({adapter,onCardStart,...(audio?{audio}:{})});frame.src=url.href;root.append(frame);
}

export async function summary(deckId) {
  try{return await(await sharedStudyRuntime()).summary(deckId);}catch{return {due:0,fresh:0,total:0,words:0,begun:0,authority:'shared-v4-unbound'};}
}
export async function missedTerms(deckId,since) {
  try{return await(await sharedStudyRuntime()).missedTerms(deckId,since);}catch{return [];}
}
