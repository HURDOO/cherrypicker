CREATE TABLE `card_benefit_candidate_documents` (
	`candidate_id` text NOT NULL,
	`document_id` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`candidate_id`, `document_id`),
	FOREIGN KEY (`candidate_id`) REFERENCES `card_benefit_candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `card_benefit_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `card_benefit_candidate_documents_document_idx` ON `card_benefit_candidate_documents` (`document_id`);--> statement-breakpoint
DROP INDEX `card_benefit_candidates_document_extractor_unique`;--> statement-breakpoint
ALTER TABLE `card_benefit_candidates` ADD `source_bundle_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `card_benefit_candidates`
SET `source_bundle_hash` = COALESCE(
	(SELECT `content_hash` FROM `card_benefit_documents`
	 WHERE `card_benefit_documents`.`id` = `card_benefit_candidates`.`document_id`),
	`document_id`
);--> statement-breakpoint
CREATE UNIQUE INDEX `card_benefit_candidates_bundle_extractor_unique` ON `card_benefit_candidates` (`card_id`,`source_bundle_hash`,`extractor`,`schema_version`);
