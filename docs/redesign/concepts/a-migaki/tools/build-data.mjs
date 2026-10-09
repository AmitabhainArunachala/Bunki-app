#!/usr/bin/env node
// Builds js/data.js for the Migaki prototype from REAL repo data only:
//   _kit/content.json (cards, articles), the Ise article tokens,
//   JMdict subset (dict.json), JLPT tags (words.json), KANJIDIC2/KanjiVG (kanji.json, strokes.json),
//   radicals214.json. Run: node docs/redesign/concepts/a-migaki/tools/build-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../../../../../', import.meta.url).pathname);
const J = p => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const SA = 'prototypes/corridor/data/share_alike/';
const content = J('docs/redesign/concepts/_kit/content.json');
const dict = J(SA + 'dict.json').words;
const wordsJ = J(SA + 'words.json').words;
const KJ = J(SA + 'kanji.json');
const strokes = J(SA + 'strokes.json');
const rad214 = J(SA + 'radicals214.json');
const ise = J('prototypes/corridor/data/articles/bunki-essay-n1-ise-time.json');
const city = J('prototypes/corridor/data/articles/bunki-essay-n1-city.json');

const isKanji = ch => /[一-鿿㐀-䶿]/.test(ch);
const radByChar = {};
for (const r of Object.values(rad214)) { radByChar[r.c] = r; if (r.var) radByChar[r.var] = r; }

// Curated top-level decompositions where KANJIDIC lists nested parts (kept faithful to KanjiVG's first split).
const PARTS = {
  研: ['石', '开'], 推: ['扌', '隹'], 進: ['隹', '辶'], 反: ['厂', '又'], 復: ['彳', '复'],
  磨: ['麻', '石'], 辛: ['立', '十'], 抱: ['扌', '包'], 権: ['木', '隹'], 集: ['隹', '木'],
  雑: ['九', '木', '隹'], 難: ['廿', '隹'], 確: ['石', '隺'], 破: ['石', '皮'], 砂: ['石', '少'],
  岩: ['山', '石'], 返: ['反', '辶'], 板: ['木', '反'], 版: ['片', '反'], 往: ['彳', '主'],
  待: ['彳', '寺'], 道: ['首', '辶'], 通: ['甬', '辶'], 速: ['束', '辶'], 送: ['关', '辶'],
  形: ['开', '彡'], 開: ['門', '开'], 型: ['刑', '土'], 刑: ['开', '刂'], 間: ['門', '日'],
  職: ['耳', '戠'], 継: ['糸', '迷'], 承: ['手'], 差: ['羊', '工'], 異: ['田', '共'],
  怠: ['台', '心'], 想: ['相', '心'], 政: ['正', '攵'], 史: ['口', '乂'],
  所: ['戸', '斤'], 作: ['亻', '乍'], 生: [], 成: [], 産: ['立', '厂', '生'], 霊: ['雨', '亚'],
  後: ['彳', '幺', '夂'], 行: ['彳', '亍'], 役: ['彳', '殳'], 碑: ['石', '卑'], 礎: ['石', '楚'],
  麻: ['广', '林'], 摩: ['麻', '手'], 魔: ['麻', '鬼'], 雄: ['厷', '隹'], 雇: ['戸', '隹'], 観: ['雚', '見'],
};
const VARIANT_DROP = { 亻: '人', 扌: '手', 氵: '水', 忄: '心', 辶: '辵' };
function partsOf(c) {
  if (PARTS[c]) return PARTS[c];
  const k = KJ.kanji[c]; if (!k) return [];
  let p = [...k.parts];
  for (const [v, full] of Object.entries(VARIANT_DROP)) if (p.includes(v)) p = p.filter(x => x !== full);
  p = p.filter(x => !p.some(q => q !== x && (KJ.kanji[q]?.parts || []).includes(x)));
  return p.slice(0, 3);
}

// Texts we can cite as passages
const texts = [];
for (const c of content.cards) texts.push({ id: 'card:' + c.card.id, kind: 'card', label: c.term, src: c.deck.toUpperCase(), ja: c.card.ja });
for (const a of content.articles) texts.push({ id: 'art:' + a.id, kind: 'article', label: a.title, src: a.level || '', ja: a.paras.join('') });

function passagesFor(s, max = 2) {
  const out = [];
  for (const t of texts) {
    const i = t.ja.indexOf(s); if (i < 0) continue;
    const a = Math.max(0, t.ja.lastIndexOf('。', i) + 1), e = t.ja.indexOf('。', i + s.length);
    let snip = t.ja.slice(a, e < 0 ? undefined : e + 1);
    if (snip.length > 46) { const st = Math.max(0, i - 18); snip = (st > a ? '…' : '') + t.ja.slice(st, st + 44) + '…'; }
    out.push({ id: t.id, kind: t.kind, label: t.label, src: t.src, snip, hit: s });
    if (out.length >= max) break;
  }
  return out;
}

const JLPT = w => wordsJ[w]?.jlpt ?? null;
function wordEntry(w) {
  const d = dict[w]; const ww = wordsJ[w];
  if (!d && !ww) return null;
  return {
    w, r: d?.r || ww?.r || '', m: (d?.m || (ww?.g ? ww.g.split(/,\s*/) : [])).slice(0, 6), p: d?.p || '',
    jlpt: JLPT(w), k: [...w].filter(isKanji),
  };
}
// Words containing a kanji: prefer words in our texts, then common JLPT words.
const allDictKeys = Object.keys(dict);
const corpus = texts.map(t => t.ja).join('');
function wordsWith(c, max = 5, exclude = []) {
  const cands = allDictKeys.filter(w => w.includes(c) && w.length <= 4 && !exclude.includes(w) && [...w].some(isKanji));
  const score = w => (corpus.includes(w) ? 100 : 0) + (JLPT(w) ? 40 + JLPT(w) * 6 : 0) - w.length * 3 + (dict[w].m?.length ? 5 : 0);
  return cands.filter(w => JLPT(w) || corpus.includes(w)).sort((a, b) => score(b) - score(a)).slice(0, max);
}
function kanjiEntry(c) {
  const k = KJ.kanji[c]; const rd = radByChar[c];
  return {
    c, m: k?.m || (rd ? '' : ''), on: k?.on || [], kun: k?.kun || [], st: k?.st || rd?.st || null,
    kk: k?.kk || '', grade: strokes.meta[c]?.g ?? null, jlpt: strokes.meta[c]?.jlpt || null,
    rad: rd ? { n: rd.n, name: rd.name, pos: rd.posEn } : null,
    parts: partsOf(c), paths: strokes.strokes[c] || null,
  };
}
function partEntry(p) {
  const r = KJ.radicals[p]; const rd = radByChar[p]; const k = KJ.kanji[p];
  const containing = (r?.kanji || []).filter(c => KJ.kanji[c]?.kr && KJ.kanji[c].kr <= 8)
    .sort((a, b) => (corpus.includes(b) - corpus.includes(a)) || KJ.kanji[a].kr - KJ.kanji[b].kr);
  if (p === '石' && !containing.includes('磨')) containing.splice(1, 0, '磨');
  if (p === '麻') containing.splice(0, containing.length, '磨', '摩', '魔');
  return { c: p, m: k?.m || '', st: r?.st || k?.st || null, name: rd?.name || r?.name || '', n: rd?.n || null, pos: rd?.posEn || '', count: r?.kanjiCount || containing.length, kanji: containing.slice(0, 7), paths: strokes.strokes[p] || null };
}

// Grammar and culture nodes: curated, each tied to a real sentence in the cards/article.
const GRAMMAR = {
  推進: [{ g: '〜に力を入れる', en: 'to put effort into', ex: '標準語の推進に力を入れた' }],
  反復: [{ g: '〜ながら', en: 'while; even as (concessive)', ex: '同じ場所を流れながら、同じ形を保たない' }],
  研ぐ: [{ g: '〜ことなく', en: 'without (ever) doing', ex: '毎日欠かすことなく' }],
  辛抱: [{ g: '〜までの辛抱だ', en: 'it is only until…', ex: '冬を越すまでの辛抱だ' }],
  磨く: [{ g: '〜に磨きをかける', en: 'to polish further, refine', ex: '腕に磨きをかける' }],
};
const CULTURE = {
  推進: [{ t: '方言札', en: 'The dialect placard: Meiji schools hung it on children who spoke dialect.' }],
  反復: [{ t: '式年遷宮', en: 'Ise is rebuilt every 20 years: repetition as the way a thing stays new.' }],
  研ぐ: [{ t: '研ぎ師', en: 'Sword polishers reveal a blade’s grain in stages, stone by finer stone.' }],
  磨く: [{ t: '研ぎ出し', en: 'Togidashi lacquer: layers are polished back until the gold beneath appears.' }],
  隹: [{ t: 'ふるとり', en: '“Old bird”: the short-tailed bird, set on the right as a 旁.' }],
  石: [{ t: '砥石', en: 'Whetstones run coarse to fine: 荒砥 → 中砥 → 仕上砥.' }],
};

const KW_EXTRA = { 磨: ['磨く', '研磨', '研磨', '磨き', '歯磨き'], 研: ['研ぐ', '研究', '研磨', '研修'] };
const SIB_EXTRA = { 磨く: ['研磨', '磨き'], 研ぐ: ['研磨'] };
const W = {}, K = {}, P = {};
const seeds = ['研ぐ', '推進', '反復', '磨く', ...content.cards.map(c => c.term)];
const queue = seeds.map(s => ['w', s, 0]);
const seen = new Set();
const MAXD = 3;
while (queue.length) {
  const [t, id, d] = queue.shift(); const key = t + id; if (seen.has(key)) continue; seen.add(key);
  if (t === 'w') {
    const e = wordEntry(id); if (!e) continue;
    e.pass = passagesFor(id); e.gram = GRAMMAR[id] || []; e.cult = CULTURE[id] || [];
    e.sib = []; for (const c of e.k) e.sib.push(...wordsWith(c, 3, [id, ...e.sib]));
    e.sib = [...new Set([...(SIB_EXTRA[id] || []), ...e.sib])].slice(0, 5);
    W[id] = e;
    if (d < MAXD) { for (const c of e.k) queue.push(['k', c, d + 1]); if (d < 2) for (const s of e.sib) queue.push(['w', s, d + 1]); }
  } else if (t === 'k') {
    const e = kanjiEntry(id); e.words = [...new Set([...(KW_EXTRA[id] || []), ...wordsWith(id, 5)])].slice(0, 5); e.pass = passagesFor(id, 1); e.cult = CULTURE[id] || []; K[id] = e;
    if (d < MAXD) { for (const p of e.parts) queue.push(['p', p, d + 1]); for (const w of e.words.slice(0, 4)) queue.push(['w', w, d + 1]); }
  } else {
    const e = partEntry(id); e.cult = CULTURE[id] || []; P[id] = e;
    if (KJ.kanji[id]?.kr) { K[id] = K[id] || Object.assign(kanjiEntry(id), { words: wordsWith(id, 5), pass: passagesFor(id, 1), cult: CULTURE[id] || [] }); }
    if (d < MAXD) for (const c of e.kanji.slice(0, 6)) queue.push(['k', c, d + 1]);
  }
}
// Every displayed word needs an entry for the sheet; sibling glosses
for (const e of Object.values(W)) for (const s of e.sib) if (!W[s]) { const x = wordEntry(s); if (x) W[s] = Object.assign(x, { pass: passagesFor(s), gram: [], cult: [], sib: [], leaf: true }); }
for (const e of Object.values(K)) for (const s of e.words || []) if (!W[s]) { const x = wordEntry(s); if (x) W[s] = Object.assign(x, { pass: passagesFor(s), gram: [], cult: [], sib: [], leaf: true }); }

// Ise article: paragraphs of tokens [surface, reading-split, base, content?]
function artTokens(a, nParas) {
  const out = []; let start = 0;
  for (let i = 0; i < nParas; i++) { const end = a.paras[i]; out.push(a.tokens.slice(start, end).map(t => [t.s, t.f.map(f => f.r ? [f.t, f.r] : [f.t]), t.b, t.c ? 1 : 0])); start = end; }
  return out;
}
const article = { id: ise.id, title: ise.title, level: ise.authorLevel, source: ise.sourceLabel, chars: ise.text.replace(/\s/g, '').length, paras: artTokens(ise, 3) };
// Gloss table for every content word in the shown paragraphs
const GL = {};
for (const p of article.paras) for (const t of p) if (t[3]) { const b = t[2]; if (!GL[b]) { const e = wordEntry(b); if (e) GL[b] = { r: e.r, m: e.m.slice(0, 3), p: e.p, jlpt: e.jlpt }; } }
for (const [b, e] of Object.entries(GL)) if (!W[b]) W[b] = Object.assign(wordEntry(b), { pass: passagesFor(b), gram: GRAMMAR[b] || [], cult: CULTURE[b] || [], sib: [], leaf: true });
for (const e of Object.values(W)) for (const c of e.k) if (!K[c]) K[c] = Object.assign(kanjiEntry(c), { words: wordsWith(c, 5), pass: [], cult: [] });

const shelf = content.articles.map(a => ({ id: a.id, title: a.title, level: a.level, source: a.sourceLabel, chars: a.paras.join('').length, pic: '/' + a.picture, pic600: '/' + a.picture600, lead: a.paras[0].slice(0, 60) }));
const cards = content.cards.map(c => ({ deck: c.deck, group: c.group, term: c.term, reading: c.reading, meaning: c.meaning, defJa: c.defJa, pos: c.pos, kanji: c.kanji, id: c.card.id, ja: c.card.ja, en: c.card.en, form: c.card.form, ruby: c.card.ruby, register: c.card.register, topic: c.card.topic }));

// Strip stroke paths except for kanji/parts reachable within the shown walks (keeps the file small)
const KEEP = new Set('研石磨推進隹反復辛抱麻开辶扌彳又厂集権雑難確岩破砂磁拓観準怠想政史経済期間短'.split(''));
for (const e of Object.values(K)) if (!KEEP.has(e.c)) e.paths = null;
for (const e of Object.values(P)) if (!KEEP.has(e.c)) e.paths = null;
const out = `// GENERATED by tools/build-data.mjs from real repo data (JMdict, KANJIDIC2, KanjiVG: CC BY-SA). Do not edit.\nwindow.MIGAKI_DATA = ${JSON.stringify({ W, K, P, article, shelf, cards, GL })};\n`;
writeFileSync(resolve(ROOT, 'docs/redesign/concepts/a-migaki/js/data.js'), out);
console.log('words', Object.keys(W).length, 'kanji', Object.keys(K).length, 'parts', Object.keys(P).length, 'bytes', out.length);
console.log('研ぐ', JSON.stringify(W['研ぐ']).slice(0, 400));
console.log('研', JSON.stringify({ ...K['研'], paths: !!K['研']?.paths }));
console.log('石', JSON.stringify({ ...P['石'], paths: undefined }));
console.log('反復', JSON.stringify(W['反復']).slice(0, 600));
console.log('推進 sib', W['推進'].sib, '隹', P['隹']?.kanji, '磨く', JSON.stringify(W['磨く'])?.slice(0, 300));
