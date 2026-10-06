/** Pin existing synthetic recordings to conservative sentence-order candidates.
 * Counts and source bytes establish reproducibility, never editorial approval. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const compact = text => text.replace(/\s+/gu, '');
export function buildListeningCues(root = source) {
  const read = name => JSON.parse(readFileSync(resolve(root, name)));
  const recordings = read('audio/manifest.json'), articles = read('data/articles/index.json').articles;
  const passages = {}, excluded = [];
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
      excluded.push({ sourceId: row.id, reason: 'sentence-boundary-or-count-mismatch',
        recordings: recording.have.length, textSentences: sentences.length, tokenSentences: ranges.length });
      continue;
    }
    passages[row.id] = { sourceDigest: hash(JSON.stringify(surfaces)), sentences: ranges.map((range, sentenceIndex) => {
      const path = `audio/s/ami/${row.id.replaceAll(':', '_')}-${String(sentenceIndex).padStart(3, '0')}.m4a`;
      const bytes = readFileSync(resolve(root, path));
      return { ...range, quote: surfaces.slice(range.start, range.end).join(''), cue: {
        version: 1, path, sha256: hash(bytes), bytes: bytes.length, sentenceIndex, voice: 'ami',
        alignment: 'sentence-order', transcriptStatus: 'unreviewed',
      } };
    }) };
  }
  return { version: 1, passages, excluded };
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
