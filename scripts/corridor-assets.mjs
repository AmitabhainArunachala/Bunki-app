import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const CORRIDOR_REQUIRED_ROOTS = [
  'index.html',
  'apple-touch-icon.png',
  'manifest.webmanifest',
  'sw.js',
  'icon-192.png',
  'icon-512.png',
  'fonts.css',
  'fonts',
  'corridor.css',
  'editorial.css',
  'corridor.js',
  'maintenance/report-client.js',
  'maintenance/report-client.css',
  'reading-controller.mjs',
  'teacher-context.mjs',
  'teacher-drafts.mjs',
  'teacher-draft-controller.mjs',
  'sentence-drafts.mjs',
  'sentence-draft-controller.mjs',
  'reading-position.mjs',
  'feed-controller.mjs',
  'assessment-controller.mjs',
  'assessment-v2-controller.mjs',
  'assessment-learning.mjs',
  'assessment-question-practice.mjs',
  'assessment-question-view.mjs',
  'assessment-question-source.mjs',
  'assessment-view.mjs',
  'assessment-delivery.mjs',
  'assessment-cloze.mjs',
  'assessment-received.mjs',
  'assessment-enrichment.mjs',
  'assessment-finalization.mjs',
  'record-controller.mjs',
  'record-host.mjs',
  'record-app.mjs',
  'record-binding.mjs',
  'record-sync.mjs',
  'publisher-controller.mjs',
  'source-inbox.mjs',
  'source-processing.mjs',
  'sentence-practice.mjs',
  'guided-session.mjs',
  'guided-session-engine.mjs',
  'guided-session-content.mjs',
  'guided-moments.mjs',
  'guided-moments.css',
  'guided-session.css',
  'guided',
  'corridor-ink.js',
  'dictionary-worker.js',
  'skip-core.js',
  'skip-ui.js',
  'skip-ui.css',
  'register.css',
  'reference-core.js',
  'reference-ui.js',
  'reference-ui.css',
  'drift-layer.css',
  'drift-layer.js',
  'decks/context-dense/mount.js',
  'decks/context-dense/engine.js',
  'decks/context-dense/deck.json',
  'decks/context-dense/context-deck.css',
  'decks/context-dense/standalone.html',
  'decks/context-dense/basic.tsv',
  'decks/player/engine.js',
  'decks/player/mount.js',
  'decks/player/player.css',
  'decks/player/host.js',
  'decks/personal/engine.mjs',
  'decks/personal/mount.mjs',
  'decks/personal/schema.mjs',
  'decks/personal/host-bridge.mjs',
  'decks/personal/enrichment.mjs',
  'decks/personal/store.mjs',
  'decks/personal/personal.css',
  'decks/kotoba-mine/deck.json',
  'decks/kotoba-mcd/deck.json',
  'decks/kotoba-mine/tokens.json',
  'decks/kotoba-mcd/tokens.json',
  'decks/n2n1-sample/deck.json',
  'decks/n2n1-sample/tokens.json',
  'data',
  'vendor',
  'design',
];

export function assetFilesUnder(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`Refusing an asset symlink: ${path}`);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) throw new Error(`Unsupported asset: ${path}`);
  return readdirSync(path)
    .sort()
    .filter((name) => name !== '.DS_Store' && name !== 'Thumbs.db')
    .flatMap((name) => assetFilesUnder(join(path, name)));
}

/** Assembly and source verification share the complete required runtime set. */
export function corridorAssetFiles(source) {
  for (const path of CORRIDOR_REQUIRED_ROOTS) {
    if (!existsSync(join(source, path))) throw new Error(`Missing required asset: ${path}`);
  }
  const roots = [
    ...CORRIDOR_REQUIRED_ROOTS,
    ...(existsSync(join(source, 'audio')) ? ['audio'] : []),
  ];
  return roots.flatMap((path) => assetFilesUnder(join(source, path))).sort();
}
