/**
 * Focused persistence integrity gate for the source Drift artifact.
 *
 * It drives real CDP touch at the operator's 390x844 phone profile and proves
 * that a deliberate flick either commits one complete v1 judgment or changes
 * nothing. Malformed learner data and device quota failures must leave both
 * the stored bytes and the encountered word intact.
 *
 * Usage:
 *   CHROMIUM_PATH=/path/to/chromium \
 *     node prototypes/drift/tools/verify-storage-integrity.mjs [--out FILE]
 */

import { writeFileSync } from 'node:fs';
import process from 'node:process';

import { launchDrift, touchPath, touchTap } from './red-team-harness.mjs';

const STORE_KEY = 'bunki-drift-v1';
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};
const OUT = arg(
  '--out',
  `${process.env.TMPDIR || '/tmp'}/verify-drift-storage-integrity.json`,
);
const executablePath = process.env.CHROMIUM_PATH || process.env.BUNKI_DRIFT_CHROMIUM;

const results = [];
const browserErrors = [];
const check = (name, pass, detail) => {
  const result = { name, pass: !!pass, detail: String(detail) };
  results.push(result);
  console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${name}: ${result.detail}`);
};

async function withDrift(storage, run) {
  let session;
  try {
    session = await launchDrift({
      storage,
      executablePath,
      deviceScaleFactor: Number(arg('--dsf', '1')),
      viewport: { width: 390, height: 844 },
    });
    await session.page.waitForTimeout(900);
    return await run(session);
  } finally {
    if (session) {
      browserErrors.push(
        ...session.pageErrors.map((error) => `pageerror: ${error}`),
        ...session.consoleErrors.map((error) => `console.error: ${error}`),
      );
      await session.close();
    }
  }
}

/** Pick a rendered word whose own pixels receive the touch and whose flick
 * remains inside the viewport. Returning the private seqId lets later probes
 * follow the same word after a failed judgment moves it sideways. */
async function flickTarget(page) {
  return page.evaluate(() => {
    const candidates = [];
    for (const element of document.querySelectorAll('.word')) {
      const node = typeof nodeOf !== 'undefined' ? nodeOf.get(element) : null;
      if (!node || node.gone || node.kind !== 'word') continue;
      const style = getComputedStyle(element);
      const opacity = Number.parseFloat(style.opacity || '0');
      if (!(opacity > 0.44) || style.pointerEvents === 'none') continue;
      const rect = element.getBoundingClientRect();
      if (
        rect.width < 8 || rect.height < 8 ||
        rect.left < 55 || rect.right > innerWidth - 15 ||
        rect.top < 130 || rect.bottom > innerHeight - 130
      ) continue;

      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + rect.width / 3, rect.top + rect.height / 2],
        [rect.left + (rect.width * 2) / 3, rect.top + rect.height / 2],
      ];
      for (const [x, y] of points) {
        const hit = document.elementFromPoint(x, y)?.closest?.('.word');
        if (hit !== element) continue;
        let dx = 0;
        if (x + 190 < innerWidth - 8) dx = 180;
        else if (x - 190 > 8) dx = -180;
        if (!dx) continue;
        candidates.push({
          seqId: node.seqId,
          word: node.w,
          x,
          y,
          dx,
          direction: dx > 0 ? 'familiar' : 'fragile',
          opacity,
          area: rect.width * rect.height,
        });
        break;
      }
    }
    candidates.sort((left, right) =>
      right.opacity - left.opacity || right.area - left.area,
    );
    return candidates[0] || null;
  });
}

async function flickWord(session, accepted) {
  let target = null;
  // CDP dispatch can occasionally be delayed long enough by the fluid canvas
  // that an otherwise identical stream correctly becomes a slow drag. Retry
  // with another real word; never call the product's grade function directly.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    target = await flickTarget(session.page);
    if (!target) throw new Error('no fully reachable Drift word had room for a flick');
    await touchPath(
      session.cdp,
      [{
        from: { x: target.x, y: target.y },
        to: { x: target.x + target.dx, y: target.y },
      }],
      // Keep this to one real pointer move. Under the full fluid animation load,
      // even several immediate CDP round-trips can cross the product's 330ms
      // flick ceiling and accidentally test a deliberate slow drag instead.
      { steps: 1, stepMs: 0 },
    );
    await session.page.waitForTimeout(700);
    if (!accepted || await accepted(session.page, target)) return target;
  }
  throw new Error(`three real flick attempts did not reach ${target?.word || 'a word'}`);
}

const wordState = (page, seqId) => page.evaluate((id) => {
  const node = typeof nodes !== 'undefined'
    ? nodes.find((candidate) => candidate.seqId === id)
    : null;
  if (!node?.el) return null;
  const style = getComputedStyle(node.el);
  return {
    connected: node.el.isConnected,
    gone: !!node.gone,
    pointerEvents: style.pointerEvents,
    opacity: Number.parseFloat(style.opacity || '0'),
    unfolded: node.el.classList.contains('unfolded'),
    glossed: node.el.classList.contains('glossed'),
    focused: typeof focusN !== 'undefined' && focusN === node,
  };
}, seqId);

async function touchPointForWord(page, seqId) {
  return page.evaluate((id) => {
    const node = typeof nodes !== 'undefined'
      ? nodes.find((candidate) => candidate.seqId === id)
      : null;
    if (!node?.el || node.gone) return null;
    const rect = node.el.getBoundingClientRect();
    for (let gx = 1; gx <= 5; gx += 1) {
      for (let gy = 1; gy <= 3; gy += 1) {
        const x = rect.left + (rect.width * gx) / 6;
        const y = rect.top + (rect.height * gy) / 4;
        if (x < 1 || x > innerWidth - 1 || y < 1 || y > innerHeight - 1) continue;
        if (document.elementFromPoint(x, y)?.closest?.('.word') === node.el) return { x, y };
      }
    }
    return null;
  }, seqId);
}

/** A real tap must still reach the exact word after its failed flick. The first
 * Drift tap unfolds that word, so this is stronger evidence than merely
 * reading pointer-events from CSS. */
async function proveTouchable(session, seqId) {
  const before = await wordState(session.page, seqId);
  const point = await touchPointForWord(session.page, seqId);
  if (!before || !point) return { before, point, after: null, registered: false };
  await touchTap(session.cdp, point.x, point.y, { holdMs: 35 });
  await session.page.waitForTimeout(320);
  const after = await wordState(session.page, seqId);
  return {
    before,
    point,
    after,
    registered: !!after && !after.gone && after.pointerEvents !== 'none'
      && (after.unfolded || after.glossed || after.focused),
  };
}

async function visibleHint(page, expected) {
  await page.waitForFunction((text) => {
    const hint = document.getElementById('hint');
    if (!hint || !hint.textContent.includes(text)) return false;
    const style = getComputedStyle(hint);
    return style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '0') > 0.5;
  }, expected, { timeout: 5_000 });
  return page.evaluate(() => {
    const hint = document.getElementById('hint');
    const style = getComputedStyle(hint);
    return {
      text: hint.textContent,
      opacity: Number.parseFloat(style.opacity || '0'),
      visibility: style.visibility,
    };
  });
}

const validSeed = {
  version: 1,
  known: { '先行': 2 },
  unknown: { '保留': 1 },
  lk: 2,
  lu: 1,
  futureEnvelope: {
    source: 'future-build',
    nested: ['keep', { exact: true }],
  },
  operatorNote: 'unknown top-level fields survive',
};
let valid = { error: null };
try {
  valid = await withDrift(JSON.stringify(validSeed), async (session) => {
    const target = await flickWord(session, async (page, candidate) => {
      const state = await wordState(page, candidate.seqId);
      const raw = await page.evaluate((key) => localStorage.getItem(key), STORE_KEY);
      return state?.gone === true && raw !== JSON.stringify(validSeed);
    });
    const raw = await session.page.evaluate((key) => localStorage.getItem(key), STORE_KEY);
    const stored = JSON.parse(raw);
    const judgmentCount = target.direction === 'familiar'
      ? stored.known?.[target.word]
      : stored.unknown?.[target.word];
    return {
      target,
      raw,
      stored,
      judgmentCount,
      wordAfter: await wordState(session.page, target.seqId),
    };
  });
} catch (error) {
  valid = { error: error instanceof Error ? error.message : String(error) };
}
check(
  'valid envelope · a real flick commits one judgment',
  !valid.error
    && valid.raw !== JSON.stringify(validSeed)
    && valid.judgmentCount === 1
    && valid.wordAfter?.gone === true
    && (valid.target.direction === 'familiar'
      ? valid.stored.lk === validSeed.lk + 1 && valid.stored.lu === validSeed.lu
      : valid.stored.lu === validSeed.lu + 1 && valid.stored.lk === validSeed.lk),
  valid.error || `${valid.target?.word || '?'} → ${valid.target?.direction || '?'}; stored count ${valid.judgmentCount ?? 'none'}`,
);
check(
  'valid envelope · unknown top-level fields survive the flick',
  !valid.error
    && valid.stored?.version === validSeed.version
    && valid.stored?.operatorNote === validSeed.operatorNote
    && JSON.stringify(valid.stored?.futureEnvelope) === JSON.stringify(validSeed.futureEnvelope),
  valid.error || `keys after write: ${Object.keys(valid.stored || {}).join(', ')}`,
);

const malformedRaw = '{ "known": [], "unknown": {}, "lk": 0, "lu": 0, "opaque": "KEEP EXACT" }\n';
let malformed = { error: null };
try {
  malformed = await withDrift(malformedRaw, async (session) => {
    const target = await flickWord(session, (page) => page.evaluate(() =>
      document.getElementById('hint')?.textContent.includes('端末のことば記録を保護中')));
    const hint = await visibleHint(session.page, '端末のことば記録を保護中');
    const rawAfterFlick = await session.page.evaluate((key) => localStorage.getItem(key), STORE_KEY);
    const touchability = await proveTouchable(session, target.seqId);
    const rawAfterTap = await session.page.evaluate((key) => localStorage.getItem(key), STORE_KEY);
    return { target, hint, rawAfterFlick, rawAfterTap, touchability };
  });
} catch (error) {
  malformed = { error: error instanceof Error ? error.message : String(error) };
}
check(
  'malformed envelope · exact raw bytes are quarantined',
  !malformed.error
    && malformed.rawAfterFlick === malformedRaw
    && malformed.rawAfterTap === malformedRaw,
  malformed.error || `raw preserved after flick/tap = ${malformed.rawAfterFlick === malformedRaw}/${malformed.rawAfterTap === malformedRaw}`,
);
check(
  'malformed envelope · protection hint is visible',
  !malformed.error
    && malformed.hint?.text.includes('端末のことば記録を保護中')
    && malformed.hint.opacity > 0.5
    && malformed.hint.visibility !== 'hidden',
  malformed.error || `"${malformed.hint?.text || ''}" at opacity ${malformed.hint?.opacity ?? 'none'}`,
);
check(
  'malformed envelope · failed judgment leaves the word touchable',
  !malformed.error
    && malformed.touchability?.before?.gone === false
    && malformed.touchability.before.pointerEvents !== 'none'
    && malformed.touchability.registered,
  malformed.error || `${malformed.target?.word || '?'} present=${!malformed.touchability?.before?.gone}; tap registered=${malformed.touchability?.registered}`,
);

const quotaRaw = JSON.stringify({
  version: 1,
  known: {},
  unknown: {},
  lk: 0,
  lu: 0,
  quotaSentinel: { raw: 'must stay byte-for-byte' },
});
let quota = { error: null };
try {
  quota = await withDrift(quotaRaw, async (session) => {
    await session.page.evaluate((key) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function failDriftWrite(storageKey, value) {
        if (storageKey === key) {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        return original.call(this, storageKey, value);
      };
    }, STORE_KEY);
    const target = await flickWord(session, (page) => page.evaluate(() =>
      document.getElementById('hint')?.textContent.includes('この判断は保存できなかった')));
    const hint = await visibleHint(session.page, 'この判断は保存できなかった');
    const rawAfterFlick = await session.page.evaluate((key) => localStorage.getItem(key), STORE_KEY);
    const touchability = await proveTouchable(session, target.seqId);
    const rawAfterTap = await session.page.evaluate((key) => localStorage.getItem(key), STORE_KEY);
    return { target, hint, rawAfterFlick, rawAfterTap, touchability };
  });
} catch (error) {
  quota = { error: error instanceof Error ? error.message : String(error) };
}
check(
  'quota failure · exact raw bytes remain unchanged',
  !quota.error && quota.rawAfterFlick === quotaRaw && quota.rawAfterTap === quotaRaw,
  quota.error || `raw preserved after flick/tap = ${quota.rawAfterFlick === quotaRaw}/${quota.rawAfterTap === quotaRaw}`,
);
check(
  'quota failure · save-failure hint is visible',
  !quota.error
    && quota.hint?.text.includes('この判断は保存できなかった')
    && quota.hint.opacity > 0.5
    && quota.hint.visibility !== 'hidden',
  quota.error || `"${quota.hint?.text || ''}" at opacity ${quota.hint?.opacity ?? 'none'}`,
);
check(
  'quota failure · failed judgment leaves the word touchable',
  !quota.error
    && quota.touchability?.before?.gone === false
    && quota.touchability.before.pointerEvents !== 'none'
    && quota.touchability.registered,
  quota.error || `${quota.target?.word || '?'} present=${!quota.touchability?.before?.gone}; tap registered=${quota.touchability?.registered}`,
);

check(
  'browser integrity · zero page and console errors',
  browserErrors.length === 0,
  browserErrors.length ? browserErrors.join(' | ') : 'clean',
);

const passed = results.filter((result) => result.pass).length;
const report = {
  passed,
  total: results.length,
  results,
  browserErrors,
  evidence: { valid, malformed, quota },
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\n${passed}/${results.length} checks passed`);
console.log(`results -> ${OUT}`);
process.exit(passed === results.length ? 0 : 1);
