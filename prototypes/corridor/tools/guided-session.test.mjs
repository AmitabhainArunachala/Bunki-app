/** The guided session's pure parts: the state engine's evidence rules (ported from Codex's
 * engine-check.cjs) and the question sets against the reviewed bank they claim to copy.
 * Run: node --test prototypes/corridor/tools/guided-session.test.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createGuidedState,
  loadGuidedState,
  reduceGuidedState,
  saveGuidedState,
} from '../guided-session-engine.mjs';
import {
  guidedQuestionFromBankItem,
  loadGuidedIndex,
  loadGuidedSet,
  resolveBankQuestions,
  validateGuidedSet,
} from '../guided-session-content.mjs';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(readFileSync(resolve(corridor, path), 'utf8'));
const at = 1000;
const step = (state, event) => reduceGuidedState(state, { at, source: 'check', ...event });
const memoryStorage = () => {
  const memory = new Map();
  return {
    memory,
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value),
  };
};

test('evidence rules survive the port', () => {
  let state = createGuidedState('set-a', ['q1', 'q2', 'q3']);
  state = step(state, { type: 'START' });
  state = step(state, { type: 'HELP', id: 'q1' });
  state = step(state, { type: 'COMMIT', id: 'q1', choice: 2, correct: false });
  state = step(state, { type: 'COMMIT', id: 'q1', choice: 1, correct: true });
  assert.equal(state.answers.q1.choice, 2, 'first committed answer is immutable');
  assert.equal(state.answers.q1.helpBefore, true, 'pre-answer help is preserved');
  state = step(state, { type: 'COMMIT', id: 'q2', choice: 1, correct: true });
  state = step(state, { type: 'HELP', id: 'q2' });
  assert.equal(
    state.answers.q2.helpBefore,
    false,
    'post-answer explanation is not pre-answer help',
  );
  state = step(state, { type: 'FLAG', id: 'q2' });
  state = step(state, { type: 'SAVE_EXIT' });
  state = step(state, { type: 'START' });
  assert.equal(state.view, 'question');
  state = step(state, { type: 'GO_TO', index: 99, count: 3 });
  assert.equal(state.index, 2, 'GO_TO clamps');

  const questions = [
    { id: 'q1', target: '点検', cards: ['word:点検', 'word:点検', 'nonsense'] },
    { id: 'q2', target: '〜ものの', cards: ['grammar:n2-mono-no'] },
    { id: 'q3', target: 'unused', cards: ['word:受付'] },
  ];
  state = step(state, { type: 'FINISH', questions });
  state = step(state, { type: 'FINISH', questions });
  assert.deepEqual(
    state.learn.map((row) => row.id),
    ['q1', 'q2'],
    'wrong and flagged, once each',
  );
  assert.deepEqual(
    state.learn[0].cards,
    [{ key: 'word:点検', status: 'pending' }],
    'cards deduped and checked',
  );

  state = step(state, { type: 'CARD_RESULT', id: 'q1', card: 'word:点検', status: 'added' });
  state = step(state, { type: 'CARD_RESULT', id: 'q1', card: 'word:点検', status: 'invented' });
  assert.equal(state.learn[0].cards[0].status, 'added', 'unknown statuses are refused');

  state = step(state, { type: 'REVIEW', id: 'q1' });
  state = step(state, { type: 'UNDO', id: 'q1' });
  assert.equal(state.learn[0].removed, false, 'a practised row cannot be removed');

  state = step(state, { type: 'FRESH_RESET', id: 'q1' });
  state = step(state, { type: 'FRESH_SELECT', choice: 2 });
  state = step(state, { type: 'FRESH_SELECT', choice: 1 });
  assert.equal(state.fresh.choice, 2, 'first fresh response is frozen');

  const beforeDraft = state.events.length;
  state = step(state, { type: 'DRAFT', text: '自分の文。' });
  assert.equal(state.draft, '自分の文。');
  assert.equal(state.events.length, beforeDraft, 'a draft is never written into the evidence log');
  assert.ok(!JSON.stringify(state.events).includes('自分の文'), 'the draft text is not in the log');
});

test('a word looked up before the first answer is recorded help; without help nothing is', () => {
  let state = step(createGuidedState('set-a', ['q1', 'q2', 'q3']), { type: 'START' });
  state = step(state, { type: 'LOOKUP', id: 'q1' });
  assert.equal(state.answers.q1.choice, null);
  assert.equal(state.answers.q1.correct, null, 'looking up a word never creates performance evidence');
  assert.deepEqual(state.learn, []);
  assert.equal(state.answers.q2.lookupBefore, false, 'help belongs only to the named question');
  const logged = state.events.length;
  state = step(state, { type: 'LOOKUP', id: 'q1' });
  assert.equal(state.events.length, logged, 'a second lookup on the same question records nothing new');
  state = step(state, { type: 'COMMIT', id: 'q1', choice: 1, correct: true });
  assert.deepEqual(
    [state.answers.q1.lookupBefore, state.answers.q1.helpBefore, state.answers.q1.explained],
    [true, false, false],
    'a lookup is help before the answer, not an opened explanation',
  );
  state = step(state, { type: 'COMMIT', id: 'q2', choice: 1, correct: true });
  assert.deepEqual(
    [state.answers.q2.lookupBefore, state.answers.q2.helpBefore],
    [false, false],
    'an answer given without help stays unassisted',
  );
  state = step(state, { type: 'LOOKUP', id: 'q2' });
  assert.equal(state.answers.q2.lookupBefore, false, 'a lookup after the answer does not rewrite it');
  assert.equal(state.answers.q2.correct, true);
  assert.equal(state.events.filter((event) => event.type === 'LOOKUP').length, 1);
  state = step(state, { type: 'HELP', id: 'q1' });
  assert.equal(state.answers.q1.helpBefore, false, 'an explanation after the answer does not rewrite lookup provenance');
  assert.equal(state.answers.q1.explained, true);
  state = step(state, { type: 'HELP', id: 'q3' });
  state = step(state, { type: 'LOOKUP', id: 'q3' });
  assert.deepEqual([state.answers.q3.helpBefore, state.answers.q3.lookupBefore], [true, true]);
  assert.equal(state.answers.q3.choice, null, 'both kinds of help still leave an unanswered question');
  assert.equal(step(state, { type: 'LOOKUP', id: 'unknown' }), state);
  const storage = memoryStorage();
  assert.equal(saveGuidedState(storage, 'k', state).ok, true);
  assert.equal(loadGuidedState(storage, 'k', 'set-a', ['q1', 'q2', 'q3']).state.answers.q1.lookupBefore, true);
  // a session saved before lookups existed still loads
  const legacy = JSON.parse(storage.getItem('k'));
  for (const answer of Object.values(legacy.answers)) delete answer.lookupBefore;
  storage.setItem('legacy', JSON.stringify(legacy));
  const loaded = loadGuidedState(storage, 'legacy', 'set-a', ['q1', 'q2', 'q3']);
  assert.equal(loaded.error, null);
  assert.equal(loaded.state.answers.q1.choice, 1);
  legacy.answers.q3.lookupBefore = 'yes';
  storage.setItem('malformed', JSON.stringify(legacy));
  assert.equal(loadGuidedState(storage, 'malformed', 'set-a', ['q1', 'q2', 'q3']).error, 'invalid-state');
});

test('saved words record their deck status and never touch answers', () => {
  let state = step(createGuidedState('set-a', ['q1', 'q2']), { type: 'START' });
  state = step(state, { type: 'COMMIT', id: 'q1', choice: 0, correct: true });
  const answers = JSON.stringify(state.answers);
  state = step(state, { type: 'SAVE_WORD', wordId: 'word_41', id: 'q1', status: 'added' });
  state = step(state, { type: 'SAVE_WORD', wordId: 'word_41', id: 'q2', status: 'added' });
  state = step(state, { type: 'SAVE_WORD', wordId: 'word_58', id: 'q1', status: 'failed' });
  state = step(state, { type: 'SAVE_WORD', wordId: 'word_2', id: 'unknown', status: 'added' });
  assert.deepEqual(state.savedWords, [{ wordId: 'word_41', sourceId: 'q1', status: 'added' }]);
  assert.equal(JSON.stringify(state.answers), answers);
  state = step(state, { type: 'REMOVE_WORD', wordId: 'word_41' });
  assert.equal(state.savedWords.length, 0);
});

test('storage: round trip, set identity, unreadable bytes, failed writes', () => {
  const storage = memoryStorage();
  let state = step(createGuidedState('set-a', ['q1', 'q2']), { type: 'START' });
  state = step(state, { type: 'COMMIT', id: 'q1', choice: 3, correct: false });
  assert.equal(saveGuidedState(storage, 'k', state).ok, true);
  const loaded = loadGuidedState(storage, 'k', 'set-a', ['q1', 'q2']);
  assert.equal(loaded.error, null);
  assert.equal(loaded.state.answers.q1.choice, 3);
  const other = loadGuidedState(storage, 'k', 'set-b', ['q1', 'q2']);
  assert.equal(other.error, 'invalid-state', 'a session never loads into another set');
  const fewer = loadGuidedState(storage, 'k', 'set-a', ['q1']);
  assert.equal(fewer.error, 'invalid-state', 'nor into a different question list');
  storage.memory.set('bad', '{broken');
  const broken = loadGuidedState(storage, 'bad', 'set-a', ['q1']);
  assert.equal(broken.error, 'invalid-state', 'bytes that are not JSON are unreadable, and kept aside');
  assert.equal(broken.state.answers.q1.choice, null);
  const refused = loadGuidedState(
    {
      getItem() {
        throw new Error('denied');
      },
    },
    'k',
    'set-a',
    ['q1'],
  );
  assert.equal(refused.error, 'denied', 'storage that refuses to read is not unreadable bytes');
  const failed = saveGuidedState(
    {
      setItem() {
        throw new Error('quota');
      },
    },
    'x',
    state,
  );
  assert.deepEqual(failed, { ok: false, error: 'quota' });
});

test('the N2 set validates and its six items are the reviewed bank items, byte for byte', async () => {
  const index = await loadGuidedIndex(readJson);
  assert.equal(index.length, 1);
  const set = await loadGuidedSet(index[0], readJson);
  assert.equal(set.questions.length, 6);
  const form = await readJson(set.source.formPath);
  assert.equal(form.id, set.source.formId);
  assert.equal(form.sha256, set.source.formSha256);
  const catalog = await readJson('data/assessment/catalog.json');
  const entry = catalog.entries.find((row) => row.id === set.source.formId);
  assert.equal(
    entry.formSha256,
    set.source.formSha256,
    'the catalog still serves the same reviewed form',
  );
  assert.equal(entry.review.status, 'ai-reviewed');
  for (const q of set.questions) {
    const bank = guidedQuestionFromBankItem(form, q.source.ref);
    assert.equal(bank.prompt, q.prompt, `${q.id} prompt`);
    assert.deepEqual(bank.options, [...q.options], `${q.id} options`);
    assert.equal(bank.correct, q.correct, `${q.id} key`);
    assert.equal(bank.passage, q.passage, `${q.id} passage`);
    assert.equal(bank.kind, q.kind, `${q.id} skill`);
    assert.equal(bank.itemSha256, q.source.itemSha256, `${q.id} item digest`);
  }
  // every card a Learn row may enrol names a real dictionary word or grammar entry
  const dict = (await readJson('data/share_alike/dict.json')).words;
  const grammar = (await readJson('data/original/grammar-v11.json')).entries;
  for (const card of set.questions.flatMap((q) => q.cards)) {
    if (card.t === 'word') assert.ok(dict[card.id], `${card.id} is in the core dictionary`);
    else
      assert.ok(
        grammar.some((row) => row.id === card.id),
        `${card.id} is a grammar entry`,
      );
  }
  for (const word of Object.values(set.words)) {
    assert.equal(
      dict[word.surface]?.r,
      word.reading,
      `${word.surface} reads ${word.reading} in the core dictionary`,
    );
  }
});

test('a bank-linked set resolves to the same questions, and refuses a changed item', async () => {
  const raw = await readJson('guided/sets/n2-living-thread-01.json');
  const linked = {
    ...raw,
    questions: raw.questions.map((q) => {
      const { prompt, options, correct, passage, kind, ...rest } = q;
      void prompt;
      void options;
      void correct;
      void passage;
      void kind;
      return { ...rest, bank: { itemId: q.source.ref, itemSha256: q.source.itemSha256 } };
    }),
  };
  const resolved = validateGuidedSet(await resolveBankQuestions(linked, readJson));
  const inline = validateGuidedSet(raw);
  assert.deepEqual(
    resolved.questions.map((q) => [q.id, q.kind, q.prompt, q.options, q.correct, q.passage]),
    inline.questions.map((q) => [q.id, q.kind, q.prompt, q.options, q.correct, q.passage]),
  );
  const tampered = structuredClone(linked);
  tampered.questions[0].bank.itemSha256 = '0'.repeat(64);
  await assert.rejects(
    resolveBankQuestions(tampered, readJson),
    /changed since this teaching was written/u,
  );
  const broken = structuredClone(raw);
  broken.questions[1].correct = 9;
  assert.throws(() => validateGuidedSet(broken), /no correct option/u);
  const missingBranch = structuredClone(raw);
  missingBranch.questions[2].branches = ['nowhere'];
  assert.throws(() => validateGuidedSet(missingBranch), /missing branch/u);
});
