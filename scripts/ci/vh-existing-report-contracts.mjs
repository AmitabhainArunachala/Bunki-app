/** VH-1 admission for existing producer reports. Case rosters are reviewed against
 * committed 384d4a70 producer definitions, never learned from observed receipts.
 * Freshness, invocation and outer attempt identity remain the release runner's job.
 */
export const EXISTING_CASES = Object.freeze({
  'teacher-context': [
    'source-save-reopen-return-memorize-review',
    'synthetic-context-history-archive-and-error-retry',
    'synthetic-pending-context-switch-keeps-draft-and-send',
    'reject-serialized-context-root-backup',
    'non-original-source-refuses-chat-but-word-tutor-remains',
  ],
  'teacher-drafts': [
    'clean-close-before-debounce-general',
    'clean-close-before-debounce-selected-context',
    'committed-topic-drafts-and-deliberate-clear-survive-browser-restart',
    'synthetic-delayed-success-preserves-newer-text-and-deliberate-empty',
    'synthetic-delayed-error-preserves-newer-text-and-deliberate-empty',
    'synthetic-pending-topic-a-reply-cannot-change-topic-b-draft',
    'synthetic-reply-consumption-and-archive-commit-atomically-old-backup-cannot-resurrect',
    'synthetic-owner-revoked-at-durable-reply-cannot-publish-or-resurrect',
    'non-original-source-refusal-keeps-draft-and-never-sends',
    'portable-backup-preserves-current-topic-text-empty-and-new-imported-topic',
    'synthetic-backup-missing-context-draft-preserved-as-unavailable',
    'synthetic-recovery-conflict-foreign-and-malformed-slots-stay-visible-and-retained',
    'synthetic-native-quota-reply-keeps-unconsumed-draft-and-archive-atomic',
    'synthetic-native-abort-reply-keeps-unconsumed-draft-and-archive-atomic',
  ],
  'sentence-drafts': [
    'ordinary-drafts-restart-export-restore-offline',
    'synthetic-delayed-response-a-b-a-and-empty',
    'synthetic-draft-quota-retains-recovery-and-other-mode',
    'synthetic-recovery-conflicts-and-unavailable-slots',
  ],
  'record-reading-position': [
    'native-pair-divergence-reordered-duplicates-missing-dependencies-choice-and-reopen',
    'native-session-and-source-version-preservation-exact-identical-provenance',
    'native-invalid-stale-and-deleted-inputs-have-no-native-write',
    'native-quota-is-atomic',
    'native-abort-is-atomic',
    'native-host-lost-acknowledgement-reopen-exact-retry',
    'native-app-owner-invalidation-after-durability-prevents-publication',
    'ui-clean-profile-original-save-and-return-preserve-learning-state',
  ],
  'record-controller': [
    'complete-custody-before-activation-and-empty-outbox',
    'partial-archive-and-forged-counts-are-refused-before-mutation',
    'pending-import-journal-refuses-capture-without-discarding-evidence',
    'future-archive-version-is-neither-read-as-v3-nor-reset',
    'complete-source-too-large-for-atomic-duplicated-custody-is-refused',
    'changed-source-before-prepare-is-not-fenced',
    'repeated-resume-prepare-and-activate-do-not-create-another-generation',
    'active-generation-survives-real-reload-with-complete-custody',
    'fresh-writer-resumes-prepared-source-after-owner-relinquishes',
    'captured-session-change-refuses-activation',
    'future-legacy-marker-without-custody-is-quarantined',
    'unknown-target-migration-version-does-not-reset-custody',
    'active-local-and-incoming-changes-use-the-transactional-port-only',
    'rogue-legacy-write-after-target-commit-reports-both-durable-result-and-quarantine',
    'future-fence-stops-the-existing-legacy-app-on-boot',
    'drift-baseline-v1-custody-excludes-separate-legacy-key-explicitly',
    'drift-real-legacy-loader-overwrites-version-only-marker',
    'drift-v2-complete-custody-matches-deployed-normalization-and-reloads',
    'drift-actual-legacy-loader-refuses-new-fence-without-changing-bytes',
    'drift-codec-rejects-unreadable-shapes-and-unknown-active-versions',
    'drift-tampered-hash-count-coverage-and-conflicting-existing-root-refused',
    'drift-source-change-before-prepare-preserves-foreign-bytes',
    'drift-source-change-after-prepare-quarantines-without-writing-fences',
    'drift-only-fence-with-durable-intent-is-recoverable',
    'drift-only-fence-without-durable-intent-is-quarantined',
    'drift-active-command-keeps-state-and-observation-in-one-transaction',
    'changed-record-after-prepare-is-quarantined',
    'changed-archive-after-prepare-is-quarantined',
    'failed-prepare-abort-keeps-legacy-authoritative',
    'failed-prepare-quota-keeps-legacy-authoritative',
    'failed-intent-resumes-from-complete-custody',
    'failed-fenced-resumes-from-complete-custody',
    'failed-active-resumes-from-complete-custody',
    'writer-lost-after-prepared-commit-requires-new-owner-recovery',
    'writer-lost-after-intent-commit-requires-new-owner-recovery',
    'writer-lost-after-active-commit-requires-new-owner-recovery',
    'drift-absent-bytes-are-distinct-and-preserved',
    'drift-empty-bytes-are-distinct-and-preserved',
    'drift-required-blocks-older-prepared-generation-without-upgrading',
    'drift-required-blocks-older-active-generation-without-upgrading',
    'drift-prepared-abort-never-leaves-partial-target-custody',
    'drift-prepared-quota-never-leaves-partial-target-custody',
    'drift-intent-abort-never-leaves-partial-target-custody',
    'drift-intent-quota-never-leaves-partial-target-custody',
    'drift-active-abort-never-leaves-partial-target-custody',
    'drift-active-quota-never-leaves-partial-target-custody',
    'drift-fenced-quota-recovers-from-separate-LS-write',
    'drift-drift-fenced-quota-recovers-from-separate-LS-write',
    'drift-foreign-write-after-fenced-quarantines-preserving-both-sources',
    'drift-foreign-write-after-drift-fenced-quarantines-preserving-both-sources',
    'drift-owner-loss-after-fenced-requires-new-owner-before-recovery',
    'drift-owner-loss-after-drift-fenced-requires-new-owner-before-recovery',
    'drift-active-quota-reports-exact-transaction-outcome',
    'drift-active-abort-reports-exact-transaction-outcome',
    'drift-active-source-drift-after-commit-reports-exact-transaction-outcome',
  ],
  'record-host': [
    'first-commit-preserves-all-unknown-roots-and-archive',
    'two-queued-observation-appends-preserve-both',
    'queued-reducers-read-latest-committed-root-and-preserve-other-roots',
    'input-is-copied-before-queue-and-published-snapshots-are-immutable',
    'proposed-roots-are-not-published-at-idb-commit-before-acknowledgement',
    'lost-writer-after-commit-preserves-receipt-without-publishing-new-ui-state',
    'lost-ack-reload-retry-does-not-rerun-reducer-or-replay-old-effects',
    'queued-old-owner-command-cannot-run-under-next-owner',
    'reused-id-with-changed-input-type-or-time-fails-without-mutation',
    'duplicate-receipt-returns-current-authority-not-an-old-historical-snapshot',
    'archive-append-preserves-order-and-stable-logical-ids-through-retry-and-export',
    'export-queues-behind-writes-and-contains-only-portable-record-and-full-archive',
    'active-restore-is-atomic-and-preserves-actor-outbox-inbox-checkpoints-and-private-custody',
    'v2-native-complete-lost-ack-reopen-exact-retry-keeps-newer-record-and-history',
    'v1-restore-over-live-journal-keeps-history-and-next-export-remains-v2',
    'v2-invalid-or-future-journal-cannot-downgrade-to-a-partial-record-restore',
    'v2-novel-source-quote-with-valid-checksums-requires-current-admission',
    'v2-existing-exact-source-quote-retains-history-without-new-outbox-or-actor-allocation',
    'controller-restore-refuses-reserved-migration-data-without-touching-custody-or-record',
    'aborted-active-restore-keeps-both-documents-and-all-receipts',
    'restore-validates-all-roots-digests-counts-and-transport-exclusions-before-mutation',
    'explicit-incomplete-backup-retains-its-warning-and-never-becomes-complete',
    'invalid-reducer-result-and-capacity-overflow-never-write-or-truncate',
    'two-host-handles-cas-refuse-stale-proposal-and-explicit-retry-keeps-both',
    'prepared-controller-refuses-normal-host-reads-writes-restore-and-backup',
    'changed-session-and-local-scope-fail-closed',
    'rogue-source-after-target-commit-retains-both-generations-and-blocks-publication',
    'unknown-host-receipt-version-is-preserved-and-refuses-replay',
    'failed-quota-rolls-back-record-archive-and-command-receipt',
    'failed-abort-rolls-back-record-archive-and-command-receipt',
  ],
  'record-app': [
    'immutable-current-preserves-own-keys-without-publishing-boot-effects',
    'queued-producers-see-latest-committed-state-and-pending-never-publishes-proposals',
    'atomic-drift-and-observation-patch-with-archive-keeps-all-other-own-roots',
    'archive-and-observation-appends-export-in-order-without-clock-based-reordering',
    'producer-errors-invalid-results-and-capacity-refuse-without-any-write',
    'independent-host-root-and-archive-change-before-dequeue-merge-without-loss',
    'same-root-value-or-presence-conflict-rejects-stale-patch-without-reexecuting-producer',
    'revision-cas-after-reduction-refuses-without-retry-or-silent-overwrite',
    'question-producer-sees-fresh-received-result-before-any-ui-publication',
    'question-source-only-receive-between-snapshots-refuses-without-target-write',
    'question-unchanged-snapshot-commits-once-with-the-pinned-revision',
    'question-duplicate-target-receipt-preserves-one-write-without-publication-replay',
    'question-lost-acknowledgement-reload-recovers-one-write-without-producer-replay',
    'real-quota-abort-keeps-target-and-proposal-unpublished',
    'lost-acknowledgement-reload-recovers-one-durable-change-without-ui-replay',
    'actual-duplicate-target-receipt-never-replays-publication-callback',
    'writer-loss-between-host-confirmation-and-app-publication-keeps-durable-receipt',
    'queued-old-owner-producer-never-runs-after-first-durable-commit-loses-writer',
    'publication-exception-retains-committed-receipt-and-does-not-retry',
    'large-durable-record-publication-failure-returns-one-bounded-recovery-snapshot',
    'async-publication-is-explicitly-refused-with-durable-receipt-and-no-unhandled-rejection',
    'restore-matches-preview-and-allows-the-correctly-advanced-confirmation',
    'restore-superseded-by-an-earlier-queued-write-is-rejected-before-replacement',
    'restore-checks-other-host-revision-at-actual-dequeue',
    'restore-cas-refuses-external-revision-between-read-and-commit',
    'v2-lost-ack-reopen-preserves-complete-backup-without-publication-replay',
    'v2-exact-target-retry-never-replays-app-publication',
    'restore-requires-valid-preview-and-full-backup-without-dropping-recovery-evidence',
    'inactive-controller-never-runs-producer-or-returns-an-active-backup',
    'close-cancels-queued-producers-but-retains-in-flight-durable-outcome',
    'v2-preview-cas-denies-receive-at-dequeue-without-record-or-journal-loss',
    'v2-preview-cas-denies-receive-at-commit-without-record-or-journal-loss',
  ],
  'record-binding-browser': [
    'real-web-lock-and-localstorage-reload-keep-identities-and-open-compatible-idb',
    'second-tab-without-held-lock-cannot-read-or-create-and-then-reopens-same-binding',
    'lock-release-after-async-work-blocks-final-publication-with-bytes-retained',
    'uncooperative-tab-replacement-is-detected-before-publish-without-localstorage-cas-claim',
  ],
  'record-controller-chromium-extra': [
    'drift-renderer-crash-after-prepared-resumes-exact-custody',
    'drift-renderer-crash-after-intent-resumes-exact-custody',
    'drift-renderer-crash-after-fenced-resumes-exact-custody',
    'drift-renderer-crash-after-drift-fenced-resumes-exact-custody',
    'drift-renderer-crash-after-active-resumes-exact-custody',
    'renderer-crash-after-prepared-recovers-without-dualwrite',
    'renderer-crash-after-intent-recovers-without-dualwrite',
    'renderer-crash-after-fenced-recovers-without-dualwrite',
    'renderer-crash-after-active-recovers-without-dualwrite',
  ],
  'record-host-chromium-extra': ['renderer-crash-after-atomic-command-reopens-as-exact-duplicate'],
});
const nonempty = (value) => typeof value === 'string' && value.length > 0;
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const exact = (expected, observed) =>
  expected.length > 0 &&
  expected.length === observed.length &&
  new Set(expected).size === expected.length &&
  new Set(observed).size === observed.length &&
  expected.every((id) => observed.includes(id));
const engineList = (engine) => (engine === 'all' ? ['chromium', 'webkit'] : [engine || 'chromium']);
const rowsFor = (names, engine, widths) =>
  engineList(engine).flatMap((e) =>
    widths
      ? widths.flatMap((width) => names.map((name) => `${e}/${width}/${name}`))
      : names.map((name) => `${e}/${name}`),
  );
const runtimeDigest = (context, path) =>
  Array.isArray(context.runtimeFiles)
    ? context.runtimeFiles.find((file) => file.path === path)?.sha256
    : context.runtimeFiles?.[path];
function contract({
  producer,
  paths = ['receipt.json'],
  names,
  widths,
  status = 'passed',
  mode,
  identity = true,
  rowName = (row) => row.name,
  singleEngine = false,
  caseEngine,
  expected,
  requireRowErrors = false,
  requireEgress = false,
  requireObservations = false,
  versions = singleEngine ? 'single' : 'row',
  reportEngines = versions === 'report',
  extra = () => {},
}) {
  const expectedCases = expected || ((engine) => rowsFor(names, engine, widths));
  return Object.freeze({
    producer: `prototypes/corridor/tools/verify-${producer}.mjs`,
    paths,
    expectedCases,
    validate(report, context = {}) {
      const errors = [],
        require = (ok, message) => {
          if (!ok) errors.push(message);
        };
      if (!report || typeof report !== 'object' || Array.isArray(report))
        return {
          passed: false,
          errors: ['Report is not an object'],
          expectedCases: expectedCases(context.engine),
          observedCases: [],
        };
      const engines = engineList(context.engine),
        rows = Array.isArray(report.results) ? report.results : [];
      require(engines.every((engine) =>
        ['chromium', 'webkit'].includes(engine),
      ), 'Invalid required engine');
      if (mode) require(report.mode === mode, `Required mode ${mode}; observed ${report.mode}`);
      for (const key of [
        'pass',
        'fullAcceptance',
        'verifierUnchangedDuringRun',
        'artifactAndVerifierUnchangedDuringRun',
        'artifactVerifierAndHelpersUnchangedDuringRun',
        'allContextsClosed',
      ])
        if (key in report) require(report[key] === true, `${key} is not true`);
      for (const key of ['failed', 'failures'])
        if (key in report) require(report[key] === 0, `${key} is nonzero`);
      for (const key of [
        'error',
        'integrityError',
        'expectedSourceLoss',
        'expectedApprovalMissing',
        'priorRoot',
      ])
        if (key in report) require(!report[key], `${key} changes or invalidates acceptance scope`);
      if (identity) {
        require(sha(report.artifactSha256), 'Missing artifact digest');
        require(sha(context.artifactSha256) &&
          report.artifactSha256 === context.artifactSha256, 'Wrong or unbound artifact digest');
        require(sha(report.verifierSha256), 'Missing verifier digest');
        require(sha(context.verifierSha256) &&
          report.verifierSha256 === context.verifierSha256, 'Wrong or unbound verifier digest');
      }
      for (const key of ['errors', 'externalRequests'])
        if (key in report)
          require(Array.isArray(report[key]) &&
            report[key].length === 0, `${key} is nonempty or malformed`);
      if (singleEngine || versions === 'single')
        require(engines.length === 1 &&
          report.engine === engines[0] &&
          nonempty(report.browserVersion), 'Wrong/missing actual engine or browser version');
      if (reportEngines || 'engines' in report)
        require(Array.isArray(report.engines) &&
          exact(
            engines,
            report.engines,
          ), 'Declared engines absent or differ from required engines');
      if (versions === 'report' || 'browserVersions' in report)
        for (const engine of engines)
          require(nonempty(report.browserVersions?.[engine]), `No observed ${engine} version`);
      const observed = rows.map((row) => {
        const engine = caseEngine
          ? caseEngine(report, row)
          : singleEngine
            ? report.engine
            : row.engine;
        return `${engine}/${widths ? `${row.width}/` : ''}${rowName(row)}`;
      });
      const expectedIds = expectedCases(context.engine);
      require(exact(
        expectedIds,
        observed,
      ), 'Missing, duplicate, extra or filtered case/engine/viewport roster');
      for (const row of rows) {
        const label = row.name || row.control || `${row.engine}/${row.width}`;
        require(status === 'status'
          ? row.status === 'passed'
          : row[status] === true, `${label}: incomplete or failed result`);
        require(!row.error && !row.failure, `${label}: error/failure retained`);
        if (requireRowErrors || 'errors' in row)
          require(Array.isArray(row.errors) &&
            !row.errors.length, `${label}: page errors absent/nonempty`);
        if ((requireEgress && !row.control) || 'externalRequests' in row)
          require(Array.isArray(row.externalRequests) &&
            !row.externalRequests.length, `${label}: external-request evidence absent/nonempty`);
        if (requireObservations && !row.control)
          require(Array.isArray(row.observations) &&
            row.observations.length > 0, `${label}: no completed journey observations`);
        if (versions === 'row' || 'browserVersion' in row)
          require(nonempty(row.browserVersion), `${label}: missing actual browser version`);
        if ('transport' in row) {
          require(row.transport &&
            Array.isArray(row.transport.blocked) &&
            !row.transport.blocked.length, `${label}: unexpected provider request`);
          require(row.transport?.externalRequestsSent === 0, `${label}: provider egress not zero`);
        }
      }
      extra(report, context, require, rows);
      return {
        passed: errors.length === 0,
        errors,
        expectedCases: expectedIds,
        observedCases: observed,
      };
    },
  });
}
const named = (producer, names, options = {}) => contract({ producer, names, ...options });
const TEACHER_DRAFT_KEYS = ['consumed', 'contextRef', 'revision', 'text'];
const TEACHER_DELAYED_COMMON = [
  'name',
  'label',
  'providerStatus',
  'submitted',
  'current',
  'outboundXid',
  'outboundReplies',
  'editorAfterOutcome',
  'draftAfterOutcome',
  'editorAfterRestart',
  'draftAfterRestart',
];
export const TEACHER_DELAYED_OBSERVATIONS = Object.freeze({
  'synthetic-delayed-success-preserves-newer-text-and-deliberate-empty': Object.freeze({
    name: 'delayed-success-keeps-current-draft',
    providerStatus: 200,
    keys: Object.freeze([...TEACHER_DELAYED_COMMON, 'reply']),
  }),
  'synthetic-delayed-error-preserves-newer-text-and-deliberate-empty': Object.freeze({
    name: 'delayed-error-keeps-current-draft',
    providerStatus: 503,
    keys: Object.freeze([...TEACHER_DELAYED_COMMON, 'failureLines']),
  }),
});
const generalDraft = (draft) =>
  !!draft &&
  typeof draft === 'object' &&
  !Array.isArray(draft) &&
  exact(TEACHER_DRAFT_KEYS, Object.keys(draft)) &&
  draft.consumed === false &&
  draft.contextRef === null &&
  typeof draft.revision === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(draft.revision) &&
  typeof draft.text === 'string';
const sameDraft = (a, b) => TEACHER_DRAFT_KEYS.every((key) => a?.[key] === b?.[key]);
export function teacherDelayedObservationErrors(name, observations) {
  const spec = Object.hasOwn(TEACHER_DELAYED_OBSERVATIONS, name)
    ? TEACHER_DELAYED_OBSERVATIONS[name]
    : null;
  if (!spec) return [`${name}: no reviewed delayed-outcome observation contract`];
  if (!Array.isArray(observations) || observations.length !== 2)
    return [`${name}: exactly the newer and deliberate-empty completed observations are required`];
  const errors = [];
  ['newer', 'empty'].forEach((label, index) => {
    const observed = observations[index],
      at = `${name}/${label}`;
    if (
      !observed ||
      typeof observed !== 'object' ||
      Array.isArray(observed) ||
      !exact(spec.keys, Object.keys(observed))
    ) {
      errors.push(`${at}: observation absent or not the pinned shape`);
      return;
    }
    if (
      observed.name !== spec.name ||
      observed.label !== label ||
      observed.providerStatus !== spec.providerStatus
    )
      errors.push(`${at}: wrong observation identity or provider outcome`);
    if (!generalDraft(observed.submitted) || observed.submitted.text.trim() === '')
      errors.push(`${at}: durable submitted draft absent`);
    if (
      !generalDraft(observed.current) ||
      observed.current.revision === observed.submitted?.revision
    )
      errors.push(`${at}: newer authored draft revision absent`);
    if (
      label === 'empty'
        ? observed.current?.text !== ''
        : !(
            typeof observed.current?.text === 'string' &&
            observed.current.text.trim() !== '' &&
            observed.current.text !== observed.submitted?.text
          )
    )
      errors.push(`${at}: current draft is not the ${label} text`);
    if (!nonempty(observed.outboundXid)) errors.push(`${at}: durable outbound turn absent`);
    if (
      observed.editorAfterOutcome !== observed.current?.text ||
      !generalDraft(observed.draftAfterOutcome) ||
      !sameDraft(observed.draftAfterOutcome, observed.current)
    )
      errors.push(`${at}: delayed outcome changed the visible or durable current draft`);
    if (
      observed.editorAfterRestart !== observed.current?.text ||
      !generalDraft(observed.draftAfterRestart) ||
      !sameDraft(observed.draftAfterRestart, observed.current)
    )
      errors.push(`${at}: current draft did not survive the browser restart`);
    const replies = Array.isArray(observed.outboundReplies) ? observed.outboundReplies : null;
    if (
      spec.providerStatus === 200
        ? !(nonempty(observed.reply) && replies?.length === 1 && replies[0] === observed.reply)
        : !(
            replies?.length === 0 &&
            Number.isInteger(observed.failureLines) &&
            observed.failureLines > 0
          )
    )
      errors.push(`${at}: delayed provider outcome was not durably observed`);
  });
  return errors;
}
const viewport = (producer, options = {}) =>
  contract({
    producer,
    names: ['journey'],
    widths: [1440, 390],
    rowName: () => 'journey',
    requireRowErrors: true,
    requireEgress: true,
    requireObservations: true,
    ...options,
  });
const definitions = {
  'teacher-context-integration': contract({
    producer: 'teacher-context',
    paths: ['latest.json'],
    names: EXISTING_CASES['teacher-context'],
    status: 'status',
    caseEngine: () => 'chromium',
    versions: 'extra',
    extra(report, context, require, rows) {
      require(context.engine !== 'webkit' &&
        context.engine !== 'all', 'Teacher-context producer only launches Chromium');
      require(report.suite === 'teacher-context-integration' &&
        report.sourceDigestContract ===
          'token-boundary-array', 'Wrong teacher suite or historical source-digest contract');
      require(report.externalRequestsSent === 0, 'Teacher-context egress not zero');
      require(typeof context.readReport ===
        'function', 'Per-case teacher receipts must be read and validated');
      for (const row of rows) {
        let child;
        try {
          child = context.readReport?.(row.receipt);
        } catch (error) {
          require(false, `${row.name}: child receipt unreadable: ${error.message}`);
        }
        require(child?.name === row.name &&
          child?.status === 'passed' &&
          !child?.error &&
          nonempty(child?.browser), `${row.name}: child completion/browser missing`);
        require(Array.isArray(child?.pageErrors) &&
          !child.pageErrors.length, `${row.name}: child page errors missing/nonempty`);
        require(Array.isArray(child?.transport?.blocked) &&
          !child.transport.blocked.length &&
          child.transport.externalRequestsSent === 0, `${row.name}: child egress missing/nonzero`);
      }
    },
  }),
  'teacher-drafts-integration': named('teacher-drafts', EXISTING_CASES['teacher-drafts'], {
    status: 'pass',
    mode: 'full',
    versions: 'report',
    requireRowErrors: true,
    requireObservations: true,
    extra(report, context, require, rows) {
      require(report.suite === 'teacher-drafts', 'Wrong teacher-drafts suite');
      for (const row of rows)
        if (Object.hasOwn(TEACHER_DELAYED_OBSERVATIONS, row?.name))
          for (const error of teacherDelayedObservationErrors(row.name, row.observations))
            require(false, `${row.engine}/${error}`);
    },
  }),
  'sentence-drafts-integration': named('sentence-drafts', EXISTING_CASES['sentence-drafts'], {
    widths: [1440, 390],
    mode: 'full',
    reportEngines: true,
    requireRowErrors: true,
    requireEgress: true,
    requireObservations: true,
    extra(report, context, require) {
      require(report.suite === 'sentence-drafts' &&
        report.artifactAndVerifierUnchangedDuringRun ===
          true, 'Sentence draft suite/integrity missing');
    },
  }),
  'source-kanji-practice-integration': contract({
    producer: 'source-kanji-practice',
    names: [],
    widths: [1440, 390],
    requireRowErrors: true,
    requireEgress: true,
    requireObservations: true,
    expected: (engine) =>
      engineList(engine).flatMap((e) =>
        [
          'ordinary-n5-station-reading',
          'ordinary-n3-river-reading',
          'ordinary-n1-city-reading',
        ].map((name, index) => `${e}/${(index === 1) === (e === 'chromium') ? 1440 : 390}/${name}`),
      ),
    extra(report, context, require, rows) {
      require(report.suite === 'source-kanji-practice' &&
        report.artifactVerifierAndHelpersUnchangedDuringRun === true &&
        report.allContextsClosed === true, 'Kanji suite/integrity/context closure missing');
      require(report.stoppedAfterFirstFailure === false, 'Kanji schedule stopped');
      for (const row of rows)
        require(row.ordinaryUi === true &&
          row.syntheticFaultsInjected === false &&
          row.allContextsClosed === true &&
          Array.isArray(row.audioRequests) &&
          !row.audioRequests.length, 'Kanji ordinary/closure/audio proof incomplete');
    },
  }),
  'source-inbox-integration': viewport('source-inbox'),
  'listening-intake-integration': viewport('listening-intake'),
  'timed-transcript-integration': viewport('timed-transcript'),
  'source-learning-integration': viewport('source-learning'),
  'sentence-practice-integration': viewport('sentence-practice'),
  'sentence-feedback-integration': viewport('sentence-feedback'),
  'bundled-practice-integration': viewport('bundled-practice'),
  'bundled-listening-integration': viewport('bundled-listening', {
    rowName: (row) => row.control || 'journey',
    expected: (engine) =>
      engineList(engine).flatMap((e) => [
        `${e}/1440/journey`,
        `${e}/390/journey`,
        `${e}/1440/locked-cue-offered-control`,
        `${e}/1440/withdrawn-cue-refused-control`,
      ]),
  }),
  'bundled-listening-failures': viewport('listening-failures', { widths: [390] }),
  'later-encounters-integration': viewport('later-encounters', {
    extra(report, context, require) {
      require(report.verifierUnchangedDuringRun === true, 'Later encounter verifier changed');
    },
  }),
  'source-processing-integration': viewport('source-processing'),
  'reading-position-integration': named(
    'record-reading-position',
    EXISTING_CASES['record-reading-position'],
    {
      mode: 'full',
      status: 'pass',
      requireObservations: true,
      versions: 'report',
      extra(report, context, require) {
        require(report.suite === 'record-reading-position', 'Wrong reading-position suite');
        require(Array.isArray(report.errors) &&
          !report.errors.length &&
          Array.isArray(report.externalRequests) &&
          !report.externalRequests.length, 'Position errors/egress missing or nonzero');
      },
    },
  ),
};
for (const producer of ['record-controller', 'record-host', 'record-app'])
  for (const engine of ['chromium', 'webkit']) {
    const name =
      producer === 'record-app'
        ? `${producer}-${engine}`
        : engine === 'webkit'
          ? `${producer}-webkit`
          : producer;
    const names = [
      ...EXISTING_CASES[producer],
      ...(engine === 'chromium' ? EXISTING_CASES[`${producer}-chromium-extra`] || [] : []),
    ];
    definitions[name] = named(producer, names, {
      paths: [`${producer}-results.json`],
      status: 'status',
      singleEngine: true,
      identity: producer !== 'record-controller',
      expected: () => names.map((id) => `${engine}/${id}`),
      extra(report, context, require) {
        require(Array.isArray(report.errors) &&
          !report.errors.length &&
          Array.isArray(report.externalRequests) &&
          !report.externalRequests.length, 'Record errors/egress missing or nonzero');
        if (producer === 'record-controller') {
          require(sha(runtimeDigest(context, 'record-controller.mjs')) &&
            report.controllerSha256 ===
              runtimeDigest(
                context,
                'record-controller.mjs',
              ), 'Controller report not bound to artifact module');
          require(sha(runtimeDigest(context, 'modules/record-core.mjs')) &&
            report.coreSha256 ===
              runtimeDigest(
                context,
                'modules/record-core.mjs',
              ), 'Core report not bound to artifact module');
        }
        if (producer === 'record-app')
          require(report.verificationMode ===
            'explicit-immutable-artifact', 'Record app was not tested against explicit artifact');
      },
    });
  }
for (const engine of ['chromium', 'webkit']) {
  definitions[engine === 'chromium' ? 'record-binding-browser' : 'record-binding-webkit'] = named(
    'record-binding',
    EXISTING_CASES['record-binding-browser'],
    {
      status: 'pass',
      mode: 'browser',
      identity: false,
      versions: 'extra',
      caseEngine: (report) => report.observations?.runtime?.engine,
      expected: () => EXISTING_CASES['record-binding-browser'].map((id) => `${engine}/${id}`),
      extra(report, context, require) {
        require(report.format ===
          'kairo-local-record-binding-verification', 'Wrong binding report format');
        require(report.observations?.runtime?.engine === engine &&
          nonempty(report.observations?.runtime?.version), 'Binding actual browser missing/wrong');
        require(sha(report.observations?.artifact?.sha256) &&
          report.observations.artifact.sha256 ===
            context.artifactSha256, 'Binding report artifact mismatch');
        for (const path of ['record-binding.mjs', 'modules/record-core.mjs'])
          require(report.observations?.artifact?.verifiedEntries?.some(
            (file) =>
              file.path === path &&
              file.sha256 === runtimeDigest(context, path) &&
              sha(file.sha256),
          ), `Binding artifact module ${path} missing/mismatched`);
      },
    },
  );
}
// Independently reviewed source schedule: all eleven worlds, seventeen settled states,
// and each world's separate fresh-device demonstration. No receipt defines this roster.
// INT-VH (2026-10-19): Hfix-1B's tutor room, Guided front, Guided field map, Speak at rest
// and Speak's key page are settled states, in the producer's walk order (items 6, 7, 11).
export const CONTRAST_WORLDS = Object.freeze([
  'hokusai',
  'sumi',
  'shu',
  'akafuji',
  'iwa',
  'rokusho',
  'yoru',
  'nami',
  'keyblock',
  'hakuu',
  'kaku',
]);
export const CONTRAST_STATES = Object.freeze([
  'shelf',
  'reader',
  'slip',
  'page',
  'page-examples',
  'today',
  'learn',
  'words',
  'me',
  'settings',
  'tutor',
  'guided',
  'guided-field',
  'speak',
  'speak-key',
  'deck-front',
  'deck-back',
]);
const CONTRAST_NIGHT = new Set(['rokusho', 'yoru', 'nami', 'hakuu', 'kaku']);
export function contrastExpectedCases(engine = 'chromium') {
  return [
    'source/C7',
    ...engineList(engine).flatMap((browser) =>
      CONTRAST_WORLDS.flatMap((world) => [
        ...CONTRAST_STATES.flatMap((state) =>
          [
            'world',
            'C1',
            'C3',
            'C4',
            'C5',
            // INT-VH (2026-10-19): Hfix-1A's C8 (F-1), the fixed chrome opaque, written for every settled state with its
            // applicability explicit (measured where a bar meets the glass, vacuous where none does)
            'C8',
            ...(['slip', 'deck-front', 'deck-back'].includes(state) ? ['C2'] : []),
            ...(!CONTRAST_NIGHT.has(world) ? ['C6'] : []),
          ].map((id) => `${browser}/${world}/${state}.${id}`),
        ),
        `${browser}/${world}/shelf.C5-present`,
        `${browser}/${world}.page-errors`,
        ...[
          'reach',
          'world',
          'arrival',
          'coverage',
          'C1',
          'page-errors',
          ...(world === 'hokusai' ? ['control-kill', 'control-restore', 'control-record'] : []),
        ].map((id) => `${browser}/${world}/fresh-demo.${id}`),
      ]),
    ),
  ];
}
const completeContrast = (result) =>
  result &&
  Array.isArray(result.pairs) &&
  result.pairs.length > 0 &&
  Array.isArray(result.unresolved) &&
  result.unresolved.length === 0 &&
  result.pairs.every((pair) => {
    const threshold = pair.fontPx >= 24 || (pair.fontPx >= 18.67 && pair.weight >= 700) ? 3 : 4.5;
    return (
      pair.ok === true &&
      pair.required === threshold &&
      Number.isFinite(pair.ratio) &&
      pair.ratio >= threshold
    );
  });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Consumer-side proof is independent of the producer's callable predicate and of
// its completed/frameMs claims. In particular, the final interval cannot set the deadline.
function normalDemoArrival(arrival) {
  if (
    !arrival ||
    arrival.completed !== true ||
    arrival.name !== 'read-mini-rise' ||
    arrival.animationType !== 'CSSAnimation' ||
    arrival.missingAnimation ||
    arrival.noAnimation ||
    arrival.motionPreference !== 'no-preference' ||
    arrival.opacity !== 1 ||
    arrival.playState !== 'finished'
  )
    return false;
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const calibration = arrival.frameCalibration;
  const stamps = calibration?.timestamps;
  if (
    calibration?.method !== 'median-of-12-pre-arrival-raf-intervals' ||
    !Array.isArray(stamps) ||
    stamps.length !== 13 ||
    !stamps.every(finite) ||
    typeof arrival.documentId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      arrival.documentId,
    ) ||
    calibration.documentId !== arrival.documentId ||
    arrival.sameDocument !== true ||
    calibration.sameDocument !== true ||
    !finite(arrival.startTime) ||
    stamps.at(-1) >= arrival.startTime
  )
    return false;
  const intervals = stamps.slice(1).map((stamp, index) => stamp - stamps[index]);
  if (!intervals.every((interval) => finite(interval) && interval > 0)) return false;
  const sorted = intervals.sort((a, b) => a - b),
    allowance = (sorted[5] + sorted[6]) / 2;
  const end = Math.max(
    0,
    arrival.authoredDelay +
      arrival.authoredDuration * arrival.authoredIterations +
      arrival.authoredEndDelay,
  );
  return (
    finite(arrival.authoredDuration) &&
    arrival.authoredDuration > 0 &&
    finite(arrival.authoredDelay) &&
    finite(arrival.authoredEndDelay) &&
    finite(arrival.authoredIterations) &&
    arrival.authoredIterations > 0 &&
    finite(end) &&
    arrival.authoredEnd === end &&
    arrival.playbackRate === 1 &&
    finite(arrival.currentTime) &&
    arrival.currentTime >= end &&
    finite(arrival.observedAt) &&
    finite(arrival.rafTime) &&
    arrival.observedAt >= arrival.rafTime &&
    arrival.elapsed === arrival.rafTime - arrival.startTime &&
    arrival.elapsed >= end &&
    arrival.elapsed <= end + allowance
  );
}
export function demoArrivalVerdict(arrivals) {
  if (!Array.isArray(arrivals) || arrivals.length === 0)
    return { passed: false, errors: ['No displayed demo arrival observed'] };
  const errors = [];
  const current = arrivals.filter((arrival) => arrival?.current === true);
  if (current.length !== 1)
    errors.push(`Exactly one displayed current demo mount required; observed ${current.length}`);
  arrivals.forEach((arrival, index) => {
    if (arrival?.mountSequence !== index)
      errors.push(`Mount ${index}: missing, dropped or reordered sequence id`);
    if (arrival?.current !== true && arrival?.current !== false)
      errors.push(`Mount ${index}: displayed/retired state absent`);
    if (arrival?.superseded === true || arrival?.supersededBeforeFinish === true)
      errors.push(`Mount ${index}: superseded before its arrival finished`);
    if (
      arrival?.documentId !== arrivals[0]?.documentId ||
      !same(arrival?.frameCalibration, arrivals[0]?.frameCalibration)
    )
      errors.push(`Mount ${index}: not bound to the same document and pre-arrival calibration`);
    if (!normalDemoArrival(arrival))
      errors.push(`Mount ${index}: named arrival / calibrated deadline evidence absent or red`);
  });
  return { passed: errors.length === 0, errors };
}
for (const engine of ['chromium', 'webkit']) {
  definitions[`contrast-sweep${engine === 'webkit' ? '-webkit' : ''}`] = {
    producer: 'prototypes/corridor/tools/verify-contrast-sweep.mjs',
    paths: ['contrast-sweep.json'],
    expectedCases: () => contrastExpectedCases(engine),
    validate(report, context = {}) {
      const errors = [],
        require = (condition, message) => {
          if (!condition) errors.push(message);
        };
      const expected = contrastExpectedCases(engine);
      if (!report || typeof report !== 'object' || Array.isArray(report))
        return {
          passed: false,
          errors: ['Missing contrast report'],
          expectedCases: expected,
          observedCases: [],
        };
      const rows = Array.isArray(report.rows) ? report.rows : [],
        observed = rows.map((row) => row.id);
      require(report.schemaVersion === 2 &&
        nonempty(report.runId), 'Missing contrast schema/nonce');
      require(nonempty(context.runId) &&
        report.runId === context.runId, 'Wrong or unbound contrast attempt nonce');
      require(report.fullAcceptance === true &&
        report.selectedPassed === true &&
        report.partial === false &&
        report.requestedScope === 'full' &&
        same(report.selectors, {
          worlds: null,
          states: null,
          demoOnly: false,
        }), 'Contrast receipt is filtered, diagnostic or incomplete');
      require(report.freshDemoMotion === 'no-preference' &&
        report.settledMotion === 'reduce', 'Wrong contrast motion contract');
      require(sha(report.artifactSha256) &&
        report.artifactSha256 === context.artifactSha256, 'Wrong or unbound contrast artifact');
      require(sha(report.verifierSha256) &&
        report.verifierSha256 === context.verifierSha256, 'Wrong or unbound contrast verifier');
      require(report.engines &&
        exact([engine], Object.keys(report.engines)) &&
        nonempty(report.engines[engine]) &&
        context.engine === engine, 'Wrong contrast engine scope');
      require(exact(CONTRAST_WORLDS, report.worlds || []) &&
        exact(
          [...CONTRAST_STATES, 'fresh-demo'],
          report.states || [],
        ), 'Wrong contrast world/state scope');
      require(exact(expected, observed) &&
        exact(expected, report.expectedCases || []) &&
        exact(
          observed,
          report.observedCases || [],
        ), 'Missing/duplicate/extra contrast assertion roster');
      require(rows.every((row) => row.ok === true) &&
        !report.error, 'Contrast row failed or producer error retained');
      require(Array.isArray(report.source) &&
        report.source.length > 0 &&
        report.source.every((row) => row.ok === true), 'Contrast source audit absent/red');
      const scenes = Array.isArray(report.results) ? report.results : [];
      const sceneIds = CONTRAST_WORLDS.flatMap((world) =>
        [...CONTRAST_STATES, 'fresh-demo.settled'].map((state) => `${engine}/${world}/${state}`),
      );
      require(exact(
        sceneIds,
        scenes.map((scene) => `${scene.engine}/${scene.world}/${scene.state}`),
      ), 'Contrast scene receipt roster incomplete');
      for (const world of CONTRAST_WORLDS) {
        const demo = scenes.find(
          (scene) =>
            scene.engine === engine &&
            scene.world === world &&
            scene.state === 'fresh-demo.settled',
        );
        require(completeContrast(demo) &&
          demo.pairs.some((pair) => pair.demoBandLabel && pair.text === 'Kanji') &&
          demo.pairs.some(
            (pair) =>
              pair.text ===
                rows.find((row) => row.id === `${engine}/${world}/fresh-demo.reach`)?.observed &&
              pair.sel.includes('mini-word'),
          ), `${world}: no passing actual demo headword/label contrast`);
        const arrivals = demoArrivalVerdict(
          rows.find((row) => row.id === `${engine}/${world}/fresh-demo.arrival`)?.observed,
        );
        require(arrivals.passed, `${world}: every displayed named arrival must meet its own calibrated deadline: ${arrivals.errors.join('; ')}`);
      }
      const controls = Array.isArray(report.controls) ? report.controls : [];
      require(controls.length === 1 &&
        controls[0]?.engine === engine &&
        controls[0]?.id === 'same-ink-background', 'Contrast DOM control roster incomplete');
      for (const control of controls) {
        require(same(
          control.candidate,
          scenes.find(
            (scene) =>
              scene.engine === engine &&
              scene.world === 'hokusai' &&
              scene.state === 'fresh-demo.settled',
          ),
        ), 'Contrast control is detached from the actual candidate measurement');
        require(completeContrast(control.candidate) &&
          !completeContrast(control.mutant) &&
          completeContrast(control.restored) &&
          control.mutant?.pairs?.some(
            (pair) =>
              pair.demoBandLabel &&
              pair.text === 'Kanji' &&
              pair.ok === false &&
              pair.ratio < pair.required,
          ), 'Contrast control failed to kill the actual label');
        require(same(control.candidate?.pairs, control.restored?.pairs) &&
          control.styleBefore !== undefined &&
          control.styleBefore ===
            control.styleAfter, 'Contrast control did not restore exact style/result');
        require(control.recordBefore &&
          same(
            control.recordBefore,
            control.recordAfter,
          ), 'Contrast control changed native record');
      }
      return {
        passed: errors.length === 0,
        errors,
        expectedCases: expected,
        observedCases: observed,
      };
    },
  };
}
export const existingReportContracts = Object.freeze(definitions);
export function validateExistingReport(gateName, report, context = {}) {
  const selected = existingReportContracts[gateName];
  return selected
    ? selected.validate(report, context)
    : {
        passed: false,
        errors: [`Unsupported existing report producer ${gateName}`],
        expectedCases: [],
        observedCases: [],
      };
}
export const existingReportNarrowingEnvironment = Object.freeze([
  'SWEEP_WORLDS',
  'SWEEP_STATES',
  // INT-VH (2026-10-19): Hfix-1A's contrast negative control (translucent-bar) is a diagnostic selector
  'SWEEP_NEGATIVE',
  'KAIRO_SOURCE_VIEWPORT',
  'KAIRO_LISTENING_VIEWPORT',
  'KAIRO_TRANSCRIPT_VIEWPORT',
  'KAIRO_SENTENCE_VIEWPORT',
  'KAIRO_SENTENCE_FEEDBACK_VIEWPORT',
  'KAIRO_SENTENCE_DRAFT_VIEWPORT',
  'KAIRO_BUNDLED_PRACTICE_VIEWPORT',
  'KAIRO_BUNDLED_LISTENING_VIEWPORT',
  'KAIRO_KANJI_VIEWPORT',
  'KAIRO_LATER_VIEWPORT',
  'KAIRO_LATER_PRIOR_ROOT',
  'KAIRO_LATER_PRIOR_ORIGIN',
  'KAIRO_EXPECT_SOURCE_LOSS',
  'KAIRO_EXPECT_APPROVAL_MISSING',
]);
