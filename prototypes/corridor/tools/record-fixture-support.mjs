/** Setup and probes for isolated rendered-app fixtures. Changing a fixture
 * after boot uses the actual import UI; it never rewrites a migration fence or
 * patches application storage APIs. Only verifier-created loopback origins are
 * supported. These helpers must never receive an operator browser profile.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readAppRecord, readAppRecordSnapshot } from './record-test-support.mjs';

function fixtureOrigin(page) {
  const url = new URL(page.url());
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.port,
    'Record fixture setup requires an isolated loopback origin');
  return url.origin;
}
const normalized = (value) => Array.isArray(value) ? value.map(normalized)
  : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalized(value[key])])) : value;
const digest = (value) => createHash('sha256').update(JSON.stringify(normalized(value))).digest('hex');

/** Synthetic portable file bytes; production code is not used to calculate
 * the fixture's expected digests or counts. */
export function createAppBackupFixture(record, turns, journal) {
  const archive = { version: 1, turns };
  return { format: 'kairo-backup', version: journal ? 2 : 1,
    completeness: record.aiEvidenceIncomplete ? 'incomplete' : 'complete', record, archive,
    ...(journal ? { journal } : {}),
    counts: { archiveTurns: turns.length, chatTurns: record.aiChat?.length || 0,
      readingVersions: (record.aiReadings?.length || 0) + (record.aiReading ? 1 : 0),
      ...(journal ? { syncOperations: journal.operations.length } : {}) },
    sha256: { record: digest(record), archive: digest(archive), ...(journal ? { journal: digest(journal) } : {}) } };
}

/** An expression may combine DOM measurements with `record`, which is a real
 * native snapshot obtained before evaluation. Test source supplies the code;
 * learner content is passed as data, never interpolated into executable text.
 */
export async function evaluateAppRecord(page, expression) {
  assert.equal(typeof expression, 'string');
  const recordText = JSON.stringify(await readAppRecord(page));
  return page.evaluate(({ expression, recordText }) => {
    const evaluate = new Function('record', `"use strict"; return (${expression});`);
    return evaluate(JSON.parse(recordText));
  }, { expression, recordText });
}

/** Deliberately replace synthetic learner roots through the actual file import.
 * Preserve the current archive and Drift unless the fixture explicitly supplies
 * them. Local installation identity and source custody must survive the import.
 */
export async function restoreAppFixture(page, value, { archive, journal } = {}) {
  const origin = fixtureOrigin(page);
  const before = await readAppRecordSnapshot(page);
  const record = JSON.parse(JSON.stringify(value ?? { v: 1, taken: [] }));
  if (!Object.hasOwn(record, 'taken')) record.taken = [];
  if (!Object.hasOwn(record, 'driftState')) record.driftState = before.record.driftState;
  const turns = archive ?? before.archive.turns;
  const portableArchive = { version: 1, turns };
  const backup = createAppBackupFixture(record, turns, journal);
  await page.goto(`${origin}/index.html?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#tray').click();
  const marker = randomUUID();
  await page.evaluate((marker) => { window.__fixtureImportDocument = marker; }, marker);
  await page.locator('#import-file').setInputFiles({ name: 'synthetic-fixture-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.waitForFunction((marker) => window.__fixtureImportDocument !== marker && document.body.dataset.ready === '1', marker, { timeout: 20000 });
  const after = await readAppRecordSnapshot(page);
  assert.deepEqual(after.record, record, 'The actual importer must commit the supplied synthetic record');
  assert.deepEqual(after.archive, portableArchive);
  assert.deepEqual(after.installation, before.installation, 'Fixture restore cannot change installation authority');
  return after;
}
