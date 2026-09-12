CREATE TABLE `teacher_classes` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`name` text NOT NULL,
	`grade` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_teacher_classes_teacher_name` ON `teacher_classes` (`teacher_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_teacher_classes_teacher` ON `teacher_classes` (`teacher_id`,`name`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workflow_cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`student_id` text,
	`subject` text DEFAULT '' NOT NULL,
	`stage` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`owner_id` text,
	`owner_name` text DEFAULT '负责老师' NOT NULL,
	`payload` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_workflow_cases`("id", "type", "title", "student_id", "subject", "stage", "status", "owner_id", "owner_name", "payload", "created_at", "updated_at") SELECT "id", "type", "title", "student_id", "subject", "stage", "status", "owner_id", "owner_name", "payload", "created_at", "updated_at" FROM `workflow_cases`;--> statement-breakpoint
DROP TABLE `workflow_cases`;--> statement-breakpoint
ALTER TABLE `__new_workflow_cases` RENAME TO `workflow_cases`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_cases_type_status` ON `workflow_cases` (`type`,`status`);--> statement-breakpoint
CREATE INDEX `idx_cases_student` ON `workflow_cases` (`student_id`);