/** The ear (voice plan N2; John 2026-11-10/11): one gesture speaks any Japanese on any screen, as in Bunki, wearing the
 * same seal. Off: everything behaves as before and Option-click speaks. One tap on the mark arms it, and it stays on
 * until the mark is tapped again or the card changes (John, 2026-11-17): every click on Japanese speaks and does nothing
 * else, sentence after sentence, in any order; the app's own buttons act as always. A long press holds it on: on the Mac
 * a 0.4 s rest of the pointer speaks (once per rest; clicks behave as usual), on the phone every tap speaks until the mark
 * is tapped off or the card changes.
 * A second tap on the unit being spoken stops it; one sound at a time. No voice: the mark is struck with one plain line
 * for about four seconds, without changing its mode. Card fronts speak only when the ear is armed or held on.
 *
 * Pure: the state machine, the unit finder (over DOM-like nodes: nodeType, tagName, nodeValue, childNodes, parentNode,
 * getAttribute, hasAttribute, nextElementSibling) and the event handlers take plain inputs. The caller supplies the
 * speech, timers and painting; only buildEarMark touches a real document, and only the one it is given. */
import {splitSentences,isJapaneseEnough} from '../audio/speech-text.mjs';
import {speakableText,offsetOf,rangeFor} from '../audio/speech-highlight.mjs';
import {createBandLayer,footBands,scrollClip} from '../audio/speech-bands.mjs';
import {renderInterfacePair} from './interface-language.mjs';
import {speakLineKind} from './card-speak-route.mjs';
import {VOICE_CAUSES,VOICE_STANDING,voiceLine,earLabel} from '../audio/voice-lines.mjs';

export const EAR_REST_MS=400,EAR_NOVOICE_MS=4000,EAR_LONG_PRESS_MS=500;
export const EAR_STATES=Object.freeze(['off','armed','held','speaking','novoice']);
/** N7: the ear's no-voice reasons are the causes of the one vocabulary (voice-lines.mjs), the card's own. */
export const EAR_REASONS=Object.freeze(Object.keys(VOICE_CAUSES));

/** A speak error code as one of the no-voice reasons: the card's own line kind (its cause), so a refusal reads the same
 * through the ear as on the card (N7: a 401 as "pair again", a timeout as "too slow", a clip that would not play as such). */
export function earReason(code){return speakLineKind(code);}

/** Why speech cannot be asked for right now, or null when it can. Nothing is requested when this is not null. Offline is
 * not decided here: the web bridge answers from a clip kept on the device, or says offline itself with no request. */
export function earAvailability({bridge=null,dynamicSpeech='unknown'}={}){
 if(!bridge||typeof bridge.speak!=='function')return 'not-paired';
 if(dynamicSpeech==='off')return 'no-new-sentences';
 return null;
}

/** Same host and same span: the same unit. */
export function sameEarUnit(a,b){return !!a&&!!b&&a.host===b.host&&a.start===b.start&&a.end===b.end;}

// ---------------------------------------------------------------- the state machine
export function createEar({phone=false,availability=()=>null,speak,paint=()=>{},aim=()=>{},quiet=()=>false,
 setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),restMs=EAR_REST_MS,noVoiceMs=EAR_NOVOICE_MS}={}){
 if(typeof speak!=='function')throw new TypeError('speak must be a function');
 let mode='off',voice=null,novoice=null,novoiceTimer=null,rest=null,restTimer=null,aimed=null,disposed=false,restBlocked=false;
 const view=()=>Object.freeze({state:novoice?'novoice':voice?'speaking':mode,mode,reason:novoice?.reason??null,unit:voice?.unit??null,aimed});
 const show=()=>{if(!disposed)try{paint(view());}catch{}};
 const setAim=unit=>{
  if(aimed===unit||sameEarUnit(aimed,unit))return;
  aimed=unit;try{aim(unit);}catch{}
 };
 const clearRest=()=>{if(restTimer!==null)clearTimer(restTimer);restTimer=null;rest=null;};
 const clearNoVoice=()=>{if(novoiceTimer!==null)clearTimer(novoiceTimer);novoiceTimer=null;novoice=null;};
 const stopVoice=()=>{const current=voice;voice=null;if(current)current.controller.abort();};
 function noVoice(reason,unit){
  // A standing refusal consumes future pointer rests too; a deliberate request may still try.
  if(Object.hasOwn(VOICE_STANDING,reason))restBlocked=true;
  clearNoVoice();clearRest();rest={unit};setAim(null);
  // Keep this rest consumed: a failed hover must not retry on the next pointermove.
  novoice={reason:EAR_REASONS.includes(reason)?reason:'failed'};show();
  novoiceTimer=setTimer(()=>{novoiceTimer=null;novoice=null;show();},noVoiceMs);
 }
 function startVoice(unit,deliberate=false){
  let reason=null;
  try{reason=availability(unit);}catch{reason='failed';}
  stopVoice();
  if(reason){noVoice(reason,unit);return;}
  clearNoVoice();
  const controller=new AbortController(),token={unit,controller};
  voice=token;show();
  let pending;
  try{pending=speak(unit,controller.signal);}catch(error){pending=Promise.reject(error);}
  Promise.resolve(pending).then(result=>{
   if(voice!==token||disposed)return;
   // Recovery is learned from a completed deliberate request, never a stop or an automatic probe.
   if(deliberate&&result!=='stopped')restBlocked=false;
   voice=null;show();
  },error=>{
   if(voice!==token||disposed)return;
   voice=null;
   if(controller.signal.aborted){show();return;}
   noVoice(earReason(typeof error?.code==='string'?error.code:null),unit);
  });
 }
 return Object.freeze({
  read:view,
  /** One tap on the mark: off ↔ armed; held → off. A voice already speaking goes on until a tap replaces or stops it. */
  tapMark(){
   if(disposed)return;
   clearNoVoice();clearRest();
   mode=mode==='off'?'armed':'off';
   setAim(null);show();
  },
  /** A long press on the mark: held on. */
  pressMark(){
   if(disposed)return;
   clearNoVoice();clearRest();mode='held';show();
  },
  /** A click or tap that reached Japanese (unit) or not (null). True when it is the ear's alone. */
  click({unit=null,altKey=false,touch=phone}={}){
   if(disposed||!unit)return false;
   // R-a (John via the lead, 2026-11-11): held on the phone, the app's own controls act as they always do (he can always
   // grade with the ear held on); only Japanese text that is not a control speaks. N8e (John, 2026-11-17): armed stays on,
   // so armed too leaves the app's buttons to do their job, while the card's own text, its question side included, speaks.
   // An Option-click is a deliberate request for a control's Japanese and still speaks it.
   const ours=mode==='armed'&&unit.button!==true||altKey===true||mode==='held'&&touch===true&&unit.control!==true;
   if(!ours)return false;
   if(unit.front&&mode!=='armed'&&mode!=='held')return false;
   if(voice&&sameEarUnit(voice.unit,unit)){stopVoice();show();return true;}
   startVoice(unit,true);
   return true;
  },
  /** A new card (John, 2026-11-17: on "until you explicitly click the button back off, or else change cards"): armed or
   * held, the ear goes off, and a voice of the ear's stops with the card it belonged to. Turning the card over is not a
   * new card, and leaving the cards is not one either; the app calls this when a card other than the ear's own is shown. */
  cardChanged(){
   if(disposed)return;
   clearNoVoice();clearRest();setAim(null);
   mode='off';
   if(voice)stopVoice();
   show();
  },
  /** The mouse is over this unit (or none). Held on the Mac, a rest of restMs speaks it once per rest. */
  rest(unit){
   if(disposed)return;
   if(mode==='off'){setAim(null);clearRest();return;}
   setAim(unit??null);
   if(mode!=='held'||phone){clearRest();return;}
   if(rest&&(rest.unit===unit||sameEarUnit(rest.unit,unit)))return;
   clearRest();
   // A rest is not a deliberate act: it never reads a card's front (that would give the answer away) nor text the
   // learner typed. A tap, an armed tap or an Option-click still does.
   if(!unit||unit.front||unit.typed||restBlocked)return;
   const entry={unit};rest=entry;
   // N5: while a passage is read aloud nothing says itself by its own accord, so a rest stays silent then.
   restTimer=setTimer(()=>{restTimer=null;if(rest!==entry||mode!=='held'||disposed)return;let hush=false;try{hush=quiet()===true;}catch{}if(hush)return;startVoice(unit);},restMs);
  },
  /** Stop the ear's voice, if any. */
  stop(){if(voice){stopVoice();show();}},
  dispose(){
   if(disposed)return;
   clearNoVoice();clearRest();stopVoice();disposed=true;
  },
 });
}

// ---------------------------------------------------------------- event handlers
/** Document-level capture handlers. With the ear off and no Option key they do nothing at all. */
export function createEarHandlers({ear,find,phone=false,caretAt=()=>null,isMark=()=>false}){
 let pointerType='mouse';
 const caret=event=>{try{return caretAt(event)??null;}catch{return null;}};
 return Object.freeze({
  pointerdown(event){if(typeof event?.pointerType==='string'&&event.pointerType)pointerType=event.pointerType;},
  click(event){
   if(isMark(event.target))return;
   const {mode}=ear.read(),touch=phone||pointerType==='touch';
   if(!(mode==='armed'||event.altKey===true||mode==='held'&&touch))return;
   if(event.button!==undefined&&event.button!==0)return;
   let unit=null;
   try{unit=find(event.target,{caret:caret(event),mode});}catch{unit=null;}
   if(!ear.click({unit,altKey:event.altKey===true,touch}))return;
   event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
  },
  pointermove(event){
   if(phone||event.pointerType&&event.pointerType!=='mouse')return;
   const {mode}=ear.read();
   if(mode==='off'||isMark(event.target)){ear.rest(null);return;}
   let unit=null;
   try{unit=find(event.target,{caret:caret(event),mode});}catch{unit=null;}
   ear.rest(unit);
  },
  pointerleave(){ear.rest(null);},
  /** Escape, as in Bunki: speaking, it stops the ear's voice; armed, it disarms the ear; either way that press does
   * nothing else. Held and silent, or off, it is the app's own key (the ear stays held). */
  keydown(event){
   if(event.key!=='Escape'||event.isComposing)return;
   const {state,mode}=ear.read();
   if(state==='speaking')ear.stop();
   else if(mode==='armed')ear.tapMark();
   else return;
   event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
  },
 });
}

/** The mark's own handlers: a short press taps, a long press holds (the click that ends it is not a tap). */
export function createEarMarkHandlers({ear,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),longPressMs=EAR_LONG_PRESS_MS}){
 let timer=null,pressed=false;
 const cancel=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 return Object.freeze({
  pointerdown(event){
   if(event.button!==undefined&&event.button!==0)return;
   cancel();pressed=false;
   timer=setTimer(()=>{timer=null;pressed=true;ear.pressMark();},longPressMs);
  },
  pointerup(){cancel();},
  pointercancel(){cancel();},
  pointerleave(){cancel();},
  contextmenu(event){event.preventDefault();cancel();if(!pressed){pressed=true;ear.pressMark();}},
  click(event){
   event.preventDefault();event.stopPropagation();
   if(pressed&&event.detail!==0){pressed=false;return;}
   pressed=false;ear.tapMark();
  },
 });
}

// ---------------------------------------------------------------- the unit that speaks
const attr=(el,name)=>typeof el?.getAttribute==='function'?el.getAttribute(name):null;
const has=(el,name)=>typeof el?.hasAttribute==='function'&&el.hasAttribute(name);
const tag=el=>typeof el?.tagName==='string'?el.tagName.toUpperCase():'';
const hasClass=(el,name)=>(attr(el,'class')??'').split(/\s+/).includes(name);
const classHas=(el,part)=>(attr(el,'class')??'').split(/\s+/).some(name=>name.includes(part));
const parentOf=node=>node?.parentNode??node?.parentElement??null;
const LETTER=/[\p{L}\p{N}]/u,SENTENCE_END=/[。！？]/u,HAN=/\p{Script=Han}/u;
const KANA=/^[\p{Script=Hiragana}\p{Script=Katakana}ー・ 　]+$/u;
const BLOCK=new Set(['P','LI','DD','DT','TD','TH','BLOCKQUOTE','FIGCAPTION','CAPTION','LEGEND','H1','H2','H3','H4','H5','H6']);
const CONTROL=new Set(['BUTTON','A','LABEL','SUMMARY']);
const CONTROL_ROLES=new Set(['link','menuitem','menuitemradio','menuitemcheckbox','tab','option','switch']);
const BOUNDARY=new Set(['HTML','BODY','MAIN','SECTION','ARTICLE','NAV','HEADER','FOOTER','ASIDE','DIALOG','UL','OL','DL','FORM','TABLE','TBODY','THEAD','TR','FIELDSET','DETAILS']);
const FIELD_TAGS=new Set(['INPUT','TEXTAREA','SELECT','OPTION']);
const EXCLUDED=new Set([...FIELD_TAGS,'SCRIPT','STYLE','NOSCRIPT','TEMPLATE','AUDIO','VIDEO','CANVAS']);
const SKIP_TEXT=new Set(['RT','RP','KBD','SCRIPT','STYLE','NOSCRIPT','TEMPLATE']);
const JAPANESE_CHAR=/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

function closest(node,test){for(let at=node;at&&at.nodeType===1;at=parentOf(at))if(test(at))return at;return null;}
// As closest, but never at or past a structural container (a section, a details, a list...).
function closestWithin(node,test){for(let at=node;at&&at.nodeType===1;at=parentOf(at)){if(BOUNDARY.has(tag(at)))return null;if(test(at))return at;}return null;}
function contains(host,node){for(let at=node;at;at=parentOf(at))if(at===host)return true;return false;}
// The ear and the app's own speech controls (読む, the reader, 🔊, P) keep their job: never a unit, never part of one.
const SPEECH_CONTROLS=['data-ear-root','data-ear-mark','data-speak-selection','data-speak-reader','data-speak-block','data-speak-word','data-trial-audio'];
const editable=el=>{const value=attr(el,'contenteditable');return value!==null&&value.toLowerCase()!=='false';};
// What the learner types into a field is theirs: it never leaves the device through the ear, as the tapped element, an
// ancestor or a descendant of the unit.
const isField=el=>FIELD_TAGS.has(tag(el))||editable(el);
const silent=el=>isField(el)||SPEECH_CONTROLS.some(name=>has(el,name));
const excluded=el=>EXCLUDED.has(tag(el))||silent(el);
const isCardFront=el=>has(el,'data-card')&&has(el,'data-reveal');
const isTyped=el=>has(el,'data-learner-typed');
const isPassage=el=>hasClass(el,'passage')||has(el,'data-passage');
const isControl=el=>CONTROL.has(tag(el))||CONTROL_ROLES.has(attr(el,'role'));
// R-a: what a tap presses. Every control, a role=button and the card front (a tap reveals it); a word of running text
// (button[data-word]) is text, not a control.
const isPressable=el=>!has(el,'data-word')&&(isControl(el)||attr(el,'role')==='button'||isCardFront(el));
// N8e: a real button (a grade, a menu, a link), not the card's face: with the ear on, it still does its own job.
const isButton=el=>!has(el,'data-word')&&!isCardFront(el)&&(isControl(el)||attr(el,'role')==='button');
const isEnglishPart=el=>hasClass(el,'interface-secondary')||/^en\b/i.test(attr(el,'lang')??'');
const isReadingPart=el=>classHas(el,'reading');
// The nearest language mark below <body> decides; the page's own lang follows the interface language, so it is ignored.
function inEnglish(el){
 for(let at=el;at&&at.nodeType===1&&!['BODY','HTML'].includes(tag(at));at=parentOf(at)){
  if(hasClass(at,'interface-secondary'))return true;
  const lang=attr(at,'lang');if(lang)return /^en\b/i.test(lang);
 }
 return false;
}

// Visible text in reading order without ruby readings, key hints, fields or speech controls; skip(el) leaves out more.
function collect(node,skip=()=>false){
 if(node.nodeType===3)return node.nodeValue??'';
 if(node.nodeType!==1||SKIP_TEXT.has(tag(node))||silent(node)||skip(node))return '';
 let out='';for(const child of node.childNodes??[])out+=collect(child,skip);return out;
}
// speakableText(host) with every character inside a field, a speech control or a key hint replaced by a space: the
// offsets stay those of speakableText (for the highlight); the sentences never carry that text.
function maskedText(host){
 let out='';
 const visit=(node,mask)=>{
  if(node.nodeType===3){const value=node.nodeValue??'';out+=mask?' '.repeat(value.length):value;return;}
  if(node.nodeType!==1||tag(node)==='RT'||tag(node)==='RP')return;
  const hide=mask||node!==host&&(silent(node)||SKIP_TEXT.has(tag(node)));
  for(const child of node.childNodes??[])visit(child,hide);
 };
 visit(host,false);
 return out;
}
const squash=text=>text.replace(/\s+/gu,' ').trim();
const hasLetters=el=>LETTER.test(collect(el));
// A pair on one line ("ja · en", "ja / en") or a ja line over an en line: the Japanese parts.
function japanesePart(raw){
 const text=squash(raw);
 if(isJapaneseEnough(text))return text;
 const parts=raw.split(/\n| · | \/ /u).map(squash).filter(part=>part&&isJapaneseEnough(part));
 return parts.length?parts.join(' '):null;
}
/** The Japanese a label shows: its interface twin's Japanese, or its own text without readings or English halves. */
function japaneseOf(el){
 if(!JAPANESE_CHAR.test(collect(el)))return null;
 const twin=attr(el,'data-interface-ja');
 if(twin&&isJapaneseEnough(twin))return squash(twin);
 return japanesePart(collect(el,child=>child!==el&&(isEnglishPart(child)||isReadingPart(child))));
}
const kana=value=>typeof value==='string'&&KANA.test(value.trim())?squash(value):null;
function rubyReading(el){
 let out='',ruby=false;
 const visit=node=>{
  if(node.nodeType===3){out+=node.nodeValue??'';return;}
  if(node.nodeType!==1||silent(node)||SKIP_TEXT.has(tag(node))&&tag(node)!=='RT')return;
  if(tag(node)==='RUBY'){
   const rt=[...(node.childNodes??[])].filter(child=>tag(child)==='RT');
   if(!rt.length){for(const child of node.childNodes??[])visit(child);return;}
   ruby=true;out+=rt.map(child=>collect(child.childNodes?.length?{nodeType:1,tagName:'SPAN',childNodes:child.childNodes}:child)).join('');return;
  }
  if(isEnglishPart(node))return;
  for(const child of node.childNodes??[])visit(child);
 };
 visit(el);
 const text=squash(out);
 return ruby&&text&&!HAN.test(text)?kana(text):null;
}
const vocabularyContext=el=>!!closest(el,at=>has(at,'data-vocabulary-entry')||has(at,'data-vocabulary-source')||hasClass(at,'word-row')||has(at,'data-word'));
function readingOf(el,label,readingFor){
 const own=kana(attr(el,'data-reading'));if(own)return own;
 for(const child of el.childNodes??[])if(child.nodeType===1&&isReadingPart(child)){const value=kana(collect(child));if(value)return value;}
 const next=el.nextElementSibling;
 if(next&&(isReadingPart(next)||tag(el)==='STRONG'&&tag(next)==='SPAN')){const value=kana(collect(next));if(value)return value;}
 const ruby=rubyReading(el);if(ruby)return ruby;
 if(typeof readingFor==='function'&&vocabularyContext(el)){let value=null;try{value=readingFor(label);}catch{}return kana(value);}
 return null;
}

function sentenceUnit(host,el,caret,flags){
 const text=maskedText(host);
 let sentences;
 try{sentences=splitSentences(text);}catch{return null;}
 if(!sentences.length)return null;
 let at=null;
 if(caret?.node&&contains(host,caret.node))at=offsetOf(host,caret.node,Number.isInteger(caret.offset)?caret.offset:0);
 if(at===null)at=offsetOf(host,el);
 if(at===null)at=0;
 const sentence=sentences.find(s=>at>=s.start&&at<s.end)??[...sentences].reverse().find(s=>s.start<=at)??sentences[0];
 if(!isJapaneseEnough(sentence.text))return null;
 return Object.freeze({kind:'sentence',host,start:sentence.start,end:sentence.end,text:text.slice(sentence.start,sentence.end),label:sentence.text,reading:null,...flags});
}
function elementUnit(host,el,caret,flags,readingFor){
 const label=japaneseOf(host);
 if(!label)return null;
 let pieces=[];try{pieces=splitSentences(label);}catch{}
 if(pieces.length>1)return sentenceUnit(host,el,caret,flags);
 const reading=readingOf(host,label,readingFor);
 return Object.freeze({kind:'element',host,start:0,end:speakableText(host).length,text:reading??label,label,reading,...flags});
}

/** The unit a tap or a rest at `target` speaks, or null. In running text it is the sentence under the caret (or the
 * tapped word); on a row, a label or a button it is that element's Japanese, sent as its kana reading when the element
 * or its data carries one. Card fronts are units only when the ear is armed or held on. Text in a field or a speech
 * control is never part of a unit. A unit in text the learner typed is marked `typed`; a unit inside something a tap
 * presses (a control, the card front) is marked `control`. */
export function findEarUnit(target,{caret=null,mode='off',readingFor=null}={}){
 const el=target?.nodeType===3?parentOf(target):target;
 if(!el||el.nodeType!==1)return null;
 if(closest(el,excluded))return null;
 if(inEnglish(el))return null;
 const front=!!closest(el,isCardFront);
 if(front&&mode!=='armed'&&mode!=='held')return null;
 const flags={front,typed:!!closest(el,isTyped),control:!!closest(el,isPressable),button:!!closest(el,isButton)};
 const passage=closest(el,isPassage);
 if(passage)return sentenceUnit(passage,el,caret,flags);
 const control=closest(el,isControl);
 if(control){
  // Inside a control the nearest element that shows Japanese speaks (the brand's name, not "Nihongo Study" with it).
  for(let at=el;at&&at!==control;at=parentOf(at))if(japaneseOf(at))return elementUnit(at,el,caret,flags,readingFor);
  return elementUnit(control,el,caret,flags,readingFor);
 }
 // Running text is a block (or a lang="ja" phrase) below the nearest container: a lang="ja" section or details is not one
 // paragraph (fix round 2: the kanji panels).
 const prose=closestWithin(el,at=>BLOCK.has(tag(at))||/^ja\b/i.test(attr(at,'lang')??'')&&tag(at)!=='DIV');
 if(prose){const ja=japaneseOf(prose);if(ja&&SENTENCE_END.test(ja))return sentenceUnit(prose,el,caret,flags);}
 for(let at=el;at&&at.nodeType===1;at=parentOf(at)){
  if(hasLetters(at))return BOUNDARY.has(tag(at))?null:elementUnit(at,el,caret,flags,readingFor);
  if(BOUNDARY.has(tag(at)))return null;
 }
 return null;
}

/** A term → kana reading lookup over catalog entries; a term carried with two readings answers none. */
export function earReadingIndex(entries){
 const readings=new Map();
 for(const entry of entries??[]){
  if(typeof entry?.term!=='string'||typeof entry.reading!=='string'||!entry.reading)continue;
  const prior=readings.get(entry.term);
  readings.set(entry.term,prior===undefined||prior===entry.reading?entry.reading:null);
 }
 return term=>readings.get(term)??null;
}

/** The caret under the pointer, as {node, offset}, or null. */
export function earCaretAt(document,event){
 try{
  const position=document.caretPositionFromPoint?.(event.clientX,event.clientY);
  if(position)return {node:position.offsetNode,offset:position.offset};
  const range=document.caretRangeFromPoint?.(event.clientX,event.clientY);
  if(range)return {node:range.startContainer,offset:range.startOffset};
 }catch{}
 return null;
}

/** The unit under the pointer as the one nsrs-ear highlight (styled by the state on <html>); null clears it. */
export function aimEarHighlight(unit,{highlights=globalThis.CSS?.highlights,Highlight=globalThis.Highlight,rangeAt=rangeFor}={}){
 if(!highlights||typeof Highlight!=='function')return;
 if(!unit?.host?.isConnected){highlights.delete('nsrs-ear');return;}
 try{highlights.set('nsrs-ear',new Highlight(rangeAt(unit.host,unit.start,unit.end)));}catch{highlights.delete('nsrs-ear');}
}

/** The ear's own layer (fix round 2; the painter is speech-bands.mjs since N5, shared with the reading light): WebKit
 * paints neither custom highlights nor inline backgrounds inside a word button, so the aim marks are bands in a fixed
 * layer above the page, placed from the unit's client rects, taking no pointer and moving no layout. set('aim', range|null)
 * draws per line an underline (armed) and a wash along its foot (held); the page's data-ear picks the band. The sentence
 * the ear speaks is lit by the shared reading light, in the seal's red while the ear speaks (app.css). */
export function createEarBands(document,{enabled=()=>true}={}){
 return createBandLayer(document,{enabled,className:'ear-bands',bandClass:'ear-band',attribute:'data-ear-bands',
  draw:(name,range)=>name==='aim'?footBands([...range.getClientRects()],scrollClip(range.commonAncestorContainer)):[]});
}

/** The no-voice line for a reason, as [ja, en]. */
export function earNoVoiceLine(reason){return voiceLine(reason);}

// ---------------------------------------------------------------- the mark
/** The state on <html> (data-ear, data-ear-mode), the mark's name in the interface language, and the no-voice line. */
export function paintEar(parts,view,language='ja'){
 const html=parts.root.ownerDocument.documentElement,reason=view.state==='novoice'?voiceLine(view.reason):null;
 html.dataset.ear=view.state;html.dataset.earMode=view.mode;
 const pick=([ja,en])=>language==='en'?en:language==='both'?`${ja} / ${en}`:ja;
 // N7: the mark's name is the ruled state word; with no voice, "no voice" and the short form of the cause.
 const label=pick(earLabel(view.state,view.reason));
 parts.mark.setAttribute('aria-label',label);parts.mark.title=label;
 parts.mark.setAttribute('aria-pressed',String(view.mode==='armed'||view.mode==='held'));
 if(reason)renderInterfacePair(parts.why,reason[0],reason[1],language,{inline:true});
 parts.why.hidden=!reason;
}

const SVG='http://www.w3.org/2000/svg';
/** The seal (a 30 px 耳 in a box), its three arcs and the one plain no-voice line, built in `document`. */
export function buildEarMark(document){
 const root=document.createElement('span');root.className='ear';root.setAttribute('data-ear-root','');
 const mark=document.createElement('button');mark.type='button';mark.className='ear-mark';mark.setAttribute('data-ear-mark','');
 const glyph=document.createElement('span');glyph.className='ear-glyph';glyph.lang='ja';glyph.setAttribute('aria-hidden','true');glyph.textContent='耳';
 const rings=document.createElementNS(SVG,'svg');rings.setAttribute('class','ear-rings');rings.setAttribute('viewBox','0 0 26 30');rings.setAttribute('aria-hidden','true');rings.setAttribute('focusable','false');
 for(const d of ['M4 9a8 8 0 0 1 0 12','M10 5a14 14 0 0 1 0 20','M16 1a20 20 0 0 1 0 28']){const path=document.createElementNS(SVG,'path');path.setAttribute('d',d);path.setAttribute('pathLength','1');rings.append(path);}
 mark.append(glyph,rings);
 const why=document.createElement('span');why.className='ear-why';why.setAttribute('data-ear-why','');why.setAttribute('role','status');why.hidden=true;
 root.append(mark,why);
 return {root,mark,why};
}
