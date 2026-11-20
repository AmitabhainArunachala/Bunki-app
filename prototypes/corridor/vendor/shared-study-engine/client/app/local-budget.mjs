import {dayBounds,payloadHash,newCardLimit} from '../replay.mjs';

/** Refresh at the learner-day boundary (also callable after wake/focus). Rendering
 * only reschedules this timer; it never issues grants or subscribes recursively. */
export function watchLocalDayBudget({refresh,getProjection,now=Date.now,canRefresh=()=>true,onRefresh=()=>{},schedule=setTimeout,cancel=clearTimeout}){
 let disposed=false,timer=null,pending=null;
 function nextBoundary(){
  const at=now(),p=getProjection(),settings={...p.settings};
  for(const row of p.pendingSettings)if(row.effectiveAt<=at)settings[row.key]=row.value;
  return Math.min(dayBounds(at,settings.learnerTimezone).endsAt,...p.pendingSettings.filter(row=>row.effectiveAt>at).map(row=>row.effectiveAt));
 }
 let nextAt=nextBoundary();
 function arm(delay){cancel(timer);if(!disposed)timer=schedule(check,Math.max(1,delay));}
 function reschedule(){if(disposed||pending)return;nextAt=Math.min(nextAt,nextBoundary());arm(nextAt-now());}
 async function check(){
  if(disposed)return;if(pending)return pending;
  cancel(timer);
  // A grant must not replace a revealed card's immutable grade preview or race
  // an in-flight learner command. The next safe render/focus retries promptly.
  if(!canRefresh()){arm(60000);return;}
  pending=(async()=>{
   try{await refresh();if(!disposed){nextAt=nextBoundary();onRefresh();}}
   catch{nextAt=now()+60000;}
   finally{pending=null;if(!disposed)reschedule();}
  })();
  return pending;
 }
 reschedule();
 return Object.freeze({check,schedule:reschedule,dispose(){disposed=true;cancel(timer);}});
}

/** Explicit local-only authority, never a cloud permit issuer. Only the approved
 * standalone-local native scope may allocate its own durable daily budget. */
export async function ensureLocalDayBudget(store,{now=Date.now}={}){
 const scope=store.scope;
 if(scope.environment!=='standalone-local'||!/^local-[A-Za-z0-9_-]+$/.test(scope.learner)||!/^mac-[A-Za-z0-9_-]+$/.test(scope.installation))throw Error('local-budget-scope-required');
 const state=await store.readState(),p=state.projection;
 if(state.head!==state.appliedSeq||p.error||p.updateRequired)throw Error('local-budget-replay-blocked');
 const rows=Object.values(state.canonical),ts=Math.max(now(),0,...rows.map(r=>r.rt));
 // Pending workload/zone takes effect at its already-recorded boundary. The
 // issuer must use that policy when replay activates it on the grant itself.
 const settings={...p.settings};for(const row of p.pendingSettings)if(row.effectiveAt<=ts)settings[row.key]=row.value;
 const bounds=dayBounds(ts,settings.learnerTimezone),allocated=p.permitGrants.filter(g=>g.startsAt<bounds.endsAt&&g.endsAt>bounds.startsAt).reduce((sum,g)=>sum+g.count,0),remaining=Math.max(0,newCardLimit(settings,ts)-allocated);
 if(!remaining)return {kind:'already-allocated',localOnly:true};
 const permitIds=Array.from({length:newCardLimit(settings,ts)},(_,i)=>`local:${scope.installation}:${bounds.startsAt}:${i+1}`).filter(id=>!p.permits[id]).slice(0,remaining);
 if(!permitIds.length)return {kind:'already-allocated',localOnly:true};
 const dseq=Math.max(0,...rows.filter(r=>r.event.install==='@server').map(r=>r.event.dseq))+1;
 const event={v:4,id:`@server:${dseq}`,learner:scope.learner,install:'@server',dseq,base:state.appliedSeq,ts,epoch:state.epoch,policy:'nsrs-policy-v1',type:'permit-grant',data:{install:scope.installation,permitIds,...bounds}};
 const envelope={seq:state.head+1,rt:ts,authority:'server',event,bodyHash:payloadHash(event)};
 await store.reconcile({events:[envelope],head:envelope.seq});
 const after=await store.readProjection();if(after.outcomes[event.id]?.status!=='applied')throw Error('local-budget-refused');
 return {kind:'allocated',count:permitIds.length,localOnly:true};
}
