import type { UserBenefitProfile, UserCardPerformance } from '@/types';
import { getPreviousMonthInKst } from '@/lib/monthly-performance';

export const CONTEST_DEMO_FAVORITE_BRAND_IDS = [
    'gs25',
    'cu',
    'seveneleven',
    'daiso',
    'oliveyoung',
    'twosome',
    'starbucks',
] as const;

export const CONTEST_DEMO_SUBSCRIPTION_PRODUCT = 'T 우주패스 편의점&카페';

const CONTEST_DEMO_CARD_PERFORMANCES = [
    { cardId: 'kb_nara', amount: 100_000 },
    { cardId: 'shinhan_nara', amount: 100_000 },
    { cardId: 'shinhan_heyoung', amount: 200_000 },
] as const;

export function createContestDemoBenefitProfile(): UserBenefitProfile {
    return {
        telecomMemberships: [{ providerId: 'skt', tier: 'VIP' }],
        subscriptions: [{
            providerId: 't-universe',
            productName: CONTEST_DEMO_SUBSCRIPTION_PRODUCT,
        }],
        enabledPayProviderIds: ['naverpay'],
        moneyEnabled: true,
        pointsEnabled: true,
        pointValue: 1,
        smallBenefitThreshold: 100,
    };
}

export function createContestDemoPerformances(
    referenceDate: Date = new Date(),
): UserCardPerformance[] {
    const performanceMonth = getPreviousMonthInKst(referenceDate);

    return CONTEST_DEMO_CARD_PERFORMANCES.map(performance => ({
        ...performance,
        performanceMonth,
    }));
}
