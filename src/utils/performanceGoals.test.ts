import { describe, expect, it } from 'vitest';
import type { BenefitRule, Brand, Card } from '@/types';
import { derivePerformanceGoals } from './performanceGoals';

const brand: Brand = {
    id: 'brand-1',
    name: '테스트 매장',
    categoryId: 'shopping',
};

const usefulCard: Card = {
    id: 'useful-card',
    name: '유용한 카드',
    company: '테스트카드',
    color: 'bg-blue-500',
    limitTable: [
        { threshold: 100_000, limit: 5_000 },
        { threshold: 300_000, limit: 10_000 },
    ],
};

const irrelevantCard: Card = {
    ...usefulCard,
    id: 'irrelevant-card',
    name: '다른 매장 카드',
};

const rule = (
    id: string,
    cardId: string,
    minPerformance: number,
    value: number,
    includedBrands = [brand.id],
): BenefitRule => ({
    id,
    cardId,
    includedBrands,
    excludedBrands: [],
    description: `${value}% 할인`,
    detail: '',
    condition: { minPerformance },
    action: { type: 'PERCENT', value },
    limitConfig: {},
});

const baseInput = {
    cards: [usefulCard, irrelevantCard],
    rules: [
        rule('useful-low', usefulCard.id, 100_000, 5),
        rule('useful-high', usefulCard.id, 300_000, 10),
        rule('irrelevant', irrelevantCard.id, 100_000, 20, ['other-brand']),
    ],
    performances: [],
    performanceMonth: '2026-08',
    target: { kind: 'BRAND' as const, brand },
    amount: 20_000,
    isOnline: false,
};

describe('derivePerformanceGoals', () => {
    it('chooses the tier with the highest expected benefit for the current purchase context', () => {
        expect(derivePerformanceGoals(baseInput)).toEqual([{
            cardId: usefulCard.id,
            performanceMonth: '2026-08',
            amount: 0,
            targetAmount: 300_000,
            source: 'AUTOMATIC',
            projectedBenefitAmount: 2_000,
        }]);
    });

    it('uses a user target as a card-specific override', () => {
        expect(derivePerformanceGoals({
            ...baseInput,
            performances: [{
                cardId: usefulCard.id,
                performanceMonth: '2026-08',
                amount: 50_000,
                targetAmount: 150_000,
            }],
        })).toContainEqual({
            cardId: usefulCard.id,
            performanceMonth: '2026-08',
            amount: 50_000,
            targetAmount: 150_000,
            source: 'USER',
            projectedBenefitAmount: 1_000,
        });
    });

    it('excludes a user target that is already reached', () => {
        const goals = derivePerformanceGoals({
            ...baseInput,
            performances: [{
                cardId: usefulCard.id,
                performanceMonth: '2026-08',
                amount: 150_000,
                targetAmount: 150_000,
            }],
        });

        expect(goals.some(goal => goal.cardId === usefulCard.id)).toBe(false);
    });
});
