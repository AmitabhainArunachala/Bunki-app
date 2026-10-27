/** Controls for the oracle, not a substitute for the real reader journeys.
 * Browser controls use real DOM/layout/MutationObserver on an isolated document
 * at the pinned site's origin; no product data or resolver is used as an oracle.
 * Importing this module performs no browser work.
 */
import assert from 'node:assert/strict';
import { observeEnglish, observeReaderEnglishRung, englishSourcePins } from './reader-english-rung.mjs';
export const ENGLISH_CONTROLS = Object.freeze([
  ['delayed-valid', 'accepted'], ['never-paints', 'deadline'],
  ['wrong-reading', 'wrong-reading'], ['wrong-English', 'wrong-English'],
  ['hidden-correct', 'deadline'], ['transparent-ink', 'deadline'], ['filter-hidden', 'deadline'], ['hidden-reading', 'deadline'], ['detach', 'detached-or-replaced'],
  ['replace', 'detached-or-replaced'], ['transient-stage', 'premature-stage-or-sheet'],
  ['transient-sheet', 'premature-stage-or-sheet'], ['wrong-identity', 'wrong-identity'],
  ['no-fallback', 'wrong-English'], ['same-deadline', 'deadline'],
]);
export const CONTROL_EXPECTATION = Object.freeze({ id: 'oracle-control', occurrenceIndex: 0,
  surface: '高い', lemma: '高い', sourceReading: 'たかい', readingSegments: ['たか'], english: 'high' });
export function syntheticEnglishSnapshot(expected = CONTROL_EXPECTATION, width = 390) {
  return { articleId: expected.id, occurrenceIndex: expected.occurrenceIndex, surface: expected.surface,
    lemma: expected.lemma, connected: true, sameOriginalElement: true,
    readingSegments: [...expected.readingSegments], readingVisible: true, english: expected.english,
    englishCount: 1, englishVisible: true, rung: 'gloss', hasEn: true, depthAside: 'meaning',
    stageSeen: false, sheetSeen: false, hazards: [], viewportWidth: width };
}
export const syntheticEnglishBaseline = expected => ({ ...syntheticEnglishSnapshot(expected),
  english: '', englishCount: 0, englishVisible: false, rung: null, hasEn: false, depthAside: null });
export async function runPureEnglishControls(observer = observeEnglish) {
  const results = [];
  for (const [id, wanted] of ENGLISH_CONTROLS) {
    let clock = 0, triggered = false, calls = 0, closed = false;
    let observed = 'accepted';
    try {
      await observer({ expected: CONTROL_EXPECTATION, bounded: false, now: () => clock,
        sleep: async ms => { clock += ms; },
        arm: async () => ({ read: async () => {
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
        }, close: async () => { closed = true; } }),
        trigger: async budget => { calls++; triggered = true; clock += id === 'same-deadline' ? 4900 : 40; budget.remaining(); },
      });
    } catch (error) { observed = error.code || error.message; }
    results.push({ id, expected: wanted, observed, elapsedMs: clock, triggerCount: calls,
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
      await page.setContent(`<link rel="stylesheet" href="${base}/corridor.css"><link rel="stylesheet" href="${base}/editorial.css"><style>body{margin:50px}.tok{display:inline-block;position:relative}.tok-word{font-size:24px}rt{font-size:14px}.tok-en{display:block;pointer-events:none}.tok-en-text{display:inline-block}</style><div class="listen-row" data-passage="oracle-control"></div><div id="reader" class="reader fg-always"><span class="tok content" data-index="0" data-word="高い" data-prose-label="高い"><span class="tok-word"><ruby>高<rt>たか</rt></ruby>い</span></span></div>`);
      const origin = await page.locator('#reader .tok').elementHandle();
      let observed = 'accepted', observation = null, triggerCount = 0;
      const started = performance.now();
      try {
        observation = await observeReaderEnglishRung({ origin, expected: CONTROL_EXPECTATION,
          trigger: async budget => {
            triggerCount++;
            await budget.call(() => origin.evaluate((node, control) => {
              const paint = () => {
                if (control === 'delayed-valid') {
                  node.dataset.proseLabel = '高い';
                  const row = document.querySelector('.listen-row'); row.replaceWith(row.cloneNode(true));
                }
                node.dataset.ladderRung = 'gloss'; node.dataset.depthAside = 'meaning'; node.classList.add('has-en');
                const en = document.createElement('span'); en.className = 'tok-en';
                const ink = document.createElement('span'); ink.className = 'tok-en-text'; ink.textContent = 'high';
                en.append(ink); node.append(en);
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
            }, id));
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
      observation: expected === 'accepted' ? { ...syntheticEnglishSnapshot(), elapsedMs: 400, totalDeadlineMs: 5000, armedBeforeTrigger: true, actionSettled: true, selectionAttempts: 1 } : null })) } };
}
