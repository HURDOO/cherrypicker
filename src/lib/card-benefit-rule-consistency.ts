import type { LimitConfig } from '@/types';

type SharedLimitRule = {
    id: string;
    description: string;
    sharedGroupId?: string | null;
    usesCardLimit?: boolean;
    limitConfig: Partial<Record<keyof LimitConfig, number | null | undefined>>;
};

type PerformanceWaiverRule = {
    id: string;
    description: string;
    condition: {
        minPerformance?: number | null;
        performanceWaiver?: string | null;
    };
};

type AlternativeConditionRule = {
    id: string;
    category?: string | null;
    includedBrands?: string[] | null;
    description: string;
    condition: {
        manualCheckRequired?: boolean | null;
    };
};

type InformationalRule = {
    description: string;
    includedBrands?: string[] | null;
    condition: {
        itemSpecific?: boolean | null;
    };
    action: {
        type: string;
        value: number;
    };
    limitConfig: Partial<Record<keyof LimitConfig, number | null | undefined>>;
};

const limitFields: Array<keyof LimitConfig> = [
    'dailyCount',
    'dailyAmount',
    'monthlyCount',
    'yearlyCount',
    'monthlyAmount',
];

export const analyzeSharedLimitGroups = (rules: SharedLimitRule[]) => {
    const groups = new Map<string, SharedLimitRule[]>();
    rules.forEach(rule => {
        if (!rule.sharedGroupId) return;
        const members = groups.get(rule.sharedGroupId) ?? [];
        members.push(rule);
        groups.set(rule.sharedGroupId, members);
    });

    const errors: string[] = [];
    const invalidGroupIds = new Set<string>();
    groups.forEach((members, groupId) => {
        if (members.length < 2) return;
        const labels = members.map(rule => rule.description).join(', ');
        const cardLimitModes = new Set(members.map(rule => rule.usesCardLimit ?? true));
        let hasActualSharedLimit = false;
        limitFields.forEach(field => {
            const values = members.map(rule => rule.limitConfig[field])
                .filter((value): value is number => typeof value === 'number');
            if (values.length < 2) return;
            if (new Set(values).size === 1) {
                hasActualSharedLimit = true;
                return;
            }
            invalidGroupIds.add(groupId);
            errors.push(
                `공유 한도 그룹 ${groupId}의 ${field} 값이 서로 다릅니다: ${labels}`
            );
        });
        if (cardLimitModes.size > 1) {
            invalidGroupIds.add(groupId);
            errors.push(`공유 한도 그룹 ${groupId}에 통합한도 적용 여부가 다른 규칙이 섞였습니다: ${labels}`);
        }
        if (!hasActualSharedLimit) {
            invalidGroupIds.add(groupId);
            errors.push(`공유 한도 그룹 ${groupId}에 실제 공유할 한도가 없습니다: ${labels}`);
        }
    });

    return { errors, invalidGroupIds };
};

export const performanceWaiverConsistencyErrors = (
    rules: PerformanceWaiverRule[],
    options: {
        hasCardLimitTable: boolean;
        waiverExemptRuleIds?: ReadonlySet<string>;
    },
) => {
    if (!options.hasCardLimitTable) return [];
    const rulesByThreshold = new Map<number, PerformanceWaiverRule[]>();
    rules.forEach(rule => {
        const threshold = rule.condition.minPerformance;
        if (typeof threshold !== 'number' || threshold <= 0) return;
        const members = rulesByThreshold.get(threshold) ?? [];
        members.push(rule);
        rulesByThreshold.set(threshold, members);
    });

    const errors: string[] = [];
    rulesByThreshold.forEach((members, threshold) => {
        if (members.length < 2) return;
        const waived = members.filter(rule => (
            rule.condition.performanceWaiver === 'NEW_CARD_REGISTRATION_WINDOW'
        ));
        const missing = members.filter(rule => (
            !rule.condition.performanceWaiver &&
            !options.waiverExemptRuleIds?.has(rule.id)
        ));
        if (waived.length === 0 || missing.length === 0) return;
        errors.push(
            `동일한 최소 실적 ${threshold.toLocaleString()}원 규칙의 신규카드 유예가 ` +
            `서로 다릅니다. 유예 누락 후보: ${missing.map(rule => rule.description).join(', ')}`
        );
    });
    return errors;
};

const sameBrandSet = (left: string[] = [], right: string[] = []) => (
    JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
);

export const analyzeAlternativeManualChecks = (rules: AlternativeConditionRule[]) => {
    const specialDatePattern = /국군의\s*날|현충일|특별일|기념일/;
    const missingBaseRuleIds = new Set<string>();
    rules.filter(rule => (
        specialDatePattern.test(rule.description) && rule.condition.manualCheckRequired === true
    )).forEach(specialRule => {
        rules.filter(baseRule => (
            baseRule.id !== specialRule.id &&
            !specialDatePattern.test(baseRule.description) &&
            baseRule.category === specialRule.category &&
            sameBrandSet(baseRule.includedBrands ?? [], specialRule.includedBrands ?? [])
        )).forEach(baseRule => {
            if (baseRule.condition.manualCheckRequired !== true) {
                missingBaseRuleIds.add(baseRule.id);
            }
        });
    });
    const labels = rules.filter(rule => missingBaseRuleIds.has(rule.id))
        .map(rule => rule.description);
    return {
        missingBaseRuleIds,
        errors: labels.length > 0
            ? [`특별일 대체 혜택의 일반 규칙에 조건 확인이 없습니다: ${labels.join(', ')}`]
            : [],
    };
};

export const informationalRuleErrors = (rules: InformationalRule[]) => rules.flatMap(rule => {
    const errors: string[] = [];
    const isItemSpecific = rule.condition.itemSpecific === true;
    if (rule.action.type === 'FIXED_PRICE' && rule.action.value === 0 && !isItemSpecific) {
        errors.push(`특정 상품이 아닌 정보성 혜택을 0원 정가제로 계산할 수 없습니다: ${rule.description}`);
    }
    if (rule.action.type === 'FIXED_PRICE' && rule.action.value === 0 && isItemSpecific &&
        (rule.includedBrands ?? []).length === 0) {
        errors.push(`가맹점 매핑이 없는 무료 상품 혜택을 자동 계산할 수 없습니다: ${rule.description}`);
    }
    if (rule.action.value === 0 && !isItemSpecific && (
        typeof rule.limitConfig.dailyAmount === 'number' ||
        typeof rule.limitConfig.monthlyAmount === 'number'
    )) {
        errors.push(`계산 불가 정보성 혜택에 금액 한도가 설정됐습니다: ${rule.description}`);
    }
    return errors;
});
