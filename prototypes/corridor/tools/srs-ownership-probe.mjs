import assert from 'node:assert/strict';

const interfaces = {
  '/vendor/ts-fsrs.mjs': ['fsrs', 'generatorParameters'],
  '/srs-core.mjs': ['createScheduler', 'nextStep', 'pauseWords'],
  '/decks/player/engine.js': ['createScheduler'],
  '/decks/context-dense/engine.js': ['createScheduler'],
  '/decks/personal/engine.mjs': ['createEngine'],
};
const observations = new WeakMap();

export async function instrumentSchedulerOwnership(context, origin) {
  const events = [];
  observations.set(context, events);
  await context.exposeBinding('__recordSchedulerOwnership', (_source, event) => events.push(event));
  await context.addInitScript(() => {
    globalThis.__schedulerOwnershipPending = [];
    globalThis.__schedulerOwnershipSurface = null;
    globalThis.__schedulerOwnershipOwner = null;
  });
  await context.route(
    (url) => url.origin === origin && Object.hasOwn(interfaces, url.pathname),
    async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has('ownership-original')) return route.fallback();
      const original = JSON.stringify(`${url.pathname}?ownership-original`);
      const body = [
        `import * as original from ${original};`,
        `export * from ${original};`,
        ...interfaces[url.pathname].map((name) => {
          const surface = url.pathname.startsWith('/decks/');
          const scope = surface
            ? '__schedulerOwnershipSurface'
            : name === 'createScheduler'
              ? '__schedulerOwnershipOwner'
              : null;
          const caller =
            url.pathname === '/vendor/ts-fsrs.mjs'
              ? 'globalThis.__schedulerOwnershipOwner || globalThis.__schedulerOwnershipSurface'
              : 'globalThis.__schedulerOwnershipSurface';
          const trace = surface
            ? ''
            : `globalThis.__schedulerOwnershipPending.push(globalThis.__recordSchedulerOwnership({module: ${JSON.stringify(url.pathname)}, name: ${JSON.stringify(name)}, caller: ${caller}, stack: new Error().stack}));`;
          return `export function ${name}(...args) {
          ${trace}
          ${
            scope
              ? `const previous = globalThis.${scope};
          globalThis.${scope} = ${JSON.stringify(url.pathname)};
          try { return original.${name}(...args); }
          finally { globalThis.${scope} = previous; }`
              : `return original.${name}(...args);`
          }
        }`;
        }),
      ].join('\n');
      await route.fulfill({ status: 200, body, contentType: 'text/javascript' });
    },
  );
}

export async function readSchedulerOwnership(context, origin) {
  for (const page of context.pages()) {
    await page.evaluate(() => Promise.all(globalThis.__schedulerOwnershipPending || []));
  }
  const events = observations.get(context);
  assert(events, 'Scheduler ownership instrumentation was not installed');
  return events.map((event) => {
    const frames = event.stack.split('\n').flatMap((line) => {
      const match = line.match(/(https?:\/\/[^\s)]+):\d+:\d+/u);
      if (!match) return [];
      const url = new URL(match[1]);
      return url.origin === origin ? [url.pathname] : [];
    });
    return { module: event.module, name: event.name, caller: event.caller ?? frames[1] ?? null };
  });
}

export function judgeSchedulerOwnership(calls, requiredSurfaces) {
  const constructors = calls.filter((call) => call.module === '/vendor/ts-fsrs.mjs');
  const unexpected = constructors.filter(
    (call) => !['/srs-core.mjs', '/corridor.js'].includes(call.caller),
  );
  const missing = requiredSurfaces.filter(
    (surface) => !calls.some((call) => call.module === '/srs-core.mjs' && call.caller === surface),
  );
  return {
    owners: constructors.some((call) => call.name === 'fsrs') && unexpected.length === 0,
    delegated: missing.length === 0,
    unexpected,
    missing,
    constructors: constructors.length,
  };
}

export async function probeSchedulerEngine(browser, origin, pin, replacement) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    if (replacement !== undefined) {
      await context.route(
        (url) => url.origin === origin && url.pathname === '/decks/context-dense/engine.js',
        (route) =>
          route.fulfill({ status: 200, body: replacement, contentType: 'text/javascript' }),
      );
    }
    await instrumentSchedulerOwnership(context, origin);
    const page = await context.newPage();
    await page.goto(`${origin}/404.html`);
    const due = await page.evaluate(async (pin) => {
      const api = await import('/vendor/ts-fsrs.mjs');
      const engine = await import('/decks/context-dense/engine.js');
      const now = new Date('2026-10-19T07:00:00Z');
      const scheduler = engine.createScheduler(api, pin);
      return scheduler.next(api.createEmptyCard(now), now, api.Rating.Good).card.due.toISOString();
    }, pin);
    assert.equal(due, '2026-10-19T07:10:00.000Z');
    await page.evaluate(() => Promise.all(globalThis.__schedulerOwnershipPending));
    await page.goto(`${origin}/404.html?ownership-after-navigation`);
    return judgeSchedulerOwnership(await readSchedulerOwnership(context, origin), [
      '/decks/context-dense/engine.js',
    ]);
  } finally {
    await context.close();
  }
}
