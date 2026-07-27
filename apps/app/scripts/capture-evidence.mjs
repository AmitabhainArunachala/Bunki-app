/**
 * Screenshot and accessibility-tree evidence for WP-05 (controller §19 WP-05:
 * "screenshot evidence saved under docs/build-evidence/").
 *
 * It serves the real `expo export --platform web` output and drives a real
 * browser over the Chrome DevTools Protocol. Nothing is mocked: the pages are
 * the exported bundle, the clicks are input events, the offline state comes
 * from the browser's own network emulation, and the two colour schemes are the
 * app's own `?scheme=` flag rather than a screenshot filter.
 *
 * A screenshot cannot photograph an accessibility tree, and an accessibility
 * claim that nothing measures is how `ruby.tsx` came to say the furigana pieces
 * were hidden while every one of them was exposed. So after the shots this
 * script also runs an **audit** pass: it asks Chrome for the real accessibility
 * subtree under a rendered component and asserts what a screen reader would
 * find there. Results go to `accessibility-audit.json` beside the PNGs, and a
 * failed assertion fails the run.
 *
 * No new dependency: Node 22 has a global `WebSocket`, and CDP is a JSON
 * protocol over one. Adding Playwright here would put a package outside WP-00's
 * verified register into the build for something eighty lines of protocol can
 * do — and Playwright belongs to WP-10, which owns `apps/app/e2e/`.
 *
 * Usage:  node apps/app/scripts/capture-evidence.mjs [--out DIR] [--dist DIR]
 *
 * Exits non-zero if any shot fails, so a broken screen cannot pass silently as
 * "no evidence produced".
 */

// Everything ambient is imported rather than taken from the global scope.
// `apps/app` is linted as application code, where `process`, `Buffer` and the
// timer globals are not declared — and importing them is the honest spelling
// anyway: this file is a Node script that happens to live next to a React app.
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { clearTimeout as clearTimer, setTimeout as setTimer } from 'node:timers';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

// Node 22 ships a global WebSocket; CDP needs nothing else.
const { WebSocket } = globalThis;

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(APP_ROOT, '../..');

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};

const DIST = resolve(argValue('--dist', join(APP_ROOT, 'dist')));
const OUT = resolve(argValue('--out', join(REPO_ROOT, 'docs/build-evidence/screenshots-wp05')));

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
];

const VIEWPORT = { width: 960, height: 1200 };
/** Hard cap on a full-page capture, so one long page cannot produce a 20 MB PNG. */
const MAX_PAGE_HEIGHT = 5200;

// ---------------------------------------------------------------------------
// Static server over the export
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

/**
 * Map a request path onto the export's files.
 *
 * `expo export` static-renders a dynamic route to a literal
 * `word/[lexemeId].html`, so `/word/lex-bunki` has no file of its own. Serving
 * the parameterised page for it is what a real static host would be configured
 * to do, and it is what lets the client router see the actual URL.
 */
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const direct = join(DIST, clean);

  if (clean !== '/' && existsSync(direct) && extname(direct) !== '') return direct;
  if (clean === '/' || clean === '') return join(DIST, 'index.html');

  const segments = clean.split('/').filter(Boolean);
  if (segments.length === 2) {
    const [group] = segments;
    const parameterised =
      group === 'word'
        ? join(DIST, 'word/[lexemeId].html')
        : group === 'kanji'
          ? join(DIST, 'kanji/[character].html')
          : null;
    if (parameterised !== null && existsSync(parameterised)) return parameterised;
  }

  const asHtml = `${direct}.html`;
  if (existsSync(asHtml)) return asHtml;
  const indexHtml = join(direct, 'index.html');
  if (existsSync(indexHtml)) return indexHtml;
  return join(DIST, '+not-found.html');
}

function startServer() {
  const server = createServer((request, response) => {
    try {
      const file = resolveFile(request.url ?? '/');
      const body = readFileSync(file);
      response.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(body);
    } catch (cause) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end(String(cause));
    }
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

// ---------------------------------------------------------------------------
// Chrome + CDP
// ---------------------------------------------------------------------------

async function launchChrome() {
  const binary = CHROME_CANDIDATES.find((path) => path !== undefined && existsSync(path));
  if (binary === undefined) {
    throw new Error(
      `no Chrome binary found. Set CHROME_PATH. Looked at: ${CHROME_CANDIDATES.filter(Boolean).join(', ')}`,
    );
  }

  const userDataDir = join(APP_ROOT, '.evidence-profile');
  rmSync(userDataDir, { recursive: true, force: true });

  const child = spawn(
    binary,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--font-render-hinting=none',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const endpoint = await new Promise((done, fail) => {
    const timer = setTimer(() => fail(new Error('Chrome did not report a debugging port')), 30_000);
    let buffer = '';
    child.stderr.on('data', (chunk) => {
      buffer += String(chunk);
      const match = /ws:\/\/[^\s]+/.exec(buffer);
      if (match !== null) {
        clearTimer(timer);
        done(match[0]);
      }
    });
    child.on('exit', (code) => fail(new Error(`Chrome exited early with code ${String(code)}`)));
  });

  return { child, endpoint, userDataDir };
}

/** A minimal CDP client: one socket, flat sessions, promise per command. */
function connect(endpoint) {
  const socket = new WebSocket(endpoint);
  const pending = new Map();
  const listeners = new Set();
  let nextId = 1;

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (entry === undefined) return;
      if (message.error !== undefined) entry.fail(new Error(JSON.stringify(message.error)));
      else entry.done(message.result);
      return;
    }
    for (const listener of listeners) listener(message);
  });

  const ready = new Promise((done, fail) => {
    socket.addEventListener('open', () => done());
    socket.addEventListener('error', (event) =>
      fail(new Error(`CDP socket error: ${String(event)}`)),
    );
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((done, fail) => {
      const id = nextId++;
      pending.set(id, { done, fail });
      const payload = { id, method, params };
      if (sessionId !== undefined) payload.sessionId = sessionId;
      socket.send(JSON.stringify(payload));
    });

  return {
    ready,
    send,
    on: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => socket.close(),
  };
}

// ---------------------------------------------------------------------------
// Page driving
// ---------------------------------------------------------------------------

class Page {
  constructor(cdp, sessionId) {
    this.cdp = cdp;
    this.sessionId = sessionId;
  }

  call(method, params) {
    return this.cdp.send(method, params, this.sessionId);
  }

  async setup() {
    await this.call('Page.enable');
    await this.call('Runtime.enable');
    await this.call('Network.enable');
    await this.call('DOM.enable');
    await this.setViewport(VIEWPORT.height);
  }

  /**
   * The accessibility subtree Chrome actually computes for one rendered
   * component, as an assistive technology would see it.
   *
   * `Accessibility.queryAXTree` returns every node under the element, including
   * the ones the browser ignores, each with its computed role and name — which
   * is the only way to tell "hidden from the accessibility tree" from "the prop
   * that was supposed to hide it was silently dropped".
   *
   * `InlineTextBox` nodes are dropped from the result: they are the layout
   * fragments of a `StaticText`, so counting them would report one text node
   * twice and turn a line wrap into a failure.
   */
  async axNodes(testId) {
    await this.call('Accessibility.enable');
    const { root } = await this.call('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await this.call('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: `[data-testid="${testId}"]`,
    });
    if (nodeId === 0) throw new Error(`no element with data-testid="${testId}"`);

    const { nodes } = await this.call('Accessibility.queryAXTree', { nodeId });
    return nodes
      .filter((node) => (node.role?.value ?? '') !== 'InlineTextBox')
      .map((node) => ({
        role: node.role?.value ?? '',
        name: node.name?.value ?? '',
        ignored: node.ignored === true,
      }));
  }

  setViewport(height) {
    return this.call('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  async goto(url) {
    const loaded = new Promise((done) => {
      const off = this.cdp.on((message) => {
        if (message.sessionId === this.sessionId && message.method === 'Page.loadEventFired') {
          off();
          done();
        }
      });
    });
    await this.call('Page.navigate', { url });
    await loaded;
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails !== undefined) {
      throw new Error(`evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
    }
    return result.result.value;
  }

  /** Wait for a `data-testid` to exist. react-native-web renders `testID` as that attribute. */
  async waitFor(testId, { timeoutMs = 15_000, absent = false } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const present = await this.evaluate(`!!document.querySelector('[data-testid="${testId}"]')`);
      if (present === !absent) return;
      if (Date.now() > deadline) {
        throw new Error(
          `timed out waiting for [data-testid="${testId}"] to be ${absent ? 'absent' : 'present'}`,
        );
      }
      await sleep(80);
    }
  }

  async click(testId) {
    await this.waitFor(testId);
    const clicked = await this.evaluate(`(() => {
      const node = document.querySelector('[data-testid="${testId}"]');
      if (node === null) return false;
      node.scrollIntoView({ block: 'center' });
      node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      node.click();
      return true;
    })()`);
    if (clicked !== true) throw new Error(`could not click [data-testid="${testId}"]`);
    await sleep(120);
  }

  async setOffline(offline) {
    await this.call('Network.emulateNetworkConditions', {
      offline,
      latency: 0,
      downloadThroughput: offline ? 0 : -1,
      uploadThroughput: offline ? 0 : -1,
    });
    // Chrome's emulation flips `navigator.onLine` and fires the event; give the
    // React subscription a tick to observe it.
    await sleep(200);
  }

  async shot(file) {
    // Clicking a control scrolls it into view; capturing from wherever that
    // left the page would crop the header off the evidence. Every shot starts
    // from the top of every scroller.
    await this.evaluate(`(() => {
      window.scrollTo(0, 0);
      for (const node of document.querySelectorAll('*')) {
        if (node.scrollTop > 0) node.scrollTop = 0;
      }
      return true;
    })()`);
    await sleep(120);

    // React Native Web scrolls *inside* the app (`body { overflow: hidden }`,
    // the ScrollView owns the scrollbar), so `body.scrollHeight` is always the
    // viewport and would silently crop every long page to one screen. The real
    // content height is the tallest internal scroller.
    const measure = `(() => {
      let tallest = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      for (const node of document.querySelectorAll('*')) {
        if (node.scrollHeight > node.clientHeight) {
          const top = node.getBoundingClientRect().top + window.scrollY;
          tallest = Math.max(tallest, top + node.scrollHeight);
        }
      }
      return Math.min(${MAX_PAGE_HEIGHT}, Math.max(tallest, ${VIEWPORT.height}));
    })()`;

    // Growing the viewport can reveal content that grows it again (a scroller
    // inside a scroller), so measure until it settles.
    let height = await this.evaluate(measure);
    for (let pass = 0; pass < 3; pass += 1) {
      await this.setViewport(height);
      await sleep(180);
      const next = await this.evaluate(measure);
      if (next <= height) break;
      height = next;
    }
    await this.setViewport(height);
    await sleep(220);
    const { data } = await this.call('Page.captureScreenshot', { format: 'png' });
    writeFileSync(file, Buffer.from(data, 'base64'));
    await this.setViewport(VIEWPORT.height);
    return height;
  }
}

// ---------------------------------------------------------------------------
// The shot list
// ---------------------------------------------------------------------------

/**
 * Every screenshot WP-05's evidence needs, as data.
 *
 * `states` is the REQ-UI-09 state (or `ready`) the shot demonstrates, and it is
 * written into the README index so a reviewer can check the four-state
 * requirement per screen without opening every PNG.
 */
function shotList(base) {
  const url = (path) => `${base}${path}`;

  return [
    // ---------------------------------------------------------- screen 1
    {
      name: '01-capture-empty-start',
      screen: 'capture',
      state: 'empty (no query yet)',
      note: 'The start state names the seed’s size and suggests the canonical fixture.',
      run: async (page) => {
        await page.goto(url('/'));
        await page.waitFor('state-empty');
      },
    },
    {
      name: '02-capture-loading',
      screen: 'capture',
      state: 'loading',
      note: 'Held open by the ?lag= evidence flag; the state machine is the app’s own.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90&lag=4000'));
        await page.waitFor('state-loading');
      },
    },
    {
      name: '03-capture-answer',
      screen: 'capture',
      state: 'ready',
      note: 'REQ-UI-01 “correct answer immediately”: top answer, Keep, and the five-way uncertainty gesture.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90'));
        await page.waitFor('capture-top-answer');
      },
    },
    {
      name: '04-capture-kept-enriching',
      screen: 'capture',
      state: 'ready (acknowledged, enrichment still running)',
      note: 'The acknowledgment is on screen while enrichment is still running — REQ-UI-01’s ordering, photographed.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90&lag=2500'));
        await page.waitFor('capture-top-answer', { timeoutMs: 20_000 });
        await page.click('capture-mark-reading');
        await page.click('capture-keep');
        await page.waitFor('capture-acknowledgment');
      },
    },
    {
      name: '05-capture-kept-enriched',
      screen: 'capture',
      state: 'ready (acknowledged, enrichment finished)',
      note: 'Both timestamps visible: the acknowledgment precedes the enrichment that follows it.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90'));
        await page.waitFor('capture-top-answer');
        await page.click('capture-mark-meaning');
        await page.click('capture-keep');
        await page.waitFor('capture-acknowledgment');
        await sleep(600);
      },
    },
    {
      name: '06-capture-double-tap-idempotent',
      screen: 'capture',
      state: 'ready (repeat keep)',
      note: 'Keep tapped twice: “Already kept”, no new events, still one thread.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90'));
        await page.waitFor('capture-top-answer');
        await page.click('capture-keep');
        await page.click('capture-keep');
        await page.waitFor('capture-acknowledgment');
        await sleep(400);
      },
    },
    {
      name: '07-capture-empty-no-match',
      screen: 'capture',
      state: 'empty (query matched nothing)',
      note: 'Says the seed has no entry, not that the word does not exist — carries SEED_COVERAGE_DISCLOSURE.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%9B%B3%E6%9B%B8%E9%A4%A8'));
        await page.waitFor('state-empty');
      },
    },
    {
      name: '08-capture-error',
      screen: 'capture',
      state: 'error',
      note: 'The real error path with a retry action, forced by ?fail=1.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90&fail=1'));
        await page.waitFor('state-error');
      },
    },
    {
      name: '09-capture-offline',
      screen: 'capture',
      state: 'offline',
      note: 'Browser network emulation, not a mock. The banner says what still works.',
      offline: true,
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90'));
        await page.waitFor('capture-top-answer');
        await page.setOffline(true);
        await page.waitFor('state-offline');
      },
    },
    {
      name: '10-capture-dark',
      screen: 'capture',
      state: 'ready (dark scheme)',
      note: 'The same screen in the dark palette; both schemes are asserted against WCAG AA in test/theme-contrast.test.ts.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90&scheme=dark'));
        await page.waitFor('capture-top-answer');
      },
    },

    // ---------------------------------------------------------- screen 2
    {
      name: '11-word-layers-0-1',
      screen: 'word',
      state: 'ready',
      note: 'REQ-UI-02 layers 0 and 1, with the seed entry disclosure above them and provenance under every field.',
      run: async (page) => {
        await page.goto(url('/word/lex-bunki'));
        await page.waitFor('word-layer-0');
      },
    },
    {
      name: '12-word-layers-2-3',
      screen: 'word',
      state: 'ready (deeper layers expanded)',
      note: 'Layers 2 and 3 as far as the seed reaches, with the unfilled sections naming what is missing and why.',
      run: async (page) => {
        await page.goto(url('/word/lex-bunki'));
        await page.waitFor('word-layer-0');
        await page.click('word-toggle-deeper');
        await page.waitFor('word-layer-3');
      },
    },
    {
      name: '13-word-with-thread',
      screen: 'word',
      state: 'ready (reached from a kept thread)',
      note: 'Kept on the capture screen, then navigated in-app: the word page shows the encounter, the mark, and the promotion ladder.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90'));
        await page.waitFor('capture-top-answer');
        await page.click('capture-mark-kanji');
        await page.click('capture-keep');
        await page.waitFor('capture-acknowledgment');
        await page.click('capture-open-word');
        await page.waitFor('word-layer-1');
        await sleep(300);
      },
    },
    {
      name: '14-word-loading',
      screen: 'word',
      state: 'loading',
      run: async (page) => {
        await page.goto(url('/word/lex-bunki?lag=4000'));
        await page.waitFor('state-loading');
      },
    },
    {
      name: '15-word-error',
      screen: 'word',
      state: 'error',
      run: async (page) => {
        await page.goto(url('/word/lex-bunki?fail=1'));
        await page.waitFor('state-error');
      },
    },
    {
      name: '16-word-empty',
      screen: 'word',
      state: 'empty (unknown id)',
      run: async (page) => {
        await page.goto(url('/word/lex-not-in-seed'));
        await page.waitFor('state-empty');
      },
    },
    {
      name: '17-word-offline',
      screen: 'word',
      state: 'offline',
      offline: true,
      run: async (page) => {
        await page.goto(url('/word/lex-bunki'));
        await page.waitFor('word-layer-0');
        await page.setOffline(true);
        await page.waitFor('state-offline');
      },
    },
    {
      name: '18-word-dark',
      screen: 'word',
      state: 'ready (dark scheme)',
      run: async (page) => {
        await page.goto(url('/word/lex-bunki?scheme=dark'));
        await page.waitFor('word-layer-0');
        await page.click('word-toggle-deeper');
        await page.waitFor('word-layer-3');
      },
    },

    // ---------------------------------------------------------- screen 3
    {
      name: '19-kanji-layers-0-1',
      screen: 'kanji',
      state: 'ready (stroke order complete)',
      note: 'REQ-UI-03 layers 0 and 1. Stroke paths are the seed’s KanjiVG files, with its CC BY-SA 3.0 attribution beneath.',
      run: async (page) => {
        await page.goto(url('/kanji/%E5%B2%90?strokes=all'));
        await page.waitFor('kanji-stroke-order');
        await sleep(300);
      },
    },
    {
      name: '20-kanji-stroke-midway',
      screen: 'kanji',
      state: 'ready (stroke 3 of 7)',
      note: 'The animation stepped by hand: written strokes in ink, the current stroke in the one accent, the rest ghosted.',
      run: async (page) => {
        await page.goto(url('/kanji/%E5%B2%90?strokes=all'));
        await page.waitFor('stroke-show-all');
        await page.click('stroke-step');
        await page.click('stroke-step');
        await page.click('stroke-step');
        await sleep(200);
      },
    },
    {
      name: '21-kanji-bunki',
      screen: 'kanji',
      state: 'ready (分, the other half of the canonical fixture)',
      run: async (page) => {
        await page.goto(url('/kanji/%E5%88%86?strokes=all'));
        await page.waitFor('kanji-stroke-order');
        await sleep(300);
      },
    },
    {
      name: '22-kanji-loading',
      screen: 'kanji',
      state: 'loading',
      run: async (page) => {
        await page.goto(url('/kanji/%E5%B2%90?lag=4000'));
        await page.waitFor('state-loading');
      },
    },
    {
      name: '23-kanji-error',
      screen: 'kanji',
      state: 'error',
      run: async (page) => {
        await page.goto(url('/kanji/%E5%B2%90?fail=1'));
        await page.waitFor('state-error');
      },
    },
    {
      name: '24-kanji-empty',
      screen: 'kanji',
      state: 'empty (character not in the seed)',
      run: async (page) => {
        await page.goto(url('/kanji/%E6%BC%A2'));
        await page.waitFor('state-empty');
      },
    },
    {
      name: '25-kanji-offline',
      screen: 'kanji',
      state: 'offline',
      offline: true,
      run: async (page) => {
        await page.goto(url('/kanji/%E5%B2%90?strokes=all'));
        await page.waitFor('kanji-stroke-order');
        await page.setOffline(true);
        await page.waitFor('state-offline');
      },
    },
    {
      name: '26-kanji-dark',
      screen: 'kanji',
      state: 'ready (dark scheme)',
      run: async (page) => {
        await page.goto(url('/kanji/%E5%B2%90?strokes=all&scheme=dark'));
        await page.waitFor('kanji-stroke-order');
        await sleep(300);
      },
    },
    {
      name: '27-capture-mark-after-keep',
      screen: 'capture',
      state: 'ready (mark applied after Keep)',
      note: 'The path that used to render a false sentence: kept with no mark, then marked. The acknowledgment lists the two events, and the note under the chips now says the mark is on this device only and not in the log.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90'));
        await page.waitFor('capture-top-answer');
        await page.click('capture-keep');
        await page.waitFor('capture-acknowledgment');
        await page.click('capture-mark-reading');
        await sleep(400);
      },
    },

    // ------------------------------------------------ screens 6 and 7 (WP-09)
    //
    // The inspector's states are reached by *using* the app rather than by a
    // flag wherever that is possible: its empty state is a genuinely empty log,
    // and its ready state is a chain the demonstration button actually
    // appended. Only loading and error still need `?lag=`/`?fail=1`, for the
    // reason `debug-flags.ts` gives — a bundled seed resolves within a frame.
    {
      name: '28-evidence-empty',
      screen: 'evidence inspector',
      state: 'empty (nothing captured yet)',
      note: 'A fresh session has no threads, so the inspector says there is nothing to read rather than rendering an empty table.',
      run: async (page) => {
        await page.goto(url('/evidence'));
        await page.waitFor('state-empty');
      },
    },
    {
      name: '29-evidence-loading',
      screen: 'evidence inspector',
      state: 'loading',
      note: 'Held open by ?lag=; the same state machine every other screen uses.',
      run: async (page) => {
        await page.goto(url('/evidence?lag=4000'));
        await page.waitFor('state-loading');
      },
    },
    {
      name: '30-evidence-error',
      screen: 'evidence inspector',
      state: 'error',
      note: 'The real error path with a retry action, forced by ?fail=1.',
      run: async (page) => {
        await page.goto(url('/evidence?fail=1'));
        await page.waitFor('state-error');
      },
    },
    {
      name: '31-evidence-default-surface',
      screen: 'evidence inspector',
      state: 'ready (REQ-LM-06 default surface, chain collapsed)',
      note: 'Why-this, evidence strength in words, what is unsettled, and a correction affordance. No table and no number: the chain is behind the disclosure control, closed.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90'));
        await page.waitFor('capture-top-answer');
        await page.click('capture-keep');
        await page.waitFor('capture-acknowledgment');
        await page.click('capture-open-evidence');
        await page.waitFor('evidence-why-this');
      },
    },
    {
      name: '32-evidence-chain-expanded',
      screen: 'evidence inspector',
      state: 'ready (chain expanded, demonstration appended)',
      note: 'Every observation with its tier and the gate’s verdict — including the two that were recorded and did not count, each with its reason.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90'));
        await page.waitFor('capture-top-answer');
        await page.click('capture-keep');
        await page.waitFor('capture-acknowledgment');
        await page.click('capture-open-evidence');
        await page.waitFor('evidence-why-this');
        await page.click('evidence-disclosure');
        await page.waitFor('evidence-chain');
        await page.click('evidence-seed-demonstration');
        await sleep(400);
      },
    },
    {
      name: '33-evidence-export-badge',
      screen: 'evidence inspector',
      state: 'ready (export produced and checked)',
      note: 'The verification badge with its qualifier, the list of what the check established, and the list of what it did not. The wording is `@bunki/export`’s, not the screen’s.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90'));
        await page.waitFor('capture-top-answer');
        await page.click('capture-keep');
        await page.waitFor('capture-acknowledgment');
        await page.click('capture-open-evidence');
        await page.waitFor('evidence-why-this');
        await page.click('evidence-export-button');
        await page.waitFor('evidence-export-badge');
      },
    },
    {
      name: '34-evidence-offline',
      screen: 'evidence inspector',
      state: 'offline',
      note: 'The inspector reads a local log, so being offline costs it nothing — the shell’s banner says exactly that.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90'));
        await page.waitFor('capture-top-answer');
        await page.click('capture-keep');
        await page.waitFor('capture-acknowledgment');
        await page.click('capture-open-evidence');
        await page.waitFor('evidence-why-this');
        await page.setOffline(true);
        await page.waitFor('state-offline');
      },
    },
    {
      name: '35-evidence-dark',
      screen: 'evidence inspector',
      state: 'ready (dark scheme)',
      note: 'Contrast evidence for the second scheme, from the app’s own ?scheme= flag rather than a screenshot filter.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90&scheme=dark'));
        await page.waitFor('capture-top-answer');
        await page.click('capture-keep');
        await page.waitFor('capture-acknowledgment');
        await page.click('capture-open-evidence');
        await page.waitFor('evidence-why-this');
      },
    },
    {
      name: '36-debug-empty',
      screen: 'diagnostics',
      state: 'empty (no records yet)',
      note: 'A fresh session’s buffer, with the privacy note stating what it can hold before it holds anything.',
      run: async (page) => {
        await page.goto(url('/debug'));
        await page.waitFor('debug-empty');
      },
    },
    {
      name: '37-debug-records',
      screen: 'diagnostics',
      state: 'ready (command latencies and event appends)',
      note: 'Real records from real commands. Every value is a count, a duration, an identifier or an enum member — the captured text went through the store and is nowhere in the buffer.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90'));
        await page.waitFor('capture-top-answer');
        await page.click('capture-keep');
        await page.waitFor('capture-acknowledgment');
        await page.click('capture-open-evidence');
        await page.waitFor('evidence-why-this');
        await page.click('evidence-open-debug');
        await page.waitFor('debug-command');
        await page.click('debug-serialize-button');
        await page.waitFor('debug-serialized-output');
      },
    },
    {
      name: '38-debug-dark',
      screen: 'diagnostics',
      state: 'ready (dark scheme)',
      note: 'Contrast evidence for the second scheme.',
      run: async (page) => {
        await page.goto(url('/?q=%E5%88%86%E5%B2%90&scheme=dark'));
        await page.waitFor('capture-top-answer');
        await page.click('capture-keep');
        await page.waitFor('capture-acknowledgment');
        await page.click('capture-open-evidence');
        await page.waitFor('evidence-why-this');
        await page.click('evidence-open-debug');
        await page.waitFor('debug-command');
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// The audit list — assertions against the real accessibility tree
// ---------------------------------------------------------------------------

/**
 * REQ-UI-09 calls screen-reader labels requirements rather than polish, and the
 * ruby column is the one place in this app where the visual structure and the
 * spoken structure genuinely differ. These audits state what a screen reader
 * must find, and are written against the words in the seed rather than against
 * whatever the component happens to produce.
 */
function auditList(base) {
  const url = (path) => `${base}${path}`;

  /** One RubyText: exactly one thing is said, and it is the whole word. */
  const rubyChecks = (nodes, { label, pieces }) => {
    const exposed = nodes.filter((node) => !node.ignored && node.name !== '');
    const named = exposed.map((node) => node.name);

    return [
      {
        check: 'exactly one node in the subtree is exposed with a name',
        expected: 1,
        actual: exposed.length,
        ok: exposed.length === 1,
      },
      {
        check: 'the one name is the whole word and its reading',
        expected: label,
        actual: named.join(' | '),
        ok: named.length === 1 && named[0] === label,
      },
      {
        check: 'no written form or reading is exposed on its own',
        expected: 'none of ' + pieces.join(' / '),
        actual: named.filter((name) => pieces.includes(name)).join(' / ') || 'none',
        ok: named.every((name) => !pieces.includes(name)),
      },
      {
        check: 'the empty-ruby placeholder is not in the tree at all',
        expected: 'no ideographic space anywhere, exposed or ignored',
        actual: nodes.filter((node) => node.name.includes('　')).length,
        ok: nodes.every((node) => !node.name.includes('　')),
      },
    ];
  };

  return [
    {
      name: 'ruby-aligned-word',
      subject: 'RubyText on /word/lex-wakareru (分かれる, reading split わ + かれる)',
      why: 'The reported defect: わ / 分 / 　 / かれる were four exposed nodes in DOM order.',
      run: async (page) => {
        await page.goto(url('/word/lex-wakareru'));
        await page.waitFor('word-headword');
        const nodes = await page.axNodes('word-headword');
        return rubyChecks(nodes, {
          label: '分かれる（わかれる）',
          pieces: ['わ', '分', 'かれる', '　'],
        });
      },
    },
    {
      name: 'ruby-whole-word',
      subject: 'RubyText on /word/lex-bunki (分岐, one segment)',
      why: 'The other alignment shape: whole reading over the whole written form.',
      run: async (page) => {
        await page.goto(url('/word/lex-bunki'));
        await page.waitFor('word-headword');
        const nodes = await page.axNodes('word-headword');
        return rubyChecks(nodes, { label: '分岐（ぶんき）', pieces: ['ぶんき', '分岐'] });
      },
    },
  ];
}

// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error(`no export at ${DIST}. Run: (cd apps/app && npx expo export --platform web)`);
  }
  mkdirSync(OUT, { recursive: true });

  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${String(port)}`;
  const chrome = await launchChrome();
  const cdp = connect(chrome.endpoint);
  await cdp.ready;

  const results = [];
  const audits = [];
  let failures = 0;

  /** A fresh target per step: the store is in memory, so nothing leaks forward. */
  const inFreshPage = async (body) => {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(cdp, sessionId);
    try {
      await page.setup();
      return await body(page);
    } finally {
      await cdp.send('Target.closeTarget', { targetId }).catch(() => undefined);
    }
  };

  try {
    for (const shot of shotList(base)) {
      try {
        const height = await inFreshPage(async (page) => {
          await shot.run(page);
          await sleep(250);
          return page.shot(join(OUT, `${shot.name}.png`));
        });
        results.push({ ...shot, ok: true, height });
        process.stdout.write(`  ok  ${shot.name}\n`);
      } catch (cause) {
        failures += 1;
        results.push({ ...shot, ok: false, error: String(cause) });
        process.stdout.write(`FAIL  ${shot.name}: ${String(cause)}\n`);
      }
    }

    for (const audit of auditList(base)) {
      try {
        const checks = await inFreshPage((page) => audit.run(page));
        const failed = checks.filter((check) => !check.ok);
        failures += failed.length;
        audits.push({ name: audit.name, subject: audit.subject, why: audit.why, checks });
        for (const check of checks) {
          process.stdout.write(
            `${check.ok ? '  ok' : 'FAIL'}  ${audit.name}: ${check.check}` +
              (check.ok
                ? '\n'
                : ` — expected ${String(check.expected)}, got ${String(check.actual)}\n`),
          );
        }
      } catch (cause) {
        failures += 1;
        audits.push({ name: audit.name, subject: audit.subject, error: String(cause) });
        process.stdout.write(`FAIL  ${audit.name}: ${String(cause)}\n`);
      }
    }

    writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(manifest(results), null, 2)}\n`);
    writeFileSync(
      join(OUT, 'accessibility-audit.json'),
      `${JSON.stringify(auditManifest(audits), null, 2)}\n`,
    );
  } finally {
    cdp.close();
    chrome.child.kill('SIGKILL');
    rmSync(chrome.userDataDir, { recursive: true, force: true });
    server.close();
  }

  const shotFailures = results.filter((result) => !result.ok).length;
  const checks = audits.flatMap((audit) => audit.checks ?? []);
  process.stdout.write(
    `\n${String(results.length - shotFailures)}/${String(results.length)} screenshots written to ${OUT}\n` +
      `${String(checks.filter((check) => check.ok).length)}/${String(checks.length)} accessibility checks passed\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

function auditManifest(audits) {
  return {
    workPackage: 'WP-05',
    measuredWith: 'Chrome DevTools Protocol Accessibility.queryAXTree over the expo export output',
    note: 'Roles and names here are Chrome’s own computation, not the app’s props. A prop the web target silently drops shows up as an exposed node.',
    audits,
  };
}

function manifest(results) {
  return {
    workPackage: 'WP-05',
    capturedFrom: 'expo export --platform web output, served statically and driven over CDP',
    viewport: VIEWPORT,
    shots: results.map(({ name, screen, state, note, ok, height, error }) => ({
      file: `${name}.png`,
      screen,
      state,
      ...(note === undefined ? {} : { note }),
      ok,
      ...(height === undefined ? {} : { fullPageHeight: height }),
      ...(error === undefined ? {} : { error }),
    })),
  };
}

await main();
