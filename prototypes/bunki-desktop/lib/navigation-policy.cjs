'use strict';

const { isIP } = require('node:net');

function parsedURL(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url;
  } catch {
    return null;
  }
}

function isAppURL(value, origin) {
  const url = parsedURL(value);
  return Boolean(url && url.origin === origin && url.protocol === 'http:');
}

function publisherURL(value, origin) {
  const url = parsedURL(value);
  if (!url || !['https:', 'http:'].includes(url.protocol) || url.origin === origin || url.port) return null;
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname.includes('.') || isIP(hostname) || hostname.startsWith('[') || /\.(localhost|local|internal|lan)$/.test(hostname)) return null;
  return url.href;
}

function mayRequestMicrophone({ permission, requestingUrl, isMainFrame, mediaTypes, origin, trustedAt, now }) {
  return permission === 'media' && isMainFrame === true && isAppURL(requestingUrl, origin)
    && Array.isArray(mediaTypes) && mediaTypes.length === 1 && mediaTypes[0] === 'audio'
    && now >= trustedAt && now - trustedAt < 2000;
}

module.exports = { isAppURL, publisherURL, mayRequestMicrophone };
