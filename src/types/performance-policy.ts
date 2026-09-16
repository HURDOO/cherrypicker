export const CARD_PERFORMANCE_POLICY_VERSION = 1 as const;

export type PerformanceTransactionTag =
    | 'STANDARD_PURCHASE'
    | 'INTEREST_FREE_INSTALLMENT'
    | 'GIFT_CARD_OR_PREPAID'
    | 'TAX_OR_PUBLIC_CHARGE'
    | 'HOUSING_OR_EDUCATION'
    | 'INSURANCE_OR_UTILITY'
    | 'FEE_OR_INTEREST'
    | 'UNAPPROVED_SLIP';

export type CardPerformancePredicate =
    | { op: 'CARD_DISCOUNT_APPLIED'; ruleIds?: string[] }
    | { op: 'TRANSACTION_TAG_IN'; tags: PerformanceTransactionTag[] }
    | { op: 'ALL' | 'ANY'; operands: CardPerformancePredicate[] };

export interface CardPerformanceExclusionRule {
    id: string;
    when: CardPerformancePredicate;
    reason: string;
    sourceUrl: string;
    quote: string;
    page?: number;
}

/** Missing policy means the card has no modeled exclusion and uses the full charge by default. */
export interface CardPerformancePolicyV1 {
    version: typeof CARD_PERFORMANCE_POLICY_VERSION;
    exclusionRules: CardPerformanceExclusionRule[];
}

export interface PerformanceContribution {
    amount: number;
    status: 'CONFIRMED' | 'UNKNOWN';
    reason: string;
    policyVersion?: number;
}
