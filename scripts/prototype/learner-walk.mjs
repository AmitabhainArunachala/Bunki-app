#!/usr/bin/env node
/** The learner walk: 27 checks that the built app does what a learner first asks of it.
 *
 * Walks a built site the way a learner does, in a headless browser at 390x844 (touch) and 1280x800 (mouse):
 * home, an article, a word's lookup, a kanji screen, the study cards, the Rajomon encounter, the tutor, the build
 * identity the app itself shows, the version in Settings and the shared study engine (10 checks at each size);
 * then, at phone width, the backup export, each deck's backup and the import into a new browser (3), and what
 * makes a sound (4). It only looks and presses the app's own controls. No product code is changed, and every run
 * starts from an empty browser profile that is thrown away afterwards. Sound is recorded as "the app asked for
 * it" and kept silent. A check also fails on any console error, failed request, HTTP error or request that
 * leaves the site's own address while it runs. A request the browser drops because the page moved on is
 * not a failed one; those are listed in results.json.
 *
 *   node scripts/prototype/learner-walk.mjs --site <built site>   serves that folder itself (or KAIRO_SITE_DIR)
 *   node scripts/prototype/learner-walk.mjs --base <url>          checks an address that is already served
 *   ... --shots <dir>     where the screenshots and results.json go (outside the checkout)
 *   ... --only phone      one viewport only (phone | desktop)
 *   ... --main-only       skip the backup and sound walks
 *
 * Written for the 2026-11-10 preview as PROGRAM/preview/learner-check.mjs; the checks are unchanged here.
 * Exit 0 when every check passes, 1 otherwise. The first error of a failed check is on its own line.
 */
/* global window, document, localStorage, innerWidth, innerHeight, getComputedStyle, NodeFilter, HTMLMediaElement, URL, fetch */
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SITE = arg('--site', process.argv.includes('--base') ? '' : process.env.KAIRO_SITE_DIR || '');
const ONLY = arg('--only', '');
const MAIN_ONLY = process.argv.includes('--main-only');
// Screenshots and results never land in the checkout: a run must leave the source tree as it found it.
const SHOTS = resolve(
  arg(
    '--shots',
    join(
      process.env.RUNNER_TEMP || join(homedir(), '.dharma/bunki'),
      'learner-walk',
      new Date().toISOString().replace(/[:.]/g, '-'),
    ),
  ),
);
const inside = (parent, child) => {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
};
if (inside(realpathSync(ROOT), SHOTS)) {
  console.error(`--shots must be outside the checkout: ${SHOTS}`);
  process.exit(2);
}
mkdirSync(SHOTS, { recursive: true });

// With --site the walk serves the built folder itself, on the repository's own static host and a free port.
let host = null;
if (SITE) {
  const { startStaticHost } = createRequire(import.meta.url)(
    '../../prototypes/bunki-desktop/lib/static-host.cjs',
  );
  host = await startStaticHost({ site: resolve(SITE), port: 0 });
} else if (!process.argv.includes('--base')) {
  console.error(
    'Name the built site (--site <dir> or KAIRO_SITE_DIR) or an address that is already served (--base <url>).',
  );
  process.exit(2);
}
const BASE = (host ? host.origin : arg('--base', '')).replace(/\/?$/, '/');

const DEVICES = {
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};
const ORIGIN = new URL(BASE).origin;
const results = [];
const notes = {};
const aborted = [];
const sleep = (page, ms) => page.waitForTimeout(ms);

// Runs in the page before the app: records every request for sound, and keeps the room quiet.
// A Japanese device voice is offered, as a Mac or an iPhone has one, so "nothing spoke" is the app's own choice.
function soundProbe() {
  const push = (kind, detail = {}) => {
    (window.__sound ||= []).push({ kind, ...detail });
  };
  try {
    const synth = window.speechSynthesis;
    if (synth) {
      const proto = Object.getPrototypeOf(synth);
      proto.getVoices = function () {
        return [
          {
            name: 'Kyoko (check)',
            lang: 'ja-JP',
            localService: true,
            default: true,
            voiceURI: 'check-ja',
          },
        ];
      };
      proto.speak = function (u) {
        push('device-voice', { text: String(u?.text || '').slice(0, 60) });
      };
      const Native = window.SpeechSynthesisUtterance;
      if (Native)
        window.SpeechSynthesisUtterance = new Proxy(Native, {
          construct(target, args) {
            push('utterance', { text: String(args[0] || '').slice(0, 60) });
            return new target(...args);
          },
        });
    }
    const media = HTMLMediaElement.prototype,
      play = media.play;
    media.play = function () {
      push('audio-play', { src: String(this.currentSrc || this.src || '').slice(0, 160) });
      this.muted = true;
      return play.call(this);
    };
    const NativeAudio = window.Audio;
    window.Audio = new Proxy(NativeAudio, {
      construct(target, args) {
        push('audio-element', { src: String(args[0] || '').slice(0, 160) });
        return new target(...args);
      },
    });
    for (const name of ['AudioBufferSourceNode', 'OscillatorNode']) {
      const proto = window[name]?.prototype,
        start = proto?.start;
      if (start)
        proto.start = function (...a) {
          push('webaudio', { node: name });
          return start.apply(this, a);
        };
    }
  } catch (error) {
    push('probe-error', { message: String(error) });
  }
}

async function fresh(browser, device, url = BASE) {
  const context = await browser.newContext({
    ...DEVICES[device],
    locale: 'en-US',
    timezoneId: 'Asia/Tokyo',
    acceptDownloads: true,
  });
  await context.addInitScript(soundProbe);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const log = { errors: [], warnings: [], failed: [], bad: [], external: [], dialogs: [] };
  page.on('console', (m) => {
    const row = `${m.text().slice(0, 300)}${m.location()?.url ? ` @ ${m.location().url.replace(ORIGIN, '')}` : ''}`;
    if (m.type() === 'error') log.errors.push(`console: ${row}`);
    else if (m.type() === 'warning') log.warnings.push(row);
  });
  page.on('pageerror', (e) => log.errors.push(`uncaught: ${String(e.message || e).slice(0, 300)}`));
  page.on('requestfailed', (r) => {
    // A dropped request is not a failed one. Two things drop requests here. The report sheet reads
    // only the head of build-identity.json and lets the rest go, by design. And the app asks for
    // /data/articles/senses.json on every load; when the walk opens the address again before the
    // answer has arrived, the browser drops that request. On a slow runner that failed
    // sound-article (next / core run 42773527715). A file that is missing or broken still fails
    // its check: it arrives as an HTTP status or a console error. Drops are kept in results.json.
    if (r.failure()?.errorText === 'net::ERR_ABORTED') {
      aborted.push(r.url().replace(ORIGIN, ''));
      return;
    }
    log.failed.push(`${r.failure()?.errorText} ${r.url().replace(ORIGIN, '')}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) log.bad.push(`${r.status()} ${r.url().replace(ORIGIN, '')}`);
  });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== ORIGIN && !['data:', 'blob:', 'about:'].includes(u.protocol))
      log.external.push(r.url().slice(0, 160));
  });
  page.on('dialog', async (d) => {
    log.dialogs.push(d.message());
    await d.accept();
  });
  const touch = !!DEVICES[device].hasTouch;
  const press = (target) =>
    (typeof target === 'string' ? page.locator(target).first() : target)[touch ? 'tap' : 'click']();
  const started = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
  return { context, page, log, press, device, readyMs: Date.now() - started };
}

const problems = (log, from = {}) => [
  ...log.errors.slice(from.errors || 0),
  ...log.failed.slice(from.failed || 0).map((x) => `request failed: ${x}`),
  ...log.bad.slice(from.bad || 0).map((x) => `http ${x}`),
  ...log.external.slice(from.external || 0).map((x) => `left this address: ${x}`),
];
const mark = (log) => ({
  errors: log.errors.length,
  failed: log.failed.length,
  bad: log.bad.length,
  external: log.external.length,
});
const shot = async (page, name) => {
  const file = join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
};
// A screen that is still drawing replaces its elements: try again once rather than fail on the first.
const intoView = async (page, locator) => {
  for (let i = 0; i < 3; i += 1) {
    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 4000 });
      return;
    } catch {
      await page.waitForTimeout(600);
    }
  }
};

// Visible words of the screen, leaving out the drifting sky words and the tab bar.
const words = (page, selector = 'main') =>
  page.evaluate((selector) => {
    const root = document.querySelector(selector) || document.body;
    const seen = (el) => {
      const r = el.getBoundingClientRect(),
        s = getComputedStyle(el);
      return (
        r.width > 1 &&
        r.height > 1 &&
        s.visibility !== 'hidden' &&
        s.display !== 'none' &&
        Number(s.opacity) > 0.05
      );
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const out = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (
        !p ||
        !n.nodeValue.trim() ||
        p.closest('#drift-layer, script, style, .visually-hidden, [hidden], rt')
      )
        continue;
      if (seen(p)) out.push(n.nodeValue.trim());
    }
    return out.join(' | ');
  }, selector);

async function check(session, name, expected, fn) {
  const { page, log, device } = session;
  // The first check of a browser profile also answers for everything its first load printed.
  const before = session.counted ? mark(log) : {};
  session.counted = true;
  const row = { check: name, viewport: device, expected, pass: false, detail: '', shots: [] };
  try {
    row.detail = String((await fn(row)) || '');
    const found = problems(log, before);
    row.pass = found.length === 0;
    if (found.length)
      row.detail = `${row.detail} | FIRST ERROR: ${found[0]}${found.length > 1 ? ` (+${found.length - 1} more)` : ''}`;
    row.errors = found;
  } catch (error) {
    row.detail = `did not work: ${String(error.message || error)
      .split('\n')[0]
      .slice(0, 260)}`;
    row.errors = problems(log, before);
    if (row.errors.length) row.detail += ` | FIRST ERROR: ${row.errors[0]}`;
    row.shots.push(await shot(page, `FAILED-${name}-${device}`).catch(() => ''));
  }
  results.push(row);
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${name} @ ${device}: ${row.detail}`);
  return row.pass;
}

// Back to the first screen, as a learner who opens the address again.
async function toSky(session) {
  const { page } = session;
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
  await page.locator('#ginga-symbol').waitFor();
}
// Today's record drawer (tighten pass, 2026-11-10): the backup row sits inside a closed row at the foot of Today,
// "Your record and backup"; a learner opens it first. A build without the drawer has nothing to open.
async function openRecord(session) {
  const { page, press } = session;
  const row = page.locator('#today-record:not([open]) > summary');
  if (!(await row.count())) return;
  await intoView(page, row);
  await press(row);
  await page.waitForTimeout(400);
}
async function toTab(session, tab) {
  const { page, press } = session;
  await toSky(session);
  await press('#home-review');
  await page.locator(`#tab-${tab}`).waitFor();
  await press(`#tab-${tab}`);
  await sleep(page, 1500);
}
async function openFirstArticle(session) {
  const { page, press } = session;
  await toSky(session);
  await press('#ginga-symbol');
  await press('.bubble-shelf');
  await page.locator('.shelf-open').first().waitFor();
}
// A fresh record gets the app's own one-time demonstration: the first word's box opens by itself after 650 ms.
async function settleReader(page) {
  await page.locator('.reader .tok.content').first().waitFor();
  const demo = await page
    .locator('#mini')
    .waitFor({ timeout: 2500 })
    .then(
      () => true,
      () => false,
    );
  return demo;
}

async function mainWalk(browser, device) {
  const session = await fresh(browser, device);
  const { page, press, log } = session;

  await check(session, 'home', 'the first screen loads with no console errors', async (row) => {
    await page.locator('#ginga-symbol').waitFor();
    if (device === 'phone') {
      await sleep(page, 1200);
      row.shots.push(await shot(page, 'first-run-phone'));
    }
    await sleep(page, 1800);
    row.shots.push(await shot(page, `home-${device}`));
    const view = await page.evaluate(() => document.body.dataset.view);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 1) throw new Error(`the page is ${over}px wider than the screen`);
    notes[`home-${device}`] = {
      view,
      readyMs: session.readyMs,
      warnings: log.warnings.slice(0, 5),
    };
    return `view "${view}", ready in ${session.readyMs} ms, ${log.warnings.length} console warnings`;
  });

  let reached = { article: false, box: false };
  await check(session, 'article', 'an article opens from the bookshelf', async (row) => {
    await openFirstArticle(session);
    row.shots.push(await shot(page, `shelf-${device}`));
    const count = await page.locator('.shelf-open').count();
    const title = (await page.locator('.shelf-open').first().innerText())
      .replace(/\s+/g, ' ')
      .slice(0, 60);
    await press(page.locator('.shelf-open').first());
    const demo = await settleReader(page);
    if (demo) {
      await sleep(page, 900);
      row.shots.push(await shot(page, `article-first-open-${device}`));
      await page.keyboard.press('Escape');
      await sleep(page, 500);
    }
    row.shots.push(await shot(page, `article-${device}`));
    const tokens = await page.locator('.reader .tok.content').count();
    if (tokens < 20) throw new Error(`only ${tokens} words in the article`);
    reached.article = true;
    notes[`article-${device}`] = { shelfItems: count, firstUseDemonstration: demo };
    return `${count} articles on the shelf; opened "${title}…" (${tokens} tappable words)${demo ? "; the first word's box opened by itself (the app's one-time demonstration for a new learner)" : ''}`;
  });

  await check(session, 'lookup', 'tapping a word opens its lookup', async (row) => {
    if (!reached.article) throw new Error('no article to tap in');
    const index = await page.evaluate(() =>
      [...document.querySelectorAll('.reader .tok.content')].findIndex((node, i) => {
        const box = node.getBoundingClientRect();
        return (
          i > 0 &&
          /\p{Script=Han}/u.test(node.textContent) &&
          box.top > 80 &&
          box.bottom < innerHeight - 80
        );
      }),
    );
    if (index < 0) throw new Error('no word in view to tap');
    const word = page.locator('.reader .tok.content').nth(index);
    const steps = [];
    let taps = 0;
    while (
      taps < 4 &&
      !(await page
        .locator('#mini')
        .isVisible()
        .catch(() => false))
    ) {
      await press(word);
      taps += 1;
      await sleep(page, 700);
      steps.push(
        await word.evaluate((node) => node.dataset.ladderRung || 'box').catch(() => 'box'),
      );
    }
    await page.locator('#mini').waitFor();
    await sleep(page, 1600);
    row.shots.push(await shot(page, `lookup-${device}`));
    const box = await page.evaluate(() => ({
      word:
        document.querySelector('#mini .mini-word')?.innerText?.replace(/\s+/g, ' ').trim() || '',
      text: document.querySelector('#mini')?.innerText?.replace(/\s+/g, ' ').slice(0, 160) || '',
    }));
    if (!/[A-Za-z]{3}/.test(box.text)) throw new Error(`the box shows no meaning: ${box.text}`);
    reached.box = true;
    notes[`lookup-${device}`] = { taps, steps, box: box.text };
    return `${taps} taps: ${steps.join(' → ')}; the box reads "${box.text.slice(0, 90)}"`;
  });

  await check(session, 'kanji', 'a kanji screen opens', async (row) => {
    if (!reached.box) throw new Error('no word box to open a kanji from');
    const kanji = (await page.locator('#mini .mini-kanji-row').first().innerText())
      .replace(/\s+/g, ' ')
      .slice(0, 40);
    await press(page.locator('#mini .mini-kanji-row').first());
    await page.locator('#sheet').waitFor();
    await sleep(page, 2200);
    row.shots.push(await shot(page, `kanji-${device}`));
    const sheet = (await page.locator('#sheet').innerText()).replace(/\s+/g, ' ');
    if (!/\bstrokes?\b/i.test(sheet) || !/\b(on|kun)\b/.test(sheet))
      throw new Error(`the sheet has no strokes or readings: ${sheet.slice(0, 120)}`);
    return `opened from the word box row "${kanji}"; the sheet shows strokes, levels and on/kun readings`;
  });

  await check(session, 'cards', 'the study cards open', async (row) => {
    await toTab(session, 'learn');
    const label = (await page.locator('.learn-go-deck').innerText()).replace(/\s+/g, ' ');
    await press('.learn-go-deck');
    await page.locator('#kp-reveal').waitFor();
    await sleep(page, 800);
    row.shots.push(await shot(page, `cards-${device}`));
    await press('#kp-reveal');
    await page.locator('#kp-grade-good').waitFor();
    await sleep(page, 900);
    row.shots.push(await shot(page, `cards-answer-${device}`));
    const grades = await page.locator('.kp-grade').count();
    const audio = await page
      .locator(
        'main [id*="say"], main [id*="audio"], main [id*="voice"], main [id*="listen"], main [class*="audio"], main [class*="listen"], main button[aria-label*="audio" i], main button[aria-label*="listen" i], main button[aria-label*="speak" i]',
      )
      .count();
    notes[`cards-${device}`] = { door: label, grades, audioControlsOnDeckCard: audio };
    if (grades !== 4) throw new Error(`${grades} grade buttons after the answer`);
    return `"${label}" → a card, Reveal answer, four grades (Again/Hard/Good/Easy); audio controls on the card: ${audio}`;
  });

  await check(session, 'rajomon', 'the Rajomon encounter is reachable', async (row) => {
    await toTab(session, 'words');
    await page.locator('#nav-search-input').fill('門');
    const hit = page.locator('.nav-search-row', { hasText: 'モン' }).first();
    await hit.waitFor();
    await press(hit);
    await page.locator('#sheet').waitFor();
    const door = page.locator('#kanji-world-door');
    await door.waitFor();
    const doorWords = (await door.innerText()).trim();
    await intoView(page, door);
    await press(door);
    await page.locator('.kw-encounter').waitFor();
    await page
      .locator('.kw-image')
      .evaluate((image) => image.decode())
      .catch(() => {});
    await sleep(page, 1200);
    row.shots.push(await shot(page, `rajomon-${device}`));
    const first = (await page.locator('.kw-encounter').innerText())
      .replace(/\s+/g, ' ')
      .slice(0, 120);
    await press('[data-kw-action="next"]');
    await sleep(page, 900);
    const glyph = await page
      .locator('.kw-glyph')
      .innerText()
      .catch(() => '');
    if (glyph.trim() !== '門') throw new Error(`the second step does not show 門 (${glyph})`);
    return `Words → search 門 → the kanji row → "${doorWords}" → "${first}"; step two shows 門`;
  });

  await check(session, 'tutor', 'the tutor opens (first time, no key)', async (row) => {
    await toSky(session);
    await press('#ginga-symbol');
    await press('.bubble-sensei');
    await page.locator('#chat-input').waitFor();
    await sleep(page, 900);
    row.shots.push(await shot(page, `tutor-${device}`));
    const text = await words(page);
    const sendDisabled = await page.locator('#chat-send').isDisabled();
    notes[`tutor-${device}`] = {
      words: text,
      sendDisabledWithNoKey: sendDisabled,
      placeholder: await page.locator('#chat-input').getAttribute('placeholder'),
    };
    if (!/key/i.test(text)) throw new Error('no word about a key on the tutor screen');
    return `asks for the learner's own key; Send is ${sendDisabled ? 'switched off' : 'ON'} until a key is saved`;
  });

  await check(session, 'build-identity', 'the app itself says which build it is', async (row) => {
    await toSky(session);
    const served = await page.evaluate(async () => {
      const t = await (
        await fetch('build-identity.json', { headers: { range: 'bytes=0-2047' } })
      ).text();
      return {
        sha: /"gitSha":\s*"([a-f0-9]{40})"/.exec(t)?.[1] || '',
        id: /"buildId":\s*"([^"]+)"/.exec(t)?.[1] || '',
      };
    });
    await press('#bunki-report-bug');
    const dialog = page.locator('dialog[open]').first();
    await dialog.waitFor();
    await sleep(page, 1500);
    await dialog.locator('details.br-details > summary').first().click();
    await sleep(page, 700);
    const line =
      (await dialog.locator('.br-sent').innerText()).split('\n').find((x) => /This app/i.test(x)) ||
      '';
    await intoView(page, dialog.locator('.br-sent'));
    row.shots.push(await shot(page, `build-identity-${device}`));
    notes[`build-identity-${device}`] = { served, reportSheetLine: line };
    if (!served.sha || !line.includes(served.sha.slice(0, 12)))
      throw new Error(`the report sheet says "${line}", the server serves ${served.sha}`);
    await page.keyboard.press('Escape');
    return `bug button → Report a problem → Details: "${line.trim()}" (matches the served commit ${served.sha.slice(0, 9)}, ${served.id})`;
  });

  await check(session, 'about', 'Settings names the version', async (row) => {
    await toTab(session, 'me');
    await press('#me-settings');
    const version = page.locator('[data-version]').first();
    await version.waitFor();
    await intoView(page, version);
    await sleep(page, 500);
    row.shots.push(await shot(page, `about-${device}`));
    const text = (await version.innerText()).trim();
    const voiceLine = (await words(page)).split(' | ').find((x) => /^声/.test(x)) || '';
    notes[`about-${device}`] = { version: text, settingsVoiceLine: voiceLine };
    return `Me → Settings → About this app: "${text}"`;
  });

  await check(
    session,
    'shared-study',
    'the shared study engine opens at ?sharedStudy=preview (extra)',
    async (row) => {
      await page.goto(`${BASE}?sharedStudy=preview&deck=n2&ui=en`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, {
        timeout: 45000,
      });
      const frame = page.frameLocator('iframe').first();
      await frame.locator('body').waitFor();
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('iframe')].some((f) => {
            try {
              return /Study now|Today's study/.test(f.contentDocument.body.innerText);
            } catch {
              return false;
            }
          }),
        null,
        { timeout: 45000 },
      );
      await sleep(page, 800);
      row.shots.push(await shot(page, `shared-study-${device}`));
      const banner = (await words(page)).slice(0, 120);
      const inner = (await frame.locator('body').innerText()).replace(/\s+/g, ' ');
      const cards = /All decks (\d[\d,]*) cards/.exec(inner)?.[1] || '?';
      return `"${banner}"; the frame shows Today's study with ${cards} cards in all decks`;
    },
  );

  await session.context.close();
}

async function backupWalk(browser) {
  // A: a learner with one saved word and one graded deck card exports a backup.
  const a = await fresh(browser, 'phone');
  const file = join(SHOTS, 'backup-sample.json');
  let exported = null;
  await check(a, 'backup-export', 'the app can export the learner record', async (row) => {
    const { page, press } = a;
    await openFirstArticle(a);
    await press(page.locator('.shelf-open').first());
    await settleReader(page);
    await page.locator('#mini-take').waitFor();
    // Save asks where the word goes (SAVE, 2026-11-11): Review, the study queue, is picked
    await press('#mini-take');
    await page.locator('#mini-review').waitFor();
    await press('#mini-review');
    await sleep(page, 900);
    await toTab(a, 'learn');
    await press('.learn-go-deck');
    await press('#kp-reveal');
    await page.locator('#kp-grade-good').waitFor();
    await press('#kp-grade-good');
    await sleep(page, 1200);
    await toTab(a, 'today');
    await openRecord(a);
    const button = page.locator('#export-store');
    await intoView(page, button);
    await sleep(page, 500);
    row.shots.push(await shot(page, 'backup-phone'));
    const labels = `${(await button.innerText()).trim()} / ${(await page.locator('#import-store').innerText()).trim()}`;
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      press(button),
    ]);
    await download.saveAs(file);
    exported = JSON.parse(readFileSync(file, 'utf8'));
    const deckKeys = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith('bunki-cloze:')),
    );
    const inFile = JSON.stringify(exported).includes('bunki-cloze');
    notes.backup = {
      where: 'Today tab, the "Your record and backup" row at its foot; also Me → Settings → Backup',
      labels,
      file: download.suggestedFilename(),
      format: exported.format,
      savedWordsInFile: exported.record?.taken?.length ?? null,
      deckProgressKeysOnDevice: deckKeys,
      deckProgressInFile: inFile,
    };
    if (exported.format !== 'kairo-backup' || exported.record?.taken?.length !== 1)
      throw new Error('the file is not a backup with the one saved word');
    return `Today → "${labels}" → ${download.suggestedFilename()} (format ${exported.format}, 1 saved word); deck progress in the file: ${inFile ? 'yes' : 'no'} (it lives in ${deckKeys.join(', ') || 'no key'})`;
  });
  await check(a, 'deck-backup', 'each deck has its own backup', async (row) => {
    const { page, press } = a;
    await toTab(a, 'learn');
    await press(page.locator('.dojo-deck', { hasText: 'N2 words' }).first());
    await page.locator('#kp-to-settings').waitFor();
    await press('#kp-to-settings');
    await page.locator('#kp-backup').waitFor();
    await intoView(page, page.locator('#kp-backup'));
    await sleep(page, 600);
    row.shots.push(await shot(page, 'deck-backup-phone'));
    const text = (await words(page)).split(' | ');
    const at = text.findIndex((x) => x === 'Backup');
    const said = text.slice(at, at + 6).join(' | ');
    const size = (await page.locator('#kp-backup').inputValue()).length;
    notes.deckBackup = {
      where: 'Learn → a deck → Settings → Backup',
      words: said,
      backupTextLength: size,
    };
    return `Learn → N2 words → Settings → "${said}" (backup text ${size} characters)`;
  });
  await a.context.close();

  // B: a brand-new browser imports that file.
  const b = await fresh(browser, 'phone');
  await check(
    b,
    'backup-import',
    'a new browser can import that backup and gets the saved word',
    async (row) => {
      const { page, press, log } = b;
      if (!exported) throw new Error('no exported file to import');
      await toTab(b, 'today');
      await openRecord(b);
      // Today's saved-word count: on the bar's bookmark, or (gate frame, 2026-11-10) on the Today tab while the tabs
      // show; the bar keeps no bookmark there, so reading #tray alone waited 20 s for a control that is not drawn
      const todayName = () =>
        page.evaluate(
          () =>
            (document.querySelector('#tray') || document.querySelector('#tab-today'))?.getAttribute(
              'aria-label',
            ) || '',
        );
      const before = await todayName();
      const button = page.locator('#import-store');
      await intoView(page, button);
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 20000 }),
        press(button),
      ]);
      await chooser.setFiles(file);
      await page.waitForFunction(
        () =>
          /1 card/.test(document.querySelector('#home-review')?.textContent || '') ||
          /1 saved word/.test(
            (document.querySelector('#tray') || document.querySelector('#tab-today'))?.getAttribute(
              'aria-label',
            ) || '',
          ),
        null,
        { timeout: 30000 },
      );
      await sleep(page, 1500);
      row.shots.push(await shot(page, 'backup-imported-phone'));
      const after =
        (await page
          .locator('#home-review')
          .innerText()
          .catch(() => '')) || (await todayName());
      const deckAfter = await page.evaluate(() =>
        Object.keys(localStorage).filter(
          (k) => k.startsWith('bunki-cloze:') && !k.includes('prefs'),
        ),
      );
      notes.backupImport = {
        before,
        after,
        confirmWords: log.dialogs[0] || '',
        deckProgressAfterImport: deckAfter,
      };
      return `before: "${before}"; after import: "${after.replace(/\s+/g, ' ')}"; the app asked: "${(log.dialogs[0] || '').slice(0, 200)}"`;
    },
  );
  await b.context.close();
}

async function soundWalk(browser) {
  const session = await fresh(browser, 'phone');
  const { page, press } = session;
  const heard = () => page.evaluate(() => window.__sound || []);
  const sound = { asked: [] };
  notes.sound = sound;
  const collect = async (where) => {
    for (const row of await heard()) sound.asked.push({ where, ...row });
    await page.evaluate(() => {
      window.__sound = [];
    });
  };

  await check(session, 'sound-article', 'what the article reader plays', async (row) => {
    const narration = await page.evaluate(async () => {
      try {
        return await (await fetch('audio/article-narration.json')).json();
      } catch {
        return null;
      }
    });
    const index = await page.evaluate(async () => {
      try {
        return await (await fetch('data/articles/index.json')).json();
      } catch {
        return null;
      }
    });
    const narrated = Object.entries(narration?.articles || {})
      .filter(([, v]) => v?.clips?.length)
      .map(([id]) => id);
    await openFirstArticle(session);
    await press(page.locator('.shelf-open').first());
    await settleReader(page);
    await page.keyboard.press('Escape');
    await sleep(page, 600);
    const ordinary = await page
      .locator('#listen-open')
      .isVisible()
      .catch(() => false);
    sound.ordinaryArticleHasListenControl = ordinary;
    sound.articlesWithARecording = narrated.length;
    let said = `first article: listen control ${ordinary ? 'shown' : 'absent'}; articles with a recording: ${narrated.length}`;
    if (narrated.length) {
      const title = (index?.articles || []).find((x) => x.id === narrated[0])?.title || '';
      await openFirstArticle(session);
      // the whole title: its first six characters also begin another article ("第2次高市内閣が始動" beside
      // "第2次高市内閣 (改造)"), and the shelf's daily order decides which of the two comes first
      const item = page.locator('.shelf-open').filter({ hasText: title }).first();
      await intoView(page, item);
      await press(item);
      await settleReader(page);
      await page.keyboard.press('Escape');
      await sleep(page, 1200);
      const open = page.locator('#listen-open');
      await open.waitFor();
      await intoView(page, open);
      await press(open);
      await sleep(page, 500);
      const bar = (await page.locator('.listen-row').innerText()).replace(/\s+/g, ' ');
      await press('#listen-toggle');
      await sleep(page, 2500);
      const note = (await page.locator('#listen-note').innerText()).trim();
      row.shots.push(await shot(page, 'sound-article-phone'));
      // An article that ships a recording must play it: the app asks for one of its narration clips,
      // and the bar does not report a failure.
      const asked = (await heard()).filter(
        (entry) => entry.kind === 'audio-play' && /\/audio\/narration\//.test(entry.src || ''),
      );
      sound.narratedArticle = {
        title,
        barBefore: bar,
        noteAfterPlay: note,
        clipsAskedFor: asked.length,
        firstClip: asked[0]?.src.replace(ORIGIN, '') || '',
      };
      if (!asked.length || /could not play/i.test(note))
        throw new Error(
          `Play on "${title}" played nothing: the bar says "${note}" and the app asked for ${asked.length} narration clips`,
        );
      said += `; on "${title}" the speaker mark opens a bar "${bar}"; Play asks for ${asked[0].src.replace(ORIGIN, '')} and the bar says "${note}"`;
    }
    await collect('article');
    return said;
  });

  await check(session, 'sound-card', 'what a review card plays', async (row) => {
    await openFirstArticle(session);
    await press(page.locator('.shelf-open').first());
    await page.locator('.reader .tok.content').first().waitFor();
    // save the first word through its box (three taps open it when the demonstration has already been shown)
    const word = page.locator('.reader .tok.content').first();
    for (
      let i = 0;
      i < 4 &&
      !(await page
        .locator('#mini')
        .isVisible()
        .catch(() => false));
      i += 1
    ) {
      await press(word);
      await sleep(page, 700);
    }
    // Save asks where the word goes (SAVE, 2026-11-11): Review, the study queue, is picked
    await press('#mini-take');
    await page.locator('#mini-review').waitFor();
    await press('#mini-review');
    await sleep(page, 900);
    await toTab(session, 'today');
    await press('#review-start');
    await page.locator('#reveal').waitFor();
    await press('#reveal');
    await page.locator('#card-say').waitFor();
    await sleep(page, 1500);
    const before = (await page.locator('#card-say-note').innerText()).trim();
    await press('#card-say');
    await sleep(page, 1500);
    const after = (await page.locator('#card-say-note').innerText()).trim();
    row.shots.push(await shot(page, 'sound-card-phone'));
    sound.reviewCard = { noteOnReveal: before, noteAfterPressingAudio: after };
    await collect('review card');
    return `saved-word review card: the 音 button is there; on reveal it says "${before}", after pressing it "${after}"`;
  });

  await check(session, 'sound-voice-room', 'what the voice room says with no key', async (row) => {
    await toTab(session, 'learn');
    await sleep(page, 1200);
    await press(page.locator('.study-door', { hasText: 'Speak' }).first());
    await page.locator('#speak-enso').waitFor();
    await sleep(page, 1500);
    row.shots.push(await shot(page, 'sound-voice-room-phone'));
    const text = await words(page);
    const button = await page.locator('#speak-enso').getAttribute('aria-label');
    sound.voiceRoom = { words: text, speakButton: button };
    await collect('voice room');
    return `"${text.slice(0, 190)}"; the round button: "${button}"`;
  });

  await check(session, 'sound-total', 'requests for sound during the whole walk', async () => {
    await collect('end');
    const kinds = sound.asked.reduce(
      (all, row) => ({ ...all, [row.kind]: (all[row.kind] || 0) + 1 }),
      {},
    );
    sound.kinds = kinds;
    const voice = (kinds['device-voice'] || 0) + (kinds.utterance || 0);
    const clips = (kinds['audio-play'] || 0) + (kinds['audio-element'] || 0);
    return `device voice asked ${voice} times, recorded audio asked ${clips} times, other sound ${kinds.webaudio || 0} (a Japanese device voice was on offer)`;
  });
  await session.context.close();
}

const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const started = new Date();
let identity;
try {
  identity = await (
    await fetch(`${BASE}build-identity.json`, { headers: { range: 'bytes=0-2047' } })
  )
    .text()
    .then((t) => ({
      gitSha: /"gitSha":\s*"([a-f0-9]{40})"/.exec(t)?.[1],
      buildId: /"buildId":\s*"([^"]+)"/.exec(t)?.[1],
    }));
  console.log(`Checking ${BASE}  build ${identity.buildId}  commit ${identity.gitSha}\n`);
  for (const device of ['phone', 'desktop'])
    if (!ONLY || ONLY === device) await mainWalk(browser, device);
  if (!MAIN_ONLY && (!ONLY || ONLY === 'phone')) {
    await backupWalk(browser);
    await soundWalk(browser);
  }
} finally {
  await browser.close();
  await host?.close();
}
const failed = results.filter((row) => !row.pass);
const summary = {
  base: BASE,
  ...identity,
  started: started.toISOString(),
  finished: new Date().toISOString(),
  passed: results.length - failed.length,
  failed: failed.length,
  results,
  notes,
  abortedRequests: aborted,
};
writeFileSync(join(SHOTS, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  `\n${summary.passed} passed, ${summary.failed} failed. Screenshots and results.json: ${SHOTS}`,
);
process.exitCode = failed.length ? 1 : 0;
