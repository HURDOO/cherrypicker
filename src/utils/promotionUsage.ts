import type { TransactionHistory } from '@/types';

export interface PromotionUsageStat {
    dailyCount: number;
    dailyAmount: number;
    monthlyCount: number;
    yearlyCount: number;
    monthlyAmount: number;
}

const KST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;

const getKstParts = (date: Date) => {
    const shifted = new Date(date.getTime() + KST_OFFSET_MILLISECONDS);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth(),
        day: shifted.getUTCDate(),
    };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const getPromotionSteps = (transaction: TransactionHistory) => {
    const snapshot = transaction.combinationSnapshot;
    if (!isRecord(snapshot) || !Array.isArray(snapshot.steps)) return [];

    return snapshot.steps.flatMap(step => {
        if (
            !isRecord(step) ||
            typeof step.promotionId !== 'string' ||
            typeof step.benefitAmount !== 'number' ||
            !Number.isFinite(step.benefitAmount) ||
            ('certainty' in step && step.certainty !== 'CONFIRMED')
        ) {
            return [];
        }
        return [{
            promotionId: step.promotionId,
            ...(typeof step.promotionUsageGroupId === 'string' &&
                step.promotionUsageGroupId.trim() && {
                promotionUsageGroupId: step.promotionUsageGroupId.trim(),
            }),
            benefitAmount: Math.max(0, Math.floor(step.benefitAmount)),
        }];
    });
};

export function buildPromotionUsage(
    history: TransactionHistory[],
    now: Date = new Date()
): Record<string, PromotionUsageStat> {
    const nowParts = getKstParts(now);
    const usageByPromotion: Record<string, PromotionUsageStat> = {};

    history.forEach(transaction => {
        const transactionDate = new Date(transaction.date);
        if (Number.isNaN(transactionDate.getTime())) return;

        const date = getKstParts(transactionDate);
        if (date.year !== nowParts.year) return;

        getPromotionSteps(transaction).forEach(step => {
            const usageKeys = [...new Set([
                step.promotionId,
                step.promotionUsageGroupId,
            ].filter((key): key is string => Boolean(key)))];
            usageKeys.forEach(usageKey => {
                const usage = usageByPromotion[usageKey] ?? {
                    dailyCount: 0,
                    dailyAmount: 0,
                    monthlyCount: 0,
                    yearlyCount: 0,
                    monthlyAmount: 0,
                };
                usage.yearlyCount += 1;

                if (date.month === nowParts.month) {
                    usage.monthlyCount += 1;
                    usage.monthlyAmount += step.benefitAmount;

                    if (date.day === nowParts.day) {
                        usage.dailyCount += 1;
                        usage.dailyAmount += step.benefitAmount;
                    }
                }

                usageByPromotion[usageKey] = usage;
            });
        });
    });

    return usageByPromotion;
}
