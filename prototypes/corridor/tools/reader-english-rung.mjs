/** Exact-occurrence English observation. This module never starts a browser.
 * One clock starts before arming; every action and wait spends the same 5 s.
 * Expectations are source proposals, independently keyed by W2, never DOM output.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
export const ENGLISH_DEADLINE_MS = 5000;
export const ENGLISH_SOURCE_PATHS = Object.freeze({
  helper: 'prototypes/corridor/tools/reader-english-rung.mjs',
  expectations: 'prototypes/corridor/tools/reader-english-rung-expectations.json',
  controls: 'prototypes/corridor/tools/reader-english-rung-controls.mjs',
});
export const ENGLISH_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const englishSourcePins = (root = ENGLISH_ROOT) => Object.fromEntries(
  Object.entries(ENGLISH_SOURCE_PATHS).map(([key, path]) => [key,
    createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]),
);
export const englishExpectations = (root = ENGLISH_ROOT) => JSON.parse(
  readFileSync(resolve(root, ENGLISH_SOURCE_PATHS.expectations), 'utf8'),
).entries;
export function englishExpectation(articleId, usage) {
  const rows = englishExpectations().filter(row => row.id === articleId && row.usage === usage);
  if (rows.length !== 1) throw new Error(`English fixture is not unique: ${usage}/${articleId}`);
  return rows[0];
}
export function assertEnglishSource(body, expectation) {
  const token = body.tokens[expectation.occurrenceIndex];
  const actual = [body.id, token?.s, token?.b, token?.r,
    (token?.f || []).filter(pair => pair.r).map(pair => pair.r)];
  const wanted = [expectation.id, expectation.surface, expectation.lemma,
    expectation.sourceReading, expectation.readingSegments];
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error('English source occurrence changed');
}
export class EnglishRungError extends Error {
  constructor(code, detail = null) { super(`reader English: ${code}`); this.code = code; this.detail = detail; }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function judgeEnglishSnapshot(value, expected, { baseline = false } = {}) {
  if (value.hazards?.length) throw new EnglishRungError(value.hazards[0], value);
  if (!value.connected || !value.sameOriginalElement) throw new EnglishRungError('detached-or-replaced', value);
  if (!same([value.articleId, value.occurrenceIndex, value.surface, value.lemma],
    [expected.id, expected.occurrenceIndex, expected.surface, expected.lemma])) throw new EnglishRungError('wrong-identity', value);
  if (value.stageSeen || value.sheetSeen || value.rung === 'stage') throw new EnglishRungError('premature-stage-or-sheet', value);
  if (baseline) {
    if (value.rung === 'gloss' || value.englishCount || value.hasEn) throw new EnglishRungError('not-armed-before-trigger', value);
    return false;
  }
  if (!same(value.readingSegments, expected.readingSegments)) throw new EnglishRungError('wrong-reading', value);
  if (value.english && !['…', '...'].includes(value.english) && value.english !== expected.english)
    throw new EnglishRungError('wrong-English', value);
  return value.rung === 'gloss' && value.hasEn === true && value.depthAside === 'meaning' &&
    value.englishCount === 1 && value.english === expected.english &&
    value.readingVisible === true && value.englishVisible === true;
}

/** Injectable transport for pure tests; production and controls use this identical loop. */
export async function observeEnglish({ expected, arm, trigger, now = () => performance.now(),
  sleep = ms => new Promise(done => setTimeout(done, ms)), bounded = true }) {
  const started = now();
  const deadline = started + ENGLISH_DEADLINE_MS;
  let active = true, monitor, lastSnapshot = null;
  const remaining = () => {
    const left = deadline - now();
    if (!active || left <= 0) throw new EnglishRungError('deadline');
    return left;
  };
  const call = async operation => {
    const left = remaining();
    let timer;
    try {
      const work = Promise.resolve().then(operation);
      const value = bounded ? await Promise.race([work, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new EnglishRungError('deadline')), left);
      })]) : await work;
      remaining();
      return value;
    } finally { clearTimeout(timer); }
  };
  const sample = async () => { lastSnapshot = await call(() => monitor.read()); return lastSnapshot; };
  const budget = { remaining, call, waitUntil: async predicate => {
    for (;;) {
      const value = await call(predicate);
      if (value) return value;
      await call(() => sleep(Math.min(16, remaining())));
    }
  } };
  try {
    // A delayed arm result must dispose itself even if the absolute deadline won.
    monitor = await call(async () => {
      const value = await arm();
      if (!active || now() >= deadline) { await value.close(); throw new EnglishRungError('deadline'); }
      return value;
    });
    judgeEnglishSnapshot(await sample(), expected, { baseline: true });
    await call(() => trigger(budget));
    for (;;) {
      const value = await sample();
      if (judgeEnglishSnapshot(value, expected)) {
        // A final frame drains mutation records and catches same-task transient changes.
        await call(() => monitor.frame ? monitor.frame() : sleep(16));
        const final = await sample();
        if (judgeEnglishSnapshot(final, expected)) return {
          ...final, elapsedMs: now() - started, totalDeadlineMs: ENGLISH_DEADLINE_MS,
          armedBeforeTrigger: true, actionSettled: true, selectionAttempts: 1,
        };
      }
      await call(() => sleep(Math.min(16, remaining())));
    }
  } catch (error) {
    error.detail ??= lastSnapshot;
    error.elapsedMs = now() - started;
    error.totalDeadlineMs = ENGLISH_DEADLINE_MS;
    throw error;
  } finally {
    active = false;
    // Cleanup is outside the observation deadline and cannot turn failure into success.
    if (monitor) await monitor.close();
  }
}

/** Runs in the browser realm. No product resolver, requery substitution or text oracle. */
export function installEnglishMonitor(node) {
  const reader = node?.closest('#reader');
  const passage = document.querySelector('.listen-row[data-passage]');
  const ancestors = []; for (let p = node; p; p = p.parentElement) ancestors.push(p);
  const identity = { index: node?.dataset.index, word: node?.dataset.word,
    proseLabel: node?.dataset.proseLabel, passage: passage?.dataset.passage };
  const surfaceOf = word => {
    const copy = word?.cloneNode(true); copy?.querySelectorAll('rt').forEach(rt => rt.remove());
    return copy?.textContent;
  };
  const originalSurface = surfaceOf(node?.querySelector(':scope > .tok-word'));
  const wordText = new WeakMap();
  const rememberText = () => {
    const word = node?.querySelector(':scope > .tok-word');
    if (!word) return;
    const walk = document.createTreeWalker(word, NodeFilter.SHOW_TEXT);
    for (let text = walk.nextNode(); text; text = walk.nextNode())
      if (!text.parentElement?.closest('rt') && !wordText.has(text)) wordText.set(text, text.data);
  };
  rememberText();
  const hazards = new Set(); let closed = false, raf;
  const danger = n => n?.nodeType === 1 && (n.matches('#mini,#sheet') || n.querySelector('#mini,#sheet'));
  const inspect = records => {
    for (const r of records) {
      if (r.type === 'characterData' && wordText.has(r.target) &&
          (r.oldValue !== wordText.get(r.target) || r.target.data !== wordText.get(r.target))) hazards.add('wrong-identity');
      if (r.type === 'childList') {
        for (const removed of r.removedNodes) {
          if (ancestors.some(a => removed === a || removed.contains?.(a))) hazards.add('detached-or-replaced');
          if (danger(removed)) hazards.add('premature-stage-or-sheet');
          if (r.target === node && removed.matches?.('.tok-word') && surfaceOf(removed) !== originalSurface) hazards.add('wrong-identity');
        }
        for (const added of r.addedNodes) {
          if (danger(added)) hazards.add('premature-stage-or-sheet');
          if (r.target === node && added.matches?.('.tok-word') && surfaceOf(added) !== originalSurface) hazards.add('wrong-identity');
        }
        for (const changed of [...r.addedNodes, ...r.removedNodes]) {
          const rows = changed.nodeType === 1 ? [changed, ...changed.querySelectorAll('.listen-row[data-passage]')] : [];
          if (rows.some(row => row.matches('.listen-row[data-passage]') && row.dataset.passage !== identity.passage)) hazards.add('wrong-identity');
        }
      }
      if (r.type === 'attributes') {
        const wanted = { 'data-index': identity.index, 'data-word': identity.word, 'data-prose-label': identity.proseLabel };
        if (r.target === node && Object.hasOwn(wanted, r.attributeName) &&
            (r.oldValue !== (wanted[r.attributeName] ?? null) || node.getAttribute(r.attributeName) !== (wanted[r.attributeName] ?? null))) hazards.add('wrong-identity');
        if (r.target.matches?.('.listen-row') && r.attributeName === 'data-passage' &&
            (r.oldValue !== identity.passage || r.target.dataset.passage !== identity.passage)) hazards.add('wrong-identity');
        if (r.target === node && r.attributeName === 'data-ladder-rung' && (r.oldValue === 'stage' || node.dataset.ladderRung === 'stage')) hazards.add('premature-stage-or-sheet');
        if (r.attributeName === 'id' && (['mini', 'sheet'].includes(r.oldValue) || danger(r.target))) hazards.add('premature-stage-or-sheet');
      }
    }
  };
  const observer = new MutationObserver(inspect);
  observer.observe(document.documentElement, { subtree: true, childList: true,
    attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true });
  const visible = el => {
    if (!el?.isConnected) return false;
    const inkStyle = getComputedStyle(el);
    const transparent = color => color === 'transparent' || /(?:,|\/)\s*0(?:\.0+)?\s*\)$/u.test(color);
    if (transparent(inkStyle.color) || transparent(inkStyle.webkitTextFillColor)) return false;
    if (!(Number.parseFloat(inkStyle.fontSize) > 0)) return false;
    const ink = document.createRange(); ink.selectNodeContents(el);
    const rect = ink.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth)) return false;
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (p.hidden || s.display === 'none' || ['hidden', 'collapse'].includes(s.visibility) || Number(s.opacity) !== 1 || s.contentVisibility === 'hidden') return false;
      if (s.clipPath !== 'none' || s.clip !== 'auto' || /opacity\(\s*0(?:\.0+)?%?\s*\)/u.test(s.filter)) return false;
      if (p !== el && /(hidden|clip|scroll|auto)/.test(s.overflow + s.overflowX + s.overflowY)) {
        const box = p.getBoundingClientRect();
        if (rect.right <= box.left || rect.left >= box.right || rect.bottom <= box.top || rect.top >= box.bottom) return false;
      }
    }
    // pointer-events:none English still paints. Test occlusion with the nearest
    // hit-testable ancestor, never require the English ink itself to be the hit.
    let hitAncestor = el;
    while (hitAncestor && getComputedStyle(hitAncestor).pointerEvents === 'none') hitAncestor = hitAncestor.parentElement;
    const x = Math.min(innerWidth - 1, Math.max(0, rect.x + rect.width / 2));
    const y = Math.min(innerHeight - 1, Math.max(0, rect.y + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    return !!hit && !!hitAncestor && (hitAncestor === hit || hitAncestor.contains(hit) || hit.contains(el));
  };
  const read = () => {
    inspect(observer.takeRecords());
    const base = node?.querySelector(':scope > .tok-word')?.cloneNode(true);
    base?.querySelectorAll('rt').forEach(rt => rt.remove());
    if (base?.textContent !== originalSurface) hazards.add('wrong-identity');
    rememberText();
    const rts = [...(node?.querySelectorAll(':scope > .tok-word ruby > rt') || [])];
    const ens = [...(node?.querySelectorAll(':scope > .tok-en > .tok-en-text') || [])];
    if (document.querySelector('#mini,#sheet') || node?.dataset.ladderRung === 'stage') hazards.add('premature-stage-or-sheet');
    const sameOriginalElement = reader === document.querySelector('#reader') && node?.isConnected &&
      [...reader.querySelectorAll('.tok[data-index]')].filter(n => n.dataset.index === identity.index).length === 1 &&
      reader.querySelector(`.tok[data-index="${identity.index}"]`) === node;
    if (node?.dataset.index !== identity.index || node?.dataset.word !== identity.word ||
        node?.dataset.proseLabel !== identity.proseLabel || document.querySelector('.listen-row[data-passage]')?.dataset.passage !== identity.passage) hazards.add('wrong-identity');
    return { articleId: document.querySelector('.listen-row[data-passage]')?.dataset.passage, occurrenceIndex: Number(node?.dataset.index),
      surface: base?.textContent, lemma: node?.dataset.word, connected: !!node?.isConnected,
      sameOriginalElement: !!sameOriginalElement, readingSegments: rts.map(rt => rt.textContent),
      readingVisible: rts.every(visible), english: ens[0]?.textContent.trim() || '',
      englishCount: ens.length, englishVisible: ens.length === 1 && visible(ens[0]),
      rung: node?.dataset.ladderRung || null, hasEn: node?.classList.contains('has-en'),
      depthAside: node?.dataset.depthAside || null, stageSeen: !!document.getElementById('mini'),
      sheetSeen: !!document.getElementById('sheet'), hazards: [...hazards], viewportWidth: innerWidth };
  };
  const tick = () => { if (!closed) { read(); raf = requestAnimationFrame(tick); } };
  raf = requestAnimationFrame(tick);
  return { read, frame: () => new Promise(done => requestAnimationFrame(done)), close: () => {
    closed = true; cancelAnimationFrame(raf); observer.disconnect();
  } };
}
export async function observeReaderEnglishRung({ origin, expected, trigger }) {
  return observeEnglish({ expected, trigger, arm: async () => {
    const monitor = await origin.evaluateHandle(installEnglishMonitor);
    return { read: () => monitor.evaluate(m => m.read()), frame: () => monitor.evaluate(m => m.frame()),
      close: async () => { try { await monitor.evaluate(m => m.close()); } finally { await monitor.dispose(); } } };
  } });
}
