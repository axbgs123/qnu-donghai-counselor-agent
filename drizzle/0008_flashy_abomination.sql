CREATE TABLE `app_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`permissions_json` text DEFAULT '[]' NOT NULL,
	`teacher_id` text,
	`student_no` text,
	`class_name` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_accounts_username_unique` ON `app_accounts` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_accounts_student_no_unique` ON `app_accounts` (`student_no`);--> statement-breakpoint
CREATE INDEX `idx_accounts_role_status` ON `app_accounts` (`role`,`status`);--> statement-breakpoint
CREATE INDEX `idx_accounts_teacher_role` ON `app_accounts` (`teacher_id`,`role`);--> statement-breakpoint
CREATE TABLE `app_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_active_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `app_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_account_expiry` ON `app_sessions` (`account_id`,`expires_at`);