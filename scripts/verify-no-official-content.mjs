#!/usr/bin/env node
/** Keeps real JLPT papers out of this public repository and its builds.
 *
 * Official workbook questions and recordings may be kept for personal study only (jlpt.jp site
 * policy §1(1)); they are imported on-device and never committed. This check fails when a
 * tracked file (or a file in a given build directory):
 *   (a) is a private pack, or JSON carrying `official-private` provenance or catalog class;
 *   (b) has the SHA-256 of a downloaded official file or of a built private-pack file;
 *   (c) contains any sampled 20-character window of an official passage, prompt or transcript;
 *   (d) contains a whole official prompt or choice as one string or line.
 * The denylist holds hashes only, never the text. `--self-test` plants fixtures in a scratch
 * repository and requires every rule to fail it; a canary sentence written for this check is
 * listed alongside the real hashes so the real denylist is exercised end to end. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DENYLIST_SCHEMA = 'kairo-official-content-denylist/1';
export const DEFAULT_DENYLIST = join(ROOT, 'scripts/official-content-denylist.json');
export const PACK_MAGIC = 'kairo-private-assessment-pack/1\n';
export const WINDOW = 20;
// Long official texts list one window in four (chosen by the window's own hash); short ones list
// every window. The scan checks every window position, so any copied run of text is caught.
export const SAMPLE_MASK = 3;
export const LONG_TEXT = 60;
/** Written for this check; it is not from any exam. Its windows are in the real denylist, so it is
 * stored here in short pieces (no 20-character window of it appears in this file). */
export const CANARY = [
  '回廊の灯台守は、',
  '夜明け前に三度だけ',
  '硝子の鐘を鳴らし、',
  '誰もいない桟橋へ',
  '古い地図を置いていった。',
].join('');
const TEXT_EXTENSIONS = new Set([
  '.json',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.md',
  '.html',
  '.htm',
  '.css',
  '.txt',
  '.csv',
  '.tsv',
  '.yaml',
  '.yml',
  '.py',
  '.swift',
  '.xml',
  '.svg',
  '.webmanifest',
  '.sh',
]);
const MAX_TEXT_BYTES = 64 * 1024 * 1024;
const JAPANESE = /[\u3040-\u30FF\u3400-\u9FFF]/u;

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
/** NFKC, source escapes decoded, no whitespace, no private-use paper marks (ruby keeps its base). */
export function normalizeText(text) {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/gu, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\[nrt]/gu, '')
    .normalize('NFKC')
    .replace(/\uE002([^\uE003]*)\uE003[^\uE004]*\uE004/gu, '$1')
    .replace(/[\s\uE000-\uF8FF]/gu, '');
}
/** A whole string compared without the list marks, quotes or numbering around it. */
const trimEdges = (text) =>
  text.replace(
    /^[^\u3040-\u30FF\u3400-\u9FFF0-9A-Za-z]+|[^\u3040-\u30FF\u3400-\u9FFF0-9A-Za-z]+$/gu,
    '',
  );
const B1 = 0x01000193,
  B2 = 0x9e3779b1;
function powers() {
  let p1 = 1,
    p2 = 1;
  for (let index = 0; index < WINDOW; index++) {
    p1 = Math.imul(p1, B1) >>> 0;
    p2 = Math.imul(p2, B2) >>> 0;
  }
  return [p1, p2];
}
const [P1, P2] = powers();
/** Calls `visit(h1, h2)` for every window of normalized text (or only sampled ones). Two 32-bit
 * rolling hashes; `sampled` keeps windows whose first hash is 0 modulo SAMPLE_MASK + 1. */
export function eachWindow(text, visit, sampled = false) {
  if (text.length < WINDOW) return;
  let h1 = 0,
    h2 = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = (Math.imul(h1, B1) + code) >>> 0;
    h2 = (Math.imul(h2, B2) + code) >>> 0;
    if (index >= WINDOW) {
      const old = text.charCodeAt(index - WINDOW);
      h1 = (h1 - Math.imul(old, P1)) >>> 0;
      h2 = (h2 - Math.imul(old, P2)) >>> 0;
    }
    if (index >= WINDOW - 1 && (!sampled || (h1 & SAMPLE_MASK) === 0)) visit(h1, h2);
  }
}
export function wholeKey(text) {
  let h1 = 0,
    h2 = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = (Math.imul(h1, B1) + code) >>> 0;
    h2 = (Math.imul(h2, B2) + code) >>> 0;
  }
  return `${text.length}:${h1.toString(16)}:${h2.toString(16)}`;
}
const windowKey = (h1, h2) => `${h1.toString(16)}:${h2.toString(16)}`;

export function windowsOf(text) {
  const keys = new Set();
  const normalized = normalizeText(text);
  eachWindow(normalized, (h1, h2) => keys.add(windowKey(h1, h2)), normalized.length >= LONG_TEXT);
  return keys;
}

export function loadDenylist(path = DEFAULT_DENYLIST) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (raw.schema !== DENYLIST_SCHEMA || raw.window !== WINDOW || raw.sampleMask !== SAMPLE_MASK)
    throw new Error('Unsupported official-content denylist');
  // A 16-million-bit filter on the first hash keeps the every-position scan fast.
  const filter = new Uint8Array(1 << 21);
  for (const key of raw.windows) {
    const h1 = Number.parseInt(key.split(':')[0], 16) >>> 8;
    filter[h1 >>> 3] |= 1 << (h1 & 7);
  }
  return {
    files: new Set(raw.fileSha256),
    windows: new Set(raw.windows),
    filter,
    strings: new Set(raw.strings),
    counts: {
      files: raw.fileSha256.length,
      windows: raw.windows.length,
      strings: raw.strings.length,
    },
  };
}

function walkJson(value, visitString, visitObject) {
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (typeof current === 'string') visitString(current);
    else if (Array.isArray(current)) for (const child of current) stack.push(child);
    else if (current && typeof current === 'object') {
      visitObject(current);
      for (const key in current) stack.push(current[key]);
    }
  }
}

/** Findings for one file's bytes. Each finding names a rule, never the matched text. */
export function scanBytes(path, bytes, denylist) {
  const findings = [];
  const add = (rule, detail) => findings.push({ path, rule, detail });
  if (denylist.files.has(sha256(bytes)))
    add('file-hash', 'bytes equal an official or private-pack file');
  if (
    bytes.subarray(0, PACK_MAGIC.length).toString('latin1') === PACK_MAGIC ||
    /\.kairo-private-pack$/u.test(path)
  )
    add('private-pack', 'a private pack file');
  const extension = extname(path).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension) || bytes.length > MAX_TEXT_BYTES) return findings;
  const text = bytes.toString('utf8');
  const strings = [];
  if (extension === '.json' || extension === '.webmanifest') {
    try {
      walkJson(
        JSON.parse(text),
        (value) => {
          if (JAPANESE.test(value)) strings.push(value);
        },
        (object) => {
          if (object.sourceClass === 'official-private' || object.privatePack === true)
            add('official-class', 'catalog entry of a private paper');
          if (
            object.provenance &&
            typeof object.provenance === 'object' &&
            object.provenance.kind === 'official-private'
          )
            add('official-provenance', 'content with official-private provenance');
        },
      );
    } catch {
      /* Not JSON after all: scan it as text. */
    }
  }
  if (!JAPANESE.test(text) && !strings.length) return findings;
  // JSON strings are joined with a character no official window contains, so windows never span two.
  const source = strings.length ? strings.join('\u0000') : text;
  let windowHits = 0;
  eachWindow(normalizeText(source), (h1, h2) => {
    const bit = h1 >>> 8;
    if (denylist.filter[bit >>> 3] & (1 << (bit & 7)) && denylist.windows.has(windowKey(h1, h2)))
      windowHits += 1;
  });
  if (windowHits) add('text-window', `${windowHits} window(s) of official text`);
  const whole = strings.length ? strings : text.split('\n');
  let stringHits = 0;
  for (const value of whole) {
    if (value.length < 8 || value.length > 1200 || !JAPANESE.test(value)) continue;
    const normalized = trimEdges(normalizeText(value));
    if (normalized.length >= 8 && denylist.strings.has(wholeKey(normalized))) stringHits += 1;
  }
  if (stringHits) add('whole-string', `${stringHits} official prompt or choice string(s)`);
  return findings;
}

export function trackedFiles(root) {
  const run = (args) =>
    execFileSync('git', ['-C', root, 'ls-files', '-z', ...args], { maxBuffer: 256 * 1024 * 1024 })
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
  return [...new Set([...run([]), ...run(['--others', '--exclude-standard'])])].sort();
}

export function scanFiles(root, files, denylist) {
  const findings = [];
  let scanned = 0;
  for (const file of files) {
    const path = join(root, file);
    let stats;
    try {
      stats = statSync(path);
    } catch {
      continue; // a deleted but still-indexed path
    }
    if (!stats.isFile()) continue;
    scanned += 1;
    findings.push(...scanBytes(file, readFileSync(path), denylist));
  }
  return { scanned, findings };
}

function walkDirectory(root) {
  const out = [];
  const visit = (directory) => {
    for (const name of execFileSync('ls', ['-A', directory])
      .toString('utf8')
      .split('\n')
      .filter(Boolean)) {
      const path = join(directory, name);
      const stats = statSync(path);
      if (stats.isDirectory()) visit(path);
      else if (stats.isFile()) out.push(relative(root, path));
    }
  };
  visit(root);
  return out.sort();
}

export function scanRepository(root = ROOT, denylist = loadDenylist()) {
  return scanFiles(root, trackedFiles(root), denylist);
}
export function scanDirectory(directory, denylist = loadDenylist()) {
  return scanFiles(directory, walkDirectory(directory), denylist);
}

/** Plants one fixture per rule in a scratch repository; every rule must fail it. */
export function selfTest(denylist = loadDenylist(), extraFiles = []) {
  const scratch = mkdtempSync(join(tmpdir(), 'kairo-official-guard-'));
  try {
    execFileSync('git', ['init', '-q', scratch]);
    const plant = (path, content) => {
      mkdirSync(dirname(join(scratch, path)), { recursive: true });
      writeFileSync(join(scratch, path), content);
    };
    plant('README.md', '# clean scratch repository\n');
    const clean = scanRepository(scratch, denylist);
    plant('data/assessment/canary.json', JSON.stringify({ prompt: `前置き。${CANARY}` }));
    plant('docs/canary.md', `引用：${CANARY}\n`);
    plant(
      'data/assessment/private-entry.json',
      JSON.stringify({ entries: [{ id: 'x', sourceClass: 'official-private' }] }),
    );
    plant(
      'data/assessment/private-form.json',
      JSON.stringify({ provenance: { kind: 'official-private', sources: [] } }),
    );
    plant('media/copy.kairo-private-pack', `${PACK_MAGIC}2\n{}`);
    for (const [path, content] of extraFiles) plant(path, content);
    const planted = scanRepository(scratch, denylist);
    const rules = new Set(planted.findings.map((finding) => finding.rule));
    const required = ['text-window', 'official-class', 'official-provenance', 'private-pack'];
    return {
      clean: clean.findings.length === 0,
      caught: required.every((rule) => rules.has(rule)),
      required,
      findings: planted.findings,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Hashes the private material on this Mac into a denylist. Reads text locally; writes no text.
 * Generic question stems and short choices are left out so the repository's own tests never match. */
export function buildDenylist({ packDirectory, manifest }) {
  const pack = JSON.parse(readFileSync(join(packDirectory, 'pack.json'), 'utf8'));
  const form = JSON.parse(readFileSync(join(packDirectory, 'form.json'), 'utf8'));
  const files = new Set();
  for (const match of readFileSync(manifest, 'utf8').matchAll(/`([a-f0-9]{64})`/gu))
    files.add(match[1]);
  for (const file of pack.files) files.add(file.sha256);
  for (const name of ['pack.json', 'mapping.json'])
    files.add(sha256(readFileSync(join(packDirectory, name))));
  const windows = new Set(windowsOf(CANARY));
  const strings = new Set();
  const addWindows = (text) => {
    for (const key of windowsOf(text)) windows.add(key);
  };
  const addString = (text, minimum) => {
    const normalized = trimEdges(normalizeText(text));
    if (normalized.length >= minimum) strings.add(wholeKey(normalized));
  };
  for (const passage of form.passages) addWindows(passage.text);
  for (const media of form.media) if (media.transcript) addWindows(media.transcript);
  for (const item of form.items) {
    const prompt = item.prompt.replace(/^\uE005\d+\uE006\u3000?/u, '');
    // Vocabulary and grammar prompts are the questions' own sentences; reading stems are generic.
    if (item.skill === 'vocabulary' || item.skill === 'grammar') {
      addWindows(prompt);
      addString(prompt, 8);
    }
    for (const option of item.response.options) {
      if (normalizeText(option.text).length >= WINDOW) addWindows(option.text);
      addString(option.text, 10);
    }
  }
  return {
    schema: DENYLIST_SCHEMA,
    note: 'Hashes only: SHA-256 of official and private-pack files, and 64-bit rolling hashes of sampled 20-character windows and whole prompts/choices of real JLPT papers. No official text is stored here.',
    window: WINDOW,
    sampleMask: SAMPLE_MASK,
    normalization:
      'NFKC; whitespace and private-use paper marks removed; ruby kept as its base text',
    sources: [
      'jlpt.jp official practice workbooks (downloaded for personal study; see the private MANIFEST)',
    ],
    fileSha256: [...files].sort(),
    windows: [...windows].sort(),
    strings: [...strings].sort(),
  };
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked && process.argv.includes('--write-denylist')) {
  const args = process.argv.slice(2);
  const option = (name) =>
    args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined;
  const denylist = buildDenylist({ packDirectory: option('pack'), manifest: option('manifest') });
  const target = option('denylist') ?? DEFAULT_DENYLIST;
  writeFileSync(target, JSON.stringify(denylist, null, 1) + '\n');
  console.log(
    JSON.stringify({
      target,
      files: denylist.fileSha256.length,
      windows: denylist.windows.length,
      strings: denylist.strings.length,
    }),
  );
} else if (invoked) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const denylist = loadDenylist(option('denylist') ?? DEFAULT_DENYLIST);
  let failed = false;
  const report = { denylist: denylist.counts };
  if (!args.includes('--no-self-test')) {
    const result = selfTest(denylist);
    report.selfTest = {
      cleanScratchPassed: result.clean,
      plantedFixturesCaught: result.caught,
      rules: [...new Set(result.findings.map((finding) => finding.rule))],
    };
    if (!result.clean || !result.caught) failed = true;
  }
  const directory = option('dir');
  const started = Date.now();
  const scan = directory
    ? scanDirectory(resolve(directory), denylist)
    : scanRepository(ROOT, denylist);
  report.scan = {
    target: directory ? resolve(directory) : 'repository (tracked and unignored files)',
    files: scan.scanned,
    findings: scan.findings,
    ms: Date.now() - started,
  };
  if (scan.findings.length) failed = true;
  report.verdict = failed ? 'fail' : 'pass';
  const out = option('out');
  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(resolve(out), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
  if (failed) {
    console.error(
      scan.findings.length
        ? 'Official JLPT content found. Real papers stay in the private on-device importer, never in this repository.'
        : 'The official-content guard failed its own planted-fixture test.',
    );
    process.exitCode = 1;
  }
}
