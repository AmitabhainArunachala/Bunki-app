CREATE TABLE `learner_source_bodies` (
	`owner_id` text NOT NULL,
	`source_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`byte_length` integer NOT NULL,
	`body_text` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `source_id`, `fingerprint`)
);
