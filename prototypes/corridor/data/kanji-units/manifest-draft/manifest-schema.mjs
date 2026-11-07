/* Schema and graph checks for the kanji unit manifest (S6-R14 fields, S6-R15 wave rule, acyclic prerequisites).
 * Shared by the draft judge (manifest-draft.test.mjs) and the freeze (MF1). Returns a list of error strings;
 * an empty list means the manifest is well formed. Node standard library only.
 */
export const WAVES = Object.freeze(['wave1', 'kanken']);
export const UPPER_GRADES = Object.freeze(['準1級', '1級']);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
const isStringArray = (v) => Array.isArray(v) && v.every(isNonEmptyString);
const isSingleCodePoint = (v) => typeof v === 'string' && [...v].length === 1;
const validDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;

export function validateUnit(unit, index) {
  const errors = [];
  const id = isNonEmptyString(unit?.id) ? unit.id : `#${index}`;
  const err = (message) => errors.push(`${id}: ${message}`);
  if (!unit || typeof unit !== 'object' || Array.isArray(unit)) return [`#${index}: unit is not an object`];
  if (!isNonEmptyString(unit.id)) err('missing id');
  if (!WAVES.includes(unit.wave)) err(`missing or unknown wave marker (${JSON.stringify(unit.wave)}); expected one of ${WAVES.join(', ')}`);
  if (!isNonEmptyString(unit.title)) err('missing title');
  if (!isStringArray(unit.outcomes) || !unit.outcomes.length) err('missing outcomes (non-empty list of can-do sentences)');
  if (!isStringArray(unit.prerequisites)) err('prerequisites must be a list of unit ids');
  else if (!unit.prerequisites.length && unit.entry !== true) err('empty prerequisites but the unit is not marked entry: true (not a first unit)');
  else if (unit.prerequisites.includes(unit.id)) err('a unit cannot be its own prerequisite');
  if (!Array.isArray(unit.kanji) || !unit.kanji.length) err('missing kanji (non-empty list of entries)');
  else unit.kanji.forEach((entry, i) => {
    const at = `kanji[${i}]`;
    if (!entry || typeof entry !== 'object') { err(`${at}: entry is not an object`); return; }
    if (!isSingleCodePoint(entry.glyph)) err(`${at}: glyph must be one code point (${JSON.stringify(entry.glyph)})`);
    if (!Array.isArray(entry.on) || !Array.isArray(entry.kun)) err(`${at} ${entry.glyph}: on and kun reading lists are required (empty lists allowed, absence is not)`);
    if (!('keyword' in entry)) err(`${at} ${entry.glyph}: keyword is required (null allowed when no pinned meaning exists)`);
    if (!Array.isArray(entry.compounds)) err(`${at} ${entry.glyph}: compounds list is required`);
    else entry.compounds.forEach((c, j) => { if (!c || !isNonEmptyString(c.word) || !isNonEmptyString(c.reading) || !isNonEmptyString(c.gloss) || !isNonEmptyString(c.source)) err(`${at} ${entry.glyph} compounds[${j}]: word, reading, gloss and source are required`); });
    if (entry.compounds && !entry.compounds.length && !isNonEmptyString(entry.compound_gap)) err(`${at} ${entry.glyph}: no compounds and no compound_gap statement`);
    if (!Array.isArray(entry.distinctions)) err(`${at} ${entry.glyph}: distinctions list is required`);
    if (!entry.writing || typeof entry.writing !== 'object' || !('strokes' in entry.writing) || !('template' in entry.writing) || !Array.isArray(entry.writing.parts)) err(`${at} ${entry.glyph}: writing needs strokes, template and parts`);
  });
  for (const field of ['readings', 'compounds', 'distinctions', 'writing']) {
    if (!unit[field] || typeof unit[field] !== 'object' || Array.isArray(unit[field])) err(`missing unit-level ${field} summary object`);
  }
  if (!unit.assessment || typeof unit.assessment !== 'object') err('missing assessment obligation');
  else for (const key of ['meaning', 'reading', 'writing', 'pass_rule']) if (!isNonEmptyString(unit.assessment[key])) err(`assessment lacks ${key}`);
  if (!Array.isArray(unit.review_obligations) || !unit.review_obligations.length) err('missing review obligations');
  else {
    const reviewers = new Set(unit.review_obligations.map((o) => o && o.reviewer));
    for (const o of unit.review_obligations) if (!o || !isNonEmptyString(o.reviewer) || !isNonEmptyString(o.who) || !isStringArray(o.checks) || !o.checks.length) err('a review obligation must name reviewer, who and checks');
    if (!reviewers.has('family')) err('review obligations name no family reviewer');
    if (!reviewers.has('native_sample')) err('review obligations name no native sample reviewer');
  }
  return errors;
}

/** Kahn's algorithm over prerequisites; returns the ids left in a cycle (empty when acyclic). */
export function cycleMembers(units) {
  const ids = new Set(units.map((u) => u.id));
  const indegree = new Map(units.map((u) => [u.id, 0]));
  const dependents = new Map(units.map((u) => [u.id, []]));
  for (const u of units) for (const p of u.prerequisites || []) if (ids.has(p)) { indegree.set(u.id, indegree.get(u.id) + 1); dependents.get(p).push(u.id); }
  const queue = [...indegree].filter(([, d]) => d === 0).map(([id]) => id);
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift(); seen.add(id);
    for (const d of dependents.get(id)) { indegree.set(d, indegree.get(d) - 1); if (indegree.get(d) === 0) queue.push(d); }
  }
  return units.map((u) => u.id).filter((id) => !seen.has(id));
}

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['manifest is not an object'];
  if (manifest.manifest !== 'kanji-unit-manifest') errors.push(`manifest field must be 'kanji-unit-manifest' (got ${JSON.stringify(manifest.manifest)})`);
  if (!Number.isInteger(manifest.version) || manifest.version < 1) errors.push(`version must be a positive integer (got ${JSON.stringify(manifest.version)})`);
  if (!validDate(manifest.draft_date)) errors.push(`draft_date must be an ISO date YYYY-MM-DD (got ${JSON.stringify(manifest.draft_date)})`);
  if (typeof manifest.frozen !== 'boolean') errors.push('frozen must be a boolean');
  if (manifest.frozen === true && !validDate(manifest.freeze_date)) errors.push('a frozen manifest needs an ISO freeze_date');
  if (manifest.frozen === false && manifest.freeze_date !== null) errors.push('a draft has freeze_date null');
  if (!Array.isArray(manifest.units) || !manifest.units.length) { errors.push('units must be a non-empty list'); return errors; }
  if (manifest.unit_count !== manifest.units.length) errors.push(`unit_count ${manifest.unit_count} does not equal units.length ${manifest.units.length}`);
  const ids = new Map();
  manifest.units.forEach((u, i) => {
    errors.push(...validateUnit(u, i));
    if (u && isNonEmptyString(u.id)) { if (ids.has(u.id)) errors.push(`${u.id}: duplicate unit id (also unit #${ids.get(u.id)})`); else ids.set(u.id, i); }
  });
  for (const u of manifest.units) for (const p of u.prerequisites || []) if (!ids.has(p)) errors.push(`${u.id}: prerequisite ${JSON.stringify(p)} is not a unit id`);
  const cyc = cycleMembers(manifest.units.filter((u) => isNonEmptyString(u.id) && Array.isArray(u.prerequisites)));
  if (cyc.length) errors.push(`prerequisites are not acyclic; units in a cycle: ${cyc.join(', ')}`);
  const owner = new Map();
  for (const u of manifest.units) for (const e of u.kanji || []) {
    if (!e || !isSingleCodePoint(e.glyph)) continue;
    if (owner.has(e.glyph)) errors.push(`${e.glyph} appears in two units: ${owner.get(e.glyph)} and ${u.id}`); else owner.set(e.glyph, u.id);
  }
  const kanken = manifest.units.filter((u) => u.wave === 'kanken');
  const fs = manifest.frequency_source;
  const recorded = fs && typeof fs === 'object' && isNonEmptyString(fs.name) && isNonEmptyString(fs.version) && /^[0-9a-f]{64}$/.test(fs.sha256 || '');
  if (!recorded) {
    if (fs !== null && fs !== undefined) errors.push('frequency_source must be null or carry name, version and a 64-hex sha256');
    for (const u of kanken) errors.push(`${u.id}: kanken-wave unit while no frequency source is recorded (X17 absent); S6-R15 forbids substituting another count`);
    if (manifest.kanken_first_units?.status !== 'blocked' || !isNonEmptyString(manifest.kanken_first_units?.blocker)) errors.push('with no frequency source, kanken_first_units must state status blocked and a blocker');
  } else {
    for (const grade of UPPER_GRADES) {
      const mine = kanken.filter((u) => u.level === grade);
      if (mine.length !== 2) errors.push(`${grade}: expected exactly 2 kanken-wave first units, found ${mine.length}`);
      for (const u of mine) if ((u.kanji || []).length !== 10) errors.push(`${u.id}: a kanken first unit holds 10 kanji, found ${(u.kanji || []).length}`);
    }
  }
  return errors;
}
