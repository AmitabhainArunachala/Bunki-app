/** Independently declared learning schedules; observed rows never define acceptance scope. */
import {
  RECORD_ROWS,
  RECORD_CONTROLS,
  recordCompletion,
  recordControlVerdict,
  expectedReportChecks,
  reportCopyObservation,
  REPORT_COPY_CONTROLS,
} from '../../prototypes/corridor/tools/vh-learning-contracts.mjs';
const enginesFor = (engine) => (engine === 'all' ? ['chromium', 'webkit'] : [engine || 'chromium']);
const exact = (want, got) =>
  Array.isArray(got) &&
  want.length > 0 &&
  got.length === want.length &&
  new Set(got).size === want.length &&
  want.every((id) => got.includes(id));
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const nonempty = (value) => typeof value === 'string' && value.length > 0;
export const PUBLIC_DISCLOSURE = Object.freeze({
  en: 'This opens GitHub with your words and this screen filled in. Tap “Submit new issue” there to send it. Issues in this repository are public, so leave out anything private. A copy stays on this device.',
  ja: '報告は、アプリを直す人が読む GitHub の公開ページに、あなたの言葉とこの画面の欄を入れて開く。そこで「Submit new issue」を押すと送られる。公開されるので、個人的なことは書かない。写しはこの端末に残る。',
});
export const READER_RUN_ROWS = Object.freeze({
  d2: [1, 0].flatMap((f) =>
    [
      'door',
      'first-rung',
      'popup-reading',
      'visible-reading',
      'accessible-reading',
      'no-english',
      'popup-focus-premise',
      'focus-returns',
      'popup-absent',
      'neighbour-unchanged',
      'no-navigation',
      'bare-after-fold',
    ].map((row) => `D2.f${f}.${row}`),
  ),
  d3: ['k0f2', 'k2f1'].flatMap((key) =>
    ['names', 'pointer', 'opens-lookup'].map((row) => `D3.${key}.${row}`),
  ),
  d4: [
    'A-prior-state',
    'A-no-english',
    'same-document',
    'same-dials',
    'B-door',
    'no-inherited-state',
    'tap-shows',
    'second-tap-stage',
    'fold-bare',
    'never-english',
  ].map((row) => `D4.${row}`),
  d5: [
    'home-marks',
    'detour',
    'away-marks',
    'returned',
    'home-bare-return',
    'away-index-not-lit',
    'named-tap',
    'named-no-english',
  ].map((row) => `D5.${row}`),
  d6: [
    'home-marks',
    'source-visit',
    'away-marks',
    'returned',
    'home-bare-return',
    'away-index-not-lit',
    'named-tap',
    'named-no-english',
  ].map((row) => `D6.${row}`),
});
export const READER_CONTROLS = Object.freeze({
  'escape-loses-source-focus': {
    run: 'd2',
    key: 'lostFocus',
    kills: [1, 0].map((f) => `D2.f${f}.focus-returns`),
  },
  'escape-focuses-other-occurrence': {
    run: 'd2',
    key: 'wrongFocus',
    kills: [1, 0].map((f) => `D2.f${f}.focus-returns`),
  },
  'escape-leaves-popup-open': {
    run: 'd2',
    key: 'keepPopup',
    kills: [1, 0].map((f) => `D2.f${f}.popup-absent`),
  },
  'inline-english-content': { run: 'd4', key: 'contentEnglish', kills: ['D4.A-no-english'] },
  'inline-english-named-d4': { run: 'd4', key: 'namedEnglish', kills: ['D4.never-english'] },
  'inline-english-named-d5': { run: 'd5', key: 'namedEnglish', kills: ['D5.named-no-english'] },
  'g3-stalled': { run: 'd4', key: 'stalled', kills: ['D4.second-tap-stage'] },
  'g3-kept-reading': { run: 'd2', key: 'keepReading', kills: ['D2.f1.bare-after-fold'] },
  'g3-off-ruby': {
    run: 'd2',
    key: 'offRuby',
    kills: ['D2.f0.visible-reading', 'D2.f0.bare-after-fold'],
  },
  m8: { run: 'd3', key: 'lookupClick', kills: ['D3.k0f2.opens-lookup', 'D3.k2f1.opens-lookup'] },
  r1: {
    run: 'd2',
    key: 'reading',
    kills: [
      'D2.f1.visible-reading',
      'D2.f1.accessible-reading',
      'D2.f1.popup-reading',
      'D2.f0.popup-reading',
    ],
  },
});
export const READER_CASES = Object.freeze([
  'D0 served build is the expected clean commit',
  ...[1728, 390].flatMap((width) => [
    `D1 ${width}: today's picks are on the shelf`,
    ...Array.from({ length: 6 }, (_, i) => [
      `D1 ${width} pick ${i + 1}: its centre is the door itself`,
      `D1 ${width} pick ${i + 1}: a click at that point opens that same article`,
    ]).flat(),
  ]),
  ...Object.entries(READER_RUN_ROWS).flatMap(([key, rows]) => [
    `${key.toUpperCase()}.fixture`,
    ...rows,
  ]),
  ...Object.keys(READER_CONTROLS).map((name) => `C.${name}`),
]);
function cleanRows(rows, expected, field = 'pass') {
  return (
    Array.isArray(rows) &&
    exact(
      expected,
      rows.map((row) => row.id),
    ) &&
    rows.every((row) => row[field] === true)
  );
}
function identity(report, context, require) {
  require(nonempty(report.runId), 'Missing runId');
  if (context.runId) require(report.runId === context.runId, 'Wrong runId');
  require(/^[a-f0-9]{40}$/u.test(report.gitSha || ''), 'Missing app source SHA');
  const expectedSource = context.gitSha || context.sourceSha;
  if (expectedSource) require(report.gitSha === expectedSource, 'Wrong app source SHA');
  require(sha(report.artifactSha256), 'Missing artifact SHA');
  if (context.artifactSha256)
    require(report.artifactSha256 === context.artifactSha256, 'Wrong artifact SHA');
  require(sha(report.verifierSha256), 'Missing verifier SHA');
  if (context.verifierSha256)
    require(report.verifierSha256 === context.verifierSha256, 'Wrong verifier SHA');
  require(report.fullAcceptance === true, 'Full acceptance is not true');
}
function readerWitness(name, control) {
  const rows = new Map(control.rows.map((row) => [row.id, row]));
  const seen = (id) => rows.get(id)?.observed;
  if (name.startsWith('escape-'))
    return [1, 0].every((f) => {
      const list = seen(
        `D2.f${f}.${name === 'escape-leaves-popup-open' ? 'popup-absent' : 'focus-returns'}`,
      );
      return (
        exact(
          ['tap', 'Enter', 'Space'],
          list?.map((row) => row.how),
        ) &&
        list.every(
          (row) =>
            row.premise?.inside === true &&
            !row.premise.source &&
            row.premise.connected === true &&
            (name === 'escape-leaves-popup-open'
              ? row.popupPresent === true && row.back === true
              : row.back === false &&
                row.popupGone === true &&
                (name !== 'escape-focuses-other-occurrence' || row.onDuplicate === true)),
        )
      );
    });
  if (name.startsWith('inline-english-'))
    return seen(READER_CONTROLS[name].kills[0])?.glosses?.includes('VH_INLINE_ENGLISH');
  if (name === 'g3-stalled') return seen('D4.second-tap-stage')?.popup === null;
  if (name === 'g3-kept-reading')
    return (
      seen('D2.f1.bare-after-fold')?.length === 3 &&
      seen('D2.f1.bare-after-fold').every((row) => row.visibleRuby === 'たにがわ')
    );
  if (name === 'g3-off-ruby')
    return (
      seen('D2.f0.visible-reading')?.length === 3 &&
      seen('D2.f0.visible-reading').every((row) => row === 'たにがわ')
    );
  if (name === 'm8')
    return ['k0f2', 'k2f1'].every((key) => seen(`D3.${key}.opens-lookup`)?.mini === null);
  if (name === 'r1')
    return (
      seen('D2.f1.visible-reading')?.length === 3 &&
      seen('D2.f1.visible-reading').every((value) => value === 'たにかわ') &&
      [1, 0].every(
        (f) =>
          seen(`D2.f${f}.popup-reading`)?.length === 3 &&
          seen(`D2.f${f}.popup-reading`).every((row) => row?.reading === 'たにかわ'),
      ) &&
      seen('D2.f1.accessible-reading')?.every(
        (row) => row.description === 'たにかわ · Enter: next word layer · Shift+F10: save and more',
      )
    );
  return false;
}
function validateReader(report, context, require, engines) {
  require(report.schema === 'vh-reader-doors/1', 'Wrong reader schema');
  require(engines.length === 1 &&
    report.engine === engines[0] &&
    nonempty(report.browserVersion), 'Wrong/missing actual reader engine');
  require(Array.isArray(report.pageErrors) && !report.pageErrors.length, 'Reader page errors');
  const rows = report.results || [],
    observed = rows.map((row) => `${report.engine}/${row.id || row.name}`);
  require(rows.every((row) => row.pass === true), 'Reader failed assertion');
  require(exact(
    Object.keys(READER_CONTROLS),
    (report.controls || []).map((row) => row.name),
  ), 'Missing/duplicate reader controls');
  for (const control of report.controls || []) {
    const spec = READER_CONTROLS[control.name];
    if (!spec) {
      require(false, 'Unknown reader control');
      continue;
    }
    require(control.verdict === 'killed' &&
      !control.setupError &&
      !control.error &&
      Array.isArray(control.pageErrors) &&
      !control.pageErrors.length, `${control.name}: setup/kill invalid`);
    require(control.run === spec.run &&
      exact(
        READER_RUN_ROWS[spec.run],
        (control.rows || []).map((row) => row.id),
      ), `${control.name}: incomplete mutant schedule`);
    require(exact(
      spec.kills,
      (control.rows || []).filter((row) => row.pass !== true).map((row) => row.id),
    ), `${control.name}: wrong named red set`);
    require(readerWitness(control.name, control), `${control.name}: intended fault not witnessed`);
    const file = control.name === 'r1' ? 'data/articles/aozora-046605.json' : 'corridor.js';
    require(Array.isArray(control.served) &&
      control.served.length > 0 &&
      control.served.every(
        (row) =>
          row.file === file &&
          sha(row.baseSha256) &&
          sha(row.mutantSha256) &&
          row.baseSha256 !== row.mutantSha256 &&
          row.applied?.length === 1 &&
          row.applied[0].key === spec.key,
      ), `${control.name}: served mutation proof invalid`);
    require(control.restore?.passed === true &&
      !control.restore.error &&
      Array.isArray(control.restore.pageErrors) &&
      !control.restore.pageErrors.length &&
      cleanRows(
        control.restore.rows,
        READER_RUN_ROWS[spec.run],
      ), `${control.name}: clean complete restore absent`);
    require(control.restore?.served?.length === 1 &&
      control.restore.served[0].file === file &&
      sha(control.restore.served[0].sha256) &&
      control.served.every(
        (row) => row.baseSha256 === control.restore.served[0].sha256,
      ), `${control.name}: byte restoration proof absent`);
  }
  return observed;
}
function validateRecord(report, context, require, engines) {
  require(report.schema === 'vh-record-depth/1' &&
    report.phase === 'controls-parent', 'Record controls-parent receipt required');
  require(report.scope === 'full-engine' &&
    report.selectors?.controls === true &&
    report.selectors.only === null &&
    report.selectors.control === null, 'Record full --controls invocation required');
  require(!report.terminalError &&
    exact(engines, report.engines), 'Record error or engine mismatch');
  require(recordCompletion(report.rows || [], engines)
    .diagnosticPass, 'Record full17-row schedule per engine required');
  const expectedControls = engines.flatMap((engine) =>
    Object.keys(RECORD_CONTROLS).map((name) => `${engine}/${name}`),
  );
  require(exact(
    expectedControls,
    (report.controls || []).map((row) => `${row.engine}/${row.name}`),
  ), 'Record control roster mismatch');
  for (const engine of engines)
    require(nonempty(report.browsers?.[engine]), `Record actual ${engine} version absent`);
  for (const control of report.controls || []) {
    const spec = RECORD_CONTROLS[control.name];
    if (!spec) {
      require(false, 'Unknown record control');
      continue;
    }
    for (const [phase, exit] of [
      ['candidate', 3],
      ['mutant', 1],
      ['restore', 3],
    ]) {
      const child = control[phase],
        receipt = child?.receipt;
      require(child?.valid === true &&
        child.status?.code === exit &&
        !child.status.signal &&
        !child.status.error &&
        !child.status.timedOut, `${control.name}/${phase}: child did not finish`);
      require(receipt &&
        nonempty(receipt.runId) &&
        receipt.runId !== report.runId &&
        receipt.gitSha === report.gitSha &&
        receipt.artifactSha256 === report.artifactSha256 &&
        receipt.verifierSha256 === report.verifierSha256 &&
        exact([control.engine], receipt.engines) &&
        receipt.fullAcceptance === false, `${control.name}/${phase}: identity/phase mismatch`);
      require(!receipt?.terminalError &&
        nonempty(
          receipt?.browsers?.[control.engine],
        ), `${control.name}/${phase}: child error/version absent`);
      if (phase === 'candidate')
        require(receipt?.selectors?.only === null &&
          receipt?.selectors?.control === null &&
          !receipt?.selectors?.controls, `${control.name}: narrowed candidate`);
      else
        require(exact([spec.case], receipt?.selectors?.only) &&
          receipt?.selectors?.control === (phase === 'mutant' ? control.name : null) &&
          !receipt?.selectors?.controls, `${control.name}/${phase}: wrong selector`);
    }
    const verdict = recordControlVerdict({
      name: control.name,
      engine: control.engine,
      candidate: control.candidate?.receipt,
      mutant: control.mutant?.receipt,
      restore: control.restore?.receipt,
    });
    const served = control.mutant?.receipt?.control?.served;
    require(Array.isArray(served) &&
      served.length > 0 &&
      served.every(
        (row) =>
          row.file === 'corridor.js' &&
          sha(row.baseSha256) &&
          sha(row.mutantSha256) &&
          row.baseSha256 !== row.mutantSha256 &&
          row.applied?.length === 1 &&
          row.applied[0].key === (control.name === 'kagami-spelling-only' ? 'door' : 'ref'),
      ), `${control.name}: served edit digest/witness invalid`);
    require(verdict.verdict === 'killed' &&
      control.verdict ===
        'killed', `${control.name}: strict re-adjudication failed: ${verdict.reason}`);
    require(control.candidate?.receipt.runId !== control.mutant?.receipt.runId &&
      control.mutant?.receipt.runId !== control.restore?.receipt.runId &&
      control.candidate?.receipt.runId !==
        control.restore?.receipt.runId, `${control.name}: reused attempt`);
  }
  return (report.rows || []).map((row) => row.id);
}
function validateDelivery(report, context, require, engines) {
  require(report.schema === 'vh-report-delivery/1' &&
    report.scope === 'full-engine' &&
    exact(engines, report.engines), 'Report-delivery scope/engine mismatch');
  for (const engine of engines)
    require(nonempty(report.browsers?.[engine]), `Report actual ${engine} version absent`);
  require((report.checks || []).every((row) => row.pass === true), 'Report failed assertion');
  const scenarios = engines.flatMap((engine) =>
    [
      'copy en',
      'copy ja',
      'prefilled issue',
      'long report',
      'blocked window',
      'relay',
      'no Blob storage',
      'setup link',
    ].map((name) => `${engine} · ${name}`),
  );
  require(exact(
    scenarios,
    (report.scenarios || []).map((row) => row.name),
  ) &&
    (report.scenarios || []).every((row) => row.completed === true), 'Report scenarios incomplete');
  const ids = engines.flatMap((engine) =>
    ['en', 'ja'].flatMap((locale) =>
      REPORT_COPY_CONTROLS.map((name) => `${engine}/${locale}/${name}`),
    ),
  );
  require(exact(
    ids,
    (report.controls || []).map((row) => `${row.engine}/${row.locale}/${row.name}`),
  ), 'Report copy controls incomplete');
  for (const control of report.controls || []) {
    require(control.verdict === 'killed' &&
      !control.error, `${control.name}: not a completed kill`);
    const publicControl = control.name === 'public-disclosure-removed';
    const observe = (phase) => {
      const observed = control[phase]?.observed;
      return publicControl
        ? {
            disclosure:
              observed?.pass === true &&
              observed.expected === PUBLIC_DISCLOSURE[control.locale] &&
              observed.text?.includes(PUBLIC_DISCLOSURE[control.locale]),
          }
        : reportCopyObservation(observed || {}, {
            locale: control.locale,
            pending: control.name === 'fallback-advertised-before-probe',
          });
    };
    require(Object.values(observe('before')).every(Boolean) &&
      Object.values(observe('restored')).every(
        Boolean,
      ), `${control.name}: candidate/restore not clean`);
    const expected = publicControl
      ? 'disclosure'
      : control.name === 'fallback-advertised-before-probe'
        ? 'delivery'
        : 'label';
    require(exact(
      [expected],
      Object.entries(observe('mutant'))
        .filter(([, pass]) => !pass)
        .map(([id]) => id),
    ), `${control.name}: wrong completed red`);
  }
  return (report.checks || []).map((row) => row.name);
}
const make = (kind, fixedEngine) =>
  Object.freeze({
    producer: `prototypes/corridor/tools/verify-${kind}.mjs`,
    paths: [
      kind === 'reader-doors'
        ? 'reader-doors.json'
        : kind === 'record-depth'
          ? 'verify-record-depth.json'
          : 'verification-report.json',
    ],
    expectedCases(engine) {
      const engines = enginesFor(fixedEngine || engine);
      return kind === 'reader-doors'
        ? engines.flatMap((e) => READER_CASES.map((id) => `${e}/${id}`))
        : kind === 'record-depth'
          ? engines.flatMap((e) =>
              Object.values(RECORD_ROWS)
                .flat()
                .map((id) => `${e}/${id}`),
            )
          : expectedReportChecks(engines);
    },
    validate(report, context = {}) {
      const errors = [],
        require = (condition, message) => {
          if (!condition) errors.push(message);
        },
        engines = enginesFor(fixedEngine || context.engine),
        expectedCases = this.expectedCases(context.engine);
      let observedCases = [];
      try {
        require(engines.every((e) =>
          ['chromium', 'webkit'].includes(e),
        ), 'Invalid required engine');
        identity(report, context, require);
        observedCases = {
          'reader-doors': validateReader,
          'record-depth': validateRecord,
          'report-delivery': validateDelivery,
        }[kind](report, context, require, engines);
        require(exact(
          expectedCases,
          observedCases,
        ), 'Missing, duplicate, extra or filtered assertion roster');
      } catch (error) {
        errors.push(`Malformed report: ${error.message}`);
      }
      return { passed: errors.length === 0, errors, expectedCases, observedCases };
    },
  });
const definitions = {};
for (const kind of ['reader-doors', 'record-depth', 'report-delivery']) {
  definitions[kind] = make(kind);
  for (const engine of ['chromium', 'webkit'])
    definitions[`${kind}-${engine}`] = make(kind, engine);
}
export const learningReportContracts = Object.freeze(definitions);
export function validateLearningReport(name, report, context = {}) {
  return (
    learningReportContracts[name]?.validate(report, context) || {
      passed: false,
      errors: [`Unknown learning producer ${name}`],
      expectedCases: [],
      observedCases: [],
    }
  );
}
