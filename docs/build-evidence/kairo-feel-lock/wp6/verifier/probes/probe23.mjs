/** Probe 23 (WP6) — persistence: does standing OFF the defaults write anything?
 * Serves the real corridor directory, clicks the F and G variant buttons, and
 * dumps both localStorage schemas before and after. Then reloads to prove the
 * setting is session-only. */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const CORRIDOR = '/home/user/Bunki-app/.claude/worktrees/agent-aa8fa572d39c96ca3/prototypes/corridor';
const OUT='/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out23';
mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=createServer((q,r)=>{
  const pth=decodeURIComponent((q.url??'/').split('?')[0]);
  const f=resolve(CORRIDOR, pth==='/'?'index.html':pth.replace(/^\/+/,''));
  if(!f.startsWith(CORRIDOR)||!existsSync(f)) return void (r.writeHead(404),r.end());
  r.writeHead(200,{'cache-control':'no-store','content-type':MIME[extname(f)]??'application/octet-stream'});
  r.end(readFileSync(f));});
const base=await new Promise(ok=>server.listen(0,'127.0.0.1',()=>ok(`http://127.0.0.1:${server.address().port}`)));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push('PAGEERROR '+e.message.slice(0,140)));
p.on('console',m=>{if(m.type()==='error')errs.push('console.error '+m.text().slice(0,140));});
const out={};const log=(k,v)=>{out[k]=v;console.log('### '+k+' :: '+JSON.stringify(v));};
const dump=()=>p.evaluate(()=>{
  const o={keys:Object.keys(localStorage).sort(),parsed:{}};
  for(const k of o.keys){ try{o.parsed[k]=Object.keys(JSON.parse(localStorage.getItem(k))).sort();}catch{o.parsed[k]='(unparsable)';} }
  return o;});
await p.goto(`${base}/index.html?entry=shelf`,{waitUntil:'networkidle'});
await p.waitForFunction('document.body.dataset.ready === "1"',null,{timeout:30000});
await p.waitForTimeout(2000);
await p.locator('#variants-toggle').click();
await p.waitForTimeout(400);
// take a word so the stores are non-empty and definitely being written
await p.evaluate(()=>{ try{ if(typeof saveStore==='function') saveStore(); }catch{} });
log('1-stores-at-defaults', await dump());
const strip=await p.evaluate(()=>[...document.querySelectorAll('#variants .vseg button')].map(b=>b.dataset.variant));
log('2-strip-buttons', {count:strip.length, ladder:strip.filter(v=>v.startsWith('ladder')), sattap:strip.filter(v=>v.startsWith('sattap'))});
const seedBefore=await p.evaluate(()=>window.__DRIFT_TAP__?window.__DRIFT_TAP__.get():null);
// stand OFF the defaults: stage4 and recenter
for(const v of ['ladder:stage4','sattap:recenter']){
  await p.click(`#variants .vseg button[data-variant="${v}"]`);
  await p.waitForTimeout(700);
}
const seedAfter=await p.evaluate(()=>window.__DRIFT_TAP__?window.__DRIFT_TAP__.get():null);
log('3-drift-layer-received', {before:seedBefore, after:seedAfter});
const aria=await p.evaluate(()=>[...document.querySelectorAll('#variants .vseg button')]
  .filter(b=>/^(ladder|sattap):/.test(b.dataset.variant))
  .map(b=>({v:b.dataset.variant, pressed:b.getAttribute('aria-pressed'),
            h:Math.round(b.getBoundingClientRect().height), text:b.textContent.trim().slice(0,24)})));
log('4-rows-inherit-44px-and-aria', aria);
log('5-stores-after-standing-off-defaults', await dump());
// reload: session-only means the strip comes back on the defaults
await p.goto(`${base}/index.html?entry=shelf`,{waitUntil:'networkidle'});
await p.waitForFunction('document.body.dataset.ready === "1"',null,{timeout:30000});
await p.waitForTimeout(1500);
await p.locator('#variants-toggle').click();
await p.waitForTimeout(400);
log('6-after-reload', {
  drift: await p.evaluate(()=>window.__DRIFT_TAP__?window.__DRIFT_TAP__.get():null),
  pressed: await p.evaluate(()=>[...document.querySelectorAll('#variants .vseg button')]
    .filter(b=>/^(ladder|sattap):/.test(b.dataset.variant)&&b.getAttribute('aria-pressed')==='true')
    .map(b=>b.dataset.variant)),
  stores: await dump()});
log('ERRORS', errs);
writeFileSync(`${OUT}/persistence.json`,JSON.stringify(out,null,2));
await b.close();server.close();process.exit(0);
