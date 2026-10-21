/** Journey r2.1 lifecycle (HOOKS-SPEC r8 rev 3.2 §7), the product port of W5's gated model lifecycle.mjs 9a99366a. Only the
 * platform differs: the host's canonical digest, TextEncoder sizes, JSON equality, and one body for two kinds of port. A
 * committing step is a generator, so a synchronous port (the model's in-memory fixture) runs it synchronously and the record
 * host's asynchronous commit runs it as a promise; asynchronous operations run one at a time, as the model's do. */
import {encodeLocalJson} from './modules/record-core.mjs';
export const LIMITS=Object.freeze({events:128,attempts:96,visits:32,goals:8,projects:16,bytes:262144,dataBytes:258048});
export const digest=x=>encodeLocalJson(x).sha256;
export const MARKERS=Object.freeze({off:'bunki-journey:off-day',hold:'bunki-journey:hold'});
export const dayKey=t=>{const d=new Date(t);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const cp=x=>structuredClone(x);
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const insist=(ok,reason)=>{if(!ok)throw new Error(reason);};
const text=x=>typeof x==='string'&&x.length>0&&x.length<=512;
const bytes=x=>new TextEncoder().encode(JSON.stringify(x)).byteLength;
const canonical=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);
const same=(a,b)=>canonical(a)===canonical(b);
const thenable=x=>x!==null&&(typeof x==='object'||typeof x==='function')&&typeof x.then==='function';
/** drive a step synchronously until the port hands back a promise, then finish it asynchronously */
function drive(step){let next=step.next();while(!next.done){if(thenable(next.value))return finish(step,next.value);next=step.next(next.value);}return next.value;}
async function finish(step,pending){let next={done:false,value:pending};
 while(!next.done){let value,error,failed=false;try{value=await next.value;}catch(e){failed=true;error=e;}next=failed?step.throw(error):step.next(value);}
 return next.value;}
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&plain(x);
const originOK=o=>o===null||(plain(o)&&text(o.eventId)&&text(o.sessionId)&&
 (o.attemptId===undefined||text(o.attemptId))&&Object.keys(o).every(k=>['eventId','sessionId','attemptId'].includes(k)));
const rawOK=r=>object(r)&&text(r.what)&&Object.keys(r).every(k=>['what','about','reveals','at'].includes(k))&&
 Array.isArray(r.reveals)&&r.reveals.every(v=>['meaning','reading','form'].includes(v))&&new Set(r.reveals).size===r.reveals.length;
function plain(x,depth=0){
 if(depth>22)return false; // rev 3.3 §7.6 (W5 1441 F4): the root sits two levels inside a backup whose own limit is 24
 if(x===null||typeof x==='string'||typeof x==='boolean')return true;
 if(typeof x==='number')return Number.isFinite(x);
 if(!x||typeof x!=='object'||![Object.prototype,Array.prototype].includes(Object.getPrototypeOf(x)))return false;
 const keys=Reflect.ownKeys(x).filter(k=>!(Array.isArray(x)&&k==='length'));
 return (!Array.isArray(x)||keys.length===x.length)&&keys.every(k=>{
  const d=Object.getOwnPropertyDescriptor(x,k);return typeof k==='string'&&d.enumerable&&'value'in d&&plain(d.value,depth+1);
 });
}
// This input is the proposed host's projection of an OWNED, validated controller
// snapshot and existing COMMANDS collection, not application-supplied flags.
export function authority(snapshot){
 insist(snapshot.status==='active'&&text(snapshot.migrationId)&&plain(snapshot.scope)&&Array.isArray(snapshot.commands)&&
  Number.isSafeInteger(snapshot.revision)&&snapshot.revision>=0,'authority-unavailable');
 const rows=snapshot.commands;
 insist(rows.every(r=>r.format==='kairo-local-command-receipt'&&r.version===1&&text(r.changeId)&&
  same(r.scope,snapshot.scope)&&Number.isSafeInteger(r.committedRevision)&&r.committedRevision>=1&&r.committedRevision<=snapshot.revision)&&
  new Set(rows.map(r=>r.changeId)).size===rows.length,'receipt-invalid');
 const restores=rows.filter(r=>['host.restore/1','host.restore/2'].includes(r.type)).sort((a,b)=>a.committedRevision-b.committedRevision);
 const latestRestore=restores.at(-1)??null;
 const generation=digest([snapshot.migrationId,snapshot.scope,latestRestore?.changeId??'origin']);
 const lifecycle=rows.filter(r=>r.type==='journey.lifecycle/1'); // NEW W4 typed receipt extension
 insist(lifecycle.every(r=>text(r.journey?.action)&&text(r.journey?.generation)&&text(r.journey?.journeyId)),'lifecycle-receipt-invalid');
 return {generation,latestRestore,everCreated:lifecycle.some(r=>['bootstrap','activate','retire-generation'].includes(r.journey?.action)),
  activated:lifecycle.filter(r=>r.journey?.generation===generation&&['bootstrap','activate','retire-generation'].includes(r.journey?.action))};
}
export function classify(root){
 if(root===undefined)return 'absent';
 if(!object(root)||root.version!==1||root.protocol!=='journey-r2')return 'malformed-or-future';
 if(bytes(root)>LIMITS.bytes)return 'oversize';
 if(!text(root.id)||!text(root.generation)||!text(root.lastWriterBuild)||!Number.isSafeInteger(root.revision)||root.revision<1||
  !Number.isSafeInteger(root.dayEpoch)||root.dayEpoch<1||!Number.isFinite(root.dayEnd)||
  !Array.isArray(root.daily?.events)||!Array.isArray(root.daily?.attempts)||!Number.isSafeInteger(root.daily?.visits)||root.daily.visits<0||
  !Array.isArray(root.goals)||!Array.isArray(root.projects)||!object(root.guard)||!object(root.progress)||
  root.daily.events.length>LIMITS.events||root.daily.attempts.length>LIMITS.attempts||root.daily.visits>LIMITS.visits||
  root.goals.length>LIMITS.goals||root.projects.length>LIMITS.projects)return 'malformed-or-bounds';
 if(!text(root.location)||!(root.focus===null||plain(root.focus))||!text(root.guard.reason)||!Number.isFinite(root.guard.until)||
  !root.goals.every(g=>object(g)&&text(g.id))||!root.projects.every(p=>object(p)&&text(p.id))||
  !root.daily.events.every(e=>object(e)&&text(e.key)&&rawOK(e.raw)&&originOK(e.origin)&&(e.origin===null||e.key===e.origin.eventId))||
  !root.daily.attempts.every(a=>object(a)&&text(a.id)&&a.id.startsWith(root.id+'/'+root.dayEpoch+'/'))||
  !['nextGoal','nextProject'].every(k=>Number.isSafeInteger(root[k])&&root[k]>=0)||
  !['participated','retiredGoals','retiredProjects'].every(k=>Number.isSafeInteger(root.progress[k])&&root.progress[k]>=0)||
  root.nextGoal!==root.goals.length+root.progress.retiredGoals||root.nextProject!==root.projects.length+root.progress.retiredProjects||
  new Set(root.goals.map(g=>g.id)).size!==root.goals.length||new Set(root.projects.map(p=>p.id)).size!==root.projects.length||
  !root.goals.every(g=>g.id.startsWith(root.id+'/goals/')&&/^[1-9]\d*$/.test(g.id.split('/').at(-1))&&Number(g.id.split('/').at(-1))<=root.nextGoal)||
  !root.projects.every(p=>p.id.startsWith(root.id+'/projects/')&&/^[1-9]\d*$/.test(p.id.split('/').at(-1))&&Number(p.id.split('/').at(-1))<=root.nextProject)||
  new Set(root.daily.events.map(e=>e.key)).size!==root.daily.events.length||
  new Set(root.daily.attempts.map(a=>a.id)).size!==root.daily.attempts.length||
  !root.daily.events.every(e=>text(e.key)&&plain(e.raw)&&(e.origin===null||plain(e.origin)))||
  !root.daily.attempts.every(a=>text(a.id)&&a.dayEpoch===root.dayEpoch&&['snapshot','prepared','dispatching','settled'].includes(a.status))||
  !root.goals.every(g=>text(g.id)&&['unfinished','completed','abandoned'].includes(g.status))||
  !root.projects.every(p=>text(p.id)&&['unfinished','completed','abandoned'].includes(p.status)))return 'malformed-entries';
 return 'valid';
}

/** port.snapshot(): validated host projection + learner record; port.binding(): live
 * epoch; port.commit(expected, root, lifecycleMeta): typed single-root transaction,
 * returning actual-shaped {outcome,acknowledged}. Probe supplies an in-memory port. */
export function createLifecycle({port,device,buildId,core,clock,enabled,validateCapture}){
 insist(text(buildId),'build-identity-required');
 let on=enabled===true, owner=cp(port.binding()),root=null,phase='closed',holdUntil=-Infinity,lastNow=clock();
 let generation=null,activation=null,offDay=null,diagnostics=[],holdEpoch=0;
 const helpTickets=new WeakMap(),snapshots=new WeakMap(),preparations=new WeakMap(),dispatches=new WeakMap(),completions=new WeakMap();
 let bootToken=null,pendingByGoal=new Map();
 const dayEnd=t=>core.endOfDay(new Date(t));
 const current=()=>port.snapshot();
 const quality=s=>{const q=classify(s);return q==='valid'&&!s.daily.events.every(e=>
  (e.raw.about==null||core.validItem(e.raw.about))&&(e.raw.at==null||Number.isFinite(e.raw.at)))?'malformed-raw':q;};
 const owns=()=>same(owner,port.binding());
 const inspect=()=>({phase,on,holdUntil,root:root&&cp(root),diagnostics:cp(diagnostics)});
 const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&dayKey(new Date(d+'T12:00:00').getTime())===d;
 const markerEnd=d=>dayEnd(new Date(d+'T12:00:00').getTime());
 function markOff(){const day=dayKey(clock());if(day===offDay)return;
  try{const prior=device.read(MARKERS.off),target=validDay(prior)&&prior>day?prior:day;
   insist(device.write(MARKERS.off,target)===true,'device-write-failed');offDay=day;}
  catch{diagnostics.push('off-marker-unavailable');}
 }
 function markHold(reason){try{const prior=device.read(MARKERS.hold),day=dayKey(Math.max(clock(),holdUntil));
   if(prior&&validDay(prior.day)&&prior.day>day)return true; // never shorten future doubt
   return device.write(MARKERS.hold,{day,journeyId:root?.id??'unavailable',reason})===true;}
  catch{return false;}}
 function witnesses(){
  let off,hold;try{off=device.read(MARKERS.off);hold=device.read(MARKERS.hold);}catch{return {doubt:'device-read-unavailable'};}
  if(off!==undefined&&!validDay(off))return {doubt:'off-marker-invalid'};
  if(hold!==undefined&&(!object(hold)||!validDay(hold.day)||!text(hold.journeyId)||!text(hold.reason)))return {doubt:'hold-marker-invalid'};
  const today=dayKey(clock());
  if(off&&off>=today)return {doubt:off===today?'off-day':'clock-reversal',until:Math.max(markerEnd(off),hold&&validDay(hold.day)?markerEnd(hold.day):-Infinity)};
  if(hold&&hold.day>=today)return {doubt:hold.day===today?'help-write-hold':'clock-reversal',until:markerEnd(hold.day)};
  return {expiredHold:hold!==undefined};
 }
 function clearRetiredHold(){const w=witnesses();if(w.expiredHold){try{insist(device.remove(MARKERS.hold)===true,'device-clear-failed');}catch{diagnostics.push('hold-marker-clear-unavailable');}}}
 function held(reason,until=dayEnd(clock())){phase=reason;holdUntil=Math.max(holdUntil,until);holdEpoch++;return inspect();}
 function* write(next,action,{control=false,observe=null}={}){
  insist(on,'switch-off');insist(owns(),'owner-epoch');
  const before=current(),auth=authority(before);
  insist(auth.generation===generation,'generation-changed');
  next.lastWriterBuild=buildId;
  insist(classify(next)==='valid','root-invalid');
  insist(bytes(next)<=(control?LIMITS.bytes:LIMITS.dataBytes),'byte-bound');
  const sent=cp(next),result=yield port.commit({revision:before.revision,rootHash:digest(before.record.m4Journey??null),
   generation,epoch:owner.epoch,switchOn:on},sent,{action,generation,journeyId:next.id});
  // M4 S1 (W5 1750): this call's own observer sees its port result before the unchanged boolean below
  if(typeof observe==='function')try{observe(freeze({action,outcome:result?.outcome??null,acknowledged:result?.acknowledged===true,
   rootHash:result?.rootHash??null,proposedHash:digest(sent)}));}catch{}
  if(result.outcome==='published'&&result.acknowledged===true){root=cp(current().record.m4Journey);return true;}
  held('publication-hold');return false;
 }
 function nextRoot(){const s=current();insist(classify(s.record.m4Journey)==='valid','root-unavailable');
  insist(s.record.m4Journey.generation===generation,'generation-changed');
  insist(s.record.m4Journey.revision===root.revision,'stale-root');return {...cp(root),revision:root.revision+1};}
 function fresh(auth,retired=null){return {version:1,protocol:'journey-r2',lastWriterBuild:buildId,id:port.nextId(),generation:auth.generation,revision:1,
  dayEpoch:1,dayEnd:dayEnd(clock()),location:'reading',focus:null,goals:[],projects:[],nextGoal:0,nextProject:0,
  daily:{events:[],attempts:[],visits:0},guard:{reason:'cold-activation',until:dayEnd(clock())},
  progress:{participated:0,retiredGoals:0,retiredProjects:0},lastRetired:null,retired};}
 function rotate(next){
  next.lastRetired={dayEpoch:next.dayEpoch,dayEnd:next.dayEnd,events:next.daily.events.length,
   attempts:next.daily.attempts.length,uncertain:next.daily.attempts.filter(a=>a.status==='dispatching').length,
   expired:next.daily.attempts.filter(a=>['snapshot','prepared'].includes(a.status)).length,lateSettled:0};
  next.dayEpoch++;next.dayEnd=dayEnd(clock());next.daily={events:[],attempts:[],visits:0};
  // Location, focus, goals, projects and coarse progress carry on unchanged.
  return next;
 }
 function* boot(){
  owner=cp(port.binding());activation=Object.freeze({});bootToken=Object.freeze({});pendingByGoal=new Map();
  phase='closed';holdUntil=-Infinity;lastNow=clock();diagnostics=[];
  const s=current();let auth;
  const rootQuality=quality(s.record.m4Journey);root=s.record.m4Journey===undefined?null:cp(s.record.m4Journey);
  // OFF never uses this root to grade: diagnostics only, exact a8 page ledger.
  if(!on){if(!['absent','valid'].includes(rootQuality))diagnostics.push('invalid-journey-root');markOff();phase='off-page-ledger';return inspect();}
  try{auth=authority(s);}catch{return held('authority-unavailable');}
  generation=auth.generation;
  // P4 precedes a5: malformed/future/oversize import cannot be laundered by retirement.
  if(!['absent','valid'].includes(rootQuality))return held('invalid-root-hold');
  if(rootQuality==='absent'){
   if(auth.everCreated)return held('missing-root-hold');
   root=fresh(auth);if(!(yield* write(root,'bootstrap',{control:true})))return inspect();
   return held('cold-activation');
  }
  const activated=auth.activated.some(r=>r.journey?.journeyId===root.id);
  if(root.generation!==generation||!activated){
   if(!auth.latestRestore)return held('unowned-root-hold');
   // The valid imported root was already published intact by restore. Retire only
   // AFTER its confirmed receipt; keep its hash/identity in the new root + receipt.
   root=fresh(auth,{id:root.id,generation:root.generation,hash:digest(root),restore:auth.latestRestore.changeId});
   if(!(yield* write(root,'retire-generation',{control:true})))return inspect();
   return held('cold-activation');
  }
  if(root.dayEnd>dayEnd(clock())){yield* hold('clock-reversal',Math.max(root.dayEnd,root.guard.until));return inspect();}
  const witness=witnesses();
  if(witness.doubt){yield* hold(witness.doubt,witness.until);return inspect();}
  if(root.lastWriterBuild!==buildId){yield* hold('build-changed');return inspect();}
  if(root.guard.reason!=='clear'&&clock()<=root.guard.until)return held(root.guard.reason,root.guard.until);
  // Clean cold activation resumes immediately; a past hold/day rotates normally.
  phase='active';holdUntil=-Infinity;yield* tick();return inspect();
 }
 function* setSwitch(value){if(on===(value===true))return inspect();on=value===true;return yield* boot();}
 function* tick(){
  if(!on){markOff();return inspect();}if(!owns())return held('owner-epoch');
  if(clock()<lastNow){yield* hold('clock-reversal',Math.max(holdUntil,root?.dayEnd??dayEnd(lastNow)));return inspect();}
  lastNow=clock();
  if(!root||classify(root)!=='valid'||['missing-root-hold','invalid-root-hold','unowned-root-hold','authority-unavailable'].includes(phase))return inspect();
  reconcile();
  // An expired review day retires normally, including after a clean cold start.
  if(clock()>root.dayEnd&&clock()>holdUntil){
   try{const witness=witnesses();if(witness.doubt){yield* hold(witness.doubt,witness.until);return inspect();}
    const next=rotate(nextRoot());next.guard={reason:'clear',until:0};const holds=holdEpoch;
    if(yield* write(next,'rotate',{control:true})){if(holdEpoch===holds){phase='active';holdUntil=-Infinity;}activation=Object.freeze({});clearRetiredHold();}
   }catch{return held('root-sync-hold');}
  }
  return inspect();
 }
 function* usable(){yield* tick();insist(on,'switch-off');insist(owns(),'owner-epoch');
  insist(root&&classify(root)==='valid'&&!['missing-root-hold','invalid-root-hold','unowned-root-hold','authority-unavailable'].includes(phase),'root-unavailable');
  const a=authority(current());insist(a.generation===generation,'generation-changed');
  insist(current().record.m4Journey?.revision===root.revision,'stale-root');
  const witness=witnesses();if(phase==='active'&&witness.doubt)yield* hold(witness.doubt,witness.until);}
 function* reviewable(){yield* usable();insist(phase==='active'&&clock()>holdUntil,'day-hold');}
 function* change(action,fn,{shrinkingControl=false,observe=null}={}){yield* usable();const next=nextRoot();fn(next);
  insist((yield* write(next,action,{control:shrinkingControl&&bytes(next)<bytes(root),observe})),'publication-hold');return inspect();}
 function* hold(reason,until=dayEnd(clock())){
  held(reason,until);if(on&&owns()){
   if(!markHold(reason))diagnostics.push('hold-marker-unavailable');
   if(root&&classify(root)==='valid')try{const next=nextRoot();next.guard={reason,until:holdUntil};yield* write(next,'hold',{control:true});}catch{/* dual-store failure is accepted residual r2 */}
  }
 }
 /** §7.8 (W5 1441): the hold behind a held display is set at once (runtime and W-hold); the root guard stays best effort and is
  * queued behind whatever write is pending, so storage never delays the display */
 function holdForDisplay(reason){held(reason);if(on&&owns()){if(!markHold(reason))diagnostics.push('hold-marker-unavailable');run(()=>guardRoot(reason));}}
 function* guardRoot(reason){if(!on||!owns()||!root||classify(root)!=='valid')return;
  try{const next=nextRoot();next.guard={reason,until:holdUntil};yield* write(next,'hold',{control:true});}catch{/* dual-store failure is accepted residual r2 */}}
 /** the display owner's 300 ms deadline, outside the operation queue: the capture's ticket (or, before it has one, the request) is
  * shown once, held; its completion stays data only */
 function holdAtDeadline(token){const t=token?helpTickets.get(token):null;
  if(t?.shown)return {display:false,late:true,phase};if(t){t.done=true;t.shown=true;}
  if(!on||!owns()||(t&&(!same(t.owner,owner)||t.generation!==generation)))return {display:false,late:true,phase};
  holdForDisplay('help-write-hold');return {display:true,held:true,phase};}
 /** F6 (lead 1443): a cache left behind by a late acknowledgement is reconciled from the host's validated authority, only for the
  * same owner (tick checks it), generation and journey. Holds and markers stay as they are, and no ticket, snapshot or
  * preparation revives: their tokens bind the activation and day they were made in */
 function reconcile(){const s=current();let auth;try{auth=authority(s);}catch{return;}const host=s.record.m4Journey;
  if(auth.generation===generation&&classify(host)==='valid'&&host.id===root.id&&host.generation===generation&&host.revision>root.revision)root=cp(host);}
 function* enter(entrance,{observe=null}={}){return yield* change('visit',s=>{insist(s.daily.visits<LIMITS.visits,'visit-bound');s.daily.visits++;s.location=entrance;},{observe});}
 function* work(kind,data,{observe=null,admit=null}={}){insist(['goals','projects'].includes(kind),'work-kind');return yield* change('work',s=>{
  // M4 (W5 1901 F3): the caller's own recheck runs inside the queued mutation, against the root this write would replace
  if(typeof admit==='function')admit(freeze(cp(s)));
  insist(plain(data)&&s[kind].length<LIMITS[kind],'work-bound');
  const key=kind==='goals'?'nextGoal':'nextProject';insist(Number.isSafeInteger(s[key]+1),'identity-exhausted');
  s[key]++;s[kind].push({...cp(data),id:s.id+'/'+kind+'/'+s[key],status:data.status??'unfinished'});
 },{observe});}
 function* retire(kind,id,decision,{observe=null}={}){return yield* change('retire-work',s=>{
  insist(['goals','projects'].includes(kind),'work-kind');const i=s[kind].findIndex(v=>v.id===id);insist(i>=0,'work-missing');
  insist(decision==='retire-completed'&&s[kind][i].status==='completed'||decision==='abandon-and-retire','explicit-retirement');
  s[kind].splice(i,1);s.progress[kind==='goals'?'retiredGoals':'retiredProjects']++;
 },{shrinkingControl:true,observe});}
 /** M4 (W5 1901): an attempted goal write that stays unconfirmed holds this runtime, as an unpublished commit does; nothing persists */
 function holdUnconfirmed(){if(on&&owns())held('publication-hold');return inspect();}
 /** M4 S1 (W5 1746/1750): the quest adapter's proof that a bound Reading run qualified. Opaque and held here, one pending per
  * goal; only boot() resets them, so a reload or a switch never revives one */
 function completionTicket(goalId,practiceSession,seed){
  insist(on,'switch-off');insist(owns(),'owner-epoch');
  insist(root&&classify(root)==='valid'&&!['missing-root-hold','invalid-root-hold','unowned-root-hold','authority-unavailable'].includes(phase),'root-unavailable');
  const goal=root.goals.find(g=>g.id===goalId);insist(goal,'work-missing');
  insist(goal.status==='unfinished'&&plain(seed)&&same(goal.seed,seed)&&text(practiceSession),'completion-mismatch');
  const prior=pendingByGoal.get(goalId);insist(!prior||completions.get(prior)?.state==='refused','completion-pending');
  const ticket=Object.freeze({});
  completions.set(ticket,{goalId,practiceSession,seed:cp(seed),boot:bootToken,generation,journeyId:root.id,owner:cp(owner),state:'minted'});
  pendingByGoal.set(goalId,ticket);return ticket;
 }
 /** the goal's one status change, under the existing work action. Done needs the bridge's own exact-root acknowledgement */
 function* completeGoal(goalId,ticket,{observe=null}={}){
  const t=completions.get(ticket),bound=()=>t.boot===bootToken&&t.generation===generation&&same(t.owner,owner)&&t.journeyId===root?.id;
  insist(t&&t.goalId===goalId&&bound(),'stale-completion');insist(t.state==='minted'||t.state==='refused','completion-pending');
  yield* usable();insist(bound(),'stale-completion');
  const goal=root.goals.find(g=>g.id===goalId);insist(goal,'work-missing');
  if(goal.status==='completed'){t.state='settled';return {write:false,alreadyCompleted:true,phase};}
  let seen=null;t.state='submitting';
  try{yield* change('work',s=>{const g=s.goals.find(x=>x.id===goalId);
    insist(g&&g.status==='unfinished'&&same(g.seed,t.seed),'completion-mismatch');g.status='completed';g.practiceSession=t.practiceSession;},
   {observe:r=>{seen=r;if(typeof observe==='function')observe(r);}});}
  catch(error){t.state=seen?.outcome==='uncertain'?'uncertain':'refused';throw error;}
  const confirmed=seen?.outcome==='published'&&seen.acknowledged===true&&seen.rootHash===seen.proposedHash&&
   digest(root)===seen.proposedHash&&owns()&&root.goals.find(g=>g.id===goalId)?.status==='completed';
  if(!confirmed){t.state='uncertain';held('publication-hold');return {write:true,confirmed:false,phase};}
  t.state='published';return {write:true,confirmed:true,phase};
 }
 function* beginHelp(entries){yield* usable();
  const token=Object.freeze({}),t={activation,owner:cp(owner),generation,dayEpoch:root.dayEpoch,started:clock(),done:false};
  helpTickets.set(token,t);
  try{
   const accepted=validateCapture(entries);insist(Array.isArray(accepted)&&Object.isFrozen(accepted)&&plain(accepted),'capture-invalid');const next=nextRoot();
   next.lastWriterBuild=buildId;
   for(const e of accepted){const key=e.origin?.eventId??e.receiptKey,prior=next.daily.events.find(x=>x.key===key),event={key,raw:cp(e.raw),origin:cp(e.origin)};
    insist(!prior||same(prior,event),'event-conflict');if(!prior){insist(next.daily.events.length<LIMITS.events,'event-bound');next.daily.events.push(event);}}
   insist(classify(next)==='valid'&&bytes(next)<=LIMITS.dataBytes,'byte-bound');
   const s=current();t.proposedHash=digest(next);
   // One exact queued write owns this ticket. The host checks this gate again at
   // its producer/commit boundary; completion never starts another help write.
   t.operation=port.submit({revision:s.revision,rootHash:digest(s.record.m4Journey),generation,epoch:owner.epoch},next,
    {action:'help',generation,journeyId:root.id},()=>on&&owns()&&t.activation===activation&&clock()<=root.dayEnd&&!t.done);
  }catch(error){t.preflight=error.message;}
  return token;
 }
 function* finishHelp(token){
  const t=helpTickets.get(token);insist(t,'unknown-capture');
  // All late acknowledgements are data only. They cannot clear a hold or write
  // after OFF, changed ownership, retirement or timeout.
  if(t.done)return {display:false,late:true,phase};
  if(!on||!owns()||!same(t.owner,owner)||t.generation!==generation){t.done=true;t.shown=true;return {display:false,late:true,phase};}
  const result=t.operation?port.completion(t.operation):null;
  if(result?.outcome==='published'&&classify(current().record.m4Journey)==='valid'&&
   digest(current().record.m4Journey)===t.proposedHash)root=cp(current().record.m4Journey);
  if(t.activation!==activation||t.dayEpoch!==root?.dayEpoch||clock()>root.dayEnd){
   t.done=true;yield* tick();if(t.shown)return {display:false,late:true,phase};
   t.shown=true;holdForDisplay('late-help-current-day');return {display:true,held:true,phase};
  }
  if(!t.preflight&&!result&&clock()-t.started<300)return {display:false,pending:true};
  t.done=true;
  if(result?.outcome==='published'&&classify(current().record.m4Journey)==='valid')root=cp(current().record.m4Journey);
  if(t.preflight||clock()-t.started>=300||result?.outcome!=='published'||result.acknowledged!==true||
    result.rootHash!==t.proposedHash||digest(root)!==t.proposedHash){t.shown=true;holdForDisplay('help-write-hold');return {display:true,held:true,phase};}
  t.shown=true;return {display:true,held:phase!=='active',accepted:true};
 }
 function* beforeAnswer(id){yield* reviewable();insist(text(id)&&id.startsWith(root.id+'/'+root.dayEpoch+'/'),'attempt-namespace');
  const token=Object.freeze({});yield* change('snapshot',s=>{insist(s.daily.attempts.length<LIMITS.attempts,'attempt-bound');
   insist(!s.daily.attempts.some(a=>a.id===id),'attempt-once');s.daily.attempts.push({id,dayEpoch:s.dayEpoch,status:'snapshot'});});
  snapshots.set(token,{id,activation,dayEpoch:root.dayEpoch,events:freeze(cp(root.daily.events))});return token;}
 function* prepare(token,raw,rule){yield* reviewable();const t=snapshots.get(token);
  insist(t&&t.activation===activation&&t.dayEpoch===root.dayEpoch,'stale-snapshot');
  const rec=root.daily.attempts.find(a=>a.id===t.id);insist(rec?.status==='snapshot','attempt-once');
  const source={...cp(raw),help:t.events.map(e=>cp(e.raw))},context={attemptId:t.id,sessionId:root.id+'/'+root.dayEpoch,origins:t.events.map(e=>cp(e.origin))};
  const details=freeze({id:t.id,dayEpoch:root.dayEpoch,raw:source,context,candidate:rule.labelCandidate(source,context)});
  yield* change('prepare',s=>{s.daily.attempts.find(a=>a.id===t.id).status='prepared';s.progress.participated++;});
  preparations.set(details,{activation,policy:rule.policy,rule});
  return details;
 }
 function* reserve(prepared){yield* reviewable();const custody=preparations.get(prepared);
  insist(custody&&custody.activation===activation&&prepared.candidate.helpRelevance?.policy===custody.policy&&
   custody.rule.assertPreserved(prepared.raw,prepared.context,prepared.candidate)===true,'preparation-custody');
  const rec=root.daily.attempts.find(a=>a.id===prepared.id);
  insist(prepared.dayEpoch===root.dayEpoch&&rec?.status==='prepared','stale-preparation');
  yield* change('dispatch',s=>{s.daily.attempts.find(a=>a.id===prepared.id).status='dispatching';});
  const token=Object.freeze({});dispatches.set(token,{id:prepared.id,dayEpoch:root.dayEpoch,generation,owner:cp(owner),admitted:false,settled:false});return token;
 }
 // Proposed extra W4 admission binding; called INSIDE its existing lock. This
 // probe calls no hook. A persisted dispatch mark alone is not an admission.
 function admitAtLock(token){const t=dispatches.get(token);
  // Read-only: day rollover and every journey write stay OUTSIDE the hook lock.
  insist(on&&owns()&&phase==='active'&&clock()>=lastNow&&clock()>holdUntil&&clock()<=root.dayEnd,'lock-day-hold');
  insist(!witnesses().doubt,'lock-witness-hold');
  insist(authority(current()).generation===generation&&current().record.m4Journey?.revision===root.revision,'lock-owner-root');
  insist(t&&t.dayEpoch===root.dayEpoch&&t.generation===generation&&same(t.owner,owner)&&!t.admitted,'stale-dispatch');t.admitted=true;return true;}
 function* settle(token,outcome){const t=dispatches.get(token);
  insist(t&&t.admitted&&!t.settled&&typeof outcome?.write==='boolean','settlement');t.settled=true;
  if(!on||!owns()||!same(t.owner,owner)||t.generation!==generation)return {ignored:true};
  yield* tick();if(t.dayEpoch!==root.dayEpoch){
   // Only bounded retired-day summary changes; never reconstitute old daily data.
   if(root.lastRetired?.dayEpoch===t.dayEpoch)yield* change('late-settlement',s=>{s.lastRetired.lateSettled++;});
   return {late:true};
  }
  yield* change('settlement',s=>{const rec=s.daily.attempts.find(a=>a.id===t.id);insist(rec?.status==='dispatching','settlement');rec.status='settled';rec.outcome=cp(outcome);});
  return {late:false};
 }
 // One operation at a time: an operation started while an asynchronous one is in flight waits for it.
 let chain=null;
 function run(start){
  const go=()=>drive(start());
  if(!chain){const value=go();if(thenable(value))track(value);return value;}
  const queued=chain.then(go,go);track(queued);return queued;
 }
 function track(promise){const settled=promise.then(()=>{},()=>{});chain=settled;settled.then(()=>{if(chain===settled)chain=null;});}
 const op=fn=>(...args)=>run(()=>fn(...args));
 /** product display wait: the help's own acknowledgement or its 300 ms, whichever comes first (port.wait) */
 async function awaitHelp(token){const t=helpTickets.get(token);insist(t,'unknown-capture');
  const left=()=>Math.max(0,300-(clock()-t.started)),deadline=Symbol('deadline');
  for(;;){const step=run(()=>finishHelp(token));
   const result=thenable(step)?await Promise.race([step,new Promise(resolve=>setTimeout(()=>resolve(deadline),left()))]):step;
   if(result===deadline)return holdAtDeadline(token);
   if(!result.pending)return result;
   await port.wait(t.operation,left());}}
 const ready=run(boot);
 return {ready,inspect,boot:op(boot),setSwitch:op(setSwitch),tick:op(tick),enter:op(enter),work:op(work),retire:op(retire),
  completionTicket,completeGoal:op(completeGoal),holdUnconfirmed,
  beginHelp:op(beginHelp),finishHelp:op(finishHelp),awaitHelp,holdAtDeadline,beforeAnswer:op(beforeAnswer),prepare:op(prepare),reserve:op(reserve),
  admitAtLock,settle:op(settle),assertReviewable:op(reviewable),namespace:()=>root.id+'/'+root.dayEpoch+'/'};
}

/** The record host as the lifecycle's port (rev 3.2 §7.2). Reads are the host's last confirmed journey authority. A commit is
 * one typed journey write through the app's queue, with the root's hash and the generation as its precondition (the model's
 * expected.revision is not one: an ordinary grade between journey writes moves nothing). It is published only when that exact
 * root was acknowledged; a durable but unconfirmed commit is uncertain; anything else was not published. The owner epoch, and
 * a capture's own gate, are asked again at the host's commit boundary */
export function recordPort({app,binding,nextId}){
 const result=outcome=>outcome?.status==='active'&&['committed','duplicate'].includes(outcome.receipt?.outcome)&&
  outcome.receipt.type==='journey.lifecycle/1'&&typeof outcome.journey?.rootSha256==='string'
  ?{outcome:'published',acknowledged:true,rootHash:outcome.journey.rootSha256}
  :{outcome:outcome?.targetCommitDurable===true?'uncertain':'not-published',acknowledged:false};
 const commit=(expected,next,meta,gate=()=>true)=>Promise.resolve().then(()=>app.commitJourney({
  expected:{rootSha256:expected.rootHash,generation:expected.generation},root:next,journey:{action:meta.action,journeyId:meta.journeyId}},
  ()=>binding().epoch===expected.epoch&&gate()===true)).then(result,()=>({outcome:'not-published',acknowledged:false}));
 return {snapshot:()=>app.journeyAuthority(),binding,nextId,commit,
  submit(expected,next,meta,gate){const op={result:null};op.done=commit(expected,next,meta,gate).then(r=>{op.result=r;});return op;},
  completion:op=>op.result,
  wait:(op,ms)=>Promise.race([op.done,new Promise(resolve=>setTimeout(resolve,ms))])};
}
