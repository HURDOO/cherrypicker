CREATE TABLE `account_workspace_operations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`device_id` text NOT NULL,
	`base_revision` integer NOT NULL,
	`applied_revision` integer NOT NULL,
	`stale_base_revision` integer DEFAULT false NOT NULL,
	`request_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_workspace_operations_user_operation_unique` ON `account_workspace_operations` (`user_id`,`operation_id`);--> statement-breakpoint
CREATE INDEX `account_workspace_operations_user_revision_idx` ON `account_workspace_operations` (`user_id`,`applied_revision`);