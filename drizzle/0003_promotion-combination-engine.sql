CREATE TABLE `merchant_route_verifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brand_id` text NOT NULL,
	`pay_provider_id` text,
	`card_company` text,
	`channel` text NOT NULL,
	`card_benefit_eligible` integer NOT NULL,
	`certainty` text NOT NULL,
	`evidence_url` text NOT NULL,
	`verified_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pay_provider_id`) REFERENCES `promotion_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merchant_route_verifications_lookup_idx` ON `merchant_route_verifications` (`brand_id`,`pay_provider_id`,`card_company`,`channel`);--> statement-breakpoint
CREATE TABLE `promotion_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`source_url` text NOT NULL,
	`source_hash` text NOT NULL,
	`source_title` text NOT NULL,
	`raw_content` text NOT NULL,
	`parsed_offer` text NOT NULL,
	`diff` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`linked_promotion_id` text,
	`reviewer_id` text,
	`discovered_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`provider_id`) REFERENCES `promotion_providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_promotion_id`) REFERENCES `promotion_offers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_candidates_source_hash_unique` ON `promotion_candidates` (`provider_id`,`source_url`,`source_hash`);--> statement-breakpoint
CREATE INDEX `promotion_candidates_status_idx` ON `promotion_candidates` (`status`,`discovered_at`);--> statement-breakpoint
CREATE TABLE `promotion_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`layer` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`brand_ids` text NOT NULL,
	`category_ids` text NOT NULL,
	`channels` text NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`action` text NOT NULL,
	`condition` text NOT NULL,
	`compatibility` text NOT NULL,
	`limit_config` text NOT NULL,
	`certainty` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`source_url` text NOT NULL,
	`source_hash` text,
	`collected_at` integer,
	`reviewed_at` integer,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `promotion_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `promotion_offers_provider_idx` ON `promotion_offers` (`provider_id`);--> statement-breakpoint
CREATE INDEX `promotion_offers_layer_status_idx` ON `promotion_offers` (`layer`,`status`);--> statement-breakpoint
CREATE INDEX `promotion_offers_period_idx` ON `promotion_offers` (`starts_at`,`ends_at`);--> statement-breakpoint
CREATE TABLE `promotion_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`source_url` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `promotion_providers_kind_idx` ON `promotion_providers` (`kind`);--> statement-breakpoint
CREATE INDEX `promotion_providers_sort_order_idx` ON `promotion_providers` (`sort_order`);--> statement-breakpoint
CREATE TABLE `transaction_benefits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`promotion_id` text,
	`rule_id` text,
	`layer` text NOT NULL,
	`title` text NOT NULL,
	`certainty` text NOT NULL,
	`benefit_amount` integer NOT NULL,
	`is_immediate` integer NOT NULL,
	`snapshot` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transaction_history`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`promotion_id`) REFERENCES `promotion_offers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rule_id`) REFERENCES `benefit_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `transaction_benefits_transaction_idx` ON `transaction_benefits` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `transaction_benefits_promotion_idx` ON `transaction_benefits` (`promotion_id`);--> statement-breakpoint
CREATE TABLE `user_benefit_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`telecom_memberships` text NOT NULL,
	`enabled_pay_provider_ids` text NOT NULL,
	`money_enabled` integer DEFAULT true NOT NULL,
	`points_enabled` integer DEFAULT true NOT NULL,
	`point_value` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transaction_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`card_id` text,
	`rule_id` text,
	`amount` integer NOT NULL,
	`discount_amount` integer NOT NULL,
	`eligible_item_amount` integer,
	`pay_provider_id` text,
	`funding_type` text DEFAULT 'CARD' NOT NULL,
	`combination_id` text,
	`confirmed_value` integer DEFAULT 0 NOT NULL,
	`conditional_value` integer DEFAULT 0 NOT NULL,
	`estimated_value` integer DEFAULT 0 NOT NULL,
	`payable_amount` integer DEFAULT 0 NOT NULL,
	`later_reward` integer DEFAULT 0 NOT NULL,
	`combination_snapshot` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `benefit_rules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pay_provider_id`) REFERENCES `promotion_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_transaction_history`(
	"id",
	"user_id",
	"brand_id",
	"card_id",
	"rule_id",
	"amount",
	"discount_amount",
	"eligible_item_amount",
	"pay_provider_id",
	"funding_type",
	"combination_id",
	"confirmed_value",
	"conditional_value",
	"estimated_value",
	"payable_amount",
	"later_reward",
	"combination_snapshot",
	"created_at"
) SELECT
	"id",
	"user_id",
	"brand_id",
	"card_id",
	"rule_id",
	"amount",
	"discount_amount",
	NULL,
	NULL,
	'CARD',
	NULL,
	"discount_amount",
	0,
	0,
	MAX(0, "amount" - "discount_amount"),
	0,
	'{}',
	"created_at"
FROM `transaction_history`;--> statement-breakpoint
DROP TABLE `transaction_history`;--> statement-breakpoint
ALTER TABLE `__new_transaction_history` RENAME TO `transaction_history`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transaction_history_user_created_idx` ON `transaction_history` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `transaction_history_brand_id_idx` ON `transaction_history` (`brand_id`);--> statement-breakpoint
CREATE INDEX `transaction_history_card_id_idx` ON `transaction_history` (`card_id`);--> statement-breakpoint
CREATE INDEX `transaction_history_rule_id_idx` ON `transaction_history` (`rule_id`);
