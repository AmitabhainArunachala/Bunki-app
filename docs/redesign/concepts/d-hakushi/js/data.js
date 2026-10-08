// The content layer: REAL cards (kit), REAL decks (data/index.json, built from decks/*/deck.json),
// REAL articles (data/articles.json, built from data/articles/*.json), and one demo learner record.
const here = new URL('../', import.meta.url);
const j = p => fetch(new URL(p, here)).then(r => { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); });

export const D = { cards: [], articles: [], words: [], kanji: {}, parts: {}, sentences: [], byTerm: new Map() };

export async function load() {
  const [kit, idx, arts] = await Promise.all([j('../_kit/content.json'), j('data/index.json'), j('data/articles.json')]);
  D.cards = kit.cards;
  D.articles = arts;
  D.words = idx.words.map((w, i) => ({ i, deck: w[0], group: w[1], term: w[2], reading: w[3], meaning: w[4], defJa: w[5], pos: w[6], kanji: [...w[7]] }));
  D.kanji = idx.kanji; D.parts = idx.parts; D.sentences = idx.sentences;
  for (const w of D.words) if (!D.byTerm.has(w.term)) D.byTerm.set(w.term, w);
  for (const a of D.articles) {
    a.text = a.tokens.map(t => t[0]).join('');
    a.mine = a.tokens.filter(t => D.byTerm.has(t[1])).length;
    a.minutes = Math.max(1, Math.round(a.chars / 240));
  }
  return D;
}

export const groupEn = { mind: 'The mind and learning', india: 'Indian and Buddhist philosophy', ai: 'AI and semiconductors', history: 'World history', language: 'Japanese about Japanese', other: 'Wider interests' };
export const groupJa = { mind: '心と学び', india: 'インド・仏教', ai: 'AI・半導体', history: '世界史', language: '日本語', other: 'ひろい関心' };
export const registerEn = { 論: 'Essay', 講: 'Lecture', 学: 'Textbook', 報: 'Report', 語: 'Narrative', 話: 'Talk' };

// Component glosses (Kangxi radicals / common components). Unknown components show no gloss.
export const PART = {
  亻:'person', 人:'person', 扌:'hand', 手:'hand', 隹:'short-tailed bird', 辶:'walk, road', 氵:'water', 水:'water', 忄:'heart', 心:'heart',
  口:'mouth', 木:'tree', 言:'say', 日:'sun, day', 月:'moon, flesh', 土:'earth', 糸:'thread', 宀:'roof', 艹:'grass', 王:'king, jewel',
  又:'hand, again', 厂:'cliff', 彳:'step', 攵:'strike', 貝:'shell, money', 目:'eye', 立:'stand', 田:'field', 力:'power', 禾:'grain',
  牛:'cow', 大:'big', 子:'child', 白:'white', 音:'sound', 刂:'blade', 玉:'jewel', 見:'see', 女:'woman', 米:'rice', 頁:'head', 寸:'inch',
  山:'mountain', 弓:'bow', 刀:'sword', 灬:'fire', 火:'fire', 竹:'bamboo', 戈:'halberd', 矢:'arrow', 門:'gate', 广:'house on cliff',
  石:'stone', 豆:'bean', 十:'ten', 一:'one', 八:'eight', 包:'wrap', 台:'pedestal', 正:'correct', 止:'stop', 車:'cart', 衣:'clothing',
  耳:'ear', 虫:'insect', 走:'run', 酉:'wine jar', 金:'metal', 雨:'rain', 食:'eat', 馬:'horse', 魚:'fish', 鳥:'bird', 門:'gate',
  甘:'sweet', 其:'basket', 相:'mutual', 史:'history', 乂:'mow', 丿:'slash', 卜:'divination', 斉:'even', 復:'return',
  复:'go back', 反:'reverse', 冖:'cover', 亠:'lid', 勹:'wrap', 囗:'enclosure', 羊:'sheep', 儿:'legs', 二:'two', 冂:'frame', 夕:'evening',
  巾:'cloth', 生:'life', 礻:'altar', 小:'small', 斤:'axe', 犬:'dog', 阝:'mound, village', 里:'village', 爪:'claw', 工:'craft', 重:'heavy',
};

// Hand-written notes, each tied to real content in this prototype (cards, articles).
export const NOTES = {
  推進: { grammar: { p: '〜に力を入れる', en: 'put real effort into …', ja: '…に本気で取り組む', src: '標準語の推進に力を入れた' },
          culture: { k: '方言札', en: 'The dialect placard: Okinawan schoolchildren who spoke dialect wore a wooden tag as punishment.', ja: '方言を話した児童に下げさせた札。標準語推進の影。' } },
  反復: { grammar: { p: '〜ながら', en: 'while … (and yet)', ja: '…しつつ、それでも', src: '同じ場所を流れながら' },
          culture: { k: '式年遷宮', en: 'Every twenty years Ise rebuilds its shrines anew: repetition as the way a form survives.', ja: '二十年ごとに社殿を建て替える伊勢の営み。反復による継承。' } },
  隹: { culture: { k: '説文解字', en: 'The Shuowen (100 CE) defines 隹 as the general name for short-tailed birds, against 鳥.', ja: '『説文解字』は隹を「鳥の短尾の総名」とする。' } },
};

// ---- the demo learner record (one source for every number on every screen) ----
export const R = {
  today: new Date(2026, 9, 8),
  since: new Date(2026, 2, 12),
  due: { n1: 18, n2: 11, senmon: 9 }, newToday: 12,
  held: { n1: 214, n2: 171, senmon: 96 },
  articlesRead: 23, charsRead: 31402,
  dayWord: '推進', tomorrowWord: '研ぐ',
  recovered: [ { term: '怠る', lapsed: '09-14', held: '10-06' }, { term: '辛抱', lapsed: '08-30', held: '10-02' }, { term: '目下', lapsed: '09-21', held: '10-07' } ],
};
R.dueTotal = R.due.n1 + R.due.n2 + R.due.senmon;
R.days = Math.round((R.today - R.since) / 864e5);

export function heldWords() {
  const out = [];
  for (const d of ['n1', 'n2', 'senmon']) out.push(...D.words.filter(w => w.deck === d).slice(0, R.held[d]));
  return out;
}
export function kanjiMet() { const s = new Set(); for (const w of heldWords()) for (const c of w.kanji) s.add(c); return s.size; }

// deterministic activity for the year book (seeded; same every load)
export function activity() {
  let s = 20261008; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const days = [];
  for (let i = 0; i <= R.days; i++) {
    const d = new Date(R.since); d.setDate(d.getDate() + i);
    const r = rnd(); const lvl = r < .1 ? 0 : r < .35 ? 1 : r < .8 ? 2 : 3;
    days.push({ d, lvl });
  }
  const gold = ['2026-08-30', '2026-09-14', '2026-09-21', '2026-10-02', '2026-10-06', '2026-10-07'];
  for (const x of days) { const k = iso(x.d); if (gold.includes(k)) x.gold = true; if (x.gold && !x.lvl) x.lvl = 2; }
  return days;
}
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---- the web ----
export function wordsWithKanji(c) { return (D.kanji[c]?.[4] || []).map(i => D.words[i]); }
export function kanjiWithPart(p) { return D.parts[p] || []; }
export function passagesWith(s, n = 3) {
  const out = []; let count = 0;
  for (const [txt, src] of D.sentences) if (txt.includes(s)) { count++; if (out.length < n && txt.length < 90) out.push({ txt, src }); }
  return { count, list: out };
}
export const isKanji = ch => /[一-鿿々]/.test(ch);

// One language at a time: in JA mode a kanji is glossed by its reading, never by English.
import { LANG as _L } from './i18n.js';
export const kGloss = (c, m) => _L === 'ja' ? (D.kanji[c]?.[2] || '') : (m ?? D.kanji[c]?.[0] ?? '');
export const pGloss = p => _L === 'ja' ? '' : (PART[p] || '');
