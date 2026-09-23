import { z } from 'zod';
import { immutable, type DeepReadonly } from './common.ts';

export const examSchema = z.discriminatedUnion('family', [
  z.strictObject({ family: z.literal('jlpt'), track: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']) }),
  z.strictObject({ family: z.literal('jtest'), track: z.enum(['A-C', 'D-E', 'F-G']) }),
]);
export type Exam = DeepReadonly<z.infer<typeof examSchema>>;

export interface BlueprintFacts {
  readonly id: string;
  readonly kind: 'official-blueprint-facts';
  readonly checkedAt: '2026-09-10';
  readonly exam: Exam;
  readonly sources: readonly string[];
  readonly timingBlocks: readonly {
    readonly id: string;
    readonly skills: readonly string[];
    readonly minutes: number;
    readonly duration: 'fixed' | 'nominal-listening';
  }[];
  /** Known requirements, not a claim to be an exhaustive authoring blueprint. */
  readonly knownRequiredTasks: readonly string[];
  readonly forbiddenTasks: readonly string[];
  readonly fixedUniversalItemCount: null;
  readonly writtenResponseRequired: boolean;
  readonly areasPerHalf: number | null;
  readonly officialMaximum: number;
  readonly scoreMethod: 'scaled-response-pattern' | 'publisher-weighted';
  readonly breakBetweenHalves: 'not-specified-here' | 'none';
  readonly coverageCatalog: 'partial-requires-editorial-review';
}

const jlptSources = [
  'https://www.jlpt.jp/e/guideline/testsections.html',
  'https://www.jlpt.jp/e/guideline/pdf/n1_e_revised.pdf',
  'https://www.jlpt.jp/e/guideline/pdf/n5_e_revised.pdf',
  'https://jlpt.jp/e/about/pdf/scaledscore_e.pdf',
];

function jlpt(
  track: Extract<Exam, { family: 'jlpt' }>['track'],
  minutes: readonly number[],
): BlueprintFacts {
  const combined = minutes.length === 2;
  const timingBlocks = combined
    ? [
        {
          id: 'language-reading',
          skills: ['vocabulary', 'grammar', 'reading'],
          minutes: minutes[0]!,
          duration: 'fixed' as const,
        },
        {
          id: 'listening',
          skills: ['listening'],
          minutes: minutes[1]!,
          duration: 'nominal-listening' as const,
        },
      ]
    : [
        {
          id: 'vocabulary',
          skills: ['vocabulary'],
          minutes: minutes[0]!,
          duration: 'fixed' as const,
        },
        {
          id: 'grammar-reading',
          skills: ['grammar', 'reading'],
          minutes: minutes[1]!,
          duration: 'fixed' as const,
        },
        {
          id: 'listening',
          skills: ['listening'],
          minutes: minutes[2]!,
          duration: 'nominal-listening' as const,
        },
      ];
  return immutable({
    id: `jlpt-${track.toLowerCase()}-facts-20260910`,
    kind: 'official-blueprint-facts',
    checkedAt: '2026-09-10',
    exam: { family: 'jlpt', track },
    sources: jlptSources,
    timingBlocks,
    knownRequiredTasks: ['sentence-composition', 'text-grammar', 'information-retrieval'],
    forbiddenTasks: track === 'N1' ? ['orthography'] : [],
    fixedUniversalItemCount: null,
    writtenResponseRequired: false,
    areasPerHalf: null,
    officialMaximum: 180,
    scoreMethod: 'scaled-response-pattern',
    breakBetweenHalves: 'not-specified-here',
    coverageCatalog: 'partial-requires-editorial-review',
  });
}

function jtest(
  track: Extract<Exam, { family: 'jtest' }>['track'],
  reading: number,
  listening: number,
  maximum: number,
): BlueprintFacts {
  return immutable({
    id: `jtest-${track.toLowerCase()}-facts-20260910`,
    kind: 'official-blueprint-facts',
    checkedAt: '2026-09-10',
    exam: { family: 'jtest', track },
    sources: [
      'https://j-test.jp/newjtest',
      'https://j-test.jp/wp-content/uploads/2025/09/Brochure_20250904.pdf',
    ],
    timingBlocks: [
      {
        id: 'reading-writing',
        skills: ['vocabulary', 'grammar', 'reading', 'writing'],
        minutes: reading,
        duration: 'fixed',
      },
      { id: 'listening', skills: ['listening'], minutes: listening, duration: 'nominal-listening' },
    ],
    knownRequiredTasks: [],
    forbiddenTasks: [],
    fixedUniversalItemCount: null,
    writtenResponseRequired: track !== 'F-G',
    areasPerHalf: 4,
    officialMaximum: maximum,
    scoreMethod: 'publisher-weighted',
    breakBetweenHalves: 'none',
    coverageCatalog: 'partial-requires-editorial-review',
  });
}

/** Facts do not supply questions, licenses, fixed item counts, or human review. */
export const OFFICIAL_BLUEPRINTS: readonly BlueprintFacts[] = immutable([
  jlpt('N5', [20, 40, 30]),
  jlpt('N4', [25, 55, 35]),
  jlpt('N3', [30, 70, 40]),
  jlpt('N2', [105, 50]),
  jlpt('N1', [110, 55]),
  jtest('A-C', 80, 45, 1000),
  jtest('D-E', 70, 35, 700),
  jtest('F-G', 60, 25, 350),
]);

export function getOfficialBlueprint(id: string): BlueprintFacts | undefined {
  return OFFICIAL_BLUEPRINTS.find((blueprint) => blueprint.id === id);
}
