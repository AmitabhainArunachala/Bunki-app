/* Authored kanji practice: static data and pure session transitions only.
 * Browser: BunkiKanjiCourse. CommonJS: require('./kanji-course.js').
 * Never reads/writes a learner record, clock, storage, scheduler or network.
 * Keyword recall, whole-word reading and optional writing are distinct targets.
 * Dictionary keywords are not compound translations; explanations and source
 * transfer remain withheld until independently reviewed and revalidated.
 * wordMeaning preserves the attested source gloss. Optional displayMeaning is
 * an editorial selection for the learner-facing word gloss, not a source quote.
 * meaning likewise preserves the raw character keyword; displayKeyword is an
 * optional learner-facing clarification shared by teaching, choices and answers.
 */
/* global module:readonly -- Optional CommonJS export, guarded for browsers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BunkiKanjiCourse = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Stable persisted identity: expansion changes the title, not existing records.
  const COURSE_ID = 'kanji-foundations-24';
  const REVISION = 4;
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
    ],
    "revision": 2
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
    ],
    "revision": 2
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
    ],
    "revision": 2
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
        "displayMeaning": "future",
        "readings": [
          "みらい"
        ],
        "distractors": [
          "末",
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
          "未",
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
    ],
    "revision": 2
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
          "清",
          "晴",
          "情"
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
          "青",
          "晴",
          "情"
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
          "青",
          "清",
          "情"
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
        "displayMeaning": "information",
        "readings": [
          "じょうほう"
        ],
        "distractors": [
          "青",
          "清",
          "晴"
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
    ],
    "revision": 2
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
        "displayMeaning": "school",
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
        "displayMeaning": "before; ahead",
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
            "displayMeaning": "teacher",
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
    ],
    "revision": 2
  },
  {
    "id": "numbers",
    "title": "Numbers in words",
    "prerequisites": [
      "outlines"
    ],
    "targets": [
      {
        "id": "一",
        "kanji": "一",
        "meaning": "One",
        "wordKey": "一つ",
        "wordMeaning": "one thing",
        "readings": [
          "ひとつ"
        ],
        "distractors": [
          "二",
          "三",
          "四"
        ],
        "examples": [
          {
            "wordKey": "一人",
            "wordMeaning": "one person",
            "readings": [
              "ひとり"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "二",
        "kanji": "二",
        "meaning": "Two",
        "wordKey": "二つ",
        "wordMeaning": "two things",
        "readings": [
          "ふたつ"
        ],
        "distractors": [
          "一",
          "三",
          "四"
        ],
        "examples": [
          {
            "wordKey": "二人",
            "wordMeaning": "two people",
            "readings": [
              "ふたり"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "三",
        "kanji": "三",
        "meaning": "Three",
        "wordKey": "三つ",
        "wordMeaning": "three things",
        "readings": [
          "みっつ"
        ],
        "distractors": [
          "一",
          "二",
          "四"
        ],
        "examples": [
          {
            "wordKey": "三角",
            "wordMeaning": "triangle, triangular",
            "readings": [
              "さんかく"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "四",
        "kanji": "四",
        "meaning": "Four",
        "wordKey": "四つ",
        "wordMeaning": "four things",
        "readings": [
          "よっつ"
        ],
        "distractors": [
          "一",
          "二",
          "三"
        ],
        "examples": [
          {
            "wordKey": "四角",
            "wordMeaning": "square",
            "readings": [
              "しかく"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      }
    ],
    "revision": 3
  },
  {
    "id": "positions",
    "title": "Position words",
    "prerequisites": [
      "outlines"
    ],
    "targets": [
      {
        "id": "上",
        "kanji": "上",
        "meaning": "Above",
        "wordKey": "上",
        "wordMeaning": "above…",
        "readings": [
          "うえ"
        ],
        "distractors": [
          "下",
          "左",
          "右"
        ],
        "examples": [
          {
            "wordKey": "上着",
            "wordMeaning": "coat, jacket",
            "readings": [
              "うわぎ"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        },
        "displayMeaning": "above; top"
      },
      {
        "id": "下",
        "kanji": "下",
        "meaning": "Below",
        "wordKey": "下",
        "wordMeaning": "under, below",
        "readings": [
          "した"
        ],
        "distractors": [
          "上",
          "左",
          "右"
        ],
        "examples": [
          {
            "wordKey": "靴下",
            "wordMeaning": "socks",
            "readings": [
              "くつした"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "左",
        "kanji": "左",
        "meaning": "Left",
        "wordKey": "左",
        "wordMeaning": "left hand side",
        "readings": [
          "ひだり"
        ],
        "distractors": [
          "上",
          "下",
          "右"
        ],
        "examples": [
          {
            "wordKey": "左右",
            "wordMeaning": "left and right; influence",
            "readings": [
              "さゆう"
            ],
            "displayMeaning": "left and right"
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "右",
        "kanji": "右",
        "meaning": "Right",
        "wordKey": "右",
        "wordMeaning": "right hand side",
        "readings": [
          "みぎ"
        ],
        "distractors": [
          "上",
          "下",
          "左"
        ],
        "examples": [
          {
            "wordKey": "左右",
            "wordMeaning": "left and right; influence",
            "readings": [
              "さゆう"
            ],
            "displayMeaning": "left and right"
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      }
    ],
    "revision": 3
  },
  {
    "id": "directions",
    "title": "Compass directions",
    "prerequisites": [
      "positions"
    ],
    "targets": [
      {
        "id": "東",
        "kanji": "東",
        "meaning": "East",
        "wordKey": "東",
        "wordMeaning": "east",
        "readings": [
          "ひがし"
        ],
        "distractors": [
          "西",
          "南",
          "北"
        ],
        "examples": [
          {
            "wordKey": "東西",
            "wordMeaning": "East and West, whole country",
            "readings": [
              "とうざい"
            ],
            "displayMeaning": "East and West"
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "西",
        "kanji": "西",
        "meaning": "West",
        "wordKey": "西",
        "wordMeaning": "west",
        "readings": [
          "にし"
        ],
        "distractors": [
          "東",
          "南",
          "北"
        ],
        "examples": [
          {
            "wordKey": "西洋",
            "wordMeaning": "the West, Western countries",
            "readings": [
              "せいよう"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "南",
        "kanji": "南",
        "meaning": "South",
        "wordKey": "南",
        "wordMeaning": "South",
        "readings": [
          "みなみ"
        ],
        "distractors": [
          "東",
          "西",
          "北"
        ],
        "examples": [
          {
            "wordKey": "南米",
            "wordMeaning": "South America",
            "readings": [
              "なんべい"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "北",
        "kanji": "北",
        "meaning": "North",
        "wordKey": "北",
        "wordMeaning": "north",
        "readings": [
          "きた"
        ],
        "distractors": [
          "東",
          "西",
          "南"
        ],
        "examples": [
          {
            "wordKey": "北極",
            "wordMeaning": "North Pole",
            "readings": [
              "ほっきょく"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      }
    ],
    "revision": 3
  },
  {
    "id": "daily-actions",
    "title": "Everyday actions",
    "prerequisites": [
      "word-readings"
    ],
    "targets": [
      {
        "id": "食",
        "kanji": "食",
        "meaning": "Eat",
        "wordKey": "食べる",
        "wordMeaning": "to eat",
        "readings": [
          "たべる"
        ],
        "distractors": [
          "飲",
          "見",
          "聞"
        ],
        "examples": [
          {
            "wordKey": "食事",
            "wordMeaning": "meal",
            "readings": [
              "しょくじ"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "飲",
        "kanji": "飲",
        "meaning": "Drink",
        "wordKey": "飲む",
        "wordMeaning": "to drink",
        "readings": [
          "のむ"
        ],
        "distractors": [
          "食",
          "見",
          "聞"
        ],
        "examples": [
          {
            "wordKey": "飲み物",
            "wordMeaning": "drink, beverage",
            "readings": [
              "のみもの"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "見",
        "kanji": "見",
        "meaning": "See",
        "wordKey": "見る",
        "wordMeaning": "to see, to look",
        "readings": [
          "みる"
        ],
        "distractors": [
          "食",
          "飲",
          "聞"
        ],
        "examples": [
          {
            "wordKey": "見物",
            "wordMeaning": "sightseeing",
            "readings": [
              "けんぶつ"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "聞",
        "kanji": "聞",
        "meaning": "Hear",
        "wordKey": "聞く",
        "wordMeaning": "to hear, to listen",
        "readings": [
          "きく"
        ],
        "distractors": [
          "食",
          "飲",
          "見"
        ],
        "examples": [
          {
            "wordKey": "新聞",
            "wordMeaning": "newspaper",
            "readings": [
              "しんぶん"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      }
    ],
    "revision": 3
  },
  {
    "id": "nature",
    "title": "Nature and weather",
    "prerequisites": [
      "combinations",
      "marks"
    ],
    "targets": [
      {
        "id": "山",
        "kanji": "山",
        "meaning": "Mountain",
        "wordKey": "山",
        "wordMeaning": "mountain",
        "readings": [
          "やま"
        ],
        "distractors": [
          "水",
          "火",
          "雨"
        ],
        "examples": [
          {
            "wordKey": "火山",
            "wordMeaning": "volcano",
            "readings": [
              "かざん"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "水",
        "kanji": "水",
        "meaning": "Water",
        "wordKey": "水",
        "wordMeaning": "water",
        "readings": [
          "みず"
        ],
        "distractors": [
          "山",
          "火",
          "雨"
        ],
        "examples": [
          {
            "wordKey": "水曜日",
            "wordMeaning": "Wednesday",
            "readings": [
              "すいようび"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "火",
        "kanji": "火",
        "meaning": "Fire",
        "wordKey": "火",
        "wordMeaning": "fire",
        "readings": [
          "ひ"
        ],
        "distractors": [
          "山",
          "水",
          "雨"
        ],
        "examples": [
          {
            "wordKey": "火曜日",
            "wordMeaning": "Tuesday",
            "readings": [
              "かようび"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "雨",
        "kanji": "雨",
        "meaning": "Rain",
        "wordKey": "雨",
        "wordMeaning": "rain",
        "readings": [
          "あめ"
        ],
        "distractors": [
          "山",
          "水",
          "火"
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
      }
    ],
    "revision": 3
  },
  {
    "id": "more-actions",
    "title": "Going, reading, writing",
    "prerequisites": [
      "outlines",
      "word-readings"
    ],
    "targets": [
      {
        "id": "出",
        "kanji": "出",
        "meaning": "Exit",
        "wordKey": "出る",
        "wordMeaning": "to appear, to leave",
        "readings": [
          "でる"
        ],
        "distractors": [
          "来",
          "読",
          "書"
        ],
        "examples": [
          {
            "wordKey": "出口",
            "wordMeaning": "an exit",
            "readings": [
              "でぐち"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        },
        "displayMeaning": "to go out; to leave"
      },
      {
        "id": "来",
        "kanji": "来",
        "meaning": "Come",
        "wordKey": "来る",
        "wordMeaning": "to come",
        "readings": [
          "くる"
        ],
        "distractors": [
          "出",
          "読",
          "書"
        ],
        "examples": [
          {
            "wordKey": "来年",
            "wordMeaning": "next year",
            "readings": [
              "らいねん"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "読",
        "kanji": "読",
        "meaning": "Read",
        "wordKey": "読む",
        "wordMeaning": "to read",
        "readings": [
          "よむ"
        ],
        "distractors": [
          "出",
          "来",
          "書"
        ],
        "examples": [
          {
            "wordKey": "読書",
            "wordMeaning": "reading",
            "readings": [
              "どくしょ"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      },
      {
        "id": "書",
        "kanji": "書",
        "meaning": "Write",
        "wordKey": "書く",
        "wordMeaning": "to write",
        "readings": [
          "かく"
        ],
        "distractors": [
          "出",
          "来",
          "読"
        ],
        "examples": [
          {
            "wordKey": "辞書",
            "wordMeaning": "dictionary",
            "readings": [
              "じしょ"
            ]
          }
        ],
        "writing": {
          "optional": true,
          "assessment": "self-comparison"
        }
      }
    ],
    "revision": 3
  },
{
  "id": "shiki-shoku",
  "title": "職・識・織 in words",
  "prerequisites": [],
  "targets": [
    {
      "id": "職",
      "kanji": "職",
      "meaning": "Post",
      "displayKeyword": "Job; position",
      "wordKey": "職業",
      "wordMeaning": "occupation, business",
      "readings": [
        "しょくぎょう"
      ],
      "distractors": [
        "識",
        "織",
        "木"
      ],
      "examples": [
        {
          "wordKey": "職場",
          "wordMeaning": "workplace",
          "readings": [
            "しょくば"
          ]
        }
      ],
      "writing": {
        "optional": true,
        "assessment": "self-comparison"
      },
      "teachingSentence": {
        "text": "彼の職業は医師だ。",
        "english": "He is a doctor by profession.",
        "reference": {
          "type": "sentence-occurrence",
          "id": "[\"bundled-example\",\"prototypes/corridor/data/proprietary_safe/examples/s-03.json\",\"f33399c869ae19796716f4571ac58da2f180b1836ea9cd4f24c34960fba5cc62\",284,2]"
        },
        "sourceAttribution": {
          "name": "tanaka-corpus",
          "licence": "CC BY 2.0 FR",
          "attribution": "Tanaka Corpus / Tatoeba Project（EDRDG examples.utf）",
          "url": "https://www.edrdg.org/wiki/index.php/Tanaka_Corpus",
          "labelJa": "用例",
          "labelEn": "examples corpus"
        },
        "note": "An attested bundled example; not a source-transfer assessment."
      }
    },
    {
      "id": "識",
      "kanji": "識",
      "meaning": "Discriminating",
      "displayKeyword": "Knowing; awareness",
      "wordKey": "知識",
      "wordMeaning": "knowledge, information",
      "readings": [
        "ちしき"
      ],
      "distractors": [
        "職",
        "織",
        "木"
      ],
      "examples": [
        {
          "wordKey": "意識",
          "wordMeaning": "consciousness, senses",
          "readings": [
            "いしき"
          ]
        }
      ],
      "writing": {
        "optional": true,
        "assessment": "self-comparison"
      },
      "teachingSentence": {
        "text": "知識は力なり。",
        "english": "Knowledge is power.",
        "reference": {
          "type": "sentence-occurrence",
          "id": "[\"bundled-example\",\"prototypes/corridor/data/proprietary_safe/examples/s-00.json\",\"6d053025b8187ecd6b5e1a4474a21e95369a0695b9d11286ece17f003aa419ed\",1369,0]"
        },
        "sourceAttribution": {
          "name": "tanaka-corpus",
          "licence": "CC BY 2.0 FR",
          "attribution": "Tanaka Corpus / Tatoeba Project（EDRDG examples.utf）",
          "url": "https://www.edrdg.org/wiki/index.php/Tanaka_Corpus",
          "labelJa": "用例",
          "labelEn": "examples corpus"
        },
        "note": "A literary set saying; なり is a classical copula.",
        "register": "literary-set-saying"
      }
    },
    {
      "id": "織",
      "kanji": "織",
      "meaning": "Weave",
      "wordKey": "組織",
      "wordMeaning": "organization; structure; tissue",
      "readings": [
        "そしき"
      ],
      "distractors": [
        "職",
        "識",
        "木"
      ],
      "examples": [
        {
          "wordKey": "織る",
          "wordMeaning": "to weave",
          "readings": [
            "おる"
          ]
        }
      ],
      "writing": {
        "optional": true,
        "assessment": "self-comparison"
      },
      "teachingSentence": {
        "text": "この組織は戦後生まれた。",
        "english": "This institution came into being after the war.",
        "reference": {
          "type": "sentence-occurrence",
          "id": "[\"bundled-example\",\"prototypes/corridor/data/proprietary_safe/examples/s-04.json\",\"8c0ca81c54aeebedc2c1562bf0fdfe0aa7e3416909d515bdeef8c1d95c010e65\",906,1]"
        },
        "sourceAttribution": {
          "name": "tanaka-corpus",
          "licence": "CC BY 2.0 FR",
          "attribution": "Tanaka Corpus / Tatoeba Project（EDRDG examples.utf）",
          "url": "https://www.edrdg.org/wiki/index.php/Tanaka_Corpus",
          "labelJa": "用例",
          "labelEn": "examples corpus"
        },
        "note": "An attested bundled example; not a source-transfer assessment."
      }
    }
  ],
  "revision": 4
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
    title: '51 characters in words',
    scope: 'Selected keyword recognition and whole-word reading practice; no mastery claim.',
    meaningScope: 'A selected character keyword, not a compound translation.',
    readingScope: 'The whole displayed word, not every reading of a character.',
    writingScope: 'Optional self-comparison; no automated assessment or credit.',
    sourceTransfer: { enabled: false, status: 'candidate-only',
      reason: 'Requires exact source revalidation and qualified editorial review.' },
    explanations: { enabled: false, status: 'withheld-pending-qualified-editor' },
    sources: {
      words: { path: 'data/share_alike/words.json', sha256: 'd21ff76508a3ed88cec9c096510feac9b5ff2df639061a3be46cb85c6fdf985b' },
      kanji: { path: 'data/share_alike/kanji.json', sha256: '8ce7ad0151a2bf487bda72c384460eca908fc1bdc2a4073042b9e3db7342d2ce' },
      family: { path: 'data/share_alike/kanji-family.json', sha256: 'd164ec7b2fe39c5920d7fc05f4731c79db535815c5495aea7c2904b59532499b' },
    },
    counts: { units: UNITS.length, characters: UNITS.reduce((sum, unit) => sum + unit.targets.length, 0),
      wordExamples: UNITS.reduce((sum, unit) =>
        sum + unit.targets.reduce((total, target) => total + 1 + target.examples.length, 0), 0) },
    units: UNITS,
  });
  const TARGETS = new Map(UNITS.flatMap(unit => unit.targets.map(target => [target.id, target])));
  const CHARACTER_UNITS = new Map(UNITS.flatMap(unit => unit.targets.map(target => [target.kanji, unit])));
  function catalog() { return DATA; }
  // wordExamples counts primary and alternate records, including shared words.
  function counts() { return DATA.counts; }
  function unitForCharacter(character) { return CHARACTER_UNITS.get(character) || null; }
  function listUnits() { return DATA.units; }
  function getUnit(id) {
    const unit = UNITS.find(value => value.id === id);
    insist(unit, 'course-unit-unknown');
    return unit;
  }
  function lessonId(unitId, kind) {
    const unit = getUnit(unitId);
    insist(KINDS.includes(kind), 'course-target-unknown');
    return `${COURSE_ID}:r${unit.revision}:${unitId}:${kind}`;
  }
  function promptFor(unit, target, kind) {
    const index = unit.targets.indexOf(target);
    const choices = kind === 'meaning'
      ? [...target.distractors.slice(0, index % 4), target.id, ...target.distractors.slice(index % 4)]
        .map(id => {
          const choice = TARGETS.get(id);
          return { id, label: choice.displayKeyword || choice.meaning };
        }) : [];
    return freeze({
      id: `${unit.id}/${target.id}/${kind}`, targetId: target.id, kind,
      kanji: target.kanji, wordKey: target.wordKey, wordMeaning: target.wordMeaning,
      displayMeaning: target.displayMeaning || target.wordMeaning,
      scope: kind === 'meaning' ? 'selected-character-keyword' : 'whole-word-reading',
      prompt: kind === 'meaning' ? `Choose the selected keyword for ${target.kanji}.`
        : `Recall the whole word’s reading: ${target.wordKey}`,
      correctAnswer: kind === 'meaning' ? target.displayKeyword || target.meaning : target.readings.join(' / '),
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
    return freeze({ schemaVersion: 1, courseId: COURSE_ID, revision: getUnit(unitId).revision,
      unitId, mode, targets: [...targets], promptIds: [...promptIds],
      responses: responses.map(response => ({ ...response })), cursor: responses.length,
      complete: responses.length === promptIds.length });
  }
  function createRun(unitId, options = {}) {
    if (unitId === FAMILY_UNIT) return createFamilyRun(options);
    insist(plain(options) && Object.keys(options).every(key => ['mode', 'targets'].includes(key)), 'course-options-invalid');
    const mode = options.mode === undefined ? 'check' : options.mode;
    const targets = options.targets === undefined ? KINDS : options.targets;
    insist(['check', 'preview'].includes(mode), 'course-mode-invalid');
    insist(validKinds(targets), 'course-targets-invalid');
    const ordered = KINDS.filter(kind => targets.includes(kind));
    return makeRun(unitId, mode, ordered, prompts(unitId, ordered).map(prompt => prompt.id));
  }
  function checkedRun(run) {
    if (run && (run.schemaVersion === 2 || run.unitId === FAMILY_UNIT)) return checkedFamilyRun(run);
    insist(exactKeys(run, ['schemaVersion', 'courseId', 'revision', 'unitId', 'mode', 'targets',
      'promptIds', 'responses', 'cursor', 'complete']), 'course-run-invalid');
    insist(run.schemaVersion === 1 && run.courseId === COURSE_ID && run.revision === getUnit(run.unitId).revision &&
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
  // Reference help can expose answers during a preview. Relabel that same run as
  // supported practice without resetting responses, advancing or changing credit.
  function asPractice(run) {
    checkedRun(run);
    if (run.schemaVersion === 2) return run.mode === 'preview' ? freeze({ ...familyCopy(run), mode: 'check' }) : run;
    return run.mode === 'preview'
      ? makeRun(run.unitId, 'check', run.targets, run.promptIds, run.responses) : run;
  }
  function transition(run, action, value) {
    const prompt = currentPrompt(run);
    insist(prompt, 'course-run-complete');
    if (action === 'answer') validateAnswer(prompt, value);
    return makeRun(run.unitId, run.mode, run.targets, run.promptIds,
      [...run.responses, { promptId: prompt.id, action, value }]);
  }
  function answer(run, response, meta) { return run?.schemaVersion === 2
    ? familyTransition(run, 'answer', response, meta) : transition(run, 'answer', response); }
  function reveal(run, meta) { return run?.schemaVersion === 2
    ? familyTransition(run, 'reveal', null, meta) : transition(run, 'reveal', null); }
  function skip(run, meta) { return run?.schemaVersion === 2
    ? familyTransition(run, 'skip', null, meta) : transition(run, 'skip', null); }
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
        response: response.value, correctAnswer: prompt.correctAnswer,
        ...(run.schemaVersion === 2 ? familyResult(run, prompt.id) : {}) };
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
    if (run.schemaVersion === 2) return makeFamilyRun(run.sessionId, run.round + 1, 'repair', run.targets,
      result.missedPromptIds, [], result.missedPromptIds.map(id => { const attempt = run.attempts.find(value => value.promptId === id);
        return mergeHelp(attempt.help, attempt.exposure); }));
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
    if (run.schemaVersion === 2) return familyLessonEvidence(run, result, byId, atMs);
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
  // Schema 2 is session-only and belongs exclusively to this authored family.
  // The caller supplies identities/times; no storage, clock or scheduler is used.
  const FAMILY_UNIT = 'shiki-shoku';
  const FAMILY_SURFACE = 'course:kanji-shiki-shoku-r1';
  function taskTarget(reference) {
    if (!plain(reference)) return null;
    const unit = getUnit(FAMILY_UNIT);
    let target, kind;
    if (exactKeys(reference, ['type', 'id']) && reference.type === 'kanji') {
      target = unit.targets.find(value => value.kanji === reference.id);
      kind = 'meaning';
    } else if (exactKeys(reference, ['type', 'id', 'reading']) && reference.type === 'word') {
      target = unit.targets.find(value => value.wordKey === reference.id && value.readings.includes(reference.reading));
      kind = 'reading';
    }
    return target ? freeze({ courseId: COURSE_ID, unitId: unit.id, revision: unit.revision,
      targetId: target.id, promptIds: [`${unit.id}/${target.id}/${kind}`] }) : null;
  }
  function taskForReference(reference) { return taskTarget(reference); }
  function unitForTask(reference) { return taskTarget(reference) ? getUnit(FAMILY_UNIT) : null; }
  function familyItem(prompt) {
    return prompt.kind === 'meaning' ? { kind: 'kanji', literal: prompt.kanji }
      : { kind: 'word', term: prompt.wordKey, reading: prompt.acceptedAnswers[0] };
  }
  function finiteTime(value) { return typeof value === 'number' && Number.isFinite(value); }
  function canonicalItem(item) {
    const text = value => typeof value === 'string' && value.trim().length > 0;
    if (exactKeys(item, ['kind', 'literal']) && item.kind === 'kanji' && text(item.literal))
      return { kind: 'kanji', literal: item.literal };
    insist(plain(item) && item.kind === 'word' && text(item.term) && text(item.reading) &&
      Object.keys(item).every(key => ['kind', 'term', 'reading', 'seq'].includes(key)) &&
      ['kind', 'term', 'reading'].every(key => Object.hasOwn(item, key)) &&
      (!Object.hasOwn(item, 'seq') || text(item.seq)), 'course-help-item-invalid');
    return { kind: 'word', term: item.term, reading: item.reading,
      ...(Object.hasOwn(item, 'seq') ? { seq: item.seq } : {}) };
  }
  function canonicalHelp(help) {
    insist(plain(help) && Object.keys(help).every(key => ['what', 'about', 'reveals', 'at'].includes(key)) &&
      ['what', 'reveals', 'at'].every(key => Object.hasOwn(help, key)) &&
      typeof help.what === 'string' && help.what.trim().length > 0 && finiteTime(help.at) &&
      Array.isArray(help.reveals) && new Set(help.reveals).size === help.reveals.length &&
      help.reveals.every(facet => ['reading', 'meaning', 'form'].includes(facet)), 'course-help-invalid');
    return { what: help.what, ...(Object.hasOwn(help, 'about') ? { about: canonicalItem(help.about) } : {}),
      reveals: ['reading', 'meaning', 'form'].filter(facet => help.reveals.includes(facet)), at: help.at };
  }
  function orderedHelp(rows) {
    insist(Array.isArray(rows), 'course-help-invalid');
    const result = rows.map(canonicalHelp);
    insist(result.every((row, index) => index === 0 || row.at >= result[index - 1].at), 'course-help-order');
    insist(new Set(result.map(row => JSON.stringify(row))).size === result.length, 'course-help-duplicate');
    return result;
  }
  function mergeHelp(...groups) {
    const unique = new Map(groups.flat().map(canonicalHelp).map(row => [JSON.stringify(row), row]));
    return [...unique.values()].sort((a, b) => a.at - b.at);
  }
  function makeFamilyRun(sessionId, round, mode, targets, promptIds, responses = [], inherited = []) {
    return freeze({ schemaVersion: 2, courseId: COURSE_ID, revision: getUnit(FAMILY_UNIT).revision,
      unitId: FAMILY_UNIT, mode, targets: [...targets], promptIds: [...promptIds],
      responses: responses.map(response => ({ ...response })), cursor: responses.length,
      complete: responses.length === promptIds.length, sessionId, round,
      attempts: promptIds.map((promptId, index) => ({ attemptId: `${sessionId}/${round}/${promptId}`, promptId,
        help: orderedHelp(inherited[index] || []), exposure: [], actedAt: null, answeredAt: null,
        feedbackAt: null, selfCheck: null, checkedAt: null })) });
  }
  function createFamilyRun(options) {
    insist(plain(options) && Object.keys(options).every(key => ['mode', 'targets', 'sessionId'].includes(key)), 'course-options-invalid');
    insist(typeof options.sessionId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(options.sessionId), 'course-session-invalid');
    const mode = options.mode === undefined ? 'check' : options.mode;
    const targets = options.targets === undefined ? KINDS : options.targets;
    insist(['check', 'preview'].includes(mode), 'course-mode-invalid');
    insist(validKinds(targets), 'course-targets-invalid');
    const ordered = KINDS.filter(kind => targets.includes(kind));
    return makeFamilyRun(options.sessionId, 0, mode, ordered, prompts(FAMILY_UNIT, ordered).map(prompt => prompt.id));
  }
  function checkedFamilyRun(run) {
    insist(exactKeys(run, ['schemaVersion', 'courseId', 'revision', 'unitId', 'mode', 'targets',
      'promptIds', 'responses', 'cursor', 'complete', 'sessionId', 'round', 'attempts']) &&
      run.schemaVersion === 2 && run.courseId === COURSE_ID && run.unitId === FAMILY_UNIT &&
      run.revision === getUnit(FAMILY_UNIT).revision && ['check', 'preview', 'repair'].includes(run.mode) &&
      validKinds(run.targets) && typeof run.sessionId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(run.sessionId) &&
      Number.isSafeInteger(run.round) && run.round >= 0, 'course-run-invalid');
    const all = prompts(FAMILY_UNIT, run.targets), byId = new Map(all.map(prompt => [prompt.id, prompt]));
    insist(Array.isArray(run.promptIds) && run.promptIds.length > 0 && new Set(run.promptIds).size === run.promptIds.length &&
      run.promptIds.every(id => byId.has(id)), 'course-prompts-invalid');
    if (run.mode !== 'repair') insist(JSON.stringify(run.promptIds) === JSON.stringify(all.map(prompt => prompt.id)), 'course-prompts-incomplete');
    insist(Array.isArray(run.responses) && run.responses.length <= run.promptIds.length &&
      run.cursor === run.responses.length && run.complete === (run.cursor === run.promptIds.length), 'course-cursor-invalid');
    insist(Array.isArray(run.attempts) && run.attempts.length === run.promptIds.length, 'course-attempt-invalid');
    for (const [index, attempt] of run.attempts.entries()) {
      insist(exactKeys(attempt, ['attemptId', 'promptId', 'help', 'exposure', 'actedAt', 'answeredAt', 'feedbackAt', 'selfCheck', 'checkedAt']) &&
        attempt.promptId === run.promptIds[index] && attempt.attemptId === `${run.sessionId}/${run.round}/${attempt.promptId}`, 'course-attempt-invalid');
      orderedHelp(attempt.help);
      orderedHelp(attempt.exposure);
      const response = run.responses[index];
      if (!response) {
        insist([attempt.actedAt, attempt.answeredAt, attempt.feedbackAt, attempt.selfCheck, attempt.checkedAt].every(value => value === null) &&
          attempt.exposure.length === 0, 'course-attempt-invalid');
        continue;
      }
      insist(exactKeys(response, ['promptId', 'action', 'value']) && response.promptId === attempt.promptId &&
        ['answer', 'reveal', 'skip'].includes(response.action) && finiteTime(attempt.actedAt) &&
        attempt.help.every(row => row.at <= attempt.actedAt), 'course-response-invalid');
      const prompt = byId.get(attempt.promptId);
      if (response.action === 'answer') {
        validateAnswer(prompt, response.value);
        insist(attempt.answeredAt === attempt.actedAt, 'course-attempt-invalid');
      } else insist(response.value === null && attempt.answeredAt === null && attempt.feedbackAt === null &&
        attempt.selfCheck === null && attempt.checkedAt === null, 'course-attempt-invalid');
      const expectedExposure = response.action === 'reveal'
        ? [{ what: 'revealed-answer', about: familyItem(prompt), reveals: [prompt.kind], at: attempt.actedAt }]
        : attempt.feedbackAt === null ? []
          : [{ what: 'answer-feedback', about: familyItem(prompt), reveals: [prompt.kind], at: attempt.feedbackAt }];
      insist(JSON.stringify(attempt.exposure.map(canonicalHelp)) === JSON.stringify(expectedExposure), 'course-exposure-invalid');
      if (attempt.feedbackAt !== null) insist(response.action === 'answer' && finiteTime(attempt.feedbackAt) &&
        attempt.feedbackAt >= attempt.answeredAt, 'course-feedback-invalid');
      if (attempt.selfCheck !== null) insist(['knew', 'missed'].includes(attempt.selfCheck) && attempt.feedbackAt !== null &&
        finiteTime(attempt.checkedAt) && attempt.checkedAt >= attempt.feedbackAt &&
        (attempt.selfCheck !== 'knew' || outcome(prompt, response) === 'correct'), 'course-self-check-invalid');
      else insist(attempt.checkedAt === null, 'course-self-check-invalid');
    }
    return byId;
  }
  function familyCopy(run) { return JSON.parse(JSON.stringify(run)); }
  function attemptAt(run, attemptId) {
    checkedFamilyRun(run);
    const index = run.attempts.findIndex(attempt => attempt.attemptId === attemptId);
    insist(index >= 0, 'course-attempt-stale');
    return index;
  }
  function currentAttempt(run) {
    const byId = checkedFamilyRun(run);
    if (run.complete) return null;
    const attempt = run.attempts[run.cursor], prompt = byId.get(attempt.promptId);
    return freeze({ ...familyCopy(attempt), item: familyItem(prompt), tests: prompt.kind });
  }
  function plainPrompt(run) {
    const attempt = currentAttempt(run);
    if (!attempt) return null;
    const prompt = currentPrompt(run);
    return freeze({ attemptId: attempt.attemptId, promptId: prompt.id, kind: prompt.kind,
      text: prompt.kind === 'meaning' ? prompt.kanji : prompt.wordKey,
      choices: prompt.choices.map(choice => ({ ...choice })) });
  }
  function recordHelp(run, attemptId, help) {
    const index = attemptAt(run, attemptId);
    insist(index === run.cursor && !run.complete, 'course-attempt-closed');
    const row = canonicalHelp(help), current = run.attempts[index].help;
    if (current.some(value => JSON.stringify(canonicalHelp(value)) === JSON.stringify(row))) return run;
    insist(!current.length || row.at >= current.at(-1).at, 'course-help-order');
    const next = familyCopy(run);
    next.attempts[index].help.push(row);
    return freeze(next);
  }
  function familyTransition(run, action, value, meta) {
    const prompt = currentPrompt(run);
    insist(prompt, 'course-run-complete');
    insist(exactKeys(meta, ['attemptId', 'at']) && finiteTime(meta.at), 'course-attempt-meta-invalid');
    const index = attemptAt(run, meta.attemptId);
    insist(index === run.cursor, 'course-attempt-stale');
    if (action === 'answer') validateAnswer(prompt, value);
    insist(run.attempts[index].help.every(row => row.at <= meta.at), 'course-answer-before-help');
    const next = familyCopy(run), attempt = next.attempts[index];
    next.responses.push({ promptId: prompt.id, action, value });
    next.cursor++;
    next.complete = next.cursor === next.promptIds.length;
    attempt.actedAt = meta.at;
    if (action === 'answer') attempt.answeredAt = meta.at;
    if (action === 'reveal') attempt.exposure.push({ what: 'revealed-answer', about: familyItem(prompt), reveals: [prompt.kind], at: meta.at });
    return freeze(next);
  }
  function showFeedback(run, attemptId, at) {
    const index = attemptAt(run, attemptId), response = run.responses[index];
    insist(response?.action === 'answer' && finiteTime(at), 'course-feedback-invalid');
    if (run.attempts[index].feedbackAt !== null) return run;
    insist(at >= run.attempts[index].answeredAt, 'course-feedback-before-answer');
    const next = familyCopy(run), attempt = next.attempts[index];
    const prompt = prompts(FAMILY_UNIT, run.targets).find(value => value.id === attempt.promptId);
    attempt.feedbackAt = at;
    // Phase, not timestamp, separates answer feedback from pre-answer help.
    attempt.exposure = [{ what: 'answer-feedback', about: familyItem(prompt), reveals: [prompt.kind], at }];
    return freeze(next);
  }
  function selfCheck(run, attemptId, check, at) {
    const index = attemptAt(run, attemptId), attempt = run.attempts[index];
    const prompt = prompts(FAMILY_UNIT, run.targets).find(value => value.id === attempt.promptId);
    insist(['knew', 'missed'].includes(check) && finiteTime(at) && attempt.feedbackAt !== null &&
      at >= attempt.feedbackAt && (check !== 'knew' || outcome(prompt, run.responses[index]) === 'correct'), 'course-self-check-invalid');
    if (attempt.selfCheck !== null) {
      insist(attempt.selfCheck === check, 'course-self-check-already-recorded');
      return run;
    }
    const next = familyCopy(run);
    next.attempts[index].selfCheck = check;
    next.attempts[index].checkedAt = at;
    return freeze(next);
  }
  function familyResult(run, promptId) {
    const attempt = run.attempts.find(value => value.promptId === promptId);
    const prompt = prompts(FAMILY_UNIT, run.targets).find(value => value.id === promptId);
    return { ...familyCopy(attempt), item: familyItem(prompt), tests: prompt.kind,
      assisted: attempt.help.length > 0 };
  }
  function hookCandidate(run, attemptId) {
    const index = attemptAt(run, attemptId), attempt = run.attempts[index], response = run.responses[index];
    if (response?.action !== 'answer' || attempt.feedbackAt === null || attempt.selfCheck === null) return null;
    const prompt = prompts(FAMILY_UNIT, run.targets).find(value => value.id === attempt.promptId);
    if (attempt.selfCheck === 'knew' && outcome(prompt, response) !== 'correct') return null;
    return freeze({ kind: 'attempt', item: familyItem(prompt), surface: FAMILY_SURFACE,
      tests: prompt.kind, answer: { selfCheck: attempt.selfCheck }, revealed: true,
      answeredAt: attempt.answeredAt, help: attempt.help.map(canonicalHelp) });
  }
  function familyLessonEvidence(run, result, byId, atMs) {
    const answered = result.results.filter(row => ['correct', 'wrong'].includes(row.status));
    const key = row => lessonId(run.unitId, row.kind) + (row.assisted ? ':assisted' : '') + (run.mode === 'repair' ? ':missed' : '');
    const obslog = answered.map(row => {
      const prompt = byId.get(row.promptId);
      return [atMs, 'lesson', `${prompt.kind === 'meaning' ? 'kanji' : 'word'}:${prompt.kind === 'meaning' ? prompt.kanji : prompt.wordKey}`,
        row.status === 'correct' ? 3 : 1, key(row)];
    });
    const lessonsDone = {};
    if (run.mode !== 'repair') for (const kind of run.targets) {
      const counts = result.targets[kind];
      if (!counts.total || counts.answered !== counts.total) continue;
      for (const assisted of [false, true]) {
        const rows = answered.filter(row => row.kind === kind && row.assisted === assisted);
        if (rows.length) lessonsDone[key(rows[0])] = { score: rows.filter(row => row.status === 'correct').length,
          total: rows.length, ts: atMs };
      }
    }
    return freeze({ obslog, lessonsDone });
  }
  return freeze({ catalog, counts, unitForCharacter, listUnits, getUnit, lessonId, createRun, currentPrompt, asPractice,
    answer, reveal, skip, summary, retry, toLessonEvidence, normalizeKana,
    unitForTask, taskTarget, taskForReference, currentAttempt, plainPrompt, recordHelp, showFeedback, selfCheck, hookCandidate });
});
