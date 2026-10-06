'use strict';

const { createPublisherNetwork } = require('./publisher-network.cjs');

/** Renderer input contains IDs only. resolveEntry is supplied by trusted feed memory. */
function createPublisherReader({ core, resolveEntry, network, now = Date.now, enabled = () => true, onEvent = () => {} }) {
  if (typeof resolveEntry !== 'function' || typeof enabled !== 'function') throw new Error('publisher-entry-resolver-required');
  const transport = network || createPublisherNetwork({ core, now });
  const inFlight = new Map();
  const controllers = new Set();
  let closed = false;
  const instant = () => new Date(now()).toISOString();

  async function perform(selection) {
    const original = await resolveEntry(selection);
    if (!original) throw new core.PublisherReaderError('entry-unavailable');
    // Membership and immutable feed revision are checked before deriving a URL.
    const entry = core.parseFeedEntry(original);
    if (entry.id !== selection.entryId || entry.sourceId !== selection.sourceId || entry.publisherId !== selection.sourceId) throw new core.PublisherReaderError('entry-unavailable');
    if (entry.revisionId !== selection.revisionId) throw new core.PublisherReaderError('entry-revised');
    if (closed || !enabled()) return core.createPublisherLink(entry, closed ? 'cancelled' : 'policy-disabled', instant());
    const controller = new AbortController();
    controllers.add(controller);
    let result;
    let response;
    try {
      response = await transport.fetchArticle(entry, selection, controller.signal);
      const current = await resolveEntry(selection);
      if (closed) result = core.createPublisherLink(entry, 'cancelled', instant());
      else if (!enabled()) result = core.createPublisherLink(entry, 'policy-disabled', instant());
      else if (!current || current.id !== entry.id) result = core.createPublisherLink(entry, 'entry-unavailable', instant());
      else if (core.validatePublisherFeedEntry(current, selection).revisionId !== entry.revisionId) result = core.createPublisherLink(entry, 'entry-revised', instant());
      else if (response.status !== 200) {
        const reason = ({ 403: 'http-forbidden', 404: 'http-not-found', 410: 'http-not-found', 429: 'http-rate-limited' })[response.status] || 'http-failed';
        result = core.createPublisherLink(entry, reason, instant());
      } else result = core.createSelectedPublisherArticle(entry, {
        html: response.html, finalUrl: response.finalUrl, contentType: response.contentType,
        responseSha256: response.responseSha256, responseBytes: response.responseBytes, fetchedAt: instant(),
      }, response.policy);
    } catch (error) {
      const reason = core.PUBLISHER_LINK_REASONS.includes(error.code) ? error.code : 'network-error';
      result = core.createPublisherLink(entry, reason, instant());
    } finally { controllers.delete(controller); }
    const verified = core.parsePublisherReadResult(result, selection);
    onEvent({ sourceId: selection.sourceId, entryId: selection.entryId,
      status: verified.status, reason: verified.reason,
      policyResponseSha256: response?.policy?.responseSha256 || null,
      httpStatus: response?.status || null, responseSha256: response?.responseSha256 || null,
      responseBytes: response?.responseBytes || 0, durationMs: response?.durationMs || null,
      articleVersionId: verified.candidate.article.versionId,
      contentSha256: verified.candidate.article.body?.contentSha256 || null,
      characters: verified.candidate.article.body?.text.length || 0 });
    return verified;
  }

  function read(raw) {
    const selection = core.parsePublisherReadSelection(raw);
    const key = selection.entryId + ':' + selection.revisionId;
    // A renderer cannot turn distinct known IDs into an unbounded fetch queue.
    if (!inFlight.has(key) && inFlight.size >= 2) throw new core.PublisherReaderError('reader-busy');
    if (!inFlight.has(key)) inFlight.set(key, perform(selection).finally(() => inFlight.delete(key)));
    return inFlight.get(key);
  }
  return Object.freeze({ read, async close() {
    closed = true;
    for (const controller of controllers) controller.abort();
    await Promise.allSettled(inFlight.values());
  } });
}

module.exports = { createPublisherReader };
