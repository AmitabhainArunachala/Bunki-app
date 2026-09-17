/** Original ALMA prose and exact reviewed policy, bound to the tested artifact. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export async function prepareAlmaFixture({ repo, site, output }) {
  const directory = resolve(output);
  mkdirSync(directory, { recursive: false });
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const source = resolve(repo, 'packages/feed/test/full-reader/alma-fixtures.ts');
  const policyPath = resolve(
    repo,
    'packages/feed/test/full-reader/alma/reviewed-rights-section.html',
  );
  const provenancePath = resolve(
    repo,
    'packages/feed/test/full-reader/alma/policy-provenance.json',
  );
  const policy = readFileSync(policyPath);
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
  assert.equal(hash(policy), provenance.fixtureSha256, 'Reviewed policy bytes match provenance');
  const feedEntry = resolve(repo, 'packages/feed/src/index.ts');
  const feedModule = resolve(site, 'modules/feed-core.mjs');
  const moduleFile = join(directory, 'original-alma-fixtures.mjs');
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
              return { path: pathToFileURL(feedModule).href, external: true };
            return undefined;
          });
        },
      },
    ],
  });
  assert.equal(compiled.outputFiles.length, 1);
  writeFileSync(moduleFile, compiled.outputFiles[0].contents, { flag: 'wx' });
  mkdirSync(join(directory, 'alma'));
  writeFileSync(join(directory, 'alma/reviewed-rights-section.html'), policy, { flag: 'wx' });
  const fixture = await import(pathToFileURL(moduleFile).href);
  assert.equal(hash(fixture.RIGHTS), provenance.fixtureSha256);
  const receipt = {
    source: 'packages/feed/test/full-reader/alma-fixtures.ts',
    sourceSha256: hash(readFileSync(source)),
    stagedFeedModuleSha256: hash(readFileSync(feedModule)),
    fixtureModuleSha256: hash(readFileSync(moduleFile)),
    policyProvenanceSha256: hash(readFileSync(provenancePath)),
    policyProvenance: provenance,
    kind: 'Original synthetic article; exact reviewed legal section; no live publisher requests',
  };
  writeFileSync(join(directory, 'fixture-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', {
    flag: 'wx',
  });
  return { fixture, receipt };
}
