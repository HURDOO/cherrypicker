CREATE TABLE `__old_transaction_history` (
	`id` integer PRIMARY KEY,
	`user_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`card_id` text NOT NULL,
	`rule_id` text,
	`amount` integer NOT NULL,
	`discount_amount` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__old_transaction_history`(
	`id`,
	`user_id`,
	`brand_id`,
	`card_id`,
	`rule_id`,
	`amount`,
	`discount_amount`,
	`created_at`
)
SELECT
	`id`,
	`user_id`,
	`brand_id`,
	`card_id`,
	`rule_id`,
	`amount`,
	`discount_amount`,
	`created_at`
FROM `transaction_history`;
--> statement-breakpoint
DROP TABLE `transaction_history`;--> statement-breakpoint
CREATE TABLE `__new_benefit_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`user_id` text,
	`category` text,
	`included_brands` text NOT NULL,
	`excluded_brands` text NOT NULL,
	`platform_type` text DEFAULT 'ALL' NOT NULL,
	`shared_group_id` text,
	`uses_card_limit` integer DEFAULT true NOT NULL,
	`description` text NOT NULL,
	`detail` text NOT NULL,
	`condition` text NOT NULL,
	`action` text NOT NULL,
	`limit_config` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_benefit_rules`("id", "card_id", "user_id", "category", "included_brands", "excluded_brands", "platform_type", "shared_group_id", "uses_card_limit", "description", "detail", "condition", "action", "limit_config") SELECT "id", "card_id", "user_id", "category", "included_brands", "excluded_brands", "platform_type", "shared_group_id", "uses_card_limit", "description", "detail", "condition", "action", "limit_config" FROM `benefit_rules`;--> statement-breakpoint
DROP TABLE `benefit_rules`;--> statement-breakpoint
ALTER TABLE `__new_benefit_rules` RENAME TO `benefit_rules`;--> statement-breakpoint
CREATE INDEX `benefit_rules_card_id_idx` ON `benefit_rules` (`card_id`);--> statement-breakpoint
CREATE INDEX `benefit_rules_user_id_idx` ON `benefit_rules` (`user_id`);--> statement-breakpoint
CREATE INDEX `benefit_rules_category_idx` ON `benefit_rules` (`category`);--> statement-breakpoint
CREATE TABLE `__new_brands` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category_id` text NOT NULL,
	`icon_name` text,
	`user_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_brands`("id", "name", "category_id", "icon_name", "user_id", "sort_order") SELECT "id", "name", "category_id", "icon_name", "user_id", "sort_order" FROM `brands`;--> statement-breakpoint
DROP TABLE `brands`;--> statement-breakpoint
ALTER TABLE `__new_brands` RENAME TO `brands`;--> statement-breakpoint
CREATE INDEX `brands_category_id_idx` ON `brands` (`category_id`);--> statement-breakpoint
CREATE INDEX `brands_user_id_idx` ON `brands` (`user_id`);--> statement-breakpoint
CREATE INDEX `brands_sort_order_idx` ON `brands` (`category_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `__new_transaction_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`card_id` text NOT NULL,
	`rule_id` text,
	`amount` integer NOT NULL,
	`discount_amount` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `benefit_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_transaction_history`("id", "user_id", "brand_id", "card_id", "rule_id", "amount", "discount_amount", "created_at") SELECT "id", "user_id", "brand_id", "card_id", "rule_id", "amount", "discount_amount", "created_at" FROM `__old_transaction_history`;--> statement-breakpoint
ALTER TABLE `__new_transaction_history` RENAME TO `transaction_history`;--> statement-breakpoint
DROP TABLE `__old_transaction_history`;--> statement-breakpoint
CREATE INDEX `transaction_history_user_created_idx` ON `transaction_history` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `transaction_history_brand_id_idx` ON `transaction_history` (`brand_id`);--> statement-breakpoint
CREATE INDEX `transaction_history_card_id_idx` ON `transaction_history` (`card_id`);--> statement-breakpoint
CREATE INDEX `transaction_history_rule_id_idx` ON `transaction_history` (`rule_id`);
