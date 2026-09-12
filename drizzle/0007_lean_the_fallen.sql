CREATE TABLE `import_record_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`record_type` text NOT NULL,
	`external_key` text NOT NULL,
	`student_no` text,
	`student_name` text,
	`title` text,
	`class_name` text,
	`occurred_at` text,
	`payload_json` text NOT NULL,
	`source_job_id` text NOT NULL,
	`source_sheet` text NOT NULL,
	`source_row` integer NOT NULL,
	`review_status` text NOT NULL,
	`captured_by_job_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_import_versions_key` ON `import_record_versions` (`record_type`,`external_key`,`id`);--> statement-breakpoint
CREATE INDEX `idx_import_versions_jobs` ON `import_record_versions` (`source_job_id`,`captured_by_job_id`);--> statement-breakpoint
CREATE TABLE `student_archive_blocks` (
	`student_no` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `workflow_cases` ADD `subject` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_cases` ADD `owner_name` text DEFAULT '负责老师' NOT NULL;
