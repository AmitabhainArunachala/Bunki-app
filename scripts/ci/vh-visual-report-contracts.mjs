/** VH-1 visual admission. Required rosters are fixed obligations independent of receipts.
 * C/S completion IDs identify assertion sites; the human-readable names stay in each row.
 */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import {
  DESIGN_CASES,
  READING_CASES,
  SWEEP_DROP_IDS,
  exactRoster,
  plainBadBreak,
} from './vh-visual-rosters.mjs';
const readingRoster = JSON.parse(
  readFileSync(new URL('./vh-visual-reading-row-roster.json', import.meta.url)),
);
const engines = (value) => (value === 'all' ? ['chromium', 'webkit'] : [value || 'chromium']);
const langs = ['bi', 'ja'];
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function combExpectedIds(engine = 'chromium') {
  return engines(engine).flatMap((e) =>
    langs.flatMap((lang) =>
      [390, 320].flatMap((width) => {
        const tag = `${e} ${lang} ${width}`,
          ids = [];
        for (let n = 1; n <= 21; n++) {
          if (([10, 11].includes(n) && e !== 'chromium') || (n >= 19 && width !== 390)) continue;
          const tails =
            n === 2
              ? ['at rest', '総理 touched', 'the longest word touched']
              : n === 5
                ? ['kantei:jp-105-actions-202609-25startup', 'bunki-read-n1-neocognitron']
                : n === 8
                  ? ['n2', 'n1', 'senmon', 'kotoba']
                  : [null];
          for (const tail of tails)
            ids.push(`C${String(n).padStart(2, '0')}/${tag}${tail === null ? '' : `/${tail}`}`);
        }
        return ids;
      }),
    ),
  );
}
export const SWEEP_ROOMS = Object.freeze([
  'shelf',
  'reader',
  'reader-card',
  'page',
  'page-foot',
  'page-inside-card',
  'reader-card-menu',
  'page-kanji',
  'page-grammar',
  'page-idiom',
  'stroke',
  'today',
  'today-star-card',
  'universe',
  'learn',
  ...['hokusai', 'sumi'].flatMap((theme) =>
    ['home', 'front', 'back', 'back-card'].map((face) => `deck-${face}-${theme}`),
  ),
  'guided',
  'speak',
  'speak-bridge',
  'speak-shadow',
  'speak-lookback',
  'speak-settings',
  'speak-scenes',
  'speak-past',
  'search',
  'search-results',
  'kanjidex',
  'grammar',
  'yoji',
  'thesaurus',
  'list',
  'saved',
  'browse',
  'levels',
  'me',
  'settings',
  'kagami',
  'srs-stats',
  'mock',
  'tests',
  'lessons',
  'archive',
  'feed',
  'publisher',
  'source-inbox',
  'airead',
  'sentence-practice',
  'ai',
  'probe',
  'review',
  'source-reader-selection',
  'report-form',
  'today-cards',
  ...['dojo', 'shelf', 'search', 'tests', 'me'].map((view) => `places-${view}`),
]);
// INT-VH (2026-10-19): the walk's inventory also holds the N walk's one 'rows-and-cards' row per language and engine
// (verify-sweep pushes it beside the rooms since slice N, before this roster's 384d4a70 review). It carries the shelf
// data S01-S08 judge; it is not a room, so no S25-S28 row names it. The inventory admission requires it exactly once.
export const SWEEP_INVENTORY_ROWS = Object.freeze([...SWEEP_ROOMS, 'rows-and-cards']);
const shelfMutants = ['drop-duplicate-hides-omission', 'series-book-order-swapped'];
const SHELF_CONTROLS = Object.freeze({
  'drop-duplicate-hides-omission': {
    mode: 'duplicate',
    intended: ['roster', 'blocks'],
    allowed: ['roster', 'blocks', 'order'],
  },
  'series-book-order-swapped': {
    mode: 'swap',
    intended: ['series', 'order'],
    allowed: ['series', 'order'],
    pair: ['aozora:049966-1', 'aozora:049966-2'],
  },
  'day-two-drop-order-drift': { mode: 'swap', intended: ['order'], allowed: ['order'] },
});
const SHELF_PREDICATES = ['roster', 'blocks', 'series', 'order'];
const idList = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((id) => typeof id === 'string' && id.length > 0);
function shelfControlHolds(r) {
  const spec = SHELF_CONTROLS[r.id],
    m = r.mutation;
  if (!spec || !m || m.id !== r.id || m.mode !== spec.mode || !equal(m.intended, spec.intended))
    return false;
  const { baseline, changed, restored } = r;
  if (![baseline, changed, restored].every(idList) || new Set(baseline).size !== baseline.length)
    return false;
  if (changed.length !== baseline.length || equal(changed, baseline) || !equal(restored, baseline))
    return false;
  const moved = baseline.map((id, i) => (id === changed[i] ? -1 : i)).filter((i) => i >= 0);
  const pair = [m.pair?.a, m.pair?.b];
  const mutated =
    spec.mode === 'duplicate'
      ? moved.length === 1 &&
        baseline[moved[0]] === pair[1] &&
        changed[moved[0]] === pair[0] &&
        baseline.indexOf(pair[0]) >= 0 &&
        baseline.indexOf(pair[0]) < moved[0]
      : moved.length === 2 &&
        changed[moved[0]] === baseline[moved[1]] &&
        changed[moved[1]] === baseline[moved[0]] &&
        equal([baseline[moved[0]], baseline[moved[1]]], pair);
  if (!mutated || (spec.pair && !equal(pair, spec.pair))) return false;
  const judged = r.judged;
  if (!judged || !SHELF_PREDICATES.every((key) => typeof judged[key] === 'boolean')) return false;
  const failures = SHELF_PREDICATES.filter((key) => judged[key] === false);
  return (
    r.passed === true &&
    r.premise?.baseGood === true &&
    r.premise?.legacyMembership === true &&
    r.premise?.neighborClean === true &&
    r.restoredBytes === true &&
    equal(r.failures, failures) &&
    spec.intended.every((key) => failures.includes(key)) &&
    failures.every((key) => spec.allowed.includes(key)) &&
    Array.isArray(r.unrelated) &&
    !r.unrelated.length
  );
}
const DRIFT = 'day-two-drop-order-drift';
const prefixMatrix = (matrix, days, length) =>
  !!matrix &&
  typeof matrix === 'object' &&
  matrix.prefixLength === length &&
  equal(matrix.days, days) &&
  Array.isArray(matrix.prefixes) &&
  matrix.prefixes.length === 4 &&
  matrix.prefixes.every((prefix) => idList(prefix) && prefix.length === length);
const oneOrder = (prefixes) => prefixes.every((prefix) => equal(prefix, prefixes[0]));
function dropOrderHolds(report, rows, days, engine, lang) {
  const evidence = (Array.isArray(report.checks) ? report.checks : []).find(
    (row) => row?.id === `S09/${engine} ${lang} · N`,
  )?.evidence;
  const length = evidence?.prefixLength;
  if (length !== SWEEP_DROP_IDS.length || !prefixMatrix(evidence, days, length)) return false;
  const own = rows.filter((r) => r.engine === engine && r.lang === lang);
  const natural = days.map((day) => {
    const seen = own.filter((r) => r.day === day).map((r) => r.baseline);
    return seen.length > 0 && seen.every((ids) => idList(ids) && equal(ids, seen[0]))
      ? seen[0].slice(0, length)
      : null;
  });
  if (
    !natural.every((prefix) => exactRoster(SWEEP_DROP_IDS, prefix)) ||
    !equal(evidence.prefixes, natural) ||
    evidence.passed !== true ||
    !oneOrder(natural)
  )
    return false;
  const moved = (r) =>
    r.baseline.map((id, i) => (id === r.changed[i] ? -1 : i)).filter((i) => i >= 0);
  if (
    !own.every(
      (r) => r.judged?.order !== false || (idList(r.changed) && moved(r).every((i) => i < length)),
    )
  )
    return false;
  const drift = own.filter((r) => r.id === DRIFT);
  if (drift.length !== 1) return false;
  const [r] = drift,
    s09 = r.s09;
  if (
    r.day !== days[1] ||
    !s09 ||
    s09.prefixLength !== length ||
    s09.dayIndex !== 1 ||
    r.premise?.naturalBaseline !== true ||
    !idList(r.changed) ||
    !idList(r.restored)
  )
    return false;
  const replaced = (ids) => natural.map((prefix, i) => (i === 1 ? ids.slice(0, length) : prefix));
  const expected = { natural, mutant: replaced(r.changed), restored: replaced(r.restored) };
  return (
    Object.entries(expected).every(
      ([key, prefixes]) =>
        prefixMatrix(s09[key], days, length) &&
        equal(s09[key].prefixes, prefixes) &&
        s09[key].passed === (key !== 'mutant') &&
        oneOrder(prefixes) === (key !== 'mutant'),
    ) &&
    equal(expected.restored, natural) &&
    r.judged?.order === false &&
    s09.mutant.passed === r.judged.order
  );
}
const LEXICAL_WITNESS = 'inside an independently evidenced mixed-script word';
const lineObservation = (o) =>
  !!o &&
  typeof o === 'object' &&
  typeof o.text === 'string' &&
  o.text.length > 0 &&
  typeof o.html === 'string' &&
  o.html.length > 0 &&
  Array.isArray(o.breaks) &&
  Array.isArray(o.glyphs) &&
  o.glyphs.length === [...o.text].length;
const badBreaks = (o) => o.breaks.map((at) => plainBadBreak(o.text, at)).filter(Boolean);
function lexicalControlHolds(r) {
  const { candidate, mutant, restored } = r;
  if (![candidate, mutant, restored].every(lineObservation)) return false;
  return (
    r.passed === true &&
    r.premise === true &&
    candidate.text === 'サボる' &&
    mutant.text === candidate.text &&
    restored.text === candidate.text &&
    candidate.html !== mutant.html &&
    candidate.html === restored.html &&
    equal(candidate.breaks, restored.breaks) &&
    mutant.breaks.includes(2) &&
    equal(badBreaks(candidate), []) &&
    equal(r.clean, []) &&
    equal(badBreaks(mutant), [LEXICAL_WITNESS]) &&
    equal(r.wrong, [LEXICAL_WITNESS]) &&
    equal(badBreaks(restored), []) &&
    equal(r.back, [])
  );
}
export function sweepExpectedIds(engine = 'chromium') {
  return [
    ...engines(engine).flatMap((e) =>
      langs.flatMap((lang) => {
        const tag = `${e} ${lang}`,
          label = `${tag} · N`,
          ids = [];
        for (let day = 0; day < 4; day++) {
          for (const mutant of [
            ...shelfMutants,
            ...(day === 1 ? ['day-two-drop-order-drift'] : []),
          ])
            ids.push(`S01/${label}/${day}/${mutant}`);
          for (let n = 3; n <= 8; n++) ids.push(`S${String(n).padStart(2, '0')}/${label}/${day}`);
        }
        for (const n of [2, 9, 10, 11, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23])
          ids.push(`S${String(n).padStart(2, '0')}/${label}`);
        for (const key of ['B', 'C', 'D', 'E1']) ids.push(`S12/${label}/${key}`);
        for (const level of ['N5', 'N4', 'N3', 'N2', 'N1']) ids.push(`S17/${label}/${level}`);
        for (const room of SWEEP_ROOMS)
          for (const n of [25, 26, 27, 28]) ids.push(`S${n}/${tag} · ${room}`);
        for (const menu of [
          'the reader card',
          "the reader's bar",
          "the page's bar",
          "the page's sentence",
          "the source's selection",
          'the sky card',
        ])
          for (const n of [29, 30]) ids.push(`S${n}/${tag} · K ${menu}`);
        ids.push(`S32/${tag}`);
        for (const room of ['reader', 'reader-card']) ids.push(`S33/${tag} · ${room}`);
        ids.push(`S34/${tag} · reader-card`);
        // INT-VH (2026-10-19): S36 holds Hfix-1B's "exactly back and count, no Remove" (HG-5 supersedes "back, count
        // and Remove"); S39 is Hfix-1B's quiet report door in the band's end slot at 3:1 (HG-1)
        for (const theme of ['hokusai', 'sumi'])
          for (const face of ['front', 'back'])
            for (const n of [35, 36, 39]) ids.push(`S${n}/${tag} · deck-${face}-${theme}`);
        for (const room of ['today', 'today-cards']) ids.push(`S37/${tag}/${room}`);
        return ids;
      }),
    ),
    'S38/all',
  ];
}
export const readingExpectedIds = (engine) =>
  engines(engine).flatMap((e) =>
    [
      ...READING_CASES.flatMap((name) => readingRoster.cases[name]),
      ...readingRoster.captureWithR2,
    ].map((id) => `${e}/${id}`),
  );
export const designExpectedIds = (engine) =>
  engines(engine).flatMap((e) => DESIGN_CASES.map((id) => `${e}/${id}`));
function controls(report, kind, requiredEngines, require) {
  const rows = Array.isArray(report.controls) ? report.controls : [];
  if (kind === 'comb-0') {
    const expected = requiredEngines.flatMap((e) =>
      langs.flatMap((lang) =>
        [390, 320].map((width) => `${e}/${lang}/${width}/mixed-script-verb-split`),
      ),
    );
    require(exactRoster(
      expected,
      rows.map((r) => `${r.engine}/${r.lang}/${r.width}/${r.id}`),
    ), 'Lexical control roster incomplete/duplicated');
    for (const r of rows)
      require(lexicalControlHolds(r), 'Lexical candidate, intended red or restored green missing');
  } else if (kind === 'sweep') {
    const expected = requiredEngines.flatMap((e) =>
      langs.flatMap((lang) =>
        [0, 1, 2, 3].flatMap((day) =>
          [...shelfMutants, ...(day === 1 ? ['day-two-drop-order-drift'] : [])].map(
            (id) => `${e}/${lang}/${day}/${id}`,
          ),
        ),
      ),
    );
    const days = [...new Set(rows.map((r) => r.day))].sort();
    require(days.length === 4 &&
      days.every(
        (day, i) =>
          /^\d{4}-\d{2}-\d{2}$/u.test(day) &&
          Date.parse(day) - Date.parse(days[0]) === i * 86400000,
      ), 'Shelf controls must cover four consecutive days');
    require(exactRoster(
      expected,
      rows.map((r) => `${r.engine}/${r.lang}/${days.indexOf(r.day)}/${r.id}`),
    ), 'Shelf control roster incomplete/duplicated');
    for (const r of rows)
      require(shelfControlHolds(
        r,
      ), 'Shelf mutation prerequisite, intended kill or byte restore missing');
    for (const e of requiredEngines)
      for (const lang of langs)
        require(dropOrderHolds(
          report,
          rows,
          days,
          e,
          lang,
        ), 'S09 four-day order or its day-two drift control not reconstructed from the actual collection');
  } else if (kind === 'reading-truth') {
    const expected = requiredEngines.flatMap((e) =>
      ['aozora:000628#76', 'bunki-graded-n3-hashira-counter#242']
        .flatMap((f) =>
          ['special-label-save-enabled', 'special-label-save-reason-empty'].map(
            (id) => `${e}/${f}/${id}`,
          ),
        )
        .concat(
          [
            'class-proof-missing',
            'class-proof-noun-substitution',
            'ordinary-verb-labeled-name',
            'ordinary-verb-labeled-reading',
          ].map((id) => `${e}//${id}`),
        ),
    );
    require(exactRoster(
      expected,
      rows.map((r) => `${r.engine}/${r.fixture || ''}/${r.id}`),
    ), 'Reading control roster incomplete/duplicated');
    for (const r of rows) {
      require(r.passed === true &&
        r.status !== 'inconclusive', 'Reading mutation was not a completed kill');
      require(equal(r.candidate, r.restored), 'Reading candidate was not exactly restored');
      if (r.id.startsWith('class-proof-'))
        require(r.candidate?.proved === true &&
          r.mutant?.proved === false &&
          r.restored?.proved === true, 'Class proof control did not reject mutation');
      else {
        require(r.recordBefore !== undefined &&
          equal(r.recordBefore, r.recordAfter), 'DOM mutation changed the whole native record');
        if (r.id.startsWith('ordinary-'))
          require(r.judged?.classification === false &&
            r.judged?.asWritten === true &&
            r.judged?.held ===
              true, 'False-special-label control lacks isolated classification failure');
        else
          require(r.judged?.classification === true &&
            r.judged?.asWritten === true &&
            r.judged?.held === false, 'Held-Save control lacks isolated held failure');
      }
    }
  }
}
export const visualReportNarrowingEnvironment = Object.freeze([
  'COMB_NEGATIVE',
  'KAIRO_SWEEP_MODE',
  'KAIRO_SWEEP_NEGATIVE',
  'READING_TRUTH_ONLY',
  'READING_TRUTH_SWEEP_IDS',
  'READING_TRUTH_PAST_F0',
]);
const definitions = {};
for (const kind of ['comb-0', 'sweep', 'reading-truth', 'design-reader-shelf'])
  for (const engine of ['chromium', 'webkit']) {
    const name = kind + (engine === 'webkit' ? '-webkit' : '');
    const expectedCases = () =>
      ({
        'comb-0': combExpectedIds,
        sweep: sweepExpectedIds,
        'reading-truth': readingExpectedIds,
        'design-reader-shelf': designExpectedIds,
      })[kind](engine);
    definitions[name] = {
      producer: `prototypes/corridor/tools/verify-${kind}.mjs`,
      paths: [kind === 'reading-truth' ? 'verify-reading-truth.json' : `${kind}.json`],
      expectedCases,
      validate(report, context = {}) {
        const errors = [],
          require = (ok, message) => {
            if (!ok) errors.push(message);
          };
        if (!report || typeof report !== 'object' || Array.isArray(report))
          return {
            passed: false,
            errors: ['Missing report'],
            expectedCases: expectedCases(),
            observedCases: [],
          };
        require(report.schemaVersion === 2 &&
          typeof report.runId === 'string' &&
          report.runId.length > 0, 'Missing schema/run identity');
        if (context.runId) require(report.runId === context.runId, 'Wrong attempt nonce');
        require(report.fullAcceptance === true &&
          report.selectedPassed === true, 'No full acceptance');
        require(report.requestedScope ===
          (kind === 'sweep' ? 'verify' : 'full'), 'Filtered or unidentified scope');
        require(!report.negative &&
          !report.control &&
          !report.partial &&
          !report.sweepIds &&
          !report.pastF0, 'Diagnostic scope cannot accept');
        const declaredEnv = context.env || context.environment || {};
        require(visualReportNarrowingEnvironment.every(
          (name) => !Object.hasOwn(declaredEnv, name),
        ), 'Declared narrowing selector cannot accept');
        require(digest(report.artifactSha256), 'Missing artifact identity');
        if (context.artifactSha256)
          require(report.artifactSha256 === context.artifactSha256, 'Wrong artifact');
        require(digest(report.verifierSha256), 'Missing verifier identity');
        if (context.verifierSha256)
          require(report.verifierSha256 === context.verifierSha256, 'Wrong verifier');
        const declared = Array.isArray(report.engines)
          ? report.engines
          : Object.keys(report.engines || {});
        require(exactRoster([engine], declared), 'Wrong/missing engine roster');
        const versions =
          kind === 'comb-0'
            ? report.engines
            : kind === 'sweep'
              ? report.browserVersions
              : kind === 'reading-truth'
                ? report.versions
                : report.browserVersions;
        require(typeof versions?.[engine] === 'string' &&
          versions[engine].length > 0, 'Actual browser version missing');
        const rows =
          kind === 'reading-truth'
            ? (report.rows || []).filter((r) => r.engine !== 'data' && !r.recorded)
            : kind === 'design-reader-shelf'
              ? report.results
              : report.checks;
        const safe = Array.isArray(rows) ? rows : [];
        const observed = safe.map((r) =>
          kind === 'reading-truth'
            ? `${r.engine}/${r.id}`
            : kind === 'design-reader-shelf'
              ? `${r.engine}/${r.name}`
              : r.id,
        );
        require(exactRoster(
          expectedCases(),
          observed,
        ), 'Missing, duplicate, extra or filtered assertion roster');
        for (const row of safe)
          require(row[
            kind === 'reading-truth' ? 'ok' : kind === 'design-reader-shelf' ? 'passed' : 'pass'
          ] === true && !row.error, 'Failed/incomplete assertion');
        if (kind === 'reading-truth') {
          require(report.failed === 0 &&
            report.complete === true &&
            report.rowRoster?.fullAcceptance ===
              true, 'Reading failure/completion summary invalid');
          require(exactRoster(
            READING_CASES.map((id) => `${engine}/${id}`),
            report.observedCases,
          ), 'Reading case groups incomplete');
          const data = (report.rows || []).filter((row) => row.engine === 'data');
          require(exactRoster(
            readingDataIds,
            data.map((row) => row.id),
          ) &&
            data.every(
              (row) => row.ok === true && !row.recorded,
            ), 'Reading data premises incomplete, recorded or failed');
        }
        if (kind === 'sweep') {
          require(report.mode === 'verify', 'Sweep inventory cannot accept');
          require(!!report.selectors &&
            typeof report.selectors === 'object' &&
            !Array.isArray(report.selectors) &&
            Object.keys(report.selectors).length ===
              0, 'Explicit sweep selector is diagnostic, even verify');
          require(exactRoster(
            langs.flatMap((lang) =>
              SWEEP_INVENTORY_ROWS.map((room) => `${engine}/${lang}/${room}`),
            ),
            (report.inventory || []).map((r) => `${r.engine}/${r.lang}/${r.room}`),
          ), 'Sweep room inventory incomplete or duplicated');
        }
        controls(report, kind, [engine], require);
        return {
          passed: !errors.length,
          errors,
          expectedCases: expectedCases(),
          observedCases: observed,
        };
      },
    };
  }
for (const [name, contract] of Object.entries(definitions)) {
  const validate = contract.validate;
  definitions[name] = Object.freeze({
    ...contract,
    validate(report, context = {}) {
      try {
        return validate(report, context);
      } catch (error) {
        return {
          passed: false,
          errors: [`Malformed receipt: ${error.message}`],
          expectedCases: contract.expectedCases(),
          observedCases: [],
        };
      }
    },
  });
}
export const visualReportContracts = Object.freeze(definitions);
export function validateVisualReport(name, report, context = {}) {
  return (
    visualReportContracts[name]?.validate(report, context) || {
      passed: false,
      errors: [`Unsupported visual report ${name}`],
      expectedCases: [],
      observedCases: [],
    }
  );
}

// F0 premise IDs reviewed against fixture declarations and checks at lines 266–431.
export const readingDataIds = [
  'F0.年 ねん (令和8年: a counter)',
  'F0.core.年 ねん (令和8年: a counter)',
  'F0.index.年 ねん (令和8年: a counter)',
  'F0.年 とし (twin)',
  'F0.core.年 とし (twin)',
  'F0.月 がつ',
  'F0.core.月 がつ',
  'F0.index.月 がつ',
  'F0.月 つき (twin)',
  'F0.core.月 つき (twin)',
  'F0.時 じ',
  'F0.core.時 じ',
  'F0.index.時 じ',
  'F0.時 とき (twin)',
  'F0.core.時 とき (twin)',
  'F0.一日 ついたち',
  'F0.core.一日 ついたち',
  'F0.index.一日 ついたち',
  'F0.startup',
  'F0.name',
  'F0.cold',
  'F0.unread',
  'F0.stable',
  'F0.式 in 表彰式 (sense)',
  'F0.改造 in 第2次高市改造内閣 (sense)',
  'F0.ちかい in the phonetic parenthetical',
  'F0.し of する (an inflected verb)',
  'F0.no-sense',
  'F0.R2.おい → おく · 置く',
  'F0.R2.entry.おい → おく · 置く',
  'F0.R2.云っ → 云う いう',
  'F0.R2.entry.云っ → 云う いう',
  'F0.R2.解せ → 解す げす',
  'F0.R2.entry.解せ → 解す げす',
  'F0.R2.来 read き → 来る くる',
  'F0.R2.core.来 read き → 来る くる',
  'F0.R2.来 read こ → 来る くる',
  'F0.R2.core.来 read こ → 来る くる',
  'F0.R2.unfit.かえり → かえる · 帰る (not 蛙)',
  'F0.R2.unfit.かえっ → かえる · 帰る (not 蛙)',
  'F0.R2.unfit.なさ → なす · 為す (not 茄子)',
  'F0.R2.stem.い (ている) → いる · 居る (not 要る)',
  'F0.N2.stem.い (ている) → いる · 居る (not 要る)',
  'F0.R2.stem.い (いました) → いる · 居る (not 要る)',
  'F0.N2.stem.い (いました) → いる · 居る (not 要る)',
  'F0.N2.te.いる (残っている, Grok 0036)',
  'F0.N2.te.いる (予定している, Grok 0036)',
  'F0.N2.te.い (なっていた)',
  'F0.N2.te.おく (暗記しておく)',
  'F0.N2.te.くる (廻り合せてくる)',
  'F0.N2.te.ください (いてください)',
  'F0.N2.alone.いる (ここにいる)',
  'F0.R2.V.一 いっ (一本)',
  'F0.R2.V.本 ぽん (一本)',
  'F0.R2.V.八 はっ (八本)',
  'F0.R2.V.歩 ぽ (一歩)',
  'F0.R2.V.金持ち がねもち',
  'F0.R2.K.寺 じ',
  'F0.R2.K.国 こく',
  'F0.R2.K.仏 ぶつ (never ふつ, France)',
  'F0.R2.remaining.行 ゆき',
  'F0.R2.remaining.行 ゆき (2)',
  'F0.R2.remaining.足 たし',
  'F0.R2.remaining.他 ひと',
  'F0.R2.remaining.行う おこのう',
  'F0.R2.remaining.源 みなもとの',
  'F0.R2.remaining.章 あきら',
  'F0.R2.K.france',
  'F0.R2.C3',
  'F0.guided',
  'F0.special-proofs',
];
