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

/** Judges every observed demo mount, in order, against its own start; exactly one is still displayed. */
export function judgeContrastArrivals(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { passed: false, errors: ['No displayed arrival was observed'], mounts: [] };
  const errors = [];
  const sameCalibration = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const mounts = rows.map((row, index) => {
    const judged = judgeContrastArrival(row);
    const mountErrors = [...judged.errors];
    if (row?.mountSequence !== index) mountErrors.push(`Mount sequence ${row?.mountSequence} is not its observed position ${index}`);
    if (row?.current !== true && row?.current !== false) mountErrors.push('Displayed/retired state was not recorded');
    if (row?.superseded === true || row?.supersededBeforeFinish === true) mountErrors.push('Superseded before its arrival finished');
    if (row?.documentId !== rows[0]?.documentId || !sameCalibration(row?.frameCalibration, rows[0]?.frameCalibration))
      mountErrors.push('Not bound to the same document and pre-arrival calibration as the other mounts');
    return { mountSequence: row?.mountSequence ?? null, current: row?.current === true, passed: mountErrors.length === 0, errors: mountErrors };
  });
  const current = mounts.filter((mount) => mount.current);
  if (current.length !== 1) errors.push(`Exactly one displayed current mount is required; observed ${current.length}`);
  for (const [index, mount] of mounts.entries()) for (const error of mount.errors) errors.push(`mount ${index}: ${error}`);
  return { passed: errors.length === 0, errors, mounts };
}
