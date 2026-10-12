CREATE TABLE `admin_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` text NOT NULL
);
