/** UI completion follows the current validated resolution. Stored proof survives
 * transport/read failures, but never promotes a pending operation to applied. */
export function retainOperationProof(previous,result={kind:'failed'}){
 const next={...result};
 if(previous?.persisted){
  const keys=['commandId','eventId','dseq','eventTs'],conflict=keys.some(key=>previous[key]!==undefined&&result[key]!==undefined&&previous[key]!==result[key]);
  for(const key of keys)if(previous[key]!==undefined)next[key]=previous[key];next.persisted=true;
  if(conflict){next.kind='persisted-blocked';next.blockedReason='identity-conflict';next.resolution={status:'pending',reason:'identity-conflict',eventId:previous.eventId};delete next.outcome;delete next.capture;}
 }
 return next;
}
export function operationState(result,{observations=[],existing=false}={}){
 const persisted=result?.persisted===true||result?.kind==='durable',resolution=result?.resolution;
 const reason=resolution?.reason??result?.blockedReason??result?.reason??null;
 const view=phase=>({phase,persisted,reason,updateRequired:['update-required','schema-newer','schema-unsupported'].includes(reason)});
 if(existing&&result?.kind==='existing')return view('existing');
 if(existing&&persisted&&result?.reused&&typeof result.eventId==='string'&&resolution?.eventId===result.eventId&&typeof result.taskKey==='string'&&result.entry?.taskKey===result.taskKey&&resolution.status==='observation'&&resolution.outcome?.status==='observation'&&reason==='manual-card-content-occupied'&&resolution.canonical===true&&resolution.terminal===true)return view('existing');
 if(resolution){
  const same=typeof result.eventId==='string'&&resolution.eventId===result.eventId;
  if(persisted&&same&&resolution.status==='applied'&&resolution.outcome?.status==='applied')return view('applied');
  if(persisted&&same&&resolution.status==='observation'){
   if(observations.includes(reason))return view('observation');
   if(resolution.canonical===true&&resolution.terminal===true)return view('refused');
  }
  return view('pending');
 }
 // The initial canonical submit reports its applied durable outcome directly.
 // Explicit recovery supplies resolution, which overrides the original kind.
 if(result?.kind==='durable')return view('applied');
 if(result?.kind==='observation-only'&&observations.includes(reason))return view('observation');
 if(!persisted&&result?.kind==='invalid')return view('refused');
 return view('pending');
}
