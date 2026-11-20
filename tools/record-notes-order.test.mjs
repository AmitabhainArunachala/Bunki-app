/** Today → Your record and backup: "Saved notes" was followed at once by the "Sync between devices" kicker and its
 * lines, and only then by the note field (owed repair 6, 2026-11-10). Each heading now sits over its own content: the
 * note field, its status and the notes under "Saved notes", then the sync group under its own kicker. The actual
 * renderRecordNotes is lifted from the corridor and drawn in a silent page with its children stubbed by class. */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { corridorDeclarations } from './corridor-declarations.mjs';
import { openCorridorSourcePage } from './corridor-source-page.mjs';

const source = corridorDeclarations('corridor.js', ['renderRecordNotes']);
const draw = (options) => `(() => {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const tx = (ja, en) => en;
  const renderRecordSync = () => { const box = el('div', 'record-sync'); box.append(el('p', 'eyebrow', 'Sync between devices'), el('p', 'airead-note record-sync-status')); return box; };
  const renderPersonalNoteComposer = () => el('div', 'record-note-compose', 'Write a note in your own words');
  const updateRecordNotesContainer = () => {};
  ${source}
  const notes = renderRecordNotes(${JSON.stringify(options)});
  return [...notes.children].map((child) => child.className.split(' ')[0]);
})()`;

let host;
beforeAll(async () => {
  host = await openCorridorSourcePage();
}, 60000);
afterAll(async () => {
  await host?.close();
});

test('“Saved notes” is followed by the note field and the notes; the sync group comes after, under its own kicker', async () => {
  expect(await host.page.evaluate(draw({}))).toEqual([
    'section-title',
    'record-note-compose',
    'record-notes-status',
    'record-notes-items',
    'record-sync',
  ]);
});

test('without sync (the layout under test keeps it in Settings) the notes are unchanged', async () => {
  expect(await host.page.evaluate(draw({ sync: false }))).toEqual([
    'section-title',
    'record-note-compose',
    'record-notes-status',
    'record-notes-items',
  ]);
});
