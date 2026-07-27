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
 * Silencing any of these with an inline disable comment is an ADR-level
 * decision, not a local judgement call.
 */

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
  'fs/promises',
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

const REACT_GROUP = ['react', 'react/*', 'react-dom', 'react-dom/*'];
const REACT_NATIVE_GROUP = ['react-native', 'react-native/*', 'react-native-*', 'react-native-*/*'];
const EXPO_GROUP = ['expo', 'expo/*', 'expo-*', 'expo-*/*', '@expo/*'];
const NODE_GROUP = [...NODE_BUILTINS, ...NODE_BUILTINS.map((name) => `node:${name}`), 'node:*'];

const SIBLING_PACKAGE_GROUP = [
  '@bunki/persistence',
  '@bunki/persistence/*',
  '@bunki/ai',
  '@bunki/ai/*',
  '@bunki/seed',
  '@bunki/seed/*',
  '@bunki/export',
  '@bunki/export/*',
  '@bunki/app',
  '@bunki/app/*',
];

const DOMAIN_PURITY_MESSAGE =
  '@bunki/domain is the pure core (controller §5, REQ-ARCH-02): no React, React Native, Expo, Node builtins, or sibling packages. Inject clock/ID/randomness instead of importing a platform API.';

const PERSISTENCE_WRITE_PATH_MESSAGE =
  'apps/app must not import @bunki/persistence (controller §5). Appends flow through the domain command handler so evidence-class events pass the evidence gate; a direct EventStorePort.append from the UI is the gate-bypass hole this rule closes. Need a type? Re-export it from @bunki/domain.';

const SINGLE_SCHEDULER_MESSAGE =
  'Only @bunki/domain may import ts-fsrs (REQ-SCH-01): there is one scheduler implementation and nothing else computes intervals. Call the domain reducer instead.';

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
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['ts-fsrs', 'ts-fsrs/*'], message: SINGLE_SCHEDULER_MESSAGE }],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------
  // Boundary 1: @bunki/domain purity (controller §5, REQ-ARCH-02).
  // ---------------------------------------------------------------------
  {
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: REACT_GROUP, message: DOMAIN_PURITY_MESSAGE },
            { group: REACT_NATIVE_GROUP, message: DOMAIN_PURITY_MESSAGE },
            { group: EXPO_GROUP, message: DOMAIN_PURITY_MESSAGE },
            { group: NODE_GROUP, message: DOMAIN_PURITY_MESSAGE },
            { group: SIBLING_PACKAGE_GROUP, message: DOMAIN_PURITY_MESSAGE },
          ],
        },
      ],
    },
  },

  // Domain tests may read fixtures from disk, but stay free of UI platforms
  // and sibling packages so the kernel remains independently testable.
  {
    files: ['packages/domain/test/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: REACT_GROUP, message: DOMAIN_PURITY_MESSAGE },
            { group: REACT_NATIVE_GROUP, message: DOMAIN_PURITY_MESSAGE },
            { group: EXPO_GROUP, message: DOMAIN_PURITY_MESSAGE },
            { group: SIBLING_PACKAGE_GROUP, message: DOMAIN_PURITY_MESSAGE },
          ],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------
  // Boundary 2: apps/app cannot reach the persistence write path
  //             (controller §5 — closes the evidence-gate bypass).
  // ---------------------------------------------------------------------
  {
    files: ['apps/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@bunki/persistence', '@bunki/persistence/*'],
              message: PERSISTENCE_WRITE_PATH_MESSAGE,
            },
            { group: ['ts-fsrs', 'ts-fsrs/*'], message: SINGLE_SCHEDULER_MESSAGE },
          ],
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
      },
    },
  },
);
