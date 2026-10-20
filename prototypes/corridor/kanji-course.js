/* Authored kanji practice: static data and pure session transitions only.
 * Browser: BunkiKanjiCourse. CommonJS: require('./kanji-course.js').
 * Never reads/writes a learner record, clock, storage, scheduler or network.
 * Keyword recall, whole-word reading and optional writing are distinct targets.
 * Dictionary keywords are not compound translations; explanations and source
 * transfer remain withheld until independently reviewed and revalidated.
 */
/* global module:readonly -- Optional CommonJS export, guarded for browsers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BunkiKanjiCourse = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COURSE_ID = 'kanji-foundations-24';
  const REVISION = 1;
  const KINDS = ['meaning', 'reading'];
  const UNITS = [
  {
    "id": "shapes",
    "title": "Repeated shapes",
    "prerequisites": [],
    "targets": [
      {
        "id": "木",
        "kanji": "木",
        "meaning": "Tree",
        "wordKey": "木",
        "wordMeaning": "tree, wood",
        "readings": [
          "き"
        ],
        "distractors": [
          "人",
          "月",
          "学"
        ],
        "examples": [
          {
            "wordKey": "木曜日",
            "wordMeaning": "Thursday",
            "readings": [
              "もくようび"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "林",
        "kanji": "林",
        "meaning": "Grove",
        "wordKey": "林",
        "wordMeaning": "woods, forest",
        "readings": [
          "はやし"
        ],
        "distractors": [
          "土",
          "休",
          "情"
        ],
        "examples": [
          {
            "wordKey": "森林",
            "wordMeaning": "forest, woods",
            "readings": [
              "しんりん"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "森",
        "kanji": "森",
        "meaning": "Forest",
        "wordKey": "森",
        "wordMeaning": "forest",
        "readings": [
          "もり"
        ],
        "distractors": [
          "日",
          "入",
          "末"
        ],
        "examples": [
          {
            "wordKey": "森林",
            "wordMeaning": "forest, woods",
            "readings": [
              "しんりん"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "本",
        "kanji": "本",
        "meaning": "Book",
        "wordKey": "本",
        "wordMeaning": "book",
        "readings": [
          "ほん"
        ],
        "distractors": [
          "月",
          "晴",
          "人"
        ],
        "examples": [
          {
            "wordKey": "日本",
            "wordMeaning": "Japan",
            "readings": [
              "にっぽん"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      }
    ]
  },
  {
    "id": "outlines",
    "title": "Similar outlines",
    "prerequisites": [
      "shapes"
    ],
    "targets": [
      {
        "id": "人",
        "kanji": "人",
        "meaning": "Person",
        "wordKey": "人",
        "wordMeaning": "man, person",
        "readings": [
          "ひと"
        ],
        "distractors": [
          "本",
          "月",
          "清"
        ],
        "examples": [
          {
            "wordKey": "人口",
            "wordMeaning": "population",
            "readings": [
              "じんこう"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "入",
        "kanji": "入",
        "meaning": "Enter",
        "wordKey": "入る",
        "wordMeaning": "to enter, to contain",
        "readings": [
          "はいる"
        ],
        "distractors": [
          "林",
          "情",
          "天"
        ],
        "examples": [
          {
            "wordKey": "入口",
            "wordMeaning": "entrance",
            "readings": [
              "いりぐち"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "大",
        "kanji": "大",
        "meaning": "Large",
        "wordKey": "大きい",
        "wordMeaning": "big, large",
        "readings": [
          "おおきい"
        ],
        "distractors": [
          "土",
          "休",
          "生"
        ],
        "examples": [
          {
            "wordKey": "大学",
            "wordMeaning": "college; university",
            "readings": [
              "だいがく"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "休",
        "kanji": "休",
        "meaning": "Rest",
        "wordKey": "休む",
        "wordMeaning": "to rest, to have a break",
        "readings": [
          "やすむ"
        ],
        "distractors": [
          "青",
          "本",
          "月"
        ],
        "examples": [
          {
            "wordKey": "休憩",
            "wordMeaning": "rest, break",
            "readings": [
              "きゅうけい"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      }
    ]
  },
  {
    "id": "combinations",
    "title": "Useful combinations",
    "prerequisites": [
      "shapes"
    ],
    "targets": [
      {
        "id": "日",
        "kanji": "日",
        "meaning": "Day",
        "wordKey": "日曜日",
        "wordMeaning": "Sunday",
        "readings": [
          "にちようび"
        ],
        "distractors": [
          "人",
          "土",
          "学"
        ],
        "examples": [
          {
            "wordKey": "日",
            "wordMeaning": "sun, sunshine",
            "readings": [
              "ひ"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "月",
        "kanji": "月",
        "meaning": "Month",
        "wordKey": "月曜日",
        "wordMeaning": "Monday",
        "readings": [
          "げつようび"
        ],
        "distractors": [
          "森",
          "本",
          "大"
        ],
        "examples": [
          {
            "wordKey": "月",
            "wordMeaning": "moon",
            "readings": [
              "つき"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "明",
        "kanji": "明",
        "meaning": "Bright",
        "wordKey": "明るい",
        "wordMeaning": "light; bright; well-lit; well-lighted; bright (colour); cheerful",
        "readings": [
          "あかるい"
        ],
        "distractors": [
          "入",
          "土",
          "情"
        ],
        "examples": [
          {
            "wordKey": "説明",
            "wordMeaning": "explanation",
            "readings": [
              "せつめい"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "田",
        "kanji": "田",
        "meaning": "Rice Field",
        "wordKey": "田",
        "wordMeaning": "rice field",
        "readings": [
          "た"
        ],
        "distractors": [
          "生",
          "人",
          "青"
        ],
        "examples": [
          {
            "wordKey": "水田",
            "wordMeaning": "(water-filled) paddy field",
            "readings": [
              "すいでん"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      }
    ]
  },
  {
    "id": "marks",
    "title": "Small marks matter",
    "prerequisites": [
      "shapes",
      "outlines"
    ],
    "targets": [
      {
        "id": "土",
        "kanji": "土",
        "meaning": "Soil",
        "wordKey": "土",
        "wordMeaning": "earth, soil",
        "readings": [
          "つち"
        ],
        "distractors": [
          "月",
          "人",
          "情"
        ],
        "examples": [
          {
            "wordKey": "土曜日",
            "wordMeaning": "Saturday",
            "readings": [
              "どようび"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "天",
        "kanji": "天",
        "meaning": "Heavens",
        "wordKey": "天気",
        "wordMeaning": "weather",
        "readings": [
          "てんき"
        ],
        "distractors": [
          "休",
          "本",
          "学"
        ],
        "examples": [
          {
            "wordKey": "雨天",
            "wordMeaning": "rainy weather",
            "readings": [
              "うてん"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "未",
        "kanji": "未",
        "meaning": "Un-",
        "wordKey": "未来",
        "wordMeaning": "future (life tense)",
        "readings": [
          "みらい"
        ],
        "distractors": [
          "森",
          "青",
          "学"
        ],
        "examples": [
          {
            "wordKey": "未定",
            "wordMeaning": "not yet fixed, undecided",
            "readings": [
              "みてい"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "末",
        "kanji": "末",
        "meaning": "End",
        "wordKey": "月末",
        "wordMeaning": "end of the month",
        "readings": [
          "げつまつ"
        ],
        "distractors": [
          "土",
          "人",
          "生"
        ],
        "examples": [
          {
            "wordKey": "末っ子",
            "wordMeaning": "youngest child",
            "readings": [
              "すえっこ"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      }
    ]
  },
  {
    "id": "sound-clues",
    "title": "A recurring sound clue",
    "prerequisites": [
      "combinations"
    ],
    "targets": [
      {
        "id": "青",
        "kanji": "青",
        "meaning": "Blue",
        "wordKey": "青い",
        "wordMeaning": "blue",
        "readings": [
          "あおい"
        ],
        "distractors": [
          "学",
          "田",
          "人"
        ],
        "examples": [
          {
            "wordKey": "青年",
            "wordMeaning": "youth, young man",
            "readings": [
              "せいねん"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "清",
        "kanji": "清",
        "meaning": "Pure",
        "wordKey": "清い",
        "wordMeaning": "clear, pure",
        "readings": [
          "きよい"
        ],
        "distractors": [
          "月",
          "本",
          "入"
        ],
        "examples": [
          {
            "wordKey": "清潔",
            "wordMeaning": "clean",
            "readings": [
              "せいけつ"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "晴",
        "kanji": "晴",
        "meaning": "Clear Up",
        "wordKey": "晴れる",
        "wordMeaning": "to be sunny",
        "readings": [
          "はれる"
        ],
        "distractors": [
          "田",
          "本",
          "休"
        ],
        "examples": [
          {
            "wordKey": "晴天",
            "wordMeaning": "fine weather",
            "readings": [
              "せいてん"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "情",
        "kanji": "情",
        "meaning": "Feelings",
        "wordKey": "情報",
        "wordMeaning": "information; news; report; intelligence; information (data contained in characters, signals, code, etc.); informatics (as a subject)",
        "readings": [
          "じょうほう"
        ],
        "distractors": [
          "森",
          "月",
          "大"
        ],
        "examples": [
          {
            "wordKey": "感情",
            "wordMeaning": "emotion(s), feeling(s)",
            "readings": [
              "かんじょう"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      }
    ]
  },
  {
    "id": "word-readings",
    "title": "Read the word",
    "prerequisites": [
      "outlines",
      "combinations"
    ],
    "targets": [
      {
        "id": "生",
        "kanji": "生",
        "meaning": "Life",
        "wordKey": "生きる",
        "wordMeaning": "to live",
        "readings": [
          "いきる"
        ],
        "distractors": [
          "田",
          "月",
          "学"
        ],
        "examples": [
          {
            "wordKey": "生徒",
            "wordMeaning": "student; pupil",
            "readings": [
              "せいと"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "学",
        "kanji": "学",
        "meaning": "Study",
        "wordKey": "学校",
        "wordMeaning": "a school",
        "readings": [
          "がっこう"
        ],
        "distractors": [
          "人",
          "森",
          "晴"
        ],
        "examples": [
          {
            "wordKey": "学ぶ",
            "wordMeaning": "to learn; to study",
            "readings": [
              "まなぶ"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "先",
        "kanji": "先",
        "meaning": "Before",
        "wordKey": "先",
        "wordMeaning": "future; recent, previous",
        "readings": [
          "さき"
        ],
        "distractors": [
          "月",
          "青",
          "休"
        ],
        "examples": [
          {
            "wordKey": "先生",
            "wordMeaning": "teacher; instructor; master; sensei; title or form of address for a teacher, master, doctor, lawyer, etc.; intimate or teasing form of address",
            "readings": [
              "せんせい"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "行",
        "kanji": "行",
        "meaning": "Going",
        "wordKey": "行く",
        "wordMeaning": "to go",
        "readings": [
          "いく",
          "ゆく"
        ],
        "distractors": [
          "田",
          "青",
          "本"
        ],
        "examples": [
          {
            "wordKey": "銀行",
            "wordMeaning": "bank",
            "readings": [
              "ぎんこう"
            ]
          },
          {
            "wordKey": "行う",
            "wordMeaning": "to perform; to do; to conduct oneself; to carry out",
            "readings": [
              "おこなう"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      }
    ]
  }
];

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function insist(condition, code) {
    if (!condition) throw new TypeError(code);
  }
  function plain(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value));
  }
  function exactKeys(value, keys) {
    return plain(value) && Object.keys(value).length === keys.length &&
      keys.every(key => Object.hasOwn(value, key));
  }
  function normalizeKana(value) {
    insist(typeof value === 'string', 'course-answer-not-text');
    return value.normalize('NFKC').trim().replace(/[ァ-ヶ]/gu,
      character => String.fromCharCode(character.charCodeAt(0) - 0x60));
  }
  const DATA = freeze({
    schemaVersion: 1, id: COURSE_ID, revision: REVISION,
    title: '24 characters in words',
    scope: 'Selected keyword recognition and whole-word reading practice; no mastery claim.',
    meaningScope: 'A selected character keyword, not a compound translation.',
    readingScope: 'The whole displayed word, not every reading of a character.',
    writingScope: 'Optional self-comparison; no automated assessment or credit.',
    sourceTransfer: { enabled: false, status: 'candidate-only',
      reason: 'Requires exact source revalidation and qualified editorial review.' },
    explanations: { enabled: false, status: 'withheld-pending-qualified-editor' },
    sources: {
      words: { path: 'data/share_alike/words.json', sha256: '4606aaa9da2b84fb7d49fe5023cd1d4d1cda6097287994717ac3522321914ac5' },
      kanji: { path: 'data/share_alike/kanji.json', sha256: '8ce7ad0151a2bf487bda72c384460eca908fc1bdc2a4073042b9e3db7342d2ce' },
    },
    units: UNITS,
  });
  const TARGETS = new Map(UNITS.flatMap(unit => unit.targets.map(target => [target.id, target])));
  function catalog() { return DATA; }
  function listUnits() { return DATA.units; }
  function getUnit(id) {
    const unit = UNITS.find(value => value.id === id);
    insist(unit, 'course-unit-unknown');
    return unit;
  }
  function lessonId(unitId, kind) {
    getUnit(unitId);
    insist(KINDS.includes(kind), 'course-target-unknown');
    return `${COURSE_ID}:r${REVISION}:${unitId}:${kind}`;
  }
  function promptFor(unit, target, kind) {
    const index = unit.targets.indexOf(target);
    const choices = kind === 'meaning'
      ? [...target.distractors.slice(0, index % 4), target.id, ...target.distractors.slice(index % 4)]
        .map(id => ({ id, label: TARGETS.get(id).meaning })) : [];
    return freeze({
      id: `${unit.id}/${target.id}/${kind}`, targetId: target.id, kind,
      kanji: target.kanji, wordKey: target.wordKey, wordMeaning: target.wordMeaning,
      scope: kind === 'meaning' ? 'selected-character-keyword' : 'whole-word-reading',
      prompt: kind === 'meaning' ? `Choose the selected keyword for ${target.kanji}.`
        : `Recall the whole word’s reading: ${target.wordKey}`,
      correctAnswer: kind === 'meaning' ? target.meaning : target.readings.join(' / '),
      answerId: kind === 'meaning' ? target.id : null,
      acceptedAnswers: kind === 'meaning' ? [target.id] : [...target.readings],
      choices,
    });
  }
  function prompts(unitId, kinds) {
    const unit = getUnit(unitId);
    return unit.targets.flatMap(target => kinds.map(kind => promptFor(unit, target, kind)));
  }
  function validKinds(kinds) {
    return Array.isArray(kinds) && kinds.length > 0 && kinds.length <= KINDS.length &&
      new Set(kinds).size === kinds.length && kinds.every(kind => KINDS.includes(kind));
  }
  function makeRun(unitId, mode, targets, promptIds, responses = []) {
    return freeze({ schemaVersion: 1, courseId: COURSE_ID, revision: REVISION,
      unitId, mode, targets: [...targets], promptIds: [...promptIds],
      responses: responses.map(response => ({ ...response })), cursor: responses.length,
      complete: responses.length === promptIds.length });
  }
  function createRun(unitId, options = {}) {
    insist(plain(options) && Object.keys(options).every(key => ['mode', 'targets'].includes(key)), 'course-options-invalid');
    const mode = options.mode === undefined ? 'check' : options.mode;
    const targets = options.targets === undefined ? KINDS : options.targets;
    insist(['check', 'preview'].includes(mode), 'course-mode-invalid');
    insist(validKinds(targets), 'course-targets-invalid');
    const ordered = KINDS.filter(kind => targets.includes(kind));
    return makeRun(unitId, mode, ordered, prompts(unitId, ordered).map(prompt => prompt.id));
  }
  function checkedRun(run) {
    insist(exactKeys(run, ['schemaVersion', 'courseId', 'revision', 'unitId', 'mode', 'targets',
      'promptIds', 'responses', 'cursor', 'complete']), 'course-run-invalid');
    insist(run.schemaVersion === 1 && run.courseId === COURSE_ID && run.revision === REVISION &&
      ['check', 'preview', 'repair'].includes(run.mode) && validKinds(run.targets), 'course-run-invalid');
    const all = prompts(run.unitId, run.targets), byId = new Map(all.map(prompt => [prompt.id, prompt]));
    insist(Array.isArray(run.promptIds) && run.promptIds.length > 0 &&
      new Set(run.promptIds).size === run.promptIds.length && run.promptIds.every(id => byId.has(id)), 'course-prompts-invalid');
    if (run.mode !== 'repair') insist(JSON.stringify(run.promptIds) === JSON.stringify(all.map(prompt => prompt.id)), 'course-prompts-incomplete');
    insist(Array.isArray(run.responses) && run.responses.length <= run.promptIds.length &&
      run.cursor === run.responses.length && run.complete === (run.cursor === run.promptIds.length), 'course-cursor-invalid');
    for (const [index, response] of run.responses.entries()) {
      insist(exactKeys(response, ['promptId', 'action', 'value']) && response.promptId === run.promptIds[index] &&
        ['answer', 'reveal', 'skip'].includes(response.action), 'course-response-invalid');
      if (response.action === 'answer') validateAnswer(byId.get(response.promptId), response.value);
      else insist(response.value === null, 'course-response-invalid');
    }
    return byId;
  }
  function validateAnswer(prompt, response) {
    insist(typeof response === 'string' && response.trim().length > 0 && response.length <= 200, 'course-answer-invalid');
    if (prompt.kind === 'meaning') insist(prompt.choices.some(choice => choice.id === response), 'course-choice-invalid');
  }
  function currentPrompt(run) {
    const byId = checkedRun(run);
    return run.complete ? null : byId.get(run.promptIds[run.cursor]);
  }
  function transition(run, action, value) {
    const prompt = currentPrompt(run);
    insist(prompt, 'course-run-complete');
    if (action === 'answer') validateAnswer(prompt, value);
    return makeRun(run.unitId, run.mode, run.targets, run.promptIds,
      [...run.responses, { promptId: prompt.id, action, value }]);
  }
  function answer(run, response) { return transition(run, 'answer', response); }
  function reveal(run) { return transition(run, 'reveal', null); }
  function skip(run) { return transition(run, 'skip', null); }
  function outcome(prompt, response) {
    if (response.action !== 'answer') return response.action === 'skip' ? 'skipped' : 'revealed';
    const correct = prompt.kind === 'meaning' ? response.value === prompt.answerId
      : prompt.acceptedAnswers.some(value => normalizeKana(value) === normalizeKana(response.value));
    return correct ? 'correct' : 'wrong';
  }
  function summary(run) {
    const byId = checkedRun(run);
    const targets = Object.fromEntries(KINDS.map(kind => [kind,
      { total: run.promptIds.filter(id => byId.get(id).kind === kind).length,
        answered: 0, correct: 0, wrong: 0, revealed: 0, skipped: 0, pending: 0 }]));
    const missedPromptIds = [], skippedPromptIds = [];
    const results = run.responses.map(response => {
      const prompt = byId.get(response.promptId), status = outcome(prompt, response);
      targets[prompt.kind][status]++;
      if (response.action === 'answer') targets[prompt.kind].answered++;
      if (['wrong', 'revealed'].includes(status)) missedPromptIds.push(prompt.id);
      if (status === 'skipped') skippedPromptIds.push(prompt.id);
      return { promptId: prompt.id, targetId: prompt.targetId, kind: prompt.kind, status,
        response: response.value, correctAnswer: prompt.correctAnswer };
    });
    for (const counts of Object.values(targets)) counts.pending = counts.total - counts.answered - counts.revealed - counts.skipped;
    return freeze({ complete: run.complete, mode: run.mode, total: run.promptIds.length,
      correct: results.filter(result => result.status === 'correct').length,
      targets, results, missedPromptIds, skippedPromptIds,
      claim: 'Practice observations only; no mastery or delayed-memory inference.' });
  }
  function retry(run) {
    const result = summary(run);
    insist(result.complete, 'course-run-incomplete');
    if (!result.missedPromptIds.length) return null;
    return makeRun(run.unitId, 'repair', run.targets, result.missedPromptIds);
  }
  /** Deltas only: caller merges into latest obslog/lessonsDone through its existing
   * acknowledged write boundary. No response is manufactured for reveal or skip.
   * A goal with any unanswered prompt does not replace its previous full score.
   * Repair observations use :missed and NEVER replace a full score.
   */
  function toLessonEvidence(run, atMs) {
    const result = summary(run), byId = checkedRun(run);
    insist(result.complete, 'course-run-incomplete');
    insist(Number.isSafeInteger(atMs) && atMs >= 0, 'course-time-invalid');
    const obslog = result.results.filter(row => ['correct', 'wrong'].includes(row.status)).map(row => {
      const prompt = byId.get(row.promptId);
      return [atMs, 'lesson', `${prompt.kind === 'meaning' ? 'kanji' : 'word'}:${prompt.kind === 'meaning' ? prompt.kanji : prompt.wordKey}`,
        row.status === 'correct' ? 3 : 1, lessonId(run.unitId, row.kind) + (run.mode === 'repair' ? ':missed' : '')];
    });
    const lessonsDone = {};
    if (run.mode !== 'repair') {
      for (const kind of run.targets) {
        const counts = result.targets[kind];
        if (counts.total && counts.answered === counts.total) lessonsDone[lessonId(run.unitId, kind)] = {
          score: counts.correct, total: counts.total, ts: atMs,
        };
      }
    }
    return freeze({ obslog, lessonsDone });
  }
  return freeze({ catalog, listUnits, getUnit, lessonId, createRun, currentPrompt,
    answer, reveal, skip, summary, retry, toLessonEvidence, normalizeKana });
});
