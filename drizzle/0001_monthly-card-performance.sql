CREATE TABLE `__new_user_card_performances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`card_id` text NOT NULL,
	`performance_month` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_card_performances` (
	`id`,
	`user_id`,
	`card_id`,
	`performance_month`,
	`amount`,
	`updated_at`
)
SELECT
	`id`,
	`user_id`,
	`card_id`,
	strftime(
		'%Y-%m',
		`updated_at` / 1000,
		'unixepoch',
		'+9 hours',
		'start of month',
		'-1 month'
	),
	`amount`,
	`updated_at`
FROM `user_card_performances`;
--> statement-breakpoint
DROP TABLE `user_card_performances`;
--> statement-breakpoint
ALTER TABLE `__new_user_card_performances` RENAME TO `user_card_performances`;
--> statement-breakpoint
CREATE UNIQUE INDEX `user_card_performances_user_card_month_unique` ON `user_card_performances` (`user_id`,`card_id`,`performance_month`);
--> statement-breakpoint
CREATE INDEX `user_card_performances_card_id_idx` ON `user_card_performances` (`card_id`);
