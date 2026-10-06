'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Buffer } = require('node:buffer');

const unavailable = () => new Error('file-export-unavailable');

/** A user-chosen backup destination and confirmed disk write. The renderer
 * cannot select paths, overwrite without a native dialog, or claim cancellation
 * as a successful export. One captured document owns the whole interaction. */
function createNativeFileSaver({ dialog, captureDocument, canSave }) {
  let pending = false;
  return async function save(input) {
    if (pending || !canSave() || !input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).sort().join(',') !== 'filename,mimeType,text' ||
        input.mimeType !== 'application/json' || typeof input.filename !== 'string' ||
        !/^kairo-\d{4}-\d{2}-\d{2}\.json$/u.test(input.filename) ||
        typeof input.text !== 'string' || !input.text.length || Buffer.byteLength(input.text, 'utf8') > 32 * 1024 * 1024)
      throw unavailable();
    const capture = captureDocument();
    if (!capture?.assertCurrent()) throw unavailable();
    const bytes = Buffer.from(input.text, 'utf8');
    pending = true;
    let temporary = null;
    let handle = null;
    try {
      const chosen = await dialog.showSaveDialog(capture.window, { title: 'Save your Kairo backup',
        defaultPath: input.filename, filters: [{ name: 'Kairo backup', extensions: ['json'] }] });
      if (chosen.canceled || !chosen.filePath || !capture.assertCurrent()) return false;
      if (!path.isAbsolute(chosen.filePath)) throw unavailable();
      temporary = path.join(path.dirname(chosen.filePath), '.kairo-backup-' + randomUUID() + '.tmp');
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = null;
      if (!capture.assertCurrent()) return false;
      await fs.rename(temporary, chosen.filePath);
      temporary = null;
      return capture.assertCurrent() === true;
    } catch { throw unavailable(); }
    finally {
      if (handle) await handle.close().catch(() => {});
      if (temporary) await fs.unlink(temporary).catch(() => {});
      pending = false;
    }
  };
}

module.exports = { createNativeFileSaver };
