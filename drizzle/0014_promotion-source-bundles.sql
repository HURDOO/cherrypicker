CREATE TABLE `promotion_source_bundle_documents` (
	`bundle_id` text NOT NULL,
	`document_id` text NOT NULL,
	PRIMARY KEY(`bundle_id`, `document_id`),
	FOREIGN KEY (`bundle_id`) REFERENCES `promotion_source_bundles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `promotion_source_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `promotion_source_bundle_documents_document_idx` ON `promotion_source_bundle_documents` (`document_id`);--> statement-breakpoint
CREATE TABLE `promotion_source_bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_source_id` text NOT NULL,
	`source_bundle_hash` text NOT NULL,
	`collected_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_source_bundles_source_hash_unique` ON `promotion_source_bundles` (`collection_source_id`,`source_bundle_hash`);--> statement-breakpoint
CREATE TABLE `promotion_source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_source_id` text NOT NULL,
	`source_url` text NOT NULL,
	`media_type` text NOT NULL,
	`content_hash` text NOT NULL,
	`version` integer NOT NULL,
	`raw_content` text NOT NULL,
	`extracted_text` text NOT NULL,
	`response_metadata` text DEFAULT '{}' NOT NULL,
	`collected_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_source_documents_source_hash_unique` ON `promotion_source_documents` (`collection_source_id`,`source_url`,`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_source_documents_source_version_unique` ON `promotion_source_documents` (`collection_source_id`,`source_url`,`version`);--> statement-breakpoint
CREATE INDEX `promotion_source_documents_source_collected_idx` ON `promotion_source_documents` (`collection_source_id`,`collected_at`);--> statement-breakpoint
ALTER TABLE `promotion_candidates` ADD `source_bundle_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `promotion_candidates` ADD `audit` text;