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
