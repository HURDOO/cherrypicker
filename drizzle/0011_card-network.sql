ALTER TABLE `cards` ADD `network` text;--> statement-breakpoint
UPDATE `cards` SET `network` = 'MASTERCARD' WHERE `id` = 'shinhan_sol';
