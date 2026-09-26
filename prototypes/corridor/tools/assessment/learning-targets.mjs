import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPOSITORY, hash } from './bank.mjs';

const authoredLemmas = {
  v11: '再開',
  v12: '機械化',
  v13: '比',
  v14: '発売元',
  v15: '記憶力',
  v17: '見落とす',
  v18: '曖昧',
  v19: '着実',
  v22: '気兼ね',
  v23: '折り合い',
  v24: '目途',
  v25: '差し支える',
};

/** Resolves only the tested target, never distractors or every word in a passage. */
export async function learningTargets(form, api) {
  const wordBytes = await readFile(
    join(REPOSITORY, 'prototypes/corridor/data/share_alike/words.json'),
  );
  const grammarBytes = await readFile(
    join(REPOSITORY, 'prototypes/corridor/data/original/grammar-v11.json'),
  );
  const words = JSON.parse(wordBytes).words;
  const grammar = JSON.parse(grammarBytes).entries;
  const aliases = new Map();
  for (const key of Object.keys(words))
    for (const spelling of key.split(/\s*[;；]\s*/u)) {
      const previous = aliases.get(spelling);
      aliases.set(spelling, aliases.has(spelling) && previous !== key ? null : key);
    }
  const mappings = [];
  for (const item of form.items) {
    if (item.response.kind !== 'selected') continue;
    const answer = item.response.options.find(
      (option) => option.id === item.response.answerOptionId,
    ).text;
    let target = item.subjects.find((subject) => subject.startsWith('word:'))?.slice(5) ?? null;
    if (!target && item.skill === 'vocabulary') {
      const lastId = item.id.split(':').at(-1);
      if (item.id.startsWith('kairo-original-jlpt-n2-form-01:') && authoredLemmas[lastId])
        target = authoredLemmas[lastId];
      else if (['kanji-reading', 'paraphrase', 'usage'].includes(item.task))
        target =
          [...item.prompt.matchAll(/【([^】]+)】/gu)]
            .map((match) => match[1].trim())
            .filter(Boolean)
            .at(-1) ?? null;
      else if (['orthography', 'contextual-expression'].includes(item.task)) target = answer;
    }
    const wordKey = target ? (Object.hasOwn(words, target) ? target : aliases.get(target)) : null;
    if (wordKey)
      mappings.push({
        item: api.artifactReference(item),
        subjects: [`word:${wordKey}`],
        basis: 'tested-word-exact-dictionary-identity',
        dictionarySha256: hash(wordBytes),
      });
    if (item.task === 'grammar-form') {
      const matches = grammar.filter((entry) => entry.cues.includes(answer));
      if (matches.length === 1)
        mappings.push({
          item: api.artifactReference(item),
          subjects: [`grammar:${matches[0].id}`],
          basis: 'tested-grammar-exact-pattern-cue',
          dictionarySha256: hash(grammarBytes),
        });
    }
  }
  return mappings;
}
