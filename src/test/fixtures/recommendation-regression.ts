import type {
    BenefitRule,
    Brand,
    Card,
    Category,
    MerchantRouteVerification,
    PromotionOffer,
    PromotionProvider,
    RecommendationRequest,
    TransactionHistory,
    UserBenefitProfile,
    UserCardPerformance,
} from '@/types';
import {
    INITIAL_BRANDS,
    INITIAL_CARDS,
    INITIAL_CATEGORIES,
    INITIAL_RULES,
} from '@/utils/seedData';

type JsonRecord = Record<string, unknown>;

const camelizeKey = (key: string) => key.replace(
    /_([a-z])/g,
    (_, letter: string) => letter.toUpperCase(),
);

const camelize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(camelize);
    if (value && typeof value === 'object') {
        return Object.entries(value as JsonRecord).reduce<JsonRecord>((result, [key, item]) => {
            result[camelizeKey(key)] = camelize(item);
            return result;
        }, {});
    }
    return value;
};

export const RECOMMENDATION_REGRESSION_NOW = new Date('2026-09-03T03:00:00.000Z');
export const RECOMMENDATION_REGRESSION_GENERATED_AT = '2026-09-03T02:00:00.000Z';
export const RECOMMENDATION_REGRESSION_PERFORMANCE_MONTH = '2026-08';
export const RECOMMENDATION_REGRESSION_GOAL_MONTH = '2026-09';
export const RECOMMENDATION_REGRESSION_BENEFIT_MONTH = '2026-10';

export const recommendationRegressionCategories: Category[] = INITIAL_CATEGORIES.map(
    (category, order) => ({ ...category, order }),
);

export const recommendationRegressionBrands: Brand[] = (
    camelize(INITIAL_BRANDS) as Brand[]
).map((brand, order) => ({ ...brand, order }));

export const recommendationRegressionCards: Card[] = (
    camelize(INITIAL_CARDS) as Card[]
).map(card => ({ ...card, limitTable: card.limitTable ?? [] }));

export const recommendationRegressionRules: BenefitRule[] = (
    camelize(INITIAL_RULES) as BenefitRule[]
).map(rule => ({
    ...rule,
    includedBrands: rule.includedBrands ?? [],
    excludedBrands: rule.excludedBrands ?? [],
    platformType: rule.platformType ?? 'ALL',
    usesCardLimit: rule.usesCardLimit ?? true,
    detail: rule.detail ?? '',
    condition: rule.condition ?? {},
    limitConfig: rule.limitConfig ?? {},
}));

export const recommendationRegressionProviders: PromotionProvider[] = [
    {
        id: 'skt',
        name: 'T멤버십',
        kind: 'TELECOM',
        isActive: true,
        sortOrder: 0,
    },
    {
        id: 't-universe',
        name: 'T우주',
        kind: 'SUBSCRIPTION',
        isActive: true,
        sortOrder: 1,
    },
    {
        id: 'naverpay',
        name: 'Npay',
        kind: 'PAY',
        isActive: true,
        sortOrder: 2,
    },
];

export const recommendationRegressionPromotions: PromotionOffer[] = [
    {
        id: 'fixture-skt-cu-10-percent',
        providerId: 'skt',
        layer: 'DISCOUNT',
        title: 'CU T멤버십 10% 할인',
        description: '대표 회귀 테스트용 매장 전체 할인',
        brandIds: ['cu'],
        categoryIds: [],
        channels: ['OFFLINE'],
        action: { type: 'PERCENT', value: 10, maxBenefit: 1_000 },
        condition: {
            amountBasis: 'ORIGINAL_AMOUNT',
            applicabilityScope: 'STORE_WIDE',
            calculationMode: 'CALCULABLE',
            headlineEligible: true,
            telecomTiers: ['VIP'],
        },
        compatibility: { exclusiveGroup: 'telecom:cu' },
        limitConfig: { dailyCount: 1, monthlyAmount: 10_000 },
        certainty: 'CONFIRMED',
        status: 'PUBLISHED',
        sourceUrl: 'https://example.com/fixtures/skt-cu',
    },
    {
        id: 'fixture-t-universe-twosome-30-percent',
        providerId: 't-universe',
        layer: 'DISCOUNT',
        title: '투썸플레이스 30% 할인',
        description: '대표 회귀 테스트용 구독 할인',
        brandIds: ['twosome'],
        categoryIds: [],
        channels: ['OFFLINE'],
        action: { type: 'PERCENT', value: 30, maxBenefit: 9_000 },
        condition: {
            amountBasis: 'ORIGINAL_AMOUNT',
            applicabilityScope: 'STORE_WIDE',
            calculationMode: 'CALCULABLE',
            headlineEligible: true,
            requiredInputs: ['SUBSCRIPTION_PRODUCT'],
            requiredSubscriptionProducts: ['T 우주패스 편의점&카페'],
        },
        compatibility: { exclusiveGroup: 'telecom:twosome' },
        limitConfig: { dailyCount: 1, monthlyAmount: 30_000 },
        certainty: 'CONFIRMED',
        status: 'PUBLISHED',
        sourceUrl: 'https://example.com/fixtures/t-universe-twosome',
    },
    {
        id: 'fixture-npay-5-percent',
        providerId: 'naverpay',
        layer: 'POST_REWARD',
        title: 'Npay 5% 포인트 적립',
        description: '대표 회귀 테스트용 결제 후 적립',
        brandIds: ['cu', 'twosome'],
        categoryIds: [],
        channels: ['OFFLINE'],
        action: { type: 'POINTS', value: 5, maxBenefit: 1_000 },
        condition: {
            amountBasis: 'FINAL_APPROVED_AMOUNT',
            applicabilityScope: 'STORE_WIDE',
            calculationMode: 'CALCULABLE',
            headlineEligible: true,
        },
        compatibility: {
            requiredPayProviderIds: ['naverpay'],
            allowedFundingTypes: ['CARD', 'MONEY', 'POINTS'],
        },
        limitConfig: { monthlyAmount: 5_000 },
        certainty: 'CONFIRMED',
        status: 'PUBLISHED',
        sourceUrl: 'https://example.com/fixtures/npay',
    },
];

export const recommendationRegressionRouteVerifications: MerchantRouteVerification[] = [
    'cu',
    'twosome',
].map(brandId => ({
    brandId,
    payProviderId: 'naverpay',
    channel: 'OFFLINE',
    cardBenefitEligible: true,
    certainty: 'CONFIRMED',
    evidenceUrl: `https://example.com/fixtures/routes/${brandId}`,
    verifiedAt: RECOMMENDATION_REGRESSION_GENERATED_AT,
}));

export const recommendationRegressionProfile: UserBenefitProfile = {
    telecomMemberships: [{ providerId: 'skt', tier: 'VIP' }],
    subscriptions: [{
        providerId: 't-universe',
        productName: 'T 우주패스 편의점&카페',
    }],
    enabledPayProviderIds: ['naverpay'],
    moneyEnabled: true,
    pointsEnabled: true,
    pointValue: 1,
    smallBenefitThreshold: 100,
};

export interface RecommendationRegressionScenario {
    id: string;
    request: RecommendationRequest;
    performances: UserCardPerformance[];
    history: TransactionHistory[];
}

const activeBenefitPerformances: UserCardPerformance[] = [
    { cardId: 'shinhan_heyoung', performanceMonth: '2026-08', amount: 200_000 },
    { cardId: 'shinhan_nara', performanceMonth: '2026-08', amount: 100_000 },
    { cardId: 'kb_nori2_student', performanceMonth: '2026-08', amount: 200_000 },
    { cardId: 'hana_nara', performanceMonth: '2026-08', amount: 100_000 },
];

const activeGoalPerformances: UserCardPerformance[] = [
    { cardId: 'shinhan_heyoung', performanceMonth: '2026-09', amount: 200_000 },
    { cardId: 'shinhan_nara', performanceMonth: '2026-09', amount: 100_000 },
    { cardId: 'kb_nori2_student', performanceMonth: '2026-09', amount: 200_000 },
    { cardId: 'hana_nara', performanceMonth: '2026-09', amount: 100_000 },
];

export const recommendationRegressionScenarios: RecommendationRegressionScenario[] = [
    {
        id: 'cu-membership-pay-card',
        request: {
            brandId: 'cu',
            amount: 10_000,
            isOnline: false,
            priority: 'BENEFIT',
        },
        performances: [...activeBenefitPerformances, ...activeGoalPerformances],
        history: [],
    },
    {
        id: 'twosome-subscription-pay-card',
        request: {
            brandId: 'twosome',
            amount: 10_000,
            isOnline: false,
            priority: 'BENEFIT',
        },
        performances: [...activeBenefitPerformances, ...activeGoalPerformances],
        history: [],
    },
    {
        id: 'daiso-performance-goal',
        request: {
            brandId: 'daiso',
            amount: 10_000,
            isOnline: false,
            priority: 'PERFORMANCE',
        },
        performances: [
            { cardId: 'shinhan_heyoung', performanceMonth: '2026-08', amount: 0 },
            {
                cardId: 'shinhan_heyoung',
                performanceMonth: '2026-09',
                amount: 990_000,
            },
        ],
        history: [],
    },
];
