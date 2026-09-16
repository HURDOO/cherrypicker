import { describe, expect, it } from 'vitest';
import type { CardPerformancePolicyV1, CombinationStep } from '@/types';
import {
    calculatePerformanceContribution,
    validateCardPerformancePolicy,
} from './performance-policy';

const policy: CardPerformancePolicyV1 = {
    version: 1,
    exclusionRules: [
        {
            id: 'discounted_sale',
            when: { op: 'CARD_DISCOUNT_APPLIED' },
            reason: '이 카드의 할인이 적용된 매출 전체는 전월 실적에서 제외됩니다.',
            sourceUrl: 'https://card.kbcard.com/example',
            quote: '할인 적용 받은 매출(해당 매출 전체)',
        },
        {
            id: 'excluded_payment',
            when: {
                op: 'TRANSACTION_TAG_IN',
                tags: ['INTEREST_FREE_INSTALLMENT', 'GIFT_CARD_OR_PREPAID'],
            },
            reason: '공식 실적 제외 거래입니다.',
            sourceUrl: 'https://card.kbcard.com/example',
            quote: '무이자할부 이용금액, 상품권 구입금액',
        },
    ],
};

const discountStep = (certainty: CombinationStep['certainty']): CombinationStep => ({
    id: 'discount',
    layer: 'PAYMENT_METHOD',
    providerName: 'KB국민카드',
    title: '두산 할인',
    certainty,
    amountBefore: 10_000,
    benefitAmount: 5_000,
    amountAfter: 5_000,
    isImmediate: true,
    cardId: 'doosan',
    ruleId: 'doosan_discount',
});

describe('card performance policy', () => {
    it('excludes the entire card charge when an issuer discount is confirmed', () => {
        expect(calculatePerformanceContribution({
            policy, cardId: 'doosan', cardChargeAmount: 10_000,
            steps: [discountStep('CONFIRMED')],
        })).toMatchObject({ amount: 0, status: 'CONFIRMED' });
    });

    it('holds performance only while a modeled discount exclusion is conditional', () => {
        expect(calculatePerformanceContribution({
            policy, cardId: 'doosan', cardChargeAmount: 10_000,
            steps: [discountStep('CONDITIONAL')],
        })).toMatchObject({ amount: 0, status: 'UNKNOWN' });
    });

    it('includes an ordinary purchase by default and excludes an explicitly tagged sale', () => {
        expect(calculatePerformanceContribution({
            policy, cardId: 'doosan', cardChargeAmount: 10_000, steps: [],
        })).toMatchObject({ amount: 10_000, status: 'CONFIRMED' });
        expect(calculatePerformanceContribution({
            policy, cardId: 'doosan', cardChargeAmount: 10_000, steps: [],
            transactionTag: 'STANDARD_PURCHASE',
        })).toMatchObject({ amount: 10_000, status: 'CONFIRMED' });
        expect(calculatePerformanceContribution({
            policy, cardId: 'doosan', cardChargeAmount: 10_000, steps: [],
            transactionTag: 'INTEREST_FREE_INSTALLMENT',
        })).toMatchObject({ amount: 0, status: 'CONFIRMED' });
    });

    it('credits a card without exclusions and rejects invalid policies', () => {
        expect(calculatePerformanceContribution({
            cardId: 'legacy', cardChargeAmount: 10_000, steps: [],
        })).toMatchObject({ amount: 10_000, status: 'CONFIRMED' });
        expect(calculatePerformanceContribution({
            policy: null as unknown as CardPerformancePolicyV1,
            cardId: 'legacy', cardChargeAmount: 10_000, steps: [],
        })).toMatchObject({ amount: 0, status: 'UNKNOWN' });
        expect(calculatePerformanceContribution({
            policy, cardId: 'doosan', cardChargeAmount: 10_000, steps: [],
            transactionTag: 'UNLISTED' as 'STANDARD_PURCHASE',
        })).toMatchObject({ amount: 0, status: 'UNKNOWN' });
        expect(validateCardPerformancePolicy({
            version: 1,
            exclusionRules: [{
                ...policy.exclusionRules[0],
                when: { op: 'eval', code: 'return true' },
            }],
        })).not.toEqual([]);
        expect(validateCardPerformancePolicy({
            version: 1,
            exclusionRules: [{
                ...policy.exclusionRules[0],
                when: { op: 'CARD_DISCOUNT_APPLIED', ruleIds: ['foreign_rule'] },
            }],
        }, new Set(['own_rule']))).not.toEqual([]);
        expect(validateCardPerformancePolicy({
            version: 1,
            exclusionRules: [{
                ...policy.exclusionRules[1],
                when: { op: 'TRANSACTION_TAG_IN', tags: ['TAX_OR_PUBLIC_CHARGE'] },
            }],
        })).toContain('카드 실적 거래 종류가 연결된 공식 인용으로 뒷받침되지 않습니다.');
    });
});
