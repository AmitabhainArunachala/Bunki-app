// Imported content is data only. Never fetch, execute, or render its markup.
export const MAX_IMPORT_BYTES = 30 * 1024 * 1024;
const check = (ok, message) => { if (!ok) throw new Error(message); };
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const text = (x, name, max = 20000) => check(typeof x === 'string' && x.trim().length > 0 && x.length <= max, `Invalid ${name}.`);
const identifier = (x, name) => check(typeof x === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(x), `Invalid ${name} identity.`);
function rows(value, name, maximum) {
  check(Array.isArray(value) && value.length <= maximum, `Invalid ${name} list.`);
  check(value.every(object), `Invalid ${name} record.`);
  return value;
}
function unique(records, name) {
  const ids = new Set();
  for (const r of records) { identifier(r.id, name); check(!ids.has(r.id), `Duplicate ${name} identity.`); ids.add(r.id); }
  return ids;
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export async function digest(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
export function safeURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
export async function validateCollection(data) {
  check(object(data) && data.format === 'john-personal-japanese' && data.version === 1, 'Choose a supported personal collection JSON file or Bunki collection backup.');
  identifier(data.id, 'collection');
  for (const k of ['title', 'scope', 'level']) text(data[k], k);
  const worlds = rows(data.worlds, 'themes', 200), sources = rows(data.sources, 'sources', 5000), lessons = rows(data.lessons, 'paragraphs', 10000);
  check(worlds.length && lessons.length, 'This collection has no themes or paragraphs.');
  const worldIds = unique(worlds, 'theme'), sourceIds = unique(sources, 'source'), lessonIds = unique(lessons, 'paragraph');
  const threads = rows(data.threads || [], 'conversation threads', 1000), threadIds = unique(threads, 'thread');
  for (const w of worlds) {
    for (const k of ['ja', 'en', 'about']) text(w[k], 'theme ' + k);
    check(!w.thread || threadIds.has(w.thread), 'Unknown conversation thread.');
  }
  for (const s of sources) {
    text(s.title, 'source title'); text(s.scope, 'source description');
    check(s.url === '' || safeURL(s.url), 'Source links must use HTTPS.');
  }
  for (const t of threads) {
    text(t.label, 'thread label'); text(t.basis, 'thread basis');
    check(Array.isArray(t.anchors) && t.anchors.length <= 100, 'Invalid conversation anchors.');
    t.anchors.forEach(a => text(a, 'conversation anchor'));
  }
  const sequences = new Set();
  for (const l of lessons) {
    for (const k of ['title','ja','en','term','reading','gloss','grammar','grammarAnswer','conceptQuestion','conceptAnswer','editorialStatus']) text(l[k], 'paragraph ' + k);
    check(l.assessmentVersion === 1 && l.origin === 'original_composition', 'Unsupported assessment version or passage origin.');
    check(worldIds.has(l.world), 'Unknown paragraph theme.');
    check(Number.isInteger(l.sequence) && l.sequence >= 0 && !sequences.has(l.sequence), 'Duplicate or invalid study order.');
    sequences.add(l.sequence);
    check(Number.isInteger(l.ordinal) && l.ordinal > 0, 'Invalid paragraph ordinal.');
    check(l.ja.includes(l.term) && l.ja.includes(l.grammar), 'A retrieval target is absent from its paragraph.');
    check(l.ja.length >= 80 && (l.ja.match(/。/g) || []).length >= 2, 'Each card needs a substantive, multi-sentence paragraph.');
    for (const [field, known] of [['sources', sourceIds], ['connections', worldIds]]) {
      check(Array.isArray(l[field]) && l[field].length <= 200 && l[field].every(id => known.has(id)), 'Unknown source or connection.');
    }
    check(Array.isArray(l.acceptedReadings) && l.acceptedReadings.length > 0 && l.acceptedReadings.length <= 20 && l.acceptedReadings.includes(l.reading), 'Invalid accepted readings.');
    l.acceptedReadings.forEach(r => text(r, 'accepted reading', 300));
    const {contentHash, ...content} = l;
    check(contentHash === await digest(content), 'A paragraph failed its integrity check. Nothing was imported.');
  }
  for (const r of rows(data.routes || [], 'routes', 500)) {
    text(r.title, 'route title');
    check(Array.isArray(r.ids) && r.ids.length <= 1000 && r.ids.every(id => lessonIds.has(id)), 'Unknown paragraph in a route.');
  }
  check(data.contentDigest === await digest({edition:data.id, lessons}), 'The collection failed its integrity check. Nothing was imported.');
  return data;
}
export async function parseImport(value) {
  check(object(value), 'This is not a collection or progress backup.');
  if (value.format === 'john-threads-progress') return {progress:value};
  if (value.format === 'bunki-personal-backup') {
    check(value.version === 1, 'Unsupported backup version.');
    check(object(value.progress) && value.progress.format === 'john-threads-progress', 'The backup has no valid review history. Nothing was imported.');
    return {collection:await validateCollection(value.collection), progress:value.progress};
  }
  return {collection:await validateCollection(value)};
}
export function backup(record) {
  return {format:'bunki-personal-backup',version:1,exportedAt:new Date().toISOString(),collection:record.collection,progress:record.progress};
}
