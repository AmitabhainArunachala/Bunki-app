/**
 * Driving the exported app the way a person does (WP-10).
 *
 * ## The one thing this file exists to solve
 *
 * `expo-router` uses a stack navigator, and a stack keeps the screens you came
 * from mounted. After capture → session → capture there are two `screen-capture`
 * nodes in the document: the one you left, inside an `aria-hidden` container
 * collapsed to zero size, and the live one. A naive `data-testid` lookup matches
 * both, and the first match is the stale screen — so a test written against it
 * would type into a text field nobody can see and then assert on a screen the
 * learner is not looking at.
 *
 * {@link live} resolves that the way a screen reader and a person both do: only
 * elements that actually occupy space, and the last of them, which is the top of
 * the stack. Everything else in this file goes through it, so no spec has to
 * remember the rule.
 *
 * ## What the helpers are allowed to do
 *
 * Click, type, read text, reload. Nothing here reaches into React, patches a
 * global, seeds a store, or sets a flag that changes app behaviour: the loop
 * under test is the one the operator walks, and a fixture that shortcut any part
 * of it would be testing a path the operator cannot take. The single exception
 * is {@link persistedEventTypes}, which *reads* (never writes) the durable
 * snapshot the web adapter keeps — an independent look at what survived, used to
 * cross-check what the screen claims.
 */

import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { resolve } from 'node:path';

import { startExportHost, type ExportHost } from './export-server.ts';

/**
 * The canonical fixture (OD-02) and the seed entry the passage is written
 * around. Written here as the operator would type it, not imported from the
 * seed: the point of the E2E is that the *shipped bundle* knows this word.
 */
export const TARGET = '分岐';
export const TARGET_LEXEME_ID = 'lex-bunki';

/**
 * Where the web adapter keeps its snapshot (`apps/app/src/state/persistence/
 * shared.ts` → `STORE_NAME`).
 *
 * Duplicated deliberately. Importing the constant would make this file resolve
 * an app module, and the value being asserted is a property of *the built
 * bundle's* storage, not of the source that was compiled into it. If the key
 * changes, this test should fail and be updated — that is the alarm working.
 */
const SNAPSHOT_KEY = 'bunki-phase0';

export interface AppFixtures {
  readonly app: AppDriver;
}

export interface WorkerFixtures {
  readonly exportHost: ExportHost;
}

/**
 * One static host per worker, one browser context per test.
 *
 * Per worker because starting a server is the expensive part; per test because
 * `localStorage` is the app's durable store, and a test that inherited another
 * test's log would be reading somebody else's evidence. Playwright gives each
 * test a fresh context by default, which is exactly the isolation this needs.
 */
export const test = base.extend<AppFixtures, WorkerFixtures>({
  exportHost: [
    // The empty pattern is Playwright's declaration syntax, not a slip: the
    // runner reads the destructured names to work out which fixtures this one
    // depends on, and `{}` is how a fixture says "none". Replacing it with an
    // ordinary parameter would change what the runner infers.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      // `project.testDir` is this directory, absolute, resolved by Playwright —
      // the config cannot compute a path of its own (see the note there), so the
      // export's location is derived from the one absolute path the runner hands
      // us rather than from the process's working directory.
      const dist = resolve(workerInfo.project.testDir, '../dist');
      const host = await startExportHost(dist);
      await use(host);
      await host.close();
    },
    { scope: 'worker' },
  ],

  app: async ({ page, exportHost }, use) => {
    await use(new AppDriver(page, exportHost.baseUrl));
  },
});

export { expect };

/**
 * The visible instance of a test id.
 *
 * `filter({ visible: true })` drops the popped screens — react-navigation
 * collapses them to a zero-size box — and `.last()` takes the top of the stack
 * when a transition briefly leaves two on screen.
 */
export function live(page: Page, testId: string): Locator {
  return page.locator(`[data-testid="${testId}"]`).filter({ visible: true }).last();
}

/** Every visible element whose test id starts with `prefix`, in DOM order. */
export function liveAll(page: Page, prefix: string): Locator {
  return page.locator(`[data-testid^="${prefix}"]`).filter({ visible: true });
}

export class AppDriver {
  constructor(
    readonly page: Page,
    readonly baseUrl: string,
  ) {}

  // ---------------------------------------------------------------- primitives

  testId(id: string): Locator {
    return live(this.page, id);
  }

  all(prefix: string): Locator {
    return liveAll(this.page, prefix);
  }

  /**
   * The persistent masthead's links.
   *
   * Outside the stack, so exactly one of each exists and no visibility filter is
   * needed. These are the doors `src/ui/navigation.ts` calls `shell` reach.
   */
  nav(label: 'capture' | 'session' | 'evidence' | 'about-diagnostics'): Locator {
    return this.page.getByTestId(`nav-${label}`);
  }

  /** A control identified the way a screen reader identifies it. */
  button(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true }).filter({ visible: true }).last();
  }

  async open(path = '/'): Promise<void> {
    await this.page.goto(`${this.baseUrl}${path}`);
    await this.testId('screen-capture').waitFor({ timeout: 30_000 });
  }

  /**
   * Reload the page as a person would: the same URL, a cold bundle, nothing
   * carried over but what the app itself wrote down.
   */
  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: 'load' });
  }

  // ------------------------------------------------------------ the loop steps

  /**
   * Step 1 — put the encounter in front of the app and keep it.
   *
   * Typing into the field is the paste; the top answer is the app resolving it
   * against the seed; the uncertainty chip is REQ-UI-01's one-gesture mark and is
   * pressed *before* Keep so the mark travels on the captured event rather than
   * being an annotation added afterwards.
   */
  async captureAndKeep(text = TARGET, mark: string | null = 'reading'): Promise<void> {
    await this.testId('capture-search-input').fill(text);
    await this.testId('capture-top-answer').waitFor();
    if (mark !== null) await this.testId(`capture-mark-${mark}`).click();
    await this.testId('capture-keep').click();
    await this.testId('capture-acknowledgment').waitFor();
  }

  /** The kept thread's own "take it up for study" button, whatever its id. */
  promoteButton(): Locator {
    return this.all('capture-promote-').first();
  }

  /** The marker the capture screen renders once a thread is on an active rung. */
  promotedNote(): Locator {
    return this.all('capture-promoted-').first();
  }

  /**
   * Step 3 — ask for the bounded AI note on the word page.
   *
   * `capture-open-word` is the door the capture screen offers, so the panel is
   * reached the way `navigation.ts` says it is reached rather than by a URL the
   * learner would have to know.
   */
  async openWordPageFromCapture(): Promise<void> {
    await this.testId('capture-open-word').click();
    await this.testId('word-candidate-panel').waitFor();
  }

  async requestCandidate(): Promise<void> {
    await this.testId('candidate-request').click();
    await this.testId('candidate-card').waitFor({ timeout: 30_000 });
  }

  // ------------------------------------------------------------- durable state

  /**
   * The event types actually written to the durable snapshot, read straight out
   * of the browser's storage.
   *
   * This is the only place a test looks past the rendered surface, and it is here
   * because "the thread survived" and "the export is complete" are claims about
   * bytes. Reading them independently is what stops the suite from proving only
   * that a screen is willing to say so.
   */
  async persistedEventTypes(): Promise<readonly string[]> {
    return (await this.persistedEvents()).map((event) => String(event['type'] ?? 'unknown'));
  }

  /**
   * The durable snapshot's events, whole (WP-10).
   *
   * The same read as {@link persistedEventTypes} without discarding the payload,
   * because the export lane has claims that a type list cannot carry: that the
   * `SessionClosed` says `completed`, that the graded review is tier A, that the
   * canvas produced a tier-D exposure beside it. Those are the *content* of the
   * evidence, and a suite that only counted families would pass over a log whose
   * every event said the wrong thing.
   *
   * Still a read and still independent: this is the browser's own storage, which
   * is where `prepareExport` gets the events it serialises, so asserting on it is
   * asserting on the export's source rather than on a screen's summary of it.
   */
  async persistedEvents(): Promise<readonly Record<string, unknown>[]> {
    return this.page.evaluate((key) => {
      const raw = globalThis.localStorage.getItem(key);
      if (raw === null) return [];
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return [];
      const events = (parsed as { events?: unknown }).events;
      if (!Array.isArray(events)) return [];
      return events.filter(
        (event: unknown): event is Record<string, unknown> =>
          typeof event === 'object' && event !== null,
      );
    }, SNAPSHOT_KEY);
  }
}
