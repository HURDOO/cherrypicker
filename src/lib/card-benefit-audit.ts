import type {
    BenefitRule,
    CardBenefitCandidateAudit,
    CardBenefitCoverageItem,
    CardBenefitEvidence,
    CardBenefitExtraction,
    CardBenefitFieldChange,
    CardBenefitNoticeDates,
    CardBenefitRevisionSnapshot,
} from '@/types';
import {
    analyzeAlternativeManualChecks,
    analyzeSharedLimitGroups,
    informationalRuleErrors,
    performanceWaiverConsistencyErrors,
} from './card-benefit-rule-consistency';
import { diffStructuredValues } from './structured-diff';
import {
    listBenefitProgramEvidencePaths,
    validateBenefitProgramSet,
} from '@/utils/benefit-dsl';

const conditionCoverageFields = [
    'minSpend',
    'maxSpend',
    'maxSpendExclusive',
    'minPerformance',
    'startsAt',
    'endsAt',
    'daysOfWeek',
    'timeRanges',
    'requiredCardNetwork',
    'performanceWaiver',
    'stackableWithRuleIds',
    'fallbackAfterRuleIds',
    'itemSpecific',
    'eligibleItemSummary',
] as const;

const actionCoverageFields = ['value', 'maxDiscount', 'amountBasis'] as const;
const limitCoverageFields = [
    'dailyCount',
    'dailyAmount',
    'monthlyCount',
    'yearlyCount',
    'monthlyAmount',
    'monthlyAmountByPerformance',
    'sharedFields',
] as const;

const highRiskRulePath = /^(rule$|category$|includedBrands$|excludedBrands$|platformType$|sharedGroupId$|usesCardLimit$|condition(?:\.|$)|action(?:\.|$)|limitConfig(?:\.|$)|program(?:\.|$))/;
const highRiskCardPath = /^(name$|company$|network$|limitTable(?:\.|$)|performancePolicy(?:\.|$))/;

const unique = <T,>(values: T[]) => [...new Set(values)];

const sameStringSet = (left: string[], right: string[]) => (
    JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
);

const ruleIdStabilityErrors = (baselineRules: BenefitRule[], candidateRules: BenefitRule[]) => {
    const baselineIds = new Set(baselineRules.map(rule => rule.id));
    const candidateIds = new Set(candidateRules.map(rule => rule.id));
    const addedRules = candidateRules.filter(rule => !baselineIds.has(rule.id));
    return baselineRules.filter(rule => !candidateIds.has(rule.id)).flatMap(removedRule => {
        if ((removedRule.includedBrands ?? []).length === 0) return [];
        const replacements = addedRules.filter(addedRule => (
            (addedRule.category ?? undefined) === removedRule.category &&
            (addedRule.platformType ?? 'ALL') === (removedRule.platformType ?? 'ALL') &&
            addedRule.action.type === removedRule.action.type &&
            sameStringSet(addedRule.includedBrands ?? [], removedRule.includedBrands ?? []) &&
            sameStringSet(addedRule.excludedBrands ?? [], removedRule.excludedBrands ?? [])
        ));
        return replacements.length > 0
            ? [
                `동일 혜택의 기존 규칙 ID를 유지해야 합니다: ${removedRule.id} → ` +
                replacements.map(rule => rule.id).join(', '),
            ]
            : [];
    });
};

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
    program: rule.program,
});

const evidenceFieldGroup = (path: string): CardBenefitEvidence['fields'][number] => {
    if (path.startsWith('program')) return 'program';
    if (path.startsWith('condition.')) return 'condition';
    if (path.startsWith('limitConfig.')) return 'limitConfig';
    return 'action';
};

const coverageRequirements = (rule: BenefitRule) => [
    ...(rule.program ? listBenefitProgramEvidencePaths(rule.program).map(path => ({
        path,
        value: rule.program,
    })) : []),
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
        .filter(item => (
            item.ruleIds.includes(rule.id) &&
            item.fields.includes(group) &&
            (!requirement.path.startsWith('program') ||
                item.programPaths?.includes(requirement.path))
        ))
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

const noticeDateErrors = (
    extraction: CardBenefitExtraction,
    notices: Array<{ sourceUrl: string; noticeDates: CardBenefitNoticeDates }>,
) => {
    const rules = new Map(extraction.rules.map(rule => [rule.id, rule]));
    return notices.flatMap(({ sourceUrl, noticeDates }) => {
        const label = (() => {
            try {
                return new URL(sourceUrl).hostname;
            } catch {
                return sourceUrl;
            }
        })();
        const errors: string[] = [];
        if (noticeDates.requirePublicationDate && !noticeDates.publicationDate) {
            errors.push(`공식 공지 게시일을 확인하지 못했습니다: ${label}`);
        }
        if (noticeDates.requireEffectiveFrom && !noticeDates.effectiveFrom) {
            errors.push(`공식 공지 시행일을 확인하지 못했습니다: ${label}`);
        }
        if (
            noticeDates.publicationDate &&
            noticeDates.effectiveFrom &&
            noticeDates.publicationDate > noticeDates.effectiveFrom
        ) {
            errors.push(
                `공식 공지 게시일이 시행일보다 늦습니다: ${noticeDates.publicationDate} > ${noticeDates.effectiveFrom}`
            );
        }
        if (
            noticeDates.effectiveFrom &&
            noticeDates.effectiveTo &&
            noticeDates.effectiveFrom > noticeDates.effectiveTo
        ) {
            errors.push(
                `공식 공지 종료일이 시행일보다 빠릅니다: ${noticeDates.effectiveFrom} > ${noticeDates.effectiveTo}`
            );
        }
        const isKnownConditionAmendment = sourceUrl.includes('ARTICLE_SERIAL=11274');
        noticeDates.affectedRuleIds.forEach(ruleId => {
            const rule = rules.get(ruleId);
            if (!rule) {
                errors.push(`공식 공지 영향 규칙이 후보에서 누락되었습니다: ${ruleId}`);
                return;
            }
            if (noticeDates.applyAsRulePeriod === false || isKnownConditionAmendment) {
                return;
            }
            if (
                noticeDates.effectiveFrom &&
                rule.condition.startsAt !== noticeDates.effectiveFrom
            ) {
                errors.push(
                    `공식 공지 시행일이 규칙 시작일과 다릅니다: ${rule.description} · ` +
                    `${rule.condition.startsAt ?? '없음'} → ${noticeDates.effectiveFrom}`
                );
            }
            if (
                noticeDates.effectiveTo &&
                rule.condition.endsAt !== noticeDates.effectiveTo
            ) {
                errors.push(
                    `공식 공지 종료일이 규칙 종료일과 다릅니다: ${rule.description} · ` +
                    `${rule.condition.endsAt ?? '없음'} → ${noticeDates.effectiveTo}`
                );
            }
        });
        return errors;
    });
};

export function createCardBenefitCandidateAudit(options: {
    extraction: CardBenefitExtraction;
    baseline: CardBenefitRevisionSnapshot;
    baselineRevision: number;
    asOfDate?: string;
    noticeDocuments?: Array<{ sourceUrl: string; noticeDates: CardBenefitNoticeDates }>;
}): CardBenefitCandidateAudit {
    const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
    const changes: CardBenefitFieldChange[] = diffStructuredValues(
        {
            name: options.baseline.card.name,
            company: options.baseline.card.company,
            network: options.baseline.card.network,
            limitTable: options.baseline.card.limitTable,
            performancePolicy: options.baseline.card.performancePolicy,
        },
        {
            name: options.extraction.card.name,
            company: options.extraction.card.company,
            network: options.extraction.card.network,
            limitTable: options.extraction.card.limitTable,
            performancePolicy: options.extraction.card.performancePolicy,
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
        ...(options.baseline.rules.length === 0 &&
            options.extraction.rules.length > 0 &&
            options.extraction.rules.every(rule => rule.action.value === 0 && !rule.program)
            ? ['신규 카드 후보에 자동 계산 가능한 혜택 금액이 없습니다. 숫자 근거가 있는 공식 상세 출처를 확인해야 합니다.']
            : []),
        ...coverage.flatMap(item => (
            item.status === 'MISSING_EVIDENCE'
                ? [`필수 조건의 공식 근거가 없습니다: ${item.ruleLabel} · ${item.path}`]
                : []
        )),
        ...ruleIdStabilityErrors(options.baseline.rules, options.extraction.rules),
        ...analyzeSharedLimitGroups(options.extraction.rules).errors,
        ...performanceWaiverConsistencyErrors(options.extraction.rules, {
            hasCardLimitTable: (options.extraction.card.limitTable?.length ?? 0) > 0,
            waiverExemptRuleIds: new Set(options.extraction.evidence.filter(item => (
                /실적[\s\S]{0,80}유예[\s\S]{0,80}제외|(?:대중교통|통신요금)[\s\S]{0,80}제외/i
                    .test(`${item.location ?? ''}\n${item.quote}`)
            )).flatMap(item => item.ruleIds)),
        }),
        ...analyzeAlternativeManualChecks(options.extraction.rules).errors,
        ...informationalRuleErrors(options.extraction.rules),
        ...validateBenefitProgramSet(options.extraction.rules),
        ...noticeDateErrors(options.extraction, options.noticeDocuments ?? []),
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
