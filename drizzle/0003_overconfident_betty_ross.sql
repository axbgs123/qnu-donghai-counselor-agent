CREATE TABLE `document_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_chunks_document_index` ON `document_chunks` (`document_id`,`chunk_index`);--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`extension` text NOT NULL,
	`storage_key` text,
	`document_type` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`summary` text NOT NULL,
	`extracted_text` text NOT NULL,
	`people_json` text DEFAULT '[]' NOT NULL,
	`student_nos_json` text DEFAULT '[]' NOT NULL,
	`dates_json` text DEFAULT '[]' NOT NULL,
	`tasks_json` text DEFAULT '[]' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`processing_method` text NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`review_status` text DEFAULT 'verified' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `import_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_documents_job_id_unique` ON `source_documents` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_source_documents_type_updated` ON `source_documents` (`document_type`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_source_documents_title` ON `source_documents` (`title`);
