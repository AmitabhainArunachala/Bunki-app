import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Bunki lint configuration (WP-01).
 *
 * The interesting part of this file is not the style rules — it is the
 * architectural boundaries from controller §5. Those boundaries are what keep
 * the evidence claims of this project checkable, so they are encoded as lint
 * errors rather than left to review vigilance:
 *
 *   1. `@bunki/domain` stays pure — no React, React Native, Expo, Node
 *      builtins, and no sibling package. Clock/ID/randomness are injected
 *      (REQ-ARCH-02). This is what makes deterministic replay (T-03) possible.
 *   2. `apps/app` cannot reach the persistence write path. Every append must
 *      flow through the domain command handler so evidence-class events pass
 *      the evidence gate. This closes the gate-bypass hole (controller §5).
 *   3. Only `@bunki/domain` may import `ts-fsrs`. There is exactly one
 *      scheduler implementation and nothing else computes intervals
 *      (REQ-SCH-01).
 *
 * A boundary is only worth what its weakest import form is worth. The core
 * `no-restricted-imports` rule sees *bare specifiers in static syntax* and
 * nothing else, which leaves three ways through it:
 *
 *   a. a deep relative path — `import '../../../../packages/persistence/src'`;
 *   b. a dynamic `import()` — ESLint's core rule never visits `ImportExpression`;
 *   c. a `require()` in a `.js`/`.cjs` file, where the TS require ban is off.
 *
 * So the boundaries are enforced twice, by two mechanisms with different
 * failure modes. `no-restricted-imports` covers bare specifiers plus the glob
 * deep-path shape rooted at the `packages/` directory. The local
 * `bunki/package-boundaries` rule below covers every import form by *resolving*
 * the specifier to a path and asking which package it lands in — which is
 * exact, so it also catches the sibling-relative form (`../../persistence/src`)
 * that no glob can express without false positives.
 *
 * Both mechanisms read the same module and package lists below, so adding a
 * package to one cannot silently un-enforce it in the other.
 *
 * `test/boundaries.test.ts` runs this exact config against every bypass form
 * and asserts each one errors. Treat a failure there as a boundary breach, not
 * a broken test.
 *
 * Silencing any of these with an inline disable comment is an ADR-level
 * decision, not a local judgement call.
 */

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

const NODE_BUILTINS = [
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'crypto',
  'dgram',
  'dns',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'querystring',
  'readline',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
];

/**
 * Forbidden bare module specifiers, as plain names and wildcards. Subpaths are
 * implied throughout: `react` covers `react/jsx-runtime`, `expo-*` covers
 * `expo-router/build/...`.
 */
const REACT_GROUP = ['react', 'react-dom'];
const REACT_NATIVE_GROUP = ['react-native', 'react-native-*'];
const EXPO_GROUP = ['expo', 'expo-*', '@expo/*'];
const NODE_GROUP = [...NODE_BUILTINS, 'node:*'];
const FSRS_GROUP = ['ts-fsrs'];

/**
 * Anchors a bare-specifier list for `no-restricted-imports`.
 *
 * The leading `/` matters more than it looks. These patterns are matched with
 * gitignore semantics, so the unanchored pattern `events` matches not only the
 * Node builtin but also `./events/index.ts` — and controller §5 *mandates* a
 * `packages/domain/src/events/` directory. Unanchored, the purity rule would
 * have made the domain kernel's own layout unlintable the moment WP-02 wrote
 * its first import. Anchoring restricts the match to the specifier's start,
 * which a relative path (`./`, `../`) can never reach.
 */
const anchored = (modules) => modules.map((name) => `/${name}`);

/**
 * Workspace packages, as the pair the boundary rules actually need: the bare
 * specifier a static import would use, and the directory a relative path would
 * resolve into. Single source of truth for both enforcement mechanisms.
 */
const WORKSPACE_PACKAGES = {
  domain: { specifier: '@bunki/domain', dir: 'packages/domain' },
  persistence: { specifier: '@bunki/persistence', dir: 'packages/persistence' },
  ai: { specifier: '@bunki/ai', dir: 'packages/ai' },
  seed: { specifier: '@bunki/seed', dir: 'packages/seed' },
  export: { specifier: '@bunki/export', dir: 'packages/export' },
  app: { specifier: '@bunki/app', dir: 'apps/app' },
};

// Siblings @bunki/domain may not import (controller §5 purity rule).
const DOMAIN_FORBIDDEN_PACKAGES = [
  WORKSPACE_PACKAGES.persistence,
  WORKSPACE_PACKAGES.ai,
  WORKSPACE_PACKAGES.seed,
  WORKSPACE_PACKAGES.export,
  WORKSPACE_PACKAGES.app,
];

// The single package apps/app may not import (controller §5 gate-bypass rule).
const APP_FORBIDDEN_PACKAGES = [WORKSPACE_PACKAGES.persistence];

/** Bare-specifier globs for `no-restricted-imports`. */
const packageSpecifierGlobs = (packages) => anchored(packages.map(({ specifier }) => specifier));

/**
 * Deep-path globs for `no-restricted-imports`, of the form
 * `<globstar>/packages/<pkg>` (plus its subtree). That shape catches any
 * relative path routed through the `packages/` directory and has no false
 * positives. The sibling-relative shape (`../../persistence`) is deliberately
 * NOT expressed as a glob: the only glob that matches it would also flag a
 * legitimate intra-package `../export/` directory. The local rule below
 * catches that shape exactly instead, by resolving the path.
 */
const packageDeepPathGlobs = (packages) =>
  packages.flatMap(({ dir }) => [`**/${dir}`, `**/${dir}/**`]);

const DOMAIN_PURITY_MESSAGE =
  '@bunki/domain is the pure core (controller §5, REQ-ARCH-02): no React, React Native, Expo, Node builtins, or sibling packages. Inject clock/ID/randomness instead of importing a platform API.';

const PERSISTENCE_WRITE_PATH_MESSAGE =
  'apps/app must not import @bunki/persistence (controller §5). Appends flow through the domain command handler so evidence-class events pass the evidence gate; a direct EventStorePort.append from the UI is the gate-bypass hole this rule closes. Need a type? Re-export it from @bunki/domain.';

const SINGLE_SCHEDULER_MESSAGE =
  'Only @bunki/domain may import ts-fsrs (REQ-SCH-01): there is one scheduler implementation and nothing else computes intervals. Call the domain reducer instead.';

// ---------------------------------------------------------------------------
// Local rule: boundary enforcement that survives every import form.
// ---------------------------------------------------------------------------

/**
 * Does a bare specifier fall under `entry`?
 *
 * `entry` may be an exact name (`react`), a prefix wildcard (`expo-*`,
 * `node:*`), or a scope wildcard (`@expo/*`). Subpaths always count:
 * `react/jsx-runtime` is `react`.
 */
function matchesModuleEntry(specifier, entry) {
  const head = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : (specifier.split('/')[0] ?? specifier);

  if (entry.endsWith('/*')) return head.startsWith(`${entry.slice(0, -2)}/`);
  if (entry.endsWith('*')) return head.startsWith(entry.slice(0, -1));
  return head === entry;
}

const isRelative = (specifier) =>
  specifier === '.' || specifier === '..' || /^\.\.?\//.test(specifier);

const packageBoundariesRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce controller §5 package boundaries across every import form: static, dynamic import(), require(), and resolved relative paths.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          // Bare module names/wildcards that are forbidden outright.
          modules: { type: 'array', items: { type: 'string' } },
          // Workspace packages forbidden by specifier *and* by resolved path.
          packages: {
            type: 'array',
            items: {
              type: 'object',
              properties: { specifier: { type: 'string' }, dir: { type: 'string' } },
              required: ['specifier', 'dir'],
              additionalProperties: false,
            },
          },
          message: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      restricted: "'{{specifier}}' is restricted from being used. {{message}}",
    },
  },

  create(context) {
    const { modules = [], packages = [], message = '' } = context.options[0] ?? {};
    const fileDir = dirname(context.filename);

    /** Resolve a relative specifier to a repo-relative POSIX path. */
    const toRepoRelative = (specifier) =>
      relative(REPO_ROOT, resolve(fileDir, specifier)).split(/[\\/]/).join('/');

    function isRestricted(specifier) {
      if (isRelative(specifier)) {
        // Exact: resolve the path and ask which package it lands in. This is
        // what catches `../../persistence/src/index.ts` from packages/domain.
        const target = toRepoRelative(specifier);
        return packages.some(({ dir }) => target === dir || target.startsWith(`${dir}/`));
      }
      return (
        modules.some((entry) => matchesModuleEntry(specifier, entry)) ||
        packages.some(({ specifier: name }) => matchesModuleEntry(specifier, name))
      );
    }

    function check(node, sourceNode) {
      if (sourceNode?.type !== 'Literal' || typeof sourceNode.value !== 'string') return;
      if (!isRestricted(sourceNode.value)) return;
      context.report({
        node,
        messageId: 'restricted',
        data: { specifier: sourceNode.value, message },
      });
    }

    return {
      // Static forms.
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source),
      ExportAllDeclaration: (node) => check(node, node.source),
      // Dynamic `import()` — the form core no-restricted-imports cannot see.
      ImportExpression: (node) => check(node, node.source),
      // `require()`, for the .js/.cjs files where the TS require ban is off.
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
          check(node, node.arguments[0]);
        }
      },
    };
  },
};

const bunkiPlugin = { rules: { 'package-boundaries': packageBoundariesRule } };

// Boundary rules must cover every file the bundler can load, not just TS.
const SOURCE_FILES = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/expo-env.d.ts',
      'apps/app/assets/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  { plugins: { bunki: bunkiPlugin } },

  // ---------------------------------------------------------------------
  // Repository-wide defaults.
  // ---------------------------------------------------------------------
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // Boundary 3: one scheduler. Applies everywhere; the domain block below
  // re-enables ts-fsrs for the single legitimate call site.
  {
    files: [SOURCE_FILES],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: anchored(FSRS_GROUP), message: SINGLE_SCHEDULER_MESSAGE }] },
      ],
      'bunki/package-boundaries': [
        'error',
        { modules: FSRS_GROUP, message: SINGLE_SCHEDULER_MESSAGE },
      ],
    },
  },

  // ---------------------------------------------------------------------
  // Boundary 1: @bunki/domain purity (controller §5, REQ-ARCH-02).
  // ---------------------------------------------------------------------
  {
    files: [`packages/domain/src/${SOURCE_FILES}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: anchored(REACT_GROUP), message: DOMAIN_PURITY_MESSAGE },
            { group: anchored(REACT_NATIVE_GROUP), message: DOMAIN_PURITY_MESSAGE },
            { group: anchored(EXPO_GROUP), message: DOMAIN_PURITY_MESSAGE },
            { group: anchored(NODE_GROUP), message: DOMAIN_PURITY_MESSAGE },
            {
              group: [
                ...packageSpecifierGlobs(DOMAIN_FORBIDDEN_PACKAGES),
                ...packageDeepPathGlobs(DOMAIN_FORBIDDEN_PACKAGES),
              ],
              message: DOMAIN_PURITY_MESSAGE,
            },
          ],
        },
      ],
      'bunki/package-boundaries': [
        'error',
        {
          modules: [...REACT_GROUP, ...REACT_NATIVE_GROUP, ...EXPO_GROUP, ...NODE_GROUP],
          packages: DOMAIN_FORBIDDEN_PACKAGES,
          message: DOMAIN_PURITY_MESSAGE,
        },
      ],
    },
  },

  // Domain tests may read fixtures from disk, but stay free of UI platforms
  // and sibling packages so the kernel remains independently testable.
  {
    files: [`packages/domain/test/${SOURCE_FILES}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: anchored(REACT_GROUP), message: DOMAIN_PURITY_MESSAGE },
            { group: anchored(REACT_NATIVE_GROUP), message: DOMAIN_PURITY_MESSAGE },
            { group: anchored(EXPO_GROUP), message: DOMAIN_PURITY_MESSAGE },
            {
              group: [
                ...packageSpecifierGlobs(DOMAIN_FORBIDDEN_PACKAGES),
                ...packageDeepPathGlobs(DOMAIN_FORBIDDEN_PACKAGES),
              ],
              message: DOMAIN_PURITY_MESSAGE,
            },
          ],
        },
      ],
      'bunki/package-boundaries': [
        'error',
        {
          modules: [...REACT_GROUP, ...REACT_NATIVE_GROUP, ...EXPO_GROUP],
          packages: DOMAIN_FORBIDDEN_PACKAGES,
          message: DOMAIN_PURITY_MESSAGE,
        },
      ],
    },
  },

  // ---------------------------------------------------------------------
  // Boundary 2: apps/app cannot reach the persistence write path
  //             (controller §5 — closes the evidence-gate bypass).
  // ---------------------------------------------------------------------
  {
    files: [`apps/app/${SOURCE_FILES}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                ...packageSpecifierGlobs(APP_FORBIDDEN_PACKAGES),
                ...packageDeepPathGlobs(APP_FORBIDDEN_PACKAGES),
              ],
              message: PERSISTENCE_WRITE_PATH_MESSAGE,
            },
            { group: anchored(FSRS_GROUP), message: SINGLE_SCHEDULER_MESSAGE },
          ],
        },
      ],
      'bunki/package-boundaries': [
        'error',
        {
          modules: FSRS_GROUP,
          packages: APP_FORBIDDEN_PACKAGES,
          message: PERSISTENCE_WRITE_PATH_MESSAGE,
        },
      ],
    },
  },

  // ---------------------------------------------------------------------
  // Environments.
  // ---------------------------------------------------------------------
  {
    files: ['apps/app/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        AbortController: 'readonly',
      },
    },
  },
  {
    // Metro and Babel resolve their config files as CommonJS, so `require` is
    // mandatory here rather than a style choice.
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.mjs', '*.config.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
);
