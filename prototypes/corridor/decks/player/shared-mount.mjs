/** Host the exact canonical study UI in a same-origin frame. No second player,
 * admission policy, or legacy-ledger writer is implemented in this module. */
import {sharedStudyRuntime,sharedPresentationBinding} from '../../shared-study-runtime.mjs';
import {openBunkiStudyVoice} from '../../modules/shared-study-voice.mjs';
let serial=0;
const element=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};

const NIGHT_LOOKS=new Set(['rokusho','yoru','kin','nami','hakuu','kaku','kara']);
const INDIGO_NIGHT_LOOKS=new Set(['yoru','kin','nami']);
const cssVar=(style,name)=>style?.getPropertyValue(name)?.trim()||'';

/** Read Bunki's active 11-look theme and language so the embedded study frame sits seamlessly
 * on the parent paper/night surface without double chrome or contrast clashes. */
export function readHostAppearance({english=true}={}) {
  const html=document.documentElement;
  const raw=(html?.getAttribute('data-theme')||'').trim().toLowerCase();
  const look=raw||'hokusai';
  const isNight=NIGHT_LOOKS.has(look);
  const baseTheme=isNight?(INDIGO_NIGHT_LOOKS.has(look)?'ai':'dark'):'washi';
  const rootStyle=typeof getComputedStyle==='function'&&html?getComputedStyle(html):null;
  const bodyStyle=typeof getComputedStyle==='function'&&document.body?getComputedStyle(document.body):null;
  const pick=(...names)=>{
    for(const name of names){
      const fromBody=cssVar(bodyStyle,name);
      if(fromBody)return fromBody;
      const fromRoot=cssVar(rootStyle,name);
      if(fromRoot)return fromRoot;
    }
    return '';
  };
  const ground=pick('--ground')||(isNight?'#131a30':'#f1e9d3');
  const ink=pick('--ink')||(isNight?'#f4ecd9':'#1c2f42');
  const ink2=pick('--ink-2')||(isNight?`color-mix(in srgb, ${ink} 82%, ${ground})`:`color-mix(in srgb, ${ink} 78%, ${ground})`);
  const surface=pick('--ground-0')||(isNight?`color-mix(in srgb, ${ground} 88%, ${ink})`:`color-mix(in srgb, ${ground} 58%, #ffffff)`);
  const raised=isNight?`color-mix(in srgb, ${surface} 90%, ${ink})`:(pick('--ground-2')||`color-mix(in srgb, ${ground} 86%, ${ink})`);
  const overlay=isNight?`color-mix(in srgb, ${surface} 84%, ${ink})`:surface;
  const line=pick('--line')||(isNight?`color-mix(in srgb, ${ink} 20%, transparent)`:`color-mix(in srgb, ${ink} 16%, transparent)`);
  const lineStrong=`color-mix(in srgb, ${ink} 42%, transparent)`;
  const muted=isNight?`color-mix(in srgb, ${ink} 74%, ${ground})`:ink2;
  const red=pick('--red')||(isNight?'#ef8079':'#b03a2e');
  const ai=pick('--ai')||(isNight?'#d9b25f':'#2a4f6f');
  const accent=isNight?ai:red;
  const onAccent=isNight?ground:'#ffffff';
  const hasUiClass=!!document.body&&(document.body.classList.contains('ui-bi')||document.body.dataset.ready==='1');
  const htmlLang=(html?.getAttribute('lang')||'').toLowerCase();
  const language=hasUiClass?(document.body.classList.contains('ui-bi')?'en':'ja'):(htmlLang==='ja'?'ja':htmlLang==='en'?'en':(english?'en':'ja'));
  return Object.freeze({
    look,
    baseTheme,
    scheme:isNight?'dark':'light',
    language,
    tokens:Object.freeze({
      ground,
      surface,
      raised,
      overlay,
      ink,
      secondary:ink2,
      muted,
      line,
      'line-strong':lineStrong,
      accent,
      'on-accent':onAccent,
      vermilion:red,
      texture:'none',
    }),
  });
}

function subscribeHostAppearance(listener,{english=true}={}) {
  if(typeof MutationObserver!=='function'||!document.documentElement)return ()=>{};
  let disposed=false;
  const push=()=>{if(!disposed)listener(readHostAppearance({english}));};
  const rootObserver=new MutationObserver(push);
  rootObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-live-depth','lang']});
  let bodyObserver=null;
  if(document.body){
    bodyObserver=new MutationObserver(push);
    bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  }
  return ()=>{
    disposed=true;
    rootObserver.disconnect();
    bodyObserver?.disconnect();
  };
}

export function renderSharedFence(main,{english=true,onLeave}={}) {
  const p=element('p',english?'This practice contract is not mapped to shared study. Its existing history is preserved; grading is unavailable here.':'この練習は共通の学習にまだ対応していません。記録は保持され、ここでは採点しません。');
  main.append(p);if(onLeave){const back=element('button',english?'Back':'戻る');back.type='button';back.onclick=onLeave;main.append(back);}
}

/** A paired study surface whose pairing is no more (the server refused it, or another tab forgot or changed it):
 * the engine's screen goes and the page says why in plain words, with the one step that brings study back. */
function renderClosed(root,notice,{english,onLeave}) {
  root.dataset.sharedStudy='ended';root.dataset.sharedStudyReason=String(notice.code);root.replaceChildren();
  root.append(element('p',english?notice.line[1]:notice.line[0]));
  const again=element('button',english?'Reopen Bunki':'Bunki を開き直す');again.type='button';again.onclick=()=>location.reload();root.append(again);
  if(onLeave){const back=element('button',english?'Back':'戻る');back.type='button';back.onclick=onLeave;root.append(back);}
}

export async function render(main,{deckId,english=true,onLeave,autoStart}={}) {
  const request=++serial,root=element('section');root.dataset.sharedStudy='loading';main.append(root);
  // a paired host that has stopped on this page does not start again here: the page says so and offers to reopen
  const paired=globalThis.bunkiSharedStudyHost,stopped=paired?.closed?.();
  if(stopped){renderClosed(root,stopped,{english,onLeave});return;}
  root.append(element('p',english?'Opening shared study…':'共通の学習を開いています…'));
  let adapter,voice=null;
  try {[adapter,voice]=await Promise.all([sharedStudyRuntime(),openBunkiStudyVoice().catch(()=>null)]);}
  catch(error){
    if(request!==serial||!root.isConnected)return;root.dataset.sharedStudy='blocked';root.replaceChildren();
    // A paired host says its own refusal in plain words ([ja, en]); every other cause keeps the general line and its code.
    const line=Array.isArray(error?.bunkiLine)&&error.bunkiLine.length===2?error.bunkiLine:null;
    if(line){root.dataset.sharedStudyReason=String(error.message);root.append(element('p',english?line[1]:line[0]));}
    else{
    root.append(element('p',english?'Your previous deck history is preserved. Shared study needs a connected learner profile before grading.':'これまでの記録は保持されています。共通の学習には学習者プロフィールの接続が必要です。'));
    root.append(element('p',String(error.message)));
    }
    if(error.message==='shared-profile-not-bound'){
      const link=element('a',english?'Open isolated study preview':'記録を分けて学習を試す'),url=new URL(location.href);
      url.searchParams.set('deck',deckId);url.searchParams.set('sharedStudy','preview');link.href=url.href;root.append(link);
    }
    if(onLeave){const back=element('button',english?'Back':'戻る');back.onclick=onLeave;root.append(back);}return;
  }
  if(request!==serial||!root.isConnected){voice?.abortAll?.();return;}
  root.replaceChildren();root.dataset.sharedStudy='ready';
  const disposers=new Set();
  const cleanup=()=>{
    for(const stop of [...disposers]){try{stop();}catch{/* ignore */}}
    disposers.clear();
    voice?.abortAll?.();
    try{frame.contentWindow?.bunkiSharedStudy?.app?.dispose?.();}catch{/* frame already gone */}
  };
  const back=element('button',english?'← Back to Bunki':'← Bunkiに戻る');
  back.type='button';back.className='shared-study-back';
  back.onclick=()=>{cleanup();onLeave?.();};
  root.append(back);
  if(adapter.identity.environment==='test-bunki-shared-preview')root.append(element('p',english?'Trial copy. Your real study record stays as it is.':'試しの写し。実際の学習記録はそのままです。'));
  const frame=element('iframe');frame.title=english?'Shared study':'共通の学習';frame.dataset.sharedStudyFrame='';
  frame.allow='autoplay';
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
    frame.style.setProperty('--shared-study-chrome-height', `${chromeBottom}px`);
    const target=window.scrollY+frame.getBoundingClientRect().top-chromeBottom;
    window.scrollTo({top:Math.max(0,target),behavior:'instant'});
  };
  const readAppearance=()=>readHostAppearance({english});
  const subscribeAppearance=(listener)=>{
    const stop=subscribeHostAppearance(listener,{english});
    disposers.add(stop);
    return ()=>{disposers.delete(stop);stop();};
  };
  frame.bunkiStudyPort=Object.freeze({adapter,binding:sharedPresentationBinding(adapter),onCardStart,readAppearance,subscribeAppearance,...(audio?{audio}:{}),...(voice?{voice}:{})});
  frame.src=url.href;root.append(frame);
  // the pairing ending under an open screen closes the screen: nothing more is answered into a copy that cannot be sent
  const unhear=paired?.onClosed?.(notice=>{unhear?.();if(request!==serial||!root.isConnected)return;cleanup();renderClosed(root,notice,{english,onLeave});});
  if(unhear)disposers.add(unhear);
}

export async function summary(deckId) {
  try{return await(await sharedStudyRuntime()).summary(deckId);}catch{return {due:0,fresh:0,total:0,words:0,begun:0,authority:'shared-v4-unbound'};}
}
export async function missedTerms(deckId,since) {
  try{return await(await sharedStudyRuntime()).missedTerms(deckId,since);}catch{return [];}
}
