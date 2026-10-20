import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
export const REFERENCE_BROWSER_CASES = Object.freeze([
  'the reference door boots without console exceptions',
  'N1 intermediate paging, jump, and bottom controls reach exact records',
  'empty search state can clear and return keyboard focus',
  'canonical entry close restores search, page, row focus, and scroll',
  'supplemental and glyphless records open honest read-only source sheets',
  'same-spelling vocabulary preserves exact source reading through open and Back',
  'browse and detail navigation leave all personal-study evidence unchanged',
  'dark-world styling preserves the reference view and its controls',
  'library Back, Mock papers, and My Study remain distinct destinations',
  'missing reference module fails visibly without breaking the reading shelf',
  'missing reference data can be retried without reloading or mutating study',
  'pending optional reference data leaves the reading shelf available',
  'cancelled loading collection leaves the next ordinary library visit at overview',
  'retry within the same loading collection retains its exact destination and caller',
  'standalone reference browsing works with every network request blocked',
  'no uncaught application exceptions occurred',
  'jlpt:N5: complete count, first page, final page, correct final entry',
  'jlpt:N4: complete count, first page, final page, correct final entry',
  'jlpt:N3: complete count, first page, final page, correct final entry',
  'jlpt:N2: complete count, first page, final page, correct final entry',
  'jlpt:N1: complete count, first page, final page, correct final entry',
  'jlpt:unknown: complete count, first page, final page, correct final entry',
  'jlpt-kanji:N5: complete count, first page, final page, correct final entry',
  'jlpt-kanji:N4: complete count, first page, final page, correct final entry',
  'jlpt-kanji:N3: complete count, first page, final page, correct final entry',
  'jlpt-kanji:N2: complete count, first page, final page, correct final entry',
  'jlpt-kanji:N1: complete count, first page, final page, correct final entry',
  'jlpt-kanji:unknown: complete count, first page, final page, correct final entry',
  'kanken:10級: complete count, first page, final page, correct final entry',
  'kanken:9級: complete count, first page, final page, correct final entry',
  'kanken:8級: complete count, first page, final page, correct final entry',
  'kanken:7級: complete count, first page, final page, correct final entry',
  'kanken:6級: complete count, first page, final page, correct final entry',
  'kanken:5級: complete count, first page, final page, correct final entry',
  'kanken:4級: complete count, first page, final page, correct final entry',
  'kanken:3級: complete count, first page, final page, correct final entry',
  'kanken:準2級: complete count, first page, final page, correct final entry',
  'kanken:2級: complete count, first page, final page, correct final entry',
  'kanken:準1級: complete count, first page, final page, correct final entry',
  'kanken:1/準1級: complete count, first page, final page, correct final entry',
  'kanken:1級: complete count, first page, final page, correct final entry',
  'kanken:配当外: complete count, first page, final page, correct final entry',
  'kanken:unknown: complete count, first page, final page, correct final entry',
  'full-corpus search agrees with engine for "悪者"',
  'full-corpus search agrees with engine for "water"',
  'full-corpus search agrees with engine for "ｺﾝﾄﾛｰﾙ"',
  'full-corpus search agrees with engine for "コントロール"',
  'full-corpus search agrees with engine for "こんとろーる"',
  'full-corpus search agrees with engine for "  "',
  'full-corpus search agrees with engine for "<img src=x onerror=alert(1)>"',
  '320px overview and N1 list have no horizontal overflow',
  '390px overview and N1 list have no horizontal overflow',
  '1280px overview and N1 list have no horizontal overflow',
]);
export const REFERENCE_DATA_PINS = Object.freeze({
  'data/share_alike/dict.json': 'a752529ab0e93d094a0eb04a89bdc2bc01f761c728590d6a485f38a256f175fd',
  // FULL-R1 (A): followed Hfix-2b's words.json fix (a1dbed8f; was the a1dbed8f^ bytes, 69d73f92…)
  // R2 E2: three reviewed word/reading gloss repairs.
  'data/share_alike/words.json': 'd21ff76508a3ed88cec9c096510feac9b5ff2df639061a3be46cb85c6fdf985b',
  'data/share_alike/kanji.json': '8ce7ad0151a2bf487bda72c384460eca908fc1bdc2a4073042b9e3db7342d2ce',
  'data/proprietary_safe/kanken.json':
    '6efa199b7caec160c95e87c260b4184694fb8e4778a4563327bf1d79741ff444',
  'data/share_alike/strokes.json':
    '435c37c0063fba4180d3cb444ef54cfa2430e71a650a4032cc481ada29627f2b',
  // FULL-R1 (A): followed FIXR's sidecar regeneration over the repaired drift-words (b10aa853;
  // was the pre-FIXR bytes, 8a5c953e…)
  // R2 E2: preserves KANJI-NEXT facts, refreshes words audit; also closes the inherited stale M1 pin.
  'data/share_alike/reference-extra.json':
    'd3ad5ee711abb3122d263c4e0d8772dc6f8ce2cb671a9865ac5d03e512138e3d',
});
export const SKIP_BROWSER_NAMES = Object.freeze([
  'dictionary tool includes its label in the accessible name',
  'JSON sidecar absent at boot',
  'lens preserves heading and all dictionary lenses',
  'typed fullwidth normalization',
  'exact canonical query',
  'explicit whitespace prefix',
  'ordinary English search remains word search',
  'numeric shorthand still opens SKIP',
  'solid switch clears third field',
  'solid subtype list and labels',
  'keyboard End chooses subtype 4',
  'Home and arrow selection',
  'click row updates code',
  'mouse wheel updates code',
  'all wheel selections align to center band',
  'radical 64 independent filter',
  'hand variant is visible',
  'explicit first page size',
  'show more without hidden result cap',
  'alternate excluded initially',
  'alternate explicitly labeled',
  'canonical before alternate',
  'Back preserves query and focus',
  'fallback opens ordinary kanji sheet',
  'ordinary kanji sheet has no visible SKIP code',
  'code-free shape door opens nested lookup',
  'nested Back returns to same fallback entry',
  'dark world and reduced motion',
  'capture confirms a complete exact-source kanji answer on durable storage',
  'saved fallback reopens from its exact snapshot when the sidecar is unavailable',
  'cold ordinary sheet does not expose SKIP codes or fetch the sidecar',
  'explicit grades preserve exact identity and one scheduled kanji',
  'complete backup preserves captured answer and review history',
  'wrong-literal imported snapshot leaves the accepted record unchanged',
  'ordinary backup import restores the exact captured answer and schedule',
  'no unexpected console or request errors through capture and backup',
  'fresh-context load failure is recoverable',
  'retry loads real index',
  'no runtime exceptions including recovery',
  'dictionary tool includes its label in the accessible name',
  'partial/wildcard 1-3',
  'partial/wildcard 1-*-8',
  'partial/wildcard *-3-8',
  'partial/wildcard skip:*',
  'invalid 4-5-5',
  'invalid 5-2-3',
  'invalid 1-3-x',
  'invalid 1-2-3-4',
  'ordinary "skip" stays outside SKIP',
  'ordinary "skip meaning" stays outside SKIP',
  'ordinary "skip 5 pages" stays outside SKIP',
  'no clipping at 320px',
  'no clipping at 390px',
  'no clipping at 1280px',
]);
/** Reviewed source-declared case names at 384d4a70, not receipt-selected expectations. */
export const MISC_CASES = Object.freeze({
  connections: [
    'library names the current room, exposes dictionary search, and starts without study debt',
    'paged/sorted collection → canonical sheet → row restores page, sort, scroll and focus',
    'word → kanji → component → family kanji walks back to the exact doors',
    'expanded compounds survive recursion with their position and focus',
    'canonical level chips open complete reference collections and return through browser Back',
    'kanji Kentei and JLPT doors return to the same canonical kanji and filtered origin',
    'sheet search → result → nested search returns in order to query, sheet and original collection',
    'empty collection search can widen to dictionary and return without losing its filter',
    'source sentence → real article → return restores sentence, word, library and focus',
    'My Study and Mock papers return to the exact collection instead of the reading shelf',
    'attested missing kanji readings display with provenance and continue into the writing room',
    'read-only source records expose attested related forms and return without enrollment',
    'language choice has group semantics and individually pressed buttons',
    'all passive recursive browsing leaves enrollment and learning evidence unchanged',
    'explicit Memorize updates shared My Study once, with no retrieval credit',
    'nested article detour restores the exact live review, taken item and source identity',
    'no uncaught application exceptions',
    '320px library, word and source-tag disclosure fit their viewport',
    '390px library, word and source-tag disclosure fit their viewport',
    '1280px library, word and source-tag disclosure fit their viewport',
  ],
  storage: [
    'read-exception-quarantine-and-global-alert',
    'empty-malformed-future-bytes-quarantine',
    'complete-valid-envelope-hydrates-only-after-validation',
    'every-known-root-and-version-shape-fails-closed',
    'reserved-map-names-round-trip-without-pollution-or-data-loss',
    'invalid-candidate-fails-the-schema-before-hydration',
    'stable-alert-node-no-repeat-announcement',
    'open-sheet-description-tracks-error-without-render',
    'alert-layout-failure-stays-isolated-and-retryable',
    'article-rejection-http-failure-and-retry',
    'scheduler-clock-clamp-and-raw-audit-truth',
    'due-queue-overdueness-order-no-debt-daily-caps-and-today-queue',
    'learner-fsrs-params-fail-closed-gate',
    'dojo-refill-second-lap-is-practice',
    'global-alert-css-is-above-every-numeric-layer',
    'zen-grade-controls-retain-sticky-safe-area-layout',
    'javascript-syntax',
    'reader-completion-is-acknowledged-double-input-safe-and-merges-latest',
    'deep-capture-context-and-promotion-cross-one-acknowledged-boundary',
    'd23-explicit-core-capture-and-its-answer-cross-one-acknowledged-boundary',
    'd23-lawful-legacy-head-src-and-a-selection-snapshot-round-trip-exactly',
    'observation-reducers-append-latest-with-no-pre-acknowledgment-publication',
    'ignored-params-note-deduplicates-pending-acknowledged-and-rejected-reasons',
    'current-commit-wrapper-refuses-unowned-stale-and-unacknowledged-results',
    'actual-scheduler-initialization-preserves-pin-and-gates-personal-weights',
    'standard-review-serves-exactly-today-queue-and-names-the-held-back',
  ],
  integrity: [
    'single-writer-preserves-both-tabs-note-intents',
    'interrupted-import-restores-old-record-and-entire-archive',
    'full-backup-restores-unreferenced-and-contextual-conversations',
    'durable-chat-and-readings-survive-save-export-and-reselection',
    'committed-import-finalizes-after-interruption-with-identical-portable-record',
    'unknown-record-during-import-quarantines-all-competing-bytes',
    'full-export-cannot-pair-owner-record-with-sibling-import',
    'blocked-idb-upgrade-fails-closed-and-does-not-leak-late-handle',
    'versionchange-revokes-record-access-without-clobbering',
    'new-backup-rejects-inconsistent-digests-counts-and-legacy-evidence',
    'foreground-observation-survives-pagehide-and-owner-reload-exactly-once',
    'history-navigation-never-reuses-writer-ownership-and-preserves-draft',
    'refused-high-id-import-preserves-subsequent-archive-appends',
    'legacy-archive-migration-preserves-opaque-metadata-and-order',
    'saturated-logical-ids-and-backwards-clocks-preserve-conversation-order',
    'interrupted-migration-activation-recovers-exact-custody-after-fencing',
    'quota-target-import-keeps-original-record-archive-and-custody',
    'abort-target-import-keeps-original-record-archive-and-custody',
    'web-lock-unsupported-fails-closed',
    'web-lock-rejected-fails-closed',
    'malformed-legacy-archive-refuses-activation-without-changing-sources',
    'future-legacy-archive-refuses-activation-without-changing-sources',
    'legacy-import-journal-before-generation-recovers-before-target-activation',
    'legacy-import-journal-after-generation-recovers-before-target-activation',
    'legacy-import-journal-unknown-generation-recovers-before-target-activation',
  ],
  binding: [
    'missing-binding-refuses-implicit-creation-without-reading-fence-or-backup',
    'explicit-creation-produces-six-distinct-local-identities-and-closed-policy',
    'reopen-keeps-exact-stored-text-and-all-identities-without-uuid-or-rewrite',
    'invalid-future-foreign-and-unknown-fields-refuse-without-overwriting',
    'backup-fence-unknown-and-inherited-options-cannot-supply-creation-authority',
    'missing-broken-non-v4-or-repeated-secure-random-refuses-before-write',
    'absent-throwing-or-async-owner-refuses-before-any-storage-read',
    'owner-loss-during-read-or-uuid-generation-cannot-create',
    'competing-creation-is-refused-without-adopting-or-replacing-its-bytes',
    'quota-and-after-write-throw-never-publish-or-pretend-to-roll-back',
    'owner-loss-or-foreign-bytes-after-write-preserve-disk-but-refuse-publication',
    'second-read-rejects-even-whitespace-only-replacement',
    'read-failures-or-invalid-storage-values-do-not-fabricate-an-empty-installation',
    'guard-after-async-work-refuses-changed-storage-or-released-owner',
  ],
  sync: [
    'snapshot strips only transport documents',
    'native snapshot returns exact canonical bounded sorted envelopes without writes',
    'native canonical envelope limits count UTF8 and retain the whole unacknowledged outbox',
    'native snapshot refuses wrong binding and ownership changes',
    'confirmed receive refreshes locally; acknowledgement does not',
    'uncertain durable result retains code and never leaks target receipt',
    'even active status cannot hide uncertain target receipt',
    'nonactive snapshots and known thrown errors stay failures',
    'wrong binding and forbidden or malformed methods never touch store',
    'UTF8 request budget rejects before store dispatch',
    'owner loss before work and after durable receive fail closed',
    'failed publication after receive preserves durable uncertainty',
    'concurrent requests are bounded and close defeats a late snapshot',
    'native scope seeds only first-install account and learner with four fresh local identities',
    'native scope cannot replace existing binding or bypass owner and creation guards',
    'malformed native scope is rejected before storage or randomness',
    'native save commits timestamp only after strict true',
    'save waits for confirmation and old owner cannot update timestamp',
    'absent native host is plain and has no enabled sync action',
    'connect and sync require separate user actions; disconnect wins a late cycle',
    'completed cycle refreshes record and reports remaining work honestly',
    'older connect completion cannot overwrite a replacement connection on the same registration',
    'late registration is unregistered after local lifecycle closes',
  ],
  personal: [
    'original collection and exported bundle validate',
    'answer enrichment binds to original text without changing assessment IDs, hashes or history',
    'bad readings, changed text, missing kanji coverage and incorrect edition bindings reject atomically',
    'answer revisions cannot downgrade or silently replace conflicting saved explanations',
    'reject malformed input, tampering, duplicate identities, unsafe sources and foreign references',
    'four modalities have stable, independent identities',
    'view and preview create no evidence; exact due time gates reviews',
    'related-card burial survives reload and expires on the Japan study day',
    'undo is append-only, replay restores the prior memory state',
    'daily new limit is shared across themes and task types',
    'old or invalid backups cannot erase events; compatible history extends',
    'invalid ratings, unknown cards, sequence gaps and backwards clocks are blocked',
    'six failures pause a card, explicit resume permits review',
    'long history is never truncated and export replay is deterministic',
    'private route and all module dependencies are packaged and precached',
  ],
  legacy: [
    'valid envelope · a real flick commits one judgment',
    'valid envelope · unknown top-level fields survive the flick',
    'malformed envelope · exact raw bytes are quarantined',
    'malformed envelope · protection hint is visible',
    'malformed envelope · failed judgment leaves the word touchable',
    'quota failure · exact raw bytes remain unchanged',
    'quota failure · save-failure hint is visible',
    'quota failure · failed judgment leaves the word touchable',
    'browser integrity · zero page and console errors',
  ],
  writing: [
    'minimal room opens asleep',
    'sleeping controls are the four corners, ensō mark and permanent bug entry',
    'the trigger names a real dormant field and reports collapsed',
    'the dormant field is absent from sight and the accessibility tree',
    'quiet entry adds one same-URL Back sentinel and preserves host state',
    'the dialog names the invisible platform Back exit',
    'the quiet 戻る sheds its English sub-caption',
    'one press wakes the allowed field without leaving the room',
    'every visible control belongs to the awake field or is its trigger',
    'the awake control field does not overlap the glyph or its numerals',
    'the seal opens the public eleven, day 墨 朱 柿 藍 赤 板 then night 漆 金 殻 浪 雷, in order',
    'the world stones form one named dialog',
    'palette rerenders do not add history entries',
    'platform Back exits directly and leaves no renderer orphan',
    'Forward reopens the same room without adding another entry',
    'readings are two properly labeled Japanese rows',
    'all on and kun readings render without two-item truncation',
    'kun okurigana is spoken naturally rather than as dictionary dots',
    'normal motion reaches living ink or its honest SVG fallback',
    'number mode is one honest pressed choice',
    'a visible live body-level number layer stays aligned with the ink stage',
    'each number and pip arises atomically with its stroke',
    'turning numbers off removes every marker immediately',
    're-enabling mid-write resets to stroke zero and restarts in sync',
    'touch-to-rewrite clears and restarts the numbered sequence',
    'the marker layer follows canonical KanjiVG in every dress state',
    'the classic write is gated to reduced motion at mount — never during pending',
    'AnimCJK reaches the renderer only through the equivalence manifest',
    'the manifest is law-consistent: 経 and 衷 rejected, the gallery hand returns broadly',
    'no stroke-room rule masks the glyph — decorative page washes may',
    'the pending dress hides the un-dashed classic ink layers',
    'the living sheet renders unmasked — never a porthole',
    'forcing the undecided dress hides the classic ink layers in place',
    'the reduced-motion still is never hidden by the pending gate',
    '衷 (count-rejected) wrote with the canonical KanjiVG hand',
    '経 (geometry-rejected: AnimCJK carries 經) wrote with the canonical hand',
    '永 (approved) takes the gallery brush when the living ink stands',
    'the engine-painted washi runs to every edge of the screen',
    'the glyph sheet stands whole on screen at the full lattice — no pre-scale, no trimming',
    'the room ground carries enough backing for the sheet to be its exact centre crop',
    'Escape sleeps an awake field before it closes the room',
    'a second Escape closes cleanly with no detached ink sheet',
    'a saved 殻 preference still loads (殻 is public again, D2)',
    'a no-stroke kanji keeps the same valid dormant trigger contract',
    'a no-stroke kanji stays glyph-only instead of leaking explanatory prose',
    'reduced motion is a coherent finished still, including all requested numbers',
    'reduced motion does not advance behind the still',
    'the writing-room walk requested no missing assets',
    'the writing-room walk emitted no console/page errors',
    'shu palette applies, persists, and keeps one live sheet',
    'hakuu palette applies, persists, and keeps one live sheet',
  ],
  'personal-browser': [
    'full paragraph with no grade before reveal',
    'abort preserves answer; committed grade and sibling burial survive reload',
    'durable undo preserves the original event',
    'answer upgrade preserves evidence; Japanese feedback, complete ruby and deliberate English reveal',
    'malformed restore, free reading, search and routes preserve evidence',
    'concurrent windows cannot overwrite or double-grade stale evidence',
    'complete backup round-trips into a second device context',
    'no JavaScript exceptions or external requests',
  ],
});
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const nonempty = (value) => typeof value === 'string' && value.length > 0;
const exact = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length > 0 &&
  a.length === b.length &&
  new Set(a).size === a.length &&
  new Set(b).size === b.length &&
  a.every((x) => b.includes(x));
const engines = (engine) => (engine === 'all' ? ['chromium', 'webkit'] : [engine || 'chromium']);
const canonicalPath = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
};
const sameSite = (a, b) => nonempty(a) && nonempty(b) && canonicalPath(a) === canonicalPath(b);
const sameRun = (report, context) => nonempty(context.runId) && report?.runId === context.runId;
export const SKIP_STANDALONE_CHECKS = Object.freeze([
  'embedded-shelf-art',
  'inlined-editorial-shelf-layout',
  'lookup-words-read-as-prose',
  'english-chrome',
  'dictionary-door-behind-study-tools',
  'skip-grid-wheels-and-filters',
  'no-skip-or-editorial-requests',
  'no-personal-deck-row',
  'personal-route-falls-back-to-shelf',
  'no-personal-requests',
  'no-page-errors',
]);
const runtime = (context, path) =>
  Array.isArray(context.runtimeFiles)
    ? context.runtimeFiles.find((r) => r.path === path)?.sha256
    : context.runtimeFiles?.[path];
export const miscReportNarrowingEnvironment = Object.freeze([
  'KAIRO_TUTOR_VIEWPORT',
  'KAIRO_RECORD_SOURCE',
  'KOTOBA_ONLY',
  'FOUNDATION_ONLY',
  'EXPERIENCE_ONLY',
]);
function named({
  producer,
  path,
  roster,
  sourceOnly = false,
  direct = false,
  rowKey = 'results',
  passKey = 'pass',
  rowId = (row) => row.name,
  expectedCases = () => roster,
  extra = () => {},
}) {
  return {
    producer,
    paths: [path],
    sourceOnly,
    expectedCases,
    validate(report, context = {}) {
      const errors = [],
        require = (ok, why) => {
          if (!ok) errors.push(why);
        },
        expected = expectedCases(context.engine),
        rows = report[rowKey];
      require(Array.isArray(rows), 'Missing producer rows');
      const observed = (Array.isArray(rows) ? rows : []).map(rowId);
      require(exact(expected, observed), 'Missing/duplicate/extra/wrong-engine case');
      require(!(context.args || context.argv || []).some((a) =>
        /^--(?:case|only|boundary-only)(?:=|$)/u.test(a),
      ), 'Filtered invocation');
      for (const key of miscReportNarrowingEnvironment)
        require(!Object.hasOwn(
          context.env || context.environment || {},
          key,
        ), `Narrowing input ${key}`);
      if (sourceOnly)
        require(context.sourceVerifiedBeforeAndAfter === true, 'Unverified source-only execution');
      else if (direct)
        require(sha(context.artifactSha256) &&
          report.artifactSha256 === context.artifactSha256 &&
          sha(report.verifierSha256) &&
          report.verifierSha256 === context.verifierSha256, 'Wrong artifact/producer identity');
      else
        require(context.artifactVerifiedBeforeAndAfter === true &&
          sha(context.artifactSha256) &&
          nonempty(context.site) &&
          (!report.site ||
            sameSite(
              report.site,
              context.site,
            )), 'Legacy report needs pinned site before/after execution');
      for (const row of rows || [])
        if (typeof row === 'object') {
          require(row?.[passKey] === true &&
            !row?.error &&
            !row?.failure &&
            !row?.message, `Case not green: ${row?.name || row?.id || 'unknown'}`);
          if ('errors' in row)
            require(Array.isArray(row.errors) && !row.errors.length, 'Case page errors');
          if ('pageErrors' in row)
            require(Array.isArray(row.pageErrors) && !row.pageErrors.length, 'Case page errors');
        }
      require(!report.error && !report.failure, 'Terminal producer failure');
      for (const key of ['failures', 'failed'])
        if (key in report)
          require(Array.isArray(report[key])
            ? report[key].length === 0
            : report[key] === 0, `${key} nonzero`);
      if ('fullAcceptance' in report)
        require(report.fullAcceptance === true, 'Producer denies acceptance');
      extra(report, context, require, rows);
      return {
        passed: errors.length === 0,
        errors,
        expectedCases: expected,
        observedCases: observed,
      };
    },
  };
}
const defs = {
  'reference-connections': named({
    producer: 'prototypes/corridor/tools/verify-reference-connections.mjs',
    path: 'connections-results.json',
    roster: MISC_CASES.connections,
    rowKey: 'checks',
    extra(report, context, require) {
      const execution = context.readReport?.('execution.json');
      require(execution?.selectedCase === null &&
        exact(['Chromium'], [execution?.browser?.engine]) &&
        nonempty(execution.browser.version) &&
        execution.excludedChecks?.length === 0 &&
        execution.externalRequests?.length ===
          0, 'Reference execution filtered, external or incomplete');
      require(sameRun(execution, context) &&
        sameSite(
          execution.site,
          context.site,
        ), 'Reference execution not bound to this attempt and site');
      require(context.engine === 'chromium', 'Reference producer is Chromium only');
    },
  }),
  'storage-integ': named({
    producer: 'prototypes/corridor/tools/verify-corridor-storage-integrity.mjs',
    path: 'storage-integrity.json',
    roster: MISC_CASES.storage,
    rowKey: 'checkNames',
    rowId: (r) => r,
    sourceOnly: true,
    extra(r, c, q) {
      q(
        r.format === 'kairo-schema-policy-verification' &&
          r.version === 2 &&
          r.status === 'PASS' &&
          r.checks === MISC_CASES.storage.length,
        'Storage policy completion invalid',
      );
      q(
        r.sourceSha256 === c.sourceSha256 &&
          sha(c.sourceSha256) &&
          r.verifierSha256 === c.verifierSha256,
        'Wrong policy source/producer',
      );
    },
  }),
  'record-integrity': named({
    producer: 'prototypes/corridor/tools/verify-record-integrity.mjs',
    path: 'receipt.json',
    roster: MISC_CASES.integrity,
    direct: true,
    extra(r, c, q) {
      q(
        c.engine === 'chromium' &&
          r.suite === 'record-integrity' &&
          nonempty(r.engineVersion) &&
          r.onlySyntheticData === true &&
          r.externalRequestsSent === 0,
        'Record integrity scope/instrumentation incomplete',
      );
      q(r.sourceHash === runtime(c, 'corridor.js'), 'Integrity runtime source mismatch');
    },
  }),
  'record-binding': named({
    producer: 'prototypes/corridor/tools/verify-record-binding.mjs',
    path: 'receipt.json',
    roster: MISC_CASES.binding,
    sourceOnly: true,
    extra(r, c, q) {
      q(
        r.format === 'kairo-local-record-binding-verification' &&
          r.v === 1 &&
          r.mode === 'controlled-storage' &&
          r.passed === MISC_CASES.binding.length,
        'Wrong record-binding mode/completion',
      );
      q(
        Array.isArray(r.sources) &&
          r.sources.length === 2 &&
          exact(
            ['verify-record-binding.mjs', 'record-binding.mjs'],
            r.sources.map((s) => s.path.split('/').at(-1)),
          ) &&
          r.sources.every((s) => sha(s.sha256) && c.sourceHashes?.[s.path] === s.sha256),
        'Record binding owned sources not independently pinned',
      );
    },
  }),
  'record-sync': named({
    producer: 'prototypes/corridor/tools/verify-record-sync.mjs',
    path: 'stdout.json',
    roster: MISC_CASES.sync,
    rowKey: 'checks',
    rowId: (r) => r,
    sourceOnly: true,
    extra(r, c, q) {
      q(
        r.pass === true && r.count === MISC_CASES.sync.length && c.engine === 'chromium',
        'Wrong/incomplete hybrid source+Chromium sync receipt',
      );
      q(
        sameRun(r, c) &&
          sha(c.sourceSha256) &&
          r.sourceSha256 === c.sourceSha256 &&
          r.browser?.engine === 'chromium' &&
          nonempty(r.browser?.version),
        'Sync receipt not bound to this attempt, source and Chromium build',
      );
    },
  }),
  'writing-room': named({
    producer: 'prototypes/corridor/tools/verify-writing-room.mjs',
    path: 'writing-room.json',
    roster: MISC_CASES.writing,
    direct: true,
    extra(r, c, q) {
      q(
        c.engine === 'chromium' &&
          r.engine === 'chromium' &&
          nonempty(r.browserVersion) &&
          r.completed === true &&
          r.runId === c.runId,
        'Writing room incomplete/wrong engine',
      );
      q(r.errors?.length === 0 && r.missingAssets?.length === 0, 'Writing room asset/page error');
    },
  }),
  'tutor-request-binding-integration': named({
    producer: 'prototypes/corridor/tools/verify-tutor-request-binding.mjs',
    path: 'receipt.json',
    direct: true,
    passKey: 'passed',
    expectedCases: (e) => engines(e).flatMap((engine) => [1440, 390].map((w) => `${engine}-${w}`)),
    extra(r, c, q, rows) {
      q(
        r.schemaVersion === 1 && r.total === rows.length && r.passed === rows.length,
        'Tutor binding completion absent',
      );
      for (const row of rows)
        q(
          row.name === `${row.engine}-${row.width}` &&
            row.externalRequests?.length === 0 &&
            row.observations?.length > 0 &&
            row.calls?.length > 0 &&
            row.calls.every((call) => call.planned),
          'Tutor synthetic provider plan/scope absent',
        );
    },
  }),
};
// The reference producer emits an array plus execution.json, not a synthetic success wrapper.
const reference = defs['reference-connections'];
const referenceValidate = reference.validate;
reference.validate = function (report, context) {
  return referenceValidate.call(this, Array.isArray(report) ? { checks: report } : report, context);
};
defs['skip-standalone'] = {
  producer: 'prototypes/corridor/tools/verify-skip-standalone.mjs',
  paths: ['skip-standalone-document-*/result.json'],
  expectedCases: () => SKIP_STANDALONE_CHECKS.map((name) => `chromium/${name}`),
  validate(r, c) {
    const expected = this.expectedCases();
    const observed = Array.isArray(r.checks) ? r.checks.map((name) => `chromium/${name}`) : [];
    const ok =
      exact(expected, observed) &&
      sameRun(r, c) &&
      sameSite(r.site, c.site) &&
      r.pass === true &&
      r.mode === 'document' &&
      r.artifactSha256 === c.artifactSha256 &&
      sha(c.artifactSha256) &&
      c.engine === 'chromium' &&
      nonempty(r.browser) &&
      r.errors?.length === 0 &&
      Array.isArray(r.requests) &&
      !r.requests.some((url) => /editorial\.css|design\/|decks\/personal/u.test(url)) &&
      r.shelfLook?.art > 0 &&
      r.shelfLook.artSource === 'blob:';
    return {
      passed: ok,
      errors: ok
        ? []
        : [
            'Incomplete/wrong standalone checks, attempt, site, mode, artifact, browser, errors or embedded art',
          ],
      expectedCases: expected,
      observedCases: observed,
    };
  },
};

const ordinalNames = (names) =>
  names.map(
    (name, index) => `${name}#${names.slice(0, index + 1).filter((n) => n === name).length}`,
  );
defs['reference-browser'] = named({
  producer: 'prototypes/corridor/tools/verify-reference.mjs',
  path: 'results.json',
  rowKey: 'checks',
  roster: REFERENCE_BROWSER_CASES,
  extra(r, c, q) {
    const execution = c.readReport?.('execution.json');
    q(
      sameRun(execution, c) && sameSite(execution?.site, c.site),
      'Reference execution not bound to this attempt and site',
    );
    q(
      c.engine === 'chromium' &&
        execution?.selectedCase === null &&
        execution.excludedChecks?.length === 0 &&
        execution.externalRequests?.length === 0 &&
        execution.browser?.engine === 'Chromium' &&
        nonempty(execution.browser?.version),
      'Reference filtered/wrong-engine/incomplete execution',
    );
    for (const [path, pin] of Object.entries(REFERENCE_DATA_PINS))
      q(runtime(c, path) === pin, `Reference data roster changed: ${path}`);
  },
});
const referenceBrowserValidate = defs['reference-browser'].validate;
defs['reference-browser'].validate = function (r, c) {
  return referenceBrowserValidate.call(this, Array.isArray(r) ? { checks: r } : r, c);
};
defs['skip-browser'] = {
  producer: 'prototypes/corridor/tools/verify-skip-ui.mjs',
  paths: ['results.json'],
  expectedCases: () => [
    ...ordinalNames(SKIP_BROWSER_NAMES),
    'review/retained-meanings-and-silent-reading',
  ],
  validate(r, c) {
    const errors = [],
      q = (ok, why) => {
        if (!ok) errors.push(why);
      },
      expected = this.expectedCases();
    q(
      c.engine === 'chromium' &&
        r.browserInfo?.engine === 'Chromium' &&
        nonempty(r.browserInfo?.version) &&
        c.artifactVerifiedBeforeAndAfter === true &&
        sha(c.artifactSha256),
      'SKIP wrong engine or unverified artifact',
    );
    q(
      Array.isArray(r.checks) &&
        r.checks.every((row) => row.pass === true) &&
        r.errors?.length === 0,
      'SKIP semantic/page error',
    );
    const reviewName =
      /^review(?: answer)? (\d+) (?:comes from retained KANJIDIC2 meanings|does not invent a spoken reading)$/u;
    const review = r.checks.filter((row) => reviewName.test(row.name)),
      other = r.checks.filter((row) => !reviewName.test(row.name));
    const count = review.length / 2,
      planned = Array.from({ length: Math.max(0, Math.min(12, Math.floor(count))) }, (_, i) => [
        `review answer ${i + 1} comes from retained KANJIDIC2 meanings`,
        `review ${i + 1} does not invent a spoken reading`,
      ]).flat();
    const complete =
      Number.isInteger(count) &&
      count > 0 &&
      count <= 12 &&
      exact(
        planned,
        review.map((row) => row.name),
      );
    q(
      complete,
      'SKIP review must reach its producer-asserted summary after 1..12 contiguous complete grade pairs',
    );
    const observed = [
      ...ordinalNames(other.map((row) => row.name)),
      ...(complete ? ['review/retained-meanings-and-silent-reading'] : []),
    ];
    q(exact(expected, observed), 'SKIP check missing/duplicate/extra');
    q(
      Array.isArray(r.deliberateAborts) &&
        Array.isArray(r.consoleErrorDetails) &&
        Array.isArray(r.failedRequests),
      'SKIP error audit absent',
    );
    // The later explicit 503/retry intentionally logs an error. Preserve all errors and let the
    // named earlier error audit adjudicate the prefix; never discard a failing check to get green.
    q(
      r.checks.some(
        (row) =>
          row.name === 'no unexpected console or request errors through capture and backup' &&
          row.pass === true,
      ) && r.checks.some((row) => row.name === 'retry loads real index' && row.pass === true),
      'SKIP deliberate abort/recovery prerequisites missing',
    );
    return { passed: !errors.length, errors, expectedCases: expected, observedCases: observed };
  },
};
export const miscReportContracts = Object.freeze(
  Object.fromEntries(
    Object.entries(defs).map(([name, contract]) => [
      name,
      Object.freeze({
        ...contract,
        validate(report, context = {}) {
          try {
            return contract.validate(report, context);
          } catch (error) {
            return {
              passed: false,
              errors: [`Missing/malformed ${name}: ${error.message}`],
              expectedCases: contract.expectedCases(context.engine),
              observedCases: [],
            };
          }
        },
      }),
    ]),
  ),
);
export function validateMiscReport(name, report, context = {}) {
  return (
    miscReportContracts[name]?.validate(report, context) || {
      passed: false,
      errors: [`Unsupported misc gate ${name}`],
      expectedCases: [],
      observedCases: [],
    }
  );
}
