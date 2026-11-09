import assert from 'node:assert/strict';
import process from 'node:process';
import vm from 'node:vm';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { setTimeout, clearTimeout } from 'node:timers';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { bindStudyPresentation } from '../prototypes/corridor/shared-study-presentation.mjs';
import { decodeSharedContent, SHARED_DECKS } from '../prototypes/corridor/shared-study-content.mjs';
import { manualEntry } from '../prototypes/corridor/vendor/shared-study-engine/client/player/manual-cards.mjs';
import { studyAudioSourcePlan } from '../prototypes/corridor/vendor/shared-study-engine/client/app/study-audio.mjs';
import {
  prepareGrammarModule,
  assertGrammarFrontIntegrity,
} from '../prototypes/corridor/vendor/shared-study-engine/client/grammar/renderer.mjs';

const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);
const acceptance = Boolean(process.env.CI || process.env.KAIRO_SITE_DIR);
const root = new URL('../prototypes/corridor/', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root)));
const foreign = (value) =>
  vm.runInNewContext('JSON.parse(serialized)', { serialized: JSON.stringify(value) });
const data = {
  word: '検証',
  reading: 'けんしょう',
  meaning: 'verification',
  example: '境界を検証する。保存した文を最後まで読む。',
  note: 'Learner-authored test note',
};
const manual = manualEntry({
  id: 'test-manual:1',
  learner: 'test-presentation',
  ts: Date.parse('2026-11-09T03:00:00Z'),
  data,
});
const routes = {
  catalog: (view) => view.catalogEntries()[0],
  queue: (view) => view.queue({ module: 'kotoba' })[0],
  sitting: (view) => view.sitting({ module: 'kotoba' }).entry,
  custom: (view) => view.customSession({ mode: 'practice' }).entries[0],
};
function backendFor(entry) {
  return {
    catalogEntries: () => [entry],
    queue: () => [entry],
    sitting: () => ({ entry, show: entry.taskKey, early: false }),
    customSession: (options) => ({ options, entries: [entry] }),
  };
}

for (const [route, select] of Object.entries(routes)) {
  test(`manual ${route} entries cross realms before actual speech planning`, () => {
    const parent = foreign(manual),
      backend = backendFor(parent);
    assert.notEqual(Object.getPrototypeOf(parent), Object.prototype);
    assert.throws(() => studyAudioSourcePlan(select(backend)), /must be a plain record/);
    const view = bindStudyPresentation(backend, []),
      entry = select(view);
    assert.equal(Object.getPrototypeOf(entry), Object.prototype);
    assert.notEqual(entry, parent);
    assert.deepEqual(entry, manual);
    assert.deepEqual(studyAudioSourcePlan(entry), studyAudioSourcePlan(manual));
    assert.deepEqual(
      studyAudioSourcePlan(entry).sourceFields.map(({ fieldId, text }) => [fieldId, text]),
      [
        ['term', data.word],
        ['reading', data.reading],
        ['ja', data.example],
        ['meaning', data.meaning],
        ['note', data.note],
      ],
    );
    entry.note = 'child-only edit';
    assert.equal(parent.note, data.note);
    assert.equal(select(view).note, data.note);
  });
}

test('shipped presentation and prepared grammar identities survive every resolution route', async () => {
  const { catalog } = decodeSharedContent(
    read('data/shared-study-content.json'),
    Object.fromEntries(SHARED_DECKS.map((id) => [id, read(`decks/${id}/deck.json`)])),
    read('vendor/shared-study-engine/client/vendor/fsrs-pin.json'),
  );
  const prepared = await prepareGrammarModule(read('data/shared-study/grammar.json'), {
    identityRegistry: read('data/shared-study/registry.json'),
    reviewIndex: read('data/shared-study/grammar-reviews.json'),
  });
  const grammarTask = prepared.tasks.find((task) => task.contractId === 'grammar.meaning.v1');
  const grammarRecord = prepared.records.find((record) => record.guid === grammarTask.noteGuid);
  const grammarEntry = {
    ...catalog.find((entry) => entry.taskKey === grammarTask.taskKey),
    grammarTask,
    grammarRecord,
  };
  const shipped = catalog.find((entry) => entry.contractId === 'vocabulary.read.v1');
  for (const entry of [shipped, grammarEntry]) {
    const view = bindStudyPresentation(backendFor(foreign(entry)), [entry]);
    for (const select of Object.values(routes)) {
      assert.equal(select(view), entry);
      assert.deepEqual(studyAudioSourcePlan(select(view)), studyAudioSourcePlan(entry));
      if (entry === grammarEntry) {
        const front = {
          textContent:
            grammarRecord.pattern +
            grammarRecord.examples.find((example) => example.exampleId === grammarTask.passageId)
              .ja,
          attributes: [],
          querySelector: () => null,
          querySelectorAll: () => [],
        };
        assert.equal(
          assertGrammarFrontIntegrity(front, select(view).grammarRecord, select(view).grammarTask),
          true,
        );
      }
    }
    for (const field of ['noteGuid', 'contractId', 'passageId', 'contentRevision']) {
      const mismatched = bindStudyPresentation(
        backendFor(foreign({ ...entry, [field]: 'wrong' })),
        [entry],
      );
      for (const select of Object.values(routes))
        assert.throws(() => select(mismatched), /presentation-identity-mismatch/);
    }
  }
});

test('presentation binding retains empty selections and backend-owned session metadata', () => {
  const options = { mode: 'practice' },
    step = { pause: true },
    session = { options, entries: [] };
  const backend = {
    catalogEntries: () => [],
    queue: () => [],
    sitting: () => step,
    customSession: () => session,
    submitCommand: () => 'unchanged',
  };
  const view = bindStudyPresentation(backend, []);
  assert.deepEqual(view.catalogEntries(), []);
  assert.deepEqual(view.queue(), []);
  assert.deepEqual(view.sitting(), step);
  assert.deepEqual(view.customSession(options), session);
  assert.equal(view.customSession(options).options, options);
  assert.equal(view.submitCommand, backend.submitCommand);
  assert.throws(
    () => bindStudyPresentation(backend, [manual, manual]),
    /duplicate-presentation-task/,
  );
});

test(
  'Today manual save and custom practice use child-realm entries in an actual iframe',
  {
    skip: !acceptance && !process.env.BUNKI_TEST_CHROME,
    timeout: 90000,
  },
  async () => {
    const { chromium } = createRequire(import.meta.url)('playwright-core');
    const executable =
      process.env.CHROMIUM_PATH ||
      (!acceptance && process.env.BUNKI_TEST_CHROME) ||
      chromium.executablePath();
    const child = `
    import {bindStudyPresentation} from '/prototypes/corridor/shared-study-presentation.mjs';
    import {mountStudyApp} from '/prototypes/corridor/vendor/shared-study-engine/client/app/app.mjs';
    import {studyAudioSourcePlan} from '/prototypes/corridor/vendor/shared-study-engine/client/app/study-audio.mjs';
    const check=(value,message)=>{if(!value)throw Error(message);};
    const wait=async predicate=>{for(let i=0;i<500;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI wait timed out');};
    let app;
    try{
      const adapter=parent.adapter,catalog=structuredClone(adapter.catalog),backend=bindStudyPresentation(adapter.backend,catalog);
      const themes=await fetch('/prototypes/corridor/vendor/shared-study-engine/themes/tokens.json').then(r=>r.json());
      app=mountStudyApp(document.querySelector('#app'),{backend,catalog,themes,platform:adapter.platform,now:adapter.now,initialModule:'kotoba'});
      check(app.read().screen==='today','manual creation starts on Today');
      document.querySelector('[data-custom-session]>summary').click();
      document.querySelector('[data-manual-card]>summary').click();
      for(const [name,value] of Object.entries(${JSON.stringify(data)})){
        const input=document.querySelector('[data-manual-field='+name+']');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
      }
      const form=document.querySelector('[data-manual-form]'),save=document.querySelector('[data-manual-save]');
      check(form.checkValidity(),'manual form must contain valid input');
      check(!save.disabled,'manual save must be available');
      let submitted=false;form.addEventListener('submit',()=>{submitted=true;},{once:true});
      save.click();check(submitted,'manual save must submit the form');
      await wait(()=>!app.read().busy&&adapter.backend.catalogEntries().some(entry=>entry.manual));
      const raw=adapter.backend.catalogEntries().find(entry=>entry.manual);
      check(Object.getPrototypeOf(raw)!==Object.prototype,'manual source must belong to parent');
      let rejected=false;try{studyAudioSourcePlan(raw);}catch(error){rejected=/must be a plain record/.test(error.message);}
      check(rejected,'negative control must reject parent-realm manual data');
      const selected=[backend.catalogEntries().find(entry=>entry.manual),backend.queue({module:'kotoba'})[0],
        backend.sitting({module:'kotoba'}).entry,backend.customSession({mode:'practice',filters:{module:'kotoba'}}).entries[0]];
      for(const entry of selected){
        check(entry?.manual&&Object.getPrototypeOf(entry)===Object.prototype,'each route must copy manual data into child');
        check(studyAudioSourcePlan(entry).sourceFields.find(field=>field.fieldId==='ja').text===raw.ja,'complete manual passage must be planned');
      }
      check(backend.catalogEntries().find(entry=>!entry.manual)===catalog[0],'shipped entry keeps child identity');
      const choose=(selector,value)=>{const input=document.querySelector(selector);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));};
      choose('[data-session-mode]','practice');choose('[data-session-filter=module]','kotoba');
      document.querySelector('[data-session-start]').click();
      await wait(()=>app.read().screen==='study'&&!app.read().busy);
      check(app.read().current.entry.manual,'practice must select saved manual card');
      check(!app.read().current.revealed,'practice starts on prompt');
      document.querySelector('[data-reveal]').click();
      await wait(()=>app.read().current.revealed);
      const plan=studyAudioSourcePlan(app.read().current.entry);
      check(plan.sourceFields.find(field=>field.fieldId==='ja').text===raw.ja,'revealed answer has complete speech plan');
      check(document.querySelector('[data-manual-back]').textContent.includes(raw.meaning),'revealed manual definition retained');
      check(adapter.backend.readProjection().reviews.length===0,'save and reveal never grade');
      parent.finish({status:'passed',routes:selected.length,foreignRejected:rejected,taskKey:raw.taskKey});
    }catch(error){parent.finish({status:'failed',error:error.stack,diagnostic:{busy:app?.read().busy,pending:app?.read().pendingIntent,manuals:parent.adapter.backend.catalogEntries().filter(entry=>entry.manual).length,text:document.body.innerText}});}
    finally{app?.dispose();parent.adapter.backend.dispose();}
  `;
    const html = `<!doctype html><meta charset="utf-8"><pre id="result">pending</pre><script type="module">
    import {createBunkiStudyAdapter} from '/prototypes/corridor/study-engine-adapter.mjs';
    import {createSharedStudyTestHost,QA_HOST_MARKER} from '/prototypes/corridor/shared-study-test-host.mjs';
    import {createMemoryAdapter} from '/prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';
    window.finish=value=>document.querySelector('#result').textContent=JSON.stringify(value);
    try{
      const read=path=>fetch('/prototypes/corridor/'+path).then(r=>r.json());
      const fixture=await read('tools/fixtures/shared-srs-contracts.json'),pin=await read('vendor/shared-study-engine/client/vendor/fsrs-pin.json');
      const card=fixture.cards.find(entry=>entry.contractId==='vocabulary.read.v1');
      const catalog=[{...card,ja:card.sentence,contentReady:true}];
      const content={pin,catalog,registry:{tasks:catalog.map(({taskKey,noteGuid,contractId,passageId,lexemeId})=>({taskKey,noteGuid,contractId,passageId,lexemeId})),notes:catalog.map(({noteGuid,module})=>({noteGuid,module})),passages:[],examples:[]}};
      const host=await createSharedStudyTestHost({marker:QA_HOST_MARKER,runId:'manual-realm',storageFactory:()=>createMemoryAdapter()});
      window.adapter=await host.withAdapter(binding=>createBunkiStudyAdapter({...binding,content}));
      const frame=document.createElement('iframe');frame.srcdoc=${JSON.stringify('<main id="app"></main><script type="module">' + child + '</script>').replaceAll('</script>', '<\\/script>')};document.body.append(frame);
    }catch(error){finish({status:'failed',error:error.stack});}
  </script>`;
    const server = createServer((req, res) => {
      try {
        const path = new URL(req.url, 'http://localhost').pathname;
        if (path === '/') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
          return;
        }
        if (!path.startsWith('/prototypes/corridor/')) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.setHeader(
          'Content-Type',
          /\.(mjs|js)$/.test(path)
            ? 'text/javascript'
            : path.endsWith('.css')
              ? 'text/css'
              : 'application/json',
        );
        res.end(readFileSync(new URL('..' + path, import.meta.url)));
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    const profile = mkdtempSync(join(tmpdir(), 'bunki-manual-realm-'));
    let browser, socket;
    try {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      browser = spawn(
        executable,
        [
          '--headless',
          '--no-first-run',
          '--disable-background-networking',
          '--disable-extensions',
          '--disable-sync',
          `--user-data-dir=${profile}`,
          '--remote-debugging-port=0',
          'about:blank',
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
      const endpoint = await new Promise((resolve, reject) => {
        let stderr = '';
        const timeout = setTimeout(
          () => reject(Error('Chrome startup timed out: ' + stderr)),
          10000,
        );
        browser.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        browser.stderr.on('data', (chunk) => {
          stderr += chunk;
          const url = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
          if (url) {
            clearTimeout(timeout);
            resolve(url);
          }
        });
      });
      socket = new globalThis.WebSocket(endpoint);
      await once(socket, 'open');
      const pending = new Map();
      let sequence = 0;
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data),
          request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        clearTimeout(request.timeout);
        if (message.error) request.reject(Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      });
      const send = (method, params = {}, sessionId) =>
        new Promise((resolve, reject) => {
          const id = ++sequence,
            timeout = setTimeout(() => {
              pending.delete(id);
              reject(Error('Chrome command timed out: ' + method));
            }, 30000);
          pending.set(id, { resolve, reject, timeout });
          socket.send(JSON.stringify({ id, method, params, sessionId }));
        });
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      await send('Page.enable', {}, sessionId);
      const loaded = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.removeEventListener('message', onMessage);
          reject(Error('Fixture load timed out'));
        }, 20000);
        const onMessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.sessionId === sessionId && message.method === 'Page.loadEventFired') {
            clearTimeout(timeout);
            socket.removeEventListener('message', onMessage);
            resolve();
          }
        };
        socket.addEventListener('message', onMessage);
      });
      await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` }, sessionId);
      await loaded;
      const evaluated = await send(
        'Runtime.evaluate',
        {
          expression: `(async()=>{for(let i=0;i<1000;i++){const text=document.querySelector('#result')?.textContent;if(text&&text!=='pending')return JSON.parse(text);await new Promise(r=>setTimeout(r,10));}throw Error('Fixture result timed out');})()`,
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
      );
      assert.equal(
        evaluated.exceptionDetails,
        undefined,
        JSON.stringify(evaluated.exceptionDetails),
      );
      const result = evaluated.result.value;
      assert.equal(result.status, 'passed', JSON.stringify(result));
      assert.equal(result.routes, 4);
      assert.equal(result.foreignRejected, true);
    } finally {
      socket?.close();
      if (browser && browser.exitCode === null) {
        const exited = once(browser, 'exit');
        browser.kill('SIGTERM');
        await exited;
      }
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
      rmSync(profile, { recursive: true, force: true });
    }
  },
);
