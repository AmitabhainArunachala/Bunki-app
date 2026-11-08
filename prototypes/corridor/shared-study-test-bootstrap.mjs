/** QA-only boot seam. It is never part of the production index: the isolated
 * build script swaps the sole Corridor module entry for this file and writes
 * the explicit marker/run metadata. No query string can activate it. */
import {createSharedStudyTestHost, QA_HOST_MARKER} from './shared-study-test-host.mjs';

const document = globalThis.document;
const marker = document?.querySelector?.('meta[name="bunki-shared-study-qa"]')?.getAttribute?.('content');
const runId = document?.querySelector?.('meta[name="bunki-shared-study-qa-run"]')?.getAttribute?.('content');
if (marker !== QA_HOST_MARKER) throw Error('shared-study-qa-explicit-marker-required');
if (typeof runId !== 'string' || !runId) throw Error('shared-study-qa-explicit-run-required');

const host = await createSharedStudyTestHost({marker, runId});
// The actual Corridor router/templates read this exact global during boot.
globalThis.bunkiSharedStudyHost = host;
function onPagehide(event) {
  if (event?.persisted === true) return;
  globalThis.removeEventListener('pagehide', onPagehide);
  host.dispose();
}
globalThis.addEventListener('pagehide', onPagehide);
await import('./corridor.js');
