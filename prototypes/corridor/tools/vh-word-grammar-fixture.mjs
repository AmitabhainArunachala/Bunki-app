import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { WG_CANDIDATE_ROSTER, grammarWalkNames, grammarControlSpec, grammarCandidateRows, grammarControlRows } from './vh-word-grammar-contracts.mjs';
const observedG6 = JSON.parse(readFileSync(new URL('./vh-g6-observed-controls.json', import.meta.url), 'utf8'));

export const sha = (text) => createHash('sha256').update(text).digest('hex');
export const FIXTURE_RUNTIME_FILES = Object.freeze([{ path: 'corridor.js', sha256: sha('candidate corridor.js') }, { path: 'editorial.css', sha256: sha('candidate editorial.css') }]);
const geometry = (top) => [{ id: 'p1', top, height: 24, tokens: [{ id: '76', left: 4, top: top + 1 }] }];
const hover = (background, peer = background) => ({ held: { hover: true, background, disabled: false }, peer: { hover: true, background: peer, disabled: false } });
const sample = (s) => ({ ...s, equal: s.held.background === s.peer.background });

// Purpose-built numeric samples; these are not retained browser receipts.
function ladderGapObserved(folded = false) {
  return ['390x560', '320x568'].map((size, k) => {
    const fault = folded && k === 0, gap = fault ? 33 : 0;
    return { size, index: 9, rungs: ['reading', 'gloss', 'stage'],
      steps: (fault ? [0, 40, 80, 92] : [0, 40, k ? 53 : 59]).map(scrollTop => {
        const top = 250 - scrollTop, bottom = top + 44.5;
        const rows = [
          { glyph: '総', isKanjiRow: true, rowIndex: 0, top, bottom, height: 44.5, fold: fault ? 33 : null, marginBottom: gap },
          { glyph: '理', isKanjiRow: true, rowIndex: 1, top: bottom + gap, bottom: bottom + gap + 44, height: 44, fold: null, marginBottom: 0 },
        ];
        return { scrollTop, cut: true, folds: fault ? 1 : 0, gaps: [gap], rows,
          foldOwners: fault ? [{ ...rows[0] }] : [],
          anchor: { word: '総理', index: 9, connected: true, inReader: true }, card: { word: '総理', contentWord: '総理', count: 1 } };
      }) };
  });
}
function candidateObserved(id) {
  if (id.endsWith('/L.d7.scroll-gap')) return ladderGapObserved();
  if (id.endsWith('/G5.layers.bare-again')) return { plain: geometry(10), bareAgain: geometry(10.4) };
  if (id.endsWith('/G5.room.shared-hover')) return sample(hover('rgb(1, 2, 3)'));
  return '';
}
function servedFor(edits) {
  return [...new Set(edits.map((edit) => edit.file))].map((file) => ({
    file, baseSha256: FIXTURE_RUNTIME_FILES.find((row) => row.path === file).sha256, mutantSha256: sha(`mutant ${file}`),
    applied: edits.filter((edit) => edit.file === file).map((edit, offset) => ({ key: edit.key, offset })),
  }));
}
function walksFor(engine, kills) {
  const roster = WG_CANDIDATE_ROSTER[engine];
  if (kills.some((kill) => kill.startsWith('G2.'))) return Object.keys(roster).filter((walk) => walk.startsWith('g2'));
  return [...new Set(kills.map((kill) => Object.keys(roster).find((walk) => roster[walk].includes(kill))))];
}
function controlFor(engine, rowId, spec, rows) {
  if (spec.kind === 'shared-hover') {
    const baseline = rows.find((row) => row.id === `${engine}/${spec.candidate}`).observed;
    return { engine, id: spec.control, kind: 'DOM style mutation', baseline, mutant: sample(hover('rgb(255, 0, 255)', 'rgb(1, 2, 3)')), restore: sample(hover('rgb(1, 2, 3)')), verdict: 'killed' };
  }
  if (spec.kind === 'fold-shift') {
    const { bareAgain } = rows.find((row) => row.id === `${engine}/${spec.candidate}`).observed;
    return { engine, id: spec.control, kind: 'post-fold DOM geometry mutation', amount: spec.amount, direction: 1, baseline: bareAgain,
      shifted: geometry(10.4 + spec.amount), restore: geometry(10.4), beforeScroll: [0, 120], afterScroll: [0, 120], verdict: 'killed' };
  }
  const edits = [{ file: 'corridor.js', key: `${rowId}-edit`, from: 'a', to: 'b' }];
  const control = { engine, id: spec.control, edits, served: servedFor(edits), pageErrors: [], verdict: 'killed' };
  if (spec.local) {
    // Synthetic outer receipt/digests; primary observations remain the exact retained
    // site-18 control records. This wrapper is never a current browser-run receipt.
    const retained = observedG6.controls.find((row) => row.engine === engine && row.id === spec.control);
    if (!retained) throw new Error(`Missing observed G6 fixture: ${engine}/${spec.control}`);
    return { ...structuredClone(retained), edits, served: servedFor(edits) };
  } else {
    const walks = new Set(walksFor(engine, spec.kills));
    const baseline = rows.filter((row) => row.phase === 'candidate' && walks.has(row.walk) && row.id.startsWith(`${engine}/`));
    if (rowId.startsWith('G1.') || rowId.startsWith('G2.')) control.baseline = baseline;
    control.rows = baseline.map((row) => ({ ...row, phase: `mutant:${spec.control}`, ok: !spec.kills.includes(row.id.slice(engine.length + 1)) }));
    control.restore = baseline.map((row) => ({ ...row, phase: `restore:${spec.control}` }));
    // Explicit synthetic mutant observations for the independent Ladder witness checks.
    const ladderObserved = {
      'ladder:mouse-ignored': { ring: 0, strip: 0 },
      'ladder:card-fixed-to-glass': { rode: 0, moved: 80 },
      'ladder:back-leaves-at-once': [{ first: { view: 'today' } }],
      'ladder:no-room-made': [{ rows: [{ whole: false }] }],
      'ladder:no-aside-mark': { aside: null },
      'ladder:fade-on-a-row': [{ inkUnderFade: ['synthetic ink'] }],
      'ladder:provisional-paint': [{ other: [{ text: 'provisional meaning' }] }],
      'ladder:row-not-the-box': [{ english: 'to receive', box: 'to get someone to do something' }],
      'ladder:fold-at-560': ladderGapObserved(true),
      'ladder:dash-for-none': { dashes: ['—'] },
      'ladder:english-ignores-sense': { words: [{ wrong: ['synthetic wrong meaning'] }] },
    };
    if (Object.hasOwn(ladderObserved, spec.control)) control.rows.find(row => row.id === `${engine}/${spec.kills[0]}`).observed = structuredClone(ladderObserved[spec.control]);
    return control;
  }
}

/** A clean word-grammar receipt in the producer's own shapes, for consumer regressions. */
export function grammarFixture(engines = ['chromium', 'webkit']) {
  const rows = [
    ...engines.flatMap((engine) => grammarCandidateRows(engine).map((row) => ({ ...row, ok: true, observed: candidateObserved(row.id) }))),
    ...engines.flatMap(grammarControlRows).map((id) => ({ id, phase: 'control', walk: null, ok: true })),
  ];
  const controls = engines.flatMap((engine) => grammarControlRows(engine).map((id) => {
    const local = id.slice(engine.length + 1);
    return controlFor(engine, local, grammarControlSpec(engine, local), rows);
  }));
  return {
    argv: ['--controls'], engines, g6Completed: [...engines], rows, controls, runtimeFiles: FIXTURE_RUNTIME_FILES.map((row) => ({ ...row })),
    walks: engines.flatMap((engine) => grammarWalkNames(engine).map((name) => ({ engine, name, phase: 'candidate', complete: true }))),
  };
}
