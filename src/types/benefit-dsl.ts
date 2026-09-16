export const BENEFIT_DSL_LANGUAGE_VERSION = 1 as const;

export type BenefitDslValue = number | string | boolean | null;

export type BenefitDslInputName =
    | 'PAYMENT_AMOUNT'
    | 'REMAINING_PAYMENT_AMOUNT'
    | 'ELIGIBLE_ITEM_AMOUNT'
    | 'ELIGIBLE_ITEM_AMOUNT_PROVIDED'
    | 'CARD_PERFORMANCE'
    | 'CARD_BASE_MONTHLY_LIMIT'
    | 'CARD_FIRST_BENEFIT_TIER_LIMIT'
    | 'CARD_NETWORK'
    | 'BRAND_ID'
    | 'CATEGORY_ID'
    | 'CHANNEL'
    | 'CURRENT_DATE'
    | 'CURRENT_WEEKDAY'
    | 'CURRENT_MINUTE'
    | 'NEW_CARD_WINDOW_AVAILABLE'
    | 'USAGE_DAILY_COUNT'
    | 'USAGE_DAILY_BENEFIT_AMOUNT'
    | 'USAGE_MONTHLY_COUNT'
    | 'USAGE_MONTHLY_BENEFIT_AMOUNT'
    | 'USAGE_YEARLY_COUNT';

export type BenefitDslComparisonOperator =
    | 'EQ'
    | 'NE'
    | 'GT'
    | 'GTE'
    | 'LT'
    | 'LTE';

export type BenefitDslArithmeticOperator =
    | 'ADD'
    | 'SUBTRACT'
    | 'MULTIPLY'
    | 'DIVIDE'
    | 'MIN'
    | 'MAX';

export type BenefitDslPeriod = 'DAY' | 'MONTH' | 'YEAR';
export type BenefitDslAggregateField = 'PAYMENT_AMOUNT' | 'BENEFIT_AMOUNT';
export type BenefitDslGroupField = 'BRAND_ID' | 'CATEGORY_ID';

export type BenefitDslExpression =
    | {
        op: 'literal';
        value: BenefitDslValue;
    }
    | {
        op: 'input';
        name: BenefitDslInputName;
    }
    | {
        op: 'arithmetic';
        operator: BenefitDslArithmeticOperator;
        operands: BenefitDslExpression[];
    }
    | {
        op: 'round';
        mode: 'FLOOR' | 'CEIL' | 'NEAREST';
        value: BenefitDslExpression;
        unit: number;
    }
    | {
        op: 'compare';
        operator: BenefitDslComparisonOperator;
        left: BenefitDslExpression;
        right: BenefitDslExpression;
    }
    | {
        op: 'logic';
        operator: 'ALL' | 'ANY';
        operands: BenefitDslExpression[];
    }
    | {
        op: 'not';
        value: BenefitDslExpression;
    }
    | {
        op: 'in';
        value: BenefitDslExpression;
        options: BenefitDslValue[];
    }
    | {
        op: 'case';
        branches: Array<{
            when: BenefitDslExpression;
            then: BenefitDslExpression;
        }>;
        otherwise: BenefitDslExpression;
    }
    | {
        op: 'aggregate';
        function: 'SUM' | 'COUNT';
        period: BenefitDslPeriod;
        field: BenefitDslAggregateField;
        where?: BenefitDslExpression;
        includeCurrent?: boolean;
    }
    | {
        op: 'isTopGroup';
        period: BenefitDslPeriod;
        groupBy: BenefitDslGroupField;
        metric: 'PAYMENT_AMOUNT' | 'TRANSACTION_COUNT';
        where?: BenefitDslExpression;
        includeCurrent?: boolean;
    };

export interface BenefitDslTarget {
    includedBrandIds?: string[];
    excludedBrandIds?: string[];
    categoryIds?: string[];
    channels?: Array<'ONLINE' | 'OFFLINE' | 'OFFICIAL_SITE'>;
    purchaseScenario?: {
        id: string;
        label: string;
        aliases?: string[];
        requiredChecks: string[];
    };
}

export interface BenefitDslConfirmation {
    when: BenefitDslExpression;
    message: string;
}

export interface BenefitDslLimits {
    dailyCount?: BenefitDslExpression;
    dailyBenefitAmount?: BenefitDslExpression;
    monthlyCount?: BenefitDslExpression;
    monthlyBenefitAmount?: BenefitDslExpression;
    yearlyCount?: BenefitDslExpression;
}

export interface BenefitProgramV1 {
    languageVersion: typeof BENEFIT_DSL_LANGUAGE_VERSION;
    target?: BenefitDslTarget;
    eligibility: BenefitDslExpression;
    benefit: BenefitDslExpression;
    limits?: BenefitDslLimits;
    usageGroupId?: string;
    usesCardLimit?: boolean;
    cardMonthlyLimit?: BenefitDslExpression;
    confirmations?: BenefitDslConfirmation[];
    reason?: string;
}

export interface CardBenefitUnsupportedClause {
    id: string;
    ruleIds: string[];
    sourceUrl: string;
    quote: string;
    reason: string;
    affectsValue: boolean;
}

export interface BenefitDslHistoryEntry {
    occurredAt: string;
    paymentAmount: number;
    benefitAmount: number;
    brandId?: string;
    categoryId?: string;
    channel?: 'ONLINE' | 'OFFLINE' | 'OFFICIAL_SITE';
}

export interface BenefitDslUsage {
    dailyCount: number;
    dailyBenefitAmount: number;
    monthlyCount: number;
    monthlyBenefitAmount: number;
    yearlyCount: number;
}

export interface BenefitDslEvaluationContext {
    paymentAmount: number;
    remainingPaymentAmount: number;
    eligibleItemAmount?: number;
    cardPerformance: number;
    cardBaseMonthlyLimit: number;
    cardFirstBenefitTierLimit: number;
    cardUsedBenefitAmount: number;
    cardNetwork?: string;
    brandId?: string;
    categoryId?: string;
    purchaseScenarioId?: string;
    channel: 'ONLINE' | 'OFFLINE' | 'OFFICIAL_SITE';
    now: Date;
    newCardWindowAvailable: boolean;
    usage: BenefitDslUsage;
    history: BenefitDslHistoryEntry[];
}

export interface BenefitDslValidationReferences {
    brandIds?: ReadonlySet<string>;
    categoryIds?: ReadonlySet<string>;
}

export interface BenefitDslValidationResult {
    valid: boolean;
    errors: string[];
    nodeCount: number;
    maxDepth: number;
}

export interface BenefitDslEvaluationResult {
    eligible: boolean;
    benefitAmount: number;
    certainty: 'CONFIRMED' | 'CONDITIONAL';
    requiredChecks: string[];
    reason: string;
    errors: string[];
}
