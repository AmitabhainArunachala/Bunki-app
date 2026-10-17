/** G3: prose has paragraph semantics, one sequential stop and an explicit word selection.
 * Native WebKit AX uses DOM.getAccessibilityPropertiesForNode, not Playwright's DOM-derived ariaSnapshot.
 * The optional --source-fixture mode checks the owned controller while a writer is active; it is not build acceptance.
 * Default: KAIRO_SITE_DIR + KAIRO_ARTIFACT_SHA256 pin the real reader. All output is external.
 */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';
const require = createRequire(import.meta.url);
const fixtureMode = process.argv.includes('--source-fixture');
assert(fixtureMode || (process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256), 'Pin a built site or explicitly use --source-fixture');
const evidence = resolveCorridorEvidence();
const site = fixtureMode ? null : resolveCorridorSite();
let fixtureHtml, fixtureJs;
if (fixtureMode) {
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../corridor.js'), 'utf8');
  const ts = require('typescript');
  const ast = ts.createSourceFile('corridor.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const wanted = ['proseWordRovers', 'focusProseWord', 'installProseWordRoving', 'setLookupStop', 'japaneseLookupHelpId', 'installReaderRoving', 'appendJapaneseLookup', 'enhanceJapaneseProse', 'phoneticAnnotationRanges', 'wireReaderWordMenu', 'lookupWordKey'];
  const declarations = new Map();
  for (const statement of ast.statements) {
    const names = ts.isFunctionDeclaration(statement) ? [statement.name?.text] : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map(d => d.name.getText(ast)) : [];
    for (const name of names) if (wanted.includes(name)) declarations.set(name, statement.getText(ast));
  }
  assert.deepEqual(wanted.filter(name => !declarations.has(name)), []);
  fixtureHtml = `<button id="before">Before</button><div id="reader"><span class="tok" data-para="0" data-prose-label="日本語" aria-haspopup="dialog" aria-describedby="fixture-help" aria-keyshortcuts="Shift+F10" tabindex="-1">日本語</span>を<span class="tok" data-para="0" data-prose-label="読む">読む</span>。<span class="para-break"></span><span class="tok" data-para="1" data-prose-label="次">次</span>の段落。</div>
    <p id="lookup" data-lookup-block="true"><span class="japanese-lookup-word" data-lookup-text="辞書" aria-haspopup="dialog" aria-describedby="fixture-help">辞書</span>の<span class="gs-word" data-prose-label="語">語</span>を<span class="japanese-lookup-word" data-lookup-text="開く">開く</span>。</p><button id="after">After</button><span hidden id="fixture-help">Word help</span>
    <section id="enhance"><p id="fragment">日本語は<b>説明</b>の言葉。</p><p id="mixed"><span class="sentence-tok" data-prose-label="令和">令和</span>の説明。</p><ul><li id="native-list">日本語の説明。</li></ul><dl><dt>Term</dt><dd id="native-definition">日本語の説明。</dd></dl></section>
    <p id="detached"></p><ul><li id="reference-list">English</li></ul><dl><dt>Term</dt><dd id="reference-definition">English</dd></dl>`;
  // Only fixture setup extracts source. The pinned browser path observes the artifact's
  // behavior without requiring implementation names or parsing its source. Menu actions
  // are outside this fragment fixture; the existing application verifiers exercise them.
  fixtureJs = `const tx=(_ja,en)=>en; const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
    const S={view:'shelf'},articleNarration=null; const readerWordKey=()=>{};
    ${[...declarations.values()].join('\n')}
    installReaderRoving(document.getElementById('reader'));
    installProseWordRoving(document.getElementById('lookup'),'.japanese-lookup-word,.gs-word');
    installProseWordRoving(document.getElementById('lookup'),'.japanese-lookup-word');
    installProseWordRoving(document.getElementById('mixed'),'.sentence-tok');
    enhanceJapaneseProse(document.getElementById('enhance'));
    const detached=document.createElement('span');appendJapaneseLookup(detached,'日本語',{block:document.getElementById('detached')});document.getElementById('detached').append(detached);
    window.events={click:0,menu:0,direct:0};
    for(const w of document.querySelectorAll('#reader .tok,#lookup .japanese-lookup-word,#lookup .gs-word')){
      w.addEventListener('click',()=>events.click++);w.addEventListener('contextmenu',e=>{e.preventDefault();events.menu++;});
      if(w.matches('.japanese-lookup-word'))w.addEventListener('focus',()=>setLookupStop(w));
      w.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();events.direct++;}});
    }`;

}
const story = 'kantei:jp-105-actions-202609-25startup';
const identity = site ? JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8')) : null;
const receipt = { mode: fixtureMode ? 'source-controller-fixture' : 'pinned-reader', verifierHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), verifierSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'), sourceHead: identity?.gitSha || null, sourceDirty: identity?.sourceDirty ?? null, artifact: identity?.artifactSha256 || null, sourceAsset: identity?.sourceAssetSha256 || null, rows: [], engines: {}, limitations: 'Native browser AX and keyboard evidence; physical VoiceOver swipe/read-all remains a human check.' };
let host;
const check = (id, ok, observed) => { receipt.rows.push({ id, ok: !!ok, observed }); console.log(`${ok ? 'ok' : 'FAIL'} ${id}${ok ? '' : ` ${JSON.stringify(observed).slice(0, 350)}`}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const readerSelector = '#reader [data-reader-prose]';
async function prepare(page) {
  if (fixtureMode) { await page.setContent(fixtureHtml); await page.addScriptTag({ content: fixtureJs }); return; }
  await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  const direct = page.locator(`[data-passage="${story}"]:not([data-recommendation]) .shelf-open`).first();
  if (await direct.count()) await direct.click();
  else { await openShelfTools(page); await page.locator('#shelf-reading-search').fill('スタートアップ大賞'); await page.locator('#shelf-reading-search').press('Enter'); await page.locator(`#shelf-reading-results [data-passage="${story}"] .shelf-open`).first().click(); }
  await page.locator(readerSelector).first().waitFor();
}
async function keyboardChecks(engine, browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  if (!fixtureMode) await context.addInitScript(() => { localStorage.setItem('kairo-word-ladder-demo-v1', '1'); });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await prepare(page);
    const paragraph = page.locator(readerSelector).first();
    const shape = await paragraph.evaluate(p => ({ tag: p.tagName, tab: p.tabIndex, words: [...p.querySelectorAll('.tok[data-para]')].map(w => ({ tag: w.tagName, tab: w.tabIndex, role: w.getAttribute('role'), name: w.getAttribute('aria-label') })) }));
    check(`${engine}/paragraph-stop`, shape.tag === 'P' && shape.tab === 0 && shape.words.length > 0 && shape.words.every(w => w.tag === 'SPAN' && w.tab === -1 && w.role === 'presentation' && !w.name), shape);
    await paragraph.focus(); await page.keyboard.press('ArrowRight');
    const first = await page.evaluate(() => ({ role: document.activeElement.getAttribute('role'), selected: document.activeElement.dataset.proseSelected, name: document.activeElement.getAttribute('aria-label'), index: document.activeElement.dataset.index }));
    check(`${engine}/selected-word`, first.role === 'group' && first.selected === 'true' && !!first.name, first);
    await page.keyboard.press('End'); await page.keyboard.press('Home');
    check(`${engine}/home-restores-first`, await page.evaluate(name => document.activeElement.getAttribute('aria-label') === name, first.name), first);
    if (fixtureMode) {
      await page.keyboard.press('Enter'); await page.keyboard.press('Space'); await page.keyboard.press('Shift+F10'); await page.keyboard.press('Control+Enter');
      const events = await page.evaluate(() => window.events);
      check(`${engine}/actions-once`, events.click === 2 && events.menu === 1 && events.direct === 1, events);
    }
    await page.keyboard.press('Tab');
    const afterTab = await page.evaluate(() => ({ paragraph: !!document.activeElement.matches('[data-prose-roving]'), selected: document.querySelectorAll('[data-prose-selected]').length, stops: [...document.querySelectorAll('#reader .tok')].filter(w => w.tabIndex >= 0).length }));
    check(`${engine}/tab-leaves-word`, afterTab.paragraph && !afterTab.selected && !afterTab.stops, afterTab);
    // A nonfocusable idle span must be selected before restoring focus. Real repaint/mini routes
    // exercise this same helper in the assessment and reader verifiers.
    if (fixtureMode) {
      await page.evaluate(() => focusProseWord(document.querySelector('#reader .tok')));
      check(`${engine}/restored-word-exposed`, await page.evaluate(() => document.activeElement.getAttribute('role') === 'group' && document.activeElement.dataset.proseSelected === 'true'));
      await page.locator('#lookup').focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
      const union = await page.evaluate(() => ({ className: document.activeElement.className, name: document.activeElement.getAttribute('aria-label') }));
      check(`${engine}/lookup-focus-preserves-union`, union.className === 'gs-word' && union.name === '語', union);
      const inserted = await page.evaluate(() => [...document.querySelectorAll('#fragment .japanese-lookup-word,#detached .japanese-lookup-word')].map(w => ({ role: w.getAttribute('role'), tab: w.hasAttribute('tabindex'), aria: w.getAttributeNames().filter(name => name.startsWith('aria-')) })));
      check(`${engine}/detached-words-start-retired`, inserted.length > 1 && inserted.every(w => w.role === 'presentation' && !w.tab && !w.aria.length), inserted);
      await page.locator('#mixed').focus(); await page.keyboard.press('Home');
      const mixed = await page.evaluate(() => ({ nested: document.querySelectorAll('.sentence-tok .japanese-lookup-word').length, first: document.activeElement.className, name: document.activeElement.getAttribute('aria-label') }));
      check(`${engine}/sentence-identity-survives-enhancement`, mixed.nested === 0 && mixed.first === 'sentence-tok' && mixed.name === '令和', mixed);
      await page.keyboard.press('End');
      check(`${engine}/mixed-paragraph-reaches-generic-words`, await page.evaluate(() => document.activeElement.matches('#mixed .japanese-lookup-word')));
      const native = await page.locator('#native-list,#native-definition').evaluateAll(nodes => nodes.map(n => ({ tag: n.tagName, role: n.getAttribute('role'), tab: n.tabIndex })));
      check(`${engine}/native-list-definition-semantics`, native.length === 2 && native.every(n => !n.role && n.tab === 0), native);
    }
    await paragraph.focus();
    check(`${engine}/no-page-errors`, errors.length === 0, errors);
  } finally { await context.close(); }
}
/** Direct inspector transport to our own isolated WebKit process. Playwright 1.63 no longer exposes page.accessibility.
 * Messages and AX properties are WebKit's native protocol, not an accessibility model computed in page JavaScript. */
async function nativeWebKit() {
  const child = spawn(webkit.executablePath(), ['--inspector-pipe', '--headless', '--no-startup-window'], { detached: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let serial = 0, buffer = Buffer.alloc(0), target, proxy;
  const pending = new Map(), stderr = [];
  child.stderr.on('data', data => stderr.push(data.toString()));
  function dispatch(message) {
    if (message.id && pending.has(message.id)) { const callback = pending.get(message.id); pending.delete(message.id); message.error ? callback.reject(message.error) : callback.resolve(message.result); }
    else if (message.method === 'Target.dispatchMessageFromTarget') dispatch(JSON.parse(message.params.message));
    else if (message.method === 'Target.targetCreated' && message.params.targetInfo.type === 'page') { target = message.params.targetInfo.targetId; proxy = message.pageProxyId; }
  }
  child.stdio[4].on('data', data => { buffer = Buffer.concat([buffer, data]); let end; while ((end = buffer.indexOf(0)) >= 0) { dispatch(JSON.parse(buffer.subarray(0, end).toString())); buffer = buffer.subarray(end + 1); } });
  function request(method, params = {}, nested = false) {
    return new Promise((resolveRequest, rejectRequest) => {
      const id = ++serial, timer = setTimeout(() => { pending.delete(id); rejectRequest(new Error(`WebKit protocol timeout: ${method}`)); }, 10000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolveRequest(value); }, reject: error => { clearTimeout(timer); rejectRequest(new Error(JSON.stringify(error))); } });
      const message = { id, method, params };
      if (nested) request('Target.sendMessageToTarget', { targetId: target, message: JSON.stringify(message) }).catch(rejectRequest);
      else child.stdio[3].write(`${JSON.stringify({ ...message, ...(method.startsWith('Playwright.') ? {} : { pageProxyId: proxy }) })}\0`);
    });
  }
  const inner = (method, params) => request(method, params, true);
  const evaluate = async expression => { const value = await inner('Runtime.evaluate', { expression, returnByValue: true }); if (value.wasThrown) throw new Error(value.result?.description || 'WebKit evaluate failed'); return value.result?.value; };
  const until = async expression => { for (let i = 0; i < 150; i++) { try { if (await evaluate(expression)) return; } catch {} await wait(100); } throw new Error(`WebKit readiness timeout: ${expression}`); };
  try {
    await request('Playwright.enable'); const ctx = await request('Playwright.createContext'); await request('Playwright.createPage', ctx); await request('Target.resume', { targetId: target }); await inner('Runtime.enable');
    await inner('Page.enable');
    await request('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, fixedLayout: false, deviceScaleFactor: 1 });
    await inner('Page.setScreenSizeOverride', { width: 390, height: 844 });
    if (fixtureMode) { await evaluate(`document.body.innerHTML=${JSON.stringify(fixtureHtml)}`); await evaluate(fixtureJs); }
    else {
      const { frameTree } = await inner('Page.getResourceTree');
      await request('Playwright.navigate', { url: `${host.origin}/index.html?entry=shelf&ui=bi`, pageProxyId: proxy, frameId: frameTree.frame.id });
      await until('document.body?.dataset.ready === "1"');
      await evaluate("localStorage.setItem('kairo-word-ladder-demo-v1','1')");
      const selector = `[data-passage="${story}"]:not([data-recommendation]) .shelf-open`;
      const direct = await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
      if (direct) await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      else {
        await evaluate(`document.querySelector('#shelf-tools-toggle').click();const input=document.querySelector('#shelf-reading-search');input.value='スタートアップ大賞';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`);
        const found = `#shelf-reading-results [data-passage="${story}"] .shelf-open`;
        await until(`!!document.querySelector(${JSON.stringify(found)})`); await evaluate(`document.querySelector(${JSON.stringify(found)}).click()`);
      }
      await until(`!!document.querySelector(${JSON.stringify(readerSelector)})`);
    }
    const viewport = await evaluate('({ width: innerWidth, height: innerHeight })');
    check('webkit/native-viewport', viewport.width === 390 && viewport.height === 844, viewport);
    const properties = async nodeId => (await inner('DOM.getAccessibilityPropertiesForNode', { nodeId })).properties;
    async function tree(nodeId, seen = new Set()) { if (seen.has(nodeId) || seen.size > 800) return []; seen.add(nodeId); const p = await properties(nodeId); let rows = [p]; for (const id of p.childNodeIds || []) rows.push(...await tree(id, seen)); return rows; }
    async function inspectProse(id, blockSelector, wordSelector, { managedSelector = wordSelector, controls = false, sentenceDoor = false } = {}) {
    const { root } = await inner('DOM.getDocument', { depth: -1 });
    const paragraphId = (await inner('DOM.querySelector', { nodeId: root.nodeId, selector: blockSelector })).nodeId;
    assert(paragraphId, `${id}: paragraph exists`);
    const firstId = (await inner('DOM.querySelector', { nodeId: paragraphId, selector: wordSelector })).nodeId;
    assert(firstId, `${id}: selected word exists`);
    const prefix = id === 'reader' ? 'webkit' : `webkit/${id}`;
    const idle = await tree(paragraphId), word = await properties(firstId);
    check(`${prefix}/native-paragraph`, idle[0]?.role === 'paragraph' && !idle[0]?.ignored, idle[0]);
    const doorId = sentenceDoor ? (await inner('DOM.querySelector', { nodeId: paragraphId, selector: '.sent-door' })).nodeId : 0;
    const explicitDoor = new Set(doorId ? (await tree(doorId)).map(node => node.nodeId) : []);
    const prose = idle.filter(node => !explicitDoor.has(node.nodeId));
    check(`${prefix}/native-prose-no-word-controls`, prose.some(n => n.role === 'text') && !prose.some(n => /button|link|application|group/i.test(n.role || '')) && word.ignored === true, { word, roles: prose.map(n => n.role), explicitSentenceDoor: doorId || null });
    const selectionIndex = await evaluate(`(() => { const block=document.querySelector(${JSON.stringify(blockSelector)}); const word=block.querySelector(${JSON.stringify(wordSelector)}); return [...block.querySelectorAll(${JSON.stringify(managedSelector)})].filter(n=>n.closest('[data-prose-roving]')===block).indexOf(word); })()`);
    assert(selectionIndex >= 0, `${id}: selected word belongs to this rover`);
    await evaluate(`document.querySelector(${JSON.stringify(blockSelector)}).focus()`);
    for (const key of ['Home', ...Array(selectionIndex).fill('ArrowRight')]) {
      for (const type of ['keyDown', 'keyUp']) await request('Input.dispatchKeyEvent', { type, modifiers: 0, key, code: key, windowsVirtualKeyCode: key === 'Home' ? 36 : 39, text: '', unmodifiedText: '', autoRepeat: false, isKeypad: false });
    }
    const selected = await properties(firstId);
    check(`${prefix}/native-selected-word`, selected.role === 'group' && selected.focused === true && !!selected.label && !selected.ignored, selected);
    await evaluate(`document.querySelector(${JSON.stringify(blockSelector)}).focus()`);
    // Focus changes may reach WebKit's AX cache a frame after the DOM event. Observe the native
    // property until it settles, retaining every response; an unretired word still fails after 1s.
    let retired = await properties(firstId);
    const retirement = [{ elapsedMs: 0, properties: retired }], started = Date.now();
    for (let attempt = 0; attempt < 20 && !(retired.ignored === true && retired.role !== 'group'); attempt++) {
      await wait(50); retired = await properties(firstId);
      retirement.push({ elapsedMs: Date.now() - started, properties: retired });
    }
    check(`${prefix}/native-word-retires`, retired.ignored === true && retired.role !== 'group', retired);
    let mutant = null;
    if (controls) {
    // Both mutations run on this same native tree. They must change the corresponding positive invariant.
    await evaluate(`for(const w of document.querySelectorAll(${JSON.stringify(`${readerSelector} .tok[data-para]`)}))w.setAttribute('role','button')`);
    mutant = await tree(paragraphId);
    const mutationSamples = [{ elapsedMs: 0, roles: mutant.map(node => node.role) }], mutatedAt = Date.now();
    for (let attempt = 0; attempt < 20 && !mutant.some(node => /button/i.test(node.role || '')); attempt++) {
      await wait(50); mutant = await tree(paragraphId);
      mutationSamples.push({ elapsedMs: Date.now() - mutatedAt, roles: mutant.map(node => node.role) });
    }
    writeFileSync(resolve(evidence, 'webkit-button-control-settlement.json'), JSON.stringify(mutationSamples, null, 2));
    check('webkit/control-word-buttons-caught', mutant.some(n => /button/i.test(n.role || '')), mutant.map(n => n.role));
    await evaluate(`for(const w of document.querySelectorAll(${JSON.stringify(`${readerSelector} .tok[data-para]`)})) {w.removeAttribute('role');w.tabIndex=0}`);
    const many = await evaluate(`document.querySelector(${JSON.stringify(readerSelector)}).querySelectorAll('[tabindex="0"]').length`);
    check('webkit/control-extra-tab-stops-caught', many > 0, many);
    }
    writeFileSync(resolve(evidence, id === 'reader' ? 'webkit-native-tree.json' : `webkit-native-${id}-tree.json`), JSON.stringify({ protocol: 'DOM.getAccessibilityPropertiesForNode', viewport, selectionIndex, idle, word, selected, retired, retirement, mutant }, null, 2));
    }
    await inspectProse('reader', readerSelector, '.tok[data-para]', { controls: true });
    if (fixtureMode) {
      await inspectProse('fragment', '#fragment', '.japanese-lookup-word');
      await inspectProse('detached', '#detached', '.japanese-lookup-word');
      await inspectProse('mixed', '#mixed', '.sentence-tok', { managedSelector: '.sentence-tok,.japanese-lookup-word' });
      const { root } = await inner('DOM.getDocument', { depth: -1 });
      for (const type of ['list', 'definition']) {
        const actualId = (await inner('DOM.querySelector', { nodeId: root.nodeId, selector: `#native-${type}` })).nodeId;
        const referenceId = (await inner('DOM.querySelector', { nodeId: root.nodeId, selector: `#reference-${type}` })).nodeId;
        const actual = await properties(actualId), reference = await properties(referenceId);
        check(`webkit/native-${type}-role-preserved`, actual.role === reference.role && actual.role !== 'paragraph' && !actual.ignored, { actual, reference });
      }
    } else {
      const click = async selector => { await until(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
      // は's authored explanation contains several Japanese runs inside ordinary prose. It
      // exercises enhanceJapaneseProse's DocumentFragment path, not the sentence renderer.
      await evaluate(`document.querySelector('#reader .tok[data-index="10"]').focus()`);
      for (const type of ['keyDown', 'keyUp']) await request('Input.dispatchKeyEvent', { type, modifiers: 2, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '', unmodifiedText: '', autoRepeat: false, isKeypad: false });
      await until(`!!document.querySelector('#sheet[data-node="particle:wa"] .gloss .japanese-lookup-word')`);
      await inspectProse('page-definition', '#sheet .gloss[data-prose-roving]', '.japanese-lookup-word');
      await click('#sheet-back'); await until(`!document.getElementById('sheet')`);
      await evaluate(`document.querySelector('#reader .tok[data-index="4"]').focus()`);
      for (const type of ['keyDown', 'keyUp']) await request('Input.dispatchKeyEvent', { type, modifiers: 2, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '', unmodifiedText: '', autoRepeat: false, isKeypad: false });
      await until(`!!document.querySelector('#sheet .example-ja[data-prose-roving] .sentence-tok')`);
      const exampleShape = await evaluate(`(() => { const block=document.querySelector('#sheet .example-ja[data-prose-roving]'); return { nested:block.querySelectorAll('.sentence-tok .japanese-lookup-word').length, first:block.querySelector('.sentence-tok')?.dataset.proseLabel, nativeButtons:block.querySelectorAll('button.sentence-tok').length }; })()`);
      check('webkit/page-example/authored-tokens-not-resegmented', exampleShape.nested === 0 && exampleShape.nativeButtons === 0 && !!exampleShape.first, exampleShape);
      // The one explicit sentence-navigation button is not a per-word prose control.
      await inspectProse('page-example', '#sheet .example-ja[data-prose-roving]', '.sentence-tok', { managedSelector: '.sentence-tok,.japanese-lookup-word', sentenceDoor: true });
      await click('#sheet-back'); await until(`!document.getElementById('sheet')`);
      await click('#chrome-dojo'); await click('[data-study-door="guided"]');
      await click('.guided-room [data-action="setup"]'); await click('.guided-room [data-action="start"]');
      await click('.guided-room [name="answer"]'); await click('.guided-room [data-action="check"]');
      await click('.guided-room [data-action="explain"]');
      await until(`!!document.querySelector('.gs-teaching p .gs-word')`);
      await evaluate(`document.querySelector('.gs-teaching p .gs-word').closest('[data-prose-roving]').dataset.axProbe='guided'`);
      await inspectProse('guided', '[data-ax-probe="guided"]', '.gs-word', { managedSelector: '.japanese-lookup-word,.gs-word' });
      const { frameTree } = await inner('Page.getResourceTree');
      await request('Playwright.navigate', { url: `${host.origin}/index.html?deck=mcd&ui=bi`, pageProxyId: proxy, frameId: frameTree.frame.id });
      await click('#kp-start'); await click('#kp-reveal');
      await until(`!!document.querySelector('#kp-card .kp-sentence[data-prose-roving] .kp-tok')`);
      await inspectProse('deck-sentence', '#kp-card .kp-sentence[data-prose-roving]', '.kp-tok');
      await until(`!!document.querySelector('#kp-card .kp-def[data-prose-roving] .kp-tok')`);
      await inspectProse('deck-definition', '#kp-card .kp-def[data-prose-roving]', '.kp-tok');
    }
  } finally { try { process.kill(-child.pid, 'SIGTERM'); } catch {} child.stdio.forEach(stream => stream?.destroy()); writeFileSync(resolve(evidence, 'webkit-native-stderr.log'), stderr.join('')); }
}
try {
  if (site) { const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs'); host = await startStaticHost({ site, port: 0 }); }
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) { const browser = await type.launch({ headless: true }); receipt.engines[engine] = browser.version(); try { await keyboardChecks(engine, browser); } finally { await browser.close(); } }
  await nativeWebKit();
} catch (error) { check('harness-completed', false, String(error?.stack || error)); }
finally { await host?.close(); writeFileSync(resolve(evidence, 'prose-accessibility.json'), JSON.stringify(receipt, null, 2)); }
if (!receipt.rows.length || receipt.rows.some(row => !row.ok)) process.exitCode = 1;
