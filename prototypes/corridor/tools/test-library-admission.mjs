import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { test } from 'node:test';
import vm from 'node:vm';

const code = readFileSync(new URL('./verify-feed.mjs', import.meta.url), 'utf8');
const declaration = code.match(/^function libraryCandidateProblems\([^]*?^\}/m)?.[0];
assert(declaration);
const context = vm.createContext({ createHash, isDeepStrictEqual });
vm.runInContext(declaration, context);
const validate = (...args) => [...context.libraryCandidateProblems(...args)];
const copy = value => JSON.parse(JSON.stringify(value));
const text = '檸檬の𤄃歩。';
const hash = createHash('sha256').update(text).digest('hex');
function fixture() {
  const c={id:'fixture',title:'題',titleEn:'Title',author:'Author',url:'https://example.invalid/?oldid=1',licence:'CC BY-SA 4.0',attribution:'Contributors',date:'2026-10-03',source:'ja.wikipedia'};
  const level={authorLevel:'N2',originalLabel:'N3',earReview:{by:'synthetic-test-only'}};
  const admission={status:'pending',humanApproval:null,contentReviews:[],titleReceipts:[]};
  const source={id:c.id,candidate:c,level,admission,sourceText:{text,sha256:hash},admittedText:{text,sha256:hash,editMap:[]}};
  const row={...c,pool:'share_alike',chars:[...text].length,textMetrics:{charsUnit:'unicode-codepoint',utf16Length:text.length,readingAnchorUnit:'utf16',tokenPositionUnit:'token-index'},
    libraryCandidate:{schema:1,admission:'pending',installable:false,sourceTextSha256:hash,admittedTextSha256:hash},
    authorLevel:level.authorLevel,originalAuthorLevel:level.originalLabel,authorLevelProvenance:level,
    grading:{signals:{jreadability:{score:2.12345678},jlpt_lexicon:{coverage:.75}},unavailable:{tmr:'offline'}}};
  return {source,row,body:{...copy(row),text,tokens:[{s:text}],paras:[],provenance:copy(c),admission:copy(admission)}};
}
test('exact unadmitted source candidate accepted only as pending; missing title and content proofs remain missing',()=>{
  const {row,body,source}=fixture();assert.deepEqual(validate(row,body,source),[]);
  assert(validate(row,body,source,{activate:true}).includes('activation-held'));
});
for(const [name,mutate,witness] of [
  ['unreviewed rewrite',f=>f.body.text+='別','held-text-changed'],
  ['source hash',f=>f.row.libraryCandidate.sourceTextSha256='0'.repeat(64),'text-pins'],
  ['UTF16-as-display',f=>f.row.chars=text.length,'text-count-domain'],
  ['codepoint-as-anchor',f=>f.row.textMetrics.readingAnchorUnit='codepoint','text-count-domain'],
  ['ear substituted for computation',f=>f.body.grading={signals:{jreadability:{score:'N2'}}},'computed-signals'],
  ['ear provenance lost',f=>f.row.originalAuthorLevel='N5','ear-level-provenance'],
  ['share alike laundered',f=>{f.row.pool='original';f.body.pool='original';},'licence-pool'],
  ['source attribution lost',f=>f.body.provenance.attribution='invented','lost-source-provenance'],
  ['fake John receipt',f=>f.source.admission.humanApproval={authority:'John'},'unkeyed-admission'],
  ['invented title receipt',f=>f.source.admission.titleReceipts.push({approved:true}),'unkeyed-admission'],
  ['invented content eyes',f=>f.source.admission.contentReviews.push({family:'one'},{family:'two'}),'unkeyed-admission'],
  ['installable candidate',f=>f.row.libraryCandidate.installable=true,'candidate-scope'],
]) test('reject '+name,()=>{const f=fixture();mutate(f);assert(validate(f.row,f.body,f.source).includes(witness));});
test('legacy deletion-cull contract remains separate and unchanged by library validation',()=>{
  assert.match(code,/const shelfCulls = cullRows\.filter\(\(row\) => row\.decision === 'approved' && row\.where === 'shelf'\)/);
  assert.match(code,/if \(row\.chars !== body\.text\.length\)/);
  assert.match(code,/const shareAlikeReading = \(row\) =>\s*row\.pool === 'share_alike' && freshIds\.has\(row\.id\)/);
});
