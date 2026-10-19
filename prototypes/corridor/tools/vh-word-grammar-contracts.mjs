import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const candidateRoster=JSON.parse(readFileSync(new URL('./vh-word-grammar-candidate-roster.json',import.meta.url),'utf8'));
export const WG_CANDIDATE_ROSTER=Object.freeze(Object.fromEntries(Object.entries(candidateRoster.engines).map(([engine,walks])=>[engine,Object.freeze(Object.fromEntries(Object.entries(walks).map(([walk,ids])=>[walk,Object.freeze(ids)])))])));
export function grammarCandidateRows(engine){
  return Object.entries(WG_CANDIDATE_ROSTER[engine]||{}).flatMap(([walk,ids])=>ids.map(id=>({id:`${engine}/${id}`,phase:'candidate',walk})));
}
const candidateKey = row => `${row.id.split('/')[0]}/${row.walk}/${row.id.slice(row.id.indexOf('/')+1)}`;

export const G2_CONTROL_IDS = Object.freeze(['reading-check-dropped', 'tap-schedules']);
export const WG_FLAGS = Object.freeze([
  '--controls', '--ladder-only', '--vh-contracts-only', '--vh-ink-only', '--g1-only', '--g2-only', '--g2-control', '--g3-only', '--g4-only', '--g5-only', '--g5-controls',
  '--g6-only', '--g6-thread-current-only', '--g6-frames-only', '--g6-controls-only', '--controls-only',
  '--rooms-only', '--sentences-only', '--kana-only', '--sky-readings-only', '--sky-ownership-only',
]);
export function grammarSelection(argv) {
  const seen = new Set(), narrow = [];
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    assert(WG_FLAGS.includes(flag), `Unknown word-grammar option: ${flag}`);
    assert(!seen.has(flag), `Duplicate word-grammar option: ${flag}`);
    seen.add(flag);
    if (flag === '--g2-control') {
      const id = argv[++i];
      assert(G2_CONTROL_IDS.includes(id), '--g2-control requires a known control');
      narrow.push(flag);
    } else if (flag !== '--controls' && flag !== '--g5-controls') narrow.push(flag);
  }
  assert(narrow.length <= 1, 'Choose exactly one explicit narrow word-grammar schedule');
  return { argv: [...argv], narrow, fullRequested: narrow.length === 0 && seen.has('--controls') };
}

/** Coordinates remain raw. Identity/shape must agree before any tolerance applies. */
export function foldGeometryEqual(before, after) {
  if (!Array.isArray(before) || !before.length || !Array.isArray(after) || before.length !== after.length) return false;
  return before.every((a, i) => {
    const b = after[i];
    if (!a || !b || a.id !== b.id || !Array.isArray(a.tokens) || !a.tokens.length || a.tokens.length !== b.tokens?.length) return false;
    const near = (x, y) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1;
    return near(a.top, b.top) && near(a.height, b.height) && a.tokens.every((t, j) =>
      t.id === b.tokens[j]?.id && near(t.left, b.tokens[j]?.left) && near(t.top, b.tokens[j]?.top));
  });
}
const observedObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const completeFoldGeometry = geometry => Array.isArray(geometry) && geometry.length > 0 && geometry.every(p => observedObject(p) &&
  typeof p.id === 'string' && Number.isFinite(p.top) && Number.isFinite(p.height) && Array.isArray(p.tokens) && p.tokens.length > 0 &&
  p.tokens.every(t => observedObject(t) && typeof t.id === 'string' && Number.isFinite(t.left) && Number.isFinite(t.top)));
const paragraphMovedBy = (moved, from, dy) => moved.id === from.id && moved.height === from.height && moved.top - from.top === dy &&
  moved.tokens.length === from.tokens.length && moved.tokens.every((t, j) => t.id === from.tokens[j].id && t.left === from.tokens[j].left && t.top - from.tokens[j].top === dy);
export function foldShiftBites({ plain, baseline, shifted, amount, direction }) {
  if (!Number.isFinite(amount) || amount <= 0 || ![1, -1].includes(direction)) return false;
  if (![plain, baseline, shifted].every(completeFoldGeometry) || !foldGeometryEqual(baseline, plain) || shifted.length !== baseline.length) return false;
  if (direction !== (baseline[0].top >= plain[0].top ? 1 : -1)) return false;
  return paragraphMovedBy(shifted[0], baseline[0], amount * direction) && shifted.every((p, i) => i === 0 || paragraphMovedBy(p, baseline[i], 0)) &&
    !foldGeometryEqual(shifted, plain);
}
const hoverSide = side => observedObject(side) && side.hover === true && side.disabled === false && typeof side.background === 'string' && side.background.length > 0;
export const sharedHoverDiverges = (mutant, baseline) => observedObject(mutant) && hoverSide(mutant.held) && hoverSide(mutant.peer) &&
  mutant.held.background === 'rgb(255, 0, 255)' && mutant.peer.background !== mutant.held.background && hoverSide(baseline?.peer) &&
  mutant.peer.background === baseline.peer.background;

export const WG_WALKS = Object.freeze([
  'G3-stalled', 'G3-stalled-stage', 'G3-clear', 'G3-front', 'G3-sky-ownership', 'G3-ladder', 'G3-direct-and-anchor', 'G3-current-save', 'G3-kana',
  ...['example', 'page'].flatMap(surface => ['off', 'on-touch', 'always'].map(mode => `G3-sentence-${surface}-${mode}`)),
  'G3-words', 'G3-words-family', 'G3-sky', 'G3-sky-glyph', 'G3-particle', 'G3-demo',
  'G4-interrupt-save', 'G4-ghost', 'G4-one-speed', 'G4-depth', 'G4-tempo', 'G4-interrupt', 'G4-interrupt-desktop',
  'G4-brush', 'G4-demo', 'G4-reduced', 'G4-room', 'G4-voice', 'G4-frames',
  'G5-room-hover', 'G5-second', 'G5-place', 'G5-layer-fold', 'G5-seal', 'G5-keys', 'G5-lists', 'G5-page', 'G5-deck',
  'G5-bar-save-phone', 'G5-bar-save-mac', 'G5-reduced', 'G5-glass-320x568', 'G5-glass-390x844', 'G5-glass-430x932',
  'G5-remove-everywhere', 'G5-tray', 'G5-layers', 'G5-frames',
  'page', 'depth', 'stale', 'frames', 'worlds', 'gloss', 'desktop', 'text-200', 'exposure',
  'g2-depth', 'g2-reading', 'g2-taps',
]);
export function grammarWalkNames(engine) {
  return [...WG_WALKS, ...Object.keys(WG_CANDIDATE_ROSTER[engine] || {}).filter(walk => walk.startsWith('L-'))];
}
export function grammarControlSpec(engine, id) {
  const spec = WG_CONTROL_EVIDENCE[id];
  return spec?.killsByEngine ? { ...spec, kills: spec.killsByEngine[engine] || [] } : spec;
}
export function grammarControlRows(engine) {
  const ids = [
    ...['page-capped', 'scrim-appended', 'word-not-travelling', 'page-fades-over-reader'].map(id => `G1.negative.${id}`),
    ...G2_CONTROL_IDS.map(id => `G2.negative.${id}`),
    ...['stalled-second', 'tap1-opens-box', 'no-gloss-on-tap2', 'stalled-third', 'box-over-ruby', 'ruby-survives-back', 'front-door', 'glyph-z-dropped', 'glyph-hit-region-removed', 'bare-glyph-caption-width'].map(id => `G3.negative.${id}`),
    ...['missing-final-stroke','never-plain-after-input','writing-blocks-tap', 'empty-first-board', 'second-speed-control'].map(id => `G4.negative.${id}`),
    ...['room-keep-hover','second-hold-unkeeps', 'strip-covers-a-button', 'layer-stays-open', 'fold-shift-one-pixel', 'fold-shift-one-quarter-over'].map(id => `G5.negative.${id}`),
  ];
  ids.push(...['mouse-ignored', 'card-fixed-to-glass', 'back-leaves-at-once', 'no-room-made', 'no-aside-mark', ...(engine === 'webkit' ? ['fade-on-a-row'] : []), 'dash-for-none', 'english-ignores-sense'].map(id => `L.negative.${id}`));
  for (const mode of ['touch', 'keyboard']) {
    const g6 = ['missing-reverse', 'captured-text-pinch', 'lost-return-line', 'touchmove-cancel'];
    if (engine === 'chromium') g6.push('late-bubble-pointer', 'touchmove-cancel-native');
    if (mode === 'touch') g6.push('invented-fresh-source');
    ids.push(...g6.map(id => `G6.${mode}.negative.${id}`));
  }
  return ids.map(id => `${engine}/${id}`);
}
export function exactRoster(expected, observed) {
  return Array.isArray(expected) && expected.length > 0 && Array.isArray(observed) &&
    new Set(expected).size === expected.length && new Set(observed).size === observed.length &&
    expected.length === observed.length && [...expected].sort().every((v, i) => v === [...observed].sort()[i]);
}
const servedEdit = (control, kills, local = false, schedule = null) => Object.freeze({ kind: 'served-edit', control, kills: Object.freeze(kills), local,
  ...(schedule ? { schedule: Object.freeze([...schedule]), rows: Object.freeze([...schedule, 'errors', 'schedule']) } : {}) });
const G6_REVERSE_SCHEDULE = ['setup.article-sentence', 'setup.sentence-word', 'setup.word-kanji', 'setup.kanji-part', 'reverse.part-kanji'];
const G6_LINE_SCHEDULE = ['setup.article-shelf', 'setup.shelf-sky', 'setup.sky-shelf', 'setup.shelf-article', 'return.line'];
const G6_PROVENANCE_SCHEDULE = ['kept.identity', 'kept.native-door', 'kept.source-provenance', 'kept.no-record-write', 'kept.list-only', 'kept.removed'];
const G6_CONTROL_TARGETS = Object.freeze({
  'missing-reverse': { target: 'reverse.part-kanji', schedule: G6_REVERSE_SCHEDULE },
  'captured-text-pinch': { target: 'text.two-pointer', schedule: ['text.two-pointer'] },
  'lost-return-line': { target: 'return.line', schedule: G6_LINE_SCHEDULE },
  'touchmove-cancel': { target: 'text.two-pointer', schedule: ['text.two-pointer'] },
  'late-bubble-pointer': { target: 'text.native-two-pointer', schedule: ['text.native-two-pointer'] },
  'touchmove-cancel-native': { target: 'text.native-two-pointer', schedule: ['text.native-two-pointer'] },
  'invented-fresh-source': { target: 'kept.source-provenance', schedule: G6_PROVENANCE_SCHEDULE },
});
export const WG_CONTROL_EVIDENCE = Object.freeze({
  'G1.negative.page-capped': servedEdit('G1.page-capped', ['P1.viewport', 'P1.cap']),
  'G1.negative.scrim-appended': servedEdit('G1.scrim-appended', ['P1.scrim']),
  'G1.negative.word-not-travelling': servedEdit('G1.word-not-travelling', ['P2.cut']),
  'G1.negative.page-fades-over-reader': servedEdit('G1.page-fades-over-reader', ['P14.arrive-sumi', 'P14.arrive-yoru']),
  'G2.negative.reading-check-dropped': servedEdit('G2.reading-check-dropped', ['G2.4', 'G2.4.rooms']),
  'G2.negative.tap-schedules': servedEdit('G2.tap-schedules', ['G2.7']),
  'G3.negative.stalled-second': servedEdit('stalled-second', ['G3.control.stage', 'G3.control.stage-clear']),
  'G3.negative.tap1-opens-box': servedEdit('tap1-opens-box', ['G3.clear.reading']),
  'G3.negative.no-gloss-on-tap2': servedEdit('no-gloss-on-tap2', ['G3.control.gloss']),
  'G3.negative.stalled-third': servedEdit('stalled-third', ['G3.control.stage', 'G3.control.stage-clear']),
  'G3.negative.box-over-ruby': servedEdit('box-over-ruby', ['G3.control.stage-clear']),
  'L.negative.mouse-ignored': servedEdit('ladder:mouse-ignored', ['M.hold', 'M.second-hold', 'M.drag']),
  'L.negative.card-fixed-to-glass': servedEdit('ladder:card-fixed-to-glass', ['L.scroll.down', 'L.scroll.up']),
  'L.negative.back-leaves-at-once': servedEdit('ladder:back-leaves-at-once', ['L.bar-back']),
  'L.negative.no-room-made': Object.freeze({ ...servedEdit('ladder:no-room-made', []), killsByEngine: Object.freeze({ chromium: Object.freeze(['L.d7.1440x900']), webkit: Object.freeze(['L.d7.390x844']) }) }),
  'L.negative.no-aside-mark': servedEdit('ladder:no-aside-mark', ['L.dots']),
  'L.negative.fade-on-a-row': servedEdit('ladder:fade-on-a-row', ['L.d7.fade.390x560']),
  'L.negative.dash-for-none': servedEdit('ladder:dash-for-none', ['L.gloss.never-dash']),
  'L.negative.english-ignores-sense': servedEdit('ladder:english-ignores-sense', ['L.gloss.sense']),
  'G3.negative.ruby-survives-back': servedEdit('ruby-survives-back', ['G3.clear.bare']),
  'G3.negative.front-door': servedEdit('front-door', ['G3.front.sealed']),
  'G3.negative.glyph-z-dropped': servedEdit('glyph-z-dropped', ['G3.sky-ownership.centre']),
  'G3.negative.glyph-hit-region-removed': servedEdit('glyph-hit-region-removed', ['G3.sky-ownership.centre']),
  'G3.negative.bare-glyph-caption-width': servedEdit('bare-glyph-caption-width', ['G3.sky-ownership.caption']),
  'G4.negative.missing-final-stroke': servedEdit('missing-final-stroke', ['G4.interrupt.save-at-once']),
  'G4.negative.never-plain-after-input': servedEdit('never-plain-after-input', ['G4.interrupt.save-at-once']),
  'G4.negative.writing-blocks-tap': servedEdit('writing-blocks-tap', ['G4.interrupt.save-acts']),
  'G4.negative.empty-first-board': servedEdit('empty-first-board', ['G4.ghost.first-frame', 'G4.ghost.first-pixels']),
  'G4.negative.second-speed-control': servedEdit('second-speed-control', ['G4.one-speed']),
  'G5.negative.room-keep-hover': Object.freeze({ kind: 'shared-hover', control: 'G5.room-keep-hover', candidate: 'G5.room.shared-hover' }),
  'G5.negative.second-hold-unkeeps': servedEdit('second-hold-unkeeps', ['G5.second-hold']),
  'G5.negative.strip-covers-a-button': servedEdit('strip-covers-a-button', ['G5.strip.place']),
  'G5.negative.layer-stays-open': servedEdit('layer-stays-open', ['G5.layers.fold-paper']),
  'G5.negative.fold-shift-one-pixel': Object.freeze({ kind: 'fold-shift', control: 'fold-shift-one-pixel', amount: 1, candidate: 'G5.layers.bare-again' }),
  'G5.negative.fold-shift-one-quarter-over': Object.freeze({ kind: 'fold-shift', control: 'fold-shift-one-quarter-over', amount: 1.25, candidate: 'G5.layers.bare-again' }),
  ...Object.fromEntries(['touch', 'keyboard'].flatMap(mode => Object.entries(G6_CONTROL_TARGETS).map(([id, { target, schedule }]) =>
    [`G6.${mode}.negative.${id}`, servedEdit(`G6.${mode}.${id}`, [target], true, schedule)]))),
});
const HEX64 = /^[a-f0-9]{64}$/u;
const sameIds = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length > 0 && JSON.stringify(a.map(row => row?.id)) === JSON.stringify(b.map(row => row?.id));
const sameValue = (a, b) => a !== undefined && JSON.stringify(a) === JSON.stringify(b);
function servedEditsExact(control, digests) {
  const edits = control.edits, served = control.served;
  if (!Array.isArray(edits) || !edits.length || !Array.isArray(served) || !served.length) return false;
  const editKeys = edits.map(edit => `${edit?.file}\u0000${edit?.key}`);
  if (new Set(editKeys).size !== editKeys.length || edits.some(edit => !edit?.file || !edit?.key)) return false;
  const mutants = new Map();
  const entriesExact = served.every(entry => {
    const declared = edits.filter(edit => edit.file === entry?.file).map(edit => edit.key).sort();
    const applied = Array.isArray(entry?.applied) ? entry.applied.map(row => row?.key).sort() : [];
    if (!declared.length || JSON.stringify(applied) !== JSON.stringify(declared)) return false;
    if (!HEX64.test(entry.baseSha256 || '') || !HEX64.test(entry.mutantSha256 || '') || entry.baseSha256 === entry.mutantSha256) return false;
    if (digests.get(entry.file) !== entry.baseSha256) return false;
    if (mutants.has(entry.file) && mutants.get(entry.file) !== entry.mutantSha256) return false;
    mutants.set(entry.file, entry.mutantSha256);
    return true;
  });
  return entriesExact && edits.every(edit => mutants.has(edit.file));
}
const noDeclaredErrors = (value, required = false) => value === undefined ? !required : Array.isArray(value) && value.length === 0;
const executedRow = row => row && !row.error && !row.setupError && row.harnessError == null &&
  !row.observed?.unexecuted && row.observed?.harnessError == null;
const samePresentFields = (a, b, keys) => observedObject(a) && observedObject(b) &&
  keys.every(key => Object.hasOwn(a, key) && Object.hasOwn(b, key) && a[key] !== undefined && sameValue(a[key], b[key]));
const contextFields = ['stamp', 'scale', 'node', 'miniCount'];

// Independent input contracts: a producer's inputIntegrity.ok is not evidence.
function syntheticInputExecuted(observed) {
  const pointer = observed.events, touch = observed.touch, events = touch?.events;
  if (!Array.isArray(pointer) || !Array.isArray(events) || touch.error != null) return false;
  const sequence = sameValue(pointer.map(e => [e?.type, e?.id]), [
    ['pointerdown', 601], ['pointerdown', 602], ['pointermove', 601], ['pointermove', 602], ['pointercancel', 601], ['pointercancel', 602],
  ]) && sameValue(events.map(e => [e?.type, e?.count, e?.changedCount]), [
    ['touchstart', 1, 1], ['touchstart', 2, 1], ['touchmove', 2, 2], ['touchmove', 2, 2], ['touchcancel', 0, 2],
  ]);
  return sequence && [...pointer, ...events].every(e => e.cancelable === true && e.afterDispatch === true &&
    e.connected === true && typeof e.defaultPrevented === 'boolean' && e.accepted === !e.defaultPrevented) &&
    typeof observed.before?.stamp === 'string' && observed.before.stamp.length > 0 &&
    [observed.pointerAfter, observed.after].every(after => samePresentFields(observed.before, after, contextFields));
}
function nativeInputExecuted(observed) {
  const events = observed.events, commands = observed.commands, inventory = observed.inventory;
  if (!Array.isArray(events) || !events.length || !Array.isArray(commands) || !observedObject(inventory) || observed.inputError !== null) return false;
  if (!sameValue(commands.map(c => c?.type), ['touchStart', 'touchMove', 'touchMove', 'touchMove', 'touchMove', 'touchEnd']) ||
      !commands.every(c => c.completed === true)) return false;
  const stamp = observed.before?.stamp;
  if (typeof stamp !== 'string' || !stamp || !samePresentFields(observed.before, observed.after, contextFields) ||
      !events.every(e => e?.trusted === true && e.afterDispatch === true && e.connected === true && e.stamp === stamp &&
        Number.isFinite(e.timeStamp) && typeof e.defaultPrevented === 'boolean')) return false;
  const downs = events.filter(e => e.family === 'pointer' && e.type === 'pointerdown');
  const terminals = events.filter(e => e.family === 'pointer' && ['pointerup', 'pointercancel'].includes(e.type));
  return downs.length >= 2 && downs.every(e => Number.isInteger(e.pointerId)) && new Set(downs.map(e => e.pointerId)).size >= 2 &&
    downs.every(down => terminals.some(end => end.pointerId === down.pointerId && end.timeStamp >= down.timeStamp)) &&
    events.some(e => e.family === 'touch' && ['touchend', 'touchcancel'].includes(e.type) && e.count === 0) && inventory.remaining === 0 &&
    Number.isFinite(inventory.pointerMoves) && inventory.pointerMoves > 0 && Number.isFinite(inventory.touchMoves) && inventory.touchMoves > 0 &&
    events.some(e => e.family === 'pointer' && e.type === 'pointermove') && events.some(e => e.family === 'touch' && e.type === 'touchmove');
}
function g6ScheduleWitnessed(spec, rows) {
  const errors = rows.find(row => row.id === 'errors')?.observed, schedule = rows.find(row => row.id === 'schedule')?.observed;
  return observedObject(errors) && sameValue(errors.pageErrors, []) && sameValue(errors.consoleErrors, []) && errors.diagnosticError === null &&
    observedObject(schedule) && sameValue(schedule.expected, spec.schedule) && sameValue(schedule.actual, [...spec.schedule, 'errors']) && schedule.error === null;
}
function g6FaultAbsent(name, observed) {
  switch (name) {
    case 'missing-reverse': return observed.before?.scale === 'part' && observed.after?.scale === 'kanji' && observed.arrived === true;
    case 'captured-text-pinch': return observed.faults?.textPinch === 0 && observed.events.every(e => e.type !== 'pointermove' || e.defaultPrevented === false);
    case 'lost-return-line': return Number.isFinite(observed.delta) && observed.delta >= 0 && observed.delta <= 4 &&
      samePresentFields(observed.origin, observed.current, ['index', 'para', 'label', 'word', 'printed', 'title']) && observed.current.connected === true;
    case 'late-bubble-pointer': return observed.faults?.latePointer === 0 &&
      observed.events.every(e => e.family !== 'pointer' || e.type !== 'pointermove' || e.defaultPrevented === false);
    case 'touchmove-cancel': return observed.faults?.touchmove === 0 && observed.touch.events.every(e => e.type !== 'touchmove' || e.defaultPrevented === false);
    case 'touchmove-cancel-native': return observed.faults?.touchmove === 0 &&
      observed.events.every(e => e.family !== 'touch' || e.type !== 'touchmove' || e.defaultPrevented === false);
    case 'invented-fresh-source': return observed.branch === 'no-ref' && observed.counts?.door === 0 && observed.markers?.inventedSource === 0;
    default: return false;
  }
}
function g6ObservedWitness(spec, baseline, mutant, restore) {
  const target = spec.kills[0], samples = [baseline, mutant, restore].map(rows => rows.find(row => row.id === target)?.observed);
  if (!samples.every(observedObject)) return false;
  if (![baseline, mutant, restore].every(rows => g6ScheduleWitnessed(spec, rows))) return false;
  const [before, observed, after] = samples, name = spec.control.split('.').at(-1);
  if (['captured-text-pinch', 'touchmove-cancel'].includes(name) && !samples.every(syntheticInputExecuted)) return false;
  if (['late-bubble-pointer', 'touchmove-cancel-native'].includes(name) && !samples.every(nativeInputExecuted)) return false;
  if (!g6FaultAbsent(name, before) || !g6FaultAbsent(name, after)) return false;
  switch (name) {
    case 'missing-reverse': return observed.before?.scale === 'part' && observed.after?.scale === 'part' && observed.arrived === false;
    case 'captured-text-pinch': return observed.events.some(e => e.type === 'pointermove' && e.defaultPrevented === true);
    case 'lost-return-line': return Number.isFinite(observed.delta) && observed.delta > 4 &&
      samePresentFields(observed.origin, observed.current, ['index', 'para', 'label', 'word', 'printed', 'title']) && observed.current.connected === true;
    case 'late-bubble-pointer': return Number.isFinite(observed.faults?.latePointer) && observed.faults.latePointer > 0 &&
      observed.events.some(e => e.family === 'pointer' && e.type === 'pointermove' && e.count === 2 && e.trusted === true && e.defaultPrevented === true);
    case 'touchmove-cancel': return Number.isFinite(observed.faults?.touchmove) && observed.faults.touchmove > 0 &&
      observed.touch.events.some(e => e.type === 'touchmove' && e.count === 2 && e.defaultPrevented === true);
    case 'touchmove-cancel-native': return Number.isFinite(observed.faults?.touchmove) && observed.faults.touchmove > 0 &&
      observed.events.some(e => e.family === 'touch' && e.type === 'touchmove' && e.count === 2 && e.trusted === true && e.defaultPrevented === true);
    case 'invented-fresh-source': return before.branch === 'no-ref' && observed.branch === 'no-ref' &&
      Number.isFinite(observed.counts?.door) && observed.counts.door > 0 && Number.isFinite(observed.markers?.inventedSource) && observed.markers.inventedSource > 0;
    default: return false;
  }
}
function ladderFaultWitness(spec, targets) {
  const o = targets[0]?.observed;
  switch (spec.control) {
    case 'ladder:mouse-ignored': return o?.ring === 0 && o?.strip === 0;
    case 'ladder:card-fixed-to-glass': return Number.isFinite(o?.rode) && Number.isFinite(o?.moved) && Math.abs(o.rode) < 1 && Math.abs(o.moved) >= 60;
    case 'ladder:back-leaves-at-once': return Array.isArray(o) && o.some(step => typeof step?.first?.view === 'string' && step.first.view !== 'reader');
    case 'ladder:no-room-made': return Array.isArray(o) && o.some(place => Array.isArray(place?.rows) && place.rows.some(row => row?.whole === false));
    case 'ladder:no-aside-mark': return observedObject(o) && o.aside === null;
    case 'ladder:fade-on-a-row': return Array.isArray(o) && o.some(place => Array.isArray(place?.underFade) && place.underFade.length > 0);
    case 'ladder:dash-for-none': return Array.isArray(o?.dashes) && o.dashes.length > 0;
    case 'ladder:english-ignores-sense': return Array.isArray(o?.words) && o.words.some(word => Array.isArray(word?.wrong) && word.wrong.length > 0);
    default: return false;
  }
}
function servedEditVerdict(spec, control, { engine, rows, digests }) {
  if (control.verdict !== 'killed' || control.error || control.setupError ||
      !noDeclaredErrors(control.pageErrors, spec.local) || !noDeclaredErrors(control.consoleErrors, spec.local)) return false;
  if (!servedEditsExact(control, digests)) return false;
  const prefix = spec.local ? '' : `${engine}/`, kills = spec.kills.map(id => prefix + id);
  const mutant = control.rows, restore = control.restore;
  let baseline = control.baseline;
  if (!spec.local) {
    if (!Array.isArray(mutant) || !mutant.length || !Array.isArray(restore)) return false;
    if (!mutant.every(row => /^mutant:/u.test(row?.phase || '')) || !restore.every(row => /^restore:/u.test(row?.phase || ''))) return false;
    const walks = new Set(mutant.map(row => row.walk));
    if (!walks.size || [...walks].some(walk => !grammarWalkNames(engine).includes(walk)) || !sameValue([...walks].sort(), [...new Set(restore.map(row => row.walk))].sort())) return false;
    const candidate = rows.filter(row => row?.phase === 'candidate' && walks.has(row.walk) && row.id?.startsWith(prefix));
    if (baseline !== undefined && !(sameIds(baseline, candidate) && baseline.every((row, i) => row.ok === true && row.walk === candidate[i].walk))) return false;
    baseline = candidate;
  }
  if (!Array.isArray(baseline) || baseline.length < 2 || new Set(baseline.map(row => row?.id)).size !== baseline.length) return false;
  if (spec.local && !sameValue(baseline.map(row => row?.id), spec.rows)) return false;
  if (!baseline.every(row => row.ok === true) || !kills.every(id => baseline.some(row => row.id === id))) return false;
  if (!sameIds(mutant, baseline) || !sameIds(restore, baseline)) return false;
  if (![...baseline, ...mutant, ...restore].every(executedRow)) return false;
  if (spec.local && !g6ObservedWitness(spec, baseline, mutant, restore)) return false;
  const targets = kills.map(id => mutant.find(row => row.id === id));
  if (spec.control.startsWith('ladder:') && !ladderFaultWitness(spec, targets)) return false;
  return targets.every(row => row && row.ok === false) && mutant.every(row => kills.includes(row.id) || row.ok === true) && restore.every(row => row.ok === true);
}
const sharedHover = sample => !!sample?.held && !!sample?.peer && sample.held.hover === true && sample.peer.hover === true && sample.held.disabled === false &&
  sample.peer.disabled === false && typeof sample.held.background === 'string' && sample.held.background === sample.peer.background && sample.held.background !== 'rgba(0, 0, 0, 0)';
function sharedHoverVerdict(spec, control, { engine, rows }) {
  const candidate = rows.find(row => row?.id === `${engine}/${spec.candidate}` && row.phase === 'candidate');
  return control.verdict === 'killed' && control.kind === 'DOM style mutation' && candidate?.ok === true && sameValue(control.baseline, candidate.observed) && sharedHover(control.baseline) &&
    !sharedHover(control.mutant) && sharedHoverDiverges(control.mutant, control.baseline) && sharedHover(control.restore);
}
function foldShiftVerdict(spec, control, { engine, rows }) {
  const candidate = rows.find(row => row?.id === `${engine}/${spec.candidate}` && row.phase === 'candidate');
  const plain = candidate?.observed?.plain;
  return control.verdict === 'killed' && control.kind === 'post-fold DOM geometry mutation' && control.amount === spec.amount &&
    [1, -1].includes(control.direction) && candidate?.ok === true && sameValue(control.baseline, candidate.observed.bareAgain) &&
    foldGeometryEqual(control.baseline, plain) && foldShiftBites({ plain, baseline: control.baseline, shifted: control.shifted, amount: control.amount, direction: control.direction }) &&
    foldGeometryEqual(control.restore, plain) &&
    Array.isArray(control.beforeScroll) && control.beforeScroll.length === 2 && sameValue(control.beforeScroll, control.afterScroll);
}
const CONTROL_VERDICTS = { 'served-edit': servedEditVerdict, 'shared-hover': sharedHoverVerdict, 'fold-shift': foldShiftVerdict };
export function grammarControlVerdicts({ engines, rows, controls, runtimeFiles }) {
  const digests = new Map((Array.isArray(runtimeFiles) ? runtimeFiles : []).map(file => [file?.path, file?.sha256]));
  const records = Array.isArray(controls) ? controls : [];
  return engines.flatMap(engine => grammarControlRows(engine).map(id => {
    const spec = grammarControlSpec(engine, id.slice(engine.length + 1));
    const matching = records.filter(control => control?.engine === engine && control.id === spec?.control);
    const ok = !!spec && matching.length === 1 && CONTROL_VERDICTS[spec.kind](spec, matching[0], { engine, rows, digests }) === true;
    return { id, ok };
  }));
}
export function grammarAcceptance({ argv, engines, rows, walks, g6Completed, controls, runtimeFiles }) {
  const selection = grammarSelection(argv);
  const expectedWalks = engines.flatMap(engine => grammarWalkNames(engine).map(name => `${engine}/${name}`));
  const observedWalks = walks.filter(w => w.phase === 'candidate').map(w => `${w.engine}/${w.name}`);
  const expectedControls = engines.flatMap(grammarControlRows);
  const observedControls = rows.filter(row => /\/(G[1-5]\.negative\.|L\.negative\.|G6\.(touch|keyboard)\.negative\.)/u.test(row.id)).map(row => row.id);
  const expectedCandidates=engines.flatMap(engine=>grammarCandidateRows(engine).map(candidateKey));
  const observedCandidates=rows.filter(row=>row.phase==='candidate').map(candidateKey);
  const controlSet=new Set(expectedControls);
  const provenanceComplete=rows.every(row=>{
    if(controlSet.has(row.id))return row.phase==='control'&&row.walk===null;
    const engine=row.id?.split('/')[0],id=row.id?.slice(row.id.indexOf('/')+1);
    return (row.phase==='candidate'||/^restore:.+/u.test(row.phase||''))&&WG_CANDIDATE_ROSTER[engine]?.[row.walk]?.includes(id);
  });
  const selectedPassed = rows.length > 0 && rows.every(r => r.ok === true) && walks.every(w => w.complete);
  const controlVerdicts = grammarControlVerdicts({ engines, rows, controls, runtimeFiles });
  const controlsVerified = controlVerdicts.length > 0 && controlVerdicts.every(row => row.ok);
  const fullAcceptance = selection.fullRequested && selectedPassed && exactRoster(expectedWalks, observedWalks) &&
    exactRoster(expectedControls, observedControls) && exactRoster(engines, g6Completed) &&
    exactRoster(expectedCandidates,observedCandidates)&&provenanceComplete&&controlsVerified;
  return { selection, selectedPassed, fullAcceptance, expectedWalks, observedWalks, expectedControls, observedControls, expectedCandidates, observedCandidates, provenanceComplete, controlsVerified, unverifiedControls: controlVerdicts.filter(row => !row.ok).map(row => row.id) };
}
