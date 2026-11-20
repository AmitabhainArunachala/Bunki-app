// Read-only view of the factory's provisional/ and pulled/ journals.
// Nothing here mutates the journal, records study, or makes a task.
const JOB = /^[a-f0-9]{64}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const moment = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function provisionalRows(input, {catalog} = {}) {
  if (!object(input)) return {beingChecked: [], pulled: []};
  const rawCards = Array.isArray(input.cards) ? input.cards : [];
  const rawPulled = Array.isArray(input.pulled) ? input.pulled : [];

  const pulledIds = new Set();
  for (const entry of rawPulled) {
    if (object(entry) && typeof entry.jobId === 'string') pulledIds.add(entry.jobId);
  }
  const knownTerms = new Set();
  if (Array.isArray(catalog)) {
    for (const entry of catalog) {
      if (object(entry) && entry.contractId === 'vocabulary.read.v1' && typeof entry.term === 'string') {
        knownTerms.add(entry.term);
      }
    }
  }

  const beingChecked = [];
  for (const card of rawCards) {
    if (!object(card)) continue;
    if (card.format !== 'nsrs-factory-provisional/v1' || card.status !== 'being-checked') continue;
    if (!text(card.term) || !text(card.reading) || !text(card.jobId)) continue;
    if (!JOB.test(card.jobId)) continue;
    if (pulledIds.has(card.jobId)) continue;
    if (knownTerms.has(card.term)) continue;
    beingChecked.push({jobId: card.jobId, captureEventId: card.captureEventId, term: card.term,
      reading: card.reading, meaning: card.meaning, surface: card.surface, context: card.context,
      createdAt: card.createdAt, label: '確認中', labelEn: 'being checked'});
  }
  beingChecked.sort((a, b) => moment(b.createdAt) - moment(a.createdAt));
  beingChecked.length = Math.min(beingChecked.length, 200);

  const pulled = [];
  for (const entry of rawPulled) {
    if (!object(entry)) continue;
    if (entry.format !== 'nsrs-factory-pulled/v1') continue;
    if (!text(entry.term) || !text(entry.jobId) || !text(entry.reason)) continue;
    pulled.push({jobId: entry.jobId, term: entry.term, reading: entry.reading,
      reason: entry.reason, pulledAt: entry.pulledAt});
  }
  pulled.sort((a, b) => moment(b.pulledAt) - moment(a.pulledAt));
  pulled.length = Math.min(pulled.length, 200);

  return {beingChecked, pulled};
}
