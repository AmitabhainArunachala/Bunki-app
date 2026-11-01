/** Standalone presentation adapter over the real v4 replica/replay APIs.
 * No scheduler or event store is implemented here. Durability belongs to store.
 */
import {manualCardData} from './manual-cards.mjs';
import {customSessionOptions,selectCustomSession,sessionReviewEvidence} from './study-sessions.mjs';
import {ensureLocalDayBudget} from '../app/local-budget.mjs';
import {canonicalizeLocalPending} from './local-canonical.mjs';
import {contentReady} from './content-ready.mjs';
import { canonicalStringify, payloadHash } from '../schema/event.mjs';
import { dayBounds, studyDayAllowance } from '../replay.mjs';
import { servable,nextStep } from '../vendor/engine.js';
const clone = v => structuredClone(v);
const immutable = v => { if (v && typeof v === 'object') { Object.values(v).forEach(immutable); Object.freeze(v); } return v; };

export async function createReplicaBackend({ store, engine, catalog, localAuthority = null, reserveNewPermits = null, now = Date.now, uuid = () => crypto.randomUUID() }) {
  let state = await store.readState(), projection = state.projection, disposed = false, lastTs = 0;
  const listeners = new Set(), intents = new Map();
  const typedIntents = new Map();
  // Day grants and device canonical receipts share the local sequence. A wake
  // timer must not reserve the same sequence as a newly submitted command.
  let localWrite=Promise.resolve();
  const withLocalWrite=action=>{const result=localWrite.then(action);localWrite=result.catch(()=>{});return result;};
  let previewCache = null;
  const entries = new Map(catalog.map(entry => [entry.taskKey, entry]));
  const catalogEntries=()=>[...catalog,...Object.values(projection.manualCards??{})];
  const refreshManualEntries=()=>{for(const entry of Object.values(projection.manualCards??{}))entries.set(entry.taskKey,entry);};
  refreshManualEntries();
  let refreshGeneration=0, refreshedGeneration=0, refreshing=null;
  function refreshThrough(generation) {
    if(disposed||refreshedGeneration>=generation)return Promise.resolve();
    if(!refreshing)refreshing=(async()=>{
      while(!disposed&&refreshedGeneration<refreshGeneration){
        const readingGeneration=refreshGeneration,next=await store.readState();
        if(disposed)return;
        // A write or explicit refresh during I/O requires a newer read. Never
        // let its caller complete from the snapshot that preceded that request.
        if(readingGeneration!==refreshGeneration)continue;
        refreshedGeneration=readingGeneration;
        if(next.storageRevision<state.storageRevision)continue;
        state=next;projection=next.projection;refreshManualEntries();
        for(const fn of listeners){try{fn(projection);}catch{/* presentation only */}}
      }
    })().finally(()=>{refreshing=null;});
    return refreshing.then(()=>refreshThrough(generation));
  }
  const refresh=()=>refreshThrough(++refreshGeneration);
  const stop=store.subscribe(()=>{refresh().catch(()=>{});});
  // Share only calls queued before a read starts. A later status request gets
  // a new read even if an older one is still in flight (including cross-handle writes).
  let queuedStatus=null;
  function status(){
    if(!queuedStatus){const batch={};batch.promise=Promise.resolve().then(()=>{if(queuedStatus===batch)queuedStatus=null;return store.status();});queuedStatus=batch;}
    return queuedStatus.promise.then(clone);
  }
  function command(type, data) {
    lastTs = Math.max(now(), lastTs + 1);
    return immutable({ commandId: uuid(), type, data: clone(data), ts: lastTs });
  }
  async function submitCommand(intent) {
    if (disposed) return { kind: 'failed', reason: 'closed' };
    const body = canonicalStringify(intent), previous = intents.get(intent.commandId);
    if (previous) {
      if (previous.body !== body) return { kind: 'conflict', reason: 'changed-retry' };
      if (previous.result) return previous.result;
      if (previous.pending) return previous.pending;
    }
    const record = previous ?? { body };
    intents.set(intent.commandId, record);
    record.pending = (async () => {
      try {
        const beforeRefresh=refreshGeneration;
        // Recover an uncertain commit by its immutable wire payload, never append a second event.
        const find = snapshot => [...Object.values(snapshot.local), ...Object.values(snapshot.canonical)].find(r =>
          r.event.install === store.scope.installation && r.event.ts === intent.ts && r.event.type === intent.type &&
          canonicalStringify(r.event.data) === canonicalStringify(intent.data));
        let existing = find(await store.readState()), appended;
        if (!existing) {
          try { appended = await store.append({ type: intent.type, data: intent.data, ts: intent.ts }); }
          catch (error) { existing = find(await store.readState()); if (!existing) throw error; }
        }
        const event = existing?.event ?? appended.event;
        if(localAuthority)await withLocalWrite(()=>canonicalizeLocalPending(store,{authority:localAuthority,now}));
        // A successful append already invalidates via the store subscription.
        // Lost commit replies have no notification, so force a read in that case.
        await refreshThrough(appended&&refreshGeneration>beforeRefresh?refreshGeneration:++refreshGeneration);
        const outcome = projection.outcomes?.[event.id];
        const result = { kind: outcome?.status === 'applied' ? 'durable' : outcome?.status === 'observation' ? 'observation-only' : 'unsupported',
          commandId: intent.commandId, eventId: event.id, dseq: event.dseq,eventTs:event.ts, reason: outcome?.reason ?? projection.error?.reason ?? projection.updateRequired?.reason ?? null,
          outcome, localOnly: true };
        record.result = immutable(result);
        return record.result;
      } catch (error) { return { kind: 'failed', commandId: intent.commandId, reason: error.code ?? 'storage-failed' }; }
      finally { record.pending = null; }
    })();
    return record.pending;
  }
  function snapshotAttempt(taskKey, { practice = false,learnAhead=false,session=null } = {}) {
    const task = projection.tasks?.[taskKey], entry = entries.get(taskKey);
    if (!task || !contentReady(entry)) throw Error('content-not-verified');
    return immutable({ id: uuid(), taskKey, parent: task.head, contentRevision: task.contentRevision,
      base: projection.appliedSeq, module: task.module,...(sessionReviewEvidence(session??{})?{session:sessionReviewEvidence(session)}:{}),learnAhead:learnAhead===true, mode: practice ? 'practice' : 'scored',
      hesitation: clone(engine.hesitationEvidence(projection, { module: task.module, base: projection.appliedSeq })) });
  }
  function reviewData(attempt, rawRating, thinkMs, reviewedAt=now()) {
    const task = projection.tasks[attempt.taskKey];
    if (task.head !== attempt.parent || task.contentRevision !== attempt.contentRevision) throw Error('stale-attempt');
    // Sync may confirm the preceding review while this card is on screen.
    const evidence=engine.hesitationEvidence(projection,{module:task.module,base:attempt.base});
    if(['windowHash','thresholdMs','sampleCount'].some(k=>evidence[k]!==attempt.hesitation[k]))throw Error('stale-attempt');
    const signals = projection.captures.filter(c => c.install === store.scope.installation && c.attemptId === attempt.id &&
      c.contextTaskKey === attempt.taskKey && c.targetTaskKey === attempt.taskKey && ['lookup','unknown','unsure'].includes(c.kind));
    const data = { ...(attempt.session?{session:clone(attempt.session)}:{}),taskKey: attempt.taskKey, parent: attempt.parent, contentRevision: attempt.contentRevision, rawRating,
      attempt: { id: attempt.id, mode: attempt.mode, revealed: true, foregroundValid: true, thinkMs, helpBeforeAnswer: false },
      hesitation: { ...evidence, signalIds: signals.map(c => c.id) }, learnAhead: attempt.learnAhead===true };
    const bounds = dayBounds(reviewedAt, projection.settings.learnerTimezone);
    const permit = attempt.mode==='practice'?null:Object.values(projection.permits).find(p => p.install === store.scope.installation && !p.usedBy && p.startsAt === bounds.startsAt && p.endsAt > reviewedAt);
    if (permit) data.permitId = permit.id;
    if (attempt.mode!=='practice' && signals.length && !task.suspended && !task.known && task.contract === 'vocabulary.read.v1') data.boost = { observationId: signals[0].id };
    return data;
  }
  function preview(attempt,thinkMs=0) {
    const key=JSON.stringify([attempt.id,thinkMs,state.storageRevision]);
    if(previewCache?.key===key)return previewCache.value;
    // These are four alternatives for ONE review, not four sequential commands.
    // dseq orders durable events; manufacturing future millisecond ticks here
    // would make the local receipt clamp differ from the displayed candidate.
    const reviewedAt=now(),cards={},ratings={},commands={};
    for(const rating of [1,2,3,4]){
      const intent=immutable({commandId:uuid(),type:'review',data:clone(reviewData(attempt,rating,thinkMs,reviewedAt)),ts:reviewedAt});
      const event={v:4,id:`${store.scope.installation}:${state.nextDseq}`,learner:store.scope.learner,install:store.scope.installation,dseq:state.nextDseq,
        base:intent.data.hesitation.base,ts:intent.ts,epoch:state.epoch,policy:'nsrs-policy-v1',type:intent.type,data:clone(intent.data)};
      const canonical=Object.values(state.canonical).filter(r=>r.seq<=state.appliedSeq).sort((a,b)=>a.seq-b.seq);
      const provisional=Object.values(state.local).sort((a,b)=>a.event.dseq-b.event.dseq).map(({event,bodyHash})=>({event,bodyHash}));
      provisional.push({event,bodyHash:payloadHash(event)});
      const prospective=engine.replay(canonical,{provisional,provisionalNow:Math.max(reviewedAt,...provisional.map(r=>r.event.ts))});
      const outcome=prospective.outcomes?.[event.id],review=prospective.reviews.find(r=>r.id===event.id);
      if(outcome?.status!=='applied'||!review)throw Error(outcome?.reason||prospective.error?.reason||'preview-not-admitted');
      cards[rating]=prospective.tasks[attempt.taskKey].card;ratings[rating]={effectiveRating:review.effectiveRating,at:review.at};commands[rating]=intent;
    }
    const value=immutable({cards,ratings,intents:commands});previewCache={key,value};return value;
  }
  function queue({ module = 'all',learningOnly=false } = {}) {
    const bounds = dayBounds(now(), projection.settings.learnerTimezone);
    const hasPermit = Object.values(projection.permits).some(p => p.install === store.scope.installation && !p.usedBy && p.startsAt <= now() && p.endsAt > now());
    return catalogEntries().filter(entry => {
      const t = projection.tasks[entry.taskKey];
      if (!t || !contentReady(entry) || (module !== 'all' && t.module !== module) || t.suspended || t.known) return false;
      if ((projection.settings.topicsOff[t.module] ?? []).includes(t.group)) return false;
      if (!projection.introductions[t.taskKey] && !hasPermit) return false;
      if(learningOnly){if(!t.card||![1,3].includes(t.card.state)||!Number.isFinite(Date.parse(t.card.due)))return false;}
      else if (!servable(t.card, new Date(now()), {dayEnd:bounds.endsAt-1})) return false;
      if ((!t.card || t.card.state === 0 || t.card.state === 2) && projection.reviews.some(r => !r.undoneAt && r.taskKey !== t.taskKey &&
          projection.tasks[r.taskKey].lexicalKey === t.lexicalKey && r.dayStart === bounds.startsAt)) return false;
      return true;
    }).sort((a, b) => {
      const x = projection.tasks[a.taskKey], y = projection.tasks[b.taskKey];
      return Number(!x.card) - Number(!y.card) || Number(y.priority) - Number(x.priority) ||
        (Date.parse(x.card?.due ?? '') || 0) - (Date.parse(y.card?.due ?? '') || 0);
    });
  }
  function sitting({module='all',ahead=false}={}){
    const ready=queue({module}),learning=queue({module,learningOnly:true}).map(e=>({id:e.taskKey,due:Date.parse(projection.tasks[e.taskKey].card.due)}));
    const step=nextStep({now:new Date(now()),queue:ready.filter(e=>![1,3].includes(projection.tasks[e.taskKey].card?.state)).map(e=>e.taskKey),learning,ahead});
    return {...step,...(step.show?{entry:entries.get(step.show)}:step.pause?{entry:entries.get(learning.sort((a,b)=>a.due-b.due)[0].id)}:{})};
  }
  /** A typed retry reuses its own accepted observation, including after restart.
   * Different supplied sentences remain separate observations; factory job deduplication
   * belongs to intake. Never derive a reading or choose between matching card senses. */
  async function captureTyped(value,{sentence=''}={}) {
    if(typeof value!=='string'||typeof sentence!=='string')return {kind:'invalid',reason:'typed-input'};
    const surface=value.normalize('NFKC').trim(),context=sentence.trim()?sentence:'';
    const invalidText=text=>/[\uD800-\uDFFF\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(text);
    if(!surface||invalidText(surface)||invalidText(sentence)||[...surface].length>128||[...sentence].length>4000||new TextEncoder().encode(sentence).length>16*1024)return {kind:'invalid',reason:'typed-input'};
    const key=canonicalStringify([surface,context]),prior=typedIntents.get(key);
    if(prior?.pending)return prior.pending;
    const record=prior??{};typedIntents.set(key,record);
    record.pending=(async()=>{
      await refresh();
      if(disposed)return {kind:'failed',reason:'closed'};
      const matches=[...new Map(catalogEntries().filter(e=>projection.tasks[e.taskKey]&&e.contractId==='vocabulary.read.v1'&&
        [e.term,e.form].some(v=>typeof v==='string'&&v.normalize('NFKC').trim()===surface)).map(e=>[e.noteGuid,e])).values()];
      if(matches.length)return immutable({kind:'existing',surface,taskKeys:matches.map(e=>e.taskKey)});
      const accepted=new Set(projection.captures.filter(c=>c.install===store.scope.installation).map(c=>c.id));
      const saved=[...Object.values(state.local),...Object.values(state.canonical)].map(r=>r.event).find(e=>
        accepted.has(e.id)&&e.learner===store.scope.learner&&e.install===store.scope.installation&&e.type==='capture'&&
        e.data.location==='typed'&&e.data.kind==='unknown'&&!e.data.targetTaskKey&&!e.data.attemptId&&
        e.data.surface.normalize('NFKC').trim()===surface&&(e.data.source?.context??'')===context);
      if(saved)return immutable({kind:'durable',eventId:saved.id,eventTs:saved.ts,capture:clone(saved.data),reused:true});
      if(!record.intent)record.intent=command('capture',{surface,kind:'unknown',location:'typed',
        source:{venue:'standalone',requestedAt:now(),...(context?{context}:{})}});
      const result=await submitCommand(record.intent);
      return immutable({...result,capture:clone(record.intent.data),reused:false});
    })();
    try{return await record.pending;}finally{record.pending=null;}
  }
  function customSession(input={}){return selectCustomSession(projection,catalogEntries(),input,{now:now(),dayStart:dayBounds(now(),projection.settings.learnerTimezone).startsAt,dayEnd:dayBounds(now(),projection.settings.learnerTimezone).endsAt-1,installation:store.scope.installation});}
  let newOverride=null;
  const todayAllowance=()=>studyDayAllowance(projection,now());
  const addNewToday=increment=>changeTodayAllowance('newTodayOverride',increment);
  const setNewTodayTotal=(total,displayedDay)=>changeTodayAllowance('newTodayTotal',total,displayedDay);
  async function changeTodayAllowance(key,amount,displayedDay){
    if(!localAuthority&&typeof reserveNewPermits!=='function')return {kind:'unsupported',reason:'server-permit-required'};
    const absolute=key==='newTodayTotal';
    if(absolute?(!Number.isInteger(amount)||amount<0||amount>200):![5,10,20].includes(amount)){
      return {kind:'invalid',reason:absolute?'invalid-today-total':'invalid-day-override'};
    }
    const {day,timezone,limit}=todayAllowance();
    if(newOverride&&(newOverride.day!==day||newOverride.timezone!==timezone)){
      if(!newOverride.pending)newOverride=null;
      return {kind:'unsupported',reason:'override-day-ended'};
    }
    if(displayedDay&&(displayedDay.day!==day||displayedDay.timezone!==timezone))return {kind:'invalid',reason:'override-day-ended'};
    if(newOverride&&(newOverride.key!==key||newOverride.amount!==amount))return {kind:'failed',reason:'retry-existing-new-override'};
    if(newOverride?.pending)return newOverride.pending;
    if(!newOverride){
      if(absolute&&amount<limit)return {kind:'invalid',reason:'today-total-already-higher'};
      const value={version:1,day,timezone,...(absolute?{total:amount}:{increment:amount})};
      const intent=absolute&&amount===limit?null:command('settings',{key,value});
      newOverride={key,amount,day,timezone,intent};
    }
    const record=newOverride;
    record.pending=(async()=>{
      const result=record.intent?await submitCommand(record.intent):{kind:'durable'};
      if(result.kind!=='durable'){if(result.kind!=='failed')newOverride=null;return result;}
      try{
        if(localAuthority)await withLocalWrite(()=>ensureLocalDayBudget(store,{now}));
        else {const status=await reserveNewPermits();if(status?.error||!(await store.status()).upToDate)throw Error('server-permit-required');}
        await refresh();newOverride=null;
        if(absolute){
          const current=todayAllowance();
          if(current.day!==day||current.timezone!==timezone)return {kind:'unsupported',reason:'override-day-ended'};
          if(current.limit!==amount)return {kind:'unsupported',reason:current.limit>amount?'today-total-already-higher':'invalid-today-total'};
          if(!record.intent)return {kind:'durable',unchanged:true};
        }
        const outcome=projection.outcomes?.[result.eventId];
        return immutable({...result,kind:outcome?.status==='applied'?'durable':outcome?.status==='observation'?'observation-only':'unsupported',outcome,reason:outcome?.reason??result.reason});
      }
      catch{return {kind:'failed',eventId:result.eventId,reason:'new-permits-retry-required'};}
    })();
    try{return await record.pending;}finally{record.pending=null;}
  }
  let manualIntent=null;
  async function createManualCard(value){
    let data;try{data=manualCardData(value);}catch{return {kind:'invalid',reason:'invalid-manual-card'};}
    const body=canonicalStringify(data);
    if(manualIntent&&manualIntent.body!==body)return {kind:'failed',reason:'retry-existing-manual-card'};
    // The normalized content survives reopen. An identical save reuses that
    // learner card; a different meaning/example still creates its own card.
    if(!manualIntent){const revision=payloadHash(data),existing=Object.entries(projection.manualCards??{}).find(([,entry])=>entry.contentRevision===revision);if(existing){const [eventId,entry]=existing;return immutable({kind:'durable',eventId,entry:clone(entry),taskKey:entry.taskKey,reused:true});}}
    const record=manualIntent??(manualIntent={body,intent:command('manual-card',data)});
    if(record.pending)return record.pending;
    record.pending=(async()=>{const result=await submitCommand(record.intent);if(result.kind==='durable'){const entry=projection.manualCards?.[result.eventId];manualIntent=null;return immutable({...result,entry:clone(entry),taskKey:entry.taskKey});}if(result.kind!=='failed')manualIntent=null;return result;})();
    try{return await record.pending;}finally{record.pending=null;}
  }
  let budgetRefresh=null;
  function refreshLocalDayBudget(){
    if(!localAuthority||disposed)return Promise.resolve({kind:'unsupported'});
    if(!budgetRefresh)budgetRefresh=(async()=>{const result=await withLocalWrite(()=>ensureLocalDayBudget(store,{now}));if(result.kind==='allocated')await refresh();return result;})().finally(()=>{budgetRefresh=null;});
    return budgetRefresh;
  }
  return Object.freeze({
    ...(localAuthority?{refreshLocalDayBudget}:{}),
    catalogEntries,customSession,todayAllowance,addNewToday,setNewTodayTotal,createManualCard,practiceData:(attempt,rating=3,thinkMs=0)=>reviewData({...attempt,mode:'practice'},rating,thinkMs),practice:(attempt,rating=3,thinkMs=0)=>submitCommand(command('review',reviewData({...attempt,mode:'practice'},rating,thinkMs))),
    readProjection: () => projection, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    status, refresh, command, submitCommand, snapshotAttempt, reviewData, queue,sitting,
    preview,captureTyped,
    mutate(type, taskKey, data = {}) { const task = projection.tasks[taskKey]; return submitCommand(command(type, { taskKey, parent: task.head, ...data })); },
    capture(attempt, capture) {
      const target = capture.targetTaskKey && projection.tasks[capture.targetTaskKey];
      const ownTarget = target?.taskKey === attempt?.taskKey;
      const raw = { ...capture, ...(attempt ? { attemptId: attempt.id } : {}) };
      if (attempt?.mode!=='practice' && target && !ownTarget && !target.suspended && !target.known && ['lookup','unknown','unsure'].includes(raw.kind)) {
        return submitCommand(command('capture-boost', { taskKey: target.taskKey, parent: target.head, capture: raw }));
      }
      return submitCommand(command('capture', raw));
    },
    async exportBackup() {
      const payload = await store.readState();
      return { format: 'nihongo-replica-export/v1', learner: store.scope.learner, environment: store.scope.environment,
        epoch: payload.epoch, cutoff: payload.appliedSeq, contentVersion: payloadHash(catalog.map(e => [e.taskKey, e.contentRevision])),
        checksum: payloadHash(payload), payload };
    },
    async importBackup(backup) {
      if (backup?.format !== 'nihongo-replica-export/v1' || backup.learner !== store.scope.learner || backup.environment !== store.scope.environment ||
          backup.epoch !== state.epoch || backup.checksum !== payloadHash(backup.payload) || backup.cutoff !== backup.payload.appliedSeq) throw Error('backup-scope-or-checksum');
      if (Object.keys(backup.payload.local).length) throw Error('backup-has-pending-events-recovery-required');
      // Add canonical prefix only; never replace a live replica or roll it backwards.
      await store.reconcile({ events: Object.values(backup.payload.canonical), head: Math.max(state.head, backup.payload.head) });
      await refresh();
    },
    dispose() { disposed = true; stop(); listeners.clear(); },
    installation: store.scope.installation, learner: store.scope.learner,
  });
}
