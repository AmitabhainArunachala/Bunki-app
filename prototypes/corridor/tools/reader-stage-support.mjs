import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';
const calls = [];
const save = (out) => {
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'g3-reader-stage.json'), JSON.stringify(calls, null, 2) + '\n');
};
const record = async (page) => (await readAppRecordSnapshot(page)).record;
async function facts(target, page) {
  return {
    target: await target.evaluate((n) => ({
      connected: n.isConnected,
      index: n.dataset.index,
      word: n.dataset.word,
      rung: n.dataset.ladderRung || null,
      reading: [...n.querySelectorAll('rt')].map((r) => r.textContent).join(''),
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
    assert.equal(revealed.mini.length, 0);
    assert.equal(revealed.sheets, 0);
    const baseline = before.obslog || [],
      rows1 = r1.obslog || [];
    assert.deepEqual(rows1.slice(0, -1), baseline);
    assert.deepEqual(rows1.at(-1).slice(1, 4), ['tap', `word:${word}`, 1]);
    assert.equal(typeof rows1.at(-1)[4], 'string');
    call.secondPoint = await pressGlyph(page, target);
    await page.locator('#mini-sentence-open').waitFor();
    await waitForAppRecord(page, (r) => (r.obslog || []).length === baseline.length + 2);
    const stage = await facts(target, page),
      r2 = await record(page);
    call.steps.push({ phase: 'stage', facts: stage, record: r2 });
    assert.equal(
      await anchor.evaluate(
        (n, index) => n === document.querySelector(`#reader .tok[data-index="${index}"]`),
        index,
      ),
      true,
      'The second activation keeps the same original occurrence',
    );
    assert.equal(stage.target.rung, 'stage');
    assert.deepEqual(stage.mini, [{ key: `word:${word}`, word }]);
    assert.equal(stage.sheets, 0);
    const rows2 = r2.obslog || [];
    assert.deepEqual(rows2.slice(0, -1), rows1);
    assert.deepEqual(rows2.at(-1).slice(1), ['tap', `word:${word}`, 2, rows1.at(-1)[4]]);
    for (const k of ['taken', 'srs', 'revlog', 'stats', 'lists']) {
      assert.deepEqual(r1[k], before[k], `${k} unchanged on reading`);
      assert.deepEqual(r2[k], before[k], `${k} unchanged on stage`);
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
