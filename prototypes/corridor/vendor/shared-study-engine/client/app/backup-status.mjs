/** Read-only observed backup attempts. This never starts a job or inspects study history. */
const CODES=new Set(['export-too-large','authentication-required','credential-storage-failed','network-failed','retry-later','server-failed','invalid-response','export-failed','backup-validation-failed','backup-write-failed','backup-timeout','backup-interrupted','backup-status-unavailable','backup-busy']);
const fail=()=>{throw Error('backup-status-unavailable');};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===keys.slice().sort().join('|');
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const hex=(value,n)=>typeof value==='string'&&new RegExp(`^[a-f0-9]{${n}}$`).test(value);
const code=value=>CODES.has(value.code)&&(value.code==='export-too-large'?value.httpStatus===413:value.httpStatus===null);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function validateBackupStatus(input){
 if(input===null)return null;
 let text,value;try{text=JSON.stringify(input);if(typeof text!=='string'||new TextEncoder().encode(text).length>16384)fail();value=JSON.parse(text);}catch{fail();}
 if(!exact(value,['format','scope','attempt','lastFailure','lastSuccess','observation'])||value.format!=='nsrs-backup-status/v1'||!exact(value.scope,['origin','environment','learner']))fail();
 const s=value.scope;let origin;try{origin=new URL(s.origin);}catch{fail();}
 if(!['https:','http:'].includes(origin.protocol)||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||origin.origin!==s.origin||!['prod','dev'].includes(s.environment)||typeof s.learner!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(s.learner)||/^nsrs_/i.test(s.learner))fail();
 const a=value.attempt,f=value.lastFailure,p=value.lastSuccess;
 if(!exact(a,['id','startedAt','finishedAt','state','code','httpStatus','expectedTargets','completedTargets'])||!hex(a.id,32)||!integer(a.startedAt)||!['running','failed','completed'].includes(a.state)||!integer(a.expectedTargets,1,8)||!integer(a.completedTargets,0,a.expectedTargets)||(a.state==='running'?a.finishedAt!==null:!integer(a.finishedAt))||(a.state==='failed'?!code(a):a.code!==null||a.httpStatus!==null)||(a.state==='completed'&&a.completedTargets!==a.expectedTargets))fail();
 if(f!==null&&(!exact(f,['attemptId','finishedAt','code','httpStatus'])||!hex(f.attemptId,32)||!integer(f.finishedAt)||!code(f)))fail();
 if(p!==null&&(!exact(p,['attemptId','finishedAt','head','fileSha256','fingerprint','targets'])||!hex(p.attemptId,32)||!integer(p.finishedAt)||!integer(p.head)||!hex(p.fileSha256,64)||!hex(p.fingerprint,64)||!integer(p.targets,1,8)))fail();
 if(a.state==='failed'&&(!f||f.attemptId!==a.id||f.finishedAt!==a.finishedAt||f.code!==a.code||f.httpStatus!==a.httpStatus))fail();
 if(a.state==='completed'&&(f!==null||!p||p.attemptId!==a.id||p.finishedAt!==a.finishedAt||p.targets!==a.completedTargets))fail();
 if(a.state==='running'?!['running','interrupted'].includes(value.observation):value.observation!==a.state)fail();
 return freeze(value);
}
/** A single in-flight filesystem observation, independent of grade/status work.
 * Hidden/disposed generations cannot paint. Only observed completion clears a
 * known failure; ordinary sync, missing metadata and read failure cannot. */
export function createBackupStatusObserver({read,isVisible=()=>true,onChange=()=>{},schedule=setTimeout,cancel=clearTimeout}={}){
 let state=freeze({record:null,failure:null,unavailable:false}),disposed=false,generation=0,timer=null,pending=null;
 const capable=typeof read==='function';
 const clear=()=>{if(timer!==null)cancel(timer);timer=null;};
 const later=()=>{clear();if(capable&&!disposed&&isVisible())timer=schedule(()=>{timer=null;wake();},10000);};
 async function wake(){
  clear();if(!capable||disposed)return;
  if(!isVisible()){generation++;return;}
  if(pending)return pending;
  const token=++generation;
  pending=(async()=>{
   try{
    const record=validateBackupStatus(await Promise.resolve().then(read));
    if(disposed||token!==generation||!isVisible())return;
    const known=record?.lastFailure?{code:record.lastFailure.code,httpStatus:record.lastFailure.httpStatus}:null;
    const failure=record?.observation==='completed'?null:known??state.failure??(record?.observation==='interrupted'?{code:'backup-interrupted',httpStatus:null}:null);
    state=freeze({record,failure,unavailable:record===null&&state.failure!==null});onChange(state);
   }catch{
    if(disposed||token!==generation||!isVisible())return;
    state=freeze({...state,unavailable:true});onChange(state);
   }finally{pending=null;later();}
  })();return pending;
 }
 return Object.freeze({start:wake,wake,read:()=>state,dispose(){disposed=true;generation++;clear();}});
}
