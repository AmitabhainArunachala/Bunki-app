import { defineConfig } from 'vitest/config';

/**
 * Root test runner for every workspace (WP-01).
 *
 * `npm run test` is the controller §17.5 unit+integration entry point. The
 * replay suite has its own script (`npm run test:replay`, WP-02) because the
 * controller reports it separately.
 */
export default defineConfig({
  test: {
    include: [
      'test/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
      'apps/app/test/**/*.test.ts',
      'tools/**/*.test.mjs',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/app/e2e/**'],
    reporters: ['default'],
  },
});
