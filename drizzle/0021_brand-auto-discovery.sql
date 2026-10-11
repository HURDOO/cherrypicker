-- Brands created from promotions and card proposals resolve their browse visibility from
-- current benefits instead of a fixed flag (docs/benefit-coverage-policy.md §5).
UPDATE `brands` SET `discovery_visibility` = 'AUTO'
WHERE `user_id` IS NULL AND `id` LIKE 'official\_%' ESCAPE '\';
--> statement-breakpoint
-- Category corrections for discovered brands misfiled by the old name+hint inference.
-- IDs are official_<sha256(name)>, so absent brands are left untouched.
UPDATE `brands` SET `category_id` = 'shopping', `icon_name` = 'ShoppingBag' WHERE `id` = 'official_3fc445a536e3883d' AND `user_id` IS NULL; -- 롯데하이마트
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'shopping', `icon_name` = 'ShoppingBag' WHERE `id` = 'official_2f7252a65f7a09e5' AND `user_id` IS NULL; -- 롯데면세점
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'shopping', `icon_name` = 'ShoppingBag' WHERE `id` = 'official_5dc9340cf4657d5a' AND `user_id` IS NULL; -- 신라면세점
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'shopping', `icon_name` = 'ShoppingBag' WHERE `id` = 'official_eb61ca0600217f7f' AND `user_id` IS NULL; -- 신세계면세점
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'shopping', `icon_name` = 'ShoppingBag' WHERE `id` = 'official_c4e914d04b0a9ede' AND `user_id` IS NULL; -- 전자랜드
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'shopping', `icon_name` = 'ShoppingBag' WHERE `id` = 'official_e9d690c2b82ffb68' AND `user_id` IS NULL; -- 이랜드몰
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'shopping', `icon_name` = 'ShoppingBag' WHERE `id` = 'official_4a1a1ffae9e24bb2' AND `user_id` IS NULL; -- 케이팝머치
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'shopping', `icon_name` = 'ShoppingBag' WHERE `id` = 'official_b6d23c1da3667685' AND `user_id` IS NULL; -- 오피스디포
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'shopping', `icon_name` = 'ShoppingBag' WHERE `id` = 'official_7baef7a778822545' AND `user_id` IS NULL; -- LG전자
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'subscription', `icon_name` = 'Tv' WHERE `id` = 'official_41f0981651019263' AND `user_id` IS NULL; -- IPTV
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'convenience', `icon_name` = 'Store' WHERE `id` = 'official_721c9dc57004b418' AND `user_id` IS NULL; -- GS THE FRESH
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'food', `icon_name` = 'Utensils' WHERE `id` = 'official_3990bfc5b70cb670' AND `user_id` IS NULL; -- 매드포갈릭
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'food', `icon_name` = 'Utensils' WHERE `id` = 'official_def4dfec91a13524' AND `user_id` IS NULL; -- 크리스피프레시
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'food', `icon_name` = 'Utensils' WHERE `id` = 'official_5c3b5a7ae7d28f5a' AND `user_id` IS NULL; -- 컬리너리스퀘어
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'transport', `icon_name` = 'Car' WHERE `id` = 'official_590a0ae1543df11c' AND `user_id` IS NULL; -- SK에너지
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'transport', `icon_name` = 'Car' WHERE `id` = 'official_99d3fd0fa8fe115e' AND `user_id` IS NULL; -- KT
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'transport', `icon_name` = 'Car' WHERE `id` = 'official_9bbb35da2138970c' AND `user_id` IS NULL; -- SK텔레콤
--> statement-breakpoint
UPDATE `brands` SET `category_id` = 'transport', `icon_name` = 'Car' WHERE `id` = 'official_d71b1267c9f85819' AND `user_id` IS NULL; -- 네이버 멤버십 x GS칼텍스
