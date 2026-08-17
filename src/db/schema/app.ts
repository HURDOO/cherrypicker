import { sql } from 'drizzle-orm';
import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type {
    BenefitCertainty,
    BenefitLayer,
    FundingType,
    LimitTableItem,
    LimitConfig,
    PlatformType,
    PromotionAction,
    PromotionChannel,
    PromotionCompatibility,
    PromotionCondition,
    PromotionProviderKind,
    PromotionStatus,
    RuleAction,
    RuleCondition,
    BenefitSubscription,
    TelecomMembership,
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

export const promotionProviders = sqliteTable('promotion_providers', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind').$type<PromotionProviderKind>().notNull(),
    sourceUrl: text('source_url'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
    index('promotion_providers_kind_idx').on(table.kind),
    index('promotion_providers_sort_order_idx').on(table.sortOrder),
]);

export const subscriptionProducts = sqliteTable('subscription_products', {
    id: text('id').primaryKey(),
    providerId: text('provider_id')
        .notNull()
        .references(() => promotionProviders.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull(),
    benefitSummary: text('benefit_summary').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceKey: text('source_key').notNull(),
    sourceHash: text('source_hash').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    collectedAt: integer('collected_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
}, (table) => [
    uniqueIndex('subscription_products_provider_source_key_unique').on(
        table.providerId,
        table.sourceKey,
    ),
    index('subscription_products_provider_active_idx').on(
        table.providerId,
        table.isActive,
    ),
]);

export const promotionOffers = sqliteTable('promotion_offers', {
    id: text('id').primaryKey(),
    providerId: text('provider_id')
        .notNull()
        .references(() => promotionProviders.id),
    layer: text('layer').$type<BenefitLayer>().notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    brandIds: text('brand_ids', { mode: 'json' }).$type<string[]>().notNull(),
    categoryIds: text('category_ids', { mode: 'json' }).$type<string[]>().notNull(),
    channels: text('channels', { mode: 'json' }).$type<PromotionChannel[]>().notNull(),
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }),
    endsAt: integer('ends_at', { mode: 'timestamp_ms' }),
    action: text('action', { mode: 'json' }).$type<PromotionAction>().notNull(),
    condition: text('condition', { mode: 'json' }).$type<PromotionCondition>().notNull(),
    compatibility: text('compatibility', { mode: 'json' })
        .$type<PromotionCompatibility>()
        .notNull(),
    limitConfig: text('limit_config', { mode: 'json' }).$type<LimitConfig>().notNull(),
    certainty: text('certainty').$type<BenefitCertainty>().notNull(),
    status: text('status').$type<PromotionStatus>().notNull().default('DRAFT'),
    sourceUrl: text('source_url').notNull(),
    sourceHash: text('source_hash'),
    collectedAt: integer('collected_at', { mode: 'timestamp_ms' }),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
}, (table) => [
    index('promotion_offers_provider_idx').on(table.providerId),
    index('promotion_offers_layer_status_idx').on(table.layer, table.status),
    index('promotion_offers_period_idx').on(table.startsAt, table.endsAt),
]);

export const promotionCandidates = sqliteTable('promotion_candidates', {
    id: text('id').primaryKey(),
    providerId: text('provider_id')
        .notNull()
        .references(() => promotionProviders.id),
    sourceUrl: text('source_url').notNull(),
    sourceHash: text('source_hash').notNull(),
    sourceTitle: text('source_title').notNull(),
    rawContent: text('raw_content').notNull(),
    parsedOffer: text('parsed_offer', { mode: 'json' })
        .$type<Record<string, unknown>>()
        .notNull(),
    diff: text('diff', { mode: 'json' })
        .$type<Record<string, unknown>>()
        .notNull(),
    status: text('status')
        .$type<'PENDING' | 'APPROVED' | 'REJECTED'>()
        .notNull()
        .default('PENDING'),
    linkedPromotionId: text('linked_promotion_id')
        .references(() => promotionOffers.id, { onDelete: 'set null' }),
    reviewerId: text('reviewer_id').references(() => user.id, { onDelete: 'set null' }),
    discoveredAt: integer('discovered_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
}, (table) => [
    uniqueIndex('promotion_candidates_source_hash_unique').on(
        table.providerId,
        table.sourceUrl,
        table.sourceHash
    ),
    index('promotion_candidates_status_idx').on(table.status, table.discoveredAt),
]);

export const userBenefitProfiles = sqliteTable('user_benefit_profiles', {
    userId: text('user_id')
        .primaryKey()
        .references(() => user.id, { onDelete: 'cascade' }),
    telecomMemberships: text('telecom_memberships', { mode: 'json' })
        .$type<TelecomMembership[]>()
        .notNull(),
    subscriptions: text('subscriptions', { mode: 'json' })
        .$type<BenefitSubscription[]>()
        .notNull()
        .default(sql`'[]'`),
    enabledPayProviderIds: text('enabled_pay_provider_ids', { mode: 'json' })
        .$type<string[]>()
        .notNull(),
    moneyEnabled: integer('money_enabled', { mode: 'boolean' }).notNull().default(true),
    pointsEnabled: integer('points_enabled', { mode: 'boolean' }).notNull().default(true),
    pointValue: integer('point_value').notNull().default(1),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
});

export const merchantRouteVerifications = sqliteTable('merchant_route_verifications', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    brandId: text('brand_id').notNull().references(() => brands.id),
    payProviderId: text('pay_provider_id').references(() => promotionProviders.id),
    cardCompany: text('card_company'),
    channel: text('channel').$type<PromotionChannel>().notNull(),
    cardBenefitEligible: integer('card_benefit_eligible', { mode: 'boolean' }).notNull(),
    certainty: text('certainty').$type<BenefitCertainty>().notNull(),
    evidenceUrl: text('evidence_url').notNull(),
    verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
    index('merchant_route_verifications_lookup_idx').on(
        table.brandId,
        table.payProviderId,
        table.cardCompany,
        table.channel
    ),
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
    cardId: text('card_id').references(() => cards.id),
    ruleId: text('rule_id').references(() => benefitRules.id, { onDelete: 'set null' }),
    amount: integer('amount').notNull(),
    discountAmount: integer('discount_amount').notNull(),
    eligibleItemAmount: integer('eligible_item_amount'),
    payProviderId: text('pay_provider_id').references(() => promotionProviders.id),
    fundingType: text('funding_type').$type<FundingType>().notNull().default('CARD'),
    combinationId: text('combination_id'),
    confirmedValue: integer('confirmed_value').notNull().default(0),
    conditionalValue: integer('conditional_value').notNull().default(0),
    estimatedValue: integer('estimated_value').notNull().default(0),
    payableAmount: integer('payable_amount').notNull().default(0),
    laterReward: integer('later_reward').notNull().default(0),
    combinationSnapshot: text('combination_snapshot', { mode: 'json' })
        .$type<Record<string, unknown>>()
        .notNull()
        .default({}),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
}, (table) => [
    index('transaction_history_user_created_idx').on(table.userId, table.createdAt),
    index('transaction_history_brand_id_idx').on(table.brandId),
    index('transaction_history_card_id_idx').on(table.cardId),
    index('transaction_history_rule_id_idx').on(table.ruleId),
]);

export const transactionBenefits = sqliteTable('transaction_benefits', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    transactionId: integer('transaction_id')
        .notNull()
        .references(() => transactionHistory.id, { onDelete: 'cascade' }),
    promotionId: text('promotion_id').references(() => promotionOffers.id, {
        onDelete: 'set null',
    }),
    ruleId: text('rule_id').references(() => benefitRules.id, { onDelete: 'set null' }),
    layer: text('layer').$type<BenefitLayer>().notNull(),
    title: text('title').notNull(),
    certainty: text('certainty').$type<BenefitCertainty>().notNull(),
    benefitAmount: integer('benefit_amount').notNull(),
    isImmediate: integer('is_immediate', { mode: 'boolean' }).notNull(),
    snapshot: text('snapshot', { mode: 'json' })
        .$type<Record<string, unknown>>()
        .notNull(),
}, (table) => [
    index('transaction_benefits_transaction_idx').on(table.transactionId),
    index('transaction_benefits_promotion_idx').on(table.promotionId),
]);
