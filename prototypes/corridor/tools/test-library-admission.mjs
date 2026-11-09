import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { resolve } from 'node:path';

const code = readFileSync(process.env.KAIRO_FEED_VERIFIER_SOURCE || new URL('./verify-feed.mjs', import.meta.url), 'utf8');
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
// AST locates executable verifier statements; no classification/result is inferred from source.
const feedTree = ts.createSourceFile('verify-feed.mjs', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function variable(name) {
  const statement = feedTree.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(feedTree) === name));
  assert(statement, name); return statement.getText(feedTree);
}
const cullLoop = feedTree.statements.find(node => ts.isForOfStatement(node) && node.expression.getText(feedTree) === 'shelfCulls');
assert(cullLoop);
const pendingCheck = feedTree.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.arguments[0]?.text?.startsWith('nothing proposed for culling'));
let legacyCount;
function visit(node) {
  if (ts.isIfStatement(node) && ts.isExpressionStatement(node.thenStatement) && ts.isCallExpression(node.thenStatement.expression) && node.thenStatement.expression.arguments[0]?.text === 'index-chars') legacyCount ??= node;
  ts.forEachChild(node, visit);
}
visit(feedTree); assert(legacyCount);
function legacyFeed({ decision = 'approved', where = 'shelf', present = false, chars = text.length, share = {} } = {}) {
  const results = [];
  const ctx = vm.createContext({ queue: [{kind:'cull', id:'fixture', decision, where, reason:'fixture', decidedBy:'fixture'}],
    curatedById: new Map(present ? [['fixture', {}]] : []), archiveIds: new Set(), ARTICLES:'/fixture', resolve,
    existsSync: () => false, check: (name, passed) => results.push({ name, passed }),
    row: { chars }, body: {text}, problems: [], freshRows: [{id:'fresh'}],
  });
  vm.runInContext([variable('cullRows'), variable('shelfCulls'), cullLoop.getText(feedTree), variable('prematureCulls'), pendingCheck.getText(feedTree),
    legacyCount.getText(feedTree), variable('freshIds'), variable('shareAlikeReading'),
    'globalThis.observed = {culls:shelfCulls.length, problems:[...problems], share:shareAlikeReading(globalThis.shareRow)};'].join('\n'),
    Object.assign(ctx, {shareRow:{id:'fresh',pool:'share_alike',licence:'CC BY-SA 4.0',attribution:'fixture',url:'https://example.invalid',...share}}));
  return { results, ...JSON.parse(JSON.stringify(ctx.observed)) };
}
test('actual feed verifier: approved shelf culls act; pending shelf and approved other-domain culls do not', () => {
  const approved = legacyFeed(); assert.equal(approved.culls,1); assert(approved.results.every(r=>r.passed));
  assert(legacyFeed({present:true}).results.some(r=>!r.passed), 'approved shelf cull still present fails');
  const pending = legacyFeed({decision:'pending',present:true}); assert.equal(pending.culls,0); assert(pending.results.every(r=>r.passed));
  assert(legacyFeed({decision:'pending'}).results.some(r=>!r.passed), 'pending removal fails');
  const elsewhere = legacyFeed({where:'archive',present:true}); assert.equal(elsewhere.culls,0); assert(elsewhere.results.every(r=>r.passed));
});
test('same actual verifier invocation preserves legacy UTF16 count and attributed fresh share-alike exception', () => {
  assert.notEqual(text.length,[...text].length,'astral fixture distinguishes count domains');
  assert.deepEqual(legacyFeed().problems,[]);
  assert.deepEqual(legacyFeed({chars:[...text].length}).problems,['index-chars']);
  assert.equal(legacyFeed().share,true);
  for (const share of [{id:'not-fresh'},{pool:'original'},{licence:'CC BY 4.0'},{attribution:''},{url:''}]) assert.equal(legacyFeed({share}).share,false);
});
