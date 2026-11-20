/** Read-only custom session selection. Admission and FSRS remain in replay. */
import {contentReady} from './content-ready.mjs';
import {servable} from '../vendor/engine.js';
const DAY=86400000;
export function customSessionOptions(input={}) {
 const mode=input.mode??'practice',aheadDays=Number(input.aheadDays??1),size=Number(input.size??20),filters=input.filters??{};
 if(!['due','review-ahead','practice'].includes(mode)||![1,3,7].includes(aheadDays)||!Number.isInteger(size)||size<10||size>200||typeof (input.untilDone??false)!=='boolean')throw Error('invalid-custom-session');
 const minIntervalDays=filters.minIntervalDays??0;
 if(typeof minIntervalDays!=='number'||!Number.isFinite(minIntervalDays)||minIntervalDays<0)throw Error('invalid-custom-filter');
 const level=String(filters.level||'all').toUpperCase()==='ALL'?'all':String(filters.level).toUpperCase();
 if(!['all','N2','N1'].includes(level)||!['all','vocabulary','grammar','n1','n2','senmon','kotoba'].includes(filters.module??'all')||typeof(filters.tag??'')!=='string'||typeof(filters.recentlyFailed??false)!=='boolean'||!['due','hardest','newest'].includes(filters.order??'due'))throw Error('invalid-custom-filter');
 return Object.freeze({mode,aheadDays,size,untilDone:input.untilDone===true,filters:Object.freeze({level,module:filters.module??'all',tag:(filters.tag??'').trim(),recentlyFailed:filters.recentlyFailed===true,minIntervalDays,order:filters.order??'due'})});
}
export function sessionReviewEvidence(options) {
 const value=customSessionOptions(options);
 return value.mode==='review-ahead'?{policy:'custom-session-v1',mode:'review-ahead',aheadDays:value.aheadDays}:null;
}
export function selectCustomSession(projection,catalog,input,{now,dayStart,dayEnd,installation}={}) {
 const options=customSessionOptions(input),f=options.filters;
 if(!Number.isFinite(now)||!Number.isFinite(dayEnd))throw Error('custom-session-time-required');
 const availablePermit=Object.values(projection.permits).some(p=>p.install===installation&&!p.usedBy&&p.startsAt<=now&&p.endsAt>now);
 const failed=new Set(projection.reviews.filter(r=>!r.undoneAt&&r.at>=now-7*DAY&&r.at<=now&&r.effectiveRating===1).map(r=>r.taskKey));
 const selected=catalog.filter(entry=>{
  const t=projection.tasks[entry.taskKey];if(!t||!contentReady(entry)||t.suspended||t.known||(projection.settings.topicsOff[t.module]??[]).includes(t.group))return false;
  if(f.module!=='all'&&(f.module==='vocabulary'?!t.contract.startsWith('vocabulary.'):t.module!==f.module))return false;
  if(f.level!=='all'&&String(entry.level??entry.jlpt??(['n1','n2'].includes(t.module)?t.module:'')).toUpperCase()!==f.level)return false;
  const tags=[entry.tag,entry.theme,entry.group,t.group,...(Array.isArray(entry.tags)?entry.tags:[])].filter(v=>typeof v==='string');
  if(f.tag&&!tags.some(tag=>tag.toLocaleLowerCase().includes(f.tag.toLocaleLowerCase())))return false;
  if(f.recentlyFailed&&!failed.has(t.taskKey))return false;
  if(f.minIntervalDays>0&&!(t.card?.scheduled_days>=f.minIntervalDays))return false;
  if(options.mode==='practice')return true;
  // Reviews-only sessions never introduce a card, even with unused permits.
  if(options.mode==='due'&&!projection.introductions[t.taskKey])return false;
  if(!projection.introductions[t.taskKey]&&!availablePermit)return false;
  if(options.mode==='review-ahead')return !!projection.introductions[t.taskKey]&&t.card?.state===2&&Date.parse(t.card.due)<=now+options.aheadDays*DAY;
  if(!servable(t.card,new Date(now),{dayEnd}))return false;
  return true;
 }).filter(entry=>{
  if(options.mode==='practice')return true;
  const t=projection.tasks[entry.taskKey];
  return !(!t.card||t.card.state===0||t.card.state===2)||!projection.reviews.some(r=>!r.undoneAt&&r.taskKey!==t.taskKey&&projection.tasks[r.taskKey]?.lexicalKey===t.lexicalKey&&r.at>=dayStart&&r.at<=dayEnd);
 });
 selected.sort((a,b)=>{
  const x=projection.tasks[a.taskKey],y=projection.tasks[b.taskKey];
  if(f.order==='hardest'){const diff=(x.card?.stability??Infinity)-(y.card?.stability??Infinity);if(diff)return diff;}
  if(f.order==='newest'){const time=e=>Date.parse(e.createdAt??'')||projection.reviews.find(r=>r.id===projection.introductions[e.taskKey]?.id)?.at||0;const diff=time(b)-time(a);if(diff)return diff;}
  return Number(!x.card||x.card.state===0)-Number(!y.card||y.card.state===0)||(Date.parse(x.card?.due??'')||0)-(Date.parse(y.card?.due??'')||0)||a.taskKey.localeCompare(b.taskKey);
 });
 return Object.freeze({options,entries:Object.freeze(options.untilDone?selected:selected.slice(0,options.size))});
}
