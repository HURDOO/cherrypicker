import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BenefitRule, Brand, Card, TransactionHistory } from '@/types';
import { calculateBestCards } from './calculation';

const card: Card = {
    id: 'card',
    name: '테스트 카드',
    company: '테스트카드',
    color: 'bg-black',
    limitTable: [],
};

const brand: Brand = {
    id: 'merchant',
    name: '테스트 가맹점',
    categoryId: 'shopping',
};

const rule = (overrides: Partial<BenefitRule> = {}): BenefitRule => ({
    id: 'rule',
    cardId: card.id,
    includedBrands: [brand.id],
    excludedBrands: [],
    platformType: 'ALL',
    usesCardLimit: false,
    description: '10% 할인',
    detail: '',
    condition: { minPerformance: 300_000 },
    action: { type: 'PERCENT', value: 10, maxDiscount: 1_000 },
    limitConfig: {},
    ...overrides,
});

const calculate = (
    amount: number,
    rules: BenefitRule[],
    performance = 300_000,
    history: TransactionHistory[] = [],
) => calculateBestCards(
    amount,
    brand,
    [card],
    rules,
    history,
    [{ cardId: card.id, performanceMonth: '2026-08', amount: performance }],
)[0];

describe('structured card benefit conditions', () => {
    afterEach(() => vi.useRealTimers());

    it('caps a discount without rejecting a payment above the eligible amount', () => {
        const result = calculate(20_000, [rule()]);

        expect(result.calculatedDiscount).toBe(1_000);
        expect(result.isApplicable).toBe(true);
    });

    it('evaluates weekend and overnight ranges in Korea Standard Time', () => {
        vi.useFakeTimers();
        const weekendNight = rule({
            condition: {
                minPerformance: 300_000,
                daysOfWeek: ['SAT', 'SUN'],
                timeRanges: [{ startTime: '21:00', endTime: '09:00' }],
            },
        });

        vi.setSystemTime(new Date('2026-09-05T13:00:00.000Z'));
        expect(calculate(10_000, [weekendNight]).calculatedDiscount).toBe(1_000);

        vi.setSystemTime(new Date('2026-09-05T03:00:00.000Z'));
        expect(calculate(10_000, [weekendNight])).toMatchObject({
            calculatedDiscount: 0,
            reason: '혜택 적용 시간 아님',
        });

        vi.setSystemTime(new Date('2026-09-07T13:00:00.000Z'));
        expect(calculate(10_000, [weekendNight])).toMatchObject({
            calculatedDiscount: 0,
            reason: '혜택 적용 요일 아님',
        });
    });

    it('shares only the tiered monthly amount while keeping per-rule counts separate', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-05T13:00:00.000Z'));
        const tieredLimit = [
            { threshold: 300_000, limit: 1_000 },
            { threshold: 500_000, limit: 2_000 },
        ];
        const first = rule({
            id: 'first',
            includedBrands: ['other-merchant'],
            sharedGroupId: 'service-limit',
            limitConfig: {
                monthlyCount: 5,
                monthlyAmountByPerformance: tieredLimit,
                sharedFields: ['monthlyAmount'],
            },
        });
        const second = rule({
            id: 'second',
            sharedGroupId: 'service-limit',
            limitConfig: {
                monthlyCount: 10,
                monthlyAmountByPerformance: tieredLimit,
                sharedFields: ['monthlyAmount'],
            },
        });
        const history: TransactionHistory[] = [{
            id: 'past',
            date: '2026-09-02T03:00:00.000Z',
            brandId: brand.id,
            cardId: card.id,
            ruleId: first.id,
            amount: 8_000,
            discountAmount: 800,
        }];

        const result = calculate(5_000, [first, second], 300_000, history);

        expect(result.calculatedDiscount).toBe(200);
        expect(result.matchedBenefits[0]?.usage).toMatchObject({
            monthlyCount: 0,
            monthlyAmount: 800,
        });
    });

    it('does not apply a tiered benefit below its first performance threshold', () => {
        const tierOnly = rule({
            condition: {},
            limitConfig: {
                monthlyAmountByPerformance: [
                    { threshold: 300_000, limit: 10_000 },
                ],
            },
        });

        expect(calculate(10_000, [tierOnly], 0)).toMatchObject({
            calculatedDiscount: 0,
            reason: '월 혜택 한도 소진',
        });
    });

    it('uses the first qualifying tier limit during a new-card performance waiver', () => {
        const waived = rule({
            condition: {
                minPerformance: 500_000,
                performanceWaiver: 'NEW_CARD_REGISTRATION_WINDOW',
            },
            limitConfig: {
                monthlyAmountByPerformance: [
                    { threshold: 0, limit: 1_000 },
                    { threshold: 500_000, limit: 2_000 },
                ],
            },
            action: { type: 'PERCENT', value: 10 },
        });

        expect(calculate(30_000, [waived], 0)).toMatchObject({
            calculatedDiscount: 2_000,
            isApplicable: true,
        });
    });

    it('starts a fallback only after the earlier capped rule was exhausted by a prior purchase', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-05T13:00:00.000Z'));
        const special = rule({
            id: 'special',
            action: { type: 'PERCENT', value: 10 },
            limitConfig: { monthlyAmount: 1_000 },
        });
        const fallback = rule({
            id: 'fallback',
            includedBrands: [],
            condition: {
                fallbackAfterRuleIds: [special.id],
            },
            action: { type: 'PERCENT', value: 5 },
        });
        const history = (discountAmount: number): TransactionHistory[] => [{
            id: `past-${discountAmount}`,
            date: '2026-09-02T03:00:00.000Z',
            brandId: brand.id,
            cardId: card.id,
            ruleId: special.id,
            amount: discountAmount * 10,
            discountAmount,
        }];

        const crossingPurchase = calculate(10_000, [special, fallback], 300_000, history(800));
        expect(crossingPurchase).toMatchObject({
            calculatedDiscount: 200,
            matchedBenefits: [{ rule: { id: special.id }, discount: 200 }],
        });

        const laterPurchase = calculate(10_000, [special, fallback], 300_000, history(1_000));
        expect(laterPurchase).toMatchObject({
            calculatedDiscount: 500,
            matchedBenefits: [{ rule: { id: fallback.id }, discount: 500 }],
        });
    });

    it('prefers the highest qualified performance tier when capped benefits tie', () => {
        const lowTier = rule({
            id: 'tier-low',
            condition: {},
            action: { type: 'PERCENT', value: 1, maxDiscount: 100 },
        });
        const highTier = rule({
            id: 'tier-high',
            condition: { minPerformance: 1_500_000 },
            action: { type: 'PERCENT', value: 5, maxDiscount: 100 },
        });

        expect(calculate(10_000, [lowTier, highTier], 1_500_000)).toMatchObject({
            calculatedDiscount: 100,
            matchedBenefits: [{ rule: { id: highTier.id } }],
        });
    });
});
