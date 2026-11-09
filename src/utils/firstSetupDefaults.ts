import type { TelecomMembership } from '@/types';

// GoodDeal is paid with KakaoPay, so first setup turns it on and off with KakaoPay.
export const KAKAOPAY_PROVIDER_ID = 'kakaopay';
const GOODDEAL_PROVIDER_ID = 'kakaopay-gooddeal';

/** Defaults for a newly chosen telecom membership, changeable in first setup or settings. */
export function defaultTelecomMembership(providerId: string, tierOptions: string[]): TelecomMembership {
    // GOLD where it exists, otherwise the lowest tier so benefits are not overstated.
    const tier = tierOptions.find(option => option.toUpperCase() === 'GOLD') ?? tierOptions[0];
    return {
        providerId,
        ...(tier && { tier }),
        ...(providerId === 'skt' && { mode: 'DISCOUNT' as const }),
    };
}

/** Turning KakaoPay on or off also turns GoodDeal on or off. */
export function togglePayProvider(enabledIds: string[], providerId: string): string[] {
    const linked = providerId === KAKAOPAY_PROVIDER_ID
        ? [KAKAOPAY_PROVIDER_ID, GOODDEAL_PROVIDER_ID]
        : [providerId];
    return enabledIds.includes(providerId)
        ? enabledIds.filter(id => !linked.includes(id))
        : [...enabledIds.filter(id => !linked.includes(id)), ...linked];
}
