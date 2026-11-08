import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {homedir} from 'node:os';
const sourceRepo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const supportRepo=process.env.KAIRO_TEST_SUPPORT_REPO||sourceRepo;
const require=createRequire(join(supportRepo,'package.json'));const ts=require('typescript');const {chromium}=require('playwright-core');
const verifier=join(sourceRepo,'prototypes/corridor/tools/verify-corridor.mjs');const text=readFileSync(verifier,'utf8');const ast=ts.createSourceFile(verifier,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const fn=(name,tree=ast)=>{const n=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n;};
const constants=['VIEWPORT','PENDING_NEGATIVE','PENDING_CONTROLS','PENDING_SHARD','PENDING_LETTER','PENDING_WORD'].map(name=>{const n=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));assert(n,name);return n.getText(ast);}).join('\n');
if(process.env.KAIRO_TEST_BASELINE_SOURCE){const before=readFileSync(process.env.KAIRO_TEST_BASELINE_SOURCE,'utf8');const prior=ts.createSourceFile('baseline.mjs',before,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);const a=fn('pendingSaveEngine',prior),b=fn('pendingSaveEngine');assert.equal(text.slice(0,b.pos),before.slice(0,a.pos),'No changes before fixture');assert.equal(text.slice(b.end),before.slice(a.end),'No changes after fixture');const assignments=(node,tree)=>{const found=[];const visit=n=>{if(ts.isBinaryExpression(n)&&n.left.getText(tree)==='row.pass')found.push(n.getText(tree));ts.forEachChild(n,visit);};visit(node);return found;};assert.deepEqual(assignments(b,ast),assignments(a,prior),'Original UI/held-request assertions are unchanged');}
const {silenceBrowserAudio}=await import(pathToFileURL(join(supportRepo,'prototypes/corridor/tools/browser-audio-silence.mjs')));
const {waitForAppRecord}=await import(pathToFileURL(join(supportRepo,'prototypes/corridor/tools/record-test-support.mjs')));
const {startCorridorServer}=await import(pathToFileURL(join(supportRepo,'prototypes/corridor/tools/verify-corridor.mjs')));
test('pending-save waits for a real delayed shard request before releasing the fixture', {timeout:240000}, async()=>{
 const outBase=process.env.KAIRO_TEST_EVIDENCE_BASE||join(homedir(),'.dharma/bunki/pending-save-held-request');mkdirSync(outBase,{recursive:true});const out=mkdtempSync(join(outBase,'run-'));const rows=[],requests=[];
 const check=(name,pass,detail)=>{rows.push({name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
 const engine=new Function('silenceBrowserAudio','waitForAppRecord','assert','check',constants+'\n'+fn('settleReader').getText(ast)+'\n'+fn('pendingSaveEngine').getText(ast)+'\nreturn pendingSaveEngine;')(silenceBrowserAudio,waitForAppRecord,assert,check);
 const {server,base}=await startCorridorServer();const browser=await chromium.launch();
 try{const wrapped={async newContext(options){const context=await browser.newContext(options);const realRoute=context.route.bind(context);context.route=async(matcher,handler,...rest)=>realRoute(matcher,async(route,request)=>{const path=new URL(route.request().url()).pathname;assert.match(path,/^\/data\/share_alike\/dict-v2\/[0-9a-f]{2}\.json$/u);const event={path,receivedAt:Date.now(),heldHandlerEnteredAt:null};requests.push(event);await delay(2500);const page=context.pages()[0];event.beforeHeld=page&&!page.isClosed()?await page.evaluate(()=>({mini:!!document.querySelector('#mini'),pending:!!document.querySelector('#mini [data-sense-wait]'),menu:!!document.querySelector('#mini #vocabulary-list-popover.is-inline')})).catch(()=>null):null;event.heldHandlerEnteredAt=Date.now();return handler(route,request);},...rest);return context;}};
  await engine(wrapped,'chromium',base);
  assert.equal(requests.length,16,'One warmup and all15 measured real shard requests traversed the delayed route');assert(requests.every(r=>r.beforeHeld?.pending),'Every actual shard request sees pending DOM before the fixture held handler enters');assert(requests.slice(1).every(r=>!r.beforeHeld.menu),'Every measured iteration waits for the held handler before pressing Saved');assert.equal(rows.length,3,'All3 row kinds executed, each with5 unchanged measured runs');assert(rows.every(r=>r.pass),'Every unchanged5of5 row must pass when request dispatch has not reached the held handler yet');
 }finally{writeFileSync(join(out,'receipt.json'),JSON.stringify({source:verifier,artifact:process.env.KAIRO_ARTIFACT_SHA256,scope:'Actual pendingSaveEngine and unchanged support helpers,15 cold rows; real matching shard route delayed2500ms before entering the fixture handler, then original continuation; no product edits or fake responses.',rows,requests},null,2)+'\n');console.log('EVIDENCE '+out);await browser.close();await new Promise(done=>server.close(done));}
});
