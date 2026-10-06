/**
 * 案内つきの稽古 — the guided session's question sets.
 *
 * A set is one JSON file under guided/sets/, listed in guided/sets/index.json. Adding a set is
 * adding a file and an index row; the room reads whatever the index lists. Every set is checked
 * fail-closed by validateGuidedSet before the room shows a single question.
 *
 * Set shape (schema 'kairo-guided-set/1')
 *   id, level ('N5'…'N1'), minutes, title {ja, en}
 *   source       where the questions come from: the bank form's id, digest and path, and the
 *                review status shown to the learner verbatim (e.g. 'ai-reviewed-practice')
 *   sourceNote   {ja, en} — the truthful label for the whole set
 *   teaching     {status, note} — added prose is labelled as an authored draft
 *   dictionary   licence and attribution for `words`
 *   words        {key: {surface, reading, meaning, source}} — the doors inside teaching text
 *   questions[]  id, kind ('vocabulary' | 'grammar' | 'reading'), title, prompt, passage?,
 *                options, correct, target {key, reading, label, meaning}, gap {ja, en},
 *                hint {ja, en}, cards [{t, id}] (what Learn enrols in the real deck),
 *                branches [branch key], explanation {meaning, rule, contrast, exampleJa,
 *                exampleEn}, source {label, ref, status, itemSha256, …}
 *   branches     {key: {title, reading, meaning, body, exampleJa, exampleEn}}
 *   fresh        {byTarget: {targetKey: item}, byKind: {kind: item}, default: item}
 *                item = {prompt, options, correct, explanation}
 *
 * Bank-linked questions (the seam for sets built from the JLPT bank): a question may carry
 * `bank: {itemId, itemSha256}` and leave out prompt, options, correct, passage and kind. The
 * loader then reads them from the reviewed form at `source.formPath` and refuses the whole set
 * when the form's or the item's digest differs from the one the teaching was written against.
 */

export const GUIDED_SET_SCHEMA = 'kairo-guided-set/1';
export const GUIDED_INDEX_SCHEMA = 'kairo-guided-sets/1';
export const GUIDED_INDEX_PATH = 'guided/sets/index.json';

const LEVELS = new Set(['N5', 'N4', 'N3', 'N2', 'N1']);
const KINDS = new Set(['vocabulary', 'grammar', 'reading']);
const CARD_TYPES = new Set(['word', 'kanji', 'grammar', 'particle', 'idiom']);

const fail = (reason) => {
  throw new TypeError(`Guided set: ${reason}`);
};
const plain = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const bilingual = (value) => plain(value) && text(value.ja) && text(value.en);
const safeKey = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/u.test(value);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function checkOptions(options, correct, where) {
  if (!Array.isArray(options) || options.length < 2 || options.length > 6 || !options.every(text)) {
    fail(`${where} needs two to six options`);
  }
  if (new Set(options).size !== options.length) fail(`${where} repeats an option`);
  if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
    fail(`${where} has no correct option`);
  }
}

function checkFresh(item, where) {
  if (!plain(item) || !text(item.prompt) || !text(item.explanation)) fail(`${where} is incomplete`);
  checkOptions(item.options, item.correct, where);
}

/** The guided shape of one bank item, read from its reviewed form (kairo-assessment-form). */
export function guidedQuestionFromBankItem(form, itemId) {
  if (!plain(form) || !Array.isArray(form.items)) fail('the bank form is unreadable');
  const item = form.items.find((row) => row?.id === itemId);
  if (!item) fail(`the bank form has no item ${itemId}`);
  if (item.response?.kind !== 'selected' || !Array.isArray(item.response.options)) {
    fail(`${itemId} is not a selected-response item`);
  }
  const options = item.response.options.map((option) => option?.text);
  const correct = item.response.options.findIndex(
    (option) => option?.id === item.response.answerOptionId,
  );
  const passageRef = Array.isArray(item.passages) ? item.passages[0] : null;
  const passage = passageRef
    ? (form.passages || []).find((row) => row?.id === passageRef.id)
    : null;
  if (passageRef && (!passage || passage.sha256 !== passageRef.sha256)) {
    fail(`${itemId} names a passage the form does not hold`);
  }
  return {
    kind: item.skill,
    prompt: item.prompt,
    ...(passage ? { passage: passage.text } : {}),
    options,
    correct,
    itemSha256: item.sha256,
    ...(passage ? { passageId: passage.id, passageSha256: passage.sha256 } : {}),
  };
}

/** Check a set, fail-closed, and return it deeply frozen. Throws a TypeError naming the fault. */
export function validateGuidedSet(raw) {
  if (!plain(raw) || raw.schema !== GUIDED_SET_SCHEMA) fail('unknown schema');
  if (typeof raw.id !== 'string' || !/^[a-z0-9][a-z0-9:-]{0,119}$/u.test(raw.id)) {
    fail('a set needs an id');
  }
  if (!LEVELS.has(raw.level)) fail('a set needs a JLPT level');
  if (!Number.isInteger(raw.minutes) || raw.minutes < 1 || raw.minutes > 120) {
    fail('a set needs a length in minutes');
  }
  if (!bilingual(raw.title) || !bilingual(raw.sourceNote)) fail('a set needs its title and label');
  if (!plain(raw.source) || !text(raw.source.status) || !text(raw.source.formId)) {
    fail('a set must say where its questions come from');
  }
  if (!plain(raw.teaching) || !text(raw.teaching.status)) fail('a set must label its teaching');
  if (
    !plain(raw.dictionary) ||
    !text(raw.dictionary.license) ||
    !text(raw.dictionary.attribution)
  ) {
    fail('a set must credit its dictionary');
  }
  if (!plain(raw.words)) fail('a set needs its word doors');
  for (const [key, word] of Object.entries(raw.words)) {
    if (
      !safeKey(key) ||
      !plain(word) ||
      !['surface', 'reading', 'meaning', 'source'].every((f) => text(word[f]))
    ) {
      fail(`word ${key} is incomplete`);
    }
  }
  if (!plain(raw.branches)) fail('a set needs its branches (may be empty)');
  for (const [key, branch] of Object.entries(raw.branches)) {
    const fields = ['title', 'reading', 'meaning', 'body', 'exampleJa', 'exampleEn'];
    if (!safeKey(key) || !plain(branch) || !fields.every((f) => text(branch[f]))) {
      fail(`branch ${key} is incomplete`);
    }
  }
  if (!plain(raw.fresh) || !plain(raw.fresh.byTarget) || !plain(raw.fresh.byKind)) {
    fail('a set needs its fresh contexts');
  }
  checkFresh(raw.fresh.default, 'the default fresh context');
  for (const [key, item] of Object.entries(raw.fresh.byTarget)) checkFresh(item, `fresh ${key}`);
  for (const [key, item] of Object.entries(raw.fresh.byKind)) {
    if (!KINDS.has(key)) fail(`fresh kind ${key} is unknown`);
    checkFresh(item, `fresh ${key}`);
  }
  if (!Array.isArray(raw.questions) || raw.questions.length < 1 || raw.questions.length > 50) {
    fail('a set needs one to fifty questions');
  }
  const ids = new Set();
  const targets = new Set();
  for (const [index, q] of raw.questions.entries()) {
    const where = `question ${index + 1}`;
    if (!plain(q) || !text(q.id) || ids.has(q.id)) fail(`${where} needs a unique id`);
    ids.add(q.id);
    if (!KINDS.has(q.kind)) fail(`${where} has an unknown kind`);
    if (!text(q.title) || !text(q.prompt)) fail(`${where} needs a title and a prompt`);
    if (q.passage !== undefined && !text(q.passage)) fail(`${where} has an empty passage`);
    checkOptions(q.options, q.correct, where);
    const target = q.target;
    if (!plain(target) || !safeKey(target.key) || targets.has(target.key)) {
      fail(`${where} needs a unique target`);
    }
    if (!['reading', 'label', 'meaning'].every((f) => text(target[f]))) {
      fail(`${where} has an incomplete target`);
    }
    targets.add(target.key);
    if (!bilingual(q.gap) || !bilingual(q.hint)) fail(`${where} needs its gap and hint`);
    if (!Array.isArray(q.cards) || q.cards.length > 6) fail(`${where} lists too many cards`);
    for (const card of q.cards) {
      if (!plain(card) || !CARD_TYPES.has(card.t) || !text(card.id) || card.id.length > 200) {
        fail(`${where} names an unusable card`);
      }
    }
    if (!Array.isArray(q.branches) || !q.branches.every((key) => raw.branches[key])) {
      fail(`${where} names a missing branch`);
    }
    const x = q.explanation;
    if (
      !plain(x) ||
      !['meaning', 'rule', 'contrast', 'exampleJa', 'exampleEn'].every((f) => text(x[f]))
    ) {
      fail(`${where} has an incomplete explanation`);
    }
    if (
      !plain(q.source) ||
      !text(q.source.label) ||
      !text(q.source.ref) ||
      !text(q.source.status)
    ) {
      fail(`${where} must name its source`);
    }
  }
  return freeze(JSON.parse(JSON.stringify(raw)));
}

/** Fill bank-linked questions from their reviewed form. Inline questions pass through. */
export async function resolveBankQuestions(raw, fetchJson) {
  const linked = Array.isArray(raw?.questions) ? raw.questions.filter((q) => plain(q?.bank)) : [];
  if (!linked.length) return raw;
  if (!text(raw.source?.formPath)) fail('bank-linked questions need source.formPath');
  const form = await fetchJson(raw.source.formPath);
  if (text(raw.source.formSha256) && form?.sha256 !== raw.source.formSha256) {
    fail('the bank form changed since this teaching was written');
  }
  return {
    ...raw,
    questions: raw.questions.map((q) => {
      if (!plain(q?.bank)) return q;
      const bank = guidedQuestionFromBankItem(form, q.bank.itemId);
      if (bank.itemSha256 !== q.bank.itemSha256) {
        fail(`${q.bank.itemId} changed since this teaching was written`);
      }
      const { bank: link, ...rest } = q;
      return {
        ...rest,
        id: rest.id || link.itemId,
        kind: bank.kind,
        prompt: bank.prompt,
        ...(bank.passage ? { passage: bank.passage } : {}),
        options: bank.options,
        correct: bank.correct,
        source: {
          ...rest.source,
          ref: link.itemId,
          itemSha256: bank.itemSha256,
          ...(bank.passageId
            ? { passageId: bank.passageId, passageSha256: bank.passageSha256 }
            : {}),
        },
      };
    }),
  };
}

export function validateGuidedIndex(raw) {
  if (!plain(raw) || raw.schema !== GUIDED_INDEX_SCHEMA || !Array.isArray(raw.sets)) {
    fail('the set index is unreadable');
  }
  const seen = new Set();
  const sets = raw.sets.map((entry, index) => {
    if (
      !plain(entry) ||
      !text(entry.id) ||
      seen.has(entry.id) ||
      typeof entry.path !== 'string' ||
      !/^guided\/sets\/[A-Za-z0-9_-]+\.json$/u.test(entry.path) ||
      !LEVELS.has(entry.level) ||
      !Number.isInteger(entry.questionCount) ||
      !Number.isInteger(entry.minutes) ||
      !bilingual(entry.title)
    ) {
      fail(`index row ${index + 1} is incomplete`);
    }
    seen.add(entry.id);
    return entry;
  });
  if (!sets.length) fail('the set index is empty');
  return freeze(JSON.parse(JSON.stringify(sets)));
}

/** Read the index. `fetchJson(path)` resolves a path relative to the corridor root. */
export async function loadGuidedIndex(fetchJson) {
  return validateGuidedIndex(await fetchJson(GUIDED_INDEX_PATH));
}

/** Read, resolve and check one set named by an index row. */
export async function loadGuidedSet(entry, fetchJson) {
  const raw = await fetchJson(entry.path);
  const set = validateGuidedSet(await resolveBankQuestions(raw, fetchJson));
  if (
    set.id !== entry.id ||
    set.level !== entry.level ||
    set.questions.length !== entry.questionCount
  ) {
    fail(`${entry.path} does not match its index row`);
  }
  return set;
}
