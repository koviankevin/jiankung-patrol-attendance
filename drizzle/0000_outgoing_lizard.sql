CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audits` (
	`request_id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`session_id` text NOT NULL,
	`revision` integer NOT NULL,
	`entries` text NOT NULL,
	`actor` text NOT NULL,
	`at` text NOT NULL,
	`body_hash` text NOT NULL,
	`principal` text NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `boards` (
	`exam_id` text NOT NULL,
	`session_id` text NOT NULL,
	`revision` integer NOT NULL,
	`entries` text NOT NULL,
	`actor` text NOT NULL,
	`updated_at` text NOT NULL,
	`request_id` text NOT NULL,
	PRIMARY KEY(`exam_id`, `session_id`),
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`data` text NOT NULL,
	`closed` integer DEFAULT 0 NOT NULL,
	`code_hash` text NOT NULL,
	`code_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`exam_id` text,
	`code_version` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL
);
