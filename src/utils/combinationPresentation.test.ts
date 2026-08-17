import { describe, expect, it } from 'vitest';
import type { BenefitCombination, CombinationStep } from '@/types';
import { getCombinationMethodSummary } from './combinationPresentation';

function step(overrides: Partial<CombinationStep> = {}): CombinationStep {
    return {
        id: 'telecom',
        layer: 'DISCOUNT',
        providerName: 'T멤버십',
        title: '매장 할인',
        certainty: 'CONFIRMED',
        amountBefore: 10_000,
        benefitAmount: 1_000,
        amountAfter: 9_000,
        isImmediate: true,
        ...overrides,
    };
}

function combination(
    overrides: Partial<BenefitCombination> = {}
): BenefitCombination {
    return {
        id: 'combination',
        fundingType: 'CARD',
        cardId: 'shinhan-narasarang',
        cardName: '신한 나라사랑카드',
        steps: [step()],
        confirmedValue: 1_000,
        conditionalValue: 0,
        estimatedValue: 0,
        immediateDiscount: 1_000,
        laterReward: 0,
        payableAmount: 9_000,
        warnings: [],
        requiredChecks: [],
        ...overrides,
    };
}

describe('combination method summary', () => {
    it('shows a membership before a directly used card', () => {
        expect(getCombinationMethodSummary(combination())).toBe(
            'T멤버십 + 신한 나라사랑카드'
        );
    });

    it('includes a pay provider and removes duplicate provider names', () => {
        expect(getCombinationMethodSummary(combination({
            payProviderId: 'naverpay',
            payProviderName: 'Npay',
            steps: [
                step(),
                step({ id: 'npay-discount', providerName: 'Npay' }),
            ],
        }))).toBe('T멤버십 + Npay + 신한 나라사랑카드');
    });

    it('uses the funding label when a pay balance is required', () => {
        expect(getCombinationMethodSummary(combination({
            payProviderId: 'naverpay',
            payProviderName: 'Npay',
            fundingType: 'MONEY',
            cardId: undefined,
            cardName: undefined,
            steps: [],
        }))).toBe('Npay + 페이머니');
    });
});
