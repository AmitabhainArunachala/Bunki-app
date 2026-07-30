CREATE TABLE `learner_review_events` (
	`owner_id` text NOT NULL,
	`event_id` text NOT NULL,
	`card_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`rating` integer NOT NULL,
	`skill` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`source_id` text,
	PRIMARY KEY(`owner_id`, `event_id`)
);
--> statement-breakpoint
CREATE INDEX `learner_review_events_owner_time_idx` ON `learner_review_events` (`owner_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `teacher_daily_usage` (
	`owner_id` text NOT NULL,
	`usage_day` text NOT NULL,
	`turns` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner_id`, `usage_day`)
);
