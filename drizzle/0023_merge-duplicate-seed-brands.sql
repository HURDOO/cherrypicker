-- Seeded brands without a name alias were rediscovered as official_<hash> copies
-- (src/lib/promotion-parsers.ts now maps every seed name to its seed ID). Merge the copies
-- found in the reviewed local catalog into the seed brand. IDs are official_<sha256(name)>,
-- so a database without them is left untouched.
WITH `merge`(`old_id`, `new_id`) AS (VALUES ('official_e6f8788a6767f6b2', 'aladin'), ('official_933878a563e25745', 'kyobo'), ('official_149ee0d555be8e34', 'mammoth'), ('official_18afbb464a7796b3', 'megabox'), ('official_2e050b39b22a7280', 'angelinus'))
UPDATE `benefit_rules` SET `included_brands` = (
    SELECT json_group_array(`v`) FROM (
        SELECT coalesce((SELECT `new_id` FROM `merge` WHERE `old_id` = `j`.`value`), `j`.`value`) AS `v`, min(`j`.`key`) AS `k`
        FROM json_each(`benefit_rules`.`included_brands`) AS `j` GROUP BY `v` ORDER BY `k`
    )
)
WHERE json_valid(`included_brands`) AND EXISTS (SELECT 1 FROM json_each(`benefit_rules`.`included_brands`) AS `j` JOIN `merge` ON `merge`.`old_id` = `j`.`value`);
--> statement-breakpoint
WITH `merge`(`old_id`, `new_id`) AS (VALUES ('official_e6f8788a6767f6b2', 'aladin'), ('official_933878a563e25745', 'kyobo'), ('official_149ee0d555be8e34', 'mammoth'), ('official_18afbb464a7796b3', 'megabox'), ('official_2e050b39b22a7280', 'angelinus'))
UPDATE `benefit_rules` SET `excluded_brands` = (
    SELECT json_group_array(`v`) FROM (
        SELECT coalesce((SELECT `new_id` FROM `merge` WHERE `old_id` = `j`.`value`), `j`.`value`) AS `v`, min(`j`.`key`) AS `k`
        FROM json_each(`benefit_rules`.`excluded_brands`) AS `j` GROUP BY `v` ORDER BY `k`
    )
)
WHERE json_valid(`excluded_brands`) AND EXISTS (SELECT 1 FROM json_each(`benefit_rules`.`excluded_brands`) AS `j` JOIN `merge` ON `merge`.`old_id` = `j`.`value`);
--> statement-breakpoint
WITH `merge`(`old_id`, `new_id`) AS (VALUES ('official_e6f8788a6767f6b2', 'aladin'), ('official_933878a563e25745', 'kyobo'), ('official_149ee0d555be8e34', 'mammoth'), ('official_18afbb464a7796b3', 'megabox'), ('official_2e050b39b22a7280', 'angelinus'))
UPDATE `promotion_offers` SET `brand_ids` = (
    SELECT json_group_array(`v`) FROM (
        SELECT coalesce((SELECT `new_id` FROM `merge` WHERE `old_id` = `j`.`value`), `j`.`value`) AS `v`, min(`j`.`key`) AS `k`
        FROM json_each(`promotion_offers`.`brand_ids`) AS `j` GROUP BY `v` ORDER BY `k`
    )
)
WHERE json_valid(`brand_ids`) AND EXISTS (SELECT 1 FROM json_each(`promotion_offers`.`brand_ids`) AS `j` JOIN `merge` ON `merge`.`old_id` = `j`.`value`);
--> statement-breakpoint
UPDATE `promotion_offers` SET `usage_group_id` = replace(replace(replace(replace(replace(`usage_group_id`, 'official_e6f8788a6767f6b2', 'aladin'), 'official_933878a563e25745', 'kyobo'), 'official_149ee0d555be8e34', 'mammoth'), 'official_18afbb464a7796b3', 'megabox'), 'official_2e050b39b22a7280', 'angelinus') WHERE `usage_group_id` LIKE '%official_e6f8788a6767f6b2%' OR `usage_group_id` LIKE '%official_933878a563e25745%' OR `usage_group_id` LIKE '%official_149ee0d555be8e34%' OR `usage_group_id` LIKE '%official_18afbb464a7796b3%' OR `usage_group_id` LIKE '%official_2e050b39b22a7280%';
--> statement-breakpoint
UPDATE `promotion_offers` SET `compatibility` = replace(replace(replace(replace(replace(`compatibility`, 'official_e6f8788a6767f6b2', 'aladin'), 'official_933878a563e25745', 'kyobo'), 'official_149ee0d555be8e34', 'mammoth'), 'official_18afbb464a7796b3', 'megabox'), 'official_2e050b39b22a7280', 'angelinus') WHERE `compatibility` LIKE '%official_e6f8788a6767f6b2%' OR `compatibility` LIKE '%official_933878a563e25745%' OR `compatibility` LIKE '%official_149ee0d555be8e34%' OR `compatibility` LIKE '%official_18afbb464a7796b3%' OR `compatibility` LIKE '%official_2e050b39b22a7280%';
--> statement-breakpoint
WITH `merge`(`old_id`, `new_id`) AS (VALUES ('official_e6f8788a6767f6b2', 'aladin'), ('official_933878a563e25745', 'kyobo'), ('official_149ee0d555be8e34', 'mammoth'), ('official_18afbb464a7796b3', 'megabox'), ('official_2e050b39b22a7280', 'angelinus'))
UPDATE `transaction_history` SET `brand_id` = (SELECT `new_id` FROM `merge` WHERE `old_id` = `transaction_history`.`brand_id`)
WHERE `brand_id` IN (SELECT `old_id` FROM `merge`);
--> statement-breakpoint
WITH `merge`(`old_id`, `new_id`) AS (VALUES ('official_e6f8788a6767f6b2', 'aladin'), ('official_933878a563e25745', 'kyobo'), ('official_149ee0d555be8e34', 'mammoth'), ('official_18afbb464a7796b3', 'megabox'), ('official_2e050b39b22a7280', 'angelinus'))
UPDATE `merchant_route_verifications` SET `brand_id` = (SELECT `new_id` FROM `merge` WHERE `old_id` = `merchant_route_verifications`.`brand_id`)
WHERE `brand_id` IN (SELECT `old_id` FROM `merge`);
--> statement-breakpoint
DELETE FROM `brands` WHERE `id` = 'official_e6f8788a6767f6b2' AND `user_id` IS NULL AND EXISTS (SELECT 1 FROM `brands` WHERE `id` = 'aladin'); -- 알라딘
--> statement-breakpoint
DELETE FROM `brands` WHERE `id` = 'official_933878a563e25745' AND `user_id` IS NULL AND EXISTS (SELECT 1 FROM `brands` WHERE `id` = 'kyobo'); -- 교보문고
--> statement-breakpoint
DELETE FROM `brands` WHERE `id` = 'official_149ee0d555be8e34' AND `user_id` IS NULL AND EXISTS (SELECT 1 FROM `brands` WHERE `id` = 'mammoth'); -- 매머드커피
--> statement-breakpoint
DELETE FROM `brands` WHERE `id` = 'official_18afbb464a7796b3' AND `user_id` IS NULL AND EXISTS (SELECT 1 FROM `brands` WHERE `id` = 'megabox'); -- 메가박스
--> statement-breakpoint
DELETE FROM `brands` WHERE `id` = 'official_2e050b39b22a7280' AND `user_id` IS NULL AND EXISTS (SELECT 1 FROM `brands` WHERE `id` = 'angelinus'); -- 엔제리너스
