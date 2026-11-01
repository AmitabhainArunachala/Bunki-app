/** Standalone presentation adapter over the real v4 replica/replay APIs.
 * No scheduler or event store is implemented here. Durability belongs to store.
 */
import {manualCardData} from './manual-cards.mjs';
import {customSessionOptions,selectCustomSession,sessionReviewEvidence} from './study-sessions.mjs';
import {ensureLocalDayBudget} from '../app/local-budget.mjs';
import {canonicalizeLocalPending} from './local-canonical.mjs';
import {contentReady} from './content-ready.mjs';
import {createRestDayEvidenceReader} from './rest-day-evidence.mjs';
import {StoreError} from '../store.mjs';
import { canonicalStringify, payloadHash } from '../schema/event.mjs';
import { dayBounds, studyDayAllowance } from '../replay.mjs';
import { servable,nextStep } from '../vendor/engine.js';
const clone = v => structuredClone(v);
const immutable = v => { if (v && typeof v === 'object') { Object.values(v).forEach(immutable); Object.freeze(v); } return v; };

export async function createReplicaBackend({ store, engine, catalog, localAuthority = null, reserveNewPermits = null, now = Date.now, uuid = () => crypto.randomUUID() }) {
  let state = await store.readState(), projection = state.projection, disposed = false, lastTs = 0;
  const listeners = new Set(), intents = new Map();
  const typedIntents = new Map();
  const resumptions = new Map();
  const restDayEvidence=createRestDayEvidenceReader();
  const readVerifiedRestDays=()=>restDayEvidence(disposed?null:state,{at:now()});
  // Day grants and device canonical receipts share the local sequence. A wake
  // timer must not reserve the same sequence as a newly submitted command.
  let localWrite=Promise.resolve();
  const withLocalWrite=action=>{const result=localWrite.then(action);localWrite=result.catch(()=>{});return result;};
  let previewCache = null;
  const entries = new Map(catalog.map(entry => [entry.taskKey, entry]));
  const catalogEntries=()=>[...catalog,...Object.values(projection.manualCards??{})];
  const refreshManualEntries=()=>{for(const entry of Object.values(projection.manualCards??{}))entries.set(entry.taskKey,entry);};
  refreshManualEntries();
  let refreshGeneration=0, refreshedGeneration=0, compatibleGeneration=0, refreshing=false;
  const refreshWaiters=new Set();
  function finishRefreshWaiters(through=Infinity,error=null){
    for(const waiter of refreshWaiters)if(waiter.generation<=through){
      refreshWaiters.delete(waiter);if(error)waiter.reject(error);else waiter.resolve();
    }
  }
  function refreshThrough(generation, requireCompatible=false) {
    if(requireCompatible)compatibleGeneration=Math.max(compatibleGeneration,generation);
    if(disposed||refreshedGeneration>=generation)return Promise.resolve();
    const done=new Promise((resolve,reject)=>refreshWaiters.add({generation,resolve,reject}));
    if(!refreshing){refreshing=true;(async()=>{
      try{
        while(!disposed&&refreshedGeneration<refreshGeneration){
          const readingGeneration=refreshGeneration;
          // Strict recovery requires compatibility of this exact snapshot. An
          // older in-flight ordinary read cannot cover its newer generation.
          const next=await store.readState(compatibleGeneration>refreshedGeneration?{requireCompatible:true}:undefined);
          if(disposed)return;
          refreshedGeneration=readingGeneration;
          if(next.storageRevision>=state.storageRevision){
            state=next;projection=next.projection;refreshManualEntries();
            for(const fn of listeners){try{fn(projection);}catch{/* presentation only */}}
          }
          // Complete only callers covered by this read. Newer invalidations
          // continue in the background without holding earlier saves hostage.
          finishRefreshWaiters(readingGeneration);
        }
      }catch(error){compatibleGeneration=0;finishRefreshWaiters(Infinity,error);}
      finally{refreshing=false;if(disposed)finishRefreshWaiters();}
    })();}
    return done;
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
  // Rendering may join an in-flight observation of this projection generation.
  // Explicit status() callers still get the fresh-read behavior above. Never
  // keep a settled observation or share it across a write/refresh invalidation.
  let presentationStatusBatch=null;
  function presentationStatus(){
    if(disposed){presentationStatusBatch=null;return Promise.reject(Error('closed'));}
    const revision=state.storageRevision,generation=refreshGeneration;
    if(!presentationStatusBatch||presentationStatusBatch.revision!==revision||presentationStatusBatch.generation!==generation){
      const batch={revision,generation};
      batch.promise=status().finally(()=>{if(presentationStatusBatch===batch)presentationStatusBatch=null;});
      presentationStatusBatch=batch;
    }
    return presentationStatusBatch.promise.then(clone);
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
    const remember = result => { if(result.persisted&&!record.evidence)record.evidence=result;return result; };
    const persistedResult = blockedReason => remember(immutable({ kind: 'persisted-blocked', persisted: true,
      commandId: intent.commandId, eventId: record.proof.event.id, dseq: record.proof.event.dseq,
      eventTs: record.proof.event.ts, blockedReason, localOnly: true }));
    record.pending = (async () => {
      try {
        const beforeRefresh=refreshGeneration;
        const wireCommand = { type: intent.type, data: intent.data, ts: intent.ts };
        let recovered, saved;
        if (record.proof) {
          // A proved save can only resume processing; it can never append again.
          recovered = await store.lookupCommand(wireCommand);
          if (!recovered.persisted) throw Object.assign(Error('storage-failed'), { code: 'storage-failed' });
          if (recovered.event.id !== record.proof.event.id || recovered.bodyHash !== record.proof.bodyHash)
            throw Object.assign(Error('immutable-conflict'), { code: 'immutable-conflict' });
        } else {
          try { saved = await store.appendOrFind(wireCommand); }
          catch (error) {
            if (error.code && !['storage-failed', 'storage-conflict', 'schema-unsupported', 'event-too-large'].includes(error.code)) throw error;
            recovered = await store.lookupCommand(wireCommand); if (!recovered.persisted) throw error;
            // An explicit admission rejection is still blocking, even when a
            // host wrapper's lookup happens to report compatible stored bytes.
            if (error.code === 'schema-unsupported' || error.code === 'event-too-large')
              record.admissionBlocked = error.code === 'schema-unsupported' ? 'update-required' : error.code;
          }
        }
        record.proof ??= immutable({ event: (recovered ?? saved).event, bodyHash: (recovered ?? saved).bodyHash });
        const event = record.proof.event;
        if (record.admissionBlocked || recovered?.blockedReason) return persistedResult(record.admissionBlocked ?? recovered.blockedReason);
        if(localAuthority)await withLocalWrite(()=>canonicalizeLocalPending(store,{authority:localAuthority,now}));
        // A successful append already invalidates via the store subscription.
        // Lost commit replies have no notification, so force a read in that case.
        await refreshThrough(saved?.appended&&refreshGeneration>beforeRefresh?refreshGeneration:++refreshGeneration, Boolean(recovered));
        if (projection.updateRequired || ['unsupported', 'reducer-unsupported', 'update-required'].includes(state.blocked?.reason))
          return persistedResult('update-required');
        // A stopped projection does not prove that a cached per-event outcome applied.
        if (projection.error) return remember(immutable({ kind: 'unsupported', persisted: true, commandId: intent.commandId,
          eventId: event.id, dseq: event.dseq, eventTs: event.ts, reason: projection.error.reason, localOnly: true }));
        const outcome = projection.outcomes?.[event.id];
        const result = { kind: outcome?.status === 'applied' ? 'durable' : outcome?.status === 'observation' ? 'observation-only' : 'unsupported',
          persisted: true, commandId: intent.commandId, eventId: event.id, dseq: event.dseq,eventTs:event.ts, reason: outcome?.reason ?? null,
          outcome, localOnly: true };
        record.result = immutable(result);
        return remember(record.result);
      } catch (error) {
        const code = new StoreError(error?.code).code, reason = code === 'schema-unsupported' && record.proof ? 'update-required' : code;
        return record.proof ? persistedResult(reason) : { kind: 'failed', commandId: intent.commandId, reason };
      }
    })().finally(() => { record.pending = null; });
    return record.pending;
  }
  const compatibleProjection=()=>!projection.error&&!projection.updateRequired&&
    !['unsupported','reducer-unsupported','update-required'].includes(state.blocked?.reason);
  const resolved=(result,resolution)=>immutable({...result,resolution});
  /** Fresh interpretation belongs to explicit recovery, never the grade fast path.
   * The first proved submit result remains unchanged even if replay later differs. */
  async function resumeCommand(intent){
    const body=canonicalStringify(intent),prior=intents.get(intent.commandId),active=resumptions.get(intent.commandId);
    if((prior&&prior.body!==body)||(active&&active.body!==body))return {kind:'conflict',reason:'changed-retry'};
    if(active)return active.pending;
    const pending=(async()=>{
      const latest=await submitCommand(intent),record=intents.get(intent.commandId),result=record?.evidence??latest;
      const waiting=reason=>resolved(result,{status:'pending',reason,...(result.persisted?{eventId:result.eventId}:{})});
      if(!result.persisted)return waiting('save-unconfirmed');
      if(disposed)return waiting('closed');
      // Explicit admission restrictions and a failed exact lookup cannot be
      // bypassed by interpreting an older compatible-looking projection.
      if(latest.kind==='persisted-blocked')return waiting(latest.blockedReason||'processing-required');
      try{
        await refreshThrough(++refreshGeneration,true);
        if(disposed)return waiting('closed');
        if(!compatibleProjection())return waiting(projection.updateRequired||['unsupported','reducer-unsupported','update-required'].includes(state.blocked?.reason)?'update-required':'processing-required');
        const row=Object.values(state.canonical).find(row=>row.event.id===result.eventId&&row.seq<=state.appliedSeq),local=state.local[result.eventId];
        if(!(row||local)||!record?.proof||(row||local).bodyHash!==record.proof.bodyHash)return waiting('processing-required');
        const outcome=projection.outcomes?.[result.eventId];
        if(!['applied','observation'].includes(outcome?.status))return waiting('processing-required');
        const resolution={status:outcome.status,reason:outcome.reason??null,eventId:result.eventId,outcome:clone(outcome),canonical:Boolean(row),terminal:Boolean(row)};
        if(outcome.status==='applied'&&['capture','capture-boost'].includes(intent.type)){
          const data=intent.type==='capture'?intent.data:intent.data.capture,capture=projection.captures.find(c=>c.id===result.eventId&&c.install===store.scope.installation);
          if(!capture||!Object.entries(data).every(([key,value])=>canonicalStringify(value)===canonicalStringify(capture[key])))return waiting('processing-required');
          resolution.capture=clone(data);
        }
        return resolved(result,resolution);
      }catch(error){return waiting(error?.code==='schema-unsupported'?'update-required':'processing-required');}
    })();
    resumptions.set(intent.commandId,{body,pending});
    try{return await pending;}finally{if(resumptions.get(intent.commandId)?.pending===pending)resumptions.delete(intent.commandId);}
  }
  /** Applied canonical activity facts only; no storage read or whole-event export. */
  function readSharedActivity(afterSeq=0){
    if(!Number.isSafeInteger(afterSeq)||afterSeq<0)throw new TypeError('Invalid activity cursor');
    const available=!disposed&&compatibleProjection(),events=[],through=state.appliedSeq;
    if(available&&afterSeq<through){
      const reviews=new Map(projection.reviews.map(row=>[row.id,row]));
      for(const row of Object.values(state.canonical).filter(row=>row.seq>afterSeq&&row.seq<=through).sort((a,b)=>a.seq-b.seq)){
        const event=row.event;if(projection.outcomes?.[event.id]?.status!=='applied')continue;
        const base={seq:row.seq,eventId:event.id,installation:event.install,type:event.type};
        if(event.type==='review'){
          const review=reviews.get(event.id);
          if(review&&review.install===event.install)events.push({...base,taskKey:review.taskKey,undone:Boolean(review.undoneAt)});
        }else if(event.type==='settings'&&event.data.key==='newTodayTotal')events.push({...base,key:event.data.key,value:clone(event.data.value)});
      }
    }
    return immutable({available,epoch:state.epoch,through,events});
  }
  function captureCommand(attempt,capture){
    const target=capture.targetTaskKey&&projection.tasks[capture.targetTaskKey],ownTarget=target?.taskKey===attempt?.taskKey;
    const raw={...capture,...(attempt?{attemptId:attempt.id}:{})};
    if(attempt?.mode!=='practice'&&target&&!ownTarget&&!target.suspended&&!target.known&&['lookup','unknown','unsure'].includes(raw.kind))
      return command('capture-boost',{taskKey:target.taskKey,parent:target.head,capture:raw});
    return command('capture',raw);
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
  function previewEntry(attempt,thinkMs) {
    const key=JSON.stringify([attempt.id,thinkMs,state.storageRevision]);
    if(previewCache?.key!==key)previewCache={key,reviewedAt:now(),alternatives:{},value:null};
    return previewCache;
  }
  function reviewAlternative(attempt,rating,thinkMs,entry) {
    if(entry.alternatives[rating])return entry.alternatives[rating];
    try{
      const reviewedAt=entry.reviewedAt;
      const intent=immutable({commandId:uuid(),type:'review',data:clone(reviewData(attempt,rating,thinkMs,reviewedAt)),ts:reviewedAt});
      const event={v:4,id:`${store.scope.installation}:${state.nextDseq}`,learner:store.scope.learner,install:store.scope.installation,dseq:state.nextDseq,
        base:intent.data.hesitation.base,ts:intent.ts,epoch:state.epoch,policy:'nsrs-policy-v1',type:intent.type,data:clone(intent.data)};
      const canonical=Object.values(state.canonical).filter(r=>r.seq<=state.appliedSeq).sort((a,b)=>a.seq-b.seq);
      const provisional=Object.values(state.local).sort((a,b)=>a.event.dseq-b.event.dseq).map(({event,bodyHash})=>({event,bodyHash}));
      provisional.push({event,bodyHash:payloadHash(event)});
      const prospective=engine.replay(canonical,{provisional,provisionalNow:Math.max(reviewedAt,...provisional.map(r=>r.event.ts))});
      const outcome=prospective.outcomes?.[event.id],review=prospective.reviews.find(r=>r.id===event.id);
      if(outcome?.status!=='applied'||!review)throw Error(outcome?.reason||prospective.error?.reason||'preview-not-admitted');
      return entry.alternatives[rating]=immutable({intent,card:prospective.tasks[attempt.taskKey].card,rating:{effectiveRating:review.effectiveRating,at:review.at}});
    }catch(error){if(previewCache===entry)previewCache=null;throw error;}
  }
  function preview(attempt,thinkMs=0) {
    const entry=previewEntry(attempt,thinkMs);
    if(entry.value)return entry.value;
    // These are four alternatives for ONE review, not four sequential commands.
    // All alternatives, including a prior selected-intent cache hit, retain the
    // same timestamp and immutable command until this exact revision changes.
    const cards={},ratings={},commands={};
    for(const rating of [1,2,3,4]){
      const alternative=reviewAlternative(attempt,rating,thinkMs,entry);
      cards[rating]=alternative.card;ratings[rating]=alternative.rating;commands[rating]=alternative.intent;
    }
    return entry.value=immutable({cards,ratings,intents:commands});
  }
  function reviewIntent(attempt,rating,thinkMs=0) {
    if(!Number.isInteger(rating)||rating<1||rating>4)throw Error('invalid-review-rating');
    return reviewAlternative(attempt,rating,thinkMs,previewEntry(attempt,thinkMs)).intent;
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
      const submit=async()=>{
        const result=await resumeCommand(record.intent),reused=record.accepted===true;
        if(result.resolution?.status==='applied')record.accepted=true;
        return immutable({...result,capture:clone(record.intent.data),reused});
      };
      // A retained command precedes catalog matching or another read: those
      // operations cannot erase an already proved capture on a failed retry.
      if(record.intent)return submit();
      try{await refreshThrough(++refreshGeneration,true);}
      catch{return resolved({kind:'failed',reason:'storage-failed'},{status:'pending',reason:'save-unconfirmed'});}
      if(disposed)return {kind:'failed',reason:'closed'};
      if(!compatibleProjection())return resolved({kind:'unsupported',reason:'processing-required'},{status:'pending',reason:'processing-required'});
      const saved=[...Object.values(state.local),...Object.values(state.canonical)].map(r=>r.event).filter(e=>
        e.learner===store.scope.learner&&e.install===store.scope.installation&&e.type==='capture'&&
        e.data.location==='typed'&&e.data.kind==='unknown'&&!e.data.targetTaskKey&&!e.data.attemptId&&
        e.data.surface.normalize('NFKC').trim()===surface&&(e.data.source?.context??'')===context).sort((a,b)=>a.dseq-b.dseq)[0];
      if(saved){
        // Reopen recovers exact wire identity, including unresolved captures.
        // commandId is a fresh process handle, never a replacement ledger ID.
        record.intent=immutable({commandId:uuid(),type:saved.type,data:clone(saved.data),ts:saved.ts});
        record.accepted=projection.outcomes?.[saved.id]?.status==='applied'&&projection.captures.some(c=>c.id===saved.id&&c.install===store.scope.installation);
        return submit();
      }
      const matches=[...new Map(catalogEntries().filter(e=>projection.tasks[e.taskKey]&&e.contractId==='vocabulary.read.v1'&&
        [e.term,e.form].some(v=>typeof v==='string'&&v.normalize('NFKC').trim()===surface)).map(e=>[e.noteGuid,e])).values()];
      if(matches.length)return immutable({kind:'existing',surface,taskKeys:matches.map(e=>e.taskKey)});
      record.intent=command('capture',{surface,kind:'unknown',location:'typed',
        source:{venue:'standalone',requestedAt:now(),...(context?{context}:{})}});
      return submit();
    })();
    try{return await record.pending;}finally{record.pending=null;}
  }
  function customSession(input={}){return selectCustomSession(projection,catalogEntries(),input,{now:now(),dayStart:dayBounds(now(),projection.settings.learnerTimezone).startsAt,dayEnd:dayBounds(now(),projection.settings.learnerTimezone).endsAt-1,installation:store.scope.installation});}
  let newOverride=null;
  const todayAllowance=()=>studyDayAllowance(projection,now());
  const addNewToday=increment=>changeTodayAllowance('newTodayOverride',increment);
  const setNewTodayTotal=(total,displayedDay)=>changeTodayAllowance('newTodayTotal',total,displayedDay);
  /** The original submit result remains save evidence, not permit readiness.
   * preparation is ready only after preparation + a fresh compatible projection;
   * pending retains this exact intent; stopped releases it without issuing a new
   * setting. Ready carries the current applied outcome independently of the old
   * submit kind. An unchanged total has no intent or persisted:true claim. */
  async function changeTodayAllowance(key,amount,displayedDay){
    if(!localAuthority&&typeof reserveNewPermits!=='function')return {kind:'unsupported',reason:'server-permit-required'};
    const absolute=key==='newTodayTotal';
    if(absolute?(!Number.isInteger(amount)||amount<0||amount>200):![5,10,20].includes(amount)){
      return {kind:'invalid',reason:absolute?'invalid-today-total':'invalid-day-override'};
    }
    const current=()=>{const {day,timezone,limit}=todayAllowance();return {day,timezone,limit};};
    const prepared=(record,status,reason,facts)=>{
      if(status!=='pending'&&newOverride===record)newOverride=null;
      const setting=status==='ready'?(record.intent?{status:'applied',eventId:record.result.eventId,outcome:clone(projection.outcomes[record.result.eventId])}:{status:'unchanged'}):null;
      return immutable({...record.result,preparation:{status,reason,...(facts?{current:facts}:{}),...(setting?{setting}:{})}});
    };
    // Join the in-flight operation before considering a new day. A caller may
    // not replace its identity while its save/preparation result is unknown.
    if(newOverride?.pending){
      if(newOverride.key!==key||newOverride.amount!==amount)return {kind:'failed',reason:'retry-existing-new-override'};
      return newOverride.pending;
    }
    const {day,timezone,limit}=current();
    if(newOverride&&(newOverride.day!==day||newOverride.timezone!==timezone)){
      return prepared(newOverride,'stopped','override-day-ended',current());
    }
    if(displayedDay&&(displayedDay.day!==day||displayedDay.timezone!==timezone))return {kind:'invalid',reason:'override-day-ended'};
    if(newOverride&&(newOverride.key!==key||newOverride.amount!==amount))return {kind:'failed',reason:'retry-existing-new-override'};
    if(!newOverride){
      if(absolute&&amount<limit)return {kind:'invalid',reason:'today-total-already-higher'};
      const value={version:1,day,timezone,...(absolute?{total:amount}:{increment:amount})};
      const intent=absolute&&amount===limit?null:command('settings',{key,value});
      newOverride={key,amount,day,timezone,intent,result:intent?null:{kind:'durable',unchanged:true}};
    }
    const record=newOverride;
    record.pending=(async()=>{
      const result=record.intent?await submitCommand(record.intent):record.result;
      // Even disposal or a future wrapper failure cannot erase a prior proof.
      if(result.persisted||!record.result?.persisted)record.result=result;
      if(result.kind==='failed')return prepared(record,'pending',record.result?.persisted?'setting-processing-required':'setting-save-required');
      const inspect=()=>{
        const facts=current();
        if(facts.day!==record.day||facts.timezone!==record.timezone)return {status:'stopped',reason:'override-day-ended',facts};
        if(projection.error||projection.updateRequired||['unsupported','reducer-unsupported','update-required'].includes(state.blocked?.reason))return {status:'pending',reason:'setting-processing-required'};
        const outcome=record.intent?projection.outcomes?.[record.result.eventId]:null;
        const canonical=record.intent&&Object.values(state.canonical).some(row=>row.event.id===record.result.eventId&&row.seq<=state.appliedSeq);
        if(canonical&&outcome?.status==='observation')return {status:'stopped',reason:outcome.reason||'setting-not-applied',facts};
        // A provisional refusal cannot release an increment. Synchronization
        // must establish the canonical outcome before another operation starts.
        if(record.intent&&outcome?.status!=='applied')return {status:'pending',reason:'setting-processing-required',awaitingCanonical:outcome?.status==='observation'&&!canonical};
        if(absolute&&facts.limit!==amount){
          if(Object.keys(state.local).length||state.appliedSeq!==state.head)return {status:'pending',reason:'setting-processing-required',awaitingCanonical:true};
          return {status:'stopped',reason:facts.limit>amount?'today-total-already-higher':'invalid-today-total',facts};
        }
        return null;
      };
      let preparing=false;
      try{
        // Cached submit results prove the old save, not present compatibility.
        // This extra strict read belongs only to the infrequent allowance flow.
        await refreshThrough(++refreshGeneration,true);
        let condition=inspect();
        if(condition&&!condition.awaitingCanonical)return prepared(record,condition.status,condition.reason,condition.facts);
        if(!['durable','observation-only'].includes(result.kind)||projection.error||projection.updateRequired)return prepared(record,'pending','setting-processing-required');
        preparing=true;
        if(localAuthority)await withLocalWrite(()=>ensureLocalDayBudget(store,{now}));
        else {const status=await reserveNewPermits();if(status?.error||!(await store.status()).upToDate)throw Error('server-permit-required');}
        await refreshThrough(++refreshGeneration,true);
        condition=inspect();
        if(condition)return prepared(record,condition.status,condition.reason,condition.facts);
        return prepared(record,'ready',null,current());
      }
      catch{return prepared(record,'pending',preparing?'new-permits-retry-required':'setting-processing-required');}
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
    if(!manualIntent&&compatibleProjection()){const revision=payloadHash(data),existing=Object.entries(projection.manualCards??{}).find(([,entry])=>entry.contentRevision===revision);if(existing){const [eventId,entry]=existing;return immutable({kind:'durable',eventId,entry:clone(entry),taskKey:entry.taskKey,reused:true});}}
    const record=manualIntent??(manualIntent={body,intent:command('manual-card',data)});
    if(record.pending)return record.pending;
    record.pending=(async()=>{
      const result=await resumeCommand(record.intent),resolution=result.resolution;
      if(resolution?.status==='applied'){
        const entry=projection.manualCards?.[result.eventId];
        if(!entry||entry.contentRevision!==payloadHash(data))return resolved(result,{status:'pending',reason:'processing-required',eventId:result.eventId});
        manualIntent=null;return immutable({...result,entry:clone(entry),taskKey:entry.taskKey});
      }
      if(resolution?.status==='observation'&&resolution.terminal){
        if(resolution.reason==='manual-card-content-occupied'){
          const entry=Object.values(projection.manualCards??{}).find(entry=>entry.taskKey===resolution.outcome.canonicalTaskKey&&entry.contentRevision===payloadHash(data));
          if(!entry)return resolved(result,{status:'pending',reason:'processing-required',eventId:result.eventId});
          manualIntent=null;return immutable({...result,entry:clone(entry),taskKey:entry.taskKey,reused:true});
        }
        manualIntent=null;
      }
      return result;
    })();
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
    status, presentationStatus, refresh, command, submitCommand, snapshotAttempt, reviewData, queue,sitting,
    preview,reviewIntent,captureTyped,captureCommand,resumeCommand,readSharedActivity,readVerifiedRestDays,
    mutate(type, taskKey, data = {}) { const task = projection.tasks[taskKey]; return submitCommand(command(type, { taskKey, parent: task.head, ...data })); },
    capture(attempt,capture){return submitCommand(captureCommand(attempt,capture));},
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
    dispose() { disposed = true; stop(); listeners.clear(); finishRefreshWaiters(); },
    installation: store.scope.installation, learner: store.scope.learner,
  });
}
