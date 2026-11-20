/** One request per text and voice at a time (voice plan N2-INT, 2026-11-11). A second ask for the same speech input in
 * the same voice while the first is still in flight gets the first one's reply, so the reveal and the ear (or 読む) never
 * pay twice for one sentence. Keyed the way the device clip store keys clips: the voice seed (a card voice key and its
 * bare GUID are one voice) and the speech input key. An ask that cannot be keyed goes straight through. Each caller still
 * decides for itself whether to play the shared reply. */
import {isVoiceKey,voiceSeed} from './speech-text.mjs';

export function flightKey(target,speechInput){
 const inputKey=speechInput?.inputKey;
 if(typeof target!=='string'||!target||typeof inputKey!=='string'||!inputKey)return null;
 let seed=target;
 try{if(isVoiceKey(target))seed=voiceSeed(target);}catch{return null;}
 return seed+'\n'+inputKey;
}

export function joinSpeak(speak){
 if(typeof speak!=='function')throw new TypeError('speak must be a function');
 const flights=new Map();
 return function joined(target,speechInput){
  const key=flightKey(target,speechInput);
  if(key===null)return speak(target,speechInput);
  const flying=flights.get(key);
  if(flying)return flying;
  let pending;
  try{pending=Promise.resolve(speak(target,speechInput));}catch(error){pending=Promise.reject(error);}
  const shared=pending.finally(()=>{if(flights.get(key)===shared)flights.delete(key);});
  flights.set(key,shared);
  return shared;
 };
}
