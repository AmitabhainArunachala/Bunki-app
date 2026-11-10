/* global URL */
/** The reader cut 自動車 into 自動|車 and 半導体 into 半|導体 (owed repair 2, 2026-11-10). The cuts come from the
 * article data, tokenized ahead of time into short units; the reader now joins a run of kanji pieces into the one
 * core-dictionary word they spell, read as they read (readerCompoundEnd). The actual reader functions are lifted from
 * the corridor source and run over the real articles and the real core dictionary. */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const CORRIDOR = new URL('../prototypes/corridor/', import.meta.url);
const read = (path) => readFileSync(new URL(path, CORRIDOR), 'utf8');
const json = (path) => JSON.parse(read(path));

// `optional` names the helpers a reader may or may not have (the base had none of them): the test then fails on what
// the reader draws, not on a missing name
function declarations(file, names, optional = []) {
  const source = read(file);
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return names
    .map((name) => {
      const statement = ast.statements.find(
        (node) =>
          (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
          (ts.isVariableStatement(node) &&
            node.declarationList.declarations.some((row) => row.name.getText(ast) === name)),
      );
      if (!statement && optional.includes(name)) return '';
      if (!statement) throw new Error(`the corridor declares no ${name} in ${file}`);
      return statement.getText(ast);
    })
    .join('\n');
}

const dict = json('data/share_alike/dict.json').words;
const reader = vm.createContext({ D: { dict } });
vm.runInContext(
  [
    declarations('corridor.js', ['KATA_TO_HIRA_OFFSET', 'kataToHira']),
    declarations(
      'modules/dictionary.mjs',
      ['READER_COMPOUND_POS', 'readerCompoundEnd', 'readerJoinedToken', 'readerRenderedTokens'],
      ['READER_COMPOUND_POS', 'readerCompoundEnd', 'readerJoinedToken'],
    ),
  ].join('\n'),
  reader,
);
const rendered = (p) => vm.runInContext('readerRenderedTokens', reader)(p, null);
const article = (file) => json(`data/articles/${file}`);
const shelf = () => {
  const index = json('data/articles/index.json').articles;
  const known = new Set(index.map((row) => row.id));
  const candidates = json('data/articles/library-candidates/index.json')
    .candidateRows.filter(
      (row) => row.libraryCandidate?.installable === false && !known.has(row.id),
    )
    .map((row) => ({ ...row, file: `library-candidates/${row.file}` }));
  return [...index, ...candidates].filter((row) =>
    existsSync(new URL(`data/articles/${row.file}`, CORRIDOR)),
  );
};
const surfaces = (p) => rendered(p).map(({ token }) => token.s);
const piece = (s, p, r) => ({ s, b: s, p, r, f: [{ t: s, r }], c: p === '名詞' });

describe('the reader joins a word the tokenizer cut', () => {
  const chip = article('bunki-read-n2-japan-us-chip-fab.json');

  test('自動車 and 半導体 are one door each, read and glossed as the word', () => {
    const rows = rendered(chip);
    expect(rows[0].index).toBe(0);
    expect(rows[0].token).toMatchObject({
      s: '自動車',
      b: '自動車',
      c: true,
      r: 'じどうしゃ',
      readerSourceEnd: 1,
    });
    expect(rows[0].token.f).toEqual([
      { t: '自動', r: 'じどう' },
      { t: '車', r: 'しゃ' },
    ]);
    expect(rows[1].token.s).toBe('、');
    const words = surfaces(chip);
    expect(words).toContain('半導体');
    expect(words).not.toContain('自動');
    expect(words).not.toContain('導体');
  });

  test('a particle never joins: 今日 + は stays two, in a made-up line and in every article', () => {
    expect(
      surfaces({ tokens: [piece('今日', '名詞', 'きょう'), piece('は', '助詞', 'は')] }),
    ).toEqual(['今日', 'は']);
    for (const row of shelf()) {
      const p = article(row.file);
      for (const { token } of rendered(p)) expect(token.s).not.toBe('今日は');
    }
  });

  test('a counter after a number and the run after an unjoined prefix stay as cut', () => {
    // 七年|後: 年 is the number's counter (年後 is a word, but not here)
    expect(
      surfaces({
        tokens: [
          piece('七', '名詞', 'なな'),
          piece('年', '接尾辞', 'ねん'),
          piece('後', '接尾辞', 'ご'),
        ],
      }),
    ).toEqual(['七', '年', '後']);
    // 駄菓子|屋: 駄 belongs to 駄菓子, which the core lacks, so 菓子屋 is not read out of it
    expect(
      surfaces({
        tokens: [
          piece('駄', '接頭辞', 'だ'),
          piece('菓子', '名詞', 'かし'),
          piece('屋', '接尾辞', 'や'),
        ],
      }),
    ).toEqual(['駄', '菓子', '屋']);
    // and a paragraph start is a wall
    expect(
      surfaces({
        tokens: [piece('自動', '名詞', 'じどう'), piece('車', '接尾辞', 'しゃ')],
        paras: [1],
      }),
    ).toEqual(['自動', '車']);
  });

  test('every join over the shelf is a core word, read as its pieces read, inside one paragraph', () => {
    let joins = 0;
    const articles = shelf();
    for (const row of articles) {
      const p = article(row.file);
      const breaks = new Set(p.paras || []);
      for (const { index, token } of rendered(p)) {
        if (token.readerSourceEnd === undefined || !token.c) continue;
        joins += 1;
        const pieces = p.tokens.slice(index, token.readerSourceEnd + 1);
        for (let k = index + 1; k <= token.readerSourceEnd; k += 1)
          expect(breaks.has(k)).toBe(false);
        for (const part of pieces) {
          expect(['名詞', '接頭辞', '接尾辞', '形状詞']).toContain(part.p);
          expect(part.s).toMatch(/^[\p{Script=Han}々〆ヶ]+$/u);
        }
        expect(dict[token.s], token.s).toBeTruthy();
        expect(vm.runInContext('kataToHira', reader)(dict[token.s].r)).toBe(token.r);
      }
    }
    expect(articles.length).toBeGreaterThan(250);
    expect(joins).toBeGreaterThan(1000);
  }, 120000);
});
