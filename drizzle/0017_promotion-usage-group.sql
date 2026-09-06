ALTER TABLE `promotion_offers` ADD `usage_group_id` text;--> statement-breakpoint
CREATE INDEX `promotion_offers_usage_group_idx` ON `promotion_offers` (`usage_group_id`);