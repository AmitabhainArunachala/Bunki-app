/** F approved-contract counterexamples execute the current producer predicates, not replicas.
 * These are source-oracle tests; real DOM/paint/geometry remains the browser producers' job. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function calls(file) {
  const source=readFileSync(new URL(file,import.meta.url),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),found=[];
  function visit(node){if(ts.isCallExpression(node))found.push(node);ts.forEachChild(node,visit);}visit(ast);return{ast,found};
}
const design=calls('./verify-design-reader-shelf.mjs'),places=calls('./verify-places-layout.mjs');
function assertPredicate(messageStart, messageEnd) {
  const matches=design.found.filter(node=>node.expression.getText(design.ast)==='assert'&&node.arguments.length===2&&ts.isTemplateExpression(node.arguments[1])&&node.arguments[1].head.text.startsWith(messageStart)&&node.arguments[1].templateSpans.at(-1).literal.text.endsWith(messageEnd));
  assert.equal(matches.length,1,`one real assertion for ${messageStart}`);
  return input=>vm.runInNewContext(matches[0].arguments[0].getText(design.ast),input);
}
function checkPredicate(name) {
  const matches=places.found.filter(node=>node.expression.getText(places.ast)==='check'&&ts.isStringLiteralLike(node.arguments[0])&&node.arguments[0].text===name);
  assert.equal(matches.length,1,`one real check for ${name}`);
  return input=>vm.runInNewContext(`(async()=>(${matches[0].arguments[1].getText(places.ast)}))()`,input);
}
const ratio=assertPredicate('furigana ', '× the body, not half');
const minimum=assertPredicate('furigana ', 'px is under 10px');
const contrast=assertPredicate("the reading's contrast ", ':1');
test('F ruby ruler: valid half-size, wrong-ratio boundary, restored half-size',()=>{
  const good={rt:{size:10.5},body:21};assert.equal(ratio(good),true);
  for(const proportion of [.489999,.510001,.46,.55])assert.equal(ratio({rt:{size:21*proportion},body:21}),false,`wrong ratio ${proportion}`);
  for(const proportion of [.490001,.5,.509999])assert.equal(ratio({rt:{size:21*proportion},body:21}),true,`approved ratio ${proportion}`);
  assert.equal(ratio(good),true);
});
test('F ruby ruler: minimum 10px is inclusive and 9.999999px fails its own row',()=>{
  assert.equal(minimum({rt:{size:10}}),true);assert.equal(minimum({rt:{size:9.999999}}),false);assert.equal(minimum({rt:{size:10}}),true);
});
test('F ruby ruler: contrast 4.5:1 is inclusive, 4.499999:1 fails, restored contrast passes',()=>{
  assert.equal(contrast({readingContrast:4.5}),true);assert.equal(contrast({readingContrast:4.499999}),false);assert.equal(contrast({readingContrast:4.5}),true);
});
const passage=checkPredicate('focus · the turn keeps the passage whole, its lines at one pitch');
const hide=checkPredicate('focus · turning readings off moves no line');
const good={frontText:'漢字の読みを保つ。',backText:'漢字の読みを保つ。',pitches:[30,31,30,30.5]};
test('F natural ruby layout: legal rewrap keeps text and uniform pitch, without old reveal-box equality',async()=>{
  assert.equal(await passage({...good,front:['漢字の読み','を保つ。'],back:['漢字の','読みを','保つ。']}),true);
});
test('F natural ruby layout: changed text fails independently of pitch, then restored text passes',async()=>{
  assert.equal(await passage(good),true);assert.equal(await passage({...good,backText:'漢字の読みを失う。'}),false);assert.equal(await passage(good),true);
});
test('F natural ruby layout: >1px nonuniform pitch fails independently of text; too few lines prove nothing',async()=>{
  assert.equal(await passage(good),true);assert.equal(await passage({...good,pitches:[30,31.000001,30]}),false);
  assert.equal(await passage({...good,pitches:[30,30]}),false);assert.equal(await passage(good),true);
});
test('F natural ruby hide: only the actual back geometry is its restoration reference',async()=>{
  const back=['漢字の','読みを','保つ。'],backTops=[20,50,80],front=['漢字の読み','を保つ。'];
  assert.equal(await hide({back,backTops,lines:async()=>back,tops:async()=>backTops}),true);
  assert.equal(await hide({back,backTops,lines:async()=>front,tops:async()=>backTops}),false);
  assert.equal(await hide({back,backTops,lines:async()=>back,tops:async()=>[20,50,81]}),false);
  assert.equal(await hide({back,backTops,lines:async()=>back,tops:async()=>backTops}),true);
});
