CREATE TABLE `promotion_collection_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`source_count` integer NOT NULL,
	`successful_source_count` integer NOT NULL,
	`failed_source_count` integer NOT NULL,
	`skipped_source_count` integer NOT NULL,
	`discovered_count` integer NOT NULL,
	`published_count` integer NOT NULL,
	`review_required_count` integer NOT NULL,
	`unchanged_count` integer NOT NULL,
	`expired_count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `promotion_collection_runs_finished_idx` ON `promotion_collection_runs` (`finished_at`);--> statement-breakpoint
CREATE INDEX `promotion_collection_runs_status_finished_idx` ON `promotion_collection_runs` (`status`,`finished_at`);