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

/**
 * A candidate that only records a changed official source bundle while card AI is off. It carries
 * the published extraction (or nothing, before publication) and always awaits a reviewed revision.
 */
export const CARD_BENEFIT_SOURCE_CHANGE_EXTRACTOR = 'source:awaiting-revision-v1';

export const isSourceChangeCardBenefitCandidate = (extractor: string) => (
    extractor === CARD_BENEFIT_SOURCE_CHANGE_EXTRACTOR
);
