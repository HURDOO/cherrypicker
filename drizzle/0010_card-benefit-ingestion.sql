CREATE TABLE `card_benefit_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`card_id` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`extractor` text NOT NULL,
	`model` text,
	`confidence` real NOT NULL,
	`extraction` text NOT NULL,
	`validation_errors` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`reviewer_id` text,
	`reviewed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `card_benefit_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_benefit_candidates_document_extractor_unique` ON `card_benefit_candidates` (`document_id`,`extractor`,`schema_version`);--> statement-breakpoint
CREATE INDEX `card_benefit_candidates_status_created_idx` ON `card_benefit_candidates` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `card_benefit_candidates_card_created_idx` ON `card_benefit_candidates` (`card_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `card_benefit_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`source_url` text NOT NULL,
	`source_kind` text NOT NULL,
	`media_type` text NOT NULL,
	`content_hash` text NOT NULL,
	`version` integer NOT NULL,
	`raw_content` text NOT NULL,
	`extracted_text` text NOT NULL,
	`response_metadata` text DEFAULT '{}' NOT NULL,
	`collected_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_benefit_documents_source_hash_unique` ON `card_benefit_documents` (`card_id`,`source_url`,`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_benefit_documents_source_version_unique` ON `card_benefit_documents` (`card_id`,`source_url`,`version`);--> statement-breakpoint
CREATE INDEX `card_benefit_documents_card_collected_idx` ON `card_benefit_documents` (`card_id`,`collected_at`);--> statement-breakpoint
CREATE TABLE `card_benefit_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`revision` integer NOT NULL,
	`candidate_id` text,
	`document_id` text,
	`snapshot` text NOT NULL,
	`rollback_of_revision` integer,
	`is_active` integer DEFAULT false NOT NULL,
	`reviewer_id` text,
	`published_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `card_benefit_candidates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`document_id`) REFERENCES `card_benefit_documents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_benefit_revisions_card_revision_unique` ON `card_benefit_revisions` (`card_id`,`revision`);--> statement-breakpoint
CREATE INDEX `card_benefit_revisions_card_active_idx` ON `card_benefit_revisions` (`card_id`,`is_active`);