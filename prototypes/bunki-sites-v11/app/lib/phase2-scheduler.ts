import { fsrs, Rating, type Card, type CardInput } from "ts-fsrs";

import type {
  LearningCard,
  Phase2State,
  ReviewEvent,
  ReviewSession,
} from "./phase2-types.ts";

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 36_500,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
});

const hydrate = (card: LearningCard): CardInput => ({
  due: card.dueAt,
  stability: card.fsrs.stability,
  difficulty: card.fsrs.difficulty,
  elapsed_days: card.fsrs.elapsedDays,
  scheduled_days: card.fsrs.scheduledDays,
  learning_steps: card.fsrs.learningSteps,
  reps: card.fsrs.reps,
  lapses: card.fsrs.lapses,
  state: card.fsrs.state,
  last_review: card.fsrs.lastReview,
});

const serialize = (card: Card): LearningCard["fsrs"] => ({
  stability: card.stability,
  difficulty: card.difficulty,
  elapsedDays: card.elapsed_days,
  scheduledDays: card.scheduled_days,
  learningSteps: card.learning_steps,
  reps: card.reps,
  lapses: card.lapses,
  state: card.state,
  lastReview: card.last_review?.toISOString() ?? null,
});

function intervalLabel(due: Date, now: Date): string {
  const seconds = Math.max(0, Math.round((due.getTime() - now.getTime()) / 1000));
  if (seconds < 90) return `${String(Math.max(1, seconds))}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${String(minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${String(hours)}h`;
  const days = Math.round(hours / 24);
  if (days < 365) return `${String(days)}d`;
  return `${(days / 365).toFixed(1)}y`;
}

export function ratingPreviews(
  card: LearningCard,
  now = new Date(),
): Readonly<Record<1 | 2 | 3 | 4, string>> {
  const repeat = scheduler.repeat(hydrate(card), now);
  return {
    1: intervalLabel(repeat[Rating.Again].card.due, now),
    2: intervalLabel(repeat[Rating.Hard].card.due, now),
    3: intervalLabel(repeat[Rating.Good].card.due, now),
    4: intervalLabel(repeat[Rating.Easy].card.due, now),
  };
}

export function rateLearningCard(
  card: LearningCard,
  rating: 1 | 2 | 3 | 4,
  now = new Date(),
): { readonly card: LearningCard; readonly event: ReviewEvent } {
  const result = scheduler.next(hydrate(card), now, rating as Rating);
  const nextCard: LearningCard = {
    ...card,
    updatedAt: now.toISOString(),
    dueAt: result.card.due.toISOString(),
    leech: result.card.lapses >= 8,
    fsrs: serialize(result.card),
  };
  return {
    card: nextCard,
    event: {
      id: `review-${crypto.randomUUID()}`,
      cardId: card.id,
      conceptId: card.conceptId,
      rating,
      reviewedAt: now.toISOString(),
      previousCard: card,
      nextCard,
    },
  };
}

export function startReviewSession(
  state: Phase2State,
  dueCardIds: readonly string[],
  limit = 20,
  now = new Date(),
): ReviewSession {
  const queue = dueCardIds.slice(0, limit);
  return {
    id: `session-${crypto.randomUUID()}`,
    startedAt: now.toISOString(),
    completedAt: null,
    queue,
    completedCardIds: [],
    initialCount: queue.length,
  };
}

export function sessionProgress(session: ReviewSession | null): {
  readonly completed: number;
  readonly total: number;
  readonly percent: number;
} {
  if (session === null) return { completed: 0, total: 0, percent: 0 };
  const completed = session.completedCardIds.length;
  return {
    completed,
    total: session.initialCount,
    percent:
      session.initialCount === 0
        ? 100
        : Math.round((completed / session.initialCount) * 100),
  };
}
