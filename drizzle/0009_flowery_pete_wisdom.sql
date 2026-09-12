ALTER TABLE `import_jobs` ADD `owner_teacher_id` text;--> statement-breakpoint
CREATE INDEX `idx_import_jobs_owner_created` ON `import_jobs` (`owner_teacher_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `source_documents` ADD `owner_teacher_id` text;--> statement-breakpoint
ALTER TABLE `source_documents` ADD `visibility` text DEFAULT 'teacher_private' NOT NULL;--> statement-breakpoint
ALTER TABLE `source_documents` ADD `visibility_reason` text;--> statement-breakpoint
CREATE INDEX `idx_source_documents_access` ON `source_documents` (`visibility`,`owner_teacher_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `student_requests` ADD `teacher_id` text;--> statement-breakpoint
CREATE INDEX `idx_student_requests_teacher_status` ON `student_requests` (`teacher_id`,`status`,`created_at`);--> statement-breakpoint
UPDATE `student_requests` SET `teacher_id` = (SELECT `teacher_id` FROM `app_accounts` WHERE `role` = 'student' AND `student_no` = `student_requests`.`student_no` LIMIT 1) WHERE `teacher_id` IS NULL;--> statement-breakpoint
UPDATE `import_jobs` SET `owner_teacher_id` = (SELECT `id` FROM `app_accounts` WHERE `role` = 'teacher' ORDER BY `created_at` LIMIT 1) WHERE `owner_teacher_id` IS NULL;--> statement-breakpoint
UPDATE `source_documents` SET `owner_teacher_id` = (SELECT `owner_teacher_id` FROM `import_jobs` WHERE `id` = `source_documents`.`job_id`) WHERE `owner_teacher_id` IS NULL;
