/** Pin existing synthetic recordings to conservative sentence-order candidates.
 * Counts and source bytes establish reproducibility, never editorial approval. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { runtimeLock, voiceForRole } from './voice-lock.mjs';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const compact = text => text.replace(/\s+/gu, '');
/** The listening lane's sentences, in shelf order: for each passage the sentence index has, either
 * its exact token ranges and text sentences, or the reason it cannot be cued. This is the one
 * source of the lane's sentence numbering; the render job places its example clips from it, so
 * clip i and cue i can never name two different sentences. */
export function listeningSentences(root = source) {
  const read = name => JSON.parse(readFileSync(resolve(root, name)));
  const recordings = read('audio/manifest.json'), articles = read('data/articles/index.json').articles;
  const rows = [];
  for (const row of articles) {
    const recording = recordings.sentences?.[row.id];
    if (!recording) continue;
    assert(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/u.test(row.id));
    const article = read(`data/articles/${row.file}`), surfaces = article.tokens?.map(token => token.s);
    const sentences = article.text?.match(/[^。！？]+[。！？]?/gu)?.map(text => text.trim()).filter(Boolean) || [];
    const ranges = []; let start = 0;
    for (const [index, text] of (surfaces || []).entries()) if (['。', '！', '？'].includes(text)) {
      ranges.push({ start, end: index + 1 }); start = index + 1;
    }
    if (surfaces && start < surfaces.length) ranges.push({ start, end: surfaces.length });
    if (!surfaces || !sentences.length || recording.have.length !== sentences.length ||
        recording.have.some((index, position) => index !== position) || ranges.length !== sentences.length ||
        ranges.some((range, index) => compact(surfaces.slice(range.start, range.end).join('')) !== compact(sentences[index]))) {
      rows.push({ row, eligible: false, excluded: { sourceId: row.id, reason: 'sentence-boundary-or-count-mismatch',
        recordings: recording.have.length, textSentences: sentences.length, tokenSentences: ranges.length } });
      continue;
    }
    rows.push({ row, eligible: true, surfaces, ranges, sentences });
  }
  return rows;
}
export function buildListeningCues(root = source, lock = runtimeLock()) {
  const passages = {}, excluded = [];
  for (const { row, eligible, excluded: reason, surfaces, ranges } of listeningSentences(root)) {
    if (!eligible) { excluded.push(reason); continue; }
    // V (2026-10-17): the cue's voice comes from the lock, never a literal. Before V this builder
    // emitted voice:'ami' while the runtime's validator admitted only the locked roster, so every
    // cue it produced was unplayable BY CONSTRUCTION — generator and validator green and flatly
    // contradicting each other. A sentence now yields a cue only when the approved clip exists on
    // disk; until the render runs, these passages are honestly excluded instead of silently dead.
    // the lane is the example role, the role the render job places these clips under
    const voice = voiceForRole('example', lock);
    const clipPath = (i) => `audio/s/${voice}/${row.id.replaceAll(':', '_')}-${String(i).padStart(3, '0')}.m4a`;
    const missing = ranges.map((_, i) => clipPath(i)).filter((path) => !existsSync(resolve(root, path)));
    if (missing.length) {
      excluded.push({ sourceId: row.id, reason: 'no-approved-clips', voice, want: ranges.length, missing: missing.length });
      continue;
    }
    passages[row.id] = { sourceDigest: hash(JSON.stringify(surfaces)), sentences: ranges.map((range, sentenceIndex) => {
      const path = clipPath(sentenceIndex);
      const bytes = readFileSync(resolve(root, path));
      return { ...range, quote: surfaces.slice(range.start, range.end).join(''), cue: {
        version: 1, path, sha256: hash(bytes), bytes: bytes.length, sentenceIndex, voice,
        speakerRole: 'example', model: lock.model,
        alignment: 'sentence-order', transcriptStatus: 'unreviewed',
      } };
    }) };
  }
  return { version: 1, lock: { model: lock.model, voice: lock.main }, passages, excluded };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = resolve(source, 'audio/sentence-cues.json');
  const catalog = buildListeningCues(), text = `${JSON.stringify(catalog, null, 2)}\n`;
  if (process.argv[2] === '--write' && process.argv.length === 3) writeFileSync(file, text);
  else {
    assert(process.argv[2] === '--check' && process.argv.length === 3, 'Use --check or --write');
    assert.equal(readFileSync(file, 'utf8'), text, 'Listening catalog must match exact source and recording bytes');
  }
  console.log(JSON.stringify({ passages: Object.keys(catalog.passages).length,
    cues: Object.values(catalog.passages).reduce((sum, item) => sum + item.sentences.length, 0),
    excluded: catalog.excluded.length, transcriptStatus: 'unreviewed', sha256: hash(text) }));
}
