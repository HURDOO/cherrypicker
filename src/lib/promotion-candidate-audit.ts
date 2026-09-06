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
    normalizedText?: string;
}

const HIGH_RISK_PATH = /^(providerId|usageGroupId|layer|brandIds|categoryIds|channels|startsAt|endsAt|certainty|action(?:\.|$)|condition\.(?:amountBasis|applicabilityScope|calculationMode|headlineEligible|eligibleItemSummary|minSpend|telecomTiers|telecomModes|requiredInputs|requiredSubscriptionProducts|requiresCoupon|requiresEnrollment|firstPaymentOnly|confirmationRequired|itemSpecific)|compatibility(?:\.|$)|limitConfig(?:\.|$))/;

const COVERAGE_PATHS = [
    'layer',
    'usageGroupId',
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
    'action.unitAmount',
    'condition.amountBasis',
    'condition.applicabilityScope',
    'condition.calculationMode',
    'condition.headlineEligible',
    'condition.eligibleItemSummary',
    'condition.minSpend',
    'condition.telecomTiers',
    'condition.telecomModes',
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
    'limitConfig.sharedFields',
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

export const preparePromotionAuditDocuments = (
    documents: PromotionAuditDocument[],
): Array<PromotionAuditDocument & { normalizedText: string }> => documents.map(document => (
    document.normalizedText
        ? { ...document, normalizedText: document.normalizedText }
        : { ...document, normalizedText: normalizeEvidenceText(document.extractedText) }
));

const evidenceQuoteCandidates = (values: string[]) => [...new Set(values
    .flatMap(value => [value, ...value.split(/\n|\s[|·]\s/)])
    .map(value => value.replace(/^근거\s*:\s*/i, '').trim())
    .filter(value => normalizeEvidenceText(value).length >= 6))];

const findEvidenceReferences = (
    evidenceTexts: string[],
    documents: PromotionAuditDocument[],
): PromotionCandidateEvidenceReference[] => {
    const quotes = evidenceQuoteCandidates(evidenceTexts);
    const normalizedDocuments = preparePromotionAuditDocuments(documents);
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
    fieldEvidence?: Record<string, string[]>;
    expectedFields?: Array<{ path: string; evidence: string }>;
    requiredEvidenceSourceUrl?: string;
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
        .map(path => {
            const fieldTexts = options.fieldEvidence?.[path];
            const fieldReferences = fieldTexts
                ? findEvidenceReferences(fieldTexts, options.documents)
                : references;
            return {
                path,
                status: fieldReferences.length > 0 ? 'COVERED' as const : 'MISSING_EVIDENCE' as const,
                evidence: fieldReferences.map(reference => ({ ...reference })),
            };
        });
    const calculationMode = valueAtPath(options.candidate, 'condition.calculationMode');
    const missingExpectedFields = calculationMode === 'INFORMATION_ONLY'
        ? []
        : (options.expectedFields ?? []).filter(field => (
            !requiresCoverage(valueAtPath(options.candidate, field.path))
        ));
    const requiredDocument = options.requiredEvidenceSourceUrl
        ? preparePromotionAuditDocuments(options.documents).find(document => (
            document.sourceUrl === options.requiredEvidenceSourceUrl
        ))
        : undefined;
    const requiredDocumentQuotes = evidenceQuoteCandidates([
        ...options.evidenceTexts,
        ...Object.values(options.fieldEvidence ?? {}).flat(),
    ]);
    const requiredDocumentMissing = Boolean(options.requiredEvidenceSourceUrl) && (
        !requiredDocument || !requiredDocumentQuotes.some(quote => (
            requiredDocument.normalizedText.includes(normalizeEvidenceText(quote))
        ))
    );
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
        ...missingExpectedFields.map(field => (
            `공식 상세에서 감지한 조건이 구조화되지 않았습니다: ${field.path} (${field.evidence})`
        )),
        ...(requiredDocumentMissing
            ? [`계산형 SKT 후보에 해당 브랜드 상세 문서 근거가 없습니다: ${options.requiredEvidenceSourceUrl}`]
            : []),
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
