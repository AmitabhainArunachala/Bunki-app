/** Read-only presentation evidence. Never schedules cards, grants permits or
 * changes history. Day boundaries come from the canonical learner timezone. */
import {dayBounds,studyDayAllowance} from '../replay.mjs';
import {contentReady} from '../player/content-ready.mjs';
import {selectCustomSession} from '../player/study-sessions.mjs';
const median=values=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;};
// Stable timestamp sorting preserves replay order when two grades share a time.
const validReviews=(projection,at)=>projection.reviews.filter(row=>!row.undoneAt&&row.at<=at).sort((a,b)=>a.at-b.at);
const previousCard=(projection,review)=>projection.effects?.[review.id]?.before?.[review.taskKey]?.card;
const isNew=(projection,review)=>projection.introductions?.[review.taskKey]?.id===review.id;
function precedingDays(today,count){
 const days=[];let cursor=today;
 for(let index=0;index<count;index++){days.push(cursor);cursor=dayBounds(cursor.startsAt-1,today.timezone);}
 return days;
}
function dayKeys(timezone){
 const formatter=new Intl.DateTimeFormat('en-CA-u-ca-iso8601-nu-latn',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});
 return time=>{const parts=Object.fromEntries(formatter.formatToParts(time).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
}

/** Optional host evidence: {installation, startedAt, eventIds}. The complete
 * locally applied grade roster includes subsequently undone grades. Unknown,
 * overlapping or incomplete session boundaries supply no timing samples.
 * thinkMs is recall latency and is deliberately never a duration fallback. */
function sessionSamples(projection,sessions,at){
 const reviews=projection.reviews.filter(row=>row.at<=at),byId=new Map(reviews.map(row=>[row.id,row]));
 const candidates=[];
 for(const session of sessions){
  if(!session||typeof session.installation!=='string'||!Number.isFinite(session.startedAt)||!Array.isArray(session.eventIds))continue;
  const ids=new Set(session.eventIds),rows=session.eventIds.map(id=>byId.get(id));
  if(!rows.length||ids.size!==rows.length||rows.some(row=>!row||row.install!==session.installation||row.at<session.startedAt))continue;
  rows.sort((a,b)=>a.at-b.at);const end=rows.at(-1).at;
  if(reviews.some(row=>row.install===session.installation&&row.at>=session.startedAt&&row.at<=end&&!ids.has(row.id)))continue;
  candidates.push({session,rows,end,valid:true});
 }
 for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
  const a=candidates[i],b=candidates[j];
  if(a.session.installation===b.session.installation&&
    (a.rows.some(row=>b.session.eventIds.includes(row.id))||a.session.startedAt<b.end&&b.session.startedAt<a.end))a.valid=b.valid=false;
 }
 const samples=new Map();
 for(const {session,rows,valid} of candidates){
  if(!valid)continue;let previous=session.startedAt;
  for(const row of rows){if(row.undoneAt)continue;samples.set(row.id,Math.min(120000,Math.max(0,row.at-previous)));previous=row.at;}
 }
 return samples;
}
function timing(rows,samples){
 if(rows.some(row=>!samples.has(row.id)))return {milliseconds:null,minutes:null,timingStatus:'unavailable'};
 const milliseconds=rows.reduce((sum,row)=>sum+samples.get(row.id),0);
 return {milliseconds,minutes:Math.round(milliseconds/60000),timingStatus:'exact'};
}

/** Counts use active applied grades only. For a local session supply its full
 * eventIds, startedAt and installation; for day totals supply sessionTimings.
 * Exact means the specified clamped grade-gap metric, not wall-clock duration. */
export function studyReviewSummary(projection,{at=Date.now(),eventIds=null,startedAt=null,installation=null,from=-Infinity,to=Infinity,sessionTimings=[]}={}){
 const ids=eventIds===null?null:new Set(eventIds);
 const rows=validReviews(projection,at).filter(row=>(!ids||ids.has(row.id))&&(!installation||row.install===installation)&&row.at>=from&&row.at<to);
 let evidence=sessionTimings;
 if(ids&&Number.isFinite(startedAt)){
  const roster=projection.reviews.filter(row=>ids.has(row.id)&&(!installation||row.install===installation)),owners=new Set(roster.map(row=>row.install));
  evidence=owners.size===1?[{installation:installation??roster[0].install,startedAt,eventIds:roster.map(row=>row.id)}]:[];
 }
 const misses=[...new Set(rows.filter(row=>row.effectiveRating===1).map(row=>row.taskKey))],matured=new Set();
 for(const row of rows){
  const before=previousCard(projection,row);if(!before||before.scheduled_days>=21)continue;
  const head=row.overrideId??row.id;
  // Causal heads, not timestamps, identify the immediately following state.
  const next=projection.reviews.find(review=>!review.undoneAt&&review.taskKey===row.taskKey&&projection.effects?.[review.id]?.before?.[row.taskKey]?.head===head);
  const after=next?previousCard(projection,next):projection.tasks[row.taskKey]?.head===head?projection.tasks[row.taskKey].card:null;
  if(after?.scheduled_days>=21)matured.add(row.taskKey);
 }
 return {reviewed:rows.length,again:rows.filter(row=>row.effectiveRating===1).length,new:rows.filter(row=>isNew(projection,row)).length,
   ...timing(rows,sessionSamples(projection,evidence,at)),matured:matured.size,misses,eventIds:rows.map(row=>row.id)};
}

/** These offers are explicit subsets of the current canonical selector. The
 * caller must restrict the run to taskKeys and revalidate at start. */
export function studyOfferView(projection,catalog,{at=Date.now(),installation,missedTaskKeys=[]}={}){
 const today=studyDayAllowance(projection,at),tomorrow=dayBounds(today.endsAt,today.timezone);
 const clock={now:at,dayStart:today.startsAt,dayEnd:today.endsAt-1,installation};
 const practiceOptions={mode:'practice',size:200,untilDone:true,filters:{recentlyFailed:true}};
 const missed=new Set(missedTaskKeys);
 const practice=selectCustomSession(projection,catalog.filter(entry=>missed.has(entry.taskKey)),practiceOptions,clock);
 const practiceIds=practice.entries.map(entry=>entry.taskKey),selected=new Set(practiceIds);
 const aheadOptions={mode:'review-ahead',aheadDays:1,size:200,untilDone:true,filters:{minIntervalDays:10}};
 const ahead=selectCustomSession(projection,catalog.filter(entry=>{
  const card=projection.tasks[entry.taskKey]?.card,due=Date.parse(card?.due);
  return card?.state===2&&card.scheduled_days>=10&&due>=tomorrow.startsAt&&due<tomorrow.endsAt;
 }),aheadOptions,clock);
 return {practice:{taskKeys:practiceIds,excludedTaskKeys:[...missed].filter(key=>!selected.has(key)),options:practice.options},
  ahead:{taskKeys:ahead.entries.map(entry=>entry.taskKey),options:ahead.options}};
}

/** Observed seven-day cost, not a second scheduling model. Use only known
 * introductions with seven COMPLETE following learner days in the last 60-day
 * cohort window. An interday review is the first active review of a card on a
 * later learner day; intraday learning repeats do not inflate the estimate.
 * Baseline imports, undone introductions and incomplete cohorts are excluded.
 * When history spans fewer than 14 learner days (or no complete cohort),
 * use the research fallback and identify it explicitly. */
export function studyNewCardCost(projection,{at=Date.now()}={}){
 const today=studyDayAllowance(projection,at),days=precedingDays(today,60),keyAt=dayKeys(today.timezone);
 const rows=validReviews(projection,at),byId=new Map(rows.map(row=>[row.id,row]));
 const hasHistory=rows.some(row=>row.at<days[12].startsAt);
 const cohorts=new Map();
 for(const [taskKey,introduction] of Object.entries(projection.introductions??{})){
  if(introduction.baseline)continue;
  const first=byId.get(introduction.id);
  if(!first||first.taskKey!==taskKey||first.at<days.at(-1).startsAt)continue;
  const bounds=dayBounds(first.at,today.timezone);let end=bounds.endsAt;
  for(let i=0;i<7;i++)end=dayBounds(end,today.timezone).endsAt;
  if(at<end)continue;
  cohorts.set(taskKey,{after:bounds.endsAt,end,days:new Set()});
 }
 for(const row of rows){const cohort=cohorts.get(row.taskKey);if(cohort&&row.at>=cohort.after&&row.at<cohort.end)cohort.days.add(keyAt(row.at));}
 const interdayReviews=[...cohorts.values()].reduce((sum,cohort)=>sum+cohort.days.size,0);
 const source=hasHistory&&cohorts.size?'history':'fallback';
 const r7=source==='history'?interdayReviews/cohorts.size:1.1;
 return {r7,source,cohortCards:cohorts.size,interdayReviews,
  fallbackReason:source==='history'?null:!hasHistory?'less-than-14-days':'no-complete-cohort',
  choices:[5,10,20].filter(add=>today.limit+add<=200).map(add=>({add,total:today.limit+add,estimatedReviews:Math.round(add*r7)}))};
}

// Shared current-day availability only: no forecasts, session timings, offers
// or continuity. The caller still supplies the canonical admission queue.
function studyAvailabilityData(projection,catalog,{at=Date.now(),installation,queue=[],offline=false,canRequestPermits=false}={}){
 const today=studyDayAllowance(projection,at);
 const eligible=catalog.filter(entry=>{const task=projection.tasks[entry.taskKey];return task&&contentReady(entry)&&!task.suspended&&!task.known&&!(projection.settings.topicsOff?.[task.module]??[]).includes(task.group);});
 const admitted=new Set(queue.map(entry=>entry.taskKey));
 const due=eligible.filter(entry=>admitted.has(entry.taskKey)&&projection.introductions[entry.taskKey]);
 const unseen=eligible.filter(entry=>!projection.introductions[entry.taskKey]);
 // This is only the canonical sibling exclusion, not a second scheduler.
 const reviewedToday=projection.reviews.filter(row=>!row.undoneAt&&row.at<=at&&row.at>=today.startsAt&&row.at<today.endsAt);
 const reviewedLexemes=new Map();for(const row of reviewedToday){const key=projection.tasks[row.taskKey]?.lexicalKey;let keys=reviewedLexemes.get(key);if(!keys)reviewedLexemes.set(key,keys=new Set());keys.add(row.taskKey);}
 const eligibleNew=unseen.filter(entry=>{const keys=reviewedLexemes.get(projection.tasks[entry.taskKey].lexicalKey);return !keys||keys.size===1&&keys.has(entry.taskKey);});
 const permits=Object.values(projection.permits),overlapping=permit=>permit.startsAt<today.endsAt&&permit.endsAt>today.startsAt;
 const active=permits.filter(permit=>!permit.usedBy&&permit.startsAt<=at&&permit.endsAt>at);
 const held=active.filter(permit=>permit.install===installation).length,reservedElsewhere=active.filter(permit=>permit.install!==installation).length;
 const spent=permits.filter(permit=>permit.usedBy&&overlapping(permit)).length;
 const allocated=Math.max(permits.filter(overlapping).length,(projection.permitGrants??[]).filter(overlapping).reduce((sum,grant)=>sum+grant.count,0));
 const unallocated=Math.max(0,today.limit-allocated),remaining=Math.max(0,today.limit-spent);
 const readyNew=Math.min(eligibleNew.filter(entry=>admitted.has(entry.taskKey)).length,held,remaining);
 const requestableNew=!offline&&canRequestPermits?Math.min(eligibleNew.length-readyNew,unallocated,remaining-readyNew):0;
 const newToday=readyNew+requestableNew,buried=unseen.length-eligibleNew.length;
 const reason=newToday?null:!unseen.length?'no-new-left':!eligibleNew.length?'siblings-buried':offline?'offline-permits-exhausted':reservedElsewhere?'reserved-on-another-device':spent>=today.limit?'daily-limit-reached':!canRequestPermits&&unallocated?'permit-authority-unavailable':'permits-unavailable';
 const availability={allocated,unallocated,reservedElsewhere,readyNew,requestableNew,eligibleNewIds:eligibleNew.map(entry=>entry.taskKey),buried,reason};
 return {today,eligible,due,unseen,newToday,held,spent,readyNew,requestableNew,buried,reason,reservedElsewhere,availability};
}

/** Current new-card eligibility and permit counts without the full Today model. */
export function studyNewCardAvailability(projection,catalog,options={}){
 const {today,availability}=studyAvailabilityData(projection,catalog,options);
 return {today,availability};
}

/** Forecasts count current schedules, not future grade outcomes. queue must be
 * the full canonical queue. Online alone is not permit authority: only an
 * explicitly capable host may set canRequestPermits. Optional sessionTimings
 * enable evidence-based pace estimates; otherwise minutes remain absent. */
export function studyDayView(projection,catalog,{at=Date.now(),installation,queue=[],offline=false,canRequestPermits=false,verifiedRestDays=[],sessionTimings=[]}={}){
 const {today,eligible,due,unseen,newToday,held,spent,readyNew,requestableNew,buried,reason,reservedElsewhere,availability}=studyAvailabilityData(projection,catalog,{at,installation,queue,offline,canRequestPermits});
 const timezone=today.timezone,rows=validReviews(projection,at),boundaries=[];let cursor=today.endsAt;
 for(let index=0;index<7;index++){const bounds=dayBounds(cursor,timezone);boundaries.push(bounds);cursor=bounds.endsAt;}
 const keyAt=dayKeys(timezone),historyDays=new Set(rows.map(row=>keyAt(row.at))),recentDays=precedingDays(today,14);
 const recentKeys=new Set(recentDays.map(day=>day.day)),counts=new Map(recentDays.map(day=>[day.day,0]));
 const samples=sessionSamples(projection,sessionTimings,at),newTimes=[],reviewTimes=[];
 for(const row of rows){const key=keyAt(row.at);if(!recentKeys.has(key))continue;counts.set(key,counts.get(key)+1);if(samples.has(row.id))(isNew(projection,row)?newTimes:reviewTimes).push(samples.get(row.id));}
 const estimate=(reviewCount,newCount)=>{
  if(reviewCount+newCount===0)return 0;
  if(historyDays.size<3)return null;
  const reviewMs=median(reviewTimes),newMs=median(newTimes);
  if(reviewCount&&reviewMs===null||newCount&&newMs===null)return null;
  return Math.max(1,Math.round((reviewCount*(reviewMs??0)+newCount*(newMs??0))/60000));
 };
 const scheduled=eligible.map(entry=>({entry,task:projection.tasks[entry.taskKey]})).filter(({task})=>task.card&&Number.isFinite(Date.parse(task.card.due)));
 const overdue=due.filter(entry=>Date.parse(projection.tasks[entry.taskKey].card?.due)<today.startsAt).length;
 const strip=boundaries.map(bounds=>({...bounds,count:scheduled.filter(({task})=>{const time=Date.parse(task.card.due);return time>=bounds.startsAt&&time<bounds.endsAt;}).length}));
 const carriedReviews=scheduled.filter(({task})=>Date.parse(task.card.due)<=at).length;
 const tomorrowReviews=strip[0].count+carriedReviews;
 const tomorrowNew=Math.min(studyDayAllowance(projection,boundaries[0].startsAt).limit,unseen.length);
 const later=scheduled.filter(({task})=>[1,3].includes(task.card.state)&&Date.parse(task.card.due)>at&&Date.parse(task.card.due)<today.endsAt).sort((a,b)=>Date.parse(a.task.card.due)-Date.parse(b.task.card.due));
 const recentDayKeys=new Set(precedingDays(today,30).map(day=>day.day));
 // The host must evidence historical rest days independently. Today's empty
 // queue cannot establish that any previous day had nothing due.
 const continuityDays=new Set([...historyDays,...verifiedRestDays].filter(day=>recentDayKeys.has(day)));
 const totals=studyReviewSummary(projection,{at,from:today.startsAt,to:today.endsAt,sessionTimings});
 const offers=studyOfferView(projection,catalog,{at,installation,missedTaskKeys:totals.misses});
 const medianDailyReviews=median([...counts.values()]),backlog=overdue>0&&due.length>Math.max(50,1.5*medianDailyReviews);
 return {today,due:due.length,newToday,held,spent,unseen:unseen.length,overdue,backlog,firstDay:rows.length===0,
   finished:due.length===0&&newToday===0,waitingForNew:due.length===0&&readyNew===0&&requestableNew>0,estimateMinutes:estimate(due.length,newToday),totals,
   availability,
   historyWindow:{days:recentDays.map(day=>day.day),reviewCounts:[...counts.values()],medianDailyReviews},
   estimateEvidence:{source:'known-session-grade-gaps',reviewSamples:reviewTimes.length,newSamples:newTimes.length},
   tomorrow:{reviews:tomorrowReviews,scheduledReviews:strip[0].count,carriedReviews,new:tomorrowNew,estimateMinutes:estimate(tomorrowReviews,tomorrowNew)},strip,
   laterToday:{count:later.length,nextAt:later.length?Date.parse(later[0].task.card.due):null},ahead:offers.ahead.taskKeys,offers,
   continuity:rows.length===0?null:{days:continuityDays.size,outOf:30},
   conditions:{laterToday:later.length>0,limitReached:spent>=today.limit,noNewLeft:unseen.length===0,offline,
    reservedElsewhere:reservedElsewhere>0,buriedNew:buried>0,permitAuthorityUnavailable:reason==='permit-authority-unavailable'},
 };
}
