CREATE TABLE `assistant_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`title` text NOT NULL,
	`messages_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_assistant_conversations_teacher_updated` ON `assistant_conversations` (`teacher_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `notification_reads` (
	`teacher_id` text NOT NULL,
	`notification_key` text NOT NULL,
	`read_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`teacher_id`, `notification_key`)
);
--> statement-breakpoint
CREATE TABLE `teacher_ai_settings` (
	`teacher_id` text NOT NULL,
	`provider` text NOT NULL,
	`api_key` text DEFAULT '' NOT NULL,
	`model` text NOT NULL,
	`base_url` text NOT NULL,
	`is_active` integer DEFAULT 0 NOT NULL,
	`last_test_status` text,
	`last_test_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`teacher_id`, `provider`)
);
--> statement-breakpoint
CREATE INDEX `idx_teacher_ai_active` ON `teacher_ai_settings` (`teacher_id`,`is_active`);