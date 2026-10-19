import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exactRoster, selection, scopeResult, DESIGN_CASES, designSelection, READING_CASES, plainBadBreak,
  loadMixedLexemes, classEvidence, specialEvidence, loadSpecialProofs, shelfEvidence, sweepSelection } from './vh-visual-contracts.mjs';
const site = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(readFileSync(new URL('./vh-reading-special-fixtures.json', import.meta.url)));
const proofs = loadSpecialProofs(site, fixture);

test('V01 mixed-script-verb-split: lexical oracle rejects real inflections and allows interword boundaries', () => {
  const lexemes = loadMixedLexemes(site);
  for (const text of ['サボ|る', 'サボ|った', 'メモ|ります', 'ググ|らない', '並|ぶ', '熟語|の', '12|月']) {
    assert(plainBadBreak(text.replace('|', ''), text.indexOf('|'), lexemes), text);
  }
  for (const text of ['先生|ことば', '通常版|この', '1.2.1|通常版', 'サービス|ことば']) {
    assert.equal(plainBadBreak(text.replace('|', ''), text.indexOf('|'), lexemes), '', text);
  }
});

test('V05 drop-duplicate-hides-omission preserves old count/membership yet exact predicate bites', () => {
  const expectedIds = ['A', 'B', 'C', 'D', 'tail'];
  const candidate = { expectedIds, blocks: [['A', 'B', 'C', 'D']], series: [], ids: expectedIds };
  assert.deepEqual(shelfEvidence(candidate), { roster: true, blocks: true, series: true, adjustedPrefix: ['A','B','C','D'], order: true });
  const duplicate = ['A','B','A','D','tail'];
  assert.equal(duplicate.slice(0,4).length, candidate.blocks[0].length);
  assert(duplicate.slice(0,4).every(id => candidate.blocks[0].includes(id)));
  assert.equal(shelfEvidence({ ...candidate, ids: duplicate }).roster, false);
  assert.equal(shelfEvidence({ ...candidate, ids: duplicate }).blocks, false);
  assert(shelfEvidence(candidate).roster);
});

test('V05 series-book-order-swapped and day-two-drop-order-drift; legal pulled members/tails retained', () => {
  const ids = ['A','aozora:049966-1','aozora:049966-2','B','C','tail1','tail2'];
  const base = { expectedIds: ids, blocks: [['A','aozora:049966-1','aozora:049966-2','B'],['C']],
    series: [['aozora:049966-1','aozora:049966-2']], ids, prefix: ids.slice(0,5) };
  assert(Object.entries(shelfEvidence(base)).filter(([key]) => key !== 'adjustedPrefix').every(([, value]) => value));
  const swap = [...ids]; [swap[1],swap[2]] = [swap[2],swap[1]];
  assert.equal(shelfEvidence({...base,ids:swap}).series,false);
  const dayTwo = [...ids]; [dayTwo[0],dayTwo[3]] = [dayTwo[3],dayTwo[0]];
  const changed = shelfEvidence({...base,ids:dayTwo});
  assert(changed.roster && changed.blocks && changed.series && !changed.order);
  const legalTail = [...ids]; [legalTail[5],legalTail[6]]=[legalTail[6],legalTail[5]];
  assert(shelfEvidence({...base,ids:legalTail}).order);
});

const classEntry = { seq:'1221270', proofs:[{ seq:'1221270',form:'かえる',reading:'かえる',gloss:'to return',senseIndex:0,pos:['v5r','vi'] }] };
test('V06 class-proof-missing is unproved; noun substitution fails; exact v5r restores', () => {
  assert(classEvidence('動詞',classEntry).proved);
  const missing = classEvidence('動詞',{...classEntry,p:'verb',pos:['v5r'],proofs:[]});
  assert(missing.unknown && !missing.proved, 'quick dictionary prose POS does not lend proof');
  const noun = classEvidence('動詞',{...classEntry,proofs:[{...classEntry.proofs[0],pos:['n']}]});
  assert(!noun.unknown && !noun.proved);
  assert(classEvidence('動詞',classEntry).proved);
  assert(!classEvidence('動詞',{...classEntry,proofs:[]},true).proved, 'expression spelling alone is not POS proof');
  assert(classEvidence('動詞',{...classEntry,proofs:[{...classEntry.proofs[0],pos:['exp']}]},true).proved);
});

test('V07 source-bound positive name/reading fixtures; enabled or unexplained Save fails', () => {
  assert.equal(proofs.size,56);
  for (const key of ['aozora:000628#76','bunki-graded-n3-hashira-counter#242']) {
    const proof = proofs.get(key), token = {s:proof.surface,r:proof.reading};
    const card = {word:token.s,reading:token.r,gloss:`a ${proof.kind} in this text`,take:{disabled:true},reason:'So it can’t be saved here.',reasonVisible:true};
    const args={article:proof.article,index:proof.index,token,proof,card};
    assert.deepEqual(specialEvidence(args),{classification:true,asWritten:true,held:true});
    assert.equal(specialEvidence({...args,card:{...card,take:{disabled:false}}}).held,false);
    assert.equal(specialEvidence({...args,card:{...card,reason:''}}).held,false);
    assert.equal(specialEvidence({...args,card:{...card,reasonVisible:false}}).held,false);
    assert.equal(specialEvidence({...args,proof:{...proof,index:proof.index+1}}).classification,false);
  }
});

test('V07 ordinary-verb-labeled-name/reading: exact as-written and held Save cannot authorize classification', () => {
  const article=JSON.parse(readFileSync(resolve(site,'data/articles/aozora-000628.json')));
  const token=article.tokens[2117]; assert.equal(token.s,'かえり');
  for (const kind of ['name','reading']) {
    const judged=specialEvidence({article:article.id,index:2117,token,proof:proofs.get(`${article.id}#2117`),
      card:{word:'かえり',reading:'かえり',gloss:`a ${kind} in this text`,take:{disabled:true},reason:'held',reasonVisible:true}});
    assert.deepEqual(judged,{classification:false,asWritten:true,held:true});
  }
});

test('ROSTER empty, unknown and duplicate selectors fail before browser work', () => {
  for(const value of ['',',','special,','bogus','special,special']) assert.throws(()=>selection(value,READING_CASES,'READING_TRUTH_ONLY'));
  assert.equal(selection(undefined,READING_CASES,'READING_TRUTH_ONLY'),null);
  assert.deepEqual(selection('special,sweep',READING_CASES,'READING_TRUTH_ONLY'),['special','sweep']);
  for(const argv of [['--g3-only','--spacing-only'],['--g3-only','--g3-only'],['--only'],['--wat']]) assert.throws(()=>designSelection(argv));
});

test('ROSTER exact declaration and same-count duplicate/missing/filtered controls', () => {
  assert.equal(DESIGN_CASES.length,50);
  for(const [argv,count] of [[[],50],[['--g3-only'],7],[['--spacing-only'],2],[['--design-fixes-only'],6]]) {
    const selected=designSelection(argv); assert.equal(selected.cases.length,count);
    const result=scopeResult({expected:selected.cases,observed:selected.cases,passed:true,diagnostic:selected.diagnostic});
    assert.equal(result.fullAcceptance,argv.length===0); assert.equal(result.exitCode,argv.length?3:0);
  }
  const observed=[...DESIGN_CASES]; observed[2]=observed[1];
  assert.equal(scopeResult({expected:DESIGN_CASES,observed,passed:true}).exitCode,1);
  assert.equal(exactRoster([],[]),false);
  assert.equal(scopeResult({expected:['chromium/a','webkit/a'],observed:['chromium/a'],passed:true}).fullAcceptance,false);
  assert.equal(scopeResult({expected:DESIGN_CASES,observed:DESIGN_CASES,passed:true,diagnostic:true}).fullAcceptance,false);
});

test('SWEEP an explicit selector, even KAIRO_SWEEP_MODE=verify, keeps the sweep diagnostic', () => {
  const plain = sweepSelection({});
  assert.deepEqual(plain, { mode:'verify', negative:'', selectors:{}, diagnostic:false });
  const expected=['S01/a','S02/a'];
  assert.equal(scopeResult({expected,observed:expected,passed:true,diagnostic:plain.diagnostic}).fullAcceptance,true);
  for (const [env,mode] of [[{KAIRO_SWEEP_MODE:'verify'},'verify'],[{KAIRO_SWEEP_MODE:'inventory'},'inventory'],[{KAIRO_SWEEP_NEGATIVE:'chip'},'verify']]) {
    const scope=sweepSelection(env);
    assert.equal(scope.mode,mode); assert.deepEqual(scope.selectors,env); assert.equal(scope.diagnostic,true);
    const verdict=scopeResult({expected,observed:expected,passed:true,diagnostic:scope.diagnostic});
    assert.equal(verdict.fullAcceptance,false); assert.equal(verdict.exitCode,3);
  }
  for (const env of [{KAIRO_SWEEP_MODE:''},{KAIRO_SWEEP_MODE:'full'},{KAIRO_SWEEP_NEGATIVE:''},{KAIRO_SWEEP_NEGATIVE:'all'}]) assert.throws(()=>sweepSelection(env));
});
