DROP INDEX `card_benefit_candidates_bundle_extractor_unique`;--> statement-breakpoint
ALTER TABLE `card_benefit_candidates` ADD `base_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `card_benefit_candidates` ADD `audit` text;--> statement-breakpoint
CREATE UNIQUE INDEX `card_benefit_candidates_bundle_extractor_unique` ON `card_benefit_candidates` (`card_id`,`source_bundle_hash`,`extractor`,`schema_version`,`base_revision`);