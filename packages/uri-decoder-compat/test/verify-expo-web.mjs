import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

import { startAppHost } from '../../../apps/app/e2e/support/adv-harness.ts';

const installed = createRequire(import.meta.url);
const { chromium } = installed('playwright-core');
const { parse } = installed('@babel/parser');
const [siteArg, evidenceArg] = process.argv.slice(2);
assert.ok(
  siteArg && evidenceArg,
  'Pass an existing Expo web export and an external evidence directory.',
);
const site = resolve(siteArg);
const evidence = resolve(evidenceArg);
await mkdir(evidence, { recursive: true });

const bundleDir = join(site, '_expo/static/js/web');
const names = (await readdir(bundleDir)).filter((name) => name.endsWith('.js'));
assert.equal(
  names.length,
  1,
  'Review this verifier if Expo splits the entry into multiple bundles.',
);
const bundleFile = join(bundleDir, names[0]);
const bundle = await readFile(bundleFile, 'utf8');
const modules = parse(bundle).program.body.flatMap((statement) => {
  const call = statement.expression;
  if (call?.type !== 'CallExpression' || call.callee.name !== '__d') return [];
  const [factory, id, dependencies] = call.arguments;
  return [
    {
      id: id.value,
      dependencies: dependencies?.elements?.map((entry) => entry.value) ?? [],
      factory: bundle.slice(factory.start, factory.end),
    },
  ];
});
// This marker locates the production module; it is not the acceptance check.
// The browser below executes the actual exported parser and public routes.
const bridges = modules.filter((entry) =>
  entry.factory.includes('URI decoder export is not callable'),
);
assert.equal(bridges.length, 1, 'Expected one bundled compatibility adapter.');
const queryParents = modules.filter((entry) => entry.dependencies.includes(bridges[0].id));
assert.equal(queryParents.length, 1, 'Expected one query-string consumer of this adapter.');

const host = await startAppHost(site);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const results = [];
const pageErrors = [];
const blockedExternalRequests = [];
const failedLocalResponses = [];
const receipt = {
  site,
  bundleFile,
  bundleSha256: createHash('sha256').update(bundle).digest('hex'),
  node: process.version,
  browser: browser.version(),
  productionModuleIds: { decoder: bridges[0].id, query: queryParents[0].id },
  results,
  pageErrors,
  blockedExternalRequests,
  failedLocalResponses,
};

async function visit(name, path, inspect) {
  const context = await browser.newContext();
  try {
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === host.origin || ['data:', 'blob:'].includes(url.protocol)) {
        await route.continue();
      } else {
        blockedExternalRequests.push({ name, url: url.href });
        await route.abort('internetdisconnected');
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on('pageerror', (error) => pageErrors.push({ name, error: error.message }));
    page.on('response', (response) => {
      if (response.url().startsWith(host.origin) && response.status() >= 400) {
        failedLocalResponses.push({ name, url: response.url(), status: response.status() });
      }
    });
    const response = await page.goto(host.origin + path, { waitUntil: 'load' });
    assert.equal(response.status(), 200);
    await page.getByTestId('nav-capture').locator('visible=true').waitFor();
    const detail = await inspect(page);
    assert.equal(pageErrors.length, 0, JSON.stringify(pageErrors));
    assert.equal(failedLocalResponses.length, 0, JSON.stringify(failedLocalResponses));
    results.push({ name, passed: true, detail });
  } finally {
    await context.close();
  }
}

try {
  await visit(
    'production parser executes in Chromium with the CommonJS callable contract',
    '/source',
    async (page) => {
      const actual = await page.evaluate(({ query, decoder }) => {
        const parser = globalThis.__r(query);
        const decode = globalThis.__r(decoder);
        const malformed = '%E2'.repeat(4096);
        return {
          callable: typeof decode,
          direct: decode('犬+a%2Bb'),
          query: parser.parse('word=%E7%8A%AC&space=a+b&plus=a%2Bb&tag=one&tag=two&empty=&absent'),
          fragment: parser.parseUrl('https://example.invalid/#%E7%8A%AC+a%2Bb', {
            parseFragmentIdentifier: true,
          }).fragmentIdentifier,
          malformedPreserved: parser.parse('text=' + malformed).text === malformed,
        };
      }, receipt.productionModuleIds);
      assert.deepEqual(actual, {
        callable: 'function',
        direct: '犬 a+b',
        query: {
          word: '犬',
          space: 'a b',
          plus: 'a+b',
          tag: ['one', 'two'],
          empty: '',
          absent: null,
        },
        fragment: '犬 a+b',
        malformedPreserved: true,
      });
      return actual;
    },
  );

  await visit(
    'cold encoded focus query reaches the real source control',
    '/source?focus=%61nchor-jibun-01&word=%E7%8A%AC',
    async (page) => {
      await page.waitForFunction(
        () =>
          globalThis.document.activeElement?.getAttribute('data-testid') === 'golden-source-target',
      );
      assert.match(await page.getByTestId('golden-source-body').innerText(), /自分/);
      return { exactSourceFocused: true };
    },
  );

  for (const [name, query] of [
    ['literal plus and encoded plus query', 'text=a+b&plus=a%2Bb'],
    ['repeated and blank query values', 'focus=anchor-jibun-01&focus=other&empty=&absent'],
    ['short malformed percent input', 'text=%E0%A4%A'],
    ['bounded long malformed percent input', 'text=' + '%E2'.repeat(4096)],
  ]) {
    await visit('cold startup: ' + name, '/source?' + query, async (page) => {
      await page.getByTestId('screen-golden-source').waitFor();
      assert.match(await page.title(), /静かな朝/);
      await page.getByTestId('nav-capture').locator('visible=true').click();
      await page.getByTestId('capture-search-input').locator('visible=true').waitFor();
      return { queryCharacters: query.length, sourceRenderedAndNavigationResponsive: true };
    });
  }

  await visit(
    'cold Japanese word deep link renders its decoded headword',
    '/word/%E7%8A%AC',
    async (page) => {
      const headword = await page.getByTestId('drift-word-headword').innerText();
      assert.match(headword, /犬/);
      return { headword };
    },
  );

  await visit(
    'ordinary UI navigation and reload retain the seeded word route',
    '/',
    async (page) => {
      await page.getByTestId('capture-search-input').fill('分岐');
      await page.getByTestId('capture-open-word').waitFor();
      await page.getByTestId('capture-open-word').click();
      await page.getByTestId('word-headword').locator('visible=true').waitFor();
      assert.match(
        await page.getByTestId('word-headword').locator('visible=true').innerText(),
        /分岐/,
      );
      await page.reload({ waitUntil: 'load' });
      await page.getByTestId('word-headword').locator('visible=true').waitFor();
      assert.match(
        await page.getByTestId('word-headword').locator('visible=true').innerText(),
        /分岐/,
      );
      return { route: new URL(page.url()).pathname, coldReloadRendered: true };
    },
  );
  receipt.passed = true;
} catch (error) {
  receipt.passed = false;
  receipt.error = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await host.close();
  await writeFile(join(evidence, 'expo-web-browser.json'), JSON.stringify(receipt, null, 2) + '\n');
  process.stdout.write(
    JSON.stringify({ passed: receipt.passed, checks: results.length, error: receipt.error }) + '\n',
  );
}
