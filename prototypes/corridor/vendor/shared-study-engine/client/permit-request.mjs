/** Server grant intent from one fully applied shared prefix; never an issuer. */
import {studyDayAllowance,payloadHash} from './replay.mjs';
export function sharedPermitRequest(state,{now=Date.now,prefix='permit',batchSize=null}={}){
 const p=state?.projection,scope=state?.scope;
 if(!p||!Number.isSafeInteger(state.head)||state.head!==state.appliedSeq||state.blocked||p.error||p.updateRequired||Object.keys(state.local||{}).length)throw Error('native-sync-replay-blocked');
 const at=Math.max(now(),0,...Object.values(state.canonical||{}).map(row=>row.rt));
 const {limit,...bounds}=studyDayAllowance(p,at);
 const allocated=(p.permitGrants||[]).filter(g=>g.startsAt<bounds.endsAt&&g.endsAt>bounds.startsAt).reduce((sum,g)=>sum+g.count,0);
 if(!Number.isSafeInteger(limit)||limit<0||limit>200||!Number.isSafeInteger(allocated)||allocated<0)throw Error('native-sync-replay-blocked');
 if(batchSize!==null&&(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>200))throw Error('invalid-permit-batch');
 // Automatic sync must not reserve the whole shared day for whichever device
 // happens to wake first. Keep a small offline batch and replenish when spent.
 const hasUnused=Object.values(p.permits||{}).some(permit=>permit.install===scope.installation&&!permit.usedBy&&permit.startsAt<=at&&permit.endsAt>at);
 const remaining=Math.max(0,limit-allocated);
 const count=batchSize===null?remaining:hasUnused?0:Math.min(batchSize,remaining);
 const policy=Object.freeze({version:2,head:state.head,day:bounds.day,timezone:bounds.timezone,limit,allocated});
 const requestId=`${prefix}-${payloadHash({scope,...bounds,limit,allocated,count})}`;
 return Object.freeze({count,requestId,policy,...bounds});
}
export function validPermitPolicy(policy){
 return policy&&typeof policy==='object'&&!Array.isArray(policy)&&Object.keys(policy).sort().join('|')==='allocated|day|head|limit|timezone|version'&&policy.version===2&&
  Number.isSafeInteger(policy.head)&&policy.head>=0&&Number.isSafeInteger(policy.limit)&&policy.limit>=0&&policy.limit<=200&&Number.isSafeInteger(policy.allocated)&&policy.allocated>=0&&
  typeof policy.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(policy.day)&&typeof policy.timezone==='string'&&policy.timezone.length>0&&policy.timezone.length<=128;
}
/** Own records still queued above a fully applied, unblocked prefix: a later Sync reserves, nothing failed. */
export const onlyLocalPending=status=>status?.blocked===null&&Number.isSafeInteger(status.applied)&&status.applied===status.head&&status.pending>0;
/** One Sync drains a multi-batch outbox while each pass applies more of the shared log; arriving writes or a stalled transport stop at the bound. */
export async function drainOutbox(synchronize,store,maxPasses=8){
 let result=await synchronize();
 for(let pass=1;pass<maxPasses&&!result?.error;pass++){
  const before=await store.status();if(!onlyLocalPending(before))break;
  result=await synchronize();
  if(!((await store.status()).applied>before.applied))break;
 }
 return result;
}
