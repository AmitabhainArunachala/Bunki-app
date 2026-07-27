/**
 * Golden replay against recorded fixtures (WP-02; T-03, controller §6.3).
 *
 * `npm run test:replay` runs this file and its sibling determinism suite. Each
 * fixture in `test/fixtures/golden-*.json` is an event log plus the derived
 * state it must produce, and the comparison is on canonical JSON text — the
 * same bytes WP-03's export path will have to round-trip (T-14).
 *
 * Fixtures are discovered from the directory rather than listed here. A golden
 * file that nobody remembered to register would be a golden file that proves
 * nothing, which is the specific way this kind of suite usually rots.
 *
 * `node:fs` is imported here and nowhere under `src/` — the kernel itself
 * reaches for no platform API (REQ-ARCH-02), and the lint boundary in
 * `eslint.config.mjs` allows Node builtins in `packages/domain/test/` only.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  loadGoldenFixture,
  replayTwiceAndCompare,
  verifyGoldenFixture,
  type GoldenFixture,
} from '../../src/index.ts';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

function fixturePaths(): readonly string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.startsWith('golden-') && name.endsWith('.json'))
    .sort()
    .map((name) => join(FIXTURE_DIR, name));
}

function load(path: string): GoldenFixture {
  return loadGoldenFixture(JSON.parse(readFileSync(path, 'utf8')), path);
}

const paths = fixturePaths();

describe('golden fixture discovery', () => {
  it('finds at least the three fixtures the WP-02 closure predicate requires', () => {
    expect(paths.length).toBeGreaterThanOrEqual(3);
  });

  it('names every fixture after its file, so a failure points at the file to open', () => {
    paths.forEach((path) => {
      const fixture = load(path);
      expect(path.endsWith(`${fixture.name}.json`)).toBe(true);
    });
  });

  it('records what each fixture stands for', () => {
    paths.forEach((path) => {
      const fixture = load(path);
      expect(fixture.description.length).toBeGreaterThan(40);
      expect(fixture.anchors).toContain('T-03');
    });
  });
});

describe.each(paths.map((path) => [path.slice(path.lastIndexOf('/') + 1), path] as const))(
  'golden fixture %s',
  (_name, path) => {
    const fixture = load(path);

    it('parses every event in the log under the v1 schema', () => {
      expect(fixture.events.length).toBeGreaterThan(0);
      fixture.events.forEach((event) => {
        expect(event.v).toBe(1);
      });
    });

    it('replays to the recorded derived state', () => {
      const result = verifyGoldenFixture(fixture);
      // Compare the text, not a boolean: a mismatch should print the diff.
      expect(result.actualJson).toBe(result.expectedJson);
      expect(result.matches).toBe(true);
    });

    it('replays to the same state twice (T-03)', () => {
      const result = replayTwiceAndCompare(fixture.events);
      expect(result.identical).toBe(true);
      expect(result.second).toEqual(result.first);
    });

    it('produces a snapshot that survives a JSON round trip unchanged', () => {
      // What WP-03 will export and re-import (T-14). If the derived state held
      // anything JSON cannot carry, it would show up here rather than at WP-03.
      const result = verifyGoldenFixture(fixture);
      expect(canonicalJson(JSON.parse(result.actualJson))).toBe(result.actualJson);
    });
  },
);

describe('the harness rejects a fixture it cannot trust', () => {
  it('refuses a fixture file that is missing its metadata', () => {
    expect(() => loadGoldenFixture({ events: [], expectedState: {} }, '<inline>')).toThrow(
      /malformed/,
    );
  });

  it('refuses a fixture whose log the parser would reject', () => {
    expect(() =>
      loadGoldenFixture(
        {
          name: 'inline',
          description:
            'a fixture carrying an event from a schema version this build does not implement',
          anchors: ['T-04'],
          events: [
            {
              eventId: 'x',
              v: 2,
              occurredAt: '2026-07-27T00:00:00.000Z',
              idempotencyKey: 'k',
              type: 'X',
            },
          ],
          expectedState: {},
        },
        '<inline>',
      ),
    ).toThrow(/Unknown event schema version/);
  });
});
