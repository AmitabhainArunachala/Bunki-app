/**
 * Playwright configuration for the Phase-0 web E2E (WP-10, controller §17.5).
 *
 * This is the *only* Playwright config in the repository. The T-17 closed-loop
 * lane and the two adversarial lanes each grew one on their own branch; the
 * WP-10 closeout reconciled them into this file, so every lane's specs are
 * discovered by one config, run by one `npm run test:e2e`, and fail one CI job.
 * A per-lane config would let a lane go red on its own, and a lane that can go
 * red on its own is a lane that can be ignored on its own.
 *
 * ## Choices that are assertions, not preferences
 *
 * **`retries: 0`.** A retry turns a flake into a pass and a real intermittent
 * defect into noise. T-17 is the test the whole phase is judged by, and the
 * storm lanes exist precisely to find intermittent defects; retrying either
 * would delete the finding.
 *
 * **`fullyParallel: true`, isolated contexts.** Each test gets its own browser
 * context, which means its own `localStorage` — and `localStorage` is where this
 * build's durable log lives. Sharing it between tests would let one test's
 * events show up in another test's evidence inspector.
 *
 * **The export must already exist.** Nothing here builds it. A config that
 * silently rebuilt would make "the E2E passed" ambiguous about *which* bundle
 * passed; `npm run test:e2e:build` is the named step, and both harnesses throw
 * with that exact command when `apps/app/dist` is missing.
 *
 * **`testMatch: '**\/*.spec.ts'`.** Every lane's specs, discovered from one
 * config, because the §17.2 adversarial matrix and the T-17 loop are supposed to
 * fail the same PR. A lane adds a file and is picked up with no wiring.
 *
 * **`timeout: 120_000`.** Set by the longest honest test rather than the
 * average: the restart storm reloads a dozen times inside one test. Generous on
 * a cold runner, still fast enough to be a useful signal.
 *
 * **`executablePath` from the harness.** This environment ships a Chromium at
 * `/opt/pw-browsers/chromium` older than the revision `@playwright/test` would
 * fetch. Using it keeps the suite runnable here without pinning a different
 * Playwright version; when it is absent — CI, after `npx playwright install
 * chromium` — the key is omitted entirely and Playwright's own pinned build
 * wins. Omitted rather than set to `undefined`, because the repository compiles
 * with `exactOptionalPropertyTypes`, where those are not the same thing.
 *
 * **Chromium only, recorded rather than implied.** One engine on one platform is
 * what this environment can honestly claim (REQ-GATE-03). The accessibility
 * results are therefore scoped "Chromium/axe on Expo Web" everywhere they are
 * reported, and no cross-browser or assistive-technology claim is made from
 * them.
 */

import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';

import { preinstalledChromium } from './support/adv-harness.ts';

const executablePath = preinstalledChromium();

export default defineConfig({
  // Relative, and resolved by Playwright against this file's directory. The
  // obvious spelling — `dirname(fileURLToPath(import.meta.url))` — cannot be
  // used: Playwright compiles the config to CommonJS, and an `import.meta` in
  // the output makes Node re-classify the compiled file as ESM, so it fails on
  // its own `exports`. The `dist` path the fixtures need is derived from
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
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices['Desktop Chrome'],
    // Tall enough that the long inspector and session screens lay out in one
    // column. Nothing is asserted on scroll position; Playwright scrolls
    // controls into view before clicking them.
    viewport: { width: 1100, height: 1400 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  projects: [{ name: 'expo-web-export' }],
});
