CREATE TABLE `card_benefit_collection_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`trigger` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`max_ai_cards` integer NOT NULL,
	`target_count` integer NOT NULL,
	`created_count` integer NOT NULL,
	`unchanged_count` integer NOT NULL,
	`deferred_count` integer NOT NULL,
	`failed_count` integer NOT NULL,
	`cache_hit_count` integer NOT NULL,
	`ai_extraction_count` integer NOT NULL,
	`validation_error_count` integer NOT NULL,
	`source_failure_count` integer NOT NULL,
	`items` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `card_benefit_collection_runs_finished_idx` ON `card_benefit_collection_runs` (`finished_at`);--> statement-breakpoint
CREATE INDEX `card_benefit_collection_runs_status_finished_idx` ON `card_benefit_collection_runs` (`status`,`finished_at`);