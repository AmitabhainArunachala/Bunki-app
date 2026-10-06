'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createNativeFileSaver } = require('../lib/native-files.cjs');

const base = path.join(os.homedir(), '.dharma', 'bunki', 'native-file-tests');
const input = { filename: 'kairo-2026-09-11.json', mimeType: 'application/json', text: '{"note":"合図と記録"}' };
async function setup(t, dialog) {
  await fs.mkdir(base, { recursive: true });
  const directory = await fs.mkdtemp(path.join(base, 'run-'));
  const destination = path.join(directory, 'backup.json');
  let current = true;
  let trusted = true;
  let calls = 0;
  const save = createNativeFileSaver({
    canSave: () => trusted,
    captureDocument: () => ({ window: {}, assertCurrent: () => current }),
    dialog: { showSaveDialog: async () => { calls += 1; return dialog ? dialog(destination) : { filePath: destination, canceled: false }; } },
  });
  t.after(async () => assert.deepEqual((await fs.readdir(directory)).filter((file) => file.endsWith('.tmp')), []));
  return { save, directory, destination, calls: () => calls,
    revoke: () => { current = false; }, untrust: () => { trusted = false; } };
}

test('native backup saves complete UTF-8 bytes before confirming success and atomically replaces chosen backup', async (t) => {
  const f = await setup(t);
  await fs.writeFile(f.destination, 'previous backup');
  assert.equal(await f.save(input), true);
  assert.equal(await fs.readFile(f.destination, 'utf8'), input.text);
  assert.equal((await fs.stat(f.destination)).mode & 0o777, 0o600);
});

test('canceling the native dialog preserves the old backup and returns false', async (t) => {
  const f = await setup(t, () => ({ canceled: true }));
  await fs.writeFile(f.destination, 'previous backup');
  assert.equal(await f.save(input), false);
  assert.equal(await fs.readFile(f.destination, 'utf8'), 'previous backup');
});

test('navigation while the save dialog is pending prevents any destination write', async (t) => {
  let choose;
  const f = await setup(t, () => new Promise((resolve) => { choose = resolve; }));
  const saving = f.save(input);
  f.revoke();
  choose({ canceled: false, filePath: f.destination });
  assert.equal(await saving, false);
  assert.deepEqual(await fs.readdir(f.directory), []);
});

test('a second simultaneous export cannot open another native dialog', async (t) => {
  let choose;
  const f = await setup(t, () => new Promise((resolve) => { choose = resolve; }));
  const saving = f.save(input);
  await assert.rejects(f.save(input), /file-export-unavailable/);
  choose({ canceled: true });
  assert.equal(await saving, false);
  assert.equal(f.calls(), 1);
});

test('renderer-selected paths, foreign MIME, oversize bytes and untrusted calls never open a dialog', async (t) => {
  const f = await setup(t);
  for (const request of [{ ...input, filename: '../backup.json' }, { ...input, mimeType: 'text/javascript' },
    { ...input, path: f.destination }, { ...input, text: '文'.repeat(Math.floor(32 * 1024 * 1024 / 3) + 1) }])
    await assert.rejects(f.save(request), /file-export-unavailable/);
  f.untrust();
  await assert.rejects(f.save(input), /file-export-unavailable/);
  assert.equal(f.calls(), 0);
});

test('a failed destination write is never confirmed and does not leave an export temporary file', async (t) => {
  const f = await setup(t, (destination) => ({ canceled: false, filePath: path.join(destination, 'missing.json') }));
  await assert.rejects(f.save(input), /file-export-unavailable/);
  assert.deepEqual(await fs.readdir(f.directory), []);
});
