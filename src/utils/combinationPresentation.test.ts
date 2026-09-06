import { describe, expect, it } from 'vitest';
import type { BenefitCombination, CombinationStep } from '@/types';
import {
    BENEFIT_STATUS_LABELS,
    getCombinationMethodSummary,
    getCombinationRecommendationReason,
    getUnresolvedConditionSteps,
} from './combinationPresentation';

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

    it('uses the three user-facing benefit states consistently', () => {
        expect(BENEFIT_STATUS_LABELS).toEqual({
            CONFIRMED: '확정',
            CONDITIONAL: '조건 충족 시',
            ESTIMATED: '정보 제공',
        });
        const pending = combination({
            steps: [step({ certainty: 'CONDITIONAL', requiresConfirmation: true })],
            confirmedValue: 0,
            conditionalValue: 1_000,
        });

        expect(getUnresolvedConditionSteps(pending)).toHaveLength(1);
    });

    it('explains benefit and performance recommendations in one short sentence', () => {
        expect(getCombinationRecommendationReason(combination(), 100, 'BENEFIT'))
            .toBe('매장 할인으로 확정 혜택 1,000원을 받아요.');
        expect(getCombinationRecommendationReason(combination({
            steps: [],
            confirmedValue: 0,
            immediateDiscount: 0,
            payableAmount: 10_000,
            performanceProgress: {
                performanceMonth: '2026-09',
                benefitMonth: '2026-10',
                currentAmount: 290_000,
                targetAmount: 300_000,
                contributionAmount: 10_000,
                projectedAmount: 300_000,
                remainingBefore: 10_000,
                remainingAfter: 0,
                targetReached: true,
                goalSource: 'AUTOMATIC',
                projectedBenefitAmount: 1_000,
            },
        }), 100, 'BENEFIT')).toBe(
            '이번 결제로 다음 달 카드 혜택 목표를 채울 수 있어요.'
        );
    });
});
