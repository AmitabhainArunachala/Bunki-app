/** Correction-aware evidence in a validated canonical prefix, not an award ledger.
 * Exact task snapshots prove historical debt. Day-local fences retain unrelated
 * history; known-device boundaries guard ordinary offline queues, not backdating.
 */
import {dayBounds,studyDayAllowance,validateEvent,payloadHash} from '../replay.mjs';
const MAX_EVENTS=20000,MAX_TASKS=20000;
const BUDGET_SETTINGS=new Set(['newPerDayTotal','newTodayTotal','newTodayOverride','studyPolicy']);
const MUTATIONS=new Set(['baseline','review','boost','capture-boost','undo','hesitation-override','suspend','known','repair']);
const freeze=value=>Object.freeze({...value,days:Object.freeze(value.days)});
const result=(state,reason,days=[],timezone=state?.projection?.settings?.learnerTimezone??null)=>freeze({available:reason===null,through:state?.appliedSeq??0,timezone,days,reason});
function unavailable(state,at){
 const p=state?.projection;
 if(!Number.isSafeInteger(at)||at<0)return 'invalid-time';
 if(!p||p.error||p.updateRequired||state.blocked||p.learner!==state.scope?.learner||p.epoch!==state.epoch||
   !Number.isSafeInteger(state.appliedSeq)||state.appliedSeq<0||state.appliedSeq!==state.head||p.appliedSeq!==state.appliedSeq||
   !Array.isArray(p.reviews)||!p.tasks||!state.canonical)return 'incomplete-prefix';
 if(!state.local||typeof state.local!=='object'||Array.isArray(state.local))return 'local-history';
 if(p.pending!==undefined&&!Array.isArray(p.pending)||p.pending?.some(id=>!state.local[id]))return 'local-history';
 if(state.appliedSeq>MAX_EVENTS||p.reviews.length>MAX_EVENTS)return 'history-limit';
 return null;
}
const sameKeys=(a,b)=>a.length===b.length&&a.every(key=>b.includes(key));
const identity=(a,b)=>a&&b&&['taskKey','noteGuid','contract','passageId'].every(key=>a[key]===b[key]);
function dueAt(snapshot,knownAt){
 if(snapshot.card===null)return -Infinity; // A spent introduction survives undo.
 const card=snapshot.card,due=Date.parse(card?.due),introduced=Date.parse(card?.introducedAt),last=card?.last_review===null?-Infinity:Date.parse(card?.last_review);
 if(!Number.isFinite(due)||!Number.isFinite(introduced)||!(Number.isFinite(last)||last===-Infinity))return null;
 return introduced<=knownAt&&last<=knownAt?due:NaN;
}
function prove(state,at,today){
 const p=state.projection,rows=new Map(),events=new Map(),heads=new Map(),writes=new Map(),undone=new Map(),overrides=new Map();
 const fences=[],dseq=new Map(),boundaries=new Map(),participants=new Map(),manualOwners=new Map(),zoneEvents=[];
 const fence=(...times)=>fences.push([Math.min(...times),Math.max(...times)]);
 const canonicalKey=key=>p.taskAliases?.[key]??key;
 let lastReceipt=-1,taskCount=0,firstScore=Infinity;
 for(const key in p.tasks)if(++taskCount>MAX_TASKS)return result(state,'history-limit');
 for(const [key,aliases]of Object.entries(p.manualHeads??{}))for(const id of Object.keys(aliases)){
  if(manualOwners.has(id))return result(state,'unproved-task-history');manualOwners.set(id,key);
 }
 for(const row of p.reviews){
  if(rows.has(row.id)||!Number.isSafeInteger(row.seq)||row.seq<1||row.seq>state.appliedSeq||
    row.undoneAt!==null&&(!Number.isSafeInteger(row.undoneAt)||row.undoneAt<=row.seq||row.undoneAt>state.appliedSeq))return result(state,'ambiguous-review');
  if(!Number.isSafeInteger(row.at)||row.at<0||row.at>at)return result(state,'future-history');
  rows.set(row.id,row);participants.set(row.install,Math.min(participants.get(row.install)??Infinity,row.at));
  if(!row.undoneAt)firstScore=Math.min(firstScore,row.at);
 }
 for(let seq=1;seq<=state.appliedSeq;seq++){
  const envelope=state.canonical[seq],event=envelope?.event,outcome=p.outcomes?.[event?.id];
  if(envelope?.seq!==seq||!event||event.learner!==p.learner||!outcome||outcome.provisional||outcome.seq!==seq||
    !['applied','observation'].includes(outcome.status)||envelope.rt<lastReceipt||event.dseq!==(dseq.get(event.install)??0)+1)return result(state,'incomplete-prefix');
  if(!Number.isSafeInteger(event.ts)||!Number.isSafeInteger(envelope.rt)||event.ts<0||envelope.rt<0||event.ts>at||envelope.rt>at)return result(state,'future-history');
  lastReceipt=envelope.rt;dseq.set(event.install,event.dseq);boundaries.set(event.install,Math.max(boundaries.get(event.install)??-Infinity,event.ts));
  if(event.install!=='@server')participants.set(event.install,Math.min(participants.get(event.install)??Infinity,event.ts));
  events.set(event.id,{event,seq,rt:envelope.rt,outcome});
  if(event.ts!==envelope.rt)fence(event.ts,envelope.rt);
  const applied=outcome.status==='applied',key=canonicalKey(event.data.taskKey),task=p.tasks[key];
  if(event.type==='learner-settings-baseline'){
   const baseline=p.learnerSettingsBaseline;
   if(seq!==1||!applied||baseline?.id!==event.id||baseline.sourceHash!==event.data.sourceHash||baseline.snapshotHash!==event.data.snapshotHash)return result(state,'unproved-zone-history');
   zoneEvents.push({kind:'anchor',zone:event.data.settings.learnerTimezone,rt:envelope.rt});fence(envelope.rt);continue;
  }
  if(event.type==='settings'){
   if(event.data.key==='learnerTimezone'){
    fence(event.ts,envelope.rt);if(applied)zoneEvents.push({kind:'setting',zone:event.data.value,rt:envelope.rt,id:event.id});
   }else if(!BUDGET_SETTINGS.has(event.data.key)&&!event.data.key.startsWith('topicsOff:'))return result(state,'mutation-history');
   continue;
  }
  if(event.type==='permit-grant'){
   if(applied)zoneEvents.push({kind:'witness',zone:event.data.timezone,rt:envelope.rt});continue;
  }
  if(event.type==='capture')continue;
  if(event.type==='content-activate'){
   if(Object.keys(event.data.revisions).some(key=>!p.tasks[canonicalKey(key)]))return result(state,'unproved-task-history');
   fence(event.ts,envelope.rt);continue; // Revision changes do not alter any card.
  }
  if(event.type==='manual-card'){
   fence(event.ts,envelope.rt);const owner=manualOwners.get(event.id);
   if(!applied){if(outcome.reason==='manual-card-content-occupied'&&!p.tasks[owner])return result(state,'unproved-task-history');continue;}
   if(!owner||p.manualCards?.[event.id]?.taskKey!==owner||heads.has(owner))return result(state,'unproved-task-history');
   heads.set(owner,event.id);writes.set(owner,[{id:event.id,seq,rt:envelope.rt,before:null,creation:true}]);continue;
  }
  if(!MUTATIONS.has(event.type))return result(state,'mutation-history');
  fence(event.ts,envelope.rt);
  if(!applied)continue;
  if(event.type==='baseline'&&outcome.reason==='baseline-already-imported')continue;
  const effect=p.effects?.[event.id],scope=effect?.taskKeys;
  if(!task||effect?.id!==event.id||effect.install!==event.install||!Array.isArray(scope)||!scope.length||new Set(scope).size!==scope.length||!scope.includes(key))return result(state,'unproved-task-history');
  if(event.data.parent!==(heads.get(key)??null))return result(state,'broken-review-chain');
  let before=effect.before,restored=null;
  if(event.type==='undo'||event.type==='hesitation-override'){
   const group=p.effects[event.data.parent],origin=events.get(group?.root);
   if(!group||group.root!==event.data.target||group.install!==event.install||!origin||!sameKeys(scope,group.taskKeys)||!group.before)return result(state,'unproved-task-history');
   fence(origin.event.ts,origin.rt,group.at??origin.rt,event.ts,envelope.rt);
   if(event.type==='undo'){
    if(effect.root!==event.id||effect.type!=='undo'||Object.keys(before??{}).length||group.type==='undo'||group.type==='baseline')return result(state,'unproved-task-history');
    restored=group.before;if(group.reviewId)undone.set(group.reviewId,seq);
   }else{
    if(group.type!=='review'||effect.type!=='review'||effect.root!==group.root||effect.reviewId!==group.reviewId||!effect.overridden)return result(state,'unproved-task-history');
    overrides.set(group.reviewId,event.id);
   }
   before=null; // Inherited origin snapshots are NOT immediate correction before-images.
  }else if(effect.root!==event.id||effect.type!==event.type||!before||!sameKeys(Object.keys(before),scope))return result(state,'unproved-task-history');
  const expected=event.type==='repair'&&event.data.action==='swap'?[key,canonicalKey(event.data.replacementTaskKey)]:[key];
  if(event.type!=='undo'&&event.type!=='hesitation-override'&&!sameKeys(scope,expected))return result(state,'unproved-task-history');
  for(const member of scope){
   const current=p.tasks[member],prior=heads.get(member)??null,snapshot=before?.[member];
   if(!current||(event.type==='undo'||event.type==='hesitation-override')&&prior!==event.data.parent||member!==key&&event.type==='repair'&&event.data.replacementParent!==prior)return result(state,'broken-review-chain');
   if(before&&(!identity(snapshot,current)||snapshot.head!==prior))return result(state,'broken-review-chain');
   if(restored&&!identity(restored[member],current))return result(state,'unproved-task-history');
   const chain=writes.get(member)??[];chain.push({id:event.id,type:event.type,seq,rt:envelope.rt,before:snapshot??null,restored:restored?.[member]??null});writes.set(member,chain);heads.set(member,event.id);
  }
  if(event.type==='baseline'&&(before[key].card!==null||before[key].head!==null))return result(state,'unproved-task-history');
  if(event.type!=='review')continue;
  const row=rows.get(event.id);
  if(!row||row.seq!==seq||row.install!==event.install||row.taskKey!==key||event.data.attempt.mode!=='scored'||effect.reviewId!==row.id||effect.at!==row.at||event.data.contentRevision!==before[key].contentRevision||before[key].known||before[key].suspended)return result(state,'ambiguous-review');
  fence(event.ts,envelope.rt,row.at);
 }
 for(const row of rows.values())if(events.get(row.id)?.event.type!=='review'||events.get(row.id)?.outcome.status!=='applied'||
  (row.undoneAt??null)!==(undone.get(row.id)??null)||(row.overrideId??null)!==(overrides.get(row.id)??null))return result(state,'ambiguous-review');
 if(!Number.isFinite(firstScore))return result(state,'no-scored-history');
 // Every known device can work offline, including capture-only installations.
 // First activity or a permit after D does not retroactively add it to D.
 // Boundaries cannot rule out backdating or identify retired installations.
 for(const permit of Object.values(p.permits??{}))if(!permit.usedBy){
  if(!Number.isSafeInteger(permit.startsAt)||!Number.isSafeInteger(permit.endsAt)||permit.endsAt<=permit.startsAt||typeof permit.install!=='string')return result(state,'unproved-permit-history');
  participants.set(permit.install,Math.min(participants.get(permit.install)??Infinity,permit.startsAt));
 }
 const schedules=[];
 for(const key in p.tasks){
  const task=p.tasks[key],chain=writes.get(key)??[],intro=p.introductions[key],introduced=events.get(intro?.id);
  if(task.taskKey!==key||task.head!==(heads.get(key)??null))return result(state,'broken-review-chain');
  if(intro&&(!introduced||introduced.outcome.status!=='applied'||canonicalKey(introduced.event.data.taskKey)!==key||!['review','baseline'].includes(introduced.event.type)||Boolean(intro.baseline)!==(introduced.event.type==='baseline')))return result(state,'unproved-task-history');
  if(!intro){if(task.card!==null)return result(state,'unproved-task-history');continue;}
  const segments=[{at:-Infinity,due:Infinity}];
  for(let i=0;i<chain.length;i++){
   const write=chain[i],after=i+1<chain.length?chain[i+1].before:task;
   if(after&&(!identity(after,task)||after.head!==write.id))return result(state,'broken-review-chain');
   if(write.restored&&after&&JSON.stringify(after.card)!==JSON.stringify(write.restored.card))return result(state,'unproved-task-history');
   const due=write.seq<introduced.seq?Infinity:after?dueAt(after,write.rt):NaN;
   if(after&&due===null)return result(state,'unproved-task-history');
   segments.push({at:write.rt,due});
  }
  schedules.push(segments);
 }
 if(Object.keys(p.introductions).some(key=>!p.tasks[key]))return result(state,'unproved-task-history');
 // Zone setters without an initial witness cannot establish older boundaries.
 // A later canonical grant witnesses its actual active zone; future days can
 // then be considered without assuming the pre-anchor zone.
 const hasSetting=zoneEvents.some(row=>row.kind==='setting'),firstSetting=zoneEvents.findIndex(row=>row.kind==='setting');
 const initial=zoneEvents.find((row,index)=>row.kind!=='setting'&&(!hasSetting||index<firstSetting));
 let zone=hasSetting?(initial?.zone??null):today.timezone,pending=null;
 const zones=[{at:-Infinity,zone}];
 zoneEvents.push({kind:'tick',rt:lastReceipt});
 for(const row of zoneEvents){
  if(pending&&pending.at<=row.rt){zone=pending.zone;zones.push({at:pending.at,zone});fence(pending.at);pending=null;}
  if(row.kind==='tick')continue;
  if(row.kind==='setting'){
   if(zone)pending={at:dayBounds(row.rt,zone).endsAt,zone:row.zone};
   else pending={at:Infinity,zone:row.zone,since:row.rt};
  }else if(row.kind==='anchor'){zone=row.zone;zones.push({at:row.rt,zone});}
  else if(!zone||pending?.at===Infinity&&row.zone===pending.zone){zone=row.zone;zones.push({at:row.rt,zone});if(pending?.zone===zone){fence(pending.since,row.rt);pending=null;}}
  else if(row.zone!==zone)return result(state,'unproved-zone-history');
 }
 if(zone!==p.settings.learnerTimezone)return result(state,'unproved-zone-history');
 const unresolvedZone=p.pendingSettings?.find(row=>row.key==='learnerTimezone');
 if(unresolvedZone){fence(unresolvedZone.effectiveAt,Math.max(at,unresolvedZone.effectiveAt));if(unresolvedZone.effectiveAt<=at)zones.push({at:unresolvedZone.effectiveAt,zone:unresolvedZone.value});}
 if(pending?.at===Infinity)fence(zones.at(-1).at,at);
 const days=[];let day=today;
 for(let age=1;age<30;age++){
  day=dayBounds(day.startsAt-1,today.timezone);
  if(day.endsAt<=firstScore)break;
  if(day.startsAt<=firstScore||fences.some(([lo,hi])=>day.endsAt>lo&&day.startsAt<=hi))continue;
  const dayZone=zones.findLast(row=>row.at<=day.startsAt)?.zone;
  if(dayZone!==today.timezone||zones.some(row=>row.at>day.startsAt&&row.at<day.endsAt&&row.zone!==today.timezone))continue;
  if([...participants].some(([install,since])=>install!=='@server'&&since<day.endsAt&&(boundaries.get(install)??-Infinity)<day.endsAt))continue;
  let due=false;
  for(const chain of schedules){
   let low=0,high=chain.length;
   while(low<high){const mid=(low+high)>>>1;if(chain[mid].at<day.startsAt)low=mid+1;else high=mid;}
   const value=chain[low-1]?.due;
   if(Number.isNaN(value)||value<day.endsAt){due=true;break;}
  }
  if(!due)days.push(day.day);
 }
 return result(state,null,days.reverse(),today.timezone);
}
const effectiveZone=(projection,at)=>projection.pendingSettings?.findLast(row=>row.key==='learnerTimezone'&&row.effectiveAt<=at)?.value??projection.settings.learnerTimezone;
function localIntervals(state,at){
 const rows=Object.entries(state.local);
 if(rows.length+state.appliedSeq>MAX_EVENTS)return {reason:'history-limit'};
 const identities=[],corrections=[],targets=[];let from=at,to=at;
 for(const [id,record]of rows){
  const event=record?.event;
  if(!event||event.id!==id||event.id!==`${event.install}:${event.dseq}`||event.install!==state.scope.installation||
    event.learner!==state.scope.learner||event.epoch!==state.epoch||!validateEvent(event,{allowServer:false}).ok||record.bodyHash!==payloadHash(event))return {reason:'local-history'};
  // Valid future timestamps touch today/future only; they are never proof of
  // a device boundary or of a historical schedule. Malformed rows fail above.
  from=Math.min(from,event.ts);to=Math.max(to,event.ts);
  identities.push([id,event.ts,record.bodyHash]);
  if(event.type==='undo'||event.type==='hesitation-override')corrections.push(event);
 }
 // A local correction reaches back to its real originating event, just as
 // canonical proof does. Local timestamps still never establish sync boundaries.
 if(corrections.length){
  const references=new Map(rows),key=value=>state.projection.taskAliases?.[value]??value;
  for(let seq=1;seq<=state.appliedSeq;seq++){
   const row=state.canonical[seq];
   if(!row?.event||row.seq!==seq||references.has(row.event.id))return {reason:'local-history'};
   references.set(row.event.id,row);
  }
  const resolve=(id,correction)=>{
   const row=references.get(id),event=row?.event;
   if(!event||event.id!==id||event.id!==`${event.install}:${event.dseq}`||event.install!==correction.install||
     event.learner!==correction.learner||event.epoch!==correction.epoch||event.dseq>=correction.dseq||
     !validateEvent(event,{allowServer:false}).ok||row.bodyHash!==payloadHash(event))return null;
   if(row.seq!==undefined&&(!Number.isSafeInteger(row.rt)||row.rt<0||row.authority!=='device'))return null;
   return {event,rt:row.seq===undefined?event.ts:row.rt};
  };
  for(const event of corrections){
   const origin=resolve(event.data.target,event),parent=resolve(event.data.parent,event),group=state.projection.effects?.[event.data.parent];
   if(!origin||!parent||!group||group.root!==origin.event.id||group.install!==event.install||
     group.type!==origin.event.type||!MUTATIONS.has(group.type)||['undo','baseline','hesitation-override'].includes(group.type)||
     !Array.isArray(group.taskKeys)||!group.taskKeys.includes(key(event.data.taskKey))||!group.taskKeys.includes(key(origin.event.data.taskKey))||
     event.type==='hesitation-override'&&group.type!=='review')return {reason:'local-history'};
   if(parent.event.id!==origin.event.id&&(parent.event.type!=='hesitation-override'||parent.event.data.target!==origin.event.id||
     parent.event.dseq<=origin.event.dseq||key(parent.event.data.taskKey)!==key(event.data.taskKey)))return {reason:'local-history'};
   const effectAt=group.at??origin.rt;
   if(!Number.isSafeInteger(effectAt)||effectAt<0)return {reason:'local-history'};
   from=Math.min(from,origin.event.ts,origin.rt,effectAt);to=Math.max(to,origin.event.ts,origin.rt,effectAt);
   targets.push([event.id,origin.event.ts,origin.rt,effectAt]);
  }
 }
 identities.sort(([a],[b])=>a.localeCompare(b));
 return {count:rows.length,from,to,key:JSON.stringify([identities,targets.sort(([a],[b])=>a.localeCompare(b))])};
}
/** One bounded canonical proof per prefix/day; local entries only filter it.
 * A cold overlay may lazily replay the canonical prefix through the injected
 * pure engine. No storage IO, timer, refresh/grade hook or caller-state writes.
 */
export function createRestDayEvidenceReader({replayCanonical}={}){
 if(replayCanonical!==undefined&&typeof replayCanonical!=='function')throw TypeError('canonical-replay-required');
 let cache=null,canonicalCache=null,filteredCache=null;
 return (state,{at=Date.now()}={})=>{
  const reason=unavailable(state,at);if(reason)return result(state,reason);
  try{
   const local=localIntervals(state,at);if(local.reason)return result(state,local.reason);
   const last=state.canonical[state.appliedSeq];
   const prefixKey=JSON.stringify([state.scope.environment,state.scope.learner,state.epoch,state.head,state.appliedSeq,last?.bodyHash,last?.rt]);
   let value;
   if(local.count&&cache?.prefixKey===prefixKey&&at>=cache.checkedAt&&at<cache.today.endsAt)value=cache.value;
   else{
    let canonicalState=state;
    if(local.count){
     if(canonicalCache?.prefixKey!==prefixKey){
      if(!replayCanonical)return result(state,'local-history');
      const canonical=Array.from({length:state.appliedSeq},(_,index)=>state.canonical[index+1]);
      const projection=replayCanonical(canonical),candidate={...state,projection,local:{}};
      const issue=unavailable(candidate,at);if(issue)return result(state,issue);
      canonicalCache={prefixKey,projection};
     }
     canonicalState={...state,projection:canonicalCache.projection,local:{}};
    }
    const zone=effectiveZone(canonicalState.projection,at),key=JSON.stringify([prefixKey,zone]);
    if(cache?.key===key&&at>=cache.checkedAt&&at<cache.today.endsAt)value=cache.value;
    else{
     const today=studyDayAllowance(canonicalState.projection,at);value=prove(canonicalState,at,today);
     if(value.reason!=='future-history')cache={key,prefixKey,today,checkedAt:at,value};
    }
   }
   if(!local.count||!value.available)return value;
   // The app counts review-day strings in its effective zone. Never reinterpret
   // a canonical old-zone proof after an explicit local timezone transition.
   const zone=effectiveZone(state.projection,at);
   if(zone!==value.timezone)return result(state,'local-zone-change');
   const key=JSON.stringify([local.key,zone]);
   if(filteredCache?.base===value&&filteredCache.key===key&&at>=filteredCache.checkedAt&&at<cache.today.endsAt)return filteredCache.value;
   const from=dayBounds(local.from,zone).day,to=dayBounds(local.to,zone).day;
   const days=value.days.filter(day=>day<from||day>to);
   const filtered=days.length===value.days.length?value:result(state,null,days,zone);
   filteredCache={base:value,key,checkedAt:at,value:filtered};return filtered;
  }catch{return result(state,'unproved-history');}
 };
}
