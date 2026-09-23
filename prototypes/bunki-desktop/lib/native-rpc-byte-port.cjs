'use strict';

const { ChildProcess } = require('node:child_process');
const { Buffer } = require('node:buffer');
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const intrinsic = (name) => Object.getOwnPropertyDescriptor(typedArray, name).get;
const byteLength = intrinsic('byteLength');
const byteOffset = intrinsic('byteOffset');
const backingBuffer = intrinsic('buffer');
const arrayTag = intrinsic(Symbol.toStringTag);
const arrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const copyBytes = Uint8Array.prototype.set;

function byteView(value) {
  if (Reflect.apply(arrayTag, value, []) !== 'Uint8Array') throw new NativeRpcPipeError('invalid-frame');
  const buffer = Reflect.apply(backingBuffer, value, []);
  // This intrinsic rejects SharedArrayBuffer. No caller-owned length, offset,
  // buffer, iterator, species or slice getter participates in byte admission.
  Reflect.apply(arrayBufferLength, buffer, []);
  return { buffer, length: Reflect.apply(byteLength, value, []), offset: Reflect.apply(byteOffset, value, []) };
}

class NativeRpcPipeError extends Error {
  constructor(code) {
    super('Native RPC pipe: ' + code);
    this.name = 'NativeRpcPipeError';
    this.code = code;
  }
}

/** Main-process byte transport for one exclusively owned native helper.
 * The embedding verifies/spawns the bundled helper, establishes authenticated
 * profile authority on a separate trusted channel, and supplies its connection
 * UUID. Nothing read from stdout can create that authority. This module neither
 * spawns a process nor exposes an Electron IPC handler or a renderer capability.
 *
 * onClosed must synchronously revoke the embedding's owner and dispose its owned
 * helper/control channel. It runs once, before the subscriber's close callback.
 * Navigation, logout and profile replacement must call close synchronously.
 */
function createNativeRpcPipePort({ child, connectionId, assertCurrent, onClosed, limits = {} }) {
  const invalid = () => { throw new NativeRpcPipeError('invalid-port'); };
  if (!(child instanceof ChildProcess) || !child.stdin || !child.stdout ||
      typeof connectionId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(connectionId) ||
      typeof assertCurrent !== 'function' || typeof onClosed !== 'function' ||
      !limits || typeof limits !== 'object' || Array.isArray(limits)) invalid();
  if (Object.keys(limits).some((key) => !['maxFrameBytes', 'maxChunkBytes', 'maxQueuedFrames'].includes(key))) invalid();
  const bounded = (key, ceiling) => {
    const value = limits[key] ?? ceiling;
    if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) invalid();
    return value;
  };
  const maxFrameBytes = bounded('maxFrameBytes', 2 * 1024 * 1024);
  const maxChunkBytes = bounded('maxChunkBytes', 64 * 1024);
  // NativeRpcSyncSession permits one data request and one cancellation control.
  const maxQueuedFrames = bounded('maxQueuedFrames', 2);
  const maxReadBatchBytes = 2 * 1024 * 1024 + 4;
  let closed = false;
  let closeCode = 'closed';
  let subscribed = false;
  let receiver = null;
  let active = null;
  let checkingCurrent = false;
  const queue = [];

  function close(code = 'closed') {
    if (closed) return;
    closed = true;
    closeCode = code;
    const target = receiver;
    receiver = null;
    const pending = active ? [active, ...queue] : [...queue];
    active = null;
    queue.length = 0;
    child.stdout.pause();
    child.stdout.off('data', data);
    // Keep error listeners until the owned helper ends: destroying a pipe can
    // complete an outstanding write with EPIPE on a later turn.
    child.stdin.destroy();
    child.stdout.destroy();
    try { onClosed(code); } catch { /* Teardown errors cannot reopen this port. */ }
    for (const entry of pending) entry.reject(new NativeRpcPipeError(code));
    try { target?.close(); } catch { /* A receiver cannot escape terminal close. */ }
  }
  function current() {
    if (closed) return false;
    if (checkingCurrent) { close('stale-owner'); return false; }
    let authorized = false;
    checkingCurrent = true;
    try { authorized = assertCurrent() === true; } catch { /* Fixed local code only. */ }
    finally { checkingCurrent = false; }
    if (closed) return false;
    if (authorized) return true;
    close('stale-owner');
    return false;
  }
  function data(chunk) {
    if (!current()) return;
    let input;
    try { input = byteView(chunk); } catch { close('io-failure'); return; }
    if (!receiver || input.length > maxReadBatchBytes) {
      close('io-failure');
      return;
    }
    // Node may coalesce OS reads. Retain no input queue, and bound every call to
    // the strict framed client. This does not bound Node's prior OS allocation.
    for (let at = 0; at < input.length; at += maxChunkBytes) {
      if (!current() || !receiver) return;
      try {
        const size = Math.min(maxChunkBytes, input.length - at);
        const bytes = new Uint8Array(size);
        Reflect.apply(copyBytes, bytes, [new Uint8Array(input.buffer, input.offset + at, size)]);
        receiver.data(bytes);
      } catch { close('io-failure'); return; }
    }
  }
  function pump() {
    if (active || !queue.length || !current()) return;
    const entry = queue.shift();
    active = entry;
    try {
      child.stdin.write(entry.bytes, (error) => {
        if (active !== entry || closed) return;
        if (error) { close('io-failure'); return; }
        if (!current()) return;
        active = null;
        entry.resolve();
        pump();
      });
    } catch { close('io-failure'); }
  }
  function send(frame) {
    if (!current()) return Promise.reject(new NativeRpcPipeError(closeCode));
    if (!subscribed) return Promise.reject(new NativeRpcPipeError('invalid-port'));
    // An entire preframed request is the unit of a write. Copy before queuing so
    // later caller mutation cannot alter the bytes already offered to this port.
    let input;
    try { input = byteView(frame); } catch { return Promise.reject(new NativeRpcPipeError('limits-exceeded')); }
    if (input.length < 5 || input.length > maxFrameBytes + 4) {
      return Promise.reject(new NativeRpcPipeError('limits-exceeded'));
    }
    if (queue.length + (active ? 1 : 0) >= maxQueuedFrames) return Promise.reject(new NativeRpcPipeError('limits-exceeded'));
    let bytes;
    try {
      const view = new DataView(input.buffer, input.offset, input.length);
      if (view.getUint32(0) !== input.length - 4) return Promise.reject(new NativeRpcPipeError('invalid-frame'));
      bytes = Buffer.allocUnsafe(input.length);
      Reflect.apply(copyBytes, bytes, [frame]);
    } catch { return Promise.reject(new NativeRpcPipeError('invalid-frame')); }
    return new Promise((resolve, reject) => { queue.push({ bytes, resolve, reject }); pump(); });
  }
  function subscribe(next) {
    let methods;
    try {
      const dataMethod = Object.getOwnPropertyDescriptor(next, 'data')?.value;
      const closeMethod = Object.getOwnPropertyDescriptor(next, 'close')?.value;
      if (subscribed || typeof dataMethod !== 'function' || typeof closeMethod !== 'function') invalid();
      methods = { data: (bytes) => Reflect.apply(dataMethod, next, [bytes]), close: () => Reflect.apply(closeMethod, next, []) };
    } catch { invalid(); }
    subscribed = true;
    receiver = methods;
    if (closed) {
      receiver = null;
      try { methods.close(); } catch { /* Remain closed. */ }
    } else if (current()) child.stdout.resume();
    // A removed sole receiver cannot leave a reusable, unaudited connection.
    return () => close();
  }

  const ended = () => close();
  const ioFailure = () => close('io-failure');
  const cleanup = () => {
    child.stdout.off('data', data);
    child.stdout.off('end', ended);
    child.stdout.off('close', ended);
    child.stdout.off('error', ioFailure);
    child.stdin.off('error', ioFailure);
    child.stdin.off('close', ended);
    child.off('error', ioFailure);
    child.off('exit', ended);
  };
  child.stdout.pause();
  child.stdout.on('data', data);
  child.stdout.on('end', ended);
  child.stdout.on('close', ended);
  child.stdout.on('error', ioFailure);
  child.stdin.on('error', ioFailure);
  child.stdin.on('close', ended);
  child.on('error', ioFailure);
  child.on('exit', ended);
  child.once('close', cleanup);
  if (child.exitCode !== null || child.signalCode !== null || child.stdin.destroyed ||
      child.stdout.destroyed || child.stdout.readableEnded) close();
  else current();

  return Object.freeze({ connectionId, send, subscribe, close: () => close() });
}

module.exports = { createNativeRpcPipePort, NativeRpcPipeError };
