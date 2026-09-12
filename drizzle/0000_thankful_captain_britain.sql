CREATE TABLE `knowledge_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`source_url` text,
	`version` text DEFAULT 'V1.0' NOT NULL,
	`effective_at` text,
	`expires_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_category_status` ON `knowledge_documents` (`category`,`status`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`student_no` text NOT NULL,
	`name` text NOT NULL,
	`department` text NOT NULL,
	`grade` text NOT NULL,
	`class_name` text NOT NULL,
	`community` text NOT NULL,
	`building` text NOT NULL,
	`room` text NOT NULL,
	`phone` text,
	`status` text DEFAULT 'normal' NOT NULL,
	`counselor_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`counselor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_student_no_unique` ON `students` (`student_no`);--> statement-breakpoint
CREATE INDEX `idx_students_counselor_status` ON `students` (`counselor_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_students_building_room` ON `students` (`building`,`room`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text,
	`title` text NOT NULL,
	`module` text NOT NULL,
	`due_at` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`subject_type` text,
	`subject_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_owner_status_due` ON `tasks` (`owner_id`,`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'counselor' NOT NULL,
	`department` text DEFAULT '文学与传播学院' NOT NULL,
	`campus` text DEFAULT '东海校区' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workflow_cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`student_id` text,
	`stage` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`owner_id` text,
	`payload` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cases_type_status` ON `workflow_cases` (`type`,`status`);--> statement-breakpoint
CREATE INDEX `idx_cases_student` ON `workflow_cases` (`student_id`);