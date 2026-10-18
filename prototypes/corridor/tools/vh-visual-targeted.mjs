/** VH-1 target: actual shelf/line-box mutation controls, never a whole-app acceptance. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { shelfContract, shelfEvidence, shelfMutationControls, mixedScriptMutationControl, loadMixedLexemes, scopeResult } from './vh-visual-contracts.mjs';
assert(!process.argv.slice(2).length,'VH visual target has no selectors');
const site=resolveCorridorSite(),out=resolveCorridorEvidence();
const identity=JSON.parse(readFileSync(resolve(site,'build-identity.json')));
const runId=process.env.KAIRO_GATE_RUN_ID||randomUUID();
const names=process.env.KAIRO_BROWSER&&process.env.KAIRO_BROWSER!=='all'?[process.env.KAIRO_BROWSER]:['chromium','webkit'];
assert(names.every(name=>['chromium','webkit'].includes(name)));
const rows=JSON.parse(readFileSync(resolve(site,'data/articles/index.json'))).articles;
const queue=JSON.parse(readFileSync(new URL('../../../docs/content/feed-review-queue.json',import.meta.url)));
const contract=shelfContract(rows,queue),lexemes=loadMixedLexemes(site);
const host=await startCorridorDev(0),results=[],versions={};
const days=['2026-10-19','2026-10-20','2026-10-21','2026-10-22'];
const expectedCases=names.flatMap(engine=>['bi','ja'].flatMap(lang=>[
  ...[320,390].map(width=>`${engine}/${lang}/${width}/mixed-script-verb-split`),
  ...days.flatMap((day,index)=>['drop-duplicate-hides-omission','series-book-order-swapped',...(index===1?['day-two-drop-order-drift']:[])].map(id=>`${engine}/${lang}/${day}/${id}`)),
]));
try {
  for(const engine of names) {
    const browser=await({chromium,webkit})[engine].launch();versions[engine]=browser.version();
    try {
      for(const lang of ['bi','ja']) {
        const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
        await silenceBrowserAudio(context);
        const errors=[];const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
        await context.addInitScript(()=>localStorage.setItem('kairo-word-ladder-demo-v1','1'));
        await context.route('**/*',route=>new URL(route.request().url()).origin===host.origin?route.continue():route.abort());
        try {
          await page.goto(`${host.origin}/?entry=shelf&ui=${lang}`);
          await page.waitForFunction(()=>document.body.dataset.ready==='1',null,{timeout:60000});
          for(const width of [320,390]) {
            await page.setViewportSize({width,height:844});
            const result=await mixedScriptMutationControl(page,{engine,lang,width},lexemes);
            results.push({...result,caseId:`${engine}/${lang}/${width}/${result.id}`});
          }
          await page.setViewportSize({width:390,height:844});
          let prefix;
          for(const [dayIndex,day] of days.entries()) {
            await page.evaluate(day=>localStorage.setItem('kairo-shelf-day',day),day);
            await page.reload();await page.waitForFunction(()=>document.body.dataset.ready==='1',null,{timeout:60000});
            await page.locator('#shelf-reading-results .shelf-item').first().waitFor();
            const ids=await page.locator('#shelf-reading-results .shelf-item').evaluateAll(nodes=>nodes.map(node=>node.dataset.passage));
            const baseline=shelfEvidence({...contract,ids,prefix});prefix??=baseline.adjustedPrefix;
            const controls=await shelfMutationControls(page,contract,rows,{day,dayIndex,engine,lang});
            for(const result of controls)results.push({...result,baseline,passed:result.passed&&baseline.roster&&baseline.blocks&&baseline.series&&baseline.order,
              caseId:`${engine}/${lang}/${day}/${result.id}`});
          }
          if(errors.length)results.push({caseId:`${engine}/${lang}/page-errors`,passed:false,errors});
        }finally{await context.close();}
      }
    }finally{await browser.close();}
  }
}catch(error){results.push({caseId:'infrastructure-error',passed:false,error:String(error.stack||error)});}
finally{
  await host.close();
  const outcome=scopeResult({expected:expectedCases,observed:results.map(row=>row.caseId),passed:results.every(row=>row.passed),diagnostic:true});
  writeFileSync(resolve(out,'vh-visual-targeted.json'),JSON.stringify({schemaVersion:1,runId,site,sourceSha:identity.gitSha,artifactSha256:identity.artifactSha256,
    verifierSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),requestedScope:'VH-1 targeted controls only',engines:names,versions,...outcome,results},null,2)+'\n');
  console.log(`${results.filter(row=>row.passed).length}/${results.length} targeted controls passed; ${out}`);
  process.exitCode=outcome.exitCode;
}
