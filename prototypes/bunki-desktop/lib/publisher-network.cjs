'use strict';
const https = require('node:https');
const { createHash } = require('node:crypto');
const { createFeedNetwork } = require('./feed-network.cjs');
class PublisherNetworkError extends Error { constructor(code) { super(code); this.code = code; } }
/** Existing DNS-pinned personal transport. Native options are not IPC. */
function createPublisherNetwork({ core, lookup, request = https.request, timeoutMs = 12_000, maxBytes = 2_000_000, now = Date.now } = {}) {
  if (typeof core?.publisherArticleRequest !== 'function') throw new Error('publisher-core-required');
  const network = createFeedNetwork({ ...(lookup ? { lookup } : {}), timeoutMs, maxBytes,
    request(options, listener) { return request({ ...options, headers: { ...options.headers, accept: 'text/html' } }, listener); },
  });
  async function fetchPlan(plan, signal) {
    let response;
    try { response = await network.fetchSource({ feed: { url: plan.url, redirectUrls: plan.allowedUrls.filter((url) => url !== plan.url) } }, {}, signal); }
    catch (error) {
      const codes = { 'feed-timeout': 'network-timeout', 'feed-cancelled': 'cancelled', 'unregistered-feed-url': 'redirect-rejected', 'feed-redirect-limit': 'redirect-rejected', 'invalid-feed-redirect': 'redirect-rejected', 'feed-size-limit': 'html-size-limit', 'invalid-feed-encoding': 'invalid-encoding', 'unexpected-content-encoding': 'invalid-encoding' };
      throw new PublisherNetworkError(codes[error.code] || 'network-error');
    }
    const contentType = response.headers['content-type'] || '';
    if (response.status === 200 && !/^text\/html(?:\s*;\s*charset\s*=\s*"?utf-?8"?)?\s*$/iu.test(contentType)) throw new PublisherNetworkError('unsupported-mime');
    let html = response.xml;
    if (typeof html === 'string' && Buffer.byteLength(html) !== response.bytes && createHash('sha256').update('\uFEFF' + html).digest('hex') === response.responseSha256) html = '\uFEFF' + html;
    return Object.freeze({ status: response.status, html, finalUrl: response.finalUrl, contentType, responseSha256: response.responseSha256, responseBytes: response.bytes, retryAfter: response.headers['retry-after'] || null, durationMs: response.durationMs });
  }
  return Object.freeze({ async fetchArticle(entry, selection, signal) {
    const plan = core.publisherArticleRequest(entry, selection);
    if (plan.selection.sourceId !== 'alma-ja') return fetchPlan(plan, signal);
    // The selected IDs fix the policy URL; neither renderer data nor HTML grants a destination.
    const policyPlan = core.publisherPolicyRequest(entry, selection);
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', forwardAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchPlan(policyPlan, controller.signal);
      if (response.status !== 200) throw new PublisherNetworkError(({ 403: 'http-forbidden', 404: 'http-not-found', 410: 'http-not-found', 429: 'http-rate-limited' })[response.status] || 'http-failed');
      const policy = { html: response.html, finalUrl: response.finalUrl, contentType: response.contentType, responseSha256: response.responseSha256, responseBytes: response.responseBytes, fetchedAt: new Date(now()).toISOString() };
      core.verifyAlmaPolicyResponse(policy); // A policy mismatch stops before body I/O.
      const article = await fetchPlan(plan, controller.signal);
      return Object.freeze({ ...article, policy });
    } catch (error) { if (timedOut) throw new PublisherNetworkError('network-timeout'); throw error; }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', forwardAbort); }
  }});
}
module.exports = { createPublisherNetwork, PublisherNetworkError };
