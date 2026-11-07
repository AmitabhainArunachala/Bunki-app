/** Called only by the existing verified-artifact browser harness. */
import assert from 'node:assert/strict';
import {seedBunkiBacklog} from './shared-study-backlog-fixture.mjs';
import {silenceBrowserAudio} from '../prototypes/corridor/tools/browser-audio-silence.mjs';

export async function checkSharedBacklog({browser,origin,receipt}) {
  for(const {presentation,width,height,start} of [
    {presentation:'desktop',width:1280,height:820,start:'[data-start]'},
    {presentation:'phone',width:393,height:852,start:'[data-study-all]'},
  ]) {
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
    await silenceBrowserAudio(context);
    try {
      const page=await context.newPage();page.on('pageerror',error=>receipt.errors.push(error.message));
      await page.addInitScript({content:`(() => {
        if(window!==window.top)return;
        const at=Date.parse('2026-11-02T03:00:00Z'),seed=${seedBunkiBacklog.toString()};
        const modules=Promise.all([
          import('/vendor/shared-study-engine/client/engine.mjs'),
          import('/vendor/shared-study-engine/client/vendor/engine.js'),
          import('/vendor/shared-study-engine/client/vendor/ts-fsrs.mjs'),
          fetch('/vendor/shared-study-engine/client/vendor/fsrs-pin.json').then(response=>response.json()),
        ]);
        const memory=modules.then(([api])=>api.createMemoryAdapter());
        localStorage.setItem('bunki-cloze:n2','{"format":"synthetic-preserved-legacy","cards":{"untouched":{}}}');
        window.bunkiSharedStudyHost={
          identity:{learner:'test-bunki-backlog',environment:'test-bunki-backlog',installation:'test-bunki-backlog-local',mode:'fresh'},
          presentation:${JSON.stringify(presentation)},now:()=>at,
          storage:{read:async scope=>(await memory).read(scope),compareAndSwap:async(...args)=>(await memory).compareAndSwap(...args)},
          initialize:async({store,engine})=>{
            const [api,schedulerApi,fsrs,pin]=await modules;
            window.__backlogFixture=await seed({store,engine,api,schedulerApi,fsrs,pin,at});
          },
        };
      })();`});
      // No preview query: only the explicit synthetic host opens shared study.
      // The enclosing harness separately proves the unbound normal route stays legacy.
      await page.goto(`${origin}/?deck=n2&ui=en`,{waitUntil:'domcontentloaded'});
      await page.locator('[data-shared-study-frame]').waitFor({timeout:60000});
      const frame=await(await page.locator('[data-shared-study-frame]').elementHandle()).contentFrame();
      assert(frame,'backlog bound host must mount the canonical frame');
      await frame.waitForFunction(()=>!!window.bunkiSharedStudy||!!document.querySelector('[role=alert]'),null,{timeout:60000});
      assert(await frame.evaluate(()=>!!window.bunkiSharedStudy),await frame.locator('body').innerText());
      const expected=await page.evaluate(()=>__backlogFixture.expected);
      const normal=await frame.evaluate(()=>bunkiSharedStudy.backend.queue({module:'n2'}).map(entry=>entry.taskKey));
      assert.equal(normal.length,60);assert.equal(normal[59],expected[0]);
      // Baselines intentionally contain no fabricated review history. Assert
      // the actual backlog actions, rather than overriding the first-day flag.
      assert.match(await frame.locator('[data-start]').innerText(),/Study 50/);
      assert.match(await frame.locator('[data-study-all]').innerText(),/Study all \(60\)/);
      assert.equal(await frame.evaluate(()=>frameElement.bunkiStudyPort.adapter.platform.presentation),presentation);
      const legacy=await page.evaluate(()=>localStorage.getItem('bunki-cloze:n2'));
      // The store belongs to the parent host. Clone its JSON into the frame
      // before invoking that frame's strict plain-object serializer.
      await frame.evaluate(async()=>{
        const {canonicalStringify}=await import('/vendor/shared-study-engine/client/engine.mjs');
        window.__beforeBacklogSelection=canonicalStringify(structuredClone(await bunkiSharedStudy.store.readState()));
      });
      await frame.locator(start).click();await frame.waitForSelector('[data-study=front]');
      assert.equal(await frame.evaluate(()=>bunkiSharedStudy.app.read().current.entry.taskKey),expected[0],
        `${presentation}: backlog must lead with weakest old-position60 review`);
      assert.equal(await frame.evaluate(async()=>{
        const {canonicalStringify}=await import('/vendor/shared-study-engine/client/engine.mjs');
        return canonicalStringify(structuredClone(await bunkiSharedStudy.store.readState()))===window.__beforeBacklogSelection;
      }),true,'backlog selection must not write an event or mutate a schedule');
      await page.keyboard.press('Enter');await frame.waitForSelector('[data-study=back]');
      await page.keyboard.press('4');
      await frame.waitForFunction(()=>!bunkiSharedStudy.app.read().busy&&bunkiSharedStudy.backend.readProjection().reviews.length===1&&document.querySelector('[data-study=front]'));
      assert.equal(await frame.evaluate(()=>bunkiSharedStudy.app.read().current.entry.taskKey),expected[1],
        `${presentation}: real grade boundary must retain ranked order`);
      const saved=await frame.evaluate(async()=>{
        const state=await bunkiSharedStudy.store.readState(),rows=Object.values(state.local);
        return {reviews:rows.filter(row=>row.event.type==='review').map(row=>row.event.data),
          otherWrites:rows.filter(row=>row.event.type!=='review').length,permits:Object.keys(state.projection.permits).length};
      });
      assert.equal(saved.reviews.length,1);assert.equal(saved.reviews[0].taskKey,expected[0]);
      assert.equal(saved.reviews[0].ratingPolicy,'chosen-v1');assert.equal(saved.reviews[0].rawRating,4);
      assert.equal(saved.otherWrites,0);assert.equal(saved.permits,0);
      assert.equal(await page.evaluate(()=>localStorage.getItem('bunki-cloze:n2')),legacy);
      receipt.checks.push(`bound-${presentation}-backlog-${presentation==='desktop'?'study50':'studyall'}-uses-canonical-pin-rank-and-durable-boundary`);
    } finally {await context.close();}
  }
}
