import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { voiceRolePlan } from './voice-roles.mjs';
import { LEVEL_PROFILES } from './prepare-expanded-bank-jobs.mjs';
import {
  shortItems,
  shortPassages,
  mediumItems,
  mediumPassages,
} from './authoring/n2-practice-originals.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const rights = Object.fromEntries(
  ['display', 'retain', 'sync', 'adapt', 'synthesize-audio'].map((operation) => [
    operation,
    {
      status: 'allowed',
      basisRef: 'bunki-original-authoring-20260923',
      policyVersion: 'bunki-original-rights-1',
    },
  ]),
);
const provenance = {
  kind: 'original-ai',
  authorRef: null,
  processRef: 'codex-original-n2-practice-20260923',
  sources: [],
};

export function prepareOriginal(mode) {
  const short = mode === 'short';
  const questions = short ? shortItems : mediumItems;
  const passageTexts = short ? shortPassages : mediumPassages;
  const id = `kairo-original-jlpt-n2-${mode}-01`;
  const units = [];
  const items = questions.map((entry, index) => {
    const itemId = `${id}:q${String(index + 1).padStart(2, '0')}`;
    if (entry.skill === 'listening') {
      const cues = [
        ...(entry.printedOptions
          ? [
              { kind: 'speech', voice: 'narrator', text: entry.spokenQuestion },
              { kind: 'planned-silence', milliseconds: 10_000 },
            ]
          : []),
        ...entry.dialogue.map(([voice, text]) => ({ kind: 'speech', voice, text })),
        { kind: 'speech', voice: 'narrator', text: entry.spokenQuestion },
        ...(!entry.printedOptions
          ? entry.options.map((text, choice) => ({
              kind: 'speech',
              voice: 'narrator',
              text: `${choice + 1}。${text}`,
            }))
          : []),
        { kind: 'planned-silence', milliseconds: 10_000 },
      ];
      const transcript = cues
        .filter((cue) => cue.kind === 'speech')
        .map((cue) => cue.text)
        .join('\n');
      const unit = {
        id: `${itemId}:audio`,
        itemIds: [itemId],
        cues,
        transcript,
        transcriptSha256: sha(transcript),
        printedOptions: entry.printedOptions,
      };
      units.push({ ...unit, ...voiceRolePlan(id, unit) });
    }
    return {
      v: 1,
      id: itemId,
      format: 'kairo-assessment-item',
      provenance,
      rights,
      skill: entry.skill,
      task: entry.task,
      prompt: entry.prompt,
      translatedInstruction:
        entry.skill === 'listening' ? 'Listen and choose one answer.' : 'Choose the best answer.',
      rationale: entry.rationale,
      passageIds: (entry.passages ?? (entry.passage ? [entry.passage] : [])).map(
        (key) => `${id}:passage-${key}`,
      ),
      media: [],
      subjects: entry.target ? [`word:${entry.target}`] : [`jlpt-n2:${entry.task}`],
      response: {
        kind: 'selected',
        options: entry.options.map((text, choice) => ({ id: `choice-${choice + 1}`, text })),
        answerOptionId: `choice-${entry.answer + 1}`,
      },
    };
  });
  const passages = Object.entries(passageTexts).map(([key, text]) => ({
    v: 1,
    id: `${id}:passage-${key}`,
    format: 'kairo-assessment-passage',
    provenance,
    rights,
    title: null,
    text,
    textSha256: sha(text),
    language: 'ja',
    locationUnit: 'utf16-code-unit',
  }));
  const skills = ['vocabulary', 'grammar', 'reading', 'listening'];
  const names = ['文字・語彙', '文法', '読解', '聴解'];
  const sections = skills.map((skill, index) => ({
    id: `section-${skill}`,
    title: names[index],
    skill,
    itemIds: items.filter((item) => item.skill === skill).map((item) => item.id),
  }));
  const timings = short ? [15, 5] : [45, 15];
  return {
    intent: {
      schema: 'kairo-assessment-authoring-input/1',
      id,
      level: 'N2',
      mode,
      titleJa: short ? 'N2 ショート練習' : 'N2 ミディアム練習',
      titleEn: short ? 'N2 short practice' : 'N2 medium practice',
      durationMinutes: short ? 20 : 60,
      sourceIds: ['bunki-original-n2-20260923'],
      formPayload: {
        v: 1,
        id,
        format: 'kairo-assessment-form',
        provenance,
        rights,
        title: `N2 ${mode} practice`,
        exam: { family: 'jlpt', track: 'N2' },
        scope: short ? 'short-practice' : 'section-practice',
        blueprintId: 'jlpt-n2-facts-20260910',
        items,
        passages,
        media: [],
        sections,
        timingBlocks: [
          {
            id: 'block-language-reading',
            sectionIds: sections.slice(0, 3).map((s) => s.id),
            durationMs: timings[0] * 60_000,
            clock: 'elapsed-including-interruptions',
            authority: { kind: 'authoring-rule', ruleId: `n2-${mode}-allocation-20260923` },
          },
          {
            id: 'block-listening',
            sectionIds: ['section-listening'],
            durationMs: timings[1] * 60_000,
            clock: 'elapsed-including-interruptions',
            authority: { kind: 'authoring-rule', ruleId: `n2-${mode}-allocation-20260923` },
          },
        ],
        authoring: {
          policyVersion: `n2-${mode}-allocation-20260923`,
          countsAre: 'authoring-rules',
          requirements: [...new Set(items.map((item) => item.task))].map((task) => ({
            task,
            minimumItems: items.filter((item) => item.task === task).length,
          })),
        },
      },
    },
    audio: { schema: 'kairo-assessment-audio-scripts/1', formId: id, units },
  };
}

const WRITTEN_SKILLS = ['vocabulary', 'grammar', 'reading'];
const WRITTEN_SECTION_TITLES = ['文字・語彙', '文法', '読解'];
const MANUSCRIPT_FIELDS = new Set([
  'skill',
  'task',
  'prompt',
  'options',
  'answer',
  'rationale',
  'target',
  'passage',
  'passages',
  'doubts',
]);

/** Written-only practice. Content enters through a manuscript; these values never admit it. */
export const WRITTEN_SPECS = Object.freeze({
  N1: Object.freeze({
    level: 'N1',
    id: 'kairo-original-jlpt-n1-written-12-01',
    titleJa: 'N1 文字・語彙・文法・読解の練習',
    titleEn: 'N1 written practice',
    sourceId: 'bunki-original-n1-20260925',
    processRef: 'claude-original-n1-practice-20260925',
    rightsBasis: 'bunki-original-authoring-20260923',
    blueprintId: 'jlpt-n1-facts-20260910',
    // Author-selected practice allocation, not official timing: 12 items at the official
    // language-knowledge and reading ratio (110 min / about 71 items) is about 18.6 min.
    // The blueprint fixes no universal item count; the form auditor judges actual workload.
    minutes: 19,
    policyVersion: 'n1-written-allocation-20260925',
    authorModelFamily: 'anthropic-claude',
    forbiddenTasks: Object.freeze(['orthography']),
    // Compact practice tasks. Their IDs never enter the official jlpt-n1 subject namespace.
    nonOfficialTasks: Object.freeze({
      'compact-comprehension': 'reading',
      'compact-main-idea': 'reading',
    }),
  }),
});

/** Three written sections, one authored timing block, no listening; doubts go to notes. */
export function prepareWrittenOriginal(spec) {
  const { level, id, items: entries, passages: passageTexts, status } = spec;
  if (typeof level !== 'string' || !/^N[1-5]$/u.test(level) || !Object.hasOwn(LEVEL_PROFILES, level))
    throw new Error(`Unknown written level: ${String(level)}`);
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/u.test(id ?? '')) throw new Error('Unsafe written form ID');
  if (!Number.isSafeInteger(spec.minutes) || spec.minutes <= 0)
    throw new Error('Written timing must be a positive whole-minute authoring allocation');
  for (const key of ['sourceId', 'processRef', 'rightsBasis', 'blueprintId', 'policyVersion'])
    if (typeof spec[key] !== 'string' || !/^\S+$/u.test(spec[key]))
      throw new Error(`Written spec lacks ${key}`);
  if (!/^[a-f0-9]{64}$/u.test(spec.manuscriptSha256 ?? ''))
    throw new Error('Written spec must name its exact manuscript SHA-256');
  if (
    status?.level !== level ||
    typeof spec.authorModelFamily !== 'string' ||
    status.authorModelFamily !== spec.authorModelFamily
  )
    throw new Error('Manuscript status does not match the written spec level or author family');
  const official = new Map(
    LEVEL_PROFILES[level].allocation
      .filter(([skill]) => skill !== 'listening')
      .map(([skill, task]) => [task, skill]),
  );
  const forbidden = new Set(spec.forbiddenTasks ?? []);
  const nonOfficial = new Map(Object.entries(spec.nonOfficialTasks ?? {}));
  for (const [task, skill] of nonOfficial)
    if (official.has(task) || forbidden.has(task) || !WRITTEN_SKILLS.includes(skill))
      throw new Error(`Non-official task cannot reuse an official or excluded task: ${task}`);
  if (!Array.isArray(entries) || !entries.length || !passageTexts || typeof passageTexts !== 'object')
    throw new Error('Written manuscript needs items and passages');
  const referenced = new Set();
  for (const [index, entry] of entries.entries()) {
    const label = `${level} manuscript item ${index + 1}`;
    const unknown = Object.keys(entry).filter((key) => !MANUSCRIPT_FIELDS.has(key));
    if (unknown.length) throw new Error(`Unmapped manuscript field in ${label}: ${unknown.join(', ')}`);
    if (!WRITTEN_SKILLS.includes(entry.skill)) throw new Error(`${label} is not a written skill`);
    if (forbidden.has(entry.task))
      throw new Error(`Excluded ${level} task by authoring policy: ${entry.task} (${label})`);
    const skill = official.get(entry.task) ?? nonOfficial.get(entry.task);
    if (skill === undefined) throw new Error(`Undeclared ${level} task: ${entry.task} (${label})`);
    if (skill !== entry.skill) throw new Error(`${label} task ${entry.task} is not a ${entry.skill} task`);
    if (
      !Array.isArray(entry.options) ||
      entry.options.length < 2 ||
      entry.options.some((text) => typeof text !== 'string' || !text) ||
      !Number.isSafeInteger(entry.answer) ||
      entry.answer < 0 ||
      entry.answer >= entry.options.length
    )
      throw new Error(`${label} has an invalid option list or key`);
    if (
      entry.doubts !== undefined &&
      (!Array.isArray(entry.doubts) || entry.doubts.some((doubt) => typeof doubt !== 'string'))
    )
      throw new Error(`${label} doubts must be a list of strings`);
    for (const key of entry.passages ?? (entry.passage ? [entry.passage] : [])) {
      if (!Object.hasOwn(passageTexts, key)) throw new Error(`${label} names a missing passage`);
      referenced.add(key);
    }
  }
  if (Object.keys(passageTexts).some((key) => !referenced.has(key)))
    throw new Error('Every manuscript passage must be used by an item');
  if (WRITTEN_SKILLS.some((skill) => !entries.some((entry) => entry.skill === skill)))
    throw new Error('A written section needs vocabulary, grammar and reading items');
  const written = Object.fromEntries(
    ['display', 'retain', 'sync', 'adapt', 'synthesize-audio'].map((operation) => [
      operation,
      { status: 'allowed', basisRef: spec.rightsBasis, policyVersion: 'bunki-original-rights-1' },
    ]),
  );
  const origin = { kind: 'original-ai', authorRef: null, processRef: spec.processRef, sources: [] };
  const namespace = level.toLowerCase();
  const items = entries.map((entry, index) => ({
    v: 1,
    id: `${id}:q${String(index + 1).padStart(2, '0')}`,
    format: 'kairo-assessment-item',
    provenance: origin,
    rights: written,
    skill: entry.skill,
    task: entry.task,
    prompt: entry.prompt,
    translatedInstruction: 'Choose the best answer.',
    rationale: entry.rationale,
    passageIds: (entry.passages ?? (entry.passage ? [entry.passage] : [])).map(
      (key) => `${id}:passage-${key}`,
    ),
    media: [],
    subjects: entry.target
      ? [`word:${entry.target}`]
      : [`${nonOfficial.has(entry.task) ? 'practice' : 'jlpt'}-${namespace}:${entry.task}`],
    response: {
      kind: 'selected',
      options: entry.options.map((text, choice) => ({ id: `choice-${choice + 1}`, text })),
      answerOptionId: `choice-${entry.answer + 1}`,
    },
  }));
  const passages = Object.entries(passageTexts).map(([key, text]) => ({
    v: 1,
    id: `${id}:passage-${key}`,
    format: 'kairo-assessment-passage',
    provenance: origin,
    rights: written,
    title: null,
    text,
    textSha256: sha(text),
    language: 'ja',
    locationUnit: 'utf16-code-unit',
  }));
  const sections = WRITTEN_SKILLS.map((skill, index) => ({
    id: `section-${skill}`,
    title: WRITTEN_SECTION_TITLES[index],
    skill,
    itemIds: items.filter((item) => item.skill === skill).map((item) => item.id),
  }));
  return {
    intent: {
      schema: 'kairo-assessment-authoring-input/1',
      id,
      level,
      mode: 'section',
      titleJa: spec.titleJa,
      titleEn: spec.titleEn,
      durationMinutes: spec.minutes,
      sourceIds: [spec.sourceId],
      formPayload: {
        v: 1,
        id,
        format: 'kairo-assessment-form',
        provenance: origin,
        rights: written,
        title: spec.titleEn,
        exam: { family: 'jlpt', track: level },
        scope: 'section-practice',
        blueprintId: spec.blueprintId,
        items,
        passages,
        media: [],
        sections,
        timingBlocks: [
          {
            id: 'block-language-reading',
            sectionIds: sections.map((section) => section.id),
            durationMs: spec.minutes * 60_000,
            clock: 'elapsed-including-interruptions',
            authority: { kind: 'authoring-rule', ruleId: spec.policyVersion },
          },
        ],
        authoring: {
          policyVersion: spec.policyVersion,
          countsAre: 'authoring-rules',
          requirements: [...new Set(items.map((item) => item.task))].map((task) => ({
            task,
            minimumItems: items.filter((item) => item.task === task).length,
          })),
        },
      },
    },
    audio: { schema: 'kairo-assessment-audio-scripts/1', formId: id, units: [] },
    notes: {
      schema: 'kairo-assessment-authoring-notes/1',
      formId: id,
      level,
      manuscriptSha256: spec.manuscriptSha256,
      authorModelFamily: spec.authorModelFamily,
      reviewEvidence: false,
      purpose:
        'Author self-check doubts for adversarial review. Not review evidence and never part of the learner form.',
      items: items.map((item, index) => ({ itemId: item.id, doubts: [...(entries[index].doubts ?? [])] })),
    },
  };
}

async function writeOnce(path, bytes) {
  try {
    await writeFile(path, bytes, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!(await readFile(path)).equals(bytes))
      throw new Error(`Refusing to replace different authoring bytes: ${path}`, { cause: error });
  }
}

/** --level N1 --manuscript file.mjs --out dir: evaluates exactly the hashed manuscript bytes. */
async function prepareWrittenFromArguments(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (!['--level', '--manuscript', '--out'].includes(key)) throw new Error(`Unknown argument: ${key}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing ${key}`);
    args.set(key, value);
  }
  for (const key of ['--level', '--manuscript', '--out'])
    if (!args.get(key)) throw new Error(`Required: ${key}`);
  const level = args.get('--level');
  if (!Object.hasOwn(WRITTEN_SPECS, level))
    throw new Error(`No written-section spec for ${level}; N2 short/medium run without arguments`);
  const bytes = await readFile(resolve(args.get('--manuscript')));
  const manuscript = await import(`data:text/javascript;base64,${bytes.toString('base64')}`);
  const prefix = level.toLowerCase();
  const items = manuscript[`${prefix}WrittenItems`];
  const passages = manuscript[`${prefix}WrittenPassages`];
  const prepared = prepareWrittenOriginal({
    ...WRITTEN_SPECS[level],
    items,
    passages,
    status: manuscript[`${prefix}WrittenDraftStatus`],
    manuscriptSha256: sha(bytes),
  });
  const { materializeWrittenSection } = await import('./bank.mjs');
  const section = await materializeWrittenSection(prepared, { bytes, items, passages });
  const out = resolve(args.get('--out'));
  await mkdir(out, { recursive: true });
  for (const [name, content] of Object.entries(section.files)) await writeOnce(resolve(out, name), content);
  console.log(
    JSON.stringify({
      level,
      out,
      formId: section.form.id,
      formSha256: section.form.sha256,
      formBytesSha256: section.binding.form.bytesSha256,
      status: section.binding.status,
    }),
  );
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1] && process.argv.length > 2)
  await prepareWrittenFromArguments(process.argv.slice(2));
else if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  for (const mode of ['short', 'medium']) {
    try {
      const current = JSON.parse(
        await readFile(new URL(`./authoring/n2-${mode}-01/intent.json`, import.meta.url), 'utf8'),
      );
      if (current.formPayload.provenance.processRef.includes('listening-r2'))
        throw new Error(
          'A revised listening form exists; regenerate through its receipt-backed revision workflow',
        );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (const mode of ['short', 'medium']) {
    const { intent, audio } = prepareOriginal(mode);
    const directory = new URL(`./authoring/n2-${mode}-01/`, import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL('intent.json', directory), JSON.stringify(intent, null, 2) + '\n');
    await writeFile(
      new URL('audio-scripts.json', directory),
      JSON.stringify(audio, null, 2) + '\n',
    );
    console.log(
      `${mode}: ${intent.formPayload.items.length} items, ${audio.units.length} audio units`,
    );
  }
}
