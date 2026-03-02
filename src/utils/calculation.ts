import {
    Card, BenefitRule, Brand, TransactionHistory, UserCardPerformance, CalculatedCard, LimitTableItem
} from '@/types';

/**
 * Helper: Check if a date is today
 */
const isToday = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    return d.toDateString() === now.toDateString();
};

/**
 * Helper: Check if a date is in this month
 */
const isThisMonth = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};

const isThisYear = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getFullYear() === now.getFullYear();
};

/**
 * Calculate the best cards for a given payment
 * @param amount Payment amount
 * @param brand Target brand
 * @param cards All available cards
 * @param rules All available rules
 * @param history Full transaction history
 * @param performances User's card performance
 * @param isOnline Is this an online payment? (Toggle from UI)
 */
export function calculateBestCards(
    amount: number,
    brand: Brand,
    cards: Card[],
    rules: BenefitRule[],
    history: TransactionHistory[],
    performances: UserCardPerformance[],
    isOnline: boolean = false
): CalculatedCard[] {

    return cards.map(card => {
        // 1. Determine User's Performance for this card
        const perf = performances.find(p => p.cardId === card.id);
        const myPerformance = perf ? perf.amount : 0; // Default to 0 if not found

        // 2. Determine Monthly Total Limit (Integrated Limit) based on Performance
        // LimitTable: [{ threshold: 300000, limit: 10000 }, { threshold: 0, limit: 0 }]
        // Find the highest threshold met
        let monthlyMaxLimit = 999999999; // Default infinity if no table
        if (card.limitTable && card.limitTable.length > 0) {
            // Sort desc just in case
            const sortedTable = [...card.limitTable].sort((a, b) => b.threshold - a.threshold);
            const tier = sortedTable.find(t => myPerformance >= t.threshold);
            monthlyMaxLimit = tier ? tier.limit : 0;
        }

        // 3. Calculate "Used Integration Limit" (Total discount received on this card this month)
        const usedDiscount = history
            .filter(tx => tx.cardId === card.id && isThisMonth(tx.date))
            .reduce((sum, tx) => sum + (tx.discountAmount || 0), 0);

        const remainingLimit = Math.max(0, monthlyMaxLimit - usedDiscount);

        // 4. Find Matching Rule
        // Priority: Included Brand > Category > All
        // Also check Excluded Brands & Platform

        // Filter rules belonging to this card
        const cardRules = rules.filter(r => r.cardId === card.id);

        let matchedRule: BenefitRule | undefined;

        // Sort rules by specificity (Brand -> Category -> All) might be complex if they overlap.
        // Heuristic: Check specific brand match first.

        // Attempt 1: Explicit Include
        matchedRule = cardRules.find(r =>
            r.includedBrands?.includes(brand.id) &&
            !r.excludedBrands?.includes(brand.id)
        );

        // Attempt 2: Category Match (if no brand specific rule found OR found rule suggests fallback?)
        // Usually specific overrides category.
        if (!matchedRule) {
            matchedRule = cardRules.find(r =>
                r.category === brand.categoryId &&
                (!r.includedBrands || r.includedBrands.length === 0) && // Ensure it's a category generic rule
                !r.excludedBrands?.includes(brand.id)
            );
        }

        // Attempt 3: 'ALL' category or catch-all
        if (!matchedRule) {
            matchedRule = cardRules.find(r => !r.category && (!r.includedBrands || r.includedBrands.length === 0));
        }


        let discount = 0;
        let reason = '';
        let isApplicable = false;
        let usageStat = {
            dailyCount: 0, monthlyCount: 0, yearlyCount: 0, monthlyAmount: 0,
            isDailyLimitReached: false, isMonthlyLimitReached: false, isYearlyLimitReached: false,
            isMonthlyAmountLimitReached: false
        };

        if (matchedRule) {
            // 5. Check Platform/Channel
            // 'ALL', 'ONLINE', 'OFFLINE', 'OFFICIAL_SITE'
            // Simplification: if rule is ONLINE, require isOnline=true.
            // If rule is OFFLINE, require isOnline=false.
            // OFFICIAL_SITE is treated as ONLINE for now, or user manual check.
            let platformMatch = true;
            if (matchedRule.platformType === 'ONLINE' && !isOnline) {
                platformMatch = false; reason = '온라인 결제 전용';
            } else if (matchedRule.platformType === 'OFFLINE' && isOnline) {
                platformMatch = false; reason = '현장 결제 전용';
            }

            // 6. Check Conditions
            if (platformMatch) {
                if (amount < (matchedRule.condition.minSpend || 0)) {
                    reason = `최소 결제금액(${matchedRule.condition.minSpend?.toLocaleString()}원) 부족`;
                } else {
                    // 7. Check Usage Limits (Shared Group handling)
                    // We need to count usage across ALL rules that share the same sharedGroupId
                    // Or just this rule if no group.
                    const trackingId = matchedRule.sharedGroupId || matchedRule.id;

                    // Filter history for this tracking group
                    const relevantHistory = history.filter(tx => {
                        if (!tx.ruleId) return false;
                        if (tx.cardId !== card.id) return false; // Should be same card usually? or cross-card group? Assuming same card.

                        // Find rule for this tx to check its group
                        // OPTIMIZATION: In real app, might want to store sharedGroupId in history or map quickly.
                        // For now, scan rules.
                        const txRule = rules.find(r => r.id === tx.ruleId);
                        if (!txRule) return false;

                        const txTrackingId = txRule.sharedGroupId || txRule.id;
                        return txTrackingId === trackingId;
                    });

                    // Count
                    usageStat.dailyCount = relevantHistory.filter(tx => isToday(tx.date)).length;
                    usageStat.monthlyCount = relevantHistory.filter(tx => isThisMonth(tx.date)).length;
                    usageStat.yearlyCount = relevantHistory.filter(tx => isThisYear(tx.date)).length;
                    usageStat.monthlyAmount = relevantHistory
                        .filter(tx => isThisMonth(tx.date))
                        .reduce((sum, tx) => sum + (tx.discountAmount || 0), 0);

                    // Check Limits
                    const { limitConfig } = matchedRule;

                    if (limitConfig.dailyCount && usageStat.dailyCount >= limitConfig.dailyCount) {
                        reason = '일 횟수 제한 초과';
                        usageStat.isDailyLimitReached = true;
                    } else if (limitConfig.monthlyCount && usageStat.monthlyCount >= limitConfig.monthlyCount) {
                        reason = '월 횟수 제한 초과';
                        usageStat.isMonthlyLimitReached = true;
                    } else if (limitConfig.yearlyCount && usageStat.yearlyCount >= limitConfig.yearlyCount) {
                        reason = '연 횟수 제한 초과';
                        usageStat.isYearlyLimitReached = true;
                    } else if (limitConfig.monthlyAmount && usageStat.monthlyAmount >= limitConfig.monthlyAmount) {
                        reason = '월 혜택 한도 소진'; // This rule-specific amount limit
                        usageStat.isMonthlyAmountLimitReached = true;
                    } else {
                        // All checks passed! Calculate Discount
                        isApplicable = true;
                        const { action } = matchedRule;

                        if (action.type === 'PERCENT') {
                            discount = Math.floor(amount * (action.value / 100));
                            if (action.maxDiscount && discount > action.maxDiscount) {
                                discount = action.maxDiscount;
                                if (!reason) reason = '건당 한도 적용';
                            }
                        } else if (action.type === 'FLAT') {
                            discount = action.value;
                            if (!reason) reason = '정액 할인';
                        } else if (action.type === 'FIXED_PRICE') {
                            // e.g. Paying 12000, Fixed Price 6000 -> Discount 6000
                            discount = Math.max(0, amount - action.value);
                            if (!reason) reason = `정가제 적용(${action.value}원)`;
                        }

                        // 8. Apply Rule-Specific Amount Limit CAP (Remaining part)
                        // If I have 1000 left in monthlyAmount limit, and discount is 2000, cap it.
                        if (limitConfig.monthlyAmount) {
                            const ruleRemaining = Math.max(0, limitConfig.monthlyAmount - usageStat.monthlyAmount);
                            if (discount > ruleRemaining) {
                                discount = ruleRemaining;
                                reason = `혜택 한도 잔여(${ruleRemaining}원) 적용`;
                            }
                        }

                        // 9. Apply Card Integrated Limit CAP
                        // If total card limit is 10000, and used 9000 -> 1000 left.
                        if (card.limitTable && card.limitTable.length > 0) {
                            if (remainingLimit <= 0) {
                                discount = 0;
                                isApplicable = false;
                                reason = '월 통합 한도 소진';
                            } else if (discount > remainingLimit) {
                                discount = remainingLimit;
                                reason = `통합 한도 잔여(${remainingLimit}원) 적용`;
                            }
                        }
                    }
                }
            }
        } else {
            reason = '혜택 없음';
        }

        return {
            ...card,
            calculatedDiscount: discount,
            reason,
            isApplicable: isApplicable && discount > 0, // Must have positive discount
            monthlyMaxLimit,
            remainingLimit,
            usedDiscount,
            matchedRule: matchedRule ? { ...matchedRule, usage: usageStat } : undefined
        };

    }).sort((a, b) => b.calculatedDiscount - a.calculatedDiscount);
}
