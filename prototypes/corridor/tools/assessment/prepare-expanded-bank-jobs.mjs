#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const row = (skill, pairs) => pairs.map(([task, count]) => [skill, task, count]);
const grammar = (form, composition, text) =>
  row('grammar', [
    ['grammar-form', form],
    ['sentence-composition', composition],
    ['text-grammar', text],
  ]);
const source = (level, file, sha256) => ({
  level,
  url: `https://www.jlpt.jp/e/guideline/pdf/${file}`,
  sourceSha256: sha256,
  checkedAt: '2026-09-23',
  use: 'format and approximate passage-length facts only; no question text copied',
});
export const LEVEL_PROFILES = {
  N1: {
    source: source(
      'N1',
      'n1_e_revised.pdf',
      '891aa96dd5c758450b5bcd024b97143136d442981a7b756830efc36e96a7c487',
    ),
    minutes: [110, 55],
    reading: { short: 200, mid: 500, long: 1000, claim: 1000, integrated: 600, information: 700 },
    register:
      'Advanced N1: nuanced stance, abstract argument, implied relationships, formal and literary vocabulary in natural context. Never insert rare words solely to manufacture difficulty.',
    allocation: [
      ...row('vocabulary', [
        ['kanji-reading', 6],
        ['contextual-expression', 7],
        ['paraphrase', 6],
        ['usage', 6],
      ]),
      ...grammar(10, 5, 5),
      ...row('reading', [
        ['short-reading', 4],
        ['mid-reading', 9],
        ['long-reading', 4],
        ['integrated-reading', 3],
        ['claim-reading', 4],
        ['information-retrieval', 2],
      ]),
      ...row('listening', [
        ['listening-task', 6],
        ['listening-point', 7],
        ['listening-gist', 6],
        ['listening-response', 14],
        ['listening-integrated', 4],
      ]),
    ],
  },
  N2: {
    source: {
      level: 'N2',
      url: 'https://www.jlpt.jp/samples/sample2018/pdf/N2L.pdf',
      sourceSha256: 'd61edaadaae301d347cae040505016dd5057c2a3ac2a25b4b1aaa92070c2f3cb',
      checkedAt: '2026-09-23',
      use: '2018 listening task allocation and format facts; original text only',
    },
    minutes: [105, 50],
    reading: { short: 180, mid: 500, claim: 900, integrated: 600, information: 600 },
    register:
      'N2: connected everyday and professional discourse, reasons, concessions, referents and pragmatic intent. Plausible distractors must compete on the same dimension.',
    allocation: [
      ...row('vocabulary', [
        ['kanji-reading', 5],
        ['orthography', 5],
        ['word-formation', 5],
        ['contextual-expression', 5],
        ['paraphrase', 5],
        ['usage', 5],
      ]),
      ...grammar(10, 5, 5),
      ...row('reading', [
        ['short-reading', 4],
        ['mid-reading', 6],
        ['integrated-reading', 2],
        ['claim-reading', 4],
        ['information-retrieval', 2],
      ]),
      ...row('listening', [
        ['listening-task', 5],
        ['listening-point', 6],
        ['listening-gist', 5],
        ['listening-response', 12],
        ['listening-integrated', 4],
      ]),
    ],
  },
  N3: {
    source: source(
      'N3',
      'n3_e.pdf',
      'a136044f4bc689f1ef47915be13b44e3daca6f6b27cb918fdba5b3018926c528',
    ),
    minutes: [30, 70, 40],
    reading: { short: 175, mid: 350, long: 550, information: 600 },
    register:
      'Intermediate N3: coherent everyday, school and workplace situations; common causation, contrast and inference. Avoid advanced N1/N2 idioms and overly simple N5 drills.',
    allocation: [
      ...row('vocabulary', [
        ['kanji-reading', 8],
        ['orthography', 6],
        ['contextual-expression', 10],
        ['paraphrase', 5],
        ['usage', 5],
      ]),
      ...grammar(13, 5, 5),
      ...row('reading', [
        ['short-reading', 4],
        ['mid-reading', 6],
        ['long-reading', 4],
        ['information-retrieval', 2],
      ]),
      ...row('listening', [
        ['listening-task', 6],
        ['listening-point', 6],
        ['listening-gist', 3],
        ['listening-verbal', 4],
        ['listening-response', 9],
      ]),
    ],
  },
  N4: {
    source: source(
      'N4',
      'n4_e_revised.pdf',
      '12bc1fdf1ede60012a55c0b979868a280bd2bdd3a5f2cfd64c44dd37ef42f4c7',
    ),
    minutes: [25, 55, 35],
    reading: { short: 150, mid: 450, information: 400 },
    register:
      'N4: accessible everyday Japanese, common plain/polite forms, permissions, comparisons, reasons and sequences. Use kana support for non-target kanji beyond this level; never reveal a tested reading.',
    allocation: [
      ...row('vocabulary', [
        ['kanji-reading', 7],
        ['orthography', 5],
        ['contextual-expression', 8],
        ['paraphrase', 5],
        ['usage', 5],
      ]),
      ...grammar(15, 5, 5),
      ...row('reading', [
        ['short-reading', 4],
        ['mid-reading', 4],
        ['information-retrieval', 2],
      ]),
      ...row('listening', [
        ['listening-task', 8],
        ['listening-point', 7],
        ['listening-verbal', 5],
        ['listening-response', 8],
      ]),
    ],
  },
  N5: {
    source: source(
      'N5',
      'n5_e_revised.pdf',
      'ef3090c77a5d07fcd2dededbb8f981d6830f2935951ee15f5f07cf755e29c5ab',
    ),
    minutes: [20, 40, 30],
    reading: { short: 80, mid: 250, information: 250 },
    register:
      'N5: basic high-frequency everyday words, short natural sentences, elementary particles and inflections. Accessible kana and simple kanji. No advanced idioms or complex workplace bureaucracy; never add reading hints to a tested word.',
    allocation: [
      ...row('vocabulary', [
        ['kanji-reading', 8],
        ['orthography', 5],
        ['contextual-expression', 7],
        ['paraphrase', 5],
      ]),
      ...grammar(12, 4, 6),
      ...row('reading', [
        ['short-reading', 3],
        ['mid-reading', 2],
        ['information-retrieval', 1],
      ]),
      ...row('listening', [
        ['listening-task', 7],
        ['listening-point', 6],
        ['listening-verbal', 5],
        ['listening-response', 6],
      ]),
    ],
  },
};
const themes = [
  ['shopping and daily routines', 'school activities', 'weekend plans', 'local facilities'],
  ['travel and accommodation', 'shared living', 'libraries and public services', 'family events'],
  [
    'food and health habits',
    'work and study schedules',
    'music and hobbies',
    'community activities',
  ],
  ['housing and repairs', 'sports and equipment', 'nature and gardening', 'learning new skills'],
  [
    'volunteering and local events',
    'books and museums',
    'communication and technology',
    'transport and services',
  ],
];
function requirements(level, task, count, profile) {
  const prefix = `Author exactly ${count} distinct ${level} questions. ${profile.register} `;
  const lengths = profile.reading;
  const shared = {
    'kanji-reading':
      'Bracket the target kanji word in a complete sentence; choose its kana reading from4 plausible alternatives.',
    orthography:
      'Bracket a kana word; choose the correct kanji or appropriate katakana spelling. Wrong spellings can be orthographic distractors but cannot be arbitrary noise.',
    'word-formation':
      'Complete a word using a prefix, suffix or compound element. Ensure only one combination is contextually correct.',
    'contextual-expression':
      'Use a contextual sentence gap and four semantically competing words that fit the same grammatical slot.',
    paraphrase:
      'Bracket an expression in context and ask for the closest meaning. All distractors are plausible distinct meanings.',
    usage:
      'One target word, four complete sentence uses, exactly one natural meaning/collocation. Avoid transparently nonsensical physical-object distractors.',
    'grammar-form':
      'Use a sentence gap to test level-appropriate grammar, discourse relation or register. Eliminate constructions that are also grammatical and semantically viable.',
    'sentence-composition':
      'Exactly four phrase fragments fill four blanks, with ★ in the THIRD blank. Pin the fragment in that third position. Check that all fragments form one unique natural sentence.',
    'text-grammar': `One coherent original passage, with ${count} numbered gaps and shared passage IDs. Test discourse continuity rather than isolated grammar. Length about ${level === 'N5' ? 220 : level === 'N4' ? 350 : level === 'N3' ? 450 : 600} Japanese characters.`,
    'short-reading': `One independent original passage per question, about ${lengths.short} Japanese characters. Ask one inference, reason, referent or intended-purpose question rather than lexical matching.`,
    'mid-reading': `One original passage about ${lengths.mid} Japanese characters, shared by all ${count} questions. Ask distinct questions about reasoning or referents; do not repeat the same key fact.`,
    'long-reading': `One original passage about ${lengths.long} Japanese characters, shared by all questions. Test logical development, summary, reasons and author perspective.`,
    'integrated-reading': `Two original texts with different perspectives on one issue, about ${lengths.integrated} Japanese characters in total. Every question references BOTH passages and requires comparison or integration.`,
    'claim-reading': `One sustained original argument about ${lengths.claim} Japanese characters, shared by all questions. Test the author's main claim, supporting reasons and limits; no outside specialist knowledge.`,
    'information-retrieval': `One original notice, timetable or brochure about ${lengths.information} Japanese characters, shared by all questions. Each question supplies a scenario requiring the combination of conditions.`,
    'listening-task': `One distinct dialogue per question, ${level === 'N1' ? '450–650' : level === 'N2' ? '400–520' : level === 'N3' ? '260–380' : level === 'N4' ? '180–300' : '100–190'} Japanese characters. Printed choices; ask a clearly determined next action, with competing plans and constraints appropriate to the level.`,
    'listening-point': `One distinct dialogue or monologue per question, ${level === 'N1' ? '450–650' : level === 'N2' ? '350–470' : level === 'N3' ? '260–380' : level === 'N4' ? '180–300' : '100–190'} Japanese characters. Printed choices; one specific reason or detail must be uniquely supported.`,
    'listening-gist': `One distinct coherent talk per question, ${level === 'N1' ? '450–650' : level === 'N2' ? '350–490' : '250–360'} Japanese characters. Ask the overall intention or point after the talk; question and4options are spoken, printedOptions false.`,
    'listening-response':
      'One concise conversational utterance per question followed by3 spoken replies. printedOptions false, spokenQuestion null. Exactly one reply fits the speaker roles and communicative intent. Do not reject an otherwise natural reply merely because it accepts help or gives more detail.',
    'listening-verbal':
      'One original illustration per question depicting a concrete social situation. Return illustrations:[{id,description}] and link each item.illustrationIds. Give a short spoken situation/utterance cue and3 spoken expressions, only one pragmatically appropriate. No printed options. The illustration is required media, its description is only an authoring brief. It must not contain the answer as text.',
    'listening-integrated':
      'Exactly3 original longer stimuli: first supports1question, second1question, third2questions. Each700–1000Japanese characters, with interacting conditions and preferences. First two questions have spoken choices, final two printed choices. Share the last stimulus ID; do not repeat its dialogue.',
  };
  return prefix + shared[task];
}

export function expandedJobs() {
  const jobs = [];
  for (const level of ['N2', 'N5', 'N4', 'N3', 'N1']) {
    const profile = LEVEL_PROFILES[level];
    for (const form of level === 'N2' ? [2, 3, 4, 5] : [1, 2, 3, 4, 5]) {
      for (const [index, [skill, task, total]] of profile.allocation.entries()) {
        // Keep shared passages/stimuli intact; ordinary item batches remain small.
        const max =
          task === 'mid-reading'
            ? level === 'N1'
              ? 3
              : 2
            : [
                  'text-grammar',
                  'long-reading',
                  'integrated-reading',
                  'claim-reading',
                  'information-retrieval',
                  'listening-integrated',
                ].includes(task)
              ? total
              : skill === 'listening' && task !== 'listening-response'
                ? 2
                : 5;
        let left = total,
          part = 0;
        while (left) {
          const count = Math.min(max, left);
          left -= count;
          part += 1;
          jobs.push({
            id: `${level.toLowerCase()}-full-${String(form).padStart(2, '0')}-${task}-v2-part${part}`,
            level,
            form,
            mode: 'full',
            skill,
            task,
            count,
            authoringPolicy: `bunki-${level.toLowerCase()}-original-bank-allocation-20260923-v2`,
            countsAre: 'local-authoring-rules-not-official-fixed-counts',
            officialFormatReference: profile.source,
            nominalTimingMinutes: profile.minutes,
            topic: themes[form - 1][index % 4],
            variationSeed: `${level}-${form}-${task}-${part}-v2`,
            requirements: requirements(level, task, count, profile),
            quality:
              'New original content with a unique key and reason for every distractor. Do not paraphrase another form or count shuffled choices as variation. A generated illustration description is not a real rendered image. All output is a candidate awaiting independent review.',
          });
        }
      }
    }
  }
  return {
    schema: 'kairo-assessment-expanded-author-jobs/1',
    authoringProfileVersion: '20260923-v2',
    levels: LEVEL_PROFILES,
    jobs,
  };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const out = resolve(
    process.argv[2] ??
      join(homedir(), '.dharma/bunki_assessment/2026-09-23/authoring/expanded-bank-jobs.json'),
  );
  if (!out.startsWith(`${join(homedir(), '.dharma')}/`))
    throw new Error('Private authoring jobs must remain under ~/.dharma');
  const manifest = expandedJobs();
  if (process.argv[3]) {
    const previous = JSON.parse(await readFile(process.argv[3], 'utf8'));
    // Reuse already-authored N2 written jobs exactly; every new listening allocation is fresh.
    for (const form of [2, 3, 4, 5]) {
      const old = previous.jobs.filter(
        (job) => job.level === 'N2' && job.form === form && job.skill !== 'listening',
      );
      if (old.reduce((sum, job) => sum + job.count, 0) !== 68)
        throw new Error('Unexpected preserved N2 written allocation');
      const first = manifest.jobs.findIndex((job) => job.level === 'N2' && job.form === form);
      manifest.jobs = manifest.jobs.filter(
        (job) => !(job.level === 'N2' && job.form === form && job.skill !== 'listening'),
      );
      manifest.jobs.splice(first, 0, ...old);
    }
  }
  await mkdir(new URL('.', `file://${out}`).pathname, { recursive: true });
  await writeFile(out, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify({
      out,
      jobs: manifest.jobs.length,
      questions: manifest.jobs.reduce((sum, job) => sum + job.count, 0),
      levels: Object.fromEntries(
        Object.keys(LEVEL_PROFILES).map((level) => [
          level,
          manifest.jobs.filter((job) => job.level === level).length,
        ]),
      ),
    }),
  );
}
