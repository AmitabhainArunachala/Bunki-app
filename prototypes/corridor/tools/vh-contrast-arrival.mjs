/** The public arrival predicate consumes measured facts. The allowance is fixed by
 * twelve RAF intervals collected before this animation starts, never by its last
 * (possibly delayed) sample. It does not trust a producer's completed boolean. */
export function judgeContrastArrival(row) {
  const errors = [];
  const require = (value, message) => { if (!value) errors.push(message); };
  if (!row || typeof row !== 'object') return { passed: false, errors: ['Missing arrival'] };
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const calibration = row.frameCalibration;
  const stamps = Array.isArray(calibration?.timestamps) ? calibration.timestamps : [];
  const intervals = stamps.slice(1).map((stamp, index) => stamp - stamps[index]);
  const validCalibration = calibration?.method === 'median-of-12-pre-arrival-raf-intervals' &&
    stamps.length === 13 && stamps.every(finite) && intervals.every((value) => finite(value) && value > 0);
  const sorted = [...intervals].sort((a, b) => a - b);
  const frameMs = validCalibration ? (sorted[5] + sorted[6]) / 2 : null;
  require(validCalibration, 'Missing/invalid independent frame calibration');
  require(row.animationType === 'CSSAnimation' && row.name === 'read-mini-rise' && !row.missingAnimation && !row.noAnimation,
    'The normal arrival must be the actual named read-mini-rise CSS animation');
  require(row.motionPreference === 'no-preference', 'Normal motion was not observed');
  require(typeof row.documentId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(row.documentId) &&
    row.documentId === calibration?.documentId && row.sameDocument === true && calibration?.sameDocument === true,
    'Calibration and arrival are not bound to the same actual window/document');
  require(finite(row.startTime) && validCalibration && stamps.at(-1) < row.startTime,
    'Frame calibration did not finish before the actual animation start');
  require(finite(row.authoredDuration) && row.authoredDuration > 0 && finite(row.authoredDelay) &&
    finite(row.authoredEndDelay) && finite(row.authoredIterations) && row.authoredIterations > 0 &&
    row.authoredEnd === Math.max(0, row.authoredDelay + row.authoredDuration * row.authoredIterations + row.authoredEndDelay),
    'Authored duration/end facts are incomplete or inconsistent');
  require(row.playbackRate === 1, 'Arrival playback rate changed');
  require(finite(row.observedAt) && finite(row.rafTime) && row.observedAt >= row.rafTime &&
    row.elapsed === row.rafTime - row.startTime, 'Arrival elapsed time is not bound to the same animation/frame timeline');
  const deadlineMs = finite(row.authoredEnd) && frameMs !== null ? row.authoredEnd + frameMs : null;
  require(deadlineMs !== null && finite(row.elapsed) && row.elapsed >= row.authoredEnd && row.elapsed <= deadlineMs,
    'Arrival missed its authored duration plus independently calibrated one-frame deadline');
  require(row.opacity === 1 && row.playState === 'finished' && finite(row.currentTime) && row.currentTime >= row.authoredEnd,
    'Arrival did not finish at full opacity');
  return { passed: errors.length === 0, errors, frameMs, deadlineMs };
}
