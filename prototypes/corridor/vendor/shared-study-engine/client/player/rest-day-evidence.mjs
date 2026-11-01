/** Conservative suffix evidence, never a scheduler or a history write.
 * Input must be the replica's currently validated cached state. Baseline/boost/
 * undo days are fenced. Later review before-images or a proven unchanged final
 * task anchor every inherited schedule; today's queue is never historical proof.
 */
import {dayBounds} from '../replay.mjs';
const MAX_EVENTS=20000,MAX_TASKS=20000;
const BUDGET_SETTINGS=new Set(['newPerDayTotal','newTodayTotal','newTodayOverride','studyPolicy']);
const freeze=value=>Object.freeze({...value,days:Object.freeze(value.days)});
const result=(state,reason,days=[])=>freeze({available:reason===null,through:state?.appliedSeq??0,
 timezone:state?.projection?.settings?.learnerTimezone??null,days,reason});
function unavailable(state,at){
 const p=state?.projection;
 if(!Number.isSafeInteger(at)||at<0)return 'invalid-time';
 if(!p||p.error||p.updateRequired||state.blocked||p.learner!==state.scope?.learner||p.epoch!==state.epoch||
   !Number.isSafeInteger(state.appliedSeq)||state.appliedSeq<0||state.appliedSeq!==state.head||p.appliedSeq!==state.appliedSeq||
   !Array.isArray(p.reviews)||!p.tasks||!state.canonical)return 'incomplete-prefix';
 for(const key in state.local)return 'local-history';
 if(p.pending?.length)return 'local-history';
 if(state.appliedSeq>MAX_EVENTS||p.reviews.length>MAX_EVENTS)return 'history-limit';
 return null;
}
function prove(state,at,today){
 const p=state.projection,rows=new Map(),events=new Map(),heads=new Map(),reviews=[],undone=new Map();
 if(p.pendingSettings?.some(row=>row.key==='learnerTimezone'))return result(state,'mutation-history');
 const formatter=new Intl.DateTimeFormat('en-CA-u-ca-iso8601-nu-latn',{timeZone:today.timezone,year:'numeric',month:'2-digit',day:'2-digit'});
 const dayKey=time=>{const parts=Object.fromEntries(formatter.formatToParts(time).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
 for(const row of p.reviews){
  if(rows.has(row.id)||!Number.isSafeInteger(row.seq)||row.seq<1||row.seq>state.appliedSeq||
    row.undoneAt!==null&&(!Number.isSafeInteger(row.undoneAt)||row.undoneAt<=row.seq||row.undoneAt>state.appliedSeq))return result(state,'ambiguous-review');
  rows.set(row.id,row);
 }
 let fence=0,fenceAt=null,lastReceipt=-1;
 for(let seq=1;seq<=state.appliedSeq;seq++){
  const envelope=state.canonical[seq],event=envelope?.event,outcome=p.outcomes?.[event?.id];
  if(envelope?.seq!==seq||!event||event.learner!==p.learner||!outcome||outcome.provisional||outcome.seq!==seq||
    !['applied','observation'].includes(outcome.status)||envelope.rt<lastReceipt)return result(state,'incomplete-prefix');
  if(!Number.isSafeInteger(event.ts)||!Number.isSafeInteger(envelope.rt)||event.ts<0||envelope.rt<0||event.ts>at||envelope.rt>at)return result(state,'future-history');
  lastReceipt=envelope.rt;events.set(event.id,{event,seq,outcome});
  // Even an old late event could rewrite a historical day's debt. A later
  // mutation fence does not rehabilitate cross-day delivery ambiguity.
  if(event.ts!==envelope.rt&&dayKey(event.ts)!==dayKey(envelope.rt))return result(state,'late-history');
  const fenced=['baseline','boost','capture-boost','undo','learner-settings-baseline'].includes(event.type)||event.type==='review'&&event.data.boost;
  if(fenced){fence=seq;fenceAt=envelope.rt;}
  if(event.type==='learner-settings-baseline'){
   const baseline=p.learnerSettingsBaseline;
   if(seq!==1||outcome.status!=='applied'||baseline?.id!==event.id||baseline.sourceHash!==event.data.sourceHash||
     baseline.snapshotHash!==event.data.snapshotHash||event.data.settings?.learnerTimezone!==today.timezone)return result(state,'mutation-history');
   continue;
  }
  if(event.type==='settings'){
   if(!BUDGET_SETTINGS.has(event.data.key))return result(state,'mutation-history');
   continue;
  }
  if(['capture','permit-grant'].includes(event.type))continue;
  if(!['review','baseline','boost','capture-boost','undo'].includes(event.type))return result(state,'mutation-history');
  if(outcome.status!=='applied')continue;
  // Replay explicitly records a duplicate import as an applied no-op; it
  // still fences the day, but must not invent another task-head write.
  if(event.type==='baseline'&&outcome.reason==='baseline-already-imported')continue;
  const key=event.data.taskKey,task=p.tasks[key],previous=heads.get(key),effect=p.effects?.[event.id],before=effect?.before?.[key];
  if(!task||effect?.id!==event.id||effect.root!==event.id||effect.install!==event.install||effect.type!==event.type||
    !Array.isArray(effect.taskKeys)||effect.taskKeys.length!==1||effect.taskKeys[0]!==key)return result(state,'unproved-task-history');
  if(event.data.parent!==(previous?.id??null))return result(state,'broken-review-chain');
  if(event.type==='undo'){
   const group=p.effects[event.data.parent];
   if(!group||group.root!==event.data.target||group.install!==event.install||!['review','boost','capture-boost'].includes(group.type)||
     group.taskKeys.length!==1||group.taskKeys[0]!==key||!group.before?.[key]||Object.keys(effect.before).length)return result(state,'unproved-task-history');
   if(group.reviewId)undone.set(group.reviewId,seq);
  }else{
   if(!before||Object.keys(effect.before).length!==1||before.taskKey!==key||before.head!==(previous?.id??null)||
     before.contentRevision!==task.contentRevision||before.noteGuid!==task.noteGuid||before.contract!==task.contract||before.passageId!==task.passageId)return result(state,'broken-review-chain');
   if(event.type==='baseline'&&(before.card!==null||before.head!==null))return result(state,'unproved-task-history');
  }
  heads.set(key,{id:event.id,seq});
  if(event.type!=='review')continue;
  const row=rows.get(event.id);
  if(!row||row.seq!==seq||row.install!==event.install||row.taskKey!==key||event.data.attempt.mode!=='scored'||
    effect.reviewId!==row.id||effect.at!==row.at||row.overrideId||event.data.contentRevision!==before.contentRevision||
    before.known||before.suspended)return result(state,'ambiguous-review');
  if(!Number.isSafeInteger(row.at)||row.at<0||row.at>at)return result(state,'future-history');
  if(row.at!==envelope.rt&&dayKey(row.at)!==dayKey(envelope.rt))return result(state,'late-history');
  reviews.push({id:row.id,seq,key,at:row.at,before,previousSeq:previous?.seq??0,undoneAt:row.undoneAt});
 }
 if(reviews.length!==rows.size||reviews.some(row=>(row.undoneAt??null)!==(undone.get(row.id)??null)))return result(state,'ambiguous-review');
 const chains=new Map(),reviewDays=new Set();let firstDay=null;
 for(const row of reviews){
  if(row.seq<=fence)continue;
  if(row.undoneAt)return result(state,'ambiguous-review');
  const chain=chains.get(row.key)??[],previous=chain.at(-1);
  if(previous?(row.before.head!==previous.id||row.at<previous.at):row.previousSeq>fence)return result(state,'broken-review-chain');
  chain.push(row);chains.set(row.key,chain);
  const day=dayKey(row.at);reviewDays.add(day);if(firstDay===null||day<firstDay)firstDay=day;
 }
 if(!firstDay)return result(state,'no-scored-history');
 const proofFloor=fenceAt===null?firstDay:[firstDay,dayKey(fenceAt)].sort().at(-1),schedules=new Map();
 const dueAt=(snapshot,knownAt)=>{
  if(snapshot.card===null)return -Infinity; // An introduced, undone first grade still owes work.
  const card=snapshot.card,due=Date.parse(card?.due),introduced=Date.parse(card?.introducedAt),last=card?.last_review===null?-Infinity:Date.parse(card?.last_review);
  return Number.isFinite(due)&&Number.isFinite(introduced)&&introduced<=knownAt&&last<=knownAt?due:NaN;
 };
 let taskCount=0;
 for(const key in p.tasks){
  if(++taskCount>MAX_TASKS)return result(state,'history-limit');
  const task=p.tasks[key],head=heads.get(key),intro=p.introductions[key],introduced=events.get(intro?.id);
  const chain=chains.get(key)??[];
  if(task.taskKey!==key||task.head!==(head?.id??null)||!chain.length&&(head?.seq??0)>fence)return result(state,'broken-review-chain');
  if(intro&&(!introduced||introduced.outcome.status!=='applied'||introduced.event.data.taskKey!==key||
    !['review','baseline'].includes(introduced.event.type)||Boolean(intro.baseline)!==(introduced.event.type==='baseline')))return result(state,'unproved-task-history');
  if(chain.length&&!intro)return result(state,'unproved-task-history');
  const inherited=!!intro&&introduced.seq<=fence,anchor=chain[0]?.before??task;
  if(!inherited&&(anchor.card!==null||intro&&chain[0]?.id!==intro.id))return result(state,'unproved-task-history');
  // No task writes after the fence means the final task IS its suffix anchor.
  // A first later review.before is otherwise the exact unchanged anchor state.
  // Do not omit an inherited baseline merely because it has no later reviews.
  const segments=[{at:-Infinity,due:inherited?dueAt(anchor,fenceAt):Infinity}];
  if(Number.isNaN(segments[0].due))return result(state,'unproved-task-history');
  for(let index=0;index<chain.length;index++){
   const after=chain[index+1]?.before??task,due=dueAt(after,chain[index].at);
   if(!Number.isFinite(due)||after.head!==chain[index].id||Date.parse(after.card.last_review)!==chain[index].at)return result(state,'broken-review-chain');
   segments.push({at:chain[index].at,due});
  }
  // Filters, known/suspended flags and sibling burial never manufacture rest.
  // Every introduced schedule counts conservatively, including inherited debt.
  if(inherited||chain.length)schedules.set(key,segments);
 }
 if([...chains.keys()].some(key=>!p.tasks[key])||Object.keys(p.introductions).some(key=>!p.tasks[key]))return result(state,'unproved-task-history');
 const days=[];let day=today;
 // Only completed learner days after the fence AND actual later scored work.
 for(let age=1;age<30;age++){
  day=dayBounds(day.startsAt-1,today.timezone);
  if(day.day<=proofFloor)break;
  if(reviewDays.has(day.day))continue;
  let due=false;
  for(const chain of schedules.values()){
   let low=0,high=chain.length;
   while(low<high){const mid=(low+high)>>>1;if(chain[mid].at<day.startsAt)low=mid+1;else high=mid;}
   if(low&&chain[low-1].due<day.endsAt){due=true;break;}
  }
  if(!due)days.push(day.day);
 }
 return result(state,null,days.reverse());
}
/** One bounded proof per canonical prefix/learner day. Provisional writes do
 * not invalidate the cache or trigger work, but suppress its use until settled.
 * No storage IO, replay, clock timer, caller-owned mutation or schedule writes.
 */
export function createRestDayEvidenceReader(){
 let cache=null;
 return (state,{at=Date.now()}={})=>{
  const reason=unavailable(state,at);if(reason)return result(state,reason);
  const zone=state.projection.settings.learnerTimezone;
  const key=JSON.stringify([state.scope.environment,state.scope.learner,state.epoch,state.appliedSeq,zone,state.canonical[state.appliedSeq]?.bodyHash]);
  if(cache?.key===key&&at>=cache.checkedAt&&at<cache.today.endsAt)return cache.value;
  try{
   const today=dayBounds(at,zone),value=prove(state,at,today);
   cache={key,today,checkedAt:at,value};return value;
  }catch{return result(state,'unproved-history');}
 };
}
