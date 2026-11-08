import assert from 'node:assert/strict';
import { test } from 'vitest';
import { readAuthoredCorridor } from '../prototypes/corridor/tools/authored-corridor-source.mjs';
import { WORD_CONTROLS, LEARNING_RECORD_CONTROLS, applyControl, sha256 } from '../prototypes/corridor/tools/word-saved-answer-controls.mjs';
import { fileURLToPath } from 'node:url';
test('all original saved-answer literal controls mutate the actual authored closure exactly once', () => {
  const authored = readAuthoredCorridor(fileURLToPath(new URL('../prototypes/corridor/', import.meta.url)));
  assert(authored.files.some(file => file.path.startsWith('modules/')));
  assert.equal(Object.keys(WORD_CONTROLS).length, 34);
  assert.equal(Object.keys(LEARNING_RECORD_CONTROLS).length, 2);
  for (const table of [WORD_CONTROLS, LEARNING_RECORD_CONTROLS]) for (const name of Object.keys(table)) {
    const mutant = applyControl(authored.source, table, name);
    assert.notEqual(sha256(mutant), sha256(authored.source), name);
  }
});
