import type {
    BenefitDslEvaluationContext,
    BenefitDslEvaluationResult,
    BenefitDslExpression,
    BenefitDslHistoryEntry,
    BenefitDslInputName,
    BenefitDslTarget,
    BenefitDslValidationReferences,
    BenefitDslValidationResult,
    BenefitProgramV1,
    BenefitRule,
    LimitTableItem,
} from '@/types';

export const BENEFIT_DSL_MAX_NODES = 256;
export const BENEFIT_DSL_MAX_DEPTH = 16;
export const BENEFIT_DSL_MAX_HISTORY_ENTRIES = 5_000;
export const BENEFIT_DSL_SEMANTICS_VERSION = 'benefit-dsl-v1.1.0' as const;

const MAX_ABSOLUTE_NUMBER = Number.MAX_SAFE_INTEGER;
const KST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;

type ExpressionValueType = 'number' | 'string' | 'boolean' | 'null';
type InternalEvaluationContext = BenefitDslEvaluationContext & {
    currentHistoryEntry?: BenefitDslHistoryEntry;
};

const inputTypes: Record<BenefitDslInputName, ExpressionValueType> = {
    PAYMENT_AMOUNT: 'number',
    REMAINING_PAYMENT_AMOUNT: 'number',
    ELIGIBLE_ITEM_AMOUNT: 'number',
    ELIGIBLE_ITEM_AMOUNT_PROVIDED: 'boolean',
    CARD_PERFORMANCE: 'number',
    CARD_BASE_MONTHLY_LIMIT: 'number',
    CARD_FIRST_BENEFIT_TIER_LIMIT: 'number',
    CARD_NETWORK: 'string',
    BRAND_ID: 'string',
    CATEGORY_ID: 'string',
    CHANNEL: 'string',
    CURRENT_DATE: 'string',
    CURRENT_WEEKDAY: 'string',
    CURRENT_MINUTE: 'number',
    NEW_CARD_WINDOW_AVAILABLE: 'boolean',
    USAGE_DAILY_COUNT: 'number',
    USAGE_DAILY_BENEFIT_AMOUNT: 'number',
    USAGE_MONTHLY_COUNT: 'number',
    USAGE_MONTHLY_BENEFIT_AMOUNT: 'number',
    USAGE_YEARLY_COUNT: 'number',
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const valueType = (value: unknown): ExpressionValueType | undefined => {
    if (value === null) return 'null';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'boolean') return 'boolean';
    return undefined;
};

const isSafeDslNumber = (value: unknown): value is number => (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_ABSOLUTE_NUMBER
);

const calendarParts = (date: Date) => {
    const kst = new Date(date.getTime() + KST_OFFSET_MILLISECONDS);
    return {
        year: kst.getUTCFullYear(),
        month: kst.getUTCMonth() + 1,
        day: kst.getUTCDate(),
        weekday: (['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const)[
            kst.getUTCDay()
        ],
        minutes: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
    };
};

const dateString = (date: Date) => {
    const parts = calendarParts(date);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

const samePeriod = (occurredAt: string, now: Date, period: 'DAY' | 'MONTH' | 'YEAR') => {
    const occurred = new Date(occurredAt);
    if (Number.isNaN(occurred.getTime())) return false;
    const left = calendarParts(occurred);
    const right = calendarParts(now);
    if (left.year !== right.year) return false;
    if (period === 'YEAR') return true;
    if (left.month !== right.month) return false;
    return period === 'MONTH' || left.day === right.day;
};

const currentTransactionDate = (context: InternalEvaluationContext) => (
    context.currentHistoryEntry
        ? new Date(context.currentHistoryEntry.occurredAt)
        : context.now
);

const inputValue = (
    name: BenefitDslInputName,
    context: InternalEvaluationContext,
): number | string | boolean | null => {
    const historyEntry = context.currentHistoryEntry;
    const transactionDate = currentTransactionDate(context);
    const parts = calendarParts(transactionDate);
    switch (name) {
        case 'PAYMENT_AMOUNT': return historyEntry?.paymentAmount ?? context.paymentAmount;
        case 'REMAINING_PAYMENT_AMOUNT':
            return historyEntry?.paymentAmount ?? context.remainingPaymentAmount;
        case 'ELIGIBLE_ITEM_AMOUNT': return context.eligibleItemAmount ?? 0;
        case 'ELIGIBLE_ITEM_AMOUNT_PROVIDED': return context.eligibleItemAmount !== undefined;
        case 'CARD_PERFORMANCE': return context.cardPerformance;
        case 'CARD_BASE_MONTHLY_LIMIT': return context.cardBaseMonthlyLimit;
        case 'CARD_FIRST_BENEFIT_TIER_LIMIT': return context.cardFirstBenefitTierLimit;
        case 'CARD_NETWORK': return context.cardNetwork ?? null;
        case 'BRAND_ID': return historyEntry?.brandId ?? context.brandId ?? null;
        case 'CATEGORY_ID': return historyEntry?.categoryId ?? context.categoryId ?? null;
        case 'CHANNEL': return historyEntry?.channel ?? context.channel;
        case 'CURRENT_DATE': return dateString(transactionDate);
        case 'CURRENT_WEEKDAY': return parts.weekday;
        case 'CURRENT_MINUTE': return parts.minutes;
        case 'NEW_CARD_WINDOW_AVAILABLE': return context.newCardWindowAvailable;
        case 'USAGE_DAILY_COUNT': return context.usage.dailyCount;
        case 'USAGE_DAILY_BENEFIT_AMOUNT': return context.usage.dailyBenefitAmount;
        case 'USAGE_MONTHLY_COUNT': return context.usage.monthlyCount;
        case 'USAGE_MONTHLY_BENEFIT_AMOUNT': return context.usage.monthlyBenefitAmount;
        case 'USAGE_YEARLY_COUNT': return context.usage.yearlyCount;
    }
};

const compatibleTypes = (left: ExpressionValueType, right: ExpressionValueType) => (
    left === right || left === 'null' || right === 'null'
);

const unknownKeys = (value: Record<string, unknown>, allowed: readonly string[]) => {
    const allowedSet = new Set(allowed);
    return Object.keys(value).filter(key => !allowedSet.has(key));
};

export function validateBenefitProgram(
    value: unknown,
    references: BenefitDslValidationReferences = {},
): BenefitDslValidationResult {
    const errors: string[] = [];
    let nodeCount = 0;
    let maxDepth = 0;

    const error = (path: string, message: string) => errors.push(`${path}: ${message}`);
    const infer = (
        expression: unknown,
        path: string,
        depth: number,
        insideAggregate: boolean = false,
    ): ExpressionValueType | undefined => {
        nodeCount += 1;
        maxDepth = Math.max(maxDepth, depth);
        if (nodeCount > BENEFIT_DSL_MAX_NODES) {
            if (nodeCount === BENEFIT_DSL_MAX_NODES + 1) {
                error(path, `노드 수가 ${BENEFIT_DSL_MAX_NODES}개를 초과합니다.`);
            }
            return undefined;
        }
        if (depth > BENEFIT_DSL_MAX_DEPTH) {
            error(path, `중첩 깊이가 ${BENEFIT_DSL_MAX_DEPTH}단계를 초과합니다.`);
            return undefined;
        }
        if (!isRecord(expression) || typeof expression.op !== 'string') {
            error(path, '표현식 객체와 op가 필요합니다.');
            return undefined;
        }

        const checkKeys = (allowed: readonly string[]) => {
            unknownKeys(expression, allowed).forEach(key => {
                error(`${path}.${key}`, '허용되지 않은 필드입니다.');
            });
        };

        switch (expression.op) {
            case 'literal': {
                checkKeys(['op', 'value']);
                const type = valueType(expression.value);
                if (!type) error(path, 'literal은 숫자·문자열·불리언·null만 허용합니다.');
                if (typeof expression.value === 'number' && !isSafeDslNumber(expression.value)) {
                    error(path, 'literal 숫자가 안전 범위를 벗어납니다.');
                }
                if (typeof expression.value === 'string' && expression.value.length > 500) {
                    error(path, 'literal 문자열은 500자를 넘을 수 없습니다.');
                }
                return type;
            }
            case 'input': {
                checkKeys(['op', 'name']);
                if (typeof expression.name !== 'string' || !(expression.name in inputTypes)) {
                    error(path, `허용되지 않은 input ${String(expression.name)}입니다.`);
                    return undefined;
                }
                return inputTypes[expression.name as BenefitDslInputName];
            }
            case 'arithmetic': {
                checkKeys(['op', 'operator', 'operands']);
                if (!['ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE', 'MIN', 'MAX']
                    .includes(String(expression.operator))) {
                    error(path, `허용되지 않은 산술 연산자 ${String(expression.operator)}입니다.`);
                }
                if (!Array.isArray(expression.operands) || expression.operands.length < 2 ||
                    expression.operands.length > 20) {
                    error(path, '산술 operands는 2~20개여야 합니다.');
                    return 'number';
                }
                expression.operands.forEach((operand, index) => {
                    if (infer(operand, `${path}.operands[${index}]`, depth + 1, insideAggregate) !== 'number') {
                        error(`${path}.operands[${index}]`, '숫자 표현식이어야 합니다.');
                    }
                });
                if (['SUBTRACT', 'DIVIDE'].includes(String(expression.operator)) &&
                    expression.operands.length !== 2) {
                    error(path, `${String(expression.operator)}는 operands가 정확히 2개여야 합니다.`);
                }
                return 'number';
            }
            case 'round': {
                checkKeys(['op', 'mode', 'value', 'unit']);
                if (!['FLOOR', 'CEIL', 'NEAREST'].includes(String(expression.mode))) {
                    error(path, `허용되지 않은 반올림 방식 ${String(expression.mode)}입니다.`);
                }
                if (!Number.isSafeInteger(expression.unit) || Number(expression.unit) <= 0) {
                    error(path, 'round unit은 양의 안전한 정수여야 합니다.');
                }
                if (infer(expression.value, `${path}.value`, depth + 1, insideAggregate) !== 'number') {
                    error(`${path}.value`, '숫자 표현식이어야 합니다.');
                }
                return 'number';
            }
            case 'compare': {
                checkKeys(['op', 'operator', 'left', 'right']);
                if (!['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE'].includes(String(expression.operator))) {
                    error(path, `허용되지 않은 비교 연산자 ${String(expression.operator)}입니다.`);
                }
                const left = infer(expression.left, `${path}.left`, depth + 1, insideAggregate);
                const right = infer(expression.right, `${path}.right`, depth + 1, insideAggregate);
                if (left && right && !compatibleTypes(left, right)) {
                    error(path, `비교 타입이 다릅니다(${left}, ${right}).`);
                }
                if (!['EQ', 'NE'].includes(String(expression.operator)) &&
                    left && !['number', 'string'].includes(left)) {
                    error(path, '대소 비교는 숫자 또는 문자열만 허용합니다.');
                }
                return 'boolean';
            }
            case 'logic': {
                checkKeys(['op', 'operator', 'operands']);
                if (!['ALL', 'ANY'].includes(String(expression.operator))) {
                    error(path, `허용되지 않은 논리 연산자 ${String(expression.operator)}입니다.`);
                }
                if (!Array.isArray(expression.operands) || expression.operands.length < 1 ||
                    expression.operands.length > 20) {
                    error(path, '논리 operands는 1~20개여야 합니다.');
                    return 'boolean';
                }
                expression.operands.forEach((operand, index) => {
                    if (infer(operand, `${path}.operands[${index}]`, depth + 1, insideAggregate) !== 'boolean') {
                        error(`${path}.operands[${index}]`, '불리언 표현식이어야 합니다.');
                    }
                });
                return 'boolean';
            }
            case 'not':
                checkKeys(['op', 'value']);
                if (infer(expression.value, `${path}.value`, depth + 1, insideAggregate) !== 'boolean') {
                    error(`${path}.value`, '불리언 표현식이어야 합니다.');
                }
                return 'boolean';
            case 'in': {
                checkKeys(['op', 'value', 'options']);
                const subjectType = infer(expression.value, `${path}.value`, depth + 1, insideAggregate);
                if (!Array.isArray(expression.options) || expression.options.length < 1 ||
                    expression.options.length > 100) {
                    error(path, 'in options는 1~100개여야 합니다.');
                } else {
                    expression.options.forEach((option, index) => {
                        const optionType = valueType(option);
                        if (!optionType || (subjectType && !compatibleTypes(subjectType, optionType))) {
                            error(`${path}.options[${index}]`, '비교 대상과 같은 기본 타입이어야 합니다.');
                        }
                        if (typeof option === 'number' && !isSafeDslNumber(option)) {
                            error(`${path}.options[${index}]`, '숫자가 안전 범위를 벗어납니다.');
                        }
                        if (typeof option === 'string' && option.length > 500) {
                            error(`${path}.options[${index}]`, '문자열은 500자를 넘을 수 없습니다.');
                        }
                    });
                }
                return 'boolean';
            }
            case 'case': {
                checkKeys(['op', 'branches', 'otherwise']);
                if (!Array.isArray(expression.branches) || expression.branches.length < 1 ||
                    expression.branches.length > 20) {
                    error(path, 'case branches는 1~20개여야 합니다.');
                    return undefined;
                }
                let outputType: ExpressionValueType | undefined;
                expression.branches.forEach((branch, index) => {
                    if (!isRecord(branch)) {
                        error(`${path}.branches[${index}]`, '분기 객체가 필요합니다.');
                        return;
                    }
                    unknownKeys(branch, ['when', 'then']).forEach(key => {
                        error(`${path}.branches[${index}].${key}`, '허용되지 않은 필드입니다.');
                    });
                    if (infer(branch.when, `${path}.branches[${index}].when`, depth + 1, insideAggregate) !== 'boolean') {
                        error(`${path}.branches[${index}].when`, '불리언 표현식이어야 합니다.');
                    }
                    const branchType = infer(
                        branch.then,
                        `${path}.branches[${index}].then`,
                        depth + 1,
                        insideAggregate,
                    );
                    if (!outputType) outputType = branchType;
                    else if (branchType && !compatibleTypes(outputType, branchType)) {
                        error(`${path}.branches[${index}].then`, '모든 분기의 결과 타입이 같아야 합니다.');
                    }
                });
                const otherwiseType = infer(
                    expression.otherwise,
                    `${path}.otherwise`,
                    depth + 1,
                    insideAggregate,
                );
                if (outputType && otherwiseType && !compatibleTypes(outputType, otherwiseType)) {
                    error(`${path}.otherwise`, '모든 분기의 결과 타입이 같아야 합니다.');
                }
                return outputType ?? otherwiseType;
            }
            case 'aggregate': {
                checkKeys(['op', 'function', 'period', 'field', 'where', 'includeCurrent']);
                if (insideAggregate) error(path, '집계 안에 다른 집계를 중첩할 수 없습니다.');
                if (!['SUM', 'COUNT'].includes(String(expression.function)) ||
                    !['DAY', 'MONTH', 'YEAR'].includes(String(expression.period)) ||
                    !['PAYMENT_AMOUNT', 'BENEFIT_AMOUNT'].includes(String(expression.field))) {
                    error(path, '집계 함수·기간·필드가 올바르지 않습니다.');
                }
                if (expression.includeCurrent !== undefined &&
                    typeof expression.includeCurrent !== 'boolean') {
                    error(path, 'includeCurrent는 불리언이어야 합니다.');
                }
                if (expression.where !== undefined &&
                    infer(expression.where, `${path}.where`, depth + 1, true) !== 'boolean') {
                    error(`${path}.where`, '불리언 표현식이어야 합니다.');
                }
                return 'number';
            }
            case 'isTopGroup': {
                checkKeys(['op', 'period', 'groupBy', 'metric', 'where', 'includeCurrent']);
                if (insideAggregate) error(path, '집계 안에 최다 그룹 연산을 중첩할 수 없습니다.');
                if (!['DAY', 'MONTH', 'YEAR'].includes(String(expression.period)) ||
                    !['BRAND_ID', 'CATEGORY_ID'].includes(String(expression.groupBy)) ||
                    !['PAYMENT_AMOUNT', 'TRANSACTION_COUNT'].includes(String(expression.metric))) {
                    error(path, '최다 그룹 기간·그룹·지표가 올바르지 않습니다.');
                }
                if (expression.includeCurrent !== undefined &&
                    typeof expression.includeCurrent !== 'boolean') {
                    error(path, 'includeCurrent는 불리언이어야 합니다.');
                }
                if (expression.where !== undefined &&
                    infer(expression.where, `${path}.where`, depth + 1, true) !== 'boolean') {
                    error(`${path}.where`, '불리언 표현식이어야 합니다.');
                }
                return 'boolean';
            }
            default:
                error(path, `허용되지 않은 op ${String(expression.op)}입니다.`);
                return undefined;
        }
    };

    if (!isRecord(value)) {
        return { valid: false, errors: ['program: 객체가 아닙니다.'], nodeCount, maxDepth };
    }
    unknownKeys(value, [
        'languageVersion',
        'target',
        'eligibility',
        'benefit',
        'limits',
        'usageGroupId',
        'usesCardLimit',
        'cardMonthlyLimit',
        'confirmations',
        'reason',
    ]).forEach(key => error(`program.${key}`, '허용되지 않은 필드입니다.'));
    if (value.languageVersion !== 1) error('program.languageVersion', '지원하지 않는 버전입니다.');
    if (value.target !== undefined) {
        if (!isRecord(value.target)) {
            error('program.target', '객체여야 합니다.');
        } else {
            const target = value.target;
            unknownKeys(target, [
                'includedBrandIds',
                'excludedBrandIds',
                'categoryIds',
                'channels',
                'purchaseScenario',
            ]).forEach(key => {
                error(`program.target.${key}`, '허용되지 않은 필드입니다.');
            });
            const idFields = [
                ['includedBrandIds', references.brandIds],
                ['excludedBrandIds', references.brandIds],
                ['categoryIds', references.categoryIds],
            ] as const;
            idFields.forEach(([field, allowed]) => {
                const ids = target[field];
                if (ids === undefined) return;
                if (!Array.isArray(ids) || ids.length > 200 ||
                    ids.some(id => typeof id !== 'string' || !id)) {
                    error(`program.target.${field}`, '문자열 ID 200개 이하의 배열이어야 합니다.');
                    return;
                }
                if (new Set(ids).size !== ids.length) {
                    error(`program.target.${field}`, '중복 ID가 있습니다.');
                }
                if (allowed) ids.forEach(id => {
                    if (!allowed.has(id)) error(`program.target.${field}`, `없는 참조 ${id}입니다.`);
                });
            });
            if (target.channels !== undefined && (
                !Array.isArray(target.channels) ||
                target.channels.length > 3 ||
                target.channels.some(channel => (
                    !['ONLINE', 'OFFLINE', 'OFFICIAL_SITE'].includes(String(channel))
                ))
            )) {
                error('program.target.channels', '허용된 채널 배열이 아닙니다.');
            }
            if (target.purchaseScenario !== undefined) {
                const scenario = target.purchaseScenario;
                if (!isRecord(scenario)) {
                    error('program.target.purchaseScenario', '객체여야 합니다.');
                } else {
                    unknownKeys(scenario, ['id', 'label', 'aliases', 'requiredChecks'])
                        .forEach(key => error(`program.target.purchaseScenario.${key}`, '허용되지 않은 필드입니다.'));
                    if (typeof scenario.id !== 'string' ||
                        !/^[a-z][a-z0-9_]{2,99}$/.test(scenario.id)) {
                        error('program.target.purchaseScenario.id', '안정적인 영문 소문자 ID여야 합니다.');
                    }
                    if (typeof scenario.label !== 'string' ||
                        !scenario.label.trim() || scenario.label.length > 120) {
                        error('program.target.purchaseScenario.label', '1~120자의 이름이어야 합니다.');
                    }
                    if (scenario.aliases !== undefined && (
                        !Array.isArray(scenario.aliases) || scenario.aliases.length > 8 ||
                        scenario.aliases.some(alias => typeof alias !== 'string' ||
                            !alias.trim() || alias.length > 120) ||
                        new Set(scenario.aliases).size !== scenario.aliases.length
                    )) {
                        error('program.target.purchaseScenario.aliases', '중복 없는 8개 이하의 별칭이어야 합니다.');
                    }
                    if (!Array.isArray(scenario.requiredChecks) ||
                        scenario.requiredChecks.length < 1 || scenario.requiredChecks.length > 8 ||
                        scenario.requiredChecks.some(check => typeof check !== 'string' ||
                            !check.trim() || check.length > 300) ||
                        new Set(scenario.requiredChecks).size !== scenario.requiredChecks.length) {
                        error('program.target.purchaseScenario.requiredChecks', '중복 없는 1~8개의 확인 문구가 필요합니다.');
                    }
                }
                if (['includedBrandIds', 'excludedBrandIds', 'categoryIds'].some(field => (
                    Array.isArray(target[field]) && target[field].length > 0
                ))) {
                    error('program.target.purchaseScenario', '결제 상황과 브랜드·카테고리 범위를 동시에 지정할 수 없습니다.');
                }
            }
        }
    }
    if (infer(value.eligibility, 'program.eligibility', 1) !== 'boolean') {
        error('program.eligibility', '불리언 표현식이어야 합니다.');
    }
    if (infer(value.benefit, 'program.benefit', 1) !== 'number') {
        error('program.benefit', '숫자 표현식이어야 합니다.');
    }
    if (value.limits !== undefined) {
        if (!isRecord(value.limits)) {
            error('program.limits', '객체여야 합니다.');
        } else {
            const allowed = new Set([
                'dailyCount',
                'dailyBenefitAmount',
                'monthlyCount',
                'monthlyBenefitAmount',
                'yearlyCount',
            ]);
            Object.entries(value.limits).forEach(([field, expression]) => {
                if (!allowed.has(field)) {
                    error(`program.limits.${field}`, '허용되지 않은 한도 필드입니다.');
                } else if (infer(expression, `program.limits.${field}`, 1) !== 'number') {
                    error(`program.limits.${field}`, '숫자 표현식이어야 합니다.');
                }
            });
        }
    }
    if (value.cardMonthlyLimit !== undefined &&
        infer(value.cardMonthlyLimit, 'program.cardMonthlyLimit', 1) !== 'number') {
        error('program.cardMonthlyLimit', '숫자 표현식이어야 합니다.');
    }
    if (value.usageGroupId !== undefined && (
        typeof value.usageGroupId !== 'string' ||
        !/^[a-z0-9][a-z0-9_-]{1,99}$/.test(value.usageGroupId)
    )) {
        error('program.usageGroupId', '안정적인 소문자 ID여야 합니다.');
    }
    if (value.usesCardLimit !== undefined && typeof value.usesCardLimit !== 'boolean') {
        error('program.usesCardLimit', '불리언이어야 합니다.');
    }
    if (value.confirmations !== undefined) {
        if (!Array.isArray(value.confirmations) || value.confirmations.length > 20) {
            error('program.confirmations', '20개 이하의 배열이어야 합니다.');
        } else {
            value.confirmations.forEach((confirmation, index) => {
                if (!isRecord(confirmation)) {
                    error(`program.confirmations[${index}]`, '객체여야 합니다.');
                    return;
                }
                unknownKeys(confirmation, ['when', 'message']).forEach(key => {
                    error(
                        `program.confirmations[${index}].${key}`,
                        '허용되지 않은 필드입니다.',
                    );
                });
                if (infer(
                    confirmation.when,
                    `program.confirmations[${index}].when`,
                    1,
                ) !== 'boolean') {
                    error(`program.confirmations[${index}].when`, '불리언 표현식이어야 합니다.');
                }
                if (typeof confirmation.message !== 'string' ||
                    confirmation.message.length < 1 || confirmation.message.length > 300) {
                    error(`program.confirmations[${index}].message`, '1~300자여야 합니다.');
                }
            });
        }
    }
    if (value.reason !== undefined && (
        typeof value.reason !== 'string' || value.reason.length > 300
    )) {
        error('program.reason', '300자 이하 문자열이어야 합니다.');
    }

    return { valid: errors.length === 0, errors, nodeCount, maxDepth };
}

export interface BenefitProgramEvidenceNode {
    path: string;
    literalValue?: number | string | boolean | null;
}

export function listBenefitProgramEvidenceNodes(
    program: BenefitProgramV1,
): BenefitProgramEvidenceNode[] {
    const nodes: BenefitProgramEvidenceNode[] = [];
    const active = new WeakSet<object>();
    const visitExpression = (expression: BenefitDslExpression, path: string, depth: number) => {
        if (depth > BENEFIT_DSL_MAX_DEPTH || active.has(expression)) return;
        active.add(expression);
        nodes.push({
            path,
            ...(expression.op === 'literal' && { literalValue: expression.value }),
        });
        switch (expression.op) {
            case 'arithmetic':
            case 'logic':
                expression.operands.forEach((operand, index) => {
                    visitExpression(operand, `${path}.operands[${index}]`, depth + 1);
                });
                break;
            case 'round':
            case 'not':
            case 'in':
                visitExpression(expression.value, `${path}.value`, depth + 1);
                break;
            case 'compare':
                visitExpression(expression.left, `${path}.left`, depth + 1);
                visitExpression(expression.right, `${path}.right`, depth + 1);
                break;
            case 'case':
                expression.branches.forEach((branch, index) => {
                    visitExpression(branch.when, `${path}.branches[${index}].when`, depth + 1);
                    visitExpression(branch.then, `${path}.branches[${index}].then`, depth + 1);
                });
                visitExpression(expression.otherwise, `${path}.otherwise`, depth + 1);
                break;
            case 'aggregate':
            case 'isTopGroup':
                if (expression.where) {
                    visitExpression(expression.where, `${path}.where`, depth + 1);
                }
                break;
            case 'literal':
            case 'input':
                break;
        }
        active.delete(expression);
    };

    (['includedBrandIds', 'excludedBrandIds', 'categoryIds', 'channels'] as const)
        .forEach(field => {
            if (program.target?.[field]?.length) nodes.push({ path: `program.target.${field}` });
        });
    if (program.target?.purchaseScenario) {
        nodes.push({ path: 'program.target.purchaseScenario' });
        nodes.push({ path: 'program.target.purchaseScenario.label' });
        program.target.purchaseScenario.requiredChecks.forEach((_, index) => {
            nodes.push({ path: `program.target.purchaseScenario.requiredChecks[${index}]` });
        });
    }
    visitExpression(program.eligibility, 'program.eligibility', 1);
    visitExpression(program.benefit, 'program.benefit', 1);
    if (program.limits) {
        (Object.entries(program.limits) as Array<[
            keyof NonNullable<BenefitProgramV1['limits']>,
            BenefitDslExpression,
        ]>).forEach(([field, expression]) => {
            visitExpression(expression, `program.limits.${field}`, 1);
        });
    }
    if (program.usageGroupId) nodes.push({ path: 'program.usageGroupId' });
    if (program.usesCardLimit !== undefined) nodes.push({ path: 'program.usesCardLimit' });
    if (program.cardMonthlyLimit) {
        visitExpression(program.cardMonthlyLimit, 'program.cardMonthlyLimit', 1);
    }
    program.confirmations?.forEach((confirmation, index) => {
        visitExpression(confirmation.when, `program.confirmations[${index}].when`, 1);
        nodes.push({ path: `program.confirmations[${index}].message` });
    });
    if (program.reason) nodes.push({ path: 'program.reason' });
    return nodes;
}

export function listBenefitProgramEvidencePaths(program: BenefitProgramV1): string[] {
    return listBenefitProgramEvidenceNodes(program).map(node => node.path);
}

const stableDslValue = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map(stableDslValue).join(',')}]`;
    return `{${Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${stableDslValue(item)}`)
        .join(',')}}`;
};

export function validateBenefitProgramSet(rules: BenefitRule[]) {
    const errors: string[] = [];
    const grouped = new Map<string, BenefitRule[]>();
    const scenarios = new Map<string, string>();
    rules.forEach(rule => {
        const program = rule.program;
        if (!program) return;
        const scenario = program.target?.purchaseScenario;
        if (scenario) {
            if (!scenario.id.startsWith(`${rule.cardId}_`)) {
                errors.push(`결제 상황 ${scenario.id}의 ID는 카드 ID ${rule.cardId}로 시작해야 합니다.`);
            }
            const definition = stableDslValue(scenario);
            const previous = scenarios.get(scenario.id);
            if (previous && previous !== definition) {
                errors.push(`결제 상황 ${scenario.id}의 이름·확인 조건이 규칙마다 다릅니다.`);
            }
            scenarios.set(scenario.id, definition);
        }
        if (program.cardMonthlyLimit && program.usesCardLimit === false) {
            errors.push(`카드 통합 한도를 쓰지 않는 DSL에 카드 월 한도가 있습니다: ${rule.description}`);
        }
        if (!program.usageGroupId) return;
        const members = grouped.get(program.usageGroupId) ?? [];
        members.push(rule);
        grouped.set(program.usageGroupId, members);
    });
    grouped.forEach((members, groupId) => {
        const limitShapes = new Set(members.map(rule => stableDslValue(rule.program?.limits ?? {})));
        if (limitShapes.size > 1) {
            errors.push(`DSL 공유 한도 그룹 ${groupId}의 한도 식이 서로 다릅니다.`);
        }
    });
    const cardLimitPrograms = rules.filter(rule => (
        rule.program?.usesCardLimit !== false && rule.program?.cardMonthlyLimit
    ));
    const cardLimitShapes = new Set(cardLimitPrograms.map(rule => (
        stableDslValue(rule.program?.cardMonthlyLimit)
    )));
    if (cardLimitShapes.size > 1) {
        errors.push('같은 카드의 DSL 카드 월 한도 식이 서로 다릅니다.');
    }
    return errors;
}

const assertNumber = (value: number | string | boolean | null, path: string) => {
    if (!isSafeDslNumber(value)) throw new Error(`${path}의 결과가 안전한 숫자가 아닙니다.`);
    return value;
};

const assertBoolean = (value: number | string | boolean | null, path: string) => {
    if (typeof value !== 'boolean') throw new Error(`${path}의 결과가 불리언이 아닙니다.`);
    return value;
};

const evaluateExpression = (
    expression: BenefitDslExpression,
    context: InternalEvaluationContext,
    path: string = 'expression',
): number | string | boolean | null => {
    switch (expression.op) {
        case 'literal': return expression.value;
        case 'input': return inputValue(expression.name, context);
        case 'arithmetic': {
            const operands = expression.operands.map((operand, index) => (
                assertNumber(evaluateExpression(operand, context, `${path}.operands[${index}]`), path)
            ));
            let result: number;
            switch (expression.operator) {
                case 'ADD': result = operands.reduce((sum, value) => sum + value, 0); break;
                case 'SUBTRACT': result = operands[0] - operands[1]; break;
                case 'MULTIPLY': result = operands.reduce((total, value) => total * value, 1); break;
                case 'DIVIDE':
                    if (operands[1] === 0) throw new Error(`${path}에서 0으로 나눌 수 없습니다.`);
                    result = operands[0] / operands[1];
                    break;
                case 'MIN': result = Math.min(...operands); break;
                case 'MAX': result = Math.max(...operands); break;
            }
            if (!isSafeDslNumber(result)) throw new Error(`${path} 산술 결과가 안전 범위를 벗어납니다.`);
            return result;
        }
        case 'round': {
            const value = assertNumber(evaluateExpression(expression.value, context, `${path}.value`), path);
            const quotient = value / expression.unit;
            const rounded = expression.mode === 'FLOOR'
                ? Math.floor(quotient)
                : expression.mode === 'CEIL'
                    ? Math.ceil(quotient)
                    : Math.round(quotient);
            const result = rounded * expression.unit;
            if (!isSafeDslNumber(result)) {
                throw new Error(`${path} 반올림 결과가 안전 범위를 벗어납니다.`);
            }
            return result;
        }
        case 'compare': {
            const left = evaluateExpression(expression.left, context, `${path}.left`);
            const right = evaluateExpression(expression.right, context, `${path}.right`);
            switch (expression.operator) {
                case 'EQ': return left === right;
                case 'NE': return left !== right;
                case 'GT': return (left as number | string) > (right as number | string);
                case 'GTE': return (left as number | string) >= (right as number | string);
                case 'LT': return (left as number | string) < (right as number | string);
                case 'LTE': return (left as number | string) <= (right as number | string);
            }
        }
        case 'logic': {
            if (expression.operator === 'ALL') {
                return expression.operands.every((operand, index) => assertBoolean(
                    evaluateExpression(operand, context, `${path}.operands[${index}]`),
                    path,
                ));
            }
            return expression.operands.some((operand, index) => assertBoolean(
                evaluateExpression(operand, context, `${path}.operands[${index}]`),
                path,
            ));
        }
        case 'not': return !assertBoolean(
            evaluateExpression(expression.value, context, `${path}.value`),
            path,
        );
        case 'in': {
            const value = evaluateExpression(expression.value, context, `${path}.value`);
            return expression.options.some(option => option === value);
        }
        case 'case': {
            const branch = expression.branches.find((candidate, index) => assertBoolean(
                evaluateExpression(candidate.when, context, `${path}.branches[${index}].when`),
                path,
            ));
            return evaluateExpression(branch?.then ?? expression.otherwise, context, `${path}.result`);
        }
        case 'aggregate': {
            const entries = context.history.filter(entry => samePeriod(
                entry.occurredAt,
                context.now,
                expression.period,
            ));
            if (expression.includeCurrent) {
                entries.push({
                    occurredAt: context.now.toISOString(),
                    paymentAmount: context.paymentAmount,
                    benefitAmount: 0,
                    ...(context.brandId && { brandId: context.brandId }),
                    ...(context.categoryId && { categoryId: context.categoryId }),
                    channel: context.channel,
                });
            }
            const filtered = expression.where
                ? entries.filter(entry => assertBoolean(evaluateExpression(
                    expression.where!,
                    { ...context, currentHistoryEntry: entry },
                    `${path}.where`,
                ), path))
                : entries;
            if (expression.function === 'COUNT') return filtered.length;
            return filtered.reduce((total, entry) => (
                total + (expression.field === 'PAYMENT_AMOUNT'
                    ? entry.paymentAmount
                    : entry.benefitAmount)
            ), 0);
        }
        case 'isTopGroup': {
            const entries = context.history.filter(entry => samePeriod(
                entry.occurredAt,
                context.now,
                expression.period,
            ));
            if (expression.includeCurrent) {
                entries.push({
                    occurredAt: context.now.toISOString(),
                    paymentAmount: context.paymentAmount,
                    benefitAmount: 0,
                    ...(context.brandId && { brandId: context.brandId }),
                    ...(context.categoryId && { categoryId: context.categoryId }),
                    channel: context.channel,
                });
            }
            const filtered = expression.where
                ? entries.filter(entry => assertBoolean(evaluateExpression(
                    expression.where!,
                    { ...context, currentHistoryEntry: entry },
                    `${path}.where`,
                ), path))
                : entries;
            const currentGroup = expression.groupBy === 'BRAND_ID'
                ? context.brandId
                : context.categoryId;
            if (!currentGroup) return false;
            const totals = new Map<string, number>();
            filtered.forEach(entry => {
                const group = expression.groupBy === 'BRAND_ID'
                    ? entry.brandId
                    : entry.categoryId;
                if (!group) return;
                const amount = expression.metric === 'PAYMENT_AMOUNT' ? entry.paymentAmount : 1;
                totals.set(group, (totals.get(group) ?? 0) + amount);
            });
            const currentTotal = totals.get(currentGroup);
            return currentTotal !== undefined && currentTotal === Math.max(...totals.values());
        }
    }
};

const channelMatches = (
    channels: NonNullable<BenefitDslTarget['channels']>,
    channel: BenefitDslEvaluationContext['channel'],
) => channels.includes(channel) || (channel === 'ONLINE' && channels.includes('OFFICIAL_SITE'));

export const matchesBenefitProgramTarget = (
    target: BenefitDslTarget | undefined,
    context: Pick<BenefitDslEvaluationContext, 'brandId' | 'categoryId' | 'purchaseScenarioId' | 'channel'>,
) => {
    if (!target) return true;
    if (target.purchaseScenario && target.purchaseScenario.id !== context.purchaseScenarioId) return false;
    if (target.excludedBrandIds?.includes(context.brandId ?? '')) return false;
    if (target.channels?.length && !channelMatches(target.channels, context.channel)) return false;
    if (target.includedBrandIds?.length) {
        return context.brandId !== undefined && target.includedBrandIds.includes(context.brandId);
    }
    if (target.categoryIds?.length) {
        return context.categoryId !== undefined && target.categoryIds.includes(context.categoryId);
    }
    return true;
};

export const getBenefitProgramSpecificity = (
    target: BenefitDslTarget | undefined,
    context: Pick<BenefitDslEvaluationContext, 'brandId' | 'categoryId' | 'purchaseScenarioId' | 'channel'>,
) => {
    if (!matchesBenefitProgramTarget(target, context)) return 0;
    if (target?.purchaseScenario) return 3;
    if (target?.includedBrandIds?.includes(context.brandId ?? '')) return 3;
    if (target?.categoryIds?.includes(context.categoryId ?? '')) return 2;
    return 1;
};

const evaluatedLimit = (
    expression: BenefitDslExpression | undefined,
    context: InternalEvaluationContext,
    path: string,
) => expression === undefined
    ? undefined
    : Math.max(0, Math.floor(assertNumber(evaluateExpression(expression, context, path), path)));

export function evaluateBenefitProgram(
    program: BenefitProgramV1,
    context: BenefitDslEvaluationContext,
    confirmed: boolean = false,
): BenefitDslEvaluationResult {
    const validation = validateBenefitProgram(program);
    if (!validation.valid) {
        return {
            eligible: false,
            benefitAmount: 0,
            certainty: 'CONFIRMED',
            requiredChecks: [],
            reason: '지원하지 않는 혜택 규칙',
            errors: validation.errors,
        };
    }
    if (context.history.length > BENEFIT_DSL_MAX_HISTORY_ENTRIES) {
        return {
            eligible: false,
            benefitAmount: 0,
            certainty: 'CONFIRMED',
            requiredChecks: [],
            reason: '혜택 계산 이력 범위 초과',
            errors: [`거래 이력이 ${BENEFIT_DSL_MAX_HISTORY_ENTRIES}건을 초과합니다.`],
        };
    }
    try {
        if (!matchesBenefitProgramTarget(program.target, context)) {
            return {
                eligible: false,
                benefitAmount: 0,
                certainty: 'CONFIRMED',
                requiredChecks: [],
                reason: '혜택 적용 결제처 또는 채널 아님',
                errors: [],
            };
        }
        if (!assertBoolean(evaluateExpression(program.eligibility, context), 'eligibility')) {
            return {
                eligible: false,
                benefitAmount: 0,
                certainty: 'CONFIRMED',
                requiredChecks: [],
                reason: '혜택 조건 미충족',
                errors: [],
            };
        }

        const limits = program.limits;
        const dailyCount = evaluatedLimit(limits?.dailyCount, context, 'limits.dailyCount');
        const dailyAmount = evaluatedLimit(
            limits?.dailyBenefitAmount,
            context,
            'limits.dailyBenefitAmount',
        );
        const monthlyCount = evaluatedLimit(limits?.monthlyCount, context, 'limits.monthlyCount');
        const monthlyAmount = evaluatedLimit(
            limits?.monthlyBenefitAmount,
            context,
            'limits.monthlyBenefitAmount',
        );
        const yearlyCount = evaluatedLimit(limits?.yearlyCount, context, 'limits.yearlyCount');
        if (dailyCount !== undefined && context.usage.dailyCount >= dailyCount) {
            return { eligible: false, benefitAmount: 0, certainty: 'CONFIRMED', requiredChecks: [], reason: '일 횟수 제한 초과', errors: [] };
        }
        if (dailyAmount !== undefined && context.usage.dailyBenefitAmount >= dailyAmount) {
            return { eligible: false, benefitAmount: 0, certainty: 'CONFIRMED', requiredChecks: [], reason: '일 혜택 한도 소진', errors: [] };
        }
        if (monthlyCount !== undefined && context.usage.monthlyCount >= monthlyCount) {
            return { eligible: false, benefitAmount: 0, certainty: 'CONFIRMED', requiredChecks: [], reason: '월 횟수 제한 초과', errors: [] };
        }
        if (monthlyAmount !== undefined && context.usage.monthlyBenefitAmount >= monthlyAmount) {
            return { eligible: false, benefitAmount: 0, certainty: 'CONFIRMED', requiredChecks: [], reason: '월 혜택 한도 소진', errors: [] };
        }
        if (yearlyCount !== undefined && context.usage.yearlyCount >= yearlyCount) {
            return { eligible: false, benefitAmount: 0, certainty: 'CONFIRMED', requiredChecks: [], reason: '연 횟수 제한 초과', errors: [] };
        }

        let benefitAmount = Math.max(
            0,
            Math.floor(assertNumber(evaluateExpression(program.benefit, context), 'benefit')),
        );
        let reason = program.reason || 'DSL 혜택 적용';
        if (dailyAmount !== undefined) {
            const remaining = Math.max(0, dailyAmount - context.usage.dailyBenefitAmount);
            if (benefitAmount > remaining) {
                benefitAmount = remaining;
                reason = `일 혜택 한도 잔여(${remaining}원) 적용`;
            }
        }
        if (monthlyAmount !== undefined) {
            const remaining = Math.max(0, monthlyAmount - context.usage.monthlyBenefitAmount);
            if (benefitAmount > remaining) {
                benefitAmount = remaining;
                reason = `혜택 한도 잔여(${remaining}원) 적용`;
            }
        }
        if (program.usesCardLimit !== false) {
            const remaining = Math.max(
                0,
                context.cardBaseMonthlyLimit - context.cardUsedBenefitAmount,
            );
            if (benefitAmount > remaining) {
                benefitAmount = remaining;
                reason = remaining > 0
                    ? `통합 한도 잔여(${remaining}원) 적용`
                    : '월 통합 한도 소진';
            }
        }
        benefitAmount = Math.min(context.remainingPaymentAmount, benefitAmount);

        const requiredChecks = [
            ...(program.target?.purchaseScenario?.requiredChecks ?? []),
            ...(program.confirmations ?? [])
            .filter(confirmation => assertBoolean(
                evaluateExpression(confirmation.when, context),
                'confirmation.when',
            ))
            .map(confirmation => confirmation.message),
        ];
        return {
            eligible: benefitAmount > 0,
            benefitAmount,
            certainty: requiredChecks.length > 0 && !confirmed ? 'CONDITIONAL' : 'CONFIRMED',
            requiredChecks,
            reason: benefitAmount > 0 ? reason : '혜택 없음',
            errors: [],
        };
    } catch (error) {
        return {
            eligible: false,
            benefitAmount: 0,
            certainty: 'CONFIRMED',
            requiredChecks: [],
            reason: '혜택 규칙 계산 실패',
            errors: [error instanceof Error ? error.message : '알 수 없는 DSL 계산 오류'],
        };
    }
}

export function evaluateBenefitProgramCardMonthlyLimit(
    program: BenefitProgramV1,
    context: BenefitDslEvaluationContext,
) {
    if (!program.cardMonthlyLimit) return undefined;
    const validation = validateBenefitProgram(program);
    if (!validation.valid) return 0;
    try {
        return Math.max(0, Math.floor(assertNumber(
            evaluateExpression(program.cardMonthlyLimit, context),
            'cardMonthlyLimit',
        )));
    } catch {
        return 0;
    }
}

const literal = (value: number | string | boolean | null): BenefitDslExpression => ({
    op: 'literal',
    value,
});
const input = (name: BenefitDslInputName): BenefitDslExpression => ({ op: 'input', name });
const compare = (
    operator: 'EQ' | 'GTE' | 'LTE' | 'LT',
    left: BenefitDslExpression,
    right: BenefitDslExpression,
): BenefitDslExpression => ({ op: 'compare', operator, left, right });
const all = (operands: BenefitDslExpression[]): BenefitDslExpression => (
    operands.length === 1 ? operands[0] : { op: 'logic', operator: 'ALL', operands }
);
const any = (operands: BenefitDslExpression[]): BenefitDslExpression => (
    operands.length === 1 ? operands[0] : { op: 'logic', operator: 'ANY', operands }
);

const tierExpression = (tiers: LimitTableItem[]): BenefitDslExpression => ({
    op: 'case',
    branches: [...tiers]
        .sort((left, right) => right.threshold - left.threshold)
        .map(tier => ({
            when: compare('GTE', input('CARD_PERFORMANCE'), literal(tier.threshold)),
            then: literal(tier.limit),
        })),
    otherwise: literal(0),
});

export function compileLegacyBenefitRule(rule: BenefitRule): BenefitProgramV1 {
    const condition = rule.condition ?? {};
    const amountInput = condition.itemSpecific
        ? input('ELIGIBLE_ITEM_AMOUNT')
        : rule.action.amountBasis === 'REMAINING_AMOUNT'
            ? input('REMAINING_PAYMENT_AMOUNT')
            : input('PAYMENT_AMOUNT');
    const eligibility: BenefitDslExpression[] = [];
    if (condition.itemSpecific) eligibility.push(input('ELIGIBLE_ITEM_AMOUNT_PROVIDED'));
    if (condition.minSpend !== undefined) {
        eligibility.push(compare('GTE', amountInput, literal(condition.minSpend)));
    }
    if (condition.maxSpend !== undefined) {
        eligibility.push(compare('LTE', amountInput, literal(condition.maxSpend)));
    }
    if (condition.maxSpendExclusive !== undefined) {
        eligibility.push(compare('LT', amountInput, literal(condition.maxSpendExclusive)));
    }
    if (condition.minPerformance !== undefined && condition.minPerformance > 0) {
        const performance = compare(
            'GTE',
            input('CARD_PERFORMANCE'),
            literal(condition.minPerformance),
        );
        eligibility.push(condition.performanceWaiver === 'NEW_CARD_REGISTRATION_WINDOW'
            ? any([performance, input('NEW_CARD_WINDOW_AVAILABLE')])
            : performance);
    }
    if (condition.startsAt) {
        eligibility.push(compare('GTE', input('CURRENT_DATE'), literal(condition.startsAt)));
    }
    if (condition.endsAt) {
        eligibility.push(compare('LTE', input('CURRENT_DATE'), literal(condition.endsAt)));
    }
    if (condition.daysOfWeek?.length) {
        eligibility.push({
            op: 'in',
            value: input('CURRENT_WEEKDAY'),
            options: condition.daysOfWeek,
        });
    }
    if (condition.timeRanges?.length) {
        eligibility.push(any(condition.timeRanges.map(range => {
            const [startHour, startMinute] = range.startTime.split(':').map(Number);
            const [endHour, endMinute] = range.endTime.split(':').map(Number);
            const start = startHour * 60 + startMinute;
            const end = endHour * 60 + endMinute;
            if (start === end) return literal(true);
            if (start < end) return all([
                compare('GTE', input('CURRENT_MINUTE'), literal(start)),
                compare('LT', input('CURRENT_MINUTE'), literal(end)),
            ]);
            return any([
                compare('GTE', input('CURRENT_MINUTE'), literal(start)),
                compare('LT', input('CURRENT_MINUTE'), literal(end)),
            ]);
        })));
    }
    if (condition.requiredCardNetwork) {
        eligibility.push(any([
            compare('EQ', input('CARD_NETWORK'), literal(condition.requiredCardNetwork)),
            compare('EQ', input('CARD_NETWORK'), literal(null)),
        ]));
    }

    let benefit: BenefitDslExpression;
    if (rule.action.type === 'PERCENT') {
        benefit = {
            op: 'round',
            mode: 'FLOOR',
            unit: 1,
            value: {
                op: 'arithmetic',
                operator: 'MULTIPLY',
                operands: [amountInput, literal(rule.action.value / 100)],
            },
        };
        if (rule.action.maxDiscount !== undefined) {
            benefit = {
                op: 'arithmetic',
                operator: 'MIN',
                operands: [benefit, literal(rule.action.maxDiscount)],
            };
        }
    } else if (rule.action.type === 'FIXED_PRICE') {
        benefit = {
            op: 'arithmetic',
            operator: 'MAX',
            operands: [{
                op: 'arithmetic',
                operator: 'SUBTRACT',
                operands: [amountInput, literal(rule.action.value)],
            }, literal(0)],
        };
    } else {
        benefit = literal(rule.action.value);
    }

    const monthlyTiers = rule.limitConfig.monthlyAmountByPerformance;
    let monthlyBenefitAmount = monthlyTiers?.length
        ? tierExpression(monthlyTiers)
        : rule.limitConfig.monthlyAmount !== undefined
            ? literal(rule.limitConfig.monthlyAmount)
            : undefined;
    if (monthlyTiers?.length &&
        condition.performanceWaiver === 'NEW_CARD_REGISTRATION_WINDOW' &&
        (condition.minPerformance ?? 0) > 0) {
        const firstTier = [...monthlyTiers]
            .filter(tier => tier.threshold > 0 && tier.limit > 0)
            .sort((left, right) => left.threshold - right.threshold)[0];
        if (firstTier) {
            monthlyBenefitAmount = {
                op: 'case',
                branches: [{
                    when: all([
                        compare('LT', input('CARD_PERFORMANCE'), literal(condition.minPerformance!)),
                        input('NEW_CARD_WINDOW_AVAILABLE'),
                    ]),
                    then: literal(firstTier.limit),
                }],
                otherwise: monthlyBenefitAmount ?? literal(0),
            };
        }
    }

    const confirmations = [] as NonNullable<BenefitProgramV1['confirmations']>;
    if (condition.requiredCardNetwork) {
        confirmations.push({
            when: compare('EQ', input('CARD_NETWORK'), literal(null)),
            message: `${condition.requiredCardNetwork} 브랜드 카드인지 확인`,
        });
    }
    if (condition.performanceWaiver === 'NEW_CARD_REGISTRATION_WINDOW' &&
        (condition.minPerformance ?? 0) > 0) {
        confirmations.push({
            when: all([
                compare('LT', input('CARD_PERFORMANCE'), literal(condition.minPerformance!)),
                input('NEW_CARD_WINDOW_AVAILABLE'),
            ]),
            message: '신규 발급 후 등록월의 다음 달 말 이내인지 확인',
        });
    }
    if (condition.manualCheckRequired || condition.confirmationRequired) {
        confirmations.push({
            when: literal(true),
            message: condition.requiredNote || '혜택 제외 조건 확인',
        });
    }

    return {
        languageVersion: 1,
        target: {
            ...(rule.includedBrands?.length && { includedBrandIds: rule.includedBrands }),
            ...(rule.excludedBrands?.length && { excludedBrandIds: rule.excludedBrands }),
            ...(!rule.includedBrands?.length && rule.category && { categoryIds: [rule.category] }),
            ...(rule.platformType && rule.platformType !== 'ALL' && {
                channels: [rule.platformType],
            }),
        },
        eligibility: eligibility.length > 0 ? all(eligibility) : literal(true),
        benefit,
        ...((rule.limitConfig.dailyCount !== undefined ||
            rule.limitConfig.dailyAmount !== undefined ||
            rule.limitConfig.monthlyCount !== undefined ||
            monthlyBenefitAmount !== undefined ||
            rule.limitConfig.yearlyCount !== undefined) && {
            limits: {
                ...(rule.limitConfig.dailyCount !== undefined && {
                    dailyCount: literal(rule.limitConfig.dailyCount),
                }),
                ...(rule.limitConfig.dailyAmount !== undefined && {
                    dailyBenefitAmount: literal(rule.limitConfig.dailyAmount),
                }),
                ...(rule.limitConfig.monthlyCount !== undefined && {
                    monthlyCount: literal(rule.limitConfig.monthlyCount),
                }),
                ...(monthlyBenefitAmount && { monthlyBenefitAmount }),
                ...(rule.limitConfig.yearlyCount !== undefined && {
                    yearlyCount: literal(rule.limitConfig.yearlyCount),
                }),
            },
        }),
        ...(rule.sharedGroupId && { usageGroupId: rule.sharedGroupId }),
        usesCardLimit: rule.usesCardLimit ?? true,
        ...(confirmations.length > 0 && { confirmations }),
        reason: rule.description,
    };
}
