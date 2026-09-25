#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';

export const ALLOCATIONS = {
  N2: [
    ['vocabulary', 'kanji-reading', 5],
    ['vocabulary', 'orthography', 5],
    ['vocabulary', 'word-formation', 5],
    ['vocabulary', 'contextual-expression', 5],
    ['vocabulary', 'paraphrase', 5],
    ['vocabulary', 'usage', 5],
    ['grammar', 'grammar-form', 10],
    ['grammar', 'sentence-composition', 5],
    ['grammar', 'text-grammar', 5],
    ['reading', 'short-reading', 4],
    ['reading', 'mid-reading', 6],
    ['reading', 'integrated-reading', 2],
    ['reading', 'claim-reading', 4],
    ['reading', 'information-retrieval', 2],
    ['listening', 'listening-task', 5],
    ['listening', 'listening-point', 5],
    ['listening', 'listening-gist', 4],
    ['listening', 'listening-response', 10],
    ['listening', 'listening-integrated', 4],
  ],
};

const taskInstructions = {
  'kanji-reading':
    'Bracket a contextually appropriate kanji word in a complete sentence; four kana reading choices. Realistic phonological distractors.',
  orthography:
    'Bracket a kana word in a sentence; choose its correct written form among four plausible orthographic distractors.',
  'word-formation':
    'Complete a word with a prefix, suffix, or compound element. Ensure no competing option creates another contextually acceptable compound.',
  'contextual-expression':
    'Complete the sentence with a word selected by its meaning and collocation; competing choices must fit the same grammatical slot.',
  paraphrase:
    'Bracket an expression in context and ask for its closest meaning. Distractors should capture plausible but distinct meanings.',
  usage:
    'Name one target word and offer four complete sentences using it; only one uses its meaning and collocation naturally.',
  'grammar-form':
    'Complete a sentence with one grammatical construction. Test N2 syntax, semantic relations, register, or discourse conditions, not mere word meaning.',
  'sentence-composition':
    'Four distinct phrase fragments form a uniquely ordered sentence. Exactly four blank slots, third marked ★, answer chooses fragment in third slot. Check whole-sentence order yourself.',
  'text-grammar':
    'One coherent original passage of 450–650 Japanese characters with five numbered gaps; five questions reference the same passage and depend on its discourse context.',
  'short-reading':
    'Four separate original passages of 150–220 Japanese characters, one inference or purpose question per passage. Avoid keys that simply repeat unique words.',
  'mid-reading':
    'Three separate original passages of 380–550 Japanese characters, two questions each; test referents, reasons, or intended meaning.',
  'integrated-reading':
    'Two original texts by different people on a shared issue, 250–350 Japanese characters each. Both questions reference BOTH passages; one compares agreement and one contrasts their reasoning.',
  'claim-reading':
    'One substantial original argumentative passage of 700–950 Japanese characters; four distinct questions, including main claim and reasoning. Keep difficulty N2.',
  'information-retrieval':
    'One realistic original notice or schedule with multiple interacting constraints, 400–650 Japanese characters. Two scenarios require selecting different compatible options.',
  'listening-task':
    'Five distinct dialogues, 250–420 Japanese characters each, with an explicit task to perform next. Include realistic corrections or constraints. Printed choices. Voices speaker-a is female and speaker-b is male.',
  'listening-point':
    'Five distinct dialogues, 230–380 Japanese characters each, asking for one decision reason or fact. Distinguish stated distractor facts from the actual requested point. Printed choices.',
  'listening-gist':
    'Four distinct monologues, 250–380 Japanese characters each, asking main point or intention; choices and question are spoken, printedOptions false.',
  'listening-response':
    'Ten distinct short conversational prompts with three spoken replies each; choose the most pragmatically appropriate response. PrintedOptions false. Avoid bland or absurd distractors.',
  'listening-integrated':
    'Three longer shared stimuli: the first supports one question, the second one question, the third TWO questions. Each stimulus 600–850 Japanese characters with competing plans and constraints. First two questions have spoken choices; the last two have printed choices. Use the same stimulusId for the final two questions and do not duplicate their dialogue.',
};
const themes = {
  2: [
    'community science workshops',
    'university extension programs',
    'public libraries and local history',
    'apartment repair and neighborhood planning',
  ],
  3: [
    'workplace scheduling and product design',
    'food waste reduction',
    'regional train travel',
    'musical practice and performance',
  ],
  4: [
    'volunteer projects and public art',
    'remote work and learning',
    'museum interpretation',
    'rural tourism and wildlife observation',
  ],
  5: [
    'sports facilities and equipment lending',
    'independent bookstores',
    'urban parks and gardening',
    'family businesses and customer feedback',
  ],
};

export function authoringJobs(level, forms) {
  if (level !== 'N2')
    throw new Error(
      'Additional levels require their level-specific authoring allocation and task review first',
    );
  const jobs = forms.flatMap((form) =>
    ALLOCATIONS[level].map(([skill, task, count], index) => ({
      id: `${level.toLowerCase()}-full-${String(form).padStart(2, '0')}-${task}`,
      level,
      form,
      mode: 'full',
      skill,
      task,
      count,
      authoringPolicy: 'bunki-n2-96-item-allocation-20260923',
      countsAre: 'local-authoring-rules-not-official-fixed-counts',
      topic:
        themes[form]?.[index % 4] ?? `everyday social and professional situations, form ${form}`,
      variationSeed: `${level}-${form}-${task}`,
      requirements: taskInstructions[task],
      quality:
        'This is a distinct new form, not a paraphrase or option shuffle of another form. Natural JLPT N2 reading/listening difficulty, not N5 exercises. All text must be original.',
    })),
  );
  const boundedJobs = jobs.flatMap((job) => {
    const parts = job.count > 5 ? (job.task === 'mid-reading' ? 3 : 2) : 1;
    if (parts === 1) return [job];
    return Array.from({ length: parts }, (_, index) => ({
      ...job,
      id: `${job.id}-part${index + 1}`,
      part: index + 1,
      count: job.count / parts,
      variationSeed: `${job.variationSeed}-part${index + 1}`,
      requirements:
        job.task === 'mid-reading'
          ? 'One original passage of 380–550 Japanese characters and two questions testing referents, reasons, or intended meaning.'
          : `${job.requirements} This is a bounded partial batch: author exactly ${job.count / parts} distinct items for part ${index + 1}, not the whole task allocation.`,
    }));
  });
  return { schema: 'kairo-assessment-author-jobs/1', level, forms, jobs: boundedJobs };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = Object.fromEntries(
    Array.from({ length: (process.argv.length - 2) / 2 }, (_, index) => [
      process.argv[2 + index * 2],
      process.argv[3 + index * 2],
    ]),
  );
  const out = resolve(
    args['--out'] ??
      join(homedir(), '.dharma/bunki_assessment/2026-09-23/authoring/n2-full-jobs.json'),
  );
  const rel = relative(join(homedir(), '.dharma'), out);
  if (isAbsolute(rel) || rel.startsWith('..'))
    throw new Error('Author job output must be under ~/.dharma');
  const forms = (args['--forms'] ?? '2,3,4,5').split(',').map(Number);
  if (
    forms.some((form) => !Number.isInteger(form) || form < 2 || form > 5) ||
    new Set(forms).size !== forms.length
  )
    throw new Error('Forms must be distinct values 2–5');
  await mkdir(new URL('./', `file://${out}`).pathname, { recursive: true });
  const manifest = authoringJobs(args['--level'] ?? 'N2', forms);
  await writeFile(out, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ out, jobs: manifest.jobs.length }));
}
