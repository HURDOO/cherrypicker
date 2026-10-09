import type {
    BenefitCoverageLevel,
    BenefitProgramV1,
    BenefitRule,
    CardBenefitCoverageSummary,
    CardBenefitEvidence,
    CardBenefitUnsupportedClause,
} from '@/types';
import { listBenefitProgramEvidencePaths } from '@/utils/benefit-dsl';

/**
 * Registered patterns for official clauses the benefit engine cannot express.
 * Policy: docs/benefit-coverage-policy.md. Adding a pattern is a reviewed code change.
 */
export interface BenefitCoveragePattern {
    id: string;
    level: BenefitCoverageLevel;
    summary: string;
    /** Confirmation question, information note or card caveat shown to users. */
    userMessage: string;
}

export const NEW_BENEFIT_COVERAGE_PATTERN_ID = 'NEW';

export const BENEFIT_COVERAGE_PATTERNS = [
    {
        id: 'MERCHANT_APPROVAL_PATH',
        level: 'CONFIRM',
        summary: '카드사 승인 업종·PG·결제 경로에 따라 적용 여부가 달라지는 조건',
        userMessage: '카드사 승인 가맹점(업종)으로 직접 결제되는지 확인',
    },
    {
        id: 'PERF_EXCLUDE_TRANSACTION_TYPE',
        level: 'CARD_CAVEAT',
        summary: '앱이 거래 종류를 판정할 수 없는 전월 실적 제외(무이자할부·상품권·세금 등)',
        userMessage: '일부 거래는 카드사 전월 실적에서 제외되어 예상 실적과 다를 수 있습니다.',
    },
    {
        id: 'CARD_WIDE_LIMIT_UNMODELED',
        level: 'BLOCK_CARD',
        summary: '카드의 모든 계산 혜택을 제한하지만 표현할 수 없는 통합 한도·조건',
        userMessage: '카드 전체 혜택 한도를 계산할 수 없어 게시를 보류합니다.',
    },
    {
        id: 'INFO_EXTERNAL_RATE',
        level: 'INFORMATION',
        summary: '주유 리터당·환율·해외 수수료처럼 외부 변수로 금액이 정해지는 혜택',
        userMessage: '외부 단가에 따라 달라져 금액을 자동 계산하지 않습니다.',
    },
    {
        id: 'INFO_NON_CASH',
        level: 'INFORMATION',
        summary: '라운지·무료 제공·보험·쿠폰·사은품·마일리지처럼 현금이 아닌 혜택',
        userMessage: '현금 할인이 아닌 혜택이라 금액을 자동 계산하지 않습니다.',
    },
    {
        id: 'INFO_FINANCIAL_PRODUCT',
        level: 'INFORMATION',
        summary: '우대금리·수수료 면제 등 금융상품 혜택',
        userMessage: '금융상품 혜택이라 결제 추천 금액에 넣지 않습니다.',
    },
    {
        id: 'INFO_EVENT_DRAW',
        level: 'INFORMATION',
        summary: '응모·추첨·선착순 행사',
        userMessage: '응모·추첨·선착순 행사라 금액을 자동 계산하지 않습니다.',
    },
    {
        id: 'INFO_MULTI_RATE_UNRESOLVED',
        level: 'INFORMATION',
        summary: '한 문구의 여러 요율 중 현재 프로필로 하나를 정할 수 없는 혜택',
        userMessage: '적용 요율을 하나로 정할 수 없어 공식 조건을 확인해야 합니다.',
    },
    {
        id: 'INFO_LOW_FREQUENCY',
        level: 'INFORMATION',
        summary: '연 1~2회 수준의 저빈도 혜택',
        userMessage: '이용 빈도가 낮은 혜택이라 공식 조건으로 안내합니다.',
    },
] as const satisfies readonly BenefitCoveragePattern[];

export type BenefitCoveragePatternId = typeof BENEFIT_COVERAGE_PATTERNS[number]['id'];

export const BENEFIT_COVERAGE_PATTERN_IDS = BENEFIT_COVERAGE_PATTERNS.map(pattern => pattern.id) as
    [BenefitCoveragePatternId, ...BenefitCoveragePatternId[]];

const patternById = new Map<string, BenefitCoveragePattern>(
    BENEFIT_COVERAGE_PATTERNS.map(pattern => [pattern.id, pattern]),
);

export const getBenefitCoveragePattern = (patternId: string | null | undefined) =>
    patternId ? patternById.get(patternId) : undefined;

export type BenefitCoverageOutcomeLevel = BenefitCoverageLevel | 'UNREGISTERED';

export interface BenefitCoverageOutcome {
    clauseId: string;
    patternId?: string;
    level: BenefitCoverageOutcomeLevel;
    ruleIds: string[];
}

export interface BenefitCoverageResult extends CardBenefitCoverageSummary {
    outcomes: BenefitCoverageOutcome[];
    blockingErrors: string[];
    /** Rule IDs before coverage was applied, so clause references stay valid after exclusion. */
    originalRuleIds: string[];
}

export interface BenefitCoverageOptions {
    /** Returns the 1-based PDF page containing the quote, when the source is a PDF. */
    locatePage?: (sourceUrl: string, quote: string) => number | undefined;
}

type CoverageInput = {
    rules: BenefitRule[];
    evidence: CardBenefitEvidence[];
    unsupportedClauses: CardBenefitUnsupportedClause[];
};

const CAVEAT_QUOTE_LENGTH = 120;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const hasCoverageShape = (value: Record<string, unknown>): value is Record<string, unknown> & CoverageInput =>
    Array.isArray(value.rules) &&
    value.rules.every(rule => isRecord(rule) && typeof rule.id === 'string' &&
        isRecord(rule.condition) && isRecord(rule.action)) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(item => isRecord(item) && Array.isArray(item.ruleIds) &&
        Array.isArray(item.fields)) &&
    Array.isArray(value.unsupportedClauses) &&
    value.unsupportedClauses.every(clause => isRecord(clause) && typeof clause.id === 'string' &&
        Array.isArray(clause.ruleIds) && typeof clause.quote === 'string' &&
        typeof clause.sourceUrl === 'string');

const emptyResult = (originalRuleIds: string[]): BenefitCoverageResult => ({
    caveats: [],
    excludedRules: [],
    outcomes: [],
    blockingErrors: [],
    originalRuleIds,
});

const shortQuote = (quote: string) => {
    const compact = quote.replace(/\s+/g, ' ').trim();
    return compact.length > CAVEAT_QUOTE_LENGTH
        ? `${compact.slice(0, CAVEAT_QUOTE_LENGTH - 1)}…`
        : compact;
};

const appendNote = (current: string | undefined, note: string) => {
    if (!current) return note;
    return current.includes(note) ? current : `${current} · ${note}`;
};

const LEVEL_STRENGTH: Record<'CONFIRM' | 'INFORMATION' | 'EXCLUDE', number> = {
    CONFIRM: 1,
    INFORMATION: 2,
    EXCLUDE: 3,
};

/**
 * Applies registered coverage patterns rule by rule: a value-affecting clause only lowers the
 * rules it names (or every rule when it names none) instead of blocking the whole card.
 * Unregistered clauses keep their rules unpublished. The input is not mutated.
 */
export function applyBenefitCoveragePatterns<T>(
    value: T,
    options: BenefitCoverageOptions = {},
): { value: T; result: BenefitCoverageResult } {
    if (!isRecord(value)) return { value, result: emptyResult([]) };
    const originalRuleIds = Array.isArray(value.rules)
        ? value.rules.flatMap(rule => isRecord(rule) && typeof rule.id === 'string' ? [rule.id] : [])
        : [];
    if (!hasCoverageShape(value) ||
        !value.unsupportedClauses.some(clause => clause.affectsValue === true)) {
        return { value, result: emptyResult(originalRuleIds) };
    }

    const next = structuredClone(value) as Record<string, unknown> & CoverageInput;
    const result = emptyResult(originalRuleIds);
    const allRuleIds = next.rules.map(rule => rule.id);
    const knownRuleIds = new Set(allRuleIds);
    const strongest = new Map<string, keyof typeof LEVEL_STRENGTH>();
    const confirmations = new Map<string, Array<{ message: string; clause: CardBenefitUnsupportedClause }>>();
    const informationNotes = new Map<string, Array<{ message: string; clause: CardBenefitUnsupportedClause }>>();
    const raise = (ruleId: string, level: keyof typeof LEVEL_STRENGTH) => {
        const current = strongest.get(ruleId);
        if (!current || LEVEL_STRENGTH[level] > LEVEL_STRENGTH[current]) strongest.set(ruleId, level);
    };

    next.unsupportedClauses.forEach(clause => {
        if (clause.affectsValue !== true) return;
        const pattern = getBenefitCoveragePattern(clause.patternId);
        const targetRuleIds = clause.ruleIds.length > 0
            ? clause.ruleIds.filter(ruleId => knownRuleIds.has(ruleId))
            : allRuleIds;
        const outcome: BenefitCoverageOutcome = {
            clauseId: clause.id,
            ...(clause.patternId && { patternId: clause.patternId }),
            level: pattern?.level ?? 'UNREGISTERED',
            ruleIds: pattern?.level === 'CARD_CAVEAT' || pattern?.level === 'BLOCK_CARD'
                ? []
                : targetRuleIds,
        };
        result.outcomes.push(outcome);

        if (!pattern) {
            if (clause.ruleIds.length === 0) {
                result.blockingErrors.push(
                    `카드 전체에 걸린 미지원 문구 ${clause.id}의 패턴이 등록되지 않았습니다.`,
                );
                return;
            }
            targetRuleIds.forEach(ruleId => raise(ruleId, 'EXCLUDE'));
            return;
        }
        if (pattern.level === 'BLOCK_CARD') {
            result.blockingErrors.push(
                `미지원 문구 ${clause.id}(${pattern.id})가 카드 전체 계산을 제한해 게시할 수 없습니다.`,
            );
            return;
        }
        if (pattern.level === 'CARD_CAVEAT') {
            const caveat = `${pattern.userMessage} 공식 조건: “${shortQuote(clause.quote)}”`;
            if (!result.caveats.includes(caveat)) result.caveats.push(caveat);
            return;
        }
        const notes = pattern.level === 'CONFIRM' ? confirmations : informationNotes;
        targetRuleIds.forEach(ruleId => {
            raise(ruleId, pattern.level === 'CONFIRM' ? 'CONFIRM' : 'INFORMATION');
            notes.set(ruleId, [...(notes.get(ruleId) ?? []), { message: pattern.userMessage, clause }]);
        });
    });

    // A fallback rule may only start after the rules it follows are unavailable; without them it
    // would apply too early, so it leaves the catalog together with them.
    let cascaded = true;
    while (cascaded) {
        cascaded = false;
        next.rules.forEach(rule => {
            if (strongest.get(rule.id) === 'EXCLUDE') return;
            if ((rule.condition.fallbackAfterRuleIds ?? []).some(ruleId => strongest.get(ruleId) === 'EXCLUDE')) {
                strongest.set(rule.id, 'EXCLUDE');
                cascaded = true;
            }
        });
    }

    const excluded = new Set([...strongest].filter(([, level]) => level === 'EXCLUDE').map(([ruleId]) => ruleId));
    const programRemoved = new Set<string>();
    const addedEvidence: CardBenefitEvidence[] = [];
    const evidenceFor = (
        clause: CardBenefitUnsupportedClause,
        ruleId: string,
        fields: CardBenefitEvidence['fields'],
        programPaths?: string[],
    ) => {
        const page = options.locatePage?.(clause.sourceUrl, clause.quote);
        addedEvidence.push({
            id: `coverage-${clause.id}-${ruleId}`,
            ruleIds: [ruleId],
            fields,
            ...(programPaths?.length && { programPaths }),
            sourceUrl: clause.sourceUrl,
            quote: clause.quote,
            ...(page !== undefined && { page }),
        });
    };

    next.rules = next.rules.flatMap(rule => {
        const level = strongest.get(rule.id);
        if (level === 'EXCLUDE') {
            result.excludedRules.push({ ruleId: rule.id, description: rule.description });
            return [];
        }
        const remaining = {
            ...rule,
            condition: {
                ...rule.condition,
                ...(rule.condition.stackableWithRuleIds && {
                    stackableWithRuleIds: rule.condition.stackableWithRuleIds
                        .filter(ruleId => !excluded.has(ruleId)),
                }),
            },
        };
        if (remaining.condition.stackableWithRuleIds?.length === 0) {
            delete remaining.condition.stackableWithRuleIds;
        }
        if (level === 'INFORMATION') {
            const notes = informationNotes.get(rule.id) ?? [];
            if (remaining.program) programRemoved.add(rule.id);
            delete remaining.program;
            remaining.action = { type: 'FLAT', value: 0 };
            remaining.condition.manualCheckRequired = true;
            remaining.condition.requiredNote = notes.reduce(
                (note, item) => appendNote(note, item.message),
                remaining.condition.requiredNote,
            );
            notes.forEach(item => evidenceFor(item.clause, rule.id, ['condition']));
            return [remaining];
        }
        if (level === 'CONFIRM') {
            const notes = confirmations.get(rule.id) ?? [];
            remaining.condition.confirmationRequired = true;
            remaining.condition.requiredNote = notes.reduce(
                (note, item) => appendNote(note, item.message),
                remaining.condition.requiredNote,
            );
            if (remaining.program) {
                const before = new Set(listBenefitProgramEvidencePaths(remaining.program));
                const existingCount = remaining.program.confirmations?.length ?? 0;
                const program: BenefitProgramV1 = {
                    ...remaining.program,
                    confirmations: [
                        ...(remaining.program.confirmations ?? []),
                        ...notes.map(item => ({
                            when: { op: 'literal' as const, value: true },
                            message: item.message,
                        })),
                    ],
                };
                remaining.program = program;
                const added = listBenefitProgramEvidencePaths(program).filter(path => !before.has(path));
                notes.forEach((item, index) => {
                    const prefix = `program.confirmations[${existingCount + index}]`;
                    const paths = added.filter(path => (
                        path === prefix || path.startsWith(`${prefix}.`) ||
                        (index === 0 && !path.startsWith('program.confirmations['))
                    ));
                    evidenceFor(
                        item.clause,
                        rule.id,
                        paths.length > 0 ? ['condition', 'program'] : ['condition'],
                        paths,
                    );
                });
            } else {
                notes.forEach(item => evidenceFor(item.clause, rule.id, ['condition']));
            }
            return [remaining];
        }
        return [remaining];
    });

    next.evidence = next.evidence.flatMap(item => {
        const ruleIds = item.ruleIds.filter(ruleId => !excluded.has(ruleId));
        if (ruleIds.length === 0) return [];
        const withoutProgram = ruleIds.filter(ruleId => programRemoved.has(ruleId));
        const keepsProgram = ruleIds.filter(ruleId => !programRemoved.has(ruleId));
        if (withoutProgram.length === 0 || !item.fields.includes('program')) {
            return [{ ...item, ruleIds }];
        }
        const fields = item.fields.filter(field => field !== 'program');
        const rest: CardBenefitEvidence = { ...item };
        delete rest.programPaths;
        return [
            ...(keepsProgram.length > 0 ? [{ ...item, ruleIds: keepsProgram }] : []),
            ...(fields.length > 0
                ? [{
                    ...rest,
                    id: keepsProgram.length > 0 ? `${item.id}-information` : item.id,
                    ruleIds: withoutProgram,
                    fields,
                }]
                : []),
        ];
    });
    next.evidence.push(...addedEvidence);

    if (originalRuleIds.length > 0 && next.rules.length === 0) {
        result.blockingErrors.push('미지원 문구를 반영하고 나면 게시할 수 있는 규칙이 남지 않습니다.');
    }
    return { value: next as T, result };
}

export const toCardBenefitCoverageSummary = (
    result: Pick<BenefitCoverageResult, 'caveats' | 'excludedRules'> | undefined,
): CardBenefitCoverageSummary | undefined => (
    result && (result.caveats.length > 0 || result.excludedRules.length > 0)
        ? {
            caveats: [...result.caveats],
            excludedRules: result.excludedRules.map(rule => ({ ...rule })),
        }
        : undefined
);

/** Public caveat lines for a card's published coverage summary. */
export const cardBenefitCoverageCaveats = (coverage: CardBenefitCoverageSummary | undefined) => {
    if (!coverage) return [];
    return [
        ...coverage.caveats,
        ...(coverage.excludedRules.length > 0
            ? [`아직 반영하지 않은 혜택: ${coverage.excludedRules.map(rule => rule.description).join(', ')}`]
            : []),
    ];
};
