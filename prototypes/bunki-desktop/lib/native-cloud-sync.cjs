'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Buffer } = require('node:buffer');
const { setTimeout, clearTimeout } = require('node:timers');

const MAX_CONTROL_BYTES = 16384;
const FORMAT = 'kairo-native-bootstrap';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const NATIVE_CODES = new Map([
  ['invalidInput', 'invalid-input'], ['wrongScope', 'wrong-scope'], ['invalidEnvelope', 'invalid-envelope'],
  ['conflictingOperation', 'conflicting-operation'], ['invalidResponse', 'invalid-response'],
  ['accountUnavailable', 'account-unavailable'], ['unauthorizedScope', 'unauthorized-scope'],
  ['staleSession', 'stale-session'], ['transportUnavailable', 'transport-unavailable'],
  ['invalidCursor', 'invalid-cursor'], ['checkpointExpired', 'checkpoint-expired'],
  ['journalReset', 'journal-reset'], ['physicalDeletion', 'physical-deletion'], ['limitsExceeded', 'limits-exceeded'],
  ...['invalid-configuration', 'invalid-profile', 'configuration-unavailable', 'stale-challenge',
    'confirmation-required', 'paired-to-different-account', 'pairing-unavailable', 'invalid-pairing',
    'invalid-control', 'cancelled', 'invalid-frame', 'limits-exceeded', 'session-required',
    'wrong-connection', 'stale-session', 'busy', 'connection-lost', 'io-failure', 'transport-unavailable']
    .map((code) => [code, code]),
]);
const REVOCATIONS = new Set(['account-changed', 'profile-changed', 'native-session-lost',
  'logout', 'connection-lost', 'replaced', 'shutdown']);
const fail = (code) => { const error = new Error('Native cloud sync: ' + code); error.code = code; throw error; };
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const sameBinding = (a, b) => exact(a, ['accountId', 'learnerId', 'sessionId'])
  && ['accountId', 'learnerId', 'sessionId'].every((key) => a[key] === b[key]);

/** Configuration comes only from the installed native resource directory. Its
 * existence is not a CloudKit grant; the native helper must still check its
 * entitlements, real account and an explicit native pairing confirmation. */
function readNativeCloudConfiguration(resources) {
  const directory = path.join(resources, 'native');
  const filename = path.join(directory, 'cloud-sync-config.json');
  if (!fs.existsSync(filename)) return null;
  try {
    if (fs.realpathSync(directory) !== path.resolve(directory) ||
        !fs.lstatSync(filename).isFile() || fs.lstatSync(filename).isSymbolicLink() ||
        fs.statSync(filename).size > MAX_CONTROL_BYTES) fail('configuration-invalid');
    const config = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (!exact(config, ['version', 'containerIdentifier', 'keychainService', 'profileLabel']) || config.version !== 1 ||
        typeof config.containerIdentifier !== 'string' || !/^iCloud\.[A-Za-z0-9][A-Za-z0-9.-]{1,190}$/u.test(config.containerIdentifier) ||
        typeof config.keychainService !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9.-]{2,190}$/u.test(config.keychainService) ||
        typeof config.profileLabel !== 'string' || !config.profileLabel.trim() ||
        /[\u0000-\u001f\u007f]/u.test(config.profileLabel) || Buffer.byteLength(config.profileLabel, 'utf8') > 160)
      fail('configuration-invalid');
    const executable = path.join(directory, 'kairo-cloud-sync-host');
    const stat = fs.lstatSync(executable);
    if (!stat.isFile() || stat.isSymbolicLink() || !(stat.mode & 0o111)) fail('configuration-invalid');
    return Object.freeze({ executable, containerIdentifier: config.containerIdentifier,
      keychainService: config.keychainService, profileLabel: config.profileLabel });
  } catch { fail('configuration-invalid'); }
}

function controlFrame(value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  if (body.length === 0 || body.length > MAX_CONTROL_BYTES) fail('invalid-control');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

/** Spawn one bundled helper. FD4 belongs to this exact child; stdout never
 * supplies authority. The returned signal fences the lease before teardown. */
function launchNativeCloudSync({ configuration, binding, signal, timeoutMs = 300000 }) {
  if (!configuration) return Promise.reject(Object.assign(new Error('Native cloud sync: setup-required'), { code: 'setup-required' }));
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('Native cloud sync: cancelled'), { code: 'cancelled' }));
  const requestId = randomUUID();
  const connectionId = randomUUID();
  const revocation = new AbortController();
  const child = spawn(configuration.executable, [], { stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
    windowsHide: true, detached: false });
  const controlIn = child.stdio[3];
  const controlOut = child.stdio[4];
  let buffer = Buffer.alloc(0);
  let timer;
  let killTimer;
  let done = false;
  let ready = false;
  let rejectPending;
  function finish(code = 'native-revoked') {
    if (done) return;
    done = true;
    revocation.abort();
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancelled);
    buffer = Buffer.alloc(0);
    if (!ready) rejectPending?.(Object.assign(new Error('Native cloud sync: ' + code), { code }));
    try { controlIn.end(controlFrame({ format: FORMAT, v: 1, type: 'revoke', requestId, connectionId })); } catch { /* Already closed. */ }
    controlOut.destroy();
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGTERM'); } catch { /* Captured child already gone. */ }
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try { child.kill('SIGKILL'); } catch { /* Captured child already gone. */ }
        }
      }, 2000);
      killTimer.unref();
    }
  }
  function cancelled() { finish('cancelled'); }
  const promise = new Promise((resolve, reject) => {
    rejectPending = reject;
    function accept(message) {
      if (message?.format !== FORMAT || message.v !== 1 || message.requestId !== requestId ||
          message.connectionId !== connectionId) return finish('invalid-control');
      if (message.type === 'error' || message.type === 'revoked') {
        if (!exact(message, ['format', 'v', 'type', 'requestId', 'connectionId', 'code']) ||
            typeof message.code !== 'string' || !/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/u.test(message.code)) return finish('invalid-control');
        // Native error text never crosses into the UI. An unrecognized refusal
        // still fences the connection and is displayed with a fixed fallback.
        if (message.type === 'revoked') return finish(REVOCATIONS.has(message.code) ? 'native-revoked' : 'invalid-control');
        return finish(NATIVE_CODES.get(message.code) || 'native-unavailable');
      }
      if (ready || !exact(message, ['format', 'v', 'type', 'requestId', 'connectionId', 'binding', 'channelId', 'leaseId']) ||
          message.type !== 'ready' || !sameBinding(message.binding, binding) || !UUID.test(message.leaseId) ||
          typeof message.channelId !== 'string' || !/^ck-private-v1:[a-f0-9]{64}$/u.test(message.channelId))
        return finish('invalid-control');
      ready = true;
      clearTimeout(timer);
      resolve(Object.freeze({ child, binding: Object.freeze({ ...binding }), channelId: message.channelId,
        leaseId: message.leaseId, connectionId, revocationSignal: revocation.signal, revoke: () => finish() }));
    }
    controlOut.on('data', (chunk) => {
      if (done) return;
      // Limit buffered control bytes before allocating a concatenation. There
      // are only two useful server frames: ready, then one terminal notice.
      if (chunk.length + buffer.length > (MAX_CONTROL_BYTES + 4) * 2) return finish('invalid-control');
      buffer = Buffer.concat([buffer, chunk]);
      while (!done && buffer.length >= 4) {
        const size = buffer.readUInt32BE(0);
        if (!size || size > MAX_CONTROL_BYTES) return finish('invalid-control');
        if (buffer.length < size + 4) break;
        const body = buffer.subarray(4, size + 4);
        buffer = buffer.subarray(size + 4);
        const decoded = body.toString('utf8');
        if (!Buffer.from(decoded, 'utf8').equals(body)) return finish('invalid-control');
        try { accept(JSON.parse(decoded)); } catch { return finish('invalid-control'); }
      }
    });
    controlOut.on('end', () => finish('native-revoked'));
    controlOut.on('close', () => finish('native-revoked'));
    for (const stream of child.stdio.filter(Boolean)) stream.on('error', () => finish('native-revoked'));
    child.stderr.on('data', () => { /* Private native diagnostics are not learner-facing output. */ });
    child.on('error', () => finish('native-unavailable'));
    child.on('exit', () => finish('native-revoked'));
    child.on('close', () => { clearTimeout(killTimer); signal?.removeEventListener('abort', cancelled); });
    signal?.addEventListener('abort', cancelled, { once: true });
    timer = setTimeout(() => finish('connection-timeout'), timeoutMs);
    timer.unref();
    if (signal?.aborted) return finish('cancelled');
    try {
      controlIn.write(controlFrame({ format: FORMAT, v: 1, type: 'connect', requestId, connectionId,
        containerIdentifier: configuration.containerIdentifier, keychainService: configuration.keychainService,
        profileLabel: configuration.profileLabel, binding }));
    } catch { finish('native-unavailable'); }
  });
  return promise;
}

module.exports = { readNativeCloudConfiguration, launchNativeCloudSync };
