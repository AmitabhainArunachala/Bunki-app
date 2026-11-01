import{contentReady}from'../player/content-ready.mjs';
const HASH=/^[a-f0-9]{64}$/,ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const identifier=value=>typeof value==='string'&&ID.test(value);
const state=(kind,label,extra={})=>Object.freeze({kind,label,taskKey:null,...extra});
const pending=()=>state('unknown','依頼状況は未確認');
const policyReasons=Object.freeze({
 'audit-not-approved':'内容監査で承認されていません',
 'audit-translation-not-approved':'英訳の内容監査で承認されていません',
 'audit-receipt-binding':'内容監査の記録を確認できません',
 'stage-provider-or-receipt-binding':'生成段階の記録を確認できません',
 'reading-not-kana':'読みがかなではありません',
 'dictionary-reading-disagreement':'辞書と読みが一致しません',
 'passage-form-missing':'例文に対象の言葉がありません',
 'passage-sentence-count':'例文の文数を確認してください',
 'passage-english-empty':'例文の英訳がありません',
 'passage-english-has-japanese':'例文の英訳に日本語が含まれます',
 'definition-empty':'日本語の定義がありません',
 'definition-has-english':'日本語の定義に英字が含まれます',
 'meaning-empty':'英語の意味がありません',
 'collocations-empty':'よく使う組み合わせがありません',
 'existing-card':'既存のカードがあります',
 'pii-pattern':'個人情報の確認が必要です',
 'profanity-list':'表現の確認が必要です',
 'packet-hash-binding':'生成内容の照合が必要です',
 'master-hash-binding':'元のカード集との照合が必要です',
 'queue-card-identity':'カードの識別子を確認できません',
 'card-shape':'カードの形式を確認してください',
 'passage-shape':'例文の形式を確認してください',
 'packet-shape':'生成内容の形式を確認してください',
 'calibration-semantic-review-required':'最初の3枚は内容の確認待ちです'
});
function heldReason(reply){
 if(reply.reason==='daily-job-cap'||reply.jobReason==='daily-job-cap')return '今日の作成上限に達しました';
 const raw=reply.jobReason;
 if(typeof raw!=='string'||!raw.startsWith('policy:')||raw.length>2048)return null;
 const codes=raw.slice(7).split(',');
 if(!codes.length||codes.length>32||codes.some(code=>!/^[a-z-]{1,60}$/.test(code)))return '確認理由を読み取れません';
 const labels=codes.map(code=>policyReasons[code]||'確認理由を読み取れません');
 const distinct=[...new Set(labels)];
 return [...distinct.slice(0,3),...(distinct.length>3?[`ほか${distinct.length-3}件`]:[])].join(' · ');
}
/** Match the native request reconstructed from the durable capture. No guessed reading. */
export function factoryRequest(result,capture,{learner,source}={}){
 if(result?.kind!=='durable'||typeof result.eventId!=='string'||!Number.isFinite(result.eventTs)||
   typeof learner!=='string'||typeof capture?.surface!=='string'||!['tap','typed'].includes(source))throw Error('factory-request-without-durable-capture');
 const request={captureEventId:result.eventId,learner,surface:capture.surface,capturedAt:new Date(result.eventTs).toISOString(),source};
 for(const key of ['lemma','reading','contextTaskKey','contentRevision'])if(capture[key])request[key]=capture[key];
 if(source==='typed'&&typeof capture.source?.context==='string'&&capture.source.context)request.context=capture.source.context;
 return Object.freeze(request);
}
/** Native Ready is a device claim; a matching, renderable local task is also required. */
export function factoryStatus(reply,captureId,{catalog,projection}={}){
 if(!reply||reply.captureEventId!==captureId||typeof reply.status!=='string')return pending();
 if(reply.status==='ready'){
  const entry=catalog?.find(e=>e.taskKey===reply.taskKey),task=projection?.tasks?.[reply.taskKey];
  if(reply.ready!==true||!identifier(reply.jobId)||!identifier(reply.contentVersion)||!HASH.test(reply.deviceReceiptSha256)||!HASH.test(reply.contentRevision)||!entry||!task||!contentReady(entry)||entry.contractId!=='vocabulary.read.v1'||entry.noteGuid!==task.noteGuid||entry.passageId!==task.passageId||entry.contractId!==task.contract||entry.contentRevision!==reply.contentRevision||task.contentRevision!==reply.contentRevision)return pending();
  return state('ready','この端末で学べます',{taskKey:entry.taskKey});
 }
 if(reply.ready===true||!['unknown','queued','joined','already-card','held','ignored','staged-awaiting-gate','staged-awaiting-independent-gate','failed'].includes(reply.status))return pending();
 if(['queued','joined'].includes(reply.status)&&!identifier(reply.jobId))return pending();
 const stage=reply.jobStatus||reply.status;
 if(['staged-awaiting-gate','staged-awaiting-independent-gate'].includes(stage))return state('review','校閲・受け取り待ち',{reasonLabel:heldReason(reply)});
 if(stage==='failed')return state('failed','作成できませんでした');
 if(stage==='delivered')return state('review','この端末への受け取り確認待ち');
 if(stage==='held'||reply.status==='held')return state('held',reply.reason==='daily-job-cap'?'今日の作成上限に達しました':'校閲待ち',{reasonLabel:heldReason(reply)});
 if(['queued','joined'].includes(reply.status))return state('queued','作成待ち');
 if(reply.status==='already-card')return state('existing','既存のカードがあります');
 if(reply.status==='ignored')return state('ignored','作成対象外として記録');
 return pending();
}
/** Read-only inspection: visible refreshes plus all-unknown reconciliation, with bounded concurrency. */
export function createFactoryStatusReader({inspect,catalog,getProjection,onUpdate=()=>{},limit=20,concurrency=2,timeoutMs=10000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(concurrency)||concurrency<1||concurrency>4||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('invalid-factory-inspection-config');
 const records=new Map(),work=new Map();let generation=0,disposed=false,queue=[],active=0;
 const supported=typeof inspect==='function';
 function read(id){const item=records.get(id),status=factoryStatus(item?.reply,id,{catalog,projection:getProjection()});return Object.freeze({...status,loading:item?.loading===true,failed:item?.failed===true,supported});}
 const idsOf=captures=>[...new Set(captures.map(c=>c.id).filter(id=>typeof id==='string'&&id.length<=256))];
 function enqueue(id,background=false){
  const existing=work.get(id);
  if(existing){existing.background ||= background;existing.view=generation;records.set(id,{...records.get(id),loading:true,failed:false});return;}
  const job={id,view:generation,background};work.set(id,job);queue.push(job);records.set(id,{...records.get(id),loading:true,failed:false});
 }
 function pump(){while(!disposed&&active<concurrency&&queue.length){const job=queue.shift(),{id}=job;if(!job.background&&job.view!==generation){if(work.get(id)===job)work.delete(id);continue;}active++;let timer;
  Promise.race([Promise.resolve().then(()=>inspect({captureEventId:id})),new Promise((_,reject)=>{timer=setTimer(()=>reject(Error('inspection-timeout')),timeoutMs);})]).then(reply=>{
   if(disposed||!job.background&&job.view!==generation)return;records.set(id,{reply,loading:false,failed:false});onUpdate(id);
  },()=>{if(disposed||!job.background&&job.view!==generation)return;records.set(id,{reply:null,loading:false,failed:true});onUpdate(id);}).finally(()=>{clearTimer(timer);active--;if(work.get(id)===job)work.delete(id);pump();});
 }}
 function leave(){generation++;queue=queue.filter(job=>{if(job.background)return true;if(work.get(job.id)===job)work.delete(job.id);return false;});for(const[id,item]of records)if(item.loading&&!work.get(id)?.background)records.set(id,{...item,loading:false});}
 return Object.freeze({read,leave,
  inspectVisible(captures){leave();if(disposed||!supported)return;for(const id of idsOf(captures).slice(0,limit))enqueue(id);pump();},
  // A launch/Words reconciliation visits every unknown row, including off-page rows.
  // This only calls inspect(captureEventId): it never replays capture or intake commands.
  inspectUnknown(captures){if(disposed||!supported)return;for(const id of idsOf(captures))if(read(id).kind==='unknown')enqueue(id,true);pump();},
  dispose(){leave();disposed=true;queue=[];work.clear();records.clear();}});
}
