/**
 * Read-only learning evidence from the existing SYNC v4 projection.
 *
 * This is not a scheduler, a mastery model, or an unfamiliarity pretest. Replay
 * admits only scored, revealed, unassisted reviews to `projection.reviews`.
 * Practice/assisted submissions are observations; imported baselines cannot
 * establish a new learning cohort. A caller must supply its current projection
 * and an explicit clock value. Nothing is written or rescheduled here.
 */
const DAY = 86400000;
const VOCABULARY = 'vocabulary.read.v1';
const MAX_TIME = 8640000000000000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const time = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIME;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const frozen = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};
const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
};

export const KANJI_CAPACITY_POLICY = frozen({
  id: 'kanji-capacity-observation-v1',
  minimumSuccessfulRawRating: 3,
  minimumMatureCohorts: 3,
  minimumMatureWords: 50,
  recommendationLookbackDays: 28,
  nextDayThreshold: 0.90,
  weekThreshold: 0.85,
  ladder: [20, 30, 40],
  windows: {
    nextDay: {label: 'Next-day recall (24–48 hours)', startMs: DAY, endMs: 2 * DAY},
    week: {label: 'Maintained recall (7–9 days)', startMs: 7 * DAY, endMs: 9 * DAY},
  },
});

function newWindow(spec) {
  return {label: spec.label, startMs: spec.startMs, endMs: spec.endMs,
    interval: 'start-inclusive,end-exclusive', matured: 0, attempted: 0, missing: 0,
    successful: 0, hard: 0, failed: 0, awaiting: 0, open: 0, ambiguous: 0, signalled: 0,
    attemptedAccuracy: null, coverage: null, confirmedSuccessRate: null, status: 'awaiting'};
}
function finishWindow(window) {
  window.missing = window.matured - window.attempted;
  window.attemptedAccuracy = window.attempted ? window.successful / window.attempted : null;
  window.coverage = window.matured ? window.attempted / window.matured : null;
  // With no observations at all, a zero must not masquerade as measured recall.
  window.confirmedSuccessRate = window.attempted ? window.successful / window.matured : null;
  window.status = !window.matured ? 'awaiting' : !window.attempted ? 'unobserved' : window.missing ? 'partial' : 'observed';
  return window;
}
function addAttempt(window, attempt) {
  if (attempt.phase === 'awaiting') { window.awaiting++; return; }
  if (attempt.phase === 'open') { window.open++; return; }
  window.matured++;
  if (attempt.reason === 'ambiguous-history') window.ambiguous++;
  if (attempt.reason === 'signalled-first-attempt') window.signalled++;
  if (attempt.reviewId === null) return;
  window.attempted++;
  if (attempt.rawRating >= KANJI_CAPACITY_POLICY.minimumSuccessfulRawRating) window.successful++;
  else if (attempt.rawRating === 2) window.hard++;
  else window.failed++;
}
const windows = () => Object.fromEntries(Object.entries(KANJI_CAPACITY_POLICY.windows).map(([key, spec]) => [key, newWindow(spec)]));

function baseReport(now) {
  return {
    format: 'nihongo-kanji-capacity-report', version: 1, policy: KANJI_CAPACITY_POLICY.id,
    status: 'ready', observedAt: time(now) ? now : null,
    criterion: {ratingField: 'rawRating', minimum: 3, evidence: 'self-reported',
      label: 'Self-rated Good or Easy (raw rating 3–4)',
      hardMeaning: 'Hard (2) is weak recall, not a confident success; Again (1) is a miss.'},
    counts: {vocabularyReviewEvents: 0, vocabularyTasksReviewed: 0, vocabularyWordsReviewed: 0,
      eligibleReviewEvents: 0, signalMarkedReviewEvents: 0, wordIntroductions: 0, wordIntroductionsWithSignals: 0, glyphsExposed: 0},
    glyphExposure: {glyphs: [], label: 'Kanji appearing in reviewed word forms; exposure is not mastery.', mastery: null},
    windows: windows(), cohorts: [], items: [],
    source: {appliedSeq: null, pendingEvents: 0, blocked: false},
    timing: {preRevealThinkMs: 0, timedReviews: 0, totalStudyMs: null},
    backlog: {dueNow: 0, overdueByOneDay: 0, oldestDueAt: null, unreadableDueDates: 0, trend: null},
    exclusions: {duplicateRows: 0, conflictingRows: 0, invalidReviewRows: 0, invalidTimestamps: 0,
      nonVocabularyReviews: 0, pendingReviews: 0, pendingUndos: 0, pendingIntroductions: 0, untrustedReviews: 0, rejectedReviews: 0,
      undoneReviews: 0, ambiguousTimestampWords: 0, missingCatalogTasks: 0,
      importedWords: 0, untrustedIntroductions: 0, undoneIntroductions: 0,
      practiceOrAssistedObservations: 0},
    limitations: [], recommendation: null,
  };
}
function limitation(report, code, message) {
  if (!report.limitations.some(row => row.code === code)) report.limitations.push({code, message});
}
function wordKey(task) {
  return task?.contract === VOCABULARY && text(task.lexicalKey) ? task.lexicalKey : null;
}
function attemptInWindow(reviews, introducedAt, spec, now, ambiguous) {
  const opensAt = introducedAt + spec.startMs, closesAt = introducedAt + spec.endMs;
  const phase = now < opensAt ? 'awaiting' : now < closesAt ? 'open' : 'matured';
  const result = {phase, opensAt, closesAt, firstAttemptId: null, reviewId: null, at: null, rawRating: null,
    interveningReviews: null, reason: ambiguous ? 'ambiguous-history' : 'no-eligible-attempt'};
  if (ambiguous) return result;
  const first = reviews.find(row => row.at >= opensAt && row.at < closesAt && row.at <= now);
  if (first) result.firstAttemptId = first.id;
  // Unknown/unsure signals are not necessarily assistance. In particular, an
  // explicit miss cannot be skipped in favour of a later successful repetition.
  // A signalled Good/Easy is conservatively unresolved: this projection does not
  // establish enough detail to call that first attempt a confident success.
  if (first?.threshold.signalIds.length && first.rawRating >= 3) {
    result.reason = 'signalled-first-attempt';
    return result;
  }
  if (first) Object.assign(result, {reviewId: first.id, at: first.at, rawRating: first.rawRating,
    interveningReviews: reviews.filter(row => row.at > introducedAt && row.at < first.at).length, reason: null});
  return result;
}

/**
 * `now` is mandatory; there is no ambient clock. Rates are fractions or null.
 * Windows enter the denominator only when their upper bound has elapsed. Their
 * first canonical attempt fixes the outcome, including misses. If that attempt
 * cannot establish unaided confident recall, later successes cannot replace it.
 * Missing/ambiguous results remain in the mature denominator.
 * `confirmedSuccessRate` includes missing outcomes in its denominator whenever
 * any attempt exists, but is not an estimate that missing items were forgotten.
 */
export function buildKanjiCapacityReport(projection, catalog, {now} = {}) {
  const report = baseReport(now);
  if (!time(now) || projection?.format !== 'nihongo-projection' || projection.version !== 4 ||
      !object(projection.tasks) || !Array.isArray(projection.reviews) || !object(projection.outcomes) ||
      !object(projection.introductions) || !Number.isSafeInteger(projection.appliedSeq) || projection.appliedSeq < 0) {
    report.status = 'unsupported';
    limitation(report, 'unsupported-projection-or-clock', 'A current SYNC v4 projection and an explicit valid observation time are required.');
    report.recommendation = recommendation(report, now);
    return frozen(report);
  }
  const tasks = projection.tasks, excluded = report.exclusions;
  const pendingIds = new Set(Array.isArray(projection.pending) ? projection.pending : []);
  const pendingEvent = id => pendingIds.has(id) || projection.outcomes[id]?.provisional === true;
  report.source = {appliedSeq: projection.appliedSeq, pendingEvents: Array.isArray(projection.pending) ? projection.pending.length : 0,
    blocked: Boolean(projection.error || projection.updateRequired)};
  const entries = new Map(), ambiguousCatalog = new Set();
  for (const entry of Array.isArray(catalog) ? catalog : []) {
    if (!text(entry?.taskKey)) continue;
    const prior = entries.get(entry.taskKey);
    if (prior && (prior.form !== entry.form || prior.term !== entry.term)) ambiguousCatalog.add(entry.taskKey);
    else entries.set(entry.taskKey, entry);
  }
  for (const key of ambiguousCatalog) entries.delete(key);
  const groupedTasks = new Map();
  for (const [taskKey, task] of Object.entries(tasks)) {
    const key = wordKey(task);
    if (!key) continue;
    if (!groupedTasks.has(key)) groupedTasks.set(key, []);
    groupedTasks.get(key).push(taskKey);
    if (!task.card || task.known || task.suspended || (projection.settings?.topicsOff?.[task.module] ?? []).includes(task.group)) continue;
    const due = typeof task.card.due === 'string' && /Z$/.test(task.card.due) ? Date.parse(task.card.due) : NaN;
    if (!time(due)) { report.backlog.unreadableDueDates++; continue; }
    if (due <= now) {
      report.backlog.dueNow++;
      report.backlog.oldestDueAt = report.backlog.oldestDueAt === null ? due : Math.min(due, report.backlog.oldestDueAt);
    }
    if (due < now - DAY) report.backlog.overdueByOneDay++;
  }

  const byId = new Map(), ambiguousWords = new Set();
  const taint = row => { const key = wordKey(tasks[row?.taskKey]); if (key) ambiguousWords.add(key); };
  for (const row of projection.reviews) {
    if (!object(row) || !text(row.id)) { excluded.invalidReviewRows++; continue; }
    if (!byId.has(row.id)) byId.set(row.id, []);
    byId.get(row.id).push(row);
  }
  const unique = [], badSequenceIds = new Set(), sequences = new Map();
  for (const group of byId.values()) {
    let identical = false;
    try { const signatures = new Set(group.map(row => JSON.stringify(stable(row)))); identical = signatures.size === 1; } catch { /* malformed input is not evidence */ }
    if (!identical) { excluded.conflictingRows += group.length; group.forEach(taint); continue; }
    excluded.duplicateRows += group.length - 1;
    const row = group[0]; unique.push(row);
    if (Number.isSafeInteger(row.seq) && row.seq > 0) {
      if (!sequences.has(row.seq)) sequences.set(row.seq, []);
      sequences.get(row.seq).push(row);
    }
  }
  for (const group of sequences.values()) if (group.length > 1) {
    excluded.conflictingRows += group.length;
    for (const row of group) { badSequenceIds.add(row.id); taint(row); }
  }
  const accepted = [], acceptedById = new Map(), undoneIds = new Set();
  for (const row of unique) {
    const key = wordKey(tasks[row.taskKey]);
    if (!key) { excluded.nonVocabularyReviews++; continue; }
    if (badSequenceIds.has(row.id)) continue;
    const outcome = projection.outcomes[row.id];
    if (row.seq === null || outcome?.provisional === true) { excluded.pendingReviews++; continue; }
    if (outcome?.status === 'observation') { excluded.rejectedReviews++; continue; }
    if (!Number.isSafeInteger(row.seq) || row.seq < 1 || row.seq > projection.appliedSeq ||
        outcome?.status !== 'applied' || outcome.seq !== row.seq || outcome.provisional !== false) {
      excluded.untrustedReviews++; taint(row); continue;
    }
    if (row.undoneAt !== null && row.undoneAt !== undefined) {
      if (!Number.isSafeInteger(row.undoneAt) || row.undoneAt < 1) { excluded.invalidReviewRows++; taint(row); continue; }
      if (row.undoneAt <= projection.appliedSeq) { excluded.undoneReviews++; undoneIds.add(row.id); continue; }
      // Replay projects pending undo as appliedSeq + 1 onto an existing canonical
      // row. Keep the confirmed evidence until that undo is itself canonical.
      excluded.pendingUndos++;
    }
    if (!time(row.at) || row.at > now || !Number.isSafeInteger(row.dayStart) || row.dayStart > row.at ||
        row.dayStart < -MAX_TIME || row.at - row.dayStart > 27 * 3600000) {
      excluded.invalidTimestamps++; taint(row); continue;
    }
    if (!Number.isInteger(row.rawRating) || row.rawRating < 1 || row.rawRating > 4 ||
        !object(row.threshold) || !Array.isArray(row.threshold.signalIds) || row.threshold.signalIds.some(id => !text(id))) {
      excluded.invalidReviewRows++; taint(row); continue;
    }
    if (row.threshold.signalIds.length) report.counts.signalMarkedReviewEvents++;
    accepted.push(row); acceptedById.set(row.id, row);
  }
  accepted.sort((a, b) => a.seq - b.seq);
  const byWord = new Map(), reviewedTasks = new Set(), glyphs = new Set(), missingCatalog = new Set();
  for (const row of accepted) {
    const key = wordKey(tasks[row.taskKey]);
    if (!byWord.has(key)) byWord.set(key, []);
    const rows = byWord.get(key), previous = rows.at(-1);
    if (previous && row.at <= previous.at) ambiguousWords.add(key);
    rows.push(row); reviewedTasks.add(row.taskKey);
    const entry = entries.get(row.taskKey), form = text(entry?.form) ? entry.form : entry?.term;
    if (text(form)) {
      // Script=Han also includes iteration marks; they are not extra characters.
      for (const glyph of form) if (/\p{Script=Han}/u.test(glyph) && glyph !== '々' && glyph !== '〻') glyphs.add(glyph);
    } else missingCatalog.add(row.taskKey);
    if (row.foregroundValid === true && Number.isSafeInteger(row.thinkMs) && row.thinkMs >= 0) {
      report.timing.preRevealThinkMs += row.thinkMs; report.timing.timedReviews++;
    }
  }
  excluded.ambiguousTimestampWords = ambiguousWords.size;
  report.counts.eligibleReviewEvents = accepted.filter(row => (row.threshold.signalIds.length === 0 || row.rawRating < 3) && !ambiguousWords.has(wordKey(tasks[row.taskKey]))).length;
  excluded.missingCatalogTasks = missingCatalog.size;
  excluded.practiceOrAssistedObservations = (projection.observations ?? []).filter(row => row?.type === 'review' && row.reason === 'practice-or-assisted').length;
  Object.assign(report.counts, {vocabularyReviewEvents: accepted.length, vocabularyTasksReviewed: reviewedTasks.size,
    vocabularyWordsReviewed: byWord.size, glyphsExposed: glyphs.size});
  report.glyphExposure.glyphs = [...glyphs].sort();

  const importedWords = new Set((projection.baselines ?? []).filter(row => !pendingEvent(row?.id)).map(row => wordKey(tasks[row?.taskKey])).filter(Boolean));
  const cohortMap = new Map(), uniqueById = new Map(unique.map(row => [row.id, row]));
  for (const [key, keys] of groupedTasks) {
    const introductions = keys.filter(taskKey => own(projection.introductions, taskKey))
      .map(taskKey => ({taskKey, intro: projection.introductions[taskKey]}))
      .filter(row => { if (!pendingEvent(row.intro?.id)) return true; excluded.pendingIntroductions++; return false; });
    if (!introductions.length) continue;
    if (importedWords.has(key) || introductions.some(row => row.intro?.baseline === true)) { excluded.importedWords++; continue; }
    const candidates = introductions.map(row => ({...row, raw: uniqueById.get(row.intro?.id), review: acceptedById.get(row.intro?.id)}));
    if (candidates.some(row => !row.raw || row.raw.taskKey !== row.taskKey)) { excluded.untrustedIntroductions++; continue; }
    candidates.sort((a, b) => (a.raw.seq ?? Infinity) - (b.raw.seq ?? Infinity));
    const first = candidates[0], reviews = byWord.get(key) ?? [];
    if (undoneIds.has(first?.intro?.id)) { excluded.undoneIntroductions++; continue; }
    if (!first?.review || reviews[0]?.id !== first.review.id) { excluded.untrustedIntroductions++; continue; }
    // Initial learning can involve lookup/uncertainty. Its canonical timestamp
    // still anchors the cohort; dropping those words would select easier items.
    if (first.review.threshold.signalIds.length) report.counts.wordIntroductionsWithSignals++;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(first.intro.day ?? '') ? first.intro.day : null;
    const cohortId = `day:${first.review.dayStart}`;
    if (!cohortMap.has(cohortId)) cohortMap.set(cohortId, {id: cohortId, day, dayStart: first.review.dayStart,
      introducedWords: 0, firstIntroducedAt: first.review.at, lastIntroducedAt: first.review.at, windows: windows()});
    const cohort = cohortMap.get(cohortId);
    cohort.introducedWords++;
    cohort.firstIntroducedAt = Math.min(cohort.firstIntroducedAt, first.review.at);
    cohort.lastIntroducedAt = Math.max(cohort.lastIntroducedAt, first.review.at);
    if (cohort.day !== day) cohort.day = null;
    const entry = entries.get(first.taskKey);
    const item = {wordKey: key, term: entry?.term ?? null, introductionId: first.review.id, introductionSignalCount: first.review.threshold.signalIds.length,
      introducedAt: first.review.at, cohortId, windows: {}};
    for (const [name, spec] of Object.entries(KANJI_CAPACITY_POLICY.windows)) {
      const attempt = attemptInWindow(reviews, first.review.at, spec, now, ambiguousWords.has(key));
      item.windows[name] = attempt;
      addAttempt(report.windows[name], attempt); addAttempt(cohort.windows[name], attempt);
    }
    report.items.push(item);
  }
  report.items.sort((a, b) => a.introducedAt - b.introducedAt || (a.wordKey < b.wordKey ? -1 : a.wordKey > b.wordKey ? 1 : 0));
  report.cohorts = [...cohortMap.values()].sort((a, b) => a.dayStart - b.dayStart);
  report.counts.wordIntroductions = report.items.length;
  Object.values(report.windows).forEach(finishWindow);
  for (const cohort of report.cohorts) Object.values(cohort.windows).forEach(finishWindow);

  limitation(report, 'self-reported-composite-review', 'These are self-rated vocabulary task outcomes, not independent tests of pronunciation, meaning, handwriting, or kanji mastery.');
  limitation(report, 'unfamiliarity-baseline-unavailable', 'A first scheduled word introduction does not prove that the word or its kanji was previously unfamiliar.');
  limitation(report, 'maintained-recall', 'Intervening reviews are allowed. The delayed windows measure maintained recall, not a week without practice.');
  limitation(report, 'total-study-time-unavailable', 'The log records some pre-reveal thinking time, not total learning, reading, and review time. Sustainable targets per hour cannot be calculated.');
  limitation(report, 'missing-is-unobserved', 'Missing eligible attempts reduce coverage; they are not observed memory failures. Windows mature only after 48 hours or 9 days.');
  limitation(report, 'practice-exposure-not-attributable', 'Rejected practice or assisted observations do not retain per-word timing here; all intervening exposure cannot be reconstructed from this projection.');
  if (report.counts.signalMarkedReviewEvents) limitation(report, 'signalled-first-attempt', 'At a delayed checkpoint, a first signalled Good/Easy remains unverified; a first Again/Hard remains weak recall. Later success never replaces either outcome. Initial uncertainty does not remove a word from its cohort.');
  limitation(report, 'task-limit-is-not-word-load', 'The existing new-card allowance covers tasks across modules; it is not a recorded 20/30/40-word capacity experiment.');
  if (excluded.importedWords) limitation(report, 'imported-history-not-new-cohort', 'Imported baseline words remain in reviewed-task and exposure counts, but cannot establish a new learning cohort.');
  if (excluded.undoneIntroductions || excluded.untrustedIntroductions) limitation(report, 'excluded-introductions', 'Words with undone or unconfirmed initial introductions cannot establish a trustworthy learning start.');
  if (report.source.blocked || report.source.pendingEvents || excluded.pendingUndos || excluded.pendingIntroductions) limitation(report, 'canonical-history-incomplete', 'The projection is blocked or contains pending work. Only confirmed, applied review rows enter these outcomes; pending undo and baseline changes do not rewrite confirmed history.');
  if (ambiguousWords.size) limitation(report, 'ambiguous-review-history', 'Conflicting, tied, or backwards timestamps leave affected delayed outcomes unknown; later successes are not substituted.');
  if (missingCatalog.size) limitation(report, 'incomplete-glyph-exposure', 'Some reviewed tasks have no unambiguous catalog word form; their glyph exposure is unavailable.');
  if (report.source.blocked || report.source.pendingEvents || excluded.pendingUndos || excluded.pendingIntroductions || ambiguousWords.size || missingCatalog.size || excluded.untrustedIntroductions || excluded.invalidReviewRows) report.status = 'partial';
  report.recommendation = recommendation(report, now);
  return frozen(report);
}

function recommendation(report, now) {
  const policy = KANJI_CAPACITY_POLICY;
  const recent = report.cohorts.filter(cohort => cohort.windows.week.matured === cohort.introducedWords &&
    cohort.introducedWords > 0 && now - cohort.lastIntroducedAt <= policy.recommendationLookbackDays * DAY);
  const aggregate = windows();
  for (const cohort of recent) for (const key of Object.keys(aggregate)) {
    for (const count of ['matured', 'attempted', 'successful', 'hard', 'failed', 'ambiguous', 'signalled']) aggregate[key][count] += cohort.windows[key][count];
  }
  Object.values(aggregate).forEach(finishWindow);
  const gates = {
    matureCohorts: {met: recent.length >= policy.minimumMatureCohorts, observed: recent.length, required: policy.minimumMatureCohorts},
    matureWords: {met: aggregate.week.matured >= policy.minimumMatureWords, observed: aggregate.week.matured, required: policy.minimumMatureWords},
    nextDay: {met: aggregate.nextDay.confirmedSuccessRate === null ? null : aggregate.nextDay.confirmedSuccessRate >= policy.nextDayThreshold,
      threshold: policy.nextDayThreshold, ...aggregate.nextDay},
    week: {met: aggregate.week.confirmedSuccessRate === null ? null : aggregate.week.confirmedSuccessRate >= policy.weekThreshold,
      threshold: policy.weekThreshold, ...aggregate.week},
    totalStudyTime: {met: null, reason: 'total-study-time-unavailable'},
    backlogTrend: {met: null, reason: 'backlog-trend-unavailable'},
    unfamiliarityBaseline: {met: null, reason: 'unfamiliarity-baseline-unavailable'},
  };
  const reasons = [];
  if (report.status === 'unsupported') reasons.push('unsupported-projection-or-clock');
  if (report.source.blocked || report.source.pendingEvents || report.exclusions.pendingUndos || report.exclusions.pendingIntroductions) reasons.push('canonical-history-incomplete');
  if (!gates.matureCohorts.met) reasons.push('insufficient-mature-cohorts');
  if (!gates.matureWords.met) reasons.push('insufficient-delayed-sample');
  if (gates.nextDay.met !== true) reasons.push(gates.nextDay.met === null ? 'next-day-evidence-unavailable' : 'next-day-recall-below-threshold');
  if (gates.week.met !== true) reasons.push(gates.week.met === null ? 'week-evidence-unavailable' : 'week-recall-below-threshold');
  if (aggregate.nextDay.missing || aggregate.week.missing) reasons.push('incomplete-delayed-coverage');
  if (report.exclusions.ambiguousTimestampWords) reasons.push('ambiguous-review-history');
  reasons.push('total-study-time-unavailable', 'backlog-trend-unavailable', 'unfamiliarity-baseline-unavailable', 'task-limit-is-not-word-load');
  return {action: 'hold', targetNewWordsPerDay: null, ladder: [...policy.ladder], unit: 'distinct vocabulary words per day',
    lookbackDays: policy.recommendationLookbackDays, gates, reasons,
    message: 'Keep the current load. The 20 → 30 → 40 ladder is a proposed experiment; this log does not establish total study time, backlog trend, or an unfamiliar-word baseline needed to recommend an increase.',
    changesSettings: false};
}
