CREATE TABLE `student_daily_usage` (
	`student_no` text NOT NULL,
	`usage_date` text NOT NULL,
	`turn_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`student_no`, `usage_date`),
	FOREIGN KEY (`student_no`) REFERENCES `pilot_students`(`student_no`) ON UPDATE no action ON DELETE no action
);
