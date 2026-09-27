/** Download the complete, exact public test before starting its clock.
 * Private imports never enter this shared public-asset cache. */
import { encodeLocalJson } from './modules/record-core.mjs';
const sha256 = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');
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
    if (!entry.availability?.ready || entry.review?.status !== 'ai-reviewed' ||
        !entry.formPath || !entry.deliveryPath || !/^[a-f0-9]{64}$/u.test(entry.deliverySha256 || '') ||
        entry.editorialAtStart?.status === 'unreviewed')
      throw new Error('assessment-not-admitted');
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
