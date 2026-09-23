/** Learner-supplied encounters. A saved pointer never triggers retrieval, and
 * supplied text does not establish authorship or remote processing rights. */
import { canonicalWebUrl, normalizeArticleIntake, parseArticleCandidate, parseTimedTranscript,
  userSuppliedTranscriptProvider, transcriptTimeRange, TRANSCRIPT_LIMITS, parseFileReference,
  parseFileTextObservation, reviewFileText, parseReviewedFileText, fileTextSourceRange, sameFileBytes, FILE_SOURCE_LIMITS } from './modules/reading-core.mjs';
import { parseSourceReferencePayload } from './modules/record-core.mjs';

export { TRANSCRIPT_LIMITS };
export { parseFileReference, parseFileTextObservation, reviewFileText, sameFileBytes, FILE_SOURCE_LIMITS };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SOURCE = Object.freeze({ id: 'learner-supplied', name: 'Personal capture',
  attribution: 'Supplied by the learner; authorship and source rights unverified.' });
const owned = new WeakSet();
export const SOURCE_INBOX_LIMITS = Object.freeze({ entries: 500, text: 120000, characters: 12000000 });
export class SourceInboxError extends TypeError {
  constructor(code) { super(code); this.name = 'SourceInboxError'; this.code = code; }
}
const fail = (code) => { throw new SourceInboxError(code); };
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function bounded(raw) {
  let nodes = 0, characters = 0;
  const ancestors = new Set();
  const visit = (value, depth) => {
    if (++nodes > 250000 || depth > 32) fail('inbox-capacity');
    if (typeof value === 'string') {
      characters += value.length;
      if (!value.isWellFormed()) fail('invalid-inbox-text');
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0)) fail('invalid-inbox-data');
    } else if (value !== null && typeof value === 'object') {
      if (ancestors.has(value) || Object.getOwnPropertySymbols(value).length ||
          (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) fail('invalid-inbox-data');
      const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(descriptors);
      if (keys.length > 20000 || (Array.isArray(value) && keys.length !== value.length + 1)) fail('invalid-inbox-data');
      ancestors.add(value);
      for (const key of keys) {
        if (Array.isArray(value) && key === 'length') continue;
        const descriptor = descriptors[key];
        if (!('value' in descriptor) || !descriptor.enumerable || !key.isWellFormed() ||
            (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/u.test(key))) fail('invalid-inbox-data');
        characters += key.length; visit(descriptor.value, depth + 1);
      }
      ancestors.delete(value);
    } else if (value !== null && typeof value !== 'boolean') fail('invalid-inbox-data');
    if (characters > SOURCE_INBOX_LIMITS.characters) fail('inbox-capacity');
  };
  visit(raw, 0);
}
function fields(raw, keys) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).length !== keys.length || !keys.every((key) => Object.hasOwn(raw, key))) fail('invalid-inbox-fields');
}
function uuid(value) { if (typeof value !== 'string' || !UUID.test(value)) fail('invalid-capture-id'); return value; }
function text(value, maximum) {
  // eslint-disable-next-line no-control-regex -- Prose accepts only tab and line breaks among controls.
  if (typeof value !== 'string' || value.length > maximum || !value.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)) fail('invalid-inbox-text');
  return value;
}
function encounterUrl(value) {
  if (value === null || value === '') return null;
  canonicalWebUrl(value); // Validate, but preserve the encountered fragment/timecode exactly.
  return value;
}
export function parseCaptureInput(raw) {
  bounded(raw); fields(raw, ['title', 'url', 'text']);
  return freeze({ title: text(raw.title, 500), url: text(raw.url, 4096), text: text(raw.text, SOURCE_INBOX_LIMITS.text) });
}
export function createSourceCapture(raw) {
  bounded(raw); fields(raw, ['id', 'capturedAt', 'title', 'url', 'text']);
  const id = uuid(raw.id), input = parseCaptureInput({ title: raw.title, url: raw.url, text: raw.text });
  const url = encounterUrl(input.url), body = input.text.trim() ? input.text : null;
  if (!body && !url) fail('capture-empty');
  // Explicit capture permits local reading/retention/quotation only. Every
  // other operation remains unknown; the URL and portable record are data.
  const allowed = { status: 'allowed', basis: { kind: 'user-action', reference: `local-capture:${id}`, checkedAt: raw.capturedAt } };
  const capabilities = { 'discover-metadata': allowed };
  if (body) for (const operation of ['display-body', 'retain-offline', 'quote-extract']) capabilities[operation] = allowed;
  const title = input.title.trim() ? input.title : body
    ? [...body.trim().split(/\r?\n/u)[0]].slice(0, 80).join('') : new URL(url).hostname;
  const candidate = normalizeArticleIntake({ itemId: id, canonicalUrl: url, title,
    body: body === null ? null : { text: body } }, {
    source: SOURCE, lineage: { kind: 'user-supplied' }, capabilities,
    provenance: [{ sourceId: SOURCE.id, sourceVersion: null, sourceUrl: url,
      attribution: SOURCE.attribution, license: 'Not established; private learner capture only.',
      modification: 'unmodified', evidenceRef: null, retrievedAt: raw.capturedAt }],
  });
  return freeze({ id, encounterUrl: url, capturedAt: raw.capturedAt, candidate });
}
function parseCapture(raw, fileEntry = null) {
  fields(raw, ['id', 'encounterUrl', 'capturedAt', 'candidate']);
  const candidate = parseArticleCandidate(raw.candidate);
  const expected = fileEntry ? createFileCapture({ id: raw.id, capturedAt: raw.capturedAt,
    title: candidate.article.title, file: fileEntry.file, document: fileEntry.document })
    : createSourceCapture({ id: raw.id, capturedAt: raw.capturedAt,
      title: candidate.article.title, url: raw.encounterUrl ?? '', text: candidate.article.body?.text ?? '' });
  // Recompute the entire current intake contract, including policy/provenance.
  // A recomputed content digest cannot upgrade a portable capability claim.
  if (JSON.stringify(candidate) !== JSON.stringify(expected.candidate) || raw.encounterUrl !== expected.encounterUrl)
    fail('capture-contract-mismatch');
  return expected;
}
export function parseSourceInbox(raw) {
  if (raw == null) raw = { version: 1, entries: [] };
  if (owned.has(raw)) return raw;
  bounded(raw);
  fields(raw, raw.version === 4 ? ['version', 'entries', 'listening', 'excerpts', 'transcripts', 'files']
    : raw.version === 3 ? ['version', 'entries', 'listening', 'excerpts', 'transcripts']
    : raw.version === 2 ? ['version', 'entries', 'listening', 'excerpts'] : ['version', 'entries']);
  if (![1, 2, 3, 4].includes(raw.version) || !Array.isArray(raw.entries)) fail('invalid-source-inbox');
  if (raw.entries.length > SOURCE_INBOX_LIMITS.entries) fail('inbox-capacity');
  const files = raw.version === 4 ? parseFileEntries(raw.files) : [];
  const fileById = new Map(files.map((entry) => [entry.captureId, entry]));
  const entries = raw.entries.map((entry) => parseCapture(entry, fileById.get(entry.id)));
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) fail('duplicate-capture');
  let result;
  if (raw.version === 1) result = { version: 1, entries };
  else {
    if (!Array.isArray(raw.listening) || !Array.isArray(raw.excerpts) ||
        raw.listening.length > entries.length || raw.excerpts.length > entries.length) fail('invalid-listening-library');
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const listening = raw.listening.map((entry) => {
      fields(entry, ['sourceId', 'kind', 'creator', 'position']);
      const sourceId = uuid(entry.sourceId);
      if (!byId.get(sourceId)?.encounterUrl || !['video', 'podcast'].includes(entry.kind)) fail('invalid-listening-source');
      let position = null;
      if (entry.position !== null) {
        fields(entry.position, ['seconds', 'revision', 'confirmedAt']);
        position = { seconds: mediaSeconds(entry.position.seconds), revision: uuid(entry.position.revision), confirmedAt: instant(entry.position.confirmedAt) };
      }
      return { sourceId, kind: entry.kind, creator: text(entry.creator, 500), position };
    });
    if (new Set(listening.map((entry) => entry.sourceId)).size !== listening.length) fail('duplicate-listening-source');
    const registered = new Set(listening.map((entry) => entry.sourceId));
    const excerpts = raw.excerpts.map((entry) => {
      fields(entry, ['captureId', 'sourceId', 'startSeconds', 'endSeconds', 'provenance']);
      fields(entry.provenance, ['kind', 'suppliedAt']);
      const captureId = uuid(entry.captureId), sourceId = uuid(entry.sourceId);
      const child = byId.get(captureId), parent = byId.get(sourceId);
      const startSeconds = mediaSeconds(entry.startSeconds), endSeconds = entry.endSeconds === null ? null : mediaSeconds(entry.endSeconds);
      if (!child?.candidate.article.body || !registered.has(sourceId) || registered.has(captureId) ||
          child.encounterUrl !== parent.encounterUrl || (endSeconds !== null && endSeconds <= startSeconds) ||
          entry.provenance.kind !== 'user-supplied' || entry.provenance.suppliedAt !== child.capturedAt) fail('invalid-listening-excerpt');
      return { captureId, sourceId, startSeconds, endSeconds, provenance: { kind: 'user-supplied', suppliedAt: instant(entry.provenance.suppliedAt) } };
    });
    if (new Set(excerpts.map((entry) => entry.captureId)).size !== excerpts.length) fail('duplicate-listening-excerpt');
    result = { version: raw.version, entries, listening, excerpts };
    if (raw.version >= 3) {
      if (!Array.isArray(raw.transcripts) || raw.transcripts.length > entries.length) fail('invalid-transcript-library');
      const excerptIds = new Set(excerpts.map((entry) => entry.captureId));
      const transcripts = raw.transcripts.map((entry) => {
        fields(entry, ['captureId', 'sourceId', 'document', 'provenance']); fields(entry.provenance, ['kind', 'suppliedAt']);
        const captureId = uuid(entry.captureId), sourceId = uuid(entry.sourceId), child = byId.get(captureId), parent = byId.get(sourceId);
        const document = parseTimedTranscript(entry.document);
        if (!child || !registered.has(sourceId) || registered.has(captureId) || excerptIds.has(captureId) ||
            child.encounterUrl !== parent.encounterUrl || child.candidate.article.body?.text !== document.body ||
            child.candidate.article.body?.contentSha256 !== document.bodySha256 || entry.provenance.kind !== 'user-supplied' ||
            entry.provenance.suppliedAt !== child.capturedAt) fail('invalid-listening-transcript');
        return { captureId, sourceId, document, provenance: { kind: 'user-supplied', suppliedAt: instant(entry.provenance.suppliedAt) } };
      });
      if (new Set(transcripts.map((entry) => entry.captureId)).size !== transcripts.length) fail('duplicate-transcript');
      result.transcripts = transcripts;
    }
    if (raw.version === 4) {
      const linked = new Set([...listening.map(e => e.sourceId), ...excerpts.map(e => e.captureId), ...result.transcripts.map(e => e.captureId)]);
      for (const entry of files) {
        const child = byId.get(entry.captureId), parent = fileById.get(entry.sourceId);
        if (!child || linked.has(entry.captureId) || child.capturedAt !== entry.provenance.suppliedAt ||
            (entry.sourceId !== null && (!parent || parent.sourceId !== null || parent.document !== null || !entry.document ||
              entry.sourceId === entry.captureId || !sameFileBytes(parent.file, entry.file)))) fail('invalid-file-source');
      }
      result.files = files;
    }
  }
  freeze(result); owned.add(result); return result;
}
export function acceptSourceCapture(raw, capture) {
  const inbox = parseSourceInbox(raw); bounded(capture);
  const entry = parseCapture(capture), previous = inbox.entries.find((item) => item.id === entry.id);
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(entry)) fail('capture-conflict');
    return inbox;
  }
  return parseSourceInbox({ ...inbox, entries: [...inbox.entries, entry] });
}
export function selectSourceCapture(raw, id) {
  return parseSourceInbox(raw).entries.find((entry) => entry.id === uuid(id)) || null;
}

/** Link metadata only. This parser supplies neither an actor nor source rights. */
export function parseSourceReferenceInput(raw) {
  bounded(raw); fields(raw, ['captureId', 'encounterUrl', 'capturedAt']);
  const payload = parseSourceReferencePayload({ kind: 'source.reference', ...raw, generation: null });
  return freeze({ captureId: payload.captureId, encounterUrl: payload.encounterUrl, capturedAt: payload.capturedAt });
}
export function createSourceReferenceCapture(raw) {
  const input = parseSourceReferenceInput(raw);
  return createSourceCapture({ id: input.captureId, capturedAt: input.capturedAt,
    url: input.encounterUrl, title: '', text: '' });
}
/** Only an exact existing default-title, body-free capture is transferable. */
export function sourceReferenceInputForCapture(raw) {
  bounded(raw);
  if (!raw?.encounterUrl || raw.candidate?.article?.body) return null;
  const capture = parseCapture(raw);
  const input = parseSourceReferenceInput({ captureId: capture.id, encounterUrl: capture.encounterUrl, capturedAt: capture.capturedAt });
  return JSON.stringify(createSourceReferenceCapture(input)) === JSON.stringify(capture) ? input : null;
}
export function sourceReferenceIntent(raw) {
  const input = parseSourceReferenceInput(raw);
  return freeze({ payload: parseSourceReferencePayload({ kind: 'source.reference', ...input, generation: null }), dependencies: [] });
}
/** Callers supply views derived from their current owned replica, not user data.
 * A new local capture never revives a deleted or ambiguous reference identity. */
export function prepareSourceReferenceCapture(rawInbox, views, raw) {
  const intent = sourceReferenceIntent(raw), capture = createSourceReferenceCapture(raw);
  const view = views.find((entry) => entry.captureId === capture.id);
  if (view) {
    if (!view.headReferences.length || view.projection.tombstones.length) fail('source-reference-hidden');
    if (view.headReferences.length !== 1 || view.projection.requiresChoice ||
        JSON.stringify(view.headReferences[0].payload) !== JSON.stringify(intent.payload)) fail('source-reference-conflict');
  }
  return freeze({ capture, inbox: acceptSourceCapture(rawInbox, capture), intent });
}
/** Structural display adapter only; the owning app proves view scope/freshness.
 * Received pointers are derived and never replace local bodies or create roots. */
export function sourceReferenceShelf(rawInbox, views) {
  const inbox = parseSourceInbox(rawInbox), entries = new Map(inbox.entries.map((entry) => [entry.id, entry]));
  const enriched = new Set([...(inbox.listening || []), ...(inbox.excerpts || []),
    ...(inbox.transcripts || []), ...(inbox.files || [])].flatMap(entry => [entry.sourceId, entry.captureId]).filter(Boolean));
  const conflicts = [], hiddenIds = [];
  for (const view of views) {
    const captureId = uuid(view.captureId), local = entries.get(captureId);
    // A remote pointer's deletion does not delete locally attached media,
    // saved places, transcript children or files from their ordinary route.
    const localReference = local && !enriched.has(captureId) && sourceReferenceInputForCapture(local);
    const choices = view.headReferences.map((head) => {
      const payload = parseSourceReferencePayload(head.payload);
      if (payload.captureId !== captureId) fail('source-reference-conflict');
      return createSourceReferenceCapture({ captureId, encounterUrl: payload.encounterUrl, capturedAt: payload.capturedAt });
    });
    if (!choices.length) {
      if (localReference) entries.delete(captureId);
      hiddenIds.push(captureId); continue;
    }
    const differs = local && JSON.stringify(local) !== JSON.stringify(choices[0]);
    if (choices.length !== 1 || view.projection.requiresChoice || differs) {
      if (localReference) entries.delete(captureId);
      const distinct = new Map([...(local ? [local] : []), ...choices].map(entry => [JSON.stringify(entry), entry]));
      conflicts.push({ captureId, captures: [...distinct.values()] });
      continue;
    }
    if (!local) entries.set(captureId, choices[0]);
  }
  return freeze({ entries: [...entries.values()], conflicts, hiddenIds });
}

// Listening metadata records the learner's declarations, never transcript
// ownership, playback completion, article rights or processing permission.
const MAX_MEDIA_SECONDS = 7 * 24 * 60 * 60;
function mediaSeconds(value) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > MAX_MEDIA_SECONDS) fail('invalid-media-time');
  return value;
}
function instant(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('invalid-capture-time');
  return value;
}
export function parseMediaTime(value) {
  text(value, 20);
  const raw = value.trim();
  if (!/^\d{1,6}(?::[0-5]\d){0,2}$/u.test(raw)) fail('invalid-media-time');
  return mediaSeconds(raw.split(':').reduce((sum, part) => sum * 60 + Number(part), 0));
}
export function formatMediaTime(value) {
  const seconds = mediaSeconds(value), minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
  return hours ? `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
function listeningInbox(raw) {
  const inbox = parseSourceInbox(raw);
  return inbox.version >= 2 ? inbox : { version: 2, entries: inbox.entries, listening: [], excerpts: [] };
}
export function selectListeningSource(raw, id) {
  return listeningInbox(raw).listening.find((entry) => entry.sourceId === uuid(id)) || null;
}
export function selectListeningExcerpt(raw, id) {
  return listeningInbox(raw).excerpts.find((entry) => entry.captureId === uuid(id)) || null;
}
export function selectListeningTranscript(raw, id) {
  const captureId = uuid(id);
  return (parseSourceInbox(raw).transcripts || []).find((entry) => entry.captureId === captureId) || null;
}
export function selectListeningTranscriptRange(raw, id, selection) {
  const transcript = selectListeningTranscript(raw, id);
  return transcript ? transcriptTimeRange(transcript.document, selection) : null;
}
export function previewListeningTranscript(input) {
  bounded(input); return userSuppliedTranscriptProvider.read(input);
}
export function addListeningTranscript(raw, sourceId, input) {
  bounded(input); fields(input, ['id', 'capturedAt', 'input']);
  const current = listeningInbox(raw), source = selectSourceCapture(current, sourceId);
  if (!selectListeningSource(current, sourceId)) fail('listening-source-required');
  const inbox = current.version >= 3 ? current : { ...current, version: 3, transcripts: [] };
  const result = userSuppliedTranscriptProvider.read(input.input);
  if (result.status !== 'available') fail('transcript-required');
  const document = result.document;
  const capture = createSourceCapture({ id: input.id, capturedAt: input.capturedAt, text: document.body, url: source.encounterUrl,
    title: `${[...source.candidate.article.title].slice(0, 120).join('')} · ${document.input.name}` });
  const link = { captureId: capture.id, sourceId, document, provenance: { kind: 'user-supplied', suppliedAt: capture.capturedAt } };
  const next = acceptSourceCapture(inbox, capture), previous = next.transcripts.find((entry) => entry.captureId === capture.id);
  if (previous) { if (JSON.stringify(previous) !== JSON.stringify(link)) fail('capture-conflict'); return next; }
  return parseSourceInbox({ ...next, transcripts: [...next.transcripts, link] });
}
export function registerListeningSource(raw, input) {
  bounded(input); fields(input, ['sourceId', 'kind', 'creator']);
  const inbox = listeningInbox(raw), sourceId = uuid(input.sourceId);
  const prior = inbox.listening.find((entry) => entry.sourceId === sourceId);
  return parseSourceInbox({ ...inbox, listening: [...inbox.listening.filter((entry) => entry.sourceId !== sourceId),
    { sourceId, kind: input.kind, creator: input.creator, position: prior?.position || null }] });
}
export function confirmListeningPosition(raw, input) {
  bounded(input); fields(input, ['sourceId', 'seconds', 'revision', 'confirmedAt', 'expectedRevision']);
  const inbox = listeningInbox(raw), sourceId = uuid(input.sourceId);
  const source = inbox.listening.find((entry) => entry.sourceId === sourceId);
  if (!source) fail('listening-source-required');
  if (input.expectedRevision !== null) uuid(input.expectedRevision);
  if ((source.position?.revision || null) !== input.expectedRevision) fail('listening-position-conflict');
  const position = { seconds: mediaSeconds(input.seconds), revision: uuid(input.revision), confirmedAt: instant(input.confirmedAt) };
  if (source.position?.revision === position.revision) fail('listening-position-conflict');
  return parseSourceInbox({ ...inbox, listening: inbox.listening.map((entry) => entry === source ? { ...entry, position } : entry) });
}
export function addListeningExcerpt(raw, sourceId, input) {
  bounded(input); fields(input, ['id', 'capturedAt', 'text', 'startSeconds', 'endSeconds']);
  const inbox = listeningInbox(raw), source = selectSourceCapture(inbox, sourceId);
  if (!selectListeningSource(inbox, sourceId)) fail('listening-source-required');
  const startSeconds = mediaSeconds(input.startSeconds), endSeconds = input.endSeconds === null ? null : mediaSeconds(input.endSeconds);
  if (!text(input.text, SOURCE_INBOX_LIMITS.text).trim() || (endSeconds !== null && endSeconds <= startSeconds)) fail('invalid-listening-excerpt');
  const capture = createSourceCapture({ id: input.id, capturedAt: input.capturedAt, text: input.text, url: source.encounterUrl,
    title: `${[...source.candidate.article.title].slice(0, 120).join('')} · ${formatMediaTime(startSeconds)}` });
  const link = { captureId: capture.id, sourceId, startSeconds, endSeconds, provenance: { kind: 'user-supplied', suppliedAt: capture.capturedAt } };
  const next = acceptSourceCapture(inbox, capture), previous = next.excerpts.find((entry) => entry.captureId === capture.id);
  if (previous) { if (JSON.stringify(previous) !== JSON.stringify(link)) fail('capture-conflict'); return next; }
  return parseSourceInbox({ ...next, excerpts: [...next.excerpts, link] });
}
/** A pure external-link adapter. It performs no retrieval and records no
 * progress. Other providers retain their exact URL with a manual resume hint. */
export function listeningResumeLink(value, seconds) {
  encounterUrl(value); mediaSeconds(seconds);
  const url = new URL(value), host = url.hostname.toLowerCase();
  let id = null;
  if (host === 'youtu.be' && /^\/[A-Za-z0-9_-]{11}$/u.test(url.pathname)) id = url.pathname.slice(1);
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
    if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) id = url.searchParams.get('v');
    else if (/^\/(shorts|live|embed)\/[A-Za-z0-9_-]{11}$/u.test(url.pathname)) id = url.pathname.split('/')[2];
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/u.test(id)) return freeze({ url: value, timestampLink: false });
  return freeze({ url: `https://www.youtube.com/watch?v=${id}&t=${seconds}s`, timestampLink: true });
}

function parseExcerptInput(raw) {
  bounded(raw); fields(raw, ['text', 'start', 'end']);
  return freeze({ text: text(raw.text, SOURCE_INBOX_LIMITS.text), start: text(raw.start, 20), end: text(raw.end, 20) });
}
export function createListeningExcerptRecovery(options) {
  const sourceId = uuid(options.sourceId);
  return createInputRecovery({ ...options, key: `kairo-listening-excerpt-draft-v1:${options.databaseName}:${sourceId}`, parseInput: parseExcerptInput });
}
function parseTranscriptInput(raw) {
  bounded(raw); fields(raw, ['origin', 'format', 'name', 'text']);
  if (!['file', 'paste'].includes(raw.origin) || !['webvtt', 'srt'].includes(raw.format)) fail('invalid-transcript-input');
  return freeze({ origin: raw.origin, format: raw.format, name: text(raw.name, 255), text: text(raw.text, TRANSCRIPT_LIMITS.characters) });
}
export function createListeningTranscriptRecovery(options) {
  const sourceId = uuid(options.sourceId);
  return createInputRecovery({ ...options, key: `kairo-listening-transcript-draft-v1:${options.databaseName}:${sourceId}`, parseInput: parseTranscriptInput });
}

function parseFileEntries(raw) {
  if (!Array.isArray(raw) || raw.length > SOURCE_INBOX_LIMITS.entries) fail('invalid-file-library');
  const entries = raw.map(entry => {
    fields(entry, ['captureId', 'sourceId', 'file', 'document', 'provenance']); fields(entry.provenance, ['kind', 'suppliedAt']);
    if (entry.provenance.kind !== 'learner-file') fail('invalid-file-provenance');
    const captureId = uuid(entry.captureId), sourceId = entry.sourceId === null ? null : uuid(entry.sourceId);
    const file = parseFileReference(entry.file), document = entry.document === null ? null : parseReviewedFileText(entry.document);
    if (document && (JSON.stringify(document.observation.file) !== JSON.stringify(file) || !document.body.trim())) fail('file-text-empty');
    return { captureId, sourceId, file, document, provenance: { kind: 'learner-file', suppliedAt: instant(entry.provenance.suppliedAt) } };
  });
  if (new Set(entries.map(e => e.captureId)).size !== entries.length) fail('duplicate-file-source');
  return entries;
}
function createFileCapture({ id, capturedAt, title, file, document }) {
  uuid(id); instant(capturedAt); text(title, 500);
  const allowed = { status: 'allowed', basis: { kind: 'user-action', reference: `local-capture:${id}`, checkedAt: capturedAt } };
  const capabilities = { 'discover-metadata': allowed };
  if (document) for (const operation of ['display-body', 'retain-offline', 'quote-extract']) capabilities[operation] = allowed;
  const attribution = 'Learner-supplied file; extraction and corrections are unverified observations.';
  const candidate = normalizeArticleIntake({ itemId: id, canonicalUrl: null, title: title.trim() ? title : file.name,
    ...(document === null ? { fileReference: file } : {}),
    body: document === null ? null : { text: document.body } }, {
    source: { id: 'learner-file', name: 'Personal file', attribution }, lineage: { kind: 'user-supplied' }, capabilities,
    provenance: [{ sourceId: 'learner-file', sourceVersion: file.sha256, sourceUrl: null, attribution,
      license: 'Not established; private learner capture only.', modification: document ? 'derived' : 'unmodified',
      evidenceRef: `supplied-file:${file.sha256}`, retrievedAt: capturedAt }],
  });
  return freeze({ id, encounterUrl: null, capturedAt, candidate });
}
export function addFileCapture(raw, input) {
  bounded(input); fields(input, ['id', 'capturedAt', 'title', 'sourceId', 'file', 'document']);
  const current = parseSourceInbox(raw), inbox = current.version === 4 ? current
    : { ...current, version: 4, listening: current.listening || [], excerpts: current.excerpts || [], transcripts: current.transcripts || [], files: [] };
  const [link] = parseFileEntries([{ captureId: input.id, sourceId: input.sourceId, file: input.file, document: input.document,
    provenance: { kind: 'learner-file', suppliedAt: input.capturedAt } }]);
  const entry = createFileCapture({ ...input, file: link.file, document: link.document });
  const previous = inbox.entries.find(e => e.id === entry.id), priorLink = inbox.files.find(e => e.captureId === entry.id);
  if (previous || priorLink) {
    if (JSON.stringify(previous) !== JSON.stringify(entry) || JSON.stringify(priorLink) !== JSON.stringify(link)) fail('capture-conflict');
    return inbox;
  }
  return parseSourceInbox({ ...inbox, entries: [...inbox.entries, entry], files: [...inbox.files, link] });
}
export function selectFileCapture(raw, id) {
  const captureId = uuid(id);
  return (parseSourceInbox(raw).files || []).find(e => e.captureId === captureId) || null;
}
export function selectFileTextRange(raw, id, selection) {
  const file = selectFileCapture(raw, id);
  return file?.document ? fileTextSourceRange(file.document, selection) : null;
}
function parseFileDraft(raw) {
  bounded(raw); fields(raw, ['title', 'sourceId', 'file', 'observation', 'reviewedPages']);
  const title = text(raw.title, 500), sourceId = raw.sourceId === null ? null : uuid(raw.sourceId), file = parseFileReference(raw.file);
  if (raw.observation === null) {
    if (!Array.isArray(raw.reviewedPages) || raw.reviewedPages.length) fail('invalid-file-draft');
    return freeze({ title, sourceId, file, observation: null, reviewedPages: [] });
  }
  const reviewed = reviewFileText(raw.observation, raw.reviewedPages);
  if (JSON.stringify(reviewed.observation.file) !== JSON.stringify(file)) fail('invalid-file-draft');
  return freeze({ title, sourceId, file, observation: reviewed.observation, reviewedPages: reviewed.reviewedPages });
}
export function createFileCaptureRecovery(options) {
  return createInputRecovery({ ...options, key: `kairo-file-capture-draft-v1:${options.databaseName}`, parseInput: parseFileDraft, maximum: 3000000 });
}

/** Installation-bound composer recovery, separate from the saved source
 * library. Clear only the exact submitted edit after its record commit. */
export function createCaptureRecovery(options) {
  return createInputRecovery({ ...options, key: `kairo-source-capture-draft-v1:${options.databaseName}`, parseInput: parseCaptureInput });
}
function createInputRecovery({ storage, installationText, assertCurrent, key, parseInput, maximum = 1000000 }) {
  const current = () => { if (assertCurrent() !== true) fail('capture-owner-changed'); };
  const read = () => {
    current(); const raw = storage.getItem(key);
    if (raw === null) return null;
    if (raw.length > maximum) fail('capture-recovery-unreadable');
    let value;
    try { value = JSON.parse(raw); } catch { fail('capture-recovery-unreadable'); }
    bounded(value); fields(value, ['version', 'installation', 'revision', 'editedAt', 'input']);
    if (value.version !== 1 || value.installation !== installationText ||
        typeof value.editedAt !== 'string' || !Number.isFinite(Date.parse(value.editedAt)) ||
        new Date(value.editedAt).toISOString() !== value.editedAt) fail('capture-recovery-unreadable');
    return freeze({ version: 1, installation: installationText, revision: uuid(value.revision), editedAt: value.editedAt, input: parseInput(value.input) });
  };
  return Object.freeze({ read,
    edit(input, revision, editedAt) {
      read(); // Malformed/foreign bytes remain intact, including on first edit.
      if (typeof editedAt !== 'string' || !Number.isFinite(Date.parse(editedAt)) || new Date(editedAt).toISOString() !== editedAt) fail('invalid-capture-time');
      const value = { version: 1, installation: installationText, revision: uuid(revision), editedAt, input: parseInput(input) };
      const serialized = JSON.stringify(value);
      if (serialized.length > maximum) fail('capture-recovery-unreadable');
      current(); storage.setItem(key, serialized); return freeze(value);
    },
    consume(revision) {
      const value = read();
      if (value?.revision !== uuid(revision)) return false;
      current(); storage.removeItem(key); return true;
    },
  });
}
