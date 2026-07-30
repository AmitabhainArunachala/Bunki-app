import { createEmptyCard, fsrs, Rating, type Card, type CardInput } from "ts-fsrs";

import type { ReviewCard } from "./types";

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 36_500,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
});

const serialize = (card: Card): ReviewCard["fsrs"] => ({
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

export function newFsrsState(now: Date): ReviewCard["fsrs"] {
  return serialize(createEmptyCard(now));
}

function hydrate(card: ReviewCard): CardInput {
  return {
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
  };
}

export function rateCard(
  card: ReviewCard,
  rating: 1 | 2 | 3 | 4,
  now: Date,
): ReviewCard {
  const result = scheduler.next(hydrate(card), now, rating as Rating);
  return {
    ...card,
    dueAt: result.card.due.toISOString(),
    intervalDays: result.card.scheduled_days,
    repetitions: result.card.reps,
    lapses: result.card.lapses,
    lastReviewedAt: now.toISOString(),
    fsrs: serialize(result.card),
  };
}

