import { describe, expect, it } from 'vitest';
import type {
    BenefitRule,
    Card,
    PromotionOffer,
    PromotionProvider,
    UserBenefitProfile,
} from '@/types';
import { calculateBestCombinations, type CombinationEngineInput } from './combination';

const providers: PromotionProvider[] = [
    { id: 'skt', name: 'T멤버십', kind: 'TELECOM', isActive: true, sortOrder: 0 },
    { id: 'naverpay', name: 'Npay', kind: 'PAY', isActive: true, sortOrder: 1 },
    {
        id: 'kakaopay-gooddeal',
        name: '카카오페이 굿딜',
        kind: 'GOODDEAL',
        isActive: true,
        sortOrder: 2,
    },
];

const card: Card = {
    id: 'card-1',
    name: '테스트 카드',
    company: '테스트카드',
    color: 'bg-blue-500',
    limitTable: [],
};

const cardRule: BenefitRule = {
    id: 'rule-1',
    cardId: card.id,
    includedBrands: ['brand-1'],
    excludedBrands: [],
    description: '브랜드 5% 할인',
    detail: '',
    condition: {},
    action: { type: 'PERCENT', value: 5 },
    limitConfig: {},
};

const profile: UserBenefitProfile = {
    telecomMemberships: [{ providerId: 'skt', tier: 'VIP' }],
    enabledPayProviderIds: ['naverpay', 'kakaopay-gooddeal'],
    moneyEnabled: true,
    pointsEnabled: true,
    pointValue: 1,
};

const offer = (
    id: string,
    overrides: Partial<PromotionOffer>
): PromotionOffer => ({
    id,
    providerId: 'skt',
    layer: 'DISCOUNT',
    title: id,
    description: '',
    brandIds: ['brand-1'],
    categoryIds: [],
    channels: ['ALL'],
    action: { type: 'PERCENT', value: 10 },
    condition: { amountBasis: 'REMAINING_AMOUNT' },
    compatibility: {},
    limitConfig: {},
    certainty: 'CONFIRMED',
    status: 'PUBLISHED',
    sourceUrl: 'https://example.com',
    ...overrides,
});

const input = (
    promotions: PromotionOffer[],
    overrides: Partial<CombinationEngineInput> = {}
): CombinationEngineInput => ({
    brandId: 'brand-1',
    brand: { id: 'brand-1', name: '테스트 브랜드', categoryId: 'cafe' },
    amount: 20_000,
    isOnline: false,
    cards: [card],
    rules: [cardRule],
    history: [],
    performances: [],
    promotions,
    providers,
    profile,
    now: new Date('2026-07-24T00:00:00.000Z'),
    ...overrides,
});

describe('calculateBestCombinations', () => {
    it('applies discount, pay, and verified card benefits in sequence', () => {
        const promotions = [
            offer('telecom', {}),
            offer('npay', {
                providerId: 'naverpay',
                layer: 'PAY',
                action: { type: 'FLAT', value: 1_000 },
                compatibility: {
                    requiredPayProviderIds: ['naverpay'],
                    allowedFundingTypes: ['CARD'],
                },
            }),
        ];
        const result = calculateBestCombinations(input(promotions, {
            routeVerifications: [{
                brandId: 'brand-1',
                payProviderId: 'naverpay',
                cardCompany: '테스트카드',
                channel: 'OFFLINE',
                cardBenefitEligible: true,
                certainty: 'CONFIRMED',
                evidenceUrl: 'https://example.com/evidence',
                verifiedAt: '2026-07-23T00:00:00.000Z',
            }],
        }));
        const best = result.combinations[0];

        expect(best.payProviderId).toBe('naverpay');
        expect(best.fundingType).toBe('CARD');
        expect(best.confirmedValue).toBe(3_850);
        expect(best.payableAmount).toBe(16_150);
        expect(best.steps.map(step => step.layer)).toEqual([
            'DISCOUNT',
            'PAY',
            'PAYMENT_METHOD',
        ]);
    });

    it('keeps an unverified pay-routed card benefit out of the confirmed total', () => {
        const result = calculateBestCombinations(input([
            offer('npay', {
                providerId: 'naverpay',
                layer: 'PAY',
                action: { type: 'FLAT', value: 1_000 },
                compatibility: { requiredPayProviderIds: ['naverpay'] },
            }),
        ]));
        const payCard = result.combinations.find(combination =>
            combination.payProviderId === 'naverpay' &&
            combination.fundingType === 'CARD' &&
            combination.steps.some(step => step.layer === 'PAY')
        );

        expect(payCard?.confirmedValue).toBe(1_000);
        expect(payCard?.estimatedValue).toBe(950);
        expect(payCard?.warnings.join(' ')).toContain('MCC');
    });

    it('does not add a card benefit to money or points funding', () => {
        const result = calculateBestCombinations(input([
            offer('npay', {
                providerId: 'naverpay',
                layer: 'PAY',
                action: { type: 'FLAT', value: 1_000 },
                compatibility: { requiredPayProviderIds: ['naverpay'] },
            }),
        ]));
        const money = result.combinations.find(combination =>
            combination.payProviderId === 'naverpay' &&
            combination.fundingType === 'MONEY' &&
            combination.steps.some(step => step.layer === 'PAY')
        );

        expect(money?.steps.some(step => step.layer === 'PAYMENT_METHOD')).toBe(false);
        expect(money?.confirmedValue).toBe(1_000);
    });

    it('does not interrupt the basic flow for item-specific offers without an eligible subtotal', () => {
        const result = calculateBestCombinations(input([
            offer('cu-items', {
                condition: {
                    amountBasis: 'ELIGIBLE_ITEM_AMOUNT',
                    itemSpecific: true,
                    requiredNote: '행사 상품 합계 입력',
                },
            }),
        ]));

        expect(result.itemSpecificOffers).toEqual([{
            id: 'cu-items',
            title: 'cu-items',
            providerName: 'T멤버십',
            requiredNote: '행사 상품 합계 입력',
        }]);
        expect(result.combinations[0].steps.some(step => step.promotionId === 'cu-items')).toBe(false);
    });

    it('applies a card benefit only to a Gooddeal gift certificate residual', () => {
        const gooddeal = offer('gooddeal', {
            providerId: 'kakaopay-gooddeal',
            layer: 'PAY',
            action: { type: 'GIFT_CERTIFICATE', value: 9_000, faceValue: 10_000 },
            compatibility: {
                requiredPayProviderIds: ['kakaopay-gooddeal'],
                allowedFundingTypes: ['CARD', 'MONEY', 'POINTS', 'GIFT_CERTIFICATE'],
                allowResidualPayment: true,
            },
        });
        const result = calculateBestCombinations(input([gooddeal], {
            amount: 15_000,
            routeVerifications: [{
                brandId: 'brand-1',
                payProviderId: 'kakaopay-gooddeal',
                cardCompany: '테스트카드',
                channel: 'OFFLINE',
                cardBenefitEligible: true,
                certainty: 'CONFIRMED',
                evidenceUrl: 'https://example.com/evidence',
                verifiedAt: '2026-07-23T00:00:00.000Z',
            }],
        }));
        const gooddealCard = result.combinations.find(combination =>
            combination.payProviderId === 'kakaopay-gooddeal' &&
            combination.fundingType === 'CARD' &&
            combination.steps.some(step => step.promotionId === 'gooddeal')
        );

        expect(gooddealCard?.confirmedValue).toBe(1_250);
        expect(gooddealCard?.payableAmount).toBe(13_750);
        expect(gooddealCard?.steps.at(-1)?.benefitAmount).toBe(250);
    });

    it('ranks a smaller confirmed benefit above a larger conditional benefit', () => {
        const result = calculateBestCombinations(input([
            offer('confirmed', { action: { type: 'FLAT', value: 1_000 } }),
            offer('conditional', {
                providerId: 'naverpay',
                layer: 'PAY',
                action: { type: 'FLAT', value: 5_000 },
                condition: {
                    amountBasis: 'REMAINING_AMOUNT',
                    requiresEnrollment: true,
                },
                compatibility: { requiredPayProviderIds: ['naverpay'] },
            }),
        ]));

        expect(result.combinations[0].confirmedValue).toBeGreaterThanOrEqual(1_000);
        expect(result.combinations[0].steps.some(step => step.promotionId === 'confirmed')).toBe(true);
    });

    it('evaluates a pay minimum spend after the preceding discount', () => {
        const result = calculateBestCombinations(input([
            offer('telecom', {}),
            offer('npay-threshold', {
                providerId: 'naverpay',
                layer: 'PAY',
                action: { type: 'FLAT', value: 2_000 },
                condition: {
                    amountBasis: 'REMAINING_AMOUNT',
                    minSpend: 19_000,
                },
                compatibility: { requiredPayProviderIds: ['naverpay'] },
            }),
        ]));
        const stacked = result.combinations.find(combination =>
            combination.steps.some(step => step.promotionId === 'telecom') &&
            combination.steps.some(step => step.promotionId === 'npay-threshold')
        );

        expect(stacked).toBeUndefined();
    });

    it('caps a promotion at its remaining monthly amount limit', () => {
        const capped = offer('monthly-cap', {
            action: { type: 'FLAT', value: 2_000 },
            limitConfig: { monthlyAmount: 5_000 },
        });
        const result = calculateBestCombinations(input([capped], {
            promotionUsage: {
                'monthly-cap': {
                    dailyCount: 0,
                    monthlyCount: 1,
                    yearlyCount: 1,
                    monthlyAmount: 4_500,
                },
            },
        }));
        const applied = result.combinations.find(combination =>
            combination.steps.some(step => step.promotionId === 'monthly-cap')
        );

        expect(applied?.steps.find(step => step.promotionId === 'monthly-cap')?.benefitAmount)
            .toBe(500);
    });
});
