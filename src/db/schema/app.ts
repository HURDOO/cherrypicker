import { sql } from 'drizzle-orm';
import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type {
    LimitTableItem,
    LimitConfig,
    PlatformType,
    RuleAction,
    RuleCondition,
} from '@/types';
import { user } from './auth';

const nowInMilliseconds = sql`(unixepoch() * 1000)`;

export const categories = sqliteTable('categories', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
    index('categories_user_id_idx').on(table.userId),
    index('categories_sort_order_idx').on(table.sortOrder),
]);

export const brands = sqliteTable('brands', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    categoryId: text('category_id')
        .notNull()
        .references(() => categories.id),
    iconName: text('icon_name'),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
    index('brands_category_id_idx').on(table.categoryId),
    index('brands_user_id_idx').on(table.userId),
    index('brands_sort_order_idx').on(table.categoryId, table.sortOrder),
]);

export const cards = sqliteTable('cards', {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    company: text('company').notNull(),
    color: text('color').notNull(),
    limitTable: text('limit_table', { mode: 'json' })
        .$type<LimitTableItem[]>()
        .notNull(),
}, (table) => [
    index('cards_user_id_idx').on(table.userId),
]);

export const benefitRules = sqliteTable('benefit_rules', {
    id: text('id').primaryKey(),
    cardId: text('card_id')
        .notNull()
        .references(() => cards.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    category: text('category').references(() => categories.id),
    includedBrands: text('included_brands', { mode: 'json' })
        .$type<string[]>()
        .notNull(),
    excludedBrands: text('excluded_brands', { mode: 'json' })
        .$type<string[]>()
        .notNull(),
    platformType: text('platform_type').$type<PlatformType>().notNull().default('ALL'),
    sharedGroupId: text('shared_group_id'),
    usesCardLimit: integer('uses_card_limit', { mode: 'boolean' }).notNull().default(true),
    description: text('description').notNull(),
    detail: text('detail').notNull(),
    condition: text('condition', { mode: 'json' }).$type<RuleCondition>().notNull(),
    action: text('action', { mode: 'json' }).$type<RuleAction>().notNull(),
    limitConfig: text('limit_config', { mode: 'json' }).$type<LimitConfig>().notNull(),
}, (table) => [
    index('benefit_rules_card_id_idx').on(table.cardId),
    index('benefit_rules_user_id_idx').on(table.userId),
    index('benefit_rules_category_idx').on(table.category),
]);

export const userCardPerformances = sqliteTable('user_card_performances', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    cardId: text('card_id')
        .notNull()
        .references(() => cards.id, { onDelete: 'cascade' }),
    performanceMonth: text('performance_month').notNull(),
    amount: integer('amount').notNull().default(0),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
}, (table) => [
    uniqueIndex('user_card_performances_user_card_month_unique').on(
        table.userId,
        table.cardId,
        table.performanceMonth
    ),
    index('user_card_performances_card_id_idx').on(table.cardId),
]);

export const transactionHistory = sqliteTable('transaction_history', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    brandId: text('brand_id')
        .notNull()
        .references(() => brands.id),
    cardId: text('card_id')
        .notNull()
        .references(() => cards.id),
    ruleId: text('rule_id').references(() => benefitRules.id, { onDelete: 'set null' }),
    amount: integer('amount').notNull(),
    discountAmount: integer('discount_amount').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
}, (table) => [
    index('transaction_history_user_created_idx').on(table.userId, table.createdAt),
    index('transaction_history_brand_id_idx').on(table.brandId),
    index('transaction_history_card_id_idx').on(table.cardId),
    index('transaction_history_rule_id_idx').on(table.ruleId),
]);
