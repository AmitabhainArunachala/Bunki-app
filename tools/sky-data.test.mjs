/* global URL */
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
import vm from 'node:vm';
import { describe, expect, test } from 'vitest';
import { CORRIDOR, corridorDeclarations } from './corridor-declarations.mjs';

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

describe('the sky data, one file per licence pool', () => {
  test('each file names its pool, and every retained source it names exists in that record', () => {
    expect(SKY.pool).toBe('share_alike');
    expect(SEM.pool).toBe('proprietary_safe');
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
