/** Download the complete, exact public test before starting its clock.
 * Private imports never enter this shared public-asset cache. */
import { encodeLocalJson } from './modules/record-core.mjs';
const sha256 = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');
// A separately labelled admission class: original written forms kept only where independent
// verifier model families agreed blind. The bank verifier keeps these equal to
// tools/assessment/machine-checked-class.mjs.
export const MACHINE_CHECK_ROUTE = 'machine-checked-written/1';
export const MACHINE_CHECK_POLICY = 'bunki-machine-check/1';
export const MACHINE_CHECK_LABEL = "検収前 · machine-checked, awaiting John's review";
export function machineCheckedEntry(entry) {
  return entry?.publicationRoute === MACHINE_CHECK_ROUTE && entry.mode === 'written' &&
    entry.review?.status === 'machine-checked' && entry.review?.label === MACHINE_CHECK_LABEL &&
    entry.editorialAtStart?.status === 'ai-reviewed-practice' &&
    entry.editorialAtStart?.policyVersion === MACHINE_CHECK_POLICY &&
    Array.isArray(entry.mediaAssets) && entry.mediaAssets.length === 0;
}
export const machineCheckedEditorial = editorial => editorial?.status === 'ai-reviewed-practice' &&
  editorial.policyVersion === MACHINE_CHECK_POLICY;
// A real exam paper the learner imported on this device for personal study (jlpt.jp policy §1(1)).
// It is never in the public catalog, never cached with public assets, and never leaves the device.
export const OFFICIAL_PRIVATE = 'official-private';
export const PRIVATE_ROUTE = 'device-private';
export const PRIVATE_PACK_SCHEMA = 'kairo-private-assessment-pack/1';
export const PRIVATE_DB_NAME = 'kairo-private-assessment';
export const PRIVATE_BASE_URL = 'https://kairo-private.invalid/';
export function officialPrivateEntry(entry) {
  return entry?.privatePack === true && entry.sourceClass === OFFICIAL_PRIVATE &&
    entry.publicationRoute === PRIVATE_ROUTE && entry.review?.status === OFFICIAL_PRIVATE &&
    typeof entry.review.label === 'string' && /^本物/u.test(entry.review.label) &&
    entry.editorialAtStart?.status === 'unreviewed' && entry.officialScoreCalibrated === false &&
    Array.isArray(entry.officialSections) && entry.officialSections.length > 0 &&
    typeof entry.formPath === 'string' && entry.formPath.startsWith('private/');
}
/** An entry the learner may start: host-reviewed exactly as before, the machine-checked class,
 * or a real paper imported into this device's private store. */
export function assessmentEntryAdmitted(entry) {
  if (entry?.sourceClass === OFFICIAL_PRIVATE || entry?.privatePack !== undefined)
    return officialPrivateEntry(entry) && entry.availability?.ready === true;
  if (!entry?.availability?.ready || !entry.editorialAtStart || entry.editorialAtStart.status === 'unreviewed') return false;
  if (entry.review?.status === 'ai-reviewed') return entry.publicationRoute !== MACHINE_CHECK_ROUTE;
  return machineCheckedEntry(entry);
}
export function assessmentAssetPath(path) {
  if (typeof path !== 'string') throw new TypeError('assessment-asset-path');
  if (!path.startsWith('data/assessment/')) path = `data/assessment/${path}`;
  if (!/^data\/assessment\/[a-zA-Z0-9_./-]+$/u.test(path) ||
      path.split('/').some(part => !part || part === '.' || part === '..')) throw new TypeError('assessment-asset-path');
  return path;
}
export function createAssessmentDelivery({ baseUrl, fetchAsset = fetch, cacheStorage = globalThis.caches }) {
  const base = new URL(baseUrl), urls = new Map();
  const cacheName = `kairo-assessment-public:${base.href}:1`;
  const url = path => new URL(assessmentAssetPath(path), base).href;
  async function openCache() {
    if (!cacheStorage) throw new Error('assessment-offline-storage-unavailable');
    return cacheStorage.open(cacheName);
  }
  async function responseFor(path, cache) {
    const address = url(path), stored = await cache.match(address);
    if (stored) return stored;
    const response = await fetchAsset(address);
    if (!response.ok) throw new Error('assessment-asset-unavailable');
    return response;
  }
  async function prepare(entry, validateForm) {
    if (!assessmentEntryAdmitted(entry) ||
        !entry.formPath || !entry.deliveryPath || !/^[a-f0-9]{64}$/u.test(entry.deliverySha256 || ''))
      throw new Error('assessment-not-admitted');
    const machineChecked = machineCheckedEntry(entry);
    const cache = await openCache();
    const formResponse = await responseFor(entry.formPath, cache);
    let form;
    try {
      form = validateForm(await formResponse.clone().json());
      if (form.id !== entry.id || form.sha256 !== entry.formSha256) throw new Error('assessment-form-changed');
    } catch (error) { await cache.delete(url(entry.formPath)); throw error; }
    const deliveryResponse = await responseFor(entry.deliveryPath, cache);
    let delivery;
    try {
    delivery = await deliveryResponse.clone().json();
    const sameRef = (ref, value, kind) => ref?.kind === kind && ref.id === value.id &&
      ref.revisionId === value.revisionId && ref.sha256 === value.sha256;
    if (encodeLocalJson(delivery).sha256 !== entry.deliverySha256 ||
        delivery.schema !== 'kairo-assessment-bank-delivery/1' || !sameRef(delivery.form, form, 'form') ||
        !Array.isArray(delivery.assets) || !Array.isArray(delivery.units)) throw new Error('assessment-delivery-changed');
    // A machine-checked form is strictly media-free and names its per-item provenance.
    if (machineChecked && (delivery.assets.length || delivery.units.length || form.media.length ||
        !Array.isArray(delivery.itemChecks) || delivery.itemChecks.length !== form.items.length ||
        delivery.itemChecks.some((row, index) => row?.itemId !== form.items[index].id)))
      throw new Error('assessment-delivery-changed');
    const unitIds = new Set(), unitMedia = new Set();
    for (const unit of delivery.units) {
      const media = form.media.find(row => sameRef(unit.media, row, 'media') && row.kind === 'audio');
      if (!['example', 'question'].includes(unit.kind) || typeof unit.id !== 'string' || !unit.id ||
          unitIds.has(unit.id) || unitMedia.has(unit.media?.sha256) || unit.stimulusPlayCount !== 1 ||
          typeof unit.printedOptions !== 'boolean' || !Array.isArray(unit.itemIds) || !unit.itemIds.length ||
          new Set(unit.itemIds).size !== unit.itemIds.length || !media ||
          unit.itemIds.some(id => !form.items.some(item => item.id === id &&
            item.media.some(ref => sameRef(ref, media, 'media')))))
        throw new Error('assessment-delivery-unit-changed');
      unitIds.add(unit.id); unitMedia.add(media.sha256);
      if (unit.kind === 'example') {
        const item = form.items.find(row => row.id === unit.itemIds[0]);
        const questionUnit = delivery.units.find(row => row.kind === 'question' && row.itemIds?.includes(item.id));
        if (unit.itemIds.length !== 1 || unit.printedOptions || !questionUnit ||
            delivery.units.indexOf(unit) >= delivery.units.indexOf(questionUnit) ||
            item.media.findIndex(ref => ref.sha256 === media.sha256) >=
              item.media.findIndex(ref => ref.sha256 === questionUnit.media?.sha256))
          throw new Error('assessment-example-order');
      }
    }
    if (form.media.some(media => media.kind === 'audio' && !unitMedia.has(media.sha256)) ||
        form.items.some(item => item.skill === 'listening' &&
          !delivery.units.some(unit => unit.kind === 'question' && unit.itemIds.includes(item.id))))
      throw new Error('assessment-missing-delivery-unit');
    } catch (error) { await cache.delete(url(entry.deliveryPath)); throw error; }
    const ids = new Set();
    for (const asset of delivery.assets) {
      if (ids.has(asset.assetId)) throw new Error('assessment-duplicate-asset');
      ids.add(asset.assetId);
      const media = form.media.find(row => row.assetId === asset.assetId);
      if (!media || media.bytesSha256 !== asset.bytesSha256 || media.mimeType !== asset.mimeType)
        throw new Error('assessment-media-changed');
      const response = await responseFor(asset.path, cache);
      const bytes = await response.arrayBuffer();
      if (await sha256(bytes) !== media.bytesSha256) {
        await cache.delete(url(asset.path)); throw new Error('assessment-media-changed');
      }
      // CacheStorage.put completion is part of admission. A quota failure must
      // happen here, before the learner's timed sitting exists.
      await cache.put(url(asset.path), new Response(bytes, { headers: { 'Content-Type': media.mimeType } }));
      urls.set(asset.assetId, { path: asset.path, sha256: media.bytesSha256, mimeType: media.mimeType });
    }
    if (form.media.some(media => !ids.has(media.assetId))) throw new Error('assessment-missing-media');
    await cache.put(url(entry.formPath), formResponse);
    await cache.put(url(entry.deliveryPath), deliveryResponse);
    return { form, delivery };
  }
  async function mediaBytes(assetId) {
    const asset = urls.get(assetId);
    if (!asset) throw new Error('assessment-media-not-prepared');
    const cache = await openCache();
    const stored = await cache.match(url(asset.path));
    const response = stored || await responseFor(asset.path, cache);
    const bytes = await response.arrayBuffer();
    if (await sha256(bytes) !== asset.sha256) {
      await cache.delete(url(asset.path)); throw new Error('assessment-media-changed');
    }
    if (!stored) await cache.put(url(asset.path), new Response(bytes, { headers: { 'Content-Type': asset.mimeType } }));
    return { bytes, mimeType: asset.mimeType };
  }
  async function mediaBlob(assetId) {
    const asset = await mediaBytes(assetId);
    return new Blob([asset.bytes], { type: asset.mimeType });
  }
  return { prepare, mediaBytes, mediaBlob };
}

const PACK_FILE = /^(?:form\.json|delivery\.json|media\/[a-f0-9]{64}\.mp3|pages\/[a-f0-9]{64}\.jpg)$/u;
const PACK_ID = /^[a-z0-9][a-z0-9-]{0,99}$/u;
const MAX_PACK_FILE = 64 * 1024 * 1024;
const MAX_MANIFEST = 4 * 1024 * 1024;
const packError = code => Object.assign(new Error(code), { code });
const storageError = error => error?.name === 'QuotaExceededError' ? error : packError('private-pack-storage');
const request = value => new Promise((resolve, reject) => {
  value.onsuccess = () => resolve(value.result); value.onerror = () => reject(storageError(value.error));
});
const settled = transaction => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(storageError(transaction.error));
  transaction.onabort = () => reject(storageError(transaction.error));
});
/** The pack as the learner picked it: one .kairo-private-pack file, or pack.json with its files. */
async function readPickedPack(files) {
  const picked = [...files];
  const single = picked.length === 1 ? picked[0] : null;
  if (single && !/pack\.json$/u.test(single.name)) {
    const head = new TextDecoder().decode(await single.slice(0, 64).arrayBuffer());
    const [schema, length] = head.split('\n');
    const size = Number(length);
    if (schema !== PRIVATE_PACK_SCHEMA || !Number.isSafeInteger(size) || size < 2 || size > MAX_MANIFEST)
      throw packError('private-pack-format');
    const start = schema.length + 1 + length.length + 1;
    const manifest = JSON.parse(new TextDecoder().decode(await single.slice(start, start + size).arrayBuffer()));
    let offset = start + size;
    const blobs = new Map();
    for (const file of Array.isArray(manifest?.files) ? manifest.files : []) {
      if (!Number.isSafeInteger(file?.bytes) || file.bytes < 1 || file.bytes > MAX_PACK_FILE) throw packError('private-pack-format');
      blobs.set(file.path, single.slice(offset, offset + file.bytes, file.mimeType)); offset += file.bytes;
    }
    if (offset !== single.size) throw packError('private-pack-format');
    return { manifest, blobs };
  }
  const packFile = picked.find(file => file.name === 'pack.json');
  if (!packFile || packFile.size > MAX_MANIFEST) throw packError('private-pack-format');
  const manifest = JSON.parse(await packFile.text());
  const blobs = new Map();
  for (const file of Array.isArray(manifest?.files) ? manifest.files : []) {
    const name = String(file?.path || '').split('/').at(-1);
    const match = picked.find(row => (row.webkitRelativePath || '').endsWith(`/${file.path}`)) ||
      picked.find(row => row.name === name);
    if (match) blobs.set(file.path, match);
  }
  return { manifest, blobs };
}
/** On-device store for imported official papers. Every byte is re-hashed before it is kept. */
export function createPrivateAssessmentStore({ indexedDB: database = globalThis.indexedDB, validateForm } = {}) {
  let opened = null;
  function open() {
    if (!database) return Promise.reject(packError('private-pack-storage'));
    opened ||= new Promise((resolve, reject) => {
      const opening = database.open(PRIVATE_DB_NAME, 1);
      opening.onupgradeneeded = () => {
        const db = opening.result;
        if (!db.objectStoreNames.contains('packs')) db.createObjectStore('packs', { keyPath: 'packId' });
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'key' });
      };
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => { opened = null; reject(opening.error || packError('private-pack-storage')); };
    });
    return opened;
  }
  async function packs() {
    const db = await open();
    return request(db.transaction('packs', 'readonly').objectStore('packs').getAll());
  }
  async function entries() {
    return (await packs()).map(pack => ({ ...pack.entry, privatePack: true, packId: pack.packId }));
  }
  async function importFiles(files) {
    if (typeof validateForm !== 'function') throw packError('private-pack-validator');
    const { manifest, blobs } = await readPickedPack(files);
    const entry = manifest?.entry;
    if (manifest?.schema !== PRIVATE_PACK_SCHEMA || !PACK_ID.test(manifest.packId || '') ||
        !Array.isArray(manifest.files) || manifest.files.length > 256 || !entry ||
        entry.sourceClass !== OFFICIAL_PRIVATE || entry.publicationRoute !== PRIVATE_ROUTE ||
        entry.formPath !== `private/${manifest.packId}/form.json` || entry.deliveryPath !== `private/${manifest.packId}/delivery.json` ||
        !officialPrivateEntry({ ...entry, privatePack: true }))
      throw packError('private-pack-format');
    const paths = new Set();
    const verified = [];
    for (const file of manifest.files) {
      if (!PACK_FILE.test(file?.path || '') || paths.has(file.path) || !/^[a-f0-9]{64}$/u.test(file.sha256 || '') ||
          !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > MAX_PACK_FILE)
        throw packError('private-pack-format');
      paths.add(file.path);
      const blob = blobs.get(file.path);
      if (!blob) throw packError('private-pack-incomplete');
      const bytes = await blob.arrayBuffer();
      if (bytes.byteLength !== file.bytes || await sha256(bytes) !== file.sha256) throw packError('private-pack-changed');
      // Bytes, not Blobs: WebKit cannot keep a Blob in IndexedDB in every browsing mode.
      verified.push({ file, bytes });
    }
    const json = path => JSON.parse(new TextDecoder().decode(verified.find(row => row.file.path === path)?.bytes || new ArrayBuffer(0)));
    let form, delivery;
    try { form = validateForm(json('form.json')); delivery = json('delivery.json'); }
    catch { throw packError('private-pack-changed'); }
    const officialPart = part => part?.provenance?.kind === OFFICIAL_PRIVATE && part.rights?.sync?.status === 'denied';
    if (form.id !== entry.id || form.sha256 !== entry.formSha256 || !officialPart(form) ||
        ![...form.items, ...form.passages, ...form.media].every(officialPart) ||
        encodeLocalJson(delivery).sha256 !== entry.deliverySha256 ||
        (delivery.assets || []).some(asset => !paths.has(String(asset.path || '').replace(`private/${manifest.packId}/`, '')) ||
          !String(asset.path).startsWith(`private/${manifest.packId}/media/`)))
      throw packError('private-pack-changed');
    const db = await open();
    const transaction = db.transaction(['packs', 'files'], 'readwrite');
    const done = settled(transaction);
    const fileStore = transaction.objectStore('files');
    for (const row of verified)
      fileStore.put({ key: `${manifest.packId}/${row.file.path}`, packId: manifest.packId, path: row.file.path,
        sha256: row.file.sha256, mimeType: row.file.mimeType, bytes: row.bytes });
    transaction.objectStore('packs').put({ packId: manifest.packId, formId: form.id, formSha256: form.sha256,
      importedAt: new Date().toISOString(), entry: { ...entry }, pages: manifest.pages || [],
      itemPages: manifest.itemPages || {}, passagePages: manifest.passagePages || {} });
    await done;
    return { packId: manifest.packId, entry: { ...entry, privatePack: true, packId: manifest.packId } };
  }
  async function remove(packId) {
    const db = await open();
    const keys = await request(db.transaction('files', 'readonly').objectStore('files').getAllKeys());
    const transaction = db.transaction(['packs', 'files'], 'readwrite');
    const done = settled(transaction);
    for (const key of keys) if (String(key).startsWith(`${packId}/`)) transaction.objectStore('files').delete(key);
    transaction.objectStore('packs').delete(packId);
    await done;
  }
  async function file(packId, path) {
    const db = await open();
    return request(db.transaction('files', 'readonly').objectStore('files').get(`${packId}/${path}`));
  }
  /** Resolves private/<pack>/<file> from this device only. No request ever names a private asset. */
  async function fetchAsset(address) {
    const url = new URL(address);
    const prefix = `${new URL(PRIVATE_BASE_URL).pathname}data/assessment/private/`;
    if (url.origin !== new URL(PRIVATE_BASE_URL).origin || !url.pathname.startsWith(prefix))
      return new Response(null, { status: 404 });
    const [packId, ...rest] = url.pathname.slice(prefix.length).split('/');
    const row = PACK_ID.test(packId) ? await file(packId, rest.join('/')) : null;
    return row ? new Response(row.bytes, { headers: { 'Content-Type': row.mimeType || 'application/octet-stream' } })
      : new Response(null, { status: 404 });
  }
  // Private bytes stay in their own database; nothing is copied into Cache Storage.
  const cacheStorage = { open: async () => ({ match: async () => undefined, put: async () => undefined, delete: async () => true }) };
  async function pageBlob(packId, sha) {
    if (!/^[a-f0-9]{64}$/u.test(sha || '')) return null;
    const row = await file(packId, `pages/${sha}.jpg`);
    if (!row) return null;
    if (await sha256(row.bytes) !== sha) throw packError('private-pack-changed');
    return new Blob([row.bytes], { type: 'image/jpeg' });
  }
  async function pack(packId) {
    const db = await open();
    return request(db.transaction('packs', 'readonly').objectStore('packs').get(packId));
  }
  return { entries, importFiles, remove, fetchAsset, cacheStorage, pageBlob, pack };
}
