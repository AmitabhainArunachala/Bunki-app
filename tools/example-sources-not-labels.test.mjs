/* global URL */
/** "examples corpus" stood under every example sentence on a word page, and under the sentence on its own page: a
 * dataset's name on the learner's page (owed-2 repair 2, 2026-11-10). The origin of an example now stands once in the
 * page's one Sources disclosure, its attribution complete (exampleCredits, creditSources). The sentence page is run
 * from its actual code in a silent page; the word page's example line is read from its declaration. */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { CORRIDOR, corridorDeclarations } from './corridor-declarations.mjs';
import { openCorridorSourcePage } from './corridor-source-page.mjs';

const manifest = JSON.parse(
  readFileSync(new URL('data/proprietary_safe/examples/manifest.json', CORRIDOR), 'utf8'),
);
const tanaka = manifest.sources.find((src) => src.name === 'tanaka-corpus');
const code = [
  corridorDeclarations(
    'corridor.js',
    ['toSources', 'exampleCredits', 'creditSources'],
    ['exampleCredits', 'creditSources'],
  ),
  corridorDeclarations('modules/worlds.mjs', ['renderSentenceNode']),
].join('\n');

const sentencePage = (node) => `(() => {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const tx = (ja, en) => en, withEn = (node) => node, biLabel = (tag, cls, ja, en) => el(tag, cls, en);
  const learnerSourceLabel = (p) => p.sourceLabel || '';
  const renderSentenceTokens = (line, tokens) => line.append(tokens.map((t) => t.s).join(''));
  const D = { passages: [], exampleManifest: ${JSON.stringify(manifest)} };
  ${code}
  const sheet = el('div', 'sheet');
  sheet.id = 'sheet';
  document.body.replaceChildren(sheet);
  renderSentenceNode(sheet, ${JSON.stringify(node)});
  const sources = sheet.querySelector(':scope > .entry-sources');
  const body = [...sheet.children].filter((n) => n !== sources).map((n) => n.textContent).join(' ');
  return { body, sources: sources ? [...sources.children].slice(1).map((n) => n.textContent) : [] };
})()`;

let host;
beforeAll(async () => {
  host = await openCorridorSourcePage();
}, 60000);
afterAll(async () => {
  await host?.close();
});

const tokens = [{ s: '分野' }, { s: 'が' }, { s: '違う' }, { s: '。' }];

test('a bank sentence on its own page names no dataset in its body; Sources carries its corpus in full', async () => {
  const seen = await host.page.evaluate(
    sentencePage({
      t: 'sent',
      tokens,
      en: 'The field differs.',
      source: 'examples corpus',
      target: '分野',
      credit: { attribution: tanaka.attribution, licence: tanaka.licence, url: tanaka.url },
    }),
  );
  expect(seen.body).not.toMatch(/examples corpus|corpus/u);
  expect(seen.sources).toEqual([`Examples: ${tanaka.attribution} · ${tanaka.licence}`]);
});

test('a sentence kept before its record named the corpus lists every corpus its label names, complete', async () => {
  const seen = await host.page.evaluate(
    sentencePage({ t: 'sent', tokens, en: '', source: 'examples corpus', target: '分野' }),
  );
  expect(seen.body).not.toMatch(/examples corpus/u);
  const named = manifest.sources.filter((src) => src.labelEn === 'examples corpus');
  expect(named.length).toBe(2);
  expect(seen.sources).toEqual(named.map((src) => `Examples: ${src.attribution} · ${src.licence}`));
});

test('the word page puts no source label under its example sentences, and sends their credits to Sources', () => {
  const word = corridorDeclarations('corridor.js', ['renderWordNode']);
  const line = word.slice(
    word.indexOf('const exampleLine'),
    word.indexOf('return line;', word.indexOf('const exampleLine')),
  );
  expect(line).not.toMatch(/example-src/u);
  expect(word).toMatch(
    /creditSources\(sheet, \[\.\.\.leadExamples, \.\.\.moreExamples\]\.flatMap\(exampleCredits\)\)/u,
  );
});
