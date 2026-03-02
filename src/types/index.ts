export type CategoryId = string;
export type BrandId = string;
export type CardId = string;
export type RuleId = string;

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
}

export interface RuleAction {
    type: ActionType;
    value: number;       // % or Amount
    maxDiscount?: number; // Per transaction cap
}

export interface LimitConfig {
    dailyCount?: number;
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

    description: string;
    detail: string;

    condition: RuleCondition;
    action: RuleAction;
    limitConfig: LimitConfig;
}

// User Data
export interface UserCardPerformance {
    cardId: CardId;
    amount: number; // Previous month performance
}

export interface TransactionHistory {
    id: number;
    date: string; // ISO string
    brandId: BrandId;
    cardId: CardId;
    ruleId?: RuleId; // Applied rule
    amount: number;
    discountAmount: number;
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
            monthlyCount: number;
            yearlyCount: number;
            monthlyAmount: number;
            isDailyLimitReached?: boolean;
            isMonthlyLimitReached?: boolean;
            isYearlyLimitReached?: boolean;
            isMonthlyAmountLimitReached?: boolean;
        }
    };
}
