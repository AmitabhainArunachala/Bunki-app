const defaults = {
  narrator: 'female',
  announcer: 'male',
  'speaker-a': 'female',
  'speaker-b': 'male',
  'speaker-c': 'male',
};
const fullMaleLead = new Set([
  'script-l02',
  'script-l04',
  'script-l06',
  'script-l12',
  'script-l13',
]);

/** Authored casting constraints, not a claim that a rendered voice has been inspected. */
export function voiceRolePlan(formId, unit, sourceDescriptions = null) {
  const used = [
    ...new Set(unit.cues.filter((cue) => cue.kind === 'speech').map((cue) => cue.voice)),
  ];
  const roles = Object.fromEntries(used.map((voice) => [voice, defaults[voice]]));
  const suffix = unit.id.split(':').at(-1);
  const swap =
    (formId === 'kairo-original-jlpt-n2-form-01' && fullMaleLead.has(suffix)) ||
    (formId === 'kairo-original-jlpt-n2-medium-01' && unit.itemIds.includes(`${formId}:q34`));
  if (swap) {
    if (used.includes('speaker-a')) roles['speaker-a'] = 'male';
    if (used.includes('speaker-b')) roles['speaker-b'] = 'female';
  }
  if (Object.values(roles).some((role) => !role)) throw new Error('Unassigned voice role');
  return {
    voiceRoles: roles,
    roleEvidence: {
      basis: 'author-voice-assignment-with-source-constraints',
      sourceDescriptions,
      note: swap
        ? 'The authored question or speaker description identifies speaker-a as a man; the other dialogue voice is distinct and female.'
        : 'Speaker-a is assigned a female voice, speaker-b and speaker-c distinct male voices; narrator is female and announcer male where used. Check against the actual audio before admission.',
    },
  };
}
