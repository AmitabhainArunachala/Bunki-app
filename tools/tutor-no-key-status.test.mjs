/** On a device with no AI key the tutor's question line said "Draft saved on this device…", which reads as if the
 * question went to the tutor (owed repair 3, 2026-11-10). With no key it now says what is true: the question is kept
 * but not sent, the tutor needs his own key on this device, and where that key goes. The actual status function is
 * lifted from the tutor seam and run with the key present and absent. */
import vm from 'node:vm';
import { expect, test } from 'vitest';
import { corridorDeclarations } from './corridor-declarations.mjs';

function status(view, { key = '', language = 'en' } = {}) {
  const context = vm.createContext({
    tx: (ja, en) => (language === 'ja' ? ja : en),
    aiKey: () => key,
    teacherDraftWindowEdits: new Set(),
    teacherDraftInputErrors: new Set(),
  });
  vm.runInContext(corridorDeclarations('modules/teacher.mjs', ['teacherDraftStatus']), context);
  return context.teacherDraftStatus(view, {});
}
const kept = {
  state: 'saved',
  draft: { revision: 'r1', text: '「自動車」と「車」の違いは？', consumed: false },
};

test('with no key, a kept question says it was not sent and where the key goes', () => {
  const line = status(kept);
  expect(line).not.toMatch(/Draft saved/u);
  expect(line).toMatch(/kept on this device/u);
  expect(line).toMatch(/not sent/u);
  expect(line).toMatch(/your own AI key/u);
  expect(line).toMatch(/Your key below/u);
  // sentence case: one capital to open it, the field's own name, AI
  expect(line.charAt(0)).toBe(line.charAt(0).toUpperCase());
  const ja = status(kept, { language: 'ja' });
  expect(ja).toMatch(/送っていない/u);
  expect(ja).toMatch(/あなたの鍵/u);
});

test('with a key, the kept draft line is as before; an empty draft and a consumed one are untouched', () => {
  expect(status(kept, { key: 'sk-test' })).toBe(
    'Draft saved on this device. You can close the app and continue later.',
  );
  expect(status({ state: 'saved', draft: null })).toBe('');
  expect(status({ state: 'saved', draft: { ...kept.draft, consumed: true } })).toBe(
    'Your question and reply are saved. You can write the next question.',
  );
  expect(status({ state: 'saving', draft: kept.draft })).toBe('Saving your question…');
});
