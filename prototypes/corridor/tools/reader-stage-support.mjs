import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';
const calls = [];
const save = (out) => {
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'g3-reader-stage.json'), JSON.stringify(calls, null, 2) + '\n');
};
const record = async (page) => (await readAppRecordSnapshot(page)).record;
/** Ladder · a durable negative: the record is read again and again for `ms`; the first read that breaks `still` is returned
 * (a row the step must not write lands inside the window), else the last read. */
async function quietRecord(page, still, ms = 1500) {
  const deadline = Date.now() + ms;
  let latest = await record(page);
  while (still(latest) && Date.now() < deadline) {
    await delay(25);
    latest = await record(page);
  }
  return latest;
}
async function facts(target, page) {
  return {
    target: await target.evaluate((n) => ({
      connected: n.isConnected,
      index: n.dataset.index,
      word: n.dataset.word,
      rung: n.dataset.ladderRung || null,
      reading: [...n.querySelectorAll('rt')].map((r) => r.textContent).join(''),
      // Ladder · the English rung's row under the word (its own text, null while no row stands), the column it stands in,
      // and the DOTS hook it raises on the occurrence
      english: n.querySelector(':scope > .tok-en .tok-en-text')?.textContent.trim() ?? null,
      hasEn: n.classList.contains('has-en'),
      aside: n.dataset.depthAside ?? null,
      // F · a reading is the one ruby: a native rt, painted where it shows. A host that still draws one by ::before is read
      // the same way, so either paint counts and neither is assumed
      visibleReadings: [...n.querySelectorAll('ruby')]
        .map((r) => {
          const rt = r.querySelector('rt'),
            ns = rt && getComputedStyle(rt);
          if (
            ns &&
            rt.textContent &&
            ns.display !== 'none' &&
            ns.visibility !== 'hidden' &&
            Number(ns.opacity) >= 1 &&
            rt.getClientRects().length > 0
          )
            return rt.textContent;
          const s = getComputedStyle(r, '::before'),
            c = s.content;
          return s.display !== 'none' &&
            s.visibility !== 'hidden' &&
            Number(s.opacity) >= 1 &&
            c !== 'none' &&
            c !== 'normal'
            ? c.startsWith('attr(')
              ? r.dataset.r
              : c.slice(1, -1)
            : '';
        })
        .join(''),
      painted: [...n.querySelectorAll('ruby')].map((r) => ({
        reading: r.dataset.r,
        native: (() => {
          const rt = r.querySelector('rt'),
            s = rt && getComputedStyle(rt);
          return s ? { text: rt.textContent, hidden: rt.classList.contains('hidden-rt'), display: s.display, visibility: s.visibility, opacity: s.opacity } : null;
        })(),
        content: getComputedStyle(r, '::before').content,
        opacity: getComputedStyle(r, '::before').opacity,
        display: getComputedStyle(r, '::before').display,
      })),
    })),
    mini: await page
      .locator('#mini')
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          key: n.dataset.key,
          word: n.querySelector('.mini-word')?.textContent,
        })),
      ),
    sheets: await page.locator('#sheet').count(),
  };
}
async function pressGlyph(page, target) {
  await target.scrollIntoViewIfNeeded();
  const point = await target.evaluate((n) => {
    const walker = document.createTreeWalker(
      n.querySelector('.tok-word') || n,
      NodeFilter.SHOW_TEXT,
    );
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (t.parentElement.closest('rt,rp,.tok-en') || !t.data.trim()) continue;
      const at = [...t.data].findIndex((c) => c.trim()),
        r = document.createRange();
      r.setStart(t, at);
      r.setEnd(t, at + 1);
      const b = r.getBoundingClientRect(),
        x = b.x + b.width / 2,
        y = b.y + b.height / 2,
        hit = document.elementFromPoint(x, y);
      return {
        x,
        y,
        glyph: t.data.slice(at, at + 1),
        owned: !!hit && (hit === n || n.contains(hit)),
        hit: hit?.closest('.tok')?.dataset.index,
      };
    }
    return null;
  });
  assert(point?.owned, 'The exact source occurrence owns its printed glyph');
  await page.mouse.click(point.x, point.y);
  return point;
}
/** The exact occurrence's climb to its stage, one observed rung per press (Ladder, John 10-19): the reading (depth 1), the
 * English under the word (depth 2, the meaning's first showing), then the stage (no row of its own). */
export async function exactReaderStage(page, target, { word, index, reading, evidenceDir }) {
  const call = {
    word,
    index,
    reading,
    browserVersion: page.context().browser()?.version(),
    width: page.viewportSize()?.width,
    steps: [],
  };
  calls.push(call);
  try {
    await target.waitFor();
    assert.equal(await target.count(), 1);
    assert.equal(
      await page.locator('body').getAttribute('data-furigana'),
      '1',
      'The bundled fixture exercises the on-touch ladder',
    );
    // A fresh-use demonstration is a separate behavior. Fold only an observed visit through native Escape.
    if (await page.locator('[data-ladder-rung]').count()) {
      call.setupFold = await page
        .locator('[data-ladder-rung]')
        .evaluateAll((ns) => ns.map((n) => ({ word: n.dataset.word, rung: n.dataset.ladderRung })));
      await page.keyboard.press('Escape');
    }
    const anchor = await target.elementHandle(),
      initial = await facts(target, page),
      before = await record(page);
    call.initial = initial;
    call.before = before;
    assert.equal(initial.target.index, String(index));
    assert.equal(initial.target.word, word);
    assert.equal(initial.target.rung, null);
    assert.equal(initial.target.reading, reading);
    assert.equal(initial.target.visibleReadings, '');
    assert.equal(initial.target.english, null, 'The bare word carries no English row');
    assert.equal(initial.mini.length, 0);
    assert.equal(initial.sheets, 0);
    call.firstPoint = await pressGlyph(page, target);
    await page.waitForFunction(
      ({ index }) =>
        document.querySelector(`#reader .tok[data-index="${index}"]`)?.dataset.ladderRung ===
        'reading',
      { index },
    );
    await page.waitForFunction((index) => {
      const rs = [...document.querySelectorAll(`#reader .tok[data-index="${index}"] ruby`)];
      return (
        rs.length > 0 &&
        rs.every((r) => {
          // F · the native rt paints the reading; a ::before reading is still read where a host draws one
          const rt = r.querySelector('rt'),
            ns = rt && getComputedStyle(rt);
          if (
            ns &&
            rt.textContent &&
            ns.display !== 'none' &&
            ns.visibility !== 'hidden' &&
            Number(ns.opacity) >= 1 &&
            rt.getClientRects().length > 0
          )
            return true;
          const s = getComputedStyle(r, '::before');
          return (
            s.display !== 'none' &&
            s.visibility !== 'hidden' &&
            Number(s.opacity) >= 1 &&
            s.content !== 'none' &&
            s.content !== 'normal'
          );
        })
      );
    }, index);
    await waitForAppRecord(
      page,
      (r) => (r.obslog || []).length === (before.obslog || []).length + 1,
    );
    const revealed = await facts(target, page),
      r1 = await record(page);
    call.steps.push({ phase: 'reading', facts: revealed, record: r1 });
    assert.equal(
      await anchor.evaluate(
        (n, index) => n === document.querySelector(`#reader .tok[data-index="${index}"]`),
        index,
      ),
      true,
      'The first activation keeps the exact original DOM occurrence',
    );
    assert.equal(revealed.target.rung, 'reading');
    assert.equal(revealed.target.visibleReadings, reading);
    assert.equal(revealed.target.english, null, 'The first activation is just the reading: no English yet');
    assert.equal(revealed.mini.length, 0);
    assert.equal(revealed.sheets, 0);
    const baseline = before.obslog || [],
      rows1 = r1.obslog || [];
    assert.deepEqual(rows1.slice(0, -1), baseline);
    assert.deepEqual(rows1.at(-1).slice(1, 4), ['tap', `word:${word}`, 1]);
    assert.equal(typeof rows1.at(-1)[4], 'string');
    // Ladder (John, 10-19, a spec change): the second activation no longer opens the stage. It sets the word's English
    // under it, its reading kept over it, and no stage yet; that English is the meaning's first showing, so it (not the
    // stage) writes the depth-2 row for the same article. Only the observed rung permits the next press.
    call.secondPoint = await pressGlyph(page, target);
    await page.waitForFunction(
      ({ index }) =>
        ['gloss', 'stage'].includes(
          document.querySelector(`#reader .tok[data-index="${index}"]`)?.dataset.ladderRung,
        ) || !!document.getElementById('mini'),
      { index },
    );
    assert.equal(
      await target.getAttribute('data-ladder-rung'),
      'gloss',
      'The second activation stops at the English rung, before the stage',
    );
    // the row's text is the dictionary's English for the word, waited for on this rung (never a press)
    await page.waitForFunction(
      ({ index }) => {
        const text = document
          .querySelector(`#reader .tok[data-index="${index}"] > .tok-en .tok-en-text`)
          ?.textContent.trim();
        return !!text && text !== '—';
      },
      { index },
    );
    await waitForAppRecord(page, (r) => (r.obslog || []).length === baseline.length + 2);
    const english = await facts(target, page),
      r2 = await record(page);
    call.steps.push({ phase: 'english', facts: english, record: r2 });
    assert.equal(
      await anchor.evaluate(
        (n, index) => n === document.querySelector(`#reader .tok[data-index="${index}"]`),
        index,
      ),
      true,
      'The second activation keeps the same original occurrence',
    );
    assert.equal(english.target.rung, 'gloss');
    assert.equal(english.target.visibleReadings, reading, 'The English rung keeps the reading over the word');
    assert(
      !!english.target.english && english.target.english !== '—',
      `The English rung draws the word's English under it: ${JSON.stringify(english.target.english)}`,
    );
    assert.equal(english.target.hasEn, true, 'The English row stands in the word’s own column');
    assert.equal(english.target.aside, 'meaning', 'The occurrence’s depth dot steps aside for its English');
    assert.equal(english.mini.length, 0);
    assert.equal(english.sheets, 0);
    const rows2 = r2.obslog || [];
    assert.deepEqual(rows2.slice(0, -1), rows1);
    assert.deepEqual(rows2.at(-1).slice(1), ['tap', `word:${word}`, 2, rows1.at(-1)[4]]);
    // Ladder (John, 10-19, a spec change): the third activation opens the stage; the reading and the English stay under it,
    // and the stage writes no row of its own (its meaning was shown on the English rung): the record keeps the two rows
    call.thirdPoint = await pressGlyph(page, target);
    await page.locator('#mini-sentence-open').waitFor();
    const r3 = await quietRecord(page, (r) => (r.obslog || []).length === baseline.length + 2);
    const stage = await facts(target, page);
    call.steps.push({ phase: 'stage', facts: stage, record: r3 });
    assert.equal(
      await anchor.evaluate(
        (n, index) => n === document.querySelector(`#reader .tok[data-index="${index}"]`),
        index,
      ),
      true,
      'The third activation keeps the same original occurrence',
    );
    assert.equal(stage.target.rung, 'stage');
    assert.deepEqual(stage.mini, [{ key: `word:${word}`, word }]);
    assert.equal(stage.sheets, 0);
    assert.equal(stage.target.visibleReadings, reading, 'The reading stays over the word under its stage');
    assert.equal(stage.target.english, english.target.english, 'The English stays under the word under its stage');
    assert.deepEqual(r3.obslog || [], rows2, 'The stage writes no observation row: the English rung showed the meaning');
    for (const k of ['taken', 'srs', 'revlog', 'stats', 'lists']) {
      assert.deepEqual(r1[k], before[k], `${k} unchanged on reading`);
      assert.deepEqual(r2[k], before[k], `${k} unchanged on English`);
      assert.deepEqual(r3[k], before[k], `${k} unchanged on stage`);
    }
    call.passed = true;
  } catch (error) {
    call.passed = false;
    call.error = String(error.stack || error);
    throw error;
  } finally {
    save(evidenceDir);
  }
}
