import type {
    BenefitRule,
    Card,
    CardBenefitEvidence,
    CardBenefitExtraction,
    LimitConfig,
    PlatformType,
    RuleAction,
    RuleCondition,
} from '@/types';

export const CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION = 1 as const;
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

export interface CardBenefitExtractionInput {
    card: Card;
    sourceUrl: string;
    sourceText: string;
}

export interface CardBenefitExtractionResult {
    extraction: CardBenefitExtraction;
    extractor: string;
    model?: string;
    confidence: number;
}

export interface CardBenefitExtractionProvider {
    readonly id: string;
    readonly model?: string;
    extract(input: CardBenefitExtractionInput): Promise<CardBenefitExtractionResult>;
}

type GeminiResponse = {
    error?: { message?: string };
    candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
    }>;
};

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();
const normalizedSource = (value: string) => normalizeText(value).toLocaleLowerCase('ko-KR');
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

const ruleActionTypes = ['PERCENT', 'FLAT', 'FIXED_PRICE'] as const;
const platformTypes: PlatformType[] = ['ALL', 'ONLINE', 'OFFLINE', 'OFFICIAL_SITE'];
const conditionNumberFields: Array<keyof RuleCondition> = ['minSpend', 'minPerformance'];
const conditionDateFields: Array<keyof RuleCondition> = ['startsAt', 'endsAt'];
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
    if (value.manualCheckRequired !== undefined && typeof value.manualCheckRequired !== 'boolean') {
        errors.push(`${label} manualCheckRequired 값이 올바르지 않습니다.`);
    }
    if (value.requiredNote !== undefined && typeof value.requiredNote !== 'string') {
        errors.push(`${label} requiredNote 값이 올바르지 않습니다.`);
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
        if (input.card.id === 'shinhan_sol' && (
            value.card.name !== '신한카드 SOL트래블 체크' ||
            value.card.company !== '신한카드' ||
            !Array.isArray(value.card.limitTable) ||
            value.card.limitTable.length !== 0
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
    }

    const evidencedFieldsByRule = new Map<string, Set<CardBenefitEvidence['fields'][number]>>();
    if (!Array.isArray(value.evidence) || value.evidence.length === 0) {
        errors.push('공식 원문 근거가 없습니다.');
    } else {
        const evidenceIds = new Set<string>();
        const source = normalizedSource(input.sourceText);
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
            const quote = normalizeText(evidence.quote);
            if (quote.length < 3 || quote.length > 500 ||
                !source.includes(normalizedSource(quote))) {
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
            }
        });
    }
    (Array.isArray(value.rules) ? value.rules : []).forEach(rule => {
        if (!isRecord(rule) || typeof rule.id !== 'string') return;
        const fields = evidencedFieldsByRule.get(rule.id) ?? new Set();
        if (!fields.has('description') || !fields.has('action')) {
            errors.push(`규칙 ${rule.id}의 혜택·계산 근거가 없습니다.`);
        }
        if (isRecord(rule.condition) && Object.keys(rule.condition).length > 0 &&
            !fields.has('condition')) {
            errors.push(`규칙 ${rule.id}의 적용 조건 근거가 없습니다.`);
        }
        if (isRecord(rule.limitConfig) && Object.keys(rule.limitConfig).length > 0 &&
            !fields.has('limitConfig')) {
            errors.push(`규칙 ${rule.id}의 한도 근거가 없습니다.`);
        }
    });
    if (!Array.isArray(value.notes) || value.notes.some(note => typeof note !== 'string')) {
        errors.push('검수 메모 형식이 올바르지 않습니다.');
    }

    return {
        ...(errors.length === 0 && { extraction: value as unknown as CardBenefitExtraction }),
        errors: unique(errors),
    };
}

const evidenceLine = (sourceText: string, pattern: RegExp) => normalizeText(sourceText)
    .match(pattern)?.[0]
    .trim();

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
                manualCheckRequired: true,
                requiredNote: '지원 통화와 외화계좌 잔액 확인 필요',
            },
            action: { type: 'FLAT', value: 0 },
            limitConfig: {},
            usesCardLimit: false,
        }),
        rule('sol_overseas_fee', cardId, {
            category: 'etc',
            includedBrands: ['overseas_payment'],
            description: '해외 결제 수수료 면제',
            detail: 'Mastercard 선택 시 국제브랜드 1%와 해외서비스 0.2% 수수료 면제, 전월 실적·한도 없음',
            condition: {},
            action: { type: 'PERCENT', value: 1.2 },
            limitConfig: {},
            usesCardLimit: false,
        }),
        rule('sol_overseas_atm', cardId, {
            category: 'etc',
            includedBrands: ['overseas_atm'],
            description: '해외 ATM 수수료 면제',
            detail: 'ATM 인출 수수료 건당 3달러와 국제브랜드 수수료 1% 면제, ATM 운영사 수수료는 부과 가능',
            condition: {
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
            condition: {},
            action: { type: 'PERCENT', value: 1 },
            limitConfig: { monthlyAmount: 3_000 },
            usesCardLimit: false,
        }),
        rule('sol_domestic_convenience', cardId, {
            category: 'convenience',
            includedBrands: ['cu', 'gs25', 'seveneleven', 'emart24'],
            description: '국내 편의점 5% 할인',
            detail: '전월 국내 30만원 이상, 오프라인 일 1회·월 3회·월 3천원, 온라인·입점 매장 제외',
            condition: { minPerformance: 300_000 },
            action: { type: 'PERCENT', value: 5 },
            limitConfig: { dailyCount: 1, monthlyCount: 3, monthlyAmount: 3_000 },
            platformType: 'OFFLINE',
            usesCardLimit: false,
        }),
        rule('sol_domestic_transport', cardId, {
            category: 'transport',
            includedBrands: ['transport_public'],
            description: '국내 대중교통 1% 할인',
            detail: '전월 국내 30만원 이상, 후불교통 RF 거래, 고속버스 제외, 월 최대 3천원',
            condition: { minPerformance: 300_000 },
            action: { type: 'PERCENT', value: 1 },
            limitConfig: { monthlyAmount: 3_000 },
            usesCardLimit: false,
        }),
        rule('sol_cu_event', cardId, {
            category: 'convenience',
            includedBrands: ['cu_event'],
            description: 'CU 행사상품 5% 즉시할인',
            detail: '전월 실적 없음, 행사상품 건당 최대 2천원, 복합결제·일부 간편결제·일부 매장 제외',
            condition: {},
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
            condition: { endsAt: '2026-12-31' },
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
            condition: { endsAt: '2026-12-31' },
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
            condition: { endsAt: '2026-12-31' },
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
            condition: { endsAt: '2026-12-31' },
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
        ...(value.condition?.minPerformance !== undefined && {
            minPerformance: value.condition.minPerformance,
        }),
        ...(value.condition?.startsAt !== undefined && {
            startsAt: value.condition.startsAt,
        }),
        ...(value.condition?.endsAt !== undefined && {
            endsAt: value.condition.endsAt,
        }),
        ...(value.condition?.manualCheckRequired !== undefined && {
            manualCheckRequired: value.condition.manualCheckRequired,
        }),
        ...(value.condition?.requiredNote !== undefined && {
            requiredNote: value.condition.requiredNote,
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
            id: 'cu-event',
            ruleIds: ['sol_cu_event'],
            fields: ['description', 'action'],
            pattern: /CU.{0,20}?행사상품.{0,80}?5\s*%/i,
            location: '국내 이용 서비스',
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
    ];
    const evidence = specs.flatMap<CardBenefitEvidence>(spec => {
        const quote = evidenceLine(input.sourceText, spec.pattern);
        return quote ? [{
            id: spec.id,
            ruleIds: spec.ruleIds,
            fields: spec.fields,
            quote,
            location: spec.location,
        }] : [];
    });
    const missing = specs.filter(spec => !evidence.some(item => item.id === spec.id));
    return {
        extractor: 'rules:shinhan-sol-v3',
        confidence: missing.length === 0 ? 0.98 : Math.max(0.3, 0.98 - missing.length * 0.1),
        extraction: {
            schemaVersion: CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION,
            completeness: 'FULL',
            card: {
                id: input.card.id,
                name: '신한카드 SOL트래블 체크',
                company: '신한카드',
                limitTable: [],
            },
            rules,
            evidence,
            notes: missing.map(spec => `${spec.location} 공식 문구를 찾지 못했습니다.`),
        },
    };
}

export const cardBenefitGeminiSchema = {
    type: 'object',
    properties: {
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        extractionJson: {
            type: 'string',
            description: 'JSON-encoded CardBenefitExtraction object validated by the application',
        },
    },
    required: ['confidence', 'extractionJson'],
};

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
        typeof evidence.quote === 'string'
    ));
    return rulesAreSafe && evidenceIsSafe;
};

export class GeminiCardBenefitExtractionProvider implements CardBenefitExtractionProvider {
    readonly id = 'gemini';
    readonly model: string;
    private readonly apiKey: string;

    constructor(options: { apiKey: string; model?: string }) {
        if (!options.apiKey.trim()) throw new Error('Gemini API key가 비어 있습니다.');
        this.apiKey = options.apiKey.trim();
        this.model = options.model?.trim() || 'gemini-3.6-flash';
        if (!/^[a-zA-Z0-9._-]+$/.test(this.model)) {
            throw new Error('Gemini 모델명이 올바르지 않습니다.');
        }
    }

    async extract(input: CardBenefitExtractionInput): Promise<CardBenefitExtractionResult> {
        const canonicalExtraction = input.card.id === 'shinhan_sol'
            ? extractShinhanSolTravelWithRules(input).extraction
            : undefined;
        const prompt = [
            '당신은 한국 카드 상품의 공식 원문을 BenefitRule JSON으로 구조화합니다.',
            '원문에 명시된 내용만 사용하고 추측하지 마세요.',
            '응답의 extractionJson에는 CardBenefitExtraction 객체를 JSON 문자열로 직렬화해 넣으세요. Markdown은 사용하지 마세요.',
            'CardBenefitExtraction 필드: schemaVersion=1, completeness=FULL, card, rules, evidence, notes.',
            'card 객체의 키는 반드시 id, name, company, limitTable입니다. issuer 같은 다른 이름을 사용하지 마세요.',
            '결제금액으로 자동 계산할 수 없는 혜택은 action.value를 0으로 두고 manualCheckRequired=true로 표시하세요.',
            '각 규칙은 최소 하나의 evidence.ruleIds에 연결하고 evidence.quote는 원문에서 그대로 복사하세요.',
            'evidence 객체의 키는 반드시 id, ruleIds, fields, quote, location이며 fields에는 description, condition, action, limitConfig 중 근거가 되는 필드를 넣으세요.',
            '이번 후보는 카드의 전체 혜택을 교체하므로 공식 페이지의 상시 혜택과 현재 유효한 프로모션을 모두 포함하세요.',
            'Rule 필드는 id, cardId, category, includedBrands, excludedBrands, platformType, usesCardLimit, description, detail, condition, action, limitConfig를 사용하세요.',
            'condition에는 minSpend, minPerformance, startsAt, endsAt, manualCheckRequired, requiredNote만 사용할 수 있습니다.',
            '현재 허용 category ID: cafe, convenience, transport, etc.',
            '현재 허용 brand ID: cu, gs25, seveneleven, emart24, cu_event, transport_public, overseas_payment, overseas_atm, overseas_transport, airport_lounge, master_travel_rewards, japan_convenience, vietnam_lottemart, vietnam_grab, usa_starbucks.',
            '공식 원문에 해당하는 ID가 없거나 계산 모델로 표현할 수 없는 조건은 추측하지 말고 notes에 기록하세요.',
            `고정 카드 ID: ${input.card.id}`,
            '공식 카드명: 신한카드 SOL트래블 체크',
            '카드사: 신한카드',
            '통합 한도표: []',
            `필수 규칙 ID: ${SHINHAN_SOL_REQUIRED_RULE_IDS.join(', ')}`,
            `공식 기준 canonical extraction(키와 계산 필드를 변경하지 말고 모든 quote를 원문에서 확인):\n${JSON.stringify(canonicalExtraction)}`,
            `출처: ${input.sourceUrl}`,
            `공식 원문:\n${input.sourceText.slice(0, 30_000)}`,
        ].join('\n');
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-goog-api-key': this.apiKey,
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0,
                        thinkingConfig: { thinkingLevel: 'minimal' },
                        responseFormat: {
                            text: {
                                mimeType: 'APPLICATION_JSON',
                                schema: cardBenefitGeminiSchema,
                            },
                        },
                    },
                }),
                signal: AbortSignal.timeout(60_000),
            },
        );
        const body = await response.json().catch(() => ({})) as GeminiResponse;
        if (!response.ok) {
            const message = body.error?.message?.replace(/\s+/g, ' ').trim().slice(0, 300);
            throw new Error(`Gemini API HTTP ${response.status}${message ? `: ${message}` : ''}`);
        }
        const text = body.candidates?.[0]?.content?.parts
            ?.map(part => part.text ?? '')
            .join('')
            .trim();
        if (!text) throw new Error('Gemini가 카드 혜택 구조화 결과를 반환하지 않았습니다.');
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (typeof parsed.confidence !== 'number' || !Number.isFinite(parsed.confidence)) {
            throw new Error('Gemini 카드 혜택 신뢰도가 올바르지 않습니다.');
        }
        if (typeof parsed.extractionJson !== 'string') {
            throw new Error('Gemini 카드 혜택 JSON 문자열이 없습니다.');
        }
        const extraction = JSON.parse(parsed.extractionJson) as unknown;
        if (!isReviewSafeExtraction(extraction)) {
            throw new Error('Gemini 카드 혜택 결과를 검수 화면에 안전하게 표시할 수 없습니다.');
        }
        return {
            extractor: `${this.id}:${this.model}`,
            model: this.model,
            confidence: Math.max(0, Math.min(1, parsed.confidence)),
            extraction,
        };
    }
}

export const createCardBenefitExtractionProvider = () => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    return apiKey ? new GeminiCardBenefitExtractionProvider({
        apiKey,
        model: process.env.CARD_BENEFIT_AI_MODEL || process.env.GEMINI_MODEL,
    }) : undefined;
};
