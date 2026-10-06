/** Real-browser contract: study lookup waits for durable assistance; timed
 * mode exposes no dictionary, ruby, translation or explanation affordance. */
/* global fixture */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { buildCorridorModules } from '../../../scripts/build-reading-module.mjs';
import { resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = resolve(process.env.KAIRO_EVIDENCE_DIR || resolve(homedir(), '.dharma/bunki_assessment/2026-09-29/study'));
assert(evidence.startsWith(resolve(homedir(), '.dharma') + '/'), 'Evidence must live under ~/.dharma');
mkdirSync(evidence, { recursive: true });
const stage = mkdtempSync(resolve(evidence, 'run-')), assets = new Map();
const site = process.env.KAIRO_SITE_DIR ? resolveCorridorSite() : null;
const identity = site ? JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8')) : null;
const modules = site ? identity.files.filter(file => file.path.startsWith('modules/')).map(file => ({
  path: file.path, bytes: readFileSync(resolve(site, file.path)),
})) : buildCorridorModules(root);
for (const module of modules) {
  assets.set(module.path, module.bytes); mkdirSync(dirname(resolve(stage, module.path)), { recursive: true });
  writeFileSync(resolve(stage, module.path), module.bytes);
}
for (const name of ['assessment-view.mjs', 'assessment-v2-controller.mjs', 'corridor.css'])
  assets.set(name, readFileSync(site ? resolve(site, name) : resolve(root, 'prototypes/corridor', name)));
const core = await import(pathToFileURL(resolve(stage, 'modules/assessment-core.mjs')));
const rights = core.unknownAssessmentRights();
const provenance = { kind: 'original-human', authorRef: 'synthetic-study-fixture', processRef: null, sources: [] };
const items = [0, 1].map(index => core.createItemVersion({ format: 'kairo-assessment-item', v: 1,
  id: `study-item-${index}`, rights, provenance, skill: 'vocabulary', task: 'kanji-reading',
  prompt: '【　】の言葉の読み方として最もよいものを、一つ選んでください。\n学校で【日本語】を学ぶ。',
  translatedInstruction: 'Choose the correct reading.', rationale: 'Synthetic answer rationale.',
  passages: [], media: [], subjects: ['word:日本語'],
  response: { kind: 'selected', options: [{ id: 'a', text: 'にほんご' }, { id: 'b', text: 'にっぽんことば' }], answerOptionId: 'a' },
}));
const form = core.createFormVersion({ format: 'kairo-assessment-form', v: 1, id: 'study-fixture', rights, provenance,
  title: 'Synthetic study fixture', exam: { family: 'jlpt', track: 'N1' }, scope: 'section-practice', blueprintId: null,
  items, passages: [], media: [], sections: [{ id: 'vocabulary', title: '文字・語彙', skill: 'vocabulary', itemIds: items.map(item => item.id) }],
  timingBlocks: [{ id: 'written', sectionIds: ['vocabulary'], durationMs: 60_000,
    clock: 'elapsed-including-interruptions', authority: { kind: 'authoring-rule', ruleId: 'synthetic-study' } }],
  authoring: { policyVersion: 'synthetic-study', countsAre: 'authoring-rules', requirements: [] },
});
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Assessment study contract</title>
<link rel="stylesheet" href="/corridor.css"><body><main id="main"></main><script type="module">
import * as engine from '/assessment-v2-controller.mjs';
import { createAssessmentView } from '/assessment-view.mjs';
const form=${JSON.stringify(form)}, scope={accountId:'study-test',learnerId:'study-test'};
const mode=new URLSearchParams(location.search).get('mode')||'practice', now=Date.parse('2026-09-29T00:00:00Z');
let elapsed=0, busy=false, reject=false, leaveOnSave=false;
let library=JSON.parse(localStorage.getItem(mode)||'null')||engine.startAssessmentV2(engine.createAssessmentLibraryV2({scope}),form,
  {scope,attemptId:'study-'+mode,mode,now,monotonicMs:0,clockSessionId:'study-clock',priorExposure:'none-reported',
  editorialAtStart:{status:'unreviewed',policyVersion:null,decisionRevisionIds:[]}});
const trace=[], current=()=>engine.selectAssessmentV2(library);
const apply=action=>{elapsed+=100;library=engine.commandAssessmentV2(library,{scope,attemptId:library.activeAttemptId,
  expectedRevisionId:current().attempt.revisionId,now:now+elapsed,monotonicMs:elapsed,clockSessionId:'study-clock',action});
  localStorage.setItem(mode,JSON.stringify(library));trace.push('saved:'+action.kind);};
const draw=()=>{document.getElementById('main').replaceChildren();room.render(document.getElementById('main'));};
const host={english:()=>true,owned:()=>true,render:draw,pending:()=>busy,notice:()=>null,selection:current,library:()=>library,
  catalog:async()=>({entries:[],sources:[]}),delivery:()=>({units:[]}),remaining:selected=>selected.remainingMs,
  action:async action=>{if(reject)return false;busy=true;try{apply(action);
    if(leaveOnSave&&action.kind==='dictionary-lookup'){apply({kind:'visit',itemId:form.items[1].id});leaveOnSave=false;}
    return true;}finally{busy=false;}},followup:()=>null,received:()=>[],leave:()=>{},
  assistance:(selected,itemId)=>engine.assessmentItemAssistanceV2(selected.attempt,itemId),
  explanation:(attemptId,itemId)=>engine.selectAssessmentExplanationV2(library,attemptId,itemId),
  independence:engine.assessmentIndependenceV2,
  appendLookupText:(container,text,context)=>{if(!text)return;const control=document.createElement('button');
    control.type='button';control.textContent=text;control.className='fixture-lookup';control.dataset.role=context.role;
    control.addEventListener('click',async()=>{if(!await context.beforeOpen())return;
      trace.push('lookup-open');const peek=document.createElement('aside');peek.id='peek';peek.textContent='Reading and meaning';document.body.append(peek);});
    container.append(control);}};
const room=createAssessmentView(host);draw();window.fixture={current,trace,draw,apply,
  reject:value=>{reject=value;},leaveOnSave:()=>{leaveOnSave=true;}};
</script></body></html>`;
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname.slice(1);
  if (!path) { response.setHeader('content-type', 'text/html'); response.end(html); return; }
  if (!assets.has(path)) { response.writeHead(404).end(); return; }
  response.setHeader('content-type', path.endsWith('.css') ? 'text/css' : 'text/javascript'); response.end(assets.get(path));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`, checks = [];
try {
  for (const [name, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await browserType.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin); await page.locator('.exam-paper').waitFor();
      assert.equal(await page.locator('main').getAttribute('data-exam-mode'), 'practice');
      assert.equal(await page.locator('.exam-target').innerText(), '日本語');
      assert.match(await page.locator('.exam-task-heading').innerText(), /問題 1/u);
      assert.match(await page.locator('.exam-scope-note').innerText(), /not a complete JLPT/u);
      assert.equal(await page.locator('.exam-paper button button').count(), 0);
      assert.equal(await page.locator('ruby,rt,#exam-why-sheet').count(), 0);
      assert.equal(await page.locator('.exam-paper').innerText().then(text => text.includes('Synthetic answer rationale.')), false);
      await page.evaluate(() => fixture.reject(true));
      await page.locator('.exam-target .fixture-lookup').click();
      await page.locator('.exam-notice').waitFor();
      assert.equal(await page.locator('#peek').count(), 0);
      assert.deepEqual(await page.evaluate(() => fixture.trace), []);
      await page.evaluate(() => fixture.reject(false));
      await page.locator('.exam-target .fixture-lookup').click(); await page.locator('#peek').waitFor();
      assert.deepEqual(await page.evaluate(() => fixture.trace), ['saved:dictionary-lookup', 'lookup-open']);
      assert.equal(await page.evaluate(() => fixture.current().attempt.answers[0].response.kind), 'unanswered');
      await page.locator('[data-exam-option="b"]').click(); await page.locator('[data-exam-option="a"]').click();
      assert.equal(await page.evaluate(() => fixture.current().attempt.answers[0].response.optionId), 'a');
      await page.reload(); await page.locator('.exam-lookup-assisted').waitFor();
      assert.equal(await page.locator('#exam-why-sheet').count(), 0);
      assert.equal(await page.locator('[data-exam-option="b"]').isEnabled(), true);
      await page.screenshot({ path: resolve(stage, `${name}-study.png`) });
      checks.push(`${name}: study lookup is durable, survives reload, and never locks a response or reveals its key`);
      const timed = await context.newPage(); await timed.goto(origin + '/?mode=timed'); await timed.locator('.exam-paper').waitFor();
      assert.equal(await timed.locator('main').getAttribute('data-exam-mode'), 'timed');
      assert.equal(await timed.locator('.fixture-lookup,ruby,rt,.exam-instruction,#exam-why').count(), 0);
      await timed.locator('[data-exam-option="a"]').click();
      assert.equal(await timed.locator('#exam-why').count(), 0);
      checks.push(`${name}: timed mode has no lookup, furigana, translation or explanation, before or after answering`);
      await context.close();
      const raceContext = await browser.newContext(), race = await raceContext.newPage();
      await race.goto(origin); await race.locator('.exam-paper').waitFor();
      await race.evaluate(() => fixture.leaveOnSave()); await race.locator('.exam-target .fixture-lookup').click();
      await race.waitForFunction(() => fixture.current().attempt.cursor.itemId === 'study-item-1');
      assert.equal(await race.locator('#peek').count(), 0);
      checks.push(`${name}: cursor change during persistence prevents a stale lookup reveal`);
      assert.deepEqual(errors, []); await raceContext.close();
    } finally { await browser.close(); }
  }
  writeFileSync(resolve(stage, 'result.json'), JSON.stringify({ passed: checks.length, failed: 0, checks,
    ...(identity ? { artifactSha256: identity.artifactSha256, gitSha: identity.gitSha } : {}) }, null, 2));
  console.log(`Assessment study: ${checks.length}/${checks.length} passed. ${resolve(stage, 'result.json')}`);
} finally { await new Promise(done => server.close(done)); }
