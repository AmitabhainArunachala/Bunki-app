/**
 * PROTOTYPE library110-20261110 — the check for the prototype's candidate shelf. Remove with
 * data/articles/library-candidates/ once John has chosen.
 *
 * The 110-piece library is an unadmitted candidate (import_library_20261003.py, verify-feed.mjs --library-candidate).
 * Tonight's prototype shows it, tagged, without admitting it: the rows ride their own index beside the shipped
 * catalogue. This check holds that line.
 *
 *   node tools/verify-library-prototype-shelf.mjs
 *     data only, no browser: the shipped catalogue is untouched (index bytes, 156 rows, a picture on every row, no
 *     candidate among them); every candidate row and body still passes the candidate contract verify-feed.mjs holds
 *     (pending, not installable, text and credit exactly the source manifest's) and still answers `activation-held`
 *     when activation is asked for; shown + left out are exactly the manifest's 110.
 *
 *   node tools/verify-library-prototype-shelf.mjs --site http://127.0.0.1:<port>/ [--engine webkit] [--shots <dir>] [--all]
 *     the same, then a headless browser (Playwright's own Chromium or WebKit, a fresh profile) at 390x844 and 1280x800 against a
 *     built site: every candidate stands on the shelf with its tag and no shelf reading wears one (with two controls
 *     on the live page); the shelf's own readings keep their places ahead of the candidates; no candidate body is
 *     fetched before it is opened; four candidates (Aozora, Bunki original, Wikipedia, and the one with the longest
 *     credit) and three shelf readings open, show text, keep the page its width, and a tapped word opens its lookup;
 *     no console error, failed request or HTTP error. --all also opens every candidate once at the narrow width and
 *     compares the text the reader shows with the candidate's own.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const REPO = resolve(HERE, '../../..');
const ARTICLES = resolve(CORRIDOR, 'data/articles');
const SET = resolve(ARTICLES, 'library-candidates');
const MARKER = 'library110-20261110';
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail: String(detail) });
  console.log(`${pass ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ------------------------------------------------------------------ data
// the candidate contract is the feed verifier's own declaration, lifted as test-library-admission.mjs lifts it
const feedSource = readFileSync(resolve(HERE, 'verify-feed.mjs'), 'utf8');
const declaration = feedSource.match(/^function libraryCandidateProblems\([^]*?^\}/m)?.[0];
assert(declaration, 'libraryCandidateProblems not found in verify-feed.mjs');
const context = vm.createContext({ createHash, isDeepStrictEqual });
vm.runInContext(declaration, context);
const problemsOf = (...args) => [...context.libraryCandidateProblems(...args)];

const set = json(resolve(SET, 'index.json'));
const indexBytes = readFileSync(resolve(ARTICLES, 'index.json'));
const shelf = JSON.parse(indexBytes).articles;
const archive = json(resolve(ARTICLES, 'archive-index.json')).articles;
const sourceRows = new Map(readFileSync(resolve(REPO, 'docs/content/library-20261003.jsonl'), 'utf8').trim().split('\n')
  .map((line) => JSON.parse(line)).map((row) => [row.id, row]));
const rows = set.candidateRows;
const ids = rows.map((row) => row.id);

check('the set says what it is: an unadmitted candidate, prototype-marked, not installable, no selection by John',
  set.schema === 1 && set.kind === 'bunki-unadmitted-library-candidate' && set.prototype === MARKER && set.installable === false &&
  set.johnSelection === null && set.missingInputs.length === 4);
check('the shipped catalogue is untouched: the index bytes the candidate set was generated beside',
  sha(indexBytes) === set.generatedFrom.shippedIndexSha256, sha(indexBytes).slice(0, 12));
check('the shipped shelf is its 156 rows, a picture on every one, no candidate among them; the archive its 686',
  shelf.length === 156 && shelf.every((row) => row.picture && !row.libraryCandidate) && archive.length === 686 &&
  !archive.some((row) => row.libraryCandidate), `${shelf.length} shelf · ${archive.length} archive`);
const known = new Set([...shelf, ...archive].map((row) => row.id));
const knownFiles = new Set([...shelf, ...archive].map((row) => row.file));
check('no candidate takes a shelf or archive reading\'s id or file, and no id repeats',
  new Set(ids).size === ids.length && !ids.some((id) => known.has(id)) && !rows.some((row) => knownFiles.has(row.file)));
const leftOut = set.leftOut.map((row) => row.id);
check('shown and left out are exactly the source manifest\'s 110, each once',
  sourceRows.size === 110 && ids.length + leftOut.length === 110 && new Set([...ids, ...leftOut]).size === 110 &&
  [...ids, ...leftOut].every((id) => sourceRows.has(id)) && set.counts.shown === ids.length && set.counts.leftOut === leftOut.length,
  `${ids.length} shown · ${leftOut.length} left out (${leftOut.join(', ')})`);
check('every piece left out says why, and one left out as already shelved names the shelf reading that holds it',
  set.leftOut.every((row) => row.reason && (!/^already on the shelf/.test(row.reason) || known.has(row.shelfId))));
const flagged = (key) => [...sourceRows.values()].filter((row) => row.proposal[key]).map((row) => row.id);
check('the held items are the manifest\'s: nine typo edit maps, five Wikipedia rewrites, none applied',
  isDeepStrictEqual(set.held.typoEditMaps, flagged('typoEditMapHeld')) && set.held.typoEditMaps.length === 9 &&
  isDeepStrictEqual(set.held.wikipediaRewrites, flagged('wikipediaRewriteHeld')) && set.held.wikipediaRewrites.length === 5 &&
  isDeepStrictEqual(set.held.proposedWeakExclusions, flagged('weakExclusion')));

const contract = [], held = [], bytes = [], rights = [];
let total = 0;
for (const row of rows) {
  const path = resolve(SET, row.file);
  if (!/^[A-Za-z0-9_-]+\.json$/.test(row.file) || !existsSync(path)) { bytes.push(`${row.id}: no body`); continue; }
  const raw = readFileSync(path);
  total += raw.length;
  const pin = set.bodies[row.file];
  if (!pin || pin.bytes !== raw.length || pin.sha256 !== sha(raw) || raw.includes(10)) bytes.push(row.id);
  const body = JSON.parse(raw);
  const source = sourceRows.get(row.id);
  const found = problemsOf(row, body, source);
  if (found.length) contract.push(`${row.id}: ${found.join(',')}`);
  if (!problemsOf(row, body, source, { activate: true }).includes('activation-held')) held.push(row.id);
  const recorded = source?.candidate || {};
  if (!['licence', 'licenceEvidence', 'source', 'attribution'].every((key) => typeof recorded[key] === 'string' && recorded[key].trim()) ||
      (recorded.source !== 'bunki-original' && !/^https?:\/\//.test(recorded.url || '')) ||
      ['pool', 'licence', 'attribution', 'url', 'source'].some((key) => body[key] !== row[key])) rights.push(row.id);
}
check('every candidate body is on disk, compact, and the bytes the set pins', bytes.length === 0,
  bytes.slice(0, 4).join(' | ') || `${rows.length} bodies, ${(total / 1048576).toFixed(2)} MB`);
check('every candidate still passes the candidate contract: pending, not installable, text and credit exactly the source manifest\'s',
  contract.length === 0, contract.slice(0, 4).join(' | '));
check('activation stays held for every candidate (the admission path is not opened here)', held.length === 0, held.slice(0, 4).join(', '));
check('every candidate has a recorded licence, its evidence, a source and a credit, and its body agrees with its row',
  rights.length === 0, rights.slice(0, 4).join(', '));
const onDisk = readdirSync(SET).sort();
check('the candidate folder holds the index and the shown bodies, nothing else',
  isDeepStrictEqual(onDisk, ['index.json', ...rows.map((row) => row.file)].sort()), `${onDisk.length} files`);
// negative controls on the real rows: the contract bites
{
  const row = rows[0], body = json(resolve(SET, row.file)), source = sourceRows.get(row.id);
  const edited = problemsOf(row, { ...body, text: `${body.text}。` }, source);
  const installable = problemsOf({ ...row, libraryCandidate: { ...row.libraryCandidate, installable: true } }, body, source);
  const approved = problemsOf(row, body, { ...source, admission: { ...source.admission, humanApproval: { authority: 'John' } } });
  check('controls: an edited text, an installable row and an invented approval are each refused',
    edited.includes('held-text-changed') && installable.includes('candidate-scope') && approved.includes('unkeyed-admission'));
}
const runtime = readFileSync(resolve(CORRIDOR, 'corridor.js'), 'utf8');
check('the app reads the candidate folder in one place, behind the prototype marker; never in the single-file build or an installed app offline',
  runtime.split('library-candidates/').length === 4 && runtime.includes(`set?.prototype !== '${MARKER}'`) &&
  runtime.includes(`async function installLibraryCandidates() {\n  D.libraryCandidates = [];\n` +
    `  if (window.__CORRIDOR_BUNDLE__ || (navigator.onLine === false && navigator.serviceWorker?.controller)) return;\n`));

// --------------------------------------------------------------- browser
const site = arg('--site');
if (site) {
  const engine = arg('--engine') || 'chromium';
  assert(['chromium', 'webkit'].includes(engine), '--engine chromium | webkit');
  const playwright = await import('playwright-core');
  const base = site.replace(/\/?$/, '/');
  const origin = new URL(base).origin;
  const shots = arg('--shots') ? resolve(arg('--shots')) : null;
  if (shots) mkdirSync(shots, { recursive: true });
  const identity = await (await fetch(`${base}build-identity.json`)).json();
  console.log(`\nsite ${base}  build ${identity.buildId}  commit ${identity.gitSha}  sourceDirty ${identity.sourceDirty}  engine ${engine}`);
  const family = (prefix) => rows.find((row) => row.id.startsWith(prefix));
  const longestCredit = [...rows].sort((a, b) => b.sourceLabel.length - a.sourceLabel.length)[0];
  const picks = [family('aozora:'), family('bunki-orig-'), family('jawiki:'), longestCredit];
  // one card per story: an N3 rewrite whose original stands on the shelf is folded into it (shelfStories)
  const shelfIds = new Set(shelf.map((row) => row.id));
  const stories = shelf.filter((row) => !(row.adaptation?.basedOn && shelfIds.has(row.adaptation.basedOn))).length + ids.length;
  const devices = {
    phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  };
  const browser = await playwright[engine].launch();
  try {
    for (const [device, options] of Object.entries(devices)) {
      const page = await (await browser.newContext({ ...options, locale: 'en-US', timezoneId: 'Asia/Tokyo' })).newPage();
      page.setDefaultTimeout(20000);
      const trouble = [], bodyRequests = [];
      let interrupted = 0;
      page.on('console', (message) => { if (message.type() === 'error') trouble.push(`console: ${message.text().slice(0, 200)}`); });
      page.on('pageerror', (error) => trouble.push(`uncaught: ${String(error.message || error).slice(0, 200)}`));
      page.on('requestfailed', (request) => {
        const why = request.failure()?.errorText || '';
        // this walk leaves a page while the shelf's own warming queue is still fetching: the browser cancels those requests.
        // A cancelled candidate request is never excused.
        if (/cancelled|ERR_ABORTED/i.test(why) && !request.url().includes('/library-candidates/')) { interrupted += 1; return; }
        trouble.push(`failed: ${why} ${request.url().replace(origin, '')}`);
      });
      page.on('response', (response) => { if (response.status() >= 400) trouble.push(`http ${response.status()} ${response.url().replace(origin, '')}`); });
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (/\/data\/articles\/library-candidates\/(?!index\.json$)/.test(path)) bodyRequests.push(path.split('/').pop());
      });
      const press = (locator) => locator[options.hasTouch ? 'tap' : 'click']();
      const toShelf = async () => {
        await page.goto(`${base}?entry=shelf&ui=bi`, { waitUntil: 'load' });
        await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
        await page.locator('#shelf-reading-results .shelf-item').first().waitFor();
      };
      const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, `${name}-${device}.png`) }); };
      // the grid's cards in order, each with its tag as a learner would see it; and every tag on the page
      const readShelf = () => page.evaluate(() => ({
        tagsOnPage: document.querySelectorAll('.library-candidate-tag').length,
        cards: [...document.querySelectorAll('#shelf-reading-results > .shelf-item[data-passage]')].map((card) => {
          const tag = card.querySelector('.library-candidate-tag');
          const box = tag?.getBoundingClientRect(), style = tag && getComputedStyle(tag);
          return { id: card.dataset.passage, tag: tag ? tag.textContent : null,
            seen: !!tag && box.width > 1 && box.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.5 };
        }),
      }));
      const judge = ({ cards, tagsOnPage }) => {
        const tagged = cards.filter((card) => card.tag !== null);
        const first = cards.findIndex((card) => ids.includes(card.id));
        return {
          everyCandidateTagged: ids.every((id) => cards.some((card) => card.id === id && card.tag === 'candidate' && card.seen)),
          onlyCandidatesTagged: tagged.length === ids.length && tagged.every((card) => ids.includes(card.id)) && tagsOnPage === ids.length,
          shelfFirst: first > 0 && cards.slice(first).every((card) => ids.includes(card.id)) && cards.slice(0, first).every((card) => known.has(card.id)),
          first, tagged: tagged.length, cards: cards.length,
        };
      };

      await toShelf();
      const seenShelf = await readShelf();
      const verdict = judge(seenShelf);
      check(`${device}: every candidate stands on the shelf wearing its tag, where it can be seen`, verdict.everyCandidateTagged,
        `${verdict.tagged} tagged of ${verdict.cards} cards in the grid`);
      check(`${device}: no shelf reading wears the tag, anywhere on the page`, verdict.onlyCandidatesTagged);
      check(`${device}: the shelf's own readings keep their places; the candidates follow them, together`, verdict.shelfFirst,
        `first candidate is card ${verdict.first + 1}`);
      const tally = (await page.locator('.dateline-tally .tally-long').textContent()).trim();
      const today = await page.locator('#shelf-today .shelf-item').count();
      check(`${device}: the masthead counts what the shelf lists`,
        tally === `${stories} articles` && verdict.cards + today === stories, `"${tally}" · ${verdict.cards} in the grid + ${today} in today's six`);
      await shot('shelf-top');
      await page.locator(`.shelf-item[data-passage="${ids[0]}"]`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await shot('shelf-candidates');
      // controls on the live page: the same judgement refuses a candidate without its tag and a shelf reading with one
      await page.evaluate((id) => document.querySelector(`.shelf-item[data-passage="${id}"] .library-candidate-tag`).remove(), ids[5]);
      const untagged = judge(await readShelf());
      await page.evaluate((id) => {
        const tag = document.createElement('span'); tag.className = 'read-tag library-candidate-tag'; tag.textContent = 'candidate';
        document.querySelector(`#shelf-reading-results > .shelf-item[data-passage="${id}"] .story-foot`).append(tag);
      }, seenShelf.cards[0].id);
      const mistagged = judge(await readShelf());
      check(`${device}: controls — a candidate stripped of its tag and a shelf reading given one are each caught`,
        !untagged.everyCandidateTagged && !untagged.onlyCandidatesTagged && !mistagged.onlyCandidatesTagged);
      // the warming queue has had time to pass the shelf's own bodies; no candidate body may ride it
      await page.waitForTimeout(3000);
      check(`${device}: no candidate body is fetched before a candidate is opened`, bodyRequests.length === 0, bodyRequests.slice(0, 3).join(', '));

      const open = async (row, candidate) => {
        await toShelf();
        const card = page.locator(`#shelf-reading-results > .shelf-item[data-passage="${row.id}"] .shelf-open`);
        await card.scrollIntoViewIfNeeded();
        await press(card);
        await page.locator('.reader .tok.content').first().waitFor();
        // a fresh record's one-time demonstration opens the first word's box by itself
        if (await page.locator('#mini').waitFor({ timeout: 2500 }).then(() => true, () => false)) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        const seen = await page.evaluate(() => {
          const tags = [...document.querySelectorAll('.library-candidate-tag')];
          const tag = document.querySelector('.reader-card .reader-meta .library-candidate-tag');
          const box = tag?.getBoundingClientRect(), source = document.querySelector('.reader-meta .reader-source').getBoundingClientRect();
          const card = document.querySelector('.reader-card').getBoundingClientRect(), word = document.querySelector('.reader .tok.content').getBoundingClientRect();
          return { tags: tags.length, tagText: tag?.textContent || null,
            tagAtTop: !!tag && box.width > 1 && box.height > 1 && box.top >= 0 && box.bottom < word.top && box.bottom <= innerHeight,
            words: document.querySelectorAll('.reader .tok.content').length, title: document.querySelector('main h1.view-title').textContent.trim(),
            over: document.documentElement.scrollWidth - innerWidth, spill: Math.round(source.right - card.right),
            about: document.querySelector('.article-about')?.textContent.replace(/\s+/g, ' ') || '' };
        });
        await shot(`reader-${row.file.replace(/\.json$/, '')}`);
        const index = await page.evaluate(() => [...document.querySelectorAll('.reader .tok.content')].findIndex((node, i) => {
          const box = node.getBoundingClientRect();
          return i > 0 && /\p{Script=Han}/u.test(node.textContent) && box.top > 120 && box.bottom < innerHeight - 120;
        }));
        const word = page.locator('.reader .tok.content').nth(Math.max(index, 1));
        let taps = 0;
        while (taps < 4 && !(await page.locator('#mini').isVisible().catch(() => false))) { await press(word); taps += 1; await page.waitForTimeout(700); }
        const lookup = await page.locator('#mini').isVisible().catch(() => false)
          ? (await page.locator('#mini').innerText()).replace(/\s+/g, ' ').slice(0, 80) : '';
        await shot(`lookup-${row.file.replace(/\.json$/, '')}`);
        check(`${device}: ${candidate ? 'candidate' : 'shelf reading'} ${row.id} opens, shows its text, ${candidate ? 'wears its tag at the top' : 'wears no tag'}, and a tapped word opens its lookup`,
          seen.title === row.title && seen.words >= 20 && (candidate ? seen.tags === 1 && seen.tagText === 'candidate' && seen.tagAtTop : seen.tags === 0) && /[A-Za-z]{3}/.test(lookup),
          `"${seen.title.slice(0, 24)}" · ${seen.words} words · lookup after ${taps} taps: "${lookup.slice(0, 48)}"`);
        check(`${device}: ${row.id} keeps the page its width, its source line inside its title card${candidate ? ', its licence and credit at its foot' : ''}`,
          seen.over <= 1 && seen.spill <= 1 && (!candidate || (seen.about.includes(row.licence) && seen.about.replace(/\s+/g, '').includes(row.attribution.replace(/\s+/g, '').slice(0, 24)))),
          `page ${seen.over}px over · source ${seen.spill}px past the card`);
      };
      for (const row of picks) await open(row, true);
      check(`${device}: opening a candidate fetched that candidate's body and no other`,
        isDeepStrictEqual([...new Set(bodyRequests)].sort(), picks.map((row) => row.file).sort()), [...new Set(bodyRequests)].join(', '));
      // three of the shelf's own readings, as they stand in the grid: its lead, an Aozora story, a Bunki original
      const inGrid = seenShelf.cards.filter((card) => known.has(card.id)).map((card) => shelf.find((row) => row.id === card.id));
      const shelfPicks = [inGrid[0], inGrid.find((row) => row.source === 'aozorabunko-clean'),
        inGrid.find((row, i) => i > 0 && /^bunki-/.test(row.source))];
      assert(shelfPicks.every(Boolean) && new Set(shelfPicks).size === 3, 'three distinct shelf readings to open');
      for (const row of shelfPicks) await open(row, false);
      if (process.argv.includes('--all') && device === 'phone') {
        // every candidate, once, at the narrow width: its own text is what the reader shows, under its tag, inside the page
        const wrong = [];
        for (const row of rows) {
          await toShelf();
          const card = page.locator(`#shelf-reading-results > .shelf-item[data-passage="${row.id}"] .shelf-open`);
          await card.scrollIntoViewIfNeeded();
          await press(card);
          const arrived = await page.locator('.reader .tok.content').first().waitFor().then(() => true, () => false);
          if (!arrived) { wrong.push(`${row.id}: no text`); continue; }
          const seen = await page.evaluate(() => {
            const reader = document.querySelector('#reader').cloneNode(true);
            for (const node of reader.querySelectorAll('rt, rp')) node.remove();
            const tag = document.querySelector('.reader-card .reader-meta .library-candidate-tag');
            const source = document.querySelector('.reader-meta .reader-source').getBoundingClientRect(), box = document.querySelector('.reader-card').getBoundingClientRect();
            return { text: reader.textContent.replace(/\s+/gu, ''), title: document.querySelector('main h1.view-title').textContent.trim(),
              tags: document.querySelectorAll('.library-candidate-tag').length, tag: tag?.textContent || null,
              over: document.documentElement.scrollWidth - innerWidth, spill: Math.round(source.right - box.right) };
          });
          const text = json(resolve(SET, row.file)).text.replace(/\s+/gu, '');
          const found = [];
          if (seen.title !== row.title) found.push('title');
          if (seen.text !== text) found.push(`text (${seen.text.length} shown of ${text.length})`);
          if (seen.tags !== 1 || seen.tag !== 'candidate') found.push('tag');
          if (seen.over > 1 || seen.spill > 1) found.push(`width (${seen.over}px over, ${seen.spill}px past the card)`);
          if (found.length) wrong.push(`${row.id}: ${found.join(', ')}`);
        }
        check(`${device}: every one of the ${rows.length} candidates opens on exactly its own text, under its tag, inside the page`,
          wrong.length === 0, wrong.slice(0, 6).join(' | ') || `${rows.length} opened`);
        check(`${device}: each candidate body was fetched only when its candidate was opened`,
          isDeepStrictEqual([...new Set(bodyRequests)].sort(), rows.map((row) => row.file).sort()), `${new Set(bodyRequests).size} bodies`);
      }
      check(`${device}: no console error, failed request or HTTP error on the way`, trouble.length === 0,
        trouble.slice(0, 3).join(' | ') || (interrupted ? `${interrupted} of the shelf's own warming requests were cancelled by this walk's page changes` : ''));
      await page.context().close();
    }
  } finally {
    await browser.close();
  }
}

const failed = results.filter((row) => !row.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed${site ? '' : ' (data only; --site <url> adds the browser walk)'}`);
process.exit(failed.length ? 1 : 0);
