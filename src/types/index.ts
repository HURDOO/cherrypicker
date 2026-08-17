export type CategoryId = string;
export type BrandId = string;
export type CardId = string;
export type RuleId = string;
export type PromotionId = string;
export type PromotionProviderId = string;

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
}

export type PlatformType = 'ALL' | 'ONLINE' | 'OFFLINE' | 'OFFICIAL_SITE';
export type ActionType = 'PERCENT' | 'FLAT' | 'FIXED_PRICE';

export interface RuleCondition {
    minSpend?: number;
    minPerformance?: number;
    manualCheckRequired?: boolean;
    requiredNote?: string;
}

export interface RuleAction {
    type: ActionType;
    value: number;       // % or Amount
    maxDiscount?: number; // Per transaction cap
}

export interface LimitConfig {
    dailyCount?: number;
    dailyAmount?: number; // Max discount amount per day for this rule/group
    monthlyCount?: number;
    yearlyCount?: number;
    monthlyAmount?: number; // Max discount amount for this rule/group
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

// User Data
export interface UserCardPerformance {
    cardId: CardId;
    performanceMonth: string; // YYYY-MM, based on Korea Standard Time
    amount: number; // Previous month performance
}

export interface TransactionHistory {
    id: number;
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
    combinationSnapshot?: Record<string, unknown>;
}

// Calculation Result
export interface CalculatedCard extends Card {
    calculatedDiscount: number;
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
}

export interface RecommendationRequest {
    brandId: BrandId;
    amount: number;
    eligibleItemAmount?: number;
    isOnline: boolean;
    confirmedConditionIds?: string[];
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
