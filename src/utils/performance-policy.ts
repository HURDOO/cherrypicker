import type {
    CardPerformancePolicyV1,
    CardPerformancePredicate,
    PerformanceContribution,
    PerformanceTransactionTag,
} from '@/types/performance-policy';
import type { CombinationStep } from '@/types';

const MAX_RULES = 32;
const MAX_NODES = 128;
const MAX_DEPTH = 12;
const TRANSACTION_TAGS = new Set<PerformanceTransactionTag>([
    'STANDARD_PURCHASE',
    'INTEREST_FREE_INSTALLMENT',
    'GIFT_CARD_OR_PREPAID',
    'TAX_OR_PUBLIC_CHARGE',
    'HOUSING_OR_EDUCATION',
    'INSURANCE_OR_UTILITY',
    'FEE_OR_INTEREST',
    'UNAPPROVED_SLIP',
]);
const TAG_QUOTE_HINTS: Partial<Record<PerformanceTransactionTag, RegExp>> = {
    INTEREST_FREE_INSTALLMENT: /무이자\s*할부/,
    GIFT_CARD_OR_PREPAID: /상품권|선불/,
    TAX_OR_PUBLIC_CHARGE: /국세|지방세|공과금/,
    HOUSING_OR_EDUCATION: /아파트\s*관리비|학교\s*납입금|등록금/,
    INSURANCE_OR_UTILITY: /사회\s*보험료|도시\s*가스|전기|수도/,
    FEE_OR_INTEREST: /수수료|이자|연체료|연회비/,
    UNAPPROVED_SLIP: /무승인\s*전표/,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
    Object.keys(value).every(key => keys.includes(key));

export function validateCardPerformancePolicy(
    value: unknown,
    ruleIds?: ReadonlySet<string>,
): string[] {
    const errors: string[] = [];
    if (!isRecord(value) || !exactKeys(value, ['version', 'exclusionRules']) ||
        value.version !== 1 || !Array.isArray(value.exclusionRules) ||
        value.exclusionRules.length > MAX_RULES) {
        return ['카드 실적 정책의 버전 또는 규칙 목록이 올바르지 않습니다.'];
    }
    let nodeCount = 0;
    const visited = new WeakSet<object>();
    const visit = (predicate: unknown, depth: number, quote: string): void => {
        if (!isRecord(predicate) || visited.has(predicate) || depth > MAX_DEPTH ||
            ++nodeCount > MAX_NODES) {
            errors.push('카드 실적 정책 조건의 구조·깊이·노드 수가 올바르지 않습니다.');
            return;
        }
        visited.add(predicate);
        if (predicate.op === 'CARD_DISCOUNT_APPLIED') {
            if (!exactKeys(predicate, ['op', 'ruleIds']) ||
                (predicate.ruleIds !== undefined && (!Array.isArray(predicate.ruleIds) ||
                    predicate.ruleIds.length > 100 ||
                    predicate.ruleIds.some(id => typeof id !== 'string' ||
                        (ruleIds !== undefined && !ruleIds.has(id)))))) {
                errors.push('카드 할인 실적 조건의 규칙 참조가 올바르지 않습니다.');
            }
            if (!/할인/.test(quote) || !/매출|이용\s*금액|거래/.test(quote)) {
                errors.push('카드 할인 매출 제외가 연결된 공식 인용으로 뒷받침되지 않습니다.');
            }
        } else if (predicate.op === 'TRANSACTION_TAG_IN') {
            if (!exactKeys(predicate, ['op', 'tags']) || !Array.isArray(predicate.tags) ||
                predicate.tags.length === 0 || predicate.tags.length > TRANSACTION_TAGS.size ||
                predicate.tags.some(tag => !TRANSACTION_TAGS.has(tag) ||
                    tag === 'STANDARD_PURCHASE')) {
                errors.push('카드 실적 거래 종류 조건이 올바르지 않습니다.');
            } else if (predicate.tags.some(tag => !TAG_QUOTE_HINTS[
                tag as PerformanceTransactionTag
            ]?.test(quote))) {
                errors.push('카드 실적 거래 종류가 연결된 공식 인용으로 뒷받침되지 않습니다.');
            }
        } else if (predicate.op === 'ALL' || predicate.op === 'ANY') {
            if (!exactKeys(predicate, ['op', 'operands']) ||
                !Array.isArray(predicate.operands) || predicate.operands.length < 2 ||
                predicate.operands.length > 16) {
                errors.push('카드 실적 복합 조건이 올바르지 않습니다.');
                return;
            }
            predicate.operands.forEach(child => visit(child, depth + 1, quote));
        } else {
            errors.push('허용되지 않은 카드 실적 조건 연산자입니다.');
        }
    };
    const ids = new Set<string>();
    value.exclusionRules.forEach((rule, index) => {
        if (!isRecord(rule) || !exactKeys(rule, ['id', 'when', 'reason', 'sourceUrl', 'quote', 'page']) ||
            typeof rule.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{2,99}$/.test(rule.id) ||
            ids.has(rule.id) || typeof rule.reason !== 'string' || !rule.reason.trim() ||
            typeof rule.sourceUrl !== 'string' || typeof rule.quote !== 'string' ||
            rule.quote.trim().length < 3 || rule.quote.length > 500 ||
            rule.reason.length > 500 || rule.sourceUrl.length > 2_000 ||
            (rule.page !== undefined && (!Number.isSafeInteger(rule.page) || Number(rule.page) < 1))) {
            errors.push(`카드 실적 제외 규칙 ${index + 1}번이 올바르지 않습니다.`);
            return;
        }
        ids.add(rule.id);
        try {
            if (new URL(rule.sourceUrl).protocol !== 'https:') throw new Error();
        } catch {
            errors.push(`카드 실적 제외 규칙 ${index + 1}번의 공식 URL이 올바르지 않습니다.`);
        }
        visit(rule.when, 1, rule.quote);
    });
    return [...new Set(errors)];
}

type ThreeState = true | false | 'UNKNOWN';

function evaluatePredicate(
    predicate: CardPerformancePredicate,
    cardId: string,
    steps: CombinationStep[],
    transactionTag?: PerformanceTransactionTag,
): ThreeState {
    if (predicate.op === 'CARD_DISCOUNT_APPLIED') {
        const matches = steps.filter(step => step.cardId === cardId && step.isImmediate &&
            step.benefitAmount > 0 && (!predicate.ruleIds ||
                Boolean(step.ruleId && predicate.ruleIds.includes(step.ruleId))));
        if (matches.some(step => step.certainty === 'CONFIRMED')) return true;
        return matches.some(step => step.certainty === 'CONDITIONAL') ? 'UNKNOWN' : false;
    }
    if (predicate.op === 'TRANSACTION_TAG_IN') {
        return transactionTag !== undefined && predicate.tags.includes(transactionTag);
    }
    const results = predicate.operands.map(child => evaluatePredicate(
        child, cardId, steps, transactionTag,
    ));
    if (predicate.op === 'ALL') {
        if (results.includes(false)) return false;
        return results.includes('UNKNOWN') ? 'UNKNOWN' : true;
    }
    if (results.includes(true)) return true;
    return results.includes('UNKNOWN') ? 'UNKNOWN' : false;
}

export function calculatePerformanceContribution(input: {
    policy?: CardPerformancePolicyV1;
    cardId: string;
    cardChargeAmount: number;
    steps: CombinationStep[];
    transactionTag?: PerformanceTransactionTag;
}): PerformanceContribution {
    const charge = Math.max(0, Math.floor(input.cardChargeAmount));
    if (!Number.isFinite(charge) || !Number.isSafeInteger(charge)) {
        return { amount: 0, status: 'UNKNOWN', reason: '카드 승인금액을 확인할 수 없습니다.' };
    }
    if (input.transactionTag !== undefined && !TRANSACTION_TAGS.has(input.transactionTag)) {
        return { amount: 0, status: 'UNKNOWN', reason: '거래 종류를 확인할 수 없습니다.' };
    }
    if (input.policy === undefined) {
        return {
            amount: charge,
            status: 'CONFIRMED',
            reason: '등록된 실적 제외 규칙이 없어 카드 승인금액을 예상 실적에 반영합니다.',
        };
    }
    if (validateCardPerformancePolicy(input.policy).length > 0) {
        return { amount: 0, status: 'UNKNOWN', reason: '카드 실적 정책을 확인할 수 없습니다.' };
    }
    let unknown = false;
    for (const rule of input.policy.exclusionRules) {
        const matched = evaluatePredicate(
            rule.when, input.cardId, input.steps, input.transactionTag,
        );
        if (matched === true) {
            return {
                amount: 0,
                status: 'CONFIRMED',
                reason: rule.reason,
                policyVersion: input.policy.version,
            };
        }
        if (matched === 'UNKNOWN') unknown = true;
    }
    if (unknown) {
        return {
            amount: 0,
            status: 'UNKNOWN',
            reason: '카드 할인 적용 여부를 확인해야 실적 포함 여부를 알 수 있습니다.',
            policyVersion: input.policy.version,
        };
    }
    return {
        amount: charge,
        status: 'CONFIRMED',
        reason: '등록된 카드별 실적 제외 규칙에 해당하지 않는 승인금액',
        policyVersion: input.policy.version,
    };
}
