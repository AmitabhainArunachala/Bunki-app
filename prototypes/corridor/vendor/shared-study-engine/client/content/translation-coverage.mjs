/** Browser build/install coverage gate. Await once before immutable module activation. */
const TIERS=new Set(['ai-semantic-review','cross-model-semantic-review','ai-editor-independent-auditor']);
export function canonicalReviewJson(value){
  if(value===null||['string','boolean'].includes(typeof value))return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonicalReviewJson).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalReviewJson(value[k])).join(',')+'}';
  throw new TypeError('non-JSON review data');
}
export async function sha256Text(text){
  const bytes=new TextEncoder().encode(text),hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
export const reviewObjectHash=async value=>sha256Text(canonicalReviewJson(value));
const equal=(a,b)=>{try{return canonicalReviewJson(a)===canonicalReviewJson(b);}catch{return false;}};
export async function sourceSegments(ja){
  const points=Array.from(ja),segments=[];let start=0;
  for(let i=0;i<points.length;i++){
    if(!/[。！？]/u.test(points[i]))continue;
    while(i+1<points.length&&/[。！？]/u.test(points[i+1]))i++;
    while(i+1<points.length&&/[」』）】”’"']/u.test(points[i+1]))i++;
    const end=i+1;segments.push({id:'s'+segments.length,start,end,unit:'unicode-codepoint',sha256:await sha256Text(points.slice(start,end).join(''))});start=end;
  }
  if(start<points.length)segments.push({id:'s'+segments.length,start,end:points.length,unit:'unicode-codepoint',sha256:await sha256Text(points.slice(start).join(''))});
  return segments;
}
export async function validateCoverageBinding(binding,{ja,en,expectedGuid,reviewIndex,requireVerified=true}){
  const errors=[];
  if(!binding||binding.format!=='nihongo-translation-binding'||binding.version!==1)return {ok:false,status:'unsupported',errors:['unsupported-binding-version']};
  if(typeof ja!=='string'||typeof en!=='string'||!ja.trim()||!en.trim())return {ok:false,status:binding.status,errors:['required-source-or-english-empty']};
  if(expectedGuid!==undefined&&binding.guid!==expectedGuid)errors.push('wrong-guid-binding');
  const sourceHash=await sha256Text(ja),englishHash=await sha256Text(en),segments=await sourceSegments(ja);
  if(binding.source_sha256!==sourceHash)errors.push('stale-source-binding');
  if(binding.english_sha256!==englishHash)errors.push('stale-english-binding');
  if(!equal(binding.source_segments,segments))errors.push('source-segment-partition-mismatch');
  if(!['verified','pending'].includes(binding.status))errors.push('invalid-coverage-status');
  if(requireVerified&&binding.status!=='verified')errors.push('translation-coverage-pending');
  if(binding.status==='pending'){
    if(binding.alignment?.length||binding.review_ids?.length)errors.push('pending-binding-must-not-assert-reviewed-alignment');
    return {ok:errors.length===0,status:binding.status,errors};
  }
  const index=reviewIndex?.reviews||reviewIndex||{},ids=binding.review_ids||[];
  if(!ids.length||new Set(ids).size!==ids.length)errors.push('review-references-missing-or-duplicate');
  for(const id of ids){
    const claim=index[id];if(!claim){errors.push('untrusted-or-missing-review');continue;}
    const {review_id,...body}=claim;
    if(review_id!==await reviewObjectHash(body))errors.push('review-id-hash-mismatch');
    if(claim.guid!==binding.guid||claim.source_sha256!==sourceHash||claim.english_sha256!==englishHash)errors.push('review-pair-mismatch');
    if(claim.coverage!=='whole-source'||claim.verdict!=='complete-equivalent')errors.push('review-does-not-assert-complete-coverage');
    if(!TIERS.has(claim.tier)||!claim.reviewer||!claim.boundary)errors.push('review-tier-or-attribution-missing');
    if(!Array.isArray(claim.evidence)||!claim.evidence.length)errors.push('review-evidence-missing');
    else for(const e of claim.evidence)if(!e?.artifact||!/^[0-9a-f]{64}$/.test(e.sha256)||!e.scope)errors.push('review-artifact-binding-invalid');
  }
  const covered=[];
  const alignment=Array.isArray(binding.alignment)?binding.alignment:[];
  if(alignment.length!==1||!alignment[0]||typeof alignment[0]!=='object')errors.push('whole-source-review-needs-one-alignment');
  for(const group of alignment){
    if(!ids.includes(group.review_id))errors.push('alignment-review-not-bound');
    if(!equal(group.english_span,{start:0,end:Array.from(en).length,unit:'unicode-codepoint'}))errors.push('whole-source-review-needs-whole-english-span');
    covered.push(...(group.source_ids||[]));
  }
  if(!equal(covered,segments.map(s=>s.id)))errors.push('source-segments-not-covered-in-order-exactly-once');
  return {ok:errors.length===0,status:binding.status,errors:[...new Set(errors)].sort()};
}
export async function validateCoverageManifest(manifest,{records,reviewIndex,requireVerified=true}){
  const errors=[];
  if(!manifest||manifest.format!=='nihongo-translation-coverage'||manifest.version!==1)return {ok:false,errors:['unsupported-coverage-manifest']};
  if(manifest.review_index_sha256!==await reviewObjectHash(reviewIndex))errors.push('stale-review-index');
  const bindings=manifest.bindings||{},ids=records.map(r=>r.guid);
  if(!equal(Object.keys(bindings).sort(),ids.slice().sort()))errors.push('corpus-guid-inventory-mismatch');
  let pending=0;
  for(const r of records){
    const binding=bindings[r.guid];if(binding?.status==='pending')pending++;
    const result=await validateCoverageBinding(binding,{ja:r.ja,en:r.en,expectedGuid:r.guid,reviewIndex,requireVerified});
    errors.push(...result.errors.map(e=>r.guid+':'+e));
  }
  const counts={records:records.length,verified:records.length-pending,pending};
  if(!equal(counts,manifest.counts))errors.push('coverage-count-mismatch');
  return {ok:errors.length===0,errors,counts};
}
