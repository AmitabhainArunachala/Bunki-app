/** The private real-paper importer's Mac side and the repository guard, on synthetic data only.
 * Real JLPT content never enters this repository; see scripts/verify-no-official-content.mjs. */
import { Buffer } from 'node:buffer';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assemblePack,
  checkRecordings,
  compareKeyWithParse,
  packContainer,
  parseManifest,
  reconcileMapping,
} from '../prototypes/corridor/tools/assessment/private-pack.mjs';
import {
  syntheticConfig,
  syntheticKey,
  syntheticKeyParse,
  syntheticMapping,
} from '../prototypes/corridor/tools/assessment/private-pack-fixture.mjs';
import {
  PAPER_MARKS,
  lineText,
  pageLines,
  parseAnswerKeyPages,
  splitScriptText,
  scriptItemAnchors,
} from '../prototypes/corridor/tools/assessment/official-paper.mjs';
import {
  privateDirectory,
  sha256,
} from '../prototypes/corridor/tools/assessment/source-import.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const media = [1, 2].map((index) => {
  const bytes = Buffer.from(`synthetic recording ${index}`);
  return { name: `tone-${index}.mp3`, bytes, sha256: sha256(bytes), durationMs: 3000 };
});

describe('private pack builder', () => {
  it('builds an official-private form whose every part stays on the device', async () => {
    const { form, delivery, entry } = await assemblePack({
      mapping: syntheticMapping(),
      key: syntheticKey(),
      media,
      config: syntheticConfig,
      packId: 'synthetic-pack',
    });
    expect(form.items).toHaveLength(8);
    expect(
      [...form.items, ...form.passages, ...form.media].every(
        (part) => part.provenance.kind === 'official-private',
      ),
    ).toBe(true);
    expect([form, ...form.items].every((part) => part.rights.sync.status === 'denied')).toBe(true);
    expect(form.items.find((item) => item.id.endsWith(':q1')).response.answerOptionId).toBe('1');
    expect(form.items.find((item) => item.id.endsWith(':q1')).prompt).toContain(
      PAPER_MARKS.underlineOpen,
    );
    // Every listening item is linked to its recording; spoken choices are marked as spoken.
    for (const item of form.items.filter((row) => row.skill === 'listening'))
      expect(
        delivery.units.some(
          (unit) => unit.itemIds.includes(item.id) && unit.media.sha256 === item.media[0].sha256,
        ),
      ).toBe(true);
    expect(delivery.units.every((unit) => unit.stimulusPlayCount === 1)).toBe(true);
    expect(delivery.units.find((unit) => unit.id === 'l2').spokenOptionItemIds).toHaveLength(2);
    expect(form.items.find((item) => item.id.endsWith(':l2-2')).response.options).toHaveLength(3);
    expect(entry).toMatchObject({
      sourceClass: 'official-private',
      publicationRoute: 'device-private',
      officialScoreCalibrated: false,
    });
    expect(entry.formPath).toBe('private/synthetic-pack/form.json');
    expect(entry.officialSections.map((section) => section.id)).toEqual([
      'language-knowledge',
      'reading',
      'listening',
    ]);
    expect(form.timingBlocks.map((block) => block.authority)).toEqual([
      { kind: 'official-fact', blueprintId: 'jlpt-n1-facts-20260910', blockId: 'language-reading' },
      { kind: 'official-fact', blueprintId: 'jlpt-n1-facts-20260910', blockId: 'listening' },
    ]);
    expect(form.timingBlocks[1].durationMs).toBe(6000 + 60_000);
  });

  it('refuses a mapping whose counts or labels disagree with the key (negative controls)', () => {
    const missing = syntheticMapping();
    missing.written.items = missing.written.items.filter((item) => item.number !== 2);
    expect(() => reconcileMapping(missing, syntheticKey(), syntheticConfig)).toThrow(
      /1 questions drafted, the key has 2/u,
    );
    const extraKey = syntheticKey();
    extraKey.written.push({ mondai: 4, label: '6', answer: 3 });
    expect(() => reconcileMapping(syntheticMapping(), extraKey, syntheticConfig)).toThrow(
      /the key has 2/u,
    );
    const renumbered = syntheticMapping();
    renumbered.written.items[1].number = 9;
    expect(() => reconcileMapping(renumbered, syntheticKey(), syntheticConfig)).toThrow(
      /does not match key item/u,
    );
    const threeChoices = syntheticMapping();
    threeChoices.written.items[0].options.pop();
    expect(() => reconcileMapping(threeChoices, syntheticKey(), syntheticConfig)).toThrow(
      /four printed choices/u,
    );
    const duplicated = syntheticMapping();
    duplicated.written.items[0].options[1] = duplicated.written.items[0].options[0];
    expect(() => reconcileMapping(duplicated, syntheticKey(), syntheticConfig)).toThrow(/twice/u);
    const unprinted = syntheticMapping();
    unprinted.listening.groups = unprinted.listening.groups.filter((group) => group.label === '例');
    expect(() => reconcileMapping(unprinted, syntheticKey(), syntheticConfig)).toThrow(
      /printed choices/u,
    );
    const outOfRange = syntheticKey();
    outOfRange.listening[2].answer = 4;
    expect(() => reconcileMapping(syntheticMapping(), outOfRange, syntheticConfig)).toThrow(
      /outside its 3 choices/u,
    );
  });

  it('refuses a key that disagrees with the independent 正答表 parse', () => {
    expect(
      compareKeyWithParse(syntheticKey(), syntheticKeyParse(), syntheticConfig).written.total,
    ).toBe(5);
    const flipped = syntheticKey();
    flipped.written[0].answer = 4;
    expect(() => compareKeyWithParse(flipped, syntheticKeyParse(), syntheticConfig)).toThrow(
      /Written key disagrees/u,
    );
    const listening = syntheticKey();
    listening.listening[0].answer = 3;
    expect(() => compareKeyWithParse(listening, syntheticKeyParse(), syntheticConfig)).toThrow(
      /Listening key disagrees/u,
    );
  });

  it('refuses recordings that are not the published lengths', () => {
    const config = { ...syntheticConfig, recordedListeningSeconds: 6 };
    expect(
      checkRecordings(
        [
          { name: 'a', durationMs: 3400, manifestSeconds: 3 },
          { name: 'b', durationMs: 3000, manifestSeconds: 3 },
        ],
        config,
      ).flooredSeconds,
    ).toBe(6);
    expect(() =>
      checkRecordings(
        [
          { name: 'a', durationMs: 4100, manifestSeconds: 3 },
          { name: 'b', durationMs: 3000, manifestSeconds: 3 },
        ],
        config,
      ),
    ).toThrow(/manifest records/u);
    expect(() =>
      checkRecordings([{ name: 'a', durationMs: 3000, manifestSeconds: null }], config),
    ).toThrow(/total 3 s/u);
  });

  it('refuses a changed file in the container and a pack directory inside the repository', async () => {
    const bytes = Buffer.from('{}');
    const manifest = { files: [{ path: 'form.json', sha256: sha256(bytes), bytes: bytes.length }] };
    expect(packContainer(manifest, new Map([['form.json', bytes]])).toString('latin1')).toMatch(
      /^kairo-private-assessment-pack\/1\n/u,
    );
    expect(() => packContainer(manifest, new Map([['form.json', Buffer.from('{ }')]]))).toThrow(
      /changed/u,
    );
    const inside = resolve('prototypes/corridor/data/private-pack-refusal-probe');
    await expect(privateDirectory(inside)).rejects.toThrow(/outside the repository/u);
    expect(existsSync(inside)).toBe(false);
    const outside = mkdtempSync(join(tmpdir(), 'kairo-pack-'));
    await expect(privateDirectory(join(outside, 'packs'))).resolves.toBeTruthy();
    rmSync(outside, { recursive: true, force: true });
  });

  it('reads the download manifest rows it hashes against', () => {
    const rows = parseManifest(
      '| `N1/x/N1Q1.mp3` | 聴解 | 123 | 13m17s | `' +
        'a'.repeat(64) +
        '` | https://example.invalid/a |\n',
    );
    expect(rows.get('N1/x/N1Q1.mp3')).toEqual({
      bytes: 123,
      seconds: 797,
      sha256: 'a'.repeat(64),
      url: 'https://example.invalid/a',
    });
  });
});

describe('official paper reader (synthetic layouts)', () => {
  const word = (x0, y0, text, h = 10.89, width = 11.31) => ({
    x0,
    y0,
    x1: x0 + width * [...text].length,
    y1: y0 + h,
    text,
  });
  it('reads a 正答表 table, including shared-number sub-questions, and refuses an unanswered item', () => {
    const page = {
      page: 1,
      words: [
        word(60, 100, '問題', 13.48, 10),
        word(95, 100, '1', 13.48, 5.5),
        word(120, 100, '1', 13.48, 5.5),
        word(150, 100, '2', 13.48, 5.5),
        word(120, 121, '3', 13.48, 5.5),
        word(150, 121, '1', 13.48, 5.5),
        word(60, 300, '●聴', 13.48, 10),
        word(75, 300, '解', 13.48, 10),
        word(60, 330, '問題', 13.48, 10),
        word(95, 330, '5', 13.48, 5.5),
        word(190, 330, '3', 13.48, 5.5),
        word(120, 350, '1', 13.48, 5.5),
        word(150, 350, '2', 13.48, 5.5),
        word(175, 370, '(1)', 13.48, 5.5),
        word(205, 370, '(2)', 13.48, 5.5),
        word(120, 390, '２', 13.48, 5.5),
        word(150, 390, '２', 13.48, 5.5),
        word(175, 390, '１', 13.48, 5.5),
        word(205, 390, '４', 13.48, 5.5),
      ],
    };
    const key = parseAnswerKeyPages([page]);
    expect(key.written).toEqual([
      { mondai: 1, label: '1', answer: 3 },
      { mondai: 1, label: '2', answer: 1 },
    ]);
    expect(key.listening.map((row) => `${row.label}=${row.answer}`)).toEqual([
      '1=2',
      '2=2',
      '3(1)=1',
      '3(2)=4',
    ]);
    const unanswered = clone(page);
    unanswered.words = unanswered.words.filter((entry) => !(entry.x0 === 150 && entry.y0 === 121));
    expect(() => parseAnswerKeyPages([unanswered])).toThrow(/without answers/u);
  });

  it('marks printed underlines, keeps answer slots and places ★ from the page image', () => {
    const scale = 2;
    const width = 1190,
      height = 1684;
    const pixels = new Uint8Array(width * height).fill(255);
    const rule = (x0, x1, y) => {
      for (let x = Math.round(x0 * scale); x < Math.round(x1 * scale); x++)
        pixels[Math.round(y * scale) * width + x] = 0;
    };
    // Line 1: 「駅前の銀行」 with 銀行 underlined. Line 2: text, then two slots, the second with ★.
    const line1 = word(100, 100, '駅前の銀行');
    rule(100 + 3 * 11.31, 100 + 5 * 11.31, 110.95);
    const lead = word(100, 140, '猫は'),
      star = word(220, 140, '★'),
      tail = word(300, 140, '並べた。');
    rule(140, 180, 150.95);
    rule(200, 250, 150.95);
    const { lines } = pageLines(
      { page: 1, words: [line1, lead, star, tail] },
      { width, height, pixels, scale },
    );
    const [first, second] = lines.map((line) => lineText(line));
    expect(first).toBe(`駅前の${PAPER_MARKS.underlineOpen}銀行${PAPER_MARKS.underlineClose}`);
    expect(second).toBe('猫は　＿＿＿　＿★＿　並べた。');
  });

  it('splits a script at its 問題 headings and finds each item anchor', () => {
    const slices = splitScriptText(
      '表紙\n問題1\n例\n1番\nＦ：はい。\n2番\nＭ：いいえ。\n問題 2\n1番\nＦ：どうぞ。\n',
    );
    expect([...slices.keys()]).toEqual([1, 2]);
    expect(scriptItemAnchors(slices.get(1))).toEqual([1, 2]);
    expect(scriptItemAnchors(slices.get(2))).toEqual([1]);
  });
});
