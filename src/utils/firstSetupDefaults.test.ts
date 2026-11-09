import { describe, expect, it } from 'vitest';
import { defaultTelecomMembership, togglePayProvider } from '@/utils/firstSetupDefaults';

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
