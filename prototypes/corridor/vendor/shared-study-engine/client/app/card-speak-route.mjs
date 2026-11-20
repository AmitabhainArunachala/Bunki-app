/** Card speech routing (John 2026-11-10 "real voices or silence"). The old Kore trial clips exist only for a client with
 * no speak bridge at all. On the iPhone web bridge P always asks the bridge first (it may answer from a kept clip, even
 * offline); its 'offline' answer is one plain line after a press and silence after a reveal. MU-2: the Mac's native bridge
 * answers 'offline' too and is routed the same way. N7: every line comes from the one vocabulary (voice-lines.mjs), by
 * the cause the code names. Pure decisions; the caller acts on them. */
import {voiceCause,voiceLine,VOICE_PASSING,VOICE_STANDING} from '../audio/voice-lines.mjs';

/** The offline line (C4): not kept on this device, and no network to ask. */
export const SPEAK_OFFLINE_LINE=Object.freeze(voiceLine('offline'));

/** Refusals that will not fix themselves within a page session. A budget refusal is not one of them: the server still
 * serves a clip it already has, and the device keeps heard clips, so automatic speech keeps asking once per card. */
const AUTO_STOP_CODES=new Set(['not-paired','update-required','authentication-required']);

/** The trial player, built only when there is neither shared audio nor any speak bridge. */
export function trialAudioFor({sharedAudio,bridge,create}){return sharedAudio||bridge?null:create();}

/** What P or the card speaker does: 'stop' a clip a press started, 'restart' the reveal's own clip, or 'speak'. */
export function cardSpeakPress({playing,auto}){
 if(playing)return auto?'restart':'stop';
 return 'speak';
}

/** Where a failed speak reply goes: 'silent', 'offline-line', 'dynamic-off' or 'message'. `auto`: a reveal, not a press. */
export function cardSpeakFailureRoute({bridge,code,allowlisted,auto=false}){
 if(code==='offline')return auto?'silent':'offline-line';
 if(code==='not-in-release'&&!allowlisted)return 'dynamic-off';
 return 'message';
}

/** After one of these, automatic speech asks nothing more for the rest of the page session; P still asks. */
export function autoSpeechStops(code){return AUTO_STOP_CODES.has(code);}

/** The kind of line a failure shows: its cause in the one vocabulary (N7: a 401 is "pair again", not "not paired"). */
export function speakLineKind(code){return voiceCause(code);}

/** N7: a reply proves the pairing works only when it came over the network; a clip kept on the device (cache 'local', on
 * the web bridge and the Mac alike) plays unpaired too. */
export function pairingProven(reply){return reply!==null&&typeof reply==='object'&&reply.ok===true&&reply.cache!=='local';}

/** One automatic line per kind per page session: after a reveal a kind shows once; a press always answers, and a kind it
 * showed is not repeated after a later reveal. N7 fix 2 (the lists in voice-lines.mjs): sounded() after any play that
 * sounds lets a cause a play disproves be said again, once; answered(reply) after a reply over the network lets the
 * standing causes it disproves be said again ('served': any reply with a clip; 'made': the Worker made a new clip). */
export function createSpeechLineLog(){
 const shown=new Set();
 const forget=keep=>{for(const kind of [...shown])if(keep(kind))shown.delete(kind);};
 return Object.freeze({
  show({kind,auto=false}){const first=!shown.has(kind);shown.add(kind);return auto?first:true;},
  sounded(){forget(kind=>VOICE_PASSING.includes(kind));},
  answered(reply){
   if(!pairingProven(reply))return;
   const made=reply.cache==='miss';
   forget(kind=>VOICE_STANDING[kind]==='served'||made&&VOICE_STANDING[kind]==='made');
  },
 });
}
