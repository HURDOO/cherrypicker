import { describe, expect, it } from 'vitest';
import {
    canonicalizeSubscriptionProductName,
    findSubscriptionProduct,
    normalizeSubscriptionProductName,
    T_UNIVERSE_PROVIDER_ID,
} from './subscriptionProducts';

const products = [{
    providerId: T_UNIVERSE_PROVIDER_ID,
    name: 'T 우주 Big 6',
    aliases: ['T우주 Big6', 'Big 6'],
    benefitSummary: 'CU·스타벅스 할인',
}, {
    providerId: T_UNIVERSE_PROVIDER_ID,
    name: 'CU 할인',
    aliases: ['CU 할인 멤버십', 'T 우주패스 플러스 CU 할인'],
    benefitSummary: 'CU 20% 할인',
}];

describe('subscription product catalog', () => {
    it('normalizes spacing and separators used in T Universe product names', () => {
        expect(normalizeSubscriptionProductName(' T 우주패스 편의점 & 카페 '))
            .toBe(normalizeSubscriptionProductName('T우주패스 편의점카페'));
    });

    it('maps common T Universe aliases to the canonical product name', () => {
        expect(canonicalizeSubscriptionProductName(
            products,
            T_UNIVERSE_PROVIDER_ID,
            'T우주 Big6',
        ))
            .toBe('T 우주 Big 6');
        expect(canonicalizeSubscriptionProductName(
            products,
            T_UNIVERSE_PROVIDER_ID,
            'T 우주패스 플러스 CU 할인',
        )).toBe('CU 할인');
    });

    it('keeps unknown products while reporting that no benefit data is linked', () => {
        expect(findSubscriptionProduct(
            products,
            T_UNIVERSE_PROVIDER_ID,
            '알 수 없는 상품',
        ))
            .toBeUndefined();
        expect(canonicalizeSubscriptionProductName(
            products,
            T_UNIVERSE_PROVIDER_ID,
            '  알 수 없는 상품  ',
        )).toBe('알 수 없는 상품');
    });
});
