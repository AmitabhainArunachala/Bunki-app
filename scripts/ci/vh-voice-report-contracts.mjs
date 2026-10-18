/** VH-1: release admission independently checks complete producer/phase evidence. */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  SPEAK_CASE_IDS,
  exactRoster,
  speakCompletion,
} from '../../prototypes/corridor/tools/vh-voice-contracts.mjs';
import {
  SENSE_CASE_IDS,
  SENSE_DATA_INVENTORY_SHA256,
  SPEAK_CHECK_NAMES,
  SPEAK_MUTANT_SPEC,
  SPEAK_CONTROL_ROSTER_BY_ENGINE,
} from './vh-voice-rosters.mjs';
export const SENSE_CONTROL_IDS = Object.freeze([
  'discard-completed-red-on-retry',
  'pronunciation-ta-promoted-to-door',
  'pronunciation-n-promoted-to-door',
  'quoted-reading-demoted-to-annotation',
]);
export const VOICE_CONTROL_IDS = Object.freeze([
  'no-manifest-copy-empty',
  'missing-word-copy-loses-locked-voice',
  'card-unavailable-title-omitted',
  'card-retry-retains-error-title',
  'card-subsequent-error-title-stale',
  'pending-quote-creates-listen-control',
]);
export const voiceReportNarrowingEnvironment = Object.freeze([
  'SENSE_TRUTH_ONLY',
  'SENSE_VH_CASES',
  'SENSE_VH_CONTROL',
  'SENSE_VH_CONTROLS',
  'SENSE_VH_NONCE',
  'SPEAK_CASES',
  'SPEAK_NEGATIVES',
  'SPEAK_FAULT',
  'SPEAK_BREAK_SETUP',
  'SPEAK_NEGATIVES_BREAK_SETUP',
  'SPEAK_OVERLAY_SOURCE',
  'SPEAK_RUN_NONCE',
  'SPEAK_RUN_PHASE',
  'KAIRO_CORRIDOR_SOURCE',
]);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sha = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/u.test(s);
const nonempty = (s) => typeof s === 'string' && s.length > 0;
const engines = (e) => (e === 'all' ? ['chromium', 'webkit'] : [e || 'chromium']);
const ids = (names, engine) => engines(engine).flatMap((e) => names.map((name) => `${e}/${name}`));
const runtime = (context, path) =>
  Array.isArray(context.runtimeFiles)
    ? context.runtimeFiles.find((r) => r.path === path)?.sha256
    : context.runtimeFiles?.[path];
const senseExpected = (engine) => [
  ...SENSE_CASE_IDS.filter((id) => id.startsWith('data/')),
  ...engines(engine).flatMap((e) =>
    SENSE_CASE_IDS.filter((id) => id.startsWith('chromium/')).map((id) =>
      id.replace(/^chromium\//u, `${e}/`),
    ),
  ),
];
const speakNames = (engine, id) =>
  SPEAK_CHECK_NAMES[id].filter((name) =>
    engine === 'webkit'
      ? !name.startsWith('Chromium frames')
      : !name.startsWith("WebKit's worst frame"),
  );
const speakControlIds = (e) => SPEAK_CONTROL_ROSTER_BY_ENGINE[e] || [];
const speakControlExpected = (e) =>
  engines(e).flatMap((engine) => speakControlIds(engine).map((id) => `${engine}/${id}`));
function setup(report, context, expectedCases, { source = false } = {}) {
  const errors = [],
    require = (ok, why) => {
      if (!ok) errors.push(why);
    };
  require(report?.schemaVersion === 1, 'Missing/wrong receipt schema');
  require(nonempty(context.runId) &&
    report?.runId === context.runId, 'Missing/wrong current invocation identity');
  require(sha(context.verifierSha256) &&
    report?.verifierSha256 === context.verifierSha256, 'Wrong current producer identity');
  if (source)
    require(context.sourceVerifiedBeforeAndAfter === true &&
      sha(context.sourceSha256) &&
      report.sourceSha256 === context.sourceSha256, 'Source corpus changed or unbound');
  else
    require(sha(context.artifactSha256) &&
      report?.artifactSha256 === context.artifactSha256, 'Wrong artifact identity');
  const env = context.env || context.environment || {};
  for (const key of voiceReportNarrowingEnvironment)
    require(!Object.hasOwn(env, key), `Diagnostic/fault input ${key} cannot be full acceptance`);
  require(report?.fullAcceptance === true &&
    report?.selectedPassed === true, 'Producer denies full acceptance');
  require(!report?.error && !report?.fault && !report?.overlay, 'Fault/overlay/error receipt');
  return { require, errors, expectedCases };
}
function finish(state, observedCases) {
  state.require(
    exactRoster(state.expectedCases, observedCases),
    'Missing, duplicate, extra or wrong-engine roster',
  );
  return {
    passed: state.errors.length === 0,
    errors: state.errors,
    expectedCases: state.expectedCases,
    observedCases,
  };
}
function declared(report, state, observed) {
  state.require(
    exactRoster(state.expectedCases, report.expectedCases) &&
      exactRoster(observed, report.observedCases),
    'Declared coverage differs from independently observed roster',
  );
}
function child(context, phase, file) {
  const directory = phase.evidence || phase.dir;
  if (!nonempty(directory) || typeof context.readReport !== 'function')
    throw new Error('Phase receipt reader/directory absent');
  return context.readReport(join(directory, file));
}
function phaseBase(state, phase, receipt, report, engine, expectedPhase) {
  const nonce = phase.nonce || (phase.dir || '').split(`${expectedPhase}-`).at(-1);
  state.require(
    nonempty(nonce) && receipt?.nonce === nonce && receipt?.runId === report.runId,
    `${expectedPhase}: stale/missing child nonce`,
  );
  state.require(
    phase.phase === expectedPhase &&
      !phase.signal &&
      !phase.timedOut &&
      !phase.error &&
      !phase.spawnError,
    `${expectedPhase}: process incomplete`,
  );
  state.require(
    receipt?.artifactSha256 === report.artifactSha256 &&
      sha(receipt.verifierSha256) &&
      !receipt.error,
    `${expectedPhase}: child identity/error invalid`,
  );
  state.require(
    phase.ok === true && (phase.fresh === true || phase.identityOkay === true),
    `${expectedPhase}: producer adjudicator refused phase`,
  );
  return nonce;
}
const contracts = {
  'sense-truth': {
    producer: 'prototypes/corridor/tools/verify-sense-truth.mjs',
    paths: ['verify-sense-truth.json'],
    expectedCases: senseExpected,
    validate(report, context) {
      const state = setup(report, context, senseExpected(context.engine)),
        required = engines(context.engine);
      state.require(
        exactRoster(required, report.engines) &&
          required.every((e) => nonempty(report.versions?.[e])),
        'Actual engine/version coverage absent',
      );
      state.require(
        report.complete === true &&
          report.partial === false &&
          !report.vhControl &&
          !report.vhSelected &&
          report.failed === 0,
        'Incomplete/filtered/fault Sense receipt',
      );
      state.require(
        exactRoster(['f0', 'g', 'w', 'c'], report.requestedScope),
        'Missing Sense group',
      );
      const inventory = (
        Array.isArray(context.runtimeFiles)
          ? context.runtimeFiles.map((r) => [r.path, r.sha256])
          : Object.entries(context.runtimeFiles || {})
      )
        .filter(([path]) => /^(?:data\/articles\/|data\/share_alike\/dict-v2\/)/u.test(path))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      state.require(
        digest(JSON.stringify(inventory)) === SENSE_DATA_INVENTORY_SHA256,
        'Sense content/class registry changed; independent roster review required',
      );
      const rows = report.rows.filter((r) => !r.recorded),
        observed = rows.map((r) => `${r.engine}/${r.id}`);
      state.require(
        rows.every((r) => r.ok === true),
        'Semantic Sense red',
      );
      const expectedAttempts = state.expectedCases
        .filter((id) => /\/G\./u.test(id) && !id.endsWith('.classification'))
        .map((id) => id.replace('/G.', '/'));
      state.require(
        exactRoster(
          expectedAttempts,
          report.attempts.map((a) => `${a.engine}/${a.fixture}`),
        ),
        'Missing/duplicate semantic case attempt history',
      );
      for (const attempt of report.attempts) {
        const h = attempt.history;
        state.require(
          h.length > 0 && h.length <= 2 && h.at(-1).complete === true,
          'Sense case did not complete',
        );
        if (h.length === 2)
          state.require(
            h[0].stage === 'setup' && h[0].observations === 0 && h[0].retry === true,
            'Semantic observation was retried/discarded',
          );
      }
      declared(report, state, observed);
      return finish(state, observed);
    },
  },
  speak: {
    producer: 'prototypes/corridor/tools/verify-speak.mjs',
    paths: ['verify-speak.json'],
    expectedCases: (e) => ids([...SPEAK_CASE_IDS, 'egress'], e),
    validate(report, context) {
      const state = setup(report, context, this.expectedCases(context.engine)),
        required = engines(context.engine);
      state.require(
        exactRoster(required, Object.keys(report.engines)) &&
          required.every((e) => nonempty(report.engines[e])),
        'Actual Speak engines absent',
      );
      state.require(
        report.only === null && report.phase === 'candidate' && report.complete === true,
        'Child/filtered/incomplete Speak receipt',
      );
      const completion = speakCompletion({
        engines: required,
        selected: null,
        cases: report.cases,
        checks: report.checks,
        error: report.error,
        pageErrors: report.pageErrors,
      });
      state.require(
        completion.fullAcceptance === true,
        'Speak completeness/semantic checks failed',
      );
      for (const e of required)
        for (const id of [...SPEAK_CASE_IDS, 'egress'])
          state.require(
            exactRoster(
              speakNames(e, id),
              report.checks.filter((r) => r.engine === e && r.case === id).map((r) => r.name),
            ),
            `${e}/${id}: assertion missing/duplicated`,
          );
      declared(report, state, completion.observedCases);
      return finish(state, completion.observedCases);
    },
  },
  'vh-sense-controls': {
    producer: 'prototypes/corridor/tools/verify-vh-sense-controls.mjs',
    paths: ['verify-vh-sense-controls.json'],
    expectedCases: (e) => ids(SENSE_CONTROL_IDS, e),
    validate(report, context) {
      const state = setup(report, context, this.expectedCases(context.engine));
      state.require(
        report.selected === null &&
          exactRoster(engines(context.engine), report.engines) &&
          report.sourceDigest === runtime(context, 'corridor.js'),
        'Sense controls narrowed or source differs',
      );
      const observed = report.rows.map((r) => `${r.engine}/${r.control}`),
        nonces = [];
      const reds = {
        'discard-completed-red-on-retry': [
          'G.ない, auxiliary (聞こえない)',
          'G.ない, auxiliary (聞こえない).incomplete',
        ],
        'pronunciation-ta-promoted-to-door': ['G.悉曇（しったん）: た'],
        'pronunciation-n-promoted-to-door': ['G.悉曇（しったん）: ん'],
        'quoted-reading-demoted-to-annotation': [
          'G.「いちちゅう」: ちゅう.classification',
          'G.「いちちゅう」: ちゅう',
        ],
      };
      for (const row of report.rows) {
        state.require(
          row.status === 'caught' &&
            row.restored === true &&
            exactRoster(
              ['baseline', 'mutant', 'restore'],
              row.phases.map((p) => p.phase),
            ),
          `${row.control}: missing candidate/mutant/restore`,
        );
        for (const phase of row.phases) {
          const r = child(context, phase, 'verify-sense-truth.json');
          nonces.push(phaseBase(state, phase, r, report, row.engine, phase.phase));
          state.require(
            exactRoster([row.engine], r.engines) &&
              r.fullAcceptance === false &&
              r.attempts.length === 1,
            'Wrong child scope',
          );
          state.require(
            r.verifierSha256 ===
              context.producerHashes?.['prototypes/corridor/tools/verify-sense-truth.mjs'] &&
              nonempty(r.versions?.[row.engine]),
            'Wrong Sense child verifier/version',
          );
          const semantic = r.rows.filter((x) => !x.recorded),
            bad = semantic.filter((x) => !x.ok);
          const primary = reds[row.control][0];
          const candidateRows =
            row.control === SENSE_CONTROL_IDS[0]
              ? [primary, primary.replace(/^G\./u, 'P.'), 'g.page-errors']
              : [...reds[row.control], 'g.page-errors'];
          const expectedRows =
            phase.phase === 'mutant' && row.control === SENSE_CONTROL_IDS[0]
              ? [...reds[row.control], 'g.page-errors']
              : candidateRows;
          state.require(
            exactRoster(
              ids(expectedRows, row.engine),
              semantic.map((x) => `${x.engine}/${x.id}`),
            ) && semantic.some((x) => x.id === 'g.page-errors' && x.ok === true),
            'Sense phase omitted a required semantic/prerequisite row',
          );
          if (phase.phase === 'mutant') {
            state.require(
              phase.exit === 1 &&
                r.vhControl === row.control &&
                exactRoster(
                  reds[row.control],
                  bad.map((x) => x.id),
                ) &&
                r.vhMutations.length > 0,
              'Missing exact intended mutant red',
            );
            const h = r.attempts[0].history;
            state.require(
              h.length === 1 &&
                (row.control === SENSE_CONTROL_IDS[0]
                  ? h[0].observations === 1 &&
                    h[0].retry === false &&
                    h[0].stage === 'navigation' &&
                    bad[0].observed?.detail?.lines?.[0] === 'VH wrong sense sentinel'
                  : h[0].complete === true && r.complete === true),
              'Semantic retry hid a red or mutant never completed',
            );
          } else
            state.require(
              phase.exit === 3 &&
                r.selectedPassed === true &&
                bad.length === 0 &&
                r.complete === true,
              'Candidate/restore is not complete green',
            );
        }
      }
      state.require(new Set(nonces).size === nonces.length, 'Reused phase nonce');
      declared(report, state, observed);
      return finish(state, observed);
    },
  },
  'vh-voice-controls': {
    producer: 'prototypes/corridor/tools/verify-vh-voice-controls.mjs',
    paths: ['verify-vh-voice-controls.json'],
    sourceOnly: true,
    expectedCases: () => [...VOICE_CONTROL_IDS],
    validate(report, context) {
      const state = setup(report, context, this.expectedCases(), { source: true }),
        observed = report.rows.map((r) => r.control),
        nonces = [];
      for (const row of report.rows) {
        state.require(
          row.status === 'caught' &&
            row.restored === true &&
            row.matches === 1 &&
            row.sourceSha256 === report.sourceSha256 &&
            sha(row.mutationSha256) &&
            row.mutationSha256 !== row.sourceSha256,
          'Voice mutation did not uniquely change source then restore',
        );
        state.require(
          exactRoster(
            ['baseline', 'mutant', 'restore'],
            row.phases.map((p) => p.phase),
          ),
          'Missing voice phase',
        );
        for (const phase of row.phases) {
          nonces.push(phase.nonce);
          state.require(
            nonempty(phase.nonce) &&
              phase.input.endsWith(`${phase.phase}-${phase.nonce}.js`) &&
              phase.tap.endsWith(`${phase.phase}-${phase.nonce}.tap`) &&
              sha(phase.tapSha256),
            'Missing nonce-bound source/TAP phase',
          );
          state.require(
            phase.completed === true &&
              phase.ok === true &&
              !phase.error &&
              !phase.signal &&
              phase.exit === (phase.phase === 'mutant' ? 1 : 0),
            'Voice phase incomplete',
          );
          state.require(
            phase.digest === (phase.phase === 'mutant' ? row.mutationSha256 : row.sourceSha256),
            'Voice phase bytes differ',
          );
          if (phase.phase === 'mutant')
            state.require(phase.intended === true, 'Voice intended AssertionError absent');
        }
      }
      state.require(new Set(nonces).size === nonces.length, 'Repeated voice phase nonce');
      declared(report, state, observed);
      return finish(state, observed);
    },
  },
};
contracts['speak-negatives'] = {
  producer: 'prototypes/corridor/tools/verify-speak.mjs',
  paths: ['verify-speak-negatives.json'],
  expectedCases: speakControlExpected,
  validate(report, context) {
    const state = setup(report, context, this.expectedCases(context.engine)),
      observed = report.rows.map((r) => `${r.engine}/${r.fault}`),
      nonces = [];
    const required = engines(context.engine),
      scope = [...new Set(required.flatMap(speakControlIds))];
    state.require(
      report.selected === null &&
        exactRoster(required, report.engines) &&
        exactRoster(scope, report.requestedScope),
      'Filtered/wrong-engine mutant roster',
    );
    state.require(
      exactRoster(required, Object.keys(report.applicability || {})) &&
        required.every((engine) =>
          exactRoster(speakControlIds(engine), report.applicability[engine]),
        ),
      'Unreviewed/missing control engine applicability',
    );
    for (const row of report.rows) {
      const spec = SPEAK_MUTANT_SPEC[row.fault],
        cases = Object.keys(spec.witness);
      state.require(
        row.status === 'caught' &&
          row.restored === true &&
          row.anchor.matches === 1 &&
          row.anchor.file === spec.file &&
          row.anchor.before === runtime(context, spec.file) &&
          sha(row.anchor.after) &&
          row.anchor.after !== row.anchor.before,
        'Mutant source anchor/restore is incomplete',
      );
      for (const name of ['baseline', 'mutant', 'restore']) {
        const p = row[name],
          r = child(context, p, 'verify-speak.json');
        nonces.push(phaseBase(state, p, r, report, row.engine, name));
        state.require(
          r.verifierSha256 === report.verifierSha256 &&
            r.phase === name &&
            r.fullAcceptance === false &&
            r.complete === true &&
            exactRoster([row.engine], Object.keys(r.engines)) &&
            nonempty(r.engines[row.engine]) &&
            !r.pageErrors.length,
          'Wrong/incomplete child engine/verifier/phase',
        );
        state.require(
          exactRoster(cases, r.only) &&
            exactRoster(
              ids(cases, row.engine),
              r.cases.map((c) => `${c.engine}/${c.case}`),
            ) &&
            r.cases.every((c) => c.completed === true && c.checks > 0),
          'Mutant child case roster incomplete',
        );
        for (const id of cases)
          state.require(
            exactRoster(
              speakNames(row.engine, id),
              r.checks.filter((c) => c.case === id && c.engine === row.engine).map((c) => c.name),
            ),
            'Child assertion missing/duplicated',
          );
        const bad = r.checks.filter((c) => c.pass !== true);
        if (name === 'mutant') {
          state.require(
            p.exit === 1 &&
              r.fault === row.fault &&
              cases.every((id) =>
                bad.some((c) => c.case === id && new RegExp(spec.witness[id], 'u').test(c.name)),
              ),
            'Intended primary witness missing',
          );
          state.require(
            bad.every(
              (c) =>
                c.engine === row.engine &&
                (new RegExp(spec.witness[c.case], 'u').test(c.name) ||
                  (spec.downstream[c.case] || []).includes(c.name)),
            ),
            'Unrelated red cannot kill mutant',
          );
          const mutation = r.mutations?.[row.fault];
          state.require(
            mutation?.matches === 1 &&
              mutation.before === row.anchor.before &&
              mutation.after === row.anchor.after &&
              mutation.served > 0,
            'Mutant bytes were never served',
          );
        } else
          state.require(
            p.exit === 3 && r.selectedPassed === true && !r.fault && bad.length === 0,
            'Candidate/restore not green',
          );
      }
      state.require(
        JSON.stringify(row.baseline.served) === JSON.stringify(row.restore.served),
        'Restore served different bytes',
      );
    }
    state.require(new Set(nonces).size === nonces.length, 'Reused Speak phase nonce');
    declared(report, state, observed);
    return finish(state, observed);
  },
};
export const voiceReportContracts = Object.freeze(
  Object.fromEntries(
    Object.entries(contracts).map(([name, contract]) => [
      name,
      Object.freeze({
        ...contract,
        validate(report, context = {}) {
          try {
            return contract.validate(report, context);
          } catch (error) {
            return {
              passed: false,
              errors: [`Malformed/incomplete ${name} receipt: ${error.message}`],
              expectedCases: contract.expectedCases(context.engine),
              observedCases: [],
            };
          }
        },
      }),
    ]),
  ),
);
export function validateVoiceReport(name, report, context = {}) {
  return (
    voiceReportContracts[name]?.validate(report, context) || {
      passed: false,
      errors: [`Unsupported voice gate ${name}`],
      expectedCases: [],
      observedCases: [],
    }
  );
}
