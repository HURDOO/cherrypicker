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
    smallBenefitThreshold: 100,
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
    target: {
        kind: 'BRAND',
        brand: { id: 'brand-1', name: '테스트 브랜드', categoryId: 'cafe' },
    },
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
    it('calculates only unscoped rules and offers for a general payment', () => {
        const generalRule: BenefitRule = {
            ...cardRule,
            id: 'general-card-rule',
            includedBrands: [],
            description: '국내 가맹점 1% 할인',
            action: { type: 'PERCENT', value: 1 },
        };
        const categoryRule: BenefitRule = {
            ...cardRule,
            id: 'category-card-rule',
            includedBrands: [],
            category: 'cafe',
            description: '카페 20% 할인',
            action: { type: 'PERCENT', value: 20 },
        };
        const generalOffer = offer('general-offer', {
            brandIds: [],
            categoryIds: [],
            title: '모든 결제 500원 할인',
            action: { type: 'FLAT', value: 500 },
        });
        const categoryOffer = offer('category-offer', {
            brandIds: [],
            categoryIds: ['cafe'],
            title: '카페 3천원 할인',
            action: { type: 'FLAT', value: 3_000 },
        });

        const result = calculateBestCombinations(input([
            offer('brand-offer', {}),
            categoryOffer,
            generalOffer,
        ], {
            target: { kind: 'GENERAL', label: '동네 문구점' },
            rules: [cardRule, categoryRule, generalRule],
            profile: { ...profile, enabledPayProviderIds: [] },
        }));
        const appliedIds = new Set(
            result.combinations.flatMap(combination =>
                combination.steps.flatMap(step => [step.promotionId, step.ruleId])
            ).filter((id): id is string => Boolean(id))
        );

        expect(result).toMatchObject({
            target: { kind: 'GENERAL', label: '동네 문구점' },
            itemSpecificOffers: [],
        });
        expect(result.brandId).toBeUndefined();
        expect(appliedIds).toContain('general-offer');
        expect(appliedIds).toContain('general-card-rule');
        expect(appliedIds).not.toContain('brand-offer');
        expect(appliedIds).not.toContain('category-offer');
        expect(appliedIds).not.toContain('rule-1');
        expect(appliedIds).not.toContain('category-card-rule');
    });

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

    it('keeps stacked card benefits as separate persisted combination steps', () => {
        const instantRule: BenefitRule = {
            ...cardRule,
            id: 'instant-rule',
            condition: {
                stackableWithRuleIds: ['statement-rule'],
                applicationOrder: 1,
            },
            action: { type: 'PERCENT', value: 5, maxDiscount: 2_000 },
        };
        const statementRule: BenefitRule = {
            ...cardRule,
            id: 'statement-rule',
            condition: {
                stackableWithRuleIds: ['instant-rule'],
                applicationOrder: 2,
            },
            action: {
                type: 'PERCENT',
                value: 5,
                amountBasis: 'REMAINING_AMOUNT',
            },
        };
        const result = calculateBestCombinations(input([], {
            rules: [instantRule, statementRule],
            profile: { ...profile, enabledPayProviderIds: [] },
        }));
        const applied = result.combinations.find(combination => combination.cardId === card.id);

        expect(applied).toMatchObject({
            confirmedValue: 1_950,
            payableAmount: 18_050,
        });
        expect(applied?.steps.map(step => ({
            ruleId: step.ruleId,
            benefitAmount: step.benefitAmount,
        }))).toEqual([
            { ruleId: 'instant-rule', benefitAmount: 1_000 },
            { ruleId: 'statement-rule', benefitAmount: 950 },
        ]);
    });

    it('moves a card rule from conditional to confirmed after its check is acknowledged', () => {
        const conditionalRule: BenefitRule = {
            ...cardRule,
            condition: {
                confirmationRequired: true,
                requiredNote: '제외 거래가 아닌지 확인',
            },
        };
        const pending = calculateBestCombinations(input([], {
            rules: [conditionalRule],
            profile: { ...profile, enabledPayProviderIds: [] },
        })).combinations.find(combination => combination.cardId === card.id);
        const confirmed = calculateBestCombinations(input([], {
            rules: [conditionalRule],
            profile: { ...profile, enabledPayProviderIds: [] },
            confirmedConditionIds: ['card-rule:rule-1'],
        })).combinations.find(combination => combination.cardId === card.id);

        expect(pending).toMatchObject({
            confirmedValue: 0,
            conditionalValue: 1_000,
            requiredChecks: ['제외 거래가 아닌지 확인'],
        });
        expect(pending?.steps[0]).toMatchObject({
            certainty: 'CONDITIONAL',
            confirmationId: 'card-rule:rule-1',
        });
        expect(confirmed).toMatchObject({
            confirmedValue: 1_000,
            conditionalValue: 0,
        });
    });

    it('can prioritize a card that completes the next-month performance goal', () => {
        const highBenefitCard: Card = {
            ...card,
            id: 'card-2',
            name: '고할인 카드',
        };
        const highBenefitRule: BenefitRule = {
            ...cardRule,
            id: 'rule-2',
            cardId: highBenefitCard.id,
            action: { type: 'PERCENT', value: 20 },
        };
        const sharedInput = {
            cards: [card, highBenefitCard],
            rules: [cardRule, highBenefitRule],
            profile: { ...profile, enabledPayProviderIds: [] },
            performanceGoals: [{
                cardId: card.id,
                performanceMonth: '2026-07',
                amount: 290_000,
                targetAmount: 300_000,
                source: 'USER' as const,
                projectedBenefitAmount: 1_000,
            }],
            performanceBenefitMonth: '2026-08',
        };

        const benefitFirst = calculateBestCombinations(input([], {
            ...sharedInput,
            priority: 'BENEFIT',
        }));
        const performanceFirst = calculateBestCombinations(input([], {
            ...sharedInput,
            priority: 'PERFORMANCE',
        }));

        expect(benefitFirst.combinations[0]).toMatchObject({
            cardId: highBenefitCard.id,
            confirmedValue: 4_000,
        });
        expect(performanceFirst.combinations[0]).toMatchObject({
            cardId: card.id,
            performanceProgress: {
                currentAmount: 290_000,
                targetAmount: 300_000,
                contributionAmount: 20_000,
                projectedAmount: 310_000,
                remainingBefore: 10_000,
                remainingAfter: 0,
                targetReached: true,
            },
        });
        expect(benefitFirst.combinations[0].performanceProgress).toBeUndefined();
    });

    it('prefers goal progress when every immediate benefit is below the user threshold', () => {
        const performanceCard: Card = {
            ...card,
            id: 'performance-card',
            name: '실적 카드',
        };
        const smallBenefitCard: Card = {
            ...card,
            id: 'small-benefit-card',
            name: '소액 혜택 카드',
        };
        const smallBenefitRule: BenefitRule = {
            ...cardRule,
            id: 'small-benefit-rule',
            cardId: smallBenefitCard.id,
            action: { type: 'PERCENT', value: 0.3 },
        };
        const sharedInput = {
            cards: [performanceCard, smallBenefitCard],
            rules: [smallBenefitRule],
            profile: {
                ...profile,
                enabledPayProviderIds: [],
                smallBenefitThreshold: 100,
            },
            priority: 'BENEFIT' as const,
            performanceGoals: [{
                cardId: performanceCard.id,
                performanceMonth: '2026-07',
                amount: 290_000,
                targetAmount: 300_000,
                source: 'AUTOMATIC' as const,
                projectedBenefitAmount: 1_000,
            }],
            performanceBenefitMonth: '2026-08',
        };

        const defaultThreshold = calculateBestCombinations(input([], sharedInput));
        const lowerThreshold = calculateBestCombinations(input([], {
            ...sharedInput,
            profile: { ...sharedInput.profile, smallBenefitThreshold: 50 },
        }));

        expect(defaultThreshold.combinations[0]).toMatchObject({
            cardId: performanceCard.id,
            confirmedValue: 0,
            performanceProgress: { targetReached: true, contributionAmount: 20_000 },
        });
        expect(defaultThreshold.combinations.some(combination =>
            combination.cardId === smallBenefitCard.id && combination.confirmedValue === 60
        )).toBe(true);
        expect(lowerThreshold.combinations[0]).toMatchObject({
            cardId: smallBenefitCard.id,
            confirmedValue: 60,
        });
    });

    it('prefers the reached goal with the larger projected next-month benefit', () => {
        const lowerValueCard: Card = {
            ...card,
            id: 'lower-value-card',
            name: '낮은 예상 혜택 카드',
        };
        const higherValueCard: Card = {
            ...card,
            id: 'higher-value-card',
            name: '높은 예상 혜택 카드',
        };
        const result = calculateBestCombinations(input([], {
            cards: [lowerValueCard, higherValueCard],
            rules: [],
            profile: { ...profile, enabledPayProviderIds: [] },
            priority: 'BENEFIT',
            performanceGoals: [
                {
                    cardId: lowerValueCard.id,
                    performanceMonth: '2026-07',
                    amount: 290_000,
                    targetAmount: 300_000,
                    source: 'AUTOMATIC',
                    projectedBenefitAmount: 500,
                },
                {
                    cardId: higherValueCard.id,
                    performanceMonth: '2026-07',
                    amount: 290_000,
                    targetAmount: 300_000,
                    source: 'AUTOMATIC',
                    projectedBenefitAmount: 2_000,
                },
            ],
            performanceBenefitMonth: '2026-08',
        }));

        expect(result.combinations[0]).toMatchObject({
            cardId: higherValueCard.id,
            confirmedValue: 0,
            performanceProgress: {
                targetReached: true,
                projectedBenefitAmount: 2_000,
            },
        });
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

    it('lists card product benefits and calculates them from the eligible subtotal only', () => {
        const itemRule: BenefitRule = {
            ...cardRule,
            id: 'card-item',
            description: '팝콘 스몰세트 무료',
            condition: {
                itemSpecific: true,
                eligibleItemSummary: '팝콘 스몰세트 가격',
            },
            action: { type: 'FIXED_PRICE', value: 0 },
            limitConfig: { monthlyCount: 1 },
        };
        const withoutSubtotal = calculateBestCombinations(input([], { rules: [itemRule] }));
        const withSubtotal = calculateBestCombinations(input([], {
            rules: [itemRule],
            eligibleItemAmount: 8_000,
        }));

        expect(withoutSubtotal.itemSpecificOffers).toEqual([{
            id: 'card-item',
            title: '팝콘 스몰세트 무료',
            providerName: '테스트 카드',
            scope: 'PRODUCT_SET',
            calculationEligible: true,
            valueSemantics: 'EXACT',
            actionType: 'FIXED_PRICE',
            actionValue: 0,
            eligibleItemSummary: '팝콘 스몰세트 가격',
        }]);
        expect(withoutSubtotal.combinations.flatMap(item => item.steps)
            .some(step => step.ruleId === 'card-item')).toBe(false);
        expect(withSubtotal.combinations.flatMap(item => item.steps)
            .find(step => step.ruleId === 'card-item')?.benefitAmount).toBe(8_000);
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
