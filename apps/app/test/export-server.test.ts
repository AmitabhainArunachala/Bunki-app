import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { resolveFile, startExportHost } from '../e2e/support/export-server.ts';

const fixtureRoots: string[] = [];

function write(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, 'utf8');
}

function exportFixture(): { readonly root: string; readonly dist: string } {
  const root = mkdtempSync(join(tmpdir(), 'bunki-export-server-'));
  const dist = join(root, 'dist');
  fixtureRoots.push(root);

  write(join(dist, 'index.html'), '<main>home</main>');
  write(join(dist, '+not-found.html'), '<main>not found</main>');
  return { root, dist };
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

interface HostResponse {
  readonly statusCode: number;
  readonly body: string;
}

function requestPath(baseUrl: string, path: string): Promise<HostResponse> {
  const target = new URL(baseUrl);

  return new Promise<HostResponse>((done, fail) => {
    const outgoing = request(
      {
        hostname: target.hostname,
        port: target.port,
        method: 'GET',
        path,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        incoming.on('error', fail);
        incoming.on('end', () => {
          done({
            statusCode: incoming.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    outgoing.on('error', fail);
    outgoing.end();
  });
}

describe('export test-server containment', () => {
  test('preserves valid direct, extensionless, index, query, and dynamic routes', () => {
    const { dist } = exportFixture();
    write(join(dist, '_expo/static/app.js'), 'app');
    write(join(dist, 'about.html'), 'about');
    write(join(dist, 'guide/index.html'), 'guide');
    write(join(dist, 'word/[lexemeId].html'), 'word');
    write(join(dist, 'kanji/[character].html'), 'kanji');

    expect(resolveFile(dist, '/')).toBe(realpathSync(join(dist, 'index.html')));
    expect(resolveFile(dist, '/_expo/static/app.js?cache=1')).toBe(
      realpathSync(join(dist, '_expo/static/app.js')),
    );
    expect(resolveFile(dist, '/about')).toBe(realpathSync(join(dist, 'about.html')));
    expect(resolveFile(dist, '/guide')).toBe(realpathSync(join(dist, 'guide/index.html')));
    expect(resolveFile(dist, '/word/lex-bunki')).toBe(
      realpathSync(join(dist, 'word/[lexemeId].html')),
    );
    expect(resolveFile(dist, '/kanji/%E5%88%86')).toBe(
      realpathSync(join(dist, 'kanji/[character].html')),
    );
  });

  test.each([
    '/../secret.html',
    '/%2e%2e/secret.html',
    '/nested/../../secret.html',
    '/nested/%2e%2e/%2e%2e/secret.html',
    '/..%2fsecret.html',
    '/..%5csecret.html',
    '/..\\secret.html',
    '/.%2findex.html',
    '/a%5c..%5csecret.html',
    '/C:%5csecret.html',
  ])('rejects traversal without aliasing a valid file: %s', (urlPath) => {
    const { root, dist } = exportFixture();
    write(join(root, 'secret.html'), 'outside');

    expect(resolveFile(dist, urlPath)).toBeNull();
  });

  test.each(['/%E0%A4%A', '/%00secret.js', '/folder%5casset.js'])(
    'rejects malformed or non-canonical URL paths: %s',
    (urlPath) => {
      const { dist } = exportFixture();
      expect(resolveFile(dist, urlPath)).toBeNull();
    },
  );

  test('rejects direct and parent symlinks whose final targets escape the export root', () => {
    const { root, dist } = exportFixture();
    const outside = join(root, 'outside.js');
    const outsideDirectory = join(root, 'outside-directory');
    write(outside, 'outside');
    write(join(outsideDirectory, 'nested.js'), 'nested outside');
    symlinkSync(outside, join(dist, 'leak.js'), 'file');
    symlinkSync(outsideDirectory, join(dist, 'linked-directory'), 'dir');

    expect(resolveFile(dist, '/leak.js')).toBeNull();
    expect(resolveFile(dist, '/linked-directory/nested.js')).toBeNull();
  });

  test('never follows an unsafe not-found document or a double-encoded path outside the root', () => {
    const { root, dist } = exportFixture();
    const outside = join(root, 'outside.html');
    write(outside, 'outside');
    rmSync(join(dist, '+not-found.html'));
    symlinkSync(outside, join(dist, '+not-found.html'), 'file');

    expect(resolveFile(dist, '/missing')).toBeNull();
    expect(resolveFile(dist, '/%252e%252e%252foutside.html')).toBeNull();
  });

  test('never returns a directory as a file and fails closed when the fallback is absent', () => {
    const { dist } = exportFixture();
    mkdirSync(join(dist, 'bundle.js'));

    expect(resolveFile(dist, '/bundle.js')).toBe(realpathSync(join(dist, '+not-found.html')));

    rmSync(join(dist, '+not-found.html'));
    expect(resolveFile(dist, '/missing.js')).toBeNull();
    expect(resolveFile(dist, '/bundle.js')).toBeNull();
  });

  test('returns a generic 404 for traversal without leaking the file or runner path', async () => {
    const { root, dist } = exportFixture();
    write(join(root, 'secret.html'), 'outside-secret');
    const host = await startExportHost(dist);

    try {
      const response = await requestPath(host.baseUrl, '/%2e%2e/secret.html');
      expect(response).toEqual({ statusCode: 404, body: 'not found' });
      expect(response.body).not.toContain(root);
      expect(response.body).not.toContain('outside-secret');
    } finally {
      await host.close();
    }
  });

  test('keeps serving after a malformed URL path', async () => {
    const { dist } = exportFixture();
    const host = await startExportHost(dist);

    try {
      expect(await requestPath(host.baseUrl, '/%E0%A4%A')).toEqual({
        statusCode: 404,
        body: 'not found',
      });
      expect(await requestPath(host.baseUrl, '/')).toEqual({
        statusCode: 200,
        body: '<main>home</main>',
      });
    } finally {
      await host.close();
    }
  });

  test('serves Expo not-found content with a real 404 status', async () => {
    const { dist } = exportFixture();
    const host = await startExportHost(dist);

    try {
      expect(await requestPath(host.baseUrl, '/missing.js')).toEqual({
        statusCode: 404,
        body: '<main>not found</main>',
      });
    } finally {
      await host.close();
    }
  });
});
