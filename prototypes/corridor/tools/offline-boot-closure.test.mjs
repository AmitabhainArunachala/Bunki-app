import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {chromium} from 'playwright-core';
import {collectBootScripts,eagerBootClosure} from './offline-boot-closure.mjs';
const fixture=()=>{const root=mkdtempSync(join(tmpdir(),'bunki-eager-closure-'));return {root,put(path,body){mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),body);},close(){rmSync(root,{recursive:true,force:true});}};}
test('actual HTML parser selects executable roots and ignores commented/inert/nomodule scripts',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();const roots=await page.evaluate(collectBootScripts,`<!-- <script type="module" src="fake.mjs"></script> --><script defer src="classic.js"></script><script TYPE="module" src="./main.mjs?build=1#fragment"></script><script type="application/json" src="inert.json"></script><script nomodule src="old.js"></script><script>window.flag=true;</script>`);assert.deepEqual(roots,['classic.js','main.mjs']);await assert.rejects(()=>page.evaluate(collectBootScripts,'<script type="module">import "./hidden.mjs";</script>'));await assert.rejects(()=>page.evaluate(collectBootScripts,'<script type="module" src="https://foreign.invalid/a.mjs"></script>'));}finally{await browser.close();}
});
test('eager closure follows direct, transitive and re-export edges including a shared-directory static dependency',async()=>{
 const f=fixture();try{f.put('main.mjs',`import {x} from './direct.mjs'; import './side-effect.js'; export * from './reexport.mjs'; const quoted="import './fake.mjs'"; export const lazy=()=>import('./missing-lazy.mjs'); console.log(x,quoted);`);f.put('direct.mjs',`import {y} from './nested/transitive.mjs';export const x=y;`);f.put('nested/transitive.mjs',`export const y=1;`);f.put('side-effect.js','globalThis.fixture=true;');f.put('reexport.mjs',`export * from './vendor/shared-study-engine/required.mjs';`);f.put('vendor/shared-study-engine/required.mjs','export const required=1;');f.put('unused.mjs','export const unused=1;');assert.deepEqual(await eagerBootClosure(f.root,['main.mjs']),['direct.mjs','main.mjs','nested/transitive.mjs','reexport.mjs','side-effect.js','vendor/shared-study-engine/required.mjs']);}finally{f.close();}
});
for(const missing of ['direct','transitive'])test(`missing ${missing} eager source fails closed`,async()=>{
 const f=fixture();try{f.put('main.mjs',`import './direct.mjs';`);if(missing==='transitive')f.put('direct.mjs',`export * from './nested/missing.mjs';`);await assert.rejects(()=>eagerBootClosure(f.root,['main.mjs']));}finally{f.close();}
});
test('missing roots and remote static imports cannot silently shrink the certified closure',async()=>{
 const f=fixture();try{await assert.rejects(()=>eagerBootClosure(f.root,['missing.mjs']));f.put('main.mjs',`import 'https://foreign.invalid/code.mjs';`);await assert.rejects(()=>eagerBootClosure(f.root,['main.mjs']));}finally{f.close();}
});
test('path and symlink escapes cannot read outside the immutable site',async()=>{
 const f=fixture(),out=fixture();try{out.put('foreign.mjs','export const foreign=1;');f.put('main.mjs',`import './escape.mjs';`);symlinkSync(join(out.root,'foreign.mjs'),join(f.root,'escape.mjs'));await assert.rejects(()=>eagerBootClosure(f.root,['main.mjs']));await assert.rejects(()=>eagerBootClosure(f.root,[join(out.root,'foreign.mjs')]));}finally{f.close();out.close();}
});

test('HTML base resolution stays local and foreign or parent bases fail',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.route('https://fixture.invalid/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}));await page.goto('https://fixture.invalid/app/index.html');assert.deepEqual(await page.evaluate(collectBootScripts,'<base href="./nested/"><script type="module" src="main.mjs"></script>'),['nested/main.mjs']);await assert.rejects(()=>page.evaluate(collectBootScripts,'<base href="../"><script src="escape.js"></script>'));await assert.rejects(()=>page.evaluate(collectBootScripts,'<base href="https://foreign.invalid/"><script src="escape.js"></script>'));}finally{await browser.close();}
});
test('multiple roots preserve their full shared and disjoint static closures',async()=>{
 const f=fixture();try{f.put('a.mjs',`import './common.mjs';import './only-a.mjs';`);f.put('b.mjs',`import './common.mjs';import './only-b.mjs';`);f.put('common.mjs','export const common=1;');f.put('only-a.mjs','export const a=1;');f.put('only-b.mjs','export const b=1;');assert.deepEqual(await eagerBootClosure(f.root,['a.mjs','b.mjs','a.mjs']),['a.mjs','b.mjs','common.mjs','only-a.mjs','only-b.mjs']);}finally{f.close();}
});
