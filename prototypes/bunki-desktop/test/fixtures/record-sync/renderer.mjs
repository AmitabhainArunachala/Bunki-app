import { createRecordController, captureLegacySource } from './record-controller.mjs';
import { createRecordApp } from './record-app.mjs';
import { openLocalRecordBinding, LOCAL_RECORD_BINDING_KEY } from './record-binding.mjs';

// Only native sync controls are extracted from the actual Corridor source by
// the runner. Bootstrap below is a synthetic two-device fixture using the real
// controller, migration, host, app, Web Lock and IndexedDB implementations.
const f = window.fixture = { ready: false, owned: false, publications: 0, errors: [] };
let recordEpoch = 1, recordApp = null, recordController = null, recordInstallation = null, recordSyncSlot = null;
const notes = document.createElement('div'); notes.id = 'visible-notes';
const plainRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const tx = (_, en) => en;
function el(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text) element.textContent = text; return element; }
const biLabel = (tag, className, _, en) => el(tag, className, en);
const recordWritable = (epoch = recordEpoch) => f.owned && f.ready && epoch === recordEpoch;
function recordFailure(reason) { f.errors.push(reason); f.ready = false; closeRecordSync(); }
function publishRecordSnapshot(snapshot) {
  f.publications++;
  notes.textContent = snapshot.noteViews.flatMap((note) =>
    note.headVersions.flatMap((version) => version.payload.segments.map((segment) => segment.text))).join('\n');
}

// __ACTUAL_SYNC_CONTROLS__

async function boot() {
  const device = new URL(location.href).searchParams.get('device');
  const offset = device === 'a' ? 0 : 10;
  const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
  if (!localStorage.getItem(LOCAL_RECORD_BINDING_KEY)) localStorage.setItem(LOCAL_RECORD_BINDING_KEY, JSON.stringify({
    format: 'kairo-local-record-binding', v: 1,
    binding: { accountId: 'local-account:' + uuid(1), learnerId: 'local-learner:' + uuid(2), sessionId: 'local-session:' + uuid(3 + offset) },
    actor: { deviceId: 'local-device:' + uuid(4 + offset), incarnationId: 'local-installation:' + uuid(5 + offset) },
    databaseName: 'kairo-local-record:' + uuid(6 + offset),
  }));
  if (!localStorage.getItem('kairo-corridor-v1')) {
    localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1, taken: [], srs: {}, revlog: [], obslog: [], localOnly: 'SYNTHETIC-LOCAL-DOCUMENT-' + device }));
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('kairo-ai-log', 3);
      request.onupgradeneeded = () => {
        const turns = request.result.createObjectStore('turns', { keyPath: 'id', autoIncrement: true });
        turns.createIndex('logical-id', 'turn.id'); request.result.createObjectStore('imports', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close();
  }
  let release;
  await new Promise((resolve, reject) => {
    navigator.locks.request('kairo-record:kairo-corridor-v1:kairo-ai-log', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) { reject(new Error('Synthetic record lock unavailable')); return; }
      f.owned = true; resolve(); await new Promise((done) => { release = done; });
    }).catch(reject);
  });
  recordInstallation = openLocalRecordBinding({ storage: localStorage, assertOwner: () => f.owned });
  const { policy, actor, databaseName } = recordInstallation;
  const ownerId = crypto.randomUUID();
  const writer = { capture: () => ({ ownerId, epoch: recordEpoch, sessionId: policy.binding.sessionId }),
    assert: (captured) => f.owned && captured.ownerId === ownerId && captured.epoch === recordEpoch &&
      captured.sessionId === policy.binding.sessionId && recordInstallation.assertCurrent() };
  recordController = await createRecordController({ databaseName, policy, actor, writer });
  let outcome = await recordController.resume();
  if (outcome.status === 'legacy') outcome = await recordController.prepare(await captureLegacySource(writer), { migrationId: 'synthetic-migration-' + device });
  if (outcome.status === 'prepared') outcome = await recordController.activate(outcome.migrationId);
  if (outcome.status !== 'active') throw new Error('Fixture record unavailable: ' + outcome.status);
  f.ready = true;
  recordApp = await createRecordApp({ controller: recordController, binding: policy.binding, writer,
    validateRecord: (record) => record.v === 1, validateArchive: Array.isArray,
    onPublish: (result) => publishRecordSnapshot(result.snapshot) });
  publishRecordSnapshot((await recordApp.snapshot()).snapshot);
  document.body.append(renderRecordSync(), notes);
  await installRecordSync(writer);
  f.createNote = (text) => recordApp.createNote({ text });
  f.snapshot = async () => (await recordController.snapshot()).snapshot;
  f.status = () => recordSyncSlot?.status;
  f.registration = () => recordSyncSlot?.registrationId;
  f.readBinding = () => policy.binding;
  f.booted = true;
  addEventListener('pagehide', () => { f.owned = false; recordEpoch++; closeRecordSync();
    void recordApp.close().then(() => recordController.close()); release(); }, { once: true });
}
void boot().catch((error) => { f.errors.push(error.message); f.failed = true; document.body.textContent = error.message; });
