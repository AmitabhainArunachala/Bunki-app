/** VH-1: independent, executable acceptance predicates; no product resolver imports. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function exactRoster(expected, observed) {
  return Array.isArray(expected) && expected.length > 0 && Array.isArray(observed)
    && expected.length === observed.length && new Set(expected).size === expected.length
    && new Set(observed).size === observed.length && expected.every(id => observed.includes(id));
}
export function selection(value, allowed, name) {
  if (value === undefined) return null;
  const selected = value.split(',').map(x => x.trim());
  assert(selected.length && selected.every(Boolean), `${name}: an explicit empty selection is invalid`);
  assert(new Set(selected).size === selected.length, `${name}: duplicate selection`);
  assert(selected.every(x => allowed.includes(x)), `${name}: unknown selection ${selected.filter(x => !allowed.includes(x)).join(',')}`);
  return selected;
}
export function scopeResult({ expected, observed, passed, diagnostic = false }) {
  const complete = exactRoster(expected, observed);
  return { expectedCases: expected, observedCases: observed, complete, selectedPassed: complete && passed,
    fullAcceptance: complete && passed && !diagnostic, exitCode: !complete || !passed ? 1 : diagnostic ? 3 : 0 };
}
const pair = (id, widths = ['1368', '390']) => widths.map(width => `${id}-${width}`);
export const DESIGN_CASES = Object.freeze([
  ...pair('R1-flush-tokens'), ...pair('R2-readability'), ...pair('R3-first-sentence'),
  'S1-learner-wording', 'S2-first-story-above-fold-390', 'S3-counts-agree', ...pair('S4-picture-cards'),
  ...pair('T1-tools-behind-one-button'), ...pair('M1-title-block'), ...pair('O1-no-clipped-row', ['320', '390', '1368']),
  ...pair('P1-fresh-word-demo'), 'P1-history-only-no-demo', ...pair('W1-damascus-can-be-saved'),
  'W2-one-word-one-card', 'W2-one-word-one-card-reverse', ...pair('G1-stage-meaning'), 'G2-menu-save-one-card',
  ...pair('G3-save-and-undo'), 'G4-keyboard-menu', ...pair('G5-lists-popover'), 'G5-galaxy-one-path',
  'G6-sentence-row', 'G6-sentence-below-seat-390', ...pair('G6-sentence-pane-seat', ['390', '320']),
  ...pair('G6-sentence-return-motion', ['390', '320']), 'G7-version-switch', ...pair('G7-version-switch-hit', ['390', '320']),
  ...pair('G8-reader-popup-motion', ['390', '320']), ...pair('G9-japanese-line-breaks', ['390', '320']),
  'J1-jlpt-room-wording', 'K1-keyboard-roving', 'A1-no-f1-audio',
]);
export function designSelection(argv) {
  const allowed = ['--g3-only', '--spacing-only', '--design-fixes-only', '--control'];
  assert(argv.every(arg => allowed.includes(arg)), `Unknown design argument: ${argv.filter(arg => !allowed.includes(arg)).join(',')}`);
  assert(new Set(argv).size === argv.length, 'Duplicate design flag');
  const narrow = argv.filter(arg => arg !== '--control');
  assert(narrow.length <= 1, 'Choose one explicit narrow design schedule');
  const expression = { '--g3-only': /^(P1-fresh-word-demo-|P1-history-only-no-demo$|G1-stage-meaning-|G4-keyboard-menu$|K1-keyboard-roving$)/u,
    '--spacing-only': /^R1-flush-tokens-(1368|390)$/u,
    '--design-fixes-only': /^(R1-flush-tokens-(1368|390)|W2-one-word-one-card-reverse|G6-sentence-below-seat-390|G8-reader-popup-motion-(390|320))$/u }[narrow[0]];
  return { cases: DESIGN_CASES.filter(id => !expression || expression.test(id)), diagnostic: argv.length > 0, scope: narrow[0] || 'full' };
}
export const READING_CASES = Object.freeze(['reader', 'stable', 'sentence', 'deck', 'guided', 'r2', 'aux', 'auxsweep', 'capture', 'cold', 'unread', 'sweep', 'special']);
export const MIXED_LEXEMES = Object.freeze([
  { seq: '1057580', form: 'サボる' }, { seq: '1925180', form: 'メモる' }, { seq: '2018460', form: 'ググる' },
]);
// v5r is independently evidenced in each pinned entry. This is the explicit godan-r
// inflection set, not the app's tokenisation or a blanket script-transition ban.
export function mixedLexicalSpans(text, lexemes = MIXED_LEXEMES) {
  const spans = [];
  for (const { seq, form } of lexemes) {
    const stem = form.slice(0, -1);
    const suffixes = ['らなかった', 'らない', 'りました', 'ります', 'られる', 'らせる', 'れば', 'ろう', 'った', 'って', 'ら', 'り', 'る', 'れ', 'ろ'];
    for (let at = text.indexOf(stem); at >= 0; at = text.indexOf(stem, at + 1)) {
      if (at && /[\p{Script=Katakana}ー]/u.test(text[at - 1])) continue;
      const suffix = suffixes.find(end => text.startsWith(end, at + stem.length));
      if (suffix) spans.push({ start: at, end: at + stem.length + suffix.length, seq, form });
    }
  }
  return spans;
}
export const mixedBreak = (text, at, lexemes = MIXED_LEXEMES) => mixedLexicalSpans(text, lexemes).some(span => at > span.start && at < span.end);
export function loadMixedLexemes(site) {
  const index = JSON.parse(readFileSync(resolve(site, 'data/share_alike/dict-v2/index.json'), 'utf8')).entries;
  const cache = new Map();
  for (const fixture of MIXED_LEXEMES) {
    const row = index.find(entry => String(entry[0]) === fixture.seq);
    assert(row && [...row[4], ...row[5]].includes(fixture.form), `mixed lexical fixture ${fixture.seq}/${fixture.form} changed`);
    let hash = 0x811c9dc5;
    for (const char of fixture.seq) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
    const shard = (hash & 15).toString(16).padStart(2, '0');
    if (!cache.has(shard)) cache.set(shard, JSON.parse(readFileSync(resolve(site, `data/share_alike/dict-v2/${shard}.json`), 'utf8')));
    const detail = cache.get(shard).entries.find(entry => String(entry[0]) === fixture.seq);
    assert(detail?.[3].some(sense => sense[0].includes('v5r')), `mixed lexical fixture ${fixture.seq} lacks v5r evidence`);
  }
  return MIXED_LEXEMES;
}
export function classEvidence(tokenClass, entry, expression = false) {
  if (!['動詞', '形容詞'].includes(tokenClass)) return { proved: true, required: false, unknown: false };
  const raw = entry?.proofs || [];
  const proofs = raw.filter(proof => /^[0-9]+$/u.test(String(proof.seq || '')) && typeof proof.form === 'string' && proof.form.length
    && typeof proof.reading === 'string' && proof.reading.length && typeof proof.gloss === 'string' && proof.gloss.length
    && Number.isInteger(proof.senseIndex) && proof.senseIndex >= 0 && Array.isArray(proof.pos));
  const pos = proofs.flatMap(proof => proof.pos);
  const unknown = !proofs.length || proofs.length !== raw.length || proofs.some(proof => !proof.pos.length);
  const fits = parts => tokenClass === '動詞' ? parts.some(part => /^v[0-9a-z]/u.test(part) || part === 'aux-v')
    : parts.some(part => /^adj-(i|ix|ku|shiku)$/u.test(part) || part === 'aux-adj');
  // Ambiguous matching entries cannot borrow the one compatible homograph's POS.
  const proved = !unknown && proofs.every(proof => fits(proof.pos) || (expression && proof.pos.includes('exp')));
  return { proved, required: true, unknown, pos, proofs };
}
export function specialEvidence({ article, index, token, card, proof }) {
  const kind = card.gloss === 'a name in this text' ? 'name' : card.gloss === 'a reading in this text' ? 'reading' : null;
  const k2h = text => String(text || '').replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
  return { classification: !!kind && !!proof && proof.article === article && proof.index === index
      && proof.kind === kind && proof.surface === token.s && proof.reading === token.r,
    asWritten: card.word === token.s && k2h(card.reading || card.word) === k2h(token.r),
    held: card.take?.disabled === true && typeof card.reason === 'string' && card.reason.trim().length > 0 && card.reasonVisible === true };
}
export function loadSpecialProofs(site, fixture) {
  const proofs = new Map();
  const sidecar = JSON.parse(readFileSync(resolve(site, 'data/articles/senses.json'), 'utf8'));
  for (const article of fixture.articles) {
    const bytes = readFileSync(resolve(site, 'data/articles', article.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), article.sha256, `${article.article}: special-label source changed; re-review required`);
    const source = JSON.parse(bytes);
    for (const proof of article.proofs) {
      const token = source.tokens[proof.index];
      assert.equal(proof.kind, proof.sidecar[0], 'Classification fixture kind must match its reviewed sidecar evidence');
      const choice = proof.kind === 'name' ? 'N' : 'R', review = proof.review;
      const a = review?.a?.choice, b = review?.b?.choice, c = review?.c?.choice;
      const backed = { agree: a === choice && b === choice, 'third:a': !!b && a !== b && a === choice && c === choice,
        'third:b': !!a && a !== b && b === choice && c === choice, 'pair:ac': !b && a === choice && c === choice,
        'pair:bc': !a && b === choice && c === choice, review: review?.review?.choice === choice && !!review.review.reason }[review?.source];
      assert(backed && proof.sidecar[1] === review.source, 'Reviewed classification provenance must support the frozen fixture choice');
      assert.equal(token.s, proof.surface); assert.equal(token.r, proof.reading);
      assert.deepEqual(sidecar.articles?.[article.article]?.[String(proof.index)], proof.sidecar, `${article.article}#${proof.index}: reviewed classification changed`);
      assert.equal(source.tokens.slice(proof.contextStart, proof.contextEnd).map(t => t.s).join(''), proof.context);
      proofs.set(`${article.article}#${proof.index}`, { ...proof, article: article.article });
    }
  }
  return proofs;
}
export function plainBadBreak(text, i, lexemes = MIXED_LEXEMES) {
  const a = text[i - 1], b = text[i];
  if (!a || !b || /\s/u.test(a) || /\s/u.test(b)) return '';
  const digit = /[0-9０-９]/u, kata = /[ァ-ヺー]/u;
  if (digit.test(a) && digit.test(b)) return 'inside a number';
  if (a === '第' && digit.test(b)) return 'between 第 and its number';
  if (digit.test(a) && /[年月日時分秒回号人本件個円歳条位度階巻章話部点名社台枚冊匹頭羽杯軒週代種目期次世紀万億兆割倍％%]/u.test(b)) return 'between a number and its counter';
  if (mixedBreak(text, i, lexemes)) return 'inside an independently evidenced mixed-script word';
  if (kata.test(a) && kata.test(b)) return 'inside a katakana word';
  if (/[ぁ-ゖ]/u.test(b) && /[一-鿿々ァ-ヺー]/u.test(a)) {
    const stem = /[\p{Script=Han}々]+$/u.exec(text.slice(0, i))?.[0] || '';
    const kana = /^\p{Script=Hiragana}+/u.exec(text.slice(i))?.[0] || '';
    if (([...stem].length === 1 && !/\p{Script=Han}/u.test(text[i - 2] || '')) || (/[はがをにでとのもへや]/u.test(kana[0] || '') && kana.length === 1)) return "before a word's kana ending";
  }
  if (/[、。，．！？」』）〉》〕］｝ー〜…‥ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]/u.test(b)) return 'before a closing mark';
  if (/[「『（〈《〔［｛]/u.test(a)) return 'after an opening mark';
  return '';
}
export function shelfEvidence({ expectedIds, blocks, series, ids, prefix }) {
  let offset = 0;
  const blocksExact = blocks.length > 0 && blocks.every(block => {
    const observed = ids.slice(offset, offset + block.length); offset += block.length;
    return block.length === 0 || exactRoster(block, observed);
  });
  const seriesOrdered = series.every(want => {
    const start = ids.indexOf(want[0]);
    return start >= 0 && want.every((id, index) => ids[start + index] === id);
  });
  const adjustedPrefix = ids.slice(0, blocks.flat().length);
  return { roster: exactRoster(expectedIds, ids), blocks: blocksExact, series: seriesOrdered, adjustedPrefix,
    order: !prefix || (prefix.length === adjustedPrefix.length && prefix.every((id, i) => adjustedPrefix[i] === id)) };
}
export function shelfContract(rows, queue) {
  const originals = queue.filter(row => ['original','aozora','gv','mext','govonline'].includes(row.kind) && row.decision !== 'rejected');
  const days = [...new Set(originals.map(row => row.addedAt))].sort().reverse();
  const drops = days.map(day => originals.filter(row => row.addedAt === day).map(row => row.id));
  const groupOf = row => {
    const cut = /^aozora:(\d+)(?:-(\d+))?$/u.exec(row.id);
    const author = /^青空文庫\s+([^\s「『]+)[「『]/u.exec(row.attribution || '')?.[1];
    return cut && author ? { author, work:cut[1], cut:Number(cut[2] || 1) } : null;
  };
  const visible = rows.filter(row => !String(row.file || '').startsWith('archive/')
    && !(row.adaptation?.basedOn && rows.some(other => other.id === row.adaptation.basedOn && !String(other.file || '').startsWith('archive/'))));
  const groups = [...new Set(visible.map(groupOf).filter(Boolean).map(group => group.author))]
    .map(author => visible.filter(row => groupOf(row)?.author === author)).filter(group => group.length > 1);
  const series = groups.map(group => [...group].sort((a,b) => {
    const left=groupOf(a),right=groupOf(b);
    return left.work === right.work ? left.cut-right.cut : String(a.addedAt || '').localeCompare(String(b.addedAt || ''));
  }).map(row => row.id));
  const pulled = new Set(series.filter(group => group.some(id => drops[0].includes(id))).flatMap(group => group.filter(id => !drops[0].includes(id))));
  return { expectedIds:visible.map(row => row.id), blocks:[[...drops[0],...pulled],...drops.slice(1).map(drop => drop.filter(id => !pulled.has(id)))], series, originals };
}
export function shelfNeighborViolations(ids, contract, rows) {
  const byId=new Map(rows.map(row=>[row.id,row])), queue=new Map(contract.originals.map(row=>[row.id,row]));
  const apart=[['bunki-read-n3-transistor-class','bunki-read-n3-honda-quarter'],['bunki-read-n3-transistor-class','bunki-read-n2-shima-4004'],
    ['bunki-read-n3-transistor-class','bunki-read-n1-neocognitron'],['bunki-read-n2-sleep-memory','bunki-read-n2-forgetting-curve'],['bunki-read-n3-rule-of-72','bunki-read-n3-honda-quarter']];
  const genre=(row,q)=>row?.lane === 'news' ? 'news' : /explainer/u.test(q?.style) ? 'explainer' : /column|コラム/u.test(q?.style) ? 'column'
    : /essay|随筆/u.test(q?.style) ? 'essay' : /dialogue|対話/u.test(q?.style) ? 'dialogue' : /history narrative/u.test(q?.style) ? 'history' : q?.style;
  let at=0; const broken=[];
  for(const block of contract.blocks) {
    const drawn=ids.slice(at,at+block.length); at+=block.length;
    for(let i=1;i<drawn.length;i++) {
      const a=drawn[i-1],b=drawn[i];
      if(contract.series.some(series=>series.includes(a)&&series.indexOf(b)===series.indexOf(a)+1)) continue;
      const qa=queue.get(a),qb=queue.get(b);
      if(!qa||!qb||(qa.fields||[]).some(field=>(qb.fields||[]).includes(field))||genre(byId.get(a),qa)===genre(byId.get(b),qb)
        ||apart.some(([x,y])=>(a===x&&b===y)||(a===y&&b===x))) broken.push([a,b]);
    }
  }
  return broken;
}
/** Strict native DOM mutation controls. The same shelfEvidence predicate serves the
 * main sweep and these controls. A failed candidate or unsafe mutation is not a kill. */
export async function shelfMutationControls(page, contract, rows, { day, dayIndex, engine, lang }) {
  const read=()=>page.locator('#shelf-reading-results .shelf-item').evaluateAll(nodes=>nodes.map(node=>node.dataset.passage));
  const baseline=await read(), first=shelfEvidence({...contract,ids:baseline});
  const root=page.locator('#shelf-reading-results'), original=await root.innerHTML();
  const prefix=first.adjustedPrefix;
  const baseGood=first.roster&&first.blocks&&first.series&&shelfNeighborViolations(baseline,contract,rows).length===0;
  const seriesIds=new Set(contract.series.flat());
  const choose=(duplicate)=>{
    for(let a=1;a<prefix.length;a++) for(let b=a+2;b<prefix.length;b++) {
      if(seriesIds.has(baseline[a])||seriesIds.has(baseline[b])||!contract.blocks.some(block=>block.includes(baseline[a])&&block.includes(baseline[b]))) continue;
      const ids=[...baseline]; if(duplicate) ids[b]=ids[a]; else [ids[a],ids[b]]=[ids[b],ids[a]];
      if(!shelfNeighborViolations(ids,contract,rows).length) return {a:baseline[a],b:baseline[b]};
    }
    return null;
  };
  const candidates=[{id:'drop-duplicate-hides-omission',mode:'duplicate',pair:choose(true),intended:['roster','blocks']},
    {id:'series-book-order-swapped',mode:'swap',pair:{a:'aozora:049966-1',b:'aozora:049966-2'},intended:['series','order']}];
  if(dayIndex===1) candidates.push({id:'day-two-drop-order-drift',mode:'swap',pair:choose(false),intended:['order']});
  const results=[];
  for(const mutation of candidates) {
    if(!mutation.pair) {results.push({id:mutation.id,engine,lang,day,passed:false,error:'No independently legal mutation premise'});continue;}
    let changed,judged,restored,restoreHTML;
    try {
      await root.evaluate((root,{pair,mode})=>{
        const nodes=[...root.querySelectorAll('.shelf-item')],a=nodes.find(node=>node.dataset.passage===pair.a),b=nodes.find(node=>node.dataset.passage===pair.b);
        if(!a||!b||a===b) throw new Error('Shelf mutation anchor missing or ambiguous');
        if(mode==='duplicate') b.replaceWith(a.cloneNode(true));
        else {const marker=document.createComment('VH-1');a.replaceWith(marker);b.replaceWith(a);marker.replaceWith(b);}
      },mutation);
      changed=await read(); judged=shelfEvidence({...contract,ids:changed,prefix});
    } finally { await root.evaluate((root,html)=>{root.innerHTML=html;},original); restored=await read();restoreHTML=await root.innerHTML(); }
    const legacyMembership=changed.length===baseline.length&&contract.blocks.every((block,index)=>{
      const start=contract.blocks.slice(0,index).flat().length;return changed.slice(start,start+block.length).every(id=>block.includes(id));
    });
    const failures=['roster','blocks','series','order'].filter(key=>!judged[key]);
    // A duplicate also changes order; it is a declared consequence, not a new kill.
    const allowed=mutation.mode==='duplicate'?['roster','blocks','order']:mutation.intended;
    const unrelated=failures.filter(key=>!allowed.includes(key));
    const neighborClean=mutation.id==='series-book-order-swapped'||shelfNeighborViolations(changed,contract,rows).length===0;
    const passed=baseGood&&legacyMembership&&neighborClean&&mutation.intended.every(key=>failures.includes(key))&&!unrelated.length
      &&restoreHTML===original&&JSON.stringify(restored)===JSON.stringify(baseline);
    results.push({id:mutation.id,engine,lang,day,mutation,baseline,changed,restored,judged,failures,unrelated,
      premise:{baseGood,legacyMembership,neighborClean},restoredBytes:restoreHTML===original,passed});
  }
  return results;
}
export async function mixedScriptMutationControl(page, { engine, lang, width }, lexemes = MIXED_LEXEMES) {
  const observe = mutated => page.evaluate(mutated => {
    const node=document.createElement('div'); node.id='vh-mixed-script-fixture';
    node.style.cssText='position:fixed;left:8px;top:100px;width:240px;font:20px sans-serif;line-height:30px;white-space:normal;background:white;color:black;z-index:99999';
    node.append(document.createTextNode(mutated?'サボ':'サボる'));
    if(mutated) node.append(document.createElement('br'),document.createTextNode('る'));
    document.body.append(node);
    const glyphs=[],walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) for(let i=0;i<walker.currentNode.length;i++) {
      const range=document.createRange();range.setStart(walker.currentNode,i);range.setEnd(walker.currentNode,i+1);
      const box=[...range.getClientRects()].find(box=>box.width>0.1);
      if(box)glyphs.push({ch:walker.currentNode.data[i],left:box.left,right:box.right,top:box.top,bottom:box.bottom});
    }
    const breaks=[];
    for(let i=1;i<glyphs.length;i++) if(glyphs[i].top>glyphs[i-1].bottom-(glyphs[i-1].bottom-glyphs[i-1].top)*0.35&&glyphs[i].left<glyphs[i-1].left)breaks.push(i);
    const result={text:glyphs.map(glyph=>glyph.ch).join(''),html:node.innerHTML,glyphs,breaks,width:node.getBoundingClientRect().width,inUnits:node.querySelectorAll('.ja-unit').length};
    node.remove();return result;
  },mutated);
  const candidate=await observe(false),mutant=await observe(true),restored=await observe(false);
  const judge=observation=>observation.breaks.map(at=>plainBadBreak(observation.text,at,lexemes)).filter(Boolean);
  const clean=judge(candidate),wrong=judge(mutant),back=judge(restored);
  const premise=candidate.text==='サボる'&&mutant.text==='サボる'&&candidate.inUnits===0&&mutant.inUnits===0
    &&candidate.glyphs.reduce((sum,glyph)=>sum+glyph.right-glyph.left,0)<candidate.width&&mutant.breaks.includes(2);
  return {id:'mixed-script-verb-split',engine,lang,width,premise,candidate,mutant,restored,clean,wrong,back,
    passed:premise&&!clean.length&&wrong.length===1&&wrong[0]==='inside an independently evidenced mixed-script word'&&!back.length&&candidate.html===restored.html};
}
