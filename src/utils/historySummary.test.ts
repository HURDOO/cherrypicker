import { describe, expect, it } from 'vitest';
import type { TransactionHistory } from '@/types';
import {
    getTransactionConfirmedBenefit,
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
});
