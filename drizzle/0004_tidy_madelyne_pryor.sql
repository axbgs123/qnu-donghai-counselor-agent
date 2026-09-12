CREATE TABLE `pilot_students` (
	`student_no` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`class_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `student_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`student_no` text NOT NULL,
	`student_name` text NOT NULL,
	`class_name` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`conversation_json` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`urgency` text DEFAULT 'normal' NOT NULL,
	`teacher_reply` text,
	`reply_channel` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_student_requests_status_created` ON `student_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_student_requests_student` ON `student_requests` (`student_no`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_student_requests_class_status` ON `student_requests` (`class_name`,`status`);--> statement-breakpoint
CREATE TABLE `student_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`student_no` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_active_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_no`) REFERENCES `pilot_students`(`student_no`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_student` ON `student_sessions` (`student_no`);--> statement-breakpoint
CREATE TABLE `welcome_completions` (
	`item_id` integer NOT NULL,
	`student_no` text NOT NULL,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`item_id`, `student_no`),
	FOREIGN KEY (`item_id`) REFERENCES `welcome_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_no`) REFERENCES `pilot_students`(`student_no`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `welcome_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`due_at` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `welcome_items_title_unique` ON `welcome_items` (`title`);