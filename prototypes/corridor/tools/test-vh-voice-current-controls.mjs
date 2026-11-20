/** Frozen independent current six-control assertions. VM mechanics, no native input/audio. */
import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import {readFileSync,writeFileSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createSixFixture as fixture,bindSixVoiceLayer,fixtureSnapshot,approvedWords,EN_LOCAL,settle,loadedSixSourceText} from './vh-voice-current-fixture.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..'),hash=x=>createHash('sha256').update(x).digest('hex');
const plan=JSON.parse(readFileSync(join(root,'scripts/ci/P3-vh-six/operators.json')));
const id=process.env.VH_SIX_CONTROL_ID,control=plan.controls.find(c=>c.id===id);assert(control,'Explicit frozen control ID required');
const input=process.env.KAIRO_CORRIDOR_SOURCE,phaseReceipt=process.env.VH_SIX_PHASE_RECEIPT;
assert(input&&phaseReceipt&&process.env.VH_SIX_EXPECT_INPUT_SHA256);
assert.equal(realpathSync(input),input);assert(lstatSync(input).isFile()&&!lstatSync(input).isSymbolicLink());
assert.equal(dirname(phaseReceipt),dirname(input));assert.equal(basename(phaseReceipt),basename(input,'.js')+'.json');
assert(/^(baseline|mutant|restore)-[a-f0-9-]{36}\.js$/.test(basename(input)));
const actualInputSha256=hash(loadedSixSourceText);assert.equal(hash(readFileSync(input)),actualInputSha256);assert.equal(actualInputSha256,process.env.VH_SIX_EXPECT_INPUT_SHA256);
const sourceClosure=Object.fromEntries(Object.keys(plan.sourcePins).sort().map(file=>[file,hash(readFileSync(join(root,file)))]));
for(const [file,digest] of Object.entries(plan.sourcePins))assert.equal(sourceClosure[file],digest,'Actual immutable source collaborator '+file);
const EXPECTED_C18=Object.freeze(['このバージョンでは声を使えません。',"The voice isn't available in this version of the app."]);
const EXPECTED_C17=Object.freeze(['読み上げられませんでした。もう一度タップしてください。',"This couldn't be read aloud. Tap to try again."]);
const observations=[];
afterEach(ctx=>{
 assert.equal(ctx.name,control.test,'Exactly the actual selected frozen test must run');
 const evidence={schemaVersion:1,kind:'vh-six-actual-vm-phase',control:id,test:ctx.name,input,actualInputSha256,sourceClosure,sourceClosureSha256:hash(JSON.stringify(sourceClosure)),fixtureBundlePolicy:'Bundled C18 requires original truthy input; unbundled positive remains C17',nativeInputExecuted:false,realAudioExecuted:false,sourceOnly:true,observations,fixture:fixtureSnapshot(),frozenFixtureSha256:hash(readFileSync(join(here,'vh-voice-current-fixture.mjs'))),frozenTestSha256:hash(readFileSync(fileURLToPath(import.meta.url)))};
 writeFileSync(phaseReceipt,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
});
async function unavailableCase(witness){
 for(const language of ['en','ja'])for(const words of [null,{v:1,words:{}},{v:2,words:{}},approvedWords()]){
  const f=await fixture({words,language,voices:[EN_LOCAL]});assert(f.context.__CORRIDOR_BUNDLE__,'Bundled no-layer C18 fixture is the original truthy input');
  const {button,note}=f.card();let requests=0;f.context.ensureRecManifest=()=>{requests++;return Promise.resolve(approvedWords());};
  for(const text of ['でんしゃ','English','日本語 and English']){
   f.context.speakCardReading(text,button,'電車');await settle();
   const expected=EXPECTED_C18[language==='ja'?0:1];observations.push({kind:'unbound-manual-tap',bundleTruthy:!!f.context.__CORRIDOR_BUNDLE__,language,manifest:words?.v??null,requestedText:text,title:button.title,note:note.textContent,flag:button.dataset.voiceUnavailable,requests,audio:f.created.length,device:f.deviceVoiceCalls.length,writes:f.writes.length});
   assert.equal(note.textContent,expected,witness);assert.equal(button.title,expected,witness);
   assert.equal(button.dataset.voiceUnavailable,'current-source-required');assert.equal(requests,0,'No manifest request before current source admission');assert.equal(f.created.length,0);assert.equal(f.deviceVoiceCalls.length,0);assert.deepEqual(f.writes,[]);
  }
 }
}
async function unbundledPositive(){
 for(const language of ['en','ja']){const f=await fixture({words:null,language,voices:[EN_LOCAL]});delete f.context.__CORRIDOR_BUNDLE__;const {button,note}=f.card();for(const text of ['でんしゃ','English','日本語 and English']){f.context.speakCardReading(text,button,'電車');await settle();const expected=EXPECTED_C17[language==='ja'?0:1];observations.push({kind:'unbundled-positive',bundleTruthy:!!f.context.__CORRIDOR_BUNDLE__,language,title:button.title,note:note.textContent,flag:button.dataset.voiceUnavailable});assert.equal(note.textContent,expected,'Unbundled no-layer positive remains C17');assert.equal(button.title,expected);assert.equal(button.dataset.voiceUnavailable,'current-source-required');assert.equal(f.created.length,0);assert.equal(f.deviceVoiceCalls.length,0);assert.deepEqual(f.writes,[]);}}
}
function layerFixture(){const calls=[];return {calls,layer:{stop(){},reader:{stop(){}},tapSpeaking(){return false;},canSay(){return true;},sayWord(request){calls.push({...request,titleAtCall:request.button.title,noteAtCall:request.button.parentElement?.querySelector('.say-note')?.textContent,flagAtCall:request.button.dataset.voiceUnavailable});}}};}

test('VH CURRENT SIX · no-manifest-copy-empty',async()=>{await unavailableCase('current-source-required unavailable visible copy is empty or wrong');await unbundledPositive();});
test('VH CURRENT SIX · missing-word-copy-loses-locked-voice',async()=>{await unavailableCase('current-source-required unavailable reason lost its approved cause');await unbundledPositive();});
test('VH CURRENT SIX · card-unavailable-title-omitted',async()=>{
 for(const language of ['en','ja']){const f=await fixture({language,voices:[EN_LOCAL]});assert(f.context.__CORRIDOR_BUNDLE__);const {button,note}=f.card();f.context.speakCardReading('でんしゃ',button,'電車');await settle();const expected=EXPECTED_C18[language==='ja'?0:1];observations.push({language,title:button.title,note:note.textContent,flag:button.dataset.voiceUnavailable});assert.equal(button.title,expected,'current unavailable title is missing or wrong');assert.equal(note.textContent,expected);assert.equal(button.dataset.voiceUnavailable,'current-source-required');assert.equal(f.created.length,0);assert.equal(f.deviceVoiceCalls.length,0);assert.deepEqual(f.writes,[]);}
});
test('VH CURRENT SIX · card-retry-retains-error-title',async()=>{
 for(const kind of ['card-say','mini-voice']){const f=await fixture(),g=layerFixture();bindSixVoiceLayer(f,g.layer);const {button,note}=f.card();button.id=kind;button.setAttribute('aria-label','Listen fixture');assert.equal(f.context.S.view,'reader','Original fixture starts on reader');f.context.S.view=kind==='card-say'?'review':'reader';const guardFacts={id:button.id,view:f.context.S.view,hidden:f.context.document.hidden,revealed:!!f.context.S.review.revealed,pending:!!f.context.S.review.pending,admitting:!!f.context.S.review.admitting,stackDepth:f.context.S.stack.length,strokes:!!f.context.S.strokes};assert.deepEqual(guardFacts,{id:kind,view:kind==='card-say'?'review':'reader',hidden:false,revealed:true,pending:false,admitting:false,stackDepth:0,strokes:false},'Actual current visible title-path guards');assert.equal(g.calls.length,0,'No fabricated prior voice-layer calls');
  f.context.speakCardReading('でんしゃ',button,'電車');assert.equal(g.calls.length,1);g.calls[0].onNote('stale failure sentinel','failed');assert.equal(button.title,'stale failure sentinel');assert.equal(note.textContent,'stale failure sentinel');
  f.context.speakCardReading('でんしゃ',button,'電車');assert.equal(g.calls.length,2);const expected=kind==='mini-voice'?'Listen fixture':'';const latest=g.calls[1];observations.push({kind,guardFacts,titleBeforeFirstRetry:'stale failure sentinel',titleAtRetry:latest.titleAtCall,noteAtRetry:latest.noteAtCall,flagAtRetry:latest.flagAtCall??null});
  assert.equal(latest.titleAtCall,expected,'retry title clears the old failure');assert.equal(latest.noteAtCall,'');assert.equal(latest.flagAtCall,undefined);latest.onNote('new result sentinel','could-not-play');assert.equal(button.title,'new result sentinel');assert.equal(note.textContent,'new result sentinel');assert.equal(button.dataset.voiceUnavailable,'could-not-play');assert.equal(f.created.length,0);assert.equal(f.deviceVoiceCalls.length,0);assert.deepEqual(f.writes,[]);
 }
});
test('VH CURRENT SIX · card-subsequent-error-title-stale',async()=>{
 const f=await fixture(),g=layerFixture();bindSixVoiceLayer(f,g.layer);const {button,note}=f.card();button.id='card-say';assert.equal(f.context.S.view,'reader','Original fixture starts on reader');f.context.S.view='review';const guardFacts={id:button.id,view:f.context.S.view,hidden:f.context.document.hidden,revealed:!!f.context.S.review.revealed,pending:!!f.context.S.review.pending,admitting:!!f.context.S.review.admitting,stackDepth:f.context.S.stack.length,strokes:!!f.context.S.strokes};assert.deepEqual(guardFacts,{id:'card-say',view:'review',hidden:false,revealed:true,pending:false,admitting:false,stackDepth:0,strokes:false},'Actual current visible title-path guards');assert.equal(g.calls.length,0,'No fabricated prior voice-layer calls');f.context.speakCardReading('でんしゃ',button,'電車');assert.equal(g.calls.length,1);const onNote=g.calls[0].onNote;
 onNote('stale failure sentinel','failed');assert.equal(button.title,'stale failure sentinel');assert.equal(note.textContent,'stale failure sentinel');onNote('new failure sentinel','could-not-play');observations.push({guardFacts,title:button.title,note:note.textContent,flag:button.dataset.voiceUnavailable});assert.equal(button.title,'new failure sentinel','subsequent failure updates its title');assert.equal(note.textContent,'new failure sentinel');assert.equal(button.dataset.voiceUnavailable,'could-not-play');assert.equal(f.created.length,0);assert.equal(f.deviceVoiceCalls.length,0);assert.deepEqual(f.writes,[]);
});
test('VH COPY-VOICE · absent narration adds no dead excerpt Listen control', async () => {
  for (const language of ['en', 'ja']) {
    const f = await fixture({ narration: null, language });
    const inserted = [], quote = f.el('blockquote', 'sentence-original', '最初の文。');
    quote.dataset.sourceId = 'fixture'; quote.after = (node) => inserted.push(node);
    const root = { querySelectorAll: (selector) => selector === 'blockquote.sentence-original' ? [quote] : [] };
    f.context.enhanceJapaneseProse(root);
    assert.equal(inserted.length, 0, 'pending quote must not create a Listen control');
    assert.equal(f.created.length, 0); assert.equal(f.deviceVoiceCalls.length, 0);
  }
});
