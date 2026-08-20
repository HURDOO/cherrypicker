import { describe, expect, it } from 'vitest';
import type { BenefitCombination } from '@/types';
import { getCombinationIntent, isSmallBenefitAmount } from './recommendationPreferences';

const combination = (
    overrides: Partial<BenefitCombination> = {},
): BenefitCombination => ({
    id: 'combination',
    fundingType: 'CARD',
    steps: [],
    confirmedValue: 0,
    conditionalValue: 0,
    estimatedValue: 0,
    immediateDiscount: 0,
    laterReward: 0,
    payableAmount: 20_000,
    warnings: [],
    requiredChecks: [],
    ...overrides,
});

describe('recommendation preferences', () => {
    it('uses a strict below-threshold small-benefit boundary', () => {
        expect(isSmallBenefitAmount(99, 100)).toBe(true);
        expect(isSmallBenefitAmount(100, 100)).toBe(false);
        expect(isSmallBenefitAmount(1, 0)).toBe(false);
        expect(isSmallBenefitAmount(0, 100)).toBe(false);
    });

    it('distinguishes benefit, small-benefit, and performance intents', () => {
        expect(getCombinationIntent(combination({ confirmedValue: 1_000 }), 100, 'BENEFIT'))
            .toBe('BENEFIT');
        expect(getCombinationIntent(combination({ confirmedValue: 60 }), 100, 'BENEFIT'))
            .toBe('SMALL_BENEFIT');
        expect(getCombinationIntent(combination({
            confirmedValue: 60,
            performanceProgress: {
                performanceMonth: '2026-08',
                benefitMonth: '2026-09',
                currentAmount: 290_000,
                targetAmount: 300_000,
                contributionAmount: 20_000,
                projectedAmount: 310_000,
                remainingBefore: 10_000,
                remainingAfter: 0,
                targetReached: true,
            },
        }), 100, 'BENEFIT')).toBe('PERFORMANCE');
    });
});
