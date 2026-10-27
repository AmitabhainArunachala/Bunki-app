/** VH-1: reviewed producer rosters at 384d4a70; expected names are independent of report contents. */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
// English expectations are independent literals in the source fixture, not the producer's report.
export function validateReaderEnglishEvidence(
  value,
  { root, sources, usage, artifactSha256, engine, articleIds },
) {
  const demand = (ok, message) => {
    if (!ok) throw new Error(`Reader English admission: ${message}`);
  };
  const equal = isDeepStrictEqual;
  demand(root, 'missing source root');
  const names = {
    helper: 'reader-english-rung.mjs',
    expectations: 'reader-english-rung-expectations.json',
    controls: 'reader-english-rung-controls.mjs',
  };
  const pins = Object.fromEntries(
    Object.entries(names).map(([key, path]) => [
      key,
      createHash('sha256')
        .update(readFileSync(join(root, 'prototypes/corridor/tools', path)))
        .digest('hex'),
    ]),
  );
  demand(equal(sources, pins), 'expected source pins missing/stale');
  demand(
    value?.schemaVersion === 1 && equal(value.sources, pins),
    'reported source pins missing/stale',
  );
  demand(value.failure == null, 'failed occurrence retained');
  demand(
    /^[a-f0-9]{64}$/u.test(artifactSha256 || '') && ['chromium', 'webkit'].includes(engine),
    'artifact/engine absent',
  );
  const fixture = JSON.parse(
    readFileSync(join(root, 'prototypes/corridor/tools', names.expectations), 'utf8'),
  );
  const entries = fixture.entries.filter((row) => row.usage === usage);
  demand(entries.length === (usage === 'native' ? 30 : 1), 'fixture roster changed');
  if (usage === 'native')
    demand(
      equal([...entries.map((row) => row.id)].sort(), [...(articleIds || [])].sort()),
      'native article roster differs',
    );
  const wanted = entries.flatMap((row) =>
    (usage === 'playback' ? [320, 390] : [390]).map((width) => ({ row, width })),
  );
  demand(
    Array.isArray(value.observations) && value.observations.length === wanted.length,
    'missing/duplicate observation',
  );
  const validObservation = (row, expected, width) => {
    demand(
      equal(
        [row?.articleId, row?.occurrenceIndex, row?.surface, row?.lemma, row?.viewportWidth],
        [expected.id, expected.occurrenceIndex, expected.surface, expected.lemma, width],
      ),
      'occurrence identity/width',
    );
    demand(
      equal(row.readingSegments, expected.readingSegments) && row.english === expected.english,
      'literal reading/English differs',
    );
    demand(
      row.connected === true &&
        row.sameOriginalElement === true &&
        row.readingVisible === true &&
        row.englishVisible === true,
      'hidden/replaced occurrence',
    );
    demand(
      row.rung === 'gloss' &&
        row.hasEn === true &&
        row.depthAside === 'meaning' &&
        row.englishCount === 1,
      'meaning rung markers absent',
    );
    demand(
      row.stageSeen === false && row.sheetSeen === false && equal(row.hazards, []),
      'stage/sheet/identity hazard',
    );
    demand(
      row.armedBeforeTrigger === true &&
        row.actionSettled === true &&
        row.selectionAttempts === 1 &&
        row.totalDeadlineMs === 5000 &&
        Number.isFinite(row.elapsedMs) &&
        row.elapsedMs >= 0 &&
        row.elapsedMs < 5000,
      'deadline/arming/fallback evidence',
    );
  };
  wanted.forEach(({ row, width }, index) =>
    validObservation(value.observations[index], row, width),
  );
  // Literal control roster is independent of producer/control-module exports.
  const controls = [
    ['delayed-valid', 'accepted'],
    ['never-paints', 'deadline'],
    ['wrong-reading', 'wrong-reading'],
    ['wrong-English', 'wrong-English'],
    ['hidden-correct', 'deadline'],
    ['transparent-ink', 'deadline'],
    ['filter-hidden', 'deadline'],
    ['hidden-reading', 'deadline'],
    ['detach', 'detached-or-replaced'],
    ['replace', 'detached-or-replaced'],
    ['transient-stage', 'premature-stage-or-sheet'],
    ['transient-sheet', 'premature-stage-or-sheet'],
    ['wrong-identity', 'wrong-identity'],
    ['visible-kana', 'accepted'],
    ['hidden-kana', 'deadline'],
    ['transparent-kana', 'deadline'],
    ['same-token-cover', 'deadline'],
    ['pointer-none-English', 'accepted'],
    ['wrong-text-replace-restore', 'wrong-identity'],
    ['same-text-repaint', 'accepted'],
    ['same-text-word-repaint', 'accepted'],
    ['repaint-then-wrong-descendant', 'wrong-identity'],
    ['detached-intermediate-ruby', 'wrong-identity'],
    ['opaque-black', 'accepted'],
    ['zero-blue', 'accepted'],
    ['rgba-alpha-zero', 'deadline'],
    ['slash-alpha-zero', 'deadline'],
    ['no-fallback', 'wrong-English'],
    ['same-deadline', 'deadline'],
  ];
  for (const [kind, rows] of [
    ['pure', value.pureControls],
    ['browser', value.browserControls?.results],
  ]) {
    demand(
      Array.isArray(rows) && rows.length === controls.length,
      `${kind} controls absent/partial`,
    );
    controls.forEach(([id, expected], i) => {
      const row = rows[i];
      demand(
        row.id === id &&
          row.expected === expected &&
          row.observed === expected &&
          row.passed === true &&
          row.triggerCount === 1,
        `${kind} control ${id} not killed as intended`,
      );
      demand(
        Number.isFinite(row.elapsedMs) && row.elapsedMs >= 0 && row.elapsedMs < 6000,
        `${kind} control ${id} reset the deadline`,
      );
      if (kind === 'pure') demand(row.closed === true, 'pure monitor not closed');
      if (expected === 'deadline') demand(row.elapsedMs >= 5000, 'deadline rejected early');
      if (id === 'delayed-valid') demand(row.elapsedMs >= 350, 'positive control was not delayed');
      if (expected === 'accepted') {
        if (kind === 'browser')
          validObservation(
            row.observation,
            {
              id: 'oracle-control',
              occurrenceIndex: 0,
              surface: id === 'visible-kana' ? 'これ' : '高い',
              lemma: id === 'visible-kana' ? 'これ' : '高い',
              readingSegments: id === 'visible-kana' ? [] : ['たか'],
              english: id === 'visible-kana' ? 'this' : 'high',
            },
            390,
          );
      }
    });
  }
  const native = value.browserControls;
  demand(
    native.artifactSha256 === artifactSha256 &&
      native.engine === engine &&
      typeof native.browserVersion === 'string' &&
      native.browserVersion.length > 0 &&
      equal(native.sources, pins),
    'browser controls belong to another artifact/engine/source',
  );
  demand(
    native.method ===
      'isolated real DOM oracle controls at admitted artifact origin; not product journey evidence',
    'native control method absent',
  );
  return true;
}

export const MEDIA_CASES = Object.freeze({
  'guided-journey': [
    'D1 the study hall lists the guided session as a door',
    'D2 the JLPT room offers the guided session beside its chooser',
    'D3 the JLPT door opens the room in one tap',
    'D4 戻る from the room front returns to the JLPT room',
    'D5 the study hall door opens the room in one tap',
    'J1 arrival names the set and its size',
    // INT-VH (2026-10-19): Hfix-1B (item 5, H-hokusai-05 and kin; item 11) — plain doors, the tutor's only with a tutor
    "J1b the room's doors read Map · Revisit · Sources (no internal name, no tutor's door while no tutor is set up)",
    'J1c with a tutor set up the doors read Map · Revisit · Tutor · Sources',
    'J2 the first question opens',
    'J3 the chrome recedes during the attempt (T8)',
    'M1 a wrong answer launches the samurai',
    'M2 the verdict stays explicit',
    'M3 impact and paper break-up phases occur',
    'M4 the moment never changes the saved response',
    'M5 focus returns to the explanation door',
    'M6 the chosen wrong option carries the on-sheet cut',
    'M7 Escape dismisses a replay',
    'M8 Escape returns focus to the replay door',
    'J4 the explanation is the lacquer sheet',
    'J5 the target carries its reading',
    'J6 teaching words are doors',
    'J7 a word door opens the slip with the word, its reading and its meaning, Save, and the band into the entry; the room stays on the explanation',
    'J7b the same word again opens its full dictionary entry over the room, the slip gone',
    'J7c Back restores the exact teaching occurrence and stage, with focus and no extra learning event',
    'M9 the crane carries the saved word',
    'M10 the crane says what was saved',
    'M11 saving reads Saved ✓ and unfolds its lists menu inside the slip, Review checked, the keyboard on the menu',
    'S1 the saved word is recorded once, with its source',
    'S2 saving never changes a recorded answer',
    'S3 覚える reached the real deck (the 覚 count moved)',
    'S4 the word is in the app’s own review queue',
    'M11b Escape on the menu folds it and gives the keyboard back to Save',
    'J8 Escape on the slip returns focus to the exact occurrence of the word',
    'M12 a correct answer never cuts',
    'J9 a correct answer puts Next first',
    'S0c a word page over the retained room holds it: a synthetic Next, 1 and ArrowRight change neither the session nor the page',
    'S0 the app’s own entry sheet adds 支障 while the room waits underneath',
    'S0b the word’s slip reads that card as already saved: Saved ✓, live, its lists menu one press away',
    'J10 an explanation before answering marks the answer assisted',
    'J11 a branch opens as its own sheet',
    'J12 戻る closes the branch and returns to the explanation',
    'J13 focus returns to the branch door it left',
    'J14 after six questions the summary gathers them',
    'J15 Learn gathers the missed and flagged questions',
    'S5 each enrolable target was added to the deck',
    'S6 a pattern Bunki has no card for says so instead of inventing one',
    'S7 every session card is new and waiting in the app’s due queue',
    'S8 the results rows read the real deck',
    'J15b Sensei receives the sentence, the first answer and the source',
    'J15c the tutor room opens',
    'J15d 戻る from the tutor returns to the prepared question',
    'S9 Remove takes the session’s own cards out of the deck',
    'S10 Restore puts them back',
    'S11 Learn lists the saved word with its deck state',
    'J16 a fresh context opens for the chosen target',
    'M13 the rematch plays for a missed target answered right later',
    'M14 the rematch verdict is explicit',
    'M16 the learner blocks (guard) before the samurai bows',
    'M15 the original answer stays wrong in the record',
    'M17 after the fresh verdict, focus rests on the next step',
    'J17 the return field opens',
    'J18 the practised target is marked practised',
    'J19 the field reads the real deck: 5 session cards and 支障 from the sheet are ready',
    'J19b a target with no Learn row still shows the card the deck already holds',
    'J20 the sentence is kept as the learner’s own words',
    'J21 returning, the front door carries what is ready in the deck',
    'J22 reload keeps the whole session',
    'J23 reload returns to the same place in the room',
    'J24 reload keeps the saved word in Learn',
    'S12 #deck-table counts the six new cards (five from the session, 支障 from the sheet)',
    'S13 #review-start offers them for review',
    'S14 the first review card is one the session added',
    'S15 戻る from the lists page returns to the guided room',
    'X1 no horizontal overflow at any stage',
    'X2 unrelated storage is untouched',
    'X3 no page errors',
    'A11y arrival: axe finds no violation in the room',
    'A11y question: axe finds no violation in the room',
    'A11y explanation: axe finds no violation in the room',
    'A11y results: axe finds no violation in the room',
    'A11y learn: axe finds no violation in the room',
    'A11y return field: axe finds no violation in the room',
  ],
  'guided-moments': [
    // INT-VH (2026-10-19): Hfix-1B — the switches walk opens in 日本語 first (its run is the moments run)
    "J1d in 日本語 the room's doors read 地図 · 見直す · 出典 (no tutor set up)",
    'M20 dramatic is a real style',
    'M21 the demo says no result is recorded',
    'M22 Skip dismisses',
    'M23 quiet plays no samurai on a miss, only the cut on the sheet',
    'M24 quiet still plays an explicit replay, briefly',
    'M25 the off switch persists across a reload',
    'M26 with moments off, a miss plays nothing',
    'M27 the sprite sheet is the provenance-noted asset and decodes',
    'M28 the sprite’s provenance note ships beside it',
    'M29 Report a problem is reachable from the moment',
    'M30 opening a report ends the moment and lifts the glass',
    'X3 no page errors',
  ],
  'guided-reduced': [
    'M31 reduced motion suppresses the automatic samurai',
    'M32 reduced motion still shows the cut, drawn',
    'M33 an explicit replay is still available',
    'M34 the explicit replay actually animates',
    'M35 replays never stack',
    'M36 navigation takes the moment off the glass',
    'M37 under reduced motion the crane stays still: only the line',
    'X3 no page errors',
  ],
  'guided-restart': [
    'R1 a completed session is reproduced',
    'R2 watch works on a completed session',
    'R3 watching (or opening) never regrades',
    'R4 restart opens question 1, fresh and unlocked',
    'R5 the old Learn rows and draft do not leak',
    'R6 the previous session is kept exactly',
    'R7 a new wrong answer is recorded',
    'R8 reload keeps the new answer and does not restart again',
    'R9 restore brings back results, Learn and draft exactly',
    'R10 restart also clears a tentative selection',
    'R11 unrelated storage is untouched',
    'R12 the about page carries the truthful source label',
    'R13 a confirmed reset clears only this session',
    'X3 no page errors',
    'R6.1 Q1’s target carries its reading',
    'R6.1 Q1’s explanation has word doors',
    'R6.2 Q2’s target carries its reading',
    'R6.2 Q2’s explanation has word doors',
    'R6.3 Q3’s target carries its reading',
    'R6.3 Q3’s explanation has word doors',
    'R6.4 Q4’s target carries its reading',
    'R6.4 Q4’s explanation has word doors',
    'R6.5 Q5’s target carries its reading',
    'R6.5 Q5’s explanation has word doors',
    'R6.6 Q6’s target carries its reading',
    'R6.6 Q6’s explanation has word doors',
  ],
  'guided-held': [
    'H1 外す is not offered while the room is still writing its cards',
    'H2 a row the learner tried to remove mid-write is not left removed with its cards in the deck',
    'H3 a row gathered by a later FINISH is enrolled in the same pass',
    'H4 nothing is left "adding to your deck…"',
    "H5 once the deck is quiet, 外す takes exactly that row's cards out",
    'H6 unreadable saved bytes do not claim saving is unavailable',
    'H7 the unreadable bytes are kept aside exactly, and the new session saves beside them',
    "H8 a question's source status is escaped like every other set field",
    'X4 no page errors',
  ],
  'corridor-ai': [
    'the request budget mirrors packages/ai (10 s)',
    'only the article room scales its budget with the requested length (ten-minute cap)',
    'explicit device settings reach the provider seam',
    'word tutor · the exchange lands whole in the archive',
    'graded examples · the exchange lands whole in the archive',
    'the request actually used the overridden base URL and model',
    'quiz · the exchange lands whole in the archive',
    'quiz · a mid-quiz reload resumes the same written questions — not a word lost, no new request',
    'coach · the exchange lands whole in the archive',
    'reading room · the exchange lands whole in the archive',
    'reading · generating a passage leaves suggestions without creating review debt',
    'reading · a deck word is not duplicated; an unconfirmable word makes no card',
    'reading · dictionary-checked candidates persist and the 札 line stays out of the ink',
    'reading · suggestions stand as word doors under the passage',
    'one explicit reading suggestion adds only that word without inventing a recall grade',
    '札 door · new words become provenance-marked cards; known and unconfirmable do not',
    '札 door · the exchange lands whole in the archive',
    'tutor-authored surfaces do not create mining exchanges',
    'chat · the exchange lands whole in the archive',
    '42 turns later, turn 1 still stands in the archive',
    'all accepted structured chat turns survive in the learner record',
    'the log lazy-renders: recent window first, 前の会話 unfolds the rest',
    'after reload the visible history renders from the archive (> the 24 cap)',
    'chat · a never-answering provider resolves to the quiet line at ~10 s',
    'chat · no dead 考え中 remains and the door reopens',
    "chat · even the failed exchange is archived — the words, then the app's own line",
    'chat · walking away and back mid-question keeps 考え中 and the sealed 送る',
    'chat · a send while pending is refused — no duplicate lands in the archive',
    'word tutor · the stalled request takes the same failure path, door reopens',
    'word sheet · the archived tutor answer and examples read back on reopen — no new request',
    'missing IndexedDB refuses the learner write and keeps the question draft',
    'an unavailable archive preserves legacy input and sends no provider or mining request',
    'an unavailable archive refuses a complete-looking backup',
    'the mining exchange itself is archived whole under surface mine',
    'a mined observation lands typed: [t, sensei, key, polarity, code, ref]',
    'a confusion edge lands typed: [t, confuse, key, otherKey]',
    'an unconfirmable subject and an unknown code write NOTHING — fail closed',
    'a subject without a clear word/kanji type writes NOTHING — no default type',
    'the envelope validator accepts the mined kinds across a reload — no quarantine',
    'the staged mining eligibility declaration admits only learner chat',
    'every observation names its exact exchange — distinct refs, each resolving in the archive',
    'the staged mining code awaits all exchange append acknowledgements',
    'the complete backup carries archived turns for every observation ref',
    'a downloaded backup excludes device credentials and installation authority',
    'a legacy import replaces the archive and declares historical incompleteness',
    'the replacement fixture contains an actual archived foreign conversation',
    'after restore, every ref resolves and all historical roots and archive return while current drafts stay',
    'archive evidence rides the backup without duplication in the learner envelope',
    'the import replaces the archive in one transaction — no pre-import turn survives',
    'malformed imported evidence aborts the import — no reload, record and archive untouched',
    'a validation-rejected import leaves the device writable — the next real write lands',
    'a refused native restore preserves the complete prior record, archive, and revision',
    'reload after refused restore reopens the prior record and archive',
    'a secondary tab refuses a write and keeps its draft while the owner write stands',
    'a secondary tab may not import — both native documents stay unchanged',
    'a declared evidence loss stays declared across import, writes, and re-export',
    'an actual empty-history import clears all prior learner conversations',
    'all requests stay on the isolated origin or the in-memory synthetic provider',
    'no console or page errors across the AI walk',
  ],
  playback: [
    'the-shipped-reader-draws-no-mark-without-a-recording-and-is-silent',
    'a-withdrawn-voice-manifest-cannot-open-the-bar',
    'an-unnarrated-article-in-a-present-manifest-draws-no-mark',
    'approved-player-is-touch-sized-and-clear-of-the-word-popup-on-phones',
    'the-folded-mark-meets-no-text-in-any-world-at-any-phone-width',
    'stale-clip-events-cannot-change-a-restarted-read',
    'reader-settings-keep-the-active-recording-playing',
    'passage-switch-pauses-recording-and-ignores-late-error',
    'late-manifest-opens-listen-for-the-current-passage',
    'no-pending-mark-to-press-and-the-armed-mark-waits-for-its-own-press',
    'current-recording-failure-stops-with-a-reason-and-no-device-voice',
    'first-clip-ends-second-clip-errors-stops-with-a-reason',
    'a-failure-note-does-not-follow-to-another-article',
    'listening-again-after-a-failure-clears-the-note-and-resumes-at-that-sentence',
    'a-complete-read-returns-the-bar-to-its-start-and-writes-no-preference',
    'a-stored-interim-voice-plays-no-answer-card-and-says-why',
    'an-invalid-stored-voice-reads-as-kore',
    'pending-card-audio-is-retired-by-grade-and-undo',
    'pending-card-audio-is-retired-by-leaving-review',
    'playing-card-audio-stops-on-grade-and-late-events-leave-the-next-card-alone',
    'playing-card-audio-stops-on-leave',
    'a-late-manifest-refreshes-the-row-and-keeps-focus-and-place',
    'a-late-manifest-failure-settles-the-row-and-keeps-focus-and-place',
  ],
  'import-provider': [
    'invalid-root-preserves-record-and-archive',
    'import-cannot-redirect-existing-credential',
    'legacy-record-and-safe-future-data-roundtrip',
    'valid-parameter-file-keeps-the-learner-record',
    'quota-failure-keeps-original-record-and-archive-atomic',
    'export-excludes-legacy-provider-authority',
    'prototype-named-evidence-roundtrip',
    'explicit-custom-provider-and-origin-switch',
    'malformed-provider-settings-preserve-configuration',
    'provider-redirect-is-not-followed',
    'mismatched-device-credential-origin-fails-closed',
    'legacy-custom-credential-requires-binding',
    'legacy-default-credential-requires-binding',
    'reject-future-version',
    'reject-future-record-with-parameter-candidate',
    'reject-backup-with-parameter-candidate',
    'reject-future-version-without-taken-and-parameter-candidate',
    'reject-missing-version',
    'reject-invalid-list-item',
    'reject-invalid-observation',
    'reject-invalid-evidence',
    'reject-invalid-evidence-marker',
    'reject-oversized-file',
    'reject-excessive-node-count',
    'reject-excessive-depth',
  ],
  'type-ruby': [
    // Final integration prerequisite: approved producer cda18876 adds R4 ×4 and W1 (17 rows/engine).
    // Admission still binds report.verifierSha256 to the actual producer digest. Merge this contract with that
    // producer (or an explicitly reviewed successor); the base's old 12-row receipts are intentionally not admitted.
    'L3-one-ladder-rendered',
    'R1-on-touch-320',
    'R4-breaks-on-touch-320',
    'R2-always-320',
    'R1-on-touch-390',
    'R4-breaks-on-touch-390',
    'R2-always-390',
    'R1-on-touch-430',
    'R4-breaks-on-touch-430',
    'R2-always-430',
    'R1-on-touch-1368',
    'R4-breaks-on-touch-1368',
    'R2-always-1368',
    'W1-fresh-320-reveal-fold',
    'R3-deck-back-390',
    'G1-glosses-390',
    'Z1-200-percent',
  ],
  continuity: [
    'H1-story-forward',
    'H2-story-back',
    'H1b-one-room-at-a-time',
    'H3-no-picture',
    'H4-interrupted',
    'H5-reduced',
    'D1-deck-good',
    'D2-deck-again',
    'D3-deck-reduced',
  ],
  'guided-offline': [
    "one online visit installs the app's own worker, and it controls the page",
    'the app starts offline from its worker',
    'control: an uncached request really fails offline',
    'no guided asset was asked of the network while offline',
    'the single-file handoff boots from file:// offline',
    'no page errors',
    'offline, the guided room opens the first time its door is pressed',
    'offline, its stylesheet loads',
    'offline, its question set loads: the first question opens',
    'offline, its moments play: module, style and the sprite sheet the samurai is painted from',
    'in the single-file handoff, the guided room opens the first time its door is pressed',
    'in the single-file handoff, its stylesheet loads',
    'in the single-file handoff, its question set loads: the first question opens',
    'in the single-file handoff, its moments play: module, style and the sprite sheet the samurai is painted from',
  ],
});
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const text = (value) => typeof value === 'string' && value.length > 0;
const realPath = (path) => {
  try {
    return text(path) ? realpathSync(path) : null;
  } catch {
    return null;
  }
};
const samePath = (a, b) => realPath(a) !== null && realPath(a) === realPath(b);
const exact = (expected, observed) =>
  expected.length > 0 &&
  expected.length === observed.length &&
  new Set(expected).size === expected.length &&
  new Set(observed).size === observed.length &&
  expected.every((id) => observed.includes(id));
const engines = (engine) => (engine === 'all' ? ['chromium', 'webkit'] : [engine || 'chromium']);
const ids = (names, engine) => engines(engine).flatMap((e) => names.map((name) => `${e}/${name}`));
const runtimeDigest = (context, path) =>
  Array.isArray(context.runtimeFiles)
    ? context.runtimeFiles.find((file) => file.path === path)?.sha256
    : context.runtimeFiles?.[path];
const invalid = (expectedCases, message) => ({
  passed: false,
  errors: [message],
  expectedCases,
  observedCases: [],
});
export const mediaReportNarrowingEnvironment = Object.freeze([
  'GUIDED_MOMENTS',
  'GUIDED_VIEWPORTS',
  'GUIDED_PARTS',
  'GUIDED_FAULT',
  'GUIDED_STANDALONE',
]);
function fullScope(context, require) {
  const env = context.env || context.environment || {};
  for (const key of mediaReportNarrowingEnvironment)
    require(!Object.hasOwn(env, key), `Narrowing/fault input ${key} is present`);
  const args = context.args || context.argv || [];
  require(!args.some((arg) =>
    /^--(?:case|only|boundary-only)(?:=|$)/u.test(arg),
  ), 'Explicit diagnostic selector cannot be acceptance');
}
function identity(
  report,
  context,
  require,
  { artifact = true, verifier = true, legacy = false, module = false } = {},
) {
  if (artifact) {
    require(sha(context.artifactSha256), 'Missing independently pinned artifact identity');
    if (legacy)
      require(text(context.site) &&
        samePath(report.site, context.site) &&
        context.artifactVerifiedBeforeAndAfter ===
          true, 'Legacy site-only report needs runner proof of the same artifact before and after execution');
    else
      require(sha(report.artifactSha256) &&
        report.artifactSha256 === context.artifactSha256, 'Missing/wrong artifact identity');
  }
  if (verifier)
    require(sha(report.verifierSha256) &&
      (!context.verifierSha256 ||
        report.verifierSha256 === context.verifierSha256), 'Missing/wrong verifier identity');
  if (module)
    require(sha(runtimeDigest(context, 'corridor.js')) &&
      report.corridorSha256 ===
        runtimeDigest(context, 'corridor.js'), 'Runtime corridor module differs from artifact');
}
function named({
  name,
  path,
  expectedCases = (engine) => ids(MEDIA_CASES[name], engine),
  rowId = (row, context) => `${context.engine || 'chromium'}/${row.name}`,
  passKey = 'pass',
  identityOptions = {},
  extra = () => {},
}) {
  return Object.freeze({
    producer: `prototypes/corridor/tools/verify-${name}.mjs`,
    paths: [path],
    expectedCases,
    validate(report, context = {}) {
      const expected = expectedCases(context.engine);
      if (!report || typeof report !== 'object' || Array.isArray(report))
        return invalid(expected, 'Missing/malformed producer report');
      const errors = [],
        require = (ok, message) => {
          if (!ok) errors.push(message);
        };
      const rows = Array.isArray(report.results) ? report.results : [];
      const observed = rows.map((row) =>
        row && typeof row === 'object' ? rowId(row, context) : '<malformed>',
      );
      require(engines(context.engine).every((e) =>
        ['chromium', 'webkit'].includes(e),
      ), 'Unknown requested engine');
      fullScope(context, require);
      identity(report, context, require, identityOptions);
      require(exact(
        expected,
        observed,
      ), 'Missing, duplicate, extra, filtered or wrong-engine cases');
      for (const row of rows) {
        require(row &&
          row[passKey] === true &&
          !row.error &&
          !row.failure, `${row?.name || '<unknown>'}: failed/incomplete`);
        if (row && 'errors' in row)
          require(Array.isArray(row.errors) && row.errors.length === 0, `${row.name}: page errors`);
      }
      for (const key of ['error', 'fatal', 'fault'])
        require(!report[key], `${key} invalidates acceptance`);
      if ('fullAcceptance' in report)
        require(report.fullAcceptance === true, 'Producer denies full acceptance');
      for (const key of ['failures', 'failed'])
        if (key in report) require(report[key] === 0, `${key} nonzero`);
      extra(report, context, require, rows);
      return {
        passed: errors.length === 0,
        errors,
        expectedCases: expected,
        observedCases: observed,
      };
    },
  });
}
const definitions = {
  'type-ruby': named({
    name: 'type-ruby',
    path: 'type-ruby.json',
    passKey: 'passed',
    expectedCases: (engine) => [
      'sheets/L1-one-ladder',
      'sheets/L2-one-ruby',
      ...ids(MEDIA_CASES['type-ruby'], engine),
    ],
    rowId: (row) => `${String(row.engine).split(' ')[0]}/${row.name}`,
    extra(report, context, require, rows) {
      require(report.passed === true, 'Type/ruby completion is not green');
      for (const row of rows)
        require(row.engine === 'sheets' ||
          /^(chromium|webkit) \S+/u.test(
            row.engine,
          ), `${row.name}: actual browser version missing`);
    },
  }),
  continuity: named({
    name: 'continuity',
    path: 'continuity.json',
    passKey: 'passed',
    rowId: (row) => `${row.engine}/${row.name}`,
    extra(report, context, require, rows) {
      require(report.passed === true, 'Continuity completion is not green');
      for (const row of rows)
        require(text(row.version), `${row.name}: actual browser version missing`);
      const timing = Array.isArray(report.timing) ? report.timing : [];
      require(exact(
        ids(['shelf → reader (picture)', 'deck Good → next card'], context.engine),
        timing.map((row) => `${row.engine}/${row.move}`),
      ), 'Continuity timing record roster incomplete');
      for (const row of timing)
        require(row.cold && row.warm, 'Missing cold/warm timing observations');
    },
  }),
  playback: named({
    name: 'playback',
    path: 'verify-playback.json',
    rowId: (row, context) => `${context.engine || 'chromium'}/${row.name}`,
    identityOptions: { legacy: true, verifier: false, module: true },
    extra(report, context, require, rows) {
      const required = engines(context.engine);
      require(required.length === 1 &&
        report.engine === required[0] &&
        exact(required, report.enginesCovered || []) &&
        text(report.browserVersion), 'Playback proves exactly one actual engine, never all');
      require(report.requestedBrowser !==
        'all', 'KAIRO_BROWSER=all silently runs one engine in this legacy producer');
      require(report.failures === 0, 'Playback failures absent/nonzero');
      try {
        const names = {
          helper: 'reader-english-rung.mjs',
          expectations: 'reader-english-rung-expectations.json',
          controls: 'reader-english-rung-controls.mjs',
        };
        const sources = Object.fromEntries(
          Object.entries(names).map(([key, path]) => [
            key,
            createHash('sha256')
              .update(readFileSync(join(context.root, 'prototypes/corridor/tools', path)))
              .digest('hex'),
          ]),
        );
        validateReaderEnglishEvidence(report.readerEnglishRung, {
          root: context.root,
          sources,
          usage: 'playback',
          artifactSha256: context.artifactSha256,
          engine: context.engine || 'chromium',
        });
      } catch (error) {
        require(false, error.message);
      }
      for (const row of rows)
        require(row.observed &&
          Array.isArray(row.observed.utterances) &&
          row.observed.utterances.length ===
            0, `${row.name}: device-speech observation absent/nonzero`);
    },
  }),
  'import-provider': named({
    name: 'import-provider',
    path: 'verify-import-provider.json',
    rowId: (row) => `chromium/${row.name}`,
    identityOptions: { legacy: true, verifier: false },
    extra(report, context, require) {
      require(exact(['chromium'], engines(context.engine)) &&
        report.simulatedBrowser === 'Chromium', 'Import provider is Chromium only');
      require(report.onlySyntheticData === true &&
        report.externalNetworkRequestsSent === 0 &&
        report.failures === 0, 'Import provider safety/completion incomplete');
      // These are the observed intercepted requests, not the producer's constant
      // onlySyntheticData/externalNetworkRequestsSent declarations. Each configured
      // origin must have its own credential, and all four exercised bindings occur.
      const bindings = [
        ['https://api.anthropic.com', '/v1/messages', 'default-synthetic'],
        ['https://pre-upgrade-custom.invalid', '/v1/messages', 'custom-synthetic'],
        ['https://custom-provider.invalid', '/proxy/v1/messages', 'custom-synthetic'],
        ['https://second-provider.invalid', '/v1/messages', 'second-synthetic'],
      ];
      const calls = Array.isArray(report.transport) ? report.transport : [];
      const matches = (call, binding) =>
        call &&
        call.origin === binding[0] &&
        call.pathname === binding[1] &&
        call.credential === binding[2];
      require(calls.length > 0 &&
        calls.every((call) => bindings.some((binding) => matches(call, binding))) &&
        bindings.every((binding) =>
          calls.some((call) => matches(call, binding)),
        ), 'Transport observations lack the exercised origin/path/credential bindings or include foreign transport');
    },
  }),
  'corridor-ai': named({
    name: 'corridor-ai',
    path: 'receipt.json',
    rowId: (row) => `chromium/${row.name}`,
    extra(report, context, require) {
      require(exact(['chromium'], engines(context.engine)) &&
        report.browser === 'chromium' &&
        text(report.browserVersion), 'AI walk is Chromium only; actual version required');
      require(report.format === 'kairo-ai-runtime-verification' &&
        report.version === 2 &&
        report.status === 'PASS' &&
        report.pass === true, 'Wrong/incomplete AI receipt');
      require(Array.isArray(report.consoleErrors) &&
        report.consoleErrors.length === 0 &&
        Array.isArray(report.externalRequests) &&
        report.externalRequests.length === 0, 'AI console/egress errors missing/nonempty');
      require(sha(runtimeDigest(context, 'corridor.js')) &&
        report.sourceSha256 ===
          runtimeDigest(context, 'corridor.js'), 'AI source module differs from artifact');
      require(exact(
        ['staged chat-only mining declaration', 'staged Promise.all append gate'],
        report.supplementalSourceChecks || [],
      ), 'Missing AI supplemental source check');
    },
  }),
  'guided-session': named({
    name: 'guided-session',
    path: 'guided-session-checks.json',
    identityOptions: { legacy: true, verifier: false },
    expectedCases: (engine) =>
      engines(engine).flatMap((e) => [
        ...['390', '1280'].flatMap((width) =>
          MEDIA_CASES['guided-journey'].map((name) => `${e}-${width}/${name}`),
        ),
        ...['moments', 'reduced', 'restart', 'held'].flatMap((part) =>
          MEDIA_CASES[`guided-${part}`].map((name) => `${e}-${part}/${name}`),
        ),
      ]),
    rowId: (row) => `${row.run}/${row.name}`,
    extra(report, context, require, rows) {
      require(report.moments === true &&
        report.fault === null &&
        report.failed === 0 &&
        report.passed === rows.length, 'Guided full moments/no-fault completion required');
      require(Array.isArray(report.problems) &&
        report.problems.length === 0, 'Guided problem list absent/nonempty');
    },
  }),
  'guided-offline': named({
    name: 'guided-offline',
    path: 'guided-offline-*/guided-offline.json',
    identityOptions: { verifier: false },
    rowId: (row) => `chromium/${row.name}`,
    extra(report, context, require, rows) {
      require(exact(
        ['chromium'],
        engines(context.engine),
      ), 'Guided offline producer uses Chromium only');
      require(report.summary?.failed === 0 &&
        report.summary?.total === rows.length, 'Guided offline summary incomplete');
      require(Array.isArray(report.installedGuided) &&
        report.installedGuided.length > 0 &&
        new Set(report.installedGuided).size ===
          report.installedGuided.length, 'Installed guided assets absent/duplicated');
      require(Array.isArray(report.offlineRequests) &&
        !report.offlineRequests.some((path) =>
          /\/guided/u.test(path),
        ), 'Guided asset requested from network offline');
      require(report.standaloneDeclared ===
        null, 'A declared single-file handoff is diagnostic, never acceptance');
      const gate = realPath(
        text(context.out) && text(context.gateId) ? join(context.out, context.gateId) : null,
      );
      const runs = gate
        ? readdirSync(gate).filter((entry) => entry.startsWith('guided-offline-'))
        : [];
      const placed =
        gate && realPath(report.standalone)
          ? relative(gate, realPath(report.standalone)).split(sep)
          : [];
      require(runs.length === 1 &&
        placed.length === 2 &&
        placed[0] === runs[0] &&
        placed[1] ===
          'corridor-standalone.html', "Single-file handoff is not this gate's own fresh producer output");
      require(placed.length === 2 &&
        existsSync(report.standalone) &&
        lstatSync(report.standalone).isFile() &&
        sha(report.standaloneSha256) &&
        createHash('sha256').update(readFileSync(report.standalone)).digest('hex') ===
          report.standaloneSha256, 'Single-file handoff bytes differ from the observed handoff');
      // build-standalone emits this sibling receipt for the exact HTML file. Bind
      // those bytes back to the independently verified site, not just to themselves.
      const sidecarPath = text(report.standalone) ? report.standalone + '.build.json' : null;
      let build = null;
      try {
        if (
          placed.length === 2 &&
          sidecarPath &&
          lstatSync(sidecarPath).isFile() &&
          !lstatSync(sidecarPath).isSymbolicLink()
        )
          build = JSON.parse(readFileSync(sidecarPath, 'utf8'));
      } catch {
        /* missing/malformed sidecar is an explicit rejection below */
      }
      require(build?.status === 'passed' &&
        realPath(build.site) &&
        realPath(build.site) === realPath(context.site) &&
        sha(context.artifactSha256) &&
        build.artifactSha256 === context.artifactSha256 &&
        realPath(build.output) === realPath(report.standalone) &&
        sha(report.standaloneSha256) &&
        build.standaloneSha256 ===
          report.standaloneSha256, 'Standalone build sidecar is missing or not bound to this artifact and handoff');
    },
  }),
};
definitions['narration-media'] = Object.freeze({
  producer: 'prototypes/corridor/tools/verify-narration-media.mjs',
  paths: ['verify-narration-media.json'],
  expectedCases: (engine) => ids(['first-article-integrity-and-playthrough'], engine),
  validate(report, context = {}) {
    const expectedCases = this.expectedCases(context.engine);
    if (!report || typeof report !== 'object')
      return invalid(expectedCases, 'Missing narration report');
    const errors = [],
      require = (ok, message) => {
        if (!ok) errors.push(message);
      };
    identity(report, context, require, { verifier: false });
    fullScope(context, require);
    let manifest = null;
    try {
      manifest = context.readArtifactJson?.('audio/article-narration.json');
    } catch (error) {
      require(false, `Narration manifest unreadable: ${error.message}`);
    }
    require(manifest?.v === 2, 'Independent pinned narration manifest required');
    const [article, entry] = Object.entries(manifest?.articles || {})[0] || [];
    const clips = Array.isArray(entry?.clips) ? entry.clips : [];
    require(text(article) &&
      report.article === article &&
      clips.length > 0, 'Wrong/empty first narrated article');
    require(exact(
      engines(context.engine),
      report.enginesCovered || [],
    ), 'Narration engine declaration incomplete');
    const integrity = Array.isArray(report.integrity) ? report.integrity : [];
    require(exact(
      clips.map((c) => c.src),
      integrity.map((c) => c.src),
    ), 'Narration integrity clip roster differs from manifest');
    for (const clip of clips) {
      const got = integrity.find((c) => c.src === clip.src);
      require(got?.matches === true &&
        got.bytes === clip.bytes &&
        got.sha256 === clip.sha256 &&
        sha(clip.sha256), `${clip.src}: integrity differs from manifest`);
      if (context.runtimeFiles)
        require(runtimeDigest(context, clip.src) ===
          clip.sha256, `${clip.src}: manifest differs from artifact inventory`);
    }
    const results = Array.isArray(report.results) ? report.results : [];
    const observedCases = results.map(
      (row) => `${row.engine}/first-article-integrity-and-playthrough`,
    );
    require(exact(
      expectedCases,
      observedCases,
    ), 'Narration actual engine roster incomplete/duplicated');
    for (const row of results) {
      require(row.passed === true &&
        text(row.browserVersion) &&
        !row.failure &&
        Array.isArray(row.errors) &&
        row.errors.length === 0, `${row.engine}: failed/incomplete media run`);
      const played = Array.isArray(row.clips) ? row.clips : [],
        decoded = Array.isArray(row.decoded) ? row.decoded : [];
      require(exact(
        clips.map((c) => c.src),
        played.map((c) => c.src),
      ) &&
        exact(
          clips.map((c) => c.src),
          decoded.map((c) => c.src),
        ), `${row.engine}: missing/duplicate played or decoded clip`);
      for (const [index, clip] of clips.entries()) {
        const p = played[index],
          d = decoded[index];
        require(p?.index === index &&
          p.src === clip.src &&
          d?.src === clip.src &&
          p.reachedPlaying === true &&
          p.manifestSeconds ===
            clip.seconds, `${row.engine}/${index}: clip order/playback premise missing`);
        // The producer asserts raw values, then rounds seconds to 3 decimals (wall to 2).
        // Admit only the published rounding interval; row.passed still requires its raw assertions.
        require(Math.abs(p?.duration - clip.seconds) < 0.2505 &&
          Math.abs(d?.seconds - clip.seconds) < 0.2505 &&
          p.endedAt + 0.0005 >= p.duration - 0.1505 &&
          p.maxGap <= 2 &&
          p.wallSeconds + 0.005 >= (0.6 * (p.duration - 0.0005)) / 4 &&
          p.progressEvents > 0, `${row.engine}/${index}: decode/duration/playthrough proof failed`);
      }
    }
    return { passed: errors.length === 0, errors, expectedCases, observedCases };
  },
});
definitions['voice-lock'] = Object.freeze({
  producer: 'prototypes/corridor/tools/verify-voice-lock.mjs',
  paths: ['stdout.json'],
  sourceOnly: true,
  expectedCases: () => ['source/voice-lock-complete-placement-and-selector-contract'],
  validate(report, context = {}) {
    const expectedCases = this.expectedCases();
    if (!report || typeof report !== 'object')
      return invalid(expectedCases, 'Missing voice-lock JSON stdout report');
    const errors = [],
      require = (ok, message) => {
        if (!ok) errors.push(message);
      };
    require(report.verdict === 'green' &&
      !report.fatal &&
      Array.isArray(report.problems) &&
      !report.problems.length, 'Voice lock reported a problem');
    require(report.coverageRequired === true &&
      report.clipsOwed === 0, 'Actual owed-placement completeness was not required/satisfied');
    require((context.args || context.argv || []).includes(
      '--require-complete',
    ), 'Required --require-complete invocation missing');
    require(context.sourceVerifiedBeforeAndAfter ===
      true, 'Source-only voice report requires runner source identity before and after execution');
    let lock;
    try {
      lock = context.readArtifactJson?.('audio/voice-lock.json');
    } catch {
      /* fail closed below */
    }
    const expectedLock =
      context.voiceLock ||
      (lock?.v === 1
        ? {
            model: lock.render?.model,
            main: lock.voices?.main?.id,
            second: lock.voices?.second?.id,
          }
        : null);
    require(expectedLock &&
      ['model', 'main', 'second'].every((key) => text(expectedLock[key])) &&
      report.model === expectedLock.model &&
      report.main === expectedLock.main &&
      report.second ===
        expectedLock.second, 'Voice identity not independently bound to approved lock');
    require(Number.isInteger(report.stagedCuesChecked) &&
      report.stagedCuesChecked > 0, 'Synthetic selector comparison did not run');
    for (const key of ['approvedWords', 'narratedArticles', 'clipsChecked', 'cuesChecked'])
      require(Number.isInteger(report[key]) && report[key] >= 0, `${key} missing/invalid`);
    require(report.clipsChecked > 0 &&
      report.narratedArticles > 0 &&
      report.cuesChecked >
        0, 'Actual shipped corpus missing; synthetic placeholders cannot prove availability');
    return { passed: errors.length === 0, errors, expectedCases, observedCases: expectedCases };
  },
});
export const mediaReportContracts = Object.freeze(
  Object.fromEntries(
    Object.entries(definitions).map(([name, contract]) => [
      name,
      Object.freeze({
        ...contract,
        validate(report, context = {}) {
          try {
            return contract.validate(report, context);
          } catch (error) {
            return invalid(
              contract.expectedCases(context.engine),
              `Malformed ${name} report: ${error.message}`,
            );
          }
        },
      }),
    ]),
  ),
);
export function validateMediaReport(name, report, context = {}) {
  const contract = mediaReportContracts[name];
  return contract
    ? contract.validate(report, context)
    : invalid([], `Unsupported media report ${name}`);
}
