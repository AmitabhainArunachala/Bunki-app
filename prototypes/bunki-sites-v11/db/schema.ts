import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const learnerStates = sqliteTable("learner_states", {
  ownerId: text("owner_id").primaryKey(),
  stateJson: text("state_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const learnerStatesV2 = sqliteTable("learner_states_v2", {
  ownerId: text("owner_id").primaryKey(),
  stateJson: text("state_json").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const learnerSourceBodies = sqliteTable(
  "learner_source_bodies",
  {
    ownerId: text("owner_id").notNull(),
    sourceId: text("source_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    byteLength: integer("byte_length").notNull(),
    bodyText: text("body_text").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.ownerId, table.sourceId, table.fingerprint],
    }),
  ],
);

export const teacherTurns = sqliteTable(
  "teacher_turns",
  {
    ownerId: text("owner_id").notNull(),
    clientTurnId: text("client_turn_id").notNull(),
    usageDay: text("usage_day").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.clientTurnId] }),
    index("teacher_turns_owner_day_idx").on(table.ownerId, table.usageDay),
  ],
);

export const teacherDailyUsage = sqliteTable(
  "teacher_daily_usage",
  {
    ownerId: text("owner_id").notNull(),
    usageDay: text("usage_day").notNull(),
    turns: integer("turns").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.usageDay] }),
  ],
);

export const readerDailyUsage = sqliteTable(
  "reader_daily_usage",
  {
    ownerId: text("owner_id").notNull(),
    usageDay: text("usage_day").notNull(),
    generations: integer("generations").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.usageDay] }),
  ],
);

export const learnerReviewEvents = sqliteTable(
  "learner_review_events",
  {
    ownerId: text("owner_id").notNull(),
    eventId: text("event_id").notNull(),
    cardId: text("card_id").notNull(),
    conceptId: text("concept_id").notNull(),
    rating: integer("rating").notNull(),
    skill: text("skill").notNull(),
    reviewedAt: text("reviewed_at").notNull(),
    sourceId: text("source_id"),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.eventId] }),
    index("learner_review_events_owner_time_idx").on(
      table.ownerId,
      table.reviewedAt,
    ),
  ],
);
