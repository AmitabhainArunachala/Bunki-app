import { launchDrift } from './red-team-harness.mjs';

const results = {};
function rec(k, pass, detail) { results[k] = { pass, detail }; console.log((pass ? 'PASS ' : 'FAIL ') + k + ' :: ' + JSON.stringify(detail)); }

// ---- Group 1: clean load, exercise dedup + undefined + latent injection + asymmetric grade ----
{
  const d = await launchDrift();
  try {
    // globals present?
    const globs = await d.page.evaluate(() => ({
      isKanji: typeof isKanji, glossOf: typeof glossOf, esc: typeof esc,
      openCard: typeof openCard, grade: typeof grade, spawnWord: typeof spawnWord, store: typeof store
    }));
    rec('globals', true, globs);

    // A. dedup: 日曜日 must yield [日,曜] not [日,曜,日]
    const dd = await d.page.evaluate(() => [...new Set('日曜日')].filter(isKanji));
    rec('dedup_日曜日', dd.length === 2 && dd.join('') === '日曜', dd);

    // B. undefined bug: glossOf never returns literal undefined for corpus kanji
    const gl = await d.page.evaluate(() => ['飴','日','光','綺'].map(c=>({c, g: glossOf(c), undef: String(glossOf(c))==='undefined'})));
    rec('gloss_no_undefined', gl.every(x=>!x.undef), gl);

    // C. esc neutralizes markup
    const e = await d.page.evaluate(() => esc('<img src=x onerror=alert(1)>"\'&'));
    rec('esc_helper', !e.includes('<') && !e.includes('"') && e.includes('&lt;'), e);

    // D. latent injection: taint a gloss, spawn a word, confirm rendered as text not element
    const inj = await d.page.evaluate(() => {
      globalThis.__xss = 0;
      const before = document.querySelectorAll('.word').length;
      // spawnWord(entry,x,y,fadeIn) where entry = [word, reading, gloss, st, particle, level]
      spawnWord(['言葉','ことば','<img src=x onerror="globalThis.__xss=1"><b id=pwn>x</b>','k','',3], 200, 400, false);
      const els = document.querySelectorAll('.word');
      const gloss = els[els.length - 1].querySelector('.gloss');
      return { xss: globalThis.__xss, pwnEl: document.getElementById('pwn') ? 1 : 0,
               glossHTML: gloss.innerHTML, glossText: gloss.textContent, spawned: els.length - before };
    });
    rec('latent_gloss_injection',
      inj.xss === 0 && inj.pwnEl === 0 && inj.glossHTML.includes('&lt;img') && inj.glossText.includes('<img'),
      inj);

    // E. openCard word branch renders dedup + gloss, no 'undefined', no live injection
    const card = await d.page.evaluate(() => {
      globalThis.__cardxss = 0;
      const n = { kind:'word', w:'日曜日', r:'にちようび', g:'<b id=cardpwn>Sunday</b>' };
      openCard(n);
      const c = document.getElementById('card') || document.querySelector('.card') || document.querySelector('#card');
      const html = c ? c.innerHTML : (window.card ? window.card.innerHTML : '(no card)');
      const kCells = [...(c||window.card).querySelectorAll('.k')].map(x=>x.textContent);
      return { hasUndefined: /undefined/.test(html), pwn: document.getElementById('cardpwn')?1:0, kCells, escaped: html.includes('&lt;b id=cardpwn') };
    });
    rec('card_word_branch', !card.hasUndefined && card.pwn===0 && card.kCells.join('')==='日曜' , card);

    // G. asymmetric grade: grade known then unknown -> known cleared
    const ag = await d.page.evaluate(() => {
      // find a live word node
      const node = (typeof nodes!=='undefined'?nodes:[]).find(n=>n.kind==='word');
      if(!node) return {skip:true};
      const key = node.w;
      // reset
      delete store.known[key]; delete store.unknown[key];
      store.known[key]=2;               // pretend previously known
      node.gone=false; node.frozen=false;
      grade(node, -1);                  // now mark unknown
      return { key, knownAfter: store.known[key], unknownAfter: store.unknown[key] };
    });
    rec('asymmetric_grade', ag.skip || (ag.knownAfter===undefined && ag.unknownAfter>=1), ag);

    rec('group1_no_pageerrors', d.pageErrors.length===0, d.pageErrors.slice(0,3));
  } finally { await d.close(); }
}

// ---- Group 2: L4 P0 brick — wrong-schema payload must load clean ----
for (const [name, storage] of [
  ['brick_known_only', '{"known":{"猫":3}}'],
  ['brick_unknown_null', '{"known":{},"unknown":null,"lk":0,"lu":0}'],
  ['typecorrupt_known_string', '{"known":"pwned","unknown":{},"lk":0,"lu":0}'],
  ['typecorrupt_known_array', '{"known":[1,2,3],"unknown":{},"lk":0,"lu":0}'],
]) {
  const d = await launchDrift({ storage });
  try {
    const st = await d.page.evaluate(() => ({
      words: document.querySelectorAll('.word').length,
      knownType: Object.prototype.toString.call(store.known),
      unknownType: Object.prototype.toString.call(store.unknown),
      lkType: typeof store.lk, luType: typeof store.lu
    }));
    const clean = st.words>=12 && st.knownType==='[object Object]' && st.unknownType==='[object Object]' && st.lkType==='number';
    rec(name, clean && d.pageErrors.length===0, { ...st, pageErrors: d.pageErrors.slice(0,2) });
  } finally { await d.close(); }
}

// ---- Group 3: L7-09 HIGH — malicious counters must NOT reach tray as HTML ----
{
  const storage = JSON.stringify({ known:{}, unknown:{}, lk:"<img src=x onerror=\"globalThis.__l7trayxss=1\">", lu:"<b id=traypwn>x</b>" });
  const d = await launchDrift({ storage });
  try {
    const r = await d.page.evaluate(() => {
      if (typeof updateTray==='function') updateTray();
      const t = document.getElementById('tray') || document.querySelector('.tray') || window.tray;
      return {
        xss: globalThis.__l7trayxss || 0,
        traypwn: document.getElementById('traypwn')?1:0,
        gathered: typeof gathered!=='undefined'?gathered:null,
        settled: typeof settled!=='undefined'?settled:null,
        trayHTML: t ? t.innerHTML : '(no tray)'
      };
    });
    rec('l7_09_tray_xss', r.xss===0 && r.traypwn===0 && r.gathered===0 && r.settled===0, r);
    rec('group3_no_pageerrors', d.pageErrors.length===0, d.pageErrors.slice(0,2));
  } finally { await d.close(); }
}

const fails = Object.entries(results).filter(([,v])=>!v.pass).map(([k])=>k);
console.log('\n==== SUMMARY ====');
console.log('total', Object.keys(results).length, 'failed', fails.length, fails);
import('node:fs').then(fs=>fs.writeFileSync('/private/tmp/bunki-verify-fixes.json', JSON.stringify(results,null,2)));
process.exit(fails.length?1:0);
