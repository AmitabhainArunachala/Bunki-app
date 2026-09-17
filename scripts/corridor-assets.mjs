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
  'corridor.js',
  'reading-controller.mjs',
  'teacher-context.mjs',
  'teacher-drafts.mjs',
  'teacher-draft-controller.mjs',
  'sentence-drafts.mjs',
  'sentence-draft-controller.mjs',
  'reading-position.mjs',
  'feed-controller.mjs',
  'assessment-controller.mjs',
  'record-controller.mjs',
  'record-host.mjs',
  'record-app.mjs',
  'record-binding.mjs',
  'record-sync.mjs',
  'publisher-controller.mjs',
  'source-inbox.mjs',
  'source-processing.mjs',
  'sentence-practice.mjs',
  'corridor-ink.js',
  'dictionary-worker.js',
  'skip-core.js',
  'skip-ui.js',
  'skip-ui.css',
  'reference-core.js',
  'reference-ui.js',
  'reference-ui.css',
  'drift-layer.css',
  'drift-layer.js',
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
