import { describe, expect, it } from 'vitest';
import type { BenefitCombination } from '@/types';
import {
    findAmountBrackets,
    formatBracketBenefit,
    formatBracketRange,
    pickSteadyCombination,
} from './amountBrackets';

const combination = (cardId: string, confirmedValue: number): BenefitCombination => ({
    id: cardId,
    fundingType: 'CARD',
    cardId,
    steps: [],
    confirmedValue,
    conditionalValue: 0,
    estimatedValue: 0,
    immediateDiscount: confirmedValue,
    laterReward: 0,
    payableAmount: 0,
    warnings: [],
    requiredChecks: [],
});

const identity = (value: string) => value;

describe('amount brackets', () => {
    it('keeps one bracket when the answer never changes', () => {
        const brackets = findAmountBrackets(() => 'card', identity);

        expect(brackets).toHaveLength(1);
        expect(brackets[0]).toMatchObject({ from: 1_000, to: undefined, highAmount: 100_000 });
        expect(formatBracketRange(brackets[0], true)).toBe('금액 상관없이');
    });

    it('finds a minimum spend that sits on a probe amount', () => {
        const brackets = findAmountBrackets(
            amount => (amount >= 10_000 ? 'cashback' : 'none'),
            identity,
        );

        expect(brackets.map(bracket => [bracket.from, bracket.to, bracket.key])).toEqual([
            [1_000, 10_000, 'none'],
            [10_000, undefined, 'cashback'],
        ]);
        expect(brackets[0].highAmount).toBe(9_900);
        expect(formatBracketRange(brackets[0], true)).toBe('1만 원 미만');
        expect(formatBracketRange(brackets[1], false)).toBe('1만 원 이상');
    });

    it('narrows a change between probes to 100 won, and finds two changes in one gap', () => {
        const brackets = findAmountBrackets(
            amount => (amount < 11_200 ? 'a' : amount < 13_000 ? 'b' : 'c'),
            identity,
        );

        expect(brackets.map(bracket => [bracket.from, bracket.key])).toEqual([
            [1_000, 'a'],
            [11_200, 'b'],
            [13_000, 'c'],
        ]);
        expect(formatBracketRange(brackets[1], false)).toBe('11,200원 ~ 1만 3천 원');
    });

    it('gives a tie to the combination that stays best at the next amount', () => {
        const flat = combination('flat', 1_000);
        const rate = combination('rate', 1_000);

        expect(pickSteadyCombination([flat, rate], combination('rate', 1_010))).toBe(rate);
        expect(pickSteadyCombination([flat, rate], combination('flat', 1_000))).toBe(flat);
        expect(pickSteadyCombination([flat, combination('rate', 900)], combination('rate', 1_010)))
            .toBe(flat);
    });

    it('describes the benefit as a flat amount, a rate, a capped rate, or a range', () => {
        expect(formatBracketBenefit(
            { amount: 10_000, benefit: 1_000 },
            { amount: 29_900, benefit: 1_000 },
        )).toBe('1,000원');
        expect(formatBracketBenefit(
            { amount: 1_000, benefit: 50 },
            { amount: 9_900, benefit: 495 },
        )).toBe('5%');
        expect(formatBracketBenefit(
            { amount: 30_000, benefit: 3_000 },
            { amount: 100_000, benefit: 5_000 },
        )).toBe('3,000~5,000원');
        expect(formatBracketBenefit(
            { amount: 1_000, benefit: 100 },
            { amount: 100_000, benefit: 3_000 },
            { amount: 50_500, benefit: 3_000 },
        )).toBe('10% · 최대 3,000원');
        expect(formatBracketBenefit(
            { amount: 1_000, benefit: 0 },
            { amount: 9_900, benefit: 0 },
        )).toBe('혜택 없음');
    });
});
