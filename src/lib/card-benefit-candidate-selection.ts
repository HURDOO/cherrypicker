export const shouldReplacePendingCardBenefitCandidate = (
    currentValidationErrorCount: number,
    nextValidationErrorCount: number,
) => currentValidationErrorCount > 0 || nextValidationErrorCount === 0;

export const isReusableCardBenefitCandidate = (
    status: 'PENDING' | 'APPROVED' | 'REJECTED',
    candidateBaseRevision: number,
    currentBaseRevision: number,
) => status === 'APPROVED' || (
    status === 'PENDING' && candidateBaseRevision === currentBaseRevision
);
