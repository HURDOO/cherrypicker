export type CategoryId = string;
export type BrandId = string;
export type CardId = string;
export type RuleId = string;
export type PromotionId = string;
export type PromotionProviderId = string;
export type CardNetwork =
    | 'DOMESTIC'
    | 'MASTERCARD'
    | 'VISA'
    | 'AMEX'
    | 'UNIONPAY'
    | 'OTHER';
export type SystemCardCatalogStatus = 'DRAFT' | 'PUBLISHED';
export type SystemCardIssueStatus = 'ACTIVE' | 'DISCONTINUED';

export interface Category {
    id: CategoryId;
    name: string;
    userId?: string;
    order?: number;
}

export interface Brand {
    id: BrandId;
    name: string;
    categoryId: CategoryId;
    iconName?: string; // e.g. 'Coffee'
    userId?: string;
    order?: number;
}

export interface LimitTableItem {
    threshold: number; // Min performance required
    limit: number;    // Monthly discount limit
}

export interface Card {
    id: CardId;
    userId?: string; // Optional: System cards have null/undefined userId
    name: string;
    company: string;
    color: string; // Tailwind class
    limitTable: LimitTableItem[]; // Ordered by threshold desc usually, or handled in logic
    network?: CardNetwork;
}

export type PlatformType = 'ALL' | 'ONLINE' | 'OFFLINE' | 'OFFICIAL_SITE';
export type ActionType = 'PERCENT' | 'FLAT' | 'FIXED_PRICE';
export type BenefitWeekday = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
export type LimitUsageField =
    'dailyCount' | 'dailyAmount' | 'monthlyCount' | 'yearlyCount' | 'monthlyAmount';

export interface BenefitTimeRange {
    startTime: string; // Inclusive HH:mm in Korea Standard Time
    endTime: string; // Exclusive HH:mm in Korea Standard Time; may cross midnight
}

export interface RuleCondition {
    minSpend?: number;
    maxSpend?: number; // Inclusive maximum payment amount
    maxSpendExclusive?: number; // Exclusive maximum payment amount
    minPerformance?: number;
    startsAt?: string; // Inclusive YYYY-MM-DD validity boundary
    endsAt?: string; // Inclusive YYYY-MM-DD validity boundary
    daysOfWeek?: BenefitWeekday[];
    timeRanges?: BenefitTimeRange[];
    requiredCardNetwork?: CardNetwork;
    performanceWaiver?: 'NEW_CARD_REGISTRATION_WINDOW';
    confirmationRequired?: boolean;
    stackableWithRuleIds?: RuleId[];
    /**
     * This rule is a fallback for the referenced rules. It may start only when
     * every referenced rule that matches the current purchase was already
     * unavailable before the purchase began (for example, after a monthly
     * special-accrual limit was exhausted by an earlier transaction).
     */
    fallbackAfterRuleIds?: RuleId[];
    applicationOrder?: number;
    manualCheckRequired?: boolean;
    requiredNote?: string;
    itemSpecific?: boolean;
    eligibleItemSummary?: string;
}

export interface RuleAction {
    type: ActionType;
    value: number;       // % or Amount
    maxDiscount?: number; // Per transaction cap
    amountBasis?: 'ORIGINAL_AMOUNT' | 'REMAINING_AMOUNT';
}

export interface LimitConfig {
    dailyCount?: number;
    dailyAmount?: number; // Max discount amount per day for this rule/group
    monthlyCount?: number;
    yearlyCount?: number;
    monthlyAmount?: number; // Max discount amount for this rule/group
    monthlyAmountByPerformance?: LimitTableItem[];
    sharedFields?: LimitUsageField[];
}

export interface BenefitRule {
    id: RuleId;
    userId?: string; // Optional: System rules have null/undefined userId
    cardId: CardId;
    category?: CategoryId; // Fallback
    includedBrands?: BrandId[];
    excludedBrands?: BrandId[];

    platformType?: PlatformType;
    sharedGroupId?: string; // For grouping limits
    usesCardLimit?: boolean; // false for benefits with separate/non-integrated caps

    description: string;
    detail: string;

    condition: RuleCondition;
    action: RuleAction;
    limitConfig: LimitConfig;
}

export type CardBenefitSourceKind = 'PRODUCT_PAGE' | 'PRODUCT_GUIDE_PDF' | 'NOTICE';
export type CardBenefitSourceRole = 'PRIMARY' | 'SUPPORTING';
export type CardBenefitCandidateStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type CardBenefitCollectionRunStatus = 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
export type CardBenefitCollectionTrigger = 'MANUAL' | 'CLI' | 'SCHEDULED';

export interface CardBenefitBatchItem {
    cardId: CardId;
    status: 'created' | 'unchanged' | 'deferred' | 'failed';
    durationMs: number;
    aiExtraction: boolean;
    cacheHit: boolean;
    validationErrorCount: number;
    sourceFailureCount: number;
    candidateId?: string;
    error?: string;
}

export interface CardBenefitBatchTotals {
    targets: number;
    created: number;
    unchanged: number;
    deferred: number;
    failed: number;
    cacheHits: number;
    aiExtractions: number;
    validationErrors: number;
    sourceFailures: number;
}

export interface CardBenefitBatchResult {
    startedAt: string;
    finishedAt: string;
    maxAiCards: number;
    totals: CardBenefitBatchTotals;
    items: CardBenefitBatchItem[];
}

export interface CardBenefitCollectionRun extends CardBenefitBatchResult {
    id: string;
    status: CardBenefitCollectionRunStatus;
    trigger: CardBenefitCollectionTrigger;
}

export interface CardBenefitNoticeDates {
    affectedRuleIds: RuleId[];
    requirePublicationDate: boolean;
    requireEffectiveFrom: boolean;
    applyAsRulePeriod?: boolean;
    publicationDate?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    publicationEvidence?: string;
    effectiveEvidence?: string;
}

export interface CardBenefitDocumentMetadata {
    etag?: string;
    lastModified?: string;
    finalUrl?: string;
    contentDisposition?: string;
    rawEncoding?: 'utf8' | 'base64';
    extractionMethod?: 'html-to-text' | 'pdfjs';
    pageCount?: number;
    title?: string;
    noticeDates?: CardBenefitNoticeDates;
}

export interface CardBenefitEvidence {
    id: string;
    ruleIds: RuleId[];
    fields: Array<'description' | 'condition' | 'action' | 'limitConfig'>;
    quote: string;
    sourceUrl?: string;
    location?: string;
    page?: number;
}

export interface CardBenefitFieldChange {
    scope: 'CARD' | 'RULE';
    entityId: string;
    entityLabel: string;
    path: string;
    kind: 'ADDED' | 'REMOVED' | 'CHANGED';
    risk: 'NORMAL' | 'HIGH';
    before?: unknown;
    after?: unknown;
}

export interface CardBenefitCoverageItem {
    ruleId: RuleId;
    ruleLabel: string;
    path: string;
    status: 'COVERED' | 'MISSING_EVIDENCE';
    evidenceIds: string[];
}

export interface CardBenefitCandidateAudit {
    version: 1;
    baselineRevision: number;
    summary: {
        addedRules: number;
        removedRules: number;
        changedFields: number;
        coveredFields: number;
        missingFields: number;
    };
    changes: CardBenefitFieldChange[];
    coverage: CardBenefitCoverageItem[];
    blockingErrors: string[];
}

export interface CardBenefitExtraction {
    schemaVersion: 2;
    completeness: 'FULL';
    card: Pick<Card, 'id' | 'name' | 'company' | 'limitTable' | 'network'>;
    rules: BenefitRule[];
    evidence: CardBenefitEvidence[];
    notes: string[];
}

export interface CardBenefitRevisionSnapshot {
    card: Card;
    rules: BenefitRule[];
}

// User Data
export interface UserCardPerformance {
    cardId: CardId;
    performanceMonth: string; // YYYY-MM, based on Korea Standard Time
    amount: number; // Accumulated performance for the month
    targetAmount?: number; // Optional goal used to prepare the following month's benefits
}

export interface PerformanceRecommendationGoal extends UserCardPerformance {
    targetAmount: number;
    source: 'AUTOMATIC' | 'USER';
    projectedBenefitAmount: number;
}

export interface TransactionHistory {
    id: number | string;
    date: string; // ISO string
    brandId: BrandId;
    cardId?: CardId;
    ruleId?: RuleId; // Applied rule
    amount: number;
    discountAmount: number;
    eligibleItemAmount?: number;
    payProviderId?: PromotionProviderId;
    fundingType?: FundingType;
    combinationId?: string;
    confirmedValue?: number;
    conditionalValue?: number;
    estimatedValue?: number;
    payableAmount?: number;
    laterReward?: number;
    performanceContributionAmount?: number;
    combinationSnapshot?: Record<string, unknown>;
}

// Calculation Result
export interface CalculatedCard extends Card {
    calculatedDiscount: number;
    confirmedDiscount: number;
    conditionalDiscount: number;
    monthlyMaxLimit: number;
    remainingLimit: number;
    usedDiscount: number;
    isApplicable: boolean;
    reason?: string;
    matchedRule?: BenefitRule & {
        usage?: {
            dailyCount: number;
            dailyAmount: number;
            monthlyCount: number;
            yearlyCount: number;
            monthlyAmount: number;
            isDailyLimitReached?: boolean;
            isDailyAmountLimitReached?: boolean;
            isMonthlyLimitReached?: boolean;
            isYearlyLimitReached?: boolean;
            isMonthlyAmountLimitReached?: boolean;
        }
    };
    matchedBenefits: AppliedCardBenefit[];
}

export interface AppliedCardBenefit {
    rule: BenefitRule;
    discount: number;
    certainty: Extract<BenefitCertainty, 'CONFIRMED' | 'CONDITIONAL'>;
    confirmationId?: string;
    requiredChecks: string[];
    usage: {
        dailyCount: number;
        dailyAmount: number;
        monthlyCount: number;
        yearlyCount: number;
        monthlyAmount: number;
        isDailyLimitReached?: boolean;
        isDailyAmountLimitReached?: boolean;
        isMonthlyLimitReached?: boolean;
        isYearlyLimitReached?: boolean;
        isMonthlyAmountLimitReached?: boolean;
    };
}

// Promotion combination engine
export type PromotionProviderKind =
    | 'TELECOM'
    | 'SUBSCRIPTION'
    | 'PAY'
    | 'MERCHANT'
    | 'GOODDEAL';
export type BenefitLayer = 'DISCOUNT' | 'PAY' | 'PAYMENT_METHOD' | 'POST_REWARD';
export type BenefitCertainty = 'CONFIRMED' | 'CONDITIONAL' | 'ESTIMATED';
export type PromotionStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'EXPIRED';
export type FundingType = 'CARD' | 'MONEY' | 'POINTS' | 'GIFT_CERTIFICATE';
export type PromotionChannel = 'ALL' | 'ONLINE' | 'OFFLINE' | 'OFFICIAL_SITE';
export type PromotionActionType =
    | 'PERCENT'
    | 'FLAT'
    | 'FIXED_PRICE'
    | 'POINTS'
    | 'CASHBACK'
    | 'GIFT_CERTIFICATE';
export type PromotionValueSemantics = 'EXACT' | 'UP_TO';
export type PromotionCalculationMode =
    | 'CALCULABLE'
    | 'CONDITIONAL'
    | 'INFORMATION_ONLY';
export type PromotionAmountBasis =
    | 'ORIGINAL_AMOUNT'
    | 'REMAINING_AMOUNT'
    | 'ELIGIBLE_ITEM_AMOUNT'
    | 'FINAL_APPROVED_AMOUNT';
export type PromotionApplicabilityScope =
    | 'STORE_WIDE'
    | 'CATEGORY'
    | 'PRODUCT_SET'
    | 'CUSTOMER_TARGETED'
    | 'UNKNOWN';
export type PromotionRequiredInput =
    | 'ELIGIBLE_ITEM_AMOUNT'
    | 'COUPON'
    | 'ENROLLMENT'
    | 'SUBSCRIPTION_PRODUCT'
    | 'TARGET_ELIGIBILITY'
    | 'STORE_ELIGIBILITY'
    | 'PAYMENT_INSTRUMENT';

export interface PromotionSemanticAnalysis {
    scope: PromotionApplicabilityScope;
    confidence: number;
    evidenceQuotes: string[];
    requiredInputs: PromotionRequiredInput[];
    eligibleItemSummary?: string;
    reasoningSummary: string;
    provider: string;
    model?: string;
    inputHash?: string;
    diagnostic?: string;
}

export interface PromotionSourceDocumentMetadata {
    contentType?: string;
    etag?: string;
    lastModified?: string;
    finalUrl?: string;
}

export interface PromotionCandidateEvidenceReference {
    documentId: string;
    sourceUrl: string;
    quote: string;
}

export interface PromotionCandidateFieldChange {
    path: string;
    kind: 'ADDED' | 'REMOVED' | 'CHANGED';
    risk: 'NORMAL' | 'HIGH';
    before?: unknown;
    after?: unknown;
}

export interface PromotionCandidateCoverageItem {
    path: string;
    status: 'COVERED' | 'MISSING_EVIDENCE';
    evidence: PromotionCandidateEvidenceReference[];
}

export interface PromotionCandidateAudit {
    version: 1;
    summary: {
        changedFields: number;
        highRiskChanges: number;
        coveredFields: number;
        missingFields: number;
    };
    changes: PromotionCandidateFieldChange[];
    coverage: PromotionCandidateCoverageItem[];
    blockingErrors: string[];
}

export interface PromotionProvider {
    id: PromotionProviderId;
    name: string;
    kind: PromotionProviderKind;
    sourceUrl?: string;
    isActive: boolean;
    sortOrder: number;
}

export interface SubscriptionProduct {
    id: string;
    providerId: PromotionProviderId;
    name: string;
    aliases: string[];
    benefitSummary: string;
    sourceUrl: string;
    isActive: boolean;
    collectedAt?: string;
}

export interface PromotionAction {
    type: PromotionActionType;
    value: number;
    valueSemantics?: PromotionValueSemantics;
    maxBenefit?: number;
    faceValue?: number;
}

export interface PromotionCondition {
    amountBasis?: PromotionAmountBasis;
    applicabilityScope?: PromotionApplicabilityScope;
    calculationMode?: PromotionCalculationMode;
    headlineEligible?: boolean;
    eligibleItemSummary?: string;
    requiredInputs?: PromotionRequiredInput[];
    minSpend?: number;
    telecomTiers?: string[];
    requiredSubscriptionProducts?: string[];
    requiresCoupon?: boolean;
    requiresEnrollment?: boolean;
    firstPaymentOnly?: boolean;
    confirmationRequired?: boolean;
    manualCheckRequired?: boolean;
    requiredNote?: string;
    itemSpecific?: boolean;
}

export interface PromotionCompatibility {
    requiredPayProviderIds?: PromotionProviderId[];
    allowedFundingTypes?: FundingType[];
    excludedPromotionIds?: PromotionId[];
    exclusiveGroup?: string;
    allowStackWithSameLayer?: boolean;
    blocksCardBenefit?: boolean;
    allowResidualPayment?: boolean;
}

export interface PromotionOffer {
    id: PromotionId;
    providerId: PromotionProviderId;
    layer: BenefitLayer;
    title: string;
    description: string;
    brandIds: BrandId[];
    categoryIds: CategoryId[];
    channels: PromotionChannel[];
    startsAt?: string;
    endsAt?: string;
    action: PromotionAction;
    condition: PromotionCondition;
    compatibility: PromotionCompatibility;
    limitConfig: LimitConfig;
    certainty: BenefitCertainty;
    status: PromotionStatus;
    sourceUrl: string;
    sourceHash?: string;
    collectedAt?: string;
    reviewedAt?: string;
    publishedAt?: string;
}

export interface TelecomMembership {
    providerId: PromotionProviderId;
    tier?: string;
}

export interface BenefitSubscription {
    providerId: PromotionProviderId;
    productName: string;
}

export interface UserBenefitProfile {
    telecomMemberships: TelecomMembership[];
    subscriptions: BenefitSubscription[];
    enabledPayProviderIds: PromotionProviderId[];
    moneyEnabled: boolean;
    pointsEnabled: boolean;
    pointValue: number;
    smallBenefitThreshold: number;
}

export interface RecommendationRequest {
    brandId: BrandId;
    amount: number;
    eligibleItemAmount?: number;
    isOnline: boolean;
    confirmedConditionIds?: string[];
    priority?: RecommendationPriority;
}

export type RecommendationPriority = 'BENEFIT' | 'PERFORMANCE';

export interface PerformancePriorityProgress {
    performanceMonth: string;
    benefitMonth: string;
    currentAmount: number;
    targetAmount: number;
    contributionAmount: number;
    projectedAmount: number;
    remainingBefore: number;
    remainingAfter: number;
    targetReached: boolean;
    goalSource: PerformanceRecommendationGoal['source'];
    projectedBenefitAmount: number;
}

export interface CombinationStep {
    id: string;
    layer: BenefitLayer;
    providerId?: PromotionProviderId;
    providerName: string;
    title: string;
    certainty: BenefitCertainty;
    amountBefore: number;
    benefitAmount: number;
    amountAfter: number;
    isImmediate: boolean;
    warning?: string;
    promotionId?: PromotionId;
    cardId?: CardId;
    ruleId?: RuleId;
    confirmationId?: string;
}

export interface BenefitCombination {
    id: string;
    payProviderId?: PromotionProviderId;
    payProviderName?: string;
    fundingType: FundingType;
    cardId?: CardId;
    cardName?: string;
    steps: CombinationStep[];
    confirmedValue: number;
    conditionalValue: number;
    estimatedValue: number;
    immediateDiscount: number;
    laterReward: number;
    payableAmount: number;
    performanceProgress?: PerformancePriorityProgress;
    warnings: string[];
    requiredChecks: string[];
}

export interface RecommendationResponse {
    brandId: BrandId;
    amount: number;
    eligibleItemAmount?: number;
    combinations: BenefitCombination[];
    itemSpecificOffers: Array<{
        id: PromotionId;
        title: string;
        providerName: string;
        scope: 'CATEGORY' | 'PRODUCT_SET';
        calculationEligible: boolean;
        valueSemantics: PromotionValueSemantics;
        actionType: PromotionActionType;
        actionValue: number;
        eligibleItemSummary?: string;
        requiredNote?: string;
    }>;
    informationalOffers: Array<{
        id: PromotionId;
        title: string;
        providerName: string;
        scope: PromotionApplicabilityScope;
        valueSemantics: PromotionValueSemantics;
        calculationMode: 'INFORMATION_ONLY';
        actionType: PromotionActionType;
        actionValue: number;
        eligibleItemSummary?: string;
        requiredNote?: string;
    }>;
}

export interface MerchantRouteVerification {
    brandId: BrandId;
    payProviderId?: PromotionProviderId;
    cardCompany?: string;
    channel: PromotionChannel;
    cardBenefitEligible: boolean;
    certainty: BenefitCertainty;
    evidenceUrl: string;
    verifiedAt: string;
}

export type CatalogCategory = Omit<Category, 'userId'>;
export type CatalogBrand = Omit<Brand, 'userId'>;
export type CatalogCard = Omit<Card, 'userId'>;
export type CatalogBenefitRule = Omit<BenefitRule, 'userId'>;
export type CatalogPromotionProvider = PromotionProvider & { isActive: true };
export type CatalogSubscriptionProduct = Omit<SubscriptionProduct, 'collectedAt'> & {
    isActive: true;
};
export type CatalogPromotionOffer = Omit<
    PromotionOffer,
    'status' | 'sourceHash' | 'collectedAt' | 'reviewedAt' | 'publishedAt'
> & {
    status: 'PUBLISHED';
};

export type CardBenefitReviewStatus = 'REVIEWED' | 'NOT_REVIEWED';
export type CardBenefitSupportScope = 'FULL' | 'PARTIAL';

export interface CardBenefitSupportSource {
    label: string;
    url: string;
}

export interface CatalogCardBenefitSupport {
    cardId: CardId;
    reviewStatus: CardBenefitReviewStatus;
    supportScope: CardBenefitSupportScope;
    lastVerifiedAt?: string;
    sources: CardBenefitSupportSource[];
    caveats: string[];
}

export type PromotionCollectionRunStatus = 'SUCCEEDED' | 'PARTIAL' | 'FAILED';

export interface BenefitCatalogFreshness {
    collectionStatus: PromotionCollectionRunStatus | 'UNKNOWN';
    sourceCount: number;
    failedSourceCount: number;
    lastAttemptAt?: string;
    lastSuccessfulAt?: string;
    lastPublishedAt?: string;
}

export interface BenefitCatalogSnapshot {
    schemaVersion: 2;
    catalogVersion: string;
    generatedAt: string;
    freshness?: BenefitCatalogFreshness;
    categories: CatalogCategory[];
    brands: CatalogBrand[];
    cards: CatalogCard[];
    rules: CatalogBenefitRule[];
    providers: CatalogPromotionProvider[];
    subscriptionProducts: CatalogSubscriptionProduct[];
    promotions: CatalogPromotionOffer[];
    routeVerifications: MerchantRouteVerification[];
    cardBenefitSupports: CatalogCardBenefitSupport[];
}
