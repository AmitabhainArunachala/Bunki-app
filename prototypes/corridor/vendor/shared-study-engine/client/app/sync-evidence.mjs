import {studyDayAllowance} from '../replay.mjs';

const detached=value=>structuredClone(value);
const sequence=value=>Number.isSafeInteger(value)&&value>=0;

/** Presentation evidence only. The backend supplies validated, applied canonical
 * facts; local acknowledgements and count differences never identify a sender. */
export function createSharedActivityTracker({installation,afterSeq=0,now=Date.now,labelForInstallation=()=>null}){
  let cursor=sequence(afterSeq)?afterSeq:0,epoch=null,compatible=false;
  const updates=new Map(),boundary=new Map(),limits=new Map();
  function label(install){
    try{const value=labelForInstallation(install);return typeof value==='string'&&value.trim()&&value.length<=80&&!/[\u0000-\u001f\u007f]/u.test(value)?value.trim():null;}catch{return null;}
  }
  const source=install=>({installation:install,label:label(install)});
  function snapshot(projection=null){
    let limitSettings=[];
    if(compatible&&projection&&!projection.error&&!projection.updateRequired){const today=studyDayAllowance(projection,now()),fact=limits.get(`${today.timezone}|${today.day}`);
      // An applied identical total is a no-op. Attribute the received setting,
      // never claim this installation increased or changed the limit.
      if(fact&&fact.installation!==installation&&fact.total===today.limit)limitSettings=[{...fact,...source(fact.installation)}];}
    return detached({updated:[...updates.values()].map(row=>({...row,...source(row.installation)})),limitSettings,changedTaskKeys:compatible?[...boundary.keys()]:[]});
  }
  function observe(activity,projection=null){
    if(!activity?.available||!sequence(activity.through)||!Array.isArray(activity.events)){compatible=false;boundary.clear();return snapshot(projection);}
    if(epoch!==null&&activity.epoch!==epoch){compatible=true;updates.clear();boundary.clear();limits.clear();cursor=activity.through;epoch=activity.epoch;return snapshot(projection);}
    epoch=activity.epoch;
    if(activity.through<cursor)return snapshot(projection);
    compatible=true;
    const receivedAt=now();
    for(const fact of [...activity.events].sort((a,b)=>a.seq-b.seq)){
      if(!sequence(fact.seq)||fact.seq<=cursor||fact.seq>activity.through||typeof fact.eventId!=='string'||typeof fact.installation!=='string')continue;
      if(fact.type==='review'&&fact.installation!==installation&&typeof fact.taskKey==='string'&&!fact.undone){
        const row=updates.get(fact.installation)??{installation:fact.installation,count:0,receivedAt};row.count++;row.receivedAt=receivedAt;updates.set(fact.installation,row);
        boundary.set(fact.taskKey,{...source(fact.installation),eventId:fact.eventId,taskKey:fact.taskKey});
      }else if(fact.type==='settings'&&fact.key==='newTodayTotal'){
        const value=fact.value;if(value?.version===1&&typeof value.day==='string'&&typeof value.timezone==='string'&&Number.isInteger(value.total)&&value.total>=0&&value.total<=200)
          limits.set(`${value.timezone}|${value.day}`,{...source(fact.installation),total:value.total,day:value.day,timezone:value.timezone,eventId:fact.eventId,receivedAt});
      }
    }
    cursor=activity.through;
    return snapshot(projection);
  }
  function consumeBoundary(before,after,projection){
    if(!compatible||!projection||projection.error||projection.updateRequired){boundary.clear();return [];}
    const previous=new Set(before),remaining=new Set(after),reviews=new Map((projection?.reviews??[]).map(row=>[row.id,row])),skipped=[];
    for(const [key,fact] of boundary){
      const review=reviews.get(fact.eventId),current=projection?.tasks?.[key]?.head===fact.eventId&&review&&!review.undoneAt;
      if(current&&previous.has(key)&&!remaining.has(key))skipped.push({...fact,...source(fact.installation)});
    }
    // These facts describe this boundary only, including cards still eligible.
    // A later filter change must not reuse them to manufacture a skip notice.
    boundary.clear();return detached(skipped);
  }
  function newByDevice(projection,day){
    if(!compatible||!projection||projection.error||projection.updateRequired)return [];
    const counts=new Map();
    for(const intro of Object.values(projection?.introductions??{})){
      if(intro.baseline||intro.day!==day||!intro.permitId)continue;
      const permit=projection.permits?.[intro.permitId];
      if(!permit||permit.usedBy!==intro.id||permit.day!==day||typeof permit.install!=='string')continue;
      counts.set(permit.install,(counts.get(permit.install)??0)+1);
    }
    return [...counts].map(([install,count])=>({...source(install),count,local:install===installation}));
  }
  return Object.freeze({get cursor(){return cursor;},observe,snapshot,consumeBoundary,newByDevice});
}
