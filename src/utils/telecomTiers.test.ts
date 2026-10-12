import { describe, expect, it } from 'vitest';
import { getTelecomTierOptions, matchTelecomTierOption } from './telecomTiers';
import type { PromotionOffer } from '@/types';

const offer = (providerId: string, telecomTiers: string[]) => ({
    providerId,
    condition: { telecomTiers },
}) as Pick<PromotionOffer, 'providerId' | 'condition'>;

describe('telecom membership tiers', () => {
    it('lists each carrier official tiers in order, merged with tiers found in published offers', () => {
        expect(getTelecomTierOptions('kt', [])).toEqual(['일반', 'WHITE', 'SILVER', 'GOLD', 'VIP', 'VVIP']);
        expect(getTelecomTierOptions('lguplus', [offer('lguplus', ['vip', '우수'])]))
            .toEqual(['우수', 'VIP', 'VVIP']);
        expect(getTelecomTierOptions('skt', [offer('skt', ['GOLD']), offer('kt', ['WHITE'])]))
            .toEqual(['SILVER', 'GOLD', 'VIP']);
        expect(getTelecomTierOptions('t-universe', [offer('t-universe', ['프리미엄'])])).toEqual(['프리미엄']);
        expect(getTelecomTierOptions(undefined, [])).toEqual([]);
    });

    it('accepts a stored free-text tier only when it matches an option apart from letter case', () => {
        const options = ['우수', 'VIP', 'VVIP'];
        expect(matchTelecomTierOption(' vip ', options)).toBe('VIP');
        expect(matchTelecomTierOption('우수', options)).toBe('우수');
        expect(matchTelecomTierOption('골드', options)).toBeUndefined();
        expect(matchTelecomTierOption('VIP 등급', options)).toBeUndefined();
        expect(matchTelecomTierOption('', options)).toBeUndefined();
    });
});
