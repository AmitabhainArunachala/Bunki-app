/** Canonical receipts for the explicit native, standalone-local authority only.
 * Payload bytes, IDs and installation order remain the original durable events.
 * These receipts are local Mac authority and never imply Cloudflare acceptance. */
export async function canonicalizeLocalPending(store,{authority,now=Date.now}={}){
 const s=store.scope;
 if(authority?.mode!=='standalone-local'||s.environment!=='standalone-local'||!/^local-[A-Za-z0-9_-]+$/.test(s.learner)||!/^mac-[A-Za-z0-9_-]+$/.test(s.installation)||['environment','learner','installation'].some(k=>authority.scope?.[k]!==s[k]))throw Error('local-canonical-authority-required');
 const state=await store.readState();if(state.head!==state.appliedSeq||state.projection.error||state.projection.updateRequired)throw Error('local-canonical-replay-blocked');
 const pending=Object.values(state.local).sort((a,b)=>a.event.dseq-b.event.dseq);if(!pending.length)return {count:0,localOnly:true};
 let seq=state.head,rt=Math.max(now(),0,...Object.values(state.canonical).map(r=>r.rt));
 const events=pending.map(({event,bodyHash})=>({seq:++seq,rt:rt=Math.max(rt,now()),authority:'device',event,bodyHash}));
 await store.reconcile({events,head:seq});return {count:events.length,localOnly:true};
}
