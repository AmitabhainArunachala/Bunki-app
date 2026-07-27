// Metro configuration for an npm-workspaces monorepo (WP-01, controller §5).
//
// create-expo-app's template assumes a single-package repo: without this,
// Metro watches only apps/app and resolves only apps/app/node_modules, so the
// hoisted root node_modules and the sibling `packages/*` workspaces are
// invisible to the bundler.
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so edits in packages/* trigger a rebuild.
config.watchFolders = [workspaceRoot];

// Resolve from the app first, then the hoisted root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Prevent Metro from walking up past the two paths above, which would let a
// stray parent-directory node_modules shadow a workspace package.
config.resolver.disableHierarchicalLookup = true;

// Resolve `.svg` as source text rather than as an image asset (WP-05).
//
// The kanji page needs the individual KanjiVG stroke paths to animate writing
// order (REQ-UI-03), and an asset URI cannot give it those. `svg` must be
// removed from `assetExts` as well as added to `sourceExts`: while it is in
// both, Metro's asset resolution wins and the transformer below never runs.
// See `svg-text-transformer.js` for why the data is read in place rather than
// copied out of `packages/seed`.
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];
config.transformer.babelTransformerPath = require.resolve('./svg-text-transformer.js');

module.exports = config;
