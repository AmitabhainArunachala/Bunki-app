'use strict';

const dns = require('node:dns/promises');
const https = require('node:https');
const { isIP } = require('node:net');
const { createHash } = require('node:crypto');

class FeedNetworkError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 88 && c === 99)
      || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6 || address.includes('%') || address.includes('.')) return false;
  const [left, right = ''] = address.toLowerCase().split('::');
  const before = left ? left.split(':') : [];
  const after = right ? right.split(':') : [];
  const words = [...before, ...Array(8 - before.length - after.length).fill('0'), ...after].map((word) => parseInt(word, 16));
  // Only global unicast. Exclude special-purpose 2001::/23, 6to4 and
  // documentation ranges, including the newer 3fff::/20 allocation.
  return words[0] >= 0x2000 && words[0] <= 0x3fff
    && !(words[0] === 0x2001 && (words[1] < 0x0200 || words[1] === 0x0db8))
    && words[0] !== 0x2002 && !(words[0] === 0x3fff && words[1] < 0x1000);
}

function checkedUrl(value, allowed) {
  let url;
  try { url = new URL(value); } catch { throw new FeedNetworkError('invalid-feed-url'); }
  if (url.href !== value || !allowed.has(value) || url.protocol !== 'https:'
    || url.username || url.password || url.hash || (url.port && url.port !== '443')
    || isIP(url.hostname) || url.hostname.startsWith('[')) throw new FeedNetworkError('unregistered-feed-url');
  return url;
}

function conditionHeaders(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new FeedNetworkError('invalid-feed-headers');
  for (const [key, value] of Object.entries(headers)) {
    if (!['if-none-match', 'if-modified-since'].includes(key) || typeof value !== 'string'
      || value.length > 1024 || !/^[\x20-\x7e]+$/u.test(value)) throw new FeedNetworkError('invalid-feed-headers');
  }
  return { ...headers };
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new FeedNetworkError(signal.reason === 'feed-timeout' ? 'feed-timeout' : 'feed-cancelled'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Dependencies are Node-only test seams; no renderer receives this factory. */
function createFeedNetwork({ lookup = dns.lookup, request = https.request, timeoutMs = 12_000, maxBytes = 2_000_000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000
    || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 2_000_000) throw new FeedNetworkError('invalid-network-limits');

  async function fetchSource(source, conditions = {}, signal) {
    if (!source?.feed || !Array.isArray(source.feed.redirectUrls)) throw new FeedNetworkError('missing-feed-interface');
    const allowed = new Set([source.feed.url, ...source.feed.redirectUrls]);
    const headers = conditionHeaders(conditions);
    const controller = new AbortController();
    const cancel = () => controller.abort('feed-cancelled');
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort('feed-timeout'), timeoutMs);
    let value = source.feed.url;
    const startedAt = Date.now();
    try {
      for (let hop = 0; hop <= 3; hop += 1) {
        const url = checkedUrl(value, allowed);
        const addresses = await abortable(Promise.resolve().then(() => lookup(url.hostname, { all: true, verbatim: true })), controller.signal);
        if (!Array.isArray(addresses) || !addresses.length || addresses.length > 32
          || addresses.some((entry) => !isPublicAddress(entry.address) || isIP(entry.address) !== entry.family)) throw new FeedNetworkError('non-public-feed-address');
        const pinned = addresses[0];
        const response = await new Promise((resolve, reject) => {
          const req = request({
            protocol: 'https:', hostname: url.hostname, port: 443,
            path: url.pathname + url.search, method: 'GET', agent: false,
            servername: url.hostname, rejectUnauthorized: true, autoSelectFamily: false,
            lookup: (_hostname, opts, done) => {
              if (opts.all) done(null, [pinned]);
              else done(null, pinned.address, pinned.family);
            },
            signal: controller.signal,
            headers: { 'user-agent': 'KAIRO-Personal-Reader/1.0', accept: 'application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9', 'accept-encoding': 'identity', ...headers },
          }, (res) => {
            const result = { status: res.statusCode, headers: res.headers, finalUrl: url.href, bytes: 0, responseSha256: null, xml: null };
            // No error-page, cookie, redirect body or unsolicited markup enters
            // the reader. Only the selected response headers leave this layer.
            if (res.statusCode !== 200) { res.destroy(); resolve(result); return; }
            const encoding = res.headers['content-encoding'];
            if (encoding && encoding.toLowerCase() !== 'identity') { res.destroy(); reject(new FeedNetworkError('unexpected-content-encoding')); return; }
            if (Number(res.headers['content-length']) > maxBytes) { res.destroy(); reject(new FeedNetworkError('feed-size-limit')); return; }
            const chunks = [];
            let bytes = 0;
            res.on('data', (chunk) => {
              bytes += chunk.length;
              if (bytes > maxBytes) { res.destroy(new FeedNetworkError('feed-size-limit')); return; }
              chunks.push(chunk);
            });
            res.on('error', reject);
            res.on('end', () => {
              try {
                const buffer = Buffer.concat(chunks);
                const xml = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
                resolve({ ...result, xml, bytes, responseSha256: createHash('sha256').update(buffer).digest('hex') });
              } catch { reject(new FeedNetworkError('invalid-feed-encoding')); }
            });
          });
          req.on('error', reject);
          req.end();
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (hop === 3) throw new FeedNetworkError('feed-redirect-limit');
          const location = response.headers.location;
          if (typeof location !== 'string') throw new FeedNetworkError('invalid-feed-redirect');
          try { value = new URL(location, url).href; } catch { throw new FeedNetworkError('invalid-feed-redirect'); }
          checkedUrl(value, allowed);
          continue;
        }
        const selected = {};
        for (const key of ['etag', 'last-modified', 'retry-after', 'cache-control', 'content-type']) {
          const field = response.headers[key];
          if (typeof field === 'string' && field.length <= 1024) selected[key] = field;
        }
        return { ...response, headers: selected, durationMs: Date.now() - startedAt };
      }
      throw new FeedNetworkError('feed-redirect-limit');
    } catch (error) {
      if (controller.signal.aborted) throw new FeedNetworkError(controller.signal.reason === 'feed-timeout' ? 'feed-timeout' : 'feed-cancelled');
      if (error instanceof FeedNetworkError) throw error;
      throw new FeedNetworkError('feed-network-error');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
  return Object.freeze({ fetchSource });
}

module.exports = { createFeedNetwork, isPublicAddress, FeedNetworkError };
