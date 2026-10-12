/**
 * Representative transactions for the TASK-14 check cards. Each scenario runs against the reviewed
 * base extraction in `docs/card-benefit-revisions/base/<cardId>.json`, so the published rules
 * themselves are tested. Dates are KST noon on the given day.
 */
export interface CheckCardGoldenScenario {
    id: string;
    cardId: string;
    brandId: string;
    categoryId: string;
    amount: number;
    date: string;
    expectedBenefit: number;
    /** Rule expected to produce the benefit; omit when no benefit applies. */
    ruleId?: string;
    performance?: number;
    isOnline?: boolean;
    /** Condition IDs the user confirmed, e.g. `card-rule:<ruleId>`. */
    confirmed?: string[];
    /** Expected certainty of the matched benefit (defaults to CONFIRMED). */
    certainty?: 'CONFIRMED' | 'CONDITIONAL';
}

export const checkCardGoldenScenarios: CheckCardGoldenScenario[] = [
    {
        id: 'kakaobank-friends-weekday',
        cardId: 'kakaobank_friends_check',
        brandId: 'gs25',
        categoryId: 'convenience',
        amount: 10_000,
        date: '2026-10-14',
        ruleId: 'kakaobank_friends_weekday_cashback',
        expectedBenefit: 20,
    },
    {
        id: 'kakaobank-friends-weekend',
        cardId: 'kakaobank_friends_check',
        brandId: 'gs25',
        categoryId: 'convenience',
        amount: 10_000,
        date: '2026-10-17',
        ruleId: 'kakaobank_friends_weekend_cashback',
        expectedBenefit: 40,
    },
    {
        id: 'kakaobank-friends-transit-excluded',
        cardId: 'kakaobank_friends_check',
        brandId: 'transport_public',
        categoryId: 'transport',
        amount: 10_000,
        date: '2026-10-14',
        expectedBenefit: 0,
    },
];
