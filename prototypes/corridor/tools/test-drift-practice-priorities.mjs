/** Missed practice answers raise a Drift word's visibility and nothing else.
 * Runs the extractor's --check first, then loads the committed drift-layer.js
 * in Chromium and reads each word's priority from inside the layer's closure
 * with the debugger. Nothing here writes a known/unknown judgment or FSRS. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { chromium } from 'playwright-core';

const LAYER = new URL('../drift-layer.js', import.meta.url);
const source = readFileSync(LAYER, 'utf8');
const rePriLine = source.split('\n').indexOf('function rePri(){');
const bonus = misses => Math.min(2.4, 1 + misses * 0.35);

test('the committed layer is exactly what the extractor emits', () => {
  execFileSync(process.execPath, [new URL('build-drift-layer.mjs', import.meta.url).pathname, '--check'], { stdio: 'pipe' });
});

test('practice priorities are a bounded, practice-only visibility preference', async () => {
  assert(rePriLine > 0, 'rePri is missing from the generated layer');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('http://drift.test/**', route => route.request().url().endsWith('/drift-layer.js')
      ? route.fulfill({ contentType: 'text/javascript', body: source })
      : route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body><script src="drift-layer.js"></script></body>' }));
    await page.goto('http://drift.test/');
    await page.waitForFunction(() => typeof window.__DRIFT__?.setPracticePriorities === 'function');

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Debugger.enable');
    await cdp.send('Debugger.setBreakpointByUrl', { urlRegex: 'drift-layer\\.js$', lineNumber: rePriLine + 1 });
    // setPracticePriorities ends in rePri, which pauses on entry: WORDS then
    // still holds the priorities the PREVIOUS projection produced.
    const apply = async (projection, expression) => {
      const paused = new Promise(resolve => cdp.once('Debugger.paused', resolve));
      const call = page.evaluate(p => window.__DRIFT__.setPracticePriorities(p), projection);
      const { callFrames } = await paused;
      const { result } = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: callFrames[0].callFrameId, expression, returnByValue: true,
      });
      await cdp.send('Debugger.resume');
      await call;
      return JSON.parse(result.value);
    };
    const words = await apply(null, 'JSON.stringify(WORDS.slice(0,8).map(w=>w.e[0]))');
    assert.equal(new Set(words).size, 8);
    const snapshot = `JSON.stringify({pri:Object.fromEntries(WORDS.filter(w=>${JSON.stringify(words)}.includes(w.e[0])).map(w=>[w.e[0],w.pri])),store})`;
    const storageBefore = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    const [a, b, c, d, e, f] = words;
    const missed = {
      authority: 'practice-only',
      targets: [
        { subject: `word:${a}`, misses: 2 },
        { subject: `word:${b}`, misses: 40 },
        { subject: `word:${c}`, misses: 3, suppressed: true },
        { subject: `kanji:${d}`, misses: 3 },
        { subject: `word:${e}`, misses: 0 },
        { subject: `word:${f}`, misses: Number.NaN },
        { subject: 'word:辞書に無い語句', misses: 5 },
      ],
    };
    const otherAuthority = { authority: 'sensei', targets: [{ subject: `word:${a}`, misses: 5 }] };

    await apply({ authority: 'practice-only', targets: [] }, snapshot);
    const baseline = await apply(missed, snapshot);
    const boosted = await apply(otherAuthority, snapshot);
    const afterOther = await apply(null, snapshot);

    const round = value => Math.round(value * 1000) / 1000;
    const delta = word => round(boosted.pri[word] - baseline.pri[word]);
    assert.equal(delta(a), round(bonus(2)));
    assert.equal(delta(b), 2.4, 'the preference is capped');
    for (const word of [c, d, e, f]) assert.equal(delta(word), 0, `${word} must not gain priority`);
    assert.deepEqual(boosted.store, baseline.store, 'no known/unknown judgment is written');
    assert.deepEqual(afterOther.pri, baseline.pri, 'only a practice-only projection is honoured');
    assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), storageBefore, 'no storage write');
  } finally {
    await browser.close();
  }
});
