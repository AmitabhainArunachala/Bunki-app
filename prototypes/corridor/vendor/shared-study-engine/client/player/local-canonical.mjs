/** Canonical receipts for the explicit native, standalone-local authority only.
 * Payload bytes, IDs and installation order remain the original durable events.
 * These receipts are local Mac authority and never imply Cloudflare acceptance. */
import {MAX_SYNC_TIME} from '../schema/event.mjs';
function requireAuthority(scope,authority){
 const s=scope;
 if(authority?.mode!=='standalone-local'||s.environment!=='standalone-local'||!/^local-[A-Za-z0-9_-]+$/.test(s.learner)||!/^mac-[A-Za-z0-9_-]+$/.test(s.installation)||['environment','learner','installation'].some(k=>authority.scope?.[k]!==s[k]))throw Error('local-canonical-authority-required');
}
/** The receipts for every pending local event of one validated snapshot, or
 * null when nothing is pending. Pure: the same snapshot and clock give the same
 * receipts whether they are written right after the save or with it. */
export function localCanonicalReceipts(state,{now=Date.now}={}){
 if(state.head!==state.appliedSeq||state.projection.error||state.projection.updateRequired)throw Error('local-canonical-replay-blocked');
 const pending=Object.values(state.local).sort((a,b)=>a.event.dseq-b.event.dseq);if(!pending.length)return null;
 let seq=state.head,rt=Math.max(now(),0,...Object.values(state.canonical).map(r=>r.rt));
 const events=pending.map(({event,bodyHash})=>({seq:++seq,rt:rt=Math.max(rt,now()),authority:'device',event,bodyHash}));
 return {events,head:seq};
}
/** A follow-up for store.appendOrFind: the save and its local receipts as one commit.
 * As two writes, the save's own write replays its pending events at
 * `provisionalNow`, and the reducer stops that replay (invalid-provisional-time)
 * unless it is a safe integer in [0, MAX_SYNC_TIME]; the receipts are then
 * refused because the saved projection is stopped. The one commit never
 * computes that projection, so the same time is refused here and the save
 * takes the two writes. A caller that hands over no time is refused too. */
export function localCanonicalFollowUp(store,{authority,now=Date.now}={}){
 requireAuthority(store.scope,authority);
 return (state,{provisionalNow}={})=>{
  if(!Number.isSafeInteger(provisionalNow)||provisionalNow<0||provisionalNow>MAX_SYNC_TIME)throw Error('local-canonical-replay-blocked');
  return localCanonicalReceipts(state,{now});
 };
}
export async function canonicalizeLocalPending(store,{authority,now=Date.now}={}){
 requireAuthority(store.scope,authority);
 const state=await store.readState(),receipts=localCanonicalReceipts(state,{now});
 if(!receipts)return {count:0,localOnly:true};
 await store.reconcile(receipts);return {count:receipts.events.length,localOnly:true};
}
