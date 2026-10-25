/** F approved-contract counterexamples run the predicates verify-design-reader-shelf and verify-places-layout call,
 * and the type-ruby adapter over the observed receipts of the approved 17-row producer (cda18876). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readingContrastHolds, rubyHalfOfBody, rubyHideMovesNothing, rubyLegible, rubyTurnKeepsPassage } from './vh-visual-contracts.mjs';
import { mediaReportContracts } from '../../../scripts/ci/vh-media-report-contracts.mjs';
test('F ruby ruler: valid half-size, wrong-ratio boundary, restored half-size',()=>{
  assert.equal(rubyHalfOfBody(10.5,21),true);
  for(const proportion of [.489999,.510001,.46,.55])assert.equal(rubyHalfOfBody(21*proportion,21),false,`wrong ratio ${proportion}`);
  for(const proportion of [.490001,.5,.509999])assert.equal(rubyHalfOfBody(21*proportion,21),true,`approved ratio ${proportion}`);
  assert.equal(rubyHalfOfBody(11.5,23),true);
});
test('F closed interval includes exact0.49 and0.51, without admitting values just outside',()=>{
  for(const ratio of [0.49,0.51])assert.equal(rubyHalfOfBody(ratio,1),true,`closed endpoint ${ratio}`);
  for(const ratio of [0.49-Number.EPSILON,0.51+Number.EPSILON])assert.equal(rubyHalfOfBody(ratio,1),false,`outside endpoint ${ratio}`);
  assert.equal(rubyHalfOfBody(49,100),true);assert.equal(rubyHalfOfBody(51,100),true);
});
test('F ruby ruler: minimum 10px is inclusive and 9.999999px fails its own row',()=>{
  assert.equal(rubyLegible(10),true);assert.equal(rubyLegible(9.999999),false);assert.equal(rubyLegible(10),true);
});
test('F ruby ruler: contrast 4.5:1 is inclusive, 4.499999:1 fails, restored contrast passes',()=>{
  assert.equal(readingContrastHolds(4.5),true);assert.equal(readingContrastHolds(4.499999),false);assert.equal(readingContrastHolds(4.5),true);
});
const good={frontText:'漢字の読みを保つ。',backText:'漢字の読みを保つ。',pitches:[30,31,30,30.5]};
test('F natural ruby layout: legal rewrap keeps text and uniform pitch, without old reveal-box equality',()=>{
  assert.equal(rubyTurnKeepsPassage({...good,front:['漢字の読み','を保つ。'],back:['漢字の','読みを','保つ。']}),true);
});
test('F natural ruby layout: changed text fails independently of pitch, then restored text passes',()=>{
  assert.equal(rubyTurnKeepsPassage(good),true);assert.equal(rubyTurnKeepsPassage({...good,backText:'漢字の読みを失う。'}),false);
  assert.equal(rubyTurnKeepsPassage({...good,backText:''}),false);assert.equal(rubyTurnKeepsPassage(good),true);
});
test('F natural ruby layout: >1px nonuniform pitch fails independently of text; too few lines prove nothing',()=>{
  assert.equal(rubyTurnKeepsPassage(good),true);assert.equal(rubyTurnKeepsPassage({...good,pitches:[30,31.000001,30]}),false);
  assert.equal(rubyTurnKeepsPassage({...good,pitches:[30,30]}),false);assert.equal(rubyTurnKeepsPassage(good),true);
});
test('F natural ruby hide: only the actual back geometry is its restoration reference',()=>{
  const back=['漢字の','読みを','保つ。'],backTops=[20,50,80],front=['漢字の読み','を保つ。'];
  assert.equal(rubyHideMovesNothing({back,backTops,lines:back,tops:backTops}),true);
  assert.equal(rubyHideMovesNothing({back,backTops,lines:front,tops:backTops}),false);
  assert.equal(rubyHideMovesNothing({back,backTops,lines:back,tops:[20,50,81]}),false);
  assert.equal(rubyHideMovesNothing({back,backTops,lines:back,tops:backTops}),true);
});
const observed=JSON.parse(readFileSync(new URL('./vh-type-ruby-observed-receipts.json',import.meta.url)));
const R4_W1=['R4-breaks-on-touch-320','R4-breaks-on-touch-390','R4-breaks-on-touch-430','R4-breaks-on-touch-1368','W1-fresh-320-reveal-fold'];
const admit=(engine,report,extra={})=>mediaReportContracts['type-ruby'].validate(report,{engine,artifactSha256:observed.receipts[engine].artifactSha256,
  verifierSha256:observed.provenance.producerSha256,env:{KAIRO_BROWSER:engine},args:[],...extra});
for(const engine of ['chromium','webkit']) {
  test(`type-ruby ${engine}: the observed cda18876 receipt (17 rows plus two sheets) is admitted`,()=>{
    const report=structuredClone(observed.receipts[engine]);
    assert.equal(report.results.filter(row=>row.engine!=='sheets').length,17);
    const verdict=admit(engine,report);
    assert.deepEqual(verdict.errors,[]);assert.equal(verdict.passed,true);
    assert.deepEqual([...verdict.observedCases].sort(),[...mediaReportContracts['type-ruby'].expectedCases(engine)].sort());
  });
  test(`type-ruby ${engine}: the base-shaped 12-row receipt, a wrong producer and a failed row are rejected`,()=>{
    const base=structuredClone(observed.receipts[engine]);
    base.results=base.results.filter(row=>!R4_W1.includes(row.name));
    assert.equal(base.results.filter(row=>row.engine!=='sheets').length,12);
    assert.equal(admit(engine,base).passed,false);
    assert.equal(admit(engine,structuredClone(observed.receipts[engine]),{verifierSha256:'b'.repeat(64)}).passed,false);
    const failed=structuredClone(observed.receipts[engine]);
    failed.results.find(row=>row.name==='W1-fresh-320-reveal-fold').passed=false;
    assert.equal(admit(engine,failed).passed,false);
    const unversioned=structuredClone(observed.receipts[engine]);
    unversioned.results.find(row=>row.name==='R4-breaks-on-touch-390').engine=engine;
    assert.equal(admit(engine,unversioned).passed,false);
  });
}

// RT1: execute the producer's actual collector, allow-list and L2 assertion block.
// This file is already registered once in the required ci-contracts node suite.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const producer = readFileSync(new URL('./verify-type-ruby.mjs', import.meta.url), 'utf8');
const producerAst = ts.createSourceFile('verify-type-ruby.mjs', producer, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function producerNode(predicate) {
  const found = [];
  const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(producerAst); assert.equal(found.length, 1, 'one exact producer declaration/block');
  return found[0].getText(producerAst);
}
const rtFunctions = ['declarations', 'collectRtRules', 'allowedRtRule'].map(name =>
  producerNode(node => ts.isFunctionDeclaration(node) && node.name?.text === name)).join('\n');
const rtAllowed = producerNode(node => ts.isVariableDeclaration(node) && node.name.getText(producerAst) === 'RT_ALLOWED');
const l2Block = producerNode(node => ts.isTryStatement(node)
  && node.tryBlock.getText(producerAst).includes("record('sheets', 'L2-one-ruby'"));
const rtApi = runInNewContext(`const ${rtAllowed};\n${rtFunctions}\n({ declarations, collectRtRules, allowedRtRule })`);
const collect = (css, file = 'editorial.css') => rtApi.collectRtRules(file, rtApi.declarations(css));
function l2(rules, overrides = {}) {
  const records = [];
  runInNewContext(`const ${rtAllowed};\n${rtFunctions}\nconst { rtRules, rubyRules, pseudoReadings } = JSON.parse(input);\n${l2Block}`, {
    assert, input: JSON.stringify({ rtRules: rules, rubyRules: ['rooms/motion.css|rt|0.5em'], pseudoReadings: [], ...overrides }),
    record: (engine, name, passed, observations, error) => records.push({ engine, name, passed, observations, error }),
  });
  assert.equal(records.length, 1); assert.equal(records[0].name, 'L2-one-ruby');
  return records[0];
}
const hiddenSelector = '#reader:not(.fg-always) rt.hidden-rt';
const heldSelector = `${hiddenSelector}[data-touch-fading]`;
const exactConcealCss = `${hiddenSelector} { opacity: 0; transition: opacity var(--motion-fast) var(--ease-exit); }
${heldSelector} { display: ruby-text; }
@media (prefers-reduced-motion: reduce) {
  ${hiddenSelector} { transition: none; }
  ${heldSelector} { display: none; }
}`;
const editorialCss = readFileSync(new URL('../editorial.css', import.meta.url), 'utf8');
test('RT1 actual final editorial collector and L2 accept exactly five approved conceal declarations', () => {
  const actual = collect(editorialCss), expected = collect(exactConcealCss);
  assert.equal(actual.length, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)));
  assert(actual.every(rule => rtApi.allowedRtRule(rule)));
  assert.equal(l2(actual).passed, true);
  assert.equal(actual.filter(rule => rule.prop === 'display').length, 2);
  assert.equal(actual.filter(rule => rule.chain[0] === '@media (prefers-reduced-motion: reduce)').length, 2);
});
test('RT1 collector and L2 reject global/unscoped holds, extra selector, wrong property/value/file or media', () => {
  const controls = [
    ['global hold', `rt.hidden-rt[data-touch-fading] { display: ruby-text; }`],
    ['always-readings hold', `#reader rt.hidden-rt[data-touch-fading] { display: ruby-text; }`],
    ['extra selector', `${heldSelector}, rt { display: ruby-text; }`],
    ['wrong property', `${heldSelector} { position: absolute; }`],
    ['wrong display', `${heldSelector} { display: block; }`],
    ['important display', `${heldSelector} { display: ruby-text !important; }`],
    ['normal collapse', `${heldSelector} { display: none; }`],
    ['reduced hold', `@media (prefers-reduced-motion: reduce) { ${heldSelector} { display: ruby-text; } }`],
    ['wrong media', `@media (prefers-reduced-motion: no-preference) { ${heldSelector} { display: none; } }`],
    ['extra nesting', `@supports (display: ruby-text) { @media (prefers-reduced-motion: reduce) { ${heldSelector} { display: none; } } }`],
    ['unapproved reduced rule', `@media (prefers-reduced-motion: reduce) { rt { width: 40px; } }`],
    ['wrong opacity', `${hiddenSelector} { opacity: 1; }`],
    ['old discrete display transition', `${hiddenSelector} { transition: opacity var(--motion-fast) var(--ease-exit), display var(--motion-fast) allow-discrete; }`],
    ['wrong file', `${heldSelector} { display: ruby-text; }`, 'corridor.css'],
  ];
  for (const [name, css, file] of controls) {
    const rules = collect(css, file); assert(rules.length > 0, `${name}: collector reached`);
    assert(rules.some(rule => !rtApi.allowedRtRule(rule)), `${name}: predicate rejects`);
    const result = l2(rules); assert.equal(result.passed, false, name);
    assert.match(result.error, /rules that touch a reading beyond/, `${name}: correct rejection`);
  }
  assert.equal(l2(collect(exactConcealCss)).passed, true, 'restored contract passes');
});
test('RT1 keeps the existing global ruby list, sole size rule and pseudo-reading guard', () => {
  const global = collect(readFileSync(new URL('../rooms/motion.css', import.meta.url), 'utf8'), 'rooms/motion.css');
  assert(global.some(rule => rule.selector === 'rt.hidden-rt' && rule.prop === 'display' && rule.value === 'none'));
  assert.equal(l2(global).passed, true);
  assert.equal(l2([], { rubyRules: ['rooms/motion.css|rt|0.5em', 'editorial.css|rt|12px'] }).passed, false);
  assert.equal(l2([], { pseudoReadings: ['editorial.css rt::before'] }).passed, false);
  const registration = readFileSync(new URL('../../../scripts/ci/supplemental.mjs', import.meta.url), 'utf8');
  assert.equal(registration.split("'prototypes/corridor/tools/test-vh-type-ruby-controls.mjs'").length - 1, 1);
});
for (const engine of ['chromium', 'webkit']) test(`RT1 ${engine}: L2 remains required by native receipt admission`, () => {
  const report = structuredClone(observed.receipts[engine]);
  const row = report.results.find(row => row.engine === 'sheets' && row.name === 'L2-one-ruby');
  assert(row); row.passed = false;
  assert.equal(admit(engine, report).passed, false);
});
