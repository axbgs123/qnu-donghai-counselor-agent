CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`storage_key` text,
	`status` text DEFAULT 'analyzed' NOT NULL,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`sheet_count` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`committed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_import_jobs_created` ON `import_jobs` (`created_at`);--> statement-breakpoint
CREATE TABLE `import_records` (
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
	`review_status` text DEFAULT 'verified' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_job_id`) REFERENCES `import_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_import_records_type_key` ON `import_records` (`record_type`,`external_key`);--> statement-breakpoint
CREATE INDEX `idx_import_records_type_student` ON `import_records` (`record_type`,`student_no`);--> statement-breakpoint
CREATE INDEX `idx_import_records_student_name` ON `import_records` (`student_name`);--> statement-breakpoint
CREATE TABLE `import_staging_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`sheet_name` text NOT NULL,
	`row_number` integer NOT NULL,
	`raw_json` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `import_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_import_staging_job_sheet` ON `import_staging_rows` (`job_id`,`sheet_name`,`row_number`);