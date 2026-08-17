import type { BenefitCombination, FundingType } from '@/types';

export const FUNDING_TYPE_LABELS: Record<FundingType, string> = {
    CARD: '등록 카드',
    MONEY: '페이머니',
    POINTS: '포인트',
    GIFT_CERTIFICATE: '상품권',
};

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
