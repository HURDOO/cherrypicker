import type { PromotionOffer } from '@/types';

const TELECOM_TIER_ORDER = [
    '일반',
    'WHITE',
    'SILVER',
    '우수',
    'GOLD',
    'VIP',
    'VVIP',
];

// 통신사가 공지한 멤버십 등급. 게시된 혜택에 아직 없는 등급도 고를 수 있게 기본 목록으로 둔다.
const OFFICIAL_TELECOM_TIERS: Record<string, string[]> = {
    skt: ['SILVER', 'GOLD', 'VIP'],
    kt: ['일반', 'WHITE', 'SILVER', 'GOLD', 'VIP', 'VVIP'],
    lguplus: ['우수', 'VIP', 'VVIP'],
};

const tierKey = (tier: string) => tier.trim().toLocaleUpperCase('ko-KR');

export const compareTelecomTiers = (left: string, right: string) => {
    const leftIndex = TELECOM_TIER_ORDER.indexOf(tierKey(left));
    const rightIndex = TELECOM_TIER_ORDER.indexOf(tierKey(right));
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex) ||
        left.localeCompare(right, 'ko-KR');
};

export const getTelecomTierOptions = (
    providerId: string | undefined,
    promotions: Pick<PromotionOffer, 'providerId' | 'condition'>[],
) => {
    if (!providerId) return [];
    const options = new Map<string, string>();
    [
        ...(OFFICIAL_TELECOM_TIERS[providerId] ?? []),
        ...promotions
            .filter(offer => offer.providerId === providerId)
            .flatMap(offer => offer.condition.telecomTiers ?? []),
    ].map(tier => tier.trim()).filter(Boolean).forEach(tier => {
        if (!options.has(tierKey(tier))) options.set(tierKey(tier), tier);
    });
    return [...options.values()].sort(compareTelecomTiers);
};

// 저장된 자유 입력 등급은 대소문자만 다를 때 목록 값으로 맞추고, 그 밖의 값은 추정하지 않는다.
export const matchTelecomTierOption = (tier: string | undefined, options: string[]) => {
    if (!tier?.trim()) return undefined;
    return options.find(option => tierKey(option) === tierKey(tier));
};
