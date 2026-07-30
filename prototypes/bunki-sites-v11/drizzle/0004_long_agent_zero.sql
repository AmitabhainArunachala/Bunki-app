CREATE TABLE `reader_daily_usage` (
	`owner_id` text NOT NULL,
	`usage_day` text NOT NULL,
	`generations` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner_id`, `usage_day`)
);
