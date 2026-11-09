import { describe, expect, it } from 'vitest';
import {
    defaultTelecomMembership,
    findPerformanceTierOption,
    formatRoundWon,
    getPerformanceTierOptions,
    togglePayProvider,
} from '@/utils/firstSetupDefaults';

describe('first setup defaults', () => {
    it('starts SKT as discount type and GOLD', () => {
        expect(defaultTelecomMembership('skt', ['SILVER', 'GOLD', 'VIP'])).toEqual({
            providerId: 'skt',
            tier: 'GOLD',
            mode: 'DISCOUNT',
        });
    });

    it('uses GOLD for KT and the lowest tier where there is no GOLD', () => {
        expect(defaultTelecomMembership('kt', ['일반', 'WHITE', 'SILVER', 'GOLD', 'VIP', 'VVIP']))
            .toEqual({ providerId: 'kt', tier: 'GOLD' });
        expect(defaultTelecomMembership('lguplus', ['우수', 'VIP', 'VVIP']))
            .toEqual({ providerId: 'lguplus', tier: '우수' });
        expect(defaultTelecomMembership('lguplus', [])).toEqual({ providerId: 'lguplus' });
    });

    it('turns GoodDeal on and off with KakaoPay', () => {
        expect(togglePayProvider(['naverpay'], 'kakaopay'))
            .toEqual(['naverpay', 'kakaopay', 'kakaopay-gooddeal']);
        expect(togglePayProvider(['naverpay', 'kakaopay', 'kakaopay-gooddeal'], 'kakaopay'))
            .toEqual(['naverpay']);
        expect(togglePayProvider(['kakaopay-gooddeal'], 'kakaopay'))
            .toEqual(['kakaopay', 'kakaopay-gooddeal']);
        expect(togglePayProvider(['kakaopay', 'kakaopay-gooddeal'], 'naverpay'))
            .toEqual(['kakaopay', 'kakaopay-gooddeal', 'naverpay']);
    });
});

describe('last month spend tiers', () => {
    const naraLimitTable = [
        { threshold: 1_000_000, limit: 50_000 },
        { threshold: 500_000, limit: 30_000 },
        { threshold: 300_000, limit: 20_000 },
        { threshold: 200_000, limit: 10_000 },
        { threshold: 100_000, limit: 5_000 },
        { threshold: 0, limit: 0 },
    ];

    it('formats round won amounts the way people say them', () => {
        expect(formatRoundWon(100_000)).toBe('10만 원');
        expect(formatRoundWon(1_000_000)).toBe('100만 원');
        expect(formatRoundWon(5_000)).toBe('5천 원');
        expect(formatRoundWon(15_000)).toBe('1만 5천 원');
        expect(formatRoundWon(12_345)).toBe('12,345원');
    });

    it('lists the card tiers from below the first tier up, with each monthly cap', () => {
        expect(getPerformanceTierOptions({ id: 'hana_nara', limitTable: naraLimitTable }, [])).toEqual([
            { amount: 0, label: '10만 원 미만', detail: '실적 할인 없음' },
            { amount: 100_000, label: '10만 원 이상', detail: '월 최대 5천 원 할인' },
            { amount: 200_000, label: '20만 원 이상', detail: '월 최대 1만 원 할인' },
            { amount: 300_000, label: '30만 원 이상', detail: '월 최대 2만 원 할인' },
            { amount: 500_000, label: '50만 원 이상', detail: '월 최대 3만 원 할인' },
            { amount: 1_000_000, label: '100만 원 이상', detail: '월 최대 5만 원 할인' },
        ]);
    });

    it('uses rule spend conditions when the card lists no caps', () => {
        expect(getPerformanceTierOptions({ id: 'card', limitTable: [] }, [
            { cardId: 'card', condition: { minPerformance: 300_000 } },
            { cardId: 'other', condition: { minPerformance: 500_000 } },
        ])).toEqual([
            { amount: 0, label: '30만 원 미만' },
            { amount: 300_000, label: '30만 원 이상' },
        ]);
        expect(getPerformanceTierOptions({ id: 'card', limitTable: [] }, [])).toEqual([]);
    });

    it('finds the tier a saved spend falls in', () => {
        const options = getPerformanceTierOptions({ id: 'hana_nara', limitTable: naraLimitTable }, []);

        expect(findPerformanceTierOption(options, undefined)).toBeUndefined();
        expect(findPerformanceTierOption(options, 0)?.label).toBe('10만 원 미만');
        expect(findPerformanceTierOption(options, 350_000)?.label).toBe('30만 원 이상');
    });
});
