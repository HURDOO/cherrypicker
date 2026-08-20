import type {
    BenefitRule,
    Brand,
    Card,
    PerformanceRecommendationGoal,
    UserCardPerformance,
} from '@/types';
import { calculateBestCards } from './calculation';

interface DerivePerformanceGoalsInput {
    cards: Card[];
    rules: BenefitRule[];
    performances: UserCardPerformance[];
    performanceMonth: string;
    brand: Brand;
    amount: number;
    isOnline: boolean;
}

export function derivePerformanceGoals({
    cards,
    rules,
    performances,
    performanceMonth,
    brand,
    amount,
    isOnline,
}: DerivePerformanceGoalsInput): PerformanceRecommendationGoal[] {
    const currentPerformances = new Map(
        performances
            .filter(item => item.performanceMonth === performanceMonth)
            .map(item => [item.cardId, item])
    );

    return cards.flatMap<PerformanceRecommendationGoal>(card => {
        const stored = currentPerformances.get(card.id);
        const currentAmount = stored?.amount ?? 0;
        const evaluateAt = (performanceAmount: number) => calculateBestCards(
            amount,
            brand,
            [card],
            rules,
            // The target prepares the next benefit month, whose monthly limits reset.
            [],
            [{ cardId: card.id, performanceMonth, amount: performanceAmount }],
            isOnline,
            { allowPerformanceWaiver: false },
        )[0];
        const manualTarget = stored?.targetAmount;
        if (manualTarget !== undefined) {
            if (manualTarget <= currentAmount) return [];
            return [{
                cardId: card.id,
                performanceMonth,
                amount: currentAmount,
                targetAmount: manualTarget,
                source: 'USER' as const,
                projectedBenefitAmount: evaluateAt(manualTarget).calculatedDiscount,
            }];
        }

        const targets = [...new Set([
            ...card.limitTable.map(item => item.threshold),
            ...rules
                .filter(rule => rule.cardId === card.id)
                .map(rule => rule.condition.minPerformance ?? 0),
        ])]
            .filter(value => value > currentAmount)
            .sort((left, right) => left - right);
        if (targets.length === 0) return [];

        const currentCard = evaluateAt(currentAmount);
        const bestTarget = targets
            .map(targetAmount => ({ targetAmount, card: evaluateAt(targetAmount) }))
            .filter(candidate => (
                candidate.card.calculatedDiscount > 0 &&
                (
                    candidate.card.calculatedDiscount > currentCard.calculatedDiscount ||
                    candidate.card.monthlyMaxLimit > currentCard.monthlyMaxLimit
                )
            ))
            .sort((left, right) => (
                right.card.calculatedDiscount - left.card.calculatedDiscount ||
                right.card.monthlyMaxLimit - left.card.monthlyMaxLimit ||
                left.targetAmount - right.targetAmount
            ))[0];
        if (!bestTarget) return [];

        return [{
            cardId: card.id,
            performanceMonth,
            amount: currentAmount,
            targetAmount: bestTarget.targetAmount,
            source: 'AUTOMATIC' as const,
            projectedBenefitAmount: bestTarget.card.calculatedDiscount,
        }];
    });
}
