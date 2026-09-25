import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { voiceRolePlan } from './voice-roles.mjs';
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

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
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
