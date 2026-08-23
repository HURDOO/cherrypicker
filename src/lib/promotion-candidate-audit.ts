import type {
    PromotionCandidateAudit,
    PromotionCandidateCoverageItem,
    PromotionCandidateEvidenceReference,
    PromotionCandidateFieldChange,
} from '@/types';
import { diffStructuredValues } from './structured-diff';

export interface PromotionAuditDocument {
    id: string;
    sourceUrl: string;
    extractedText: string;
}

const HIGH_RISK_PATH = /^(providerId|layer|brandIds|categoryIds|channels|startsAt|endsAt|certainty|action(?:\.|$)|condition\.(?:amountBasis|applicabilityScope|calculationMode|headlineEligible|eligibleItemSummary|minSpend|telecomTiers|requiredInputs|requiredSubscriptionProducts|requiresCoupon|requiresEnrollment|firstPaymentOnly|confirmationRequired|itemSpecific)|compatibility(?:\.|$)|limitConfig(?:\.|$))/;

const COVERAGE_PATHS = [
    'layer',
    'brandIds',
    'categoryIds',
    'channels',
    'startsAt',
    'endsAt',
    'action.type',
    'action.value',
    'action.valueSemantics',
    'action.maxBenefit',
    'action.faceValue',
    'condition.amountBasis',
    'condition.applicabilityScope',
    'condition.calculationMode',
    'condition.headlineEligible',
    'condition.eligibleItemSummary',
    'condition.minSpend',
    'condition.telecomTiers',
    'condition.requiredInputs',
    'condition.requiredSubscriptionProducts',
    'condition.requiresCoupon',
    'condition.requiresEnrollment',
    'condition.firstPaymentOnly',
    'condition.confirmationRequired',
    'condition.itemSpecific',
    'compatibility.requiredPayProviderIds',
    'compatibility.allowedFundingTypes',
    'compatibility.excludedPromotionIds',
    'compatibility.exclusiveGroup',
    'compatibility.allowStackWithSameLayer',
    'compatibility.blocksCardBenefit',
    'compatibility.allowResidualPayment',
    'limitConfig.dailyCount',
    'limitConfig.dailyAmount',
    'limitConfig.monthlyCount',
    'limitConfig.monthlyAmount',
    'limitConfig.yearlyCount',
] as const;

const ACKNOWLEDGEABLE_HIGH_RISK_REMOVAL_PREFIXES = [
    '게시 후보에서 기존 고위험 계산 필드가 제거됩니다:',
    // Keep recognizing candidates collected before the message was clarified.
    '이전 게시본의 계산 필드가 누락되었습니다:',
] as const;

export const canAcknowledgePromotionAuditErrors = (errors: string[]) => (
    errors.length > 0 && errors.every(error => (
        ACKNOWLEDGEABLE_HIGH_RISK_REMOVAL_PREFIXES.some(prefix => error.startsWith(prefix))
    ))
);

export const formatPromotionAuditError = (error: string) => error.replace(
    '이전 게시본의 계산 필드가 누락되었습니다:',
    '게시 후보에서 기존 고위험 계산 필드가 제거됩니다:',
);

const removedHighRiskPath = (error: string) => {
    const prefix = ACKNOWLEDGEABLE_HIGH_RISK_REMOVAL_PREFIXES.find(item => (
        error.startsWith(item)
    ));
    return prefix ? error.slice(prefix.length).trim() : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const valueAtPath = (value: unknown, path: string): unknown => path
    .split('.')
    .reduce<unknown>((current, key) => (
        isRecord(current) ? current[key] : undefined
    ), value);

const requiresCoverage = (value: unknown) => {
    if (value === undefined || value === null || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
};

export const unresolvedPromotionAuditErrors = (
    errors: string[],
    reviewedCandidate: Record<string, unknown>,
) => errors.filter(error => {
    const path = removedHighRiskPath(error);
    if (!path) return true;
    return !requiresCoverage(valueAtPath(reviewedCandidate, path));
});

const normalizeEvidenceText = (value: string) => value
    .normalize('NFKC')
    .replace(/[\s\u00a0]+/g, ' ')
    .replace(/\s*([/,:·])\s*/g, '$1')
    .trim()
    .toLocaleLowerCase('ko-KR');

const evidenceQuoteCandidates = (values: string[]) => [...new Set(values
    .flatMap(value => [value, ...value.split(/\n|\s[|·]\s/)])
    .map(value => value.replace(/^근거\s*:\s*/i, '').trim())
    .filter(value => normalizeEvidenceText(value).length >= 6))];

const findEvidenceReferences = (
    evidenceTexts: string[],
    documents: PromotionAuditDocument[],
): PromotionCandidateEvidenceReference[] => {
    const quotes = evidenceQuoteCandidates(evidenceTexts);
    const normalizedDocuments = documents.map(document => ({
        ...document,
        normalizedText: normalizeEvidenceText(document.extractedText),
    }));
    const references: PromotionCandidateEvidenceReference[] = [];

    quotes.forEach(quote => {
        const normalizedQuote = normalizeEvidenceText(quote);
        const document = normalizedDocuments.find(item => (
            item.normalizedText.includes(normalizedQuote)
        ));
        if (!document) return;
        if (references.some(reference => (
            reference.documentId === document.id && reference.quote === quote
        ))) return;
        references.push({
            documentId: document.id,
            sourceUrl: document.sourceUrl,
            quote: quote.slice(0, 1_000),
        });
    });

    return references.slice(0, 5);
};

export function createPromotionCandidateAudit(options: {
    candidate: Record<string, unknown>;
    baseline?: Record<string, unknown>;
    evidenceTexts: string[];
    documents: PromotionAuditDocument[];
}): PromotionCandidateAudit {
    const changes: PromotionCandidateFieldChange[] = diffStructuredValues(
        options.baseline ?? {},
        options.candidate,
    ).map(change => ({
        ...change,
        risk: HIGH_RISK_PATH.test(change.path) ? 'HIGH' : 'NORMAL',
    }));
    const references = findEvidenceReferences(options.evidenceTexts, options.documents);
    const coverage: PromotionCandidateCoverageItem[] = COVERAGE_PATHS
        .filter(path => requiresCoverage(valueAtPath(options.candidate, path)))
        .map(path => ({
            path,
            status: references.length > 0 ? 'COVERED' : 'MISSING_EVIDENCE',
            evidence: references.map(reference => ({ ...reference })),
        }));
    const blockingErrors = [...new Set([
        ...changes.flatMap(change => (
            change.kind === 'REMOVED' && change.risk === 'HIGH'
                ? [`게시 후보에서 기존 고위험 계산 필드가 제거됩니다: ${change.path}`]
                : []
        )),
        ...coverage.flatMap(item => (
            item.status === 'MISSING_EVIDENCE'
                ? [`계산 필드의 공식 원문 근거가 없습니다: ${item.path}`]
                : []
        )),
    ])];

    return {
        version: 1,
        summary: {
            changedFields: changes.length,
            highRiskChanges: changes.filter(change => change.risk === 'HIGH').length,
            coveredFields: coverage.filter(item => item.status === 'COVERED').length,
            missingFields: coverage.filter(item => item.status === 'MISSING_EVIDENCE').length,
        },
        changes,
        coverage,
        blockingErrors,
    };
}
