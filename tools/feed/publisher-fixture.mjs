/** Original synthetic publisher fixture for isolated browser/native journeys. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export async function preparePublisherFixture({ repo, site, output }) {
  const directory = resolve(output);
  mkdirSync(directory, { recursive: false });
  const source = resolve(repo, 'packages/feed/test/full-reader/fixtures.ts');
  const feedEntry = resolve(repo, 'packages/feed/src/index.ts');
  const moduleFile = join(directory, 'original-fixtures.mjs');
  const compiled = await build({
    absWorkingDir: repo,
    entryPoints: [source],
    outfile: moduleFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'exact-staged-feed-core',
        setup(builder) {
          builder.onResolve({ filter: /index\.ts$/ }, (args) => {
            if (resolve(args.resolveDir, args.path) === feedEntry)
              return {
                path: pathToFileURL(resolve(site, 'modules/feed-core.mjs')).href,
                external: true,
              };
            return undefined;
          });
        },
      },
    ],
  });
  assert.equal(compiled.outputFiles.length, 1);
  writeFileSync(moduleFile, compiled.outputFiles[0].contents, { flag: 'wx' });
  const fixture = await import(pathToFileURL(moduleFile).href);
  const extraCredit =
    '<div class="contributors">校正: <a href="https://jp.globalvoices.org/author/fixture-proofreader/">校正者</a></div>';
  const secondParagraph = '小さな町の歴史を、みんなでゆっくり学びます。';
  const html = fixture.html(
    `<p>${fixture.BODY}</p><h3>次の話</h3><p>${secondParagraph}</p>${extraCredit}`,
  );
  const data = {
    format: 'kairo-publisher-qa-fixture',
    v: 1,
    sourceId: 'global-voices',
    url: fixture.URL,
    title: '地域と図書館',
    html,
    expectedText: `${fixture.BODY}\n\n次の話\n\n${secondParagraph}`,
    publishedAt: '2026-08-03T02:27:56.000Z',
    updatedAt: '2026-08-04T02:27:56.000Z',
    authors: [{ name: 'Fixture Author', url: 'https://globalvoices.org/author/fixture-author/' }],
    translators: [
      { name: '翻訳者', url: 'https://jp.globalvoices.org/author/fixture-translator/' },
    ],
    otherCredits: [
      {
        role: '校正',
        name: '校正者',
        url: 'https://jp.globalvoices.org/author/fixture-proofreader/',
      },
    ],
    responseSha256: createHash('sha256').update(html).digest('hex'),
    responseBytes: Buffer.byteLength(html),
    contentSha256: createHash('sha256')
      .update(`${fixture.BODY}\n\n次の話\n\n${secondParagraph}`)
      .digest('hex'),
  };
  const file = join(directory, 'publisher-fixture.json');
  writeFileSync(file, JSON.stringify(data, null, 2), { flag: 'wx' });
  const receipt = {
    source: 'packages/feed/test/full-reader/fixtures.ts',
    sourceSha256: createHash('sha256').update(readFileSync(source)).digest('hex'),
    stagedFeedModuleSha256: createHash('sha256')
      .update(readFileSync(resolve(site, 'modules/feed-core.mjs')))
      .digest('hex'),
    fixtureSha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
    kind: 'original synthetic text and credits; no publisher body or network',
  };
  writeFileSync(join(directory, 'fixture-receipt.json'), JSON.stringify(receipt, null, 2), {
    flag: 'wx',
  });
  return { data, fixture, file, receipt };
}
