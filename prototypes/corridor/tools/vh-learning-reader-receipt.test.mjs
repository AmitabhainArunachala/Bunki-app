/** Exercise the actual restore-byte/emitter path without launching another full browser run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('./verify-reader-doors.mjs',import.meta.url),'utf8');
const start=source.indexOf('    for (const file of new Set(edits.map(edit => edit.file))) {');
const end=source.indexOf('    const rec =',start);
assert(start>=0&&end>start,'unique executable restored-byte loop exists');
assert.equal(source.indexOf('    for (const file of new Set(edits.map(edit => edit.file))) {',start+1),-1);
const run=new (Object.getPrototypeOf(async function(){}).constructor)('edits','restored','origin','sha256','manifest','control',source.slice(start,end));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const cases=[['corridor.js',Buffer.from('fixture restored application bytes')],['data/articles/aozora-046605.json',Buffer.from('{"tokens":[{"reading":"たにがわ"}]}')]];
async function exercise(manifest){
 const fetched=[],control={restore:{rows:[],served:[],pageErrors:[],error:null}};
 const restored={page:{request:{get:async url=>{fetched.push(url);const bytes=cases.find(([path])=>url===`http://fixture/${path}`)?.[1];assert(bytes,'requested only declared restored files');return {body:async()=>bytes};}}}};
 await run([...cases.map(([file])=>({file})),{file:'corridor.js'}],restored,'http://fixture',sha256,manifest,control);
 return {fetched,control};
}
test('actual restored-byte loop retains exact SHA per served file in serializable final control shape',async()=>{
 const manifest=new Map(cases.map(([path,bytes])=>[path,sha256(bytes)]));
 const {control,fetched}=await exercise(manifest);
 assert.deepEqual(fetched,cases.map(([path])=>`http://fixture/${path}`));
 const emitter=source.split('\n').find(line=>line.includes("writeFileSync(resolve(EVIDENCE, 'reader-doors.json')"));
 assert(emitter,'actual final emitter exists');
 const names=['writeFileSync','resolve','EVIDENCE','runId','servedIdentity','verifierGitSha','verifierSha256','engine','browserVersion','origin','results','controls','pageErrors','CONTROLS','currentCase'];
 let report;
 new Function(...names,emitter)((path,body)=>{assert.equal(path,'/fixture/reader-doors.json');report=JSON.parse(body);},(...parts)=>parts.join('/'),'/fixture','fixture',{gitSha:'a'.repeat(40),artifactSha256:'b'.repeat(64)},'a'.repeat(40),'c'.repeat(64),'chromium','fixture-version','http://fixture',[],[control],[],[{}],'fixture');
 assert.equal(report.schema,'vh-reader-doors/1');
 assert.deepEqual(report.controls[0].restore.served,cases.map(([file,bytes])=>({file,sha256:sha256(bytes)})));
});
test('actual restored-byte loop rejects a changed body or missing manifest digest',async()=>{
 for(const manifest of [new Map(cases.map(([path])=>[path,'0'.repeat(64)])),new Map()])await assert.rejects(()=>exercise(manifest),/restore digest mismatch: corridor\.js/u);
});
