CREATE TABLE `reference_data` (
	`kind` text PRIMARY KEY NOT NULL,
	`year` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `exams` ADD `draft` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `exams` ADD `reference_info` text DEFAULT '{}' NOT NULL;