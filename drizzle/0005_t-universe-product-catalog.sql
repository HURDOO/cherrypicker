CREATE TABLE `subscription_products` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`name` text NOT NULL,
	`aliases` text NOT NULL,
	`benefit_summary` text NOT NULL,
	`source_url` text NOT NULL,
	`source_key` text NOT NULL,
	`source_hash` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`collected_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `promotion_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_products_provider_source_key_unique` ON `subscription_products` (`provider_id`,`source_key`);--> statement-breakpoint
CREATE INDEX `subscription_products_provider_active_idx` ON `subscription_products` (`provider_id`,`is_active`);