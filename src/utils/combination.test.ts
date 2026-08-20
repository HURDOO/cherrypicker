import { describe, expect, it } from 'vitest';
import type {
    BenefitRule,
    Card,
    PromotionOffer,
    PromotionProvider,
    UserBenefitProfile,
} from '@/types';
import {
    calculateBestCombinations,
    createDeterministicCombinationId,
    type CombinationEngineInput,
    type CombinationEngineMetrics,
} from './combination';

const providers: PromotionProvider[] = [
    { id: 'skt', name: 'T멤버십', kind: 'TELECOM', isActive: true, sortOrder: 0 },
    { id: 't-universe', name: 'T우주', kind: 'SUBSCRIPTION', isActive: true, sortOrder: 1 },
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
    subscriptions: [{ providerId: 't-universe', productName: '우주패스 쇼핑' }],
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
    it('creates browser-safe deterministic combination IDs', () => {
        const value = JSON.stringify({
            payProviderId: 'naverpay',
            fundingType: 'CARD',
            cardId: 'card-1',
            steps: ['promotion:npay', 'card:card-1:rule-1'],
        });

        expect(createDeterministicCombinationId(value)).toMatch(/^[a-f0-9]{20}$/);
        expect(createDeterministicCombinationId(value))
            .toBe(createDeterministicCombinationId(value));
        expect(createDeterministicCombinationId(`${value}:changed`))
            .not.toBe(createDeterministicCombinationId(value));
    });

    it('bounds combinatorial search and reports calculation metrics', () => {
        const stackableOffers = Array.from({ length: 8 }, (_, index) => offer(
            `stackable-${index}`,
            {
                action: { type: 'FLAT', value: 100 + index },
                compatibility: { allowStackWithSameLayer: true },
            }
        ));
        let measured: CombinationEngineMetrics | undefined;

        const result = calculateBestCombinations(input(stackableOffers, {
            profile: { ...profile, enabledPayProviderIds: [] },
        }), {
            maxWorkingStates: 8,
            onMetrics: metrics => {
                measured = metrics;
            },
        });

        expect(measured).toMatchObject({
            matchingOfferCount: 8,
            calculableOfferCount: 8,
            searchSpaceLimited: true,
            returnedCombinationCount: result.combinations.length,
        });
        expect(measured?.peakWorkingStateCount).toBeGreaterThan(8);
        expect(measured?.prunedWorkingStateCount).toBeGreaterThan(0);
        expect(measured?.stateTransitionCount).toBeGreaterThan(0);
        expect(measured?.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.combinations).toHaveLength(8);
        expect(result.combinations.every(combination =>
            combination.warnings.some(warning => warning.includes('상위 조합'))
        )).toBe(true);
    });

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
            scope: 'PRODUCT_SET',
            calculationEligible: true,
            valueSemantics: 'EXACT',
            actionType: 'PERCENT',
            actionValue: 10,
            requiredNote: '행사 상품 합계 입력',
        }]);
        expect(result.combinations[0].steps.some(step => step.promotionId === 'cu-items')).toBe(false);
    });

    it('shows an up-to item offer as information but never applies it to the maximum', () => {
        const result = calculateBestCombinations(input([
            offer('seveneleven-wine', {
                title: '세븐일레븐 최대 40% 할인',
                action: { type: 'PERCENT', value: 40, valueSemantics: 'UP_TO' },
                condition: {
                    amountBasis: 'ELIGIBLE_ITEM_AMOUNT',
                    applicabilityScope: 'CATEGORY',
                    itemSpecific: true,
                    eligibleItemSummary: '와인/샴페인 행사 대상 상품',
                },
            }),
        ], { eligibleItemAmount: 20_000 }));

        expect(result.itemSpecificOffers).toEqual([]);
        expect(result.informationalOffers[0]).toMatchObject({
            id: 'seveneleven-wine',
            valueSemantics: 'UP_TO',
            calculationMode: 'INFORMATION_ONLY',
            actionValue: 40,
            scope: 'CATEGORY',
        });
        expect(result.combinations.flatMap(item => item.steps).some(step =>
            step.promotionId === 'seveneleven-wine'
        )).toBe(false);
    });

    it('keeps lottery information out and applies user-confirmable eligibility only after confirmation', () => {
        const lottery = offer('lottery', {
            providerId: 'naverpay',
            layer: 'POST_REWARD',
            action: { type: 'FLAT', value: 12_000 },
            condition: {
                amountBasis: 'REMAINING_AMOUNT',
                applicabilityScope: 'CUSTOMER_TARGETED',
                calculationMode: 'INFORMATION_ONLY',
                requiredNote: '추첨형 혜택',
            },
        });
        const teenager = offer('teenager', {
            providerId: 'naverpay',
            layer: 'POST_REWARD',
            action: { type: 'FLAT', value: 2_000 },
            condition: {
                amountBasis: 'REMAINING_AMOUNT',
                applicabilityScope: 'CUSTOMER_TARGETED',
                calculationMode: 'CONDITIONAL',
                confirmationRequired: true,
                requiredNote: '10대 대상 여부 확인',
            },
            compatibility: { requiredPayProviderIds: ['naverpay'] },
        });
        const before = calculateBestCombinations(input([lottery, teenager]));
        const after = calculateBestCombinations(input([lottery, teenager], {
            confirmedConditionIds: ['teenager'],
        }));

        expect(before.informationalOffers[0].id).toBe('lottery');
        expect(before.combinations.flatMap(item => item.steps).some(step =>
            step.promotionId === 'lottery'
        )).toBe(false);
        expect(before.combinations.some(item => item.conditionalValue === 2_000)).toBe(true);
        expect(after.combinations.some(item => item.confirmedValue >= 2_000 &&
            item.steps.some(step => step.promotionId === 'teenager')
        )).toBe(true);
    });

    it('never includes unknown or customer-targeted offers in the fast headline maximum', () => {
        const result = calculateBestCombinations(input([
            offer('store-wide', {
                action: { type: 'FLAT', value: 1_000 },
                condition: {
                    amountBasis: 'ORIGINAL_AMOUNT',
                    applicabilityScope: 'STORE_WIDE',
                    headlineEligible: true,
                },
            }),
            offer('unknown', {
                action: { type: 'FLAT', value: 10_000 },
                condition: {
                    amountBasis: 'ORIGINAL_AMOUNT',
                    applicabilityScope: 'UNKNOWN',
                    headlineEligible: false,
                },
            }),
            offer('targeted', {
                action: { type: 'FLAT', value: 20_000 },
                condition: {
                    amountBasis: 'ORIGINAL_AMOUNT',
                    applicabilityScope: 'CUSTOMER_TARGETED',
                    headlineEligible: false,
                },
            }),
        ]));

        expect(result.combinations[0].steps.some(step => step.promotionId === 'store-wide')).toBe(true);
        expect(result.combinations.flatMap(item => item.steps).some(step =>
            step.promotionId === 'unknown' || step.promotionId === 'targeted'
        )).toBe(false);
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

    it('treats a flat post reward as later value instead of an immediate discount', () => {
        const result = calculateBestCombinations(input([
            offer('npay-flat-reward', {
                providerId: 'naverpay',
                layer: 'POST_REWARD',
                action: { type: 'FLAT', value: 3_000 },
                compatibility: {
                    requiredPayProviderIds: ['naverpay'],
                    allowedFundingTypes: ['MONEY'],
                },
            }),
        ]));
        const combination = result.combinations.find(item =>
            item.payProviderId === 'naverpay' &&
            item.fundingType === 'MONEY' &&
            item.steps.some(step => step.promotionId === 'npay-flat-reward')
        );

        expect(combination?.laterReward).toBe(3_000);
        expect(combination?.immediateDiscount).toBe(0);
        expect(combination?.payableAmount).toBe(20_000);
    });

    it('matches telecom tiers without requiring exact letter casing', () => {
        const result = calculateBestCombinations(input([
            offer('vip-only', {
                condition: { telecomTiers: ['VIP'] },
            }),
        ], {
            profile: {
                ...profile,
                telecomMemberships: [{ providerId: 'skt', tier: 'vip' }],
            },
        }));

        expect(result.combinations.some(combination =>
            combination.steps.some(step => step.promotionId === 'vip-only')
        )).toBe(true);
    });

    it('uses a T Universe offer only when the required product is subscribed', () => {
        const tUniverseOffer = offer('t-universe-offer', {
            providerId: 't-universe',
            condition: {
                requiredSubscriptionProducts: ['우주패스쇼핑'],
            },
        });
        const eligible = calculateBestCombinations(input([tUniverseOffer]));
        const ineligible = calculateBestCombinations(input([tUniverseOffer], {
            profile: {
                ...profile,
                subscriptions: [{
                    providerId: 't-universe',
                    productName: '다른 구독 상품',
                }],
            },
        }));

        expect(eligible.combinations.some(combination =>
            combination.steps.some(step => (
                step.promotionId === 't-universe-offer' &&
                step.providerName === 'T우주 · 우주패스 쇼핑'
            ))
        )).toBe(true);
        expect(ineligible.combinations.some(combination =>
            combination.steps.some(step => step.promotionId === 't-universe-offer')
        )).toBe(false);
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

    it('caps a promotion at its remaining daily amount limit', () => {
        const capped = offer('daily-cap', {
            action: { type: 'PERCENT', value: 20 },
            limitConfig: { dailyAmount: 5_000, monthlyAmount: 30_000 },
        });
        const result = calculateBestCombinations(input([capped], {
            amount: 20_000,
            promotionUsage: {
                'daily-cap': {
                    dailyCount: 1,
                    dailyAmount: 4_500,
                    monthlyCount: 1,
                    yearlyCount: 1,
                    monthlyAmount: 4_500,
                },
            },
        }));
        const applied = result.combinations.find(combination =>
            combination.steps.some(step => step.promotionId === 'daily-cap')
        );

        expect(applied?.steps.find(step => step.promotionId === 'daily-cap')?.benefitAmount)
            .toBe(500);
    });
});
