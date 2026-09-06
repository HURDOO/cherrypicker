import { describe, expect, it } from 'vitest';
import type { TransactionHistory } from '@/types';
import {
    getTransactionCombinationSummary,
    getTransactionConfirmedCardBenefit,
    getTransactionConfirmedBenefit,
    getTransactionConfirmedIntegratedCardBenefit,
    getTransactionConfirmedPayableAmount,
    getTransactionPerformanceContribution,
    summarizeTransactions,
} from './historySummary';

const createTransaction = (
    overrides: Partial<TransactionHistory> = {}
): TransactionHistory => ({
    id: 'transaction-1',
    date: '2026-09-06T03:00:00.000Z',
    amount: 10_000,
    discountAmount: 0,
    ...overrides,
});

describe('history summary', () => {
    it('uses the confirmed combination value for a newly recorded transaction', () => {
        const transaction = createTransaction({
            confirmedValue: 1_000,
            payableAmount: 9_000,
        });

        expect(getTransactionConfirmedBenefit(transaction)).toBe(1_000);
        expect(summarizeTransactions([transaction])).toEqual({
            totalSpend: 10_000,
            totalConfirmedBenefit: 1_000,
            confirmedBenefitRate: 10,
        });
    });

    it('falls back to the legacy discount amount', () => {
        const transaction = createTransaction({ discountAmount: 500 });

        expect(getTransactionConfirmedBenefit(transaction)).toBe(500);
        expect(summarizeTransactions([transaction]).confirmedBenefitRate).toBe(5);
    });

    it('returns a zero rate when there is no recorded spend', () => {
        expect(summarizeTransactions([])).toEqual({
            totalSpend: 0,
            totalConfirmedBenefit: 0,
            confirmedBenefitRate: 0,
        });
    });

    it('reads confirmed payment, card usage, performance, and catalog data from the snapshot', () => {
        const transaction = createTransaction({
            cardId: 'card-1',
            confirmedValue: 1_500,
            conditionalValue: 2_000,
            estimatedValue: 500,
            payableAmount: 6_000,
            performanceContributionAmount: 8_500,
            combinationSnapshot: {
                cardName: '테스트 카드',
                payProviderName: '테스트페이',
                fundingType: 'CARD',
                catalogVersion: 'catalog-v3',
                cardChargeAmount: 8_500,
                steps: [
                    {
                        id: 'confirmed-promotion',
                        layer: 'DISCOUNT',
                        providerName: '멤버십',
                        title: '즉시 할인',
                        certainty: 'CONFIRMED',
                        benefitAmount: 1_000,
                        isImmediate: true,
                    },
                    {
                        id: 'confirmed-card',
                        layer: 'PAYMENT_METHOD',
                        providerName: '카드사',
                        title: '카드 할인',
                        certainty: 'CONFIRMED',
                        benefitAmount: 500,
                        isImmediate: true,
                        cardId: 'card-1',
                        ruleId: 'rule-1',
                        usesCardLimit: true,
                    },
                    {
                        id: 'conditional',
                        layer: 'PAY',
                        providerName: '테스트페이',
                        title: '응모 혜택',
                        certainty: 'CONDITIONAL',
                        benefitAmount: 2_000,
                        isImmediate: true,
                    },
                    {
                        id: 'information',
                        layer: 'POST_REWARD',
                        providerName: '테스트페이',
                        title: '승인 경로 참고',
                        certainty: 'ESTIMATED',
                        benefitAmount: 500,
                        isImmediate: false,
                    },
                    {
                        id: 'separate-card-limit',
                        layer: 'PAYMENT_METHOD',
                        providerName: '카드사',
                        title: '별도 한도 카드 할인',
                        certainty: 'CONFIRMED',
                        benefitAmount: 300,
                        isImmediate: true,
                        cardId: 'card-1',
                        ruleId: 'rule-2',
                        usesCardLimit: false,
                    },
                ],
            },
        });

        expect(getTransactionConfirmedPayableAmount(transaction)).toBe(8_200);
        expect(getTransactionConfirmedCardBenefit(transaction)).toBe(800);
        expect(getTransactionConfirmedIntegratedCardBenefit(transaction)).toBe(500);
        expect(getTransactionPerformanceContribution(transaction)).toBe(8_500);
        expect(getTransactionCombinationSummary(transaction)).toMatchObject({
            cardName: '테스트 카드',
            payProviderName: '테스트페이',
            fundingType: 'CARD',
            catalogVersion: 'catalog-v3',
            cardChargeAmount: 8_500,
            steps: [
                { id: 'confirmed-promotion', certainty: 'CONFIRMED' },
                { id: 'confirmed-card', certainty: 'CONFIRMED', usesCardLimit: true },
                { id: 'conditional', certainty: 'CONDITIONAL' },
                { id: 'information', certainty: 'ESTIMATED' },
                { id: 'separate-card-limit', certainty: 'CONFIRMED', usesCardLimit: false },
            ],
        });
    });
});
