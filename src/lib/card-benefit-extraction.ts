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

const ruleActionTypes = ['PERCENT', 'FLAT', 'FIXED_PRICE'] as const;
const platformTypes: PlatformType[] = ['ALL', 'ONLINE', 'OFFLINE', 'OFFICIAL_SITE'];
const conditionNumberFields: Array<keyof RuleCondition> = ['minSpend', 'minPerformance'];
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

export function extractShinhanSolTravelWithRules(
    input: CardBenefitExtractionInput,
): CardBenefitExtractionResult {
    if (input.card.id !== 'shinhan_sol') {
        throw new Error('규칙 기반 대표 추출기는 신한 SOL트래블 체크카드만 지원합니다.');
    }
    const rules: BenefitRule[] = [
        rule('sol_overseas_fee', input.card.id, {
            category: 'etc',
            includedBrands: ['overseas_payment'],
            description: '해외 결제 수수료 면제',
            detail: '해외 이용 시 국제브랜드 수수료와 해외서비스 수수료 면제',
            condition: {},
            action: { type: 'PERCENT', value: 1.2 },
            limitConfig: {},
            usesCardLimit: false,
        }),
        rule('sol_overseas_transport', input.card.id, {
            category: 'transport',
            includedBrands: ['overseas_transport'],
            description: '해외 대중교통 1% 할인',
            detail: '컨택리스 해외 대중교통, 월 최대 3천원',
            condition: {},
            action: { type: 'PERCENT', value: 1 },
            limitConfig: { monthlyAmount: 3_000 },
            usesCardLimit: false,
        }),
        rule('sol_domestic_convenience', input.card.id, {
            category: 'convenience',
            includedBrands: ['cu', 'gs25', 'seveneleven', 'emart24'],
            description: '국내 편의점 5% 할인',
            detail: '전월 국내 30만원 이상, 오프라인 일 1회·월 3회, 월 최대 3천원',
            condition: { minPerformance: 300_000 },
            action: { type: 'PERCENT', value: 5 },
            limitConfig: { dailyCount: 1, monthlyCount: 3, monthlyAmount: 3_000 },
            platformType: 'OFFLINE',
        }),
        rule('sol_domestic_transport', input.card.id, {
            category: 'transport',
            includedBrands: ['transport_public'],
            description: '국내 대중교통 1% 할인',
            detail: '전월 국내 30만원 이상, 월 최대 3천원',
            condition: { minPerformance: 300_000 },
            action: { type: 'PERCENT', value: 1 },
            limitConfig: { monthlyAmount: 3_000 },
        }),
        rule('sol_cu_event', input.card.id, {
            category: 'convenience',
            includedBrands: ['cu_event'],
            description: 'CU 행사상품 5% 즉시할인',
            detail: '전월 실적 없음, 결제 1회당 최대 2천원. 행사상품 전용',
            condition: {},
            action: { type: 'PERCENT', value: 5, maxDiscount: 2_000 },
            limitConfig: {},
            usesCardLimit: false,
            platformType: 'OFFLINE',
        }),
        rule('sol_lounge', input.card.id, {
            category: 'etc',
            includedBrands: ['airport_lounge'],
            description: '공항 라운지 무료',
            detail: '전월 국내 30만원 이상, 반기 1회·연 2회',
            condition: {
                minPerformance: 300_000,
                manualCheckRequired: true,
                requiredNote: '라운지 이용권 혜택은 결제금액 계산 제외',
            },
            action: { type: 'FLAT', value: 0 },
            limitConfig: { yearlyCount: 2 },
            usesCardLimit: false,
        }),
    ];
    const specs: Array<{
        id: string;
        ruleIds: string[];
        fields: CardBenefitEvidence['fields'];
        pattern: RegExp;
        location: string;
    }> = [
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
        extractor: 'rules:shinhan-sol-v2',
        confidence: missing.length === 0 ? 0.98 : Math.max(0.3, 0.98 - missing.length * 0.1),
        extraction: {
            schemaVersion: CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION,
            completeness: 'FULL',
            card: {
                id: input.card.id,
                name: input.card.name,
                company: input.card.company,
                limitTable: [],
            },
            rules,
            evidence,
            notes: missing.map(spec => `${spec.location} 공식 문구를 찾지 못했습니다.`),
        },
    };
}

const geminiSchema = {
    type: 'object',
    properties: {
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        extraction: {
            type: 'object',
            properties: {
                schemaVersion: { type: 'integer', enum: [1] },
                completeness: { type: 'string', enum: ['FULL'] },
                card: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        company: { type: 'string' },
                        limitTable: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    threshold: { type: 'integer', minimum: 0 },
                                    limit: { type: 'integer', minimum: 0 },
                                },
                                required: ['threshold', 'limit'],
                            },
                        },
                    },
                    required: ['id', 'name', 'company', 'limitTable'],
                },
                rules: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 100,
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            cardId: { type: 'string' },
                            category: { type: 'string' },
                            includedBrands: { type: 'array', items: { type: 'string' } },
                            excludedBrands: { type: 'array', items: { type: 'string' } },
                            platformType: { type: 'string', enum: platformTypes },
                            sharedGroupId: { type: 'string' },
                            usesCardLimit: { type: 'boolean' },
                            description: { type: 'string' },
                            detail: { type: 'string' },
                            condition: {
                                type: 'object',
                                properties: {
                                    minSpend: { type: 'integer', minimum: 0 },
                                    minPerformance: { type: 'integer', minimum: 0 },
                                    manualCheckRequired: { type: 'boolean' },
                                    requiredNote: { type: 'string' },
                                },
                            },
                            action: {
                                type: 'object',
                                properties: {
                                    type: { type: 'string', enum: ruleActionTypes },
                                    value: { type: 'number', minimum: 0 },
                                    maxDiscount: { type: 'integer', minimum: 0 },
                                },
                                required: ['type', 'value'],
                            },
                            limitConfig: {
                                type: 'object',
                                properties: {
                                    dailyCount: { type: 'integer', minimum: 0 },
                                    dailyAmount: { type: 'integer', minimum: 0 },
                                    monthlyCount: { type: 'integer', minimum: 0 },
                                    yearlyCount: { type: 'integer', minimum: 0 },
                                    monthlyAmount: { type: 'integer', minimum: 0 },
                                },
                            },
                        },
                        required: [
                            'id',
                            'cardId',
                            'includedBrands',
                            'excludedBrands',
                            'platformType',
                            'usesCardLimit',
                            'description',
                            'detail',
                            'condition',
                            'action',
                            'limitConfig',
                        ],
                    },
                },
                evidence: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            ruleIds: { type: 'array', items: { type: 'string' } },
                            fields: {
                                type: 'array',
                                items: {
                                    type: 'string',
                                    enum: ['description', 'condition', 'action', 'limitConfig'],
                                },
                            },
                            quote: { type: 'string' },
                            location: { type: 'string' },
                            page: { type: 'integer', minimum: 1 },
                        },
                        required: ['id', 'ruleIds', 'fields', 'quote'],
                    },
                },
                notes: { type: 'array', items: { type: 'string' } },
            },
            required: ['schemaVersion', 'completeness', 'card', 'rules', 'evidence', 'notes'],
        },
    },
    required: ['confidence', 'extraction'],
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
        const prompt = [
            '당신은 한국 카드 상품의 공식 원문을 BenefitRule JSON으로 구조화합니다.',
            '원문에 명시된 내용만 사용하고 추측하지 마세요.',
            '결제금액으로 자동 계산할 수 없는 혜택은 action.value를 0으로 두고 manualCheckRequired=true로 표시하세요.',
            '각 규칙은 최소 하나의 evidence.ruleIds에 연결하고 evidence.quote는 원문에서 그대로 복사하세요.',
            '이번 후보는 카드의 전체 혜택을 교체하므로 빠진 혜택이 있으면 notes에 기록하세요.',
            'Rule 필드는 id, cardId, category, includedBrands, excludedBrands, platformType, usesCardLimit, description, detail, condition, action, limitConfig를 사용하세요.',
            '현재 허용 category ID: convenience, transport, etc.',
            '현재 허용 brand ID: cu, gs25, seveneleven, emart24, cu_event, transport_public, overseas_payment, overseas_transport, airport_lounge.',
            '공식 원문에 해당하는 ID가 없거나 계산 모델로 표현할 수 없는 조건은 추측하지 말고 notes에 기록하세요.',
            `고정 카드 ID: ${input.card.id}`,
            `카드명: ${input.card.name}`,
            `카드사: ${input.card.company}`,
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
                                schema: geminiSchema,
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
        if (!isReviewSafeExtraction(parsed.extraction)) {
            throw new Error('Gemini 카드 혜택 결과를 검수 화면에 안전하게 표시할 수 없습니다.');
        }
        return {
            extractor: `${this.id}:${this.model}`,
            model: this.model,
            confidence: Math.max(0, Math.min(1, parsed.confidence)),
            extraction: parsed.extraction,
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
