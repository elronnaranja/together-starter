CREATE TABLE `household_state` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
