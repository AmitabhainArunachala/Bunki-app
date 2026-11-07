#!/usr/bin/env node
/* The one extractor for the kanji unit manifest (L6.0 draft; MF1 freeze reads through this same module).
 * Returns the parsed object of the single fenced block whose info string is exactly
 * `json kanji-unit-manifest`, its canonical JSON (keys sorted recursively, UTF-8, no
 * whitespace) and that text's sha256. Zero blocks, two or more blocks, or a block that is
 * not valid JSON throw ExtractError; the CLI exits 2 in those cases.
 *
 *   node extract-manifest.mjs <markdown file> [--hash | --canonical | --summary]
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const INFO_STRING = 'json kanji-unit-manifest';

export class ExtractError extends Error {
  constructor(message, code) { super(message); this.name = 'ExtractError'; this.code = code; }
}

/** Every fenced code block in `text` (CommonMark fences: 3+ backticks or tildes, closer of the same kind and at least the opener's length). */
export function fencedBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let open = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!open) {
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (m && !(m[1][0] === '`' && m[2].includes('`'))) open = { fence: m[1], info: m[2].trim(), start: i, body: [] };
      continue;
    }
    const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
    if (close && close[1][0] === open.fence[0] && close[1].length >= open.fence.length) {
      blocks.push({ info: open.info, start: open.start, end: i, content: open.body.join('\n') });
      open = null;
    } else open.body.push(line);
  }
  if (open) blocks.push({ info: open.info, start: open.start, end: lines.length, content: open.body.join('\n'), unterminated: true });
  return blocks;
}

/** Canonical JSON: object keys sorted by UTF-16 code unit order at every depth, arrays in order, no whitespace. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new ExtractError(`non-finite number ${value} cannot be canonical JSON`, 'canonical');
    if (value === undefined) throw new ExtractError('undefined cannot be canonical JSON', 'canonical');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalJson(v === undefined ? null : v)).join(',') + ']';
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

export const sha256Hex = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

/** The manifest object of `markdown`, or an ExtractError. */
export function extractManifest(markdown) {
  const matching = fencedBlocks(markdown).filter((b) => b.info === INFO_STRING);
  if (matching.length !== 1) {
    throw new ExtractError(`expected exactly one fenced block with info string '${INFO_STRING}', found ${matching.length}`, matching.length === 0 ? 'no-block' : 'many-blocks');
  }
  const [block] = matching;
  if (block.unterminated) throw new ExtractError('the manifest block has no closing fence', 'no-block');
  let value;
  try { value = JSON.parse(block.content); } catch (error) { throw new ExtractError(`the manifest block is not valid JSON: ${error.message}`, 'invalid-json'); }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ExtractError('the manifest block must be a JSON object', 'invalid-json');
  const canonical = canonicalJson(value);
  return { value, raw: block.content, canonical, sha256: sha256Hex(canonical), canonical_bytes: Buffer.byteLength(canonical, 'utf8'), line: block.start + 1 };
}

export function extractManifestFile(path) { return extractManifest(readFileSync(path, 'utf8')); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const mode = args.find((a) => a.startsWith('--')) || '--canonical';
  if (!file) { process.stderr.write('usage: extract-manifest.mjs <markdown file> [--hash | --canonical | --summary]\n'); process.exit(2); }
  try {
    const result = extractManifestFile(resolve(file));
    if (mode === '--hash') process.stdout.write(result.sha256 + '\n');
    else if (mode === '--summary') process.stdout.write(JSON.stringify({ version: result.value.version, draft_date: result.value.draft_date, units: Array.isArray(result.value.units) ? result.value.units.length : null, sha256: result.sha256, canonical_bytes: result.canonical_bytes, block_line: result.line }) + '\n');
    else process.stdout.write(result.canonical + '\n');
  } catch (error) {
    process.stderr.write(`extract-manifest: ${error.message}\n`);
    process.exit(2);
  }
}
