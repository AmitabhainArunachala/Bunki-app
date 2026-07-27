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

module.exports = config;
