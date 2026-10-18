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
  '--controls', '--vh-contracts-only', '--vh-ink-only', '--g1-only', '--g2-only', '--g2-control', '--g3-only', '--g4-only', '--g5-only', '--g5-controls',
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

export const WG_WALKS = Object.freeze([
  'G3-stalled', 'G3-clear', 'G3-front', 'G3-sky-ownership', 'G3-ladder', 'G3-direct-and-anchor', 'G3-current-save', 'G3-kana',
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
export function grammarControlRows(engine) {
  const ids = [
    ...['page-capped', 'scrim-appended', 'word-not-travelling', 'page-fades-over-reader'].map(id => `G1.negative.${id}`),
    ...G2_CONTROL_IDS.map(id => `G2.negative.${id}`),
    ...['stalled-second', 'ruby-survives-back', 'front-door', 'glyph-z-dropped', 'glyph-hit-region-removed', 'bare-glyph-caption-width'].map(id => `G3.negative.${id}`),
    ...['missing-final-stroke','never-plain-after-input','writing-blocks-tap', 'empty-first-board', 'second-speed-control'].map(id => `G4.negative.${id}`),
    ...['room-keep-hover','second-hold-unkeeps', 'strip-covers-a-button', 'layer-stays-open', 'fold-shift-one-pixel', 'fold-shift-one-quarter-over'].map(id => `G5.negative.${id}`),
  ];
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
export function grammarAcceptance({ selection, engines, rows, walks, g6Completed }) {
  const expectedWalks = engines.flatMap(engine => WG_WALKS.map(name => `${engine}/${name}`));
  const observedWalks = walks.filter(w => w.phase === 'candidate').map(w => `${w.engine}/${w.name}`);
  const expectedControls = engines.flatMap(grammarControlRows);
  const observedControls = rows.filter(row => /\/(G[1-5]\.negative\.|G6\.(touch|keyboard)\.negative\.)/u.test(row.id)).map(row => row.id);
  const expectedCandidates=engines.flatMap(engine=>grammarCandidateRows(engine).map(candidateKey));
  const observedCandidates=rows.filter(row=>row.phase==='candidate').map(candidateKey);
  const controlSet=new Set(expectedControls);
  const provenanceComplete=rows.every(row=>{
    if(controlSet.has(row.id))return row.phase==='control'&&row.walk===null;
    const engine=row.id?.split('/')[0],id=row.id?.slice(row.id.indexOf('/')+1);
    return (row.phase==='candidate'||/^restore:.+/u.test(row.phase||''))&&WG_CANDIDATE_ROSTER[engine]?.[row.walk]?.includes(id);
  });
  const selectedPassed = rows.length > 0 && rows.every(r => r.ok === true) && walks.every(w => w.complete);
  const fullAcceptance = selection.fullRequested && selectedPassed && exactRoster(expectedWalks, observedWalks) &&
    exactRoster(expectedControls, observedControls) && exactRoster(engines, g6Completed) &&
    exactRoster(expectedCandidates,observedCandidates)&&provenanceComplete;
  return { selectedPassed, fullAcceptance, expectedWalks, observedWalks, expectedControls, observedControls, expectedCandidates, observedCandidates, provenanceComplete };
}
