ALTER TABLE `audits` ADD `action` text DEFAULT 'save' NOT NULL;--> statement-breakpoint
ALTER TABLE `boards` ADD `confirmed` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `exams` ADD `mutation_id` text DEFAULT '' NOT NULL;