import type {
    BenefitRule,
    CardBenefitCandidateAudit,
    CardBenefitCoverageItem,
    CardBenefitEvidence,
    CardBenefitExtraction,
    CardBenefitFieldChange,
    CardBenefitRevisionSnapshot,
} from '@/types';
import { diffStructuredValues } from './structured-diff';

const conditionCoverageFields = [
    'minSpend',
    'minPerformance',
    'startsAt',
    'endsAt',
    'requiredCardNetwork',
    'performanceWaiver',
    'confirmationRequired',
    'stackableWithRuleIds',
    'applicationOrder',
    'manualCheckRequired',
    'requiredNote',
] as const;

const actionCoverageFields = ['value', 'maxDiscount', 'amountBasis'] as const;
const limitCoverageFields = [
    'dailyCount',
    'dailyAmount',
    'monthlyCount',
    'yearlyCount',
    'monthlyAmount',
] as const;

const highRiskRulePath = /^(rule$|category$|includedBrands$|excludedBrands$|platformType$|sharedGroupId$|usesCardLimit$|condition(?:\.|$)|action(?:\.|$)|limitConfig(?:\.|$))/;
const highRiskCardPath = /^(name$|company$|network$|limitTable(?:\.|$))/;

const unique = <T,>(values: T[]) => [...new Set(values)];

const ruleForDiff = (rule: BenefitRule) => ({
    category: rule.category,
    includedBrands: rule.includedBrands ?? [],
    excludedBrands: rule.excludedBrands ?? [],
    platformType: rule.platformType ?? 'ALL',
    sharedGroupId: rule.sharedGroupId,
    usesCardLimit: rule.usesCardLimit ?? true,
    description: rule.description,
    detail: rule.detail,
    condition: rule.condition,
    action: rule.action,
    limitConfig: rule.limitConfig,
});

const evidenceFieldGroup = (path: string): CardBenefitEvidence['fields'][number] => {
    if (path.startsWith('condition.')) return 'condition';
    if (path.startsWith('limitConfig.')) return 'limitConfig';
    return 'action';
};

const coverageRequirements = (rule: BenefitRule) => [
    ...actionCoverageFields.flatMap(field => (
        rule.action[field] !== undefined && !(field === 'value' && rule.action.value === 0)
            ? [{ path: `action.${field}`, value: rule.action[field] }]
            : []
    )),
    ...conditionCoverageFields.flatMap(field => (
        rule.condition[field] !== undefined
            ? [{ path: `condition.${field}`, value: rule.condition[field] }]
            : []
    )),
    ...limitCoverageFields.flatMap(field => (
        rule.limitConfig[field] !== undefined
            ? [{ path: `limitConfig.${field}`, value: rule.limitConfig[field] }]
            : []
    )),
];

const findCoverage = (
    rule: BenefitRule,
    evidence: CardBenefitEvidence[],
): CardBenefitCoverageItem[] => coverageRequirements(rule).map(requirement => {
    const group = evidenceFieldGroup(requirement.path);
    const evidenceIds = evidence
        .filter(item => item.ruleIds.includes(rule.id) && item.fields.includes(group))
        .map(item => item.id);
    return {
        ruleId: rule.id,
        ruleLabel: rule.description,
        path: requirement.path,
        status: evidenceIds.length > 0 ? 'COVERED' as const : 'MISSING_EVIDENCE' as const,
        evidenceIds,
    };
});

const isExpiredRule = (rule: BenefitRule, asOfDate: string) => (
    Boolean(rule.condition.endsAt && rule.condition.endsAt < asOfDate)
);

export function createCardBenefitCandidateAudit(options: {
    extraction: CardBenefitExtraction;
    baseline: CardBenefitRevisionSnapshot;
    baselineRevision: number;
    asOfDate?: string;
}): CardBenefitCandidateAudit {
    const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
    const changes: CardBenefitFieldChange[] = diffStructuredValues(
        {
            name: options.baseline.card.name,
            company: options.baseline.card.company,
            network: options.baseline.card.network,
            limitTable: options.baseline.card.limitTable,
        },
        {
            name: options.extraction.card.name,
            company: options.extraction.card.company,
            network: options.extraction.card.network,
            limitTable: options.extraction.card.limitTable,
        },
    ).map(change => ({
        scope: 'CARD' as const,
        entityId: options.extraction.card.id,
        entityLabel: options.extraction.card.name,
        risk: highRiskCardPath.test(change.path) ? 'HIGH' as const : 'NORMAL' as const,
        ...change,
    }));

    const baselineRules = new Map(options.baseline.rules.map(rule => [rule.id, rule]));
    const candidateRules = new Map(options.extraction.rules.map(rule => [rule.id, rule]));
    const ruleIds = [...new Set([...baselineRules.keys(), ...candidateRules.keys()])].sort();
    ruleIds.forEach(ruleId => {
        const before = baselineRules.get(ruleId);
        const after = candidateRules.get(ruleId);
        if (!before && after) {
            changes.push({
                scope: 'RULE',
                entityId: ruleId,
                entityLabel: after.description,
                path: 'rule',
                kind: 'ADDED',
                risk: 'HIGH',
                after: ruleForDiff(after),
            });
            return;
        }
        if (before && !after) {
            changes.push({
                scope: 'RULE',
                entityId: ruleId,
                entityLabel: before.description,
                path: 'rule',
                kind: 'REMOVED',
                risk: isExpiredRule(before, asOfDate) ? 'NORMAL' : 'HIGH',
                before: ruleForDiff(before),
            });
            return;
        }
        if (!before || !after) return;
        changes.push(...diffStructuredValues(ruleForDiff(before), ruleForDiff(after)).map(change => ({
            scope: 'RULE' as const,
            entityId: ruleId,
            entityLabel: after.description,
            risk: highRiskRulePath.test(change.path) ? 'HIGH' as const : 'NORMAL' as const,
            ...change,
        })));
    });

    const coverage = options.extraction.rules.flatMap(rule => (
        findCoverage(rule, options.extraction.evidence)
    ));
    const blockingErrors = unique([
        ...changes.flatMap(change => (
            change.kind === 'REMOVED' && change.risk === 'HIGH'
                ? [`이전 게시본의 필수 항목이 누락되었습니다: ${change.entityLabel} · ${change.path}`]
                : []
        )),
        ...coverage.flatMap(item => (
            item.status === 'MISSING_EVIDENCE'
                ? [`필수 조건의 공식 근거가 없습니다: ${item.ruleLabel} · ${item.path}`]
                : []
        )),
    ]);

    return {
        version: 1,
        baselineRevision: options.baselineRevision,
        summary: {
            addedRules: changes.filter(change => (
                change.scope === 'RULE' && change.path === 'rule' && change.kind === 'ADDED'
            )).length,
            removedRules: changes.filter(change => (
                change.scope === 'RULE' && change.path === 'rule' && change.kind === 'REMOVED'
            )).length,
            changedFields: changes.filter(change => change.path !== 'rule').length,
            coveredFields: coverage.filter(item => item.status === 'COVERED').length,
            missingFields: coverage.filter(item => item.status === 'MISSING_EVIDENCE').length,
        },
        changes,
        coverage,
        blockingErrors,
    };
}
