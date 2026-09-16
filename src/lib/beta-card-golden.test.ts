import { describe, expect, it } from 'vitest';
import type { TransactionHistory } from '@/types';
import { betaCardGoldenScenarios } from '@/test/fixtures/beta-card-golden';
import { calculateBestCards } from '@/utils/calculation';

const NOW = new Date('2026-09-07T03:00:00.000Z');

const calculate = (
    scenario: (typeof betaCardGoldenScenarios)[number],
    options: {
        amount?: number;
        performance?: number;
        history?: TransactionHistory[];
        confirm?: boolean;
        isOnline?: boolean;
    } = {},
) => calculateBestCards(
    options.amount ?? scenario.amount,
    scenario.target,
    [scenario.card],
    [scenario.rule],
    options.history ?? [],
    [{
        cardId: scenario.card.id,
        performanceMonth: '2026-08',
        amount: options.performance ?? scenario.performance,
    }],
    options.isOnline ?? scenario.isOnline ?? false,
    {
        allowPerformanceWaiver: false,
        now: NOW,
        confirmedConditionIds: options.confirm === false
            ? []
            : [`card-rule:${scenario.rule.id}`],
    },
)[0];

const history = (
    scenario: (typeof betaCardGoldenScenarios)[number],
    count: number,
    discountAmount: number,
    day = '07',
): TransactionHistory[] => Array.from({ length: count }, (_, index) => ({
    id: `${scenario.id}-history-${index}`,
    date: `2026-09-${day}T0${index}:00:00.000Z`,
    brandId: scenario.target.id,
    cardId: scenario.card.id,
    ruleId: scenario.rule.id,
    amount: scenario.amount,
    discountAmount,
}));

describe('beta card golden scenarios', () => {
    it('covers every current test card with an official-source scenario', () => {
        expect(new Set(betaCardGoldenScenarios.map(scenario => scenario.card.id)).size).toBe(14);
        expect(betaCardGoldenScenarios.every(scenario => (
            scenario.sourceUrl.startsWith('https://')
        ))).toBe(true);
    });

    it.each(betaCardGoldenScenarios)(
        'keeps $id at the reviewed benefit amount and certainty',
        scenario => {
            const confirmed = calculate(scenario);

            expect(confirmed).toMatchObject({
                calculatedDiscount: scenario.expectedBenefit,
                confirmedDiscount: scenario.expectedBenefit,
                conditionalDiscount: 0,
                isApplicable: true,
                matchedBenefits: [{
                    rule: { id: scenario.rule.id },
                    discount: scenario.expectedBenefit,
                    certainty: 'CONFIRMED',
                }],
            });

            if (scenario.requiresConfirmation) {
                expect(calculate(scenario, { confirm: false })).toMatchObject({
                    calculatedDiscount: scenario.expectedBenefit,
                    confirmedDiscount: 0,
                    conditionalDiscount: scenario.expectedBenefit,
                    matchedBenefits: [{ certainty: 'CONDITIONAL' }],
                });
            }
        },
    );

    it.each(betaCardGoldenScenarios.filter(scenario => (
        (scenario.rule.condition.minPerformance ?? 0) > 0
    )))(
        'keeps $id below and at its performance boundary',
        scenario => {
            const threshold = scenario.rule.condition.minPerformance!;

            expect(calculate(scenario, { performance: threshold - 1 })).toMatchObject({
                calculatedDiscount: 0,
                isApplicable: false,
            });
            expect(calculate(scenario, { performance: threshold }).calculatedDiscount)
                .toBe(scenario.expectedBenefit);
        },
    );

    it.each(betaCardGoldenScenarios.filter(scenario => (
        (scenario.rule.condition.minSpend ?? 0) > 0
    )))(
        'keeps $id below and at its minimum payment boundary',
        scenario => {
            const threshold = scenario.rule.condition.minSpend!;

            expect(calculate(scenario, { amount: threshold - 1 })).toMatchObject({
                calculatedDiscount: 0,
                isApplicable: false,
            });
            expect(calculate(scenario, { amount: threshold }).calculatedDiscount)
                .toBeGreaterThan(0);
        },
    );

    it.each(betaCardGoldenScenarios.filter(scenario => (
        scenario.rule.condition.maxSpendExclusive !== undefined
    )))(
        'keeps $id below and at its exclusive maximum payment boundary',
        scenario => {
            const threshold = scenario.rule.condition.maxSpendExclusive!;

            expect(calculate(scenario, { amount: threshold - 1 }).calculatedDiscount)
                .toBeGreaterThan(0);
            expect(calculate(scenario, { amount: threshold })).toMatchObject({
                calculatedDiscount: 0,
                isApplicable: false,
            });
        },
    );

    it.each(betaCardGoldenScenarios.filter(scenario => (
        scenario.rule.platformType === 'OFFLINE' ||
        scenario.rule.platformType === 'ONLINE' ||
        scenario.rule.platformType === 'OFFICIAL_SITE'
    )))(
        'keeps $id inside its reviewed payment channel',
        scenario => {
            const expectsOnline = scenario.rule.platformType !== 'OFFLINE';

            expect(calculate(scenario, { isOnline: expectsOnline }).calculatedDiscount)
                .toBe(scenario.expectedBenefit);
            expect(calculate(scenario, { isOnline: !expectsOnline })).toMatchObject({
                calculatedDiscount: 0,
                isApplicable: false,
            });
        },
    );

    it.each(betaCardGoldenScenarios.filter(scenario => scenario.monthlyLimit !== undefined))(
        'keeps $id at, across, and after its monthly amount limit',
        scenario => {
            const limit = scenario.monthlyLimit!;
            const beforeLimit = Math.max(0, limit - 100);

            expect(calculate(scenario, {
                history: history(scenario, 1, beforeLimit, '05'),
            }).calculatedDiscount).toBe(Math.min(100, scenario.expectedBenefit));
            expect(calculate(scenario, {
                history: history(scenario, 1, limit, '05'),
            })).toMatchObject({
                calculatedDiscount: 0,
                isApplicable: false,
            });
        },
    );

    it.each(betaCardGoldenScenarios.filter(scenario => scenario.dailyCount !== undefined))(
        'keeps $id at and after its daily count limit',
        scenario => {
            const limit = scenario.dailyCount!;

            expect(calculate(scenario, {
                history: history(scenario, limit - 1, scenario.expectedBenefit),
            }).calculatedDiscount).toBe(scenario.expectedBenefit);
            expect(calculate(scenario, {
                history: history(scenario, limit, scenario.expectedBenefit),
            })).toMatchObject({
                calculatedDiscount: 0,
                isApplicable: false,
            });
        },
    );
});
