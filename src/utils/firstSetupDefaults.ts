import type { BenefitRule, Card, TelecomMembership } from '@/types';

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

export interface PerformanceTierOption {
    /** Spend saved when this tier is picked: the tier's lower bound. */
    amount: number;
    label: string;
    /** The card's monthly discount cap in this tier, when the card lists one. */
    detail?: string;
}

/** 100000 → "10만 원", 5000 → "5천 원", 15000 → "1만 5천 원". */
export function formatRoundWon(value: number): string {
    const man = Math.floor(value / 10_000);
    const rest = value % 10_000;
    if (rest % 1_000 !== 0) return `${value.toLocaleString('ko-KR')}원`;
    const parts = [
        man > 0 ? `${man.toLocaleString('ko-KR')}만` : '',
        rest > 0 ? `${rest / 1_000}천` : '',
    ].filter(Boolean);
    return parts.length > 0 ? `${parts.join(' ')} 원` : '0원';
}

/**
 * Last month's spend as the card's own tiers, so first setup asks for a tier instead of an
 * exact amount. Picking a tier saves its lower bound, which meets exactly that tier.
 */
export function getPerformanceTierOptions(
    card: Pick<Card, 'id' | 'limitTable'>,
    rules: Pick<BenefitRule, 'cardId' | 'condition'>[],
): PerformanceTierOption[] {
    const thresholds = [...new Set([
        ...card.limitTable.map(tier => tier.threshold),
        ...rules
            .filter(rule => rule.cardId === card.id)
            .map(rule => rule.condition.minPerformance ?? 0),
    ])]
        .filter(value => value > 0)
        .sort((left, right) => left - right);
    if (thresholds.length === 0) return [];

    const limitAt = (amount: number) => {
        const tier = [...card.limitTable]
            .filter(item => item.threshold <= amount)
            .sort((left, right) => right.threshold - left.threshold)[0];
        if (!tier) return undefined;
        return tier.limit > 0 ? `월 최대 ${formatRoundWon(tier.limit)} 할인` : '실적 할인 없음';
    };
    const option = (amount: number, label: string): PerformanceTierOption => {
        const detail = card.limitTable.length > 0 ? limitAt(amount) : undefined;
        return { amount, label, ...(detail && { detail }) };
    };

    return [
        option(0, `${formatRoundWon(thresholds[0])} 미만`),
        ...thresholds.map(threshold => option(threshold, `${formatRoundWon(threshold)} 이상`)),
    ];
}

/** The picked tier for a saved spend: the highest tier whose lower bound it reaches. */
export function findPerformanceTierOption(
    options: PerformanceTierOption[],
    amount: number | undefined,
): PerformanceTierOption | undefined {
    if (amount === undefined) return undefined;
    return [...options].reverse().find(option => amount >= option.amount);
}
