/** Deliberately synthetic consumer-unit data. These objects are not browser evidence or acceptance receipts. */
import { BATCH3 } from '../../vh-batch3-report-contracts.mjs';
const hash = 'a'.repeat(64), git = '1'.repeat(40);
const worlds = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku'];
const glyphs = { 稿: { label: '稿 — draft', text: '稿', byRole: 1 }, 食: { label: '食 たべる — eat', text: '食', byRole: 1 }, 剝: { label: '剝 はがす — come off; peel; fade; discolor', text: '剝', byRole: 1 } };
const pair = (sel, text = 'unit label') => ({ sel, text, ratio: 5, required: 4.5, fg: '#000000', bg: '#ffffff', ok: true, hidden: false, opacity: 1 });
const row = (name, detail, item) => ({ name, ...(item ? { item } : {}), pass: true, detail, error: null, errors: [] });
function sweep(engine, ws, states) {
  return { schemaVersion: 2, runId: 'synthetic-unit-attempt', artifactSha256: hash, gitSha: git, sourceDirty: false, verifierSha256: hash, arrivalPredicateSha256: hash,
    identity: { gitSha: git, artifactSha256: hash }, partial: true, fullAcceptance: false, requestedScope: 'diagnostic', selectedPassed: false,
    worlds: ws, states, selectors: { worlds: ws.length === 11 ? null : ws, states, demoOnly: false }, engines: { [engine]: 'unit-browser' },
    results: ws.flatMap(world => states.map(state => ({ engine, world, state, pairs: [pair('unused-unit-label')] }))) };
}
export function unitFixture(suite, engine) {
  const names = BATCH3.rows[suite][engine], viewport = engine === 'webkit' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const common = { engine, version: 'unit-browser', mode: 'branch', viewport, build: git, artifact: hash, mutations: [] };
  if (suite === 'hfix2e-examples') {
    const details = {
      'KT6-A': { sheet: { node: 'word:あい', reading: 'あい', headword: '藍' }, examples: [] },
      'KT6-B': { examples: ['えっと。', 'えっと、一。', 'えっと、二。', 'えっと、三。'] },
      'KT6-C': { examples: ['歩く。', '歩いた。', '歩きます。', '歩けば。'], inflected: ['歩いた。', '歩きます。', '歩けば。'] },
      'KT6-D': Object.fromEntries([['押える', 6], ['代る', 6], ['或', 1]].map(([word, least]) => [word, { count: least, least, own: 1, first: 'Synthetic unit sentence.' }])),
      'KT6-G': Object.fromEntries(['首', '比', '画', '為る', '才', '開く', '器械', '現す', '問'].map(word => [word, { count: 0, lent: [] }])),
      'KT6-H': { examples: [] }, 'KT6-E': { examples: [] }, 'KT6-F': { examples: [] },
    };
    return { value: { ...common, identity: { gitSha: git, artifactSha256: hash, sourceDirty: false }, verifierSha256: hash, results: names.map(name => row(name, details[name])) }, extras: {} };
  }
  if (suite === 'hfix2e-hold') {
    const sealed = () => ({ strip: true, mini: false, count: 1, seen: { stamp: 1 }, covered: [], rung: null, stripSays: 'Saved ✓' });
    const noSeal = () => ({ strip: false, mini: false, count: 0, seen: { stamp: 0 }, covered: [], rung: 'reading' });
    const results = names.map(name => {
      let detail;
      if (name === 'W7-hold' || name === 'W7-centre') detail = { c0: 0, by: engine === 'webkit' ? 'finger' : 'mouse', held: { key: name === 'W7-centre' ? '#centre' : '健康' }, first: { mid: { ring: 1 }, after: sealed() }, second: { after: sealed() }, later: { strip: true, covered: [] } };
      else if (name === 'W7-drag') detail = { c0: 0, dragged: { after: noSeal() } };
      else if (name === 'W7-tap') detail = { c0: 0, after: noSeal() };
      else detail = { c0: 0, how: name === 'W7-key' ? 'Shift+F10' : 'right-click', focusInStrip: true, after: sealed() };
      return row(name, detail);
    });
    return { value: { ...common, verifier: 'verify-hfix2e-hold', centre: '元気', gitSha: git, artifactSha256: hash, site: '/synthetic-unit/site', results }, extras: {} };
  }
  if (suite === 'hfix2e-x10-kt3') {
    const details = [{ live: ['mini-take'] }, { live: ['chrome-keep'], card: false, bar: { label: 'Save 総理' }, barPressFolded: { before: 0, after: 1 } }, { live: ['chrome-keep'], card: false, rung: 'reading', bar: { label: 'Save 総理' }, barPressReading: { before: 0, after: 1 } }, structuredClone(glyphs), structuredClone(glyphs)];
    return { value: { ...common, input: engine === 'webkit' ? 'touch' : 'mouse', only: null, total: 5, green: 5, rows: names.map((name, i) => row(name, details[i], i < 3 ? 'X10' : 'KT3')) }, extras: {} };
  }
  if (suite === 'hfix2b') {
    const details = ['1 rows, 0 still cut', 'to pick up; to adopt', '1 glosses, 0 at the cap, 0 unproven', '16 of 16 repaired', '5 of 5 saved words lit (5 stars mounted): synthetic unit sample', 'synthetic ink evidence', JSON.stringify({ a: 'due today', b: 'missed in a test', c: 'you looked it up twice', d: 'missed yesterday' }), JSON.stringify({ word: '林', why: '' }), 'synthetic accessible name', '1 on glass: synthetic unit sample', JSON.stringify(['shelf']), JSON.stringify({ shelf: { inside: true, covered: false } }), '[]', 'written', '{"text":"練習","why":"you marked it not yet","kind":"unknown"}', ''];
    for (let i = 16; i < names.length; i += 4) details.push('1 nodes drawn, 0 cut at ≥0.08 opacity (none)', '1 nodes drawn, 1 samples, 0 crossings drawn above 0 (none)', 'reading shown true, carried 6px past the rim, 1 samples, 0 crossings above 0 (none)', '');
    return { value: { base: null, control: null, checks: names.map((name, i) => ({ name: `${engine} unit-browser · ${name.replace('DEPTH', '1')}`, pass: true, detail: details[i] })) }, extras: {} };
  }
  if (suite === 'hfix2e-contrast') {
    const raw = sweep(engine, worlds, ['learn', 'words']); const perWorld = {};
    for (const scene of raw.results) {
      scene.pairs = [pair('.thes-rel'), ...(scene.state === 'words' ? [pair('.thes-gloss')] : []), { ...pair('unrelated-unit-control'), ok: false, ratio: 2 }];
      perWorld[scene.world] ||= {}; const worst = scene.pairs[0];
      perWorld[scene.world][scene.state] = { pairs: scene.state === 'words' ? 2 : 1, failing: 0, worst: Object.fromEntries(['ratio', 'required', 'fg', 'bg', 'text', 'sel'].map(key => [key, worst[key]])) };
    }
    return { value: { ...common, viewport: engine === 'webkit' ? 'phone' : 'desktop', browser: 'unit-browser', site: '/synthetic-unit/site', gitSha: git, pass: true, problems: [], mutations: null, sweepExit: 1,
      surfaces: { words: 'thesaurus (word web 橋)', learn: 'search 歩く, near-in-meaning rows' }, perWorld, adapter: { originalSha256: hash, adapterSha256: hash, runnerSha256: hash } }, extras: { sweep: raw, runnerSha256: hash } };
  }
  const raw = sweep(engine, ['nami'], ['learn', 'words', 'speak', 'speak-key']);
  raw.results.forEach((scene, i) => { scene.pairs = [pair(i < 2 ? 'button#yoji-link > span.l-ja' : 'button#entry-sentence-practice > span.l-ja')]; });
  const frames = [[0, 'ruby-text', 0.9, '-1px', 0, viewport.width], [50, 'ruby-text', 0.5, '-1px', 0, viewport.width], [100, 'ruby-text', 0.1, '-1px', 0, viewport.width], [150, 'none', 0, '', 0, viewport.width]];
  const after = { hidden: true, display: 'none', margin: '' }, record = { before: hash, after: hash }, scroll = { before: [0, 1], after: [0, 1] };
  const first = { hidden: false, display: 'ruby-text', opacity: 1, width: 1 };
  const exact320 = { doc: 320, body: 320, reader: 320, inner: 320, visual: 320, scale: 1 };
  const details = {
    'X13.cover': { stops: 16, scrollMax: 3000, tokensSeen: 1, covered: 0, unreachable: 0, wordsUnder: 0, stopsWithBox: 0, stopsWithReach: 0, stopsWithPress: 0, firstCovered: [], sample: { shown: true, reachable: true, size: [44, 44] }, errors: [] },
    'X13.reach': { home: [0, 0, 44, 44], open: { pressed: 'true', docked: true }, back: { pressed: 'false', block: false, docked: false, box: [0, 0, 44, 44] }, errors: [] },
    'X13.mac': { base: { box: [0, 0, 44, 44], style: 'unit-style', dock: 'none' }, build: { box: [0, 0, 44, 44], style: 'unit-style', dock: 'none' }, words: 120 },
    'G61.trace': { load: 1, fold: { frames }, reveal: { frames: [[0, 'ruby-text', 1]], first }, errors: [] },
    'G61.fade': { rung: 'reading', change: 1, fading: 3, rising: 0, goneAt: 150, frames, after },
    'G61.still': { seat: '-1px', movedWhileShown: 0, seatKept: true, back: 0, after },
    'G61.reveal': { change: 1, first }, 'G61.record': { recordEqual: true, record, scroll }, 'G61': { load: 1 },
    'G61.reduced': { first: { hidden: true, display: 'none', opacity: 0 }, errors: [] },
    'G61.rest320': Object.fromEntries(['at-320', 'reveal-390-fold-320', 'fold-390-then-320'].map(order => [order, { ok: true, errors: [], fresh: order === 'at-320' ? exact320 : null, revealed: order === 'at-320' ? exact320 : null, folded: exact320 }])),
    'G61.press': { count: 599, base: 599, freshDiffer: 0, foldedDiffer: 0, firstDiffer: [] },
    'NAMI.sweep': { exit: 3, swaps: null, viewport: 'phone', browser: 'unit-browser' },
  };
  const rs = names.map(name => { const id = name.split(' · ')[0]; let detail = details[id] || { ratio: 5, pairs: 1, text: 'unit label' };
    if (id === 'X13.look') { const match = name.match(/(?:chromium|webkit) (hokusai|yoru|sumi) (390|320)×/u), width = Number(match[2]); detail = { world: match[1], drawn: true, sameColour: true, samePaint: true, borderGone: true, seated: true, dock: { bg: 'unit', image: 'none', display: 'block', opacity: 1, top: 0, bottom: 52 }, tabs: { bg: 'unit', image: 'none', top: 52 }, evenAcross: 1, lines: [], discContrast: 3, samples: 1, mark: [width - 48, 4, width - 4, 48], errors: [] }; }
    if (id === 'X13.fade') { const reduced = name.includes('(reduced motion)'); detail = { errors: [] }; for (const [key, target] of [['opened', 0], ['folded', 1]]) { const first = reduced ? target : target ? 0.1 : 0.9; detail[key] = { change: 0, shownBefore: true, frames: reduced ? [[0, target, 'block']] : [[0, first, 'block'], [100, 0.5, 'block'], [450, target, 'block']], first: [0, first, 'block'], between: reduced ? 0 : 2, turned: 0, doneAt: reduced ? 0 : 450 }; } }
     return row(name.replace('load LOAD', 'load 1'), structuredClone(detail), id.startsWith('X13') ? 'X13' : id.startsWith('G61') ? 'G61' : 'NAMI'); });
  return { value: { ...common, control: null, base: '1f790977', only: [], serveDir: null, served: null, rows: rs, green: rs.length - 2, total: rs.length - 2 }, extras: { sweep: raw, runnerSha256: hash } };
}
