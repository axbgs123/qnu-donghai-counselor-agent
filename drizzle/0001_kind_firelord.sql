CREATE TABLE `class_work` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`class_name` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`scheduled_at` text,
	`participant_count` integer,
	`status` text DEFAULT 'planned' NOT NULL,
	`owner_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_class_work_class_status` ON `class_work` (`class_name`,`status`);--> statement-breakpoint
CREATE TABLE `participation_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` text NOT NULL,
	`category` text NOT NULL,
	`activity_name` text NOT NULL,
	`occurred_at` text NOT NULL,
	`hours` integer,
	`result` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_participation_student_category` ON `participation_records` (`student_id`,`category`);--> statement-breakpoint
CREATE TABLE `student_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` text NOT NULL,
	`domain` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`status` text DEFAULT 'recorded' NOT NULL,
	`happened_at` text NOT NULL,
	`follow_up_at` text,
	`owner_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_student_records_student_time` ON `student_records` (`student_id`,`happened_at`);--> statement-breakpoint
CREATE INDEX `idx_student_records_domain_status` ON `student_records` (`domain`,`status`);