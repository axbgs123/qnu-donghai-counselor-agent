CREATE TABLE `ai_provider_settings` (
	`provider` text PRIMARY KEY NOT NULL,
	`api_key` text DEFAULT '' NOT NULL,
	`model` text NOT NULL,
	`base_url` text NOT NULL,
	`is_active` integer DEFAULT 0 NOT NULL,
	`last_test_status` text,
	`last_test_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
