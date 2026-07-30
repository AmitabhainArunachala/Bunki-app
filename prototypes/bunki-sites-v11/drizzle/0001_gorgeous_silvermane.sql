CREATE TABLE `learner_states_v2` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teacher_turns` (
	`owner_id` text NOT NULL,
	`client_turn_id` text NOT NULL,
	`usage_day` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `client_turn_id`)
);
--> statement-breakpoint
CREATE INDEX `teacher_turns_owner_day_idx` ON `teacher_turns` (`owner_id`,`usage_day`);