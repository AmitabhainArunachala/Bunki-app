/** Reads an official JLPT workbook PDF (2018 公式問題集 layout) on this Mac and drafts a
 * question mapping from its text layer. The page image is read only to find printed
 * underlines and answer slots. Nothing here uploads, and the output is a draft: every
 * item is checked against its printed page before anyone relies on it. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const MAX_BUFFER = 256 * 1024 * 1024;

/** Private-use marks for the few printed features plain text loses. The room renders them;
 * any other text shows them as nothing, so they never change what a sentence says. */
export const PAPER_MARKS = Object.freeze({
  underlineOpen: '\uE000',
  underlineClose: '\uE001',
  rubyOpen: '\uE002',
  rubySplit: '\uE003',
  rubyClose: '\uE004',
  boxOpen: '\uE005',
  boxClose: '\uE006',
});
export const PAPER_MARK_PATTERN = /[\uE000-\uE006]/gu;
const M = PAPER_MARKS;
export const SLOT = '＿＿＿';
const FULL_DIGITS = '０１２３４５６７８９';
export const fromFullDigits = (text) =>
  Number(text.replace(/[０-９]/gu, (digit) => String(FULL_DIGITS.indexOf(digit))));

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
export function parseBboxHtml(html) {
  const pages = [];
  const pagePattern = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/gu;
  const wordPattern =
    /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/gu;
  for (const [, width, height, body] of html.matchAll(pagePattern)) {
    const words = [];
    for (const [, x0, y0, x1, y1, text] of body.matchAll(wordPattern)) {
      words.push({
        x0: Number(x0),
        y0: Number(y0),
        x1: Number(x1),
        y1: Number(y1),
        text: text.replace(/&(?:amp|lt|gt|quot|apos);/gu, (entity) => ENTITIES[entity]),
      });
    }
    pages.push({ page: pages.length + 1, width: Number(width), height: Number(height), words });
  }
  return pages;
}

export async function readPdfWords(file) {
  const { stdout } = await run('pdftotext', ['-bbox', '-enc', 'UTF-8', file, '-'], {
    maxBuffer: MAX_BUFFER,
    timeout: 120_000,
  });
  return parseBboxHtml(stdout);
}

export function parsePgm(buffer) {
  let offset = 0;
  const token = () => {
    while (offset < buffer.length) {
      const byte = buffer[offset];
      if (byte === 0x23) while (offset < buffer.length && buffer[offset] !== 0x0a) offset += 1;
      else if (byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09) offset += 1;
      else break;
    }
    const start = offset;
    while (offset < buffer.length && ![0x20, 0x0a, 0x0d, 0x09].includes(buffer[offset])) offset += 1;
    return buffer.subarray(start, offset).toString('ascii');
  };
  if (token() !== 'P5') throw new Error('Expected a binary grey PGM page image');
  const width = Number(token()),
    height = Number(token()),
    maxval = Number(token());
  offset += 1;
  if (!Number.isInteger(width) || !Number.isInteger(height) || maxval !== 255)
    throw new Error('Unsupported page image');
  const pixels = buffer.subarray(offset, offset + width * height);
  if (pixels.length !== width * height) throw new Error('Truncated page image');
  return { width, height, pixels };
}

export async function renderPageGray(file, page, dpi = 144) {
  const { stdout } = await run(
    'pdftoppm',
    ['-gray', '-r', String(dpi), '-f', String(page), '-l', String(page), file],
    { encoding: 'buffer', maxBuffer: MAX_BUFFER, timeout: 120_000 },
  );
  return { ...parsePgm(stdout), scale: dpi / 72 };
}

/** Thin dark rules in a band, in PDF points. Rows of one stroke merge into one rule. */
export function horizontalRules(image, { y0, y1, x0 = 40, x1 = 552, minLength = 8, dark = 150 }) {
  const { width, height, pixels, scale } = image;
  const found = [];
  for (let row = Math.max(0, Math.floor(y0 * scale)); row <= Math.min(height - 1, y1 * scale); row++) {
    let column = Math.max(0, Math.floor(x0 * scale));
    const end = Math.min(width, Math.ceil(x1 * scale));
    while (column < end) {
      if (pixels[row * width + column] < dark) {
        const start = column;
        while (column < end && pixels[row * width + column] < dark) column += 1;
        if ((column - start) / scale >= minLength) found.push({ row, x0: start / scale, x1: column / scale });
      } else column += 1;
    }
  }
  const rules = [];
  for (const run of found) {
    const same = rules.find(
      (rule) => run.row - rule.lastRow <= 2 && run.x0 < rule.x1 && run.x1 > rule.x0,
    );
    if (same) {
      same.x0 = Math.min(same.x0, run.x0);
      same.x1 = Math.max(same.x1, run.x1);
      same.lastRow = run.row;
      same.rows += 1;
    } else rules.push({ y: run.row / scale, lastRow: run.row, rows: 1, x0: run.x0, x1: run.x1 });
  }
  // A printed underline is a stroke, not the lower edge of a filled box.
  return rules.filter((rule) => rule.rows <= 4 * (scale / 2)).map(({ y, x0, x1 }) => ({ y, x0, x1 }));
}

/** Thin vertical rules to the right of a vertical-text column (縦書きの傍線). */
export function verticalRules(image, { x0, x1, y0, y1, minLength = 8, dark = 150 }) {
  const { width, height, pixels, scale } = image;
  const found = [];
  for (let column = Math.max(0, Math.floor(x0 * scale)); column <= Math.min(width - 1, x1 * scale); column++) {
    let row = Math.max(0, Math.floor(y0 * scale));
    const end = Math.min(height, Math.ceil(y1 * scale));
    while (row < end) {
      if (pixels[row * width + column] < dark) {
        const start = row;
        while (row < end && pixels[row * width + column] < dark) row += 1;
        if ((row - start) / scale >= minLength) found.push({ column, y0: start / scale, y1: row / scale });
      } else row += 1;
    }
  }
  const rules = [];
  for (const run of found) {
    const same = rules.find(
      (rule) => run.column - rule.lastColumn <= 2 && run.y0 < rule.y1 && run.y1 > rule.y0,
    );
    if (same) {
      same.y0 = Math.min(same.y0, run.y0);
      same.y1 = Math.max(same.y1, run.y1);
      same.lastColumn = run.column;
      same.columns += 1;
    } else rules.push({ x: run.column / scale, lastColumn: run.column, columns: 1, y0: run.y0, y1: run.y1 });
  }
  return rules
    .filter((rule) => rule.columns <= 4 * (scale / 2))
    .map(({ x, y0, y1 }) => ({ x, y0, y1 }));
}

const KANA_ONLY = /^[\u3040-\u30FFー]+$/u;
const JAPANESE = /[\u3040-\u30FF\u3400-\u9FFF]/u;
const PICTURE_CODE = /^[!-&]$/u;
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'];
const ASCII_ONLY = /^[\x21-\x7e]+$/u;
const KANJI = /[\u3400-\u9FFF々〆]/u;
const height = (word) => word.y1 - word.y0;
/** Glyphs set in the booklet's picture font have no Unicode text: numbers in boxes and circles. */
export function wordRole(word) {
  const h = height(word);
  if (ASCII_ONLY.test(word.text) && (h > 11.2 || h < 8)) {
    if (h >= 11.8 && h <= 12.2) return 'marker';
    if (h >= 14 && h <= 15.5) return 'circle';
    if (h >= 18 && h <= 19.5) return 'option-glyph';
    if (h >= 19.5) return 'heading-glyph';
    return 'glyph';
  }
  if (h < 7.5 && KANA_ONLY.test(word.text)) return 'ruby';
  if (h < 9.8) return 'small';
  return 'text';
}

/** Characters of a word with their printed boxes. Japanese type in these booklets is set solid. */
function glyphBoxes(word) {
  const chars = [...word.text];
  const step = (word.x1 - word.x0) / Math.max(1, chars.length);
  return chars.map((char, index) => ({
    char,
    x0: word.x0 + index * step,
    x1: word.x0 + (index + 1) * step,
    y0: word.y0,
    y1: word.y1,
  }));
}

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Groups one page's words into printed lines, attaches ruby, and finds underlines and slots. */
export function pageLines(page, image = null) {
  const kept = page.words.filter(
    (word) => word.y0 > 32 && word.y1 < 786 && word.x0 > 30 && word.x0 < 560,
  );
  const horizontal = [],
    vertical = [];
  // A column of single characters, each directly below the last, is vertical type.
  const singles = kept.filter((word) => [...word.text].length === 1 && wordRole(word) === 'text');
  const columnOf = new Map();
  for (const word of singles) {
    const key = Math.round(word.x0 * 2) / 2;
    columnOf.set(key, [...(columnOf.get(key) || []), word]);
  }
  const verticalWords = new Set();
  for (const words of columnOf.values()) {
    if (words.length < 6) continue;
    words.sort((a, b) => a.y0 - b.y0);
    const stacked = words.filter(
      (word, index) =>
        (index > 0 && word.y0 - words[index - 1].y0 < height(word) * 1.6) ||
        (index + 1 < words.length && words[index + 1].y0 - word.y0 < height(word) * 1.6),
    );
    if (stacked.length >= 6) for (const word of stacked) verticalWords.add(word);
  }
  for (const word of kept) (verticalWords.has(word) ? vertical : horizontal).push(word);
  const smallVertical = horizontal.filter(
    (word) =>
      wordRole(word) === 'small' &&
      [...word.text].length === 1 &&
      horizontal.filter((other) => other !== word && Math.abs(other.x0 - word.x0) < 0.6 && wordRole(other) === 'small' && [...other.text].length === 1).length >= 4,
  );
  for (const word of smallVertical) {
    horizontal.splice(horizontal.indexOf(word), 1);
    vertical.push(word);
  }
  const lines = [];
  const ruby = horizontal.filter((word) => wordRole(word) === 'ruby');
  const body = horizontal
    .filter((word) => wordRole(word) !== 'ruby')
    .sort((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
  for (const word of body) {
    const role = wordRole(word);
    const center = (word.y0 + word.y1) / 2;
    let line = lines.find(
      (row) =>
        Math.abs(row.y1 - word.y1) < 2.2 ||
        (role !== 'text' && center > row.y0 - 1 && center < row.y1 + 1) ||
        (role === 'small' && /注|[０-９]/u.test(word.text) && word.y0 > row.y0 && word.y0 < row.y1 + 1 &&
          row.words.some((other) => other.x1 <= word.x0 + 1)),
    );
    if (!line) {
      line = { page: page.page, y0: word.y0, y1: word.y1, words: [] };
      lines.push(line);
    }
    line.words.push(word);
    if (role === 'text') {
      line.y0 = Math.min(line.y0, word.y0);
      line.y1 = line.words.some((other) => wordRole(other) === 'text' && other !== word)
        ? Math.max(line.y1, word.y1)
        : word.y1;
    }
  }
  for (const line of lines) {
    line.words.sort((a, b) => a.x0 - b.x0);
    const text = line.words.filter((word) => wordRole(word) === 'text');
    line.x0 = Math.min(...line.words.map((word) => word.x0));
    line.x1 = Math.max(...line.words.map((word) => word.x1));
    line.charWidth = text.length
      ? text.reduce((sum, word) => sum + (word.x1 - word.x0), 0) /
        text.reduce((sum, word) => sum + [...word.text].length, 0)
      : 11.31;
    line.ruby = [];
    line.rules = [];
  }
  for (const word of ruby) {
    const below = lines
      .filter((line) => line.y0 >= word.y1 - 2.5 && line.y0 - word.y1 < 6)
      .sort((a, b) => a.y0 - b.y0)[0];
    if (below) below.ruby.push(word);
  }
  if (image) {
    for (const line of lines) {
      if (!line.words.some((word) => wordRole(word) === 'text')) continue;
      line.rules = horizontalRules(image, {
        y0: line.y1 - 0.75,
        y1: line.y1 + 2.5,
        minLength: Math.max(6, line.charWidth * 0.6),
      });
    }
  }
  lines.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const columns = verticalColumns(vertical, page.page, image);
  return { lines, columns };
}

function verticalColumns(words, page, image) {
  if (!words.length) return [];
  const byColumn = new Map();
  for (const word of words) {
    const key = Math.round(word.x0 * 2) / 2;
    byColumn.set(key, [...(byColumn.get(key) || []), word]);
  }
  const columns = [...byColumn.entries()]
    .map(([x, column]) => {
      column.sort((a, b) => a.y0 - b.y0);
      return {
        page,
        x0: x,
        x1: Math.max(...column.map((word) => word.x1)),
        y0: column[0].y0,
        y1: column.at(-1).y1,
        words: column,
        small: column.every((word) => wordRole(word) === 'small'),
      };
    })
    .sort((a, b) => b.x0 - a.x0);
  if (image) {
    for (const column of columns) {
      column.rules = verticalRules(image, {
        x0: column.x1 + 0.2,
        x1: column.x1 + 3,
        y0: column.y0 - 2,
        y1: column.y1 + 2,
        minLength: 6,
      });
    }
  }
  return columns;
}

function markRuns(chars) {
  let text = '',
    open = false;
  for (const entry of chars) {
    if (entry.underline && !open) {
      text += M.underlineOpen;
      open = true;
    }
    if (!entry.underline && open) {
      text += M.underlineClose;
      open = false;
    }
    text += entry.text;
  }
  if (open) text += M.underlineClose;
  return text;
}

/** One printed line as text, with its underlines, ruby, blanks and answer slots marked. */
export function lineText(line, { markers = [] } = {}) {
  const width = line.charWidth;
  const chars = [];
  let markerIndex = 0;
  for (const word of line.words) {
    const role = wordRole(word);
    if (role === 'marker') {
      const number = markers[markerIndex++];
      chars.push({
        text: number === undefined ? '' : `${M.boxOpen}${number}${M.boxClose}`,
        x0: word.x0,
        x1: word.x1,
        skip: true,
      });
      continue;
    }
    if (role === 'circle' || role === 'glyph') {
      const framed = line.words.some(
        (other) =>
          other !== word && /^[０-９]$/u.test(other.text) && overlap(word.x0, word.x1, other.x0, other.x1) > 2,
      );
      const text = framed ? '' : PICTURE_CODE.test(word.text) ? CIRCLED[word.text.charCodeAt(0) - 0x21] : '・';
      chars.push({ text, x0: word.x0, x1: word.x1, skip: !text });
      continue;
    }
    if (role === 'option-glyph' || role === 'heading-glyph') {
      chars.push({ text: '', x0: word.x0, x1: word.x1, skip: true });
      continue;
    }
    for (const box of glyphBoxes(word)) {
      if (PICTURE_CODE.test(box.char) && (JAPANESE.test(word.text) || height(word) > 12)) {
        // A circle drawn around a separately printed digit, or a circled number.
        const framed = line.words.some(
          (other) =>
            other !== word && /^[０-９]$/u.test(other.text) && overlap(box.x0, box.x1, other.x0, other.x1) > 2,
        );
        chars.push({ text: framed ? '' : CIRCLED[box.char.charCodeAt(0) - 0x21], x0: box.x0, x1: box.x1 });
        continue;
      }
      const framedDigit =
        /^[０-９]$/u.test(word.text) &&
        line.words.some(
          (other) =>
            other !== word &&
            (wordRole(other) === 'circle' || [...other.text].some((char) => PICTURE_CODE.test(char))) &&
            overlap(word.x0, word.x1, other.x0, other.x1) > 2,
        );
      chars.push({ text: framedDigit ? `（${box.char}）` : box.char, x0: box.x0, x1: box.x1 });
    }
  }
  const rules = line.rules || [];
  for (const entry of chars) {
    if (entry.skip || entry.text === '★') continue;
    const covered = rules.some((rule) => overlap(entry.x0, entry.x1, rule.x0, rule.x1) >= (entry.x1 - entry.x0) * 0.5);
    entry.underline = covered;
  }
  // Rules under no printed character are answer slots.
  const slots = rules
    .filter(
      (rule) =>
        !chars.some(
          (entry) => !entry.skip && entry.text !== '★' && overlap(entry.x0, entry.x1, rule.x0, rule.x1) > 2,
        ),
    )
    .map((rule) => ({ ...rule, slot: true }));
  for (const entry of chars) {
    if (entry.text !== '★') continue;
    const slot = slots.find((rule) => overlap(entry.x0, entry.x1, rule.x0 - 4, rule.x1 + 4) > 0);
    if (slot) {
      slot.star = true;
      entry.inSlot = true;
    }
  }
  for (const slot of slots) chars.push({ text: slot.star ? '＿★＿' : SLOT, x0: slot.x0, x1: slot.x1, slot: true });
  const placed = chars.filter((entry) => !entry.inSlot).sort((a, b) => a.x0 - b.x0);
  // Ruby: kana above kanji. The base is the run of kanji under the reading.
  for (const word of line.ruby || []) {
    const under = placed.filter(
      (entry) => !entry.skip && !entry.slot && KANJI.test(entry.text) && overlap(entry.x0, entry.x1, word.x0 - width * 0.3, word.x1 + width * 0.3) > (entry.x1 - entry.x0) * 0.3,
    );
    if (!under.length) continue;
    under[0].rubyOpen = true;
    under.at(-1).rubyClose = word.text;
  }
  const out = [];
  let previous = null;
  for (const entry of placed) {
    if (previous) {
      const gap = entry.x0 - previous.x1;
      if (gap > width * 0.45 && !entry.slot && !previous.slot) out.push({ text: '　'.repeat(Math.max(1, Math.round(gap / width))), underline: false });
      else if (entry.slot || previous.slot) out.push({ text: '　', underline: false });
    }
    let text = entry.text;
    if (entry.rubyOpen) text = M.rubyOpen + text;
    if (entry.rubyClose !== undefined) text = `${text}${M.rubySplit}${entry.rubyClose}${M.rubyClose}`;
    out.push({ text, underline: !!entry.underline });
    previous = entry;
  }
  return markRuns(out).replace(/^　+|　+$/gu, '');
}

export function columnText(column) {
  const chars = column.words.flatMap((word) => {
    const boxes = [...word.text];
    const step = (word.y1 - word.y0) / Math.max(1, boxes.length);
    return boxes.map((char, index) => ({ char, y0: word.y0 + index * step, y1: word.y0 + (index + 1) * step }));
  });
  const out = chars.map((entry) => ({
    text: entry.char,
    underline: (column.rules || []).some((rule) => overlap(entry.y0, entry.y1, rule.y0, rule.y1) >= (entry.y1 - entry.y0) * 0.5),
  }));
  return markRuns(out)
    .replace(/[\uFE10-\uFE19\uFE30-\uFE48]/gu, (char) => char.normalize('NFKC'));
}

/** Joins printed lines into paragraphs: an indented line or a short previous line starts one. */
export function joinParagraphs(input, { left, right, marker } = {}) {
  const lines = input
    .filter((line) => line.words.length)
    .map((line) => ({
      ...line,
      x0: Math.min(...line.words.map((word) => word.x0)),
      x1: Math.max(...line.words.map((word) => word.x1)),
    }));
  if (!lines.length) return '';
  const margin = left ?? Math.min(...lines.map((line) => line.x0));
  const edge = right ?? Math.max(...lines.map((line) => line.x1));
  let text = '';
  lines.forEach((line, index) => {
    const value = marker ? marker(line) : lineText(line);
    if (index > 0) {
      const previous = lines[index - 1];
      const width = line.charWidth || 11.31;
      const indented = line.x0 > margin + width * 0.6;
      const shortBefore = previous.x1 < edge - width * 1.5;
      // A new speaker's turn: 「 within the first few characters after a closing 」.
      const turn =
        /」$/u.test(lineText(previous).replace(PAPER_MARK_PATTERN, '')) &&
        /^[^「」。、]{1,8}「|^[ＡＢＱ][:：「]/u.test(value.replace(PAPER_MARK_PATTERN, ''));
      const smallChange = line.words.every((word) => wordRole(word) === 'small') !== previous.words.every((word) => wordRole(word) === 'small');
      text += indented || shortBefore || smallChange || turn ? '\n' : '';
    }
    text += value;
  });
  return text;
}

const isMondaiHeader = (line) => {
  const first = line.words.find((word) => wordRole(word) === 'text');
  return !!first && /^問題[０-９]*$/u.test(first.text) && height(first) > 12;
};
export function mondaiNumber(line) {
  const words = line.words.filter((word) => wordRole(word) === 'text' && height(word) > 12);
  const joined = words.map((word) => word.text).join('');
  const match = /^問題([０-９]+)/u.exec(joined);
  return match ? fromFullDigits(match[1]) : null;
}
const OPTION_DIGIT = /^[１２３４]$/u;
function optionWords(line) {
  const words = line.words;
  const first = words[0];
  if (!first || !OPTION_DIGIT.test(first.text) || wordRole(first) !== 'text') return null;
  const starts = words.filter(
    (word, index) =>
      OPTION_DIGIT.test(word.text) &&
      wordRole(word) === 'text' &&
      (index === words.length - 1 || words[index + 1].x0 - word.x1 > (line.charWidth || 11.31) * 0.6),
  );
  return starts;
}
const isOptionLine = (line) => !!optionWords(line);

/** Splits an option line into its numbered choices; continuation lines extend the last one. */
function readOptions(lines) {
  const options = new Map();
  let last = null;
  for (const line of lines) {
    const starts = optionWords(line);
    if (!starts) {
      if (last !== null) options.set(last, `${options.get(last)}${lineText(line)}`);
      continue;
    }
    starts.forEach((start, index) => {
      const next = starts[index + 1];
      const words = line.words.filter((word) => word.x0 > start.x0 && (!next || word.x0 < next.x0));
      const text = lineText({ ...line, words, ruby: line.ruby.filter((word) => word.x0 >= start.x1 - 2 && (!next || word.x1 <= next.x0 + 2)) });
      const number = fromFullDigits(start.text);
      if (options.has(number)) throw new Error(`Option ${number} printed twice`);
      options.set(number, text);
      last = number;
    });
  }
  return options;
}

/** Lines of the whole booklet in page order, each tagged with its 大問 number. */
export async function readBooklet(file, { pageImages = true, name = null } = {}) {
  const booklet = name ?? file.split('/').at(-1).replace(/\.pdf$/iu, '');
  const pages = await readPdfWords(file);
  const lines = [],
    columns = [];
  for (const page of pages) {
    if (!page.words.length) continue;
    const image = pageImages ? await renderPageGray(file, page.page) : null;
    const result = pageLines(page, image);
    for (const line of result.lines) line.sheet = `${booklet}-${page.page}`;
    for (const column of result.columns) column.sheet = `${booklet}-${page.page}`;
    lines.push(...result.lines);
    columns.push(...result.columns);
  }
  let mondai = null;
  for (const line of lines) {
    if (isMondaiHeader(line)) mondai = mondaiNumber(line);
    line.mondai = mondai;
    line.header = isMondaiHeader(line);
  }
  for (const column of columns) {
    const before = lines.filter((line) => line.page < column.page || (line.page === column.page && line.y0 <= column.y0));
    column.mondai = before.at(-1)?.mondai ?? null;
  }
  return { file, booklet, pages: pages.length, lines, columns };
}

/** The lines printed with a 問題 header before its first question or example. */
function instructionLines(lines) {
  const header = lines.findIndex((line) => line.header);
  if (header < 0) return [];
  const out = [];
  for (const line of lines.slice(header)) {
    const words = line.header
      ? line.words.filter((word) => !(height(word) > 12 && /^問題|^[０-９]+$/u.test(word.text)))
      : line.words;
    if (!line.header) {
      if (!words.length || isOptionLine(line) || words.some((word) => wordRole(word) === 'marker' && word.x0 < 100))
        break;
      if (out.length && line.y0 - out.at(-1).y1 > 14) break;
      if (!out.length && line.y0 - lines[header].y1 > 14) break;
      if (
        words
          .filter((word) => wordRole(word) === 'text')
          .some((word) => height(word) < 10.93 && !/^[０-９★]$/u.test(word.text))
      )
        break;
    }
    out.push({ ...line, words, source: line });
  }
  return out;
}
function instructionOf(lines) {
  return joinParagraphs(instructionLines(lines));
}

function itemStarts(lines) {
  return lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.words[0] && wordRole(line.words[0]) === 'marker' && line.words[0].x0 < 100);
}

/** Written-paper 大問 kinds of the 2018 公式問題集 N1 booklet, in paper order. */
export const N1_WRITTEN_MONDAI = Object.freeze([
  { mondai: 1, skill: 'vocabulary', task: 'kanji-reading', layout: 'question' },
  { mondai: 2, skill: 'vocabulary', task: 'contextual-definition', layout: 'question' },
  { mondai: 3, skill: 'vocabulary', task: 'paraphrase', layout: 'question' },
  { mondai: 4, skill: 'vocabulary', task: 'usage', layout: 'question' },
  { mondai: 5, skill: 'grammar', task: 'grammar-form', layout: 'question' },
  { mondai: 6, skill: 'grammar', task: 'sentence-composition', layout: 'question' },
  { mondai: 7, skill: 'grammar', task: 'text-grammar', layout: 'text-grammar' },
  { mondai: 8, skill: 'reading', task: 'short-passage', layout: 'passages' },
  { mondai: 9, skill: 'reading', task: 'mid-passage', layout: 'passages' },
  { mondai: 10, skill: 'reading', task: 'long-passage', layout: 'passages' },
  { mondai: 11, skill: 'reading', task: 'integrated-comprehension', layout: 'passages' },
  { mondai: 12, skill: 'reading', task: 'thematic-comprehension', layout: 'passages' },
  { mondai: 13, skill: 'reading', task: 'information-retrieval', layout: 'material-after' },
]);

/** Drafts every written item of a 大問 region. `firstNumber` is the paper's first item number. */
export function splitWrittenMondai(spec, lines, columns, firstNumber) {
  const instruction = instructionOf(lines);
  const printed = new Set(instructionLines(lines).map((line) => line.source));
  const content = lines.filter((line) => !printed.has(line) && !line.header);
  const starts = itemStarts(content).filter(({ line }) =>
    spec.layout === 'text-grammar' ? line.words.filter((word) => wordRole(word) !== 'ruby').length === 1 : true,
  );
  const items = [],
    passages = [];
  const passageText = (passageLines, passageColumns = []) => {
    const parts = [];
    let paragraphs = [];
    const flush = () => {
      if (paragraphs.length) parts.push(joinParagraphs(paragraphs));
      paragraphs = [];
    };
    let inlineMarker = 0;
    for (const line of passageLines) {
      const labelIndex = line.words.findIndex((word) => wordRole(word) === 'circle');
      if (labelIndex === 0 && line.words.length <= 2 && /^[０-９]$/u.test(line.words[1]?.text || '')) {
        flush();
        continue;
      }
      paragraphs.push(line);
    }
    flush();
    if (spec.layout === 'text-grammar') {
      // Numbered blanks in the passage are the paper's own item numbers, in order.
      const numbers = starts.map((_, index) => firstNumber + index);
      const text = joinParagraphs(passageLines, {
        marker: (line) => {
          const count = line.words.filter((word) => wordRole(word) === 'marker').length;
          const value = lineText(line, { markers: numbers.slice(inlineMarker, inlineMarker + count) });
          inlineMarker += count;
          return value;
        },
      });
      return { text, inlineMarkers: inlineMarker };
    }
    const vertical = passageColumns.length
      ? passageColumns
          .filter((column) => !column.small)
          .map((column) => columnText(column))
          .join('')
      : '';
    const citation = passageColumns.filter((column) => column.small).map((column) => columnText(column)).join('');
    return {
      text: [vertical, parts.join('\n'), citation].filter(Boolean).join('\n'),
      inlineMarkers: 0,
    };
  };
  const firstStart = starts[0]?.index ?? content.length;
  // 問題6 prints a worked example before its questions; it is not a question.
  const lead = spec.task === 'sentence-composition' ? [] : content.slice(0, firstStart);
  const passageLabels = (region) =>
    region
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => wordRole(line.words[0] || {}) === 'circle' && /^[０-９]$/u.test(line.words[1]?.text || ''));
  const itemBlocks = starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].index : content.length;
    return { start: start.index, lines: content.slice(start.index, end) };
  });
  // Trailing non-option lines after an item's options belong to the next passage.
  const blocks = itemBlocks.map((block) => {
    const optionIndex = block.lines.findIndex((line, index) => index > 0 && isOptionLine(line));
    let lastOption = optionIndex;
    if (optionIndex >= 0) {
      for (let index = optionIndex; index < block.lines.length; index++) {
        const line = block.lines[index];
        if (isOptionLine(line)) lastOption = index;
        else if (
          index === lastOption + 1 &&
          line.page === block.lines[lastOption].page &&
          line.y0 - block.lines[lastOption].y1 < 16 &&
          line.x0 > block.lines[optionIndex].x0 + 4 &&
          !passageLabels([line]).length
        )
          lastOption = index;
        else break;
      }
    }
    return {
      promptLines: optionIndex < 0 ? block.lines : block.lines.slice(0, optionIndex),
      optionLines: optionIndex < 0 ? [] : block.lines.slice(optionIndex, lastOption + 1),
      after: optionIndex < 0 ? [] : block.lines.slice(lastOption + 1),
    };
  });
  let passageSource = lead;
  let currentPassage = null;
  const passageFor = (region, label) => {
    if (!region.length && !columns.length) return currentPassage;
    const regionColumns = columns.filter((column) => {
      if (!region.length) return false;
      const first = region[0],
        last = region.at(-1);
      const after = column.page > first.page || (column.page === first.page && column.y0 >= first.y0 - 20);
      const before = column.page < last.page || (column.page === last.page && column.y0 <= last.y1 + 400);
      return after && before && !column.used;
    });
    for (const column of regionColumns) column.used = true;
    const { text, inlineMarkers } = passageText(region, regionColumns);
    if (!text.trim()) return currentPassage;
    const pages = [...new Set([...region.map((line) => line.sheet), ...regionColumns.map((column) => column.sheet)])];
    currentPassage = {
      id: `m${spec.mondai}-p${passages.length + 1}`,
      mondai: spec.mondai,
      label,
      text,
      pages,
      inlineMarkers,
      thirdParty: spec.skill === 'reading',
    };
    passages.push(currentPassage);
    return currentPassage;
  };
  if (spec.layout === 'material-after') {
    const tail = blocks.at(-1)?.after || [];
    blocks.at(-1).after = [];
    const material = passageFor(tail, null);
    // Table borders in a notice are not underlines.
    if (material) material.text = material.text.replace(/[\uE000\uE001]/gu, '');
  }
  blocks.forEach((block, index) => {
    const number = firstNumber + index;
    let passage = null;
    if (spec.layout === 'passages' || spec.layout === 'text-grammar') {
      if (index === 0) {
        const label = passageLabels(passageSource)[0];
        passage = passageFor(passageSource, label ? fromFullDigits(label.line.words[1].text) : null);
      }
      else passage = currentPassage;
    } else if (spec.layout === 'material-after') passage = currentPassage;
    const promptLines = block.promptLines.map((line, lineIndex) =>
      lineIndex === 0 ? { ...line, words: line.words.filter((word) => wordRole(word) !== 'marker') } : line,
    );
    const prompt =
      spec.layout === 'text-grammar' ? '' : joinParagraphs(promptLines.filter((line) => line.words.length));
    const options = readOptions(block.optionLines);
    items.push({
      number,
      mondai: spec.mondai,
      skill: spec.skill,
      task: spec.task,
      prompt,
      options: [1, 2, 3, 4].map((value) => options.get(value) ?? null),
      passageId: passage?.id ?? null,
      pages: [...new Set(block.promptLines.concat(block.optionLines).map((line) => line.sheet))],
    });
    if (block.after.length && (spec.layout === 'passages' || spec.layout === 'text-grammar')) {
      const label = passageLabels(block.after)[0];
      passageSource = block.after;
      passageFor(passageSource, label ? fromFullDigits(label.line.words[1].text) : null);
    }
  });
  return { instruction, items, passages };
}

/** Drafts the written paper (V, G, R booklets) into mapping rows. */
export function splitWrittenPaper(booklets, mondaiSpecs, keyCounts) {
  const lines = booklets.flatMap((booklet) => booklet.lines);
  const columns = booklets.flatMap((booklet) => booklet.columns);
  const mondai = [],
    items = [],
    passages = [];
  let next = 1;
  for (const spec of mondaiSpecs) {
    const region = lines.filter((line) => line.mondai === spec.mondai);
    const regionColumns = columns.filter((column) => column.mondai === spec.mondai);
    if (!region.length) throw new Error(`問題${spec.mondai} was not found in the booklets`);
    const result = splitWrittenMondai(spec, region, regionColumns, next);
    const expected = keyCounts?.[spec.mondai - 1];
    mondai.push({
      mondai: spec.mondai,
      skill: spec.skill,
      task: spec.task,
      instruction: result.instruction,
      itemNumbers: result.items.map((item) => item.number),
      ...(expected === undefined ? {} : { keyCount: expected }),
    });
    items.push(...result.items);
    passages.push(...result.passages);
    next += result.items.length;
  }
  return { mondai, items, passages };
}

/** The 正答表 as a table: each answer sits under its item number. Examples (例) are dropped;
 * a sub-question (1)/(2) under a shared number becomes "3(1)", "3(2)". */
export function parseAnswerKeyPages(pages) {
  const rows = [];
  for (const page of pages) {
    const words = [...page.words].sort((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
    for (const word of words) {
      const row = rows.find((entry) => entry.page === page.page && Math.abs(entry.y1 - word.y1) < 2.5);
      if (row) row.words.push(word);
      else rows.push({ page: page.page, y1: word.y1, words: [word] });
    }
  }
  for (const row of rows) row.words.sort((a, b) => a.x0 - b.x0);
  const center = (word) => (word.x0 + word.x1) / 2;
  const plain = (text) => text.normalize('NFKC').trim();
  const result = { written: [], listening: [] };
  let section = 'written',
    block = null;
  const close = () => {
    if (!block) return;
    for (const label of block.labels)
      if (!label.answered && !label.parent && label.text !== '例') block.unanswered.push(label.text);
    if (block.unanswered.length)
      throw new Error(`問題${block.mondai} has item numbers without answers: ${block.unanswered.join(',')}`);
    block = null;
  };
  for (const row of rows) {
    const texts = row.words.map((word) => plain(word.text));
    if (/聴解/u.test(texts.join('')) && !/読解/u.test(texts.join(''))) {
      close();
      section = 'listening';
      continue;
    }
    const headerIndex = texts.findIndex((text) => text === '問題' || /^問題\d*$/u.test(text));
    if (headerIndex >= 0) {
      close();
      let rest = row.words.slice(headerIndex + 1);
      let number = /^問題(\d+)$/u.exec(texts[headerIndex])?.[1];
      if (!number) {
        number = plain(rest[0]?.text || '');
        rest = rest.slice(1);
      }
      if (!/^\d+$/u.test(number)) throw new Error('Unreadable 問題 header in the answer key');
      block = { section, mondai: Number(number), labels: [], unanswered: [] };
      for (const word of rest) block.labels.push({ text: plain(word.text), x: center(word), x0: word.x0, x1: word.x1 });
      continue;
    }
    if (!block) continue;
    const open = block.labels.filter((label) => !label.answered && !label.parent);
    const isAnswerRow =
      texts.every((text) => /^[1-4]$/u.test(text)) &&
      row.words.every((word) => open.some((label) => Math.abs(label.x - center(word)) < 7));
    if (isAnswerRow) {
      for (const word of row.words) {
        const label = open
          .filter((entry) => !entry.answered)
          .sort((a, b) => Math.abs(a.x - center(word)) - Math.abs(b.x - center(word)))[0];
        label.answered = true;
        if (label.text !== '例')
          result[block.section].push({ mondai: block.mondai, label: label.text, answer: Number(plain(word.text)) });
      }
      continue;
    }
    for (const word of row.words) {
      const text = plain(word.text);
      const sub = /^\((\d)\)$/u.exec(text);
      if (sub) {
        const parent = block.labels
          .filter((label) => !label.answered && /^\d+$/u.test(label.text) && !label.subs)
          .sort((a, b) => Math.abs(a.x - center(word)) - Math.abs(b.x - center(word)))[0];
        if (!parent) throw new Error('Unreadable sub-question in the answer key');
        parent.parent = true;
        block.labels.push({ text: `${parent.text}(${sub[1]})`, x: center(word), x0: word.x0, x1: word.x1, of: parent });
        continue;
      }
      if (/^(\d+|例)$/u.test(text)) block.labels.push({ text, x: center(word), x0: word.x0, x1: word.x1 });
    }
  }
  close();
  for (const name of ['written', 'listening']) {
    // The labels are printed item numbers; sub-question parents carry no answer of their own.
    result[name] = result[name].filter((row) => row.label !== '例');
  }
  return result;
}

export async function readAnswerKey(file) {
  return parseAnswerKeyPages(await readPdfWords(file));
}

/** Answer-position counts and per-大問 counts, the shape of official_answer_key_parse.json. */
export function keySummary(rows, mondaiCount) {
  const per = Array.from({ length: mondaiCount }, (_, index) => rows.filter((row) => row.mondai === index + 1).length);
  const positions = [1, 2, 3, 4].map((value) => rows.filter((row) => row.answer === value).length);
  return { per_mondai: per, total: rows.length, answer_pos: positions };
}

/** Listening 大問 of the 2018 N1 booklet. Only 問題1, 問題2 and 問題5 3番 print their choices. */
export const N1_LISTENING_MONDAI = Object.freeze([
  { mondai: 1, task: 'task-based-listening', printed: 'all', optionCount: 4 },
  { mondai: 2, task: 'point-listening', printed: 'all', optionCount: 4 },
  { mondai: 3, task: 'summary-listening', printed: 'none', optionCount: 4 },
  { mondai: 4, task: 'quick-response', printed: 'none', optionCount: 3 },
  { mondai: 5, task: 'integrated-listening', printed: 'sub-questions', optionCount: 4 },
]);

/** Printed choices of the listening booklet, grouped under 例, N番 and 質問N headings. */
export function splitListeningBooklet(booklet) {
  const mondai = new Map();
  let counter = 0,
    current = null,
    heading = null;
  for (const line of booklet.lines) {
    if (line.mondai === null) continue;
    if (!mondai.has(line.mondai)) {
      mondai.set(line.mondai, { mondai: line.mondai, instruction: '', groups: [] });
      counter = 0;
      heading = null;
    }
    const entry = mondai.get(line.mondai);
    if (line.header) {
      entry.instruction = joinParagraphs(instructionLines(booklet.lines.filter((row) => row.mondai === line.mondai)));
      continue;
    }
    const big = line.words.filter((word) => wordRole(word) === 'text' && height(word) >= 15);
    const bigText = big.map((word) => word.text).join('');
    if (big.length && /番/u.test(bigText)) {
      counter += (bigText.match(/番/gu) || []).length;
      heading = String(counter);
      current = null;
      continue;
    }
    if (big.length && /^例$/u.test(bigText)) {
      heading = '例';
      current = { mondai: line.mondai, label: '例', options: [], pages: [line.sheet] };
      entry.groups.push(current);
      continue;
    }
    const question = /^質問([０-９1-9])$/u.exec(bigText);
    if (question && heading) {
      current = {
        mondai: line.mondai,
        label: `${heading}(${fromFullDigits(question[1])})`,
        options: [],
        pages: [line.sheet],
      };
      entry.groups.push(current);
      continue;
    }
    if (line.words[0] && wordRole(line.words[0]) === 'option-glyph') {
      if (!current || current.label !== heading && !current.label.startsWith(`${heading}(`)) {
        current = { mondai: line.mondai, label: heading, options: [], pages: [line.sheet] };
        entry.groups.push(current);
      }
      current.options.push(lineText({ ...line, words: line.words.slice(1) }));
      if (!current.pages.includes(line.sheet)) current.pages.push(line.sheet);
    }
  }
  return [...mondai.values()];
}

/** The 聴解スクリプト split at its 問題 headings; each slice is that recording's transcript. */
export function splitScriptText(text) {
  const slices = new Map();
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\f/gu, '').trimEnd();
    const header = /^\s*問題\s*([1-9１-９])\s*$/u.exec(line);
    if (header) {
      current = fromFullDigits(header[1].normalize('NFKC').replace(/\d/gu, (digit) => FULL_DIGITS[Number(digit)]));
      slices.set(current, []);
      continue;
    }
    if (current !== null) slices.get(current).push(line.trim());
  }
  return new Map(
    [...slices.entries()].map(([mondai, lines]) => [mondai, lines.join('\n').replace(/\n{3,}/gu, '\n\n').trim()]),
  );
}

export async function readScript(file) {
  const { stdout } = await run('pdftotext', ['-enc', 'UTF-8', file, '-'], {
    maxBuffer: MAX_BUFFER,
    timeout: 120_000,
  });
  return splitScriptText(stdout);
}

/** Item anchors (1番, 2番 …) spoken in one transcript slice. */
export function scriptItemAnchors(slice) {
  return (slice.normalize('NFKC').match(/^\s*\d+\s*番/gmu) || []).map((anchor) => Number(anchor.replace(/\D/gu, '')));
}
