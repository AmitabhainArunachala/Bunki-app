/** One sound at a time (voice plan N2-INT, 2026-11-11). Every path that can sound registers how it stops: the card
 * player (P on the speak bridge and the reveal's own clip), the audio-pack player (P with packs) and the reading family
 * (読む, the reader, 🔊 and the ear, which speaks through the 読む session). A path about to sound claims the floor and
 * every other path stops; a reply that arrives for a stopped path is dropped by that path's own generation check.
 * Pure, no imports: the caller supplies the stops. */
export function createOneVoice(){
 const stops=new Map();
 return Object.freeze({
  path(name,stop){
   if(typeof name!=='string'||!name||typeof stop!=='function')throw new TypeError('a voice path needs a name and a stop');
   stops.set(name,stop);
  },
  claim(name){
   for(const [other,stop] of stops){
    if(other===name)continue;
    try{stop();}catch{/* one broken stop never keeps another path sounding */}
   }
  },
 });
}
