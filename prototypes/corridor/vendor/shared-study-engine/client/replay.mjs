// REPLAY_DEPENDENCIES_SHA256: 06d8a24130b73fae7623e5233cc3292df943c5f72d138a2ee98b264f395b650f
/** Pure SYNC v4 full-prefix replay. No storage, network, environment clock or DOM. */
import {manualEntry} from './player/manual-cards.mjs';
import * as fsrsApi from './vendor/ts-fsrs.mjs';
import * as engine from './vendor/engine.js';
import {canonicalStringify, payloadHash, validateEvent, POLICY_ID, SCHEDULED_CONTRACTS, SERVER_TYPES, MAX_SYNC_TIME} from './schema/event.mjs';
export {canonicalStringify, payloadHash, validateEvent, POLICY_ID};
const clone = value => JSON.parse(JSON.stringify(value));
const nullMap = () => Object.create(null);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const validInstant = value => {
  if(typeof value!=='string'||!/Z$/.test(value))return false;
  const at=Date.parse(value);
  return Number.isSafeInteger(at)&&at>=0&&at<=MAX_SYNC_TIME;
};
const upperTime = (event, received) => Math.min(event.ts, received);

/** Dates are computed in the synced learner zone, never the runtime's zone. */
export function dayBounds(ms, timezone = 'Asia/Tokyo') {
  if(!Number.isSafeInteger(ms)||ms<0||ms>MAX_SYNC_TIME||typeof timezone!=='string'||!timezone)
    throw new RangeError('invalid-learner-day');
  const formatter = new Intl.DateTimeFormat('en-US-u-ca-iso8601-nu-latn', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});
  const keyAt = time => {
    const parts=Object.fromEntries(formatter.formatToParts(new Date(time)).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const day=keyAt(ms);
  const next=new Date(Date.parse(day+'T00:00:00.000Z')+86400000).toISOString().slice(0,10);
  const boundary = key => {
    let lo=ms-3*86400000,hi=ms+3*86400000;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(keyAt(mid)<key)lo=mid+1;else hi=mid;}
    return lo;
  };
  return {day,timezone,startsAt:boundary(day),endsAt:boundary(next)};
}

export function newCardLimit(settings,at){
  return limitForDay(settings,dayBounds(at,settings.learnerTimezone));
}
function limitForDay(settings,bounds){
  const weekday=new Date(bounds.day+'T12:00:00Z').getUTCDay();
  const base=settings.studyPolicy?.version===2?settings.studyPolicy.newByWeekday[weekday]:settings.newPerDayTotal;
  return Math.min(200,base+(settings.newTodayOverrides?.[`${bounds.timezone}|${bounds.day}`]??0));
}

/** The allowance effective at this instant, including a just-crossed learner-day boundary. */
export function studyDayAllowance(projection,at){
  const settings={...projection.settings};
  for(const row of projection.pendingSettings??[])if(row.effectiveAt<=at)settings[row.key]=row.value;
  const bounds=dayBounds(at,settings.learnerTimezone);
  return {...bounds,limit:limitForDay(settings,bounds)};
}

/** Absolute increases commute across devices. A repeated total cannot add slots twice. */
export function applyTodayTotal(settings,value,at){
  const bounds=dayBounds(at,settings.learnerTimezone);
  if(!value||Object.keys(value).sort().join(',')!=='day,timezone,total,version'||value.version!==1||
     value.day!==bounds.day||value.timezone!==bounds.timezone||
     !Number.isInteger(value.total)||value.total<0||value.total>200)return 'invalid-today-total';
  const current=limitForDay(settings,bounds);
  if(value.total<current)return 'today-total-already-higher';
  if(value.total>current){
    const key=`${bounds.timezone}|${bounds.day}`;
    settings.newTodayOverrides={...settings.newTodayOverrides,[key]:(settings.newTodayOverrides?.[key]??0)+(value.total-current)};
  }
  return null;
}

export function baselineHash(data) {
  const {snapshotHash,...snapshot}=data;
  return payloadHash(snapshot);
}
function isCard(card) {
  if (!card || !validInstant(card.due) || !(card.last_review === null || validInstant(card.last_review)) || !validInstant(card.introducedAt)) return false;
  if (!Number.isInteger(card.state) || card.state<0 || card.state>3) return false;
  if (!['stability','difficulty','elapsed_days','scheduled_days','learning_steps','reps','lapses'].every(key=>finite(card[key])&&card[key]>=0)) return false;
  return Number.isInteger(card.reps)&&Number.isInteger(card.lapses)&&card.lapses<=card.reps;
}

/** Evidence is a historical canonical window at `base`; later undo cannot re-cap it. */
export function hesitationEvidence(projection, {module, base = projection.appliedSeq}) {
  if (!Number.isSafeInteger(base)||base<0||base>projection.appliedSeq) throw new Error('invalid-threshold-base');
  const window=projection.reviews.filter(row=>row.seq!==null&&row.seq<=base&&row.module===module&&row.foregroundValid&&row.thinkMs!==null&&(!row.undoneAt||row.undoneAt>base)).slice(-200)
    .map(row=>({id:row.id,taskKey:row.taskKey,thinkMs:row.thinkMs,seq:row.seq}));
  const values=window.map(row=>row.thinkMs).sort((a,b)=>a-b), n=values.length;
  const median=n?Math.round(n%2?values[Math.floor(n/2)]:(values[n/2-1]+values[n/2])/2):0;
  return {policy:'hesitation-v1',base,thresholdMs:Math.max(8000,2*median),windowHash:payloadHash(window),sampleCount:n};
}

function initialProjection(options) {
  const {registry,learner,epoch=0,timezone='Asia/Tokyo'}=options;
  if (!registry?.tasks || !options.pin || !learner) throw new Error('registry-pin-learner-required');
  dayBounds(0,timezone); // fail unsupported IANA zones before any application
  if (payloadHash(options.pin)!=='56099b155f4928fbee57d66e7aaadfc52975698f47bc13f349eda07a75df21c1') throw new Error('unsupported-scheduler-pin');
  const notes=new Map((registry.notes||[]).map(note=>[note.noteGuid,note]));
  const passages=new Map([...(registry.passages||[]).map(passage=>[passage.passageId,passage]),...(registry.examples||[]).map(example=>[example.exampleId,example])]);
  const tasks=nullMap();
  for(const row of registry.tasks){
    if(!SCHEDULED_CONTRACTS.includes(row.contractId)||row.taskKey!==JSON.stringify([row.noteGuid,row.contractId,row.passageId])||tasks[row.taskKey])throw new Error('invalid-task-registry');
    const genesisRevision=passages.get(row.passageId)?.sourceJaSha256||'identity-v1';
    // Admission metadata must be part of the frozen registry. Host-supplied UI
    // metadata cannot change whether the same canonical review is accepted.
    const meta=options.taskMetadata?.[row.taskKey]||{};
    if(meta.contentRevision!==undefined&&meta.contentRevision!==genesisRevision)throw new Error('content-revisions-require-canonical-activation');
    tasks[row.taskKey]={taskKey:row.taskKey,noteGuid:row.noteGuid,contract:row.contractId,passageId:row.passageId,
      module:notes.get(row.noteGuid)?.module||row.player?.deckId||'grammar',group:row.group??null,
      lexicalKey:row.lexemeId||row.noteGuid,contentRevision:genesisRevision,
      head:null,card:null,suspended:false,known:false,repair:null,priority:false};
  }
  return {format:'nihongo-projection',version:4,policy:POLICY_ID,learner,epoch,appliedSeq:0,
    tasks,settings:{newPerDayTotal:20,learnerTimezone:timezone,topicsOff:nullMap()},pendingSettings:[],
    outcomes:nullMap(),attempts:nullMap(),observations:[],reviews:[],captures:[],permits:nullMap(),permitGrants:[],
    introductions:nullMap(),baselines:[],repairLog:[],effects:nullMap(),boostSources:nullMap(),baselineSources:nullMap(),
    updateRequired:null,error:null,pending:[]};
}
function result(p,event,status,reason,extra={}) {
  p.outcomes[event.id]={status,reason,...extra};
  if(status!=='applied')p.observations.push({id:event.id,type:event.type,reason,...extra});
  return status;
}
function gradeCard(scheduler,task,rating,at) {
  const state=engine.emptyState('sync-task');
  if(task.card)state.cards[task.taskKey]=task.card;
  return engine.grade(fsrsApi,scheduler,state,task.taskKey,rating,new Date(at)).cards[task.taskKey];
}
function effectiveTime(task,event,rt) {
  return engine.effectiveReviewTime(task.card,new Date(upperTime(event,rt))).getTime();
}
const canonicalTaskKey = (p,key) => p.taskAliases?.[key]??key;
function manualParentMatches(p,task,parent) {
  if(parent===task.head)return true;
  // Disconnected duplicates may name either immutable creation event. Once any
  // mutation wins, ordinary parent checks prevent the other branch double grading.
  const creations=p.manualHeads?.[task.taskKey];
  return Boolean(creations?.[task.head]&&creations?.[parent]);
}
function captureProblem(p,capture) {
  if(capture.location==='typed')return null;
  const context=p.tasks[canonicalTaskKey(p,capture.contextTaskKey)];
  return !context?'unknown-capture-context':context.contentRevision!==capture.contentRevision?'stale-capture-content':null;
}
function signalProblem(p,event,task) {
  const sameTask=key=>canonicalTaskKey(p,key)===task.taskKey;
  const expected=p.captures.filter(c=>c.install===event.install&&c.attemptId===event.data.attempt.id&&sameTask(c.contextTaskKey)&&sameTask(c.targetTaskKey)&&['unsure','unknown','lookup'].includes(c.kind)).map(c=>c.id).sort();
  if(canonicalStringify([...event.data.hesitation.signalIds].sort())!==canonicalStringify(expected))return 'incomplete-hesitation-signals';
  for(const id of event.data.hesitation.signalIds){
    const capture=p.captures.find(row=>row.id===id);
    if(!capture||capture.install!==event.install||capture.attemptId!==event.data.attempt.id||!sameTask(capture.contextTaskKey)||!sameTask(capture.targetTaskKey)||!['unsure','unknown','lookup'].includes(capture.kind))return 'invalid-hesitation-signal';
  }
  return null;
}
function boostProblem(p,task,event,source) {
  if(task.contract!=='vocabulary.read.v1')return 'boost-not-vocabulary';
  if(task.suspended||task.known)return 'boost-ineligible';
  if(!source||!['lookup','unknown','unsure'].includes(source.kind)||canonicalTaskKey(p,source.targetTaskKey)!==task.taskKey)return 'invalid-boost-source';
  if(p.boostSources[`${source.id}|${task.taskKey}`])return 'boost-already-applied';
  return null;
}
function applyBoost(p,task,source,event,at,timezone=p.settings.learnerTimezone) {
  if(task.card)task.card={...task.card,due:new Date(Math.min(Date.parse(task.card.due),dayBounds(at,timezone).endsAt)).toISOString()};
  else task.priority=true;
  p.boostSources[`${source.id}|${task.taskKey}`]=event.id;
}
function mutate(p,event,updates,info={}) {
  const before=nullMap();
  for(const [key,update]of Object.entries(updates)){before[key]=clone(p.tasks[key]);p.tasks[key]={...p.tasks[key],...update,head:event.id};}
  p.effects[event.id]={id:event.id,root:event.id,install:event.install,type:event.type,taskKeys:Object.keys(updates),before,closed:false,overridden:false,...info};
}
function activatePending(p,rt){
  const remaining=[];
  for(const setting of p.pendingSettings){if(setting.effectiveAt<=rt)p.settings[setting.key]=setting.value;else remaining.push(setting);}
  p.pendingSettings=remaining;
}
function admitted(p,event,task,rt){
  const d=event.data,a=d.attempt;
  if(!SCHEDULED_CONTRACTS.includes(task.contract)||a.mode!=='scored'||!a.revealed||a.helpBeforeAnswer)return 'practice-or-assisted';
  if(task.suspended||task.known)return 'suspended-or-known';
  if((p.settings.topicsOff[task.module]||[]).includes(task.group))return 'topic-excluded';
  if(d.contentRevision!==task.contentRevision)return 'stale-content';
  const at=effectiveTime(task,event,rt),permit=!p.introductions[task.taskKey]?p.permits[d.permitId]:null;
  const bounds=dayBounds(at,permit?.timezone??p.settings.learnerTimezone);
  const explicitAhead=d.session?.policy==='custom-session-v1'&&d.session.mode==='review-ahead'&&p.introductions[task.taskKey]&&task.card?.state===2&&Date.parse(task.card.due)<=at+d.session.aheadDays*86400000;
  if(d.session&&!explicitAhead)return 'outside-ahead-session';
  if(!explicitAhead&&!engine.servable(task.card,new Date(at),{learnAhead:d.learnAhead===true,dayEnd:bounds.endsAt-1}))return 'not-due';
  const rests=!task.card||task.card.state===0||task.card.state===2;
  // A zone change can give two reviews different day labels inside this same
  // admission window. Keep old permit windows valid and compare actual instants.
  if(rests&&p.reviews.some(row=>!row.undoneAt&&row.taskKey!==task.taskKey&&p.tasks[row.taskKey].lexicalKey===task.lexicalKey&&row.at>=bounds.startsAt&&row.at<bounds.endsAt))return 'sibling-buried';
  const expected=hesitationEvidence(p,{module:task.module,base:event.base}),h=d.hesitation;
  if(expected.thresholdMs!==h.thresholdMs||expected.windowHash!==h.windowHash||(h.sampleCount!==undefined&&h.sampleCount!==expected.sampleCount))return 'invalid-threshold-window';
  const signal=signalProblem(p,event,task);if(signal)return signal;
  if(!p.introductions[task.taskKey]){
    if(!permit||permit.install!==event.install||permit.usedBy||permit.startsAt>at||permit.endsAt<=at)return 'introduction-permit-required';
  }
  return null;
}

function apply(p,event,rt,seq,scheduler,provisional){
  const d=event.data,taskKey=canonicalTaskKey(p,d.taskKey),task=p.tasks[taskKey];
  const extra={provisional,seq};
  const refuse=reason=>result(p,event,'observation',reason,extra);
  activatePending(p,rt);
  if(event.epoch!==p.epoch)return refuse('epoch-mismatch');
  if(event.base>p.appliedSeq)return refuse('base-not-applied');
  if(d.taskKey&&!task)return refuse('unknown-task');
  if(event.type==='review'){
    const attemptKey=`${event.install}|${d.attempt.id}`;
    if(p.attempts[attemptKey])return refuse('attempt-already-recorded');
    p.attempts[attemptKey]=event.id;
  }
  if(event.type==='baseline'&&p.baselineSources[`${taskKey}|${d.sourceHash}|${d.snapshotHash}`])return result(p,event,'applied','baseline-already-imported',extra);
  if(task&&!manualParentMatches(p,task,d.parent))return refuse('stale-parent');
  if(event.type==='capture'){
    const problem=captureProblem(p,d);if(problem)return refuse(problem);
    p.captures.push({...clone(d),id:event.id,install:event.install,seq,ts:event.ts});
  }else if(event.type==='manual-card'){
    const entry=manualEntry(event,upperTime(event,rt));
    p.taskAliases??=nullMap();p.manualContent??=nullMap();p.manualHeads??=nullMap();
    const occupied=p.manualContent[entry.contentRevision];
    if(occupied){
      // The first canonical event owns the schedule. Later immutable event IDs
      // remain valid aliases, so offline references are never orphaned.
      p.taskAliases[entry.taskKey]=occupied;p.manualHeads[occupied][event.id]=true;
      return result(p,event,'observation','manual-card-content-occupied',{...extra,canonicalTaskKey:occupied});
    }
    if(p.tasks[entry.taskKey])return refuse('manual-card-identity-occupied');
    p.manualContent[entry.contentRevision]=entry.taskKey;p.manualHeads[entry.taskKey]={[event.id]:true};
    p.manualCards={...(p.manualCards??{}),[event.id]:entry};
    p.tasks[entry.taskKey]={taskKey:entry.taskKey,noteGuid:entry.noteGuid,contract:entry.contractId,passageId:entry.passageId,module:entry.module,group:null,lexicalKey:entry.lexemeId,contentRevision:entry.contentRevision,head:event.id,card:null,suspended:false,known:false,repair:null,priority:false};
  }else if(event.type==='learner-settings-baseline'){
    // Migration policy is explicit, current-time, source-bound, and can only
    // initialize an empty canonical history. It is never a historical review.
    if(provisional||seq!==1||event.base!==0||p.appliedSeq!==0||p.learnerSettingsBaseline||Object.keys(p.outcomes).length)return refuse('learner-settings-baseline-not-first');
    if(baselineHash(d)!==d.snapshotHash)return refuse('learner-settings-baseline-hash');
    try{dayBounds(rt,d.settings.learnerTimezone);}catch{return refuse('invalid-timezone');}
    p.settings.newPerDayTotal=d.settings.newPerDayTotal;
    p.settings.learnerTimezone=d.settings.learnerTimezone;
    p.learnerSettingsBaseline={id:event.id,sourceHash:d.sourceHash,snapshotHash:d.snapshotHash,settings:clone(d.settings)};
  }else if(event.type==='permit-grant'){
    let bounds;try{bounds=dayBounds(rt,d.timezone);}catch{return refuse('unsupported-timezone');}
    if(d.timezone!==p.settings.learnerTimezone||d.day!==bounds.day||d.startsAt!==bounds.startsAt||d.endsAt!==bounds.endsAt)return refuse('invalid-permit-day');
    if(d.permitIds.some(id=>p.permits[id]))return refuse('permit-id-reused');
    const overlapping=p.permitGrants.filter(g=>g.startsAt<d.endsAt&&g.endsAt>d.startsAt).reduce((sum,g)=>sum+g.count,0);
    if(overlapping+d.permitIds.length>newCardLimit(p.settings,rt))return refuse('daily-permit-budget');
    for(const id of d.permitIds)p.permits[id]={id,install:d.install,day:d.day,timezone:d.timezone,startsAt:d.startsAt,endsAt:d.endsAt,usedBy:null};
    p.permitGrants.push({id:event.id,startsAt:d.startsAt,endsAt:d.endsAt,count:d.permitIds.length});
  }else if(event.type==='content-activate'){
    if(Object.keys(d.revisions).some(key=>!p.tasks[canonicalTaskKey(p,key)]))return refuse('unknown-content-task');
    for(const [key,revision]of Object.entries(d.revisions))p.tasks[canonicalTaskKey(p,key)].contentRevision=revision;
  }else if(event.type==='settings'){
    if(d.key==='newTodayTotal'){
      const reason=applyTodayTotal(p.settings,d.value,upperTime(event,rt));
      if(reason)return refuse(reason);
    }else if(d.key==='newTodayOverride'){
      const v=d.value,bounds=dayBounds(upperTime(event,rt),p.settings.learnerTimezone);
      if(!v||Object.keys(v).sort().join(',')!=='day,increment,timezone,version'||v.version!==1||v.day!==bounds.day||v.timezone!==bounds.timezone||![5,10,20].includes(v.increment))return refuse('invalid-day-override');
      const key=`${v.timezone}|${v.day}`,current=p.settings.newTodayOverrides?.[key]??0;
      if(newCardLimit(p.settings,upperTime(event,rt))+v.increment>200)return refuse('daily-limit-maximum');
      p.settings.newTodayOverrides={...(p.settings.newTodayOverrides??{}),[key]:current+v.increment};
    }else if(d.key==='studyPolicy'){
      const v=d.value;
      if(!v||Object.keys(v).sort().join(',')!=='newByWeekday,version'||v.version!==2||!Array.isArray(v.newByWeekday)||v.newByWeekday.length!==7||v.newByWeekday.some(n=>!Number.isInteger(n)||n<0||n>200))return refuse('invalid-study-policy');
      p.pendingSettings=p.pendingSettings.filter(row=>row.key!==d.key);
      p.pendingSettings.push({key:d.key,value:clone(v),effectiveAt:dayBounds(rt,p.settings.learnerTimezone).endsAt,id:event.id});
    }else if(d.key==='newPerDayTotal'||d.key==='learnerTimezone'){
      if(d.key==='newPerDayTotal'&&(!Number.isInteger(d.value)||d.value<1||d.value>200))return refuse('invalid-workload');
      if(d.key==='learnerTimezone'){try{dayBounds(rt,d.value);}catch{return refuse('invalid-timezone');}}
      // Existing offline grants remain valid for their day. Policy changes begin
      // at the old learner day's next boundary; overlapping allocations still cap.
      p.pendingSettings=p.pendingSettings.filter(row=>row.key!==d.key);
      p.pendingSettings.push({key:d.key,value:d.value,effectiveAt:dayBounds(rt,p.settings.learnerTimezone).endsAt,id:event.id});
    }else if(d.key.startsWith('topicsOff:')){
      const module=d.key.slice(10);
      if(!module||!Array.isArray(d.value)||d.value.some(x=>typeof x!=='string'))return refuse('invalid-topic-setting');
      p.settings.topicsOff[module]=[...new Set(d.value)].sort();
    }else return refuse('device-or-unsupported-setting');
  }else if(event.type==='baseline'){
    const baselineId=`${taskKey}|${d.sourceHash}|${d.snapshotHash}`;
    if(p.baselineSources[baselineId])return result(p,event,'applied','baseline-already-imported',extra);
    if(task.head!==null||task.card||p.introductions[task.taskKey])return refuse('baseline-target-occupied');
    if(d.contract!==task.contract||!isCard(d.card)||baselineHash(d)!==d.snapshotHash)return refuse('incompatible-baseline');
    mutate(p,event,{[task.taskKey]:{card:clone(d.card),repair:clone(d.repair??null),suspended:d.suspended===true,known:d.known===true}});
    p.introductions[task.taskKey]={id:event.id,baseline:true};p.baselineSources[baselineId]=event.id;p.baselines.push({id:event.id,...clone(d)});
  }else if(event.type==='review'){
    const problem=admitted(p,event,task,rt);if(problem)return refuse(problem);
    const introductionPermit=!p.introductions[task.taskKey]?p.permits[d.permitId]:null;
    const at=effectiveTime(task,event,rt),a=d.attempt;
    const slow=a.foregroundValid&&a.thinkMs!==null&&a.thinkMs>d.hesitation.thresholdMs;
    // An absent marker preserves the immutable legacy policy, including retries.
    const cap=d.ratingPolicy!=='chosen-v1'&&(slow||d.hesitation.signalIds.length>0);
    const effectiveRating=cap&&d.rawRating>=3?d.rawRating-1:d.rawRating;
    const rawCard=gradeCard(scheduler,task,d.rawRating,at),card=gradeCard(scheduler,task,effectiveRating,at);
    if(effectiveRating!==d.rawRating){
      // Enforce relative no-inflation even at floating point/policy boundaries.
      card.due=new Date(Math.min(Date.parse(card.due),Date.parse(rawCard.due))).toISOString();
      card.stability=Math.min(card.stability,rawCard.stability);
    }
    let source=null;
    if(d.boost){source=p.captures.find(row=>row.id===d.boost.observationId);const issue=boostProblem(p,task,event,source);if(issue)return refuse(issue);if(source.attemptId!==a.id||source.install!==event.install)return refuse('boost-attempt-mismatch');}
    mutate(p,event,{[task.taskKey]:{card}}, {at,rawRating:d.rawRating,effectiveRating,rawCard,reviewId:event.id});
    if(source){
      applyBoost(p,p.tasks[task.taskKey],source,event,at,introductionPermit?.timezone??p.settings.learnerTimezone);
      // Override removes the cap, not this independently evidenced boost.
      p.effects[event.id].rawCard={...rawCard,due:new Date(Math.min(Date.parse(rawCard.due),dayBounds(at,introductionPermit?.timezone??p.settings.learnerTimezone).endsAt)).toISOString()};
    }
    if(!p.introductions[task.taskKey]){p.permits[d.permitId].usedBy=event.id;p.introductions[task.taskKey]={id:event.id,permitId:d.permitId,day:p.permits[d.permitId].day};}
    const bounds=dayBounds(at,introductionPermit?.timezone??p.settings.learnerTimezone);
    p.reviews.push({id:event.id,taskKey:task.taskKey,install:event.install,seq,module:task.module,dayStart:bounds.startsAt,at,rawRating:d.rawRating,effectiveRating,
      foregroundValid:a.foregroundValid,thinkMs:a.foregroundValid?a.thinkMs:null,threshold:clone(d.hesitation),undoneAt:null});
  }else if(event.type==='boost'||event.type==='capture-boost'){
    const source=event.type==='capture-boost'?{...clone(d.capture),id:event.id,install:event.install,seq,ts:event.ts}:p.captures.find(row=>row.id===d.observationId);
    if(event.type==='capture-boost'){const issue=captureProblem(p,d.capture);if(issue)return refuse(issue);}
    const issue=boostProblem(p,task,event,source);if(issue)return refuse(issue);
    mutate(p,event,{[task.taskKey]:{}});
    if(event.type==='capture-boost')p.captures.push(source);
    applyBoost(p,p.tasks[task.taskKey],source,event,effectiveTime(task,event,rt));
  }else if(event.type==='hesitation-override'){
    const group=p.effects[task.head];
    if(!group||group.root!==d.target||group.install!==event.install||group.type!=='review'||group.closed||group.overridden||group.rawRating===group.effectiveRating)return refuse('override-not-current-capped-review');
    p.tasks[task.taskKey]={...task,card:clone(group.rawCard),head:event.id};
    const next={...clone(group),id:event.id,overridden:true};p.effects[event.id]=next;
    const review=p.reviews.find(row=>row.id===group.reviewId);review.effectiveRating=group.rawRating;review.overrideId=event.id;
  }else if(event.type==='undo'){
    const group=p.effects[task.head];
    if(!group||group.root!==d.target||group.install!==event.install||group.closed||group.type==='undo'||group.type==='baseline')return refuse('undo-not-current-originating-group');
    if(group.taskKeys.some(key=>p.tasks[key].head!==task.head))return refuse('undo-group-superseded');
    for(const key of group.taskKeys)p.tasks[key]={...clone(group.before[key]),contentRevision:p.tasks[key].contentRevision,head:event.id};
    p.effects[event.id]={id:event.id,root:event.id,install:event.install,type:'undo',taskKeys:group.taskKeys,before:{},closed:true,overridden:false};
    if(group.reviewId){const row=p.reviews.find(row=>row.id===group.reviewId);row.undoneAt=seq??(p.appliedSeq+1);}
    // Captures, raw canonical rows, spent permits and source effect identities stay.
  }else if(event.type==='suspend'||event.type==='known'){
    mutate(p,event,{[task.taskKey]:event.type==='suspend'?{suspended:d.on}:{known:d.on,suspended:d.on}});
  }else if(event.type==='repair'){
    const repair={...(task.repair||{}),at:new Date(upperTime(event,rt)).toISOString(),lapses:task.card?.lapses||0};
    const updates={[task.taskKey]:{repair}};
    if(d.action==='hint'){if(typeof d.hint!=='string'||!d.hint)return refuse('hint-required');repair.hint=d.hint;}
    if(d.action==='keep')repair.keep=true;
    if(d.action==='suspend')updates[task.taskKey].suspended=true;
    if(d.action==='restore')updates[task.taskKey].suspended=false;
    if(d.action==='swap'){
      const replacement=p.tasks[canonicalTaskKey(p,d.replacementTaskKey)];
      if(!replacement||replacement.noteGuid!==task.noteGuid||replacement.contract!==task.contract||replacement.taskKey===task.taskKey||replacement.card||replacement.suspended||replacement.known||replacement.head!==d.replacementParent)return refuse('invalid-swap-target');
      repair.swap=replacement.taskKey;updates[task.taskKey].suspended=true;updates[replacement.taskKey]={priority:true};
    }
    mutate(p,event,updates);p.repairLog.push({id:event.id,taskKey:task.taskKey,action:d.action});
  }else return refuse('unsupported-command');
  return result(p,event,'applied',null,extra);
}

export function replay(envelopes,options) {
  const p=initialProjection(options),scheduler=engine.createScheduler(fsrsApi,options.pin);
  const seen=new Map(),streams=new Map();
  let lastReceiptTime=-1;
  function receive(envelope,provisional=false){
    const {event,bodyHash}=envelope;
    if(!provisional&&envelope.authority!==(event?.install==='@server'?'server':'device')){
      p.error={seq:envelope.seq??null,reason:'invalid-envelope-authority'};return false;
    }
    const validation=validateEvent(event,{allowServer:!provisional&&envelope.authority==='server'});
    if(!validation.ok){if(validation.unsupported)p.updateRequired={seq:provisional?null:envelope.seq,id:event?.id||null,reason:validation.errors[0]};else p.error={seq:provisional?null:envelope.seq,reason:validation.errors.join(',')};return false;}
    if(event.learner!==options.learner){p.error={seq:envelope.seq??null,reason:'learner-mismatch'};return false;}
    const data=event.data,capture=event.type==='capture'?data:data.capture;
    const references=[data.taskKey,data.replacementTaskKey,capture?.contextTaskKey,capture?.targetTaskKey,...Object.keys(event.type==='content-activate'?data.revisions:{})].filter(Boolean);
    if(references.some(key=>!p.tasks[canonicalTaskKey(p,key)])){p.updateRequired={seq:provisional?null:envelope.seq,id:event.id,reason:'unknown-task-identity'};return false;}
    if(bodyHash!==payloadHash(event)){p.error={seq:envelope.seq??null,reason:'payload-hash-mismatch'};return false;}
    if(seen.has(event.id)){
      if(seen.get(event.id)!==bodyHash){p.error={seq:envelope.seq??null,reason:'event-id-body-conflict'};return false;}
      if(!provisional){p.error={seq:envelope.seq,reason:'duplicate-canonical-event'};return false;}
      return 'duplicate';
    }
    if(!provisional&&!["device","server"].includes(envelope.authority)){p.error={seq:envelope.seq,reason:'invalid-envelope-authority'};return false;}
    if(event.dseq!==(streams.get(event.install)||0)+1){p.error={seq:envelope.seq??null,reason:'installation-sequence-gap'};return false;}
    if(!provisional&&(!Number.isSafeInteger(envelope.rt)||envelope.rt<0||envelope.rt>MAX_SYNC_TIME||envelope.rt<lastReceiptTime)){p.error={seq:envelope.seq,reason:'invalid-receipt-time'};return false;}
    const rt=provisional?options.provisionalNow:envelope.rt;
    apply(p,event,rt,provisional?null:envelope.seq,scheduler,provisional);
    if(!provisional)lastReceiptTime=rt;
    streams.set(event.install,event.dseq);seen.set(event.id,bodyHash);
    return true;
  }
  for(const envelope of envelopes){
    if(envelope.seq!==p.appliedSeq+1){p.error={seq:envelope.seq,reason:'canonical-sequence-gap'};break;}
    if(!receive(envelope))break;
    p.appliedSeq=envelope.seq;
  }
  const provisional=options.provisional||[];
  if(!p.error&&!p.updateRequired&&provisional.length){
    if(!Number.isSafeInteger(options.provisionalNow)||options.provisionalNow<0||options.provisionalNow>MAX_SYNC_TIME){
      p.error={seq:null,reason:'invalid-provisional-time'};return p;
    }
    for(const row of provisional){const received=receive(row,true);if(!received)break;if(received!=='duplicate')p.pending.push(row.event.id);}
  }
  return p;
}

export function previewReview(projection,data,{pin,now}) {
  const task=projection.tasks[data.taskKey];
  if(!task||!Number.isSafeInteger(now)||now<0||now>MAX_SYNC_TIME)throw new Error('preview-task-time-required');
  const scheduler=engine.createScheduler(fsrsApi,pin),at=engine.effectiveReviewTime(task.card,new Date(now)).getTime();
  const evidence=hesitationEvidence(projection,{module:task.module,base:projection.appliedSeq});
  return {parent:task.head,contentRevision:task.contentRevision,hesitation:{...evidence,signalIds:[]},
    cards:Object.fromEntries([1,2,3,4].map(rating=>[rating,gradeCard(scheduler,task,rating,at)]))};
}
export function createReplayEngine(options) {
  return {replay:(events,overlay={})=>replay(events,{...options,...overlay}),
    previewReview:(projection,data,context)=>previewReview(projection,data,{pin:options.pin,...context}),
    hesitationEvidence};
}
