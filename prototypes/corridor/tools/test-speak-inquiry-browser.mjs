import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
const require=createRequire(join(process.cwd(),'package.json'));
const {chromium}=require('playwright');
const source=process.argv[2]||process.cwd();
const out=process.argv[3]||process.env.VOICE_EVIDENCE_DIR; if(!out)throw Error('VOICE_EVIDENCE_DIR is required');mkdirSync(out,{recursive:true});
const origin=process.env.VOICE_TEST_ORIGIN||'http://127.0.0.1:8810'; const endpoint='http://127.0.0.1:18939/v1beta';
const bridge=`\nwindow.__VOICE_INQUIRY_TEST__={ready:()=>!!S.ready&&recordWritable(),view:()=>S.view,snap:()=>speakRoom?.snapshot(),record:()=>JSON.parse(JSON.stringify({srs:S.srs,revlog:S.revlog,taken:S.taken})),archive:()=>aiLogAll('speak'),context:()=>activeTeacherContext(),navDepth:()=>S.navigationReturns.length,draft:()=>teacherDraftController?.view(activeTeacherContext()?.id).text,back:()=>back(),denySource:()=>{D.passages.find(p=>p.id===activeTeacherContext().sourceId).pool='archive';},openInquiry:async()=>{const core=await import('./speak-core.mjs');openSpeakRoom('ai',core.inquiryScene(activeTeacherContext(),{question:'A source whose permission has changed'}));},prepare:async()=>{await ensureTeacherContextModule();const p=D.passages.find(x=>x.pool==='original'&&TEACHER_ORIGINAL_CATALOGS.has(x.source));if(!p)throw Error('no original article');await ensureArticle(p);const start=0;let end=Math.min(p.tokens.length,12);const quote=p.tokens.slice(start,end).map(t=>t.s).join('');const context=await teacherContextModule.createTeacherContext({sourceKind:'bundled-passage',sourceId:p.id,sourceDigest:await teacherContextModule.digestText(JSON.stringify(p.tokens.map(t=>t.s))),unit:'token-index',start,end,index:Math.min(2,end-1),quote,title:p.title||'',attribution:p.attribution||p.sourceLabel||'',url:p.url||null,target:null});await commitStorePatch(latest=>({teacherContexts:teacherContextModule.selectTeacherContext(latest.teacherContexts,context)}),[{surface:'chat',role:'user',content:'この文の背景について知りたいです。',model:'mock',ts:Date.now(),contextRef:context.id},{surface:'chat',role:'assistant',content:'どの言葉が気になりましたか？',model:'mock',ts:Date.now()+1,contextRef:context.id}]);S.view='ai';render();return context;}};\n`;
const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});
const requests=[],errors=[],external=[];
await context.addInitScript(({endpoint})=>{window.__KAIRO_SPEAK_ENDPOINT__=endpoint;localStorage.setItem('kairo-speak-device-v1',JSON.stringify({v:1,configId:'test-config',credential:{origin:new URL(endpoint).origin,key:'test-only-no-real-key'},models:{ears:'gemini-3.5-flash-lite'}}));const now=new Date();localStorage.setItem('kairo-speak-spend-v1',JSON.stringify({v:1,month:now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0'),usd:0,cap:1}));},{endpoint});
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.origin===new URL(endpoint).origin){
  const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type,x-goog-api-key'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
  const body=req.postDataJSON();requests.push({url:req.url(),body});
  if(body.generationConfig?.responseModalities?.includes('AUDIO'))return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;rate=24000',data:Buffer.alloc(4800).toString('base64')}}]}}]})});
  return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({heard:'',reply:{text:'一緒に考えましょう。',tokens:[{s:'一緒',b:'一緒',r:'いっしょ'},{s:'に',b:'に',r:'に'},{s:'考えましょう',b:'考える',r:'かんがえましょう'},{s:'。',b:'。',r:''}],speaker:'main'},corrections:[],used:[],reached:[],remember:[]})}]}}],usageMetadata:{}})});
 }
 if(url.origin!==origin){external.push(req.url());return route.abort();}
 if(['/corridor.js','/speak.js','/speak-core.mjs'].includes(url.pathname)){
  let body=readFileSync(join(source,'prototypes/corridor',url.pathname.slice(1)),'utf8');if(url.pathname==='/corridor.js')body+=bridge;
  return route.fulfill({status:200,body,contentType:'text/javascript'});
 }
 return route.continue();
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__VOICE_INQUIRY_TEST__?.ready(),null,{timeout:60000});
 const anchor=await page.evaluate(()=>window.__VOICE_INQUIRY_TEST__.prepare());
 const before=await page.evaluate(()=>window.__VOICE_INQUIRY_TEST__.record()); const beforeNav=await page.evaluate(()=>window.__VOICE_INQUIRY_TEST__.navDepth());
 const question='この文の「'+anchor.quote.slice(0,4)+'」について、声で続きを話したい。';
 await page.locator('#chat-input').fill(question);
 await page.waitForFunction(q=>window.__VOICE_INQUIRY_TEST__.draft()===q,question);
 const door=page.getByRole('button',{name:/Continue in Speak|声で続きを話す/});assert.equal(await door.count(),1);
 await door.click();await page.waitForFunction(()=>window.__VOICE_INQUIRY_TEST__.view()==='speak'&&window.__VOICE_INQUIRY_TEST__.snap()?.session,null,{timeout:30000});
 await page.waitForFunction(()=>document.querySelector('.speak-root, [data-room="speak"], .speak')||document.querySelector('main'));
 for(let i=0;i<100&&!requests.some(r=>r.body.systemInstruction);i++)await new Promise(resolve=>setTimeout(resolve,100));
 const brain=requests.find(r=>r.body.systemInstruction);assert.ok(brain,'source-aware opening request was sent only to mocked provider');
 const system=brain.body.systemInstruction.parts.map(x=>x.text).join('\n');assert.ok(system.includes(JSON.stringify(anchor)),'exact selected TeacherContext enters quoted SOURCE');assert.ok(system.includes(JSON.stringify(question)),'actual draft question enters quoted request');assert.ok(JSON.stringify(brain.body.contents).includes('この文の背景について知りたいです。'),'prior inquiry is present');assert.doesNotMatch(system,/around N2/u);
 assert.ok((await page.locator('body').innerText()).includes(anchor.quote),'selected quote is visible in Speak');assert.ok((await page.locator('body').innerText()).includes(question),'actual question is visible in Speak');
 await page.waitForTimeout(600); await page.screenshot({path:join(out,'inquiry-speak-phone.png'),fullPage:true});
 const archive=await page.evaluate(()=>window.__VOICE_INQUIRY_TEST__.archive());
 const opening=archive.filter(row=>row.role==='app').map(row=>JSON.parse(row.content)).find(row=>row.kind==='opening');
 assert.ok(opening,'the voice opening is archived');
 assert.equal(opening.sourceContextRef,anchor.id,'archive keeps source link separate from voice session ID');
 assert.deepEqual(opening.sourceContext,anchor,'archive keeps exact source context rather than only an ID');
 await page.locator('#speak-inquiry-tutor').click();await page.waitForFunction(()=>window.__VOICE_INQUIRY_TEST__.view()==='ai');
 assert.equal(await page.evaluate(()=>window.__VOICE_INQUIRY_TEST__.navDepth()),beforeNav,'Back to tutor consumes the Speak detour, without adding a navigation loop');
 assert.equal(await page.locator('#chat-input').inputValue(),question,'explicit tutor return preserves draft');
 await page.getByRole('button',{name:/Continue in Speak|声で続きを話す/}).click();
 await page.waitForFunction(()=>window.__VOICE_INQUIRY_TEST__.view()==='speak'&&window.__VOICE_INQUIRY_TEST__.snap()?.session);
 await page.evaluate(()=>window.__VOICE_INQUIRY_TEST__.back());await page.waitForFunction(()=>window.__VOICE_INQUIRY_TEST__.view()==='ai');
 assert.equal(await page.locator('#chat-input').inputValue(),question,'back preserves draft');assert.equal((await page.evaluate(()=>window.__VOICE_INQUIRY_TEST__.context())).id,anchor.id);
 const after=await page.evaluate(()=>window.__VOICE_INQUIRY_TEST__.record());assert.deepEqual(after,before,'opening inquiry voice neither enrolls nor grades');
 await page.locator('#teacher-source-return').click();await page.waitForFunction(()=>window.__VOICE_INQUIRY_TEST__.view()==='reader');
 const beforeDenied=requests.length;
 await page.evaluate(()=>{window.__VOICE_INQUIRY_TEST__.denySource();return window.__VOICE_INQUIRY_TEST__.openInquiry();});
 await page.waitForFunction(()=>window.__VOICE_INQUIRY_TEST__.view()==='speak'&&window.__VOICE_INQUIRY_TEST__.snap()?.status,null,{timeout:15000});
 await page.waitForTimeout(500);
 assert.equal(requests.length,beforeDenied,'revoked source permission sends no request, even on direct room entry');
 assert.match(await page.locator('body').innerText(),/unavailable|not available|cannot|利用でき|使え|許可|送信|source/iu,'source refusal is visible');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 writeFileSync(join(out,'result.json'),JSON.stringify({pass:true,anchor,request:brain.body,requests:requests.length,errors,external},null,2));console.log('PASS: exact source/question/history, visible context, draft return, source return, no grades/enrolment, no external network');
}catch(e){writeFileSync(join(out,'failure.json'),JSON.stringify({error:String(e),stack:e.stack,requests,errors,external},null,2));await page.screenshot({path:join(out,'failure.png'),fullPage:true});throw e;}finally{await context.close();await browser.close();}
