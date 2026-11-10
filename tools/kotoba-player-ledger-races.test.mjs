/* global process, URL, window, navigator, document, localStorage */
/** Real legacy controller, two actual same-origin tabs, actual Web Locks/storage. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);
const acceptance = Boolean(process.env.CI || process.env.KAIRO_SITE_DIR);
const source =
  (!acceptance && process.env.BUNKI_LEDGER_SOURCE) ||
  resolve(fileURLToPath(new URL('..', import.meta.url)));
const candidate = (!acceptance && process.env.BUNKI_LEDGER_CANDIDATE) || source;
const runtime = process.env.KAIRO_EVIDENCE_DIR
  ? join(process.env.KAIRO_EVIDENCE_DIR, 'ledger-races')
  : process.env.BUNKI_LEDGER_EVIDENCE || join(homedir(), '.dharma/bunki/ledger-races');
const options = { skip: !acceptance && !process.env.BUNKI_LEDGER_BROWSER, timeout: 45000 };

async function fixture(name) {
  if (acceptance) assert(process.env.KAIRO_EVIDENCE_DIR, 'Explicit CI evidence directory required');
  const { chromium } = createRequire(join(source, 'package.json'))('playwright-core');
  const html = `<!doctype html><meta charset="utf-8"><main id="app"></main><script type="module">
 import * as engine from '/decks/player/engine.js';
 const deck=(id,term)=>({format:'bunki-cloze-deck',version:1,id,titleJa:'合成検証',titleEn:'Synthetic regression',groups:[{id:'g1',name:'One'},{id:'g2',name:'Two'}],defaults:{mode:'read'},words:[{id:id+'-word',group:'g1',term,reading:term==='猫'?'ねこ':'いぬ',meaning:'synthetic animal',defJa:'合成の説明。',cards:[{id:'same-card-id',lv:1,type:'word',ja:term+'がいる。',ruby:[[term,'',1],['がいる。','']],en:'A synthetic animal is here.'}]},{id:id+'-second',group:'g2',term:'空',reading:'そら',meaning:'synthetic sky',defJa:'合成の空。',cards:[{id:'second-card',lv:1,type:'word',ja:'空を見る。',ruby:[['空','',1],['を見る。','']],en:'Look at a synthetic sky.'}]}]});
 window.__KP_DECKS__={'race-a':deck('race-a','猫'),'race-b':deck('race-b','犬')};
 const writes=[],set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){writes.push({key,value});return set.call(this,key,value);};
 let blockStorage=false;addEventListener('storage',event=>{if(blockStorage)event.stopImmediatePropagation();},true);
 const realRequest=navigator.locks.request.bind(navigator.locks);let requests=0,done=0,paused=0,pauseAt=0,releasePause;
 navigator.locks.request=(name,...args)=>{if(name!=='bunki-srs:answer')return realRequest(name,...args);const ordinal=++requests,callback=args.pop();return realRequest(name,...args,async lock=>{if(ordinal===pauseAt){paused=ordinal;await new Promise(resolve=>releasePause=resolve);}return callback(lock);}).finally(()=>done++);};
 const player=await import('/decks/player/mount.js');
 window.fixture={engine,decks:__KP_DECKS__,writes,
  async mount(deckId,autoStart=true){const main=document.querySelector('#app');main.replaceChildren();await player.render(main,{deckId,storage:localStorage,english:true,autoStart});},
  ledger:id=>JSON.parse(localStorage.getItem('bunki-cloze:'+id)),snapshot:()=>Object.fromEntries(Object.entries(localStorage)),
  get requests(){return requests;},get done(){return done;},get paused(){return paused;},pauseAt:value=>pauseAt=value,releasePause:()=>releasePause(),blockStorage:value=>blockStorage=value};
 </script>`;
  const root = join(source, 'prototypes/corridor');
  const server = createServer((req, res) => {
    try {
      const key = decodeURIComponent(new URL(req.url, 'http://fixture.invalid').pathname).replace(
        /^\/+/,
        '',
      );
      if (!key) {
        res.setHeader('content-type', 'text/html');
        res.end(html);
        return;
      }
      const actual =
        key === 'decks/player/mount.js'
          ? join(candidate, 'prototypes/corridor', key)
          : join(root, key);
      assert(
        resolve(actual).startsWith(
          resolve(key === 'decks/player/mount.js' ? join(candidate, 'prototypes/corridor') : root) +
            '/',
        ),
      );
      res.setHeader(
        'content-type',
        /\.(mjs|js)$/.test(extname(actual))
          ? 'text/javascript'
          : extname(actual) === '.css'
            ? 'text/css'
            : 'application/json',
      );
      res.end(readFileSync(actual));
    } catch {
      res.writeHead(404);
      res.end('fixture resource missing');
    }
  });
  let browser, context;
  const receipt = { name, source, candidate, checks: [], errors: [] };
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
    });
    context = await browser.newContext({
      serviceWorkers: 'block',
      viewport: { width: 1000, height: 900 },
    });
    await context.route('**/*', (route) =>
      route
        .request()
        .url()
        .startsWith(origin + '/')
        ? route.continue()
        : route.abort(),
    );
    const a = await context.newPage(),
      b = await context.newPage();
    for (const page of [a, b]) {
      page.on('pageerror', (error) => receipt.errors.push(error.message));
      await page.goto(origin);
      await page.waitForFunction(() => !!window.fixture);
    }
    return {
      a,
      b,
      receipt,
      async close() {
        mkdirSync(runtime, { recursive: true });
        writeFileSync(join(runtime, name + '.json'), JSON.stringify(receipt, null, 2) + '\n');
        await context.close();
        await browser.close();
        await new Promise((r) => {
          server.close(r);
          server.closeAllConnections();
        });
      },
    };
  } catch (error) {
    await context?.close();
    await browser?.close();
    await new Promise((r) => {
      server.close(r);
      server.closeAllConnections();
    });
    throw error;
  }
}
const reveal = async (page) => {
  await page.locator('#kp-reveal').click();
  await page.locator('#kp-grade-good').waitFor();
};
const grade = async (page) => {
  await page.locator('#kp-grade-good').evaluate((n) => n.click());
};
async function hold(page) {
  await page.evaluate(() => {
    window.heldReady = false;
    navigator.locks.request('bunki-srs:answer', () => {
      window.heldReady = true;
      return new Promise((r) => (window.releaseHeld = r));
    });
  });
  await page.waitForFunction(() => window.heldReady);
}
const release = (page) => page.evaluate(() => window.releaseHeld());
const settle = (page) => page.waitForTimeout(80);

test(
  'R5 pending old-deck grade is refused before ANY ledger or shared-answer write after deck switch',
  options,
  async () => {
    const f = await fixture('r5-old-owner');
    try {
      await f.a.evaluate(() => fixture.mount('race-a'));
      await reveal(f.a);
      await hold(f.b);
      await grade(f.a);
      await f.a.waitForFunction(() => fixture.requests === 1);
      await f.a.evaluate(() => fixture.mount('race-b'));
      const before = await f.a.evaluate(() => fixture.snapshot());
      await release(f.b);
      await f.a.waitForFunction(() => fixture.done === 1);
      await settle(f.a);
      const after = await f.a.evaluate(() => fixture.snapshot());
      f.receipt.checks.push({ before, after });
      assert.deepEqual(
        after,
        before,
        'A queued grade must not write old/new deck, shared reservation or preferences after owner changes',
      );
      assert.equal(await f.a.locator('#kp-card').getAttribute('data-card'), 'same-card-id');
      assert.deepEqual(f.receipt.errors, []);
    } finally {
      await f.close();
    }
  },
);
test(
  'R5 stale finally cannot clear the new owner pending grade or permit a duplicate commit',
  options,
  async () => {
    const f = await fixture('r5-new-owner-flight');
    try {
      await f.a.evaluate(() => fixture.mount('race-a'));
      await reveal(f.a);
      await hold(f.b);
      await grade(f.a);
      await f.a.waitForFunction(() => fixture.requests === 1);
      await f.a.evaluate(() => fixture.mount('race-b'));
      await reveal(f.a);
      await f.a.evaluate(() => fixture.pauseAt(2));
      await grade(f.a);
      await f.a.waitForFunction(() => fixture.requests === 2, null, { timeout: 3000 });
      await release(f.b);
      await f.a.waitForFunction(() => fixture.paused === 2 && fixture.done === 1);
      await settle(f.a);
      await grade(f.a);
      await settle(f.a);
      assert.equal(
        await f.a.evaluate(() => fixture.requests),
        2,
        'Old finally must not unlock a new-context grade while it owns the real Web Lock',
      );
      await f.a.evaluate(() => fixture.releasePause());
      await f.a.waitForFunction(() => fixture.done === 2);
      await settle(f.a);
      const ledgers = await f.a.evaluate(() => ({
        a: fixture.ledger('race-a'),
        b: fixture.ledger('race-b'),
      }));
      f.receipt.checks.push(ledgers);
      assert.equal(ledgers.a, null);
      assert.deepEqual(
        ledgers.b.log.map((row) => row.slice(0, 2)),
        [['same-card-id', 3]],
      );
      assert.deepEqual(Object.keys(ledgers.b.cards), ['same-card-id']);
      assert.deepEqual(f.receipt.errors, []);
    } finally {
      await f.close();
    }
  },
);

async function gradedThenUndone(f, { block = false, study = false } = {}) {
  await f.a.evaluate(() => fixture.mount('race-a'));
  await reveal(f.a);
  await grade(f.a);
  await f.a.waitForFunction(() => fixture.ledger('race-a')?.log.length === 1);
  await f.b.evaluate(
    ({ block, study }) => {
      fixture.blockStorage(block);
      return fixture.mount('race-a', study);
    },
    { block, study },
  );
  if (!study) assert.equal(await f.b.locator('.kp-c-new b').textContent(), '1');
  await f.a.locator('#kp-undo').click();
  await f.a.waitForFunction(
    () =>
      Object.keys(fixture.ledger('race-a').cards).length === 0 &&
      fixture.ledger('race-a').log.length === 0,
  );
  await settle(f.b);
}
test(
  'R6 real storage event adopts the valid empty Undo ledger, then settings cannot resurrect it',
  options,
  async () => {
    const f = await fixture('r6-storage-event');
    try {
      await gradedThenUndone(f);
      await f.b.waitForFunction(
        () => document.querySelector('.kp-c-new b')?.textContent === '2',
        null,
        { timeout: 3000 },
      );
      await f.b.locator('#kp-to-settings').click();
      await f.b.locator('[data-group="g2"]').uncheck();
      const empty = await f.b.evaluate(() => fixture.ledger('race-a'));
      assert.deepEqual(empty.cards, {});
      assert.deepEqual(empty.log, []);
      assert.deepEqual(empty.groupsOff, ['g2']);
      await f.b.evaluate(() => fixture.mount('race-a'));
      await reveal(f.b);
      await grade(f.b);
      await f.b.waitForFunction(() => fixture.ledger('race-a').log.length === 1);
      const next = await f.b.evaluate(() => fixture.ledger('race-a'));
      f.receipt.checks.push({ empty, next });
      assert.deepEqual(Object.keys(next.cards), ['same-card-id']);
      assert.deepEqual(
        next.log.map((r) => r.slice(0, 2)),
        [['same-card-id', 3]],
      );
      assert.deepEqual(f.receipt.errors, []);
    } finally {
      await f.close();
    }
  },
);
test(
  'R6 locked write re-reads valid empty Undo even when its storage event is withheld',
  options,
  async () => {
    const f = await fixture('r6-fresh-settings-write');
    try {
      await gradedThenUndone(f, { block: true });
      assert.equal(
        await f.b.locator('.kp-c-new b').textContent(),
        '1',
        'Control: B still has stale in-memory source',
      );
      await f.b.locator('#kp-to-settings').click();
      await f.b.locator('[data-group="g2"]').uncheck();
      const ledger = await f.b.evaluate(() => fixture.ledger('race-a'));
      f.receipt.checks.push(ledger);
      assert.deepEqual(ledger.cards, {});
      assert.deepEqual(ledger.log, []);
      assert.deepEqual(ledger.groupsOff, ['g2']);
      assert.deepEqual(f.receipt.errors, []);
    } finally {
      await f.close();
    }
  },
);
test(
  'R6 next actual locked grade cannot resurrect the undone first card/log with event withheld',
  options,
  async () => {
    const f = await fixture('r6-fresh-grade-write');
    try {
      await gradedThenUndone(f, { block: true, study: true });
      assert.equal(await f.b.locator('#kp-card').getAttribute('data-card'), 'second-card');
      await reveal(f.b);
      await grade(f.b);
      await f.b.waitForFunction(() => fixture.requests === 1 && fixture.done === 1);
      const ledger = await f.b.evaluate(() => fixture.ledger('race-a'));
      f.receipt.checks.push(ledger);
      assert.deepEqual(Object.keys(ledger.cards), ['second-card']);
      assert.deepEqual(
        ledger.log.map((r) => r.slice(0, 2)),
        [['second-card', 3]],
      );
      assert.deepEqual(f.receipt.errors, []);
    } finally {
      await f.close();
    }
  },
);
test(
  'R6 wrong identity, malformed JSON and all-invalid cards are not adopted as valid empty ledgers',
  options,
  async () => {
    const f = await fixture('r6-invalid-empty-controls');
    try {
      await f.a.evaluate(() => fixture.mount('race-a'));
      await reveal(f.a);
      await grade(f.a);
      await f.a.waitForFunction(() => fixture.ledger('race-a')?.log.length === 1);
      await f.b.evaluate(() => fixture.mount('race-a', false));
      for (const variant of ['format', 'version', 'deckId', 'cards', 'json']) {
        await f.a.evaluate((variant) => {
          const raw = fixture.engine.emptyState('race-a');
          if (variant === 'format') raw.format = 'foreign';
          if (variant === 'version') raw.version = 999;
          if (variant === 'deckId') raw.deckId = 'other';
          if (variant === 'cards') raw.cards = { bad: { state: 99 } };
          localStorage.setItem(
            'bunki-cloze:race-a',
            variant === 'json' ? 'not-json' : JSON.stringify(raw),
          );
        }, variant);
        await settle(f.b);
        assert.equal(
          await f.b.locator('.kp-c-new b').textContent(),
          '1',
          variant + ' must not silently clear current cards',
        );
      }
      assert.deepEqual(f.receipt.errors, []);
    } finally {
      await f.close();
    }
  },
);
