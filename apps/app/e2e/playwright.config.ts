/**
 * Playwright configuration for the Phase-0 web E2E (WP-10, controller §17.5).
 *
 * ## Choices that are assertions, not preferences
 *
 * **`retries: 0`.** A retry turns a flake into a pass and a real intermittent
 * defect into noise. T-17 is the test the whole phase is judged by; if it is
 * unstable, that instability is the finding.
 *
 * **`fullyParallel: true`, isolated contexts.** Each test gets its own browser
 * context, which means its own `localStorage` — and `localStorage` is where this
 * build's durable log lives. Sharing it between tests would let one test's
 * events show up in another test's evidence inspector.
 *
 * **The export must already exist.** Nothing here builds it. A config that
 * silently rebuilt would make "the E2E passed" ambiguous about *which* bundle
 * passed; the CI job and the README both name the build step explicitly, and
 * `startExportHost` fails with that exact command when the directory is missing.
 *
 * **Chromium only, and that is recorded rather than implied.** One engine on one
 * platform is what this environment can honestly claim; the accessibility and
 * cross-browser matrix belongs to the adversarial lanes (§17.2), not here.
 */

import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';

export default defineConfig({
  // Relative, and resolved by Playwright against this file's directory. The
  // obvious spelling — `dirname(fileURLToPath(import.meta.url))` — cannot be
  // used: Playwright compiles the config to CommonJS, and an `import.meta` in
  // the output makes Node re-classify the compiled file as ESM, so it fails on
  // its own `exports`. The `dist` path the fixture needs is derived from
  // `project.testDir` for the same reason.
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  retries: 0,
  // Spread rather than `workers: … : undefined`, because the repository compiles
  // with `exactOptionalPropertyTypes` — an explicit `undefined` is not the same
  // thing as an absent key, and Playwright's own default is what "absent" means.
  ...(process.env['CI'] === undefined ? {} : { workers: 2 }),
  reporter: [['list']],
  // The closed loop walks nine screens and reloads twice; 90 s is generous on a
  // cold CI runner and still fails fast enough to be a useful signal.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices['Desktop Chrome'],
    // Tall enough that the long inspector and session screens are laid out in
    // one column. Nothing is asserted on scroll position; Playwright scrolls
    // controls into view before clicking them.
    viewport: { width: 1100, height: 1400 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'expo-web-export' }],
});
