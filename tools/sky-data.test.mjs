import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { adaptSkyReference } from './sky-reference-adapter.mjs';
/* global URL, process */
/** The first screen's sky (宙) reads two data files, one per licence pool (2026-11-11).
 *
 * The approved sky was built as one file from the app's own data: words, readings, kanji, parts and sound families
 * from share_alike sources, and the meaning links from proprietary_safe/sem.json. The pools are never merged into one
 * record set (prototypes/corridor/README.md, "Licence pools"; corpus/src/corpus/provenance.py), so the build writes
 * data/share_alike/sky.json and data/proprietary_safe/sky-sem.json, and the app's mount (sky/mount.mjs) joins them in
 * memory before it hands the data to the engine.
 *
 * Checked here against the source files themselves: each file names its pool and sources; every index resolves; every
 * word row agrees with words.json; every kanji row of the table agrees with kanji.json; every member of every sound
 * family carries that family's exact on-reading; every meaning link is a link stored in sem.json with its relation and
 * note; each file's counts are its own; and the mount's join gives the engine the shape it reads. */
import { existsSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import vm from 'node:vm';
import { beforeAll, describe, expect, test } from 'vitest';
import { CORRIDOR, corridorDeclarations } from './corridor-declarations.mjs';

const ORIGINAL_SKY_HASHES = Object.freeze({
  'sky-data.json': '85c0db0477885b7b34dbc24543cdb25671d638d0e5498ac1aa0539684d40c3e0',
  'sky-context.json': '5cc8e2f7643fa6b27e6eec2b6c905bacc82dd01de98ca2dd4f5b8ba882633c48',
});
function originalSkyBytes(name) {
  if (!Object.hasOwn(ORIGINAL_SKY_HASHES, name)) throw new Error('Unknown original sky fixture');
  const overridden = Object.hasOwn(process.env, 'SKY_LIVE_DIR');
  if (overridden && !process.env.SKY_LIVE_DIR)
    throw new Error('Explicit SKY_LIVE_DIR must be nonempty');
  const path = overridden
    ? `${process.env.SKY_LIVE_DIR}/${name}`
    : new URL(`./fixtures/sky-reference-original/${name}`, import.meta.url);
  const bytes = readFileSync(path);
  expect(createHash('sha256').update(bytes).digest('hex'), `Original raw sky bytes ${name}`).toBe(
    ORIGINAL_SKY_HASHES[name],
  );
  return bytes;
}

const json = (path) => JSON.parse(readFileSync(new URL(path, CORRIDOR), 'utf8'));
const SKY = json('data/share_alike/sky.json');
const SEM = json('data/proprietary_safe/sky-sem.json');
const WORDS = json('data/share_alike/words.json').words;
const KANJI = json('data/share_alike/kanji.json').kanji;
const DICT = json('data/share_alike/dict.json').words;
const EXTRA = json('data/share_alike/reference-extra.json');
const STORED = json('data/proprietary_safe/sem.json').edges;
const REPO = new URL('../', import.meta.url);
const RELATIONS = new Set(['syn', 'ant', 'reg', 'fam', 'col', 'thm']);
const unbracketed = (text) => String(text || '').replace(/\s*\([^)]*\)/gu, '');
const REVIEWED_GLOSSES = new Map([
  ['撮る\tとる', 'to take (a photograph)'],
  ['正確\tせいかく', 'accurate, correct, precise'],
  ['～等\t～とう', 'class, rank'],
  ['伯父さん\tおじさん', 'uncle'],
  ['納める\tおさめる', 'to pay (fees, taxes), to supply'],
  ['空く\tあく', 'to open, to become empty'],
  ['人目\tひとめ', 'public gaze, notice'],
  ['現在\tげんざい', 'the present, now'],
  ['者\tもの', 'person'],
  ['多少\tたしょう', 'a little, some'],
  ['昼食\tちゅうしょく', 'lunch'],
  ['親類\tしんるい', 'relative, relation'],
  ['関西\tかんさい', 'Kansai region'],
  ['関東\tかんとう', 'Kantō region'],
  ['繊維\tせんい', 'fiber'],
  ['着色\tちゃくしょく', 'coloring'],
  ['凍結\tとうけつ', 'freezing'],
  ['重み\tおもみ', 'weight'],
]);

describe('the sky data, one file per licence pool', () => {
  test('each file names its pool, and every retained source it names exists in that record', () => {
    expect(SKY.pool).toBe('share_alike');
    expect(SEM.pool).toBe('proprietary_safe');
    expect(SKY.sources).toContainEqual(
      expect.objectContaining({ path: 'prototypes/corridor/tools/gloss_heal.py' }),
    );
    for (const [file, pool] of [
      [SKY, 'share_alike'],
      [SEM, 'proprietary_safe'],
    ]) {
      const retained = file.sources.filter((source) => source.kind === 'retained-file');
      expect(retained.length).toBeGreaterThan(0);
      for (const source of retained) {
        expect(existsSync(new URL(source.path, REPO)), source.path).toBe(true);
        expect(source.sha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(source.bytes).toBeGreaterThan(0);
      }
      // the data a file is made from lives in its own pool; the generator is code, not data
      for (const source of retained.filter((s) => s.path.includes('/data/')))
        expect(source.path, `${pool} file made from ${source.path}`).toContain(`/data/${pool}/`);
    }
  });

  test("each file's counts are its own", () => {
    expect(SKY.counts).toEqual({
      words: SKY.words.length,
      kanji: SKY.kanji.length,
      parts: SKY.parts.length,
      sound: SKY.sound.length,
      outside: SKY.kanji.filter((row) => row.length === 11 && row[10] === 1).length,
    });
    expect(SEM.counts).toEqual({ sem: SEM.sem.length });
    expect(SKY.words.length).toBeGreaterThan(7000);
    expect(SEM.sem.length).toBeGreaterThan(600);
  });

  test('every index resolves', () => {
    const nk = SKY.kanji.length;
    const np = SKY.parts.length;
    const within = (i, lo, hi) => Number.isInteger(i) && i >= lo && i < hi;
    for (const row of SKY.words) {
      expect(row[4].length, row[0]).toBeGreaterThan(0);
      for (const k of row[4]) expect(within(k, 0, nk), `${row[0]} kanji ${k}`).toBe(true);
    }
    for (const row of SKY.kanji) {
      for (const p of row[5]) expect(within(p, 0, np), `${row[0]} part ${p}`).toBe(true);
      expect(within(row[6], -1, np), `${row[0]} sound part`).toBe(true);
      expect(within(row[8], -1, np), `${row[0]} radical`).toBe(true);
    }
    for (const part of SKY.parts) expect(within(part[3], -1, nk), part[0]).toBe(true);
    for (const [p, , members] of SKY.sound) {
      expect(within(p, 0, np)).toBe(true);
      for (const k of members) expect(within(k, 0, nk)).toBe(true);
    }
    expect(SKY.pos.w.length).toBe(3 * SKY.words.length);
    expect(SKY.pos.k.length).toBe(3 * nk);
    const words = new Set(SKY.words.map((row) => row[0]));
    expect(words.size, 'one row per word').toBe(SKY.words.length);
    for (const [head, word] of SEM.sem) {
      expect(words.has(head), head).toBe(true);
      expect(words.has(word), word).toBe(true);
    }
  });

  test('every word row agrees with words.json', () => {
    const outside = new Set(SKY.kanji.filter((row) => row.length === 11).map((row) => row[0]));
    const extra = new Map();
    for (const [w, r, m] of EXTRA.extraWords)
      if (m) extra.set(`${w}\t${r}`, [...(extra.get(`${w}\t${r}`) || []), m.join('; ')]);
    for (const [word, reading, gloss, level, kanji] of SKY.words) {
      const stored = WORDS[word];
      expect(stored, word).toBeTruthy();
      expect(reading, word).toBe(stored.r);
      expect(level, word).toBe(stored.jlpt || 0);
      // its characters in written order: every character of the table, and the outside ones the sky carries
      const chars = kanji.map((k) => SKY.kanji[k][0]);
      const written = [...new Set(word)].filter((ch) => KANJI[ch] || outside.has(ch));
      expect(chars, word).toEqual(written);
      for (const ch of stored.k || []) expect(chars, `${word} carries ${ch}`).toContain(ch);
      const reviewed = REVIEWED_GLOSSES.get(`${word}\t${reading}`);
      if (reviewed !== undefined) {
        expect(gloss, `${word}: reviewed gloss`).toBe(reviewed);
        continue;
      }
      if (!gloss) continue;
      const sources = [
        stored.g,
        DICT[word]?.m?.join('; '),
        ...(extra.get(`${word}\t${reading}`) || []),
      ]
        .filter(Boolean)
        .map(unbracketed);
      const lead = gloss.split(', ')[0];
      expect(
        sources.some((text) => text.includes(lead)),
        `${word}: "${gloss}" is stored for it`,
      ).toBe(true);
    }
  });

  test('every kanji row of the table agrees with kanji.json', () => {
    for (const row of SKY.kanji) {
      if (row.length === 11) continue;
      const stored = KANJI[row[0]];
      expect(stored, row[0]).toBeTruthy();
      expect(row[2], row[0]).toEqual(stored.on || []);
      expect(row[3], row[0]).toEqual(stored.kun || []);
      expect(row[4], row[0]).toBe(stored.st || 0);
    }
  });

  test('every member of every sound family carries its exact on-reading', () => {
    let members = 0;
    for (const [p, on, family] of SKY.sound) {
      expect(family.length).toBeGreaterThanOrEqual(2);
      for (const k of family) {
        const ch = SKY.kanji[k][0];
        expect(KANJI[ch]?.on || [], `${ch} in the ${SKY.parts[p][0]} ${on} family`).toContain(on);
        members += 1;
      }
    }
    expect(members).toBeGreaterThan(300);
    // 寺 holds 時 持 侍 and not 待 詩 特, whose on-readings are not ジ
    const tera = SKY.sound.find(([p]) => SKY.parts[p][0] === '寺');
    const chars = tera[2].map((k) => SKY.kanji[k][0]);
    expect(chars).toEqual(expect.arrayContaining(['時', '持', '侍']));
    for (const ch of ['待', '詩', '特']) expect(chars).not.toContain(ch);
  });

  test('every meaning link is a link stored in sem.json, with its relation and its note', () => {
    for (const [head, word, rel, note] of SEM.sem) {
      expect(RELATIONS.has(rel), rel).toBe(true);
      expect(
        (STORED[head] || []).some((e) => e.w === word && e.rel === rel && (e.note || '') === note),
        `${head} -${rel}- ${word}`,
      ).toBe(true);
    }
    const school = SEM.sem.filter(([a, b]) => a === '学校' || b === '学校');
    expect(school).toHaveLength(10);
  });

  test("the mount's join gives the engine word indices, and fails closed on a word it cannot find", () => {
    const context = {};
    vm.runInNewContext(
      `${corridorDeclarations('sky/mount.mjs', ['joinSkyData'])}\nthis.joinSkyData = joinSkyData;`,
      context,
    );
    const joined = context.joinSkyData(SKY, SEM);
    expect(joined.counts).toEqual({ ...SKY.counts, sem: SEM.sem.length });
    expect(joined.words).toBe(SKY.words);
    expect(joined.sem).toHaveLength(SEM.sem.length);
    joined.sem.forEach(([a, b, rel, note], i) => {
      expect([SKY.words[a][0], SKY.words[b][0], rel, note]).toEqual(SEM.sem[i]);
    });
    for (const key of ['world', 'notes', 'kanji', 'parts', 'sound', 'pos'])
      expect(joined[key]).toBe(SKY[key]);
    const broken = { ...SEM, sem: [...SEM.sem, ['存在しない語', '学校', 'syn', '']] };
    expect(() => context.joinSkyData(SKY, broken)).toThrow(/存在しない語/u);
  });
});

/** The sky's context (version 3, 2026-11-11): sentences from the app's own reading (its articles and the examples
 * store), the articles themselves, and grammar. Built by prototypes/corridor/tools/build_sky_context.py as one file per
 * licence pool (data/<pool>/sky-context.json), joined in memory by the mount (joinSkyContext). A row whose licence is
 * not recorded is left out: the 289 grammar rows of data/shared-study/grammar.json, which records a content label and a
 * distribution status but no licence. Where SKY_LIVE_DIR names the lead's design folder (PROGRAM/design/sky), the join
 * is also compared with the live files there. */
describe("the sky's context, one file per licence pool", () => {
  const POOLS = ['share_alike', 'proprietary_safe', 'original'];
  const FILES = {};
  let joinSkyContext;
  let joined;
  beforeAll(() => {
    for (const pool of POOLS) FILES[pool] = json(`data/${pool}/sky-context.json`);
    const context = {};
    vm.runInNewContext(
      `${corridorDeclarations('sky/mount.mjs', ['joinSkyContext'])}\nthis.joinSkyContext = joinSkyContext;`,
      context,
    );
    joinSkyContext = context.joinSkyContext;
    joined = JSON.parse(
      JSON.stringify(
        joinSkyContext(
          SKY,
          POOLS.map((pool) => FILES[pool]),
        ),
      ),
    );
  });
  const article = (path) => JSON.parse(readFileSync(new URL(path, REPO), 'utf8'));

  test('each file names its pool, and every row comes from a source of that pool', () => {
    for (const pool of POOLS) {
      const file = FILES[pool];
      expect(file.pool).toBe(pool);
      for (const source of file.sources) {
        expect(existsSync(new URL(source.path, REPO)), source.path).toBe(true);
        expect(source.sha256).toMatch(/^[a-f0-9]{64}$/u);
        if (
          /\/data\/articles\/[^/]+\.json$/u.test(source.path) &&
          !source.path.endsWith('index.json')
        )
          expect(article(source.path).pool, source.path).toBe(pool);
        if (source.path.includes('/data/proprietary_safe/examples/'))
          expect(pool).toBe('proprietary_safe');
      }
      // every article of the file is one whose own record names this pool, with a licence and an attribution
      const files = new Map(
        file.sources
          .filter((s) => s.id.startsWith('article '))
          .map((s) => [s.id.slice('article '.length), s.path]),
      );
      for (const row of file.articles) {
        const record = article(files.get(row[1]));
        expect([record.pool, !!record.licence, !!record.attribution], row[1]).toEqual([
          pool,
          true,
          true,
        ]);
      }
      // the examples store's sentences (negative source) are proprietary_safe; grammar is Bunki's own
      if (pool !== 'proprietary_safe') expect(file.sentences.every((s) => s[1] >= 0)).toBe(true);
      if (pool !== 'original') expect(file.grammar).toEqual([]);
    }
    // the sentences of an article stand in the file that holds the article
    for (const pool of POOLS) {
      const own = new Set(FILES[pool].articles.map((a) => a[0]));
      for (const [, code] of FILES[pool].sentences) if (code >= 0) expect(own.has(code)).toBe(true);
    }
  });

  test("each file's counts are its own, and the pools add up to the joined counts", () => {
    for (const pool of POOLS) {
      const file = FILES[pool];
      expect(file.counts).toEqual({
        articles: file.articles.length,
        sentences: file.sentences.length,
        links: file.links.length,
        articleWordLinks: file.articles.reduce((n, a) => n + a[6].length, 0),
        grammar: file.grammar.length,
      });
    }
    const sum = (key) => POOLS.reduce((n, pool) => n + FILES[pool].counts[key], 0);
    expect(joined.counts).toMatchObject({
      articles: sum('articles'),
      sentences: sum('sentences'),
      wordSentenceLinks: sum('links'),
      articleWordLinks: sum('articleWordLinks'),
      grammar: sum('grammar'),
    });
    expect(joined.counts).toEqual({
      articles: 156,
      sentences: 12713,
      wordsWithSentence: 5809,
      sentencesFromArticles: 2255,
      sentencesFromExamples: 10458,
      sentencesWithEnglish: 9526,
      wordSentenceLinks: 16079,
      articleWordLinks: 8172,
      grammar: 244,
    });
  });

  test('every wordSent index is a sentence, and every wordSentAt mark stands inside its sentence on the word', () => {
    const kanaTail = (w) => w.length - w.replace(/[ぁ-ゖ]+$/u, '').length;
    let marks = 0;
    for (const [key, sids] of Object.entries(joined.wordSent)) {
      const word = SKY.words[Number(key)][0];
      const at = joined.wordSentAt[key];
      expect(sids.length).toBeGreaterThanOrEqual(1);
      expect(sids.length).toBeLessThanOrEqual(3);
      expect(at).toHaveLength(sids.length);
      sids.forEach((sid, i) => {
        expect(
          Number.isInteger(sid) && sid >= 0 && sid < joined.sentences.length,
          `${word} ${sid}`,
        ).toBe(true);
        const text = joined.sentences[sid][1];
        const [start, length] = at[i];
        expect(
          start >= 0 && length > 0 && start + length <= text.length,
          `${word} in ${text}`,
        ).toBe(true);
        const piece = text.slice(start, start + length);
        const tail = kanaTail(word);
        // as written, or (a word that ends in kana, bent) the same up to its last kanji: 持っ for 持つ
        expect(
          piece === word || (tail > 0 && piece.startsWith(word.slice(0, -tail))),
          `${word}: ${piece}`,
        ).toBe(true);
        marks += 1;
      });
    }
    expect(marks).toBe(16079);
    for (const words of joined.articleWords)
      for (const wi of words) expect(wi >= 0 && wi < SKY.words.length).toBe(true);
  });

  test('grammar: a pattern stored twice is marked as a twin of the earlier row, and shown once', () => {
    const { grammar, grammarTwin, grammarSource } = joined;
    expect(grammar).toHaveLength(244);
    expect(new Set(grammarSource)).toEqual(new Set(['corridor.js', 'grammar-v11']));
    grammarTwin.forEach((twin, i) => {
      if (twin < 0) return;
      expect(twin).toBeLessThan(i);
      expect(grammarTwin[twin], 'a twin points at the first row of its pattern').toBe(-1);
      expect(grammar[twin][1]).toBe(grammar[i][1]);
    });
    // what the engine shows (sky-world.js setContext keeps the rows whose twin is -1): every pattern once
    const shown = grammar.filter((_, i) => !(grammarTwin[i] >= 0)).map((row) => row[1]);
    expect(new Set(shown).size).toBe(shown.length);
    for (const row of grammar)
      for (const wi of row[7])
        expect(
          row[6].some(([ja]) => ja.includes(SKY.words[wi][0])),
          `${row[0]} ${SKY.words[wi][0]}`,
        ).toBe(true);
  });

  test('rows with no recorded licence are left out: no grammar of data/shared-study', () => {
    const shared = json('data/shared-study/grammar.json');
    expect(shared.licence ?? shared.license ?? null).toBe(null);
    const ids = new Set(shared.records.map((r) => r.guid));
    expect(ids.size).toBe(289);
    for (const pool of POOLS)
      for (const row of FILES[pool].grammar) expect(ids.has(row[1])).toBe(false);
    expect(FILES.original.notes.join(' ')).toContain('289 grammar rows');
  });

  test('the join fails closed: a word that is not in the sky, a row placed twice, a missing row', () => {
    const files = POOLS.map((pool) => FILES[pool]);
    const original = FILES.original;
    const withLink = { ...original, links: [...original.links, ['存在しない語', 0, 0, 1, 9]] };
    expect(() => joinSkyContext(SKY, [files[0], files[1], withLink])).toThrow(/存在しない語/u);
    const twice = { ...original, sentences: [...original.sentences, original.sentences[0]] };
    expect(() => joinSkyContext(SKY, [files[0], files[1], twice])).toThrow(/placed twice/u);
    expect(() => joinSkyContext(SKY, [files[0], files[2]])).toThrow(/missing/u);
  });

  test('the pools add up to the live design files (SKY_LIVE_DIR), the 289 rows left out aside', () => {
    const live = (name) => JSON.parse(originalSkyBytes(name));
    const data = adaptSkyReference({
      dataBytes: originalSkyBytes('sky-data.json'),
      contextBytes: originalSkyBytes('sky-context.json'),
      sidecarBytes: readFileSync(new URL('./fixtures/sky-reference-19.json', import.meta.url)),
    });
    const context = vm.runInNewContext(
      `${corridorDeclarations('sky/mount.mjs', ['joinSkyData'])}\njoinSkyData(sky, sem)`,
      { sky: SKY, sem: SEM },
    );
    const mine = JSON.parse(JSON.stringify(context));
    for (const key of Object.keys(data))
      if (key !== 'built')
        expect(isDeepStrictEqual(mine[key], data[key]), `sky data ${key}`).toBe(true);
    const ctx = live('sky-context.json');
    const keep = ctx.grammarSource
      .map((s, i) => (s === 'shared-study' ? -1 : i))
      .filter((i) => i >= 0);
    expect(keep.every((g, i) => g === i)).toBe(true);
    const expected = {
      ...ctx,
      counts: { ...ctx.counts, grammar: keep.length },
      grammar: keep.map((i) => ctx.grammar[i]),
      grammarSource: keep.map((i) => ctx.grammarSource[i]),
      grammarTwin: keep.map((i) => ctx.grammarTwin[i]),
    };
    expect(ctx.grammarSource.length - keep.length).toBe(289);
    for (const key of Object.keys(ctx))
      if (key !== 'built' && key !== 'notes')
        expect(isDeepStrictEqual(joined[key], expected[key]), `context ${key}`).toBe(true);
  });
});

// Frozen independent literal-reference controls; original whole sky/context tests above retained.
const MIGRATION_CELLS = [
  {
    skyRowIndexZeroBased: 178,
    pointer: '/words/178/2',
    word: '下さい',
    reading: 'ください',
    old: 'please, please',
    new: 'please',
  },
  {
    skyRowIndexZeroBased: 360,
    pointer: '/words/360/2',
    word: '撮る',
    reading: 'とる',
    old: 'to take, to record',
    new: 'to take (a photograph)',
  },
  {
    skyRowIndexZeroBased: 869,
    pointer: '/words/869/2',
    word: '空く',
    reading: 'あく',
    old: 'to open, to open',
    new: 'to open, to become empty',
  },
  {
    skyRowIndexZeroBased: 1320,
    pointer: '/words/1320/2',
    word: '正確',
    reading: 'せいかく',
    old: 'accurate, punctuality',
    new: 'accurate, correct, precise',
  },
  {
    skyRowIndexZeroBased: 1529,
    pointer: '/words/1529/2',
    word: '納める',
    reading: 'おさめる',
    old: 'to store to pay, to supply',
    new: 'to pay (fees, taxes), to supply',
  },
  {
    skyRowIndexZeroBased: 1850,
    pointer: '/words/1850/2',
    word: '現在',
    reading: 'げんざい',
    old: 'now), present',
    new: 'the present, now',
  },
  {
    skyRowIndexZeroBased: 2041,
    pointer: '/words/2041/2',
    word: '者',
    reading: 'もの',
    old: 'person)',
    new: 'person',
  },
  {
    skyRowIndexZeroBased: 2314,
    pointer: '/words/2314/2',
    word: '多少',
    reading: 'たしょう',
    old: 'a little)',
    new: 'a little, some',
  },
  {
    skyRowIndexZeroBased: 2382,
    pointer: '/words/2382/2',
    word: '昼食',
    reading: 'ちゅうしょく',
    old: 'lunch)',
    new: 'lunch',
  },
  {
    skyRowIndexZeroBased: 3000,
    pointer: '/words/3000/2',
    word: '～等',
    reading: '～とう',
    old: 'level, place',
    new: 'class, rank',
  },
  {
    skyRowIndexZeroBased: 3152,
    pointer: '/words/3152/2',
    word: '伯父さん',
    reading: 'おじさん',
    old: 'middle-aged gentleman',
    new: 'uncle',
  },
  {
    skyRowIndexZeroBased: 3272,
    pointer: '/words/3272/2',
    word: '関西',
    reading: 'かんさい',
    old: 'Kansai, Kansai',
    new: 'Kansai region',
  },
  {
    skyRowIndexZeroBased: 3283,
    pointer: '/words/3283/2',
    word: '関東',
    reading: 'かんとう',
    old: 'Kantō, Kantō',
    new: 'Kantō region',
  },
  {
    skyRowIndexZeroBased: 3666,
    pointer: '/words/3666/2',
    word: '親類',
    reading: 'しんるい',
    old: 'relative)',
    new: 'relative, relation',
  },
  {
    skyRowIndexZeroBased: 5694,
    pointer: '/words/5694/2',
    word: '繊維',
    reading: 'せんい',
    old: 'fiber, fiber',
    new: 'fiber',
  },
  {
    skyRowIndexZeroBased: 5867,
    pointer: '/words/5867/2',
    word: '着色',
    reading: 'ちゃくしょく',
    old: 'coloring, coloring',
    new: 'coloring',
  },
  {
    skyRowIndexZeroBased: 6671,
    pointer: '/words/6671/2',
    word: '人目',
    reading: 'ひとめ',
    old: 'glimpse, public gaze',
    new: 'public gaze, notice',
  },
  {
    skyRowIndexZeroBased: 6707,
    pointer: '/words/6707/2',
    word: '凍結',
    reading: 'とうけつ',
    old: 'freezing, freezing',
    new: 'freezing',
  },
  {
    skyRowIndexZeroBased: 7552,
    pointer: '/words/7552/2',
    word: '重み',
    reading: 'おもみ',
    old: 'weight, weight',
    new: 'weight',
  },
];
function migrationInputs() {
  return {
    dataBytes: originalSkyBytes('sky-data.json'),
    contextBytes: originalSkyBytes('sky-context.json'),
    sidecarBytes: readFileSync(new URL('./fixtures/sky-reference-19.json', import.meta.url)),
  };
}
function migrationExpected() {
  const expected = JSON.parse(migrationInputs().dataBytes);
  for (const c of MIGRATION_CELLS) {
    expect(expected.words[c.skyRowIndexZeroBased].slice(0, 3)).toEqual([c.word, c.reading, c.old]);
    expected.words[c.skyRowIndexZeroBased][2] = c.new;
  }
  return expected;
}
function originalWholeComparison(expected) {
  const actual = JSON.parse(
    JSON.stringify(
      vm.runInNewContext(
        `${corridorDeclarations('sky/mount.mjs', ['joinSkyData'])}\njoinSkyData(sky,sem)`,
        { sky: SKY, sem: SEM },
      ),
    ),
  );
  for (const key of Object.keys(expected))
    if (key !== 'built')
      expect(isDeepStrictEqual(actual[key], expected[key]), `sky data ${key}`).toBe(true);
}
const malformedInputs = [
  [
    'raw-data-whitespace',
    (a) => {
      a.dataBytes = Buffer.concat([a.dataBytes, Buffer.from(' ')]);
    },
  ],
  [
    'raw-context-whitespace',
    (a) => {
      a.contextBytes = Buffer.concat([a.contextBytes, Buffer.from(' ')]);
    },
  ],
  [
    'sidecar-whitespace',
    (a) => {
      a.sidecarBytes = Buffer.concat([a.sidecarBytes, Buffer.from(' ')]);
    },
  ],
  ...[
    'word',
    'reading',
    'old-gloss',
    'reorder',
    'truncated-row',
    'unlisted-cell',
    'nonword-field',
  ].map((kind) => [
    kind,
    (a) => {
      const d = JSON.parse(a.dataBytes);
      const c = MIGRATION_CELLS[0],
        row = d.words[c.skyRowIndexZeroBased];
      if (kind === 'word') row[0] += 'wrong';
      if (kind === 'reading') row[1] += 'wrong';
      if (kind === 'old-gloss') row[2] += 'wrong';
      if (kind === 'reorder') [d.words[0], d.words[1]] = [d.words[1], d.words[0]];
      if (kind === 'truncated-row') d.words[c.skyRowIndexZeroBased] = row.slice(0, 2);
      if (kind === 'unlisted-cell') d.words[0][2] += 'wrong';
      if (kind === 'nonword-field') d.__unexpected = true;
      a.dataBytes = Buffer.from(JSON.stringify(d));
    },
  ]),
  [
    'context-field',
    (a) => {
      const d = JSON.parse(a.contextBytes);
      d.__unexpected = true;
      a.contextBytes = Buffer.from(JSON.stringify(d));
    },
  ],
  ...[
    'missing',
    'extra',
    'duplicate-replaces-missing',
    'wrong-index',
    'wrong-word',
    'wrong-reading',
    'wrong-old',
    'wrong-new',
  ].map((kind) => [
    kind,
    (a) => {
      const d = JSON.parse(a.sidecarBytes);
      if (kind === 'missing') d.cells.pop();
      if (kind === 'extra') d.cells.push({ ...d.cells[0] });
      if (kind === 'duplicate-replaces-missing') d.cells[d.cells.length - 1] = { ...d.cells[0] };
      if (kind === 'wrong-index') d.cells[0].skyRowIndexZeroBased++;
      if (kind === 'wrong-word') d.cells[0].word += 'wrong';
      if (kind === 'wrong-reading') d.cells[0].reading += 'wrong';
      if (kind === 'wrong-old') d.cells[0].old += 'wrong';
      if (kind === 'wrong-new') d.cells[0].new += 'wrong';
      a.sidecarBytes = Buffer.from(JSON.stringify(d));
    },
  ]),
];
describe('strict reviewed sky reference migration', () => {
  test('exact independent19 cells only; input buffers unchanged and original object detached', () => {
    const a = migrationInputs(),
      before = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, Buffer.from(v)]));
    const result = adaptSkyReference(a);
    expect(result).toEqual(migrationExpected());
    for (const [k, v] of Object.entries(a)) expect(v.equals(before[k])).toBe(true);
    const raw = JSON.parse(a.dataBytes);
    result.words[0][2] = 'mutated output';
    expect(JSON.parse(a.dataBytes)).toEqual(raw);
    // Explicit empty/bad overrides must never silently use the portable fallback.
    const hadOverride = Object.hasOwn(process.env, 'SKY_LIVE_DIR');
    const savedOverride = process.env.SKY_LIVE_DIR;
    try {
      process.env.SKY_LIVE_DIR = '';
      expect(() => originalSkyBytes('sky-data.json')).toThrow(
        /Explicit SKY_LIVE_DIR must be nonempty/,
      );
      process.env.SKY_LIVE_DIR = new URL(
        './fixtures/sky-reference-original/missing-directory',
        import.meta.url,
      ).pathname;
      expect(() => originalSkyBytes('sky-data.json')).toThrow(/ENOENT/);
    } finally {
      if (hadOverride) process.env.SKY_LIVE_DIR = savedOverride;
      else delete process.env.SKY_LIVE_DIR;
    }
  });
  for (const [name, fault] of malformedInputs)
    test('rejects malformed ' + name, () => {
      const valid = migrationInputs();
      expect(adaptSkyReference(valid)).toEqual(migrationExpected());
      const a = Object.fromEntries(Object.entries(valid).map(([k, v]) => [k, Buffer.from(v)]));
      fault(a);
      const before = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, Buffer.from(v)]));
      expect(() => adaptSkyReference(a)).toThrow();
      for (const [k, v] of Object.entries(a)) expect(v.equals(before[k])).toBe(true);
    });
  test('valid adapted reference passes retained whole-join predicate', () =>
    originalWholeComparison(adaptSkyReference(migrationInputs())));
  for (const dimension of [
    'approved-gloss',
    'unrelated-word',
    'nonword-top-level',
    'one-replacement-disabled',
  ])
    test('retained whole-join rejects mutated output ' + dimension, () => {
      const d = adaptSkyReference(migrationInputs());
      if (dimension === 'approved-gloss')
        d.words[MIGRATION_CELLS[0].skyRowIndexZeroBased][2] += 'wrong';
      if (dimension === 'unrelated-word') d.words[0][2] += 'wrong';
      if (dimension === 'nonword-top-level') d.kanji = [];
      if (dimension === 'one-replacement-disabled')
        d.words[MIGRATION_CELLS[0].skyRowIndexZeroBased][2] = MIGRATION_CELLS[0].old;
      expect(() => originalWholeComparison(d)).toThrow();
    });
  test('old corrected product literal still fails retained reviewed-gloss predicate', () => {
    const c = MIGRATION_CELLS.find((c) => c.word === '撮る');
    const actual = SKY.words.find((row) => row[0] === c.word && row[1] === c.reading);
    expect(actual).toBeDefined();
    expect(actual[2]).toBe(c.new);
    const unchanged = JSON.parse(JSON.stringify(actual));
    const originalReviewedGlossPredicate = ([word, reading, gloss]) => {
      const reviewed = REVIEWED_GLOSSES.get(`${word}\t${reading}`);
      if (reviewed !== undefined) {
        expect(gloss, `${word}: reviewed gloss`).toBe(reviewed);
      }
    };
    originalReviewedGlossPredicate(actual);
    const corrupted = JSON.parse(JSON.stringify(actual));
    corrupted[2] = c.old;
    let caught;
    try {
      originalReviewedGlossPredicate(corrupted);
    } catch (error) {
      caught = error;
    }
    expect(caught?.name).toBe('AssertionError');
    expect(caught?.message).toContain(`${c.word}: reviewed gloss`);
    expect(actual).toEqual(unchanged);
  });
});
