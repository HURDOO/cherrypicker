import {
    BenefitRule,
    Brand,
    CalculatedCard,
    Card,
    LimitConfig,
    RuleAction,
    TransactionHistory,
    UserCardPerformance,
} from '@/types';

type RuleUsage = {
    dailyCount: number;
    monthlyCount: number;
    yearlyCount: number;
    monthlyAmount: number;
    isDailyLimitReached?: boolean;
    isMonthlyLimitReached?: boolean;
    isYearlyLimitReached?: boolean;
    isMonthlyAmountLimitReached?: boolean;
};

type RuleEvaluation = {
    rule: BenefitRule;
    discount: number;
    reason: string;
    isApplicable: boolean;
    usage: RuleUsage;
};

type CalculationContext = {
    usageByCard: Map<string, Map<string, RuleUsage>>;
    monthlyDiscountByCard: Map<string, number>;
    integratedMonthlyDiscountByCard: Map<string, number>;
};

const INFINITE_LIMIT = 999999999;
const KST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;

const getKstDateParts = (date: Date) => {
    const kstDate = new Date(date.getTime() + KST_OFFSET_MILLISECONDS);
    return {
        year: kstDate.getUTCFullYear(),
        month: kstDate.getUTCMonth(),
        day: kstDate.getUTCDate(),
    };
};

const isToday = (dateStr: string) => {
    const date = getKstDateParts(new Date(dateStr));
    const now = getKstDateParts(new Date());
    return date.year === now.year && date.month === now.month && date.day === now.day;
};

const isThisMonth = (dateStr: string) => {
    const date = getKstDateParts(new Date(dateStr));
    const now = getKstDateParts(new Date());
    return date.month === now.month && date.year === now.year;
};

const isThisYear = (dateStr: string) => {
    const date = getKstDateParts(new Date(dateStr));
    const now = getKstDateParts(new Date());
    return date.year === now.year;
};

const getSnakeOrCamel = <T>(obj: unknown, camelKey: string, snakeKey: string, fallback: T): T => {
    if (!obj || typeof obj !== 'object') return fallback;
    const record = obj as Record<string, T | undefined>;
    return record[camelKey] ?? record[snakeKey] ?? fallback;
};

const getIncludedBrands = (rule: BenefitRule) =>
    getSnakeOrCamel<string[]>(rule, 'includedBrands', 'included_brands', []);

const getExcludedBrands = (rule: BenefitRule) =>
    getSnakeOrCamel<string[]>(rule, 'excludedBrands', 'excluded_brands', []);

const getPlatformType = (rule: BenefitRule) =>
    getSnakeOrCamel(rule, 'platformType', 'platform_type', 'ALL');

const getSharedGroupId = (rule: BenefitRule) =>
    getSnakeOrCamel<string | undefined>(rule, 'sharedGroupId', 'shared_group_id', undefined);

const getLimitConfig = (rule: BenefitRule): LimitConfig =>
    getSnakeOrCamel<LimitConfig>(rule, 'limitConfig', 'limit_config', {});

const getLimitValue = (limitConfig: LimitConfig, camelKey: keyof LimitConfig, snakeKey: string) =>
    getSnakeOrCamel<number | undefined>(limitConfig, camelKey, snakeKey, undefined);

const getAction = (rule: BenefitRule): RuleAction => rule.action || { type: 'FLAT', value: 0 };

const getActionMaxDiscount = (action: RuleAction) =>
    getSnakeOrCamel<number | undefined>(action, 'maxDiscount', 'max_discount', undefined);

const getConditionMinSpend = (rule: BenefitRule) =>
    getSnakeOrCamel<number | undefined>(rule.condition, 'minSpend', 'min_spend', undefined) || 0;

const getConditionMinPerformance = (rule: BenefitRule) =>
    getSnakeOrCamel<number | undefined>(rule.condition, 'minPerformance', 'min_performance', undefined) || 0;

const getConditionManualCheckRequired = (rule: BenefitRule) =>
    getSnakeOrCamel<boolean>(rule.condition, 'manualCheckRequired', 'manual_check_required', false);

const getConditionRequiredNote = (rule: BenefitRule) =>
    getSnakeOrCamel<string | undefined>(rule.condition, 'requiredNote', 'required_note', undefined);

const ruleUsesCardLimit = (rule: BenefitRule) =>
    getSnakeOrCamel<boolean>(rule, 'usesCardLimit', 'uses_card_limit', true);

const getRuleSpecificity = (rule: BenefitRule, brand: Brand) => {
    const includedBrands = getIncludedBrands(rule);
    if (includedBrands.includes(brand.id)) return 3;
    if (rule.category === brand.categoryId && includedBrands.length === 0) return 2;
    if (!rule.category && includedBrands.length === 0) return 1;
    return 0;
};

const matchesRule = (rule: BenefitRule, brand: Brand) => {
    if (getExcludedBrands(rule).includes(brand.id)) return false;
    return getRuleSpecificity(rule, brand) > 0;
};

const getTrackingId = (rule: BenefitRule) => getSharedGroupId(rule) || rule.id;

const addAmount = (totals: Map<string, number>, cardId: string, amount: number) => {
    totals.set(cardId, (totals.get(cardId) ?? 0) + amount);
};

const buildCalculationContext = (
    rules: BenefitRule[],
    history: TransactionHistory[]
): CalculationContext => {
    const ruleById = new Map(rules.map(rule => [rule.id, rule]));
    const usageByCard = new Map<string, Map<string, RuleUsage>>();
    const monthlyDiscountByCard = new Map<string, number>();
    const integratedMonthlyDiscountByCard = new Map<string, number>();

    history.forEach((transaction) => {
        const isDaily = isToday(transaction.date);
        const isMonthly = isThisMonth(transaction.date);
        const isYearly = isThisYear(transaction.date);
        const transactionRule = transaction.ruleId
            ? ruleById.get(transaction.ruleId)
            : undefined;

        if (isMonthly) {
            addAmount(
                monthlyDiscountByCard,
                transaction.cardId,
                transaction.discountAmount || 0
            );

            if (!transactionRule || ruleUsesCardLimit(transactionRule)) {
                addAmount(
                    integratedMonthlyDiscountByCard,
                    transaction.cardId,
                    transaction.discountAmount || 0
                );
            }
        }

        if (!transactionRule) return;

        let cardUsage = usageByCard.get(transaction.cardId);
        if (!cardUsage) {
            cardUsage = new Map();
            usageByCard.set(transaction.cardId, cardUsage);
        }

        const trackingId = getTrackingId(transactionRule);
        let usage = cardUsage.get(trackingId);
        if (!usage) {
            usage = {
                dailyCount: 0,
                monthlyCount: 0,
                yearlyCount: 0,
                monthlyAmount: 0,
            };
            cardUsage.set(trackingId, usage);
        }

        if (isDaily) usage.dailyCount += 1;
        if (isMonthly) {
            usage.monthlyCount += 1;
            usage.monthlyAmount += transaction.discountAmount || 0;
        }
        if (isYearly) usage.yearlyCount += 1;
    });

    return {
        usageByCard,
        monthlyDiscountByCard,
        integratedMonthlyDiscountByCard,
    };
};

const getUsageStat = (
    matchedRule: BenefitRule,
    card: Card,
    context: CalculationContext,
): RuleUsage => {
    const usage = context.usageByCard
        .get(card.id)
        ?.get(getTrackingId(matchedRule));

    return {
        dailyCount: usage?.dailyCount ?? 0,
        monthlyCount: usage?.monthlyCount ?? 0,
        yearlyCount: usage?.yearlyCount ?? 0,
        monthlyAmount: usage?.monthlyAmount ?? 0,
        isDailyLimitReached: false,
        isMonthlyLimitReached: false,
        isYearlyLimitReached: false,
        isMonthlyAmountLimitReached: false,
    };
};

const getMonthlyMaxLimit = (card: Card, myPerformance: number) => {
    if (!card.limitTable || card.limitTable.length === 0) return INFINITE_LIMIT;

    const sortedTable = [...card.limitTable].sort((a, b) => b.threshold - a.threshold);
    const tier = sortedTable.find(t => myPerformance >= t.threshold);
    return tier ? tier.limit : 0;
};

const getUsedIntegratedLimit = (
    card: Card,
    context: CalculationContext,
) => {
    if (!card.limitTable || card.limitTable.length === 0) {
        return context.monthlyDiscountByCard.get(card.id) ?? 0;
    }

    return context.integratedMonthlyDiscountByCard.get(card.id) ?? 0;
};

const calculateRuleDiscount = (amount: number, action: RuleAction) => {
    if (action.type === 'PERCENT') {
        const rawDiscount = Math.floor(amount * (action.value / 100));
        const maxDiscount = getActionMaxDiscount(action);
        return maxDiscount ? Math.min(rawDiscount, maxDiscount) : rawDiscount;
    }

    if (action.type === 'FLAT') return action.value;
    if (action.type === 'FIXED_PRICE') return Math.max(0, amount - action.value);

    return 0;
};

const evaluateRule = ({
    rule,
    amount,
    card,
    context,
    myPerformance,
    isOnline,
    remainingLimit,
}: {
    rule: BenefitRule;
    amount: number;
    card: Card;
    context: CalculationContext;
    myPerformance: number;
    isOnline: boolean;
    remainingLimit: number;
}): RuleEvaluation => {
    const usage = getUsageStat(rule, card, context);
    const result: RuleEvaluation = {
        rule,
        discount: 0,
        reason: '',
        isApplicable: false,
        usage,
    };

    const platformType = getPlatformType(rule);
    if ((platformType === 'ONLINE' || platformType === 'OFFICIAL_SITE') && !isOnline) {
        result.reason = platformType === 'OFFICIAL_SITE' ? '공식 홈페이지/앱 결제 전용' : '온라인 결제 전용';
        return result;
    }
    if (platformType === 'OFFLINE' && isOnline) {
        result.reason = '현장 결제 전용';
        return result;
    }

    const minSpend = getConditionMinSpend(rule);
    if (amount < minSpend) {
        result.reason = `최소 결제금액(${minSpend.toLocaleString()}원) 부족`;
        return result;
    }

    const minPerformance = getConditionMinPerformance(rule);
    if (myPerformance < minPerformance) {
        result.reason = `실적 조건(${minPerformance.toLocaleString()}원) 부족`;
        return result;
    }

    if (getConditionManualCheckRequired(rule)) {
        result.reason = getConditionRequiredNote(rule) || '추가 조건 확인 필요';
        return result;
    }

    const limitConfig = getLimitConfig(rule);
    const dailyCountLimit = getLimitValue(limitConfig, 'dailyCount', 'daily_count');
    const monthlyCountLimit = getLimitValue(limitConfig, 'monthlyCount', 'monthly_count');
    const yearlyCountLimit = getLimitValue(limitConfig, 'yearlyCount', 'yearly_count');
    const monthlyAmountLimit = getLimitValue(limitConfig, 'monthlyAmount', 'monthly_amount');

    if (dailyCountLimit && usage.dailyCount >= dailyCountLimit) {
        result.reason = '일 횟수 제한 초과';
        usage.isDailyLimitReached = true;
        return result;
    }

    if (monthlyCountLimit && usage.monthlyCount >= monthlyCountLimit) {
        result.reason = '월 횟수 제한 초과';
        usage.isMonthlyLimitReached = true;
        return result;
    }

    if (yearlyCountLimit && usage.yearlyCount >= yearlyCountLimit) {
        result.reason = '연 횟수 제한 초과';
        usage.isYearlyLimitReached = true;
        return result;
    }

    if (monthlyAmountLimit && usage.monthlyAmount >= monthlyAmountLimit) {
        result.reason = '월 혜택 한도 소진';
        usage.isMonthlyAmountLimitReached = true;
        return result;
    }

    let discount = calculateRuleDiscount(amount, getAction(rule));

    if (monthlyAmountLimit) {
        const ruleRemaining = Math.max(0, monthlyAmountLimit - usage.monthlyAmount);
        if (discount > ruleRemaining) {
            discount = ruleRemaining;
            result.reason = `혜택 한도 잔여(${ruleRemaining}원) 적용`;
        }
    }

    if (card.limitTable && card.limitTable.length > 0 && ruleUsesCardLimit(rule)) {
        if (remainingLimit <= 0) {
            result.reason = '월 통합 한도 소진';
            return result;
        }

        if (discount > remainingLimit) {
            discount = remainingLimit;
            result.reason = `통합 한도 잔여(${remainingLimit}원) 적용`;
        }
    }

    discount = Math.min(amount, Math.max(0, Math.floor(discount)));

    result.discount = discount;
    result.isApplicable = discount > 0;

    if (!result.reason) {
        if (getAction(rule).type === 'FLAT') result.reason = '정액 할인';
        if (getAction(rule).type === 'FIXED_PRICE') result.reason = `정가제 적용(${getAction(rule).value}원)`;
    }

    return result;
};

export function calculateBestCards(
    amount: number,
    brand: Brand,
    cards: Card[],
    rules: BenefitRule[],
    history: TransactionHistory[],
    performances: UserCardPerformance[],
    isOnline: boolean = false,
): CalculatedCard[] {
    const context = buildCalculationContext(rules, history);

    return cards.map(card => {
        const perf = performances.find(p => p.cardId === card.id);
        const myPerformance = perf ? perf.amount : 0;

        const monthlyMaxLimit = getMonthlyMaxLimit(card, myPerformance);
        const usedDiscount = getUsedIntegratedLimit(card, context);
        const remainingLimit = Math.max(0, monthlyMaxLimit - usedDiscount);

        const candidateRules = rules
            .filter(rule => rule.cardId === card.id && matchesRule(rule, brand))
            .sort((a, b) => {
                const specificity = getRuleSpecificity(b, brand) - getRuleSpecificity(a, brand);
                return specificity || a.id.localeCompare(b.id);
            });

        const evaluations = candidateRules.map(rule => evaluateRule({
            rule,
            amount,
            card,
            context,
            myPerformance,
            isOnline,
            remainingLimit,
        }));

        const bestEvaluation = evaluations
            .filter(evaluation => evaluation.isApplicable && evaluation.discount > 0)
            .sort((a, b) => {
                if (b.discount !== a.discount) return b.discount - a.discount;
                const specificity = getRuleSpecificity(b.rule, brand)
                    - getRuleSpecificity(a.rule, brand);
                return specificity || a.rule.id.localeCompare(b.rule.id);
            })[0];

        const fallbackEvaluation = bestEvaluation || evaluations[0];

        return {
            ...card,
            calculatedDiscount: bestEvaluation?.discount || 0,
            reason: fallbackEvaluation?.reason || '혜택 없음',
            isApplicable: Boolean(bestEvaluation),
            monthlyMaxLimit,
            remainingLimit,
            usedDiscount,
            matchedRule: fallbackEvaluation
                ? { ...fallbackEvaluation.rule, usage: fallbackEvaluation.usage }
                : undefined,
        };
    }).sort((a, b) => b.calculatedDiscount - a.calculatedDiscount);
}
