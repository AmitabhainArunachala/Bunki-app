/**
 * 模試 · the mock-set builder. Deterministic — no clock, no rng seed but our
 * own, so the same pinned data always yields byte-identical sets.
 *
 * The operator's word (2026-08-31): at least five traditional mock papers per
 * JLPT level, plus the scaffold for custom ones. Real JLPT papers are
 * copyrighted and none are copied here: what is traditional is the SHAPE —
 * 漢字読み · 表記 · 文脈規定 · 文法形式の判断 · 読解 — and every item's
 * substance is drawn from this repo's own rights-clean assets:
 *
 *   · data/share_alike/words.json   — the graded word list (JLPT levels)
 *   · data/share_alike/kanji.json   — readings, for plausible distractors
 *   · data/proprietary_safe/examples/ — 45k attested sentences (CC BY 4.0 /
 *     CC BY 2.0 FR / CC BY 2.5), the source of every carrier sentence
 *   · data/articles/                — the CC-licensed graded shelf, the
 *     source of every 読解 passage
 *
 * The honesty that makes generated items legitimate: EVERY right answer is
 * what the corpus actually says. A reading is the reading the tokenizer
 * recorded; a form is a form attested for that lemma and only one of them
 * stands in the syntax the sentence provides; a passage answer is
 * recoverable from the passage itself.
 * Nothing is invented, so nothing can be wrong in the way a model's
 * invention is wrong.
 *
 * Sets ship 検収前 (approved: false) — the operator's eye is the last gate.
 *
 * Usage: node build-mock-sets.mjs [--out <dir>]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(TOOL_DIR, '..');
const DATA_DIR = resolve(CORRIDOR_DIR, 'data');
const OUT_DIR = resolve(DATA_DIR, 'mock');
const SETS_DIR = resolve(OUT_DIR, 'sets');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/* ------------------------------------------------------------ determinism */
function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ------------------------------------------------------------------ pools */
const words = readJson(resolve(DATA_DIR, 'share_alike/words.json')).words;
const exManifest = readJson(resolve(DATA_DIR, 'proprietary_safe/examples/manifest.json'));
const articleIndex = readJson(resolve(DATA_DIR, 'articles/index.json'));

// sentence bank: flat array, id = position; token = [surface, lemma, reading, contentFlag, pos, ruby]
const SENTS_PER_SHARD = exManifest.sharding.sentsPerShard;
const sentences = [];
for (let n = 0; n < exManifest.sharding.sentenceShards; n += 1) {
  const shard = readJson(
    resolve(DATA_DIR, `proprietary_safe/examples/s-${String(n).padStart(2, '0')}.json`),
  );
  for (let i = 0; i < shard.length; i += 1) sentences[n * SENTS_PER_SHARD + i] = shard[i];
}

const TOK_SURFACE = 0;
const TOK_LEMMA = 1;
const TOK_CONTENT = 3;
const TOK_POS = 4;

/** rank 1 (easiest, N5) … 5 (N1), 6 (beyond the graded list) */
const RANK = { 5: 1, 4: 2, 3: 3, 2: 4, 1: 5 };
const rankOfLemma = (lemma) => {
  const entry = words[lemma];
  return entry && entry.jlpt ? RANK[entry.jlpt] : 6;
};

const LEVELS = [
  { level: 'N5', jlpt: 5, maxTokens: 16, rankCap: 2, overBudget: 1, bands: ['初級前半', '初級後半'] },
  { level: 'N4', jlpt: 4, maxTokens: 20, rankCap: 3, overBudget: 2, bands: ['初級後半', '中級前半'] },
  { level: 'N3', jlpt: 3, maxTokens: 26, rankCap: 4, overBudget: 3, bands: ['中級前半', '中級後半'] },
  { level: 'N2', jlpt: 2, maxTokens: 32, rankCap: 6, overBudget: 99, bands: ['中級後半', '上級前半'] },
  { level: 'N1', jlpt: 1, maxTokens: 40, rankCap: 6, overBudget: 99, bands: ['上級前半', '上級後半'] },
];

/** A carrier sentence is admissible when it is short enough and does not lean
 * on words far above the paper's level — the graded list is the only judge. */
function admissible(tokens, cfg) {
  if (tokens.length > cfg.maxTokens || tokens.length < 4) return false;
  let over = 0;
  for (const t of tokens) {
    if (!t[TOK_CONTENT]) continue;
    if (rankOfLemma(t[TOK_LEMMA]) > cfg.rankCap) over += 1;
    if (over > cfg.overBudget) return false;
  }
  return true;
}

// word → sentence ids (built once from the bank itself: the shipped index
// shards are keyed by surface; we want lemma-keyed, level-filtered access)
const byLemma = new Map();
const surfacesByLemma = new Map(); // lemma → Map(surface → count)
for (let sid = 0; sid < sentences.length; sid += 1) {
  const row = sentences[sid];
  if (!row) continue;
  const tokens = row[0];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t[TOK_CONTENT]) {
      let list = byLemma.get(t[TOK_LEMMA]);
      if (!list) byLemma.set(t[TOK_LEMMA], (list = []));
      if (list.length < 400) list.push(sid);
      let forms = surfacesByLemma.get(t[TOK_LEMMA]);
      if (!forms) surfacesByLemma.set(t[TOK_LEMMA], (forms = new Map()));
      forms.set(t[TOK_SURFACE], (forms.get(t[TOK_SURFACE]) || 0) + 1);
    }
  }
}

const HAS_KANJI = /[一-鿿]/u;
const KANA_ONLY = /^[぀-ヿー]+$/u;

/** the graded words of one level that a paper may test: written with kanji,
 * with a recorded reading, and actually attested in the sentence bank */
function levelWords(cfg) {
  return Object.values(words)
    .filter(
      (w) =>
        w.jlpt === cfg.jlpt &&
        HAS_KANJI.test(w.w) &&
        w.r &&
        KANA_ONLY.test(w.r) &&
        w.w.length <= 4 &&
        (byLemma.get(w.w) || []).length > 0,
    )
    .sort((a, b) => (a.w < b.w ? -1 : a.w > b.w ? 1 : 0));
}

/* --------------------------------------------------------------- builders */
const BLANK = '（　　）';

function carrierFor(word, cfg, rng, used) {
  const ids = shuffled(byLemma.get(word.w) || [], rng);
  for (const sid of ids) {
    if (used.has(sid)) continue;
    const row = sentences[sid];
    if (!row) continue;
    const tokens = row[0];
    if (!admissible(tokens, cfg)) continue;
    const at = tokens.findIndex((t) => t[TOK_LEMMA] === word.w && t[TOK_SURFACE] === word.w);
    if (at < 0) continue;
    // the answer may not be given away elsewhere in the same sentence
    if (tokens.filter((t) => t[TOK_SURFACE] === word.w).length !== 1) continue;
    return { sid, tokens, at, en: row[1] };
  }
  return null;
}

const readingDistractors = (word, pool, rng) => {
  const share = pool.filter(
    (w) => w.w !== word.w && w.r !== word.r && [...w.w].some((ch) => word.w.includes(ch)),
  );
  const sameLen = pool.filter(
    (w) => w.w !== word.w && w.r !== word.r && Math.abs(w.r.length - word.r.length) <= 1,
  );
  const picked = [];
  for (const source of [shuffled(share, rng), shuffled(sameLen, rng)]) {
    for (const w of source) {
      if (picked.length >= 3) break;
      if (picked.some((p) => p.r === w.r)) continue;
      picked.push(w);
    }
  }
  return picked.slice(0, 3).map((w) => w.r);
};

function options(right, distractors, rng) {
  const opts = shuffled([right, ...distractors], rng);
  return { opts, right: opts.indexOf(right) };
}

/** 漢字読み — the word stands in a real sentence; name its reading. */
function itemKanjiReading(word, cfg, rng, pool, used) {
  const carrier = carrierFor(word, cfg, rng, used);
  if (!carrier) return null;
  const distractors = readingDistractors(word, pool, rng);
  if (distractors.length < 3) return null;
  used.add(carrier.sid);
  const shown = carrier.tokens
    .map((t, i) => (i === carrier.at ? `【${t[TOK_SURFACE]}】` : t[TOK_SURFACE]))
    .join('');
  const { opts, right } = options(word.r, distractors, rng);
  return {
    type: 'kanji-reading',
    q: `${shown}\n【　】の言葉の読み方は。`,
    qEn: 'How is the marked word read?',
    opts,
    right,
    why: `【${word.w}】は「${word.r}」。${word.g}`,
    subject: `word:${word.w}`,
    sid: carrier.sid,
  };
}

/** 表記 — the reading stands in the sentence; name its written form. */
function itemOrthography(word, cfg, rng, pool, used) {
  const carrier = carrierFor(word, cfg, rng, used);
  if (!carrier) return null;
  const share = shuffled(
    pool.filter(
      (w) =>
        w.w !== word.w &&
        w.r !== word.r &&
        w.w.length === word.w.length &&
        ([...w.w].some((ch) => word.w.includes(ch)) || w.r.length === word.r.length),
    ),
    rng,
  );
  const distractors = [];
  for (const w of share) {
    if (distractors.length >= 3) break;
    if (distractors.includes(w.w)) continue;
    distractors.push(w.w);
  }
  if (distractors.length < 3) return null;
  used.add(carrier.sid);
  const shown = carrier.tokens
    .map((t, i) => (i === carrier.at ? `【${word.r}】` : t[TOK_SURFACE]))
    .join('');
  const { opts, right } = options(word.w, distractors, rng);
  return {
    type: 'orthography',
    q: `${shown}\n【　】の言葉は、漢字でどう書くか。`,
    qEn: 'How is the marked word written in kanji?',
    opts,
    right,
    why: `「${word.r}」は【${word.w}】。${word.g}`,
    subject: `word:${word.w}`,
    sid: carrier.sid,
  };
}

/** 文脈規定 — which word belongs in this sentence. */
function itemContext(word, cfg, rng, pool, used) {
  const carrier = carrierFor(word, cfg, rng, used);
  if (!carrier) return null;
  const targetPos = carrier.tokens[carrier.at][TOK_POS];
  const present = new Set(carrier.tokens.map((t) => t[TOK_SURFACE]));
  const same = shuffled(
    pool.filter((w) => {
      if (w.w === word.w || present.has(w.w)) return false;
      const forms = byLemma.get(w.w);
      if (!forms || !forms.length) return false;
      const sample = sentences[forms[0]];
      const tok = sample && sample[0].find((t) => t[TOK_LEMMA] === w.w);
      return tok ? tok[TOK_POS] === targetPos : false;
    }),
    rng,
  ).slice(0, 3);
  if (same.length < 3) return null;
  used.add(carrier.sid);
  const shown = carrier.tokens.map((t, i) => (i === carrier.at ? BLANK : t[TOK_SURFACE])).join('');
  const { opts, right } = options(
    word.w,
    same.map((w) => w.w),
    rng,
  );
  return {
    type: 'context',
    q: `${shown}\n（　　）に入るのはどれか。`,
    qEn: 'Which word belongs in the blank?',
    opts,
    right,
    why: `${word.w}（${word.r}）— ${word.g}`,
    subject: `word:${word.w}`,
    sid: carrier.sid,
  };
}

/** 文法形式の判断 · form — which form of this word the sentence takes. */
function itemForm(word, cfg, rng, used) {
  const forms = surfacesByLemma.get(word.w);
  if (!forms || forms.size < 4) return null;
  const ids = shuffled(byLemma.get(word.w) || [], rng);
  for (const sid of ids) {
    if (used.has(sid)) continue;
    const row = sentences[sid];
    if (!row) continue;
    const tokens = row[0];
    if (!admissible(tokens, cfg)) continue;
    const at = tokens.findIndex(
      (t) => t[TOK_LEMMA] === word.w && ['動詞', '形容詞'].includes(t[TOK_POS]),
    );
    if (at < 0) continue;
    const truth = tokens[at][TOK_SURFACE];
    if (tokens.filter((t) => t[TOK_SURFACE] === truth).length !== 1) continue;
    const others = shuffled(
      [...forms.keys()].filter((f) => f !== truth && f.length <= truth.length + 3),
      rng,
    ).slice(0, 3);
    if (others.length < 3) continue;
    used.add(sid);
    const shown = tokens.map((t, i) => (i === at ? BLANK : t[TOK_SURFACE])).join('');
    const { opts, right } = options(truth, others, rng);
    return {
      type: 'form',
      q: `${shown}\n（　　）に入る形はどれか。`,
      qEn: 'Which form belongs in the blank?',
      opts,
      right,
      why: `辞書形は「${word.w}」。この文では「${truth}」。`,
      subject: `word:${word.w}`,
      sid,
    };
  }
  return null;
}

/* Particle cloze was built here and then removed on purpose. The corpus can
 * prove that a particle NEVER follows a given word in 45,000 sentences — but
 * unattested is not ungrammatical: 「午後に面接を行う」 and 「午後まで面接を
 * 行う」 are both real Japanese, so a "clean" distractor could still be a
 * defensible answer, and an item with two answers is a broken item. No amount
 * of counting fixes that. Form choice is bound by the syntax AFTER the blank
 * (only 読む stands before べき; only 働き before ます), so its distractors are
 * impossible rather than merely unattested. 文法 is built from form alone
 * until a real grammar-point bank can test particles honestly. */

/* ------------------------------------------------------------- 読解 (dokkai) */
const articles = articleIndex.articles;
const bandOf = (a) => a.grading?.signals?.jreadability?.band || '';

function excerptOf(article, maxChars) {
  const body = readJson(resolve(DATA_DIR, 'articles', article.file));
  const text = String(body.text || '').replace(/\s+/gu, '');
  const parts = text.split('。').filter(Boolean);
  let out = '';
  for (const part of parts) {
    if (out.length && out.length + part.length + 1 > maxChars) break;
    out += `${part}。`;
    if (out.length >= maxChars * 0.6) break;
  }
  return { text: out || `${parts[0] || ''}。`, tokens: body.tokens || [] };
}

function passageSection(article, cfg, rng, allTitles) {
  const { text } = excerptOf(article, cfg.jlpt >= 4 ? 180 : cfg.jlpt === 3 ? 260 : 360);
  if (text.length < 60) return null;
  const items = [];
  // 主旨 — which headline belongs to this passage (the real one, of course)
  const otherTitles = shuffled(
    allTitles.filter((t) => t !== article.title),
    rng,
  ).slice(0, 3);
  if (otherTitles.length === 3) {
    const { opts, right } = options(article.title, otherTitles, rng);
    items.push({
      type: 'gist',
      q: 'この文章の見出しとして、いちばん合うのはどれか。',
      qEn: 'Which headline best fits this passage?',
      opts,
      right,
      why: `${article.sourceLabel}（${article.date}）の見出し。`,
    });
  }
  // 内容理解 — a word the passage itself supplies, blanked in place
  const inText = new Map();
  for (const ch of text) inText.set(ch, (inText.get(ch) || 0) + 1);
  const candidates = Object.values(words).filter((w) => {
    if (!w.jlpt || w.jlpt > cfg.jlpt + 1 || !HAS_KANJI.test(w.w) || w.w.length < 2) return false;
    const first = text.indexOf(w.w);
    return first >= 0 && text.indexOf(w.w, first + 1) < 0;
  });
  const target = shuffled(candidates, rng)[0];
  if (target) {
    const decoys = shuffled(
      Object.values(words).filter(
        (w) =>
          w.jlpt === target.jlpt &&
          w.w !== target.w &&
          w.w.length === target.w.length &&
          HAS_KANJI.test(w.w) &&
          !text.includes(w.w),
      ),
      rng,
    )
      .slice(0, 3)
      .map((w) => w.w);
    if (decoys.length === 3) {
      const { opts, right } = options(target.w, decoys, rng);
      items.push({
        type: 'passage-cloze',
        q: `本文の（　　）に入る言葉はどれか。\n${text.replace(target.w, BLANK)}`,
        qEn: 'Which word belongs in the blank in the passage?',
        opts,
        right,
        why: `本文のとおり「${target.w}（${target.r}）」。${target.g}`,
        subject: `word:${target.w}`,
      });
    }
  }
  if (!items.length) return null;
  return {
    type: 'dokkai',
    title: tx2('読解', 'reading'),
    minutes: cfg.jlpt >= 4 ? 10 : 20,
    passage: {
      text,
      source: article.sourceLabel,
      licence: article.licence,
      attribution: article.attribution,
      url: article.url,
      articleId: article.id,
    },
    items,
  };
}

const tx2 = (ja, en) => ({ ja, en });

/* ------------------------------------------------------------------ build */
function buildSet(cfg, n, pool, articlePool, allTitles, levelWordsUsed) {
  const setId = `${cfg.level.toLowerCase()}-${String(n + 1).padStart(2, '0')}`;
  const rng = mulberry32(hashSeed(`bunki-mock/${setId}`));
  const used = new Set();
  const taken = new Set();
  const order = shuffled(pool, rng);
  // five papers at one level test five different sets of words: a word spent
  // on an earlier paper is spent for the level, so sitting all five is five
  // separate measurements rather than the same one taken again
  const pick = (make, count, kind) => {
    const items = [];
    for (const word of order) {
      if (items.length >= count) break;
      if (taken.has(`${kind}:${word.w}`) || taken.has(word.w)) continue;
      if (levelWordsUsed.has(word.w)) continue;
      const item = make(word, cfg, rng, pool, used);
      if (!item) continue;
      taken.add(word.w);
      items.push(item);
    }
    return items;
  };
  const reading = pick(itemKanjiReading, 4, 'r');
  const orth = pick(itemOrthography, 3, 'o');
  const context = pick(itemContext, 3, 'c');
  const form = pick((w, c, r, p, u) => itemForm(w, c, r, u), 7, 'f');
  const article = articlePool[n % articlePool.length];
  const dokkai = article ? passageSection(article, cfg, rng, allTitles) : null;

  const sections = [];
  const goi = [...reading, ...orth, ...context];
  if (goi.length) {
    sections.push({
      type: 'moji-goi',
      title: tx2('文字・語彙', 'script and vocabulary'),
      minutes: cfg.jlpt >= 4 ? 20 : 25,
      items: goi,
    });
  }
  const bunpou = [...form];
  if (bunpou.length) {
    sections.push({
      type: 'bunpou',
      title: tx2('文法', 'grammar'),
      minutes: cfg.jlpt >= 4 ? 15 : 20,
      items: bunpou,
    });
  }
  if (dokkai) sections.push(dokkai);
  const count = sections.reduce((n2, s) => n2 + s.items.length, 0);
  if (count < 12) return null;
  for (const word of taken) levelWordsUsed.add(word);

  const sources = [
    {
      name: 'graded word list',
      attribution: readJson(resolve(DATA_DIR, 'share_alike/words.json')).sources?.[0]?.attribution || 'open-anki-jlpt-decks',
      licence: 'CC BY 4.0',
    },
    ...exManifest.sources.map((s) => ({
      name: s.name,
      attribution: s.attribution,
      licence: s.licence,
      url: s.url,
    })),
  ];
  if (dokkai) {
    sources.push({
      name: dokkai.passage.articleId,
      attribution: dokkai.passage.attribution,
      licence: dokkai.passage.licence,
      url: dokkai.passage.url,
    });
  }
  return {
    schemaVersion: 1,
    setId,
    kind: 'jlpt',
    level: cfg.level,
    title: tx2(`${cfg.level} 模擬試験 ${n + 1}`, `${cfg.level} mock paper ${n + 1}`),
    approved: false,
    built: 'tools/build-mock-sets.mjs — deterministic, from pinned data',
    rights: {
      note: '本問は本アプリの権利処理済み資料から機械生成した。実際の日本語能力試験の問題は含まない。',
      noteEn:
        'Generated from this app’s own rights-cleared assets. No real JLPT question is reproduced.',
      sources,
    },
    sections,
  };
}

function main() {
  const catalog = [];
  const allTitles = articles.map((a) => a.title);
  for (const cfg of LEVELS) {
    const pool = levelWords(cfg);
    const articlePool = articles.filter((a) => cfg.bands.includes(bandOf(a)));
    const levelWordsUsed = new Set();
    let made = 0;
    for (let n = 0; made < 5 && n < 12; n += 1) {
      const set = buildSet(cfg, n, pool, articlePool, allTitles, levelWordsUsed);
      if (!set) continue;
      set.setId = `${cfg.level.toLowerCase()}-${String(made + 1).padStart(2, '0')}`;
      set.title = tx2(`${cfg.level} 模擬試験 ${made + 1}`, `${cfg.level} mock paper ${made + 1}`);
      writeFileSync(resolve(SETS_DIR, `${set.setId}.json`), `${JSON.stringify(set, null, 1)}\n`);
      catalog.push({
        setId: set.setId,
        kind: set.kind,
        level: set.level,
        title: set.title,
        approved: set.approved,
        items: set.sections.reduce((n2, s) => n2 + s.items.length, 0),
        sections: set.sections.map((s) => s.type),
        file: `${set.setId}.json`,
      });
      made += 1;
    }
    console.log(`${cfg.level}: ${made} sets · pool ${pool.length} words · ${articlePool.length} passages`);
  }
  const index = {
    schemaVersion: 1,
    law: '模試は評価であって予定ではない — mock papers are evidence, never a schedule, and never a pass prediction.',
    built: 'tools/build-mock-sets.mjs',
    sets: catalog,
  };
  writeFileSync(resolve(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
  console.log(`\n${catalog.length} sets · ${catalog.reduce((n, s) => n + s.items, 0)} items → data/mock/`);
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
if (existsSync(SETS_DIR)) for (const f of readdirSync(SETS_DIR)) rmSync(resolve(SETS_DIR, f));
else mkdirSync(SETS_DIR, { recursive: true });
main();
