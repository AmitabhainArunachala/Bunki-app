/** The speech lane's combine, stage 2: where the ear (耳) meets the card audio and the offline clips. Muted and headless,
 * loopback only, a built site served here and the repository's silent stand-in voice server. No sound, no real voice
 * server, no token or pairing code. Built on the ear review's harness (tools/review-ear/lib.mjs).
 *
 *   node prototypes/corridor/tools/verify-speech-lane-ear.mjs --site <built site> [--engine webkit|chromium] [--width 390|1728]
 *        [--ui bi|ja] [--port 19563] [--only switch,closed,offline,ended,mark] [--looks all] [--shots <dir>]
 *
 *  switch   I1 · "Highlight what is being read" off: the ear draws nothing on text, armed (a pointer over a sentence on the
 *           Mac), held (a rest) or speaking (a tap), in every look with --looks all; the 耳 mark still shows its state.
 *           With it on, the marks are there (the same steps, the check's positive control).
 *  closed   I2 · the study cards' question faces. The ear has no mark on the two card screens (ear.mjs mount: they keep
 *           their own look), so armed and held carried in from Today rest off there; on the Mac Option-click reaches the
 *           ear: on a face whose word is blanked nothing is sent; on a printed face the ear sends the reading the card's
 *           own control sends. The deck: the printed face reads; the blanked and the choices face send nothing.
 *  offline  I3 · after a reload and offline: a reading and a sentence the review card's control said, and a sentence the
 *           ear said, play with no request; a sentence never heard shows the one plain line.
 *  ended    I13 · a 401 on a request nobody waits for (the ear gave it up): the next tap says the pairing was ended, and
 *           Settings says so, as for any 401.
 *  mark     I8 · a tap on the 耳 mark changes its state and nothing else (no request, the screen, scroll and focus stay).
 *
 * Exit code 0 when every check passes, 1 otherwise. */
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const argOf = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const SITE = argOf('--site', process.env.KAIRO_SITE_DIR || '');
const ENGINE = argOf('--engine', 'webkit');
const WIDTH = Number(argOf('--width', '390'));
const UI = argOf('--ui', 'bi');
const PORT = Number(argOf('--port', '19563'));
const SHOTS = argOf('--shots', '');
const ONLY = new Set(argOf('--only', 'switch,closed,offline,ended,mark').split(',').filter(Boolean));
const ALL_LOOKS = argOf('--looks', '') === 'all';
if (!SITE) { console.error('usage: verify-speech-lane-ear.mjs --site <built site>'); process.exit(2); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.m4a': 'audio/mp4', '.wasm': 'application/wasm', '.gz': 'application/gzip' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(SITE, path.endsWith('/') ? `${path}index.html` : path);
  try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); statSync(file); } catch { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
process.env.REVIEW_BASE = `http://127.0.0.1:${PORT}/`;
const { open, openArticle, earMark, earState, holdOn, dismissFirstLine, reporter } = await import('./review-ear/lib.mjs');

const tag = `${ENGINE}-${WIDTH}-${UI}`;
const { rows, record } = reporter(tag);
const LOOKS = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku'];
const shot = (s, name) => (SHOTS ? s.page.screenshot({ path: join(SHOTS, `${tag}-${name}.png`) }) : null);
const sent = (s, n) => s.fake.speaks().slice(n).map((row) => row.text);

/** What the ear draws on text right now: the attribute its CSS dresses, and bands that stand with a size. */
const earMarks = (page) => page.evaluate(() => {
  const attrs = document.querySelectorAll('[data-ear-unit]').length;
  const bands = [...document.querySelectorAll('.ear-band')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).display !== 'none' && getComputedStyle(b.parentElement || b).display !== 'none'; }).length;
  return { attrs, bands, total: attrs + bands, ear: document.documentElement.dataset.ear || '' };
});
const setHighlight = (page, value) => page.evaluate(async (value) => { const m = await import('/corridor.js'); m.setWordPref('kairo-read-highlight-v1', 'readHighlight', Object.freeze(['on', 'off']), value); }, value);
const setLook = (page, look) => page.evaluate((look) => { if (look === 'hokusai') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', look); }, look);
/** A content word of the open article near the middle of the screen, scrolled into view: its centre. */
async function wordPoint(s, nth = 8) {
  const word = s.page.locator('.reader .tok.content').nth(nth);
  await word.scrollIntoViewIfNeeded();
  const box = await word.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
const tapAt = (s, p) => (s.phone ? s.page.touchscreen.tap(p.x, p.y) : s.page.mouse.click(p.x, p.y));
async function waitEar(page, states, ms = 6000) {
  for (let t = Date.now(); Date.now() - t < ms;) { if (states.includes(await earState(page))) return true; await page.waitForTimeout(80); }
  return false;
}
async function earOff(s) {
  for (let i = 0; i < 3 && (await earState(s.page)) !== 'off'; i += 1) { await s.press(await earMark(s.page)); await s.sleep(300); }
}

const cases = {
  // ============================================================ I1 · the switch reaches the ear
  async switch() {
    const s = await open({ engine: ENGINE, width: WIDTH, ui: UI, voicePort: PORT + 1, clipSeconds: () => 2.5 });
    try {
      await openArticle(s, { start: false });
      await dismissFirstLine(s);
      for (const value of ['on', 'off']) {
        await setHighlight(s.page, value);
        for (const look of value === 'off' && ALL_LOOKS ? LOOKS : ['hokusai']) {
          await setLook(s.page, look);
          await s.sleep(300);
          const seen = {};
          // armed: on the Mac the sentence under the pointer is underlined
          await s.press(await earMark(s.page));
          await waitEar(s.page, ['armed']);
          const at = await wordPoint(s, 8);
          if (!s.phone) { await s.page.mouse.move(at.x, at.y); await s.sleep(400); seen.armed = await earMarks(s.page); }
          // the armed tap speaks: the sentence it reads is washed while it speaks
          const n = s.fake.speaks().length;
          await tapAt(s, at);
          const speaking = await waitEar(s.page, ['speaking']);
          await s.sleep(250);
          seen.speaking = { ...(await earMarks(s.page)), reached: speaking, asked: sent(s, n).length };
          if (value === 'off' && look === 'hokusai') await shot(s, 'switch-off-armed-speaking');
          await waitEar(s.page, ['off'], 8000);
          // held on: a rest on the Mac, a tap on the phone
          await holdOn(s);
          const at2 = await wordPoint(s, 20);
          const m = s.fake.speaks().length;
          if (s.phone) await tapAt(s, at2); else { await s.page.mouse.move(at2.x, at2.y); await s.sleep(150); await s.page.mouse.move(at2.x + 1, at2.y); }
          const heldSpeaking = await waitEar(s.page, ['speaking'], 4000);
          await s.sleep(250);
          seen.held = { ...(await earMarks(s.page)), reached: heldSpeaking, asked: sent(s, m).length };
          if (value === 'off' && look === 'hokusai') await shot(s, 'switch-off-held-speaking');
          await waitEar(s.page, ['held'], 8000);
          if (!s.phone) { await s.page.mouse.move(at.x, at.y); await s.sleep(200); seen.heldHover = await earMarks(s.page); }
          await s.page.mouse.move(4, 300);
          await earOff(s);
          const problems = [];
          if (!seen.speaking.reached) problems.push('the armed tap never reached "speaking"');
          if (!seen.held.reached) problems.push('held on, nothing was spoken');
          if (value === 'off') {
            for (const [name, row] of Object.entries(seen)) if (row?.total) problems.push(`${name}: ${row.total} mark(s) on text (${JSON.stringify(row)})`);
            if (!s.phone && seen.armed?.ear !== 'armed') problems.push(`the mark did not show armed (${seen.armed?.ear})`);
            if (seen.speaking.ear !== 'speaking') problems.push(`the mark did not show speaking (${seen.speaking.ear})`);
          } else {
            if (!s.phone && !seen.armed?.total) problems.push('switch on: no underline under the pointer while armed (the check sees nothing)');
            if (!seen.speaking.total) problems.push('switch on: no wash while speaking (the check sees nothing)');
          }
          record(`I1 highlight ${value}${value === 'off' ? `, look ${look}` : ''}: the ear ${value === 'off' ? 'draws nothing on text; its mark shows its state' : 'draws its marks (positive control)'}`, problems, JSON.stringify(seen));
        }
      }
      await setHighlight(s.page, 'on');
    } finally { await s.close(); }
  },

  // ============================================================ I2 · a card's question side stays closed
  async closed() {
    const s = await open({ engine: ENGINE, width: WIDTH, ui: UI, voicePort: PORT + 1, clipSeconds: () => 1 });
    const { page, press } = s;
    const optionClick = async (p) => { await s.page.keyboard.down('Alt'); await s.page.mouse.click(p.x, p.y); await s.page.keyboard.up('Alt'); };
    try {
      await page.evaluate(async () => { const m = await import('/corridor.js'); m.setWordPref(m.WORD_VOICE_KEY, 'wordVoice', m.WORD_VOICE, 'off'); });
      // a word saved with its sentence (its review face asks it blanked in that sentence), and one saved from its page (printed)
      await openArticle(s, { start: false });
      const token = page.locator('.reader .tok.content').nth(2);
      for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await press(token); await s.sleep(700); }
      const hidden = await page.evaluate(() => ({ label: document.querySelector('#mini .mini-word, #mini [data-ui-content-value]')?.textContent?.trim() || '', value: document.getElementById('mini')?.dataset.uiContentValue || '' }));
      await press('#mini-take'); await page.locator('#mini-review').waitFor(); await press('#mini-review'); await s.sleep(900);
      await s.ready();
      // held on Today, carried into the review: the card screen has no mark, so the ear rests off there
      await press('#home-review').catch(() => {}); await page.locator('#tab-today').waitFor(); await press('#tab-today'); await s.sleep(1200);
      await dismissFirstLine(s);
      await holdOn(s);
      await press('#review-start'); await page.locator('.review-face').first().waitFor(); await s.sleep(1500);
      const face = await page.evaluate(async () => { const m = await import('/corridor.js'); const rv = m.S.review; const item = rv.queue[rv.ix];
        return { id: item.id, label: item.label, reading: (await import('/corridor.js')).S && document.querySelector('.review-face .review-cloze') ? null : null,
          cloze: !!document.querySelector('.review-face .review-cloze'), ear: document.documentElement.dataset.ear || '', marks: [...document.querySelectorAll('.ear-spot')].filter((x) => x.getClientRects().length).length }; });
      record('I2 armed or held carried in: the review card screen has no ear mark and the ear rests off', [
        ...(face.marks ? [`${face.marks} ear mark(s) on the review card screen`] : []), ...(face.ear !== 'off' ? [`the ear is ${face.ear}`] : [])], JSON.stringify(face));
      const problems = [];
      const n0 = s.fake.speaks().length;
      if (!face.cloze) problems.push('the saved word is not asked blanked (nothing to check)');
      // taps on the blanked face: the sentence, the blank
      for (const pick of ['sentence', 'blank']) {
        const p = await page.evaluate((pick) => {
          const line = document.querySelector('.review-face .review-cloze');
          if (!line) return null;
          if (pick === 'sentence') { const t = line.querySelector('.tok.content'); const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
          const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) { const i = n.nodeValue.indexOf('＿'); if (i >= 0) { const range = document.createRange(); range.setStart(n, i); range.setEnd(n, i + 1); const r = range.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } }
          return null;
        }, pick);
        if (!p) { problems.push(`no ${pick} to tap`); continue; }
        if (s.phone) await page.touchscreen.tap(p.x, p.y); else await optionClick(p);
        await s.sleep(1200);
      }
      const onBlank = sent(s, n0);
      if (onBlank.length) problems.push(`on the blanked face the ear sent ${JSON.stringify(onBlank)}`);
      if (onBlank.some((t) => (face.label && t.includes(face.label)))) problems.push('what was sent holds the hidden word');
      const still = await page.evaluate(() => ({ revealed: !!document.querySelector('.grade-row'), ear: document.documentElement.dataset.ear || '' }));
      if (still.revealed) problems.push('a tap turned the card over');
      record(`I2 review card, blanked face: ${s.phone ? 'a tap' : 'Option-click'} on the sentence and on the blank sends nothing`, problems, JSON.stringify({ card: face.label, sent: onBlank, ...still }));
      if (!s.phone) {
        // the printed face, in a fresh profile: a word saved from its own page; Option-click on it and its own control send
        // the same reading
        await s.close();
        Object.assign(s, await open({ engine: ENGINE, width: WIDTH, ui: UI, voicePort: PORT + 1, clipSeconds: () => 1 }));
        const { page, press } = s;
        await page.evaluate(async () => { const m = await import('/corridor.js'); m.setWordPref(m.WORD_VOICE_KEY, 'wordVoice', m.WORD_VOICE, 'off'); });
        await s.ready();
        await page.waitForFunction(async () => { const m = await import('/corridor.js'); return !m.D.passages.some((x) => !x.tokens && !x.libraryCandidate && !String(x.file || '').startsWith('archive/') && m.D.libraryDiscoverable?.(x) !== false); }, null, { timeout: 60000, polling: 500 });
        const word = await page.evaluate(async () => { const m = await import('/corridor.js'); const dict = await import('/modules/dictionary.mjs');
          const words = [...new Set(Object.values(m.D.kanjiWords || {}).flat())].filter((w) => /^\p{Script=Han}{2}$/u.test(w));
          return words.find((w) => !dict.findExamples(w, 1).length) || words[0]; });
        await page.evaluate(async (id) => { const m = await import('/corridor.js'); m.go({ t: 'word', id }); }, word);
        await page.locator('#sheet-take').waitFor(); await s.sleep(600);
        await press('#sheet-take'); await page.locator('#mini-review').waitFor(); await press('#mini-review'); await s.sleep(900);
        await s.ready(); await press('#home-review').catch(() => {}); await page.locator('#tab-today').waitFor(); await press('#tab-today'); await s.sleep(1000);
        await press('#review-start'); await page.locator('.review-face').first().waitFor(); await s.sleep(1500);
        const printed = await page.evaluate(() => ({ card: document.querySelector('.review-face .review-front')?.textContent?.trim() || '', control: !!document.getElementById('card-say-front') }));
        const p2 = [];
        if (!printed.control) p2.push(`no question-side control on the printed face of ${printed.card}`);
        const m1 = s.fake.speaks().length;
        if (printed.control) { await page.locator('#card-say-front').click(); await s.sleep(1500); }
        const byControl = sent(s, m1);
        const front = await page.locator('.review-face .review-front').first().boundingBox({ timeout: 4000 }).catch(() => null);
        if (!front) p2.push(`no printed word on the face (${JSON.stringify(await page.evaluate(() => document.querySelector('.review-face')?.textContent?.slice(0, 60) || document.body.dataset.view || ''))})`);
        const m2 = s.fake.speaks().length;
        if (front) await optionClick({ x: front.x + front.width / 2, y: front.y + front.height / 2 });
        await s.sleep(1500);
        const byEar = sent(s, m2);
        if (!byEar.length) p2.push('Option-click on the printed word sent nothing');
        if (byControl.length && byEar.length && byEar[0] !== byControl[0]) p2.push(`the ear sent ${JSON.stringify(byEar[0])}, the card's control ${JSON.stringify(byControl[0])}`);
        if (await page.evaluate(() => !!document.querySelector('.grade-row'))) p2.push('the card was turned over');
        record('I2 review card, printed face: the ear and the card’s own control send the same reading', p2, JSON.stringify({ ...printed, byControl, byEar }));
        // the deck: printed, blanked, choices
        const deckRows = [];
        for (const mode of ['read', 'self', 'choice']) {
          await page.evaluate((mode) => { for (const id of ['n2', 'n1', 'kotoba-master', 'kotoba-mcd', 'kotoba-mine', 'context-dense', 'senmon', 'personal']) { if (mode === 'read') localStorage.removeItem(`bunki-cloze:prefs:v3:${id}`); else localStorage.setItem(`bunki-cloze:prefs:v3:${id}`, JSON.stringify({ mode })); } }, mode);
          await s.ready(); await press('#home-review').catch(() => {}); await page.locator('#tab-learn').waitFor(); await press('#tab-learn'); await s.sleep(1000);
          await press('.learn-go-deck'); await page.locator('#kp-card').waitFor(); await s.sleep(3000);
          const g = await page.evaluate(() => { const c = document.querySelector('#kp-card'); const t = c?.querySelector('.kp-sentence .kp-s[data-focus="1"] .tok, .kp-sentence .tok, .kp-sentence'); const r = t?.getBoundingClientRect();
            return { blank: !!c?.querySelector('.kp-blank'), choices: !!c?.querySelector('.kp-choices'), target: !!c?.querySelector('.kp-sentence .kp-target'), p: r ? { x: r.left + Math.min(r.width / 2, 20), y: r.top + r.height / 2 } : null, card: c?.dataset.card || '' }; });
          const k = s.fake.speaks().length;
          if (g.p) await optionClick(g.p);
          await s.sleep(1500);
          const got = sent(s, k);
          const shouldSpeak = mode === 'read';
          const rp = [];
          if (!g.p) rp.push('nothing to click');
          if (shouldSpeak && !got.length) rp.push('the printed face: Option-click sent nothing');
          if (!shouldSpeak && got.length) rp.push(`the ${mode === 'self' ? 'blanked' : 'choices'} face: the ear sent ${JSON.stringify(got)}`);
          if (got.some((t) => g.card && t.includes(g.card) && !shouldSpeak)) rp.push('what was sent holds the hidden word');
          if (await page.evaluate(() => !!document.querySelector('#kp-card .kp-answer'))) rp.push('the click showed the answer');
          deckRows.push(...rp.map((x) => `${mode}: ${x}`));
          if (mode === 'self') await shot(s, 'closed-deck-blanked');
        }
        await page.evaluate(() => { for (const id of ['n2', 'n1', 'kotoba-master', 'kotoba-mcd', 'kotoba-mine', 'context-dense', 'senmon', 'personal']) localStorage.removeItem(`bunki-cloze:prefs:v3:${id}`); });
        record('I2 deck card: Option-click reads the printed face; on the blanked and the choices face it sends nothing', deckRows, '');
      }
    } finally { await s.close(); }
  },

  // ============================================================ I3 · the store keeps what the new controls say
  async offline() {
    const s = await open({ engine: ENGINE, width: WIDTH, ui: UI, voicePort: PORT + 1, clipSeconds: () => 0.8 });
    const { page, press, context } = s;
    // a clip that sounds: the voice's own element starts playing a clip longer than the 50 ms silence that primes it
    await context.addInitScript(() => {
      window.__clips = 0;
      document.addEventListener('playing', (e) => { const a = e.target; if (a?.matches?.('audio[data-speak-audio]') && a.duration > 0.2) window.__clips += 1; }, true);
    });
    const plays = () => page.evaluate(() => window.__clips || 0);
    // No connection. Chromium: Playwright's offline mode. WebKit: Playwright's offline mode also refuses the blob: address
    // a kept clip plays from (media error 4, seen in a probe: the same clip plays from the store online with no request),
    // so there the page is told it is offline (navigator.onLine, the offline event) and the voice server is unreachable.
    const goOffline = async () => {
      if (ENGINE !== 'webkit') { await context.setOffline(true); return; }
      await page.route(`${s.fake.origin}/**`, (route) => route.abort());
      await page.evaluate(() => { Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); });
    };
    const failedRequests = [];
    page.on('requestfailed', (request) => { if (/\/v1\/audio\//.test(request.url())) failedRequests.push(`${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText || ''}`); });
    try {
      await page.evaluate(async () => { const m = await import('/corridor.js'); m.setWordPref(m.WORD_VOICE_KEY, 'wordVoice', m.WORD_VOICE, 'off'); });
      await openArticle(s, { start: false });
      // the ear says one sentence (armed tap), online
      await press(await earMark(page)); await waitEar(page, ['armed']);
      const at = await wordPoint(s, 8);
      const e0 = s.fake.speaks().length;
      await tapAt(s, at);
      await waitEar(page, ['off'], 8000);
      const earSaid = sent(s, e0);
      // a word saved with its sentence; the review card's control says the reading, then the sentence, online
      const token = page.locator('.reader .tok.content').nth(2);
      for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await press(token); await s.sleep(700); }
      await press('#mini-take'); await page.locator('#mini-review').waitFor(); await press('#mini-review'); await s.sleep(900);
      await s.ready(); await press('#home-review').catch(() => {}); await page.locator('#tab-today').waitFor(); await press('#tab-today'); await s.sleep(1000);
      await press('#review-start'); await page.locator('.review-face').first().waitFor(); await s.sleep(800);
      await page.keyboard.press('Space'); await page.locator('#card-say').waitFor(); await s.sleep(600);
      const c0 = s.fake.speaks().length;
      await page.locator('#card-say').click(); await s.sleep(4000);
      const cardSaid = sent(s, c0);
      await s.sleep(800);
      // a reload (the device's store is all that is kept), the article opened online (no service worker in this harness:
      // its text comes from the network), then no connection
      await openArticle(s, { start: false });
      await goOffline();
      const problems = [];
      if (cardSaid.length < 2) problems.push(`online, the card's control sent ${JSON.stringify(cardSaid)} (a reading and a sentence expected)`);
      if (!earSaid.length) problems.push('online, the ear sent nothing');
      // the ear, offline: the same sentence plays; a sentence never heard strikes the mark with the one plain line
      await press(await earMark(page)); await waitEar(page, ['armed']);
      const a0 = s.fake.speaks().length, q0 = await plays();
      await tapAt(s, await wordPoint(s, 8));
      await s.sleep(2500);
      const earOffline = { asked: sent(s, a0).length, plays: (await plays()) - q0, ear: await earState(page) };
      if (earOffline.plays < 1) problems.push(`offline, the sentence the ear said is not played (${JSON.stringify(earOffline)})`);
      if (earOffline.asked) problems.push('offline, the ear asked the server');
      await waitEar(page, ['off', 'novoice'], 6000);
      await earOff(s);
      await press(await earMark(page)); await waitEar(page, ['armed']);
      const b0 = await plays();
      await tapAt(s, await wordPoint(s, 40));
      const struck = await waitEar(page, ['novoice'], 4000);
      const line = await page.evaluate(() => [...document.querySelectorAll('.ear-spot')].map((x) => x.lastElementChild).find((x) => x && !x.hidden)?.textContent || '');
      if (!struck) problems.push('a sentence never heard: the mark was not struck');
      if (!line) problems.push('a sentence never heard: no plain line');
      if ((await plays()) !== b0) problems.push('a sentence never heard: something played');
      await shot(s, 'offline-ear-never-heard');
      record('I3 offline after a reload: the sentence the ear said plays with no request; one never heard strikes the mark with one plain line', problems.splice(0), JSON.stringify({ online: earSaid, offline: earOffline, line }));
      // the card's control, offline, reached inside the app (the saved sentence's article is the one open)
      await earOff(s);
      for (let i = 0; i < 4 && !(await page.locator('#home-review').isVisible().catch(() => false)); i += 1) { await press('#back').catch(() => {}); await s.sleep(800); }
      await press('#home-review'); await page.locator('#tab-today').waitFor(); await press('#tab-today'); await s.sleep(1000);
      await press('#review-start'); await page.locator('.review-face').first().waitFor(); await s.sleep(800);
      await page.keyboard.press('Space'); await page.locator('#card-say').waitFor(); await s.sleep(600);
      const k0 = s.fake.speaks().length, p0 = await plays();
      await page.locator('#card-say').click(); await s.sleep(3500);
      const cardOffline = { asked: sent(s, k0).length, plays: (await plays()) - p0, line: await page.evaluate(() => document.getElementById('card-say-note')?.textContent || '') };
      if (cardOffline.asked) problems.push(`offline, the card's control asked ${cardOffline.asked} time(s)`);
      if (cardOffline.plays < 2) problems.push(`offline, the card's control played ${cardOffline.plays} clip(s), not the reading and the sentence`);
      if (cardOffline.line) problems.push(`offline, the card's control showed a line: ${cardOffline.line}`);
      // something never heard: the deck card's question-side control
      await press('#back').catch(() => {}); await s.sleep(800);
      record('I3 offline after a reload: the reading and the sentence the card’s control said play with no request', problems.splice(0), JSON.stringify({ online: cardSaid, offline: cardOffline, failedRequests }));
      await context.setOffline(false);
    } finally { await s.close(); }
  },

  // ============================================================ I13 · a 401 nobody waits for keeps its reason
  async ended() {
    const s = await open({ engine: ENGINE, width: WIDTH, ui: UI, voicePort: PORT + 1, clipSeconds: () => 0.8 });
    const { page, press } = s;
    try {
      await openArticle(s, { start: false });
      // the ear asks a sentence that does not answer: after 8 s it gives the request up; the pairing then ends (401)
      s.holdSpeaks(() => true);
      await press(await earMark(page)); await waitEar(page, ['armed']);
      await tapAt(s, await wordPoint(s, 8));
      await waitEar(page, ['novoice'], 11000);
      await waitEar(page, ['off'], 6000);
      s.fake.revokeAll();
      s.holdSpeaks(null);
      await s.releaseHeld();
      await s.sleep(1500);
      // the next tap: the ear's line, then Settings
      await earOff(s);
      await press(await earMark(page)); await waitEar(page, ['armed']);
      await tapAt(s, await wordPoint(s, 30));
      await waitEar(page, ['novoice'], 4000);
      const line = await page.evaluate(() => [...document.querySelectorAll('.ear-spot')].map((x) => x.lastElementChild).find((x) => x && !x.hidden)?.textContent || '');
      // Settings, reached inside the app (the reason is kept by this page; a reload starts from what the device keeps)
      await earOff(s);
      for (let i = 0; i < 4 && !(await page.locator('#home-review').isVisible().catch(() => false)); i += 1) { await press('#back').catch(() => {}); await s.sleep(800); }
      await press('#home-review').catch(() => {}); await page.locator('#tab-me').waitFor(); await press('#tab-me'); await s.sleep(900);
      await page.locator('#me-settings').scrollIntoViewIfNeeded(); await press('#me-settings'); await s.sleep(900);
      const settings = await page.evaluate(() => document.getElementById('settings-voice-server')?.textContent || '');
      const problems = [];
      if (/not paired|つないでいません/u.test(line) || !/pair again|つなぎ直/u.test(line)) problems.push(`the next tap says ${JSON.stringify(line)}`);
      if (!/ended this pairing|接続を終了/u.test(settings)) problems.push(`Settings says ${JSON.stringify(settings.slice(0, 160))}`);
      record('I13 a 401 on a request nobody waits for: the next tap and Settings say the pairing was ended', problems, JSON.stringify({ line, settings: settings.slice(0, 160) }));
    } finally { await s.close(); }
  },

  // ============================================================ I8 · a tap on the 耳 mark changes its state and nothing else
  async mark() {
    const s = await open({ engine: ENGINE, width: WIDTH, ui: UI, voicePort: PORT + 1, clipSeconds: () => 1 });
    const { page } = s;
    const state = () => page.evaluate(async () => { const m = await import('/corridor.js'); const a = document.activeElement;
      return { view: m.S.view, passage: m.S.passageId || null, stack: m.S.stack.length, scroll: Math.round(scrollY), ear: document.documentElement.dataset.ear || '',
        focus: a && a !== document.body ? `${a.tagName}.${String(a.className).split(' ')[0]}` : 'body', mini: !!document.getElementById('mini')?.getClientRects().length }; });
    try {
      const problems = [];
      for (const where of ['today', 'article']) {
        if (where === 'article') await openArticle(s, { start: false });
        else { await s.ready(); await s.press('#home-review').catch(() => {}); await page.locator('#tab-today').waitFor(); await s.press('#tab-today'); await s.sleep(1000); await dismissFirstLine(s); }
        const before = await state();
        const n = s.fake.speaks().length;
        for (const expect of ['armed', 'off']) {
          await s.press(await earMark(page)); await s.sleep(400);
          const after = await state();
          if (after.ear !== expect) problems.push(`${where}: after a tap the ear is ${after.ear}, not ${expect}`);
          for (const k of ['view', 'passage', 'stack', 'scroll', 'mini']) if (after[k] !== before[k]) problems.push(`${where}: ${k} ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`);
          if (after.focus.includes('ear-mark') && s.phone) problems.push(`${where}: focus left on the mark after a touch`);
        }
        if (s.fake.speaks().length !== n) problems.push(`${where}: a tap on the mark asked ${JSON.stringify(sent(s, n))}`);
      }
      record('I8 the 耳 mark: a tap arms or disarms it and changes nothing else (Today, an article)', problems, '');
    } finally { await s.close(); }
  },
};

try {
  for (const [name, run] of Object.entries(cases)) {
    if (!ONLY.has(name)) continue;
    try { await run(); } catch (error) { record(`${name}: the check ran to its end`, [String(error?.message || error).split('\n')[0].slice(0, 240)]); }
  }
} finally {
  server.close();
  const failed = rows.filter((r) => !r.pass).length;
  console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
