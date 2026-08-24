export const shouldReplacePendingCardBenefitCandidate = (
    currentValidationErrorCount: number,
    nextValidationErrorCount: number,
) => currentValidationErrorCount > 0 || nextValidationErrorCount === 0;
