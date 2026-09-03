import { sql } from 'drizzle-orm';
import {
    index,
    integer,
    primaryKey,
    real,
    sqliteTable,
    text,
    uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type {
    BenefitCertainty,
    BenefitLayer,
    CardNetwork,
    FundingType,
    LimitTableItem,
    LimitConfig,
    PlatformType,
    PromotionAction,
    PromotionChannel,
    PromotionCompatibility,
    PromotionCandidateAudit,
    PromotionCondition,
    PromotionProviderKind,
    PromotionCollectionRunStatus,
    PromotionStatus,
    PromotionSourceDocumentMetadata,
    RuleAction,
    RuleCondition,
    BenefitSubscription,
    CardBenefitCandidateAudit,
    CardBenefitCandidateStatus,
    CardBenefitBatchItem,
    CardBenefitCollectionRunStatus,
    CardBenefitCollectionTrigger,
    CardBenefitDocumentMetadata,
    CardBenefitExtraction,
    CardBenefitRevisionSnapshot,
    CardBenefitSourceKind,
    CardBenefitSourceRole,
    SystemCardCatalogStatus,
    SystemCardIssueStatus,
    TelecomMembership,
} from '@/types';
import type { AccountWorkspaceExport } from '@/lib/account-workspace-export';
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
    network: text('network').$type<CardNetwork>(),
    catalogStatus: text('catalog_status')
        .$type<SystemCardCatalogStatus>()
        .notNull()
        .default('PUBLISHED'),
    issueStatus: text('issue_status')
        .$type<SystemCardIssueStatus>()
        .notNull()
        .default('ACTIVE'),
    issuerProductCode: text('issuer_product_code'),
    catalogCaveat: text('catalog_caveat'),
}, (table) => [
    index('cards_user_id_idx').on(table.userId),
    index('cards_catalog_status_idx').on(table.catalogStatus),
]);

export const cardBenefitSourceConfigs = sqliteTable('card_benefit_source_configs', {
    id: text('id').primaryKey(),
    cardId: text('card_id')
        .notNull()
        .references(() => cards.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceKind: text('source_kind').$type<CardBenefitSourceKind>().notNull(),
    format: text('format').$type<'html' | 'pdf'>().notNull(),
    allowedHosts: text('allowed_hosts', { mode: 'json' }).$type<string[]>().notNull(),
    required: integer('required', { mode: 'boolean' }).notNull().default(false),
    candidateRole: text('candidate_role')
        .$type<CardBenefitSourceRole>()
        .notNull()
        .default('SUPPORTING'),
    discoverLinkedPdfs: integer('discover_linked_pdfs', { mode: 'boolean' })
        .notNull()
        .default(false),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
}, (table) => [
    uniqueIndex('card_benefit_source_configs_card_url_unique').on(
        table.cardId,
        table.sourceUrl,
    ),
    index('card_benefit_source_configs_card_active_idx').on(
        table.cardId,
        table.isActive,
        table.sortOrder,
    ),
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

export const cardBenefitDocuments = sqliteTable('card_benefit_documents', {
    id: text('id').primaryKey(),
    cardId: text('card_id')
        .notNull()
        .references(() => cards.id, { onDelete: 'cascade' }),
    sourceUrl: text('source_url').notNull(),
    sourceKind: text('source_kind').$type<CardBenefitSourceKind>().notNull(),
    mediaType: text('media_type').notNull(),
    contentHash: text('content_hash').notNull(),
    version: integer('version').notNull(),
    rawContent: text('raw_content').notNull(),
    extractedText: text('extracted_text').notNull(),
    responseMetadata: text('response_metadata', { mode: 'json' })
        .$type<CardBenefitDocumentMetadata>()
        .notNull()
        .default({}),
    collectedAt: integer('collected_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
}, (table) => [
    uniqueIndex('card_benefit_documents_source_hash_unique').on(
        table.cardId,
        table.sourceUrl,
        table.contentHash,
    ),
    uniqueIndex('card_benefit_documents_source_version_unique').on(
        table.cardId,
        table.sourceUrl,
        table.version,
    ),
    index('card_benefit_documents_card_collected_idx').on(
        table.cardId,
        table.collectedAt,
    ),
]);

export const cardBenefitCandidates = sqliteTable('card_benefit_candidates', {
    id: text('id').primaryKey(),
    documentId: text('document_id')
        .notNull()
        .references(() => cardBenefitDocuments.id, { onDelete: 'cascade' }),
    cardId: text('card_id')
        .notNull()
        .references(() => cards.id, { onDelete: 'cascade' }),
    schemaVersion: integer('schema_version').notNull().default(1),
    baseRevision: integer('base_revision').notNull().default(0),
    sourceBundleHash: text('source_bundle_hash').notNull().default(''),
    extractor: text('extractor').notNull(),
    model: text('model'),
    confidence: real('confidence').notNull(),
    extraction: text('extraction', { mode: 'json' })
        .$type<CardBenefitExtraction>()
        .notNull(),
    audit: text('audit', { mode: 'json' }).$type<CardBenefitCandidateAudit>(),
    validationErrors: text('validation_errors', { mode: 'json' })
        .$type<string[]>()
        .notNull(),
    status: text('status')
        .$type<CardBenefitCandidateStatus>()
        .notNull()
        .default('PENDING'),
    reviewerId: text('reviewer_id').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
}, (table) => [
    uniqueIndex('card_benefit_candidates_bundle_extractor_unique').on(
        table.cardId,
        table.sourceBundleHash,
        table.extractor,
        table.schemaVersion,
        table.baseRevision,
    ),
    index('card_benefit_candidates_status_created_idx').on(table.status, table.createdAt),
    index('card_benefit_candidates_card_created_idx').on(table.cardId, table.createdAt),
]);

export const cardBenefitCandidateDocuments = sqliteTable('card_benefit_candidate_documents', {
    candidateId: text('candidate_id')
        .notNull()
        .references(() => cardBenefitCandidates.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
        .notNull()
        .references(() => cardBenefitDocuments.id, { onDelete: 'cascade' }),
    role: text('role').$type<'PRIMARY' | 'SUPPORTING'>().notNull(),
}, (table) => [
    primaryKey({ columns: [table.candidateId, table.documentId] }),
    index('card_benefit_candidate_documents_document_idx').on(table.documentId),
]);

export const cardBenefitRevisions = sqliteTable('card_benefit_revisions', {
    id: text('id').primaryKey(),
    cardId: text('card_id')
        .notNull()
        .references(() => cards.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    candidateId: text('candidate_id')
        .references(() => cardBenefitCandidates.id, { onDelete: 'set null' }),
    documentId: text('document_id')
        .references(() => cardBenefitDocuments.id, { onDelete: 'set null' }),
    snapshot: text('snapshot', { mode: 'json' })
        .$type<CardBenefitRevisionSnapshot>()
        .notNull(),
    rollbackOfRevision: integer('rollback_of_revision'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    reviewerId: text('reviewer_id').references(() => user.id, { onDelete: 'set null' }),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
}, (table) => [
    uniqueIndex('card_benefit_revisions_card_revision_unique').on(
        table.cardId,
        table.revision,
    ),
    index('card_benefit_revisions_card_active_idx').on(table.cardId, table.isActive),
]);

export const cardBenefitCollectionRuns = sqliteTable('card_benefit_collection_runs', {
    id: text('id').primaryKey(),
    status: text('status').$type<CardBenefitCollectionRunStatus>().notNull(),
    trigger: text('trigger').$type<CardBenefitCollectionTrigger>().notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }).notNull(),
    maxAiCards: integer('max_ai_cards').notNull(),
    targetCount: integer('target_count').notNull(),
    createdCount: integer('created_count').notNull(),
    unchangedCount: integer('unchanged_count').notNull(),
    deferredCount: integer('deferred_count').notNull(),
    failedCount: integer('failed_count').notNull(),
    cacheHitCount: integer('cache_hit_count').notNull(),
    aiExtractionCount: integer('ai_extraction_count').notNull(),
    validationErrorCount: integer('validation_error_count').notNull(),
    sourceFailureCount: integer('source_failure_count').notNull(),
    items: text('items', { mode: 'json' }).$type<CardBenefitBatchItem[]>().notNull(),
}, (table) => [
    index('card_benefit_collection_runs_finished_idx').on(table.finishedAt),
    index('card_benefit_collection_runs_status_finished_idx').on(
        table.status,
        table.finishedAt,
    ),
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

export const promotionSourceDocuments = sqliteTable('promotion_source_documents', {
    id: text('id').primaryKey(),
    collectionSourceId: text('collection_source_id').notNull(),
    sourceUrl: text('source_url').notNull(),
    mediaType: text('media_type').notNull(),
    contentHash: text('content_hash').notNull(),
    version: integer('version').notNull(),
    rawContent: text('raw_content').notNull(),
    extractedText: text('extracted_text').notNull(),
    responseMetadata: text('response_metadata', { mode: 'json' })
        .$type<PromotionSourceDocumentMetadata>()
        .notNull()
        .default({}),
    collectedAt: integer('collected_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
}, (table) => [
    uniqueIndex('promotion_source_documents_source_hash_unique').on(
        table.collectionSourceId,
        table.sourceUrl,
        table.contentHash,
    ),
    uniqueIndex('promotion_source_documents_source_version_unique').on(
        table.collectionSourceId,
        table.sourceUrl,
        table.version,
    ),
    index('promotion_source_documents_source_collected_idx').on(
        table.collectionSourceId,
        table.collectedAt,
    ),
]);

export const promotionSourceBundles = sqliteTable('promotion_source_bundles', {
    id: text('id').primaryKey(),
    collectionSourceId: text('collection_source_id').notNull(),
    sourceBundleHash: text('source_bundle_hash').notNull(),
    collectedAt: integer('collected_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
}, (table) => [
    uniqueIndex('promotion_source_bundles_source_hash_unique').on(
        table.collectionSourceId,
        table.sourceBundleHash,
    ),
]);

export const promotionSourceBundleDocuments = sqliteTable(
    'promotion_source_bundle_documents',
    {
        bundleId: text('bundle_id')
            .notNull()
            .references(() => promotionSourceBundles.id, { onDelete: 'cascade' }),
        documentId: text('document_id')
            .notNull()
            .references(() => promotionSourceDocuments.id, { onDelete: 'cascade' }),
    },
    (table) => [
        primaryKey({ columns: [table.bundleId, table.documentId] }),
        index('promotion_source_bundle_documents_document_idx').on(table.documentId),
    ],
);

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
    sourceBundleHash: text('source_bundle_hash').notNull().default(''),
    audit: text('audit', { mode: 'json' }).$type<PromotionCandidateAudit>(),
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

export const promotionCollectionRuns = sqliteTable('promotion_collection_runs', {
    id: text('id').primaryKey(),
    status: text('status').$type<PromotionCollectionRunStatus>().notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }).notNull(),
    sourceCount: integer('source_count').notNull(),
    successfulSourceCount: integer('successful_source_count').notNull(),
    failedSourceCount: integer('failed_source_count').notNull(),
    skippedSourceCount: integer('skipped_source_count').notNull(),
    discoveredCount: integer('discovered_count').notNull(),
    publishedCount: integer('published_count').notNull(),
    reviewRequiredCount: integer('review_required_count').notNull(),
    unchangedCount: integer('unchanged_count').notNull(),
    expiredCount: integer('expired_count').notNull(),
}, (table) => [
    index('promotion_collection_runs_finished_idx').on(table.finishedAt),
    index('promotion_collection_runs_status_finished_idx').on(table.status, table.finishedAt),
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
    smallBenefitThreshold: integer('small_benefit_threshold').notNull().default(100),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
});

export const accountWorkspaceSnapshots = sqliteTable('account_workspace_snapshots', {
    userId: text('user_id')
        .primaryKey()
        .references(() => user.id, { onDelete: 'cascade' }),
    schemaVersion: integer('schema_version').notNull(),
    sourceWorkspaceId: text('source_workspace_id').notNull(),
    revision: integer('revision').notNull().default(1),
    contentHash: text('content_hash').notNull(),
    snapshot: text('snapshot', { mode: 'json' }).$type<AccountWorkspaceExport>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
});

export const accountWorkspaceOperations = sqliteTable('account_workspace_operations', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    operationId: text('operation_id').notNull(),
    deviceId: text('device_id').notNull(),
    baseRevision: integer('base_revision').notNull(),
    appliedRevision: integer('applied_revision').notNull(),
    staleBaseRevision: integer('stale_base_revision', { mode: 'boolean' })
        .notNull()
        .default(false),
    requestHash: text('request_hash').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .default(nowInMilliseconds),
}, (table) => [
    uniqueIndex('account_workspace_operations_user_operation_unique').on(
        table.userId,
        table.operationId,
    ),
    index('account_workspace_operations_user_revision_idx').on(
        table.userId,
        table.appliedRevision,
    ),
]);

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
