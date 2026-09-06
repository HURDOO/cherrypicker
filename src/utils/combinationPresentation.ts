import type {
    BenefitCertainty,
    BenefitCombination,
    CombinationStep,
    FundingType,
    RecommendationPriority,
} from '@/types';
import { getCombinationIntent } from './recommendationPreferences';

export const FUNDING_TYPE_LABELS: Record<FundingType, string> = {
    CARD: '등록 카드',
    MONEY: '페이머니',
    POINTS: '포인트',
    GIFT_CERTIFICATE: '상품권',
};

export const BENEFIT_STATUS_LABELS: Record<BenefitCertainty, string> = {
    CONFIRMED: '확정',
    CONDITIONAL: '조건 충족 시',
    ESTIMATED: '정보 제공',
};

export function getUnresolvedConditionSteps(
    combination: BenefitCombination,
): CombinationStep[] {
    return combination.steps.filter(step => step.certainty === 'CONDITIONAL');
}

export function getCombinationMethodNames(
    combination: BenefitCombination
): string[] {
    const discountMethods = combination.steps
        .filter(step => step.layer === 'DISCOUNT' && step.benefitAmount > 0)
        .map(step => step.providerName);
    const fundingMethod = combination.fundingType === 'CARD'
        ? combination.cardName || FUNDING_TYPE_LABELS.CARD
        : FUNDING_TYPE_LABELS[combination.fundingType];
    const methods = [
        ...discountMethods,
        combination.payProviderName,
        fundingMethod,
    ]
        .map(method => method?.trim())
        .filter((method): method is string => Boolean(method));

    return [...new Set(methods)];
}

export function getCombinationMethodSummary(
    combination: BenefitCombination
): string {
    return getCombinationMethodNames(combination).join(' + ');
}

export function getCombinationRecommendationReason(
    combination: BenefitCombination,
    smallBenefitThreshold: number,
    priority: RecommendationPriority,
): string {
    const intent = getCombinationIntent(combination, smallBenefitThreshold, priority);
    if (intent === 'PERFORMANCE' && combination.performanceProgress) {
        return combination.performanceProgress.targetReached
            ? '이번 결제로 다음 달 카드 혜택 목표를 채울 수 있어요.'
            : `다음 달 혜택 목표까지 ${combination.performanceProgress.remainingAfter.toLocaleString()}원 남아요.`;
    }
    if (intent === 'SMALL_BENEFIT') {
        return `확정 혜택이 설정한 소액 기준 ${smallBenefitThreshold.toLocaleString()}원보다 작아요.`;
    }
    if (intent === 'NO_BENEFIT') {
        return '확정된 즉시 혜택이 없어 조건과 카드 실적을 함께 확인해야 해요.';
    }

    const primaryStep = [...combination.steps]
        .filter(step => step.certainty === 'CONFIRMED' && step.benefitAmount > 0)
        .sort((left, right) => right.benefitAmount - left.benefitAmount)[0];
    return primaryStep
        ? `${primaryStep.title}으로 확정 혜택 ${primaryStep.benefitAmount.toLocaleString()}원을 받아요.`
        : '이번 결제에서 바로 받을 수 있는 확정 혜택이 가장 커요.';
}
