export function createEngine(data, api) {
  const PIN = 'john-fsrs6-r090-ts541-v1';
  const scheduler = api.fsrs(api.generatorParameters({
    w: [0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542],
    request_retention: 0.9, maximum_interval: 36500, enable_fuzz: false,
    enable_short_term: true, learning_steps: ['1m','10m'], relearning_steps: ['10m']
  }));
  const kinds = ['meaning','reading','grammar','apply'];
  const lessonMap = new Map(data.lessons.map(l => [l.id,l]));
  const cards = data.lessons.flatMap(l => kinds.map((kind,k) => ({
    id: `${l.id}:${kind}:v1`, family: l.id, kind, world: l.world,
    order: l.sequence * 4 + k, lesson: l
  }))).sort((a,b) => a.order-b.order);
  const cardMap = new Map(cards.map(c=>[c.id,c]));
  const require = (condition,message) => { if (!condition) throw new Error(message); };
  const copy = value => JSON.parse(JSON.stringify(value));
  const iso = ms => new Date(ms).toISOString();
  const time = value => {
    require(typeof value === 'string' && value.length === 24, 'Invalid event time.');
    const t = Date.parse(value);
    require(Number.isFinite(t) && iso(t) === value, 'Invalid event time.');
    return t;
  };
  const day = (ms,zone) => new Intl.DateTimeFormat('en-CA',{
    timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit'
  }).format(new Date(ms));
  function fresh(device) {
    return {format:'john-threads-progress',version:1,deck:data.id,content:data.contentDigest,
      scheduler:PIN,device,timezone:'Asia/Tokyo',events:[],settings:{newLimit:6,
        kinds:['meaning','grammar'],worlds:data.worlds.map(w=>w.id)}};
  }
  function validateSettings(s) {
    require(s && Number.isInteger(s.newLimit) && s.newLimit>=0 && s.newLimit<=60,'New cards must be between 0 and 60.');
    require(Array.isArray(s.kinds) && s.kinds.every(k=>kinds.includes(k)) && new Set(s.kinds).size===s.kinds.length,'Invalid card types.');
    require(Array.isArray(s.worlds) && s.worlds.every(w=>data.worlds.some(x=>x.id===w)) && new Set(s.worlds).size===s.worlds.length,'Invalid themes.');
  }
  function validate(raw,now=Date.now()) {
    require(raw && typeof raw==='object' && !Array.isArray(raw),'This is not a progress backup.');
    require(raw.format==='john-threads-progress' && raw.version===1,'Unsupported backup format. Nothing was replaced.');
    require(raw.deck===data.id && raw.content===data.contentDigest,'This backup belongs to a different content edition.');
    require(raw.scheduler===PIN,'The scheduler version does not match.');
    require(typeof raw.device==='string' && raw.device.length>0 && raw.device.length<=100,'Invalid device identity.');
    require(raw.timezone==='Asia/Tokyo','This edition uses a fixed Japan study day.');
    validateSettings(raw.settings);
    require(Array.isArray(raw.events),'The event history is missing.');
    const seen = new Map(), revoked = new Set();
    let previous = -Infinity;
    for (let i=0;i<raw.events.length;i++) {
      const e=raw.events[i];
      require(e && typeof e==='object' && !Array.isArray(e),'Invalid event.');
      require(typeof e.id==='string' && e.id.length>0 && e.id.length<=100 && !seen.has(e.id),'Duplicate or invalid event identity.');
      require(e.seq===i+1,'The event order is incomplete.');
      const at=time(e.at), observed=time(e.observedAt);
      require(at>previous && at<=now+300000 && observed<=now+300000 && Math.abs(at-observed)<=300000,'Event times are out of order or in the future. Check the device clock.');
      previous=at;
      if(e.type==='grade') {
        require(cardMap.has(e.card),'A card in this backup is not in this edition.');
        require(Number.isInteger(e.rating) && e.rating>=1 && e.rating<=4,'Invalid review rating.');
        require(Number.isFinite(e.durationMs) && e.durationMs>=0 && e.durationMs<=86400000,'Invalid review duration.');
      } else if(e.type==='undo') {
        require(seen.get(e.target)?.type==='grade' && !revoked.has(e.target),'Invalid undo event.');
        const latest=[...seen.values()].reverse().find(x=>x.type==='grade' && !revoked.has(x.id));
        require(latest?.id===e.target,'Only the latest active grade can be undone.');
        revoked.add(e.target);
      } else if(e.type==='pause') {
        require(cardMap.has(e.card) && typeof e.value==='boolean','Invalid pause event.');
      } else throw new Error('Unknown event type. Nothing was replaced.');
      seen.set(e.id,e);
    }
    return copy(raw);
  }
  function derive(ledger) {
    const undone = new Set(ledger.events.filter(e=>e.type==='undo').map(e=>e.target));
    const states = new Map(), first = new Map(), familyLast = new Map();
    const pauses = new Map(), resumes = new Map(), failureCount = new Map(), lastFailure = new Map();
    const grades=[];
    for (const e of ledger.events) {
      if(e.type==='pause') {
        pauses.set(e.card,e.value);
        if(!e.value) resumes.set(e.card,e.seq);
      }
      if(e.type!=='grade' || undone.has(e.id)) continue;
      const c=cardMap.get(e.card), at=new Date(e.at);
      const old=states.get(e.card)||api.createEmptyCard(at);
      const result=scheduler.next(old,at,e.rating).card;
      for (const k of ['stability','difficulty']) result[k]=Number(result[k].toFixed(8));
      states.set(e.card,result);
      if(!first.has(e.card))first.set(e.card,e.at);
      familyLast.set(c.family,{card:c.id,at:e.at});
      if(e.rating===1){failureCount.set(c.id,(failureCount.get(c.id)||0)+1);lastFailure.set(c.id,e.seq);}
      grades.push(e);
    }
    const paused = c => pauses.get(c.id)===true || ((failureCount.get(c.id)||0)>=6 && (lastFailure.get(c.id)||0)>(resumes.get(c.id)||0));
    return {states,first,familyLast,paused,grades,failureCount,undone};
  }
  function queue(ledger,now=Date.now()) {
    const d=derive(ledger), today=day(now,ledger.timezone);
    const startedToday=[...d.first.values()].filter(at=>day(Date.parse(at),ledger.timezone)===today).length;
    const due=[],newCards=[],waiting=[];
    let buried=0,paused=0;
    for(const c of cards) {
      if(!ledger.settings.kinds.includes(c.kind)||!ledger.settings.worlds.includes(c.world))continue;
      if(d.paused(c)){paused++;continue;}
      const last=d.familyLast.get(c.family);
      if(last && last.card!==c.id && day(Date.parse(last.at),ledger.timezone)===today){buried++;continue;}
      const state=d.states.get(c.id);
      if(!state)newCards.push(c);
      else if(state.due.getTime()<=now)due.push(c);
      else waiting.push({card:c,at:state.due.getTime()});
    }
    due.sort((a,b)=>d.states.get(a.id).due-d.states.get(b.id).due||a.order-b.order);
    const allowed=Math.max(0,ledger.settings.newLimit-startedToday);
    const selectedNew=newCards.slice(0,allowed);
    return {...d,due,newCards:selectedNew,availableNew:newCards.length,startedToday,buried,pausedCount:paused,
      next:due[0]||selectedNew[0]||null,nextAt:waiting.length?Math.min(...waiting.map(x=>x.at)):null};
  }
  function append(ledger,payload,id,now=Date.now()) {
    const out=copy(ledger), previous=out.events.length?Date.parse(out.events.at(-1).at):-Infinity;
    require(now>=previous-300000,'The device clock moved backwards. Nothing was saved.');
    const at=iso(Math.max(now,previous+1));
    out.events.push({...payload,id,seq:out.events.length+1,at,observedAt:iso(now)});
    return validate(out,now);
  }
  function grade(ledger,cardId,rating,id,durationMs=0,now=Date.now()) {
    const q=queue(ledger,now);
    require(q.due.some(c=>c.id===cardId)||q.newCards.some(c=>c.id===cardId),'This card is no longer eligible or is not due. Refresh the review.');
    require(Number.isInteger(rating)&&rating>=1&&rating<=4,'Choose a valid rating.');
    return append(ledger,{type:'grade',card:cardId,rating,durationMs:Math.min(86400000,Math.max(0,durationMs))},id,now);
  }
  function undo(ledger,id,now=Date.now()) {
    const latest=derive(ledger).grades.at(-1);
    require(latest,'There is no active grade to undo.');
    return append(ledger,{type:'undo',target:latest.id},id,now);
  }
  function pause(ledger,cardId,value,id,now=Date.now()) {
    require(cardMap.has(cardId),'Unknown card.');
    return append(ledger,{type:'pause',card:cardId,value},id,now);
  }
  function previewImport(current,incoming,now=Date.now()) {
    const checked=validate(incoming,now);
    const n=Math.min(current.events.length,checked.events.length);
    for(let i=0;i<n;i++)require(JSON.stringify(current.events[i])===JSON.stringify(checked.events[i]),
      'These histories branched on different devices. Automatic merging would change review evidence. Keep both backups; nothing was replaced.');
    if(checked.events.length<=current.events.length)return {added:0,result:copy(current)};
    const result=copy(current);
    result.events=checked.events;
    return {added:checked.events.length-current.events.length,result:validate(result,now)};
  }
  function intervals(ledger,cardId,now=Date.now()) {
    const s=derive(ledger).states.get(cardId)||api.createEmptyCard(new Date(now));
    return [1,2,3,4].map(r=>scheduler.next(s,new Date(now),r).card.due.getTime()-now);
  }
  return {PIN,cards,cardMap,lessonMap,fresh,validate,validateSettings,derive,queue,grade,undo,pause,previewImport,intervals,day};
}
