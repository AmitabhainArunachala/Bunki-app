import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execPath } from 'node:process';

import { describe, expect, it } from 'vitest';

type QueryValue = string | null | (string | null)[];
type Query = Record<string, QueryValue>;
type QueryOptions = Record<string, unknown>;
interface QueryString {
  parse(input: string, options?: QueryOptions): Query;
  parseUrl(
    input: string,
    options?: QueryOptions,
  ): { url: string; query: Query; fragmentIdentifier?: string };
  stringify(input: Record<string, unknown>, options?: QueryOptions): string;
}
interface RouteState {
  routes: { name: string; params?: Query; path?: string }[];
}

const installed = createRequire(import.meta.url);
const routerFile = installed.resolve('expo-router/build/react-navigation/core/getStateFromPath');
const routerRequire = createRequire(routerFile);
const queryFile = routerRequire.resolve('query-string');
const queryRequire = createRequire(queryFile);
const query = routerRequire('query-string') as QueryString;
const decode = installed('../index.cjs') as (input: unknown) => string;
const { getStateFromPath } = routerRequire(routerFile) as {
  getStateFromPath(path: string): RouteState;
};
const { getPathFromState } = routerRequire('./getPathFromState') as {
  getPathFromState(state: RouteState): string;
};

describe('the installed query-string decoder adapter', () => {
  it('is the actual callable dependency resolved by Expo Router, with no ESM namespace leak', () => {
    expect(queryRequire('decode-uri-component')).toBe(decode);
    expect(typeof decode).toBe('function');
    const modern = installed('decode-uri-component-modern') as { default: unknown };
    expect(typeof modern.default).toBe('function');
  });

  it.each([
    ['', {}],
    ['a', { a: null }],
    ['a=', { a: '' }],
    ['a=1', { a: '1' }],
    ['a=1&a=2', { a: ['1', '2'] }],
    ['a=&b', { a: '', b: null }],
    ['q=a+b', { q: 'a b' }],
    ['q=a%2Bb', { q: 'a+b' }],
    ['q=%E6%97%A5%E6%9C%AC%E8%AA%9E', { q: '日本語' }],
    ['q=%F0%9F%8C%B1', { q: '🌱' }],
    ['q=%25', { q: '%' }],
    ['q=%', { q: '%' }],
    ['q=%G1', { q: '%G1' }],
    ['q=%E0%A4%A', { q: '%E0%A4%A' }],
    ['q=%C2', { q: '�' }],
    ['q=%FE%FF', { q: '��' }],
    ['q=%FF%FE', { q: '��' }],
    ['q=%E2%82', { q: '%E2%82' }],
    ['q=%ED%A0%80', { q: '%ED%A0%80' }],
    ['q=%F4%90%80%80', { q: '%F4%90%80%80' }],
    ['q=%80%61', { q: '%80a' }],
    ['%E5%AD%A6%E6%A0%A1=%E7%8A%AC', { 学校: '犬' }],
    ['__proto__=x', { ['__proto__']: 'x' }],
    ['constructor=x', { constructor: 'x' }],
    ['?a=1#b', { a: '1#b' }],
    ['a=b=c', { a: 'b=c' }],
    ['q=x%26y', { q: 'x&y' }],
    ['q=%00', { q: '\u0000' }],
  ] satisfies [string, Query][])(
    'preserves the existing query result for %s',
    (input, expected) => {
      const parsed = query.parse(input);
      expect(parsed).toEqual(expected);
      expect(Object.getPrototypeOf(parsed)).toBeNull();
    },
  );

  it('keeps literal plus, encoded plus and Japanese URL fragments distinct', () => {
    expect(
      query.parseUrl('https://example.invalid/?q=a+b#%E7%8A%AC+a%2Bb', {
        parseFragmentIdentifier: true,
      }),
    ).toEqual({
      url: 'https://example.invalid/',
      query: { q: 'a b' },
      fragmentIdentifier: '犬 a+b',
    });
    expect(decode('a+b%2Bc')).toBe('a b+c');
  });

  it.each([undefined, null, 3, {}, ['%20']])(
    'retains a TypeError for non-string input %s',
    (input) => {
      expect(() => decode(input)).toThrow(TypeError);
    },
  );

  it.each(['none', 'index', 'bracket', 'comma'])(
    'round-trips the %s array format',
    (arrayFormat) => {
      const input = { word: ['学校', '犬'], empty: '', absent: null };
      const encoded = query.stringify(input, { arrayFormat });
      expect(query.parse(encoded, { arrayFormat })).toEqual(input);
    },
  );

  it('finishes a bounded malformed query in an isolated process', () => {
    // Never give the legacy decoder the long fixture, even if installation is stale.
    expect(queryRequire('decode-uri-component')).toBe(decode);
    const result = spawnSync(
      execPath,
      [
        '-e',
        `const assert = require('node:assert/strict');
         const query = require(process.argv[1]);
         const input = '%E2'.repeat(4096);
         assert.equal(query.parse('text=' + input).text, input);
         process.stdout.write('bounded-malformed-query-ok');`,
        queryFile,
      ],
      { encoding: 'utf8', timeout: 5000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('bounded-malformed-query-ok');
  });
});

describe('real installed Expo Router path consumers', () => {
  it.each([
    ['/source?text=%E6%97%A5%E6%9C%AC&word=%E7%8A%AC', { text: '日本', word: '犬' }],
    [
      '/source?text=a+b&plus=a%2Bb&tag=one&tag=two&empty=&absent',
      { text: 'a b', plus: 'a+b', tag: ['one', 'two'], empty: '', absent: null },
    ],
    ['/source?text=%E0%A4%A', { text: '%E0%A4%A' }],
  ] satisfies [string, Query][])('decodes a cold navigation path %s', (path, params) => {
    expect(getStateFromPath(path).routes).toEqual([{ name: 'source', path, params }]);
  });

  it('serializes and reparses navigation state through the existing namespace API', () => {
    const params = { word: '学校', literal: 'a+b', space: 'a b', blank: '' };
    const path = getPathFromState({ routes: [{ name: 'source', params }] });
    expect(path).toContain('literal=a%2Bb');
    expect(path).toContain('space=a%20b');
    expect(getStateFromPath(path).routes[0]?.params).toEqual(params);
  });
});

describe('the patched native build dependency APIs', () => {
  it('lets Xcode generate its real UUID format and round-trip a synthetic project', () => {
    interface Project {
      hash: unknown;
      generateUuid(): string;
      writeSync(): string;
    }
    const xcode = installed('xcode') as { project(path: string): Project };
    const xcodeRoot = dirname(installed.resolve('xcode/package.json'));
    const parser = installed(join(xcodeRoot, 'lib/parser/pbxproj.js')) as {
      parse(text: string): unknown;
    };
    const project = xcode.project('/synthetic-unused-project.pbxproj');
    project.hash = parser.parse(
      '// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 46; objects = {}; rootObject = AAAAAAAAAAAAAAAAAAAAAAAA; }\n',
    );
    const ids = Array.from({ length: 1000 }, () => project.generateUuid());
    expect(ids.every((id) => /^[A-F0-9]{24}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(parser.parse(project.writeSync())).toEqual(project.hash);
  });

  it('uses Metro asset parsing for an ordinary PNG and rejects invalid image bytes', () => {
    const metro = installed('metro/private/Assets') as {
      getAssetSize(
        type: string,
        bytes: Buffer,
        filename: string,
      ): { width: number; height: number };
    };
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGtsAAAAASUVORK5CYII=',
      'base64',
    );
    expect(metro.getAssetSize('png', png, 'synthetic.png')).toEqual({ width: 1, height: 1 });
    expect(() => metro.getAssetSize('png', Buffer.alloc(32), 'synthetic-invalid.png')).toThrow();
  });
});
