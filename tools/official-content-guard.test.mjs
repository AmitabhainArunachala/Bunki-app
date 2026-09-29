/** The official-content guard: hashes only, green on clean text, red on every planted copy. */
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CANARY,
  DEFAULT_DENYLIST,
  loadDenylist,
  normalizeText,
  scanBytes,
  selfTest,
  wholeKey,
  windowsOf,
} from '../scripts/verify-no-official-content.mjs';

describe('official-content guard', () => {
  it('the committed denylist holds hashes only, never Japanese text', () => {
    const text = readFileSync(DEFAULT_DENYLIST, 'utf8');
    expect(/[\u3040-\u30FF\u3400-\u9FFF]/u.test(text)).toBe(false);
    const denylist = loadDenylist();
    expect(denylist.counts.files).toBeGreaterThan(100);
    expect(denylist.counts.windows).toBeGreaterThan(1000);
    // The canary sentence, written for this check, is listed; its source form is split so this file never matches.
    expect([...windowsOf(CANARY)].every((key) => denylist.windows.has(key))).toBe(true);
  });

  it('is green on a clean scratch repository and red on every planted fixture', () => {
    const result = selfTest(loadDenylist());
    expect(result.clean).toBe(true);
    expect(result.caught).toBe(true);
  });

  it('finds official text however it is copied, and passes original text', () => {
    const passage =
      '灯台の見える坂道で、猫が三冊の古い辞書を並べていた。雨の日は窓辺が暗いので、猫は辞書を読むのをやめて眠ることにした。';
    const choice = '金曜日までに受付で申し込む';
    const denylist = {
      files: new Set(),
      windows: windowsOf(passage),
      strings: new Set([wholeKey(normalizeText(choice))]),
    };
    denylist.filter = new Uint8Array(1 << 21);
    for (const key of denylist.windows) {
      const bit = Number.parseInt(key.split(':')[0], 16) >>> 8;
      denylist.filter[bit >>> 3] |= 1 << (bit & 7);
    }
    const rules = (path, content) =>
      scanBytes(path, Buffer.from(content), denylist).map((finding) => finding.rule);
    expect(rules('a.json', JSON.stringify({ text: passage.slice(10, 70) }))).toContain(
      'text-window',
    );
    expect(
      rules(
        'b.json',
        JSON.stringify({ text: passage }).replace(
          /[\u0080-\uffff]/gu,
          (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
        ),
      ),
    ).toContain('text-window');
    expect(
      rules(
        'c.mjs',
        `export const t = ${JSON.stringify(passage.slice(0, 30) + '\n' + passage.slice(30))};`,
      ),
    ).toContain('text-window');
    expect(rules('d.md', `- 「${choice}」\n`)).toContain('whole-string');
    expect(rules('e.md', '灯台守は朝に鐘を鳴らした。港には船が三隻あった。')).toEqual([]);
    expect(
      rules('f.json', JSON.stringify({ entries: [{ sourceClass: 'official-private' }] })),
    ).toContain('official-class');
    expect(rules('g.bin', 'kairo-private-assessment-pack/1\n2\n{}')).toContain('private-pack');
  });
});
