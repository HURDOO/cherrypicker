import type { BenefitCombination, RecommendationPriority } from '@/types';

export const DEFAULT_SMALL_BENEFIT_THRESHOLD = 100;
export const MAX_SMALL_BENEFIT_THRESHOLD = 1_000_000;

export const isSmallBenefitAmount = (amount: number, threshold: number) => (
    threshold > 0 && amount > 0 && amount < threshold
);

export type CombinationIntent =
    | 'BENEFIT'
    | 'SMALL_BENEFIT'
    | 'PERFORMANCE'
    | 'NO_BENEFIT';

export function getCombinationIntent(
    combination: BenefitCombination,
    threshold: number,
    priority: RecommendationPriority,
): CombinationIntent {
    const hasPerformanceReason = Boolean(combination.performanceProgress);
    const isSmallBenefit = isSmallBenefitAmount(combination.confirmedValue, threshold);

    if (
        hasPerformanceReason &&
        (priority === 'PERFORMANCE' || combination.confirmedValue === 0 || isSmallBenefit)
    ) {
        return 'PERFORMANCE';
    }
    if (isSmallBenefit) return 'SMALL_BENEFIT';
    if (combination.confirmedValue > 0) return 'BENEFIT';
    if (hasPerformanceReason) return 'PERFORMANCE';
    return 'NO_BENEFIT';
}
