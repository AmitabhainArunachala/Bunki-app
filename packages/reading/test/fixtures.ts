import {
  ARTICLE_OPERATIONS,
  articleReference,
  normalizeArticleIntake,
  type ArticleCapabilityInput,
  type ArticleCandidate,
  type ArticleDraftContext,
  type ArticleIntakeContext,
  type ArticleIntakeMetadata,
  type CapabilityDecision,
  type GenerationBriefInput,
} from '../src/index.ts';

export const NOW = '2026-09-10T01:00:00.000Z';
export const LATER = '2026-09-10T02:00:00.000Z';
export const BODY = '宇宙へ🚀。犬と猫が月を見る。';

export const ALLOWED: CapabilityDecision = {
  status: 'allowed',
  basis: { kind: 'original', reference: 'fixture-author-permission-v1', checkedAt: NOW },
};

export function capabilities(overrides: ArticleCapabilityInput = {}): ArticleCapabilityInput {
  return {
    ...Object.fromEntries(ARTICLE_OPERATIONS.map((operation) => [operation, ALLOWED])),
    ...overrides,
  };
}

export function metadata(overrides: Partial<ArticleIntakeMetadata> = {}): ArticleIntakeMetadata {
  return {
    itemId: 'item-1',
    canonicalUrl: 'https://publisher.example/article/1',
    title: '月への旅',
    body: { text: BODY },
    ...overrides,
  };
}

export function context(overrides: Partial<ArticleIntakeContext> = {}): ArticleIntakeContext {
  return {
    source: { id: 'publisher', name: 'Fixture publisher', attribution: 'Fixture author' },
    capabilities: capabilities(),
    lineage: { kind: 'publisher-original' },
    provenance: [
      {
        sourceId: 'publisher',
        sourceVersion: 'feed-1',
        sourceUrl: 'https://publisher.example/feed.xml',
        attribution: 'Fixture author',
        license: 'Synthetic fixture permission only',
        modification: 'unmodified',
        evidenceRef: 'fixture-source-check',
        retrievedAt: NOW,
      },
    ],
    ...overrides,
  };
}

export function article(): ArticleCandidate {
  return normalizeArticleIntake(metadata(), context());
}

export function decision(candidate: ArticleCandidate) {
  return {
    reference: articleReference(candidate.article),
    status: 'approved',
    reviewerId: 'fixture-editor',
    decidedAt: LATER,
    rubricVersion: 'fixture-rubric-v1',
    userAction: true,
    note: 'Synthetic operator decision used to verify exact-version binding.',
  };
}

export function briefInput(overrides: Partial<GenerationBriefInput> = {}): GenerationBriefInput {
  return {
    owner: { learnerId: 'private-learner-1', sessionEpoch: 'private-session-1' },
    job: { id: 'private-job-1', revision: 0 },
    createdAt: NOW,
    modelId: 'fixture-requested-model',
    promptVersion: 'article-prompt-v1',
    settings: {
      mode: 'original-fiction',
      genre: 'fiction',
      length: 'short',
      register: 'neutral',
      challenge: 'comfortable',
      interests: ['space science', 'animals'],
      startingLevel: null,
    },
    learner: {
      modelVersion: 'kagami-1',
      bands: [],
      targets: [],
    },
    recentArticleIds: ['private-recent-article-1'],
    recentTopics: ['a rainy day'],
    ...overrides,
  };
}

export function draftContext(): ArticleDraftContext {
  return {
    completedAt: LATER,
    provider: 'fixture-provider',
    actualModel: 'fixture-model-revision',
    capabilities: capabilities(),
  };
}

export const DRAFT = {
  title: '月の友達',
  text: BODY,
  suggestedWords: ['犬', '猫', '犬', '未知語'],
};
export const WORDS = {
  犬: { lexemeId: 'lex-dog', form: '犬', reading: 'いぬ' },
  猫: { lexemeId: 'lex-cat', form: '猫', reading: 'ねこ' },
};
