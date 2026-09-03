CREATE TABLE `card_benefit_source_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`label` text NOT NULL,
	`source_url` text NOT NULL,
	`source_kind` text NOT NULL,
	`format` text NOT NULL,
	`allowed_hosts` text NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`candidate_role` text DEFAULT 'SUPPORTING' NOT NULL,
	`discover_linked_pdfs` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_benefit_source_configs_card_url_unique` ON `card_benefit_source_configs` (`card_id`,`source_url`);--> statement-breakpoint
CREATE INDEX `card_benefit_source_configs_card_active_idx` ON `card_benefit_source_configs` (`card_id`,`is_active`,`sort_order`);--> statement-breakpoint
ALTER TABLE `cards` ADD `catalog_status` text DEFAULT 'PUBLISHED' NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `issue_status` text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `issuer_product_code` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `catalog_caveat` text;--> statement-breakpoint
CREATE INDEX `cards_catalog_status_idx` ON `cards` (`catalog_status`);