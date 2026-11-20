/** Speak on reveal (John 2026-11-10). One speak request per card: it starts when the card's front appears, is held for
 * that card only, plays once when the answer is revealed, and P reuses it. Pure: the caller supplies the request and
 * the player; nothing here touches the DOM, audio or network. A failed request is never retried by itself; P asks again.
 * A reply that `stops` (a refusal that will not fix itself) ends automatic requests until restore() (N7: the pairing is
 * proven again); P still asks. */
const FAILED=Object.freeze({ok:false,error:'speak-failed'});
const asReply=value=>value!==null&&typeof value==='object'?value:FAILED;

export function createRevealSpeak({speak,play,fail=()=>{},enabled=()=>true,canSpeak=()=>true,prime=()=>{},stops=()=>false}){
 let held=null,muted=false;
 function start(card){
  let pending;
  try{pending=speak(card);}catch{pending=FAILED;}
  const entry={card,settled:false,reply:null,revealed:false,auto:false};
  entry.promise=Promise.resolve(pending).then(asReply,()=>FAILED).then(reply=>{
   entry.settled=true;entry.reply=reply;
   try{if(reply.ok!==true&&stops(reply)===true)muted=true;}catch{}
   return reply;
  });
  held=entry;
  return entry;
 }
 const failed=entry=>entry.settled&&entry.reply?.ok!==true;
 const wanted=card=>{try{return !!card&&enabled()===true&&canSpeak(card)===true;}catch{return false;}};
 const release=card=>{if(held&&held.card!==card)held=null;};
 return Object.freeze({
  /** The front is on screen: ask for its clip once. A front that will not ask lets go of the previous card's clip. */
  prefetch(card){
   if(!wanted(card)||muted){release(card);return false;}
   if(held?.card!==card)start(card);
   return true;
  },
  /** The answer is on screen: play the held clip once, waiting for it if it is still in flight. A held failure (also the
   * refusal that stopped automatic speech) is handed over once; nothing is asked again. */
  reveal(card){
   if(!wanted(card)){release(card);return false;}
   if(held?.card!==card&&muted){release(card);return false;}
   try{prime(card);}catch{}
   const entry=held?.card===card?held:start(card);
   if(entry.revealed)return false;
   entry.revealed=true;entry.auto=true;
   entry.promise.then(reply=>{
    if(held!==entry||!entry.auto)return;
    entry.auto=false;
    try{if(reply.ok===true)play(card,reply);else fail(card,reply);}catch{}
   });
   return true;
  },
  /** P or the speaker: this card's clip, asked for only if none is held or the held one failed. */
  clip(card){
   const entry=held?.card===card&&!failed(held)?held:start(card);
   entry.auto=false;
   return entry.promise;
  },
  /** The learner stopped, graded or left: a reveal still waiting stays silent. */
  cancel(){if(held)held.auto=false;},
  drop(){held=null;},
  /** N7: this card's held clip would not play: let it go, so the next press asks again. */
  forget(card){if(held?.card===card)held=null;},
  /** N7: the pairing is proven again (a reply from the network, or a pairing that succeeded): automatic speech asks
   * again from the next front on, with no reload. */
  restore(){muted=false;},
  read(){return held?{card:held.card,settled:held.settled,muted}:null;},
 });
}
