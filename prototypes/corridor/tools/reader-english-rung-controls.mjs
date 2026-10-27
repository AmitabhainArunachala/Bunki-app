/** Controls for the oracle, not a substitute for the real reader journeys.
 * Browser controls use real DOM/layout/MutationObserver on an isolated document
 * at the pinned site's origin; no product data or resolver is used as an oracle.
 * Importing this module performs no browser work.
 */
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { observeEnglish, observeReaderEnglishRung, englishSourcePins, installEnglishMonitor } from './reader-english-rung.mjs';
export const ENGLISH_CONTROLS = Object.freeze([
  ['delayed-valid', 'accepted'], ['never-paints', 'deadline'],
  ['wrong-reading', 'wrong-reading'], ['wrong-English', 'wrong-English'],
  ['hidden-correct', 'deadline'], ['transparent-ink', 'deadline'], ['filter-hidden', 'deadline'], ['hidden-reading', 'deadline'], ['detach', 'detached-or-replaced'],
  ['replace', 'detached-or-replaced'], ['transient-stage', 'premature-stage-or-sheet'],
  ['transient-sheet', 'premature-stage-or-sheet'], ['wrong-identity', 'wrong-identity'],
  ['visible-kana', 'accepted'], ['hidden-kana', 'deadline'], ['transparent-kana', 'deadline'],
  ['same-token-cover', 'deadline'], ['pointer-none-English', 'accepted'],
  ['wrong-text-replace-restore', 'wrong-identity'], ['same-text-repaint', 'accepted'],
  ['same-text-word-repaint', 'accepted'], ['repaint-then-wrong-descendant', 'wrong-identity'],
  ['detached-intermediate-ruby', 'wrong-identity'],
  ['opaque-black', 'accepted'], ['zero-blue', 'accepted'],
  ['rgba-alpha-zero', 'deadline'], ['slash-alpha-zero', 'deadline'],
  ['no-fallback', 'wrong-English'], ['same-deadline', 'deadline'],
]);
export const CONTROL_EXPECTATION = Object.freeze({ id: 'oracle-control', occurrenceIndex: 0,
  surface: '高い', lemma: '高い', sourceReading: 'たかい', readingSegments: ['たか'], english: 'high' });
export const KANA_CONTROL_EXPECTATION = Object.freeze({ ...CONTROL_EXPECTATION,
  surface: 'これ', lemma: 'これ', sourceReading: 'これ', readingSegments: [], english: 'this' });
export const controlExpectation = id => ['visible-kana', 'hidden-kana', 'transparent-kana'].includes(id)
  ? KANA_CONTROL_EXPECTATION : CONTROL_EXPECTATION;
const DOM_CONTROLS = new Set(ENGLISH_CONTROLS.slice(13, -2).map(([id]) => id));
export function syntheticEnglishSnapshot(expected = CONTROL_EXPECTATION, width = 390) {
  return { articleId: expected.id, occurrenceIndex: expected.occurrenceIndex, surface: expected.surface,
    lemma: expected.lemma, connected: true, sameOriginalElement: true,
    readingSegments: [...expected.readingSegments], readingVisible: true, english: expected.english,
    englishCount: 1, englishVisible: true, rung: 'gloss', hasEn: true, depthAside: 'meaning',
    stageSeen: false, sheetSeen: false, hazards: [], viewportWidth: width };
}
export const syntheticEnglishBaseline = expected => ({ ...syntheticEnglishSnapshot(expected),
  english: '', englishCount: 0, englishVisible: false, rung: null, hasEn: false, depthAside: null });
/** Minimal DOM/mutation transport for executing the actual monitor in pure Node.
 * Rectangles, computed styles and hit targets are supplied facts, not rendered evidence.
 * It deliberately retains removed nodes and queues childList records until read().
 */
export function pureMonitorFixture(expected = CONTROL_EXPECTATION, installer = installEnglishMonitor) {
  const records = [];
  const defaults = { color: 'rgb(0, 0, 0)', webkitTextFillColor: 'rgb(0, 0, 0)', fontSize: '24px',
    display: 'inline', visibility: 'visible', opacity: '1', contentVisibility: 'visible',
    clipPath: 'none', clip: 'auto', filter: 'none', overflow: 'visible', overflowX: 'visible', overflowY: 'visible', pointerEvents: 'auto' };
  let root, cover = null;
  const descendants = node => node.childNodes.flatMap(child => [child, ...descendants(child)]);
  const make = (tag, classes = '', children = [], data = '') => {
    const n = { nodeType: tag === '#text' ? 3 : 1, tag, classes, data, dataset: {}, style: {}, childNodes: [], parentElement: null,
      get isConnected() { return this === root || !!this.parentElement?.isConnected; },
      get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map(c => c.textContent).join(''); },
      get firstChild() { return this.childNodes[0]; },
      contains(other) { return this === other || this.childNodes.some(c => c.contains(other)); },
      matches(selector) { return selector.split(',').some(s => {
        if (s === 'rt' || s === 'ruby') return this.tag === s;
        if (s.startsWith('#')) return this.id === s.slice(1);
        const m = /^\.([\w-]+)(?:\[([\w-]+)(?:="([^"]*)")?\])?$/u.exec(s);
        if (!m || !this.classes.split(' ').includes(m[1])) return false;
        if (!m[2]) return true;
        const value = this.getAttribute(m[2]); return value !== null && (m[3] === undefined || value === m[3]);
      }); },
      closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; },
      querySelectorAll(selector) { return descendants(this).filter(n => {
        if (selector === ':scope > .tok-word') return n.parentElement === this && n.matches('.tok-word');
        if (selector === ':scope > .tok-word ruby > rt') return n.matches('rt') && n.parentElement?.matches('ruby') && n.closest('.tok-word')?.parentElement === this;
        if (selector === ':scope > .tok-en > .tok-en-text') return n.matches('.tok-en-text') && n.parentElement?.matches('.tok-en') && n.parentElement.parentElement === this;
        return n.matches(selector);
      }); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      getAttribute(name) { if (name === 'id') return this.id ?? null;
        return this.dataset[name.replace(/^data-/u, '').replace(/-([a-z])/gu, (_, c) => c.toUpperCase())] ?? null; },
      cloneNode(deep) { const copy = make(this.tag, this.classes, deep ? this.childNodes.map(c => c.cloneNode(true)) : [], this.data);
        copy.dataset = { ...this.dataset }; copy.style = { ...this.style }; copy.id = this.id; return copy; },
      remove() { const parent = this.parentElement; if (parent) { parent.childNodes.splice(parent.childNodes.indexOf(this), 1); this.parentElement = null; } },
      getBoundingClientRect() { const y = this.closest('.tok-en') ? 60 : 20;
        return { x: 20, y, left: 20, right: 100, top: y, bottom: y + 20, width: 80, height: 20 }; },
    };
    n.classList = { contains: c => n.classes.split(' ').includes(c) };
    for (const child of children) { child.parentElement = n; n.childNodes.push(child); }
    return n;
  };
  const text = data => make('#text', '', [], data);
  const ruby = () => make('ruby', '', [text('高'), make('rt', '', [text('たか')])]);
  const word = make('span', 'tok-word', expected.readingSegments.length ? [ruby(), text('い')] : [text(expected.surface)]);
  const token = make('span', 'tok content', [word]); token.dataset = { index: '0', word: expected.lemma, proseLabel: expected.surface };
  const reader = make('div', '', [token]); reader.id = 'reader';
  const passage = make('div', 'listen-row'); passage.dataset.passage = expected.id;
  root = make('html', '', [passage, reader]);
  const replace = (old, next) => {
    const parent = old.parentElement, index = parent.childNodes.indexOf(old);
    parent.childNodes.splice(index, 1, next); old.parentElement = null; next.parentElement = parent;
    records.push({ type: 'childList', target: parent, removedNodes: [old], addedNodes: [next] });
  };
  const document = { documentElement: root, querySelector: s => root.querySelector(s), getElementById: id => root.querySelector(`#${id}`),
    createTreeWalker: node => { const texts = descendants(node).filter(c => c.nodeType === 3); return { nextNode: () => texts.shift() || null }; },
    createRange: () => { let target; return { selectNodeContents: n => { target = n; }, getBoundingClientRect: () => target.getBoundingClientRect() }; },
    elementFromPoint: (_x, y) => cover && y >= 60 ? cover : token,
  };
  const realm = { document, NodeFilter: { SHOW_TEXT: 4 }, innerWidth: 390, innerHeight: 844,
    getComputedStyle: n => {
      const inherited = {}; for (let p = n; p; p = p.parentElement)
        for (const key of ['color', 'webkitTextFillColor', 'fontSize', 'visibility', 'pointerEvents'])
          if (!(key in inherited) && key in p.style) inherited[key] = p.style[key];
      return { ...defaults, ...inherited, ...n.style };
    },
    MutationObserver: class { observe() {} takeRecords() { return records.splice(0); } disconnect() {} },
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
  };
  const monitor = runInNewContext(`(${installer.toString()})`, realm)(token);
  const paint = id => {
    token.dataset.ladderRung = 'gloss'; token.dataset.depthAside = 'meaning'; token.classes += ' has-en';
    const ink = make('span', 'tok-en-text', [text(expected.english)]), en = make('span', 'tok-en', [ink]);
    en.style.pointerEvents = 'none'; en.parentElement = token; token.childNodes.push(en);
    records.push({ type: 'childList', target: token, removedNodes: [], addedNodes: [en] });
    if (id === 'hidden-kana') word.style.visibility = 'hidden';
    if (id === 'transparent-kana') word.style.webkitTextFillColor = 'transparent';
    if (id === 'same-token-cover') { cover = make('span', 'cover'); cover.parentElement = en; en.childNodes.push(cover); cover.style.pointerEvents = 'auto'; }
    if (id === 'pointer-none-English') ink.style.pointerEvents = 'none';
    const color = { 'opaque-black': 'rgb(0, 0, 0)', 'zero-blue': 'rgb(10, 20, 0)',
      'rgba-alpha-zero': 'rgba(10, 20, 30, 0)', 'slash-alpha-zero': 'rgb(10 20 30 / 0)' }[id];
    if (color) { ink.style.color = color; ink.style.webkitTextFillColor = color; }
    if (id === 'transparent-ink') ink.style.webkitTextFillColor = 'transparent';
    if (['same-text-word-repaint', 'repaint-then-wrong-descendant', 'detached-intermediate-ruby'].includes(id)) replace(word, word.cloneNode(true));
    if (['wrong-text-replace-restore', 'same-text-repaint', 'repaint-then-wrong-descendant', 'detached-intermediate-ruby'].includes(id)) {
      const r = token.querySelector('ruby'), original = r.firstChild, next = text(id === 'same-text-repaint' ? original.data : '安');
      replace(original, next);
      if (id !== 'same-text-repaint') replace(next, original);
      if (id === 'detached-intermediate-ruby') replace(r, r.cloneNode(true));
    }
  };
  return { monitor, paint, token, word, replace, text, ruby, records, realm };
}

export async function runPureEnglishControls(observer = observeEnglish) {
  const results = [];
  for (const [id, wanted] of ENGLISH_CONTROLS) {
    let clock = 0, triggered = false, calls = 0, closed = false;
    const expected = controlExpectation(id), fixture = DOM_CONTROLS.has(id) ? pureMonitorFixture(expected) : null;
    let observed = 'accepted';
    try {
      await observer({ expected, bounded: false, now: () => clock,
        sleep: async ms => { clock += ms; },
        arm: async () => ({ read: async () => {
          if (fixture) return fixture.monitor.read();
          if (!triggered) return syntheticEnglishBaseline(CONTROL_EXPECTATION);
          const value = syntheticEnglishSnapshot();
          if ((id === 'delayed-valid' && clock < 350) || id === 'never-paints' || id === 'same-deadline') return syntheticEnglishBaseline(CONTROL_EXPECTATION);
          if (id === 'wrong-reading') value.readingSegments = ['たかい'];
          if (['wrong-English', 'no-fallback'].includes(id)) value.english = 'expensive';
          if (['hidden-correct', 'transparent-ink', 'filter-hidden'].includes(id)) value.englishVisible = false;
          if (id === 'hidden-reading') value.readingVisible = false;
          if (id === 'detach') value.connected = false;
          if (id === 'replace') value.sameOriginalElement = false;
          if (id === 'transient-stage' || id === 'transient-sheet') value.hazards = ['premature-stage-or-sheet'];
          if (id === 'wrong-identity') value.occurrenceIndex = 1;
          return value;
        }, close: async () => { fixture?.monitor.close(); closed = true; } }),
        trigger: async budget => { calls++; triggered = true; fixture?.paint(id); clock += id === 'same-deadline' ? 4900 : 40; budget.remaining(); },
      });
    } catch (error) { observed = error.code || error.message; }
    results.push({ id, expected: wanted, observed, elapsedMs: clock, triggerCount: calls,
      method: fixture ? 'actual monitor with pure DOM double; not render proof' : 'production loop with snapshot transport',
      closed, passed: observed === wanted && calls === 1 && closed && clock <= 5000 });
  }
  return results;
}

export async function runBrowserEnglishControls({ browser, base, artifactSha256, engine }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const results = [];
  try {
    // An inert JSON document keeps product boot effects out of the controlled DOM.
    await page.goto(`${base}/build-identity.json`);
    const identity = await page.evaluate(() => JSON.parse(document.body.textContent));
    assert.equal(identity.artifactSha256, artifactSha256, 'Oracle controls must use the admitted artifact');
    for (const [id, wanted] of ENGLISH_CONTROLS) {
      const expected = controlExpectation(id);
      await page.setContent(`<link rel="stylesheet" href="${base}/corridor.css"><link rel="stylesheet" href="${base}/editorial.css"><style>body{margin:50px}.tok{display:inline-block;position:relative}.tok-word{font-size:24px}rt{font-size:14px}.tok-en{display:block;pointer-events:none}.tok-en-text{display:inline-block}</style><div class="listen-row" data-passage="oracle-control"></div><div id="reader" class="reader fg-always"><span class="tok content" data-index="0" data-word="${expected.lemma}" data-prose-label="${expected.surface}"><span class="tok-word">${expected.readingSegments.length ? '<ruby>高<rt>たか</rt></ruby>い' : 'これ'}</span></span></div>`);
      const origin = await page.locator('#reader .tok').elementHandle();
      let observed = 'accepted', observation = null, triggerCount = 0;
      const started = performance.now();
      try {
        observation = await observeReaderEnglishRung({ origin, expected,
          trigger: async budget => {
            triggerCount++;
            await budget.call(() => origin.evaluate((node, { control, expected }) => {
              const paint = () => {
                if (control === 'delayed-valid') {
                  node.dataset.proseLabel = '高い';
                  const row = document.querySelector('.listen-row'); row.replaceWith(row.cloneNode(true));
                }
                node.dataset.ladderRung = 'gloss'; node.dataset.depthAside = 'meaning'; node.classList.add('has-en');
                const en = document.createElement('span'); en.className = 'tok-en';
                const ink = document.createElement('span'); ink.className = 'tok-en-text'; ink.textContent = expected.english;
                en.append(ink); node.append(en);
                const word = node.querySelector('.tok-word');
                if (control === 'hidden-kana') word.style.visibility = 'hidden';
                if (control === 'transparent-kana') word.style.webkitTextFillColor = 'transparent';
                if (control === 'same-token-cover') {
                  const cover = document.createElement('span'); cover.textContent = 'cover';
                  Object.assign(cover.style, { position: 'absolute', inset: '0', zIndex: '9999', background: '#000', pointerEvents: 'auto' });
                  en.style.position = 'relative'; en.append(cover);
                }
                if (control === 'pointer-none-English') ink.style.pointerEvents = 'none';
                if (['opaque-black', 'zero-blue', 'rgba-alpha-zero', 'slash-alpha-zero'].includes(control)) {
                  const color = { 'opaque-black': 'rgb(0, 0, 0)', 'zero-blue': 'rgb(10, 20, 0)',
                    'rgba-alpha-zero': 'rgba(10, 20, 30, 0)', 'slash-alpha-zero': 'rgb(10 20 30 / 0)' }[control];
                  ink.style.color = color; ink.style.webkitTextFillColor = color;
                }
                if (['same-text-word-repaint', 'repaint-then-wrong-descendant', 'detached-intermediate-ruby'].includes(control)) word.replaceWith(word.cloneNode(true));
                if (['wrong-text-replace-restore', 'same-text-repaint', 'repaint-then-wrong-descendant', 'detached-intermediate-ruby'].includes(control)) {
                  const ruby = node.querySelector('ruby'), glyph = ruby.firstChild;
                  const next = document.createTextNode(control === 'same-text-repaint' ? glyph.data : '安');
                  ruby.replaceChild(next, glyph);
                  if (control !== 'same-text-repaint') ruby.replaceChild(glyph, next);
                  if (control === 'detached-intermediate-ruby') ruby.replaceWith(ruby.cloneNode(true));
                }
                if (control === 'hidden-correct') ink.style.visibility = 'hidden';
                if (control === 'transparent-ink') ink.style.webkitTextFillColor = 'transparent';
                if (control === 'filter-hidden') ink.style.filter = 'opacity(0)';
                if (control === 'hidden-reading') node.querySelector('rt').style.opacity = '0';
                if (control === 'wrong-reading') node.querySelector('rt').textContent = 'たかい';
                if (['wrong-English', 'no-fallback'].includes(control)) ink.textContent = 'expensive';
                if (control === 'no-fallback') { const easier = node.cloneNode(true); easier.dataset.index = '1'; easier.querySelector('.tok-en-text').textContent = 'high'; node.after(easier); }
                if (control === 'detach') node.remove();
                if (control === 'replace') node.replaceWith(node.cloneNode(true));
                if (control === 'wrong-identity') { const glyph = node.querySelector('ruby').firstChild; const was = glyph.data; glyph.data = '安'; glyph.data = was; }
                if (control === 'transient-stage' || control === 'transient-sheet') {
                  const danger = document.createElement('div'); danger.id = control === 'transient-stage' ? 'mini' : 'sheet'; document.body.append(danger); danger.remove();
                }
              };
              if (control === 'delayed-valid') setTimeout(paint, 350);
              else if (control === 'same-deadline') setTimeout(paint, 5100);
              else if (!['never-paints', 'same-deadline'].includes(control)) paint();
            }, { control: id, expected }));
            if (id === 'same-deadline') await budget.call(() => page.waitForTimeout(4900));
          } });
      } catch (error) { observed = error.code || error.message; }
      finally { await origin.dispose(); }
      const passed = observed === wanted && triggerCount === 1 && performance.now() - started < 6000;
      results.push({ id, expected: wanted, observed, passed, triggerCount,
        elapsedMs: performance.now() - started, observation });
    }
  } finally { await context.close(); }
  return { method: 'isolated real DOM oracle controls at admitted artifact origin; not product journey evidence',
    artifactSha256, engine, browserVersion: browser.version(), sources: englishSourcePins(), results };
}

/** Synthetic receipt used only by pure admission controls. Never emitted by a verifier. */
export function syntheticEnglishReceipt(entries, usage, sources, artifactSha256, engine) {
  const observations = entries.filter(e => e.usage === usage).flatMap(e =>
    (usage === 'playback' ? [320, 390] : [390]).map(width => ({ ...syntheticEnglishSnapshot(e, width),
      elapsedMs: 400, totalDeadlineMs: 5000, armedBeforeTrigger: true, actionSettled: true, selectionAttempts: 1 })));
  return { schemaVersion: 1, sources, observations, pureControls: ENGLISH_CONTROLS.map(([id, expected]) =>
    ({ id, expected, observed: expected, passed: true, triggerCount: 1, closed: true, elapsedMs: expected === 'deadline' ? 5000 : 400 })),
  browserControls: { method: 'isolated real DOM oracle controls at admitted artifact origin; not product journey evidence', sources, artifactSha256, engine,
    browserVersion: 'fixture', results: ENGLISH_CONTROLS.map(([id, expected]) => ({ id, expected,
      observed: expected, passed: true, triggerCount: 1, elapsedMs: expected === 'deadline' ? 5000 : 400,
      observation: expected === 'accepted' ? { ...syntheticEnglishSnapshot(controlExpectation(id)), elapsedMs: 400, totalDeadlineMs: 5000, armedBeforeTrigger: true, actionSettled: true, selectionAttempts: 1 } : null })) } };
}
