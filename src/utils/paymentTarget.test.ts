import { describe, expect, it } from 'vitest';
import type { Brand, TransactionHistory } from '@/types';
import {
    GENERAL_PAYMENT_LABEL,
    getPaymentTargetHref,
    getTransactionPaymentTarget,
    normalizeGeneralPaymentLabel,
    toPaymentTargetSnapshot,
} from './paymentTarget';

const brands: Brand[] = [{ id: 'daiso', name: '다이소', categoryId: 'life' }];

describe('payment targets', () => {
    it('keeps general payments separate from catalog brands', () => {
        expect(toPaymentTargetSnapshot({
            kind: 'GENERAL',
            label: '  동네   문구점  ',
        })).toEqual({ kind: 'GENERAL', label: '동네 문구점' });
        expect(normalizeGeneralPaymentLabel('')).toBe(GENERAL_PAYMENT_LABEL);
        expect(getPaymentTargetHref('/', { kind: 'GENERAL', label: '동네 문구점' }))
            .toBe('/?general=1');
    });

    it('restores legacy brand records as brand targets', () => {
        const transaction = {
            id: 'tx-1',
            date: '2026-09-05T00:00:00.000Z',
            brandId: 'daiso',
            amount: 10_000,
            discountAmount: 0,
        } satisfies TransactionHistory;

        expect(getTransactionPaymentTarget(transaction, brands)).toEqual({
            kind: 'BRAND',
            brandId: 'daiso',
            label: '다이소',
        });
        expect(getPaymentTargetHref('/', getTransactionPaymentTarget(transaction, brands)))
            .toBe('/?brand=daiso');
    });
});
