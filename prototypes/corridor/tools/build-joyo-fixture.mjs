/**
 * The official 常用漢字表 (内閣告示第2号, 2010-11-30) as a test fixture: every character with the readings
 * the table gives it, parsed from the Agency for Cultural Affairs' 音訓索引 page. It is the yardstick of
 * the kanji-trust invariant (test-kanji-trust.mjs) and nothing else — the app never reads it.
 * A government notice is outside copyright (Japan Copyright Act, art. 13).
 *
 * Build:  node prototypes/corridor/tools/build-joyo-fixture.mjs --html <downloaded page> \
 *           --fetched <ISO time> --last-modified "<HTTP Last-Modified>"
 * Check:  node prototypes/corridor/tools/build-joyo-fixture.mjs --check [--html <downloaded page>]
 *         (with --html the fixture must be byte-identical to a rebuild; without, its shape and counts)
 * The page is Shift_JIS. Katakana readings are 音, hiragana 訓 as printed (the table marks no okurigana);
 * a reading printed after a full-width space is one the table sets one character in (一字下げ: 特別なものか、
 * 又は用法のごく狭いもの) and is listed again under `indented`.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const FIXTURE = resolve(ROOT, 'tools/fixtures/reference/joyo-2010.json');
export const URL = 'https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/kanji/joyokanjisakuin/index.html';
const KANA = /^[ぁ-ゖァ-ヺー]+$/u;

const entity = (text) => text
  .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/gu, (_, dec) => String.fromCodePoint(Number(dec)))
  .replace(/&nbsp;/gu, ' ');

export function parseJoyoPage(bytes) {
  const page = new TextDecoder('shift_jis', { fatal: true }).decode(bytes);
  const rows = [];
  for (const [, glyphCell, readingCell] of page.matchAll(/<tr><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>[\s\S]*?<\/td><td>[\s\S]*?<\/td><\/tr>/gu)) {
    const glyph = entity(glyphCell).match(/<font size="7">([^<]+)<\/font>/u)?.[1];
    assert(glyph && [...glyph].length === 1, `one character per row: ${glyphCell}`);
    const readings = [];
    const indented = [];
    for (const piece of entity(readingCell).split(/<br\s*\/?>/u)) {
      const raw = piece.replace(/<[^>]+>/gu, '');
      const reading = raw.replace(/[\s　]/gu, '');
      if (!reading) continue;
      assert(KANA.test(reading), `${glyph}: unexpected reading ${JSON.stringify(raw)}`);
      readings.push(reading);
      if (/^　\S/u.test(raw)) indented.push(reading);
    }
    assert(readings.length, `${glyph} has readings`);
    rows.push([glyph, readings, indented]);
  }
  return rows;
}

export function fixtureFrom(bytes, { fetchedAt, lastModified }) {
  const rows = parseJoyoPage(bytes);
  const fixture = {
    schemaVersion: 1,
    name: '常用漢字表 — 音訓 by character',
    notice: '内閣告示第2号（平成22年11月30日）',
    url: URL,
    fetchedAt,
    lastModified,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    rights: 'A government notice, outside copyright under the Japan Copyright Act, art. 13. A test yardstick only: the app does not read this file.',
    layout: ['glyph', 'readings', 'indentedReadings'],
    readingForm: 'Katakana = 音, hiragana = 訓, as printed; the table marks no okurigana in its reading column.',
    counts: {
      characters: rows.length,
      readings: rows.reduce((sum, row) => sum + row[1].length, 0),
      indentedReadings: rows.reduce((sum, row) => sum + row[2].length, 0),
    },
    rows,
  };
  validate(fixture);
  return fixture;
}

export function validate(fixture) {
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.url, URL);
  assert.equal(fixture.rows.length, 2136, 'the 2010 table has 2,136 characters');
  assert.equal(new Set(fixture.rows.map((row) => row[0])).size, 2136, 'each character once');
  assert.equal(fixture.counts.characters, 2136);
  assert.equal(fixture.counts.readings, 4388, 'the 2010 table has 4,388 readings');
  assert.equal(fixture.rows.reduce((sum, row) => sum + row[1].length, 0), 4388);
  for (const [glyph, readings, indented] of fixture.rows) {
    assert([...glyph].length === 1 && readings.length && readings.every((reading) => KANA.test(reading)), glyph);
    assert(indented.every((reading) => readings.includes(reading)), glyph);
  }
  return fixture;
}

/** Readable and diffable: the header pretty-printed, one row per line. */
const serialize = (fixture) => {
  const { rows, ...head } = fixture;
  const top = JSON.stringify(head, null, 2).replace(/\n\}$/u, '');
  return `${top},\n  "rows": [\n${rows.map((row) => `    ${JSON.stringify(row)}`).join(',\n')}\n  ]\n}\n`;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (flag) => {
    const at = process.argv.indexOf(flag);
    return at >= 0 ? process.argv[at + 1] : undefined;
  };
  const html = arg('--html');
  if (process.argv.includes('--check')) {
    const committed = readFileSync(FIXTURE, 'utf8');
    const fixture = validate(JSON.parse(committed));
    if (html) {
      const bytes = readFileSync(html);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256, 'the page differs from the one the fixture records');
      assert.equal(serialize(fixtureFrom(bytes, fixture)), committed, 'fixture is stale against its page');
    }
    console.log(`Jōyō fixture verified: ${fixture.counts.characters} characters, ${fixture.counts.readings} readings${html ? ', byte parity with the recorded page' : ''}.`);
  } else {
    assert(html && arg('--fetched') && arg('--last-modified'), 'Build needs --html, --fetched and --last-modified');
    const fixture = fixtureFrom(readFileSync(html), { fetchedAt: arg('--fetched'), lastModified: arg('--last-modified') });
    writeFileSync(FIXTURE, serialize(fixture));
    console.log(`Wrote ${FIXTURE}: ${fixture.counts.characters} characters, ${fixture.counts.readings} readings (${fixture.counts.indentedReadings} indented).`);
  }
}
