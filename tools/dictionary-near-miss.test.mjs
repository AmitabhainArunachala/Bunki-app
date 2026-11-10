/**
 * "Did you mean" for a search that found nothing (port of origin/agent/bunki-pillars-dict-srs, 82d04591d, near-miss.ts
 * and romaji.ts, rebuilt for today's search). The served app keeps the 70,181-entry index inside dictionary-worker.js,
 * so the near misses are found there: bounded Damerau–Levenshtein, a romaji query against romanised readings, a kana
 * query against readings, a kanji query against spellings; at most five; none for a query of one or two characters,
 * none when no word is close, none when the search found anything. The shipped worker runs here on the real index.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { beforeAll, describe, expect, it } from 'vitest';

const corridor = new URL('../prototypes/corridor/', import.meta.url);
const read = (path) => readFileSync(new URL(path, corridor), 'utf8');

let worker;
let romaji;
beforeAll(async () => {
  let handler = null;
  const replies = [];
  worker = {
    replies,
    self: {
      addEventListener: (_type, fn) => { handler = fn; },
      postMessage: (message) => replies.push(message),
    },
    fetch: async (url) => {
      const text = readFileSync(fileURLToPath(url), 'utf8');
      return { ok: true, status: 200, text: async () => text };
    },
    performance,
    TextEncoder,
  };
  runInNewContext(read('dictionary-worker.js'), worker);
  worker.ask = async (type, payload) => {
    const id = replies.length + 1;
    await handler({ data: { id, generation: 1, type, ...payload } });
    const reply = replies.find((message) => message.id === id);
    if (!reply?.ok) throw new Error(reply?.error || 'no reply');
    return reply.result;
  };
  await worker.ask('init', {
    indexUrl: new URL('data/share_alike/dict-v2/index.json', corridor).href,
    coreUrl: new URL('data/share_alike/dict.json', corridor).href,
  });
  const source = read('corridor.js');
  const start = source.indexOf('const ROMAJI = (() => {');
  const end = source.indexOf('\n})();\n', start);
  const box = {};
  runInNewContext(`${source.slice(start, end)}\n})();\nout = ROMAJI;`, box);
  romaji = box.out;
}, 60000);

/** The search context dictionarySearchContext builds (modules/dictionary.mjs), for the query kinds used here. */
function context(query) {
  const q = query.trim();
  const hasKanji = /[一-鿌]/u.test(q);
  const hasKana = /[぀-ゖァ-ヺ]/u.test(q);
  const qh = hasKana ? q.replace(/[ァ-ヶ]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)) : romaji(q);
  return { q, hasKanji, hasKana, qh, qk: null, ql: q.toLowerCase(), qn: hasKanji || hasKana ? '' : q.toLowerCase(), inflections: [] };
}
const search = (query) => worker.ask('search', { context: context(query), matchingCoreIds: [] });

describe('near misses for a search that found nothing', () => {
  it('the index is the full one', () => {
    expect(JSON.parse(read('data/share_alike/dict-v2/index.json')).entries.length).toBe(70181);
  });

  it('jikna (jikan, two letters swapped) offers 時間 first, at most five, each a full result row', async () => {
    const result = await search('jikna');
    expect(result.results).toEqual([]);
    expect(result.nearMisses.length).toBeGreaterThan(0);
    expect(result.nearMisses.length).toBeLessThanOrEqual(5);
    expect(result.nearMisses[0].result).toMatchObject({ t: 'word', w: '時間', r: 'じかん' });
    for (const item of result.nearMisses) {
      expect(item.result).toEqual(expect.objectContaining({ t: 'word', seq: expect.any(String), w: expect.any(String), r: expect.any(String), g: expect.any(String) }));
      expect(item.distance).toBeLessThanOrEqual(1);
    }
    // the main thread opens each row by its sequence: every near row's family travels with the reply
    const families = new Map(result.formRows);
    for (const item of result.nearMisses) expect(families.get(item.result.id)?.some((row) => row[0] === item.result.seq)).toBe(true);
  });

  it('a kana typo (としよかん for としょかん) offers 図書館', async () => {
    const result = await search('としよかん');
    expect(result.results).toEqual([]);
    expect(result.nearMisses.map((item) => item.result.w)).toContain('図書館');
  });

  it('nothing for a one- or two-character query, nothing when no word is close, nothing when the search found words', async () => {
    expect(worker.nearMisses(context('x'))).toEqual([]);
    expect(worker.nearMisses(context('jk'))).toEqual([]);
    const far = await search('zqxwvzq');
    expect(far.results).toEqual([]);
    expect(far.nearMisses).toEqual([]);
    const found = await search('jikan');
    expect(found.results.length).toBeGreaterThan(0);
    expect(found.nearMisses).toEqual([]);
  });
});
