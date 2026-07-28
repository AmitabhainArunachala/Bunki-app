/**
 * The adversarial lanes' harness (WP-10, controller §17.2; orchestration §4
 * lanes T3 and T4).
 *
 * Everything here serves one rule: **the thing under test is the shipped
 * bundle**. Not a dev server, not a component mounted in a renderer, not a
 * fixture that resembles the app. `expo export --platform web` writes
 * `apps/app/dist`, this module serves exactly those bytes over loopback, and
 * every assertion in these lanes is made against a browser that loaded them.
 *
 * That distinction is the definition-of-done's first comes-up-short item —
 * "tests pass but the app doesn't" — turned into a fixture. A harness that
 * rebuilt, transpiled, or stubbed anything would put that item back.
 *
 * ## Why a hand-written host rather than Playwright's `webServer`
 *
 * Two reasons, both load-bearing for these lanes specifically:
 *
 *   1. **The restart storm must not restart the host.** T-16-web asks whether
 *      *data* survives a restart. A host that went away between cycles would
 *      confound "the app lost the data" with "the server lost the file", so the
 *      host is started once per worker and the *browser context* is what dies.
 *
 *   2. **The offline storm needs a host that is not the network.** T-10 asks
 *      whether the app works with the AI unavailable. Making that honest means
 *      severing everything that leaves the origin while leaving the origin
 *      reachable — which requires knowing exactly what the origin is. See
 *      {@link blockEverythingOffOrigin}.
 *
 * ## The dynamic-route fallback, and why it is not cheating
 *
 * Expo's static export writes `word/[lexemeId].html` and `kanji/[character].html`
 * — literal bracket filenames, because a static export cannot enumerate every
 * lexeme. A real static host (and `expo serve`) resolves `/word/bunki` to that
 * file and lets the client router read the parameter. {@link startAppHost} does
 * the same and nothing else: no rewritten content, no injection, no synthesised
 * routes. A path with no static counterpart 404s, so a test cannot pass by
 * asking for a page the export never produced.
 *
 * ## Where `dist` comes from
 *
 * From `testInfo.project.testDir`, not from `import.meta.url` and not from
 * `process.cwd()`. Playwright compiles this tree to CommonJS, where
 * `import.meta` is a syntax error in the output; and a path derived from the
 * working directory makes the suite pass or fail depending on which directory
 * the runner was invoked from, which is a trap rather than a check.
 */

import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import process from 'node:process';

import { expect, test as base, type Locator, type Page } from '@playwright/test';

const BUILD_COMMAND = 'npm run test:e2e:build';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** `apps/app/dist`, given `apps/app/e2e`. */
export function distDirFor(testDir: string): string {
  return resolve(testDir, '..', 'dist');
}

export interface AppHost {
  readonly origin: string;
  readonly distDir: string;
  readonly close: () => Promise<void>;
}

/**
 * Resolve a URL path to a file inside the export, or `null`.
 *
 * Exported because it is the only routing policy in this harness, and a policy
 * nobody can read in isolation is a policy nobody checks.
 */
export function resolveExportPath(urlPath: string, distDir: string): string | null {
  const decoded = safeDecode(urlPath);
  if (decoded === null) return null;

  const withinRoot = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const candidate = resolve(distDir, `.${withinRoot.startsWith('/') ? '' : '/'}${withinRoot}`);

  // Path traversal, closed explicitly. This harness serves a build directory to
  // a browser we are deliberately making hostile; it should not also be a file
  // server for the repository.
  if (candidate !== distDir && !candidate.startsWith(`${distDir}${sep}`)) return null;

  for (const attempt of routeCandidates(candidate)) {
    if (existsSync(attempt) && statSync(attempt).isFile()) return attempt;
  }
  return null;
}

/**
 * The paths a request may legitimately resolve to, in order.
 *
 * The bracket file is last: `/word/anything` falls back to `word/[lexemeId].html`
 * only when no literal file matched first.
 */
function routeCandidates(candidate: string): readonly string[] {
  const attempts = [candidate, `${candidate}.html`, join(candidate, 'index.html')];
  const bracketSibling = bracketFileIn(dirname(candidate));
  return bracketSibling === null ? attempts : [...attempts, bracketSibling];
}

/**
 * The single `[param].html` file in a directory, if there is exactly one.
 *
 * "Exactly one" matters: two bracket files in one directory would make the
 * fallback ambiguous, and an ambiguous route silently picking a winner is how a
 * test ends up asserting against a page nobody meant to serve.
 */
function bracketFileIn(directory: string): string | null {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return null;
  const brackets = readdirSync(directory).filter(
    (name) => name.startsWith('[') && name.endsWith('].html'),
  );
  return brackets.length === 1 ? join(directory, brackets[0] as string) : null;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Serve the export on an ephemeral loopback port.
 *
 * Fails loudly, naming the build command, when the export is missing. Silently
 * building here would make "the E2E passed" ambiguous about *which* bundle
 * passed.
 */
export async function startAppHost(distDir: string): Promise<AppHost> {
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error(
      `No web export at ${distDir}. Build it first:\n\n    ${BUILD_COMMAND}\n\n` +
        'This harness deliberately does not build: the point of these lanes is ' +
        'to test the bundle a release would ship.',
    );
  }

  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0] ?? '/';
    const file = resolveExportPath(path, distDir);

    if (file === null) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`no export artefact for ${path}`);
      return;
    }

    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      // The restart storm reloads the same URL many times. A cached document
      // would make "it came back" untestable.
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(response);
  });

  await new Promise<void>((listening) => {
    server.listen(0, '127.0.0.1', listening);
  });

  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    distDir,
    close: () =>
      new Promise<void>((done, fail) => {
        server.close((error) => {
          if (error) fail(error);
          else done();
        });
      }),
  };
}

/**
 * The browser binary to drive.
 *
 * This environment ships a Chromium under `PLAYWRIGHT_BROWSERS_PATH`
 * (`/opt/pw-browsers/chromium`) whose revision predates the one
 * `@playwright/test` would download. Pointing at it keeps these lanes runnable
 * here without pinning a Playwright version different from the T-17 lane's, and
 * returning `undefined` when it is absent leaves CI — which runs
 * `npx playwright install chromium` — on the version-matched download.
 *
 * `BUNKI_E2E_CHROMIUM` overrides both, so a reviewer can aim the same suite at
 * a browser of their choosing without editing a config.
 */
export function preinstalledChromium(): string | undefined {
  const override = process.env['BUNKI_E2E_CHROMIUM'];
  if (override !== undefined && override.trim() !== '') return override;
  const wellKnown = '/opt/pw-browsers/chromium';
  return existsSync(wellKnown) ? wellKnown : undefined;
}

/**
 * `test`, with the host attached.
 *
 * Worker-scoped: one host per worker, reused by every test in it, so a restart
 * storm can kill browser contexts without the origin changing underneath it.
 *
 * The first type argument is `object`, not `Record<string, never>`. The latter
 * reads as "no test-scoped fixtures" but is an index signature, so it also
 * claims every string key maps to `never` — which makes the *worker* fixture
 * below fail to typecheck with "AppHost is not assignable to never".
 */
export const test = base.extend<object, { app: AppHost }>({
  app: [
    // `browserName` is destructured because Playwright requires the first
    // parameter to be an object pattern and the repository's lint forbids an
    // empty one — but it is not filler. Every file in these lanes states its
    // scope as "Chromium on Expo Web" (REQ-GATE-03), and this is the one place
    // that can check the sentence against what actually ran. Adding an engine
    // means updating those statements, and this is what will say so.
    async ({ browserName }, use, workerInfo) => {
      if (browserName !== 'chromium') {
        throw new Error(
          `These lanes ran on ${browserName}, but every scope statement in them says ` +
            '"Chromium on Expo Web". Update those statements before widening the matrix — ' +
            'an accessibility or storm result attributed to the wrong engine is a false claim.',
        );
      }
      const host = await startAppHost(distDirFor(workerInfo.project.testDir));
      await use(host);
      await host.close();
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';

/* ------------------------------------------------------------------ *
 * Driving the app
 * ------------------------------------------------------------------ */

/**
 * Where the walked loop starts.
 *
 * Not `/`. Wave D made `/` the map and moved capture to `/capture` as an action
 * offered from every surface (`src/ui/navigation.ts` §1–§2). Every helper in
 * this file below `keepWord` assumes the capture screen, so the default lands
 * there rather than making thirty call sites say so — and it is named rather
 * than inlined, so a reader who wonders why `openApp` is not the front door has
 * this paragraph instead of a bare string.
 */
export const LOOP_START = '/capture';

/** Open a route and wait until the client has rendered into the empty document. */
export async function openApp(page: Page, origin: string, path = LOOP_START): Promise<void> {
  await page.goto(`${origin}${path}`, { waitUntil: 'load' });
  await hydrated(page);
}

/**
 * Hydration, defined as something only the client can have done.
 *
 * Expo's static export ships an empty document — `dist/index.html` contains no
 * `nav-shell`, no `capture-search-input`, no app markup at all; React renders
 * the whole tree on the client. The nav shell therefore *is* the hydration
 * signal, and it is the only one that holds on every route, which matters
 * because a reload lands wherever the learner was rather than at the front door.
 *
 * The signal is `nav-shell` — the shell's own root — rather than one of its
 * links. It used to be `nav-capture`, which stopped being a tab in Wave D; a
 * hydration signal that is any one destination is a signal that breaks when the
 * information architecture changes, which is exactly what it just did.
 *
 * `visibleTestId` rather than `getByTestId` throughout this module, and that is
 * not a convenience — see its own note. Navigating back to a screen leaves the
 * previous instance mounted, so `getByTestId('capture-search-input')` resolves
 * to several elements after two presses of the nav shell. That is finding
 * **T3-2** (`adv-known-defects.spec.ts`); working around it here keeps the storm
 * lanes measuring durability instead of re-measuring one defect in four places.
 */
export async function hydrated(page: Page): Promise<void> {
  await expect(visibleTestId(page, 'nav-shell')).toBeVisible({ timeout: 30_000 });
}

/** Hydrated, and showing the capture screen. */
export async function onCaptureScreen(page: Page): Promise<void> {
  await hydrated(page);
  await expect(visibleTestId(page, 'capture-search-input')).toBeVisible();
}

export function testId(page: Page, id: string): Locator {
  return page.getByTestId(id);
}

/**
 * The one *visible* element with this test id.
 *
 * Expo Router keeps previously visited screens mounted (finding T3-2), so a
 * plain `getByTestId` can resolve to a stack of same-id nodes of which exactly
 * one is on screen. Filtering to the visible one is what the learner sees;
 * `.first()` would sometimes pick a hidden ancestor screen and assert against a
 * stale render.
 */
export function visibleTestId(page: Page, id: string): Locator {
  return page.getByTestId(id).locator('visible=true');
}

/** The number of mounted instances of a screen, visible or not. */
export async function mountedScreenCount(page: Page, screenTestId: string): Promise<number> {
  return page.getByTestId(screenTestId).count();
}

/**
 * Keep a word: type it, wait for the answer card, press Keep.
 *
 * Returns the acknowledgment text. Waiting for the answer card is what makes
 * the press meaningful — pressing Keep before a result exists captures the raw
 * query and quietly tests something else.
 */
export async function keepWord(page: Page, query: string): Promise<string> {
  await visibleTestId(page, 'capture-search-input').fill(query);
  await expect(visibleTestId(page, 'capture-top-answer')).toBeVisible();
  await visibleTestId(page, 'capture-keep').click();
  const ack = visibleTestId(page, 'capture-acknowledgment');
  await expect(ack).toBeVisible();
  return (await ack.innerText()).trim();
}

/** How many threads the capture screen says are kept, read from its own heading. */
export async function keptThreadCount(page: Page): Promise<number> {
  const heading = await visibleTestId(page, 'capture-threads').innerText();
  const match = /Kept threads \((\d+)\)/.exec(heading);
  if (match === null) {
    throw new Error(`Could not read the kept-thread count from:\n${heading}`);
  }
  return Number.parseInt(match[1] as string, 10);
}

/**
 * Take a thread up for study from the capture screen.
 *
 * The per-thread button, not a bulk action: `learn` is the rung that activates
 * retrieval contracts, and it is only ever reached by a press (REQ-DM-09).
 */
export async function takeUpForStudy(page: Page): Promise<void> {
  const promote = page
    .getByTestId(/^capture-promote-/)
    .locator('visible=true')
    .first();
  await expect(promote).toBeVisible();
  await promote.click();
}

/**
 * Drive a sitting from composition to its explicit end screen.
 *
 * Written as a bounded loop over the step kinds the screen can show rather than
 * as a fixed script, because a fixed script would silently stop testing the day
 * the plan's recipe changes. The bound is what makes it a T-13 check as well as
 * a fixture: a session that cannot be finished in {@link MAX_SESSION_STEPS}
 * presses is a queue that grew, and this throws rather than spinning.
 *
 * `grade` is a parameter because the storms need an *ordinary* sitting; the
 * reveal-forces-Again rule is WP-08's unit test and T-12's E2E, not this lane's.
 */
export const MAX_SESSION_STEPS = 20;

export async function runSessionToCompletion(
  page: Page,
  grade: 'again' | 'hard' | 'good' | 'easy' = 'good',
): Promise<string> {
  await visibleTestId(page, 'session-start').click();
  await expect(visibleTestId(page, 'session-plan')).toBeVisible();

  for (let pressed = 0; pressed < MAX_SESSION_STEPS; pressed += 1) {
    const completion = visibleTestId(page, 'session-completion');
    if (await completion.isVisible().catch(() => false)) {
      return (await completion.innerText()).trim();
    }

    const close = visibleTestId(page, 'session-close');
    if (await close.isVisible().catch(() => false)) {
      await close.click();
      continue;
    }

    const canvasDone = visibleTestId(page, 'session-complete-canvas');
    if (await canvasDone.isVisible().catch(() => false)) {
      await canvasDone.click();
      continue;
    }

    const gradeButton = visibleTestId(page, `session-grade-${grade}`);
    if (await gradeButton.isVisible().catch(() => false)) {
      await gradeButton.click();
      continue;
    }

    throw new Error(
      'The session showed no completion, no close, no canvas step and no grade button. ' +
        `Screen was:\n${await visibleTestId(page, 'screen-session').innerText()}`,
    );
  }

  throw new Error(
    `The sitting did not reach its end screen in ${String(MAX_SESSION_STEPS)} presses. ` +
      'A finite session that cannot be finished is the T-13 failure, not a slow test.',
  );
}

/**
 * Export from the inspector and return the badge's own words.
 *
 * The badge is read rather than re-derived: the verification the operator sees
 * is the verification under test (definition-of-done §3 step 8).
 */
export async function exportAndVerify(page: Page): Promise<string> {
  await visibleTestId(page, 'evidence-export-button').click();
  const badge = visibleTestId(page, 'evidence-export-badge');
  await expect(badge).toBeVisible();
  return (await badge.innerText()).trim();
}

/**
 * The durable log the web adapter keeps, read out of the browser.
 *
 * This is the storm lanes' ground truth. Counting rows in the inspector would
 * test the inspector; reading the store's own serialised log tests the store,
 * which is what T-16 is about. Keys are discovered rather than hard-coded, so
 * renaming the snapshot key in the adapter fails here loudly instead of turning
 * this into a check that always sees zero — {@link expectDurableStoreFound}
 * makes that failure explicit.
 */
export async function durableSnapshots(page: Page): Promise<readonly DurableSnapshot[]> {
  return page.evaluate(() => {
    const storage = globalThis.localStorage;
    const out: { key: string; events: unknown[] }[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key === null) continue;
      const raw = storage.getItem(key);
      if (raw === null) continue;
      try {
        const parsed = JSON.parse(raw) as { events?: unknown };
        if (Array.isArray(parsed.events)) out.push({ key, events: parsed.events });
      } catch {
        // Not our snapshot. Ignored rather than failed: the profile is ours, but
        // asserting nothing else ever writes to it would be a check about
        // Chromium, not about Bunki.
      }
    }
    return out;
  });
}

export interface DurableSnapshot {
  readonly key: string;
  readonly events: readonly unknown[];
}

/** Total durable events across every snapshot the origin holds. */
export async function durableEventCount(page: Page): Promise<number> {
  const snapshots = await durableSnapshots(page);
  return snapshots.reduce((total, snapshot) => total + snapshot.events.length, 0);
}

/** Every durable event's `type`, in log order. */
export async function durableEventTypes(page: Page): Promise<readonly string[]> {
  const snapshots = await durableSnapshots(page);
  return snapshots.flatMap((snapshot) =>
    snapshot.events.map((event) => String((event as { type?: unknown }).type)),
  );
}

/**
 * The shape of a `CandidateAttached` event, as far as the label audits read it.
 *
 * Only the fields that carry a claim. Re-declaring the whole frozen schema here
 * would give the repository a second definition of it that could drift.
 */
export interface AttachedCandidateEvent {
  readonly candidateId: string;
  readonly status: string;
  readonly envelope: { readonly provider: string; readonly model: string };
}

/**
 * Every `CandidateAttached` in the durable log.
 *
 * Read from the log rather than from the panel on purpose: the label audits ask
 * what *entered the record*, and a candidate the UI never showed is exactly the
 * case a screen-level check would miss.
 */
export async function candidateEvents(page: Page): Promise<readonly AttachedCandidateEvent[]> {
  const snapshots = await durableSnapshots(page);
  return snapshots
    .flatMap((snapshot) => snapshot.events)
    .filter(
      (event): event is AttachedCandidateEvent & { type: 'CandidateAttached' } =>
        typeof event === 'object' &&
        event !== null &&
        (event as { type?: unknown }).type === 'CandidateAttached',
    );
}

/**
 * Assert that a durable log exists at all.
 *
 * Without this, every "the count did not drop" assertion in the storm lanes
 * would pass vacuously on a build that stopped persisting entirely.
 */
export async function expectDurableStoreFound(page: Page): Promise<void> {
  const snapshots = await durableSnapshots(page);
  expect(
    snapshots.length,
    'No durable snapshot in localStorage. Either the web adapter stopped persisting, or its ' +
      'storage shape changed and this harness can no longer see it — both are findings, not ' +
      'reasons to pass.',
  ).toBeGreaterThan(0);
}

/* ------------------------------------------------------------------ *
 * Making the world hostile
 * ------------------------------------------------------------------ */

/**
 * Abort every request that leaves the origin (T-10's "AI unavailable").
 *
 * `context.setOffline(true)` was rejected as the primary mechanism: it also
 * severs the loopback host, so the page could not load and the test would prove
 * only that a blank tab cannot lose data. This blocks the outside world and
 * leaves the app's own bytes reachable, which is the condition the requirement
 * actually describes.
 *
 * Returns the accumulating list of blocked URLs, so a test can assert on what
 * the app *tried*: "it worked offline" is much weaker evidence than "it worked
 * offline and these were the only requests it attempted".
 */
export async function blockEverythingOffOrigin(page: Page, origin: string): Promise<string[]> {
  const blocked: string[] = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (isLocal(url, origin)) {
      await route.continue();
      return;
    }
    blocked.push(url);
    await route.abort('internetdisconnected');
  });
  return blocked;
}

/**
 * Hold every off-origin request open past any caller's patience (T-11).
 *
 * A timeout is not the same failure as a refusal: a refusal fails fast, a hang
 * occupies whatever the caller was doing. This handler never fulfils and never
 * aborts, so anything the app awaits stays awaited — which turns "capture still
 * works" into an assertion about *blocking* rather than about error handling.
 */
export async function hangEverythingOffOrigin(page: Page, origin: string): Promise<string[]> {
  const hung: string[] = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (isLocal(url, origin)) {
      await route.continue();
      return;
    }
    hung.push(url);
    await new Promise(() => undefined); // never settled, on purpose
  });
  return hung;
}

function isLocal(url: string, origin: string): boolean {
  return url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:');
}

/* ------------------------------------------------------------------ *
 * Reading the shipped bytes
 * ------------------------------------------------------------------ */

/** Every file in the export, recursively, as absolute paths. */
export function exportFiles(distDir: string): readonly string[] {
  const out: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  walk(distDir);
  return out.sort();
}

/** Read one shipped file as text. */
export async function readExportFile(distDir: string, relative: string): Promise<string> {
  return readFile(join(distDir, relative), 'utf8');
}
