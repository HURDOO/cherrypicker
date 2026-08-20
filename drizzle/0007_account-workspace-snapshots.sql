CREATE TABLE `account_workspace_snapshots` (
	`user_id` text PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`source_workspace_id` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`content_hash` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
