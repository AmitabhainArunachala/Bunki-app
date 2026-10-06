'use strict';
/* global AbortController */

const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { Buffer } = require('node:buffer');
const { spawn } = require('node:child_process');
const { setTimeout, clearTimeout } = require('node:timers');
const { TextDecoder } = require('node:util');

const MAX_BYTES = 20 * 1024 * 1024;
const error = (code) => Object.assign(new Error('File intake: ' + code), { code });
const exact = (raw, keys) => raw && typeof raw === 'object' && !Array.isArray(raw) &&
  Object.keys(raw).sort().join(',') === [...keys].sort().join(',');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Fixed executable, no network, bounded one-shot protocol. No paths, URLs or
 * shell text are accepted from the renderer or the helper's reply. */
function launchNativeText({ executable, request, timeoutMs = 35000, signal }) {
  if (signal?.aborted) return Promise.reject(error('extraction-cancelled'));
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/sandbox-exec', ['-p', '(version 1) (allow default) (deny network*)', executable],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: true });
    let chunks = [], size = 0, diagnostics = 0, settled = false;
    const timer = setTimeout(() => finish('extraction-timeout'), timeoutMs);
    const cancelled = () => finish('extraction-cancelled');
    function finish(code, value) {
      if (settled) return; settled = true; clearTimeout(timer); chunks = [];
      signal?.removeEventListener('abort', cancelled);
      if (code) {
        // This child owns a dedicated process group. A failed helper cannot
        // leave a descendant holding stdout open after its parent exits.
        try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); reject(error(code));
      } else resolve(value);
    }
    child.on('error', () => finish('extractor-unavailable'));
    child.stdin.on('error', () => finish('extraction-failed'));
    child.stdout.on('data', bytes => {
      size += bytes.length;
      if (size > 2 * 1024 * 1024) finish('extraction-capacity'); else if (!settled) chunks.push(bytes);
    });
    child.stderr.on('data', bytes => { diagnostics += bytes.length; if (diagnostics > 16384) finish('extraction-capacity'); });
    child.on('close', code => {
      if (settled) return;
      if (code !== 0) return finish('extraction-failed');
      try { finish(null, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
      catch { finish('extraction-response'); }
    });
    signal?.addEventListener('abort', cancelled, { once: true });
    if (signal?.aborted) { cancelled(); return; }
    const bytes = Buffer.from(JSON.stringify(request), 'utf8');
    if (bytes.length > 29 * 1024 * 1024) finish('file-size'); else child.stdin.end(bytes);
  });
}

async function readChosenFile(filename) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename)) throw error('file-selection');
  // Open one regular inode without following a final symlink, read at most the
  // declared bound, and refuse concurrent rewrites instead of trusting a stat.
  const before = await fs.lstat(filename);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > MAX_BYTES) throw error('file-size');
  const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size) throw error('file-changed');
    const bytes = Buffer.alloc(opened.size + 1); let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    const after = await handle.stat();
    if (offset !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw error('file-changed');
    return bytes.subarray(0, offset);
  } finally { await handle.close(); }
}

function createNativeIntake({ dialog, captureDocument, canChoose, contracts, executable, cacheDirectory, openPath,
  run = launchNativeText, selectionTtlMs = 10 * 60 * 1000 }) {
  let pending = false, selected = null, expiry = null, active = null, disposed = false;
  const copies = [];
  const clearSelection = () => { clearTimeout(expiry); expiry = null; selected = null; };
  const clear = () => { clearSelection(); active?.abort(); };
  const current = capture => { if (capture?.assertCurrent() !== true) throw error('source-owner-changed'); };
  async function available() {
    if (disposed) return false;
    try { const stat = await fs.lstat(executable); return stat.isFile() && !stat.isSymbolicLink() &&
      !!(stat.mode & 0o111) && await fs.realpath(executable) === path.resolve(executable); } catch { return false; }
  }
  async function operation(work) {
    if (pending) return { status: 'failed', code: 'file-intake-busy' };
    if (!canChoose() || !await available()) return { status: 'failed', code: 'file-intake-unavailable' };
    // Recheck after the asynchronous availability read before taking ownership.
    if (pending || !canChoose()) return { status: 'failed', code: 'file-intake-unavailable' };
    const owner = captureDocument(), controller = new AbortController();
    const capture = { window: owner?.window, assertCurrent: () => !disposed && !controller.signal.aborted && owner?.assertCurrent() === true };
    pending = true; active = controller;
    try { current(capture); const result = await work(capture); current(capture); return result; }
    catch (failure) { return { status: 'failed', code: /^[a-z]+(?:-[a-z]+){1,5}$/u.test(failure?.code || '') ? failure.code : 'file-intake-failed' }; }
    finally { pending = false; if (active === controller) active = null; }
  }
  async function chooseBytes(capture) {
    const chosen = await dialog.showOpenDialog(capture.window, { title: 'Choose an image or PDF', properties: ['openFile'],
      filters: [{ name: 'Images and PDF', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'heic', 'heif', 'tif', 'tiff'] }] });
    current(capture);
    if (chosen.canceled) return null;
    if (!Array.isArray(chosen.filePaths) || chosen.filePaths.length !== 1) throw error('file-selection');
    const name = path.basename(chosen.filePaths[0]), bytes = await readChosenFile(chosen.filePaths[0]);
    current(capture); return { name, bytes };
  }
  const request = async (method, data, extra = {}) => {
    const result = await run({ executable, signal: active?.signal, request: { version: 1, method, name: data.name, dataBase64: data.bytes.toString('base64'), ...extra } });
    if (exact(result, ['status', 'code']) && result.status === 'failed' && /^[a-z]+(?:-[a-z]+){1,5}$/u.test(result.code)) throw error(result.code);
    return result;
  };
  return Object.freeze({ available, clear,
    choose(input) { return operation(async capture => {
      if (!exact(input, ['expected'])) throw error('invalid-input');
      const api = contracts(), expected = input.expected === null ? null : api.parseFileReference(input.expected);
      clearSelection(); const data = await chooseBytes(capture);
      if (!data) return { status: 'cancelled' };
      const reply = await request('inspect', data); current(capture);
      if (!exact(reply, ['status', 'file']) || reply.status !== 'inspected') throw error('extraction-response');
      const file = api.parseFileReference(reply.file);
      if (file.name !== data.name || file.sha256 !== hash(data.bytes) || file.bytes !== data.bytes.length) throw error('extraction-response');
      if (expected && !api.sameFileBytes(expected, file)) throw error('file-mismatch');
      const token = randomUUID(); selected = { token, file, data, capture };
      expiry = setTimeout(clear, selectionTtlMs); expiry.unref?.();
      return { status: 'selected', token, file };
    }); },
    extract(input) { return operation(async capture => {
      if (!exact(input, ['token', 'firstPage', 'lastPage']) || typeof input.token !== 'string' ||
          !Number.isSafeInteger(input.firstPage) || !Number.isSafeInteger(input.lastPage) || input.firstPage < 1 ||
          input.lastPage < input.firstPage || input.lastPage - input.firstPage >= 20) throw error('invalid-page-range');
      const selection = selected;
      if (!selection || input.token !== selection.token || input.lastPage > selection.file.pageCount) throw error('file-selection-expired');
      current(selection.capture);
      const reply = await request('extract', selection.data, { firstPage: input.firstPage, lastPage: input.lastPage });
      current(capture); current(selection.capture);
      if (selection !== selected) throw error('file-selection-expired');
      if (!exact(reply, ['status', 'document']) || reply.status !== 'extracted') throw error('extraction-response');
      const document = contracts().parseFileTextObservation(reply.document);
      if (JSON.stringify(document.file) !== JSON.stringify(selection.file) || document.pages.length !== input.lastPage - input.firstPage + 1 ||
          document.pages[0].page !== input.firstPage || document.pages.at(-1).page !== input.lastPage) throw error('extraction-response');
      return { status: 'extracted', document };
    }); },
    openOriginal(input) { return operation(async capture => {
      if (!exact(input, ['file'])) throw error('invalid-input');
      const file = contracts().parseFileReference(input.file), data = await chooseBytes(capture);
      if (!data) return { status: 'cancelled' };
      if (data.bytes.length !== file.bytes || hash(data.bytes) !== file.sha256) throw error('file-mismatch');
      const inspected = await request('inspect', data); current(capture);
      if (!exact(inspected, ['status', 'file']) || inspected.status !== 'inspected' ||
          !contracts().sameFileBytes(file, contracts().parseFileReference(inspected.file))) throw error('file-mismatch');
      // Open an exact read-only snapshot. A mutable chosen pathname cannot
      // change between verification and the external viewer's eventual read.
      await fs.mkdir(cacheDirectory, { recursive: true, mode: 0o700 });
      current(capture);
      const directory = await fs.mkdtemp(path.join(cacheDirectory, 'source-'));
      const extension = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/heic': 'heic', 'image/heif': 'heif', 'image/tiff': 'tiff' }[file.mimeType];
      const destination = path.join(directory, 'source.' + extension); let opened = false;
      try {
        await fs.writeFile(destination, data.bytes, { flag: 'wx', mode: 0o400 }); current(capture);
        if (await openPath(destination)) throw error('file-viewer-unavailable');
        opened = true; copies.push(directory);
        while (copies.length > 3) await fs.rm(copies.shift(), { recursive: true }).catch(() => {});
        return { status: 'opened' };
      } finally { if (!opened) await fs.rm(directory, { recursive: true }).catch(() => {}); }
    }); },
    async dispose() { disposed = true; clear(); await Promise.all(copies.splice(0).map(directory => fs.rm(directory, { recursive: true }).catch(() => {}))); },
  });
}

module.exports = { createNativeIntake, launchNativeText, readChosenFile };
