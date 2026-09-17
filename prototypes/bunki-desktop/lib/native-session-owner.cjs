'use strict';

const { ChildProcess } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { setTimeout, clearTimeout } = require('node:timers');
const { NativeRpcSyncSession } = require('./native-rpc-session.cjs');
const { createNativeRpcPipePort } = require('./native-rpc-byte-port.cjs');
const { isAppURL } = require('./navigation-policy.cjs');

const signalAborted = Object.getOwnPropertyDescriptor(globalThis.AbortSignal.prototype, 'aborted').get;
const addSignalListener = globalThis.EventTarget.prototype.addEventListener;
const removeSignalListener = globalThis.EventTarget.prototype.removeEventListener;
const claimedChildren = new WeakMap();
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const REASONS = new Set(['profile-changed', 'logout', 'native-revoked', 'replaced', 'shutdown']);

class NativeSessionOwnerError extends Error {
  constructor(code) {
    super('Native session owner: ' + code);
    this.name = 'NativeSessionOwnerError';
    this.code = code;
  }
}
const fail = (code) => { throw new NativeSessionOwnerError(code); };

function record(value, names) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail('invalid-lease');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== names.length) fail('invalid-lease');
  const copy = Object.create(null);
  for (const name of names) {
    const descriptor = descriptors[name];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('invalid-lease');
    copy[name] = descriptor.value;
  }
  return copy;
}
function text(value, max = 1024) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) fail('invalid-lease');
  // The strict session performs scalar and UTF-8 byte validation as well.
  return value;
}
function leaseDescriptor(input) {
  try {
    const lease = record(input, ['child', 'binding', 'channelId', 'leaseId', 'connectionId', 'revocationSignal', 'revoke']);
    if (!(lease.child instanceof ChildProcess) || !Number.isSafeInteger(lease.child.pid) || lease.child.pid <= 0 ||
        !Array.isArray(lease.child.stdio) || typeof lease.revoke !== 'function') fail('invalid-lease');
    Reflect.apply(signalAborted, lease.revocationSignal, []);
    const binding = record(lease.binding, ['accountId', 'learnerId', 'sessionId']);
    for (const key of Object.keys(binding)) binding[key] = text(binding[key]);
    lease.binding = Object.freeze({ ...binding });
    lease.channelId = text(lease.channelId);
    if (!UUID.test(text(lease.leaseId, 36)) || !UUID.test(text(lease.connectionId, 36))) fail('invalid-lease');
    const revoke = lease.revoke;
    lease.revoke = () => Reflect.apply(revoke, input, []);
    return lease;
  } catch { fail('invalid-lease'); }
}

/** Dormant main-process owner. beginDocument() must precede asynchronous native
 * bootstrap; attach() accepts only the same opaque ticket and an already
 * authorized native lease. The binding/channel/lease/connection and revocation
 * capability are trusted host prerequisites, never discovered from stdout,
 * describe, an imported record, or renderer input. There is no default grant.
 *
 * revocationSignal must be aborted synchronously on native profile lease loss.
 * revoke must synchronously revoke that lease and dispose its control channel.
 * This owner checks Electron authority itself and owns helper teardown. It does
 * not spawn/pair a helper, open IPC, authenticate a profile, or merge records.
 */
function createNativeSessionOwner({ window, app, origin }) {
  const electron = require('electron');
  let contents;
  try {
    if (app !== electron.app || !(window instanceof electron.BrowserWindow) || window.isDestroyed()) fail('invalid-owner');
    contents = window.webContents;
    if (electron.webContents.fromId(contents.id) !== contents || electron.BrowserWindow.fromWebContents(contents) !== window || !isAppURL(origin + '/', origin)) fail('invalid-owner');
  } catch { fail('invalid-owner'); }
  const ownerId = randomUUID();
  let navigationId = randomUUID();
  let epoch = 0;
  let terminal = false;
  let ticket = null;
  let active = null;
  let checking = false;
  let transitionDepth = 0;
  const retiring = new Set();

  function advance() {
    ticket = null;
    if (epoch >= Number.MAX_SAFE_INTEGER) { terminal = true; return; }
    epoch += 1;
  }
  function documentState() {
    if (terminal || window.isDestroyed() || contents.isDestroyed() || window.webContents !== contents ||
        electron.webContents.fromId(contents.id) !== contents || electron.BrowserWindow.fromWebContents(contents) !== window || contents.isLoadingMainFrame()) fail('unavailable-document');
    const frame = contents.mainFrame;
    if (!frame || frame.detached || frame.parent !== null || frame.top !== frame ||
        !isAppURL(frame.url, origin) || !isAppURL(contents.getURL(), origin) || frame.origin !== origin ||
        frame.processId !== contents.getProcessId() || frame.osProcessId !== contents.getOSProcessId() ||
        !Number.isSafeInteger(frame.processId) || frame.processId <= 0 || !Number.isSafeInteger(frame.osProcessId) || frame.osProcessId <= 0) fail('unavailable-document');
    return { frame, frameToken: frame.frameToken, frameTreeNodeId: frame.frameTreeNodeId,
      routingId: frame.routingId, rendererId: frame.processId, rendererPid: frame.osProcessId };
  }
  function sameDocument(captured) {
    const now = documentState();
    return Object.keys(now).every((key) => now[key] === captured[key]);
  }
  function retire(slot) {
    if (slot.retired) return;
    slot.retired = true;
    retiring.add(slot);
    const { child } = slot.lease;
    let killTimer = null;
    const streams = [...child.stdio].filter(Boolean);
    const finish = () => {
      child.off('close', finish);
      if (killTimer !== null) clearTimeout(killTimer);
      killTimer = null;
      retiring.delete(slot);
      child.off('error', ignoreError);
      child.stderr?.off('error', ignoreError);
      child.stderr?.off('data', slot.discardDiagnostic);
      child.stderr?.off('error', slot.stderrFailure);
      for (const stream of streams) stream.off('error', ignoreError);
    };
    function ignoreError() { /* Private process errors are not authority or public diagnostics. */ }
    child.on('error', ignoreError);
    child.stderr?.on('error', ignoreError);
    child.once('close', finish);
    for (const stream of streams) {
      stream.on('error', ignoreError);
      stream.destroy();
    }
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) {
      if (streams.every((stream) => stream.destroyed)) finish();
      return;
    }
    // Only this captured child object is signalled; old teardown never consults
    // the current slot or a replacement process ID. One bounded escalation.
    try { child.kill('SIGTERM'); } catch { /* The child may already have exited. */ }
    killTimer = setTimeout(() => {
      killTimer = null;
      if (child.exitCode === null && child.signalCode === null) {
        try { child.kill('SIGKILL'); } catch { /* The captured process may already be gone. */ }
      }
    }, 2000);
    killTimer.unref();
  }
  function end(slot) {
    if (!slot || slot.closed) return;
    slot.closed = true;
    if (active === slot) { active = null; advance(); }
    transitionDepth += 1;
    try {
      try { Reflect.apply(removeSignalListener, slot.lease.revocationSignal, ['abort', slot.revoked]); } catch { /* Already terminal. */ }
      // Strict client and byte port mark themselves dead before calling back.
      // session stays null while either constructor is still on the stack.
      try { slot.session?.invalidate(); } catch { /* Teardown remains terminal. */ }
      try { slot.port?.close(); } catch { /* Teardown remains terminal. */ }
      // A native callback may synchronously revoke/close, but cannot install a
      // replacement in the middle of this authority transition.
      try { slot.lease.revoke(); } catch { /* A faulty native teardown cannot revive local authority. */ }
      retire(slot);
    } finally { transitionDepth -= 1; }
  }
  function valid(slot) {
    if (checking) { end(slot); return false; }
    if (!slot || slot.closed || terminal || active !== slot || ticket !== slot.ticket || slot.epoch !== epoch) return false;
    checking = true;
    let current = false;
    try {
      const child = slot.lease.child;
      current = sameDocument(slot.document) && child.pid === slot.childPid &&
        child.exitCode === null && child.signalCode === null && !child.killed &&
        !Reflect.apply(signalAborted, slot.lease.revocationSignal, []);
    } catch { /* Local native/Electron loss becomes a fixed stale result. */ }
    finally { checking = false; }
    if (!current || slot.closed || active !== slot) { end(slot); return false; }
    return true;
  }
  function revoke(reason = 'profile-changed') {
    if (!REASONS.has(reason)) fail('invalid-lease');
    if (terminal) return;
    advance();
    end(active);
  }
  function begin() {
    if (terminal) fail('closed');
    revoke('replaced');
    const document = documentState();
    const next = Object.freeze(Object.create(null));
    ticket = { token: next, document, epoch, navigationId };
    return next;
  }
  function adopt(token, input) {
    const lease = leaseDescriptor(input);
    // Reusing an adopted process is rejected without touching its live owner.
    if (claimedChildren.has(lease.child)) fail('invalid-lease');
    const pending = ticket;
    const slot = { lease, ticket: pending, document: pending?.document, epoch: pending?.epoch,
      childPid: lease.child.pid, closed: false, retired: false, session: null, port: null, revoked: null,
      discardDiagnostic: () => {}, stderrFailure: null };
    claimedChildren.set(lease.child, slot);
    slot.revoked = () => end(slot);
    slot.stderrFailure = () => end(slot);
    lease.child.stderr?.on('error', slot.stderrFailure);
    lease.child.stderr?.on('data', slot.discardDiagnostic);
    try {
      if (terminal || !pending || pending.token !== token || active || pending.epoch !== epoch ||
          !sameDocument(pending.document)) fail('stale-ticket');
      if (retiring.size >= 4) fail('limits-exceeded');
      if (!Number.isSafeInteger(slot.childPid) || slot.childPid <= 0 || lease.child.exitCode !== null ||
          lease.child.signalCode !== null || lease.child.killed || Reflect.apply(signalAborted, lease.revocationSignal, [])) fail('invalid-lease');
      const owner = Object.freeze({ binding: lease.binding, channelId: lease.channelId,
        leaseId: lease.leaseId, connectionId: lease.connectionId, ownerId,
        processId: `native:${slot.childPid}:${randomUUID()}`, navigationId: pending.navigationId, epoch: pending.epoch });
      active = slot;
      Reflect.apply(addSignalListener, lease.revocationSignal, ['abort', slot.revoked, { once: true }]);
      if (!valid(slot)) fail('stale-ticket');
      slot.port = createNativeRpcPipePort({ child: lease.child, connectionId: lease.connectionId,
        assertCurrent: () => valid(slot), onClosed: () => end(slot) });
      const session = new NativeRpcSyncSession({ port: slot.port, authority: {
        capture: () => owner,
        assertCurrent: (value) => valid(slot) && Object.keys(owner).every((key) =>
          key === 'binding' ? ['accountId', 'learnerId', 'sessionId'].every((part) => value.binding[part] === owner.binding[part]) : value[key] === owner[key]),
      } });
      if (!valid(slot)) { session.invalidate(); fail('stale-ticket'); }
      slot.session = session;
      return session;
    } catch (error) {
      end(slot);
      if (error instanceof NativeSessionOwnerError) throw error;
      fail('invalid-lease');
    }
  }
  function navigation(details) {
    if (details.isMainFrame === true && details.isSameDocument === false) {
      navigationId = randomUUID();
      revoke('replaced');
    }
  }
  function processGone() { navigationId = randomUUID(); revoke('replaced'); }
  function close() {
    if (terminal) return;
    terminal = true;
    advance();
    end(active);
    contents.off('did-start-navigation', navigation);
    contents.off('render-process-gone', processGone);
    contents.off('destroyed', close);
    window.off('closed', close);
    app.off('before-quit', close);
  }
  function transition(action) {
    if (transitionDepth !== 0) fail('busy');
    transitionDepth += 1;
    try { return action(); }
    finally { transitionDepth -= 1; }
  }
  function beginDocument() { return transition(begin); }
  function attach(token, input) { return transition(() => adopt(token, input)); }
  contents.on('did-start-navigation', navigation);
  contents.on('render-process-gone', processGone);
  contents.once('destroyed', close);
  window.once('closed', close);
  app.on('before-quit', close);
  return Object.freeze({ beginDocument, attach, revoke, close });
}

module.exports = { createNativeSessionOwner, NativeSessionOwnerError };
