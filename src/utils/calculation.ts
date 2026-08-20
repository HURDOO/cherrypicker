import {
    AppliedCardBenefit,
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
    dailyAmount: number;
    monthlyCount: number;
    yearlyCount: number;
    monthlyAmount: number;
    isDailyLimitReached?: boolean;
    isDailyAmountLimitReached?: boolean;
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
    certainty: AppliedCardBenefit['certainty'];
    confirmationId?: string;
    requiredChecks: string[];
};

interface CardCalculationOptions {
    confirmedConditionIds?: Iterable<string>;
    allowPerformanceWaiver?: boolean;
}

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

const getConditionStartsAt = (rule: BenefitRule) =>
    getSnakeOrCamel<string | undefined>(rule.condition, 'startsAt', 'starts_at', undefined);

const getConditionEndsAt = (rule: BenefitRule) =>
    getSnakeOrCamel<string | undefined>(rule.condition, 'endsAt', 'ends_at', undefined);

const getConditionRequiredCardNetwork = (rule: BenefitRule) =>
    getSnakeOrCamel<BenefitRule['condition']['requiredCardNetwork']>(
        rule.condition,
        'requiredCardNetwork',
        'required_card_network',
        undefined,
    );

const getConditionPerformanceWaiver = (rule: BenefitRule) =>
    getSnakeOrCamel<BenefitRule['condition']['performanceWaiver']>(
        rule.condition,
        'performanceWaiver',
        'performance_waiver',
        undefined,
    );

const getConditionConfirmationRequired = (rule: BenefitRule) =>
    getSnakeOrCamel<boolean>(rule.condition, 'confirmationRequired', 'confirmation_required', false);

const getConditionStackableRuleIds = (rule: BenefitRule) =>
    getSnakeOrCamel<string[]>(
        rule.condition,
        'stackableWithRuleIds',
        'stackable_with_rule_ids',
        [],
    );

const getConditionApplicationOrder = (rule: BenefitRule) =>
    getSnakeOrCamel<number>(rule.condition, 'applicationOrder', 'application_order', 0);

const getConditionManualCheckRequired = (rule: BenefitRule) =>
    getSnakeOrCamel<boolean>(rule.condition, 'manualCheckRequired', 'manual_check_required', false);

const getConditionRequiredNote = (rule: BenefitRule) =>
    getSnakeOrCamel<string | undefined>(rule.condition, 'requiredNote', 'required_note', undefined);

const ruleUsesCardLimit = (rule: BenefitRule) =>
    getSnakeOrCamel<boolean>(rule, 'usesCardLimit', 'uses_card_limit', true);

const getActionAmountBasis = (rule: BenefitRule) =>
    getSnakeOrCamel<NonNullable<RuleAction['amountBasis']>>(
        getAction(rule),
        'amountBasis',
        'amount_basis',
        'ORIGINAL_AMOUNT',
    );

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

const getHistoryRuleApplications = (transaction: TransactionHistory) => {
    const snapshot = transaction.combinationSnapshot;
    const steps = snapshot && Array.isArray(snapshot.steps) ? snapshot.steps : [];
    const applications = steps.flatMap(step => {
        if (!step || typeof step !== 'object') return [];
        const value = step as Record<string, unknown>;
        if (
            typeof value.ruleId !== 'string' ||
            typeof value.benefitAmount !== 'number' ||
            !Number.isFinite(value.benefitAmount) ||
            value.benefitAmount <= 0 ||
            value.certainty !== 'CONFIRMED'
        ) {
            return [];
        }
        return [{
            ruleId: value.ruleId,
            benefitAmount: Math.floor(value.benefitAmount),
        }];
    });
    if (applications.length > 0) return applications;
    if (!transaction.ruleId || transaction.discountAmount <= 0) return [];
    return [{ ruleId: transaction.ruleId, benefitAmount: transaction.discountAmount }];
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
        if (!transaction.cardId) return;
        const isDaily = isToday(transaction.date);
        const isMonthly = isThisMonth(transaction.date);
        const isYearly = isThisYear(transaction.date);
        const applications = getHistoryRuleApplications(transaction);

        if (isMonthly) {
            const totalDiscount = applications.reduce(
                (total, application) => total + application.benefitAmount,
                0,
            );
            addAmount(
                monthlyDiscountByCard,
                transaction.cardId,
                totalDiscount,
            );
            applications.forEach(application => {
                const applicationRule = ruleById.get(application.ruleId);
                if (!applicationRule || ruleUsesCardLimit(applicationRule)) {
                    addAmount(
                        integratedMonthlyDiscountByCard,
                        transaction.cardId!,
                        application.benefitAmount,
                    );
                }
            });
        }

        if (applications.length === 0) return;

        let cardUsage = usageByCard.get(transaction.cardId);
        if (!cardUsage) {
            cardUsage = new Map();
            usageByCard.set(transaction.cardId, cardUsage);
        }

        applications.forEach(application => {
            const transactionRule = ruleById.get(application.ruleId);
            if (!transactionRule) return;
            const trackingId = getTrackingId(transactionRule);
            let usage = cardUsage.get(trackingId);
            if (!usage) {
                usage = {
                    dailyCount: 0,
                    dailyAmount: 0,
                    monthlyCount: 0,
                    yearlyCount: 0,
                    monthlyAmount: 0,
                };
                cardUsage.set(trackingId, usage);
            }

            if (isDaily) {
                usage.dailyCount += 1;
                usage.dailyAmount += application.benefitAmount;
            }
            if (isMonthly) {
                usage.monthlyCount += 1;
                usage.monthlyAmount += application.benefitAmount;
            }
            if (isYearly) usage.yearlyCount += 1;
        });
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
        dailyAmount: usage?.dailyAmount ?? 0,
        monthlyCount: usage?.monthlyCount ?? 0,
        yearlyCount: usage?.yearlyCount ?? 0,
        monthlyAmount: usage?.monthlyAmount ?? 0,
        isDailyLimitReached: false,
        isDailyAmountLimitReached: false,
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

const getCurrentKstDateString = () => {
    const now = getKstDateParts(new Date());
    return `${now.year}-${String(now.month + 1).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
};

const evaluateRule = ({
    rule,
    amount,
    basisAmount,
    card,
    context,
    myPerformance,
    isOnline,
    remainingLimit,
    confirmedConditionIds,
    allowPerformanceWaiver,
}: {
    rule: BenefitRule;
    amount: number;
    basisAmount: number;
    card: Card;
    context: CalculationContext;
    myPerformance: number;
    isOnline: boolean;
    remainingLimit: number;
    confirmedConditionIds: ReadonlySet<string>;
    allowPerformanceWaiver: boolean;
}): RuleEvaluation => {
    const usage = getUsageStat(rule, card, context);
    const result: RuleEvaluation = {
        rule,
        discount: 0,
        reason: '',
        isApplicable: false,
        usage,
        certainty: 'CONFIRMED',
        requiredChecks: [],
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

    const currentDate = getCurrentKstDateString();
    const startsAt = getConditionStartsAt(rule);
    if (startsAt && currentDate < startsAt) {
        result.reason = `혜택 시작 전(${startsAt})`;
        return result;
    }
    const endsAt = getConditionEndsAt(rule);
    if (endsAt && currentDate > endsAt) {
        result.reason = `종료된 혜택(${endsAt})`;
        return result;
    }

    const requiredCardNetwork = getConditionRequiredCardNetwork(rule);
    if (requiredCardNetwork && card.network !== requiredCardNetwork) {
        result.reason = card.network
            ? `${requiredCardNetwork} 카드 전용 혜택`
            : '카드 브랜드 확인 필요';
        return result;
    }

    const minSpend = getConditionMinSpend(rule);
    if (amount < minSpend) {
        result.reason = `최소 결제금액(${minSpend.toLocaleString()}원) 부족`;
        return result;
    }

    const minPerformance = getConditionMinPerformance(rule);
    if (myPerformance < minPerformance) {
        if (
            allowPerformanceWaiver &&
            getConditionPerformanceWaiver(rule) === 'NEW_CARD_REGISTRATION_WINDOW'
        ) {
            result.requiredChecks.push('신규 발급 후 등록월의 다음 달 말 이내인지 확인');
        } else {
            result.reason = `실적 조건(${minPerformance.toLocaleString()}원) 부족`;
            return result;
        }
    }

    if (getConditionManualCheckRequired(rule)) {
        result.reason = getConditionRequiredNote(rule) || '추가 조건 확인 필요';
        return result;
    }

    if (getConditionConfirmationRequired(rule)) {
        result.requiredChecks.push(getConditionRequiredNote(rule) || '혜택 제외 조건 확인');
    }
    if (result.requiredChecks.length > 0) {
        const confirmationId = `card-rule:${rule.id}`;
        result.confirmationId = confirmationId;
        if (!confirmedConditionIds.has(confirmationId)) {
            result.certainty = 'CONDITIONAL';
        }
    }

    const limitConfig = getLimitConfig(rule);
    const dailyCountLimit = getLimitValue(limitConfig, 'dailyCount', 'daily_count');
    const dailyAmountLimit = getLimitValue(limitConfig, 'dailyAmount', 'daily_amount');
    const monthlyCountLimit = getLimitValue(limitConfig, 'monthlyCount', 'monthly_count');
    const yearlyCountLimit = getLimitValue(limitConfig, 'yearlyCount', 'yearly_count');
    const monthlyAmountLimit = getLimitValue(limitConfig, 'monthlyAmount', 'monthly_amount');

    if (dailyCountLimit && usage.dailyCount >= dailyCountLimit) {
        result.reason = '일 횟수 제한 초과';
        usage.isDailyLimitReached = true;
        return result;
    }

    if (dailyAmountLimit && usage.dailyAmount >= dailyAmountLimit) {
        result.reason = '일 혜택 한도 소진';
        usage.isDailyAmountLimitReached = true;
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

    let discount = calculateRuleDiscount(basisAmount, getAction(rule));

    if (dailyAmountLimit) {
        const dailyRemaining = Math.max(0, dailyAmountLimit - usage.dailyAmount);
        if (discount > dailyRemaining) {
            discount = dailyRemaining;
            result.reason = `일 혜택 한도 잔여(${dailyRemaining}원) 적용`;
        }
    }

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

    discount = Math.min(basisAmount, Math.max(0, Math.floor(discount)));

    result.discount = discount;
    result.isApplicable = discount > 0;

    if (!result.reason) {
        if (getAction(rule).type === 'PERCENT') {
            result.reason = `${getAction(rule).value}% 혜택`;
        }
        if (getAction(rule).type === 'FLAT') result.reason = '정액 할인';
        if (getAction(rule).type === 'FIXED_PRICE') result.reason = `정가제 적용(${getAction(rule).value}원)`;
    }

    return result;
};

const rulesCanStack = (left: BenefitRule, right: BenefitRule) => (
    getConditionStackableRuleIds(left).includes(right.id) &&
    getConditionStackableRuleIds(right).includes(left.id)
);

const getCandidateRuleSets = (candidateRules: BenefitRule[]) => {
    const ruleSets: BenefitRule[][] = candidateRules.map(rule => [rule]);
    const stackableRules = candidateRules.filter(
        rule => getConditionStackableRuleIds(rule).length > 0,
    );
    if (stackableRules.length === 0) return ruleSets;

    if (stackableRules.length <= 10) {
        const subsetCount = 2 ** stackableRules.length;
        for (let mask = 1; mask < subsetCount; mask += 1) {
            const subset = stackableRules.filter((_, index) => (mask & (1 << index)) !== 0);
            if (subset.length < 2) continue;
            const compatible = subset.every((rule, index) => (
                subset.slice(index + 1).every(other => rulesCanStack(rule, other))
            ));
            if (compatible) ruleSets.push(subset);
        }
    } else {
        stackableRules.forEach((rule, index) => {
            stackableRules.slice(index + 1).forEach(other => {
                if (rulesCanStack(rule, other)) ruleSets.push([rule, other]);
            });
        });
    }

    return ruleSets;
};

const compareEvaluationSets = (left: RuleEvaluation[], right: RuleEvaluation[]) => {
    const confirmed = (evaluations: RuleEvaluation[]) => evaluations
        .filter(evaluation => evaluation.certainty === 'CONFIRMED')
        .reduce((total, evaluation) => total + evaluation.discount, 0);
    const total = (evaluations: RuleEvaluation[]) => evaluations
        .reduce((sum, evaluation) => sum + evaluation.discount, 0);
    return confirmed(right) - confirmed(left) ||
        total(right) - total(left) ||
        right.length - left.length ||
        left.map(evaluation => evaluation.rule.id).join('\u0000')
            .localeCompare(right.map(evaluation => evaluation.rule.id).join('\u0000'));
};

export function calculateBestCards(
    amount: number,
    brand: Brand,
    cards: Card[],
    rules: BenefitRule[],
    history: TransactionHistory[],
    performances: UserCardPerformance[],
    isOnline: boolean = false,
    options: CardCalculationOptions = {},
): CalculatedCard[] {
    const context = buildCalculationContext(rules, history);
    const confirmedConditionIds = new Set(options.confirmedConditionIds ?? []);
    const allowPerformanceWaiver = options.allowPerformanceWaiver ?? true;

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

        const evaluateSet = (ruleSet: BenefitRule[]) => {
            let remainingAmount = amount;
            let integratedRemainingLimit = remainingLimit;
            const evaluations: RuleEvaluation[] = [];
            const orderedRules = [...ruleSet].sort((left, right) => (
                getConditionApplicationOrder(left) - getConditionApplicationOrder(right) ||
                left.id.localeCompare(right.id)
            ));
            for (const rule of orderedRules) {
                const basisAmount = getActionAmountBasis(rule) === 'REMAINING_AMOUNT'
                    ? remainingAmount
                    : amount;
                const evaluation = evaluateRule({
                    rule,
                    amount,
                    basisAmount,
                    card,
                    context,
                    myPerformance,
                    isOnline,
                    remainingLimit: integratedRemainingLimit,
                    confirmedConditionIds,
                    allowPerformanceWaiver,
                });
                if (!evaluation.isApplicable || evaluation.discount <= 0) return undefined;
                evaluation.discount = Math.min(remainingAmount, evaluation.discount);
                if (evaluation.discount <= 0) return undefined;
                evaluations.push(evaluation);
                remainingAmount = Math.max(0, remainingAmount - evaluation.discount);
                if (ruleUsesCardLimit(rule)) {
                    integratedRemainingLimit = Math.max(
                        0,
                        integratedRemainingLimit - evaluation.discount,
                    );
                }
            }
            return evaluations;
        };
        const evaluationSets = getCandidateRuleSets(candidateRules)
            .map(evaluateSet)
            .filter((value): value is RuleEvaluation[] => Boolean(value))
            .sort(compareEvaluationSets);
        const bestEvaluations = evaluationSets[0] ?? [];
        const fallbackEvaluation = bestEvaluations[0] ?? (
            candidateRules[0]
                ? evaluateRule({
                    rule: candidateRules[0],
                    amount,
                    basisAmount: amount,
                    card,
                    context,
                    myPerformance,
                    isOnline,
                    remainingLimit,
                    confirmedConditionIds,
                    allowPerformanceWaiver,
                })
                : undefined
        );
        const confirmedDiscount = bestEvaluations
            .filter(evaluation => evaluation.certainty === 'CONFIRMED')
            .reduce((total, evaluation) => total + evaluation.discount, 0);
        const conditionalDiscount = bestEvaluations
            .filter(evaluation => evaluation.certainty === 'CONDITIONAL')
            .reduce((total, evaluation) => total + evaluation.discount, 0);
        const matchedBenefits: AppliedCardBenefit[] = bestEvaluations.map(evaluation => ({
            rule: evaluation.rule,
            discount: evaluation.discount,
            certainty: evaluation.certainty,
            ...(evaluation.confirmationId && { confirmationId: evaluation.confirmationId }),
            requiredChecks: evaluation.requiredChecks,
            usage: evaluation.usage,
        }));

        return {
            ...card,
            calculatedDiscount: confirmedDiscount + conditionalDiscount,
            confirmedDiscount,
            conditionalDiscount,
            reason: bestEvaluations.length > 1
                ? `${bestEvaluations.length}개 혜택 중복 적용`
                : fallbackEvaluation?.reason || '혜택 없음',
            isApplicable: bestEvaluations.length > 0,
            monthlyMaxLimit,
            remainingLimit,
            usedDiscount,
            matchedBenefits,
            matchedRule: fallbackEvaluation
                ? { ...fallbackEvaluation.rule, usage: fallbackEvaluation.usage }
                : undefined,
        };
    }).sort((a, b) => b.calculatedDiscount - a.calculatedDiscount);
}
