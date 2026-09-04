import { describe, expect, it } from 'vitest';
import type {
    BenefitRule,
    Brand,
    Card,
    PromotionOffer,
    PromotionProvider,
    UserBenefitProfile,
} from '@/types';
import { rankBenefitBrandSuggestions } from '@/utils/benefitBrandSuggestions';

const cards: Card[] = [{
    id: 'card-a',
    name: '혜택 카드',
    company: '테스트',
    color: 'bg-blue-500',
    limitTable: [{ threshold: 300_000, limit: 20_000 }],
}];

const brands: Brand[] = [
    { id: 'cu', name: 'CU', categoryId: 'convenience' },
    { id: 'store-b', name: '매장 B', categoryId: 'shopping' },
];

const providers: PromotionProvider[] = [{
    id: 'skt',
    name: 'T멤버십',
    kind: 'TELECOM',
    isActive: true,
    sortOrder: 0,
}];

const profile: UserBenefitProfile = {
    telecomMemberships: [{ providerId: 'skt', tier: 'VIP' }],
    subscriptions: [],
    enabledPayProviderIds: [],
    moneyEnabled: true,
    pointsEnabled: true,
    pointValue: 1,
    smallBenefitThreshold: 100,
};

const rule = (overrides: Partial<BenefitRule> = {}): BenefitRule => ({
    id: 'card-benefit',
    cardId: 'card-a',
    includedBrands: ['cu'],
    excludedBrands: [],
    platformType: 'ALL',
    usesCardLimit: true,
    description: 'CU 10% 카드 할인',
    detail: '',
    condition: { minPerformance: 300_000, minSpend: 5_000 },
    action: { type: 'PERCENT', value: 10, maxDiscount: 2_000 },
    limitConfig: {},
    ...overrides,
});

const promotion = (overrides: Partial<PromotionOffer> = {}): PromotionOffer => ({
    id: 'skt-cu-vip',
    providerId: 'skt',
    layer: 'DISCOUNT',
    title: 'CU VIP/GOLD 10% 할인',
    description: 'CU T멤버십 할인',
    brandIds: ['cu'],
    categoryIds: [],
    channels: ['OFFLINE'],
    action: { type: 'PERCENT', value: 10 },
    condition: {
        amountBasis: 'ORIGINAL_AMOUNT',
        applicabilityScope: 'STORE_WIDE',
        calculationMode: 'CALCULABLE',
        telecomTiers: ['VIP', 'GOLD'],
    },
    compatibility: { exclusiveGroup: 'telecom:skt:cu' },
    limitConfig: {},
    certainty: 'CONFIRMED',
    status: 'PUBLISHED',
    sourceUrl: 'https://example.com/skt/cu',
    ...overrides,
});

const rank = (overrides: Partial<Parameters<typeof rankBenefitBrandSuggestions>[0]> = {}) => (
    rankBenefitBrandSuggestions({
        brands,
        cards,
        rules: [rule()],
        history: [],
        performances: [],
        promotions: [],
        providers,
        profile,
        favoriteBrandIds: ['cu'],
        now: new Date('2026-09-04T03:00:00.000Z'),
        ...overrides,
    })
);

describe('benefit brand suggestions', () => {
    it('suggests CU from T membership even when every selected card benefit is performance-locked', () => {
        const result = rank({ promotions: [promotion()] });

        expect(result.opportunityCount).toBe(1);
        expect(result.suggestions).toEqual([expect.objectContaining({
            brand: brands[0],
            sampleAmount: 10_000,
            benefitAmount: 1_000,
            benefitCount: 1,
            methodSummary: expect.stringContaining('T멤버십'),
        })]);
    });

    it('does not claim a tier-specific telecom benefit for a different membership tier', () => {
        const result = rank({
            promotions: [promotion()],
            profile: {
                ...profile,
                telecomMemberships: [{ providerId: 'skt', tier: 'SILVER' }],
            },
        });

        expect(result).toEqual({ suggestions: [], opportunityCount: 0 });
    });

    it('combines an unlocked card benefit with membership and counts both benefit steps', () => {
        const result = rank({
            promotions: [promotion()],
            performances: [{
                cardId: 'card-a',
                performanceMonth: '2026-08',
                amount: 300_000,
            }],
        });

        expect(result.suggestions[0]).toEqual(expect.objectContaining({
            benefitAmount: 1_900,
            benefitCount: 2,
        }));
    });

    it('uses a valid example amount and keeps a full opportunity count beyond the display limit', () => {
        const result = rank({
            brands: [brands[0], brands[1]],
            rules: [
                rule(),
                rule({
                    id: 'shopping-benefit',
                    includedBrands: [],
                    category: 'shopping',
                    condition: { minSpend: 30_000 },
                    action: { type: 'FLAT', value: 5_000 },
                }),
            ],
            performances: [{
                cardId: 'card-a',
                performanceMonth: '2026-08',
                amount: 300_000,
            }],
            limit: 1,
        });

        expect(result.opportunityCount).toBe(2);
        expect(result.suggestions).toHaveLength(1);
        expect(result.suggestions[0].brand).toBe(brands[0]);
    });
});
