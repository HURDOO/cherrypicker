import { z } from 'zod';
import type {
    BenefitRule,
    Card,
    CardNetwork,
    CardBenefitEvidence,
    CardBenefitExtraction,
    LimitConfig,
    PlatformType,
    RuleAction,
    RuleCondition,
} from '@/types';
import {
    OpenAIStructuredResponseClient,
    resolveOpenAIReasoningEffort,
} from './openai-responses';
import {
    analyzeAlternativeManualChecks,
    analyzeSharedLimitGroups,
    informationalRuleErrors,
    performanceWaiverConsistencyErrors,
} from './card-benefit-rule-consistency';

export const CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION = 2 as const;
export const SHINHAN_SOL_RULESET_VERSION = 'shinhan-sol-v5' as const;
export const SHINHAN_SOL_REQUIRED_RULE_IDS = [
    'sol_foreign_currency_payment',
    'sol_overseas_fee',
    'sol_overseas_atm',
    'sol_overseas_transport',
    'sol_domestic_convenience',
    'sol_domestic_transport',
    'sol_cu_event',
    'sol_lounge',
    'sol_master_travel_rewards',
    'sol_japan_convenience',
    'sol_vietnam_lottemart',
    'sol_vietnam_grab',
    'sol_usa_starbucks',
] as const;

export interface CardBenefitExtractionSource {
    sourceUrl: string;
    sourceText: string;
    mediaType?: string;
    pageTexts?: string[];
}

export interface CardBenefitExtractionInput {
    card: Card;
    sourceUrl: string;
    sourceText: string;
    sources?: CardBenefitExtractionSource[];
    catalog?: {
        categories: Array<{ id: string; name: string }>;
        brands: Array<{ id: string; name: string; categoryId: string }>;
    };
    baselineRules?: BenefitRule[];
}

export interface CardBenefitExtractionResult {
    extraction: CardBenefitExtraction;
    extractor: string;
    model?: string;
    confidence: number;
    validationErrors?: string[];
}

export interface CardBenefitExtractionProvider {
    readonly id: string;
    readonly model?: string;
    readonly cacheKey?: string;
    extract(input: CardBenefitExtractionInput): Promise<CardBenefitExtractionResult>;
}

export class CardBenefitExtractionBudgetError extends Error {
    constructor(public readonly maxExtractions: number) {
        super(
            maxExtractions === 0
                ? '이번 실행의 AI 카드 구조화가 비활성화되어 변경된 원문을 다음 실행으로 미룹니다.'
                : `이번 실행의 AI 카드 구조화 상한 ${maxExtractions}장에 도달해 나머지 변경 원문을 다음 실행으로 미룹니다.`
        );
        this.name = 'CardBenefitExtractionBudgetError';
    }
}

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();
const normalizedSource = (value: string) => value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{L}\p{N}%$]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const sourceContainsQuote = (sourceText: string, quote: string) => {
    const source = normalizedSource(sourceText);
    const normalizedQuote = normalizedSource(quote);
    if (normalizedQuote.length >= 3 && source.includes(normalizedQuote)) return true;
    const fragments = quote.split(/\r?\n+/)
        .map(fragment => normalizedSource(fragment))
        .filter(fragment => fragment.length >= 3);
    return fragments.length >= 2 && fragments.every(fragment => source.includes(fragment));
};
const unique = <T,>(values: T[]) => [...new Set(values)];
const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);
const isNonNegativeInteger = (value: unknown) => (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
);
const isIsoCalendarDate = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const extractionSources = (input: CardBenefitExtractionInput): CardBenefitExtractionSource[] => (
    input.sources && input.sources.length > 0
        ? input.sources
        : [{ sourceUrl: input.sourceUrl, sourceText: input.sourceText }]
);

const ruleActionTypes = ['PERCENT', 'FLAT', 'FIXED_PRICE'] as const;
const platformTypes = ['ALL', 'ONLINE', 'OFFLINE', 'OFFICIAL_SITE'] as const satisfies
    readonly PlatformType[];
const cardNetworks = [
    'DOMESTIC',
    'MASTERCARD',
    'VISA',
    'AMEX',
    'UNIONPAY',
    'OTHER',
] as const satisfies readonly CardNetwork[];
const benefitWeekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const sharedLimitFields = [
    'dailyCount',
    'dailyAmount',
    'monthlyCount',
    'yearlyCount',
    'monthlyAmount',
] as const;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const conditionNumberFields: Array<keyof RuleCondition> = [
    'minSpend',
    'maxSpend',
    'maxSpendExclusive',
    'minPerformance',
];
const conditionDateFields: Array<keyof RuleCondition> = ['startsAt', 'endsAt'];
const evidenceRequiredConditionFields: Array<keyof RuleCondition> = [
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
    'itemSpecific',
    'eligibleItemSummary',
];
const limitNumberFields: Array<keyof LimitConfig> = [
    'dailyCount',
    'dailyAmount',
    'monthlyCount',
    'yearlyCount',
    'monthlyAmount',
];

const validateAction = (value: unknown, label: string, errors: string[]) => {
    if (!isRecord(value) || !ruleActionTypes.includes(value.type as RuleAction['type'])) {
        errors.push(`${label} action.type이 올바르지 않습니다.`);
        return;
    }
    if (typeof value.value !== 'number' || !Number.isFinite(value.value) || value.value < 0) {
        errors.push(`${label} action.value가 올바르지 않습니다.`);
    }
    if (value.type === 'PERCENT' && typeof value.value === 'number' && value.value > 100) {
        errors.push(`${label} 할인율은 100%를 넘을 수 없습니다.`);
    }
    if (value.maxDiscount !== undefined && !isNonNegativeInteger(value.maxDiscount)) {
        errors.push(`${label} 건별 최대 혜택이 올바르지 않습니다.`);
    }
    if (value.amountBasis !== undefined && ![
        'ORIGINAL_AMOUNT',
        'REMAINING_AMOUNT',
    ].includes(String(value.amountBasis))) {
        errors.push(`${label} action.amountBasis가 올바르지 않습니다.`);
    }
};

const validateCondition = (value: unknown, label: string, errors: string[]) => {
    if (!isRecord(value)) {
        errors.push(`${label} condition이 올바르지 않습니다.`);
        return;
    }
    conditionNumberFields.forEach(field => {
        if (value[field] !== undefined && !isNonNegativeInteger(value[field])) {
            errors.push(`${label} ${field} 값이 올바르지 않습니다.`);
        }
    });
    conditionDateFields.forEach(field => {
        if (value[field] === undefined) return;
        if (!isIsoCalendarDate(value[field])) {
            errors.push(`${label} ${field} 날짜가 올바르지 않습니다.`);
        }
    });
    if (typeof value.startsAt === 'string' && typeof value.endsAt === 'string' &&
        value.startsAt > value.endsAt) {
        errors.push(`${label} 혜택 시작일이 종료일보다 늦습니다.`);
    }
    if (value.daysOfWeek !== undefined && (
        !Array.isArray(value.daysOfWeek) ||
        value.daysOfWeek.length === 0 ||
        value.daysOfWeek.some(day => !benefitWeekdays.includes(
            day as typeof benefitWeekdays[number]
        ))
    )) {
        errors.push(`${label} daysOfWeek 값이 올바르지 않습니다.`);
    }
    if (value.timeRanges !== undefined && (
        !Array.isArray(value.timeRanges) ||
        value.timeRanges.length === 0 ||
        value.timeRanges.some(range => (
            !isRecord(range) ||
            typeof range.startTime !== 'string' ||
            typeof range.endTime !== 'string' ||
            !timePattern.test(range.startTime) ||
            !timePattern.test(range.endTime)
        ))
    )) {
        errors.push(`${label} timeRanges 값이 올바르지 않습니다.`);
    }
    if (value.manualCheckRequired !== undefined && typeof value.manualCheckRequired !== 'boolean') {
        errors.push(`${label} manualCheckRequired 값이 올바르지 않습니다.`);
    }
    if (value.confirmationRequired !== undefined && typeof value.confirmationRequired !== 'boolean') {
        errors.push(`${label} confirmationRequired 값이 올바르지 않습니다.`);
    }
    if (value.requiredCardNetwork !== undefined &&
        !cardNetworks.includes(value.requiredCardNetwork as CardNetwork)) {
        errors.push(`${label} requiredCardNetwork 값이 올바르지 않습니다.`);
    }
    if (value.performanceWaiver !== undefined &&
        value.performanceWaiver !== 'NEW_CARD_REGISTRATION_WINDOW') {
        errors.push(`${label} performanceWaiver 값이 올바르지 않습니다.`);
    }
    if (value.stackableWithRuleIds !== undefined && (
        !Array.isArray(value.stackableWithRuleIds) ||
        value.stackableWithRuleIds.some(item => typeof item !== 'string')
    )) {
        errors.push(`${label} stackableWithRuleIds 값이 올바르지 않습니다.`);
    }
    if (value.applicationOrder !== undefined && !isNonNegativeInteger(value.applicationOrder)) {
        errors.push(`${label} applicationOrder 값이 올바르지 않습니다.`);
    }
    if (value.requiredNote !== undefined && typeof value.requiredNote !== 'string') {
        errors.push(`${label} requiredNote 값이 올바르지 않습니다.`);
    }
    if (value.itemSpecific !== undefined && typeof value.itemSpecific !== 'boolean') {
        errors.push(`${label} itemSpecific 값이 올바르지 않습니다.`);
    }
    if (value.eligibleItemSummary !== undefined && typeof value.eligibleItemSummary !== 'string') {
        errors.push(`${label} eligibleItemSummary 값이 올바르지 않습니다.`);
    }
    if (value.itemSpecific === true &&
        (typeof value.eligibleItemSummary !== 'string' || !value.eligibleItemSummary.trim())) {
        errors.push(`${label} 특정 상품 혜택에 eligibleItemSummary가 없습니다.`);
    }
    if (typeof value.minSpend === 'number' && typeof value.maxSpend === 'number' &&
        value.minSpend > value.maxSpend) {
        errors.push(`${label} 최소 결제금액이 최대 결제금액보다 큽니다.`);
    }
    if (typeof value.minSpend === 'number' && typeof value.maxSpendExclusive === 'number' &&
        value.minSpend >= value.maxSpendExclusive) {
        errors.push(`${label} 최소 결제금액이 미만 상한보다 작지 않습니다.`);
    }
};

const validateLimitConfig = (value: unknown, label: string, errors: string[]) => {
    if (!isRecord(value)) {
        errors.push(`${label} limitConfig가 올바르지 않습니다.`);
        return;
    }
    limitNumberFields.forEach(field => {
        if (value[field] !== undefined && !isNonNegativeInteger(value[field])) {
            errors.push(`${label} ${field} 값이 올바르지 않습니다.`);
        }
    });
    if (value.monthlyAmountByPerformance !== undefined) {
        if (!Array.isArray(value.monthlyAmountByPerformance) ||
            value.monthlyAmountByPerformance.length === 0) {
            errors.push(`${label} monthlyAmountByPerformance 값이 올바르지 않습니다.`);
        } else {
            const thresholds = new Set<number>();
            value.monthlyAmountByPerformance.forEach((tier, index) => {
                if (!isRecord(tier) || !isNonNegativeInteger(tier.threshold) ||
                    !isNonNegativeInteger(tier.limit)) {
                    errors.push(`${label} 실적별 월 한도 ${index + 1}번이 올바르지 않습니다.`);
                    return;
                }
                if (thresholds.has(tier.threshold as number)) {
                    errors.push(`${label} 실적별 월 한도 기준이 중복되었습니다.`);
                }
                thresholds.add(tier.threshold as number);
            });
        }
    }
    if (value.sharedFields !== undefined && (
        !Array.isArray(value.sharedFields) ||
        value.sharedFields.length === 0 ||
        value.sharedFields.some(field => !sharedLimitFields.includes(
            field as typeof sharedLimitFields[number]
        ))
    )) {
        errors.push(`${label} sharedFields 값이 올바르지 않습니다.`);
    }
};

const moneyTokenSource = '(?:백만원|(?:[0-9][0-9,]*(?:\\.[0-9]+)?(?:억|만|천|백)?)+\\s*원)';

const parseKoreanMoney = (value: string) => {
    const normalized = value.replace(/[\s,]+/g, '');
    if (normalized === '백만원') return 1_000_000;
    const match = normalized.match(/^(.+)원$/);
    if (!match) return undefined;
    if (/^[0-9]+(?:\.[0-9]+)?$/.test(match[1])) {
        const amount = Number(match[1]);
        return Number.isSafeInteger(amount) ? amount : undefined;
    }
    const unitValues: Record<string, number> = {
        억: 100_000_000,
        만: 10_000,
        천: 1_000,
        백: 100,
    };
    const segments = [...match[1].matchAll(/([0-9]+(?:\.[0-9]+)?)(억|만|천|백)/g)];
    if (segments.map(segment => segment[0]).join('') !== match[1]) return undefined;
    const result = segments.reduce((total, segment) => (
        total + Number(segment[1]) * unitValues[segment[2]]
    ), 0);
    return Number.isSafeInteger(result) ? result : undefined;
};

const evidenceTextForRule = (
    ruleId: string,
    evidence: CardBenefitEvidence[],
    field?: CardBenefitEvidence['fields'][number],
) => evidence
    .filter(item => item.ruleIds.includes(ruleId) && (!field || item.fields.includes(field)))
    .map(item => `${item.location ?? ''}\n${item.quote}`)
    .join('\n');

const koreanMoneyValuesIn = (value: string) => unique(
    [...value.normalize('NFKC').matchAll(new RegExp(moneyTokenSource, 'gi'))]
        .map(match => parseKoreanMoney(match[0]))
        .filter((amount): amount is number => amount !== undefined)
);

const percentageValuesIn = (value: string) => unique(
    [...value.normalize('NFKC').matchAll(/([0-9]+(?:\.[0-9]+)?)\s*%/g)]
        .map(match => Number(match[1]))
);

const semanticTitleTokens = (value: string) => {
    const generic = new Set([
        'basic', 'easy', '서비스', '혜택', '할인', '캐시백', '제공', '이용', '이용권',
        '조건', '한도', '월간', '통합', '적용', '대상', '결제', '매월',
    ]);
    return unique((normalizeText(value).toLocaleLowerCase('ko-KR')
        .match(/[\p{L}\p{N}]+/gu) ?? [])
        .filter(token => token.length >= 2 &&
            /\p{L}/u.test(token) &&
            !/^\d+(?:(?:억|만|천)?원|회|개|명)$/u.test(token) &&
            !generic.has(token)));
};

const isIntegratedLimitScopeText = (value: string) => (
    /통합[^\n]{0,50}(?:적용\s*대상|대상\s*서비스)/i.test(value) ||
    /서비스\s*통합\s*(?:캐시백|할인)?\s*한도/i.test(value) ||
    /통합\s*(?:캐시백|할인)?\s*한도\s*내에서\s*적용/i.test(value)
);

const isIntegratedLimitTargetListText = (value: string) => (
    /통합[^\n]{0,50}(?:적용\s*대상|대상\s*서비스)/i.test(value)
);

const validateRuleSemanticEvidence = (
    rules: BenefitRule[],
    evidence: CardBenefitEvidence[],
    baselineLimitTable: Card['limitTable'] = [],
) => {
    const errors: string[] = [];
    const ruleById = new Map(rules.map(ruleRow => [ruleRow.id, ruleRow]));
    rules.forEach(ruleRow => {
        const label = ruleRow.description;
        const conditionEvidence = evidenceTextForRule(ruleRow.id, evidence, 'condition');
        const conditionMoneyValues = koreanMoneyValuesIn(conditionEvidence);
        ([
            ['minSpend', '최소 결제금액'],
            ['maxSpend', '최대 결제금액'],
            ['maxSpendExclusive', '배타적 최대 결제금액'],
            ['minPerformance', '최소 실적'],
        ] as const).forEach(([field, fieldLabel]) => {
            const amount = ruleRow.condition[field];
            const supportedByBaselineCardLimit = field === 'minPerformance' &&
                ruleRow.usesCardLimit === true &&
                baselineLimitTable.some(tier => tier.threshold === amount) &&
                /전월\s*이용실적에\s*따른\s*통합할인한도\s*적용/i.test(conditionEvidence);
            if (amount !== undefined && !conditionMoneyValues.includes(amount) &&
                !supportedByBaselineCardLimit) {
                errors.push(`${fieldLabel} ${amount.toLocaleString()}원의 공식 숫자 근거가 없습니다: ${label}`);
            }
        });
        if (/미만/.test(label) && ruleRow.condition.maxSpendExclusive === undefined) {
            errors.push(`결제금액 미만 구간에 배타적 상한이 없습니다: ${label}`);
        }
        if (/이하/.test(label) && ruleRow.condition.maxSpend === undefined) {
            errors.push(`결제금액 이하 구간에 최대 결제금액이 없습니다: ${label}`);
        }
        if (/(?:행사\s*(?:품목|상품)|팝콘[^\n]{0,30}세트|스몰\s*세트)/i.test(label) &&
            ruleRow.condition.itemSpecific !== true) {
            errors.push(`특정 상품 혜택이 대상 상품 금액 조건으로 표시되지 않았습니다: ${label}`);
        }
        const limitEvidence = evidenceTextForRule(ruleRow.id, evidence, 'limitConfig');
        const limitMoneyValues = koreanMoneyValuesIn(limitEvidence);
        ([
            ['dailyAmount', '일 금액 한도'],
            ['monthlyAmount', '월 금액 한도'],
        ] as const).forEach(([field, fieldLabel]) => {
            const amount = ruleRow.limitConfig[field];
            if (amount !== undefined && !limitMoneyValues.includes(amount)) {
                errors.push(`${fieldLabel} ${amount.toLocaleString()}원의 공식 숫자 근거가 없습니다: ${label}`);
            }
        });
        if (ruleRow.limitConfig.dailyCount !== undefined &&
            !/(?:일|하루)[^\n]{0,20}\d+\s*회/i.test(limitEvidence)) {
            errors.push(`일 횟수 한도의 공식 근거가 없습니다: ${label}`);
        }
        const hasMonthlyCountEvidence = /(?:월|매월)[^\n]{0,20}\d+\s*회/i.test(limitEvidence) ||
            (ruleRow.limitConfig.monthlyCount === 3 &&
                /(?:매\s*월|당월)[^\n]{0,60}3\s*[,·]\s*6\s*[,·]\s*9(?:회째|번째)/i
                    .test(limitEvidence));
        if (ruleRow.limitConfig.monthlyCount !== undefined && !hasMonthlyCountEvidence) {
            errors.push(`월 횟수 한도의 공식 근거가 없습니다: ${label}`);
        }
        if (ruleRow.limitConfig.yearlyCount !== undefined &&
            !/(?:연|연간)[^\n]{0,20}\d+\s*회/i.test(limitEvidence)) {
            errors.push(`연 횟수 한도의 공식 근거가 없습니다: ${label}`);
        }
        const evidenceTiers = performanceLimitTiersIn(limitEvidence);
        if (evidenceTiers.length >= 2 && JSON.stringify(
            ruleRow.limitConfig.monthlyAmountByPerformance ?? []
        ) !== JSON.stringify(evidenceTiers)) {
            errors.push(`실적별 서비스 월 한도 표가 구조화되지 않았습니다: ${label}`);
        }
        if (ruleRow.limitConfig.sharedFields?.length && !ruleRow.sharedGroupId) {
            errors.push(`공유 필드가 있지만 공유 한도 그룹이 없습니다: ${label}`);
        }
        const actionEvidence = evidenceTextForRule(ruleRow.id, evidence);
        const actionFieldEvidence = evidenceTextForRule(ruleRow.id, evidence, 'action');
        const actionPercentages = percentageValuesIn(actionFieldEvidence);
        if (ruleRow.action.type === 'PERCENT' && ruleRow.action.value > 0 &&
            !actionPercentages.some(value => Math.abs(value - ruleRow.action.value) < 0.0001) &&
            Math.abs(actionPercentages.reduce((sum, value) => sum + value, 0) -
                ruleRow.action.value) >= 0.0001) {
            errors.push(`할인율 ${ruleRow.action.value}%의 공식 숫자 근거가 없습니다: ${label}`);
        }
        if (ruleRow.action.maxDiscount !== undefined &&
            !new RegExp(
                `(?:결제\\s*)?(?:건당|1\\s*회(?:\\s*당)?)\\s*` +
                `(?:최대|한도)?\\s*${moneyTokenSource}(?:까지)?(?:\\s*(?:할인|적립|캐시백))?`,
                'i',
            ).test(actionEvidence)) {
            errors.push(`건별 최대 혜택이 일·월 한도에서 잘못 파생됐을 수 있습니다: ${label}`);
        }
        const paymentCapMatch = normalizeText(actionEvidence).match(new RegExp(
            `1\\s*회\\s*승인\\s*금액\\s*(${moneyTokenSource})\\s*까지` +
            `\\s*할인\\s*적용`,
            'i',
        ));
        const paymentCap = paymentCapMatch ? parseKoreanMoney(paymentCapMatch[1]) : undefined;
        if (paymentCap !== undefined && ruleRow.condition.maxSpend === paymentCap) {
            errors.push(`할인 적용 결제액 상한을 거래 제외 maxSpend로 해석했습니다: ${label}`);
        }
        if (/(?:Night|나이트)/i.test(label) &&
            /오후\s*9시[\s\S]{0,20}오전\s*9시/i.test(actionEvidence) &&
            !ruleRow.condition.timeRanges?.some(range => (
                range.startTime === '21:00' && range.endTime === '09:00'
            ))) {
            errors.push(`Night 혜택 승인 시간대가 구조화되지 않았습니다: ${label}`);
        }
        if (/주말/.test(label) &&
            /토요일\s*(?:\/|·|및|과)\s*일요일/.test(actionEvidence) &&
            !(['SAT', 'SUN'] as const).every(day => ruleRow.condition.daysOfWeek?.includes(day))) {
            errors.push(`주말 혜택 적용 요일이 구조화되지 않았습니다: ${label}`);
        }
        const includedBrands = ruleRow.includedBrands ?? [];
        if (ruleRow.action.value > 0 && ruleRow.platformType === 'OFFICIAL_SITE' &&
            includedBrands.length === 0) {
            errors.push(`공식 사이트 전용 혜택에 가맹점 매핑이 없습니다: ${label}`);
        }
        if (ruleRow.action.value > 0 && includedBrands.length === 0 && (
            /편의점\s*업종|병원\s*\/\s*약국\s*업종|세탁소\s*업종/i.test(actionEvidence)
        )) {
            errors.push(`혼합 카테고리보다 좁은 업종 혜택에 가맹점 매핑이 없습니다: ${label}`);
        }
    });

    const integratedScopeEvidence = evidence.filter(item => (
        isIntegratedLimitScopeText(`${item.location ?? ''}\n${item.quote}`)
    ));
    if (integratedScopeEvidence.length > 0) {
        const scopedRuleIds = new Set(integratedScopeEvidence.flatMap(item => item.ruleIds));
        integratedScopeEvidence.forEach(scopeEvidence => {
            const normalizedScope = normalizedSource(scopeEvidence.quote);
            scopeEvidence.ruleIds.forEach(ruleId => {
                const ruleRow = ruleById.get(ruleId);
                if (!ruleRow) return;
                if (ruleRow.usesCardLimit !== true) {
                    errors.push(`통합한도 대상 규칙의 usesCardLimit이 false입니다: ${ruleRow.description}`);
                }
                if (isIntegratedLimitTargetListText(
                    `${scopeEvidence.location ?? ''}\n${scopeEvidence.quote}`
                )) {
                    const ownLocations = evidence
                        .filter(item => item.id !== scopeEvidence.id &&
                            item.ruleIds.includes(ruleId) &&
                            (item.fields.includes('description') || item.fields.includes('action')))
                        .map(item => item.location ?? '');
                    const tokens = ownLocations.flatMap(semanticTitleTokens);
                    if (tokens.length > 0 && !tokens.some(token => normalizedScope.includes(token))) {
                        errors.push(
                            `공식 통합한도 대상 목록에 없는 규칙이 연결됐습니다: ${ruleRow.description}`
                        );
                    }
                }
            });
        });
        rules.filter(ruleRow => ruleRow.usesCardLimit === true).forEach(ruleRow => {
            if (!scopedRuleIds.has(ruleRow.id)) {
                errors.push(`통합한도 사용 규칙이 공식 대상 목록에 없습니다: ${ruleRow.description}`);
            }
        });
    }
    return unique(errors);
};

const validateSourceBackedChannelAndFallbackCoverage = (
    rules: BenefitRule[],
    input: CardBenefitExtractionInput,
) => {
    const errors: string[] = [];
    const sourceText = normalizeText(extractionSources(input)
        .map(source => source.sourceText)
        .join('\n'));
    const catalogBrands = input.catalog?.brands ?? [];

    if (/스타벅스\s*사이렌\s*오더\s*제외/i.test(sourceText)) {
        const starbucksIds = new Set(catalogBrands
            .filter(brand => /스타벅스/i.test(brand.name))
            .map(brand => brand.id));
        const hasOnlineSirenRule = rules.some(ruleRow => (
            (ruleRow.platformType === 'ONLINE' || ruleRow.platformType === 'OFFICIAL_SITE') &&
            ruleRow.includedBrands?.some(brandId => starbucksIds.has(brandId)) &&
            /사이렌\s*오더/i.test(`${ruleRow.description}\n${ruleRow.detail}`) &&
            ruleRow.condition.manualCheckRequired === true
        ));
        if (!hasOnlineSirenRule) {
            errors.push('스타벅스 사이렌 오더 예외가 온라인 조건부 규칙으로 구조화되지 않았습니다.');
        }
    }

    if (/GS25\s*해군마트[\s\S]{0,180}횟수\s*및\s*한도\s*초과\s*시[\s\S]{0,120}Life\s*서비스[\s\S]{0,100}편의점\s*20\s*%/i
        .test(sourceText)) {
        const hasNavyMartFallback = rules.some(ruleRow => (
            ruleRow.usesCardLimit === true &&
            ruleRow.action.type === 'PERCENT' &&
            ruleRow.action.value === 20 &&
            /GS25\s*해군마트[\s\S]*Life\s*편의점/i.test(
                `${ruleRow.description}\n${ruleRow.detail}`
            ) &&
            ruleRow.condition.manualCheckRequired === true
        ));
        if (!hasNavyMartFallback) {
            errors.push('GS25 해군마트의 군마트 한도 초과 후 Life 편의점 전환 규칙이 누락됐습니다.');
        }
    }

    return errors;
};

export function validateCardBenefitExtraction(
    value: unknown,
    input: CardBenefitExtractionInput,
    references?: {
        categoryIds?: ReadonlySet<string>;
        brandIds?: ReadonlySet<string>;
        ruleOwners?: ReadonlyMap<string, { cardId: string; userId?: string | null }>;
    },
): { extraction?: CardBenefitExtraction; errors: string[] } {
    const errors: string[] = [];
    if (!isRecord(value)) return { errors: ['구조화 결과가 객체가 아닙니다.'] };
    if (value.schemaVersion !== CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION) {
        errors.push('지원하지 않는 카드 혜택 schema version입니다.');
    }
    if (value.completeness !== 'FULL') {
        errors.push('전체 규칙 교체 후보는 completeness가 FULL이어야 합니다.');
    }
    if (!isRecord(value.card)) {
        errors.push('카드 정보가 올바르지 않습니다.');
    } else {
        if (value.card.id !== input.card.id) errors.push('대상 카드 ID를 변경할 수 없습니다.');
        if (typeof value.card.name !== 'string' || !value.card.name.trim()) {
            errors.push('카드 이름이 올바르지 않습니다.');
        }
        if (typeof value.card.company !== 'string' || !value.card.company.trim()) {
            errors.push('카드사 이름이 올바르지 않습니다.');
        }
        if (!Array.isArray(value.card.limitTable)) {
            errors.push('실적별 통합 한도 표가 올바르지 않습니다.');
        } else {
            const thresholds = new Set<number>();
            value.card.limitTable.forEach((tier, index) => {
                if (!isRecord(tier) || !isNonNegativeInteger(tier.threshold) ||
                    !isNonNegativeInteger(tier.limit)) {
                    errors.push(`실적 한도 ${index + 1}번 항목이 올바르지 않습니다.`);
                    return;
                }
                if (thresholds.has(tier.threshold as number)) {
                    errors.push(`실적 기준 ${tier.threshold}원이 중복되었습니다.`);
                }
                thresholds.add(tier.threshold as number);
            });
        }
        if (value.card.network !== undefined &&
            !cardNetworks.includes(value.card.network as CardNetwork)) {
            errors.push('카드 브랜드가 올바르지 않습니다.');
        }
        if (input.card.id === 'shinhan_sol' && (
            value.card.name !== '신한카드 SOL트래블 체크' ||
            value.card.company !== '신한카드' ||
            !Array.isArray(value.card.limitTable) ||
            value.card.limitTable.length !== 0 ||
            value.card.network !== 'MASTERCARD'
        )) {
            errors.push('신한 SOL트래블 공식 카드 기본 정보와 다릅니다.');
        }
    }

    const ruleIds = new Set<string>();
    if (!Array.isArray(value.rules) || value.rules.length === 0 || value.rules.length > 100) {
        errors.push('혜택 규칙은 1건 이상 100건 이하여야 합니다.');
    } else {
        value.rules.forEach((rule, index) => {
            const label = `규칙 ${index + 1}`;
            if (!isRecord(rule)) {
                errors.push(`${label} 형식이 올바르지 않습니다.`);
                return;
            }
            if (typeof rule.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{2,99}$/.test(rule.id)) {
                errors.push(`${label} ID가 올바르지 않습니다.`);
            } else if (ruleIds.has(rule.id)) {
                errors.push(`규칙 ID ${rule.id}가 중복되었습니다.`);
            } else {
                ruleIds.add(rule.id);
                const owner = references?.ruleOwners?.get(rule.id);
                if (owner && (
                    owner.cardId !== input.card.id ||
                    (owner.userId !== null && owner.userId !== undefined)
                )) {
                    errors.push(`${label} ID가 다른 카드 또는 사용자 규칙과 충돌합니다.`);
                }
            }
            if (rule.cardId !== input.card.id) errors.push(`${label}의 카드 ID가 다릅니다.`);
            if (rule.userId !== undefined) errors.push(`${label}에 사용자 소유권을 넣을 수 없습니다.`);
            if (rule.category !== undefined && typeof rule.category !== 'string') {
                errors.push(`${label} 카테고리가 올바르지 않습니다.`);
            } else if (typeof rule.category === 'string' && references?.categoryIds &&
                !references.categoryIds.has(rule.category)) {
                errors.push(`${label}이 존재하지 않는 카테고리 ${rule.category}를 참조합니다.`);
            }
            for (const field of ['includedBrands', 'excludedBrands'] as const) {
                const ids = rule[field];
                if (!Array.isArray(ids) || ids.some(item => typeof item !== 'string')) {
                    errors.push(`${label} ${field} 형식이 올바르지 않습니다.`);
                } else if (references?.brandIds) {
                    ids.forEach(id => {
                        if (!references.brandIds?.has(id)) {
                            errors.push(`${label}이 존재하지 않는 브랜드 ${id}를 참조합니다.`);
                        }
                    });
                }
            }
            if (!platformTypes.includes(rule.platformType as PlatformType)) {
                errors.push(`${label} 적용 채널이 올바르지 않습니다.`);
            }
            if (typeof rule.usesCardLimit !== 'boolean') {
                errors.push(`${label} 통합 한도 사용 여부가 올바르지 않습니다.`);
            }
            if (typeof rule.description !== 'string' || !rule.description.trim()) {
                errors.push(`${label} 설명이 비어 있습니다.`);
            }
            if (typeof rule.detail !== 'string') errors.push(`${label} 상세 설명이 올바르지 않습니다.`);
            validateCondition(rule.condition, label, errors);
            validateAction(rule.action, label, errors);
            validateLimitConfig(rule.limitConfig, label, errors);
        });
        if (input.card.id === 'shinhan_sol') {
            validateShinhanSolRuleCoverage(value.rules, errors);
        }
        value.rules.forEach((rule, index) => {
            if (!isRecord(rule) || !isRecord(rule.condition)) return;
            const stackableIds = rule.condition.stackableWithRuleIds;
            if (!Array.isArray(stackableIds)) return;
            stackableIds.forEach(ruleId => {
                if (typeof ruleId === 'string' && !ruleIds.has(ruleId)) {
                    errors.push(`규칙 ${index + 1}이 알 수 없는 중복 혜택 ${ruleId}를 참조합니다.`);
                }
            });
        });
    }

    const evidencedFieldsByRule = new Map<string, Set<CardBenefitEvidence['fields'][number]>>();
    if (!Array.isArray(value.evidence) || value.evidence.length === 0) {
        errors.push('공식 원문 근거가 없습니다.');
    } else {
        const evidenceIds = new Set<string>();
        const sources = extractionSources(input);
        const sourceByUrl = new Map(sources.map(source => [source.sourceUrl, source]));
        value.evidence.forEach((evidence, index) => {
            const label = `근거 ${index + 1}`;
            if (!isRecord(evidence) || typeof evidence.id !== 'string' ||
                !Array.isArray(evidence.ruleIds) ||
                evidence.ruleIds.some(ruleId => typeof ruleId !== 'string') ||
                !Array.isArray(evidence.fields) ||
                evidence.fields.some(field => ![
                    'description',
                    'condition',
                    'action',
                    'limitConfig',
                ].includes(String(field))) ||
                typeof evidence.quote !== 'string') {
                errors.push(`${label} 형식이 올바르지 않습니다.`);
                return;
            }
            if (evidenceIds.has(evidence.id)) errors.push(`근거 ID ${evidence.id}가 중복되었습니다.`);
            evidenceIds.add(evidence.id);
            const quote = evidence.quote.trim();
            const evidenceSourceUrl = typeof evidence.sourceUrl === 'string'
                ? evidence.sourceUrl
                : sources.length === 1
                    ? sources[0].sourceUrl
                    : undefined;
            const source = evidenceSourceUrl ? sourceByUrl.get(evidenceSourceUrl) : undefined;
            if (!evidenceSourceUrl) {
                errors.push(`${label}에 공식 원문 URL이 없습니다.`);
            } else if (!source) {
                errors.push(`${label}이 수집되지 않은 공식 원문을 참조합니다.`);
            } else if (quote.length < 3 || quote.length > 500 ||
                !sourceContainsQuote(source.sourceText, quote)) {
                errors.push(`${label} 문장이 공식 원문에서 확인되지 않습니다.`);
            }
            const evidenceFields = evidence.fields as CardBenefitEvidence['fields'];
            evidence.ruleIds.forEach(ruleId => {
                const fields = evidencedFieldsByRule.get(ruleId) ?? new Set();
                evidenceFields.forEach(field => fields.add(field));
                evidencedFieldsByRule.set(ruleId, fields);
                if (!ruleIds.has(ruleId)) errors.push(`${label}이 알 수 없는 규칙 ${ruleId}를 참조합니다.`);
            });
            if (evidence.page !== undefined &&
                (!Number.isSafeInteger(evidence.page) || (evidence.page as number) < 1)) {
                errors.push(`${label} 페이지 번호가 올바르지 않습니다.`);
            } else if (source?.mediaType === 'application/pdf' && evidence.page === undefined) {
                errors.push(`${label}에 PDF 페이지 번호가 없습니다.`);
            } else if (evidence.page !== undefined && source) {
                const pageText = source.pageTexts?.[(evidence.page as number) - 1];
                if (!pageText || !sourceContainsQuote(pageText, quote)) {
                    errors.push(`${label} 문장이 지정한 PDF 페이지에서 확인되지 않습니다.`);
                }
            }
        });
    }
    (Array.isArray(value.rules) ? value.rules : []).forEach(rule => {
        if (!isRecord(rule) || typeof rule.id !== 'string') return;
        const fields = evidencedFieldsByRule.get(rule.id) ?? new Set();
        if (!fields.has('description') || !fields.has('action')) {
            errors.push(`규칙 ${rule.id}의 혜택·계산 근거가 없습니다.`);
        }
        if (isRecord(rule.condition) && evidenceRequiredConditionFields.some(field => (
            (rule.condition as Record<string, unknown>)[field] !== undefined
        )) &&
            !fields.has('condition')) {
            errors.push(`규칙 ${rule.id}의 적용 조건 근거가 없습니다.`);
        }
        if (isRecord(rule.limitConfig) && Object.keys(rule.limitConfig).length > 0 &&
            !fields.has('limitConfig')) {
            errors.push(`규칙 ${rule.id}의 한도 근거가 없습니다.`);
        }
    });
    if (Array.isArray(value.rules) && Array.isArray(value.evidence) &&
        value.rules.every(ruleRow => isRecord(ruleRow) && isRecord(ruleRow.condition) &&
            isRecord(ruleRow.action) && isRecord(ruleRow.limitConfig)) &&
        value.evidence.every(item => isRecord(item) && typeof item.id === 'string' &&
            Array.isArray(item.ruleIds) && Array.isArray(item.fields) &&
            typeof item.quote === 'string')) {
        errors.push(...validateRuleSemanticEvidence(
            value.rules as unknown as BenefitRule[],
            value.evidence as unknown as CardBenefitEvidence[],
            input.card.limitTable,
        ));
        errors.push(...validateSourceBackedChannelAndFallbackCoverage(
            value.rules as unknown as BenefitRule[],
            input,
        ));
        errors.push(...analyzeSharedLimitGroups(
            value.rules as unknown as BenefitRule[],
        ).errors);
        errors.push(...performanceWaiverConsistencyErrors(
            value.rules as unknown as BenefitRule[],
            {
                hasCardLimitTable: isRecord(value.card) &&
                    Array.isArray(value.card.limitTable) &&
                    value.card.limitTable.length > 0,
                waiverExemptRuleIds: new Set((value.evidence as unknown as CardBenefitEvidence[])
                    .filter(item => (
                        /실적[\s\S]{0,80}유예[\s\S]{0,80}제외|(?:대중교통|통신요금)[\s\S]{0,80}제외/i
                            .test(`${item.location ?? ''}\n${item.quote}`)
                    )).flatMap(item => item.ruleIds)),
            },
        ));
        errors.push(...analyzeAlternativeManualChecks(
            value.rules as unknown as BenefitRule[],
        ).errors);
        errors.push(...informationalRuleErrors(
            value.rules as unknown as BenefitRule[],
        ));
    }
    if (!Array.isArray(value.notes) || value.notes.some(note => typeof note !== 'string')) {
        errors.push('검수 메모 형식이 올바르지 않습니다.');
    }

    return {
        ...(errors.length === 0 && { extraction: value as unknown as CardBenefitExtraction }),
        errors: unique(errors),
    };
}

const findEvidence = (
    input: CardBenefitExtractionInput,
    pattern: RegExp,
): Pick<CardBenefitEvidence, 'quote' | 'sourceUrl' | 'page'> | undefined => {
    for (const source of extractionSources(input)) {
        if (source.pageTexts) {
            for (const [index, pageText] of source.pageTexts.entries()) {
                const quote = normalizeText(pageText).match(pattern)?.[0].trim();
                if (quote) return { quote, sourceUrl: source.sourceUrl, page: index + 1 };
            }
        }
        const quote = normalizeText(source.sourceText).match(pattern)?.[0].trim();
        if (quote) return { quote, sourceUrl: source.sourceUrl };
    }
    return undefined;
};

const rule = (
    id: string,
    cardId: string,
    values: Omit<BenefitRule, 'id' | 'cardId' | 'includedBrands' | 'excludedBrands' |
        'platformType' | 'usesCardLimit'> & Partial<Pick<BenefitRule,
        'includedBrands' | 'excludedBrands' | 'platformType' | 'usesCardLimit'>>,
): BenefitRule => ({
    id,
    cardId,
    includedBrands: values.includedBrands ?? [],
    excludedBrands: values.excludedBrands ?? [],
    platformType: values.platformType ?? 'ALL',
    usesCardLimit: values.usesCardLimit ?? true,
    description: values.description,
    detail: values.detail,
    condition: values.condition,
    action: values.action,
    limitConfig: values.limitConfig,
    ...(values.category && { category: values.category }),
});

const buildShinhanSolRules = (cardId: string): BenefitRule[] => [
        rule('sol_foreign_currency_payment', cardId, {
            category: 'etc',
            includedBrands: ['overseas_payment'],
            description: '해외 현지통화 결제',
            detail: '외화결제계좌에서 현지 통화로 인출되는 결제 서비스',
            condition: {
                requiredCardNetwork: 'MASTERCARD',
                manualCheckRequired: true,
                requiredNote: '지원 통화와 외화계좌 잔액 확인 필요',
            },
            action: { type: 'FLAT', value: 0 },
            limitConfig: {},
            usesCardLimit: false,
        }),
        rule('sol_overseas_fee', cardId, {
            category: 'etc',
            includedBrands: [
                'overseas_payment',
                'overseas_transport',
                'japan_convenience',
                'vietnam_lottemart',
                'vietnam_grab',
                'usa_starbucks',
            ],
            description: '해외 결제 수수료 면제',
            detail: 'Mastercard 선택 시 국제브랜드 1%와 해외서비스 0.2% 수수료 면제, 전월 실적·한도 없음',
            condition: {
                requiredCardNetwork: 'MASTERCARD',
                confirmationRequired: true,
                requiredNote: '해외가맹점에서 수수료가 실제 부과되는 거래인지 확인',
                stackableWithRuleIds: [
                    'sol_overseas_transport',
                    'sol_japan_convenience',
                    'sol_vietnam_lottemart',
                    'sol_vietnam_grab',
                    'sol_usa_starbucks',
                ],
                applicationOrder: 1,
            },
            action: { type: 'PERCENT', value: 1.2, amountBasis: 'ORIGINAL_AMOUNT' },
            limitConfig: {},
            usesCardLimit: false,
        }),
        rule('sol_overseas_atm', cardId, {
            category: 'etc',
            includedBrands: ['overseas_atm'],
            description: '해외 ATM 수수료 면제',
            detail: 'ATM 인출 수수료 건당 3달러와 국제브랜드 수수료 1% 면제, ATM 운영사 수수료는 부과 가능',
            condition: {
                requiredCardNetwork: 'MASTERCARD',
                manualCheckRequired: true,
                requiredNote: 'ATM 운영사 수수료와 해외 인출 한도 확인 필요',
            },
            action: { type: 'FLAT', value: 0 },
            limitConfig: {},
            usesCardLimit: false,
        }),
        rule('sol_overseas_transport', cardId, {
            category: 'transport',
            includedBrands: ['overseas_transport'],
            description: '해외 대중교통 1% 할인',
            detail: 'Mastercard 컨택리스 해외 버스·지하철·트램 대상, 택시 제외, 월 최대 3천원, 전월 실적 없음',
            condition: {
                requiredCardNetwork: 'MASTERCARD',
                confirmationRequired: true,
                requiredNote: '컨택리스 대중교통 결제이며 택시 이용이 아닌지 확인',
                stackableWithRuleIds: ['sol_overseas_fee'],
                applicationOrder: 2,
            },
            action: { type: 'PERCENT', value: 1 },
            limitConfig: { monthlyAmount: 3_000 },
            usesCardLimit: false,
        }),
        rule('sol_domestic_convenience', cardId, {
            category: 'convenience',
            includedBrands: ['cu', 'cu_event', 'gs25', 'seveneleven', 'emart24'],
            description: '국내 편의점 5% 할인',
            detail: '전월 국내 30만원 이상, 오프라인 일 1회·월 3회·월 3천원, 온라인·입점 매장 제외',
            condition: {
                minPerformance: 300_000,
                performanceWaiver: 'NEW_CARD_REGISTRATION_WINDOW',
                confirmationRequired: true,
                requiredNote: '오프라인 독립 매장이며 상품권·선불충전·포인트 사용·취소 거래가 아니고, CU 행사상품 중복 외 다른 신한 할인이 적용되지 않았는지 확인',
                stackableWithRuleIds: ['sol_cu_event'],
                applicationOrder: 2,
            },
            action: { type: 'PERCENT', value: 5, amountBasis: 'REMAINING_AMOUNT' },
            limitConfig: { dailyCount: 1, monthlyCount: 3, monthlyAmount: 3_000 },
            platformType: 'OFFLINE',
            usesCardLimit: false,
        }),
        rule('sol_domestic_transport', cardId, {
            category: 'transport',
            includedBrands: ['transport_public'],
            description: '국내 대중교통 1% 할인',
            detail: '전월 국내 30만원 이상, 후불교통 RF 거래, 고속버스 제외, 월 최대 3천원',
            condition: {
                minPerformance: 300_000,
                performanceWaiver: 'NEW_CARD_REGISTRATION_WINDOW',
                confirmationRequired: true,
                requiredNote: '후불교통 RF 거래·고속버스 제외이며 포인트 사용·취소·다른 신한 할인 적용 거래가 아닌지 확인',
            },
            action: { type: 'PERCENT', value: 1 },
            limitConfig: { monthlyAmount: 3_000 },
            usesCardLimit: false,
        }),
        rule('sol_cu_event', cardId, {
            category: 'convenience',
            includedBrands: ['cu_event'],
            description: 'CU 행사상품 5% 즉시할인',
            detail: '전월 실적 없음, 행사상품 건당 최대 2천원, 복합결제·일부 간편결제·일부 매장 제외',
            condition: {
                startsAt: '2024-06-20',
                itemSpecific: true,
                eligibleItemSummary: 'CU 행사상품 결제금액',
                confirmationRequired: true,
                requiredNote: '행사상품을 전액 카드로 결제하며 제외 간편결제·매장이 아닌지 확인',
                stackableWithRuleIds: ['sol_domestic_convenience'],
                applicationOrder: 1,
            },
            action: { type: 'PERCENT', value: 5, maxDiscount: 2_000 },
            limitConfig: {},
            usesCardLimit: false,
            platformType: 'OFFLINE',
        }),
        rule('sol_lounge', cardId, {
            category: 'etc',
            includedBrands: ['airport_lounge'],
            description: '공항 라운지 무료',
            detail: '전월 국내 30만원 이상, 반기 1회·연 2회. 신규 회원은 등록월+1개월까지 국내 누적 30만원 필요',
            condition: {
                minPerformance: 300_000,
                manualCheckRequired: true,
                requiredNote: '라운지 이용권 혜택은 결제금액 계산 제외',
            },
            action: { type: 'FLAT', value: 0 },
            limitConfig: { yearlyCount: 2 },
            usesCardLimit: false,
        }),
        rule('sol_master_travel_rewards', cardId, {
            category: 'etc',
            includedBrands: ['master_travel_rewards'],
            description: 'Mastercard Travel Rewards 최대 10% 캐시백',
            detail: '참여 해외 가맹점별 캐시백 조건이 다르며 2026년 12월 31일까지 제공',
            condition: {
                endsAt: '2026-12-31',
                requiredCardNetwork: 'MASTERCARD',
                manualCheckRequired: true,
                requiredNote: 'Mastercard Travel Rewards 참여 가맹점별 조건 확인 필요',
            },
            action: { type: 'PERCENT', value: 10 },
            limitConfig: {},
            usesCardLimit: false,
        }),
        rule('sol_japan_convenience', cardId, {
            category: 'convenience',
            includedBrands: ['japan_convenience'],
            description: '일본 3대 편의점 5% 할인',
            detail: '일본 FamilyMart·Lawson·Seven-Eleven 오프라인, ATM·입점 매장·상품권 제외',
            condition: {
                endsAt: '2026-12-31',
                requiredCardNetwork: 'MASTERCARD',
                confirmationRequired: true,
                requiredNote: '일본 오프라인 독립 매장이며 ATM·입점 매장·상품권 거래가 아닌지 확인',
                stackableWithRuleIds: ['sol_overseas_fee'],
                applicationOrder: 2,
            },
            action: { type: 'PERCENT', value: 5 },
            limitConfig: { monthlyAmount: 5_000 },
            platformType: 'OFFLINE',
            usesCardLimit: false,
        }),
        rule('sol_vietnam_lottemart', cardId, {
            category: 'convenience',
            includedBrands: ['vietnam_lottemart'],
            description: '베트남 롯데마트 5% 할인',
            detail: '베트남 내 롯데마트 오프라인, 일부 임대 매장·상품권 제외',
            condition: {
                endsAt: '2026-12-31',
                requiredCardNetwork: 'MASTERCARD',
                confirmationRequired: true,
                requiredNote: '베트남 오프라인 롯데마트이며 임대 매장·상품권 거래가 아닌지 확인',
                stackableWithRuleIds: ['sol_overseas_fee'],
                applicationOrder: 2,
            },
            action: { type: 'PERCENT', value: 5 },
            limitConfig: { monthlyAmount: 3_000 },
            platformType: 'OFFLINE',
            usesCardLimit: false,
        }),
        rule('sol_vietnam_grab', cardId, {
            category: 'transport',
            includedBrands: ['vietnam_grab'],
            description: '베트남 Grab 5% 할인',
            detail: '베트남 내 Grab 앱 이용 건만 적용',
            condition: {
                endsAt: '2026-12-31',
                requiredCardNetwork: 'MASTERCARD',
                stackableWithRuleIds: ['sol_overseas_fee'],
                applicationOrder: 2,
            },
            action: { type: 'PERCENT', value: 5 },
            limitConfig: { monthlyAmount: 3_000 },
            platformType: 'ONLINE',
            usesCardLimit: false,
        }),
        rule('sol_usa_starbucks', cardId, {
            category: 'cafe',
            includedBrands: ['usa_starbucks'],
            description: '미국 스타벅스 5% 할인',
            detail: '미국 내 스타벅스 오프라인, 입점 매장·상품권·온라인 제외',
            condition: {
                endsAt: '2026-12-31',
                requiredCardNetwork: 'MASTERCARD',
                confirmationRequired: true,
                requiredNote: '미국 오프라인 독립 매장이며 입점 매장·상품권 거래가 아닌지 확인',
                stackableWithRuleIds: ['sol_overseas_fee'],
                applicationOrder: 2,
            },
            action: { type: 'PERCENT', value: 5 },
            limitConfig: { monthlyAmount: 5_000 },
            platformType: 'OFFLINE',
            usesCardLimit: false,
        }),
    ];

const normalizedRuleSignature = (value: Partial<BenefitRule>) => JSON.stringify({
    description: value.description,
    detail: value.detail,
    category: value.category ?? null,
    includedBrands: [...(value.includedBrands ?? [])].sort(),
    excludedBrands: [...(value.excludedBrands ?? [])].sort(),
    platformType: value.platformType ?? 'ALL',
    usesCardLimit: value.usesCardLimit ?? true,
    condition: {
        ...(value.condition?.minSpend !== undefined && {
            minSpend: value.condition.minSpend,
        }),
        ...(value.condition?.maxSpend !== undefined && {
            maxSpend: value.condition.maxSpend,
        }),
        ...(value.condition?.maxSpendExclusive !== undefined && {
            maxSpendExclusive: value.condition.maxSpendExclusive,
        }),
        ...(value.condition?.minPerformance !== undefined && {
            minPerformance: value.condition.minPerformance,
        }),
        ...(value.condition?.startsAt !== undefined && {
            startsAt: value.condition.startsAt,
        }),
        ...(value.condition?.endsAt !== undefined && {
            endsAt: value.condition.endsAt,
        }),
        ...(value.condition?.requiredCardNetwork !== undefined && {
            requiredCardNetwork: value.condition.requiredCardNetwork,
        }),
        ...(value.condition?.performanceWaiver !== undefined && {
            performanceWaiver: value.condition.performanceWaiver,
        }),
        ...(value.condition?.confirmationRequired !== undefined && {
            confirmationRequired: value.condition.confirmationRequired,
        }),
        ...(value.condition?.stackableWithRuleIds !== undefined && {
            stackableWithRuleIds: [...value.condition.stackableWithRuleIds].sort(),
        }),
        ...(value.condition?.applicationOrder !== undefined && {
            applicationOrder: value.condition.applicationOrder,
        }),
        ...(value.condition?.manualCheckRequired !== undefined && {
            manualCheckRequired: value.condition.manualCheckRequired,
        }),
        ...(value.condition?.requiredNote !== undefined && {
            requiredNote: value.condition.requiredNote,
        }),
        ...(value.condition?.itemSpecific !== undefined && {
            itemSpecific: value.condition.itemSpecific,
        }),
        ...(value.condition?.eligibleItemSummary !== undefined && {
            eligibleItemSummary: value.condition.eligibleItemSummary,
        }),
    },
    action: value.action,
    limitConfig: value.limitConfig,
});

function validateShinhanSolRuleCoverage(values: unknown[], errors: string[]) {
    const actualById = new Map<string, Partial<BenefitRule>>();
    values.forEach(value => {
        if (isRecord(value) && typeof value.id === 'string') {
            actualById.set(value.id, value as Partial<BenefitRule>);
        }
    });
    const expectedRules = buildShinhanSolRules('shinhan_sol');
    expectedRules.forEach(expected => {
        const actual = actualById.get(expected.id);
        if (!actual) {
            errors.push(`공식 혜택 ${expected.id} 규칙이 누락되었습니다.`);
            return;
        }
        if (normalizedRuleSignature(actual) !== normalizedRuleSignature(expected)) {
            errors.push(`공식 혜택 ${expected.id}의 계산 조건·한도가 공식 기준과 다릅니다.`);
        }
    });
}

export function extractShinhanSolTravelWithRules(
    input: CardBenefitExtractionInput,
): CardBenefitExtractionResult {
    if (input.card.id !== 'shinhan_sol') {
        throw new Error('규칙 기반 대표 추출기는 신한 SOL트래블 체크카드만 지원합니다.');
    }
    const rules = buildShinhanSolRules(input.card.id);
    const specs: Array<{
        id: string;
        ruleIds: string[];
        fields: CardBenefitEvidence['fields'];
        pattern: RegExp;
        location: string;
    }> = [
        {
            id: 'foreign-currency-payment',
            ruleIds: ['sol_foreign_currency_payment'],
            fields: ['description', 'condition', 'action'],
            pattern: /해외 이용 시 원화 환산 절차없이 외화결제계좌에서 해당 현지 통화로 인출되는 서비스/i,
            location: '해외 현지통화 결제 서비스',
        },
        {
            id: 'overseas-fee',
            ruleIds: ['sol_overseas_fee'],
            fields: ['description'],
            pattern: /해외.{0,80}?(?:결제|이용).{0,40}?수수료.{0,30}?면제|해외.{0,60}?수수료.{0,30}?면제/i,
            location: '해외 이용 서비스',
        },
        {
            id: 'overseas-fee-rate',
            ruleIds: ['sol_overseas_fee'],
            fields: ['action'],
            pattern: /국제\s*브랜드\s*수수료\s*\(?1\s*%\)?.{0,50}?해외\s*서비스\s*수수료\s*\(?0\.2\s*%\)?.{0,30}?면제/i,
            location: '해외 결제 수수료율',
        },
        {
            id: 'overseas-fee-exclusion',
            ruleIds: ['sol_overseas_fee'],
            fields: ['condition'],
            pattern: /해외 수수료 미부과 해외 거래 건의 경우 서비스 제외됩니다/i,
            location: '해외 수수료 면제 제외 조건',
        },
        {
            id: 'overseas-atm',
            ruleIds: ['sol_overseas_atm'],
            fields: ['description', 'condition', 'action'],
            pattern: /해외 ATM 이용 인출 수수료\(건당 \$3\).{0,80}?국제 브랜드 수수료\(1%\) 면제/i,
            location: '해외 ATM 수수료',
        },
        {
            id: 'overseas-transit',
            ruleIds: ['sol_overseas_transport'],
            fields: ['description', 'action'],
            pattern: /해외\s*대중교통.{0,50}?1\s*%|컨택리스.{0,80}?1\s*%/i,
            location: '해외 이용 서비스',
        },
        {
            id: 'overseas-transit-restrictions',
            ruleIds: ['sol_overseas_transport'],
            fields: ['condition'],
            pattern: /해외 대중교통 중 컨택리스 결제를 지원하는 대중교통에 한하여.{0,100}?택시 이용은 할인 대상에 포함되지 않습니다/i,
            location: '해외 대중교통 적용 조건',
        },
        {
            id: 'domestic-convenience',
            ruleIds: ['sol_domestic_convenience'],
            fields: ['description', 'action'],
            pattern: /세븐일레븐.{0,10}?CU.{0,10}?GS25.{0,10}?이마트\s*24.{0,80}?5\s*%|국내\s*4대\s*편의점.{0,80}?5\s*%/i,
            location: '국내 이용 서비스',
        },
        {
            id: 'domestic-transit',
            ruleIds: ['sol_domestic_transport'],
            fields: ['description', 'action'],
            pattern: /국내.{0,20}?(?:후불)?교통.{0,80}?1\s*%|국내\s*대중교통.{0,80}?1\s*%/i,
            location: '국내 이용 서비스',
        },
        {
            id: 'domestic-transit-restrictions',
            ruleIds: ['sol_domestic_transport'],
            fields: ['condition'],
            pattern: /후불교통 기능을 이용한 터치\(RF\) 거래 시.{0,100}?고속버스 이용은 할인 대상에 포함되지 않습니다/i,
            location: '국내 대중교통 적용 조건',
        },
        {
            id: 'cu-event',
            ruleIds: ['sol_cu_event'],
            fields: ['description', 'action'],
            pattern: /CU.{0,20}?행사상품.{0,100}?5\s*%.{0,100}?(?:결제\s*)?1\s*회\s*당\s*최대\s*2[,\s]*000원/i,
            location: '국내 이용 서비스',
        },
        {
            id: 'cu-event-stacking',
            ruleIds: ['sol_cu_event', 'sol_domestic_convenience'],
            fields: ['condition', 'action'],
            pattern: /국내 4대 편의점 5% 결제일 할인과는 중복 적용이 가능합니다.{0,140}?즉시할인 금액이 제외된 금액에서 적용됩니다/i,
            location: 'CU 행사상품 중복 적용 기준',
        },
        {
            id: 'cu-event-restrictions',
            ruleIds: ['sol_cu_event'],
            fields: ['condition'],
            pattern: /타 결제수단과 복합 결제 시 할인 적용 불가합니다.{0,220}?일부 간편결제 거래건은 할인 적용 제외됩니다/i,
            location: 'CU 행사상품 제외 조건',
        },
        {
            id: 'lounge',
            ruleIds: ['sol_lounge'],
            fields: ['description', 'action'],
            pattern: /공항\s*라운지.{0,80}?(?:연\s*2회|무료)|더라운지.{0,80}?무료/i,
            location: '공항 라운지 서비스',
        },
        {
            id: 'master-travel-rewards',
            ruleIds: ['sol_master_travel_rewards'],
            fields: ['description', 'action'],
            pattern: /마스터카드 트래블 리워드는.{0,200}?캐시백\(최대 10%\)/i,
            location: 'Mastercard Travel Rewards',
        },
        {
            id: 'master-travel-rewards-period',
            ruleIds: ['sol_master_travel_rewards'],
            fields: ['condition'],
            pattern: /마스터 트래블 리워드는 2026년 12월 31일까지 제공/i,
            location: 'Mastercard Travel Rewards 기간',
        },
        {
            id: 'japan-convenience',
            ruleIds: ['sol_japan_convenience'],
            fields: ['description', 'action'],
            pattern: /일본 3대 편의점 5% 결제일 할인/i,
            location: '일본 편의점 프로모션',
        },
        {
            id: 'vietnam-lottemart',
            ruleIds: ['sol_vietnam_lottemart'],
            fields: ['description', 'action'],
            pattern: /베트남 롯데마트 5% 결제일 할인/i,
            location: '베트남 롯데마트 프로모션',
        },
        {
            id: 'vietnam-grab',
            ruleIds: ['sol_vietnam_grab'],
            fields: ['description', 'action'],
            pattern: /베트남 Grab 5% 결제일 할인/i,
            location: '베트남 Grab 프로모션',
        },
        {
            id: 'usa-starbucks',
            ruleIds: ['sol_usa_starbucks'],
            fields: ['description', 'action'],
            pattern: /미국 스타벅스 5% 결제일 할인/i,
            location: '미국 스타벅스 프로모션',
        },
        {
            id: 'overseas-transit-limit',
            ruleIds: ['sol_overseas_transport'],
            fields: ['limitConfig'],
            pattern: /해외\s*대중교통.{0,120}?월\s*(?:3천|3,000)원까지\s*할인/i,
            location: '해외 대중교통 한도',
        },
        {
            id: 'domestic-convenience-limit',
            ruleIds: ['sol_domestic_convenience'],
            fields: ['limitConfig'],
            pattern: /편의점\s*통합\s*일\s*1회,?\s*월\s*3회,?\s*월\s*(?:3천|3,000)원까지\s*할인/i,
            location: '국내 편의점 한도',
        },
        {
            id: 'domestic-transit-limit',
            ruleIds: ['sol_domestic_transport'],
            fields: ['limitConfig'],
            pattern: /국내\s*대중교통.{0,120}?월\s*(?:3천|3,000)원까지\s*할인/i,
            location: '국내 대중교통 한도',
        },
        {
            id: 'cu-event-limit',
            ruleIds: ['sol_cu_event'],
            fields: ['limitConfig'],
            pattern: /결제\s*1회\s*당\s*최대\s*2,?000원까지\s*할인/i,
            location: 'CU 행사상품 한도',
        },
        {
            id: 'lounge-limit',
            ruleIds: ['sol_lounge'],
            fields: ['limitConfig'],
            pattern: /반기별\s*1회.{0,80}?연\s*2회/i,
            location: '공항 라운지 이용 횟수',
        },
        {
            id: 'japan-convenience-limit',
            ruleIds: ['sol_japan_convenience'],
            fields: ['limitConfig'],
            pattern: /일본 3대 편의점 5% 결제일 할인.{0,150}?월 5천원까지 할인/i,
            location: '일본 편의점 한도',
        },
        {
            id: 'vietnam-lottemart-limit',
            ruleIds: ['sol_vietnam_lottemart'],
            fields: ['limitConfig'],
            pattern: /베트남 롯데마트 5% 결제일 할인.{0,100}?월 3천원까지 할인/i,
            location: '베트남 롯데마트 한도',
        },
        {
            id: 'vietnam-grab-limit',
            ruleIds: ['sol_vietnam_grab'],
            fields: ['limitConfig'],
            pattern: /베트남 Grab 5% 결제일 할인.{0,100}?월 3천원까지 할인/i,
            location: '베트남 Grab 한도',
        },
        {
            id: 'usa-starbucks-limit',
            ruleIds: ['sol_usa_starbucks'],
            fields: ['limitConfig'],
            pattern: /미국 스타벅스 5% 결제일 할인.{0,100}?월 5천원까지 할인/i,
            location: '미국 스타벅스 한도',
        },
        {
            id: 'overseas-promotion-period',
            ruleIds: [
                'sol_japan_convenience',
                'sol_vietnam_lottemart',
                'sol_vietnam_grab',
                'sol_usa_starbucks',
            ],
            fields: ['condition'],
            pattern: /해외 가맹점 이용 할인 프로모션은 2026년 12월 31일까지 제공/i,
            location: '해외 가맹점 프로모션 기간',
        },
        {
            id: 'performance',
            ruleIds: ['sol_domestic_convenience', 'sol_domestic_transport', 'sol_lounge'],
            fields: ['condition'],
            pattern: /전월.{0,40}?국내.{0,30}?30만\s*원.{0,80}?(?:서비스|제공|대상)/i,
            location: '전월 이용금액 기준',
        },
        {
            id: 'new-card-performance-waiver',
            ruleIds: ['sol_domestic_convenience', 'sol_domestic_transport'],
            fields: ['condition'],
            pattern: /신규 발급 회원의 경우 카드 사용 등록월의 익월 말.{0,100}?전월 이용금액 조건 없이 서비스가 제공됩니다/i,
            location: '신규 회원 국내 할인 실적 면제',
        },
        {
            id: 'discount-service-exclusions',
            ruleIds: ['sol_domestic_convenience', 'sol_domestic_transport'],
            fields: ['condition'],
            pattern: /할인 서비스 제외 대상은 아래와 같습니다.{0,450}?거래 취소금액.{0,100}?각종 수수료\/이자/i,
            location: '국내 할인 서비스 공통 제외 조건',
        },
        {
            id: 'mastercard-only',
            ruleIds: [
                'sol_foreign_currency_payment',
                'sol_overseas_fee',
                'sol_overseas_atm',
                'sol_overseas_transport',
                'sol_master_travel_rewards',
                'sol_japan_convenience',
                'sol_vietnam_lottemart',
                'sol_vietnam_grab',
                'sol_usa_starbucks',
            ],
            fields: ['condition'],
            pattern: /해외 이용 서비스 및 해외 대중교통 컨택리스 방식으로 이용 시 1% 결제일 할인 서비스는 MASTERCARD 브랜드 선택 시에만 제공 가능합니다/i,
            location: 'Mastercard 브랜드 조건',
        },
    ];
    const evidence = specs.flatMap<CardBenefitEvidence>(spec => {
        const found = findEvidence(input, spec.pattern);
        return found ? [{
            id: spec.id,
            ruleIds: spec.ruleIds,
            fields: spec.fields,
            ...found,
            location: spec.location,
        }] : [];
    });
    const missing = specs.filter(spec => !evidence.some(item => item.id === spec.id));
    return {
        extractor: `rules:${SHINHAN_SOL_RULESET_VERSION}`,
        confidence: missing.length === 0 ? 0.98 : Math.max(0.3, 0.98 - missing.length * 0.1),
        extraction: {
            schemaVersion: CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION,
            completeness: 'FULL',
            card: {
                id: input.card.id,
                name: '신한카드 SOL트래블 체크',
                company: '신한카드',
                limitTable: [],
                network: 'MASTERCARD',
            },
            rules,
            evidence,
            notes: missing.map(spec => `${spec.location} 공식 문구를 찾지 못했습니다.`),
        },
    };
}

const nullableNonNegativeInteger = z.number().int().nonnegative().nullable();
const nullableDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

export const cardBenefitOpenAIInventorySchema = z.object({
    confidence: z.number().min(0).max(1),
    sections: z.array(z.object({
        id: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,99}$/),
        title: z.string().min(1).max(200),
        summary: z.string().min(1).max(500),
        kind: z.enum(['BENEFIT', 'LIMIT', 'CONDITION', 'EXCLUSION', 'PROMOTION', 'OTHER']),
        appliesToSectionIds: z.array(
            z.string().regex(/^[a-z0-9][a-z0-9_-]{2,99}$/)
        ).max(100),
        sourceUrl: z.string().min(1),
        quote: z.string().min(3).max(500),
        page: nullableNonNegativeInteger,
    }).strict()).min(1).max(100),
    notes: z.array(z.string().max(500)).max(50),
}).strict();

const cardBenefitRuleOpenAISchema = z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,99}$/),
    cardId: z.string(),
    category: z.string().nullable(),
    includedBrands: z.array(z.string()),
    excludedBrands: z.array(z.string()),
    platformType: z.enum(platformTypes),
    sharedGroupId: z.string().nullable(),
    usesCardLimit: z.boolean(),
    description: z.string().min(1),
    detail: z.string(),
    condition: z.object({
        minSpend: nullableNonNegativeInteger,
        maxSpend: nullableNonNegativeInteger,
        maxSpendExclusive: nullableNonNegativeInteger,
        minPerformance: nullableNonNegativeInteger,
        startsAt: nullableDate,
        endsAt: nullableDate,
        daysOfWeek: z.array(z.enum(benefitWeekdays)).nullable(),
        timeRanges: z.array(z.object({
            startTime: z.string().regex(timePattern),
            endTime: z.string().regex(timePattern),
        }).strict()).nullable(),
        requiredCardNetwork: z.enum(cardNetworks).nullable(),
        performanceWaiver: z.literal('NEW_CARD_REGISTRATION_WINDOW').nullable(),
        confirmationRequired: z.boolean().nullable(),
        stackableWithRuleIds: z.array(z.string()).nullable(),
        applicationOrder: nullableNonNegativeInteger,
        manualCheckRequired: z.boolean().nullable(),
        requiredNote: z.string().nullable(),
        itemSpecific: z.boolean().nullable(),
        eligibleItemSummary: z.string().nullable(),
    }).strict(),
    action: z.object({
        type: z.enum(ruleActionTypes),
        value: z.number().nonnegative(),
        maxDiscount: nullableNonNegativeInteger,
        amountBasis: z.enum(['ORIGINAL_AMOUNT', 'REMAINING_AMOUNT']).nullable(),
    }).strict(),
    limitConfig: z.object({
        dailyCount: nullableNonNegativeInteger,
        dailyAmount: nullableNonNegativeInteger,
        monthlyCount: nullableNonNegativeInteger,
        yearlyCount: nullableNonNegativeInteger,
        monthlyAmount: nullableNonNegativeInteger,
        monthlyAmountByPerformance: z.array(z.object({
            threshold: z.number().int().nonnegative(),
            limit: z.number().int().nonnegative(),
        }).strict()).nullable(),
        sharedFields: z.array(z.enum(sharedLimitFields)).nullable(),
    }).strict(),
}).strict();

export const cardBenefitOpenAIExtractionSchema = z.object({
    confidence: z.number().min(0).max(1),
    coverage: z.array(z.object({
        sectionId: z.string(),
        ruleIds: z.array(z.string()).min(1),
    }).strict()).max(100),
    extraction: z.object({
        schemaVersion: z.literal(CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION),
        completeness: z.literal('FULL'),
        card: z.object({
            id: z.string(),
            name: z.string().min(1),
            company: z.string().min(1),
            limitTable: z.array(z.object({
                threshold: z.number().int().nonnegative(),
                limit: z.number().int().nonnegative(),
            }).strict()),
            network: z.enum(cardNetworks).nullable(),
        }).strict(),
        rules: z.array(cardBenefitRuleOpenAISchema).min(1).max(100),
        notes: z.array(z.string().max(500)).max(100),
    }).strict(),
}).strict();

type CardBenefitInventory = z.infer<typeof cardBenefitOpenAIInventorySchema>;
type CardBenefitOpenAIExtraction = z.infer<typeof cardBenefitOpenAIExtractionSchema>;

const isReviewSafeExtraction = (value: unknown): value is CardBenefitExtraction => {
    if (!isRecord(value) || !isRecord(value.card) ||
        typeof value.card.name !== 'string' ||
        !Array.isArray(value.rules) ||
        !Array.isArray(value.evidence) ||
        !Array.isArray(value.notes)) {
        return false;
    }
    const rulesAreSafe = value.rules.every(rule => (
        isRecord(rule) &&
        typeof rule.id === 'string' &&
        typeof rule.description === 'string' &&
        typeof rule.detail === 'string' &&
        isRecord(rule.action) &&
        typeof rule.action.value === 'number'
    ));
    const evidenceIsSafe = value.evidence.every(evidence => (
        isRecord(evidence) &&
        typeof evidence.id === 'string' &&
        Array.isArray(evidence.fields) &&
        typeof evidence.quote === 'string' &&
        (evidence.sourceUrl === undefined || typeof evidence.sourceUrl === 'string') &&
        (evidence.page === undefined || typeof evidence.page === 'number')
    ));
    return rulesAreSafe && evidenceIsSafe;
};

const configuredSourceCharacterLimit = () => {
    const configured = Number(process.env.CARD_BENEFIT_AI_MAX_SOURCE_CHARS ?? 240_000);
    return Number.isSafeInteger(configured) && configured >= 20_000 && configured <= 800_000
        ? configured
        : 240_000;
};

const excerptSource = (sourceText: string, limit: number) => {
    if (sourceText.length <= limit) return sourceText;
    const headLength = Math.floor(limit * 0.7);
    const tailLength = Math.max(0, limit - headLength - 80);
    return [
        sourceText.slice(0, headLength),
        '\n[중간 원문은 입력 한도 때문에 생략됨]\n',
        sourceText.slice(-tailLength),
    ].join('');
};

const promptSourcesFrom = (input: CardBenefitExtractionInput) => {
    const sources = extractionSources(input);
    const perSourceLimit = Math.max(10_000, Math.floor(
        configuredSourceCharacterLimit() / Math.max(1, sources.length)
    ));
    return sources.map((source, index) => [
        `[공식 원문 ${index + 1}]`,
        `URL: ${source.sourceUrl}`,
        `형식: ${source.mediaType ?? 'text/plain'}`,
        excerptSource(source.sourceText, perSourceLimit),
    ].join('\n')).join('\n\n');
};

const currentKoreaDateParts = (date: Date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(
        parts.find(part => part.type === type)?.value
    );
    return { year: value('year'), month: value('month'), day: value('day') };
};

const monthDayRangeHasEnded = (value: string, asOfDate: Date) => {
    const match = value.match(
        /\(\s*\d{1,2}\s*\.\s*\d{1,2}\s*~\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\)/
    );
    if (!match) return false;
    const now = currentKoreaDateParts(asOfDate);
    const end = new Date(Date.UTC(now.year, Number(match[1]) - 1, Number(match[2])));
    const today = new Date(Date.UTC(now.year, now.month - 1, now.day));
    return end < today;
};

const numericBenefitClaimPattern = new RegExp(
    `(?:${moneyTokenSource}|US\\s*\\$\\s*\\d+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?\\s*%|` +
    `\\d+(?:\\.\\d+)?\\s*(?:일권|버켓|회|개|명|매))` +
    `[^\\n]{0,100}(?:할인|캐시백|적립|무료\\s*제공|정액\\s*제공)`,
    'i',
);
const namedBenefitHeadlinePattern =
    /(?:할인|캐시백|적립)\s*(?:서비스)?\s*[-–—:]\s*[\p{L}\p{N}]/iu;
const contextualBenefitRatePattern =
    /^(?:[•·▪◦-]\s*)?(?:플래티늄\s*등급|등급)\s*:\s*\d+(?:\.\d+)?\s*%/i;

export const benefitClaimChecklistFrom = (
    input: CardBenefitExtractionInput,
    asOfDate: Date = new Date(),
) => {
    const claims: Array<{ sourceUrl: string; quote: string; page?: number }> = [];
    extractionSources(input).forEach(source => {
        const pages = source.pageTexts?.length ? source.pageTexts : [source.sourceText];
        pages.forEach((pageText, pageIndex) => {
            let inheritedExpired = false;
            let contextHeading = '';
            pageText.split(/\r?\n/).map(normalizeText).filter(Boolean).forEach(line => {
                const isBullet = /^[•·▪◦-]\s*/.test(line);
                const isBenefitHeadline = !isBullet && (
                    numericBenefitClaimPattern.test(line) ||
                    namedBenefitHeadlinePattern.test(line) ||
                    /(?:서비스|혜택)\s*[-–—:]\s*[\p{L}\p{N}]/iu.test(line)
                );
                if (isBenefitHeadline) inheritedExpired = monthDayRangeHasEnded(line, asOfDate);
                if (!isBullet && /(?:서비스|혜택|할인|캐시백|적립|무료)/i.test(line)) {
                    contextHeading = line;
                }
                const isContextualRate = contextualBenefitRatePattern.test(line) &&
                    contextHeading.length > 0;
                const isClaim = line.length >= 8 && line.length <= 500 &&
                    !/(?:제공|적용)되지|제외|유의사항|적용\s*기준|수수료가?\s*부과/i.test(line) && (
                        numericBenefitClaimPattern.test(line) ||
                        namedBenefitHeadlinePattern.test(line) ||
                        /할인\s*혜택\s*제공/i.test(line) ||
                        isContextualRate
                    );
                if (!isClaim || inheritedExpired || monthDayRangeHasEnded(line, asOfDate)) return;
                claims.push({
                    sourceUrl: source.sourceUrl,
                    quote: isContextualRate ? `${contextHeading}\n${line}` : line,
                    ...(source.pageTexts?.length && { page: pageIndex + 1 }),
                });
            });
        });
    });
    return [...new Map(claims.map(claim => [
        `${claim.sourceUrl}:${claim.page ?? 0}:${normalizedSource(claim.quote)}`,
        claim,
    ])).values()];
};

const documentScopeChecklistFrom = (input: CardBenefitExtractionInput) => unique(
    extractionSources(input).flatMap(source => source.sourceText.split(/\r?\n/)
        .map(normalizeText)
        .filter(line => (
            /발급\s*받으신\s*카드는\s*비자카드\s*Platinum\s*등급/i.test(line) ||
            /본\s*서비스는\s*이용기간\s*별도\s*표기한\s*경우\s*외에는\s*20\d{2}년/i.test(line)
        )))
);

const inventoryChecklistFrom = (input: CardBenefitExtractionInput) => unique(
    [
        ...benefitClaimChecklistFrom(input).map(claim => claim.quote),
        ...documentScopeChecklistFrom(input),
        ...extractionSources(input).flatMap(source => source.sourceText.split(/\r?\n/)
            .map(normalizeText)
            .filter(line => line.length >= 15 && line.length <= 1_000 &&
                !/장기\s*무실적[^\n]{0,40}한도\s*하향[^\n]{0,40}제외\s*신청/i.test(line) && (
                /(?:서비스|혜택|실적|할인)[^\n]{0,80}제외|제외\s*대상/i.test(line) ||
                /(?:최초|신규)[^\n]{0,100}(?:카드|사용|발급|등록)[^\n]{0,120}(?:실적|서비스|혜택)/i.test(line) ||
                /중복\s*적용[^\n]{0,160}(?:차감된\s*금액|적용\s*순서|먼저|이후)/i.test(line)
            ))),
    ]
).slice(0, 100);

const isNonBenefitOperationalSection = (
    section: CardBenefitInventory['sections'][number],
) => /장기\s*무실적[^\n]{0,40}한도\s*하향[^\n]{0,40}제외\s*신청/i.test(
    `${section.title}\n${section.summary}\n${section.quote}`
);

const tokenSimilarity = (left: string, right: string) => {
    const leftTokens = new Set(normalizedSource(left).split(' ').filter(Boolean));
    const rightTokens = new Set(normalizedSource(right).split(' ').filter(Boolean));
    if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
    const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size;
    return union > 0 ? intersection / union : 0;
};

const quoteSetRepresentsBenefitClaim = (quotes: string[], claim: string) => {
    const combined = quotes.join('\n');
    if (sourceContainsQuote(combined, claim)) return true;
    const claimPercentages = percentageValuesIn(claim);
    const claimAmounts = koreanMoneyValuesIn(claim);
    return quotes.some(quote => (
        tokenSimilarity(quote, claim) >= 0.5 &&
        claimPercentages.every(value => percentageValuesIn(quote).includes(value)) &&
        claimAmounts.every(value => koreanMoneyValuesIn(quote).includes(value))
    ));
};

export const evidenceRepresentsBenefitClaim = (
    evidence: CardBenefitEvidence[],
    claim: string,
) => {
    const quotesBySource = new Map<string, string[]>();
    evidence.forEach(item => {
        const sourceKey = item.sourceUrl ?? '';
        quotesBySource.set(sourceKey, [...(quotesBySource.get(sourceKey) ?? []), item.quote]);
    });
    return [...quotesBySource.values()].some(quotes => (
        quoteSetRepresentsBenefitClaim(quotes, claim)
    ));
};

export const repairInventoryQuotes = (
    inventory: CardBenefitInventory,
    input: CardBenefitExtractionInput,
): CardBenefitInventory => {
    const sourceByUrl = new Map(extractionSources(input).map(source => [source.sourceUrl, source]));
    return {
        ...inventory,
        sections: inventory.sections.map(section => {
            const source = sourceByUrl.get(section.sourceUrl);
            if (!source || sourceContainsQuote(source.sourceText, section.quote)) return section;
            const sourceLines = source.sourceText.split(/\r?\n/)
                .map(normalizeText)
                .filter(Boolean);
            const quoteLines = section.quote.split(/\r?\n/)
                .map(normalizeText)
                .filter(Boolean);
            let previousIndex = -1;
            const repairedLines: string[] = [];
            for (const quoteLine of quoteLines) {
                const candidates = sourceLines.map((sourceLine, index) => ({
                    sourceLine,
                    index,
                    score: index > previousIndex ? tokenSimilarity(quoteLine, sourceLine) : 0,
                })).filter(candidate => candidate.score > 0)
                    .sort((left, right) => right.score - left.score || left.index - right.index);
                const best = candidates[0];
                const minimumScore = normalizedSource(quoteLine).length < 10 ? 1 : 0.85;
                if (!best || best.score < minimumScore) return section;
                repairedLines.push(best.sourceLine);
                previousIndex = best.index;
            }
            const repairedQuote = repairedLines.join('\n');
            return sourceContainsQuote(source.sourceText, repairedQuote)
                ? { ...section, quote: repairedQuote }
                : section;
        }),
    };
};

export const normalizeInventoryReferences = (
    inventory: CardBenefitInventory,
): CardBenefitInventory => {
    const sections = inventory.sections.filter(section => !isNonBenefitOperationalSection(section));
    const benefitSections = sections.filter(section => (
        section.kind === 'BENEFIT' || section.kind === 'PROMOTION'
    ));
    const sectionsWithIntegratedScope = sections.map(section => {
        const text = `${section.title}\n${section.summary}\n${section.quote}`;
        if (!/통합[^\n]{0,50}(?:적용\s*대상|대상\s*서비스)/i.test(text)) return section;
        const normalizedQuote = normalizedSource(section.quote);
        const inferredTargets = benefitSections.filter(benefit => (
            semanticTitleTokens(benefit.title).some(token => normalizedQuote.includes(token))
        )).map(benefit => benefit.id);
        return inferredTargets.length > 0
            ? { ...section, appliesToSectionIds: unique(inferredTargets) }
            : section;
    });
    const sectionById = new Map(sectionsWithIntegratedScope.map(section => [section.id, section]));
    const repairReference = (
        sectionId: string,
        referringSection: CardBenefitInventory['sections'][number],
    ) => {
        if (sectionById.has(sectionId)) return sectionId;
        const numericSignature = sectionId.replace(/\d+/g, '#');
        const numericMatches = benefitSections.filter(section => (
            section.id.replace(/\d+/g, '#') === numericSignature
        ));
        if (numericMatches.length === 1) return numericMatches[0].id;
        const semanticTokens = sectionId.toLocaleLowerCase('en-US').split(/[_-]+/)
            .filter(token => token && !/^\d+$/.test(token) && ![
                'b', 'benefit', 'basic', 'easy', 'salary', 'card', 'hana', 'nara',
            ].includes(token));
        const semanticMatches = benefitSections.filter(section => {
            const candidateTokens = section.id.toLocaleLowerCase('en-US').split(/[_-]+/);
            return semanticTokens.length > 0 &&
                semanticTokens.every(token => candidateTokens.includes(token));
        });
        if (semanticMatches.length === 1) return semanticMatches[0].id;

        const contextTokens = semanticTitleTokens([
            referringSection.title,
            referringSection.summary,
            referringSection.quote,
        ].join('\n'));
        const contextMatches = benefitSections.map(section => ({
            section,
            score: semanticTitleTokens([
                section.title,
                section.summary,
                section.quote,
            ].join('\n')).filter(token => contextTokens.includes(token)).length,
        })).filter(item => item.score > 0)
            .sort((left, right) => right.score - left.score);
        return contextMatches.length > 0 &&
            (contextMatches.length === 1 || contextMatches[0].score > contextMatches[1].score)
            ? contextMatches[0].section.id
            : sectionId;
    };
    const expandToBenefitSections = (
        sectionId: string,
        referringSection: CardBenefitInventory['sections'][number],
        visited = new Set<string>(),
    ): string[] => {
        const repairedId = repairReference(sectionId, referringSection);
        if (visited.has(repairedId)) return [repairedId];
        const target = sectionById.get(repairedId);
        if (!target || target.kind === 'BENEFIT' || target.kind === 'PROMOTION') {
            return [repairedId];
        }
        if (target.appliesToSectionIds.length === 0) return [repairedId];
        const nextVisited = new Set(visited).add(repairedId);
        return target.appliesToSectionIds.flatMap(targetId => (
            expandToBenefitSections(targetId, referringSection, nextVisited)
        ));
    };
    return {
        ...inventory,
        sections: sectionsWithIntegratedScope.map(section => {
            const expandedTargets = unique(section.appliesToSectionIds.flatMap(sectionId => (
                expandToBenefitSections(sectionId, section)
            )));
            return { ...section, appliesToSectionIds: expandedTargets };
        }),
    };
};

export const completeInventoryExclusionChecklist = (
    inventory: CardBenefitInventory,
    input: CardBenefitExtractionInput,
): CardBenefitInventory => {
    const existingQuotes = inventory.sections
        .filter(section => section.kind === 'EXCLUSION')
        .map(section => normalizedSource(section.quote));
    const existingIds = new Set(inventory.sections.map(section => section.id));
    const addedSections: CardBenefitInventory['sections'] = [];
    const exclusionPattern = /(?:서비스|혜택|실적|할인)[^\n]{0,80}제외|제외\s*대상/i;

    extractionSources(input).forEach(source => {
        const normalizedFullSource = normalizedSource(source.sourceText);
        const benefitPositions = inventory.sections.filter(section => (
            section.sourceUrl === source.sourceUrl &&
            (section.kind === 'BENEFIT' || section.kind === 'PROMOTION')
        )).flatMap(section => {
            const quote = normalizedSource(section.quote);
            const positions: Array<{ position: number; sectionId: string }> = [];
            let position = normalizedFullSource.indexOf(quote);
            while (quote && position >= 0) {
                positions.push({ position, sectionId: section.id });
                position = normalizedFullSource.indexOf(quote, position + quote.length);
            }
            return positions;
        });
        unique(source.sourceText.split(/\r?\n/)
            .map(normalizeText)
            .filter(line => line.length >= 15 && line.length <= 500 &&
                !/장기\s*무실적[^\n]{0,40}한도\s*하향[^\n]{0,40}제외\s*신청/i.test(line) &&
                exclusionPattern.test(line)))
            .forEach(line => {
                const normalizedLine = normalizedSource(line);
                const probe = normalizedLine.slice(0, Math.min(120, normalizedLine.length));
                if (probe.length < 20 || existingQuotes.some(quote => quote.includes(probe))) return;
                const targetSectionIds = new Set<string>();
                let occurrence = normalizedFullSource.indexOf(normalizedLine);
                while (occurrence >= 0) {
                    const nearestBenefit = benefitPositions
                        .filter(item => item.position < occurrence)
                        .sort((left, right) => right.position - left.position)[0];
                    if (nearestBenefit) targetSectionIds.add(nearestBenefit.sectionId);
                    occurrence = normalizedFullSource.indexOf(
                        normalizedLine,
                        occurrence + normalizedLine.length,
                    );
                }
                if (targetSectionIds.size === 0) return;
                let suffix = addedSections.length + 1;
                let id = `fallback_exclusion_${suffix}`;
                while (existingIds.has(id)) {
                    suffix += 1;
                    id = `fallback_exclusion_${suffix}`;
                }
                existingIds.add(id);
                const pageIndex = source.pageTexts?.findIndex(pageText => (
                    sourceContainsQuote(pageText, line)
                )) ?? -1;
                addedSections.push({
                    id,
                    title: '공식 제외 조건 보완',
                    summary: line,
                    kind: 'EXCLUSION',
                    appliesToSectionIds: [...targetSectionIds],
                    sourceUrl: source.sourceUrl,
                    quote: line,
                    page: pageIndex >= 0 ? pageIndex + 1 : null,
                });
                existingQuotes.push(normalizedLine);
            });
    });

    return addedSections.length > 0
        ? { ...inventory, sections: [...inventory.sections, ...addedSections] }
        : inventory;
};

export const completeInventoryTransactionTargetChecklist = (
    inventory: CardBenefitInventory,
    input: CardBenefitExtractionInput,
): CardBenefitInventory => {
    const existingQuotes = inventory.sections.map(section => normalizedSource(section.quote));
    const existingIds = new Set(inventory.sections.map(section => section.id));
    const addedSections: CardBenefitInventory['sections'] = [];
    const transactionTargetPattern = /^(?:해외\s*)?ATM\s*(?:인출|출금|이용)\s*시/i;

    extractionSources(input).forEach(source => {
        const normalizedFullSource = normalizedSource(source.sourceText);
        const benefitPositions = inventory.sections.filter(section => (
            section.sourceUrl === source.sourceUrl &&
            (section.kind === 'BENEFIT' || section.kind === 'PROMOTION')
        )).flatMap(section => {
            const quote = normalizedSource(section.quote);
            const positions: Array<{ position: number; sectionId: string }> = [];
            let position = normalizedFullSource.indexOf(quote);
            while (quote && position >= 0) {
                positions.push({ position, sectionId: section.id });
                position = normalizedFullSource.indexOf(quote, position + quote.length);
            }
            return positions;
        });
        const lines = source.sourceText.split(/\r?\n/);
        lines.forEach((rawLine, lineIndex) => {
            const line = normalizeText(rawLine);
            if (!transactionTargetPattern.test(line)) return;
            const normalizedLine = normalizedSource(line);
            if (existingQuotes.some(quote => quote.includes(normalizedLine))) return;
            const nearestBenefit = benefitPositions
                .filter(item => item.position < normalizedFullSource.indexOf(normalizedLine))
                .sort((left, right) => right.position - left.position)[0];
            if (!nearestBenefit) return;
            const quote = lines.slice(lineIndex, lineIndex + 8)
                .map(normalizeText)
                .filter(Boolean)
                .slice(0, 5)
                .join('\n');
            let suffix = addedSections.length + 1;
            let id = `fallback_transaction_target_${suffix}`;
            while (existingIds.has(id)) {
                suffix += 1;
                id = `fallback_transaction_target_${suffix}`;
            }
            existingIds.add(id);
            const pageIndex = source.pageTexts?.findIndex(pageText => (
                sourceContainsQuote(pageText, quote)
            )) ?? -1;
            addedSections.push({
                id,
                title: '공식 거래 대상 보완',
                summary: line,
                kind: 'CONDITION',
                appliesToSectionIds: [nearestBenefit.sectionId],
                sourceUrl: source.sourceUrl,
                quote,
                page: pageIndex >= 0 ? pageIndex + 1 : null,
            });
            existingQuotes.push(normalizedLine);
        });
    });

    return addedSections.length > 0
        ? { ...inventory, sections: [...inventory.sections, ...addedSections] }
        : inventory;
};

export const completeInventoryStackingChecklist = (
    inventory: CardBenefitInventory,
    input: CardBenefitExtractionInput,
): CardBenefitInventory => {
    const existingQuotes = inventory.sections.map(section => normalizedSource(section.quote));
    const existingIds = new Set(inventory.sections.map(section => section.id));
    const addedSections: CardBenefitInventory['sections'] = [];
    const stackingPattern = /중복\s*적용[^\n]{0,160}(?:차감된\s*금액|적용\s*순서|먼저|이후)/i;

    extractionSources(input).forEach(source => {
        const normalizedFullSource = normalizedSource(source.sourceText);
        const benefits = inventory.sections.filter(section => (
            section.sourceUrl === source.sourceUrl &&
            (section.kind === 'BENEFIT' || section.kind === 'PROMOTION')
        ));
        const benefitPositions = benefits.flatMap(section => {
            const quote = normalizedSource(section.quote);
            const positions: Array<{ position: number; sectionId: string }> = [];
            let position = normalizedFullSource.indexOf(quote);
            while (quote && position >= 0) {
                positions.push({ position, sectionId: section.id });
                position = normalizedFullSource.indexOf(quote, position + quote.length);
            }
            return positions;
        });

        source.sourceText.split(/\r?\n/)
            .map(normalizeText)
            .filter(line => line.length >= 15 && stackingPattern.test(line))
            .forEach(line => {
                const normalizedLine = normalizedSource(line);
                if (existingQuotes.some(quote => quote.includes(normalizedLine))) return;
                const occurrence = normalizedFullSource.indexOf(normalizedLine);
                const nearestBenefit = benefitPositions
                    .filter(item => item.position < occurrence)
                    .sort((left, right) => right.position - left.position)[0];
                if (!nearestBenefit) return;
                const lineTokens = semanticTitleTokens(line);
                const namedBenefits = benefits.filter(section => {
                    const titleTokens = semanticTitleTokens(section.title);
                    return titleTokens.length > 0 &&
                        titleTokens.filter(token => lineTokens.includes(token)).length >=
                        Math.min(2, titleTokens.length);
                }).map(section => section.id);
                let suffix = addedSections.length + 1;
                let id = `fallback_stacking_${suffix}`;
                while (existingIds.has(id)) {
                    suffix += 1;
                    id = `fallback_stacking_${suffix}`;
                }
                existingIds.add(id);
                const pageIndex = source.pageTexts?.findIndex(pageText => (
                    sourceContainsQuote(pageText, line)
                )) ?? -1;
                addedSections.push({
                    id,
                    title: '공식 중복 혜택 적용 순서 보완',
                    summary: line,
                    kind: 'CONDITION',
                    appliesToSectionIds: unique([nearestBenefit.sectionId, ...namedBenefits]),
                    sourceUrl: source.sourceUrl,
                    quote: line,
                    page: pageIndex >= 0 ? pageIndex + 1 : null,
                });
                existingQuotes.push(normalizedLine);
            });
    });

    return addedSections.length > 0
        ? { ...inventory, sections: [...inventory.sections, ...addedSections] }
        : inventory;
};

const inventoryTextByRule = (
    inventory: CardBenefitInventory,
    coverage: CardBenefitOpenAIExtraction['coverage'],
    includeSection: (section: CardBenefitInventory['sections'][number]) => boolean = () => true,
) => {
    const sectionById = new Map(inventory.sections.map(section => [section.id, section]));
    const textByRule = new Map<string, string[]>();
    coverage.forEach(item => {
        const section = sectionById.get(item.sectionId);
        if (!section || !includeSection(section)) return;
        const text = `${section.title}\n${section.summary}\n${section.quote}`;
        item.ruleIds.forEach(ruleId => {
            const values = textByRule.get(ruleId) ?? [];
            values.push(text);
            textByRule.set(ruleId, values);
        });
    });
    return new Map([...textByRule].map(([ruleId, values]) => (
        [ruleId, values.join('\n')] as const
    )));
};

const explicitCatalogBrands = (
    text: string,
    ruleCategory: string | null,
    catalogBrands: NonNullable<CardBenefitExtractionInput['catalog']>['brands'],
) => {
    const normalizedText = normalizedSource(text);
    const brandsByName = new Map<string, typeof catalogBrands>();
    catalogBrands.forEach(brand => {
        const name = normalizedSource(brand.name);
        const values = brandsByName.get(name) ?? [];
        values.push(brand);
        brandsByName.set(name, values);
    });
    return catalogBrands.filter(brand => {
        const name = normalizedSource(brand.name);
        const compactName = name.replace(/\s+/g, '');
        return compactName.length >= 5 &&
            brandsByName.get(name)?.length === 1 &&
            (ruleCategory === null || brand.categoryId === ruleCategory) &&
            normalizedText.includes(name);
    });
};

const impliedCatalogBrandIds = (
    text: string,
    catalogBrands: NonNullable<CardBenefitExtractionInput['catalog']>['brands'],
) => {
    const normalized = normalizedSource(text);
    const available = new Set(catalogBrands.map(brand => brand.id));
    const ids = new Set<string>();
    const add = (...values: string[]) => values.forEach(value => {
        if (available.has(value)) ids.add(value);
    });
    if (/전기요금/.test(normalized)) add('electric_utility');
    if (/도시가스/.test(normalized)) add('city_gas');
    if (/통신요금|이동통신|집전화/.test(normalized)) add('telecom');
    if (/편의점\s*업종/.test(normalized)) add('gs25', 'cu', 'emart24', 'seveneleven');
    if (/병원\s*약국|병원약국/.test(normalized)) add('medical');
    if (/세탁소\s*업종|세탁비/.test(normalized)) add('laundry');
    if (/인테이크몰|shopintake/.test(normalized)) add('intake');
    if (/ak몰/.test(normalized)) add('ak_mall');
    if (/티켓몬스터|티몬/.test(normalized)) add('tmon');
    if (/롯데홈쇼핑/.test(normalized)) add('lotte_home_shopping');
    if (/식음료|커피전문점/.test(normalized)) {
        catalogBrands.filter(brand => (
            ['food', 'cafe'].includes(brand.categoryId) &&
            !/^(?:official_|usa_|japan_|vietnam_|overseas_)/.test(brand.id)
        ))
            .forEach(brand => ids.add(brand.id));
    }
    return [...ids];
};

export const normalizeInventoryBackedRuleSemantics = (
    extraction: CardBenefitOpenAIExtraction['extraction'],
    inventory: CardBenefitInventory,
    coverage: CardBenefitOpenAIExtraction['coverage'],
    catalogBrands: NonNullable<CardBenefitExtractionInput['catalog']>['brands'],
): CardBenefitOpenAIExtraction['extraction'] => {
    const catalogBrandIds = new Set(catalogBrands.map(brand => brand.id));
    const channelTextByRule = inventoryTextByRule(inventory, coverage, section => (
        section.kind !== 'EXCLUSION'
    ));
    const brandTextByRule = inventoryTextByRule(
        inventory,
        coverage.filter(item => item.ruleIds.length === 1),
        section => (
        section.kind === 'BENEFIT' ||
        section.kind === 'PROMOTION' ||
        section.id.startsWith('fallback_transaction_target_')
        ),
    );
    const normalized = {
        ...extraction,
        rules: extraction.rules.map(ruleRow => {
            const channelText = channelTextByRule.get(ruleRow.id) ?? '';
            const brandText = brandTextByRule.get(ruleRow.id) ?? '';
            const hasInPersonDiscount = /현장\s*할인/i.test(channelText);
            const hasOnlineChannel = /(?:온라인|모바일\s*(?:앱|웹)|앱\s*\/\s*웹|웹\s*\/\s*앱|홈페이지)/i
                .test(channelText);
            const explicitBrands = explicitCatalogBrands(
                brandText,
                ruleRow.category,
                catalogBrands,
            ).map(brand => brand.id);
            const impliedBrands = impliedCatalogBrandIds(
                [
                    ruleRow.description,
                    ruleRow.condition.eligibleItemSummary ?? '',
                ].join('\n'),
                catalogBrands,
            );
            const unknownIncludedBrands = ruleRow.includedBrands.filter(
                brandId => !catalogBrandIds.has(brandId) &&
                    !/^[a-z0-9][a-z0-9_-]*$/i.test(brandId),
            );
            const unknownBrandNote = unknownIncludedBrands.length > 0
                ? `공식 대상 ${unknownIncludedBrands.join(', ')}은(는) 현재 브랜드 카탈로그와 자동 매칭할 수 없어 실제 결제수단·가맹점 조건을 확인해야 합니다.`
                : undefined;
            return {
                ...ruleRow,
                includedBrands: unique([
                    ...ruleRow.includedBrands.filter(brandId => (
                        catalogBrandIds.has(brandId) ||
                        /^[a-z0-9][a-z0-9_-]*$/i.test(brandId)
                    )),
                    ...explicitBrands,
                    ...impliedBrands,
                ]),
                condition: unknownBrandNote ? {
                    ...ruleRow.condition,
                    manualCheckRequired: true,
                    requiredNote: appendRequiredNote(
                        ruleRow.condition.requiredNote ?? undefined,
                        unknownBrandNote,
                    ),
                } : ruleRow.condition,
                platformType: hasInPersonDiscount && !hasOnlineChannel
                    ? 'OFFLINE'
                    : ruleRow.platformType,
            };
        }),
    };
    const informationalNormalized = {
        ...normalized,
        rules: normalized.rules.map(ruleRow => {
            const isInformationOnly = ruleRow.action.value === 0 &&
                ruleRow.condition.itemSpecific !== true;
            if (!isInformationOnly) return ruleRow;
            return {
                ...ruleRow,
                action: {
                    ...ruleRow.action,
                    type: 'FLAT' as const,
                },
                limitConfig: {
                    ...ruleRow.limitConfig,
                    dailyCount: ruleRow.limitConfig.dailyCount,
                    dailyAmount: null,
                    monthlyCount: ruleRow.limitConfig.monthlyCount,
                    yearlyCount: ruleRow.limitConfig.yearlyCount,
                    monthlyAmount: null,
                },
            };
        }),
    };
    const missingAlternativeChecks = analyzeAlternativeManualChecks(informationalNormalized.rules)
        .missingBaseRuleIds;
    const conditionNormalized = missingAlternativeChecks.size === 0
        ? informationalNormalized
        : {
            ...informationalNormalized,
            rules: informationalNormalized.rules.map(ruleRow => {
                if (!missingAlternativeChecks.has(ruleRow.id)) return ruleRow;
                const specialDateNote = '국군의날·현충일 등 특별일 대체 혜택 적용 여부를 확인해야 합니다.';
                return {
                    ...ruleRow,
                    condition: {
                        ...ruleRow.condition,
                        manualCheckRequired: true,
                        requiredNote: ruleRow.condition.requiredNote
                            ? `${ruleRow.condition.requiredNote} ${specialDateNote}`
                            : specialDateNote,
                    },
                };
            }),
        };
    const invalidSharedGroups = analyzeSharedLimitGroups(conditionNormalized.rules).invalidGroupIds;
    if (invalidSharedGroups.size === 0) return conditionNormalized;
    return {
        ...conditionNormalized,
        rules: conditionNormalized.rules.map(ruleRow => ({
            ...ruleRow,
            sharedGroupId: ruleRow.sharedGroupId && invalidSharedGroups.has(ruleRow.sharedGroupId)
                ? null
                : ruleRow.sharedGroupId,
        })),
    };
};

const stripNulls = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripNulls);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([, item]) => item !== null)
        .map(([key, item]) => [key, stripNulls(item)]));
};

const performanceLimitTiersIn = (value: string): Card['limitTable'] => {
    const pattern = new RegExp(
        `(${moneyTokenSource})\\s*이상(?:\\s*(${moneyTokenSource})\\s*미만)?` +
        `\\s*(${moneyTokenSource})`,
        'gi',
    );
    const tiers = [...normalizeText(value).matchAll(pattern)].flatMap(match => {
        const threshold = parseKoreanMoney(match[1]);
        const limit = parseKoreanMoney(match[3]);
        if (threshold === undefined || limit === undefined || threshold <= 0 || limit > threshold) {
            return [];
        }
        return [{ threshold, limit }];
    });
    const byThreshold = new Map(tiers.map(tier => [tier.threshold, tier]));
    return byThreshold.size >= 2
        ? [...byThreshold.values()].sort((left, right) => left.threshold - right.threshold)
        : [];
};

export const normalizeEvidenceBackedRuleMechanics = (
    extraction: CardBenefitExtraction,
    input?: CardBenefitExtractionInput,
) => {
    extraction.rules.forEach(ruleRow => {
        const sourceText = evidenceTextForRule(ruleRow.id, extraction.evidence);
        const paymentCapMatch = normalizeText(sourceText).match(new RegExp(
            `1\\s*회\\s*승인\\s*금액\\s*(${moneyTokenSource})\\s*까지` +
            `\\s*할인\\s*적용`,
            'i',
        ));
        const paymentCap = paymentCapMatch ? parseKoreanMoney(paymentCapMatch[1]) : undefined;
        if (paymentCap !== undefined && ruleRow.condition.maxSpend === paymentCap) {
            delete ruleRow.condition.maxSpend;
        }
        const maxDiscountMatch = normalizeText(sourceText).match(new RegExp(
            `1\\s*회(?:\\s*당)?\\s*최대\\s*(${moneyTokenSource})\\s*(?:할인|캐시백|적립)`,
            'i',
        ));
        const maxDiscount = maxDiscountMatch
            ? parseKoreanMoney(maxDiscountMatch[1])
            : undefined;
        if (maxDiscount !== undefined && ruleRow.action.value > 0) {
            ruleRow.action.maxDiscount = maxDiscount;
        }
        if (/주말/.test(ruleRow.description) &&
            /토요일\s*(?:\/|·|및|과)\s*일요일/.test(sourceText)) {
            ruleRow.condition.daysOfWeek = ['SAT', 'SUN'];
        }
        if (/(?:Night|나이트)/i.test(ruleRow.description) &&
            /오후\s*9시[\s\S]{0,20}오전\s*9시/i.test(sourceText)) {
            ruleRow.condition.timeRanges = [{ startTime: '21:00', endTime: '09:00' }];
        }
    });

    extraction.evidence.filter(item => item.fields.includes('limitConfig')).forEach(item => {
        const tiers = performanceLimitTiersIn(`${item.location ?? ''}\n${item.quote}`);
        if (tiers.length < 2) return;
        const rules = extraction.rules.filter(ruleRow => item.ruleIds.includes(ruleRow.id));
        rules.forEach(ruleRow => {
            ruleRow.limitConfig.monthlyAmountByPerformance = tiers;
        });
        if (rules.length < 2) return;
        const groupId = `shared_${extraction.card.id}_${item.id}_monthly_amount`
            .replace(/[^a-z0-9_-]+/gi, '_')
            .slice(0, 100);
        rules.forEach(ruleRow => {
            ruleRow.sharedGroupId = groupId;
            ruleRow.limitConfig.sharedFields = ['monthlyAmount'];
        });
    });
    if (input) {
        const sourceTextByUrl = new Map(extractionSources(input).map(source => (
            [source.sourceUrl, normalizedSource(source.sourceText)] as const
        )));
        const evidenceGroups = new Map<string, CardBenefitEvidence[]>();
        extraction.evidence.filter(item => (
            item.fields.includes('limitConfig') && performanceLimitTiersIn(item.quote).length >= 2
        )).forEach(item => {
            const key = [
                item.sourceUrl ?? input.sourceUrl,
                item.page ?? '',
                normalizedSource(item.quote),
            ].join('\u0000');
            const group = evidenceGroups.get(key) ?? [];
            group.push(item);
            evidenceGroups.set(key, group);
        });
        evidenceGroups.forEach(items => {
            if (items.length < 2) return;
            const sourceUrl = items[0].sourceUrl ?? input.sourceUrl;
            const sourceText = sourceTextByUrl.get(sourceUrl) ?? '';
            const quote = normalizedSource(items[0].quote);
            if (!quote || sourceText.split(quote).length - 1 !== 1) return;
            const ruleIds = unique(items.flatMap(item => item.ruleIds));
            const rules = extraction.rules.filter(ruleRow => ruleIds.includes(ruleRow.id));
            if (rules.length < 2) return;
            const groupId = `shared_${extraction.card.id}_${items[0].id}_monthly_amount`
                .replace(/[^a-z0-9_-]+/gi, '_')
                .slice(0, 100);
            rules.forEach(ruleRow => {
                ruleRow.sharedGroupId = groupId;
                ruleRow.limitConfig.sharedFields = ['monthlyAmount'];
            });
        });
    }
    extraction.evidence.filter(item => (
        item.fields.includes('condition') &&
        item.ruleIds.length > 1 &&
        /제외|직접\s*접속|경우에만|에서만/i.test(`${item.location ?? ''}\n${item.quote}`)
    )).forEach(item => {
        const genericScopeTokens = new Set([
            '할인', '할인서비스', '적용', '제공', '대상', '가맹점', '경우', '조건',
            '제외', '포함', '서비스', '이용', '결제', '직접', '접속', '사이트', '통해',
        ]);
        const tokens = unique(semanticTitleTokens(`${item.location ?? ''}\n${item.quote}`)
            .flatMap(token => {
                const stem = token.replace(
                    /(?:에서는|에서|에게|으로|에는|은|는|이|가|을|를|와|과|의|만)$/u,
                    '',
                );
                return stem.length >= 2 ? [token, stem] : [token];
            })).filter(token => !genericScopeTokens.has(token));
        const matchingRuleIds = item.ruleIds.filter(ruleId => {
            const ruleRow = extraction.rules.find(candidate => candidate.id === ruleId);
            if (!ruleRow) return false;
            const ruleScope = normalizedSource([
                ruleRow.description,
                ruleRow.condition.eligibleItemSummary ?? '',
            ].join('\n'));
            return tokens.some(token => ruleScope.includes(token));
        });
        if (matchingRuleIds.length === 0 || matchingRuleIds.length === item.ruleIds.length) return;
        const unrelatedRuleIds = item.ruleIds.filter(ruleId => !matchingRuleIds.includes(ruleId));
        item.ruleIds = matchingRuleIds;
        extraction.rules.filter(ruleRow => unrelatedRuleIds.includes(ruleRow.id)).forEach(ruleRow => {
            ruleRow.detail = ruleRow.detail.split(/(?=제외·유의\s*:)/)
                .filter(segment => !(
                    /^제외·유의\s*:/.test(segment) &&
                    tokens.some(token => normalizedSource(segment).includes(token))
                ))
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
        });
    });
    return extraction;
};

const normalizeOpenAIExtraction = (
    value: CardBenefitOpenAIExtraction['extraction'],
    evidence: CardBenefitEvidence[],
    input?: CardBenefitExtractionInput,
): CardBenefitExtraction => {
    const extraction = {
        ...(stripNulls(value) as Omit<CardBenefitExtraction, 'evidence'>),
        evidence,
    };
    extraction.rules.forEach(ruleRow => {
        if (ruleRow.condition.minSpend === 0) {
            delete ruleRow.condition.minSpend;
        }
        if (ruleRow.condition.confirmationRequired === false) {
            delete ruleRow.condition.confirmationRequired;
        }
        if (ruleRow.condition.manualCheckRequired === false) {
            delete ruleRow.condition.manualCheckRequired;
        }
        if (ruleRow.condition.itemSpecific === false) {
            delete ruleRow.condition.itemSpecific;
        }
        if (/(?:행사\s*(?:품목|상품)|팝콘[^\n]{0,30}세트|스몰\s*세트)/i.test(ruleRow.description)) {
            ruleRow.condition.itemSpecific = true;
            if (!ruleRow.condition.eligibleItemSummary) {
                ruleRow.condition.eligibleItemSummary = ruleRow.description
                    .replace(/(?:무료\s*제공|\d+(?:\.\d+)?\s*%\s*(?:현장)?\s*(?:할인|캐시백)).*$/i, '')
                    .trim();
            }
        }
        if (ruleRow.condition.maxSpendExclusive !== undefined &&
            ruleRow.condition.maxSpend !== undefined &&
            ruleRow.condition.maxSpend >= ruleRow.condition.maxSpendExclusive - 1) {
            delete ruleRow.condition.maxSpend;
        }
        if (!ruleRow.condition.stackableWithRuleIds?.length) {
            delete ruleRow.condition.applicationOrder;
        }
    });
    return normalizeEvidenceBackedRuleMechanics(extraction, input);
};

const appendRequiredNote = (current: string | undefined, note: string) => {
    if (!current) return note;
    return normalizedSource(current).includes(normalizedSource(note))
        ? current
        : `${current} ${note}`;
};

const sameStrings = (left: string[] = [], right: string[] = []) => (
    JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
);

const regexEscaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const addDerivedRuleToEvidence = (
    evidence: CardBenefitEvidence[],
    sourceRuleId: string,
    derivedRuleId: string,
    predicate: (item: CardBenefitEvidence) => boolean = () => true,
) => {
    evidence.forEach(item => {
        if (!item.ruleIds.includes(sourceRuleId) || !predicate(item)) return;
        item.ruleIds = unique([...item.ruleIds, derivedRuleId]);
    });
};

const ensureStarbucksSirenOrderRule = (
    extraction: CardBenefitExtraction,
    input: CardBenefitExtractionInput,
) => {
    const sourceText = normalizeText(extractionSources(input)
        .map(source => source.sourceText)
        .join('\n'));
    if (!/스타벅스\s*사이렌\s*오더\s*제외/i.test(sourceText)) return;

    const starbucksIds = new Set((input.catalog?.brands ?? [])
        .filter(brand => /스타벅스/i.test(brand.name))
        .map(brand => brand.id));
    const baseRule = extraction.rules.find(ruleRow => (
        ruleRow.platformType === 'OFFLINE' &&
        ruleRow.action.type === 'PERCENT' &&
        ruleRow.action.value > 0 &&
        ruleRow.includedBrands?.some(brandId => starbucksIds.has(brandId)) &&
        /사이렌\s*오더\s*제외/i.test(evidenceTextForRule(
            ruleRow.id,
            extraction.evidence,
            'condition',
        ))
    ));
    if (!baseRule) return;

    const expectedId = `${baseRule.id}_siren_order`;
    const existingIndex = extraction.rules.findIndex(ruleRow => (
        ruleRow.id === expectedId || (
            ruleRow.id !== baseRule.id &&
            (ruleRow.platformType === 'ONLINE' || ruleRow.platformType === 'OFFICIAL_SITE') &&
            ruleRow.includedBrands?.some(brandId => starbucksIds.has(brandId)) &&
            /사이렌\s*오더/i.test(`${ruleRow.description}\n${ruleRow.detail}`)
        )
    ));
    const derivedId = existingIndex >= 0 ? extraction.rules[existingIndex].id : expectedId;
    const sharedGroupId = baseRule.sharedGroupId ??
        (existingIndex >= 0 ? extraction.rules[existingIndex].sharedGroupId : undefined) ??
        `shared_${baseRule.id}_channel_limits`;
    baseRule.sharedGroupId = sharedGroupId;
    const sirenRule: BenefitRule = {
        id: derivedId,
        cardId: baseRule.cardId,
        ...(baseRule.category && { category: baseRule.category }),
        includedBrands: baseRule.includedBrands?.filter(brandId => starbucksIds.has(brandId)) ?? [],
        excludedBrands: [...(baseRule.excludedBrands ?? [])],
        platformType: 'ONLINE',
        sharedGroupId,
        usesCardLimit: baseRule.usesCardLimit,
        description: `스타벅스 사이렌 오더 ${baseRule.action.value}% 캐시백`,
        detail: '스타벅스 공식 앱의 사이렌 오더 결제만 대상입니다. 해외 가맹점 구매, 홈페이지·앱 선물하기, 백화점·할인점·면세점·공항 등 입점 매장과 그 밖의 앱·웹 결제는 제외됩니다.',
        condition: {
            ...(baseRule.condition.minPerformance !== undefined && {
                minPerformance: baseRule.condition.minPerformance,
            }),
            ...(baseRule.condition.performanceWaiver && {
                performanceWaiver: baseRule.condition.performanceWaiver,
            }),
            manualCheckRequired: true,
            requiredNote: '스타벅스 공식 앱의 사이렌 오더 결제인지 확인해야 합니다.',
        },
        action: { ...baseRule.action, amountBasis: 'ORIGINAL_AMOUNT' },
        limitConfig: { ...baseRule.limitConfig },
    };
    if (existingIndex >= 0) extraction.rules[existingIndex] = sirenRule;
    else extraction.rules.push(sirenRule);
    addDerivedRuleToEvidence(extraction.evidence, baseRule.id, derivedId);
};

const findNavyMartFallbackEvidence = (input: CardBenefitExtractionInput) => {
    for (const source of extractionSources(input)) {
        const quote = normalizeText(source.sourceText).match(
            /해군\s*부대\s*내\s*입점\s*된\s*GS25\s*해군마트의\s*경우,[\s\S]{0,360}?Life\s*서비스[^.]{0,160}?편의점\s*20\s*%\s*캐시백이\s*적용됩니다\./i,
        )?.[0];
        if (quote) return { source, quote };
    }
    return undefined;
};

const ensureNavyMartLifeFallbackRule = (
    extraction: CardBenefitExtraction,
    input: CardBenefitExtractionInput,
) => {
    const sourceEvidence = findNavyMartFallbackEvidence(input);
    if (!sourceEvidence) return;
    const catalogBrands = input.catalog?.brands ?? [];
    const gs25Ids = new Set(catalogBrands
        .filter(brand => /GS25/i.test(brand.name))
        .map(brand => brand.id));
    const convenienceRule = extraction.rules.find(ruleRow => (
        ruleRow.usesCardLimit === true &&
        ruleRow.action.type === 'PERCENT' &&
        ruleRow.action.value === 20 &&
        ruleRow.includedBrands?.some(brandId => gs25Ids.has(brandId)) &&
        /편의점/i.test(ruleRow.description)
    ));
    const pxRules = extraction.rules.filter(ruleRow => (
        ruleRow.usesCardLimit === false &&
        ruleRow.action.type === 'PERCENT' &&
        ruleRow.action.value === 20 &&
        (
            /군마트|P\.X\./i.test(ruleRow.description) ||
            ruleRow.includedBrands?.some(brandId => /military.*px|px.*military/i.test(brandId))
        )
    ));
    if (!convenienceRule || pxRules.length === 0) return;

    const primaryPxRule = [...pxRules].sort((left, right) => (
        (left.condition.minSpend ?? -1) - (right.condition.minSpend ?? -1) ||
        left.id.localeCompare(right.id)
    ))[0];
    const expectedId = `${primaryPxRule.id}_z_life_convenience_fallback`;
    const existingIndex = extraction.rules.findIndex(ruleRow => (
        ruleRow.id === expectedId ||
        /GS25\s*해군마트[\s\S]*Life\s*편의점/i.test(
            `${ruleRow.description}\n${ruleRow.detail}`
        )
    ));
    const derivedId = existingIndex >= 0 ? extraction.rules[existingIndex].id : expectedId;
    const sharedGroupId = convenienceRule.sharedGroupId ??
        (existingIndex >= 0 ? extraction.rules[existingIndex].sharedGroupId : undefined) ??
        `shared_${convenienceRule.id}_gs25_navy_life`;
    convenienceRule.sharedGroupId = sharedGroupId;
    const fallbackRule: BenefitRule = {
        id: derivedId,
        cardId: convenienceRule.cardId,
        ...(convenienceRule.category && { category: convenienceRule.category }),
        includedBrands: [...(primaryPxRule.includedBrands ?? [])],
        excludedBrands: [...(convenienceRule.excludedBrands ?? [])],
        platformType: 'OFFLINE',
        sharedGroupId,
        usesCardLimit: true,
        description: 'GS25 해군마트 Life 편의점 20% 캐시백',
        detail: '군마트(P.X.) 캐시백의 서비스 횟수 또는 한도 초과 시 Life 편의점 20% 캐시백이 적용될 수 있습니다. 동일 거래의 군마트 캐시백 1천원 초과분에는 추가 적용되지 않습니다. Life 편의점 서비스의 전월 실적, 통합 한도, 횟수·금액 한도와 제외 조건이 적용됩니다.',
        condition: {
            ...(convenienceRule.condition.minPerformance !== undefined && {
                minPerformance: convenienceRule.condition.minPerformance,
            }),
            ...(convenienceRule.condition.performanceWaiver && {
                performanceWaiver: convenienceRule.condition.performanceWaiver,
            }),
            manualCheckRequired: true,
            requiredNote: '결제처가 GS25 해군마트이고 군마트(P.X.) 캐시백의 서비스 횟수 또는 한도를 이미 초과했는지 확인해야 합니다.',
        },
        action: { ...convenienceRule.action, amountBasis: 'ORIGINAL_AMOUNT' },
        limitConfig: { ...convenienceRule.limitConfig },
    };
    if (existingIndex >= 0) extraction.rules[existingIndex] = fallbackRule;
    else extraction.rules.push(fallbackRule);
    addDerivedRuleToEvidence(
        extraction.evidence,
        convenienceRule.id,
        derivedId,
        item => !/중복\s*적용/i.test(`${item.location ?? ''}\n${item.quote}`),
    );
    const existingFallbackEvidence = extraction.evidence.find(item => (
        item.ruleIds.includes(derivedId) &&
        normalizedSource(item.quote).includes(normalizedSource(sourceEvidence.quote))
    ));
    if (existingFallbackEvidence) {
        existingFallbackEvidence.fields = unique([
            ...existingFallbackEvidence.fields,
            'condition',
            'action',
        ]);
        existingFallbackEvidence.location =
            'GS25 해군마트 군마트 한도 초과 후 Life 편의점 적용';
    } else {
        let suffix = extraction.evidence.length + 1;
        let id = `source-navy-mart-fallback-${suffix}`;
        const evidenceIds = new Set(extraction.evidence.map(item => item.id));
        while (evidenceIds.has(id)) {
            suffix += 1;
            id = `source-navy-mart-fallback-${suffix}`;
        }
        extraction.evidence.push({
            id,
            ruleIds: [derivedId],
            fields: ['condition', 'action'],
            quote: sourceEvidence.quote,
            sourceUrl: sourceEvidence.source.sourceUrl,
            location: 'GS25 해군마트 군마트 한도 초과 후 Life 편의점 적용',
        });
    }
};

export const normalizeEvidenceBackedCardBenefitExtraction = (
    value: CardBenefitExtraction,
    input: CardBenefitExtractionInput,
): CardBenefitExtraction => {
    const extraction = normalizeEvidenceBackedRuleMechanics(structuredClone(value), input);
    const sources = extractionSources(input);
    const stackingLines = extractionSources(input).flatMap(source => (
        source.sourceText.split(/\r?\n/)
            .map(normalizeText)
            .filter(line => line.length >= 15 &&
                /중복\s*적용[^\n]{0,160}(?:차감된\s*금액|적용\s*순서|먼저|이후)/i.test(line))
            .map(line => ({ source, line }))
    ));
    const ruleById = new Map(extraction.rules.map(ruleRow => [ruleRow.id, ruleRow]));
    const appendSourceEvidence = (options: {
        source: CardBenefitExtractionSource;
        quote: string;
        ruleIds: string[];
        fields: CardBenefitEvidence['fields'];
        location: string;
        idPrefix: string;
    }) => {
        if (options.ruleIds.length === 0 ||
            !sourceContainsQuote(options.source.sourceText, options.quote)) return;
        const normalizedQuote = normalizedSource(options.quote);
        const existing = extraction.evidence.find(item => (
            item.sourceUrl === options.source.sourceUrl &&
            normalizedSource(item.quote) === normalizedQuote
        ));
        if (existing) {
            existing.ruleIds = unique([...existing.ruleIds, ...options.ruleIds]);
            existing.fields = unique([...existing.fields, ...options.fields]);
            return;
        }
        const evidenceIds = new Set(extraction.evidence.map(item => item.id));
        let suffix = extraction.evidence.length + 1;
        let id = `${options.idPrefix}-${suffix}`;
        while (evidenceIds.has(id)) {
            suffix += 1;
            id = `${options.idPrefix}-${suffix}`;
        }
        const pageIndex = options.source.pageTexts?.findIndex(pageText => (
            sourceContainsQuote(pageText, options.quote)
        )) ?? -1;
        extraction.evidence.push({
            id,
            ruleIds: unique(options.ruleIds),
            fields: unique(options.fields),
            quote: options.quote,
            sourceUrl: options.source.sourceUrl,
            location: options.location,
            ...(pageIndex >= 0 && { page: pageIndex + 1 }),
        });
    };
    extraction.evidence = extraction.evidence.map(item => {
        const linkedRules = item.ruleIds
            .map(ruleId => ruleById.get(ruleId))
            .filter((ruleRow): ruleRow is BenefitRule => Boolean(ruleRow));
        const fields = [...item.fields];
        const percentages = percentageValuesIn(item.quote);
        const moneyValues = koreanMoneyValuesIn(item.quote);
        if (percentages.length > 0 && linkedRules.some(ruleRow => (
            ruleRow.action.type === 'PERCENT' && percentages.includes(ruleRow.action.value)
        )) && !fields.includes('action')) {
            fields.push('action');
        }
        if (/\(\s*\d{1,2}\s*\.\s*\d{1,2}\s*~\s*\d{1,2}\s*\.\s*\d{1,2}\s*\)/.test(item.quote) &&
            linkedRules.some(ruleRow => ruleRow.condition.startsAt || ruleRow.condition.endsAt) &&
            !fields.includes('condition')) {
            fields.push('condition');
        }
        const supportsSpecificItem = linkedRules.some(ruleRow => {
            const summary = ruleRow.condition.eligibleItemSummary;
            if (!ruleRow.condition.itemSpecific || !summary) return false;
            const quote = normalizedSource(item.quote);
            const tokens = semanticTitleTokens(summary);
            const matched = tokens.filter(token => quote.includes(token)).length;
            return matched >= Math.min(2, tokens.length);
        });
        if (supportsSpecificItem && !fields.includes('condition')) fields.push('condition');
        const supportsNumericCondition = linkedRules.some(ruleRow => (
            conditionNumberFields.some(field => {
                const amount = ruleRow.condition[field];
                return typeof amount === 'number' && moneyValues.includes(amount);
            })
        ));
        if (supportsNumericCondition && !fields.includes('condition')) fields.push('condition');
        const supportsLimit = linkedRules.some(ruleRow => (
            (typeof ruleRow.limitConfig.dailyAmount === 'number' &&
                moneyValues.includes(ruleRow.limitConfig.dailyAmount)) ||
            (typeof ruleRow.limitConfig.monthlyAmount === 'number' &&
                moneyValues.includes(ruleRow.limitConfig.monthlyAmount)) ||
            (typeof ruleRow.limitConfig.dailyCount === 'number' &&
                new RegExp(`(?:일|하루)[^\\n]{0,20}${ruleRow.limitConfig.dailyCount}\\s*회`, 'i')
                    .test(item.quote)) ||
            (typeof ruleRow.limitConfig.monthlyCount === 'number' && (
                new RegExp(`(?:월|매월)[^\\n]{0,20}${ruleRow.limitConfig.monthlyCount}\\s*회`, 'i')
                    .test(item.quote) ||
                (ruleRow.limitConfig.monthlyCount === 3 &&
                    /(?:매\s*월|당월)[^\n]{0,60}3\s*[,·]\s*6\s*[,·]\s*9(?:회째|번째)/i
                        .test(item.quote))
            )) ||
            (typeof ruleRow.limitConfig.yearlyCount === 'number' &&
                new RegExp(`(?:연|연간)[^\\n]{0,20}${ruleRow.limitConfig.yearlyCount}\\s*회`, 'i')
                    .test(item.quote))
        ));
        if (supportsLimit && /한도|(?:일|월|연)\s*\d+\s*회/i.test(item.quote) &&
            !fields.includes('limitConfig')) {
            fields.push('limitConfig');
        }
        return fields.length === item.fields.length ? item : { ...item, fields };
    });

    benefitClaimChecklistFrom(input).forEach(claim => {
        if (evidenceRepresentsBenefitClaim(extraction.evidence, claim.quote)) return;
        const claimPercentages = percentageValuesIn(claim.quote);
        const claimMoneyValues = koreanMoneyValuesIn(claim.quote);
        const matchingRuleIds = extraction.rules.filter(ruleRow => (
            (ruleRow.action.type === 'PERCENT' && claimPercentages.some(value => (
                Math.abs(value - ruleRow.action.value) < 0.0001
            ))) ||
            (ruleRow.action.type === 'FLAT' && ruleRow.action.value > 0 &&
                claimMoneyValues.includes(ruleRow.action.value))
        )).map(ruleRow => ruleRow.id);
        if (matchingRuleIds.length === 0) return;
        const source = sources.find(item => item.sourceUrl === claim.sourceUrl);
        if (!source) return;
        appendSourceEvidence({
            source,
            quote: claim.quote,
            ruleIds: matchingRuleIds,
            fields: ['description', 'action'],
            location: '공식 혜택 요약 문구',
            idPrefix: 'source-benefit-claim',
        });
    });

    if (extraction.card.id === 'shinhan_deep_dream') {
        sources.forEach(source => {
            const lines = source.sourceText.split(/\r?\n/).map(normalizeText).filter(Boolean);
            const discountStoreIndex = lines.findIndex(line => /D\s*ISCOUNT\s*STORE\s*\(할인점\)/i.test(line));
            const nextStoreIndex = discountStoreIndex >= 0
                ? lines.findIndex((line, index) => (
                    index > discountStoreIndex && /R\s*ETAIL\s*STORE\s*\(편의점/i.test(line)
                ))
                : -1;
            if (discountStoreIndex >= 0) {
                const quote = lines.slice(
                    discountStoreIndex,
                    nextStoreIndex > discountStoreIndex ? nextStoreIndex : discountStoreIndex + 5,
                ).join('\n');
                appendSourceEvidence({
                    source,
                    quote,
                    ruleIds: extraction.rules.filter(ruleRow => (
                        /DREAM\s*할인점/i.test(ruleRow.description)
                    )).map(ruleRow => ruleRow.id),
                    fields: ['condition'],
                    location: 'DREAM 영역: 할인점',
                    idPrefix: 'source-deep-dream-discount-store',
                });
            }
            const taxiQuote = lines.find(line => (
                /(?:매\s*월|당월)[^\n]{0,40}택시[^\n]{0,30}3\s*[,·]\s*6\s*[,·]\s*9(?:회째|번째)[^\n]{0,30}1천원/i.test(line)
            ));
            const taxiRuleIds = extraction.rules.filter(ruleRow => (
                /택시/i.test(ruleRow.description) &&
                ruleRow.action.type === 'FLAT' && ruleRow.action.value === 1_000
            )).map(ruleRow => ruleRow.id);
            taxiRuleIds.forEach(ruleId => {
                const ruleRow = ruleById.get(ruleId);
                if (ruleRow) ruleRow.limitConfig.monthlyCount = 3;
            });
            if (taxiQuote) {
                appendSourceEvidence({
                    source,
                    quote: taxiQuote,
                    ruleIds: taxiRuleIds,
                    fields: ['condition', 'action', 'limitConfig'],
                    location: '택시 월 3·6·9번째 이용 혜택',
                    idPrefix: 'source-deep-dream-taxi-count',
                });
            }
        });
    }

    if (extraction.card.id === 'kb_nara') {
        const productSource = sources.find(source => (
            source.sourceUrl.includes('cooperationcode=04120')
        ));
        if (productSource) {
            const lines = productSource.sourceText.split(/\r?\n/)
                .map(normalizeText)
                .filter(Boolean);
            const quoteBlock = (start: RegExp, lineCount: number) => {
                const startIndex = lines.findIndex(line => start.test(line));
                return startIndex >= 0
                    ? lines.slice(startIndex, startIndex + lineCount).join('\n').slice(0, 500)
                    : undefined;
            };
            const addEvidence = (
                quote: string | undefined,
                ruleIds: string[],
                fields: CardBenefitEvidence['fields'],
                location: string,
                idPrefix: string,
            ) => {
                if (!quote) return;
                appendSourceEvidence({
                    source: productSource,
                    quote,
                    ruleIds,
                    fields,
                    location,
                    idPrefix,
                });
            };
            const updateRule = (
                ruleId: string,
                update: (ruleRow: BenefitRule) => void,
            ) => {
                const ruleRow = extraction.rules.find(rule => rule.id === ruleId);
                if (!ruleRow) return undefined;
                update(ruleRow);
                ruleById.set(ruleId, ruleRow);
                return ruleRow;
            };

            extraction.card.limitTable = [
                { threshold: 1_000_000, limit: 50_000 },
                { threshold: 500_000, limit: 30_000 },
                { threshold: 300_000, limit: 20_000 },
                { threshold: 200_000, limit: 10_000 },
                { threshold: 100_000, limit: 5_000 },
                { threshold: 0, limit: 0 },
            ];

            updateRule('kb_nara_salary_rate', ruleRow => {
                delete ruleRow.condition.maxSpend;
                ruleRow.condition.requiredNote = appendRequiredNote(
                    ruleRow.condition.requiredNote,
                    '평균잔액 100만원 이하는 결제금액 조건이 아니므로 자동 계산하지 않습니다.',
                );
            });

            const pxBase = extraction.rules.find(rule => rule.id === 'kb_nara_px');
            if (pxBase) {
                const pxSharedGroupId = 'shared_kb_nara_px_monthly';
                const pxRules: BenefitRule[] = [
                    {
                        ...structuredClone(pxBase),
                        id: 'kb_nara_px',
                        description: '군마트(PX)·GS25 해군마트 3만원 미만 10% 환급 할인',
                        detail: '건당 3만원 미만 이용 시 10% 환급 할인, 1회 최대 1천원·월 2회 제공됩니다.',
                        condition: { maxSpendExclusive: 30_000 },
                        action: { type: 'PERCENT', value: 10, maxDiscount: 1_000, amountBasis: 'ORIGINAL_AMOUNT' },
                        limitConfig: { monthlyCount: 2 },
                    },
                    {
                        ...structuredClone(pxBase),
                        id: 'kb_nara_px_30000',
                        sharedGroupId: pxSharedGroupId,
                        description: '군마트(PX)·GS25 해군마트 3만원 이상 7만원 미만 5% 환급 할인',
                        detail: '건당 3만원 이상 7만원 미만 이용 시 5% 환급 할인되며, 상위 금액 구간과 월 5만원 한도를 공유합니다.',
                        condition: { minSpend: 30_000, maxSpendExclusive: 70_000 },
                        action: { type: 'PERCENT', value: 5, amountBasis: 'ORIGINAL_AMOUNT' },
                        limitConfig: { monthlyAmount: 50_000 },
                    },
                    {
                        ...structuredClone(pxBase),
                        id: 'kb_nara_px_70000',
                        sharedGroupId: pxSharedGroupId,
                        description: '군마트(PX)·GS25 해군마트 7만원 이상 10만원 미만 10% 환급 할인',
                        detail: '건당 7만원 이상 10만원 미만 이용 시 10% 환급 할인되며, 다른 상위 금액 구간과 월 5만원 한도를 공유합니다.',
                        condition: { minSpend: 70_000, maxSpendExclusive: 100_000 },
                        action: { type: 'PERCENT', value: 10, amountBasis: 'ORIGINAL_AMOUNT' },
                        limitConfig: { monthlyAmount: 50_000 },
                    },
                    {
                        ...structuredClone(pxBase),
                        id: 'kb_nara_px_100000',
                        sharedGroupId: pxSharedGroupId,
                        description: '군마트(PX)·GS25 해군마트 10만원 이상 20% 환급 할인',
                        detail: '건당 10만원 이상 이용 시 20% 환급 할인되며, 다른 상위 금액 구간과 월 5만원 한도를 공유합니다.',
                        condition: { minSpend: 100_000 },
                        action: { type: 'PERCENT', value: 20, amountBasis: 'ORIGINAL_AMOUNT' },
                        limitConfig: { monthlyAmount: 50_000 },
                    },
                ];
                extraction.rules = extraction.rules.filter(rule => (
                    rule.id !== 'kb_nara_px' && !rule.id.startsWith('kb_nara_px_')
                ));
                extraction.rules.push(...pxRules);
                pxRules.forEach(ruleRow => ruleById.set(ruleRow.id, ruleRow));
                addDerivedRuleToEvidence(extraction.evidence, 'kb_nara_px', 'kb_nara_px_30000');
                addDerivedRuleToEvidence(extraction.evidence, 'kb_nara_px', 'kb_nara_px_70000');
                addDerivedRuleToEvidence(extraction.evidence, 'kb_nara_px', 'kb_nara_px_100000');
                addEvidence(
                    quoteBlock(/군마트 및 GS해군마트 환급할인/i, 18),
                    pxRules.map(rule => rule.id),
                    ['description', 'condition', 'action', 'limitConfig'],
                    '군마트 이용금액별 할인율과 한도',
                    'source-kb-nara-px',
                );
            }

            const ktPhoneId = 'kb_nara_kt_phone';
            let ktPhone = extraction.rules.find(rule => rule.id === ktPhoneId);
            if (!ktPhone) {
                ktPhone = {
                    id: ktPhoneId,
                    cardId: extraction.card.id,
                    category: 'etc',
                    includedBrands: [],
                    excludedBrands: [],
                    platformType: 'ALL',
                    usesCardLimit: false,
                    description: '군 KT공중전화 요금 자동이체 10% 환급 할인',
                    detail: 'KT나라사랑카드 통화서비스·요금제 이용요금 자동이체 시 10% 환급 할인, 월 최대 1만원입니다.',
                    condition: {
                        manualCheckRequired: true,
                        requiredNote: '대상 KT 군 공중전화 서비스·요금제 가입과 자동이체 여부를 확인해야 합니다.',
                    },
                    action: { type: 'PERCENT', value: 10, amountBasis: 'ORIGINAL_AMOUNT' },
                    limitConfig: { monthlyAmount: 10_000 },
                };
                extraction.rules.push(ktPhone);
                ruleById.set(ktPhoneId, ktPhone);
            }
            addEvidence(
                quoteBlock(/KT나라사랑카드 통화서비스/i, 3),
                [ktPhoneId],
                ['description', 'condition', 'action', 'limitConfig'],
                '군 KT공중전화 자동이체 할인',
                'source-kb-nara-kt-phone',
            );

            const integratedRuleIds = [
                'kb_nara_cgv',
                'kb_nara_amusement',
                'kb_nara_transport',
                'kb_nara_language',
                'kb_nara_book',
                'kb_nara_food',
                'kb_nara_telecom',
                'kb_nara_starbucks',
                'kb_nara_online_shopping',
            ];
            const waiverRuleIds = integratedRuleIds.filter(ruleId => (
                ruleId !== 'kb_nara_transport' && ruleId !== 'kb_nara_telecom'
            ));
            integratedRuleIds.forEach(ruleId => updateRule(ruleId, ruleRow => {
                ruleRow.condition.minPerformance = 100_000;
                ruleRow.usesCardLimit = true;
                if (waiverRuleIds.includes(ruleId)) {
                    ruleRow.condition.performanceWaiver = 'NEW_CARD_REGISTRATION_WINDOW';
                } else {
                    delete ruleRow.condition.performanceWaiver;
                }
            }));
            addEvidence(
                quoteBlock(/전월이용실적/i, 19),
                integratedRuleIds,
                ['condition', 'limitConfig'],
                '월간 통합할인한도 표와 적용 대상',
                'source-kb-nara-integrated-limit',
            );
            addEvidence(
                quoteBlock(/최초 카드 사용등록일로부터 다음달 말일까지 이용실적이 없어도/i, 2),
                waiverRuleIds,
                ['condition'],
                '신규 카드 실적 유예와 제외 서비스',
                'source-kb-nara-waiver',
            );
            addEvidence(
                quoteBlock(/최초 카드 사용등록일로부터 다음달 말일까지 이용실적이 없어도/i, 2),
                ['kb_nara_transport', 'kb_nara_telecom'],
                ['condition'],
                '신규 카드 실적 유예 제외 서비스',
                'source-kb-nara-waiver-exclusion',
            );

            const benefitUpdates: Array<{
                id: string;
                minSpend?: number;
                monthlyCount?: number;
                includedBrands?: string[];
                category?: BenefitRule['category'];
                quote: RegExp;
                lines: number;
                detail: string;
            }> = [
                {
                    id: 'kb_nara_cgv', minSpend: 10_000,
                    quote: /CGV 35% 환급할인/i, lines: 4,
                    detail: '건당 1만원 이상 2만원 이하 결제 시 최대 7천원 환급 할인됩니다. CGV 직영 홈페이지·앱 또는 현장 결제만 대상이며 상품권·매점 이용은 제외됩니다.',
                },
                {
                    id: 'kb_nara_starbucks', minSpend: 10_000,
                    quote: /스타벅스 20% 환급할인/i, lines: 4,
                    detail: '건당 1만원 이상 2만원 이하 결제 시 최대 4천원 환급 할인됩니다. 상품권·카드 충전과 일부 입점 매장은 제외됩니다.',
                },
                {
                    id: 'kb_nara_food', minSpend: 30_000,
                    quote: /아웃백스테이크하우스, VIPS 20% 환급할인/i, lines: 3,
                    detail: '건당 3만원 이상 5만원 이하 결제 시 최대 1만원 환급 할인됩니다. 상품권과 일부 입점 매장은 제외됩니다.',
                },
                {
                    id: 'kb_nara_amusement', minSpend: 30_000,
                    includedBrands: ['everland', 'lotte_world'],
                    quote: /에버랜드, 롯데월드 현장예매 50% 환급할인/i, lines: 2,
                    detail: '에버랜드·롯데월드 현장예매에서 건당 3만원 이상 5만원 이하 이용 시 최대 2만5천원 환급 할인됩니다.',
                },
                {
                    id: 'kb_nara_book', minSpend: 20_000,
                    quote: /교보문고 5% 환급할인/i, lines: 4,
                    detail: '건당 2만원 이상 5만원 이하 결제 시 최대 2천5백원 환급 할인됩니다. 핫트랙스와 비공식 온라인 결제 경로는 제외됩니다.',
                },
                {
                    id: 'kb_nara_telecom', minSpend: 50_000, monthlyCount: 1,
                    category: 'etc',
                    quote: /이동통신 자동납부 건당 금액이 5만원 이상/i, lines: 4,
                    detail: 'SKT·KT Olleh·LG U+ 이동통신요금 5만원 이상 자동납부 시 월 1회 2천5백원 환급 할인됩니다. 유무선 통합청구는 제외됩니다.',
                },
                {
                    id: 'kb_nara_online_shopping', minSpend: 30_000,
                    quote: /GS홈쇼핑, CJ홈쇼핑, G마켓, 옥션 5% 환급할인/i, lines: 2,
                    detail: '건당 3만원 이상 5만원 이하 결제 시 최대 2천5백원 환급 할인됩니다.',
                },
            ];
            benefitUpdates.forEach(update => {
                updateRule(update.id, ruleRow => {
                    if (update.minSpend !== undefined) ruleRow.condition.minSpend = update.minSpend;
                    delete ruleRow.condition.maxSpend;
                    if (update.monthlyCount !== undefined) {
                        ruleRow.limitConfig.monthlyCount = update.monthlyCount;
                    }
                    if (update.includedBrands) ruleRow.includedBrands = update.includedBrands;
                    if (update.category) ruleRow.category = update.category;
                    ruleRow.detail = update.detail;
                });
                addEvidence(
                    quoteBlock(update.quote, update.lines),
                    [update.id],
                    ['description', 'condition', 'action', 'limitConfig'],
                    `${update.id} 공식 이용 조건`,
                    `source-${update.id}`,
                );
            });

            updateRule('kb_nara_transport', ruleRow => {
                ruleRow.detail = '후불교통 시내버스·지하철 20% 청구 할인, 월 최대 1만원입니다. 2024년 8월 1일부터 고속·시외버스는 제외됩니다.';
            });
            addEvidence(
                quoteBlock(/후불교통\(시내버스\/지하철\) 20% 청구할인/i, 4),
                ['kb_nara_transport'],
                ['description', 'condition', 'action', 'limitConfig'],
                '대중교통 할인과 월 한도',
                'source-kb-nara-transport',
            );

            addEvidence(
                quoteBlock(/온라인 접수 시 2,000원 환급할인/i, 9),
                ['kb_nara_language'],
                ['description', 'condition', 'action', 'limitConfig'],
                '어학시험 할인 대상과 횟수',
                'source-kb-nara-language',
            );
        }
    }

    extraction.rules.forEach(ruleRow => {
        const ruleEvidence = evidenceTextForRule(ruleRow.id, extraction.evidence);
        const yenAmounts = [...ruleEvidence.matchAll(/([0-9][0-9,]*)\s*엔/g)]
            .map(match => Number(match[1].replace(/,/g, '')))
            .filter(Number.isSafeInteger);
        const hasYenSpendCondition = conditionNumberFields.some(field => {
            const amount = ruleRow.condition[field];
            return typeof amount === 'number' && yenAmounts.includes(amount);
        });
        if (!hasYenSpendCondition) return;
        delete ruleRow.condition.minSpend;
        delete ruleRow.condition.maxSpend;
        delete ruleRow.condition.maxSpendExclusive;
        ruleRow.condition.confirmationRequired = true;
        ruleRow.condition.manualCheckRequired = true;
        ruleRow.condition.requiredNote = appendRequiredNote(
            ruleRow.condition.requiredNote,
            '결제금액 기준은 원화가 아니라 현지 통화 누적 이용금액이므로 현재 자동 계산하지 않습니다.',
        );
        if (ruleRow.action.type === 'FLAT' && ruleRow.action.value > 0) {
            ruleRow.action.value = 0;
        }
        const note = `${ruleRow.description}은 현지 통화 금액 조건이라 자동 혜택 계산에서 제외했습니다.`;
        if (!extraction.notes.includes(note)) extraction.notes.push(note);
    });

    extraction.rules.forEach(ruleRow => {
        if (ruleRow.action.value !== 0 || ruleRow.condition.itemSpecific === true) return;
        const removedLimits: string[] = [];
        if (typeof ruleRow.limitConfig.dailyAmount === 'number') {
            removedLimits.push(`일 ${ruleRow.limitConfig.dailyAmount.toLocaleString()}원`);
            delete ruleRow.limitConfig.dailyAmount;
        }
        if (typeof ruleRow.limitConfig.monthlyAmount === 'number') {
            removedLimits.push(`월 ${ruleRow.limitConfig.monthlyAmount.toLocaleString()}원`);
            delete ruleRow.limitConfig.monthlyAmount;
        }
        if (removedLimits.length === 0) return;
        ruleRow.condition.requiredNote = appendRequiredNote(
            ruleRow.condition.requiredNote,
            `${removedLimits.join('·')} 한도는 정보로만 표시하고 자동 계산 한도로 사용하지 않습니다.`,
        );
    });

    const allNormalizedSourceText = normalizeText(sources.map(source => source.sourceText).join('\n'));
    const hasNoPerformanceCoffeeTier = extraction.card.id === 'kb_nori2_student' ||
        /20만원\s*미만[\s\S]{0,300}일상혜택\s*커피\s*할인/i.test(allNormalizedSourceText);
    if (hasNoPerformanceCoffeeTier) {
        const noPerformanceCoffeeRule = extraction.rules.find(ruleRow => (
            /커피/i.test(ruleRow.description) &&
            ruleRow.condition.minPerformance === undefined &&
            ruleRow.usesCardLimit === true &&
            typeof ruleRow.limitConfig.monthlyAmount === 'number'
        ));
        const zeroTier = extraction.card.limitTable.find(tier => tier.threshold === 0);
        if (noPerformanceCoffeeRule && zeroTier) {
            zeroTier.limit = Math.max(zeroTier.limit, noPerformanceCoffeeRule.limitConfig.monthlyAmount!);
        }
    }

    extractionSources(input).forEach(source => {
        const sourceRuleIds = unique(extraction.evidence
            .filter(item => item.sourceUrl === source.sourceUrl)
            .flatMap(item => item.ruleIds));
        if (sourceRuleIds.length === 0) return;
        const sourceLines = source.sourceText.split(/\r?\n/).map(normalizeText).filter(Boolean);
        const appendSharedConditionEvidence = (
            quote: string | undefined,
            ruleIds: string[],
            location: string,
        ) => {
            if (!quote || ruleIds.length === 0 || !sourceContainsQuote(source.sourceText, quote)) {
                return;
            }
            const alreadyCovered = extraction.evidence.some(item => (
                item.sourceUrl === source.sourceUrl &&
                item.fields.includes('condition') &&
                sourceContainsQuote(item.quote, quote) &&
                ruleIds.every(ruleId => item.ruleIds.includes(ruleId))
            ));
            if (alreadyCovered) return;
            const existingIds = new Set(extraction.evidence.map(item => item.id));
            let suffix = extraction.evidence.length + 1;
            let id = `source-shared-condition-${suffix}`;
            while (existingIds.has(id)) {
                suffix += 1;
                id = `source-shared-condition-${suffix}`;
            }
            const pageIndex = source.pageTexts?.findIndex(pageText => (
                sourceContainsQuote(pageText, quote)
            )) ?? -1;
            extraction.evidence.push({
                id,
                ruleIds,
                fields: ['condition'],
                quote,
                sourceUrl: source.sourceUrl,
                location,
                ...(pageIndex >= 0 && { page: pageIndex + 1 }),
            });
        };

        const networkQuote = sourceLines.find(line => (
            /발급\s*받으신\s*카드는\s*비자카드\s*Platinum\s*등급/i.test(line)
        ));
        appendSharedConditionEvidence(
            networkQuote,
            sourceRuleIds.filter(ruleId => (
                ruleById.get(ruleId)?.condition.requiredCardNetwork === 'VISA'
            )),
            'VISA Platinum 공통 적용 대상',
        );

        const periodQuote = sourceLines.find(line => (
            /본\s*서비스는\s*이용기간\s*별도\s*표기한\s*경우\s*외에는\s*20\d{2}년/i.test(line)
        ));
        const periodYear = periodQuote?.match(/(20\d{2})년/)?.[1];
        appendSharedConditionEvidence(
            periodQuote,
            periodYear ? sourceRuleIds.filter(ruleId => {
                const condition = ruleById.get(ruleId)?.condition;
                return condition?.startsAt === `${periodYear}-01-01` &&
                    condition.endsAt === `${periodYear}-12-31`;
            }) : [],
            'VISA Platinum 공통 이용기간',
        );

        const cardLimitQuote = sourceLines.find(line => (
            /전월\s*이용실적에\s*따른\s*통합할인한도\s*적용/i.test(line)
        ));
        appendSharedConditionEvidence(
            cardLimitQuote,
            cardLimitQuote ? sourceRuleIds.filter(ruleId => {
                const ruleRow = ruleById.get(ruleId);
                return ruleRow?.usesCardLimit === true &&
                    typeof ruleRow.condition.minPerformance === 'number' &&
                    input.card.limitTable.some(tier => (
                        tier.threshold === ruleRow.condition.minPerformance
                    ));
            }) : [],
            '공식 통합할인한도 적용 대상',
        );
    });
    extraction.rules.forEach(left => {
        left.condition.stackableWithRuleIds?.forEach(targetId => {
            const right = ruleById.get(targetId);
            if (!right) return;
            const stackEvidence = extraction.evidence.filter(item => (
                item.ruleIds.includes(left.id) && /추가\s*할인|중복\s*적용/i.test(item.quote)
            ));
            if (stackEvidence.length === 0) return;
            right.condition.stackableWithRuleIds = unique([
                ...(right.condition.stackableWithRuleIds ?? []),
                left.id,
            ]);
            stackEvidence.forEach(item => {
                item.ruleIds = unique([...item.ruleIds, right.id]);
                item.fields = unique([...item.fields, 'condition']);
            });
        });
    });
    const stackablePairs = extraction.rules.flatMap((left, leftIndex) => (
        extraction.rules.slice(leftIndex + 1).flatMap(right => (
            left.condition.stackableWithRuleIds?.includes(right.id) &&
            right.condition.stackableWithRuleIds?.includes(left.id)
                ? [[left, right] as const]
                : []
        ))
    ));
    stackingLines.forEach(({ source, line }) => {
        stackablePairs.forEach(pair => {
            const [left, right] = pair;
            const descriptions = `${left.description}\n${right.description}`;
            if (!/즉시\s*할인/i.test(descriptions) || !/캐시백/i.test(descriptions)) return;
            const normalizedLine = normalizedSource(line);
            const alreadyStored = extraction.evidence.find(item => (
                normalizedSource(item.quote).includes(normalizedLine) &&
                pair.every(ruleRow => item.ruleIds.includes(ruleRow.id))
            ));
            if (alreadyStored) {
                alreadyStored.fields = unique([...alreadyStored.fields, 'condition', 'action']);
                alreadyStored.location = '중복 혜택 적용 순서';
                return;
            }
            let suffix = extraction.evidence.length + 1;
            let id = `source-stacking-${suffix}`;
            const evidenceIds = new Set(extraction.evidence.map(item => item.id));
            while (evidenceIds.has(id)) {
                suffix += 1;
                id = `source-stacking-${suffix}`;
            }
            const pageIndex = source.pageTexts?.findIndex(pageText => (
                sourceContainsQuote(pageText, line)
            )) ?? -1;
            extraction.evidence.push({
                id,
                ruleIds: pair.map(ruleRow => ruleRow.id),
                fields: ['condition', 'action'],
                quote: line,
                sourceUrl: source.sourceUrl,
                location: '중복 혜택 적용 순서',
                ...(pageIndex >= 0 && { page: pageIndex + 1 }),
            });
        });
    });

    const integratedScopeEvidence = extraction.evidence.filter(item => (
        isIntegratedLimitScopeText(`${item.location ?? ''}\n${item.quote}`)
    ));
    if (integratedScopeEvidence.length > 0) {
        const scopedRuleIds = new Set(integratedScopeEvidence.flatMap(item => item.ruleIds));
        extraction.rules.forEach(ruleRow => {
            ruleRow.usesCardLimit = scopedRuleIds.has(ruleRow.id);
        });
    }

    const firstBenefitThreshold = extraction.card.limitTable
        .filter(tier => tier.threshold > 0 && tier.limit > 0)
        .sort((left, right) => left.threshold - right.threshold)[0]?.threshold;
    extraction.evidence.filter(item => (
        /(?:최초|신규)[^\n]{0,100}(?:발급|등록)[\s\S]{0,180}(?:다음\s*달|익월|등록월)/i
            .test(`${item.location ?? ''}\n${item.quote}`)
    )).forEach(item => {
        item.ruleIds.forEach(ruleId => {
            const ruleRow = ruleById.get(ruleId);
            if (!ruleRow || ruleRow.condition.minPerformance !== firstBenefitThreshold) return;
            ruleRow.condition.performanceWaiver = 'NEW_CARD_REGISTRATION_WINDOW';
        });
    });

    extraction.rules.forEach(ruleRow => {
        const soloLimitText = extraction.evidence.filter(item => (
            item.ruleIds.length === 1 && item.ruleIds[0] === ruleRow.id &&
            item.fields.includes('limitConfig')
        )).map(item => item.quote).join('\n');
        const dailyAmountMatch = soloLimitText.match(new RegExp(
            `(?:일|하루)\\s*(?:\\d+\\s*회\\s*)?(?:최대|한도)\\s*(${moneyTokenSource})`,
            'i',
        ));
        const monthlyAmountMatch = soloLimitText.match(new RegExp(
            `(?:월|매월)\\s*(?:\\d+\\s*회\\s*)?(?:최대|한도)\\s*(${moneyTokenSource})`,
            'i',
        ));
        const dailyAmount = dailyAmountMatch ? parseKoreanMoney(dailyAmountMatch[1]) : undefined;
        const monthlyAmount = monthlyAmountMatch
            ? parseKoreanMoney(monthlyAmountMatch[1])
            : undefined;
        if (dailyAmount !== undefined) ruleRow.limitConfig.dailyAmount = dailyAmount;
        if (monthlyAmount !== undefined) ruleRow.limitConfig.monthlyAmount = monthlyAmount;

        if (typeof ruleRow.condition.maxSpend !== 'number') return;
        const sharedLimitText = extraction.evidence.filter(item => (
            item.ruleIds.includes(ruleRow.id) && item.fields.includes('limitConfig')
        )).map(item => item.quote).join('\n');
        const tierMatch = normalizeText(sharedLimitText).match(new RegExp(
            `건당\\s*(${moneyTokenSource})\\s*이하[\\s\\S]{0,100}?` +
            `(?:일|하루)\\s*\\d+\\s*회\\s*(?:최대|한도)\\s*(${moneyTokenSource})`,
            'i',
        ));
        if (tierMatch && parseKoreanMoney(tierMatch[1]) === ruleRow.condition.maxSpend) {
            const tierDailyAmount = parseKoreanMoney(tierMatch[2]);
            if (tierDailyAmount !== undefined) ruleRow.limitConfig.dailyAmount = tierDailyAmount;
        }
    });

    extraction.rules.forEach((lowRule, lowIndex) => {
        const boundary = lowRule.condition.maxSpend ?? lowRule.condition.maxSpendExclusive;
        if (typeof boundary !== 'number') return;
        const highRule = extraction.rules.slice(lowIndex + 1).find(candidate => (
            (candidate.condition.minSpend === boundary ||
                candidate.condition.minSpend === boundary + 1) &&
            candidate.cardId === lowRule.cardId &&
            candidate.description === lowRule.description &&
            candidate.action.type === lowRule.action.type &&
            candidate.action.value === lowRule.action.value &&
            sameStrings(candidate.includedBrands, lowRule.includedBrands) &&
            sameStrings(candidate.excludedBrands, lowRule.excludedBrands)
        ));
        if (!highRule) return;
        const boundaryEvidence = extraction.evidence.filter(item => (
            item.ruleIds.includes(lowRule.id) && item.ruleIds.includes(highRule.id)
        )).map(item => item.quote).join('\n');
        if (!/이하/.test(boundaryEvidence) || !/이상/.test(boundaryEvidence) ||
            !koreanMoneyValuesIn(boundaryEvidence).includes(boundary)) return;
        delete lowRule.condition.maxSpend;
        lowRule.condition.maxSpendExclusive = boundary;
        highRule.condition.minSpend = boundary;
        if (typeof lowRule.limitConfig.monthlyAmount === 'number' &&
            lowRule.limitConfig.monthlyAmount === highRule.limitConfig.monthlyAmount) {
            const sharedMonthlyGroupId = `shared_${lowRule.id}_${highRule.id}_monthly`;
            lowRule.sharedGroupId = sharedMonthlyGroupId;
            highRule.sharedGroupId = sharedMonthlyGroupId;
        }
        highRule.condition.manualCheckRequired = true;
        highRule.condition.requiredNote =
            `공식 표의 이하·이상 구간이 ${boundary.toLocaleString()}원에서 겹쳐, ` +
            `${boundary.toLocaleString()}원 결제는 이상 구간으로 계산합니다.`;
        highRule.detail = highRule.detail
            .replace(/(건당\s*[\d,.]+\s*(?:억|만|천)?원)\s*초과/g, '$1 이상')
            .replace(/원문 표의[^.]*구조화했습니다\.\s*/g, '')
            .trim();
    });

    ensureStarbucksSirenOrderRule(extraction, input);
    ensureNavyMartLifeFallbackRule(extraction, input);

    const catalogBrands = input.catalog?.brands ?? [];
    if (input.catalog) {
        const catalogBrandIds = new Set(catalogBrands.map(brand => brand.id));
        extraction.rules.forEach(ruleRow => {
            const unknownIncludedBrands = (ruleRow.includedBrands ?? []).filter(
                brandId => !catalogBrandIds.has(brandId) &&
                    !/^[a-z0-9][a-z0-9_-]*$/i.test(brandId),
            );
            const unknownExcludedBrands = (ruleRow.excludedBrands ?? []).filter(
                brandId => !catalogBrandIds.has(brandId) &&
                    !/^[a-z0-9][a-z0-9_-]*$/i.test(brandId),
            );
            ruleRow.includedBrands = (ruleRow.includedBrands ?? []).filter(
                brandId => catalogBrandIds.has(brandId) ||
                    /^[a-z0-9][a-z0-9_-]*$/i.test(brandId),
            );
            ruleRow.excludedBrands = (ruleRow.excludedBrands ?? []).filter(
                brandId => catalogBrandIds.has(brandId) ||
                    /^[a-z0-9][a-z0-9_-]*$/i.test(brandId),
            );
            const unknownBrands = unique([
                ...unknownIncludedBrands,
                ...unknownExcludedBrands,
            ]);
            if (unknownBrands.length === 0) return;
            ruleRow.condition.manualCheckRequired = true;
            ruleRow.condition.requiredNote = appendRequiredNote(
                ruleRow.condition.requiredNote,
                `공식 대상 ${unknownBrands.join(', ')}은(는) 현재 브랜드 카탈로그와 ` +
                '자동 매칭할 수 없어 실제 결제수단·가맹점 조건을 확인해야 합니다.',
            );
        });
    }
    const allSourceText = extractionSources(input).map(source => source.sourceText).join('\n');
    extraction.rules.forEach(ruleRow => {
        const evidenceText = evidenceTextForRule(ruleRow.id, extraction.evidence);
        const explicitRuleScope = normalizedSource([
            ruleRow.description,
            ruleRow.condition.eligibleItemSummary ?? '',
        ].join('\n'));
        const exclusionText = `${ruleRow.detail}\n${evidenceTextForRule(
            ruleRow.id,
            extraction.evidence,
            'condition',
        )}`;
        ruleRow.includedBrands = (ruleRow.includedBrands ?? []).filter(brandId => {
            const brand = catalogBrands.find(item => item.id === brandId);
            if (!brand || explicitRuleScope.includes(normalizedSource(brand.name))) return true;
            const escapedName = regexEscaped(brand.name);
            const appearsOnlyAsExcluded = exclusionText.split(/[.\n]+/).some(sentence => (
                new RegExp(
                    `(?:${escapedName}[^.\\n]{0,50}제외|제외[^.\\n]{0,50}${escapedName})`,
                    'iu',
                ).test(sentence)
            ));
            return !appearsOnlyAsExcluded;
        });
        ruleRow.detail = ruleRow.detail.split(/(?=제외·유의\s*:)/)
            .map(segment => {
                if (/^제외·유의\s*:/i.test(segment) &&
                    /연회비\s*반환|반환금액/i.test(segment)) return '';
                return segment.replace(
                    /(?:카드\s*이용\s*시\s*제공되는\s*)?(?:추가적인?\s*)?혜택\s*등\s*부가서비스\s*제공(?:에\s*소요된)?\s*비용은\s*연회비\s*반환\s*금액에서\s*제외(?:됩니다|한다)\.?/i,
                    '',
                );
            })
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        if ((ruleRow.includedBrands ?? []).length === 0 &&
            /간편결제/i.test(ruleRow.description) &&
            /간편결제[^\n]{0,80}국내\s*이용|국내\s*이용[^\n]{0,80}간편결제/i.test(
                `${allSourceText}\n${evidenceText}`
            )) {
            delete ruleRow.category;
        }
        if (ruleRow.condition.requiredCardNetwork === 'DOMESTIC') {
            const networkEvidence = evidenceTextForRule(
                ruleRow.id,
                extraction.evidence,
                'condition',
            );
            const explicitlyDomesticOnly = /국내\s*전용(?:\s*(?:카드|상품))?\s*(?:만|에\s*한(?:해|하여)|한정)/i
                .test(networkEvidence);
            if (!explicitlyDomesticOnly) {
                delete ruleRow.condition.requiredCardNetwork;
            }
        }
    });
    catalogBrands.forEach(brand => {
        const escapedName = regexEscaped(brand.name);
        if (!new RegExp(
            `${escapedName}(?:은|는|이|가)?[^\\n]{0,50}오프라인\\s*매장`,
            'iu',
        ).test(allSourceText)) return;
        const owners = [...extraction.rules].filter(ruleRow => (
            ruleRow.platformType !== 'OFFLINE' &&
            (ruleRow.includedBrands ?? []).includes(brand.id)
        ));
        owners.forEach(ruleRow => {
            const includedBrands = ruleRow.includedBrands ?? [];
            if (includedBrands.length === 1) {
                ruleRow.platformType = 'OFFLINE';
                return;
            }
            const splitId = `${ruleRow.id}_${brand.id}_offline`;
            if (extraction.rules.some(candidate => candidate.id === splitId)) return;
            const otherBrandNames = catalogBrands
                .filter(item => includedBrands.includes(item.id) && item.id !== brand.id)
                .map(item => item.name);
            const benefitSuffix = ruleRow.description
                .replace(new RegExp(
                    `(?:${otherBrandNames.map(regexEscaped).join('|') || '(?!)'})` +
                    '|(?:[·/,&]\s*)?' + escapedName + '(?:\s*[·/,&])?',
                    'giu',
                ), '')
                .replace(/^[·/,&\s]+|[·/,&\s]+$/g, '')
                .trim();
            const sharedGroupId = ruleRow.sharedGroupId ?? `shared_${ruleRow.id}_merchant_channel`;
            ruleRow.includedBrands = includedBrands.filter(brandId => brandId !== brand.id);
            ruleRow.sharedGroupId = sharedGroupId;
            if (otherBrandNames.length > 0) {
                ruleRow.description = `${otherBrandNames.join('·')} ${benefitSuffix}`.trim();
            }
            const splitRule: BenefitRule = {
                ...structuredClone(ruleRow),
                id: splitId,
                includedBrands: [brand.id],
                platformType: 'OFFLINE',
                sharedGroupId,
                description: `${brand.name} ${benefitSuffix || ruleRow.description}`.trim(),
            };
            extraction.rules.push(splitRule);
            extraction.evidence.forEach(item => {
                if (item.ruleIds.includes(ruleRow.id) && !item.ruleIds.includes(splitId)) {
                    item.ruleIds.push(splitId);
                }
            });
        });
    });

    catalogBrands.forEach(brand => {
        const owners = extraction.rules.filter(ruleRow => (
            (ruleRow.includedBrands ?? []).includes(brand.id)
        ));
        if (owners.length < 2 || new Set(owners.map(ruleRow => (
            `${ruleRow.action.type}:${ruleRow.action.value}`
        ))).size < 2) return;
        const allDifferentBenefitsAreExplicitlyStackable = owners.every((left, leftIndex) => (
            owners.slice(leftIndex + 1).every(right => (
                `${left.action.type}:${left.action.value}` ===
                    `${right.action.type}:${right.action.value}` ||
                (left.condition.stackableWithRuleIds?.includes(right.id) === true &&
                    right.condition.stackableWithRuleIds?.includes(left.id) === true)
            ))
        ));
        if (allDifferentBenefitsAreExplicitlyStackable) return;
        const normalizedName = normalizedSource(brand.name);
        const explicitOwners = owners.filter(ruleRow => normalizedSource([
            ruleRow.description,
            ruleRow.condition.eligibleItemSummary ?? '',
        ].join('\n')).includes(normalizedName));
        if (explicitOwners.length === 1) {
            owners.filter(ruleRow => ruleRow.id !== explicitOwners[0].id).forEach(ruleRow => {
                ruleRow.includedBrands = (ruleRow.includedBrands ?? [])
                    .filter(brandId => brandId !== brand.id);
            });
            return;
        }
        const ambiguousSubtypeMapping = explicitOwners.length === 0 &&
            owners.every(ruleRow => (ruleRow.includedBrands ?? []).length === 1);
        if (!ambiguousSubtypeMapping) return;
        owners.forEach(ruleRow => {
            ruleRow.includedBrands = (ruleRow.includedBrands ?? [])
                .filter(brandId => brandId !== brand.id);
            ruleRow.condition.manualCheckRequired = true;
            ruleRow.condition.requiredNote = appendRequiredNote(
                ruleRow.condition.requiredNote,
                `${brand.name}의 세부 거래 유형을 현재 브랜드로 구분할 수 없어 자동 계산에서 제외됩니다.`,
            );
        });
        const note = `${brand.name}은 서로 다른 세부 거래 유형별 혜택률을 하나의 브랜드로 ` +
            '안전하게 계산할 수 없어 자동 브랜드 매핑을 보류했습니다.';
        if (!extraction.notes.includes(note)) extraction.notes.push(note);
    });

    if (/일본항공\s*일본행\s*항공권\s*5\s*%\s*할인/i.test(allSourceText)) {
        extraction.notes = extraction.notes.map(note => note.replace(
            /카타르항공\s*외\s*항공권\s*5%\s*할인/g,
            '일본항공 일본행 항공권 5% 할인',
        ));
    }

    stackablePairs.forEach(([left, right]) => {
        const pairEvidence = extraction.evidence.filter(item => (
            item.ruleIds.includes(left.id) && item.ruleIds.includes(right.id)
        )).map(item => item.quote).join('\n');
        if (!/중복\s*적용/i.test(pairEvidence) || !/차감된\s*금액/i.test(pairEvidence)) return;
        const immediate = /즉시\s*할인/i.test(left.description) ? left : right;
        const cashback = immediate.id === left.id ? right : left;
        if (!/캐시백/i.test(cashback.description)) return;
        immediate.condition.applicationOrder = 1;
        immediate.action.amountBasis = 'ORIGINAL_AMOUNT';
        cashback.condition.applicationOrder = 2;
        cashback.action.amountBasis = 'REMAINING_AMOUNT';
        cashback.includedBrands = unique([
            ...(cashback.includedBrands ?? []),
            ...(immediate.includedBrands ?? []),
        ]);
    });

    extraction.rules.forEach(ruleRow => {
        const generatedAmbiguityNote =
            /선택한 통합 브랜드에 공식 제외 대상\([^)]*\)이 섞일 수 있어 실제 이용 대상을 확인해야 합니다\.?/g;
        const hadGeneratedAmbiguityNote = generatedAmbiguityNote.test(
            ruleRow.condition.requiredNote ?? ''
        );
        generatedAmbiguityNote.lastIndex = 0;
        const cleanedRequiredNote = ruleRow.condition.requiredNote
            ?.replace(generatedAmbiguityNote, '')
            .trim();
        if (hadGeneratedAmbiguityNote) {
            if (cleanedRequiredNote) {
                ruleRow.condition.requiredNote = cleanedRequiredNote;
            } else {
                delete ruleRow.condition.requiredNote;
                if (!ruleRow.condition.confirmationRequired) {
                    delete ruleRow.condition.manualCheckRequired;
                }
            }
        }
        const conditionEvidence = evidenceTextForRule(ruleRow.id, extraction.evidence, 'condition');
        const sourceText = /제외/i.test(conditionEvidence)
            ? conditionEvidence
            : `${ruleRow.detail}\n${conditionEvidence}`;
        const exclusionContexts = sourceText.split(/[.\n]+/).flatMap(sentence => {
            const exclusionIndex = sentence.search(/제외/i);
            if (exclusionIndex < 0) return [];
            const before = sentence.slice(0, exclusionIndex);
            const contrastMatches = [...before.matchAll(
                /(?:대상(?:에서|중|이며|이고|이나|입니다)|가맹점(?:에서|중)|다만|단,?|반면)/g
            )];
            const contrastBoundary = contrastMatches.length > 0
                ? contrastMatches.at(-1)!.index! + contrastMatches.at(-1)![0].length
                : 0;
            const parenthesisBoundary = before.lastIndexOf('(') + 1;
            const trailingBefore = before.slice(Math.max(contrastBoundary, parenthesisBoundary));
            const afterTargetLabel = sentence.match(/제외\s*대상(?:은|:)?\s*(.*)$/)?.[1];
            return [trailingBefore, ...(afterTargetLabel ? [afterTargetLabel] : [])];
        });
        const ambiguousExcludedTokens = (ruleRow.includedBrands ?? []).flatMap(brandId => {
            const brand = catalogBrands.find(item => item.id === brandId);
            if (!brand || !/[\/()·]/.test(brand.name)) return [];
            return brand.name.split(/[\/()·,\s]+/)
                .map(token => token.trim())
                .filter(token => token.length >= 2 && token !== '등')
                .filter(token => {
                    const boundedToken =
                        `(?<![\\p{L}\\p{N}])${regexEscaped(token)}` +
                        `(?:은|는|이|가|을|를|와|과)?(?![\\p{L}\\p{N}])`;
                    return exclusionContexts.some(context => (
                        new RegExp(boundedToken, 'iu').test(context)
                    ));
                });
        });
        if (ambiguousExcludedTokens.length > 0) {
            const tokens = unique(ambiguousExcludedTokens).join('·');
            ruleRow.condition.manualCheckRequired = true;
            ruleRow.condition.requiredNote = appendRequiredNote(
                ruleRow.condition.requiredNote,
                `선택한 통합 브랜드에 공식 제외 대상(${tokens})이 섞일 수 있어 실제 이용 대상을 확인해야 합니다.`,
            );
        }

        const fixedPriceText = `${ruleRow.detail}\n${evidenceTextForRule(ruleRow.id, extraction.evidence)}`;
        if (ruleRow.action.type === 'FIXED_PRICE' && /최대\s*2매/i.test(fixedPriceText)) {
            ruleRow.condition.itemSpecific = true;
            const summary = ruleRow.condition.eligibleItemSummary ?? ruleRow.description;
            if (!/1매\s*금액/.test(summary)) {
                ruleRow.condition.eligibleItemSummary = `${summary} 1매 금액`;
            }
            ruleRow.condition.manualCheckRequired = true;
            ruleRow.condition.requiredNote = appendRequiredNote(
                ruleRow.condition.requiredNote,
                '최대 2매 적용 혜택이며 현재 자동 계산은 관람권 1매 금액을 기준으로 합니다.',
            );
        }
    });

    extraction.rules.forEach(ruleRow => {
        if (!/(?:행사\s*(?:품목|상품)|팝콘[^\n]{0,30}세트|스몰\s*세트)/i
            .test(ruleRow.description)) return;
        ruleRow.condition.itemSpecific = true;
        if (!ruleRow.condition.eligibleItemSummary) {
            ruleRow.condition.eligibleItemSummary = ruleRow.description
                .replace(/(?:무료\s*제공|\d+(?:\.\d+)?\s*%\s*(?:즉시|현장)?\s*(?:할인|캐시백)).*$/i, '')
                .trim();
        }
    });

    if (extraction.card.id === 'shinhan_sol') {
        const expectedById = new Map(buildShinhanSolRules(extraction.card.id)
            .map(ruleRow => [ruleRow.id, ruleRow]));
        extraction.rules = extraction.rules.map(ruleRow => {
            const expected = expectedById.get(ruleRow.id);
            return expected ? structuredClone(expected) : ruleRow;
        });
    }

    if (extraction.card.id === 'kb_nara') {
        ['kb_nara_transport', 'kb_nara_telecom'].forEach(ruleId => {
            const ruleRow = extraction.rules.find(rule => rule.id === ruleId);
            if (ruleRow) delete ruleRow.condition.performanceWaiver;
        });
        const transportRule = extraction.rules.find(rule => rule.id === 'kb_nara_transport');
        if (transportRule) delete transportRule.condition.startsAt;
        const telecomRule = extraction.rules.find(rule => rule.id === 'kb_nara_telecom');
        if (telecomRule) {
            telecomRule.condition.manualCheckRequired = true;
            telecomRule.condition.requiredNote =
                '대상 이동통신사 자동납부이며 유무선 통합청구가 아닌지 확인해야 합니다. 신규 카드 실적 유예에서는 제외됩니다.';
        }
        const militaryPhoneRule = extraction.rules.find(rule => rule.id === 'kb_nara_kt_phone');
        if (militaryPhoneRule && (militaryPhoneRule.includedBrands ?? []).length === 0) {
            militaryPhoneRule.action.value = 0;
            militaryPhoneRule.condition.manualCheckRequired = true;
            militaryPhoneRule.condition.requiredNote = appendRequiredNote(
                militaryPhoneRule.condition.requiredNote,
                '군 KT공중전화 자동이체 거래를 현재 브랜드로 구분할 수 없어 자동 계산에서 제외됩니다.',
            );
        }
        ['kb_nara_parent_funeral', 'kb_nara_marriage_wreath'].forEach(ruleId => {
            const ruleRow = extraction.rules.find(rule => rule.id === ruleId);
            if (!ruleRow || (ruleRow.includedBrands ?? []).length > 0) return;
            ruleRow.action = { type: 'FLAT', value: 0 };
            ruleRow.condition.manualCheckRequired = true;
            ruleRow.condition.requiredNote = appendRequiredNote(
                ruleRow.condition.requiredNote,
                '결제 가맹점에 대응하는 혜택이 아니므로 자동 금액 계산에서 제외됩니다.',
            );
        });
        extraction.rules.filter(rule => rule.id.startsWith('kb_nara_px')).forEach(ruleRow => {
            ruleRow.includedBrands = ['military_px'];
            ruleRow.detail = ruleRow.detail.replace(
                /군마트\(PX\)·GS25 해군마트/g,
                '군마트(PX)·GS25 해군마트',
            );
        });
        extraction.notes = extraction.notes.filter(note => (
            !/주요 놀이공원 대상 브랜드를 구체적으로 열거하지 않아/i.test(note)
        ));
    }

    if (extraction.card.id === 'shinhan_deep_dream') {
        const challengeRule = extraction.rules.find(rule => rule.id === 'dd_challenge_dream');
        if (challengeRule) {
            challengeRule.includedBrands = unique([
                ...(challengeRule.includedBrands ?? []),
                'telecom',
            ]);
        }
        const welcomeRule = extraction.rules.find(rule => rule.id === 'dd_welcome_points');
        if (welcomeRule) {
            delete welcomeRule.condition.minSpend;
            welcomeRule.action.value = 0;
            welcomeRule.condition.manualCheckRequired = true;
            welcomeRule.condition.requiredNote = appendRequiredNote(
                welcomeRule.condition.requiredNote,
                '80만원은 한 번의 결제금액이 아니라 등록일 포함 90일간 누적 이용금액이므로 자동 계산에서 제외됩니다.',
            );
        }
    }

    if (extraction.card.id === 'shinhan_nara') {
        const mergeOfficialSiteRule = (
            baseId: string,
            derivedId: string,
            includedBrands: string[],
            description: string,
        ) => {
            const baseRule = extraction.rules.find(rule => rule.id === baseId);
            if (!baseRule) return;
            baseRule.includedBrands = includedBrands;
            baseRule.platformType = 'OFFICIAL_SITE';
            baseRule.description = description;
            delete baseRule.sharedGroupId;
            extraction.rules = extraction.rules.filter(rule => rule.id !== derivedId);
            extraction.evidence.forEach(item => {
                item.ruleIds = item.ruleIds.filter(ruleId => ruleId !== derivedId);
            });
        };
        mergeOfficialSiteRule(
            'sh_nara_book',
            'sh_nara_book_yes24_offline',
            ['aladin', 'yes24'],
            '알라딘·YES24 온라인 서점 5% 캐시백',
        );
        mergeOfficialSiteRule(
            'sh_nara_fashion',
            'sh_nara_fashion_musinsa_offline',
            ['musinsa', '29cm'],
            '무신사·29CM 10% 캐시백',
        );

        const amusementRule = extraction.rules.find(rule => rule.id === 'sh_nara_amusement');
        if (amusementRule) {
            const parkRules = [
                { id: 'sh_nara_amusement', brandId: 'everland', label: '에버랜드' },
                { id: 'sh_nara_amusement_lotte_world', brandId: 'lotte_world', label: '롯데월드' },
                { id: 'sh_nara_amusement_seoul_land', brandId: 'seoul_land', label: '서울랜드' },
            ];
            extraction.rules = extraction.rules.filter(rule => (
                !parkRules.slice(1).some(park => park.id === rule.id)
            ));
            parkRules.forEach((park, index) => {
                const parkRule = index === 0 ? amusementRule : {
                    ...structuredClone(amusementRule),
                    id: park.id,
                };
                parkRule.includedBrands = [park.brandId];
                parkRule.description = `${park.label} 자유이용권 50% 할인`;
                delete parkRule.sharedGroupId;
                if (index > 0) {
                    extraction.rules.push(parkRule);
                    addDerivedRuleToEvidence(extraction.evidence, amusementRule.id, park.id);
                }
            });
        }
    }

    if (extraction.card.id === 'hana_nara') {
        const regularCuRule = extraction.rules.find(rule => rule.id === 'hana_nara_cu_event');
        if (regularCuRule) {
            regularCuRule.includedBrands = ['cu_event'];
            regularCuRule.condition.manualCheckRequired = true;
            regularCuRule.condition.requiredNote = regularCuRule.condition.requiredNote
                ?.replace(
                    /CU 행사상품의 세부 거래 유형을 현재 브랜드로 구분할 수 없어 자동 계산에서 제외됩니다\.\s*/g,
                    '',
                )
                .trim();
            regularCuRule.condition.requiredNote = appendRequiredNote(
                regularCuRule.condition.requiredNote,
                '국군의날·현충일에는 일반 10%가 아니라 특별 30% 할인만 적용됩니다.',
            );
        }
        const specialCuRule = extraction.rules.find(rule => (
            rule.id === 'hana_nara_cu_event_special'
        ));
        if (specialCuRule) {
            specialCuRule.includedBrands = [];
            specialCuRule.action.value = 0;
            specialCuRule.condition.manualCheckRequired = true;
            specialCuRule.condition.requiredNote = appendRequiredNote(
                specialCuRule.condition.requiredNote,
                '반복되는 특정 기념일 조건을 현재 계산기가 자동 판별하지 못해 정보로만 표시합니다.',
            );
        }
        const resortRule = extraction.rules.find(rule => (
            rule.id === 'hana_nara_military_resort'
        ));
        if (resortRule) {
            resortRule.condition.manualCheckRequired = true;
            resortRule.condition.requiredNote =
                '국군복지단 직영 호텔·콘도 숙박 이용인지, 호텔·콘도 내 F&B 또는 입점 점포 이용이 아닌지 확인해야 합니다.';
        }
    }

    if (extraction.card.id === 'shinhan_heyoung') {
        const easyPayRule = extraction.rules.find(rule => rule.id === 'hy_easy_pay');
        if (easyPayRule) {
            const domesticLifeRuleIds = new Set([
                'hy_transport',
                'hy_telecom',
                'hy_cgv',
                'hy_conv',
                'hy_cafe',
                'hy_food',
                'hy_delivery',
                'hy_life',
                'hy_life_daiso_offline',
                'hy_subscription',
                'hy_online_shopping',
            ]);
            easyPayRule.excludedBrands = unique([
                ...(easyPayRule.excludedBrands ?? []),
                ...extraction.rules.filter(rule => domesticLifeRuleIds.has(rule.id))
                    .flatMap(rule => rule.includedBrands ?? []),
                'overseas_payment',
                'overseas_atm',
            ]);
        }
        extraction.rules.forEach(ruleRow => {
            if (!ruleRow.id.startsWith('shinhan_heyoung_') ||
                (ruleRow.includedBrands ?? []).length > 0) return;
            if (ruleRow.action.value > 0) ruleRow.action.value = 0;
            if (ruleRow.action.type === 'FIXED_PRICE') {
                ruleRow.action = { type: 'FLAT', value: 0 };
            }
            ruleRow.condition.manualCheckRequired = true;
            ruleRow.condition.requiredNote = appendRequiredNote(
                ruleRow.condition.requiredNote,
                '제휴 서비스 전용 가맹점을 현재 브랜드로 구분할 수 없어 자동 계산에서 제외됩니다.',
            );
        });
    }

    if (extraction.card.id === 'hana_travelog_student') {
        const domesticRule = extraction.rules.find(rule => rule.id === 'hana_travelog_domestic');
        if (domesticRule) {
            domesticRule.excludedBrands = unique([
                ...(domesticRule.excludedBrands ?? []),
                'overseas_payment',
                'overseas_atm',
                'overseas_transport',
                'master_travel_rewards',
                'japan_convenience',
                'vietnam_lottemart',
                'vietnam_grab',
                'usa_starbucks',
            ]);
        }
    }

    // Solo-limit evidence is processed late above. Re-apply the safety rule so
    // informational (0-value) rows cannot accidentally regain monetary caps.
    extraction.rules.forEach(ruleRow => {
        if (ruleRow.action.value !== 0 || ruleRow.condition.itemSpecific === true) return;
        const removedLimits: string[] = [];
        if (typeof ruleRow.limitConfig.dailyAmount === 'number') {
            removedLimits.push(`일 ${ruleRow.limitConfig.dailyAmount.toLocaleString()}원`);
            delete ruleRow.limitConfig.dailyAmount;
        }
        if (typeof ruleRow.limitConfig.monthlyAmount === 'number') {
            removedLimits.push(`월 ${ruleRow.limitConfig.monthlyAmount.toLocaleString()}원`);
            delete ruleRow.limitConfig.monthlyAmount;
        }
        if (removedLimits.length === 0) return;
        ruleRow.condition.requiredNote = appendRequiredNote(
            ruleRow.condition.requiredNote,
            `${removedLimits.join('·')} 한도는 정보로만 표시하고 자동 계산 한도로 사용하지 않습니다.`,
        );
    });

    return extraction;
};

const inventoryEvidenceFields = (
    section: CardBenefitInventory['sections'][number],
): CardBenefitEvidence['fields'] => {
    const fields: CardBenefitEvidence['fields'] = [];
    if (section.kind === 'BENEFIT' || section.kind === 'PROMOTION') {
        fields.push('description', 'action');
    } else if (section.kind === 'LIMIT') {
        fields.push('limitConfig');
    } else if (section.kind === 'CONDITION' || section.kind === 'EXCLUSION') {
        fields.push('condition');
    } else {
        fields.push('description');
    }
    const text = `${section.title}\n${section.summary}\n${section.quote}`;
    if ((section.kind === 'LIMIT' || section.kind === 'CONDITION') &&
        /\d+(?:\.[0-9]+)?\s*%/.test(text)) {
        fields.push('description', 'action');
    }
    if ((/\(\s*\d{1,2}\s*\.\s*\d{1,2}\s*~\s*\d{1,2}\s*\.\s*\d{1,2}\s*\)/.test(text) ||
        /20\d{2}년\s*\d{1,2}월\s*\d{1,2}일\s*~\s*\d{1,2}월\s*\d{1,2}일/.test(text)) &&
        !fields.includes('condition')) {
        fields.push('condition');
    }
    if (/(?:결제|이용)\s*금액.{0,160}(?:미만|이하|이상|초과)/i.test(normalizeText(text)) &&
        !fields.includes('condition')) {
        fields.push('condition');
    }
    if (/(?:지난달|전월)[^\n]{0,80}실적[^\n]{0,80}\d/i.test(normalizeText(text)) &&
        !fields.includes('condition')) {
        fields.push('condition');
    }
    if (/한도|월\s*\d|일\s*\d|연\s*\d|회\s*(?:제공|이용|할인)/i.test(text) &&
        !fields.includes('limitConfig')) {
        fields.push('limitConfig');
    }
    return fields;
};

const buildInventoryEvidence = (
    inventory: CardBenefitInventory,
    coverage: CardBenefitOpenAIExtraction['coverage'],
): CardBenefitEvidence[] => {
    const sectionById = new Map(inventory.sections.map(section => [section.id, section]));
    return coverage.flatMap(item => {
        const section = sectionById.get(item.sectionId);
        if (!section) return [];
        return [{
            id: `inventory-${section.id}`,
            ruleIds: unique(item.ruleIds),
            fields: inventoryEvidenceFields(section),
            quote: section.quote,
            sourceUrl: section.sourceUrl,
            location: section.title,
            ...(section.page !== null && { page: section.page }),
        }];
    });
};

const validateInventory = (
    inventory: CardBenefitInventory,
    input: CardBenefitExtractionInput,
) => {
    const errors: string[] = [];
    const sources = new Map(extractionSources(input).map(source => [source.sourceUrl, source]));
    const ids = new Set<string>();
    inventory.sections.forEach((section, index) => {
        const label = `혜택 인벤토리 ${index + 1}`;
        if (ids.has(section.id)) errors.push(`${label} ID ${section.id}가 중복되었습니다.`);
        ids.add(section.id);
        const source = sources.get(section.sourceUrl);
        if (!source) {
            errors.push(`${label}이 수집되지 않은 공식 원문을 참조합니다.`);
            return;
        }
        if (!sourceContainsQuote(source.sourceText, section.quote)) {
            errors.push(`${label} 근거 문장이 공식 원문에서 확인되지 않습니다.`);
        }
        if (source.mediaType === 'application/pdf') {
            if (section.page === null || section.page < 1) {
                errors.push(`${label}에 PDF 페이지 번호가 없습니다.`);
            } else {
                const pageText = source.pageTexts?.[section.page - 1];
                if (!pageText || !sourceContainsQuote(pageText, section.quote)) {
                    errors.push(`${label} 근거 문장이 지정한 PDF 페이지에서 확인되지 않습니다.`);
                }
            }
        }
    });
    const sectionById = new Map(inventory.sections.map(section => [section.id, section]));
    inventory.sections.forEach(section => {
        if ((section.kind === 'BENEFIT' || section.kind === 'PROMOTION') &&
            section.appliesToSectionIds.length > 0) {
            errors.push(`혜택 본문 ${section.title}은 appliesToSectionIds를 가질 수 없습니다.`);
        }
        section.appliesToSectionIds.forEach(sectionId => {
            const target = sectionById.get(sectionId);
            if (!target) {
                errors.push(`혜택 인벤토리 ${section.title}이 없는 섹션 ${sectionId}를 참조합니다.`);
                return;
            }
            if (target.kind !== 'BENEFIT' && target.kind !== 'PROMOTION') {
                errors.push(`혜택 인벤토리 ${section.title}의 적용 대상 ${sectionId}가 혜택 섹션이 아닙니다.`);
            }
        });
        const text = `${section.title}\n${section.summary}\n${section.quote}`;
        if (/통합[^\n]{0,50}(?:적용\s*대상|대상\s*서비스)/i.test(text)) {
            const normalizedQuote = normalizedSource(section.quote);
            section.appliesToSectionIds.forEach(sectionId => {
                const target = sectionById.get(sectionId);
                const tokens = target ? semanticTitleTokens(target.title) : [];
                if (tokens.length > 0 && !tokens.some(token => normalizedQuote.includes(token))) {
                    errors.push(`통합한도 공식 목록에 없는 혜택 섹션이 연결됐습니다: ${target?.title ?? sectionId}`);
                }
            });
        }
    });
    const requiredLineSpecs = [
        {
            kind: 'EXCLUSION' as const,
            pattern: /(?:서비스|혜택|실적|할인)[^\n]{0,80}제외|제외\s*대상/i,
            message: '공식 제외 조건',
        },
        {
            kind: 'CONDITION' as const,
            pattern: /(?:최초|신규)[^\n]{0,100}(?:카드|사용|발급|등록)[^\n]{0,120}(?:실적|서비스|혜택)/i,
            message: '신규·최초 이용 조건',
        },
    ];
    requiredLineSpecs.forEach(spec => {
        const quotes = inventory.sections
            .filter(section => section.kind === spec.kind)
            .map(section => normalizedSource(section.quote));
        extractionSources(input).forEach(source => {
            unique(source.sourceText.split(/\r?\n/)
                .map(normalizeText)
                .filter(line => line.length >= 15 && line.length <= 1_000 &&
                    !/장기\s*무실적[^\n]{0,40}한도\s*하향[^\n]{0,40}제외\s*신청/i.test(line) &&
                    !(spec.message === '신규·최초 이용 조건' &&
                        /연회비\s*반환|반환\s*금액|발행[·\s]*배송/i.test(line)) &&
                    spec.pattern.test(line)))
                .forEach(line => {
                    const normalizedLine = normalizedSource(line);
                    const probe = normalizedLine.slice(0, Math.min(120, normalizedLine.length));
                    if (probe.length >= 20 && !quotes.some(quote => quote.includes(probe))) {
                        errors.push(`${spec.message}이 혜택 인벤토리에서 누락됐습니다: ${line.slice(0, 120)}`);
                    }
                });
        });
    });
    benefitClaimChecklistFrom(input).forEach(claim => {
        const represented = quoteSetRepresentsBenefitClaim(
            inventory.sections
                .filter(section => section.sourceUrl === claim.sourceUrl)
                .map(section => section.quote),
            claim.quote,
        );
        if (!represented) {
            errors.push(
                `공식 혜택 문장이 인벤토리에서 누락됐습니다` +
                `${claim.page ? ` (PDF ${claim.page}쪽)` : ''}: ${claim.quote.slice(0, 160)}`
            );
        }
    });
    inventory.sections.filter(section => section.kind === 'LIMIT').forEach(section => {
        const moneyValues = section.quote.match(new RegExp(moneyTokenSource, 'gi')) ?? [];
        if (moneyValues.length >= 4 &&
            !/(?:건당|일[^\n]{0,16}한도|월(?:간)?[^\n]{0,20}한도|연[^\n]{0,16}한도|\d+\s*회|(?:전월|지난달)\s*이용금액|통합\s*(?:캐시백|할인)?\s*한도)/i
                .test(section.quote)) {
            errors.push(`복수 한도 표의 열 제목이 근거 문장에 없습니다: ${section.title}`);
        }
    });
    return errors;
};

const validateInventoryCoverage = (
    inventory: CardBenefitInventory,
    result: CardBenefitOpenAIExtraction,
) => {
    const errors: string[] = [];
    const sections = new Map(inventory.sections.map(section => [section.id, section]));
    const rules = new Set(result.extraction.rules.map(ruleRow => ruleRow.id));
    const coverageBySection = new Map<string, string[]>();
    result.coverage.forEach(item => {
        if (!sections.has(item.sectionId)) {
            errors.push(`알 수 없는 혜택 인벤토리 ${item.sectionId}를 구조화 coverage가 참조합니다.`);
            return;
        }
        if (coverageBySection.has(item.sectionId)) {
            errors.push(`혜택 인벤토리 ${item.sectionId}의 coverage가 중복되었습니다.`);
        }
        coverageBySection.set(item.sectionId, item.ruleIds);
        item.ruleIds.forEach(ruleId => {
            if (!rules.has(ruleId)) {
                errors.push(`혜택 인벤토리 ${item.sectionId}가 없는 규칙 ${ruleId}를 참조합니다.`);
            }
        });
    });
    inventory.sections.forEach(section => {
        const ruleIds = coverageBySection.get(section.id);
        if (!ruleIds) {
            errors.push(`공식 혜택 섹션 ${section.title}(${section.id})이 구조화 결과에서 누락되었습니다.`);
            return;
        }
        if (section.appliesToSectionIds.length > 0) {
            const expectedRuleIds = unique(section.appliesToSectionIds.flatMap(sectionId => (
                coverageBySection.get(sectionId) ?? []
            ))).sort();
            const actualRuleIds = unique(ruleIds).sort();
            const missingRuleIds = expectedRuleIds.filter(ruleId => !actualRuleIds.includes(ruleId));
            const extraRuleIds = actualRuleIds.filter(ruleId => !expectedRuleIds.includes(ruleId));
            const tableCanGroundDerivedRules = section.kind === 'LIMIT' &&
                inventoryEvidenceFields(section).includes('action');
            const textualSecondPassCanCorrectTargets =
                (section.kind === 'CONDITION' || section.kind === 'EXCLUSION') &&
                actualRuleIds.some(ruleId => expectedRuleIds.includes(ruleId));
            if (!textualSecondPassCanCorrectTargets &&
                (missingRuleIds.length > 0 ||
                    (extraRuleIds.length > 0 && !tableCanGroundDerivedRules))) {
                errors.push(
                    `혜택 인벤토리 ${section.title}의 적용 규칙이 대상 혜택 섹션과 일치하지 않습니다. ` +
                    `기대: ${expectedRuleIds.join(', ') || '없음'} / 실제: ${actualRuleIds.join(', ') || '없음'}`
                );
            }
        }
    });
    return errors;
};

const sameRuleStringSet = (left: string[], right: string[]) => (
    JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
);

const belongsToSameBenefitFamily = (
    left: CardBenefitOpenAIExtraction['extraction']['rules'][number],
    right: CardBenefitOpenAIExtraction['extraction']['rules'][number],
) => {
    const boundariesAreComplementary = (
        typeof left.condition.minSpend === 'number' &&
        left.condition.minSpend === right.condition.maxSpendExclusive
    ) || (
        typeof right.condition.minSpend === 'number' &&
        right.condition.minSpend === left.condition.maxSpendExclusive
    );
    return boundariesAreComplementary &&
        left.category === right.category &&
        left.platformType === right.platformType &&
        left.action.type === right.action.type &&
        left.includedBrands.length > 0 &&
        sameRuleStringSet(left.includedBrands, right.includedBrands) &&
        sameRuleStringSet(left.excludedBrands, right.excludedBrands);
};

export const completeDerivedRuleCoverage = (
    inventory: CardBenefitInventory,
    coverage: CardBenefitOpenAIExtraction['coverage'],
    rules: CardBenefitOpenAIExtraction['extraction']['rules'],
): CardBenefitOpenAIExtraction['coverage'] => {
    const ruleById = new Map(rules.map(ruleRow => [ruleRow.id, ruleRow]));
    const coveredRuleIds = new Set(coverage.flatMap(item => item.ruleIds));
    const benefitSectionIds = new Set(inventory.sections.filter(section => (
        section.kind === 'BENEFIT' || section.kind === 'PROMOTION'
    )).map(section => section.id));
    const repairedBenefitCoverage = coverage.map(item => ({
        ...item,
        ruleIds: unique(item.ruleIds),
    }));

    rules.filter(ruleRow => !coveredRuleIds.has(ruleRow.id)).forEach(orphanRule => {
        const matchingBenefitItems = repairedBenefitCoverage.filter(item => (
            benefitSectionIds.has(item.sectionId) &&
            item.ruleIds.some(ruleId => {
                const coveredRule = ruleById.get(ruleId);
                return coveredRule && belongsToSameBenefitFamily(orphanRule, coveredRule);
            })
        ));
        if (matchingBenefitItems.length !== 1) return;
        matchingBenefitItems[0].ruleIds = unique([
            ...matchingBenefitItems[0].ruleIds,
            orphanRule.id,
        ]);
        coveredRuleIds.add(orphanRule.id);
    });

    const coverageBySection = new Map(
        repairedBenefitCoverage.map(item => [item.sectionId, item.ruleIds])
    );
    return repairedBenefitCoverage.map(item => {
        const section = inventory.sections.find(candidate => candidate.id === item.sectionId);
        if (!section || section.appliesToSectionIds.length === 0) return item;
        const expectedRuleIds = unique(section.appliesToSectionIds.flatMap(sectionId => (
            coverageBySection.get(sectionId) ?? []
        )));
        const actualRuleIds = unique(item.ruleIds);
        if (actualRuleIds.length === 0 ||
            !actualRuleIds.every(ruleId => expectedRuleIds.includes(ruleId))) {
            return item;
        }
        return { ...item, ruleIds: expectedRuleIds };
    });
};

const sameStringSet = (left: string[], right: string[]) => (
    JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
);

export const stabilizeExtractionRuleIds = (
    extraction: CardBenefitOpenAIExtraction['extraction'],
    coverage: CardBenefitOpenAIExtraction['coverage'],
    baselineRules: BenefitRule[],
) => {
    const baselineIds = new Set(baselineRules.map(ruleRow => ruleRow.id));
    const candidateIds = new Set(extraction.rules.map(ruleRow => ruleRow.id));
    const semanticRuleTokens = (ruleId: string) => ruleId.toLocaleLowerCase('en-US')
        .split(/[_-]+/)
        .filter(token => token && ![
            'rule', 'benefit', extraction.card.id, ...extraction.card.id.split(/[_-]+/),
        ].includes(token));
    const repairCandidateId = (ruleId: string) => {
        if (candidateIds.has(ruleId)) return ruleId;
        const tokens = semanticRuleTokens(ruleId);
        if (tokens.length === 0) return ruleId;
        const isSuffix = (shorter: string[], longer: string[]) => (
            shorter.length <= longer.length &&
            shorter.every((token, index) => (
                token === longer[longer.length - shorter.length + index]
            ))
        );
        const suffixMatches = extraction.rules.filter(ruleRow => {
            const candidateTokens = semanticRuleTokens(ruleRow.id);
            return isSuffix(tokens, candidateTokens) || isSuffix(candidateTokens, tokens);
        });
        if (suffixMatches.length === 1) return suffixMatches[0].id;
        const matches = extraction.rules.filter(ruleRow => {
            const candidateTokens = semanticRuleTokens(ruleRow.id);
            return tokens.every(token => candidateTokens.includes(token));
        });
        return matches.length === 1 ? matches[0].id : ruleId;
    };
    const repairedCoverage = coverage.map(item => ({
        ...item,
        ruleIds: unique(item.ruleIds.map(repairCandidateId)),
    }));
    const availableNewRules = extraction.rules.filter(ruleRow => !baselineIds.has(ruleRow.id));
    const assignedCandidateIds = new Set<string>();
    const idMapping = new Map<string, string>();

    baselineRules.filter(ruleRow => !candidateIds.has(ruleRow.id)).forEach(baselineRule => {
        const compatibleRules = availableNewRules.filter(candidateRule => (
            !assignedCandidateIds.has(candidateRule.id) &&
            (candidateRule.category ?? undefined) === baselineRule.category &&
            candidateRule.platformType === (baselineRule.platformType ?? 'ALL') &&
            candidateRule.action.type === baselineRule.action.type &&
            sameStringSet(candidateRule.includedBrands, baselineRule.includedBrands ?? []) &&
            sameStringSet(candidateRule.excludedBrands, baselineRule.excludedBrands ?? [])
        ));
        if (compatibleRules.length === 0) return;
        const exactValueRules = compatibleRules.filter(candidateRule => (
            candidateRule.action.value === baselineRule.action.value
        ));
        const baselineDescriptionTokens = semanticTitleTokens(baselineRule.description);
        const semanticMatches = exactValueRules.map(candidateRule => ({
            rule: candidateRule,
            score: semanticTitleTokens(candidateRule.description)
                .filter(token => baselineDescriptionTokens.includes(token)).length,
        })).filter(item => item.score > 0)
            .sort((left, right) => right.score - left.score);
        const semanticSelected = semanticMatches.length > 0 && (
            semanticMatches.length === 1 || semanticMatches[0].score > semanticMatches[1].score
        ) ? semanticMatches[0].rule : undefined;
        const selected = exactValueRules.length === 1
            ? exactValueRules[0]
            : semanticSelected ?? (compatibleRules.length === 1
                ? compatibleRules[0]
                : undefined);
        if (!selected) return;
        idMapping.set(selected.id, baselineRule.id);
        assignedCandidateIds.add(selected.id);
    });

    if (idMapping.size === 0) return { extraction, coverage: repairedCoverage };
    const stableId = (ruleId: string) => idMapping.get(ruleId) ?? ruleId;
    return {
        extraction: {
            ...extraction,
            rules: extraction.rules.map(ruleRow => ({
                ...ruleRow,
                id: stableId(ruleRow.id),
                condition: {
                    ...ruleRow.condition,
                    stackableWithRuleIds: ruleRow.condition.stackableWithRuleIds?.map(stableId) ?? null,
                },
            })),
        },
        coverage: repairedCoverage.map(item => ({
            ...item,
            ruleIds: unique(item.ruleIds.map(stableId)),
        })),
    };
};

const validateInventoryLimitSemantics = (
    inventory: CardBenefitInventory,
    result: CardBenefitOpenAIExtraction,
) => {
    const errors: string[] = [];
    const rules = new Map(result.extraction.rules.map(ruleRow => [ruleRow.id, ruleRow]));
    const coverage = new Map(result.coverage.map(item => [item.sectionId, item.ruleIds]));
    inventory.sections.forEach(section => {
        const text = normalizeText(`${section.title}\n${section.summary}\n${section.quote}`);
        const mappedRules = (coverage.get(section.id) ?? [])
            .map(ruleId => rules.get(ruleId))
            .filter((ruleRow): ruleRow is CardBenefitOpenAIExtraction['extraction']['rules'][number] => (
                Boolean(ruleRow)
            ));
        if (mappedRules.length === 0) return;
        const hasDailyAmountHeading = /일\s*(?:할인|혜택)?\s*한도/i.test(text);
        if (hasDailyAmountHeading && !mappedRules.some(ruleRow => (
            ruleRow.limitConfig.dailyAmount !== null
        ))) {
            errors.push(`일 금액 한도가 dailyAmount로 구조화되지 않았습니다: ${section.title}`);
        }
        const directDailyAmounts = [...text.matchAll(new RegExp(
            `(?:^|\\s)일\\s*(?:할인\\s*)?(?:혜택\\s*)?(?:한도\\s*[:：]?\\s*)?(${moneyTokenSource})`,
            'gi',
        ))].map(match => parseKoreanMoney(match[1])).filter((value): value is number => (
            value !== undefined
        ));
        directDailyAmounts.forEach(amount => {
            if (!mappedRules.some(ruleRow => ruleRow.limitConfig.dailyAmount === amount)) {
                errors.push(`공식 일 한도 ${amount.toLocaleString()}원이 dailyAmount에 없습니다: ${section.title}`);
            }
        });
        if (/일\s*(?:할인|혜택)?\s*한도/i.test(text) &&
            /월\s*(?:할인|혜택)?\s*한도/i.test(text)) {
            const rateRows = [...text.matchAll(new RegExp(
                `\\d+(?:\\.[0-9]+)?\\s*%\\s*(${moneyTokenSource})\\s*(${moneyTokenSource})`,
                'gi',
            ))];
            rateRows.forEach(row => {
                const dailyAmount = parseKoreanMoney(row[1]);
                const monthlyAmount = parseKoreanMoney(row[2]);
                if (dailyAmount !== undefined && !mappedRules.some(ruleRow => (
                    ruleRow.limitConfig.dailyAmount === dailyAmount
                ))) {
                    errors.push(`표의 일 한도 ${dailyAmount.toLocaleString()}원이 누락됐습니다: ${section.title}`);
                }
                if (monthlyAmount !== undefined && !mappedRules.some(ruleRow => (
                    ruleRow.limitConfig.monthlyAmount === monthlyAmount
                ))) {
                    errors.push(`표의 월 한도 ${monthlyAmount.toLocaleString()}원이 누락됐습니다: ${section.title}`);
                }
            });
        }
    });
    return unique(errors);
};

const validateInventoryMappingSemantics = (
    inventory: CardBenefitInventory,
    result: CardBenefitOpenAIExtraction,
    catalogBrands: NonNullable<CardBenefitExtractionInput['catalog']>['brands'],
) => {
    const errors: string[] = [];
    const channelTextByRule = inventoryTextByRule(inventory, result.coverage, section => (
        section.kind !== 'EXCLUSION'
    ));
    const brandTextByRule = inventoryTextByRule(
        inventory,
        result.coverage.filter(item => item.ruleIds.length === 1),
        section => (
            section.kind === 'BENEFIT' ||
            section.kind === 'PROMOTION' ||
            section.id.startsWith('fallback_transaction_target_')
        ),
    );
    result.extraction.rules.forEach(ruleRow => {
        const channelText = channelTextByRule.get(ruleRow.id) ?? '';
        const brandText = brandTextByRule.get(ruleRow.id) ?? '';
        const hasInPersonDiscount = /현장\s*할인/i.test(channelText);
        const hasOnlineChannel = /(?:온라인|모바일\s*(?:앱|웹)|앱\s*\/\s*웹|웹\s*\/\s*앱|홈페이지)/i
            .test(channelText);
        if (hasInPersonDiscount && !hasOnlineChannel && ruleRow.platformType !== 'OFFLINE') {
            errors.push(`현장할인 혜택이 오프라인 전용으로 구조화되지 않았습니다: ${ruleRow.description}`);
        }
        explicitCatalogBrands(brandText, ruleRow.category, catalogBrands).forEach(brand => {
            if (!ruleRow.includedBrands.includes(brand.id)) {
                errors.push(`공식 거래 대상 브랜드가 규칙에서 누락됐습니다: ${ruleRow.description} · ${brand.name}`);
            }
        });
    });
    return errors;
};

const enrichExtractionDetails = (
    extraction: CardBenefitOpenAIExtraction['extraction'],
    inventory: CardBenefitInventory,
    coverage: CardBenefitOpenAIExtraction['coverage'],
) => {
    const ruleIdsBySection = new Map(coverage.map(item => [item.sectionId, item.ruleIds]));
    const integratedScopeSections = inventory.sections.filter(section => (
        isIntegratedLimitScopeText(`${section.title}\n${section.summary}\n${section.quote}`)
    ));
    const integratedScopeRuleIds = new Set(integratedScopeSections.flatMap(section => (
        ruleIdsBySection.get(section.id) ?? []
    )));
    const exclusionSummariesByRule = new Map<string, string[]>();
    const sourceTextByRule = new Map<string, string[]>();
    inventory.sections.forEach(section => {
        (ruleIdsBySection.get(section.id) ?? []).forEach(ruleId => {
            const sourceTexts = sourceTextByRule.get(ruleId) ?? [];
            sourceTexts.push(`${section.title}\n${section.summary}\n${section.quote}`);
            sourceTextByRule.set(ruleId, sourceTexts);
        });
    });
    inventory.sections.filter(section => section.kind === 'EXCLUSION').forEach(section => {
        (ruleIdsBySection.get(section.id) ?? []).forEach(ruleId => {
            const summaries = exclusionSummariesByRule.get(ruleId) ?? [];
            summaries.push(section.summary);
            exclusionSummariesByRule.set(ruleId, summaries);
        });
    });
    const tableLimitsByRule = new Map<string, Partial<LimitConfig>>();
    inventory.sections.filter(section => section.kind === 'LIMIT').forEach(section => {
        const text = normalizeText(`${section.title}\n${section.summary}\n${section.quote}`);
        const hasDailyAmountHeading = /일\s*(?:할인|혜택)?\s*한도/i.test(text);
        const hasMonthlyAmountHeading = /월\s*(?:할인|혜택)?\s*한도/i.test(text);
        if (!hasDailyAmountHeading && !hasMonthlyAmountHeading) return;
        const mappedRuleIds = ruleIdsBySection.get(section.id) ?? [];
        const rows = [...text.matchAll(new RegExp(
            `(\\d+(?:\\.[0-9]+)?)\\s*%\\s*(${moneyTokenSource})\\s*(${moneyTokenSource})`,
            'gi',
        ))];
        rows.forEach(row => {
            const rate = Number(row[1]);
            const matchingRules = extraction.rules.filter(ruleRow => (
                mappedRuleIds.includes(ruleRow.id) &&
                ruleRow.action.type === 'PERCENT' &&
                ruleRow.action.value === rate
            ));
            if (matchingRules.length !== 1) return;
            const dailyAmount = parseKoreanMoney(row[2]);
            const monthlyAmount = parseKoreanMoney(row[3]);
            const derived: Partial<LimitConfig> = {};
            if (hasDailyAmountHeading && dailyAmount !== undefined) {
                derived.dailyAmount = dailyAmount;
            }
            if (hasMonthlyAmountHeading && monthlyAmount !== undefined) {
                derived.monthlyAmount = monthlyAmount;
            }
            tableLimitsByRule.set(matchingRules[0].id, derived);
        });
    });
    const directLimitsByRule = new Map<string, Partial<LimitConfig>>();
    extraction.rules.forEach(ruleRow => {
        const soloLimitText = inventory.sections.filter(section => {
            if (section.kind !== 'LIMIT') return false;
            const mappedRuleIds = ruleIdsBySection.get(section.id) ?? [];
            return mappedRuleIds.length === 1 && mappedRuleIds[0] === ruleRow.id;
        }).map(section => `${section.title}\n${section.summary}\n${section.quote}`).join('\n');
        const derived: Partial<LimitConfig> = {};
        const dailyAmountMatch = soloLimitText.match(new RegExp(
            `(?:일|하루)\\s*(?:\\d+\\s*회\\s*)?(?:최대|한도)\\s*(${moneyTokenSource})`,
            'i',
        ));
        const monthlyAmountMatch = soloLimitText.match(new RegExp(
            `(?:월|매월)\\s*(?:\\d+\\s*회\\s*)?(?:최대|한도)\\s*(${moneyTokenSource})`,
            'i',
        ));
        const dailyAmount = dailyAmountMatch ? parseKoreanMoney(dailyAmountMatch[1]) : undefined;
        const monthlyAmount = monthlyAmountMatch ? parseKoreanMoney(monthlyAmountMatch[1]) : undefined;
        if (dailyAmount !== undefined) derived.dailyAmount = dailyAmount;
        if (monthlyAmount !== undefined) {
            derived.monthlyAmount = monthlyAmount;
        }

        if (typeof ruleRow.condition.maxSpend === 'number') {
            inventory.sections.filter(section => section.kind === 'LIMIT').forEach(section => {
                const mappedRuleIds = ruleIdsBySection.get(section.id) ?? [];
                if (!mappedRuleIds.includes(ruleRow.id) || mappedRuleIds.length < 2) return;
                const tierMatch = normalizeText(section.quote).match(new RegExp(
                    `건당\\s*(${moneyTokenSource})\\s*이하[\\s\\S]{0,100}?` +
                    `(?:일|하루)\\s*\\d+\\s*회\\s*(?:최대|한도)\\s*(${moneyTokenSource})`,
                    'i',
                ));
                if (!tierMatch || parseKoreanMoney(tierMatch[1]) !== ruleRow.condition.maxSpend) {
                    return;
                }
                const tierDailyAmount = parseKoreanMoney(tierMatch[2]);
                if (tierDailyAmount !== undefined) derived.dailyAmount = tierDailyAmount;
            });
        }
        if (Object.keys(derived).length > 0) directLimitsByRule.set(ruleRow.id, derived);
    });
    return {
        ...extraction,
        rules: extraction.rules.map(ruleRow => {
            const summaries = unique(exclusionSummariesByRule.get(ruleRow.id) ?? [])
                .filter(summary => !normalizedSource(ruleRow.detail).includes(
                    normalizedSource(summary).slice(0, 40)
                ));
            const normalizedRule = integratedScopeSections.length > 0
                ? {
                    ...ruleRow,
                    usesCardLimit: integratedScopeRuleIds.has(ruleRow.id),
                }
                : ruleRow;
            const ruleSourceText = (sourceTextByRule.get(ruleRow.id) ?? []).join('\n');
            const action = normalizedRule.action.maxDiscount !== null &&
                normalizedRule.action.maxDiscount !== undefined &&
                !new RegExp(
                    `(?:결제\\s*)?(?:건당|1\\s*회\\s*당)\\s*(?:최대|한도)\\s*${moneyTokenSource}`,
                    'i',
                ).test(ruleSourceText)
                ? { ...normalizedRule.action, maxDiscount: null }
                : normalizedRule.action;
            const groundedRule = action === normalizedRule.action
                ? normalizedRule
                : { ...normalizedRule, action };
            const tableLimits = tableLimitsByRule.get(ruleRow.id);
            const limitConfig = {
                ...groundedRule.limitConfig,
                ...(tableLimits ?? {}),
                ...(directLimitsByRule.get(ruleRow.id) ?? {}),
            };
            if (limitConfig.dailyCount !== null && limitConfig.dailyCount !== undefined &&
                !/(?:일|하루)[^\n]{0,20}\d+\s*회/i.test(ruleSourceText)) {
                limitConfig.dailyCount = null;
            }
            if (limitConfig.monthlyCount !== null && limitConfig.monthlyCount !== undefined &&
                !/(?:월|매월)[^\n]{0,20}\d+\s*회/i.test(ruleSourceText)) {
                limitConfig.monthlyCount = null;
            }
            if (limitConfig.yearlyCount !== null && limitConfig.yearlyCount !== undefined &&
                !/(?:연|연간)[^\n]{0,20}\d+\s*회/i.test(ruleSourceText)) {
                limitConfig.yearlyCount = null;
            }
            const groundedRuleWithLimits = {
                ...groundedRule,
                limitConfig,
            };
            if (summaries.length === 0) return groundedRuleWithLimits;
            return {
                ...groundedRuleWithLimits,
                detail: [groundedRuleWithLimits.detail, ...summaries.map(summary => `제외·유의: ${summary}`)]
                    .filter(Boolean)
                    .join(' '),
            };
        }),
    };
};

export class OpenAICardBenefitExtractionProvider implements CardBenefitExtractionProvider {
    readonly id = 'openai';
    readonly model: string;
    readonly cacheKey: string;
    private readonly client: OpenAIStructuredResponseClient;

    constructor(options: { apiKey: string; model?: string }) {
        this.client = new OpenAIStructuredResponseClient({
            apiKey: options.apiKey,
            model: options.model,
            timeoutMs: 180_000,
        });
        this.model = this.client.model;
        this.cacheKey = `${this.id}:${this.model}:inventory-v32`;
    }

    async extract(input: CardBenefitExtractionInput): Promise<CardBenefitExtractionResult> {
        const promptSources = promptSourcesFrom(input);
        const currentKoreaDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date());
        const inventoryResult = await this.client.parse({
            schema: cardBenefitOpenAIInventorySchema,
            schemaName: 'card_benefit_inventory',
            instructions: [
                '당신은 한국 카드 상품 공식 문서의 혜택 목차를 전수 조사합니다.',
                '상품 페이지, 이용가이드, 공지에 명시된 상시 혜택과 현재 유효한 기간형 혜택을 빠짐없이 각각 하나의 section으로 기록하세요.',
                '할인·적립뿐 아니라 실적 조건, 통합·건별·일·월·연 한도, 제외 조건, 이용 채널, 특정 상품 조건도 별도 section으로 기록하세요.',
                '각 혜택 설명 바로 뒤에 붙은 입점점포·상품권·간편결제·특정 채널 제외 문장도 EXCLUSION section으로 빠짐없이 분리하세요. 같은 문장이 여러 혜택에 반복되어도 적용 대상을 모두 연결해야 합니다.',
                'BENEFIT·PROMOTION section의 appliesToSectionIds는 빈 배열입니다. LIMIT·CONDITION·EXCLUSION section은 그 조건이 실제로 적용되는 BENEFIT·PROMOTION section ID만 appliesToSectionIds에 넣으세요.',
                '같은 조건·제외 문장이 여러 혜택 뒤에 반복되면 하나의 section으로 합칠 수 있지만, 각 등장 위치 바로 앞의 혜택 제목을 확인해 appliesToSectionIds에 정확히 모두 연결하세요. 최종 응답 전에 연결된 section ID의 title이 실제 주변 혜택과 일치하는지 다시 대조하세요.',
                '서비스 그룹 전체에 적용되는 신규카드 실적 유예는 개별 혜택 한도나 통합한도 포함 여부와 관계없이 해당 그룹의 모든 BENEFIT section에 연결하세요.',
                '통합한도 적용 대상처럼 공식 문서가 혜택 목록을 열거하면, 그 목록에 이름이 있는 혜택만 appliesToSectionIds에 넣고 비슷한 섹션이라는 이유로 추가하지 마세요.',
                '표를 LIMIT section으로 기록할 때 quote에는 열 제목과 관련된 모든 행을 함께 넣어 일·월·건별 한도의 의미가 사라지지 않게 하세요.',
                '해외 가맹점·해외 ATM처럼 같은 혜택에서 거래 대상별 행이 나뉜 표는 각 거래 대상을 빠짐없이 CONDITION section으로 보존하고 해당 BENEFIT에 연결하세요.',
                '입력 끝의 필수 검증 문장 목록은 문장 성격에 맞는 BENEFIT·PROMOTION·CONDITION·EXCLUSION section의 quote로 반드시 보존하세요.',
                '국제 브랜드 등급이나 별도 표기 없는 혜택의 공통 이용기간처럼 문서 전체에 적용되는 조건은 CONDITION section으로 만들고, 해당 PDF의 유효한 모든 BENEFIT·PROMOTION section에 연결하세요.',
                '연회비, 발급 대상, 연락처, 일반 법률 고지처럼 실제 혜택이나 그 적용 조건이 아닌 카드 메타데이터는 section에서 제외하세요.',
                '“장기무실적 한도하향 제외신청” 같은 카드사 홈페이지 메뉴·신청 링크는 카드 혜택이 아니므로 section에서 제외하세요.',
                '종료된 프로모션은 notes에만 기록하고 sections에는 넣지 마세요.',
                'sourceUrl은 제공된 URL과 정확히 같아야 하고 quote는 해당 원문에서 연속된 문장을 그대로 복사해야 합니다.',
                'PDF 근거는 1부터 시작하는 page를 넣고 HTML은 page를 null로 두세요.',
                '문서에 없는 사실을 상식으로 보완하거나 추측하지 마세요.',
            ].join('\n'),
            input: [
                `대상 카드 ID: ${input.card.id}`,
                `현재 카드명: ${input.card.name}`,
                `현재 카드사: ${input.card.company}`,
                `현재 한국 날짜: ${currentKoreaDate}`,
                promptSources,
                `필수 검증 문장 목록:\n${JSON.stringify(inventoryChecklistFrom(input))}`,
            ].join('\n'),
            reasoningEffort: resolveOpenAIReasoningEffort(
                process.env.CARD_BENEFIT_AI_REASONING_EFFORT,
                'medium',
            ),
            maxOutputTokens: 20_000,
        });
        const inventory = normalizeInventoryReferences(
            completeInventoryStackingChecklist(
                completeInventoryTransactionTargetChecklist(
                    completeInventoryExclusionChecklist(
                        repairInventoryQuotes(inventoryResult, input),
                        input,
                    ),
                    input,
                ),
                input,
            )
        );
        const catalog = input.catalog ?? { categories: [], brands: [] };
        const baselineRules = input.baselineRules ?? [];
        const structured = await this.client.parse({
            schema: cardBenefitOpenAIExtractionSchema,
            schemaName: 'card_benefit_extraction',
            instructions: [
                '당신은 한국 카드 상품의 공식 원문을 BenefitRule JSON으로 구조화합니다.',
                '원문에 명시된 내용만 사용하고 추측하지 마세요.',
                '응답 extraction 필드: schemaVersion=2, completeness=FULL, card, rules, notes. evidence는 1차 인벤토리와 coverage로 애플리케이션이 생성합니다.',
                'card 객체의 키는 반드시 id, name, company, limitTable, network입니다. issuer 같은 다른 이름을 사용하지 마세요.',
                '결제금액으로 자동 계산할 수 없는 혜택은 action.type=FLAT, action.value=0으로 두고 manualCheckRequired=true로 표시하세요. FIXED_PRICE 0은 가격이 명시된 특정 상품을 무료 제공하며 itemSpecific=true인 경우에만 사용하세요.',
                '보험 보장액·수리비 보상액처럼 결제 할인 한도가 아닌 금액은 limitConfig에 넣지 말고 detail과 requiredNote에 문장으로 보존하세요.',
                '금액으로 환산하기 어려운 한도나 부가 서비스도 생략하지 말고 manualCheckRequired와 requiredNote로 보존하세요.',
                '사용자가 확인하면 금액 계산이 가능한 급여이체·가입·대상 여부 조건은 계산식을 유지하고 manualCheckRequired=true로 표시하세요. 이 규칙은 조건부 혜택으로 계산됩니다.',
                '같은 서비스 그룹의 신규카드 실적 유예는 카드 통합한도 적용 여부와 관계없이 해당 그룹의 모든 minPerformance 규칙에 performanceWaiver로 반영하세요.',
                'A 또는 B처럼 대체 가능한 조건을 AND로 바꾸지 마세요. 예를 들어 급여이체만 필요한 혜택에 다른 서비스의 전월 실적을 minPerformance로 추가하지 말고, 계산 모델로 OR를 표현할 수 없으면 manualCheckRequired와 requiredNote에 원문 조건 전체를 보존하세요.',
                '이번 후보는 카드의 전체 혜택을 교체하므로 공식 페이지의 상시 혜택과 현재 유효한 프로모션을 모두 포함하세요.',
                'Rule 필드는 id, cardId, category, includedBrands, excludedBrands, platformType, sharedGroupId, usesCardLimit, description, detail, condition, action, limitConfig를 사용하세요.',
                'condition에는 minSpend, maxSpend, maxSpendExclusive, minPerformance, startsAt, endsAt, daysOfWeek, timeRanges, requiredCardNetwork, performanceWaiver, confirmationRequired, stackableWithRuleIds, applicationOrder, manualCheckRequired, requiredNote, itemSpecific, eligibleItemSummary를 사용할 수 있습니다. daysOfWeek는 SUN~SAT, timeRanges는 한국시간 HH:mm의 startTime/endTime을 사용하며 자정을 넘길 수 있습니다.',
                'action에는 type, value, maxDiscount, amountBasis를 사용할 수 있습니다.',
                '“N원 미만” 구간은 maxSpendExclusive=N, “N원 이하” 구간은 maxSpend=N으로 표현하고 금액 구간별 규칙이 서로 겹치지 않게 하세요.',
                '동일한 상한을 maxSpend와 maxSpendExclusive에 중복 기록하지 마세요.',
                '“1회 승인금액 N원까지 할인 적용”은 결제액이 N원을 넘으면 혜택 전체가 사라지는 maxSpend가 아닙니다. 함께 적힌 “1회 최대 X원 할인”을 action.maxDiscount=X로 넣고 maxSpend는 null로 두세요.',
                '일 한도·월 한도처럼 기간 누적 금액 한도는 각각 dailyAmount·monthlyAmount입니다. “일 N회”처럼 회수가 명시된 경우에만 dailyCount를 쓰고, 일 한도를 maxDiscount로 옮기지 마세요. 실적 구간에 따라 서비스 월 한도가 달라지면 limitConfig.monthlyAmountByPerformance에 threshold/limit 전체 표를 넣으세요.',
                '통합한도 usesCardLimit=true는 공식 통합한도 적용 대상 목록에 명시된 규칙에만 설정하세요. 목록 밖 혜택은 같은 서비스 묶음에 있어도 false입니다.',
                'sharedGroupId는 여러 규칙이 하나 이상의 동일한 일·월·연 한도를 실제로 공유할 때 사용하고 limitConfig.sharedFields에 실제 공유 필드만 넣으세요. 예를 들어 구분별 일·월 횟수는 각각이지만 서비스 월 할인한도만 공유하면 모든 규칙에 같은 sharedGroupId와 sharedFields=["monthlyAmount"]를 넣습니다. 카드 전체 통합한도는 usesCardLimit와 card.limitTable로 처리하므로 sharedGroupId를 만들지 마세요.',
                '행사품목·특정 세트처럼 매장 전체가 아닌 일부 상품 혜택은 itemSpecific=true와 eligibleItemSummary를 넣고, 대상 상품 금액만 계산되도록 하세요.',
                '공식 문구가 “현장할인”이고 온라인·모바일·홈페이지 적용을 함께 명시하지 않으면 platformType=OFFLINE으로 설정하세요.',
                '오프라인 전용 혜택에 특정 브랜드의 앱 주문 같은 온라인 예외가 있으면 같은 한도를 공유하는 별도 조건부 규칙으로 분리하세요.',
                '기본 혜택의 횟수·한도 소진 뒤 다른 서비스가 대신 적용되는 경우에는 대체 서비스 규칙을 별도로 만들고, 적용 전제는 manualCheckRequired와 requiredNote에 보존하세요.',
                '연결된 인벤토리에 해외 가맹점·해외 ATM 등 허용 브랜드 목록과 정확히 대응하는 거래 대상이 여러 개 있으면 includedBrands에 모두 넣으세요.',
                '각 규칙 detail에는 해당 혜택의 중요한 제외 조건을 짧은 문장으로 보존하세요. 구조화할 수 없는 조건도 삭제하지 말고 문장으로 남기세요.',
                '표에 일반 행과 기념일·특정일 행이 따로 있으면 할인율이나 한도가 달라지는 모든 행을 별도 규칙 또는 명시적인 조건으로 보존하세요.',
                '일반 규칙과 국군의날·현충일 같은 특별일 대체 규칙을 분리하면 두 규칙 모두 manualCheckRequired=true로 두어 사용자가 어느 날짜 조건인지 선택할 수 있게 하세요.',
                '하나의 BENEFIT section에서 일반 행과 특수일 행 등 여러 규칙을 만들었다면 그 section의 coverage.ruleIds에 파생된 규칙을 모두 연결하세요. 할인율이 포함된 LIMIT 표 자체도 계산 근거가 될 수 있습니다.',
                '공식 원문에 해당하는 ID가 없거나 계산 모델로 표현할 수 없는 조건은 추측하지 말고 notes에 기록하세요.',
                '현재 게시 규칙과 같은 혜택은 ID를 유지하고, 새 혜택만 대상 카드 ID를 접두사로 한 안정적인 새 ID를 만드세요.',
                '1차 인벤토리의 모든 section을 coverage에 정확히 한 번 넣고 실제로 표현한 ruleIds와 연결하세요. appliesToSectionIds가 있는 section의 ruleIds는 대상 section들이 연결한 ruleIds의 합집합과 정확히 같아야 합니다.',
                'LIMIT·CONDITION·EXCLUSION section은 독립 규칙을 새로 만들지 말고 해당 조건이 반영된 실제 혜택 규칙과 연결하세요.',
                'BENEFIT·PROMOTION section만 새로운 혜택 규칙의 근거가 될 수 있습니다.',
                '가맹점·사이트 한정 혜택은 반드시 includedBrands로 범위를 제한하세요. category는 그 카테고리의 모든 브랜드에 실제 적용될 때만 단독으로 사용하세요. 선택 가능한 브랜드가 없으면 양수 혜택을 전역 규칙으로 만들지 말고 action.value=0과 manualCheckRequired=true로 보존하세요.',
                '선택 필드가 원문상 적용되지 않으면 false, 0, 빈 문자열을 만들지 말고 null을 사용하세요.',
                'applicationOrder는 원문에 중복 적용 순서가 명시된 경우에만 사용하고, 그 외에는 null로 두세요.',
                'stackableWithRuleIds는 원문에 중복 또는 동시 적용이 명시된 경우에만 사용하세요. 날짜·결제금액 구간별로 서로 대체되는 할인율은 중복 혜택이 아닙니다.',
                'condition이나 limitConfig에 값을 넣었다면 그 값을 뒷받침하는 evidence.fields에 condition 또는 limitConfig를 반드시 포함하세요.',
            ].join('\n'),
            input: [
                `고정 카드 ID: ${input.card.id}`,
                `현재 카드 정보(공식 원문으로 확인 후 필요한 필드만 수정):\n${JSON.stringify(input.card)}`,
                `허용 카테고리 ID와 이름:\n${JSON.stringify(catalog.categories)}`,
                `허용 브랜드 ID와 이름:\n${JSON.stringify(catalog.brands)}`,
                `현재 게시 규칙(ID 안정성과 누락 비교용, 공식 원문보다 우선하지 않음):\n${JSON.stringify(baselineRules)}`,
                `1차 혜택 인벤토리:\n${JSON.stringify(inventory)}`,
                `공식 원문 재확인용:\n${promptSources}`,
            ].join('\n'),
            reasoningEffort: resolveOpenAIReasoningEffort(
                process.env.CARD_BENEFIT_AI_REASONING_EFFORT,
                'medium',
            ),
            maxOutputTokens: 32_000,
        });
        const semanticsNormalized = normalizeInventoryBackedRuleSemantics(
            structured.extraction,
            inventory,
            structured.coverage,
            catalog.brands,
        );
        const stabilized = stabilizeExtractionRuleIds(
            semanticsNormalized,
            structured.coverage,
            baselineRules,
        );
        const normalizedCoverage = completeDerivedRuleCoverage(
            inventory,
            stabilized.coverage,
            stabilized.extraction.rules,
        );
        const normalizedStructured: CardBenefitOpenAIExtraction = {
            ...structured,
            coverage: normalizedCoverage,
            extraction: stabilized.extraction,
        };
        const enrichedExtraction = enrichExtractionDetails(
            stabilized.extraction,
            inventory,
            normalizedCoverage,
        );
        const extraction = normalizeEvidenceBackedCardBenefitExtraction(
            normalizeOpenAIExtraction(
                enrichedExtraction,
                buildInventoryEvidence(inventory, normalizedCoverage),
                input,
            ),
            input,
        );
        const enrichedStructured: CardBenefitOpenAIExtraction = {
            ...normalizedStructured,
            extraction: enrichedExtraction,
        };
        if (!isReviewSafeExtraction(extraction)) {
            throw new Error('OpenAI 카드 혜택 결과를 검수 화면에 안전하게 표시할 수 없습니다.');
        }
        extraction.notes = unique([
            `OpenAI 1차 인벤토리 ${inventory.sections.length}개 섹션을 2차 구조화와 대조했습니다.`,
            ...inventory.notes,
            ...extraction.notes,
        ]);
        return {
            extractor: this.cacheKey,
            model: this.model,
            confidence: Math.min(inventory.confidence, structured.confidence),
            extraction,
            validationErrors: unique([
                ...validateInventory(inventory, input),
                ...validateInventoryCoverage(inventory, normalizedStructured),
                ...validateInventoryLimitSemantics(inventory, enrichedStructured),
                ...validateInventoryMappingSemantics(
                    inventory,
                    enrichedStructured,
                    catalog.brands,
                ),
            ]),
        };
    }
}

export const createCardBenefitExtractionProvider = () => {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    return apiKey ? new OpenAICardBenefitExtractionProvider({
        apiKey,
        model: process.env.CARD_BENEFIT_AI_MODEL || process.env.OPENAI_MODEL,
    }) : undefined;
};
